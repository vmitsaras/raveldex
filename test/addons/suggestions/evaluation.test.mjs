import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRaveldex } from '../../../dist/index.js';
import { createSuggestions } from '../../../dist/addons/suggestions/index.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { loadFrozenFixture, publicQuery } from '../../../bench/relevance-lib.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../../oracle/phrases.mjs';
import { sourceSuggestions } from '../../oracle/suggestions.mjs';

// Authored source records and intended token completions were frozen before
// executing production suggestions; their identities are not tuned to results.
const FIXTURE_SHA256 = '16b661e3e50074830e189dc335d0dd25c79c1cd02bac0873bb89808b9a05d211';
const fixtureUrl = new URL('../../fixtures/relevance/suggestions-v1.json', import.meta.url);
async function loadFixture() {
  const bytes = await readFile(fixtureUrl);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), FIXTURE_SHA256);
  return JSON.parse(bytes);
}
const withoutExtensions = ({ extensions, ...result }) => result;
// First-party extension ownership uses null-prototype records. Compare every
// serialized field to the independent source data without changing production.
const data = value => JSON.parse(JSON.stringify(value));

test('independent source dictionaries count documents per field, preserve normalized terms and use complete ranking', async () => {
  const fixture = await loadFixture();
  const so = sourceSuggestions(fixture.records, fixture.schema, { text: 'so' });
  assert.deepEqual(so.items, [{ term: 'source', fieldDocumentFrequency: 4 }], 'Repeated source tokens within a field/document count once; two fields count separately');
  const title = sourceSuggestions(fixture.records, fixture.schema, { text: 'so', fields: ['title'] });
  assert.deepEqual(title.items, [{ term: 'source', fieldDocumentFrequency: 2 }]);
  const atomic = sourceSuggestions(fixture.records, fixture.schema, { text: 'ato' });
  assert.deepEqual(atomic.items, [{ term: 'atomic', fieldDocumentFrequency: 2 }]);
  assert.deepEqual(sourceSuggestions(fixture.records, fixture.schema, { text: 'snap' }).items, [
    { term: 'snapshots', fieldDocumentFrequency: 2 }, { term: 'snapshot', fieldDocumentFrequency: 1 },
  ]);
  assert.equal(sourceSuggestions(fixture.records, fixture.schema, { text: 'a½' }).items[0].term, 'a1⁄2bc', 'Normalize the original token once; do not re-tokenize its fraction slash');
});

test('frozen token-completion utility covers twelve authored intents and seven declared misses independently of BM25 hits', async t => {
  const fixture = await loadFixture();
  const addon = createSuggestions({ fields: ['title', 'body'] });
  const baseline = createRaveldex({ schema: fixture.schema });
  const engine = createRaveldex({ schema: fixture.schema, addons: [addon] });
  let positiveQueries = 0, negativeQueries = 0, intendedTopFiveInclusions = 0, negativeSuggestions = 0;
  const rows = [];
  try {
    await baseline.addMany(fixture.records); await engine.addMany(fixture.records);
    const query = 'atomic', before = await baseline.search(query);
    for (const judgment of fixture.judgments) {
      const request = { text: judgment.text, limit: 5 };
      const actual = await engine.search(query, { extensions: { suggestions: request } });
      const expected = sourceSuggestions(fixture.records, fixture.schema, request);
      assert.deepEqual(data(actual.extensions.suggestions), expected, judgment.id);
      assert.deepEqual(withoutExtensions(actual), before, judgment.id + ': suggestions never change strict search hits or scores');
      const terms = actual.extensions.suggestions.items.map(item => item.term);
      if (judgment.expectedTerms.length) {
        positiveQueries++;
        const satisfied = judgment.expectedTerms.every(term => terms.includes(term));
        assert.equal(satisfied, true, judgment.id + ': intended source terms appear in top five');
        if (satisfied) intendedTopFiveInclusions++;
      } else {
        negativeQueries++; negativeSuggestions += terms.length;
        assert.equal(actual.extensions.suggestions.total, 0, judgment.id + ': intended empty');
      }
      rows.push({ id: judgment.id, request, result: actual.extensions.suggestions });
    }
    assert.equal(positiveQueries, fixture.acceptance.positiveQueries);
    assert.equal(negativeQueries, fixture.acceptance.negativeQueries);
    assert.equal(intendedTopFiveInclusions, fixture.acceptance.minimumIntendedTopFiveInclusions);
    assert.equal(negativeSuggestions, fixture.acceptance.maximumNegativeSuggestions);
    assert.deepEqual(await engine.search(query), before, 'Installed but unrequested capability has no result extension');
    t.diagnostic(JSON.stringify({ fixtureSha256: FIXTURE_SHA256, positiveQueries, negativeQueries, intendedTopFiveInclusions,
      negativeSuggestions, rows, scope: fixture.context.limitations }));
  } finally { await engine.dispose(); await baseline.dispose(); }
});

