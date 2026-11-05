import test from 'node:test';
import assert from 'node:assert/strict';
import { createQualifiedSnapshotEngine } from '../../dist/adapters/snapshots/snapshots.js';
import { createSnapshots, currentNodeSnapshotEnvironment } from '../../dist/adapters/snapshots/index.js';
import { getExecutionOwner } from '../../dist/core/execution/engine.js';
import { captureSearch, executeOwnedSearch, executeSearch } from '../../dist/core/query/search.js';
import { directoryEntries } from '../../dist/core/index/directory.js';
import { createSourceProvider } from '../../dist/addons/phrases/source.js';
import { FakeHost, FakeSignal } from '../fixtures/execution/host.mjs';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';
import { group, prefix, exact, and, or, eq } from '../fixtures/ranking/query.mjs';

const schema = { text: { body: {} }, metadata: { enabled: { type: 'boolean' } } };
const selected = value => group([prefix(value)], ['body']);
const weighted = group([prefix('pre', .5), exact('pre000', .75)], ['body']);
const term = index => `pre${String(index).padStart(3, '0')}`;
const record = (id, body, enabled = true) => ({ id, text: { body }, metadata: { enabled } });
const initial = () => Array.from({ length: 256 }, (_, i) => record(`id:${String(i).padStart(3, '0')}`, `${term(i)} common`, i % 2 === 0));
const outcome = pending => pending.then(value => ({ value }), error => ({ error }));
function drain(cursor) {
  for (;;) { const step = cursor.next(); if (step.done) return step.value; assert.ok(step.value.workUnits > 0); }
}
function fixture() {
  const host = new FakeHost();
  const metrics = { workUnits: 0, steps: 0, hostYields: 0, maxTaskWorkUnits: 0, maxStepWorkUnits: 0, checks: 0, phaseChecks: {} };
  const qualification = { profileId: 'rx9002-exact-node-test-fixture', scope: 'exact-node-runtime', environment: currentNodeSnapshotEnvironment(), evidence: ['test/core/n10-churn-hardening.test.mjs: matching fixture only; no cross-host qualification'] };
  const engine = createQualifiedSnapshotEngine({ schema, addons: [createSourceProvider({ fields: ['body'] })], limits: { checkpointWorkUnits: 256 } }, qualification, host, metrics);
  const snapshots = createSnapshots(engine);
  return { host, metrics, engine, owner: getExecutionOwner(engine), snapshots,
    async call(method, ...args) { const pending = engine[method](...args); host.runReady(); return pending; },
    async snapshot(method, ...args) { const pending = snapshots[method](...args); host.runReady(); return pending; },
    async close() { await engine.dispose(); assert.equal(host.pending, 0); },
  };
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-12, Math.abs(expected) * 1e-12), `${actual} != ${expected}`);
function compare(actual, records, query, options = { limit: 100 }) {
  // Independent original-source tokenizer, membership and BM25 arithmetic.
  const expected = sourceQueryResult(scanSourceCorpus(records, schema), query, options);
  assert.equal(actual.completeness, 'complete'); assert.equal(actual.model, 'raveldex-bm25-v1');
  assert.equal(actual.total, expected.total); assert.deepEqual(actual.hits.map(h => h.id), expected.hits.map(h => h.id));
  actual.hits.forEach((hit, i) => close(hit.score, expected.hits[i].score));
}
function checkDictionary(root, records) {
  const expected = scanSourceCorpus(records, schema).statistics.get('body');
  const actual = root.fields.body, keys = [], seen = new Set();
  function walk(node, lower, upper) {
    if (!node) return 0;
    assert.ok(Object.isFrozen(node)); assert.ok(!seen.has(node)); seen.add(node);
    if (lower !== undefined) assert.ok(lower < node.key);
    if (upper !== undefined) assert.ok(node.key < upper);
    const left = walk(node.left, lower, node.key); keys.push(node.key); const right = walk(node.right, node.key, upper);
    assert.equal(node.height, 1 + Math.max(left, right)); assert.ok(Math.abs(left - right) <= 1);
    return node.height;
  }
  walk(actual.order);
  assert.deepEqual(keys, [...expected.documentFrequencies.keys()].sort());
  assert.deepEqual([...directoryEntries(actual.terms)].map(([key]) => key).sort(), keys);
  for (const [key, entry] of directoryEntries(actual.terms)) assert.equal(entry.df, expected.documentFrequencies.get(key));
  assert.equal(actual.documents, expected.population); assert.equal(actual.length, expected.totalLength);
}
function trace(root, records, query, ids) {
  const result = drain(executeSearch(root, query, { limit: 100 }, { ids, maxFacts: 4096 }));
  compare(result, records, query);
  const corpus = scanSourceCorpus(records, schema), expected = corpus.statistics.get('body');
  // The reference has no native output cap: retain all eligibility facts,
  // including matches outside the selected public page.
  const complete = sourceQueryResult(corpus, query, { limit: records.length });
  for (const fact of result.trace.facts.filter(f => f.kind === 'field')) {
    const document = corpus.documents.find(d => d.id === fact.id).fields.get('body');
    assert.equal(fact.N, expected.population); assert.equal(fact.totalLength, expected.totalLength);
    assert.equal(fact.df, expected.documentFrequencies.get(fact.term)); close(fact.avgLength, expected.totalLength / expected.population);
    assert.equal(fact.tf, document.frequencies.get(fact.term)); assert.equal(fact.length, document.length); assert.equal(fact.boost, 1);
    close(fact.idf, Math.log(1 + (fact.N - fact.df + .5) / (fact.df + .5)));
    close(fact.normalizer, 1.2 * (.25 + .75 * fact.length / fact.avgLength));
    close(fact.selected, fact.weight * fact.boost * fact.idf * fact.tf * 2.2 / (fact.tf + fact.normalizer));
  }
  for (const id of ids) {
    const fact = result.trace.facts.find(f => f.kind === 'document' && f.id === id), hit = complete.hits.find(h => h.id === id);
    assert.ok(fact); assert.equal(fact.exists, records.some(r => r.id === id)); assert.equal(fact.matched, !!hit);
    close(fact.score, hit?.score ?? 0);
  }
  return result;
}
function expansion(error, path, maximum, actual) {
  assert.equal(error.code, 'LIMIT_EXCEEDED'); assert.equal(error.message, 'Raveldex: LIMIT_EXCEEDED');
  assert.deepEqual(error.details, { path, limit: maximum, actual }); return true;
}

