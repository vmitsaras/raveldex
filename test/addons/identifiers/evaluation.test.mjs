import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRaveldex } from '../../../dist/index.js';
import { createIdentifierAnalyzer, IDENTIFIER_ANALYZER } from '../../../dist/addons/identifiers/index.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createInspector } from '../../../dist/addons/inspector/index.js';
import { calculateMetrics, loadFrozenFixture, publicQuery } from '../../../bench/relevance-lib.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../../oracle/phrases.mjs';
import { identifierOriginals, identifierOccurrences, scanIdentifierCorpus, sourceIdentifierResult } from '../../oracle/identifiers.mjs';

const FIXTURE_SHA256 = '6be2f54f1046cace5c4163ed0f181d9ac3681953b18f0c6c02c3138aeca5bb6d';
async function frozen() {
  const bytes = await readFile(new URL('../../fixtures/relevance/identifiers-v1.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), FIXTURE_SHA256, 'Do not retune pre-execution symbol judgments');
  return JSON.parse(bytes);
}
const page = { limit: 100 };
const selected = (schema, addons = []) => createRaveldex({ schema, analyzer: IDENTIFIER_ANALYZER, addons: [createIdentifierAnalyzer(), ...addons] });
const close = (a, b, message) => assert.ok(Math.abs(a - b) <= Math.max(1e-12, Math.abs(b) * 1e-12), `${message}: ${a} != ${b}`);
function compare(actual, expected, message) {
  assert.equal(actual.completeness, 'complete', message); assert.equal(actual.total, expected.total, message);
  assert.deepEqual(actual.hits.map(hit => hit.id), expected.hits.map(hit => hit.id), message);
  for (let i = 0; i < expected.hits.length; i++) close(actual.hits[i].score, expected.hits[i].score, message + ': independent native score for ' + actual.hits[i].id);
}

test('independent source model pins whole originals, co-position distinct components, Unicode and path boundaries', async () => {
  const terms = raw => identifierOccurrences(raw).map(token => token.term);
  assert.deepEqual(terms('XMLHttpRequest2XX'), ['xmlhttprequest2xx', 'xml', 'http', 'request', '2', 'xx']);
  assert.deepEqual(terms('foo_Foo_foo'), ['foo_foo_foo', 'foo']);
  assert.deepEqual(terms('WORK_LIMIT_EXCEEDED'), ['work_limit_exceeded', 'work', 'limit', 'exceeded']);
  assert.deepEqual(terms('cafe\u0301Parser'), ['caféparser', 'café', 'parser']);
  assert.deepEqual(terms('ΑθήναΔοκιμή'), ['αθήναδοκιμή', 'αθήνα', 'δοκιμή']);
  assert.deepEqual(terms('fooǅelta'), ['foodželta', 'foo', 'dželta'], 'Titlecase is an uppercase boundary before normalization');
  assert.deepEqual(terms('foo_\u0301Bar'), ['foo_\u0301bar', 'foo', 'bar'], 'An orphan mark remains only in its original');
  assert.deepEqual(terms('src/core/query/search.ts'), ['src', 'core', 'query', 'search', 'ts']);
  assert.deepEqual(terms('fooBar/foo_bar.foo-bar'), ['foobar', 'foo', 'bar', 'foo_bar', 'foo', 'bar', 'foo', 'bar']);
  const original = identifierOriginals('😀 fooBar', 3), occurrences = identifierOccurrences('😀 fooBar', 3);
  assert.deepEqual(original, [{ term: 'foobar', start: 3, end: 9, valueIndex: 3, position: 0, kind: 'original', originalStart: 3, originalEnd: 9 }]);
  assert.deepEqual(occurrences.map(({ term, start, end, position, originalStart, originalEnd }) => ({ term, start, end, position, originalStart, originalEnd })), [
    { term: 'foobar', start: 3, end: 9, position: 0, originalStart: 3, originalEnd: 9 },
    { term: 'foo', start: 3, end: 6, position: 0, originalStart: 3, originalEnd: 9 },
    { term: 'bar', start: 6, end: 9, position: 0, originalStart: 3, originalEnd: 9 },
  ]);
  const fixture = await frozen();
  assert.equal(fixture.records.length, 21); assert.equal(fixture.provenance.length, fixture.records.length);
  for (const row of fixture.provenance) {
    assert.match(row.sourceSha256, /^[a-f0-9]{64}$/); assert.ok(row.sourceLine.includes(row.symbol));
    assert.ok(fixture.records.some(record => record.id === 'symbol:' + row.symbol && record.text.code === row.symbol));
  }
});

test('frozen real-symbol intents gain component recall without relabeling original controls or negatives', async t => {
  const fixture = await frozen(), corpus = scanIdentifierCorpus(fixture.records, fixture.schema);
  const engine = selected(fixture.schema), baseline = createRaveldex({ schema: fixture.schema });
  let componentQueries = 0, originalOrControlQueries = 0, negativeQueries = 0, selectedRecall = 0, basicRecall = 0, improved = 0, falsePositiveHits = 0, negativeMatches = 0;
  const observations = [];
  try {
    await engine.addMany(fixture.records); await baseline.addMany(fixture.records);
    for (const judgment of fixture.judgments) {
      const query = { kind: 'text', text: judgment.text, fields: judgment.fields };
      const actual = await engine.search(query, page), basic = await baseline.search(query, page);
      compare(actual, sourceIdentifierResult(corpus, query, page), judgment.id);
      const expected = new Set(judgment.expectedIds), ids = actual.hits.map(hit => hit.id);
      assert.deepEqual([...ids].sort(), [...expected].sort(), judgment.id + ': exhaustive frozen literal-symbol labels');
      falsePositiveHits += ids.filter(id => !expected.has(id)).length;
      if (judgment.category === 'component') {
        componentQueries++;
        const current = ids.slice(0, 10).filter(id => expected.has(id)).length / expected.size;
        const previous = basic.hits.slice(0, 10).filter(hit => expected.has(hit.id)).length / expected.size;
        selectedRecall += current; basicRecall += previous; if (current > previous) improved++;
      } else if (judgment.category === 'intended-empty') { negativeQueries++; negativeMatches += actual.total; }
      else originalOrControlQueries++;
      observations.push({ id: judgment.id, category: judgment.category, query, expectedIds: judgment.expectedIds, basicIds: basic.hits.map(hit => hit.id), identifierIds: ids });
    }
  } finally { await engine.dispose(); await baseline.dispose(); }
  assert.equal(componentQueries, fixture.acceptance.componentQueries); assert.equal(originalOrControlQueries, fixture.acceptance.originalOrControlQueries);
  assert.equal(negativeQueries, fixture.acceptance.negativeQueries); assert.equal(selectedRecall / componentQueries, fixture.acceptance.minimumComponentRecall10);
  assert.ok(improved > 0, 'Component access must improve actual frozen developer navigation over basic-v1');
  assert.equal(falsePositiveHits, fixture.acceptance.maximumJudgedFalsePositiveHits); assert.equal(negativeMatches, fixture.acceptance.maximumNegativeMatches);
  t.diagnostic(JSON.stringify({ fixtureSha256: FIXTURE_SHA256, analyzer: IDENTIFIER_ANALYZER, componentQueries, originalOrControlQueries, negativeQueries,
    identifierRecall10: selectedRecall / componentQueries, basicRecall10: basicRecall / componentQueries, improvedIntents: improved, falsePositiveHits, negativeMatches, observations, limitations: fixture.context.limitations }));
});

test('complete independent source Boolean/BM25 results remain insertion-order and page stable', async t => {
  const fixture = await frozen(), corpus = scanIdentifierCorpus(fixture.records, fixture.schema); let comparisons = 0;
  const queries = fixture.judgments.map(row => ({ kind: 'text', text: row.text, fields: row.fields })).concat([
    { kind: 'or', children: [{ kind: 'text', text: 'deadline' }, { kind: 'text', text: 'revision' }] },
    { kind: 'and', children: [{ kind: 'text', text: 'error' }, { kind: 'not', child: { kind: 'text', text: 'codes' } }] },
    { kind: 'not', child: { kind: 'not', child: { kind: 'text', text: 'deadline' } } },
    { kind: 'group', variants: [{ text: 'max', match: 'prefix', weight: 0.5 }, { text: 'maxQueryTokens', match: 'exact', weight: 1 }] },
    { kind: 'all' }, { kind: 'none' },
  ]);
  for (const records of [fixture.records, [...fixture.records].reverse()]) {
    const engine = selected(fixture.schema);
    try {
      await engine.addMany(records);
      for (const query of queries) for (const options of [{ limit: 0 }, { limit: 1 }, { limit: 3 }, { offset: 1, limit: 2 }, page]) {
        compare(await engine.search(query, options), sourceIdentifierResult(corpus, query, options), JSON.stringify(query)); comparisons++;
      }
    } finally { await engine.dispose(); }
  }
  assert.equal(comparisons, 420); t.diagnostic(`${comparisons} complete independent membership/score comparisons across two insertion orders and five pages.`);
});

test('native trace arithmetic counts retained component occurrences, not fabricated positions or exact-name bonuses', async t => {
  const schema = { text: { code: { boost: 2 } } }, records = [
    { id: 'a', text: { code: 'fooFoo' } }, { id: 'b', text: { code: 'foo' } }, { id: 'c', text: { code: 'other' } },
  ];
  const engine = selected(schema, [createInspector()]), corpus = scanIdentifierCorpus(records, schema);
  let factsChecked = 0;
  try {
    await engine.addMany(records);
    for (const query of ['foo', 'fooFoo', 'fooFoo foo', 'foo foo']) {
      const actual = await engine.search(query, { ...page, extensions: { inspector: { ids: ['a', 'b', 'c'] } } });
      compare(actual, sourceIdentifierResult(corpus, query, page), query);
      const trace = actual.extensions.inspector.trace;
      assert.equal(trace.analyzer.id, 'code-identifiers-v1');
      for (const fact of trace.facts.filter(row => row.kind === 'field')) {
        assert.equal(fact.weight, 1); assert.equal(fact.tf, 1); assert.equal(fact.N, 3); assert.equal(fact.totalLength, 4);
        assert.equal(fact.length, fact.id === 'a' ? 2 : 1); close(fact.avgLength, 4 / 3, 'Source-derived average');
        assert.equal(fact.df, fact.term === 'foo' ? 2 : 1);
        const expected = 2 * Math.log(1 + (3 - fact.df + 0.5) / (fact.df + 0.5)) * 2.2 / (1 + 1.2 * (0.25 + 0.75 * fact.length / (4 / 3)));
        close(fact.selected, expected, 'Hand-derived equal-weight native contribution'); factsChecked++;
      }
      for (const hit of actual.hits) close(trace.facts.filter(row => row.kind === 'field' && row.id === hit.id).reduce((sum, row) => sum + row.selected, 0), hit.score, 'Actual contributing fields sum');
    }
  } finally { await engine.dispose(); }
  assert.equal(factsChecked, 7); t.diagnostic(`${factsChecked} source-derived native field facts replayed; repeated foo in fooFoo retains one component occurrence.`);
});

test('installed but unselected identifier pack preserves all 76 original basic results and independent source scores', async t => {
  const fixture = await frozen(), { corpus, judgments } = await loadFrozenFixture(), source = scanPhraseSourceCorpus(corpus.records, corpus.schema);
  const providers = () => [createSourceProvider({ fields: ['title', 'body'] }), createSourcePhrases({ fields: ['title', 'body'] })];
  const baseline = createRaveldex({ schema: corpus.schema, addons: providers() });
  const unselected = createRaveldex({ schema: corpus.schema, addons: [createIdentifierAnalyzer(), ...providers()] });
  try {
    await baseline.addMany(corpus.records); await unselected.addMany(corpus.records);
    for (const judgment of judgments) {
      const query = publicQuery(judgment.query), actual = await unselected.search(query, page), before = await baseline.search(query, page);
      compare(before, sourcePhraseQueryResult(source, judgment.query, page), judgment.id); assert.deepEqual(actual, before, judgment.id + ': registering cannot select the analyzer');
    }
  } finally { await baseline.dispose(); await unselected.dispose(); }
  assert.equal(judgments.length, fixture.acceptance.originalBasicRegressionCount); t.diagnostic(`${judgments.length} unchanged original basic results with the identifier pack unselected.`);
});

test('selected identifier analysis reports the same 76 real-document relevance outcomes without rewriting their labels', async t => {
  const { corpus, judgments } = await loadFrozenFixture(), source = scanIdentifierCorpus(corpus.records, corpus.schema), results = [];
  const engine = selected(corpus.schema, [createSourceProvider({ fields: ['title', 'body'] }), createSourcePhrases({ fields: ['title', 'body'] })]);
  try {
    await engine.addMany(corpus.records);
    for (const judgment of judgments) {
      const actual = await engine.search(publicQuery(judgment.query), page); compare(actual, sourceIdentifierResult(source, judgment.query, page), judgment.id + ': explicitly selected identifiers');
      results.push({ id: judgment.id, ...actual });
    }
  } finally { await engine.dispose(); }
  t.diagnostic(JSON.stringify({ scope: 'Original 34-section/76-query corpus under explicit identifier mode; not an assertion of unchanged ranking or universally better relevance', metrics: calculateMetrics(judgments, results, 100) }));
});
