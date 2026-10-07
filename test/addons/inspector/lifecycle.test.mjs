import assert from 'node:assert/strict';
import test from 'node:test';
import { createInspector } from '../../../dist/addons/inspector/index.js';
import { createSourceProvider } from '../../../dist/addons/phrases/source.js';
import { executeSearch } from '../../../dist/core/query/search.js';
import { emptyDirectory } from '../../../dist/core/index/staging.js';
import { FakeSignal } from '../../fixtures/execution/host.mjs';
import { coreResult, data, observe, records, released, replay, request, setup, plain } from './helpers.mjs';

const withSource = () => [createSourceProvider({ fields: ['title'] }), createInspector({ sourceFields: ['title'] })];
const traceOptions = extra => request(['a', 'b', 'missing'], extra);
function drain(cursor) { let work = 0; for (;;) { const step = cursor.next(); if (step.done) return { result: step.value, work }; work += step.value.workUnits; } }

function instrumented(tracker) {
  const addon = createInspector({ sourceFields: ['title'] });
  return { ...addon, evidence: { ...addon.evidence, *prepare(context) {
    tracker.prepared++; const cursor = addon.evidence.prepare(context); let prepared;
    try { for (;;) { const step = cursor.next(); if (step.done) { prepared = step.value; break; } tracker.phase = 'prepare'; yield step.value; tracker.phase = undefined; } }
    finally { cursor.return(); tracker.preparesClosed++; tracker.phase = undefined; }
    return { *finish(context) {
      tracker.finished++; const output = prepared.finish(context);
      try { for (;;) { const step = output.next(); if (step.done) return step.value; tracker.phase = 'finish'; yield step.value; tracker.phase = undefined; } }
      finally { output.return(); tracker.finishesClosed++; tracker.phase = undefined; }
    } };
  } } };
}
const tracking = () => ({ phase: undefined, prepared: 0, preparesClosed: 0, finished: 0, finishesClosed: 0 });
const small = [{ id: 'a', text: { title: 'red red car' } }, { id: 'b', text: { title: 'red car' } }];

async function trace(state, revision, expected, sourceValues) {
  const ordinary = await state.call('search', 'red', { limit: 1 });
  const actual = await state.call('search', 'red', { limit: 1, ...traceOptions({ expectedRevision: revision, sourceFields: ['title'] }) });
  assert.deepEqual(coreResult(actual), ordinary);
  assert.equal(actual.revision, revision); assert.equal(data(actual).resources.counts.documents, state.engine.root.documents.size);
  assert.deepEqual(data(actual).documents.filter(document => document.eligibility === 'matched').map(document => document.id), expected);
  for (const [id, values] of sourceValues) assert.deepEqual(plain(data(actual).documents.find(document => document.id === id).source.fields.title), { status: 'available', values });
  replay(data(actual), actual); return actual;
}

test('actual mutation/no-op/rollback/clear identities and old owned explanation/source objects stay coherent', async t => {
  const state = setup({ addons: withSource() }); const initial = state.engine.root;
  for (const [method, argument] of [['addMany', []], ['remove', []], ['remove', ['absent']], ['clear']]) {
    assert.equal((await state.call(method, argument)).changed, false); assert.equal(state.engine.root, initial);
  }
  await state.call('addMany', small);
  const first = await trace(state, 1, ['a', 'b'], [['a', ['red red car']], ['b', ['red car']]]);
  const serialized = JSON.stringify(first), stable = state.engine.root;
  for (const [method, input, code] of [
    ['add', small[0], 'ID_EXISTS'], ['replace', { id: 'absent', text: {} }, 'ID_NOT_FOUND'],
    ['addMany', [{ id: 'temporary', text: { title: 'red' } }, { id: 'bad', text: { title: '\ud800' } }], 'INVALID_RECORD'],
  ]) {
    await assert.rejects(state.call(method, input), { code }); assert.equal(state.engine.root, stable);
    await trace(state, 1, ['a', 'b'], [['a', ['red red car']]]);
  }
  assert.equal((await state.call('remove', ['absent'])).changed, false); assert.equal(state.engine.root, stable);
  await trace(state, 1, ['a', 'b'], []);
  await state.call('replace', { id: 'a', text: { title: 'blue' } }); await trace(state, 2, ['b'], [['a', ['blue']]]);
  await state.call('remove', ['b']); await trace(state, 3, [], [['a', ['blue']]]);
  await state.call('add', { id: 'b', text: { title: 'red' } }); await trace(state, 4, ['b'], [['b', ['red']]]);
  await state.call('clear'); await trace(state, 5, [], []);
  const cleared = state.engine.root; assert.equal((await state.call('clear')).changed, false); assert.equal(state.engine.root, cleared);
  await trace(state, 5, [], []);
  assert.equal(JSON.stringify(first), serialized); assert.equal(stable.revision, 1);
  await assert.rejects(state.call('search', 'red', traceOptions({ expectedRevision: 4 })), { code: 'REVISION_MISMATCH' });
  assert.deepEqual(Object.keys(state.engine.root.participants), ['source']);
  t.diagnostic(JSON.stringify({ mutationCompleteResultComparisons: 10, rejectedMutations: 3, noOpIdentityChecks: 6 }));
  await state.call('dispose'); released(state.host);
});