test('N10 bulk-restored dictionary and ranking stay coherent across live 256/257 churn and an older search cursor', async () => {
  const donor = fixture(), receiver = fixture(); let records = initial();
  try {
    await donor.call('addMany', records); const encoded = await donor.snapshot('exportSource');
    await receiver.call('add', record('prior', 'oldprefix common'));
    await receiver.snapshot('restore', encoded);
    assert.ok(receiver.metrics.phaseChecks['snapshot.source.participant-finalization'] > 0, 'actual first-party bulk finalization must execute');
    const oldRoot = receiver.owner.root;
    let scoredBeforeChurn = false;
    const oldCursor = executeOwnedSearch(oldRoot, captureSearch(oldRoot.configuration, weighted, { limit: 100 }), {
      checkpoint(phase) { if (phase === 'selection') scoredBeforeChurn = true; },
    });
    // Selection follows scoring a real matching document. Pause with populated
    // query-local field/IDF state, not merely before analysis starts.
    for (let steps = 0; !scoredBeforeChurn; steps++) {
      assert.ok(steps < 100_000); assert.equal(oldCursor.next().done, false);
    }
    const verify = async () => {
      checkDictionary(receiver.owner.root, records);
      for (const query of [weighted, and(weighted, eq('enabled', true)), selected('pre000')]) {
        for (const offset of [0, 100, 200]) compare(await receiver.call('search', query, { offset, limit: 100 }), records, query, { offset, limit: 100 });
      }
      trace(receiver.owner.root, records, selected('pre000'), ['id:000', 'id:001', 'absent']);
      trace(receiver.owner.root, records, weighted, ['id:000', 'id:255', 'absent']);
    };
    await verify();
    // Explicit equal-length initial BM25: the overlapping exact alternative
    // increases pre000's weight without adding a 257th live field/term pair.
    const first = await receiver.call('search', weighted, { limit: 1 });
    close(first.hits[0].score, .75 * Math.log(1 + (256 - 1 + .5) / (1 + .5)));
    const replacement = record('id:000', 'common common common');
    await receiver.call('replace', replacement); records = records.map(r => r.id === replacement.id ? replacement : r); await verify();
    const extra = record('extra', 'preextra common'); await receiver.call('add', extra); records.push(extra); await verify();
    const over = record('over', 'preover common'); await receiver.call('add', over); records.push(over); checkDictionary(receiver.owner.root, records);
    await assert.rejects(receiver.call('search', selected('pre')), error => expansion(error, 'expansions.group', 256, 257));
    await receiver.call('remove', 'over'); records = records.filter(r => r.id !== 'over'); await verify();
    await receiver.call('remove', 'extra'); records = records.filter(r => r.id !== 'extra');
    await receiver.call('replace', initial()[0]); records = records.map(r => r.id === 'id:000' ? initial()[0] : r); await verify();
    compare(drain(oldCursor), initial(), weighted);
    checkDictionary(oldRoot, initial());
    assert.equal(receiver.host.pending, 0);
  } finally { await donor.close(); await receiver.close(); }
});

