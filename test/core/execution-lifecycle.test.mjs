import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutionOwner, createRaveldex } from '../../dist/core/execution/engine.js';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { captureConfiguration } from '../../dist/core/contracts/schema.js';
import { directoryGet } from '../../dist/core/index/directory.js';
import { inspectIndex } from '../../dist/core/index/invariants.js';
import { executeSearch } from '../../dist/core/query/search.js';
import { MutationOwner } from '../../dist/core/mutations/owner.js';
import { RaveldexError } from '../../dist/core/errors/error.js';
import { FakeHost, FakeSignal } from '../fixtures/execution/host.mjs';

const schema = { text: { title: {} } };
const record = (id, title = 'common red') => ({ id, text: { title } });
const drain = iterator => {
  let units = 0;
  for (;;) {
    const step = iterator.next();
    if (step.done) return { value: step.value, units };
    units += step.value.workUnits;
  }
};
function build(records = [], limits = {}, selectedSchema = schema) {
  const construction = new IndexConstruction({ schema: selectedSchema });
  for (let i = 0; i < records.length; i += 256) drain(construction.append(records.slice(i, i + 256)));
  const root = drain(construction.finish()).value;
  // IndexConstruction's independent fixture budgets are excluded from the
  // operation under test. All changed limits are captured by the real contract.
  return Object.freeze({ ...root, configuration: captureConfiguration({ schema: selectedSchema, limits }) });
}
function fixture(records = [], limits = { checkpointWorkUnits: 1 }, selectedSchema = schema, participants = []) {
  let root = build(records, limits, selectedSchema);
  if (participants.length) root = Object.freeze({ ...root, participants: Object.freeze(Object.fromEntries(participants.map(p => [p.id, Object.freeze({})]))) });
  const host = new FakeHost(), owner = new ExecutionOwner(root, host, participants);
  return { owner, host, root };
}
function observe(promise) {
  assert.ok(promise instanceof Promise, 'operational calls return promises');
  const observation = { done: false, promise: undefined };
  observation.promise = promise.then(value => { observation.done = true; return { status: 'fulfilled', value }; }, error => { observation.done = true; return { status: 'rejected', error }; });
  return observation;
}
async function success(host, observation) {
  host.runReady();
  const outcome = await observation.promise;
  assert.equal(outcome.status, 'fulfilled', outcome.error?.stack);
  return outcome.value;
}
async function failure(observation, code) {
  const outcome = await observation.promise;
  assert.equal(outcome.status, 'rejected');
  assert.ok(outcome.error instanceof RaveldexError);
  assert.equal(outcome.error.code, code);
  assert.equal(outcome.error.message, `Raveldex: ${code}`);
  return outcome.error;
}
function clean(host, ...signals) {
  assert.equal(host.pending, 0, 'all owned deadline and continuation tasks are removed');
  for (const signal of signals) assert.equal(signal.listenerCount, 0, 'caller signal listener is removed');
}
function inspectingInput() {
  let inspected = 0;
  const input = new Proxy({}, {
    getPrototypeOf() { inspected++; throw new Error('caller input was inspected'); },
    ownKeys() { inspected++; throw new Error('caller input was inspected'); },
  });
  return { input, get inspected() { return inspected; } };
}

test('factory validation throws synchronously; ordinary operational failures reject promises', async () => {
  assert.throws(() => createRaveldex({ schema: { text: {} } }), error => error.code === 'INVALID_SCHEMA');
  assert.throws(() => createRaveldex({ schema, limits: { maxQueuedOperations: -1 } }), error => error.code === 'INVALID_OPTIONS');
  const engine = createRaveldex({ schema });
  let invalid;
  assert.doesNotThrow(() => { invalid = observe(engine.add({ id: 'bad', text: { unknown: 'text' } })); });
  await failure(invalid, 'INVALID_RECORD');
  assert.equal((await engine.add(record('valid'))).revision, 1);
  assert.equal((await engine.search('common')).total, 1);
  await engine.dispose();
});

