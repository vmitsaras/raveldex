import test from 'node:test';
import assert from 'node:assert/strict';
import { directHost } from '../../dist/core/execution/host.js';
import { ExecutionOwner, emptyRoot } from '../../dist/core/execution/engine.js';
import { captureConfiguration } from '../../dist/core/contracts/schema.js';
import { FakeSignal } from '../fixtures/execution/host.mjs';

const record = id => ({ id, text: { body: 'common red '.repeat(8) } });
const outcome = promise => promise.then(value => ({ value }), error => ({ error }));
function capturedGlobals(values, call) {
  const descriptors = new Map(Object.keys(values).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  try {
    for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    return call();
  } finally {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}
function ownerFor(host) {
  const configuration = captureConfiguration({ schema: { text: { body: {} } }, limits: { checkpointWorkUnits: 1, maxQueuedOperations: 1 } });
  const root = emptyRoot(configuration);
  return { owner: new ExecutionOwner(root, host), root };
}

// This surface controls delivery order while using the real directHost dispatch,
// cancellation and eighth-continuation timer implementation, not a replacement
// ExecutionHost.continuation implementation.
class CapturedSurface {
  time = 0;
  serial = 0;
  immediate = new Map();
  timers = new Map();
  history = [];
  delivered = [];
  host;
  constructor() {
    const enqueue = (kind, callback, delayMs = 0) => {
      const task = { id: ++this.serial, kind, callback, delayMs, due: this.time + delayMs };
      (kind === 'immediate' ? this.immediate : this.timers).set(task.id, task);
      this.history.push(task); return task.id;
    };
    this.host = capturedGlobals({
      performance: { now: () => this.time },
      setImmediate: callback => enqueue('immediate', callback), clearImmediate: id => this.immediate.delete(id),
      setTimeout: (callback, delayMs) => enqueue('timer', callback, delayMs), clearTimeout: id => this.timers.delete(id),
    }, () => directHost());
  }
  run(task) {
    assert.ok(task, 'expected a captured task');
    const map = task.kind === 'immediate' ? this.immediate : this.timers;
    assert.equal(map.delete(task.id), true, 'task is still owned');
    assert.ok(task.due <= this.time, 'task is ready');
    this.delivered.push({ kind: task.kind, delayMs: task.delayMs }); task.callback();
  }
  firstImmediate() { return this.immediate.values().next().value; }
  flush(maximum = 100_000) {
    let count = 0;
    for (;;) {
      const task = this.firstImmediate() ?? [...this.timers.values()].find(task => task.due <= this.time);
      if (!task) return;
      assert.ok(++count <= maximum, 'bounded captured work must settle'); this.run(task);
    }
  }
  clean() { assert.equal(this.immediate.size, 0); assert.equal(this.timers.size, 0); }
}

for (const delivery of ['queued-stop-first', 'continuation-first']) {
  for (const terminal of ['abort-first', 'deadline-first']) {
    test(`captured direct host eighth timer composes with queued ${terminal}, ${delivery}, slot recovery and stale callbacks`, async () => {
      const surface = new CapturedSurface(), { owner, root } = ownerFor(surface.host);
      const active = outcome(owner.add(record('active'), { deadlineMs: 100 }));
      const signal = new FakeSignal();
      const queued = outcome(owner.add(record('must-not-publish'), { deadlineMs: 5, signal }));
      assert.equal(owner.root, root);
      // The first yield was already scheduled by add(). Seven fast callbacks
      // must schedule the eighth continuation on the captured timer source.
      for (let count = 0; count < 7; count++) surface.run(surface.firstImmediate());
      assert.equal(surface.immediate.size, 0);
      const resume = [...surface.timers.values()].find(task => task.delayMs === 0);
      const queuedDeadline = [...surface.timers.values()].find(task => task.delayMs === 5);
      assert.ok(resume && queuedDeadline); assert.equal(owner.root, root);
      const stale = [resume.callback, queuedDeadline.callback];
      surface.time = 5;
      if (delivery === 'continuation-first') surface.run(resume);
      if (terminal === 'abort-first') signal.stop();
      else { surface.run(queuedDeadline); signal.stop(); }
      const stopped = await queued;
      assert.equal(stopped.error.code, terminal === 'abort-first' ? 'CANCELLED' : 'DEADLINE_EXCEEDED');
      assert.equal(signal.listenerCount, 0);
      // Expiry/abort must free the single waiting slot before the active write
      // commits. A stale timer cannot re-settle that outcome or consume the slot.
      const following = outcome(owner.search('common', { deadlineMs: 100 }));
      assert.equal(owner.root, root);
      surface.flush();
      assert.equal((await active).value.revision, 1);
      const read = (await following).value;
      assert.equal(read.revision, 1); assert.equal(read.total, 1);
      assert.deepEqual(read.hits.map(hit => hit.id), ['active']);
      const published = owner.root;
      for (const callback of stale) callback();
      surface.flush(); assert.equal(owner.root, published); surface.clean();
      await owner.dispose(); assert.equal(owner.root, undefined); surface.clean();
      for (const callback of stale) callback();
      surface.clean(); assert.equal(owner.root, undefined);
    });
  }
}

test('actual Node captured handles traverse eighth timer turns, abort suspended work and recover without stranded ownership', { timeout: 10_000 }, async t => {
  const native = { setImmediate, clearImmediate, setTimeout, clearTimeout };
  const pending = new Map(), history = [], events = [];
  const enqueue = (kind, callback, delayMs = 0) => {
    let handle;
    const invoke = () => { pending.delete(handle); events.push(kind === 'timer' && delayMs === 0 ? 'zero-timer' : kind); callback(); };
    handle = kind === 'immediate' ? native.setImmediate(invoke) : native.setTimeout(invoke, delayMs);
    pending.set(handle, { kind, delayMs }); history.push({ kind, delayMs, callback }); return handle;
  };
  const host = capturedGlobals({
    setImmediate: callback => enqueue('immediate', callback),
    clearImmediate: handle => { pending.delete(handle); native.clearImmediate(handle); },
    setTimeout: (callback, delayMs) => enqueue('timer', callback, delayMs),
    clearTimeout: handle => { pending.delete(handle); native.clearTimeout(handle); },
  }, () => directHost());
  const { owner, root } = ownerFor(host);
  try {
    const marker = new Promise(resolve => native.setTimeout(() => { events.push('external-timer'); resolve(); }, 0));
    const write = outcome(owner.add(record('native'), { deadlineMs: 60_000 }));
    const read = outcome(owner.search('common', { deadlineMs: 60_000 }));
    await Promise.resolve(); assert.equal(owner.root, root, 'native continuation does not run as a microtask');
    assert.equal((await write).value.revision, 1); assert.equal((await read).value.total, 1); await marker;
    assert.ok(history.some(task => task.kind === 'timer' && task.delayMs === 0), 'real direct host exercised a periodic timer continuation');
    assert.equal(pending.size, 0);
    const published = owner.root, signal = new FakeSignal(), before = history.length;
    const cancelled = outcome(owner.add(record('cancelled'), { signal, deadlineMs: 60_000 }));
    const stale = history.slice(before).map(task => task.callback);
    assert.ok(stale.length >= 2, 'active deadline and continuation were observed');
    signal.stop(); assert.equal((await cancelled).error.code, 'CANCELLED');
    assert.equal(signal.listenerCount, 0); assert.equal(pending.size, 0); assert.equal(owner.root, published);
    for (const callback of stale) callback();
    assert.equal(owner.root, published); assert.equal(pending.size, 0);
    assert.equal((await owner.add(record('recovered'), { deadlineMs: 60_000 })).revision, 2);
    assert.equal((await owner.search('common')).total, 2); assert.equal(pending.size, 0);
    for (const callback of stale) callback();
    assert.equal(owner.root.revision, 2); assert.equal(pending.size, 0);
    t.diagnostic(JSON.stringify({ kind: 'rx9002-actual-node-continuation-observation', node: process.version,
      observedTaskSources: [...new Set(events)], externalTimerBeforeFirstContinuation: events.indexOf('external-timer') < events.indexOf('immediate'),
      nativeContinuationCallbacks: events.filter(kind => kind === 'immediate' || kind === 'zero-timer').length,
      zeroTimerCallbacks: events.filter(kind => kind === 'zero-timer').length,
      handlesAfterSettlement: pending.size, signalListenersAfterAbort: signal.listenerCount,
      scope: 'Finite actual Node task/ownership observation; no latency, universal fairness, retained/peak heap or platform transfer claim.' }));
  } finally { await owner.dispose(); assert.equal(owner.root, undefined); assert.equal(pending.size, 0); }
});
