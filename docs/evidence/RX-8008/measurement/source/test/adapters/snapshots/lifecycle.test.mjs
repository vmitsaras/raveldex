import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaveldex } from '../../../dist/index.js';
import { createSnapshots, currentNodeSnapshotEnvironment, SnapshotAdapterError } from '../../../dist/adapters/snapshots/index.js';
import { createQualifiedSnapshotEngine } from '../../../dist/adapters/snapshots/snapshots.js';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { createOwnedRaveldex, getExecutionOwner, facadeFromExecutionOwner, emptyRoot, ExecutionOwner } from '../../../dist/core/execution/engine.js';
import { initializeParticipants } from '../../../dist/core/capabilities/participants.js';
import { FakeHost, FakeSignal } from '../../fixtures/execution/host.mjs';
import { schema, records } from '../../fixtures/snapshots/records.mjs';
import { addonsFor } from './semantics.mjs';
import { createSourceProvider } from '../../../dist/addons/phrases/source.js';
import { alter } from '../../fixtures/snapshots/integrity.mjs';

function setup(limits = {}, metrics) {
  const host = new FakeHost(), engine = createOwnedRaveldex(captureConfiguration({ schema, addons: addonsFor('source'), limits: { checkpointWorkUnits: 1, ...limits } }), host, metrics);
  return { host, engine, owner: getExecutionOwner(engine), snapshots: createSnapshots(engine),
    async call(method, ...args) { const result = engine[method](...args); host.runReady(); return result; },
    async snapshot(method, ...args) { const result = this.snapshots[method](...args); host.runReady(); return result; },
  };
}
const observe = promise => promise.then(value => ({ value }), error => ({ error }));
function released(fixture, ...signals) { assert.equal(fixture.host.pending, 0); for (const signal of signals) assert.equal(signal.listenerCount, 0); }
function setupNative(kind = 'source') {
  const host = new FakeHost(), metrics = { workUnits: 0, steps: 0, hostYields: 0, maxTaskWorkUnits: 0, maxStepWorkUnits: 0, checks: 0, phaseChecks: {} };
  const qualification = { profileId: 'rx-3002-test-declared-lifecycle', scope: 'exact-node-runtime', environment: currentNodeSnapshotEnvironment(), evidence: ['test/adapters/snapshots/lifecycle.test.mjs: declared matching-host contract fixture only'] };
  const engine = createQualifiedSnapshotEngine({ schema, addons: addonsFor(kind, true), limits: { checkpointWorkUnits: 1 } }, qualification, host, metrics);
  return { host, engine, metrics, owner: getExecutionOwner(engine), snapshots: createSnapshots(engine),
    async call(method, ...args) { const result = engine[method](...args); host.runReady(); return result; },
    async snapshot(method, ...args) { const result = this.snapshots[method](...args); host.runReady(); return result; },
  };
}

test('snapshot calls share ordinary FIFO, read execution-start roots and own admitted strings/options', async () => {
  const donor = setup(), target = setup();
  try {
    const added = donor.engine.addMany(records), exporting = donor.snapshots.exportSource(), later = donor.engine.add({ id: 'later', text: { title: 'later-only' } });
    donor.host.runReady(); await added; const encoded = await exporting; await later;
    assert.equal(JSON.parse(encoded).body.header.originRevision, 1);
    assert.equal(JSON.parse(encoded).body.payload.records.some(record => record.id === 'later'), false);
    const blocker = target.engine.add({ id: 'old', text: { title: 'old '.repeat(40) } });
    let callerSnapshot = encoded;
    const options = { deadlineMs: 100 }, restoring = target.snapshots.restore(callerSnapshot, options), read = target.engine.search('red');
    callerSnapshot = 'malformed replacement'; options.deadlineMs = 1;
    target.host.advance(2); target.host.runReady(); await blocker;
    assert.equal((await restoring).revision, 2);
    const result = await read; assert.equal(result.revision, 2); assert.equal(result.total, 3);
    assert.equal((await target.call('search', 'old')).total, 0);
    released(donor); released(target);
  } finally { await donor.engine.dispose(); await target.engine.dispose(); }
});

