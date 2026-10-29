import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createRaveldex } from '../../../dist/index.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createTypoTolerance } from '../../../dist/addons/typo/index.js';
import { calculateMetrics, loadFrozenFixture, publicQuery, sha256, validateJudgments } from '../../../bench/relevance-lib.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../../oracle/phrases.mjs';
import { scanTypoSourceCorpus, sourceTypoAlternatives, sourceTypoQuery, sourceTypoResult, unicodeOsaDistance } from '../../oracle/typo.mjs';

// Frozen before executing any RX-A010 production typo query.
const TYPO_FIXTURE_SHA256 = '8850edea6920107f97341f6cd7a572b5e0301adcd5e4dbe4a745402b04d6c17d';
const typoQuery = (text, fields = ['title']) => ({ kind: 'extension', capability: 'typo', version: 1, payload: { text, fields } });
const page = { limit: 100 };

function compare(actual, expected, label) {
  assert.equal(actual.completeness, 'complete', label);
  assert.equal(actual.total, expected.total, label);
  assert.deepEqual(actual.hits.map(hit => hit.id), expected.hits.map(hit => hit.id), label);
  for (let i = 0; i < expected.hits.length; i++) {
    const score = expected.hits[i].score;
    assert.ok(Math.abs(actual.hits[i].score - score) <= Math.max(1e-12, Math.abs(score) * 1e-12), `${label}: independent score differs for ${actual.hits[i].id}`);
  }
}

test('the independent full OSA matrix specifies one code-point edit and adjacent transpositions', () => {
  const cases = [
    ['source', 'source', 0], ['sorce', 'source', 1], ['sourcce', 'source', 1],
    ['sourxe', 'source', 1], ['sourec', 'source', 1], ['form', 'from', 1],
    ['source', 'sauce', 2], ['algortm', 'algorithm', 2], ['café', 'cafe', 1],
    ['𐐨abc', '𐐩abc', 1], ['a𐐨cd', 'a𐐩cd', 1],
    ['ab', 'ba', 1], ['ca', 'abc', 3], ['', 'abcd', 4],
    ['cafe\u0301'.normalize('NFKC'), 'café', 0],
  ];
  for (const [left, right, expected] of cases) {
    assert.equal(unicodeOsaDistance(left, right), expected, `${left}/${right}`);
    assert.equal(unicodeOsaDistance(right, left), expected, `symmetric ${right}/${left}`);
  }
});

test('source-derived alternatives independently check exact-first, edits, short candidates and normalized original spellings', async () => {
  const schema = { text: { title: {}, body: {} } };
  const records = [
    { id: 'source', text: { title: 'source' } },
    { id: 'cafe-plain', text: { title: 'cafe' } },
    { id: 'cafe-accent', text: { title: 'café' } },
    { id: 'astral-one', text: { title: 'a𐐨cd' } },
    { id: 'astral-two', text: { title: 'a𐐩cd' } },
    { id: 'short', text: { title: 'cat' } },
    { id: 'fraction', text: { title: 'a½bd' } },
    { id: 'outside-selected-field', text: { body: 'sorce' } },
  ];
  const source = scanTypoSourceCorpus(records, schema);
  assert.deepEqual(sourceTypoAlternatives(source, 'source', ['title']), [{ term: 'source', distance: 0, weight: 1 }]);
  assert.deepEqual(sourceTypoAlternatives(source, 'sorce', ['title']), [{ term: 'source', distance: 1, weight: 0.5 }]);
  assert.deepEqual(sourceTypoAlternatives(source, 'sorce', ['title', 'body']), [{ term: 'sorce', distance: 0, weight: 1 }]);
  assert.deepEqual(sourceTypoAlternatives(source, 'caf', ['title']), []);
  assert.deepEqual(sourceTypoAlternatives(source, 'cats', ['title']), [{ term: 'cat', distance: 1, weight: 0.5 }]);
  const engine = createRaveldex({ schema, addons: [createTypoTolerance({ fields: ['title', 'body'] })] });
  try {
    await engine.addMany(records);
    const cases = [
      ['source', ['title']], ['sorce', ['title']], ['sourcce', ['title']], ['sourxe', ['title']],
      ['sourec', ['title']], ['sorce', ['title', 'body']], ['cafè', ['title']],
      ['cafe', ['title']], ['cafe\u0301', ['title']], ['caf', ['title']],
      ['cats', ['title']], ['a𐐪cd', ['title']], ['a½bc', ['title']],
      ['sorce sorce', ['title']], ['sorce sourxe', ['title']], ['sorce cats', ['title']],
    ];
    for (const [text, fields] of cases) {
      const expected = sourceTypoResult(source, text, fields, page);
      const actual = await engine.search(typoQuery(text, fields), page);
      compare(actual, expected, `${text} / ${fields.join(',')}`);
    }
    const single = sourceTypoResult(source, 'sorce', ['title'], page);
    const repeated = sourceTypoResult(source, 'sorce sorce', ['title'], page);
    const distinct = sourceTypoResult(source, 'sorce sourxe', ['title'], page);
    assert.equal(repeated.hits[0].score, single.hits[0].score, 'Repeated original words canonicalize once');
    assert.equal(distinct.hits[0].score, 2 * single.hits[0].score, 'Different misspellings retain two required original groups');
  } finally { await engine.dispose(); }
});

