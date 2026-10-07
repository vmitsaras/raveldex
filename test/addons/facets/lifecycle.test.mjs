import test from 'node:test';
import assert from 'node:assert/strict';
import { createFacets } from '../../../dist/addons/facets/index.js';
import { FakeSignal } from '../../fixtures/execution/host.mjs';
import { plain, request, options, scanFacets, setup } from './helpers.mjs';

const schema = { text: { title: {} }, metadata: { tags: { type: 'string', multi: true, nullable: true } } };
const records = [{ id: 'a', text: { title: 'red' }, metadata: { tags: ['red', 'blue', 'red', null] } }, { id: 'b', text: { title: 'blue' }, metadata: { tags: ['blue', ''] } }, { id: 'c', text: {} }];
const payload = request({ field: 'tags', missing: true, limit: 2 });
const observe = promise => promise.then(value => ({ value }), error => ({ error }));
const tracker = () => ({ started: 0, closed: 0, phase: undefined, workUnits: 0, contexts: [] });
function measured(tracking, factoryOptions = {}, alias = false) {
  const registration = createFacets({ fields: ['tags'], ...factoryOptions });
  function* run(cursor, phase) {
    tracking.started++;
    try {
      for (;;) {
        const next = cursor.next(); if (next.done) return next.value;
        tracking.phase = phase; tracking.workUnits += next.value.workUnits; yield next.value; tracking.phase = undefined;
      }
    } finally { cursor.return(undefined); tracking.closed++; tracking.phase = undefined; }
  }
  return { ...registration, manifest: alias ? { ...registration.manifest, provides: [...registration.manifest.provides, { id: 'alternate-facets', contractVersion: 1 }] } : registration.manifest,
    aggregation: { ...registration.aggregation, *prepare(context) {
      tracking.contexts.push(context); const prepared = yield* run(registration.aggregation.prepare(context), 'prepare');
      return { *add(metadata) { return yield* run(prepared.add(metadata), 'count'); }, *finish() { return yield* run(prepared.finish(), 'finish'); } };
    } },
  };
}
function fixture(tracking = tracker(), configuration = {}, factoryOptions = {}, alias = false) {
  return setup(schema, { addons: [measured(tracking, factoryOptions, alias)], ...configuration });
}
function released(selected, ...signals) {
  assert.equal(selected.host.pending, 0); for (const signal of signals) assert.equal(signal.listenerCount, 0);
}
async function verify(selected, expected = records, revision = 1) {
  const actual = await selected.call('search', { kind: 'all' }, options(payload, { limit: 0 }));
  assert.equal(actual.revision, revision); assert.equal(actual.total, expected.length); assert.deepEqual(plain(actual.extensions.facets), scanFacets(expected, payload));
}

test('facet work ceiling covers preparation, all counting and final projection and is shared across requests', async () => {
  const tracking = tracker(), baseline = fixture(tracking, {}, {}, true); await baseline.call('addMany', records); tracking.workUnits = 0;
  const expected = await baseline.call('search', { kind: 'all' }, options(payload, { limit: 0 })), measuredWork = tracking.workUnits;
  assert.ok(measuredWork > 100); await baseline.engine.dispose();
  const exact = fixture(tracker(), {}, { maxWorkUnits: measuredWork }, true); await exact.call('addMany', records);
  assert.deepEqual(await exact.call('search', { kind: 'all' }, options(payload, { limit: 0 })), expected);
  await assert.rejects(exact.call('search', { kind: 'all' }, { limit: 0, extensions: { facets: payload, 'alternate-facets': payload } }), { code: 'WORK_LIMIT_EXCEEDED' });
  await verify(exact); released(exact); await exact.engine.dispose();
  const below = fixture(tracker(), {}, { maxWorkUnits: measuredWork - 1 }); await below.call('addMany', records); const root = below.engine.root;
  await assert.rejects(below.call('search', { kind: 'all' }, options(payload, { limit: 0 })), { code: 'WORK_LIMIT_EXCEEDED' });
  assert.equal(below.engine.root, root); released(below); await below.engine.dispose();
});