test('snapshot encode/decode/staging cancellation at multiple suspensions preserves exact old core and participant roots', async t => {
  const donor = setup(); let cancellations = 0;
  try {
    await donor.call('addMany', records); const encoded = await donor.snapshot('exportSource');
    for (const method of ['exportSource', 'restore']) {
      for (const resumes of [0, 1, 32, 256, 1024]) {
        const target = setup();
        try {
          await target.call('add', { id: 'old', text: { title: 'old-state' } });
          const baseline = target.owner.root, signal = new FakeSignal();
          const result = observe(method === 'restore' ? target.snapshots.restore(encoded, { signal }) : target.snapshots.exportSource({ signal }));
          for (let index = 0; index < resumes; index++) assert.equal(target.host.runNext(), true, `operation completed before suspension ${resumes}`);
          signal.stop();
          const observed = await result; assert.equal(observed.error?.code, 'CANCELLED');
          assert.equal(target.owner.root, baseline, 'no new root or participant publication after cancellation');
          assert.equal((await target.call('search', 'old-state')).total, 1); released(target, signal); cancellations++;
          await target.snapshot('restore', encoded);
          assert.equal((await target.call('search', 'red')).total, 3); released(target);
        } finally { await target.engine.dispose(); }
      }
    }
    t.diagnostic(JSON.stringify({ controlledSuspensionCancellations: cancellations }));
  } finally { await donor.engine.dispose(); }
});

test('queued deadlines, aborts and overflow release slots while successful restore advances exactly once', async () => {
  const donor = setup({ maxQueuedOperations: 1 }), target = setup({ maxQueuedOperations: 1 });
  try {
    await donor.call('addMany', records); const encoded = await donor.snapshot('exportSource');
    const active = target.engine.add({ id: 'old', text: { title: 'old '.repeat(40) } }, { deadlineMs: 100 });
    const signal = new FakeSignal(), queued = observe(target.snapshots.restore(encoded, { signal, deadlineMs: 5 }));
    await assert.rejects(target.snapshots.exportSource(), { code: 'QUEUE_FULL' });
    target.host.advance(5); assert.equal(target.host.runNext({ timersOnly: true }), true);
    assert.equal((await queued).error.code, 'DEADLINE_EXCEEDED'); assert.equal(signal.listenerCount, 0);
    const restore = target.snapshots.restore(encoded); target.host.runReady(); await active;
    assert.equal((await restore).revision, 2); released(target, signal);
    const before = target.owner.root, activeAgain = target.engine.search({ kind: 'all' });
    const abort = new FakeSignal(), stopped = observe(target.snapshots.restore(encoded, { signal: abort }));
    abort.stop(); assert.equal((await stopped).error.code, 'CANCELLED'); target.host.runReady(); await activeAgain;
    assert.equal(target.owner.root, before); released(target, abort);
  } finally { await donor.engine.dispose(); await target.engine.dispose(); }
});

test('active deadlines, work caps and encoded byte caps fail honestly without side-state publication', async () => {
  const donor = setup(), target = setup();
  try {
    await donor.call('addMany', records); const encoded = await donor.snapshot('exportSource');
    await target.call('add', { id: 'old', text: { title: 'old-state' } });
    const root = target.owner.root, deadline = observe(target.snapshots.restore(encoded, { deadlineMs: 1 }));
    target.host.advance(1); target.host.runReady();
    assert.equal((await deadline).error.code, 'DEADLINE_EXCEEDED'); assert.equal(target.owner.root, root); released(target);
    const capped = createSnapshots(target.engine, { maxEncodedBytes: 1024 });
    for (const call of [() => capped.exportSource(), () => capped.restore(encoded)]) {
      const result = observe(call()); target.host.runReady();
      const error = (await result).error; assert.ok(error instanceof SnapshotAdapterError); assert.equal(error.reason, 'ENCODED_LIMIT_EXCEEDED');
      assert.equal(target.owner.root, root); released(target);
    }
    const work = setup({ maxMutationWorkUnits: 200 });
    try {
      const empty = work.owner.root, result = observe(work.snapshots.exportSource()); work.host.runReady();
      assert.equal((await result).error.code, 'WORK_LIMIT_EXCEEDED'); assert.equal(work.owner.root, empty); released(work);
    } finally { await work.engine.dispose(); }
  } finally { await donor.engine.dispose(); await target.engine.dispose(); }
});

