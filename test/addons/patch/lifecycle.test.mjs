import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaveldex } from '../../../dist/index.js';
import { createPatch } from '../../../dist/addons/patch/index.js';
import { createSourceProvider } from '../../../dist/addons/phrases/source.js';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { createOwnedRaveldex, getExecutionOwner } from '../../../dist/core/execution/engine.js';
import { FakeHost, FakeSignal } from '../../fixtures/execution/host.mjs';

const record = { id: 'a', text: { title: 'red apple', body: ['old content', 'untouched'] }, metadata: { rank: 1 } };
const request = { id: 'a', expectedRevision: 1, set: { text: { body: ['blue fruit'] } } };
const observe = p => p.then(value => ({ value }), error => ({ error }));
function setup({ limits = {}, addons, metrics } = {}) {
  const host = new FakeHost(), configuration = captureConfiguration({ schema: { text: { title: {}, body: {} }, metadata: { rank: { type: 'number' } } }, addons: addons ?? [createSourceProvider({ fields: ['title', 'body'] })], limits: { checkpointWorkUnits: 1, ...limits } });
  const engine = createOwnedRaveldex(configuration, host, metrics), patches = createPatch(engine), owner = getExecutionOwner(engine);
  return { host, engine, patches, owner, async run(method, ...args) { const p = engine[method](...args); host.runReady(); return p; }, async patch(value = request, options) { const p = patches.patch(value, options); host.runReady(); return p; } };
}
function released(s, signal) { assert.equal(s.host.pending, 0); if (signal) assert.equal(signal.listenerCount, 0); }

test('one FIFO patch reads the guarded execution root and rejects stale competing patches without lost updates', async () => {
  const s = setup();
  try {
    await s.run('add', record);
    const first = s.patches.patch(request), stale = observe(s.patches.patch({ id: 'a', expectedRevision: 1, set: { metadata: { rank: 9 } } }));
    const read = s.engine.search('blue'); s.host.runReady();
    assert.equal((await first).revision, 2); assert.equal((await stale).error.code, 'REVISION_MISMATCH');
    assert.equal((await read).revision, 2); assert.equal((await s.run('search', 'blue')).total, 1);
    const other = s.engine.add({ id: 'b', text: { title: 'other' } }), conflict = observe(s.patches.patch({ ...request, expectedRevision: 2 }));
    s.host.runReady(); await other; assert.equal((await conflict).error.code, 'REVISION_MISMATCH');
    const root = s.owner.root; assert.equal(root.revision, 3); released(s);
  } finally { await s.engine.dispose(); }
});

test('every observed patch suspension cancels with exact root rollback and later replacement recovery', async t => {
  const calibration = setup(); let stops;
  try { await calibration.run('add', record); const before = calibration.host.executed, p = calibration.patches.patch(request); calibration.host.runReady(); await p; stops = calibration.host.executed - before; } finally { await calibration.engine.dispose(); }
  assert.ok(stops > 10); let cancelled = 0;
  for (let at = 0; at < stops; at++) {
    const s = setup(), signal = new FakeSignal();
    try {
      await s.run('add', record); const root = s.owner.root, pending = observe(s.patches.patch(request, { signal }));
      for (let n = 0; n < at; n++) assert.equal(s.host.runNext(), true);
      const staleCallbacks = s.host.callbacks(); signal.stop();
      assert.equal((await pending).error.code, 'CANCELLED'); assert.equal(s.owner.root, root);
      for (const callback of staleCallbacks) callback();
      assert.equal(s.owner.root, root); released(s, signal);
      assert.equal((await s.patch()).revision, 2); assert.equal((await s.run('search', 'blue')).total, 1); released(s); cancelled++;
    } finally { await s.engine.dispose(); }
  }
  t.diagnostic(JSON.stringify({ observedSuspensions: stops, cancellationsWithExactRollbackAndRecovery: cancelled }));
});

test('queue capacity, pre-abort, active/queued deadlines and disposal share native cleanup', async () => {
  const s = setup({ limits: { maxQueuedOperations: 1 } });
  try {
    await s.run('add', record); const root = s.owner.root;
    const pre = new FakeSignal(); pre.stop(); await assert.rejects(s.patches.patch(request, { signal: pre }), { code: 'CANCELLED' });
    const active = observe(s.patches.patch(request, { deadlineMs: 5 })), queuedSignal = new FakeSignal(), queued = observe(s.patches.patch(request, { deadlineMs: 2, signal: queuedSignal }));
    await assert.rejects(s.patches.patch(request), { code: 'QUEUE_FULL' });
    s.host.advance(2); assert.equal(s.host.runNext({ timersOnly: true }), true); assert.equal((await queued).error.code, 'DEADLINE_EXCEEDED');
    s.host.advance(3); assert.equal(s.host.runNext({ timersOnly: true }), true); s.host.runReady(); assert.equal((await active).error.code, 'DEADLINE_EXCEEDED'); assert.equal(s.owner.root, root); released(s, queuedSignal);
    const signal = new FakeSignal(), pending = observe(s.patches.patch(request, { signal })); const dispose = s.engine.dispose();
    assert.equal((await pending).error.code, 'DISPOSED'); await dispose; assert.equal(s.owner.root, undefined); released(s, signal);
    await assert.rejects(s.patches.patch(request), { code: 'DISPOSED' });
  } finally { await s.engine.dispose(); }
});