test('queued AST/request/page/source fields are owned and expected revisions select actual FIFO start roots', async () => {
  const state = setup({ addons: withSource(), limits: { checkpointWorkUnits: 1 } });
  const blocker = observe(state.engine.add({ id: 'blocker', text: { title: 'slow '.repeat(30) } }));
  const record = { id: 'a', text: { title: ['red red'] } }, added = observe(state.engine.add(record));
  const query = { kind: 'text', text: 'red', fields: ['title'] }, options = { limit: 1, deadlineMs: 100, ...request(['a'], { expectedRevision: 2, sourceFields: ['title'] }) };
  const first = observe(state.engine.search(query, options));
  const replacement = { id: 'a', text: { title: 'blue' } }, replaced = observe(state.engine.replace(replacement));
  const stale = observe(state.engine.search('red', request(['a'], { expectedRevision: 2 })));
  const second = observe(state.engine.search('red', request(['a'], { expectedRevision: 3, sourceFields: ['title'] })));
  record.id = 'changed'; record.text.title[0] = 'changed'; query.text = 'blue'; query.fields[0] = 'body';
  options.limit = 0; options.deadlineMs = 1; options.extensions.inspector.ids[0] = 'blocker'; options.extensions.inspector.expectedRevision = 99; options.extensions.inspector.sourceFields[0] = 'body'; replacement.text.title = 'red';
  state.host.advance(2); state.host.runReady();
  assert.equal((await blocker).value.revision, 1); assert.equal((await added).value.revision, 2);
  const before = (await first).value; assert.equal(before.revision, 2); assert.deepEqual(before.hits.map(hit => hit.id), ['a']);
  assert.equal(data(before).documents[0].id, 'a'); assert.deepEqual(data(before).documents[0].source.fields.title.values, ['red red']);
  assert.equal((await replaced).value.revision, 3); assert.equal((await stale).error.code, 'REVISION_MISMATCH');
  const after = (await second).value; assert.equal(after.revision, 3); assert.equal(after.total, 0); assert.equal(data(after).documents[0].eligibility, 'excluded'); assert.deepEqual(data(after).documents[0].source.fields.title.values, ['blue']);
  await state.call('dispose'); released(state.host);
});

test('every selected suspension can cancel, close optional evidence cursors and recover unchanged ordinary results', async t => {
  const tracker = tracking(), base = setup({ addons: [createSourceProvider({ fields: ['title'] }), instrumented(tracker)], limits: { checkpointWorkUnits: 8 } });
  await base.call('addMany', small);
  const outcome = observe(base.engine.search('red', { limit: 0, ...request(['a'], { sourceFields: ['title'] }) }));
  const suspensions = base.host.runReady(); assert.equal((await outcome).value.total, 2); await base.call('dispose');
  let preparationStops = 0, outputStops = 0;
  for (let stop = 0; stop < suspensions; stop++) {
    const tracker = tracking(), state = setup({ addons: [createSourceProvider({ fields: ['title'] }), instrumented(tracker)], limits: { checkpointWorkUnits: 8 } });
    await state.call('addMany', small); const old = state.engine.root, signal = new FakeSignal();
    const searched = observe(state.engine.search('red', { signal, limit: 0, ...request(['a'], { sourceFields: ['title'] }) }));
    for (let index = 0; index < stop; index++) assert.equal(state.host.runNext(), true);
    if (tracker.phase === 'prepare') preparationStops++; if (tracker.phase === 'finish') outputStops++;
    signal.stop(); assert.equal((await searched).error.code, 'CANCELLED'); assert.equal(state.engine.root, old);
    assert.equal(tracker.prepared, tracker.preparesClosed); assert.equal(tracker.finished, tracker.finishesClosed); released(state.host, signal);
    const ordinary = await state.call('search', 'red');
    const recovered = await state.call('search', 'red', request(['a'], { sourceFields: ['title'] }));
    assert.deepEqual(coreResult(recovered), ordinary); assert.equal(recovered.total, 2); replay(data(recovered), recovered);
    await state.call('dispose'); released(state.host, signal);
  }
  assert.ok(preparationStops > 0); assert.ok(outputStops > 0);
  t.diagnostic(JSON.stringify({ cancellationRecoveries: suspensions, preparationStops, outputStops }));
});