test('queued facet payloads are captured before mutation and execute at their FIFO revision', async () => {
  const tracking = tracker(), selected = fixture(tracking, { limits: { checkpointWorkUnits: 1 } });
  const blocker = observe(selected.engine.add({ id: 'blocker', text: { title: 'red '.repeat(30) }, metadata: { tags: ['one'] } }));
  const queryPayload = request({ field: 'tags', missing: true, limit: 10 }), searchOptions = options(queryPayload, { limit: 0, deadlineMs: 100 });
  const before = observe(selected.engine.search({ kind: 'all' }, searchOptions));
  const changed = observe(selected.engine.replace({ id: 'blocker', text: {}, metadata: { tags: ['two', 'two'] } }));
  const after = observe(selected.engine.search({ kind: 'all' }, options(payload, { limit: 0 })));
  queryPayload.fields[0].field = 'later'; queryPayload.fields[0].missing = false; queryPayload.fields[0].limit = 0;
  searchOptions.extensions.facets = { fields: [] }; searchOptions.deadlineMs = 1; selected.host.advance(2); selected.host.runReady();
  assert.equal((await blocker).value.revision, 1); assert.equal((await changed).value.revision, 2);
  const earlier = (await before).value, later = (await after).value;
  assert.equal(earlier.revision, 1); assert.deepEqual(plain(earlier.extensions.facets), scanFacets([{ metadata: { tags: ['one'] } }], request({ field: 'tags', missing: true, limit: 10 })));
  assert.equal(later.revision, 2); assert.deepEqual(plain(later.extensions.facets), scanFacets([{ metadata: { tags: ['two', 'two'] } }], payload));
  for (const context of tracking.contexts) { assert.ok(Object.isFrozen(context) && Object.isFrozen(context.payload)); assert.equal(Object.hasOwn(context, 'root'), false); }
  assert.equal(tracking.started, tracking.closed); released(selected); await selected.engine.dispose();
});

test('every selected host suspension can abort and recover complete facets without leaking pending work', async t => {
  const baseline = fixture(tracker(), { limits: { checkpointWorkUnits: 8 } }); await baseline.call('addMany', records);
  const success = observe(baseline.engine.search({ kind: 'all' }, options(payload, { limit: 0 }))), suspensions = baseline.host.runReady();
  assert.equal((await success).value.total, records.length); assert.ok(suspensions > 10); await baseline.engine.dispose();
  const phases = { prepare: 0, count: 0, finish: 0, core: 0 };
  for (let stop = 0; stop < suspensions; stop++) {
    const tracking = tracker(), selected = fixture(tracking, { limits: { checkpointWorkUnits: 8 } }); await selected.call('addMany', records);
    const root = selected.engine.root, signal = new FakeSignal();
    const active = observe(selected.engine.search({ kind: 'all' }, options(payload, { limit: 0, signal })));
    for (let index = 0; index < stop; index++) assert.equal(selected.host.runNext(), true);
    phases[tracking.phase ?? 'core']++; signal.stop();
    assert.equal((await active).error.code, 'CANCELLED'); assert.equal(selected.engine.root, root); assert.equal(tracking.started, tracking.closed); released(selected, signal);
    await verify(selected); released(selected, signal); await selected.engine.dispose();
  }
  assert.ok(phases.prepare > 0 && phases.count > 0 && phases.finish > 0); t.diagnostic(JSON.stringify({ suspensionCases: suspensions, phases }));
});

test('deadlines and disposal inside counting and final output unwind active aggregation cursors', async () => {
  for (const phase of ['count', 'finish']) for (const stop of ['deadline', 'dispose']) {
    const tracking = tracker(), selected = fixture(tracking, { limits: { checkpointWorkUnits: 1 } }); await selected.call('addMany', records);
    const root = selected.engine.root, signal = new FakeSignal();
    const active = observe(selected.engine.search({ kind: 'all' }, options(payload, { limit: 0, signal, deadlineMs: 5 })));
    while (tracking.phase !== phase) assert.equal(selected.host.runNext(), true);
    if (stop === 'deadline') {
      selected.host.advance(5); selected.host.runReady(); assert.equal((await active).error.code, 'DEADLINE_EXCEEDED');
      assert.equal(selected.engine.root, root); released(selected, signal); assert.equal(tracking.started, tracking.closed); await verify(selected); await selected.engine.dispose();
    } else {
      const queuedSignal = new FakeSignal(), queued = observe(selected.engine.add({ id: 'queued', text: {}, metadata: { tags: ['later'] } }, { signal: queuedSignal }));
      const callbacks = selected.host.callbacks(); await selected.engine.dispose();
      assert.equal((await active).error.code, 'DISPOSED'); assert.equal((await queued).error.code, 'DISPOSED'); assert.equal(selected.engine.root, undefined);
      assert.equal(tracking.started, tracking.closed); for (const callback of callbacks) callback(); assert.equal(selected.engine.root, undefined); released(selected, signal, queuedSignal);
    }
  }
});