test('early stop and disposal skip untrusted snapshot/options access and release pending adapter work', async () => {
  const target = setup(); let inspections = 0;
  const malicious = new Proxy({}, { ownKeys() { inspections++; throw Error('inspected'); }, getPrototypeOf() { inspections++; throw Error('inspected'); } });
  try {
    const signal = new FakeSignal(); signal.stop();
    await assert.rejects(target.snapshots.restore(malicious, { signal }), { code: 'CANCELLED' });
    assert.equal(inspections, 0); released(target, signal);
    const active = observe(target.snapshots.exportSource()), queued = observe(target.snapshots.restore('irrelevant'));
    const disposal = target.engine.dispose(); assert.equal(target.engine.dispose(), disposal); await disposal;
    assert.equal((await active).error.code, 'DISPOSED'); assert.equal((await queued).error.code, 'DISPOSED');
    assert.equal(target.owner.root, undefined); released(target);
    await assert.rejects(target.snapshots.restore(malicious, malicious), { code: 'DISPOSED' });
    assert.equal(inspections, 0);
  } finally { await target.engine.dispose(); }
  const foreign = { search() {}, add() {}, addMany() {}, replace() {}, remove() {}, clear() {}, dispose() {} };
  assert.throws(() => createSnapshots(foreign), error => error instanceof SnapshotAdapterError && error.reason === 'UNSUPPORTED_ENGINE');
});

test('successful empty restore is a new local revision even when both origin and target are empty', async () => {
  const donor = createRaveldex({ schema, addons: addonsFor('source') }), target = createRaveldex({ schema, addons: addonsFor('source') });
  try {
    const encoded = await createSnapshots(donor).exportSource();
    const result = await createSnapshots(target).restore(encoded);
    assert.equal(result.originRevision, 0); assert.equal(result.revision, 1);
    assert.equal((await target.search({ kind: 'all' })).revision, 1);
    const second = await createSnapshots(target).restore(encoded); assert.equal(second.revision, 2);
  } finally { await donor.dispose(); await target.dispose(); }
});

test('genuinely qualified native encode and restore cancellation preserve exact old roots and permit recovery', async t => {
  const donor = setupNative('mixed'); let cancellations = 0;
  try {
    await donor.call('addMany', records); const encoded = await donor.snapshot('exportNative');
    for (const method of ['exportNative', 'restore']) {
      for (const resumes of [0, 1, 32, 256, 1024]) {
        const target = setupNative('mixed');
        try {
          await target.call('add', { id: 'old', text: { title: 'old-state' } });
          const baseline = target.owner.root, signal = new FakeSignal();
          const pending = observe(method === 'restore' ? target.snapshots.restore(encoded, { signal }) : target.snapshots.exportNative({ signal }));
          for (let index = 0; index < resumes; index++) assert.equal(target.host.runNext(), true);
          signal.stop(); assert.equal((await pending).error?.code, 'CANCELLED');
          assert.equal(target.owner.root, baseline); released(target, signal);
          const result = await target.snapshot('restore', encoded); assert.equal(result.revision, 2);
          assert.equal((await target.call('search', 'red')).total, 3); released(target); cancellations++;
        } finally { await target.engine.dispose(); }
      }
    }
    t.diagnostic(JSON.stringify({ qualifiedNativeSuspensionCancellations: cancellations }));
  } finally { await donor.engine.dispose(); }
});

test('source and native final-precommit stops roll back, and no signal read after publication can revoke success', async () => {
  for (const format of ['Source', 'Native']) {
    const donor = setupNative(), target = setupNative();
    try {
      await donor.call('addMany', records); await target.call('add', { id: 'old', text: { title: 'old-state' } });
      const encoded = await donor.snapshot(`export${format}`), baseline = target.owner.root;
      target.metrics.phaseChecks = {};
      const precommitSignal = new FakeSignal();
      Object.defineProperty(precommitSignal, 'aborted', { get() { return Boolean(target.metrics.phaseChecks['snapshot.precommit']); } });
      const stopped = observe(target.snapshots.restore(encoded, { signal: precommitSignal })); target.host.runReady();
      assert.equal((await stopped).error?.code, 'CANCELLED'); assert.equal(target.owner.root, baseline); released(target, precommitSignal);
      let postcommitReads = 0;
      const postcommitSignal = new FakeSignal();
      Object.defineProperty(postcommitSignal, 'aborted', { get() { if (target.owner.root !== baseline) { postcommitReads++; return true; } return false; } });
      const result = await target.snapshot('restore', encoded, { signal: postcommitSignal });
      assert.equal(result.revision, 2); assert.equal(postcommitReads, 0, 'there is no new live signal read after root publication');
      assert.equal((await target.call('search', 'red')).total, 3); released(target, postcommitSignal);
    } finally { await donor.engine.dispose(); await target.engine.dispose(); }
  }
});

