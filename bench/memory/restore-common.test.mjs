import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeAllocationProfile, observedMaximum, witnessRoot, witnessReading, collectorControl, aggregateRestoreOutcome, classifyRestoreError } from './restore-common.mjs';
import { runBoundedChild } from './restore-child.mjs';

const profile = () => ({ head: { id: 1, selfSize: 0, callFrame: { url: '' }, children: [
  { id: 2, selfSize: 64, callFrame: { url: 'file:///installed/dist/restore.js' }, children: [] },
  { id: 3, selfSize: 16, callFrame: { url: 'file:///observer/entry.js' }, children: [] },
] }, samples: [{ nodeId: 2, size: 32, ordinal: 1 }, { nodeId: 2, size: 32, ordinal: 3 }, { nodeId: 3, size: 16, ordinal: 2 }] });
test('sampling summary preserves literal statistical quantities and source groups without peak/retained labels', () => {
  const result = summarizeAllocationProfile(profile(), 'file:///installed/', 'file:///observer/');
  assert.deepEqual([result.nodes, result.samples, result.reportedNodeSelfSizeSumBytes, result.reportedSampleSizeSumBytes], [3, 3, 80, 80]);
  assert.equal(result.frameGroups['installed-production-frame'].reportedNodeSelfSizeSumBytes, 64);
  assert.equal(result.frameGroups['observer-frame'].reportedNodeSelfSizeSumBytes, 16); assert.match(result.meaning, /Neither exact allocated bytes/);
});
test('malformed/cyclic/duplicate sampling trees and invalid allocation references fail explicitly', () => {
  for (const mutate of [row => row.head.children.push(row.head), row => { row.head.children[1].id = 2; }, row => { row.head.selfSize = -1; },
    row => { row.samples[0].nodeId = 999; }, row => { row.samples[1].ordinal = 1; }, row => { row.samples[0].size = NaN; }]) {
    const changed = profile(); mutate(changed); assert.throws(() => summarizeAllocationProfile(changed, 'file:///installed/', 'file:///observer/'), assert.AssertionError);
  }
});
test('observed maxima select only the measured operation and preserve absent observations as null', () => {
  const bytes = value => ({ rss: value, heapTotal: value + 1, heapUsed: value - 1, external: 1, arrayBuffers: 0 });
  const result = observedMaximum([{ operation: 'baseline', bytes: bytes(999) }, { operation: 'restore', bytes: bytes(10) }, { operation: 'restore', bytes: bytes(20) }], 'restore');
  assert.deepEqual(result.maximaBytes, { rss: 20, heapTotal: 21, heapUsed: 19, external: 1, arrayBuffers: 0 }); assert.equal(result.readings, 2);
  assert.equal(observedMaximum([], 'restore').maximaBytes.heapUsed, null); assert.match(result.meaning, /lower bounds/);
});
test('root witnesses contain WeakRefs and primitive labels; returned readings hold no target objects', () => {
  const root = { documents: {}, fields: {}, participants: {} }, probes = witnessRoot(root, 'literal');
  assert.ok(probes.every(row => row.reference instanceof WeakRef)); assert.equal(probes[0].reference.deref(), root);
  assert.deepEqual(witnessReading(probes).map(row => row.collected), [false, false, false, false]);
  assert.throws(() => witnessRoot({ documents: 1, fields: {}, participants: {} }, 'malformed'), /Object witness/);
  const control = collectorControl(); assert.equal(control.isHeld(), true); control.release(); assert.equal(control.isHeld(), false);
});
test('owned-child watchdog preserves successful, refused, missing executable and timeout outcomes', async () => {
  const successful = await runBoundedChild(process.execPath, ['-e', 'process.stderr.write("literal");'], { env: {} }, { timeoutMs: 2000 });
  assert.equal(successful.childExitCode, 0); assert.equal(successful.stderr, 'literal'); assert.equal(successful.childTimedOut, false); assert.ok(Number.isInteger(successful.childPid));
  const refused = await runBoundedChild(process.execPath, ['-e', 'process.exitCode=7'], { env: {} }, { timeoutMs: 2000 });
  assert.equal(refused.childExitCode, 7); assert.equal(refused.childSignal, null); assert.notEqual(refused.childPid, successful.childPid);
  const missing = await runBoundedChild('/definitely-missing-rx4002-observer', [], { env: {} }, { timeoutMs: 2000 });
  assert.equal(missing.spawnFailure.code, 'ENOENT'); assert.equal(missing.childTimedOut, false);
  // Node startup under concurrent CI load can exceed 100ms. Give this fixture
  // the same startup allowance as the other children and prove its handler ran.
  const timeout = await runBoundedChild(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});process.stderr.write("ready");setInterval(()=>{},1000)'], { env: {} }, { timeoutMs: 2000, killGraceMs: 30 });
  assert.equal(timeout.stderr, 'ready', 'the signal-resistant fixture initialized before its watchdog fired');
  assert.equal(timeout.childTimedOut, true); assert.equal(timeout.childExitCode, null); assert.equal(timeout.childSignal, 'SIGKILL');
  assert.equal(timeout.terminationAttempted, true); assert.equal(timeout.killAttempted, true); assert.ok(timeout.childWallMs < 5000);
});
test('preparation failure is never hidden by unrun receivers; typed refusal remains explicit limitation', () => {
  const pass = () => ({ outcome: 'Pass' }), notRun = () => ({ outcome: 'Not Run' });
  assert.equal(aggregateRestoreOutcome([pass(), pass()], Array.from({ length: 6 }, pass)), 'Pass');
  assert.equal(aggregateRestoreOutcome([{ outcome: 'Fail' }, pass()], [...Array.from({ length: 3 }, notRun), ...Array.from({ length: 3 }, pass)]), 'Fail');
  assert.equal(aggregateRestoreOutcome([{ outcome: 'RejectedOutcome' }, pass()], [...Array.from({ length: 3 }, notRun), ...Array.from({ length: 3 }, pass)]), 'ObservedWithLimitations');
  assert.equal(aggregateRestoreOutcome([], []), 'ObservedWithLimitations');
  assert.equal(aggregateRestoreOutcome([pass(), pass()], [{ outcome: 'Fail' }]), 'Fail');
});
test('unchanged ordinary and encoded bounds remain refusals while malformed/profile/integrity failures do not', () => {
  for (const code of ['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED', 'RESOURCE_EXHAUSTED', 'LIMIT_EXCEEDED']) assert.equal(classifyRestoreError({ name: 'RaveldexError', code }), 'RejectedOutcome');
  assert.equal(classifyRestoreError({ name: 'SnapshotAdapterError', code: 'LIMIT_EXCEEDED', reason: 'ENCODED_LIMIT_EXCEEDED' }), 'RejectedOutcome');
  for (const reason of ['MALFORMED_SNAPSHOT', 'UNQUALIFIED_PROFILE', 'PROFILE_MISMATCH', 'INTEGRITY_MISMATCH', 'INVALID_NATIVE_STATE']) assert.equal(classifyRestoreError({ name: 'SnapshotAdapterError', code: 'INCOMPATIBLE_CAPABILITY', reason }), 'Fail');
  assert.equal(classifyRestoreError({ name: 'Error', code: 'LIMIT_EXCEEDED' }), 'Fail'); assert.equal(classifyRestoreError(null), 'Fail');
});
