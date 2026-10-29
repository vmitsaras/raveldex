import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRaveldex } from '../../../dist/index.js';
import { createProximity } from '../../../dist/addons/proximity/index.js';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { createPositionPhrases } from '../../../dist/addons/positions/phrases.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createInspector } from '../../../dist/addons/inspector/index.js';
import { createEnglishAnalyzer, ENGLISH_ANALYZER } from '../../../dist/integrations/languages/english/index.js';
import { createIdentifierAnalyzer, IDENTIFIER_ANALYZER } from '../../../dist/addons/identifiers/index.js';
import { loadFrozenFixture, publicQuery as ordinaryPublicQuery } from '../../../bench/relevance-lib.mjs';
import { originalSourceTokens } from '../../oracle/query.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../../oracle/phrases.mjs';
import { orderedSourceMatch, scanProximitySourceCorpus, sourceProximityQueryResult, publicProximityQuery, proximity as p } from '../../oracle/proximity.mjs';
import { PROXIMITY_SCHEMA, proximityRecords, handProximityCases, booleanProximityCases } from '../../fixtures/phrases/proximity.mjs';

const DOCUMENT_LABEL_SHA = 'bfe18383eeff79853c79158723e21a134450aa250e1105ddad8484aa8d250b80';
const page = { limit: 100 };
const sorted = list => [...list].sort();
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-12, Math.abs(expected) * 1e-12), `${message}: ${actual} vs ${expected}`);
function compare(actual, expected, message) {
  assert.equal(actual.completeness, 'complete', message); assert.equal(actual.model, 'raveldex-bm25-v1', message);
  assert.equal(actual.total, expected.total, message); assert.deepEqual(actual.hits.map(hit => hit.id), expected.hits.map(hit => hit.id), message);
  for (let index = 0; index < actual.hits.length; index++) near(actual.hits[index].score, expected.hits[index].score, message + ': independent BM25');
}
function configuration(schema, extras = {}) {
  const fields = Object.keys(schema.text);
  return createRaveldex({ schema, ...extras, addons: [...(extras.addons ?? []), createPositionProvider({ fields }), createProximity({ fields })] });
}

test('independent exhaustive path reference pins repeated consumption, alternatives, later endpoints and pairwise gaps', () => {
  for (const [value, groups, maxGap, expected] of [
    ['a b b x c', [['a'], ['b'], ['c']], 1, true],
    ['a b x x c', [['a'], ['b'], ['c']], 1, false],
    ['a x b x c', [['a'], ['b'], ['c']], 1, true],
    ['red', [['red', 'blue'], ['red']], 32, false],
    ['red red', [['red', 'blue'], ['red']], 0, true],
    ['red blue', [['red'], ['green', 'blue']], 0, true],
    ['blue red', [['red'], ['blue']], 32, false],
    ['a x x b', [['a'], ['b']], 1, false],
  ]) assert.equal(orderedSourceMatch(originalSourceTokens(value), groups, maxGap), expected, value);
  assert.equal(orderedSourceMatch([], [['red']], 0), false);
  assert.equal(orderedSourceMatch(originalSourceTokens('red'), [], 0), false);
  const model = scanProximitySourceCorpus(proximityRecords, PROXIMITY_SCHEMA);
  for (const row of handProximityCases) assert.deepEqual(sorted(sourceProximityQueryResult(model, row.query, page).hits.map(hit => hit.id)), sorted(row.ids), row.name + ': independent source truth must agree with hand-authored labels');
});

