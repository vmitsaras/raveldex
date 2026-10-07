import assert from 'node:assert/strict';
import test from 'node:test';
import { createFilters } from '../../../dist/addons/filters/index.js';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { executeSearch } from '../../../dist/core/query/search.js';
import { FakeSignal } from '../../fixtures/execution/host.mjs';
import { compare, fields, nativeQuery, range, records, scanFilterResult, schema, set, setup } from './helpers.mjs';

const queries = [range({ field: 'price', gte: 10, lte: 20 }), { kind: 'not', child: set({ field: 'tags', values: [null] }) }, { kind: 'or', children: [{ kind: 'text', text: 'alpha' }, set({ field: 'active', values: [false] })] }];
const observe = promise => promise.then(value => ({ value }), error => ({ error }));
function released(host, ...signals) {
  assert.equal(host.pending, 0);
  for (const signal of signals) assert.equal(signal.listenerCount, 0);
}
function drain(cursor) {
  let work = 0;
  for (;;) { const step = cursor.next(); if (step.done) return { result: step.value, work }; work += step.value.workUnits; }
}
async function reference(state, inputs, revision) {
  for (const query of queries) for (const page of [{ limit: 0 }, { limit: 1 }, { limit: 100 }]) {
    compare(await state.call('search', nativeQuery(query), page), scanFilterResult(inputs, query, page), revision);
  }
}

test('metadata reads share atomic revisions through writes/noops, rollback, clear and immutable old snapshots without side state', async () => {
  const state = setup({ limits: { checkpointWorkUnits: 1 } });
  const initial = state.engine.root;
  for (const [method, argument] of [['addMany', []], ['remove', []], ['remove', ['absent']], ['clear']]) {
    assert.equal((await state.call(method, argument)).changed, false); assert.equal(state.engine.root, initial);
  }
  let inputs = structuredClone(records.slice(0, 3));
  await state.call('addMany', inputs); await reference(state, inputs, 1);
  const old = state.engine.root, before = JSON.stringify(old);
  const oldResult = drain(executeSearch(old, nativeQuery(queries[0]), { limit: 100 })).result;
  const replacement = { ...inputs[0], metadata: { price: [15], tags: ['blue'], active: [true] } };
  inputs = inputs.map(input => input.id === 'a' ? replacement : input);
  await state.call('replace', replacement); await reference(state, inputs, 2);
  assert.equal(JSON.stringify(old), before); assert.deepEqual(drain(executeSearch(old, nativeQuery(queries[0]), { limit: 100 })).result, oldResult);
  const inserted = structuredClone(records[6]); inputs.push(inserted);
  await state.call('add', inserted); await reference(state, inputs, 3);
  const stable = state.engine.root;
  for (const [method, input, code] of [
    ['addMany', [{ id: 'new', text: {}, metadata: { tags: ['good'] } }, { id: 'bad', text: {}, metadata: { tags: ['late \ud800'] } }], 'INVALID_RECORD'],
    ['addMany', [{ id: 'new', text: {} }, structuredClone(records[1])], 'ID_EXISTS'],
    ['replace', { id: 'absent', text: {} }, 'ID_NOT_FOUND'],
  ]) {
    const signal = new FakeSignal(); await assert.rejects(state.call(method, input, { signal }), { code });
    assert.equal(state.engine.root, stable); released(state.host, signal); await reference(state, inputs, 3);
  }
  await state.call('remove', ['b', 'missing']); inputs = inputs.filter(input => input.id !== 'b'); await reference(state, inputs, 4);
  await state.call('clear'); await reference(state, [], 5);
  const cleared = state.engine.root;
  assert.equal((await state.call('clear')).changed, false); assert.equal(state.engine.root, cleared);
  await state.call('add', structuredClone(records[7])); await reference(state, [records[7]], 6);
  assert.deepEqual(Object.keys(state.engine.root.participants), []);
  assert.deepEqual(state.configuration.capabilities.ordered[0].manifest.dataRequirements, { fields: [...fields].sort(), source: false, positions: false, offsets: false, metadata: true });
  await state.call('dispose'); assert.equal(state.engine.root, undefined); released(state.host);
});

