import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatchEvidence } from '../../../dist/addons/evidence/index.js';
import { createSnippetEvidence } from '../../../dist/addons/snippets/index.js';
import { FakeSignal } from '../../fixtures/execution/host.mjs';
import { coreResult, data, observe, plain, released, request, setup } from './helpers.mjs';

const fields = { title: 'source' }, records = [{ id: 'a', text: { title: 'red red' } }, { id: 'b', text: { title: 'red' } }];
const initialRanges = [{ field: 'title', valueIndex: 0, position: 0, start: 0, end: 3, term: 'red' }, { field: 'title', valueIndex: 0, position: 1, start: 4, end: 7, term: 'red' }];
const tracking = () => ({ phase: undefined, prepared: 0, preparesClosed: 0, finished: 0, finishesClosed: 0 });
function instrumented(tracker, snippets = false) {
  const addon = snippets ? createSnippetEvidence({ fields }) : createMatchEvidence({ fields });
  return { ...addon, evidence: { ...addon.evidence, *prepare(context) {
    tracker.prepared++; const cursor = addon.evidence.prepare(context); let prepared;
    try { for (;;) { const step = cursor.next(); if (step.done) { prepared = step.value; break; } tracker.phase = 'prepare'; yield step.value; tracker.phase = undefined; } }
    finally { cursor.return(); tracker.preparesClosed++; tracker.phase = undefined; }
    return { *finish(context) {
      tracker.finished++; const cursor = prepared.finish(context);
      try { for (;;) { const step = cursor.next(); if (step.done) return step.value; tracker.phase = 'finish'; yield step.value; tracker.phase = undefined; } }
      finally { cursor.return(); tracker.finishesClosed++; tracker.phase = undefined; }
    } };
  } } };
}

test('real mutations, failed atomic writes, no-ops and clear keep original ranges revision coherent and old outputs stable', async t => {
  let compared = 0;
  for (const strategy of ['source', 'offsets']) {
    const state = setup(strategy, {}, { fields: { title: strategy }, snippets: true }); const empty = state.engine.root;
    for (const [method, argument] of [['addMany', []], ['remove', []], ['remove', ['missing']], ['clear']]) { assert.equal((await state.call(method, argument)).changed, false); assert.equal(state.engine.root, empty); }
    await state.call('addMany', records); const old = state.engine.root;
    const first = await state.call('search', 'red', request(['a', 'b', 'missing'], {}, 'snippets')), serialized = JSON.stringify(first);
    assert.deepEqual(plain(data(first, 'snippets').documents[0].ranges), initialRanges);
    for (const [method, input, code] of [
      ['add', records[0], 'ID_EXISTS'], ['replace', { id: 'missing', text: {} }, 'ID_NOT_FOUND'],
      ['addMany', [{ id: 'temporary', text: { title: 'red' } }, { id: 'bad', text: { title: '\ud800' } }], 'INVALID_RECORD'],
    ]) { await assert.rejects(state.call(method, input), { code }); assert.equal(state.engine.root, old); }
    assert.equal((await state.call('remove', ['missing'])).changed, false); assert.equal(state.engine.root, old);
    for (const [method, argument, revision, expected] of [
      ['replace', { id: 'a', text: { title: ['😀 red', 'red blue'] } }, 2, [
        { field: 'title', valueIndex: 0, position: 0, start: 3, end: 6, term: 'red' }, { field: 'title', valueIndex: 1, position: 0, start: 0, end: 3, term: 'red' },
      ]], ['remove', ['b'], 3, undefined], ['add', { id: 'b', text: { title: 'blue' } }, 4, undefined], ['clear', undefined, 5, []],
    ]) {
      await state.call(method, argument); const ordinary = await state.call('search', 'red');
      const result = await state.call('search', 'red', request(['a', 'b', 'missing'], { expectedRevision: revision }, 'snippets'));
      assert.deepEqual(coreResult(result), ordinary); assert.equal(result.revision, revision);
      if (expected) assert.deepEqual(plain(data(result, 'snippets').documents[0].ranges), expected);
      assert.equal(JSON.stringify(first), serialized); compared++;
    }
    const cleared = state.engine.root; assert.equal((await state.call('clear')).changed, false); assert.equal(state.engine.root, cleared);
    await assert.rejects(state.call('search', 'red', request(['a'], { expectedRevision: 4 }, 'snippets')), { code: 'REVISION_MISMATCH' });
    assert.deepEqual(Object.keys(state.engine.root.participants).sort(), strategy === 'source' ? ['source'] : ['positions', 'source']);
    await state.call('dispose'); assert.equal(JSON.stringify(first), serialized); released(state.host);
  }
  t.diagnostic(JSON.stringify({ mutationCompleteResultComparisons: compared, rejectedAtomicMutations: 6, noOpIdentityChecks: 12 }));
});