test('every operation converts validation failures without changing state or running getters', async () => {
  const { owner, host, root } = fixture([record('a')]);
  let getterCalls = 0;
  const withGetter = { id: 'bad', text: {} };
  Object.defineProperty(withGetter, 'metadata', { enumerable: true, get() { getterCalls++; throw new Error('getter'); } });
  for (const [call, code] of [
    [() => owner.search({ kind: 'unknown' }), 'INVALID_QUERY'],
    [() => owner.search('common', { limit: -1 }), 'INVALID_OPTIONS'],
    [() => owner.add(withGetter), 'INVALID_RECORD'],
    [() => owner.addMany([record('b'), record('b')]), 'INVALID_RECORD'],
    [() => owner.replace({ id: 1, text: {} }), 'INVALID_RECORD'],
    [() => owner.remove(['a', 'a']), 'INVALID_OPTIONS'],
    [() => owner.clear({ deadlineMs: 0 }), 'INVALID_OPTIONS'],
  ]) {
    let observation;
    assert.doesNotThrow(() => { observation = observe(call()); });
    await failure(observation, code);
    assert.equal(owner.root, root);
    clean(host);
  }
  assert.equal(getterCalls, 0);
  assert.equal((await success(host, observe(owner.add(record('later'))))).revision, 1);
  drain(inspectIndex(owner.root));
});

test('already aborted and disposed calls skip caller data, queue slots and host handles', async () => {
  const { owner, host, root } = fixture();
  const signal = new FakeSignal(); signal.stop();
  const query = inspectingInput(), input = inspectingInput();
  await failure(observe(owner.search(query.input, { signal })), 'CANCELLED');
  await failure(observe(owner.add(input.input, { signal })), 'CANCELLED');
  assert.equal(query.inspected + input.inspected, 0);
  assert.equal(signal.addCalls, 0); clean(host, signal); assert.equal(owner.root, root);
  const disposal = owner.dispose();
  assert.equal(owner.dispose(), disposal); await disposal;
  const disposedData = inspectingInput(), disposedOptions = inspectingInput();
  for (const call of [
    () => owner.search(disposedData.input, disposedOptions.input), () => owner.add(disposedData.input, disposedOptions.input),
    () => owner.addMany(disposedData.input, disposedOptions.input), () => owner.replace(disposedData.input, disposedOptions.input),
    () => owner.remove(disposedData.input, disposedOptions.input), () => owner.clear(disposedOptions.input),
  ]) await failure(observe(call()), 'DISPOSED');
  assert.equal(disposedData.inspected + disposedOptions.inspected, 0);
  assert.equal(owner.root, undefined); clean(host);
});

test('search, batch and removal options share each call admission counter', async () => {
  const query = { kind: 'and', children: [{ kind: 'all' }, { kind: 'none' }] };
  const searchFixture = fixture([], { maxAdmissionEntries: 10, checkpointWorkUnits: 1 });
  assert.equal((await success(searchFixture.host, observe(searchFixture.owner.search(query, { offset: 0, limit: 1, deadlineMs: 50 })))).total, 0);
  const signal = new FakeSignal();
  const queryError = await failure(observe(searchFixture.owner.search(query, { offset: 0, limit: 1, deadlineMs: 50, signal })), 'LIMIT_EXCEEDED');
  assert.equal(queryError.details.limit, 10); assert.equal(queryError.details.actual, 11);
  clean(searchFixture.host, signal);
  const { owner, host } = fixture([], { maxAdmissionEntries: 14, checkpointWorkUnits: 1 });
  const records = Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, text: {} }));
  assert.equal((await success(host, observe(owner.addMany(records, { deadlineMs: 50 })))).added, 4);
  const error = await failure(observe(owner.addMany(records, { deadlineMs: 50, signal })), 'LIMIT_EXCEEDED');
  assert.equal(error.details.actual, 15);
  const ids = Array.from({ length: 12 }, (_, i) => `a${i}`);
  const removalError = await failure(observe(owner.remove(ids, { deadlineMs: 50, signal })), 'LIMIT_EXCEEDED');
  assert.equal(removalError.details.actual, 15);
  assert.equal((await success(host, observe(owner.remove(ids, { deadlineMs: 50 })))).removed, 4);
  clean(host, signal);
});