test('queued filter payloads and metadata arrays are owned before caller changes, then FIFO searches use their selected revision', async () => {
  const state = setup({ limits: { checkpointWorkUnits: 1 } });
  const blocker = observe(state.engine.add({ id: 'blocker', text: { title: 'slow '.repeat(30) } }));
  const record = { id: 'owned', text: { title: 'alpha' }, metadata: { price: [15], tags: ['red'] } };
  const added = observe(state.engine.add(record));
  const query = nativeQuery(set({ field: 'tags', values: ['red'] })), options = { limit: 100, deadlineMs: 100 };
  const first = observe(state.engine.search(query, options));
  const replacement = { id: 'owned', text: { title: 'alpha' }, metadata: { price: [25], tags: ['blue'] } };
  const replaced = observe(state.engine.replace(replacement));
  const second = observe(state.engine.search(nativeQuery(set({ field: 'tags', values: ['red'] }))));
  record.id = 'changed'; record.metadata.price[0] = 99; record.metadata.tags[0] = 'blue';
  query.payload.values[0] = 'blue'; query.payload.field = 'price'; options.limit = 0; options.deadlineMs = 1;
  replacement.metadata.tags[0] = 'red';
  state.host.advance(2); state.host.runReady();
  assert.equal((await blocker).value.revision, 1); assert.equal((await added).value.revision, 2);
  assert.deepEqual((await first).value.hits.map(hit => hit.id), ['owned']); assert.equal((await first).value.revision, 2);
  assert.equal((await replaced).value.revision, 3); assert.equal((await second).value.total, 0); assert.equal((await second).value.revision, 3);
  await state.call('dispose'); released(state.host);
});

function instrumented(tracker, options = {}) {
  const addon = createFilters({ fields, ...options });
  return { ...addon, predicate: { ...addon.predicate, *prepare(context) {
    tracker.prepared++;
    const cursor = addon.predicate.prepare(context);
    let prepared;
    try {
      for (;;) {
        const step = cursor.next(); if (step.done) { prepared = step.value; break; }
        tracker.phase = 'prepare'; yield step.value; tracker.phase = undefined;
      }
    } finally { cursor.return(undefined); tracker.prepareClosed++; tracker.phase = undefined; }
    return { *test(metadata) {
      tracker.tests++;
      const testCursor = prepared.test(metadata);
      try {
        for (;;) { const step = testCursor.next(); if (step.done) return step.value; tracker.phase = 'test'; yield step.value; tracker.phase = undefined; }
      } finally { testCursor.return(false); tracker.testsClosed++; tracker.phase = undefined; }
    } };
  } } };
}
const tracker = () => ({ prepared: 0, prepareClosed: 0, tests: 0, testsClosed: 0, phase: undefined });
const lifecycleRecords = [
  { id: 'one', text: { title: 'alpha' }, metadata: { tags: ['x', 'y', 'target'], price: [5, 15] } },
  { id: 'two', text: { title: 'beta alpha' }, metadata: { tags: ['target', 'x'], price: [25] } },
];
const lifecycleQuery = { kind: 'and', children: [set({ field: 'tags', values: ['absent', 'target'] }), range({ field: 'price', gte: 10, lte: 20 })] };

test('every selected filter search suspension can abort, close real predicate cursors and recover a complete unchanged revision', async t => {
  const baseTracking = tracker(), base = setup({ addons: [instrumented(baseTracking)], limits: { checkpointWorkUnits: 1 } });
  await base.call('addMany', lifecycleRecords);
  const operation = observe(base.engine.search(nativeQuery(lifecycleQuery), { limit: 0 }));
  const suspensions = base.host.runReady(); assert.equal((await operation).value.total, 1);
  await base.call('dispose'); released(base.host);
  let optionalSuspensions = 0;
  for (let stop = 0; stop < suspensions; stop++) {
    const tracking = tracker(), state = setup({ addons: [instrumented(tracking)], limits: { checkpointWorkUnits: 1 } });
    await state.call('addMany', lifecycleRecords);
    const old = state.engine.root, signal = new FakeSignal();
    const outcome = observe(state.engine.search(nativeQuery(lifecycleQuery), { signal, limit: 0 }));
    for (let step = 0; step < stop; step++) assert.equal(state.host.runNext(), true);
    if (tracking.phase) optionalSuspensions++;
    signal.stop(); assert.equal((await outcome).error.code, 'CANCELLED');
    assert.equal(state.engine.root, old); assert.equal(tracking.prepared, tracking.prepareClosed); assert.equal(tracking.tests, tracking.testsClosed);
    released(state.host, signal);
    compare(await state.call('search', nativeQuery(lifecycleQuery), { limit: 100 }), scanFilterResult(lifecycleRecords, lifecycleQuery, { limit: 100 }), 1);
    await state.call('dispose'); released(state.host, signal);
  }
  assert.ok(optionalSuspensions > 0);
  t.diagnostic(JSON.stringify({ suspensionCases: suspensions, insidePredicateCases: optionalSuspensions }));
});