test('hand-authored and Boolean proximity truth preserves complete pages, ties and independent native scores in both insertion orders', async t => {
  const model = scanProximitySourceCorpus(proximityRecords, PROXIMITY_SCHEMA), queries = [...handProximityCases.map(row => row.query), ...booleanProximityCases];
  let comparisons = 0;
  for (const records of [proximityRecords, [...proximityRecords].reverse()]) {
    const engine = configuration(PROXIMITY_SCHEMA);
    try {
      await engine.addMany(records);
      for (const query of queries) for (const options of [page, { limit: 0 }, { limit: 1 }, { offset: 1, limit: 3 }]) {
        compare(await engine.search(publicProximityQuery(query), options), sourceProximityQueryResult(model, query, options), 'Hand/source Boolean and page truth'); comparisons++;
      }
    } finally { await engine.dispose(); }
  }
  assert.equal(comparisons, 240); t.diagnostic(`${comparisons} complete independent membership/native-score comparisons across 20 hand-authored and 10 Boolean trees, four pages and two insertion orders.`);
});

function sequences(alphabet, maximum) {
  const values = [[]];
  let previous = [[]];
  for (let length = 1; length <= maximum; length++) {
    previous = previous.flatMap(prefix => alphabet.map(term => [...prefix, term])); values.push(...previous);
  }
  return values;
}
test('all binary source strings through six positions agree with an independent path scan for 117 ordered group/gap queries', async t => {
  const schema = { text: { body: {} } }, values = sequences(['a', 'b'], 6), records = values.map((tokens, index) => ({ id: `r${String(index).padStart(3, '0')}`, text: { body: tokens.join(' ') } }));
  const groups = sequences([['a'], ['b'], ['a', 'b']], 3).filter(value => value.length), queries = groups.flatMap(group => [0, 1, 2].map(maxGap => p(group, maxGap)));
  const model = scanProximitySourceCorpus(records, schema); let comparisons = 0;
  for (const ordered of [records, [...records].reverse()]) {
    const engine = configuration(schema);
    try {
      await engine.addMany(ordered);
      for (const query of queries) for (const options of [page, { limit: 0 }, { offset: 2, limit: 3 }]) {
        // Public page size is bounded; the independent oracle still computes
        // the full 127-document eligibility before applying this page.
        compare(await engine.search(publicProximityQuery(query), options), sourceProximityQueryResult(model, query, options), 'Exhaustive binary positional truth'); comparisons++;
      }
    } finally { await engine.dispose(); }
  }
  assert.equal(records.length, 127); assert.equal(queries.length, 117); assert.equal(comparisons, 702);
  t.diagnostic(JSON.stringify({ records: records.length, queries: queries.length, exhaustiveEligibilityPairs: records.length * queries.length, completePagedComparisons: comparisons, sourceAlphabet: ['a', 'b'], groupAlternatives: [['a'], ['b'], ['a', 'b']], insertionOrders: 2 }));
});

test('zero-gap singleton proximity exactly preserves source and position strict-phrase membership and unrounded scores', async t => {
  const fields = Object.keys(PROXIMITY_SCHEMA.text), extras = [createPositionPhrases({ fields }), createSourceProvider({ fields })], engine = configuration(PROXIMITY_SCHEMA, { addons: extras });
  const source = createRaveldex({ schema: PROXIMITY_SCHEMA, addons: [createSourceProvider({ fields }), createSourcePhrases({ fields })] });
  const model = scanProximitySourceCorpus(proximityRecords, PROXIMITY_SCHEMA), cases = handProximityCases.filter(row => row.query.maxGap === 0 && row.query.groups.every(group => group.length === 1));
  let comparisons = 0;
  try {
    await engine.addMany(proximityRecords); await source.addMany(proximityRecords);
    for (const row of cases) for (const options of [page, { limit: 0 }, { offset: 1, limit: 2 }]) {
      const phrase = { kind: 'phrase', text: row.query.groups.map(group => group[0]).join(' '), ...(row.query.fields ? { fields: row.query.fields } : {}) };
      const actual = await engine.search(publicProximityQuery(row.query), options), strict = await engine.search(publicProximityQuery(phrase), options), sourceStrict = await source.search(publicProximityQuery(phrase), options);
      compare(actual, sourceProximityQueryResult(model, row.query, options), row.name); assert.deepEqual(actual, strict, row.name + ': exact native position phrase parity'); assert.deepEqual(actual, sourceStrict, row.name + ': exact native source phrase parity'); comparisons++;
    }
  } finally { await engine.dispose(); await source.dispose(); }
  t.diagnostic(`${comparisons} complete zero-gap singleton comparisons against both strict phrase representations, including repeats, normalization, NFKC and pages.`);
});