test('zero queue capacity still accepts an idle operation and rejects concurrent waiting calls', async () => {
  const { owner, host } = fixture([], { checkpointWorkUnits: 1, maxQueuedOperations: 0 });
  const signal = new FakeSignal(), add = observe(owner.add(record('a', 'word '.repeat(40)), { signal }));
  assert.equal(owner.root.revision, 0); assert.equal(host.pendingResumes, 1);
  await failure(observe(owner.search('word')), 'QUEUE_FULL');
  assert.equal((await success(host, add)).revision, 1); clean(host, signal);
  assert.equal((await success(host, observe(owner.search('word')))).total, 1); clean(host);
});

test('default queue keeps 32 FIFO waiters, rejects the 33rd and never supersedes a search', async () => {
  const { owner, host } = fixture();
  const first = observe(owner.add(record('a', 'word '.repeat(40))));
  const order = [], queued = [];
  for (let i = 0; i < 32; i++) {
    const observation = observe(owner.search('word').then(result => { order.push(i); return result; }));
    queued.push(observation);
  }
  await failure(observe(owner.search('word')), 'QUEUE_FULL');
  assert.equal(owner.root.revision, 0);
  assert.equal((await success(host, first)).revision, 1);
  for (const observation of queued) {
    const result = await success(host, observation);
    assert.equal(result.revision, 1); assert.equal(result.total, 1);
  }
  assert.deepEqual(order, Array.from({ length: 32 }, (_, i) => i)); clean(host);
});

test('FIFO selects revisions and conflicts at start; a failed operation preserves the next read', async () => {
  const { owner, host } = fixture();
  const operations = [
    observe(owner.add(record('a', 'first '.repeat(20)))), observe(owner.search('first')),
    observe(owner.add(record('a', 'duplicate'))), observe(owner.replace(record('a', 'second'))),
    observe(owner.search('second')), observe(owner.remove('a')), observe(owner.search({ kind: 'all' })),
  ];
  host.runReady();
  assert.equal((await operations[0].promise).value.revision, 1);
  assert.deepEqual((await operations[1].promise).value.hits.map(hit => hit.id), ['a']);
  assert.equal((await operations[1].promise).value.revision, 1);
  await failure(operations[2], 'ID_EXISTS');
  assert.equal((await operations[3].promise).value.revision, 2);
  assert.equal((await operations[4].promise).value.revision, 2);
  assert.deepEqual((await operations[4].promise).value.hits.map(hit => hit.id), ['a']);
  assert.equal((await operations[5].promise).value.revision, 3);
  assert.equal((await operations[6].promise).value.total, 0);
  assert.equal((await operations[6].promise).value.revision, 3); clean(host);
});

test('admission owns nested record/query/options and removal inputs before a queued call returns', async () => {
  const selectedSchema = { text: { title: {}, body: {} }, metadata: { tags: { type: 'string', multi: true } } };
  const { owner, host } = fixture([], { checkpointWorkUnits: 1 }, selectedSchema);
  const blocker = observe(owner.add({ id: 'blocker', text: { title: 'word '.repeat(40) } }));
  const input = { id: 'owned', text: { title: ['captured'], body: 'stable' }, metadata: { tags: ['original'] } };
  const batch = [input], addOptions = { deadlineMs: 100 }, added = observe(owner.addMany(batch, addOptions));
  const query = { kind: 'group', fields: ['title'], variants: [{ text: 'captured', match: 'exact' }] };
  const options = { limit: 1, offset: 0, deadlineMs: 100 }, searched = observe(owner.search(query, options));
  const originalTag = observe(owner.search({ kind: 'eq', field: 'tags', value: 'original' }));
  const laterTag = observe(owner.search({ kind: 'eq', field: 'tags', value: 'later' }));
  const ids = ['owned'], removed = observe(owner.remove(ids));
  input.id = 'changed'; input.text.title[0] = 'later'; input.text.body = 'later'; input.metadata.tags.push('later'); batch.length = 0;
  addOptions.deadlineMs = 1; query.fields[0] = 'body'; query.variants[0].text = 'later'; query.variants.push({ text: 'absent', match: 'exact' });
  options.limit = 0; options.deadlineMs = 1; ids[0] = 'blocker'; ids.push('changed');
  host.advance(2);
  assert.equal((await success(host, blocker)).revision, 1);
  assert.equal((await success(host, added)).revision, 2);
  const result = await success(host, searched);
  assert.equal(result.revision, 2); assert.deepEqual(result.hits.map(hit => hit.id), ['owned']);
  assert.equal((await success(host, originalTag)).total, 1);
  assert.equal((await success(host, laterTag)).total, 0);
  assert.equal((await success(host, removed)).removed, 1);
  assert.ok(directoryGet(owner.root.documents, 'blocker')); assert.equal(directoryGet(owner.root.documents, 'owned'), undefined);
  clean(host);
});