test('N10 queued bulk restore, late validation failure, cancelled core sealing and selective search retain one revision', async () => {
  const donor = fixture(), receiver = fixture(); const records = initial();
  try {
    await donor.call('addMany', records); const encoded = await donor.snapshot('exportSource');
    await receiver.call('add', record('prior', 'oldprefix common common'));
    const oldRoot = receiver.owner.root, oldResult = drain(executeSearch(oldRoot, 'common', { limit: 100 }));
    const coreBefore = receiver.metrics.phaseChecks.core ?? 0, signal = new FakeSignal();
    const restored = outcome(receiver.snapshots.restore(encoded));
    const first = outcome(receiver.engine.search(and(weighted, eq('enabled', true)), { limit: 100 }));
    // The duplicate is a late validation/analysis failure, not core staging.
    const failed = outcome(receiver.engine.addMany([record('analysed-only', 'preunpublished common'), records[0]]));
    const cancelled = outcome(receiver.engine.add(record('staged', `prephantom common ${records.map((_, i) => term(i)).join(' ')}`), { signal }));
    const second = outcome(receiver.engine.search(selected('pre000'), { limit: 100 }));
    let stagedRoot;
    for (let callbacks = 0; !signal.aborted; callbacks++) {
      assert.ok(callbacks < 100_000, 'core sealing checkpoint was not reached');
      assert.equal(receiver.host.runNext(), true, 'queued core sealing must remain suspended');
      // Reaching core means all document contributions are privately staged;
      // suspend during sealing rather than depending on a numeric work count.
      if ((receiver.metrics.phaseChecks.core ?? 0) > coreBefore) {
        stagedRoot = receiver.owner.root; assert.equal(stagedRoot.revision, 2); signal.stop();
      }
    }
    receiver.host.runReady();
    const [a, b, c, d, e] = await Promise.all([restored, first, failed, cancelled, second]);
    assert.equal(a.value.revision, 2); assert.equal(b.value.revision, 2); assert.equal(e.value.revision, 2);
    assert.equal(c.error.code, 'ID_EXISTS'); assert.equal(c.value, undefined);
    assert.equal(d.error.code, 'CANCELLED'); assert.equal(d.value, undefined); assert.equal(signal.listenerCount, 0);
    compare(b.value, records, and(weighted, eq('enabled', true))); compare(e.value, records, selected('pre000'));
    assert.equal(receiver.owner.root, stagedRoot); checkDictionary(receiver.owner.root, records);
    assert.equal((await receiver.call('search', 'prephantom')).total, 0); assert.equal((await receiver.call('search', 'preunpublished')).total, 0);
    assert.equal((await receiver.call('search', 'oldprefix')).total, 0);
    assert.deepEqual(drain(executeSearch(oldRoot, 'common', { limit: 100 })), oldResult);
    trace(receiver.owner.root, records, selected('pre000'), ['id:000', 'id:255', 'prior', 'staged']);
    assert.equal(receiver.host.pending, 0);
  } finally { await donor.close(); await receiver.close(); }
});

test('N10 bulk restore and dictionary removal/reinsert preserve exact 1024/1025 query expansion errors', async () => {
  const donor = fixture(), receiver = fixture();
  const families = ['aa', 'bb', 'cc', 'dd'];
  const words = families.flatMap(p => Array.from({ length: 256 }, (_, i) => `${p}${String(i).padStart(3, '0')}`));
  const original = record('wide', words.join(' '));
  const atLimit = or(...families.map(selected)), aboveLimit = or(atLimit, group([exact('extra')], ['body']));
  try {
    await donor.call('add', original); const encoded = await donor.snapshot('exportSource'); await receiver.snapshot('restore', encoded);
    assert.ok(receiver.metrics.phaseChecks['snapshot.source.participant-finalization'] > 0);
    compare(await receiver.call('search', atLimit), [original], atLimit, { limit: 20 });
    const extra = record('extra', 'extra'); await receiver.call('add', extra);
    await assert.rejects(receiver.call('search', aboveLimit), error => expansion(error, 'expansions.query', 1024, 1025));
    const reduced = record('wide', words.slice(1).join(' ')); await receiver.call('replace', reduced);
    checkDictionary(receiver.owner.root, [reduced, extra]); compare(await receiver.call('search', aboveLimit), [reduced, extra], aboveLimit, { limit: 20 });
    await receiver.call('replace', original); checkDictionary(receiver.owner.root, [original, extra]);
    await assert.rejects(receiver.call('search', aboveLimit), error => expansion(error, 'expansions.query', 1024, 1025));
    await receiver.call('remove', 'extra'); checkDictionary(receiver.owner.root, [original]);
    compare(await receiver.call('search', atLimit), [original], atLimit, { limit: 20 });
  } finally { await donor.close(); await receiver.close(); }
});