test('queued query/request/page/provider source capture precedes execution and expected revisions use FIFO start roots', async () => {
  const state = setup('source', { limits: { checkpointWorkUnits: 1 } }, { fields, snippets: true });
  const blocker = observe(state.engine.add({ id: 'blocker', text: { title: 'slow '.repeat(30) } }));
  const record = { id: 'a', text: { title: ['red red'] } }, added = observe(state.engine.add(record));
  const query = { kind: 'text', text: 'red', fields: ['title'] }, options = { limit: 1, deadlineMs: 100, ...request(['a'], { expectedRevision: 2, fields: ['title'] }, 'snippets') };
  const first = observe(state.engine.search(query, options));
  const replacement = { id: 'a', text: { title: 'blue' } }, replaced = observe(state.engine.replace(replacement));
  const stale = observe(state.engine.search('red', request(['a'], { expectedRevision: 2 }, 'snippets')));
  const second = observe(state.engine.search('red', request(['a'], { expectedRevision: 3 }, 'snippets')));
  record.id = 'changed'; record.text.title[0] = 'changed'; query.text = 'blue'; query.fields[0] = 'body';
  options.limit = 0; options.deadlineMs = 1; options.extensions.snippets.ids[0] = 'blocker'; options.extensions.snippets.expectedRevision = 99; options.extensions.snippets.fields[0] = 'body'; replacement.text.title = 'red';
  state.host.advance(2); state.host.runReady();
  assert.equal((await blocker).value.revision, 1); assert.equal((await added).value.revision, 2);
  const before = (await first).value; assert.equal(before.revision, 2); assert.deepEqual(before.hits.map(hit => hit.id), ['a']);
  const projection = data(before, 'snippets').documents[0]; assert.equal(projection.id, 'a'); assert.deepEqual(plain(projection.ranges), initialRanges); assert.equal(projection.snippets[0].text, 'red red');
  assert.equal((await replaced).value.revision, 3); assert.equal((await stale).error.code, 'REVISION_MISMATCH');
  const after = (await second).value; assert.equal(after.revision, 3); assert.equal(after.total, 0); assert.equal(data(after, 'snippets').documents[0].eligibility, 'excluded'); assert.deepEqual(data(after, 'snippets').documents[0].snippets, []);
  await state.call('dispose'); released(state.host);
});

test('every evidence or snippet suspension supports cancellation, cursor cleanup and unchanged recovery', async t => {
  let cancellations = 0, preparationStops = 0, projectionStops = 0;
  for (const snippets of [false, true]) {
    const capability = snippets ? 'snippets' : 'match-evidence', options = { limits: { checkpointWorkUnits: 16 } }, selected = () => request(['a'], {}, capability);
    const baseTracker = tracking(), baseline = setup('source', options, { fields, snippets, evidence: instrumented(baseTracker, snippets) });
    await baseline.call('addMany', records); const completed = observe(baseline.engine.search('red', { limit: 0, ...selected() }));
    const suspensions = baseline.host.runReady(); assert.equal((await completed).value.total, 2); await baseline.call('dispose');
    for (let stop = 0; stop < suspensions; stop++) {
      const tracker = tracking(), state = setup('source', options, { fields, snippets, evidence: instrumented(tracker, snippets) });
      await state.call('addMany', records); const old = state.engine.root, signal = new FakeSignal();
      const active = observe(state.engine.search('red', { signal, limit: 0, ...selected() }));
      for (let step = 0; step < stop; step++) assert.equal(state.host.runNext(), true);
      if (tracker.phase === 'prepare') preparationStops++; if (tracker.phase === 'finish') projectionStops++;
      signal.stop(); assert.equal((await active).error.code, 'CANCELLED'); assert.equal(state.engine.root, old);
      assert.equal(tracker.prepared, tracker.preparesClosed); assert.equal(tracker.finished, tracker.finishesClosed); released(state.host, signal);
      const ordinary = await state.call('search', 'red'), recovered = await state.call('search', 'red', selected());
      assert.deepEqual(coreResult(recovered), ordinary); assert.deepEqual(plain(data(recovered, capability).documents[0].ranges), initialRanges);
      if (snippets) assert.equal(data(recovered, capability).documents[0].snippets[0].text, 'red red');
      await state.call('dispose'); released(state.host, signal); cancellations++;
    }
  }
  assert.ok(preparationStops > 0); assert.ok(projectionStops > 0);
  t.diagnostic(JSON.stringify({ exhaustiveCancellationRecoveries: cancellations, preparationStops, evidenceProjectionStops: projectionStops }));
});

test('deadline and disposal during projection reject whole output, close iterators, release queue and stale callbacks', async () => {
  for (const snippets of [false, true]) for (const cause of ['deadline', 'dispose']) {
    const capability = snippets ? 'snippets' : 'match-evidence', tracker = tracking();
    const state = setup('source', { limits: { checkpointWorkUnits: 1 } }, { fields, snippets, evidence: instrumented(tracker, snippets) });
    await state.call('addMany', records); const old = state.engine.root, activeSignal = new FakeSignal(), queuedSignal = new FakeSignal();
    const active = observe(state.engine.search('red', { signal: activeSignal, deadlineMs: 5, ...request(['a'], {}, capability) }));
    const queued = observe(state.engine.replace({ id: 'a', text: { title: 'blue' } }, { signal: queuedSignal }));
    while (tracker.phase !== 'finish') assert.equal(state.host.runNext(), true);
    const callbacks = state.host.callbacks();
    if (cause === 'deadline') {
      state.host.advance(5); state.host.runReady(); assert.equal((await active).error.code, 'DEADLINE_EXCEEDED'); assert.equal((await queued).value.revision, 2); assert.equal(old.revision, 1);
      const recovered = await state.call('search', 'red', request(['a', 'b'], { expectedRevision: 2 }, capability)); assert.deepEqual(recovered.hits.map(hit => hit.id), ['b']); assert.equal(data(recovered, capability).documents[0].eligibility, 'excluded');
    } else {
      await state.engine.dispose(); assert.equal((await active).error.code, 'DISPOSED'); assert.equal((await queued).error.code, 'DISPOSED'); assert.equal(state.engine.root, undefined);
      for (const callback of callbacks) callback(); assert.equal(state.engine.root, undefined);
    }
    assert.equal(tracker.prepared, tracker.preparesClosed); assert.equal(tracker.finished, tracker.finishesClosed); released(state.host, activeSignal, queuedSignal);
    await state.call('dispose'); released(state.host);
  }
});