test('whole source restore accumulates generic participant work across private batches and preserves old state on a late failure', async t => {
  // A spread registration deliberately keeps the public compatibility route:
  // copied codec/handle declarations do not convey first-party bulk identity.
  const source = { ...createSourceProvider({ fields: ['title', 'body'], maxWorkUnits: 4000 }) };
  const host = new FakeHost(), configuration = captureConfiguration({ schema, limits: { checkpointWorkUnits: 1, maxMutationBatch: 2 }, addons: [source] });
  const donor = createOwnedRaveldex(configuration, host), targetHost = new FakeHost(), target = createOwnedRaveldex(configuration, targetHost);
  const owner = getExecutionOwner(target), donorSnapshots = createSnapshots(donor), targetSnapshots = createSnapshots(target);
  try {
    const ids = [];
    for (let index = 0; ids.length < 100; index++) {
      const id = `c${index}`;
      let hash = 2166136261;
      for (let point = 0; point < id.length; point++) hash = Math.imul(hash ^ id.charCodeAt(point), 16777619);
      if ((hash >>> 0) % 256 === 7) ids.push(id);
    }
    for (const id of ids) { const added = donor.add({ id, text: { title: 'red' } }); host.runReady(); await added; }
    const exporting = donorSnapshots.exportSource(); host.runReady(); const encoded = await exporting;
    const old = target.add({ id: 'old', text: { title: 'old-state' } }); targetHost.runReady(); await old;
    const baseline = owner.root, failed = observe(targetSnapshots.restore(encoded)); targetHost.runReady();
    assert.equal((await failed).error?.code, 'WORK_LIMIT_EXCEEDED', 'participant budget belongs to the full restore, not one staged add');
    assert.equal(owner.root, baseline);
    const read = target.search('old-state'); targetHost.runReady(); assert.equal((await read).total, 1);
    assert.equal(targetHost.pending, 0);
    // A small valid payload can contain more records than one live mutation
    // batch; each is staged privately and visible publication remains once.
    const selected = alter(encoded, envelope => { envelope.body.payload.records = envelope.body.payload.records.slice(0, 3); });
    const restored = targetSnapshots.restore(selected); targetHost.runReady(); const result = await restored;
    assert.equal(result.revision, 2); assert.equal(result.originRevision, 100);
    const all = target.search({ kind: 'all' }); targetHost.runReady(); assert.equal((await all).total, 3);
    const validRoot = owner.root;
    const malformed = alter(selected, envelope => { envelope.body.payload.records.at(-1).metadata.active = 'malformed-boolean'; });
    const invalid = observe(targetSnapshots.restore(malformed)); targetHost.runReady();
    assert.equal((await invalid).error?.reason, 'INVALID_NATIVE_STATE'); assert.equal(owner.root, validRoot); assert.equal(targetHost.pending, 0);
    t.diagnostic(JSON.stringify({ individuallyAdmittedDonorWrites: ids.length, wholeRestoreParticipantWorkCap: 4000, validSnapshotPrivateRecordsBeyondMutationBatch: 3 }));
  } finally { await donor.dispose(); await target.dispose(); }
});

