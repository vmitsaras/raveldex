import assert from 'node:assert/strict';

export const RESTORE_METHOD = Object.freeze({ version: 'rx4002-native-receiving-restore-memory-v1', sizes: [1000, 10000], repetitions: 3,
  batchSize: 256, deadlineMs: 60000, pollIntervalMs: 5, samplingIntervalBytes: 32768, stackDepth: 128, gcCycles: 3, settleMs: 25 });

export function classifyRestoreError(error) {
  return error?.name === 'RaveldexError' && ['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED', 'RESOURCE_EXHAUSTED', 'LIMIT_EXCEEDED'].includes(error.code) ||
    error?.name === 'SnapshotAdapterError' && error.code === 'LIMIT_EXCEEDED' && error.reason === 'ENCODED_LIMIT_EXCEEDED' ? 'RejectedOutcome' : 'Fail';
}

export async function sourceRuntime(schema) {
  const snapshots = await import('@vmitsaras/raveldex/adapters/snapshots');
  const phrases = await import('@vmitsaras/raveldex/addons/phrases');
  const qualification = { profileId: 'raveldex-rx4002-memory-local-node-v1', scope: 'exact-node-runtime',
    environment: snapshots.currentNodeSnapshotEnvironment(), evidence: ['docs/evaluation/RX-4002-memory-method.md', 'docs/evidence/RX-3002.md'] };
  const engine = snapshots.createSnapshotRaveldex({ schema, addons: [phrases.createSourceProvider({ fields: ['body'] }), phrases.createSourcePhrases({ fields: ['body'] })] }, { nativeQualification: qualification });
  return { engine, snapshots: snapshots.createSnapshots(engine), qualification };
}

export function witnessRoot(root, label) {
  assert.ok(root && typeof root === 'object');
  return ['root', 'documents', 'fields', 'participants'].map(component => {
    const value = component === 'root' ? root : root[component];
    assert.ok(value && typeof value === 'object', `Object witness required: ${component}`);
    return { label, component, reference: new WeakRef(value) };
  });
}
export function witnessReading(witnesses) {
  // Return booleans only. Never hold a dereferenced target across an await/GC.
  return witnesses.map(({ label, component, reference }) => ({ label, component, collected: reference.deref() === undefined }));
}
export function collectorControl() {
  let held = { purpose: 'known-strong-positive-control' };
  const weak = new WeakRef(held);
  return { weak, isHeld: () => held !== undefined && weak.deref() === held, release: () => { held = undefined; } };
}
export function summarizeAllocationProfile(profile, productionPrefix, observerPrefix) {
  assert.ok(profile && profile.head && Array.isArray(profile.samples), 'Sampling profile head/samples required');
  const stack = [profile.head], ids = new Set(), groups = {}, finiteInteger = value => Number.isSafeInteger(value) && value >= 0;
  let nodes = 0, reportedNodeSelfSizeSumBytes = 0;
  while (stack.length) {
    const node = stack.pop(); assert.ok(node && finiteInteger(node.id) && !ids.has(node.id), 'Invalid/duplicate sampling node'); ids.add(node.id);
    assert.ok(finiteInteger(node.selfSize) && node.callFrame && typeof node.callFrame.url === 'string', 'Invalid sampling node size/frame');
    assert.ok(node.children === undefined || Array.isArray(node.children), 'Invalid sampling children');
    const url = node.callFrame.url, group = url.startsWith(productionPrefix) ? 'installed-production-frame' : url.startsWith(observerPrefix) ? 'observer-frame' : 'runtime-or-unattributed-frame';
    const row = groups[group] ??= { nodes: 0, reportedNodeSelfSizeSumBytes: 0 }; row.nodes++; row.reportedNodeSelfSizeSumBytes += node.selfSize;
    nodes++; reportedNodeSelfSizeSumBytes += node.selfSize; assert.ok(finiteInteger(reportedNodeSelfSizeSumBytes), 'Unsafe profile size sum');
    stack.push(...(node.children ?? []));
  }
  const ordinals = new Set(); let reportedSampleSizeSumBytes = 0;
  for (const sample of profile.samples) {
    assert.ok(sample && ids.has(sample.nodeId) && finiteInteger(sample.size) && finiteInteger(sample.ordinal) && !ordinals.has(sample.ordinal), 'Invalid sampling allocation sample');
    ordinals.add(sample.ordinal); reportedSampleSizeSumBytes += sample.size;
    assert.ok(finiteInteger(reportedSampleSizeSumBytes), 'Unsafe sample size sum');
  }
  return { nodes, samples: profile.samples.length, reportedNodeSelfSizeSumBytes, reportedSampleSizeSumBytes, frameGroups: groups,
    meaning: 'Raw statistical sampling-profiler quantities, including observer/runtime allocations. Neither exact allocated bytes, retained bytes, nor a simultaneous allocation peak. URL frame groups describe the recorded allocating frame, not exclusive component ownership.' };
}
export function observedMaximum(samples, phase) {
  const rows = samples.filter(row => row.operation === phase);
  const keys = ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'];
  return { readings: rows.length, maximaBytes: Object.fromEntries(keys.map(key => [key, rows.length ? Math.max(...rows.map(row => row.bytes[key])) : null])),
    meaning: 'Observed maxima across before/after and event-loop polls for this operation in the complete instrumented receiving process; lower bounds on transient high-water, never isolated decode/staging/peak allocations.' };
}
export function aggregateRestoreOutcome(preparations, observations) {
  if ([...preparations, ...observations].some(row => row.outcome === 'Fail')) return 'Fail';
  return preparations.length === RESTORE_METHOD.sizes.length && observations.length === RESTORE_METHOD.sizes.length * RESTORE_METHOD.repetitions &&
    [...preparations, ...observations].every(row => row.outcome === 'Pass') ? 'Pass' : 'ObservedWithLimitations';
}