test('complete source ranking is insertion-order stable and independent of query, metadata qualification and page', async () => {
  const fixture = await loadFixture();
  for (const records of [fixture.records, [...fixture.records].reverse()]) {
    const engine = createRaveldex({ schema: fixture.schema, addons: [createSuggestions({ fields: ['body', 'title'] })] });
    const baseline = createRaveldex({ schema: fixture.schema });
    try {
      await engine.addMany(records); await baseline.addMany(records);
      for (const fields of [['title'], ['body'], ['title', 'body'], ['body', 'title']]) {
        for (const limit of [0, 1, 3, 10]) {
          const request = { text: 'in', fields, limit };
          const expected = sourceSuggestions(fixture.records, fixture.schema, request);
          for (const [query, page] of [
            ['atomic', {}], ['zzzz', { limit: 0 }],
            [{ kind: 'eq', field: 'category', value: 'guide' }, { offset: 1, limit: 1 }],
          ]) {
            const actual = await engine.search(query, { ...page, extensions: { suggestions: request } });
            assert.deepEqual(data(actual.extensions.suggestions), expected);
            assert.deepEqual(withoutExtensions(actual), await baseline.search(query, page));
          }
        }
      }
    } finally { await engine.dispose(); await baseline.dispose(); }
  }
});


test('installing unused suggestions preserves all 76 frozen search queries against the independent source oracle', async t => {
  const { corpus, judgments } = await loadFrozenFixture();
  const addons = () => [createSourceProvider({ fields: ['title', 'body'] }), createSourcePhrases({ fields: ['title', 'body'] })];
  const baseline = createRaveldex({ schema: corpus.schema, addons: addons() });
  const engine = createRaveldex({ schema: corpus.schema, addons: [...addons(), createSuggestions({ fields: ['title', 'body'] })] });
  const reference = scanPhraseSourceCorpus(corpus.records, corpus.schema);
  try {
    await baseline.addMany(corpus.records); await engine.addMany(corpus.records);
    for (const judgment of judgments) {
      const query = publicQuery(judgment.query), options = { limit: 100 };
      const expected = sourcePhraseQueryResult(reference, judgment.query, options);
      const before = await baseline.search(query, options), after = await engine.search(query, options);
      assert.deepEqual(after, before, judgment.id + ': installation alone leaves complete result unchanged');
      assert.equal(after.total, expected.total, judgment.id);
      assert.deepEqual(after.hits.map(hit => hit.id), expected.hits.map(hit => hit.id), judgment.id);
      for (let index = 0; index < after.hits.length; index++) {
        const expectedScore = expected.hits[index].score;
        assert.ok(Math.abs(after.hits[index].score - expectedScore) <= Math.max(1e-12, Math.abs(expectedScore) * 1e-12), judgment.id + ': independent score');
      }
    }
  } finally { await engine.dispose(); await baseline.dispose(); }
  t.diagnostic(`All ${judgments.length} unchanged frozen queries preserve complete rankings and scores with suggestions installed but unrequested.`);
});
