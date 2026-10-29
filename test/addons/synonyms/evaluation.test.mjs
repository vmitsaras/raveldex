import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRaveldex } from '../../../dist/index.js';
import { createSynonyms, SYNONYMS_POLICY } from '../../../dist/addons/synonyms/index.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { loadFrozenFixture, publicQuery } from '../../../bench/relevance-lib.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../../oracle/phrases.mjs';
import { scanSynonymSourceCorpus, sourceSynonymMappings, sourceSynonymAlternatives, sourceSynonymResult } from '../../oracle/synonyms.mjs';

// Frozen before executing any RX-A030 production synonym search.
const FIXTURE_SHA256 = '31cb6e1947bdcf87a2780124883fd7bf4af7d19316eb6bd30ae47df66e64ff55';
async function loadFixture() {
  const bytes = await readFile(new URL('../../fixtures/relevance/synonyms-v1.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), FIXTURE_SHA256, 'Judgments changed after their source-label freeze');
  return JSON.parse(bytes);
}
const mappingsFor = fixture => fixture.rules.flatMap(row => row.targets.map(to => ({ from: row.source, to })));
const queryFor = (text, fields = ['title']) => ({ kind: 'extension', capability: 'synonyms', version: 1, payload: { text, fields } });
const optionsFor = fixture => ({ fields: ['title', 'body'], vocabularyVersion: fixture.mapVersion, mappings: mappingsFor(fixture) });
const page = { limit: 100 };
function compare(actual, expected, label) {
  assert.equal(actual.completeness, 'complete', label);
  assert.equal(actual.total, expected.total, label);
  assert.deepEqual(actual.hits.map(hit => hit.id), expected.hits.map(hit => hit.id), label);
  for (let index = 0; index < expected.hits.length; index++) {
    const score = expected.hits[index].score;
    assert.ok(Math.abs(actual.hits[index].score - score) <= Math.max(1e-12, Math.abs(score) * 1e-12), label + ': independent score for ' + actual.hits[index].id);
  }
}

test('the independent one-step relation specifies cycles, direction, normalization, duplicates and live selected fields', async () => {
  const fixture = await loadFixture(), mappings = mappingsFor(fixture);
  const source = scanSynonymSourceCorpus(fixture.records, fixture.schema), relation = sourceSynonymMappings(mappings);
  assert.deepEqual([...relation.get('backup')], ['snapshot'], 'Normalized duplicate target is one edge');
  assert.deepEqual(sourceSynonymAlternatives(source, relation, 'backup', ['title']), [{ term: 'snapshot', match: 'exact', weight: 0.5 }], 'Never follow snapshot to archive');
  assert.deepEqual(sourceSynonymAlternatives(source, relation, 'snapshot', ['title']), [
    { term: 'archive', match: 'exact', weight: 0.5 }, { term: 'snapshot', match: 'exact', weight: 1 },
  ], 'A direct cycle edge is finite and exact source remains weight one');
  assert.deepEqual(sourceSynonymAlternatives(source, relation, 'remove', ['title']), [{ term: 'remove', match: 'exact', weight: 1 }], 'No inferred inverse remove-to-delete edge');
  assert.deepEqual(sourceSynonymAlternatives(source, relation, 'backup', ['body']), [{ term: 'snapshot', match: 'exact', weight: 0.5 }]);
  assert.deepEqual(sourceSynonymAlternatives(source, relation, 'catalog', ['body']), [], 'Mapped dictionary target must occur in selected fields');
  assert.equal(sourceSynonymResult(source, mappings, 'backup log', ['title'], page).total, 0, 'Transitive-only archive result is not eligible');
  assert.equal(sourceSynonymResult(source, mappings, 'delete checkpoint', ['title'], page).total, 0, 'AND remains between original groups');
});

test('frozen judged domain vocabulary improves all sixteen intents without matches for ten declared negatives', async t => {
  const fixture = await loadFixture(), mappings = mappingsFor(fixture);
  const source = scanSynonymSourceCorpus(fixture.records, fixture.schema);
  const engine = createRaveldex({ schema: fixture.schema, addons: [createSynonyms(optionsFor(fixture))] });
  const baseline = createRaveldex({ schema: fixture.schema });
  let positives = 0, negatives = 0, recallSum = 0, exactRecallSum = 0, recallImprovedIntents = 0, falsePositiveHits = 0, negativeMatches = 0;
  const observations = [];
  try {
    await engine.addMany(fixture.records); await baseline.addMany(fixture.records);
    assert.equal(SYNONYMS_POLICY, fixture.policy);
    for (const judgment of fixture.judgments) {
      const expected = sourceSynonymResult(source, mappings, judgment.text, judgment.fields, page);
      const actual = await engine.search(queryFor(judgment.text, judgment.fields), page);
      const exact = await baseline.search({ kind: 'text', text: judgment.text, fields: judgment.fields }, page);
      compare(actual, expected, judgment.id);
      assert.deepEqual(actual.hits.map(hit => hit.id).sort(), [...judgment.expectedIds].sort(), judgment.id + ': all authored relevant titles only');
      assert.equal(actual.extensions.synonyms.policy, fixture.policy + ':' + fixture.mapVersion);
      for (const group of actual.extensions.synonyms.groups) {
        const alternatives = sourceSynonymAlternatives(source, sourceSynonymMappings(mappings), group.term, group.fields);
        assert.deepEqual(group.alternatives.map(row => ({ ...row })), alternatives, judgment.id + ': transparent applied mapping alternatives');
      }
      falsePositiveHits += actual.hits.filter(hit => !judgment.expectedIds.includes(hit.id)).length;
      if (judgment.expectedIds.length) {
        positives++;
        const recall = actual.hits.slice(0, 10).filter(hit => judgment.expectedIds.includes(hit.id)).length / judgment.expectedIds.length;
        const exactRecall = exact.hits.slice(0, 10).filter(hit => judgment.expectedIds.includes(hit.id)).length / judgment.expectedIds.length;
        recallSum += recall; exactRecallSum += exactRecall;
        if (recall > exactRecall) recallImprovedIntents++;
      } else { negatives++; negativeMatches += actual.total; }
      observations.push({ id: judgment.id, exactIds: exact.hits.map(hit => hit.id), synonymIds: actual.hits.map(hit => hit.id) });
    }
    assert.equal(positives, fixture.acceptance.positiveQueries);
    assert.equal(negatives, fixture.acceptance.negativeQueries);
    assert.equal(recallSum / positives, fixture.acceptance.minimumSynonymRecall10);
    assert.equal(recallImprovedIntents, positives, 'Every authored positive intent improves Recall@10 over strict exact baseline');
    assert.equal(negativeMatches, fixture.acceptance.maximumNegativeMatches);
    assert.equal(falsePositiveHits, fixture.acceptance.maximumJudgedFalsePositiveHits);
    t.diagnostic(JSON.stringify({ fixtureSha256: FIXTURE_SHA256, vocabularyVersion: fixture.mapVersion, policy: fixture.policy,
      positives, negatives, synonymRecall10: recallSum / positives, exactRecall10: exactRecallSum / positives,
      recallImprovedIntents, negativeMatches, judgedFalsePositiveHits: falsePositiveHits, observations, limitations: fixture.context.limitations }));
  } finally { await engine.dispose(); await baseline.dispose(); }
});

test('complete source Boolean and BM25 results are insertion-order and page stable with hand-derived weights and original identity', async t => {
  const fixture = await loadFixture(), mappings = mappingsFor(fixture);
  const source = scanSynonymSourceCorpus(fixture.records, fixture.schema);
  let comparisons = 0;
  for (const records of [fixture.records, [...fixture.records].reverse()]) {
    const engine = createRaveldex({ schema: fixture.schema, addons: [createSynonyms(optionsFor(fixture))] });
    try {
      await engine.addMany(records);
      for (const judgment of fixture.judgments) for (const options of [{ limit: 0 }, { limit: 1 }, { limit: 3 }, { offset: 1, limit: 2 }, page]) {
        compare(await engine.search(queryFor(judgment.text, judgment.fields), options), sourceSynonymResult(source, mappings, judgment.text, judgment.fields, options), judgment.id + ' page ' + JSON.stringify(options));
        comparisons++;
      }
      const once = await engine.search(queryFor('backup'), page), repeated = await engine.search(queryFor('backup backup'), page);
      const distinct = await engine.search(queryFor('backup checkpoint'), page);
      assert.equal(repeated.hits[0].score, once.hits[0].score, 'Repeated original words canonicalize once');
      assert.equal(distinct.hits[0].score, 2 * once.hits[0].score, 'Distinct original groups sharing one target remain distinct scored obligations');
    } finally { await engine.dispose(); }
  }
  const numerical = createRaveldex({ schema: { text: { title: {} } }, addons: [createSynonyms({ fields: ['title'], vocabularyVersion: 'arithmetic-v1', mappings: [{ from: 'alias', to: 'canonical' }, { from: 'synonym', to: 'canonical' }] })] });
  try {
    await numerical.addMany([{ id: 'a', text: { title: 'alias' } }, { id: 'b', text: { title: 'canonical' } }, { id: 'c', text: { title: 'canonical' } }]);
    const result = await numerical.search(queryFor('alias'), page);
    assert.deepEqual(result.hits.map(hit => hit.id), ['a', 'b', 'c']);
    // Each document has length one, avg=1, tf=1, boost=1, so tfPart=1.
    assert.ok(Math.abs(result.hits[0].score - Math.log(1 + 2.5 / 1.5)) < 1e-12, 'Exact source df=1, population=3, weight=1');
    assert.ok(Math.abs(result.hits[1].score - 0.5 * Math.log(1 + 1.5 / 2.5)) < 1e-12, 'Mapped target df=2, population=3, weight=0.5');
    const distinct = await numerical.search(queryFor('alias synonym'), page);
    assert.deepEqual(distinct.hits.map(hit => hit.id), ['b', 'c']);
    assert.ok(Math.abs(distinct.hits[0].score - Math.log(1 + 1.5 / 2.5)) < 1e-12, 'Two original mapped groups sum two weighted contributions');
  } finally { await numerical.dispose(); }
  assert.equal(comparisons, 260);
  t.diagnostic(`${comparisons} complete independent source comparisons across insertion orders and pages, plus hand-derived weighted BM25 and original-group identity cases.`);
});

test('installing unused synonyms preserves all 76 frozen exact/prefix/phrase/metadata results against the independent source oracle', async t => {
  const fixture = await loadFixture(), { corpus, judgments } = await loadFrozenFixture();
  const addons = () => [createSourceProvider({ fields: ['title', 'body'] }), createSourcePhrases({ fields: ['title', 'body'] })];
  const baseline = createRaveldex({ schema: corpus.schema, addons: addons() });
  const engine = createRaveldex({ schema: corpus.schema, addons: [...addons(), createSynonyms(optionsFor(fixture))] });
  const source = scanPhraseSourceCorpus(corpus.records, corpus.schema);
  try {
    await baseline.addMany(corpus.records); await engine.addMany(corpus.records);
    for (const judgment of judgments) {
      const query = publicQuery(judgment.query), expected = sourcePhraseQueryResult(source, judgment.query, page);
      const before = await baseline.search(query, page), after = await engine.search(query, page);
      compare(before, expected, judgment.id + ' baseline'); compare(after, expected, judgment.id + ' unused synonyms');
      assert.deepEqual(after, before, judgment.id + ': installation alone preserves the entire result');
    }
  } finally { await engine.dispose(); await baseline.dispose(); }
  assert.equal(judgments.length, fixture.acceptance.originalQueryRegressionCount);
  t.diagnostic(`All ${judgments.length} unchanged original judgments preserve complete results and independent scores with synonyms installed but unrequested.`);
});
