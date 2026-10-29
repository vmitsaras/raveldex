import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaveldex } from '../../../dist/index.js';
import { createPatch } from '../../../dist/addons/patch/index.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { createPositionPhrases } from '../../../dist/addons/positions/phrases.js';
import { createPhrases } from '../../../dist/addons/phrases/mixed.js';
import { createSnapshots } from '../../../dist/adapters/snapshots/index.js';
import { createFilters } from '../../../dist/addons/filters/index.js';
import { createFacets } from '../../../dist/addons/facets/index.js';
import { createInspector } from '../../../dist/addons/inspector/index.js';
import { createMatchEvidence } from '../../../dist/addons/evidence/index.js';
import { createEnglishAnalyzer, ENGLISH_ANALYZER } from '../../../dist/integrations/languages/english/index.js';
import { createIdentifierAnalyzer, IDENTIFIER_ANALYZER } from '../../../dist/addons/identifiers/index.js';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../../oracle/phrases.mjs';
import { originalSourceTokens } from '../../oracle/query.mjs';
import { loadFrozenFixture, publicQuery } from '../../../bench/relevance-lib.mjs';
import { PATCH_SCHEMA, patchRecords, patchPairs, patchQueries, invalidPatchCases } from '../../fixtures/mutations/patch.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-12, Math.abs(expected) * 1e-12), `${label}: ${actual} != ${expected}`);
const nativeQuery = query => {
  if (typeof query === 'string') return query;
  if (query.kind === 'phrase') { const { kind, ...payload } = query; return { kind: 'extension', capability: 'phrases', version: 1, payload }; }
  if (query.kind === 'and' || query.kind === 'or') return { ...query, children: query.children.map(nativeQuery) };
  if (query.kind === 'not') return { ...query, child: nativeQuery(query.child) };
  return query;
};
function compare(actual, expected, revision, label) {
  assert.equal(actual.revision, revision, label);
  assert.equal(actual.completeness, 'complete', label);
  assert.equal(actual.model, 'raveldex-bm25-v1', label);
  assert.equal(actual.total, expected.total, label);
  assert.deepEqual(actual.hits.map(hit => hit.id), expected.hits.map(hit => hit.id), label);
  for (let index = 0; index < actual.hits.length; index++) near(actual.hits[index].score, expected.hits[index].score, `${label}: independent source BM25`);
}
/** Source export shape is specified independently of production capture. */
function canonicalRecords(records) {
  return records.map(record => ({
    id: record.id,
    text: Object.fromEntries(Object.entries(record.text).map(([field, raw]) => [field, typeof raw === 'string' ? [raw] : [...raw]])),
    metadata: Object.fromEntries(Object.entries(record.metadata ?? {}).map(([field, raw]) => [field, Array.isArray(raw) ? [...new Set(raw.map(value => value === 0 ? 0 : value))] : raw === 0 ? 0 : raw])),
  })).sort((a, b) => ordinal(a.id, b.id));
}
function configuration(strategy = 'source', schema = PATCH_SCHEMA) {
  const fields = Object.keys(schema.text);
  const phrases = strategy === 'source' ? [createSourcePhrases({ fields })]
    : strategy === 'positions' ? [createPositionProvider({ fields, offsets: fields }), createPositionPhrases({ fields })]
      : [createPositionProvider({ fields: ['body', 'notes'], offsets: ['body', 'notes'] }), createPhrases({ fields: { title: 'source', body: 'positions', notes: 'positions' } })];
  return { schema, addons: [createSourceProvider({ fields }), ...phrases, createFilters({ fields: Object.keys(schema.metadata) }), createFacets({ fields: ['kind', 'tags'] }), createInspector()] };
}
async function sourceRecords(engine) { return JSON.parse(await createSnapshots(engine).exportSource()).body.payload.records; }