test('queued abort removes its listener/timer and immediately frees a bounded queue slot', async () => {
  const { owner, host } = fixture([], { checkpointWorkUnits: 1, maxQueuedOperations: 1 });
  const activeSignal = new FakeSignal(), queuedSignal = new FakeSignal();
  const active = observe(owner.add(record('a', 'word '.repeat(40)), { signal: activeSignal }));
  const cancelled = observe(owner.add(record('b'), { signal: queuedSignal }));
  await failure(observe(owner.search('word')), 'QUEUE_FULL');
  queuedSignal.stop(); await failure(cancelled, 'CANCELLED');
  assert.equal(queuedSignal.listenerCount, 0); assert.equal(host.pendingTimers, 1);
  const replacement = observe(owner.search('word'));
  assert.equal((await success(host, active)).revision, 1);
  assert.equal((await success(host, replacement)).total, 1);
  assert.equal(directoryGet(owner.root.documents, 'b'), undefined); clean(host, activeSignal, queuedSignal);
});

test('deadline starts at admission; an expired queue entry releases its slot before active work completes', async () => {
  const { owner, host } = fixture([], { checkpointWorkUnits: 1, maxQueuedOperations: 1 });
  const active = observe(owner.add(record('a', 'word '.repeat(40)), { deadlineMs: 100 }));
  const signal = new FakeSignal(), expired = observe(owner.add(record('b'), { signal, deadlineMs: 5 }));
  host.advance(5);
  assert.equal(host.runNext({ timersOnly: true }), true);
  await failure(expired, 'DEADLINE_EXCEEDED');
  assert.equal(owner.root.revision, 0); assert.equal(signal.listenerCount, 0); assert.equal(host.pendingTimers, 1);
  const next = observe(owner.search('word', { deadlineMs: 100 }));
  assert.equal((await success(host, active)).revision, 1);
  assert.equal((await success(host, next)).revision, 1); clean(host, signal);
});

test('delayed timer delivery cannot allow an expired operation to execute successfully', async () => {
  const { owner, host, root } = fixture();
  const observation = observe(owner.add(record('a', 'word '.repeat(40)), { deadlineMs: 5 }));
  host.advance(5); // Run the already due continuation before the timeout task.
  assert.equal(host.runNext(), true);
  await failure(observation, 'DEADLINE_EXCEEDED'); assert.equal(owner.root, root); clean(host);
  assert.equal((await success(host, observe(owner.add(record('later'))))).revision, 1);
});

test('silent queued abort is rechecked when its operation starts', async () => {
  const { owner, host } = fixture();
  const first = observe(owner.add(record('a', 'word '.repeat(40))));
  const signal = new FakeSignal(), cancelled = observe(owner.add(record('b'), { signal }));
  signal.stop(false);
  assert.equal(signal.listenerCount, 1);
  assert.equal((await success(host, first)).revision, 1);
  await failure(cancelled, 'CANCELLED');
  assert.equal(directoryGet(owner.root.documents, 'b'), undefined); clean(host, signal);
});

