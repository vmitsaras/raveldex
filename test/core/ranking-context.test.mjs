import test from 'node:test';
import assert from 'node:assert/strict';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { MutationOwner } from '../../dist/core/mutations/owner.js';
import { captureSearch, executeOwnedSearch, executeSearch } from '../../dist/core/query/search.js';
import { DirectoryBuilder, directoryEntries } from '../../dist/core/index/directory.js';
import { createSourceProvider } from '../../dist/addons/phrases/source.js';
import { createQualifiedSnapshotEngine } from '../../dist/adapters/snapshots/snapshots.js';
import { createSnapshots, currentNodeSnapshotEnvironment } from '../../dist/adapters/snapshots/index.js';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';
import { NUMERIC_SCHEMA, numericRecords, handScores, QUERY_SCHEMA, queryRecords, text, group, exact, prefix, and, or, eq } from '../fixtures/ranking/query.mjs';
import { FakeHost } from '../fixtures/execution/host.mjs';

function drain(cursor) {
  for (;;) { const next = cursor.next(); if (next.done) return next.value; assert.ok(Number.isSafeInteger(next.value.workUnits) && next.value.workUnits > 0); }
}
function build(records, schema = QUERY_SCHEMA, limits) {
  const owner = new IndexConstruction({ schema, ...(limits ? { limits } : {}) });
  for (let start = 0; start < records.length; start += 256) drain(owner.append(records.slice(start, start + 256)));
  return drain(owner.finish());
}
const search = (root, query, options = { limit: 100 }, trace) => drain(executeSearch(root, query, options, trace));
const ids = result => result.hits.map(hit => hit.id);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-12, Math.abs(expected) * 1e-12), `${actual} != ${expected}`);
function compare(actual, records, schema, query, options = { limit: 100 }) {
  // This oracle scans the original source and owns tokenization and arithmetic.
  // Expected values never consult an implementation score/cache/statistics root.
  const expected = sourceQueryResult(scanSourceCorpus(records, schema), query, options);
  assert.equal(actual.completeness, 'complete'); assert.equal(actual.model, 'raveldex-bm25-v1');
  assert.equal(actual.total, expected.total); assert.deepEqual(ids(actual), ids(expected));
  actual.hits.forEach((hit, index) => close(hit.score, expected.hits[index].score));
  return expected;
}
function directory(entries) { const builder = new DirectoryBuilder(); for (const [key, value] of entries) builder.set(key, value); return drain(builder.seal()); }
function rankingError(run) { assert.throws(run, { name: 'RaveldexError', code: 'INTERNAL_ERROR', message: 'Raveldex: INTERNAL_ERROR', details: { path: 'ranking.statistics' } }); }

const matrix = [
  'red car',
  group([exact('red', .25), exact('car'), prefix('ca', .5)], ['body', 'title']),
  and(group([exact('red')], ['title']), group([exact('red', .5)], ['title']), text('red', ['body'])),
  or(and(text('red'), text('car')), text('blue')),
  and(group([prefix('ca'), exact('red', .75)]), eq('enabled', true)),
  text('same'),
];

test('hand arithmetic and actual field facts survive preparation by an earlier untraced document', () => {
  const root = build(numericRecords, NUMERIC_SCHEMA);
  const order = [...directoryEntries(root.documents)].map(([id]) => id);
  assert.ok(order.indexOf('a') < order.indexOf('b'), 'fixture must score untraced a before traced b');
  const result = search(root, 'red car', { limit: 100 }, { ids: ['b'] });
  assert.deepEqual(ids(result), ['a', 'b']);
  close(result.hits[0].score, handScores.and.a); close(result.hits[1].score, handScores.and.b);
  const fields = result.trace.facts.filter(fact => fact.kind === 'field');
  assert.deepEqual(fields.map(fact => fact.term).sort(), ['car', 'red']);
  for (const fact of fields) {
    assert.deepEqual([fact.id, fact.field, fact.tf, fact.df, fact.N, fact.length, fact.totalLength, fact.avgLength, fact.boost, fact.weight, fact.k1, fact.b], ['b', 'title', 1, 2, 3, 2, 6, 2, 1, 1, 1.2, .75]);
    close(fact.idf, 0.470003629245736); close(fact.normalizer, 1.2); close(fact.tfPart, 1); close(fact.base, 0.470003629245736); close(fact.selected, 0.470003629245736);
  }
  const alternative = search(root, group([prefix('ca'), exact('car'), exact('red')]), { limit: 0 }, { ids: ['b'] });
  assert.equal(alternative.total, 2); assert.deepEqual(alternative.hits, []);
  const selected = alternative.trace.facts.find(fact => fact.kind === 'field');
  assert.equal(selected.term, 'car'); assert.equal(selected.weight, 1); assert.equal(selected.variant, JSON.stringify(['ca', 'prefix', 1]));
  close(selected.selected, handScores.alternatives.b);
  assert.ok(!result.trace.facts.some(fact => fact.id === 'a'));
});

