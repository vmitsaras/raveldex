import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

export const BROWSER_MEMORY_METHOD = Object.freeze({ version: 'rx4002-browser-isolates-v1', sizes: [1000, 10000], repetitions: 3,
  sampling: { samplingInterval: 32768, stackDepth: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true },
  pollDelayMs: 10, gcCycles: 3, settleMs: 25 });

// Playwright exposes public CDP sessions for pages, but not dedicated workers.
// Use CDP's documented nested-session transport, without private Playwright APIs.
export function nestedSession(parent, sessionId, timeoutMs = 60000) {
  let nextId = 0, closed = false;
  const pending = new Map();
  const message = event => {
    if (event.sessionId !== sessionId) return;
    const reply = JSON.parse(event.message), slot = pending.get(reply.id);
    if (!slot) return;
    pending.delete(reply.id); clearTimeout(slot.timer);
    if (reply.error) slot.reject(Error(JSON.stringify(reply.error))); else slot.resolve(reply.result);
  };
  const close = () => {
    if (closed) return; closed = true;
    parent.off('Target.receivedMessageFromTarget', message); parent.off('Target.detachedFromTarget', detached);
    for (const slot of pending.values()) { clearTimeout(slot.timer); slot.reject(Error('Worker CDP session closed')); }
    pending.clear();
  };
  const detached = event => { if (event.sessionId === sessionId) close(); };
  parent.on('Target.receivedMessageFromTarget', message); parent.on('Target.detachedFromTarget', detached);
  return { close, send(method, params = {}) {
    if (closed) return Promise.reject(Error('Worker CDP session closed'));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(Error(`Worker CDP timeout: ${method}`)); }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      parent.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(error => {
        const slot = pending.get(id); if (slot) { pending.delete(id); clearTimeout(timer); reject(error); }
      });
    });
  } };
}

export function validateHeapUsage(value) {
  for (const key of ['usedSize', 'totalSize', 'embedderHeapUsedSize', 'backingStorageSize']) assert.ok(Number.isFinite(value[key]) && value[key] >= 0, `Invalid heap field ${key}`);
  return value;
}
export async function heapReading(session, realm, stage) {
  const requestStartedMs = performance.now(), bytes = validateHeapUsage(await session.send('Runtime.getHeapUsage'));
  return { realm, stage, requestStartedMs, responseReceivedMs: performance.now(), bytes };
}
export function maximaByRealm(readings) {
  return ['main', 'worker'].map(realm => {
    const rows = readings.filter(row => row.realm === realm); assert.ok(rows.length);
    return { realm, readings: rows.length, maximaBytes: Object.fromEntries(Object.keys(rows[0].bytes).map(key => [key, Math.max(...rows.map(row => row.bytes[key]))])) };
  });
}

export function samplingTotals(profile) {
  assert.ok(profile?.head && Array.isArray(profile.samples), 'Sampling tree/samples required');
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const ids = new Set(), ordinals = new Set(), stack = [profile.head];
  let nodeSelfSizeSumBytes = 0, sampleSizeSumBytes = 0, unresolvedSampleSizeSumBytes = 0;
  const unresolvedSamples = [];
  while (stack.length) {
    const node = stack.pop();
    assert.ok(integer(node.id) && !ids.has(node.id) && integer(node.selfSize) && typeof node.callFrame?.url === 'string', 'Invalid sampling tree node');
    ids.add(node.id); nodeSelfSizeSumBytes += node.selfSize;
    assert.ok(node.children === undefined || Array.isArray(node.children)); stack.push(...(node.children ?? []));
  }
  for (const sample of profile.samples) {
    assert.ok(integer(sample.nodeId) && integer(sample.size) && integer(sample.ordinal) && !ordinals.has(sample.ordinal), 'Invalid sampling row');
    ordinals.add(sample.ordinal); sampleSizeSumBytes += sample.size;
    // An actual Chrome collected-object profile contained a sample for a node
    // absent from its returned tree. Preserve it; never invent allocating frames.
    if (!ids.has(sample.nodeId)) { unresolvedSamples.push(sample); unresolvedSampleSizeSumBytes += sample.size; }
  }
  for (const value of [nodeSelfSizeSumBytes, sampleSizeSumBytes, unresolvedSampleSizeSumBytes]) assert.ok(integer(value));
  return { treeNodes: ids.size, samples: profile.samples.length, reportedNodeSelfSizeSumBytes: nodeSelfSizeSumBytes,
    reportedSampleSizeSumBytes: sampleSizeSumBytes, unresolvedSamples, unresolvedSampleSizeSumBytes,
    meaning: 'Raw statistical profiler quantities, not exact allocations, retained bytes or simultaneous peak. Unresolved sample nodes remain explicit; no per-frame or component ownership is assigned.' };
}
