// Counted execution and one-host observations; no heap or hard-latency promise.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { platform, release, arch } from 'node:os';
import { ExecutionOwner } from '../../dist/core/execution/engine.js';
import { directHost } from '../../dist/core/execution/host.js';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { FakeHost, FakeSignal } from '../fixtures/execution/host.mjs';
import { EXACT_SCHEMA, generatedExactCorpus, EXACT_CORPUS_SEEDS } from '../fixtures/corpora/exact.mjs';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';

function drain(cursor) { for (;;) { const next = cursor.next(); if (next.done) return next.value; } }
function metrics() { return { workUnits: 0, steps: 0, hostYields: 0, maxTaskWorkUnits: 0, maxStepWorkUnits: 0, checks: 0, phaseChecks: {} }; }
function compare(actual, expected) {
  assert.equal(actual.total, expected.total);
  assert.deepEqual(actual.hits.map(hit => hit.id), expected.hits.map(hit => hit.id));
  actual.hits.forEach((hit, i) => assert.ok(Math.abs(hit.score - expected.hits[i].score) <= Math.max(1e-12, Math.abs(expected.hits[i].score) * 1e-12)));
}
const rows = [], roots = new Map();
for (const size of [100, 1000, 10000]) {
  const records = generatedExactCorpus(size, EXACT_CORPUS_SEEDS[0]);
  const build = new IndexConstruction({ schema: EXACT_SCHEMA });
  for (let i = 0; i < size; i += 256) drain(build.append(records.slice(i, i + 256)));
  const root = drain(build.finish()); roots.set(size, { root, records });
  const source = scanSourceCorpus(records, EXACT_SCHEMA);
  for (const [name, query, options] of [
    ['common-top20', 'common', { limit: 20 }],
    ['prefix-top1', { kind: 'group', fields: ['body'], variants: [{ text: 'com', match: 'prefix' }] }, { limit: 1 }],
    ['all-last-page', { kind: 'all' }, { offset: size - 20, limit: 20 }],
  ]) {
    const host = new FakeHost(), counts = metrics(), engine = new ExecutionOwner(root, host, [], counts);
    const promise = engine.search(query, options);
    host.runReady(); const actual = await promise;
    compare(actual, sourceQueryResult(source, query, options));
    assert.equal(counts.hostYields, host.executed);
    assert.ok(counts.maxTaskWorkUnits <= 2048 + counts.maxStepWorkUnits - 1);
    assert.equal(host.pending, 0);
    rows.push({ records: size, corpusSha256: createHash('sha256').update(JSON.stringify(records)).digest('hex'), name, total: actual.total, ...counts });
    await engine.dispose(); assert.equal(engine.root, undefined);
  }
  const host = new FakeHost(), counts = metrics(), engine = new ExecutionOwner(root, host, [], counts);
  const replacement = { id: records[0].id, text: { title: 'common replacement red red', body: ['common common blue', 'ＦＯＯ café'] }, ...(records[0].metadata ? { metadata: records[0].metadata } : {}) };
  const promise = engine.replace(replacement); host.runReady(); const actual = await promise;
  assert.equal(actual.revision, 1);
  const revised = records.map(record => record.id === replacement.id ? replacement : record);
  const search = engine.search('common', { limit: 20 }); host.runReady();
  compare(await search, sourceQueryResult(scanSourceCorpus(revised, EXACT_SCHEMA), 'common', { limit: 20 }));
  // Separate replacement metrics by rerunning in a fresh owner with no verification query.
  const mutationHost = new FakeHost(), mutationCounts = metrics(), mutation = new ExecutionOwner(root, mutationHost, [], mutationCounts);
  const only = mutation.replace(replacement); mutationHost.runReady(); assert.deepEqual(await only, actual);
  assert.ok(mutationCounts.maxTaskWorkUnits <= 2048 + mutationCounts.maxStepWorkUnits - 1);
  rows.push({ records: size, name: 'replace-one', ...mutationCounts });
  await mutation.dispose(); await engine.dispose(); assert.equal(mutationHost.pending + host.pending, 0);
}

// Stop during a host yield: no further charged units or root change, all handles removed.
const { root, records } = roots.get(10000);
const fake = new FakeHost(), counts = metrics(), signal = new FakeSignal(), engine = new ExecutionOwner(root, fake, [], counts);
const stopped = engine.replace({ id: records[0].id, text: { body: 'replacement '.repeat(1000) } }, { signal });
const rejection = assert.rejects(stopped, { code: 'CANCELLED' });
const atAbort = counts.workUnits; signal.stop(); await rejection; fake.runReady();
assert.equal(counts.workUnits, atAbort); assert.equal(engine.root, root); assert.equal(fake.pending, 0); assert.equal(signal.listenerCount, 0);
await engine.dispose();

// Actual timer task delivery during large search and staging, plus observed abort response.
const observations = [];
for (const kind of ['search', 'replace']) {
  const nativeCounts = metrics(), owner = new ExecutionOwner(root, directHost(), [], nativeCounts), controller = new AbortController();
  let settled = false;
  const submittedAt = performance.now();
  const operation = kind === 'search' ? owner.search('common', { signal: controller.signal, limit: 20 }) : owner.replace({ id: records[0].id, text: { body: 'replacement '.repeat(1000) } }, { signal: controller.signal });
  const synchronousReturnMs = performance.now() - submittedAt;
  const outcome = operation.then(() => { settled = true; return 'success'; }, error => { settled = true; return error.code; });
  const observed = await new Promise(resolve => setTimeout(() => {
    const wasPending = !settled, abortAt = performance.now();
    controller.abort(); resolve({ wasPending, abortAt });
  }, 0));
  assert.equal(observed.wasPending, true); assert.equal(await outcome, 'CANCELLED');
  const observedAbortResponseMs = performance.now() - observed.abortAt;
  assert.equal(owner.root, root); await owner.dispose();
  observations.push({ kind, records: 10000, timerObservedBeforeSettlement: observed.wasPending, synchronousReturnMs, observedAbortResponseMs, chargedBeforeStop: nativeCounts.workUnits, hostYieldsBeforeStop: nativeCounts.hostYields });
}
process.stdout.write(JSON.stringify({ task: 'RX-1005', policy: 'work-v1', quantum: 2048, seed: `0x${EXACT_CORPUS_SEEDS[0].toString(16)}`,
  environment: { node: process.version, v8: process.versions.v8, icu: process.versions.icu, unicode: process.versions.unicode, platform: platform(), osRelease: release(), arch: arch() },
  notes: ['Counts observe execution cursor steps, checks and whole pump bursts; includes initial synchronous pump and consecutive FIFO work. Fixture construction/oracle verification excluded.', 'The last bounded charge can cross the quantum. Owned-loop stop checks occur at each charge and phase; maxTaskWorkUnits is logical charged work, not physical interruption time.', 'Normalization/lowercase, key enumeration/freezing/hash/allocation, Map/Set operations and bounded returned-hit reversal remain indivisible platform work. Admission property capture is synchronous and bounded; transport is absent.', 'Real timer observations are this host/run only; no guaranteed physical latency, heap bytes, package size, browser support or cross-host qualification.'],
  rows, suspendedAbort: { chargedAtAbort: atAbort, additionalChargedUnits: 0, pendingTasks: 0, signalListeners: 0, rootUnchanged: true }, observations }, null, 2) + '\n');