test('twelve handwritten patches equal independent full replacements and exhaustive source semantics in three phrase representations', async t => {
  let comparisons = 0, snapshots = 0, committed = 0;
  for (const strategy of ['source', 'positions', 'mixed']) {
    const target = createRaveldex(configuration(strategy)), replacement = createRaveldex(configuration(strategy)), patch = createPatch(target);
    const expected = new Map(patchRecords.map(record => [record.id, structuredClone(record)]));
    try {
      await target.addMany(patchRecords); await replacement.addMany(patchRecords);
      let revision = 1;
      for (const pair of patchPairs) {
        const request = { ...structuredClone(pair.request), expectedRevision: revision };
        const actualMutation = await patch.patch(request), ordinaryMutation = await replacement.replace(pair.replacement);
        revision++;
        assert.deepEqual(actualMutation, ordinaryMutation, pair.name);
        assert.deepEqual(actualMutation, { revision, changed: true, added: 0, replaced: 1, removed: 0 }, pair.name);
        committed++;
        expected.set(pair.replacement.id, structuredClone(pair.replacement));
        const records = [...expected.values()], model = scanPhraseSourceCorpus(records, PATCH_SCHEMA);
        assert.deepEqual(plain(await sourceRecords(target)), canonicalRecords(records), pair.name + ': exact authoritative source'); snapshots++;
        assert.deepEqual(plain(await sourceRecords(replacement)), canonicalRecords(records), pair.name + ': full replacement source'); snapshots++;
        for (const query of patchQueries) for (const page of [{ limit: 100 }, { limit: 0 }, { offset: 1, limit: 2 }]) {
          const actual = await target.search(nativeQuery(query), page);
          assert.deepEqual(actual, await replacement.search(nativeQuery(query), page), pair.name + ': complete ordinary replacement parity');
          compare(actual, sourcePhraseQueryResult(model, query, page), revision, pair.name);
          comparisons++;
        }
      }
    } finally { await target.dispose(); await replacement.dispose(); }
  }
  assert.equal(committed, 36); assert.equal(snapshots, 72); assert.equal(comparisons, 1944);
  t.diagnostic(JSON.stringify({ handwrittenPatchPairs: patchPairs.length, representations: 3, committed, exactSourceSnapshots: snapshots, completePatchedReplacementIndependentSourceComparisons: comparisons }));
});

test('invalid partial values reject without changing complete source or independent query outcomes', async t => {
  const engine = createRaveldex(configuration()), patch = createPatch(engine); let comparisons = 0;
  try {
    await engine.addMany(patchRecords);
    const before = await sourceRecords(engine), model = scanPhraseSourceCorpus(patchRecords, PATCH_SCHEMA);
    for (const row of invalidPatchCases) {
      await assert.rejects(patch.patch({ ...row.request, expectedRevision: 1 }), { code: row.code }, row.name);
      assert.deepEqual(await sourceRecords(engine), before, row.name + ': exact prior authoritative source');
      for (const query of ['red', { kind: 'all' }, { kind: 'eq', field: 'kind', value: null }, { kind: 'phrase', text: 'red blue' }]) {
        compare(await engine.search(nativeQuery(query), { limit: 100 }), sourcePhraseQueryResult(model, query, { limit: 100 }), 1, row.name); comparisons++;
      }
    }
  } finally { await engine.dispose(); }
  assert.equal(invalidPatchCases.length, 12); assert.equal(comparisons, 48);
  t.diagnostic(JSON.stringify({ rejectedInvalidPatches: invalidPatchCases.length, unchangedIndependentResultComparisons: comparisons }));
});

