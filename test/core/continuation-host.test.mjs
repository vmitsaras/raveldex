import test from 'node:test';
import assert from 'node:assert/strict';
import { directHost } from '../../dist/core/execution/host.js';
import { ExecutionOwner, emptyRoot, createRaveldex } from '../../dist/core/execution/engine.js';
import { captureConfiguration } from '../../dist/core/contracts/schema.js';
import { FakeHost, FakeSignal } from '../fixtures/execution/host.mjs';

const schema = { text: { body: {} } };
const record = (id, body = 'common red') => ({ id, text: { body } });
const outcome = promise => promise.then(value => ({ value }), error => ({ error }));
function fixture(host = new DualHost(), limits = { checkpointWorkUnits: 1 }, participants = []) {
  const configuration = captureConfiguration({ schema, limits });
  const states = Object.freeze(Object.fromEntries(participants.map(item => [item.id, Object.freeze({})])));
  const root = emptyRoot(configuration, states);
  return { host, root, owner: new ExecutionOwner(root, host, participants) };
}
class DualHost extends FakeHost {
  continuations = new Map();
  continuationCalls = 0;
  disposeCalls = 0;
  continuation(callback) {
    const id = ++this.sequence; this.continuationCalls++;
    this.continuations.set(id, callback);
    return () => this.continuations.delete(id);
  }
  runContinuation() {
    const entry = this.continuations.entries().next().value;
    if (!entry) return false;
    this.continuations.delete(entry[0]); entry[1](); return true;
  }
  flush(maximum = 100_000) {
    let ran = 0;
    while (this.runContinuation()) assert.ok(++ran <= maximum, 'continuations did not terminate');
  }
  dispose() { this.disposeCalls++; }
}
function clean(host, ...signals) {
  assert.equal(host.tasks.size, 0); assert.equal(host.continuations.size, 0);
  for (const signal of signals) assert.equal(signal.listenerCount, 0);
}
function globals(values, call) {
  const descriptors = new Map(Object.keys(values).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  try {
    for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    return call();
  } finally {
    for (const [name, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  }
}
function surface() {
  let serial = 0;
  const timers = new Map(), messages = [], channels = [];
  class Port {
    onmessage = null;
    closed = false;
    peer;
    postMessage(data) { messages.push({ port: this.peer, data, listener: this.peer.onmessage }); }
    start() {}
    close() { this.closed = true; this.onmessage = null; }
  }
  class Channel {
    constructor() {
      this.port1 = new Port(); this.port2 = new Port();
      this.port1.peer = this.port2; this.port2.peer = this.port1; channels.push(this);
    }
  }
  return { timers, messages, channels, Channel,
    setTimeout(callback, delayMs) { const id = ++serial; timers.set(id, { callback, delayMs }); return id; },
    clearTimeout(id) { timers.delete(id); },
    runMessage() {
      const entry = messages.shift(); if (!entry) return false;
      if (!entry.port.closed) entry.port.onmessage?.({ data: entry.data }); return true;
    },
    drainMessages(maximum = 1000) {
      let count = 0;
      while (messages.length) {
        assert.ok(++count <= maximum, 'message tasks did not terminate');
        const { port, data } = messages.shift(); if (!port.closed) port.onmessage?.({ data });
      }
    },
    drainTimers() {
      for (const [id, task] of [...timers]) { if (!timers.delete(id)) continue; task.callback(); }
    },
  };
}

// These are task opportunities, not a bound on physical scheduling duration.
test('real Node continuations run after microtasks and allow a previously registered timer to progress', async () => {
  const host = directHost();
  try {
    assert.equal(typeof host.continuation, 'function');
    let called = false;
    const task = new Promise(resolve => host.continuation(() => { called = true; resolve(); }));
    assert.equal(called, false); await Promise.resolve(); assert.equal(called, false); await task;
    let timer = false, calls = 0;
    const fired = new Promise(resolve => setTimeout(() => { timer = true; resolve(); }, 0));
    await new Promise((resolve, reject) => {
      const next = () => {
        if (timer) { resolve(); return; }
        if (++calls > 10_000) { reject(new Error('host timer starved by continuation chain')); return; }
        host.continuation(next);
      };
      host.continuation(next);
    });
    await fired; assert.ok(calls > 0);
  } finally { host.dispose?.(); }
});

test('timer-only fallback captures handles, remains asynchronous and cancels exact owned work', t => {
  const fake = surface();
  const host = globals({ setImmediate: undefined, clearImmediate: undefined, MessageChannel: undefined, scheduler: undefined,
    setTimeout: fake.setTimeout, clearTimeout: fake.clearTimeout }, () => directHost());
  t.after(() => host.dispose?.());
  let resumes = 0, deadlines = 0;
  const cancel = host.continuation(() => resumes++);
  host.schedule(() => deadlines++, 17);
  assert.equal(resumes + deadlines, 0);
  assert.deepEqual([...fake.timers.values()].map(task => task.delayMs).sort((a,b)=>a-b), [0, 17]);
  cancel(); cancel(); fake.drainTimers(); assert.equal(resumes, 0); assert.equal(deadlines, 1);
  host.dispose?.(); assert.equal(fake.timers.size, 0);
});

test('browser-like message continuations suppress cancelled/stale messages and release both ports on disposal', t => {
  const fake = surface();
  const host = globals({ setImmediate: undefined, clearImmediate: undefined, scheduler: undefined, MessageChannel: fake.Channel,
    setTimeout: fake.setTimeout, clearTimeout: fake.clearTimeout }, () => directHost());
  t.after(() => host.dispose?.());
  const called = [];
  const cancelled = host.continuation(() => called.push('cancelled'));
  assert.equal(called.length, 0); assert.ok(fake.channels.length > 0);
  const stale = fake.messages.map(message => () => message.listener?.({ data: message.data }));
  cancelled(); host.continuation(() => called.push('current'));
  assert.equal(fake.runMessage(), true); assert.deepEqual(called, [], 'cancelled message cannot execute a newer continuation');
  fake.drainMessages(); fake.drainTimers();
  assert.deepEqual(called, ['current']);
  host.continuation(() => called.push('after-dispose'));
  host.dispose?.(); fake.drainMessages(); fake.drainTimers();
  for (const callback of stale) callback();
  assert.deepEqual(called, ['current']);
  assert.ok(fake.channels.every(channel => channel.port1.closed && channel.port2.closed));
});

test('message cleanup failures still close the second port and preserve the callback outcome', t => {
  const fake = surface(), cleanupError = new Error('listener removal failed'), firstCloseError = new Error('first port close failed');
  let removals = 0, firstCloses = 0, secondCloses = 0;
  class FaultyChannel extends fake.Channel {
    constructor() {
      super();
      let listener = null;
      Object.defineProperty(this.port1, 'onmessage', { configurable: true,
        get() { return listener; },
        set(value) {
          if (value === null) { removals++; throw cleanupError; }
          listener = value;
        },
      });
      this.port1.close = () => { firstCloses++; throw firstCloseError; };
      const second = this.port2, closeSecond = second.close.bind(second);
      second.close = () => { secondCloses++; closeSecond(); };
    }
  }
  const host = globals({ setImmediate: undefined, clearImmediate: undefined, scheduler: undefined, MessageChannel: FaultyChannel,
    setTimeout: fake.setTimeout, clearTimeout: fake.clearTimeout }, () => directHost());
  t.after(() => host.dispose?.());
  let called = 0;
  host.continuation(() => called++);
  const stale = fake.messages[0];
  assert.doesNotThrow(() => fake.runMessage());
  assert.equal(called, 1); assert.equal(removals, 1); assert.equal(firstCloses, 1); assert.equal(secondCloses, 1);
  assert.equal(fake.channels[0].port2.closed, true);
  const original = new Error('actual callback failure');
  host.continuation(() => { called++; throw original; });
  assert.doesNotThrow(() => stale.listener({ data: stale.data }));
  assert.equal(called, 1, 'stale channel ownership must be invalidated despite throwing cleanup');
  assert.throws(() => fake.runMessage(), error => error === original);
  assert.equal(called, 2); assert.equal(removals, 2); assert.equal(firstCloses, 2); assert.equal(secondCloses, 2);
  assert.equal(fake.channels[1].port2.closed, true);
  assert.doesNotThrow(() => host.dispose?.());
});

test('failed message listener installation closes both partial ports and executes timer fallback once', t => {
  const fake = surface(), setupError = new Error('message listener unavailable');
  let firstCloses = 0, secondCloses = 0, listenerWrites = 0;
  class RejectListenerChannel extends fake.Channel {
    constructor() {
      super();
      const first = this.port1, second = this.port2;
      Object.defineProperty(first, 'onmessage', { configurable: true,
        get() { return null; },
        set() { listenerWrites++; throw setupError; },
      });
      first.close = () => { firstCloses++; first.closed = true; };
      const closeSecond = second.close.bind(second);
      second.close = () => { secondCloses++; closeSecond(); };
    }
  }
  const host = globals({ setImmediate: undefined, clearImmediate: undefined, scheduler: undefined, MessageChannel: RejectListenerChannel,
    setTimeout: fake.setTimeout, clearTimeout: fake.clearTimeout }, () => directHost());
  t.after(() => host.dispose?.());
  let called = 0;
  assert.doesNotThrow(() => host.continuation(() => called++));
  assert.equal(called, 0); assert.equal(fake.channels.length, 1); assert.equal(fake.messages.length, 0);
  assert.equal(listenerWrites, 2, 'listener installation and cleanup were attempted');
  assert.equal(firstCloses, 1); assert.equal(secondCloses, 1);
  assert.ok(fake.channels.every(channel => channel.port1.closed && channel.port2.closed));
  assert.deepEqual([...fake.timers.values()].map(row => row.delayMs), [0]);
  fake.drainTimers(); fake.drainTimers(); assert.equal(called, 1); assert.equal(fake.timers.size, 0);
  host.dispose?.(); assert.equal(firstCloses, 1); assert.equal(secondCloses, 1);
});

test('engine resumes use the captured continuation seam while deadlines and legacy hosts retain timer semantics', async () => {
  const { owner, host } = fixture();
  const added = outcome(owner.add(record('a', 'common '.repeat(20))));
  assert.equal(host.continuations.size, 1);
  assert.ok(host.history.every(task => task.delayMs > 0), 'continuations must not be deadline timers');
  // Replacing a trusted host's methods after construction must not swap code.
  host.continuation = host.schedule = host.dispose = () => { throw new Error('late handle replacement'); };
  host.flush(); assert.equal((await added).value.revision, 1);
  const searched = outcome(owner.search('common')); host.flush(); assert.equal((await searched).value.total, 1);
  await owner.dispose(); assert.equal(host.disposeCalls, 1); clean(host);
  const legacy = new FakeHost(), other = fixture(legacy);
  const pending = outcome(other.owner.add(record('legacy'))); legacy.runReady(); assert.equal((await pending).value.revision, 1);
  assert.ok(legacy.history.some(task => task.delayMs === 0)); await other.owner.dispose(); assert.equal(legacy.pending, 0);
});

test('abort, deadline and disposal retire active/queued continuation handles without allowing stale publication', async () => {
  for (const reason of ['abort', 'deadline', 'dispose']) {
    const { owner, host, root } = fixture();
    const signal = new FakeSignal(), active = outcome(owner.add(record('a', 'common '.repeat(30)), { signal, deadlineMs: 5 }));
    const queuedSignal = new FakeSignal(), queued = outcome(owner.search('common', { signal: queuedSignal, deadlineMs: 5 }));
    const stale = [...host.continuations.values()];
    if (reason === 'abort') { signal.stop(); queuedSignal.stop(); }
    else if (reason === 'deadline') { host.advance(5); while (host.runNext({ timersOnly: true })); }
    else await owner.dispose();
    host.flush();
    const expected = { abort: 'CANCELLED', deadline: 'DEADLINE_EXCEEDED', dispose: 'DISPOSED' }[reason];
    assert.equal((await active).error.code, expected); assert.equal((await queued).error.code, expected);
    assert.equal(owner.root, reason === 'dispose' ? undefined : root); clean(host, signal, queuedSignal);
    for (const callback of stale) callback();
    assert.equal(owner.root, reason === 'dispose' ? undefined : root); clean(host, signal, queuedSignal);
    if (reason !== 'dispose') {
      const recovered = outcome(owner.add(record('later'))); host.flush(); assert.equal((await recovered).value.revision, 1);
      await owner.dispose();
    }
    assert.equal(host.disposeCalls, 1);
  }
});

test('continuation scheduling failures reject atomically and later FIFO work can recover', async () => {
  class Failing extends DualHost {
    fail = true;
    continuation(callback) { if (this.fail) throw new Error('host continuation failure'); return super.continuation(callback); }
  }
  const host = new Failing(), { owner, root } = fixture(host);
  const failed = await outcome(owner.add(record('first')));
  assert.equal(failed.error.code, 'INTERNAL_ERROR'); assert.equal(owner.root, root); clean(host);
  host.fail = false;
  const write = outcome(owner.add(record('later'))), read = outcome(owner.search('common'));
  host.flush(); assert.equal((await write).value.revision, 1); assert.equal((await read).value.revision, 1);
  assert.equal((await read).value.total, 1); await owner.dispose(); clean(host);
});

test('deadline cleanup reentry cannot revoke an already committed response', async () => {
  class Reentrant extends DualHost {
    onTimerCancel;
    schedule(callback, delayMs) {
      const cancel = super.schedule(callback, delayMs);
      return () => { cancel(); this.onTimerCancel?.(); };
    }
  }
  const host = new Reentrant(), { owner } = fixture(host);
  const signal = new FakeSignal(); let injected = false, disposal;
  host.onTimerCancel = () => {
    if (owner.root?.revision === 1 && !injected) {
      injected = true; signal.stop(); disposal = owner.dispose();
    }
  };
  const first = outcome(owner.add(record('first'), { signal }));
  host.flush(); assert.equal(injected, true);
  assert.deepEqual((await first).value, { revision: 1, changed: true, added: 1, replaced: 0, removed: 0 });
  await disposal; assert.equal(owner.root, undefined); assert.equal(host.disposeCalls, 1); clean(host, signal);
});