test('frozen documentation navigation labels were established independently before production execution', async t => {
  const bytes = await readFile(new URL('../../fixtures/phrases/proximity-docs.json', import.meta.url)); assert.equal(createHash('sha256').update(bytes).digest('hex'), DOCUMENT_LABEL_SHA, 'Frozen proximity labels must not be retuned');
  const fixture = JSON.parse(bytes), corpusBytes = await readFile(new URL('../../fixtures/relevance/corpus.json', import.meta.url)); assert.equal(createHash('sha256').update(corpusBytes).digest('hex'), fixture.corpus.sha256);
  const corpus = JSON.parse(corpusBytes), model = scanProximitySourceCorpus(corpus.records, corpus.schema), engine = configuration(corpus.schema); let comparisons = 0, positives = 0, negatives = 0;
  try {
    await engine.addMany(corpus.records);
    for (const row of fixture.judgments) {
      const query = p(row.groups, row.maxGap), expected = sourceProximityQueryResult(model, query, page), actual = await engine.search(publicProximityQuery(query), page);
      assert.deepEqual(sorted(expected.hits.map(hit => hit.id)), row.expectedIds, row.id + ': independent frozen source truth'); compare(actual, expected, row.id); assert.deepEqual(sorted(actual.hits.map(hit => hit.id)), row.expectedIds, row.id + ': frozen full membership');
      if (actual.total) positives++; else negatives++; comparisons++;
    }
  } finally { await engine.dispose(); }
  assert.equal(positives, 10); assert.equal(negatives, 4); t.diagnostic(JSON.stringify({ fixtureSha256: DOCUMENT_LABEL_SHA, corpusSha256: fixture.corpus.sha256, completeSourceJudgments: comparisons, nonemptyIntents: positives, emptyControls: negatives, limitations: fixture.context.limitations }));
});

test('selected English and identifier analyzers preserve zero-gap phrase parity and consume original positions only', async t => {
  const schema = { text: { body: {} } }, fields = ['body'], records = [
    { id: 'english-a', text: { body: 'running engines' } }, { id: 'english-b', text: { body: 'runs engine' } },
    { id: 'code-whole', text: { body: 'fooBar baz' } }, { id: 'code-gapped', text: { body: 'fooBar gap baz' } },
    { id: 'code-component', text: { body: 'foo bar baz' } }, { id: 'code-original', text: { body: 'foo baz' } },
  ]; let comparisons = 0;
  for (const [name, extras, cases] of [
    ['basic', {}, [[p([['running'], ['engines']], 0), ['english-a']], [p([['foo'], ['baz']], 0), ['code-original']]]],
    ['english', { analyzer: ENGLISH_ANALYZER, addons: [createEnglishAnalyzer()] }, [[p([['run'], ['engine']], 0), ['english-a', 'english-b']], [p([['foo'], ['baz']], 0), ['code-original']]]],
    ['identifiers', { analyzer: IDENTIFIER_ANALYZER, addons: [createIdentifierAnalyzer()] }, [[p([['foo'], ['baz']], 0), ['code-original']], [p([['fooBar'], ['baz']], 0), ['code-whole']], [p([['foo'], ['bar']], 0), ['code-component']], [p([['fooBar'], ['baz']], 1), ['code-whole', 'code-gapped']]]],
  ]) {
    const engine = configuration(schema, { ...extras, addons: [...(extras.addons ?? []), createPositionPhrases({ fields })] });
    try {
      await engine.addMany(records);
      for (const [query, ids] of cases) {
        const actual = await engine.search(publicProximityQuery(query), page); assert.deepEqual(sorted(actual.hits.map(hit => hit.id)), sorted(ids), name + ': manually authored original-position truth');
        if (query.maxGap === 0) assert.deepEqual(actual, await engine.search(publicProximityQuery({ kind: 'phrase', text: query.groups.map(group => group[0]).join(' ') }), page), name + ': zero-gap actual scores'); comparisons++;
      }
    } finally { await engine.dispose(); }
  }
  assert.equal(comparisons, 8); t.diagnostic(`${comparisons} selected-analyzer original-position cases; code components cannot supply proximity matches and English alternatives use selected morphology.`);
});