test('the separately frozen typo relevance set recovers ten known title tasks without judged false positives', async t => {
  const frozen = await loadFrozenFixture();
  const fixtureBytes = await readFile(new URL('../../fixtures/relevance/typo-v1.json', import.meta.url));
  assert.equal(sha256(fixtureBytes), TYPO_FIXTURE_SHA256, 'Typo judgments changed after the source-label freeze');
  const fixture = JSON.parse(fixtureBytes);
  assert.equal(fixture.policy, 'unicode-osa1-exact-first-v1');
  assert.equal(fixture.corpusHash, frozen.corpus.hash);
  assert.equal(fixture.corpusFileSha256, frozen.freeze.files['corpus.json']);
  const records = frozen.corpus.records;
  const judgments = fixture.judgments.map(row => ({
    ...row, query: { kind: 'text', text: row.text, fields: row.fields },
    mustFindIds: row.expectedId ? [row.expectedId] : [], acceptableIds: row.expectedId ? [row.expectedId] : [],
    knownIrrelevantIds: records.filter(record => record.id !== row.expectedId).map(record => record.id),
    intent: row.sourceRationale, semantics: fixture.policy + '; explicit title-only required word groups', category: 'title-typo',
  }));
  validateJudgments(records, judgments);
  assert.equal(judgments.filter(row => row.expectation === 'known-relevant').length, fixture.acceptance.positiveQueries);
  assert.equal(judgments.filter(row => row.expectation === 'intended-empty').length, fixture.acceptance.negativeQueries);
  const source = scanTypoSourceCorpus(records, frozen.corpus.schema);
  const engine = createRaveldex({ schema: frozen.corpus.schema, addons: [createTypoTolerance({ fields: ['title'] })] });
  const exactRows = [], typoRows = [];
  let falsePositiveHits = 0, recoveredQueries = 0;
  try {
    await engine.addMany(records);
    for (const judgment of judgments) {
      const expected = sourceTypoResult(source, judgment.text, judgment.fields, page);
      const exact = await engine.search(judgment.query, page);
      const actual = await engine.search(typoQuery(judgment.text, judgment.fields), page);
      compare(actual, expected, judgment.id);
      const wanted = judgment.expectedId ? [judgment.expectedId] : [];
      assert.deepEqual(actual.hits.map(hit => hit.id), wanted, `${judgment.id}: complete title-navigation labels`);
      assert.equal(exact.total, 0, `${judgment.id}: exact typo baseline is empty`);
      if (judgment.expectedId) {
        assert.equal(records.find(record => record.id === judgment.expectedId).text.title, judgment.expectedTitle);
        assert.equal(sourceTypoQuery(source, judgment.text, judgment.fields).groups[0].alternatives[0].term, judgment.expectedTerm);
        if (actual.hits.some(hit => hit.id === judgment.expectedId)) recoveredQueries++;
      }
      falsePositiveHits += actual.hits.filter(hit => judgment.knownIrrelevantIds.includes(hit.id)).length;
      exactRows.push({ id: judgment.id, ...exact });
      typoRows.push({ id: judgment.id, ...actual });
    }
  } finally { await engine.dispose(); }
  const exactMetrics = calculateMetrics(judgments, exactRows), typoMetrics = calculateMetrics(judgments, typoRows);
  assert.equal(typoMetrics.recall10Macro.value, fixture.acceptance.minimumTypoRecall10);
  assert.equal(typoMetrics.recall10Macro.value > exactMetrics.recall10Macro.value, true);
  assert.equal(typoMetrics.unexpectedNonempty.numerator, fixture.acceptance.maximumNegativeMatches);
  assert.equal(falsePositiveHits, fixture.acceptance.maximumJudgedFalsePositiveHits);
  assert.equal(recoveredQueries, fixture.acceptance.minimumRecoveredQueries);
  t.diagnostic(JSON.stringify({ fixtureSha256: TYPO_FIXTURE_SHA256, policy: fixture.policy, exact: { top1: exactMetrics.top1, mrr: exactMetrics.mrr, recall10: exactMetrics.recall10Macro }, typo: { top1: typoMetrics.top1, mrr: typoMetrics.mrr, recall10: typoMetrics.recall10Macro, correctIntendedEmpty: typoMetrics.correctIntendedEmpty }, recoveredQueries, judgedFalsePositiveHits: falsePositiveHits, limitations: fixture.context.limitations }));
});

test('installing the unused typo capability preserves all 76 frozen exact/prefix/phrase/metadata queries', async t => {
  const { corpus, judgments } = await loadFrozenFixture();
  const makeAddons = () => [createSourceProvider({ fields: ['title', 'body'] }), createSourcePhrases({ fields: ['title', 'body'] })];
  const baseline = createRaveldex({ schema: corpus.schema, addons: makeAddons() });
  const optional = createRaveldex({ schema: corpus.schema, addons: [...makeAddons(), createTypoTolerance({ fields: ['title'] })] });
  const reference = scanPhraseSourceCorpus(corpus.records, corpus.schema);
  try {
    await baseline.addMany(corpus.records); await optional.addMany(corpus.records);
    for (const judgment of judgments) {
      const query = publicQuery(judgment.query);
      const expected = sourcePhraseQueryResult(reference, judgment.query, page);
      const before = await baseline.search(query, page);
      const after = await optional.search(query, page);
      compare(before, expected, judgment.id + ' baseline');
      compare(after, expected, judgment.id + ' typo installed unused');
      assert.deepEqual(after, before, judgment.id);
    }
  } finally { await baseline.dispose(); await optional.dispose(); }
  t.diagnostic(`All ${judgments.length} unchanged frozen queries match the independent source/phrase oracle and unused-addon baseline.`);
});