test('active search cancellation closes owned work at different host opportunities and preserves later recovery', async () => {
  const records = Array.from({ length: 60 }, (_, i) => record(`doc${String(i).padStart(3, '0')}`, `common red item${i}`));
  for (const tasksBeforeAbort of [0, 10, 100, 400]) {
    const { owner, host, root } = fixture(records);
    const signal = new FakeSignal(), search = observe(owner.search('common', { signal }));
    for (let i = 0; i < tasksBeforeAbort; i++) assert.equal(host.runNext(), true);
    assert.equal(owner.root, root); signal.stop(false); host.runReady();
    await failure(search, 'CANCELLED'); assert.equal(owner.root, root); clean(host, signal);
    const result = await success(host, observe(owner.search('common', { limit: 100 })));
    assert.equal(result.total, 60); assert.deepEqual(result.hits.map(hit => hit.id), records.map(input => input.id));
    clean(host);
  }
});

test('active mutation cancellation unwinds participant staging and keeps the previous coherent root', async () => {
  let entered = 0, cleaned = 0;
  const participant = { id: 'side', *prepare() {
    entered++;
    try { for (let i = 0; i < 20; i++) yield { workUnits: 1 }; return Object.freeze({ value: 'new' }); }
    finally { cleaned++; }
  } };
  const { owner, host, root } = fixture([], { checkpointWorkUnits: 1 }, schema, [participant]);
  const signal = new FakeSignal(), add = observe(owner.add(record('a'), { signal }));
  while (!entered) assert.equal(host.runNext(), true);
  assert.equal(owner.root, root); assert.equal(cleaned, 0);
  signal.stop(); await failure(add, 'CANCELLED');
  assert.equal(cleaned, 1); assert.equal(owner.root, root); clean(host, signal);
  assert.equal((await success(host, observe(owner.add(record('later'))))).revision, 1);
  assert.deepEqual(owner.root.participants.side, { value: 'new' }); assert.equal(cleaned, 2); clean(host);
});

test('no-op operations still perform final cancellation/deadline checks', async () => {
  for (const kind of ['clear', 'addMany', 'remove']) {
    for (const stop of ['abort', 'deadline']) {
      const { owner, host, root } = fixture();
      const signal = new FakeSignal(), options = { signal, deadlineMs: 5 };
      const observation = observe(kind === 'clear' ? owner.clear(options) : kind === 'addMany' ? owner.addMany([], options) : owner.remove([], options));
      assert.equal(host.pendingResumes, 1, 'one final no-op work step offers a host opportunity');
      if (stop === 'abort') signal.stop(false); else host.advance(5);
      host.runReady(); await failure(observation, stop === 'abort' ? 'CANCELLED' : 'DEADLINE_EXCEEDED');
      assert.equal(owner.root, root); clean(host, signal);
      assert.equal((await success(host, observe(owner.clear()))).changed, false); clean(host);
    }
  }
});

test('abort in participant finalization is observed before publication even below one whole work quantum', async () => {
  const signal = new FakeSignal();
  let finalized = 0;
  const participant = { id: 'side', *prepare() {
    yield { workUnits: 1 };
    finalized++; signal.stop(false);
    return Object.freeze({ value: 'unpublished' });
  } };
  const { owner, host, root } = fixture([], { checkpointWorkUnits: 2_048 }, schema, [participant]);
  const operation = observe(owner.add(record('a'), { signal }));
  await failure(operation, 'CANCELLED');
  assert.equal(finalized, 1); assert.equal(owner.root, root); assert.equal(host.executed, 0); clean(host, signal);
});