test('qualified native decoding, integrity and structural validation phases can each stop without publication', async t => {
  const donor = setupNative('mixed'); const stoppedPhases = [];
  try {
    await donor.call('addMany', records); const encoded = await donor.snapshot('exportNative');
    for (const phase of ['snapshot.decode', 'snapshot.integrity', 'snapshot.validation']) {
      const target = setupNative('mixed');
      try {
        await target.call('add', { id: 'old', text: { title: 'old-state' } });
        const baseline = target.owner.root; target.metrics.phaseChecks = {};
        let readsAfterPhase = 0;
        const signal = new FakeSignal();
        Object.defineProperty(signal, 'aborted', { get() { return Boolean(target.metrics.phaseChecks[phase]) && ++readsAfterPhase >= 8; } });
        const pending = observe(target.snapshots.restore(encoded, { signal })); target.host.runReady();
        assert.equal((await pending).error?.code, 'CANCELLED'); assert.equal(readsAfterPhase, 8);
        assert.equal(target.owner.root, baseline); released(target, signal);
        stoppedPhases.push({ phase, postBoundarySignalChecks: readsAfterPhase });
      } finally { await target.engine.dispose(); }
    }
    t.diagnostic(JSON.stringify({ qualifiedNativePhaseStops: stoppedPhases }));
  } finally { await donor.engine.dispose(); }
});

test('a genuine maximum-revision native owner rejects source restore and preserves its actual immutable root', async () => {
  const donor = setup(), host = new FakeHost();
  const configuration = captureConfiguration({ schema, addons: addonsFor('source'), limits: { checkpointWorkUnits: 1 } });
  const installed = initializeParticipants(configuration);
  const states = Object.freeze(Object.fromEntries(Object.entries(installed.states).map(([id, state]) => [id, Object.freeze({ ...state, revision: Number.MAX_SAFE_INTEGER })])));
  const maximumRoot = Object.freeze({ ...emptyRoot(configuration, states), revision: Number.MAX_SAFE_INTEGER });
  const owner = new ExecutionOwner(maximumRoot, host, installed.participants), engine = facadeFromExecutionOwner(owner);
  try {
    await donor.call('addMany', records); const encoded = await donor.snapshot('exportSource');
    const restore = observe(createSnapshots(engine).restore(encoded)); host.runReady();
    assert.equal((await restore).error?.code, 'REVISION_EXHAUSTED'); assert.equal(owner.root, maximumRoot);
    const read = engine.search({ kind: 'all' }); host.runReady(); const result = await read;
    assert.equal(result.revision, Number.MAX_SAFE_INTEGER); assert.equal(result.total, 0); assert.equal(host.pending, 0);
    // Root construction is a trusted private fixture; no claim of 9e15 actual
    // public calls or snapshot origin revision resetting is made.
  } finally { await donor.engine.dispose(); await engine.dispose(); }
});

test('complete UTF-8 envelope byte boundary includes multibyte source and all header/checksum overhead', async () => {
  const donor = setup(), target = setup();
  try {
    await donor.call('addMany', records); const encoded = await donor.snapshot('exportSource');
    const bytes = Buffer.byteLength(encoded, 'utf8'); assert.ok(bytes > encoded.length);
    const exact = createSnapshots(donor.engine, { maxEncodedBytes: bytes });
    const exporting = exact.exportSource(); donor.host.runReady(); assert.equal(await exporting, encoded);
    const exactTarget = createSnapshots(target.engine, { maxEncodedBytes: bytes }), restoring = exactTarget.restore(encoded); target.host.runReady();
    assert.equal((await restoring).revision, 1);
    const baseline = target.owner.root, smaller = createSnapshots(target.engine, { maxEncodedBytes: bytes - 1 });
    const overflow = observe(smaller.restore(encoded)); target.host.runReady();
    assert.equal((await overflow).error?.reason, 'ENCODED_LIMIT_EXCEEDED'); assert.equal(target.owner.root, baseline); released(target);
    const exportOverflow = observe(createSnapshots(donor.engine, { maxEncodedBytes: bytes - 1 }).exportSource()); donor.host.runReady();
    assert.equal((await exportOverflow).error?.reason, 'ENCODED_LIMIT_EXCEEDED'); released(donor);
    for (const maximum of [1023, 64 * 1024 * 1024 + 1, 1.5, NaN, Infinity]) assert.throws(() => createSnapshots(target.engine, { maxEncodedBytes: maximum }), { code: 'INVALID_OPTIONS' });
  } finally { await donor.engine.dispose(); await target.engine.dispose(); }
});