test('metadata range/set/facet observations reflect one coherent patched revision including absent, null and empty arrays', async t => {
  const engine = createRaveldex(configuration()), patch = createPatch(engine); let checks = 0;
  try {
    await engine.addMany(patchRecords);
    await patch.patch({ id: 'a', expectedRevision: 1, set: { metadata: { kind: null, tags: ['green', 'green', null], year: 4 } }, unset: { text: ['title'] } });
    const range = { kind: 'extension', capability: 'numeric-range', version: 1, payload: { field: 'year', gte: 0, lte: 4 } };
    const member = { kind: 'extension', capability: 'set-membership', version: 1, payload: { field: 'tags', values: ['green', null] } };
    for (const [query, ids] of [[range, ['a']], [member, ['a']], [{ kind: 'eq', field: 'kind', value: null }, ['a', 'c']]]) {
      const result = await engine.search(query, { limit: 100 }); assert.equal(result.revision, 2); assert.deepEqual(result.hits.map(hit => hit.id), ids); checks++;
    }
    const faceted = await engine.search({ kind: 'all' }, { extensions: { facets: { fields: [{ field: 'kind', missing: true }, { field: 'tags', missing: true }] } } });
    assert.equal(faceted.revision, 2);
    assert.deepEqual(plain(faceted.extensions.facets.fields), [
      { field: 'kind', buckets: [{ kind: 'value', value: null, count: 2 }, { kind: 'value', value: 'guide', count: 1 }, { kind: 'missing', count: 1 }], distinctValueTotal: 3, omittedBucketCount: 0 },
      { field: 'tags', buckets: [{ kind: 'value', value: null, count: 1 }, { kind: 'value', value: 'blue', count: 1 }, { kind: 'value', value: 'green', count: 1 }, { kind: 'missing', count: 1 }], distinctValueTotal: 4, omittedBucketCount: 0 },
    ]); checks += 2;
    await patch.patch({ id: 'a', expectedRevision: 2, set: { metadata: { tags: [] } }, unset: { metadata: ['kind', 'year'] } });
    assert.equal((await engine.search(range)).total, 0); assert.equal((await engine.search(member)).total, 0); checks += 2;
    const empty = await engine.search({ kind: 'all' }, { extensions: { facets: { fields: [{ field: 'tags', missing: true }] } } });
    assert.equal(empty.revision, 3);
    assert.deepEqual(plain(empty.extensions.facets.fields[0]), { field: 'tags', buckets: [{ kind: 'value', value: 'blue', count: 1 }, { kind: 'missing', count: 1 }], distinctValueTotal: 2, omittedBucketCount: 0 }); checks++;
  } finally { await engine.dispose(); }
  assert.equal(checks, 8); t.diagnostic(JSON.stringify({ literalMetadataAndFacetChecks: checks }));
});

test('hand-derived BM25 and Inspector statistics change exactly as full record replacement requires', async t => {
  const schema = { text: { title: { boost: 2 } } }, engine = createRaveldex({ schema, addons: [createSourceProvider({ fields: ['title'] }), createInspector()] }), patch = createPatch(engine); let facts = 0;
  try {
    await engine.addMany([{ id: 'a', text: { title: 'red red' } }, { id: 'b', text: { title: 'red blue' } }, { id: 'c', text: { title: 'blue' } }]);
    for (const row of [
      { revision: 1, N: 3, df: 2, totalLength: 5, lengths: { a: 2, b: 2 }, tf: { a: 2, b: 1 } },
      { revision: 2, N: 3, df: 2, totalLength: 4, lengths: { a: 1, b: 2 }, tf: { a: 1, b: 1 }, request: { id: 'a', expectedRevision: 1, set: { text: { title: 'red' } } } },
      { revision: 3, N: 2, df: 1, totalLength: 3, lengths: { b: 2 }, tf: { b: 1 }, request: { id: 'a', expectedRevision: 2, unset: { text: ['title'] } } },
    ]) {
      if (row.request) await patch.patch(row.request);
      const result = await engine.search('red', { limit: 100, extensions: { inspector: { ids: ['a', 'b', 'c'] } } });
      assert.equal(result.revision, row.revision); assert.equal(result.total, Object.keys(row.lengths).length);
      const observed = result.extensions.inspector.trace.facts.filter(fact => fact.kind === 'field');
      assert.equal(observed.length, Object.keys(row.lengths).length);
      for (const fact of observed) {
        const length = row.lengths[fact.id], tf = row.tf[fact.id], average = row.totalLength / row.N;
        const expected = 2 * Math.log(1 + (row.N - row.df + 0.5) / (row.df + 0.5)) * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * length / average));
        assert.deepEqual([fact.N, fact.df, fact.totalLength, fact.length, fact.tf, fact.boost], [row.N, row.df, row.totalLength, length, tf, 2]);
        near(fact.selected, expected, 'hand arithmetic'); near(result.hits.find(hit => hit.id === fact.id).score, expected, 'actual complete score'); facts++;
      }
    }
  } finally { await engine.dispose(); }
  assert.equal(facts, 5); t.diagnostic(JSON.stringify({ handDerivedFieldFacts: facts }));
});