test('shared terms across weighted groups, boosted fields, ties and filtered pages retain independent source arithmetic', () => {
  const root = build(queryRecords);
  for (const query of matrix) for (const options of [{ limit: 100 }, { offset: 1, limit: 3 }, { limit: 0 }]) {
    const ordinary = search(root, query, options);
    const traced = search(root, query, options, { ids: ['a', 'b', 'f', 'missing'], maxFacts: 4096 });
    compare(ordinary, queryRecords, QUERY_SCHEMA, query, options); compare(traced, queryRecords, QUERY_SCHEMA, query, options);
    assert.deepEqual({ ...traced, trace: undefined }, { ...ordinary, trace: undefined });
    for (const fact of traced.trace.facts.filter(fact => fact.kind === 'field')) {
      const original = scanSourceCorpus(queryRecords, QUERY_SCHEMA).statistics.get(fact.field);
      assert.equal(fact.N, original.population); assert.equal(fact.totalLength, original.totalLength);
      assert.equal(fact.df, original.documentFrequencies.get(fact.term)); assert.equal(fact.boost, original.boost);
      assert.equal(fact.avgLength, original.totalLength / original.population);
    }
  }
  assert.deepEqual(ids(search(root, 'same')), ['tie:A', 'tie:a', 'tie:𐐀', 'tie:\uE000', 'tie:😀'].sort());
  const plain = search(root, text('red'), { limit: 100 }, { ids: ['a'] });
  const filtered = search(root, and(text('red'), eq('kind', 'Guide')), { limit: 100 }, { ids: ['a'] });
  assert.deepEqual(filtered.hits, plain.hits.filter(hit => ['a', 'f', '__proto__'].includes(hit.id)));
  assert.deepEqual(filtered.trace.facts.filter(fact => fact.kind === 'field').map(({ group, ...fact }) => fact), plain.trace.facts.filter(fact => fact.kind === 'field').map(({ group, ...fact }) => fact));
});

test('each mutation revision refreshes DF and field averages while old roots and failed/noop writes remain stable', () => {
  let records = queryRecords.slice(0, 8);
  const owner = new MutationOwner(build(records)), initial = owner.root;
  const initialResult = search(initial, 'red car');
  const verify = () => { for (const query of matrix.slice(0, 5)) compare(search(owner.root, query), records, QUERY_SCHEMA, query); };
  verify();
  const added = { id: 'added', text: { title: 'red red red', body: 'car car car car red' }, metadata: { kind: 'Guide', enabled: true } };
  assert.equal(drain(owner.mutate('add', added)).revision, 1); records = [...records, added]; verify();
  const replacement = { id: 'a', text: { title: 'car', body: 'red red red red blue blue blue' }, metadata: { kind: 'Guide', enabled: true } };
  assert.equal(drain(owner.mutate('replace', replacement)).revision, 2); records = records.map(record => record.id === 'a' ? replacement : record); verify();
  assert.equal(drain(owner.mutate('remove', ['b', 'c'])).revision, 3); records = records.filter(record => !['b', 'c'].includes(record.id)); verify();
  const before = owner.root, result = search(before, 'red car');
  assert.equal(drain(owner.mutate('remove', 'absent')).changed, false); assert.equal(owner.root, before);
  assert.throws(() => drain(owner.mutate('addMany', [{ id: 'staged', text: { title: 'red' } }, records[0]])), { code: 'ID_EXISTS' });
  assert.equal(owner.root, before); assert.deepEqual(search(before, 'red car'), result); verify();
  assert.deepEqual(search(initial, 'red car'), initialResult);
  assert.equal(drain(owner.mutate('clear')).revision, 4); records = []; verify();
  const reused = { id: 'reused', text: { title: 'red car car', body: 'red' } };
  assert.equal(drain(owner.mutate('add', reused)).revision, 5); records = [reused]; verify();
});

test('interleaved and reentrant searches on distinct roots cannot share ranking statistics', () => {
  const firstRecords = numericRecords;
  const otherRecords = [{ id: 'x', text: { title: 'red red red red car' } }, { id: 'y', text: { title: 'red red red red red red' } }];
  const first = build(firstRecords, NUMERIC_SCHEMA), other = build(otherRecords, NUMERIC_SCHEMA);
  const query = group([exact('red'), exact('car', .5)]);
  const cursors = [executeSearch(first, query, { limit: 100 }), executeSearch(other, query, { limit: 100 })];
  const outputs = [undefined, undefined]; while (outputs.some(value => value === undefined)) {
    for (let i = 0; i < cursors.length; i++) if (outputs[i] === undefined) { const step = cursors[i].next(); if (step.done) outputs[i] = step.value; }
  }
  compare(outputs[0], firstRecords, NUMERIC_SCHEMA, query); compare(outputs[1], otherRecords, NUMERIC_SCHEMA, query);
  let nested = false, priorPhase, scoringDocuments = 0;
  const request = captureSearch(first.configuration, 'red car');
  const result = drain(executeOwnedSearch(first, request, { checkpoint(phase) {
    if (phase === 'scoring' && priorPhase !== phase && ++scoringDocuments === 2) { nested = true; compare(search(other, query), otherRecords, NUMERIC_SCHEMA, query); }
    priorPhase = phase;
  } }));
  assert.ok(nested); compare(result, firstRecords, NUMERIC_SCHEMA, 'red car');
  const controller = new AbortController(); let scoring = 0, previousPhase;
  const stopped = executeOwnedSearch(first, captureSearch(first.configuration, 'red car', { signal: controller.signal }), { checkpoint(phase) {
    if (phase === 'scoring' && previousPhase !== phase && ++scoring === 2) controller.abort();
    previousPhase = phase;
  } });
  assert.throws(() => drain(stopped), { code: 'CANCELLED' }); assert.equal(scoring, 2);
  compare(search(first, 'red car'), firstRecords, NUMERIC_SCHEMA, 'red car');
});