test('Inspector field facts use exact native BM25 and canonical repeated/alternative groups without a proximity bonus', async t => {
  const schema = { text: { title: { boost: 2 } } }, fields = ['title'], records = [{ id: 'a', text: { title: 'foo foo' } }, { id: 'b', text: { title: 'foo bar' } }, { id: 'c', text: { title: 'bar' } }];
  const engine = configuration(schema, { addons: [createInspector()] }), query = p([['foo'], ['foo', 'bar']], 0), model = scanProximitySourceCorpus(records, schema);
  try {
    await engine.addMany(records); const actual = await engine.search(publicProximityQuery(query), { ...page, extensions: { inspector: { ids: ['a', 'b', 'c'] } } }); compare(actual, sourceProximityQueryResult(model, query, page), 'Hand native arithmetic');
    const facts = actual.extensions.inspector.trace.facts.filter(fact => fact.kind === 'field');
    for (const fact of facts) {
      const tf = fact.id === 'a' ? 2 : 1, expected = 2 * Math.log(1 + (3 - 2 + 0.5) / (2 + 0.5)) * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * 2 / (5 / 3)));
      assert.equal(fact.tf, tf); assert.equal(fact.df, 2); assert.equal(fact.N, 3); assert.equal(fact.weight, 1); near(fact.selected, expected, 'Hand BM25 selected alternative contribution');
    }
    for (const hit of actual.hits) near(facts.filter(fact => fact.id === hit.id).reduce((sum, fact) => sum + fact.selected, 0), hit.score, 'No hidden proximity bonus');
    const repeated = p([['foo'], ['foo']], 0), same = await engine.search(publicProximityQuery(repeated), page), ordinary = await engine.search('foo', page);
    assert.equal(same.total, 1); assert.equal(same.hits[0].score, ordinary.hits.find(hit => hit.id === 'a').score, 'Repeated canonical group contributes once'); t.diagnostic(`${facts.length} native field facts checked against hand-derived arithmetic; repeated group contributes once.`);
  } finally { await engine.dispose(); }
});

test('installing an unrequested proximity capability leaves all 76 ordinary basic relevance results and scores unchanged', async t => {
  const { corpus, judgments } = await loadFrozenFixture(), fields = Object.keys(corpus.schema.text), model = scanPhraseSourceCorpus(corpus.records, corpus.schema);
  const addons = () => [createSourceProvider({ fields }), createSourcePhrases({ fields })], baseline = createRaveldex({ schema: corpus.schema, addons: addons() });
  const installed = createRaveldex({ schema: corpus.schema, addons: [...addons(), createPositionProvider({ fields }), createProximity({ fields })] });
  try {
    await baseline.addMany(corpus.records); await installed.addMany(corpus.records);
    for (const row of judgments) {
      const query = ordinaryPublicQuery(row.query), before = await baseline.search(query, page), after = await installed.search(query, page);
      compare(before, sourcePhraseQueryResult(model, row.query, page), row.id + ': independent original basic source arithmetic'); assert.deepEqual(after, before, row.id + ': unrequested proximity cannot change ordinary results');
    }
  } finally { await baseline.dispose(); await installed.dispose(); }
  assert.equal(judgments.length, 76); t.diagnostic(`${judgments.length} unchanged ordinary results, complete totals and scores with proximity installed but unrequested.`);
});