test('every precommit signal read preserves disposal and an observed abort event even if its getter returns false', async () => {
  class ReentrantSignal extends FakeSignal {
    reads = 0;
    registeredAt = undefined;
    at = undefined;
    trigger = undefined;
    get aborted() {
      this.reads++;
      if (this.reads === this.at) this.trigger();
      // A structural host handle can reenter before its return value becomes
      // visible. The engine must retain the stop it already observed.
      return false;
    }
    addEventListener(type, listener, options) {
      this.registeredAt = this.reads;
      super.addEventListener(type, listener, options);
    }
  }
  const baseline = fixture([], { checkpointWorkUnits: 2_048 }), baselineSignal = new ReentrantSignal();
  assert.equal((await success(baseline.host, observe(baseline.owner.add(record('a', 'red'), { signal: baselineSignal })))).revision, 1);
  const reads = baselineSignal.reads;
  assert.ok(reads > baselineSignal.registeredAt);
  clean(baseline.host, baselineSignal);
  await baseline.owner.dispose();
  for (let at = 1; at <= reads; at++) {
    const { owner, host } = fixture([], { checkpointWorkUnits: 2_048 }), signal = new ReentrantSignal();
    let disposal, triggered = 0;
    signal.at = at;
    signal.trigger = () => { triggered++; disposal = owner.dispose(); };
    const operation = observe(owner.add(record('a', 'red'), { signal }));
    host.runReady(); await failure(operation, 'DISPOSED'); await disposal;
    assert.equal(triggered, 1, `disposal injection reached signal read ${at}/${reads}`);
    assert.equal(owner.root, undefined); clean(host, signal);
  }
  // Before listener registration, a false getter with no delivered event
  // provides no observable abort. Sweep all reads where the event is owned.
  let eventCases = 0;
  for (let at = baselineSignal.registeredAt + 1; at <= reads; at++) {
    const { owner, host, root } = fixture([], { checkpointWorkUnits: 2_048 }), signal = new ReentrantSignal();
    let triggered = 0;
    signal.at = at;
    signal.trigger = () => { triggered++; signal.stop(); };
    const operation = observe(owner.add(record('a', 'red'), { signal }));
    host.runReady(); await failure(operation, 'CANCELLED');
    assert.equal(triggered, 1, `abort injection reached signal read ${at}/${reads}`);
    assert.equal(owner.root, root); clean(host, signal); eventCases++;
    assert.equal((await success(host, observe(owner.add(record('later'))))).revision, 1); clean(host);
  }
  assert.ok(eventCases > 0);
});

test('a committed response keeps its actual revision after late abort, a newer write and disposal', async () => {
  const { owner, host } = fixture([], { checkpointWorkUnits: 2_048 });
  const signal = new FakeSignal(), first = observe(owner.add(record('a'), { signal }));
  assert.equal(owner.root.revision, 1, 'mutation commits before caller promise observers run');
  signal.stop(); host.advance(60_000);
  const second = observe(owner.add(record('b')));
  assert.equal(owner.root.revision, 2);
  const disposal = owner.dispose();
  const result = (await first.promise).value;
  assert.deepEqual(result, { revision: 1, changed: true, added: 1, replaced: 0, removed: 0 });
  assert.equal((await second.promise).value.revision, 2);
  await disposal; assert.equal(owner.root, undefined); clean(host, signal);
});

test('dispose immediately rejects active/queued work, unregisters resources and shares one promise', async () => {
  const { owner, host } = fixture();
  const activeSignal = new FakeSignal(), queuedSignal = new FakeSignal();
  const active = observe(owner.add(record('a', 'word '.repeat(40)), { signal: activeSignal }));
  const queued = observe(owner.search('word', { signal: queuedSignal }));
  const staleCallbacks = host.callbacks(), disposal = owner.dispose();
  assert.equal(owner.dispose(), disposal);
  await failure(active, 'DISPOSED'); await failure(queued, 'DISPOSED'); await disposal;
  assert.equal(owner.root, undefined); clean(host, activeSignal, queuedSignal);
  for (const callback of staleCallbacks) callback();
  assert.equal(owner.root, undefined); clean(host, activeSignal, queuedSignal);
  assert.equal(owner.dispose(), disposal);
});

test('disposal requested inside active trusted preparation waits for unwinding and prevents commit', async () => {
  let owner, disposal, cleaned = 0;
  const participant = { id: 'side', *prepare() {
    try {
      disposal = owner.dispose();
      assert.equal(owner.dispose(), disposal);
      assert.ok(owner.root, 'root remains owned until active work reaches its safe terminal state');
      yield { workUnits: 1 };
      return Object.freeze({ value: 'never committed' });
    } finally { cleaned++; }
  } };
  const fixtureValue = fixture([], { checkpointWorkUnits: 2_048 }, schema, [participant]);
  owner = fixtureValue.owner;
  const operation = observe(owner.add(record('a')));
  await failure(operation, 'DISPOSED'); await disposal;
  assert.equal(cleaned, 1); assert.equal(owner.root, undefined); clean(fixtureValue.host);
});