test('unused malformed field statistics stay lazy and per-document validation still runs after a previous hit', () => {
  const schema = { text: { title: {}, body: {} }, metadata: { enabled: { type: 'boolean' } } };
  const records = [{ id: 'a', text: { title: 'red' }, metadata: { enabled: true } }, { id: 'b', text: { body: 'red' }, metadata: { enabled: false } }];
  const root = build(records, schema);
  const bad = { ...root, fields: { ...root.fields, body: { ...root.fields.body, length: 0 } } };
  const filtered = and(text('red'), eq('enabled', true));
  assert.deepEqual(search(bad, filtered), search(root, filtered));
  assert.equal(search(bad, { kind: 'none' }).total, 0); assert.equal(search(bad, 'missing').total, 0);
  rankingError(() => search(bad, 'red'));
  const warm = build([{ id: 'a', text: { title: 'red red' } }, { id: 'b', text: { title: 'red' } }], NUMERIC_SCHEMA);
  const order = [...directoryEntries(warm.documents)], last = order.at(-1)[0];
  const broken = { ...warm, documents: directory(order.map(([id, doc]) => [id, id === last ? { ...doc, fields: { ...doc.fields, title: { ...doc.fields.title, length: 0 } } } : doc])) };
  rankingError(() => search(broken, 'red'));
  compare(search(warm, 'red'), [{ id: 'a', text: { title: 'red red' } }, { id: 'b', text: { title: 'red' } }], NUMERIC_SCHEMA, 'red');
});

test('source/native restore and later churn rebuild query-local ranking inputs without stale donor or receiver values', async () => {
  const schema = { text: { title: { boost: 2 }, body: {} }, metadata: { enabled: { type: 'boolean' } } };
  const qualification = { profileId: 'rx8006-test-declared-exact-node', scope: 'exact-node-runtime', environment: currentNodeSnapshotEnvironment(), evidence: ['test/core/ranking-context.test.mjs: matching-attestation contract fixture; no cross-host qualification claim'] };
  const fixture = () => {
    const host = new FakeHost();
    const engine = createQualifiedSnapshotEngine({ schema, addons: [createSourceProvider({ fields: ['title', 'body'] })] }, qualification, host);
    return { engine, async call(method, ...args) { const promise = engine[method](...args); host.runReady(); return promise; }, async snapshot(method, ...args) { const promise = createSnapshots(engine)[method](...args); host.runReady(); return promise; } };
  };
  const donorRecords = [{ id: 'a', text: { title: 'red red car', body: 'car' }, metadata: { enabled: true } }, { id: 'b', text: { title: 'red', body: 'red red red red blue' }, metadata: { enabled: false } }, { id: 'c', text: { title: 'blue blue', body: 'red' } }];
  const query = group([exact('red', .5), exact('car'), prefix('ca', .25)]);
  for (const format of ['Source', 'Native']) {
    const donor = fixture(), receiver = fixture();
    try {
      await donor.call('addMany', donorRecords);
      const old = { id: 'old', text: { title: 'red', body: 'red car car car car car' } };
      await receiver.call('add', old); compare(await receiver.call('search', query, { limit: 100 }), [old], schema, query);
      const encoded = await donor.snapshot(`export${format}`), receipt = await receiver.snapshot('restore', encoded);
      assert.equal(receipt.revision, 2); assert.equal(receipt.reindexed, format === 'Source');
      compare(await receiver.call('search', query, { limit: 100 }), donorRecords, schema, query);
      compare(await receiver.call('search', and(query, eq('enabled', true)), { limit: 100 }), donorRecords, schema, and(query, eq('enabled', true)));
      const replacement = { id: 'a', text: { title: 'car', body: 'red red red red red red red' }, metadata: { enabled: true } };
      assert.equal((await receiver.call('replace', replacement)).revision, 3); await receiver.call('remove', 'b');
      const retained = [replacement, donorRecords[2]]; compare(await receiver.call('search', query, { limit: 100 }), retained, schema, query);
      await receiver.call('clear'); await receiver.snapshot('restore', encoded);
      compare(await receiver.call('search', query, { limit: 100 }), donorRecords, schema, query);
    } finally { await donor.engine.dispose(); await receiver.engine.dispose(); }
  }
});