test('deadline/disposal inside evidence projection rejects whole operation and cleans queued and stale callbacks', async () => {
  for (const cause of ['deadline', 'dispose']) {
    const tracker = tracking(), state = setup({ addons: [createSourceProvider({ fields: ['title'] }), instrumented(tracker)], limits: { checkpointWorkUnits: 1 } });
    await state.call('addMany', small); const old = state.engine.root, activeSignal = new FakeSignal(), queuedSignal = new FakeSignal();
    const active = observe(state.engine.search('red', { signal: activeSignal, deadlineMs: 5, ...request(['a'], { sourceFields: ['title'] }) }));
    const queued = observe(state.engine.replace({ id: 'a', text: { title: 'blue' } }, { signal: queuedSignal }));
    while (tracker.phase !== 'finish') assert.equal(state.host.runNext(), true);
    const callbacks = state.host.callbacks();
    if (cause === 'deadline') {
      state.host.advance(5); state.host.runReady(); assert.equal((await active).error.code, 'DEADLINE_EXCEEDED'); assert.equal((await queued).value.revision, 2); assert.equal(old.revision, 1);
      const recovered = await state.call('search', 'red', request(['a', 'b'], { expectedRevision: 2 }));
      assert.deepEqual(recovered.hits.map(hit => hit.id), ['b']); assert.equal(data(recovered).documents[0].eligibility, 'excluded');
    } else {
      await state.engine.dispose(); assert.equal((await active).error.code, 'DISPOSED'); assert.equal((await queued).error.code, 'DISPOSED'); assert.equal(state.engine.root, undefined);
      for (const callback of callbacks) callback(); assert.equal(state.engine.root, undefined);
    }
    assert.equal(tracker.prepared, tracker.preparesClosed); assert.equal(tracker.finished, tracker.finishesClosed); released(state.host, activeSignal, queuedSignal);
    await state.call('dispose'); released(state.host);
  }
});

test('requested source revision/analyzer/field/record headers fail explicitly before returning evidence', async () => {
  const state = setup({ addons: withSource() }); await state.call('addMany', small); const original = state.engine.root;
  const source = original.participants.source;
  const malformed = [
    [undefined, 'MISSING_CAPABILITY'], [{ ...source }, 'INCOMPATIBLE_CAPABILITY'],
    [Object.freeze({ ...source, revision: 0 }), 'REVISION_MISMATCH'],
    [Object.freeze({ ...source, analyzer: Object.freeze({ ...source.analyzer, id: 'foreign' }) }), 'INCOMPATIBLE_CAPABILITY'],
    [Object.freeze({ ...source, fields: Object.freeze(['body']) }), 'MISSING_CAPABILITY'],
    [Object.freeze({ ...source, kind: 'foreign-source' }), 'INCOMPATIBLE_CAPABILITY'],
  ];
  for (const [participant, code] of malformed) {
    const root = Object.freeze({ ...original, participants: Object.freeze({ source: participant }) });
    assert.throws(() => drain(executeSearch(root, { kind: 'none' }, request([], { sourceFields: ['title'] }))), { code });
  }
  const missingRecord = Object.freeze({ ...original, participants: Object.freeze({ source: Object.freeze({ ...source, records: emptyDirectory() }) }) });
  assert.throws(() => drain(executeSearch(missingRecord, 'red', request(['a'], { sourceFields: ['title'] }))), { code: 'MISSING_CAPABILITY' });
  const recovered = await state.call('search', 'red', request(['a'], { sourceFields: ['title'] })); assert.equal(recovered.total, 2); assert.equal(state.engine.root, original);
  await state.call('dispose'); released(state.host);
});