test('participant failures and throwing abandonment cleanup preserve the original typed outcome and permit reuse', async () => {
  let fail = true, entered = false, cleaned = 0;
  const participant = { id: 'side', *prepare() {
    entered = true;
    try {
      yield { workUnits: 1 };
      if (fail) throw new RaveldexError('RESOURCE_EXHAUSTED');
      return Object.freeze({ stable: true });
    } finally { cleaned++; }
  } };
  const { owner, host, root } = fixture([], { checkpointWorkUnits: 1 }, schema, [participant]);
  const signal = new FakeSignal(), operation = observe(owner.add(record('a'), { signal }));
  host.runReady(); await failure(operation, 'RESOURCE_EXHAUSTED');
  assert.equal(owner.root, root); assert.equal(cleaned, 1); clean(host, signal);
  fail = false;
  assert.equal((await success(host, observe(owner.add(record('later'))))).revision, 1); assert.equal(cleaned, 2); clean(host);
  let throwOnClose = true, closeCount = 0;
  const badCleanup = { id: 'side', *prepare() {
    entered = true;
    try { yield { workUnits: 1 }; return Object.freeze({}); }
    finally { closeCount++; if (throwOnClose) throw new Error('cleanup failure'); }
  } };
  entered = false;
  const next = fixture([], { checkpointWorkUnits: 1 }, schema, [badCleanup]);
  const abort = new FakeSignal(), cancelled = observe(next.owner.add(record('a'), { signal: abort }));
  while (!entered) assert.equal(next.host.runNext(), true);
  abort.stop(); await failure(cancelled, 'CANCELLED');
  assert.equal(closeCount, 1); assert.equal(next.owner.root, next.root); clean(next.host, abort);
  throwOnClose = false;
  assert.equal((await success(next.host, observe(next.owner.add(record('later'))))).revision, 1); clean(next.host);
});

test('unknown participant failures become sanitized rejections and release all scheduling resources', async () => {
  let fail = true;
  const participant = { id: 'side', *prepare() {
    yield { workUnits: 1 };
    if (fail) throw new Error('private source content must never reach errors');
    return Object.freeze({ recovered: true });
  } };
  const { owner, host, root } = fixture([], { checkpointWorkUnits: 1 }, schema, [participant]);
  const signal = new FakeSignal(), operation = observe(owner.add(record('a'), { signal }));
  host.runReady();
  const error = await failure(operation, 'INTERNAL_ERROR');
  assert.deepEqual(error.details, {}); assert.equal(owner.root, root); clean(host, signal);
  fail = false;
  assert.equal((await success(host, observe(owner.add(record('later'))))).revision, 1); clean(host);
});

test('host timer/continuation and signal-registration failures reject safely and permit later operations', async () => {
  class FailingHost extends FakeHost {
    failTimer = false;
    failResume = false;
    schedule(callback, delayMs) {
      if ((delayMs === 0 && this.failResume) || (delayMs > 0 && this.failTimer)) throw new Error('host failure');
      return super.schedule(callback, delayMs);
    }
  }
  for (const point of ['failTimer', 'failResume']) {
    const root = build([], { checkpointWorkUnits: 1 }), host = new FailingHost(), owner = new ExecutionOwner(root, host);
    host[point] = true;
    const signal = new FakeSignal(), operation = observe(owner.add(record('a'), { signal }));
    await failure(operation, 'INTERNAL_ERROR'); assert.equal(owner.root, root); clean(host, signal);
    host[point] = false;
    assert.equal((await success(host, observe(owner.add(record('later'))))).revision, 1); clean(host);
  }
  class FailingSignal extends FakeSignal {
    fail = true;
    addEventListener(type, listener, options) {
      super.addEventListener(type, listener, options);
      if (this.fail) throw new Error('signal registration failure after retaining listener');
    }
  }
  const { owner, host, root } = fixture(), signal = new FailingSignal();
  await failure(observe(owner.add(record('a'), { signal })), 'INTERNAL_ERROR');
  assert.equal(owner.root, root); assert.equal(signal.removeCalls, 1); clean(host, signal);
  signal.fail = false;
  assert.equal((await success(host, observe(owner.add(record('later'), { signal })))).revision, 1); clean(host, signal);
});