test('patched original spans use the replacement strings and value boundaries in source and offsets evidence', async t => {
  let comparisons = 0;
  for (const mode of ['source', 'offsets']) {
    const fields = ['body'], engine = createRaveldex({ schema: { text: { body: {} } }, addons: [createSourceProvider({ fields }), ...(mode === 'offsets' ? [createPositionProvider({ fields, offsets: fields })] : []), createMatchEvidence({ fields: { body: mode } })] }), patch = createPatch(engine);
    try {
      await engine.add({ id: 'a', text: { body: 'old red' } });
      await patch.patch({ id: 'a', expectedRevision: 1, set: { text: { body: ['😀 red ﬁle', 'red café red'] } } });
      const result = await engine.search('red', { extensions: { 'match-evidence': { ids: ['a'], fields: ['body'] } } });
      const expected = ['😀 red ﬁle', 'red café red'].flatMap((value, valueIndex) => originalSourceTokens(value).filter(token => token.term === 'red').map(token => ({ field: 'body', valueIndex, start: token.start, end: token.end })));
      const ranges = result.extensions['match-evidence'].documents[0].ranges;
      assert.equal(result.revision, 2);
      assert.deepEqual(ranges.map(({ field, valueIndex, start, end }) => ({ field, valueIndex, start, end })), expected);
      comparisons += expected.length;
      assert.equal((await engine.search('old')).total, 0);
    } finally { await engine.dispose(); }
  }
  assert.equal(comparisons, 6); t.diagnostic(JSON.stringify({ independentlyScannedOriginalRanges: comparisons }));
});

test('selected English and identifier analysis follows the ordinary replacement pipeline', async t => {
  let comparisons = 0;
  for (const row of [
    { analyzer: ENGLISH_ANALYZER, addon: createEnglishAnalyzer, before: 'running engines', after: 'runs engine', queries: ['run', 'engine'], phrase: 'running engines' },
    { analyzer: IDENTIFIER_ANALYZER, addon: createIdentifierAnalyzer, before: 'oldName value', after: 'fooBar baz', queries: ['foo', 'fooBar', 'bar'], phrase: 'fooBar baz' },
  ]) {
    const configuration = () => ({ schema: { text: { body: {} } }, analyzer: row.analyzer, addons: [row.addon(), createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })] });
    const target = createRaveldex(configuration()), full = createRaveldex(configuration());
    try {
      await target.add({ id: 'a', text: { body: row.before } }); await full.add({ id: 'a', text: { body: row.before } });
      await createPatch(target).patch({ id: 'a', expectedRevision: 1, set: { text: { body: row.after } } }); await full.replace({ id: 'a', text: { body: row.after } });
      for (const query of [...row.queries, nativeQuery({ kind: 'phrase', text: row.phrase })]) {
        const actual = await target.search(query, { limit: 100 });
        assert.deepEqual(actual.hits.map(hit => hit.id), ['a']); assert.deepEqual(actual, await full.search(query, { limit: 100 })); comparisons++;
      }
      assert.deepEqual(await sourceRecords(target), await sourceRecords(full));
    } finally { await target.dispose(); await full.dispose(); }
  }
  assert.equal(comparisons, 7); t.diagnostic(JSON.stringify({ selectedAnalyzerReplacementComparisons: comparisons }));
});

test('creating the optional borrowed patch handle leaves all 76 ordinary documentation judgments unchanged', async t => {
  const { corpus, judgments } = await loadFrozenFixture(), fields = Object.keys(corpus.schema.text), engine = createRaveldex({ schema: corpus.schema, addons: [createSourceProvider({ fields }), createSourcePhrases({ fields })] });
  try {
    await engine.addMany(corpus.records);
    const model = scanPhraseSourceCorpus(corpus.records, corpus.schema), before = [];
    for (const row of judgments) {
      const result = await engine.search(publicQuery(row.query), { limit: 100 });
      compare(result, sourcePhraseQueryResult(model, row.query, { limit: 100 }), 1, row.id); before.push(result);
    }
    const patch = createPatch(engine); assert.deepEqual(Object.keys(patch), ['patch']); assert.ok(Object.isFrozen(patch));
    for (let index = 0; index < judgments.length; index++) assert.deepEqual(await engine.search(publicQuery(judgments[index].query), { limit: 100 }), before[index], judgments[index].id);
  } finally { await engine.dispose(); }
  assert.equal(judgments.length, 76); t.diagnostic('76 unchanged ordinary membership, total, order and unrounded score results; handle construction performs no mutation.');
});
