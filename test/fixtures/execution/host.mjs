import assert from 'node:assert/strict';

/** Deterministic host: callbacks never run during schedule, and time is separate
 * from callback delivery so tests can model delayed host tasks explicitly. */
export class FakeHost {
  time = 0;
  sequence = 0;
  tasks = new Map();
  history = [];
  executed = 0;
  cancelled = 0;

  now() { return this.time; }
  schedule(callback, delayMs) {
    assert.equal(typeof callback, 'function');
    assert.ok(Number.isFinite(delayMs) && delayMs >= 0);
    const id = ++this.sequence;
    const task = { id, due: this.time + delayMs, delayMs, callback };
    this.tasks.set(id, task);
    this.history.push({ id, due: task.due, delayMs });
    return () => { if (this.tasks.delete(id)) this.cancelled++; };
  }
  get pending() { return this.tasks.size; }
  get pendingResumes() { return [...this.tasks.values()].filter(task => task.delayMs === 0).length; }
  get pendingTimers() { return [...this.tasks.values()].filter(task => task.delayMs > 0).length; }
  advance(ms) {
    assert.ok(Number.isFinite(ms) && ms >= 0);
    this.time += ms;
  }
  runNext({ timersOnly = false } = {}) {
    const task = [...this.tasks.values()]
      .filter(entry => entry.due <= this.time && (!timersOnly || entry.delayMs > 0))
      .sort((a, b) => a.due - b.due || a.id - b.id)[0];
    if (!task) return false;
    this.tasks.delete(task.id);
    this.executed++;
    task.callback();
    return true;
  }
  runReady(maximum = 100_000) {
    let ran = 0;
    while (this.runNext()) {
      assert.ok(++ran <= maximum, 'execution did not reach a safe terminal state');
    }
    return ran;
  }
  callbacks() { return [...this.tasks.values()].map(task => task.callback); }
}

/** Structural signal with observable listener ownership. A silent stop models
 * an abort whose event delivery has not happened before an owned checkpoint. */
export class FakeSignal {
  #aborted = false;
  listeners = new Map();
  addCalls = 0;
  removeCalls = 0;
  get aborted() { return this.#aborted; }
  get listenerCount() { return this.listeners.size; }
  addEventListener(type, listener, options = {}) {
    assert.equal(type, 'abort');
    this.addCalls++;
    this.listeners.set(listener, Boolean(options.once));
  }
  removeEventListener(type, listener) {
    assert.equal(type, 'abort');
    this.removeCalls++;
    this.listeners.delete(listener);
  }
  stop(deliver = true) {
    if (this.#aborted) return;
    this.#aborted = true;
    if (deliver) for (const [listener, once] of [...this.listeners]) {
      if (once) this.listeners.delete(listener);
      listener();
    }
  }
}