test('search and addMany retain one work budget across analysis, selection, records and participants', async () => {
  const records = Array.from({ length: 10 }, (_, i) => record(`a${i}`, 'common red red'));
  const baseline = build(records), searchWork = drain(executeSearch(baseline, 'common red', { limit: 10 })).units;
  const lowSearch = fixture(records, { checkpointWorkUnits: 1, maxSearchWorkUnits: searchWork - 1 });
  const searched = observe(lowSearch.owner.search('common red', { limit: 10 }));
  lowSearch.host.runReady(); await failure(searched, 'WORK_LIMIT_EXCEEDED');
  assert.equal(lowSearch.owner.root, lowSearch.root); clean(lowSearch.host);
  const atSearch = fixture(records, { checkpointWorkUnits: 1, maxSearchWorkUnits: searchWork });
  assert.deepEqual(await success(atSearch.host, observe(atSearch.owner.search('common red', { limit: 10 }))), drain(executeSearch(baseline, 'common red', { limit: 10 })).value);
  clean(atSearch.host);
  const inputs = [record('a'), record('b')], mutationWork = drain(new MutationOwner(build()).mutate('addMany', inputs)).units;
  const lowMutation = fixture([], { checkpointWorkUnits: 1, maxMutationWorkUnits: mutationWork - 1 });
  const added = observe(lowMutation.owner.addMany(inputs)); lowMutation.host.runReady();
  await failure(added, 'WORK_LIMIT_EXCEEDED'); assert.equal(lowMutation.owner.root, lowMutation.root); clean(lowMutation.host);
  const atMutation = fixture([], { checkpointWorkUnits: 1, maxMutationWorkUnits: mutationWork });
  assert.equal((await success(atMutation.host, observe(atMutation.owner.addMany(inputs)))).added, 2); clean(atMutation.host);
  const participant = { id: 'side', *prepare() { yield { workUnits: mutationWork }; return Object.freeze({}); } };
  const shared = fixture([], { checkpointWorkUnits: 1, maxMutationWorkUnits: mutationWork + 1 }, schema, [participant]);
  const sharedOperation = observe(shared.owner.addMany(inputs)); shared.host.runReady();
  await failure(sharedOperation, 'WORK_LIMIT_EXCEEDED'); assert.equal(shared.owner.root, shared.root); clean(shared.host);
});

test('visible stop precedence is disposed, caller abort, deadline, work; a settled first error is retained', async () => {
  for (const stop of ['disposed', 'abort', 'deadline', 'work']) {
    const { owner, host, root } = fixture([], { checkpointWorkUnits: 1, maxMutationWorkUnits: 5 });
    const signal = new FakeSignal(), operation = observe(owner.add(record('a', 'word '.repeat(20)), { signal, deadlineMs: 5 }));
    if (stop !== 'work') host.advance(5);
    if (stop === 'disposed' || stop === 'abort') signal.stop(false);
    if (stop === 'disposed') await owner.dispose();
    host.runReady();
    await failure(operation, { disposed: 'DISPOSED', abort: 'CANCELLED', deadline: 'DEADLINE_EXCEEDED', work: 'WORK_LIMIT_EXCEEDED' }[stop]);
    assert.equal(owner.root, stop === 'disposed' ? undefined : root); clean(host, signal);
  }
  const { owner, host } = fixture();
  const signal = new FakeSignal(), operation = observe(owner.add(record('a'), { signal }));
  signal.stop(); await owner.dispose(); host.advance(60_000); host.runReady();
  await failure(operation, 'CANCELLED'); clean(host, signal);
});

test('late malformed content rejects the whole queued batch after charged work and preserves later reads', async () => {
  const { owner, host, root } = fixture();
  const bad = observe(owner.addMany([record('a'), record('b', 'late \ud800')]));
  assert.equal(host.pendingResumes, 1); assert.equal(owner.root, root);
  const after = observe(owner.search({ kind: 'all' }));
  host.runReady(); await failure(bad, 'INVALID_RECORD');
  assert.equal((await after.promise).value.total, 0); assert.equal(owner.root, root); clean(host);
  assert.equal((await success(host, observe(owner.add(record('later'))))).revision, 1); clean(host);
});