test('composition and replacement share one complete work cap and never initialize participants again', async t => {
  let initializations = 0, preparations = 0;
  const source = createSourceProvider({ fields: ['title', 'body'] });
  const addon = { ...source, participant: { ...source.participant, initialize(...args) { initializations++; return source.participant.initialize(...args); }, *prepare(...args) { preparations++; return yield* source.participant.prepare(...args); } } };
  const metrics = { workUnits: 0, steps: 0, hostYields: 0, maxTaskWorkUnits: 0, maxStepWorkUnits: 0, checks: 0, phaseChecks: {} }, s = setup({ addons: [addon], metrics });
  let fullWork;
  try { await s.run('add', record); const before = metrics.workUnits; await s.patch(); fullWork = metrics.workUnits - before; assert.equal(initializations, 1); assert.equal(preparations, 2); released(s); } finally { await s.engine.dispose(); }
  // Same fixture threshold: replacement-only work fits, complete patch work does not.
  const limited = setup({ limits: { maxMutationWorkUnits: fullWork - 1 } });
  try { await limited.run('add', record); const root = limited.owner.root; await assert.rejects(limited.patch(), { code: 'WORK_LIMIT_EXCEEDED' }); assert.equal(limited.owner.root, root); assert.equal((await limited.run('replace', { ...record, text: { title: 'red apple', body: ['blue fruit'] } })).revision, 2); released(limited); } finally { await limited.engine.dispose(); }
  t.diagnostic(JSON.stringify({ fullPatchYieldedWorkUnits: fullWork, failingCompleteCap: fullWork - 1, participantInitializations: initializations, scope: 'Logical yielded work; no heap or copy peak claim' }));
});

test('participant preparation failure closes the cursor and leaves all old roots reusable', async () => {
  let fail = true, closed = 0;
  const source = createSourceProvider({ fields: ['title', 'body'] });
  const addon = { ...source, participant: { ...source.participant, *prepare(previous, context) { try { if (context.kind === 'replace' && fail) { yield { workUnits: 1 }; throw Error('private source failure'); } return yield* source.participant.prepare(previous, context); } finally { closed++; } } } };
  const s = setup({ addons: [addon] });
  try { await s.run('add', record); const root = s.owner.root; await assert.rejects(s.patch(), { code: 'INTERNAL_ERROR' }); assert.equal(s.owner.root, root); assert.equal(closed, 2); fail = false; await s.patch(); assert.equal(s.owner.root.revision, 2); assert.equal(closed, 3); released(s); } finally { await s.engine.dispose(); }
});

test('reentrant stop during replacement preparation wins before publication', async () => {
  const signal = new FakeSignal(); let disposing, engine;
  const source = createSourceProvider({ fields: ['title', 'body'] });
  const addon = { ...source, participant: { ...source.participant, *prepare(previous, context) { const value = yield* source.participant.prepare(previous, context); if (context.kind === 'replace') { signal.stop(false); disposing = engine.dispose(); } return value; } } };
  const s = setup({ addons: [addon] }); engine = s.engine;
  await s.run('add', record); const pending = observe(s.patches.patch(request, { signal })); s.host.runReady();
  assert.equal((await pending).error.code, 'DISPOSED'); await disposing; assert.equal(s.owner.root, undefined); released(s, signal);
});

test('100/1000/10000-record patches prepare only one record through the incremental path', async t => {
  const rows = [];
  for (const count of [100, 1000, 10000]) {
    const seen = [], source = createSourceProvider({ fields: ['title', 'body'] });
    const addon = { ...source, participant: { ...source.participant, *prepare(previous, context) { if (context.kind === 'replace') seen.push({ records: context.records.length, removedIds: context.removedIds.length, previousRevision: context.previousRevision }); return yield* source.participant.prepare(previous, context); } } };
    const metrics = { workUnits: 0, steps: 0, hostYields: 0, maxTaskWorkUnits: 0, maxStepWorkUnits: 0, checks: 0, phaseChecks: {} }, s = setup({ addons: [addon], metrics, limits: { checkpointWorkUnits: 1024 } });
    try {
      for (let start = 0; start < count; start += 100) await s.run('addMany', Array.from({ length: Math.min(100, count - start) }, (_, index) => ({ id: 'r' + (start + index), text: { title: 'red item', body: 'old content' }, metadata: { rank: start + index } })));
      const root = s.owner.root, work = metrics.workUnits, steps = metrics.steps, yields = metrics.hostYields;
      const unchanged = root.documents.buckets;
      await s.patch({ id: 'r0', expectedRevision: root.revision, set: { text: { body: 'blue content' } } });
      assert.deepEqual(seen, [{ records: 1, removedIds: 0, previousRevision: root.revision }]);
      assert.equal(s.owner.root.counts.documents, count);
      let sharedBuckets = 0; for (const [key, value] of Object.entries(unchanged)) if (s.owner.root.documents.buckets[key] === value) sharedBuckets++;
      assert.ok(sharedBuckets > 0);
      rows.push({ records: count, replacementRecords: seen[0].records, patchWorkUnits: metrics.workUnits - work, patchSteps: metrics.steps - steps, patchHostYields: metrics.hostYields - yields, unchangedDocumentBuckets: sharedBuckets });
      assert.equal((await s.run('search', 'blue', { limit: 0 })).total, 1); released(s);
    } finally { await s.engine.dispose(); }
  }
  t.diagnostic(JSON.stringify({ rows, scope: 'Actual patch-only logical work and immutable bucket sharing; not wall time, allocation peaks or constant update cost.' }));
});