test('deadlines and active/queued disposal inside a real predicate release tasks/listeners and preserve committed outcomes', async () => {
  for (const stop of ['deadline', 'dispose']) {
    const tracking = tracker(), state = setup({ addons: [instrumented(tracking)], limits: { checkpointWorkUnits: 1 } });
    await state.call('addMany', lifecycleRecords);
    const old = state.engine.root, signal = new FakeSignal(), queuedSignal = new FakeSignal();
    const active = observe(state.engine.search(nativeQuery(lifecycleQuery), { signal, deadlineMs: 5 }));
    const queued = observe(state.engine.replace({ ...lifecycleRecords[0], metadata: { tags: ['changed'] } }, { signal: queuedSignal }));
    while (tracking.phase !== 'test') assert.equal(state.host.runNext(), true);
    const callbacks = state.host.callbacks();
    if (stop === 'deadline') {
      state.host.advance(5); state.host.runReady(); assert.equal((await active).error.code, 'DEADLINE_EXCEEDED');
      assert.equal((await queued).value.revision, 2); assert.equal(old.revision, 1);
      compare(await state.call('search', nativeQuery(lifecycleQuery)), scanFilterResult([{ ...lifecycleRecords[0], metadata: { tags: ['changed'] } }, lifecycleRecords[1]], lifecycleQuery), 2);
    } else {
      await state.engine.dispose(); assert.equal((await active).error.code, 'DISPOSED'); assert.equal((await queued).error.code, 'DISPOSED');
      assert.equal(state.engine.root, undefined); for (const callback of callbacks) callback(); assert.equal(state.engine.root, undefined);
    }
    assert.equal(tracking.prepared, tracking.prepareClosed); assert.equal(tracking.tests, tracking.testsClosed);
    released(state.host, signal, queuedSignal); await state.call('dispose'); released(state.host);
  }
  const completed = setup();
  const committed = observe(completed.engine.add(lifecycleRecords[0]));
  const newer = observe(completed.engine.replace({ ...lifecycleRecords[0], metadata: { price: [25] } }));
  await completed.engine.dispose(); assert.equal((await committed).value.revision, 1); assert.equal((await newer).value.revision, 2); released(completed.host);
});

test('one module work cap spans repeated leaves and the shared search cap rejects complete qualification instead of returning partial totals', async t => {
  const state = setup(); await state.call('addMany', lifecycleRecords);
  const query = nativeQuery(set({ field: 'tags', values: ['target'] })), doubled = { kind: 'and', children: [query, query] };
  const original = state.engine.root;
  const rootAt = maximum => Object.freeze({ ...original, configuration: captureConfiguration({ schema, addons: [createFilters({ fields, maxWorkUnits: maximum })] }) });
  function succeeds(maximum, selected = query) {
    try { drain(executeSearch(rootAt(maximum), selected, { limit: 0 })); return true; }
    catch (error) { assert.equal(error.code, 'WORK_LIMIT_EXCEEDED'); return false; }
  }
  let low = 1, high = 10_000;
  while (low < high) { const middle = Math.floor((low + high) / 2); if (succeeds(middle)) high = middle; else low = middle + 1; }
  assert.ok(succeeds(low)); assert.equal(succeeds(low - 1), false);
  assert.equal(succeeds(low, doubled), false); assert.ok(succeeds(low * 2, doubled));
  const complete = drain(executeSearch(original, doubled, { limit: 0 }));
  const configuration = captureConfiguration({ schema, addons: [createFilters({ fields })], limits: { checkpointWorkUnits: 1, maxSearchWorkUnits: complete.work - 1 } });
  assert.throws(() => drain(executeSearch(Object.freeze({ ...original, configuration }), doubled, { limit: 0 })), { code: 'WORK_LIMIT_EXCEEDED' });
  assert.equal(state.engine.root, original);
  t.diagnostic(JSON.stringify({ minimumCompleteModuleWork: low, doubledCompleteSearchWork: complete.work }));
  await state.call('dispose'); released(state.host);
});
