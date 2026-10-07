import test from 'node:test';
import assert from 'node:assert/strict';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { createPositionPhrases } from '../../../dist/addons/positions/phrases.js';
import { directoryGet } from '../../../dist/core/index/directory.js';
import { DirectoryStage, emptyDirectory } from '../../../dist/core/index/staging.js';
import { executeSearch } from '../../../dist/core/query/search.js';
import { RaveldexError } from '../../../dist/core/errors/error.js';
import { FakeSignal } from '../../fixtures/execution/host.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../../oracle/phrases.mjs';
import { coherent, compare, drain, extension, nativeQuery, setup } from './helpers.mjs';

const schema = { text: { title: { boost: 2 }, body: {} }, metadata: { tags: { type: 'string', multi: true } } };
const fields = ['title', 'body'], offsets = ['title'];
const input = (id, title = 'red blue', body = 'stable red') => ({ id, text: { title, body }, metadata: { tags: ['not retained'] } });
const phrase = { kind: 'phrase', text: 'red blue' };
const recoveryQuery = { kind: 'or', children: [phrase, { kind: 'text', text: 'stable' }] };
const observe = promise => promise.then(value => ({ status: 'fulfilled', value }), error => ({ status: 'rejected', error }));
async function failed(outcome, code) { const result = await outcome; assert.equal(result.status, 'rejected'); assert.ok(result.error instanceof RaveldexError); assert.equal(result.error.code, code); }
function released(host, ...signals) { assert.equal(host.pending, 0); for (const signal of signals) assert.equal(signal.listenerCount, 0); }
async function reference(call, records, revision) {
  const corpus = scanPhraseSourceCorpus(records, schema);
  for (const query of [phrase, recoveryQuery, { kind: 'not', child: phrase }]) compare(await call('search', nativeQuery(query), { limit: 100 }), sourcePhraseQueryResult(corpus, query, { limit: 100 }), revision);
}
const tracker = () => ({ calls: 0, closed: 0, steps: 0, verifiers: 0, verifierClosures: 0, scanSteps: 0, phase: undefined, prepared: undefined });
function instrumentedPositions(tracking, options = {}) {
  const provider = createPositionProvider({ fields, offsets, ...options });
  return { ...provider, participant: { initialize: provider.participant.initialize, *prepare(previous, context) {
    tracking.calls++; tracking.context = context; const cursor = provider.participant.prepare(previous, context);
    try {
      for (;;) { const next = cursor.next(); if (next.done) { tracking.prepared = next.value; return next.value; }
        tracking.phase = 'position-prepare'; tracking.steps++; yield next.value; tracking.phase = undefined;
      }
    } finally { cursor.return(undefined); tracking.closed++; tracking.phase = undefined; }
  } } };
}
function instrumentedPhrases(tracking, options = {}) {
  const phrases = createPositionPhrases({ fields, ...options });
  return { ...phrases, refinement: { ...phrases.refinement, *prepare(context) {
    const prepared = yield* phrases.refinement.prepare(context);
    return { *test(id) {
      tracking.verifiers++; const cursor = prepared.test(id);
      try { for (;;) { const next = cursor.next(); if (next.done) return next.value;
        tracking.phase = 'position-verify'; tracking.scanSteps++; yield next.value; tracking.phase = undefined;
      } } finally { cursor.return(false); tracking.verifierClosures++; tracking.phase = undefined; }
    } };
  } } };
}
function fixture(tracking = tracker(), options = {}) {
  return setup(schema, { addons: [instrumentedPositions(tracking), instrumentedPhrases(tracking)], ...options });
}

test('position and selected-offset roots atomically publish all real writes/no-ops and preserve old immutable snapshots', async () => {
  const tracking = tracker(), { engine, host, call } = fixture(tracking); const start = engine.root;
  for (const [method, argument] of [['clear'], ['addMany', []], ['remove', []], ['remove', ['absent']]]) assert.equal((await call(method, argument)).changed, false);
  assert.equal(engine.root, start); assert.equal(tracking.calls, 0); coherent(engine.root, [], fields, offsets);
  let records = [input('a'), input('b', ['red', 'blue']), { id: 'missing', text: {}, metadata: { tags: [] } }];
  assert.equal((await call('addMany', records)).revision, 1); coherent(engine.root, records, fields, offsets); await reference(call, records, 1);
  assert.ok(Object.isFrozen(tracking.context) && Object.isFrozen(tracking.context.records)); assert.equal(Object.hasOwn(tracking.context, 'core'), false);
  const old = engine.root, oldJson = JSON.stringify(old), oldResult = drain(executeSearch(old, extension('red blue'), { limit: 100 })).value;
  const replacement = input('a', ['', '𐐀𐐁 ﬁle', 'blue red'], 'red blue'); records = records.map(record => record.id === 'a' ? replacement : record);
  assert.equal((await call('replace', replacement)).revision, 2); coherent(engine.root, records, fields, offsets); await reference(call, records, 2);
  assert.equal(JSON.stringify(old), oldJson); assert.deepEqual(drain(executeSearch(old, extension('red blue'), { limit: 100 })).value, oldResult);
  assert.throws(() => { directoryGet(old.participants.positions.records, 'a').positions.title[0].terms.red[0].start = 999; }, TypeError);
  assert.equal((await call('replace', replacement)).revision, 3); coherent(engine.root, records, fields, offsets);
  assert.equal((await call('remove', ['b', 'absent'])).removed, 1); records = records.filter(record => record.id !== 'b'); coherent(engine.root, records, fields, offsets); await reference(call, records, 4);
  assert.equal((await call('clear')).revision, 5); coherent(engine.root, [], fields, offsets);
  const cleared = engine.root; assert.equal((await call('clear')).changed, false); assert.equal(engine.root, cleared);
  assert.equal((await call('add', input('again'))).revision, 6); coherent(engine.root, [input('again')], fields, offsets);
  assert.equal(tracking.calls, 6); assert.equal(tracking.closed, 6); await engine.dispose(); assert.equal(engine.root, undefined); released(host);
});

test('malformed late batches, duplicate IDs and side-retention/work caps roll back before recovery', async () => {
  const { engine, host, call } = fixture(tracker(), { limits: { checkpointWorkUnits: 1 } }), records = [input('a')];
  await call('addMany', records); const old = engine.root, before = JSON.stringify(old);
  for (const [method, value, code] of [
    ['addMany', [input('new'), input('late', 'late \ud800')], 'INVALID_RECORD'],
    ['addMany', [input('new'), input('a')], 'ID_EXISTS'], ['replace', input('absent'), 'ID_NOT_FOUND'],
  ]) {
    const signal = new FakeSignal(); await assert.rejects(call(method, value, { signal }), { code });
    assert.equal(engine.root, old); assert.equal(JSON.stringify(old), before); coherent(engine.root, records, fields, offsets); await reference(call, records, 1); released(host, signal);
  }
  await call('add', input('recovery')); coherent(engine.root, [...records, input('recovery')], fields, offsets); await engine.dispose(); released(host);
  const cap = setup(schema, { addons: [createPositionProvider({ fields, offsets, maxRetainedEntries: 17 }), createPositionPhrases({ fields })] });
  await cap.call('add', input('a')); const capOld = cap.engine.root;
  await assert.rejects(cap.call('add', input('b')), { code: 'LIMIT_EXCEEDED' }); assert.equal(cap.engine.root, capOld); coherent(capOld, records, fields, offsets);
  await cap.call('replace', input('a', 'blue red')); coherent(cap.engine.root, [input('a', 'blue red')], fields, offsets); await cap.engine.dispose(); released(cap.host);
  const work = setup(schema, { addons: [createPositionProvider({ fields, offsets, maxWorkUnits: 1 }), createPositionPhrases({ fields })] });
  const workOld = work.engine.root; await assert.rejects(work.call('add', input('a')), { code: 'WORK_LIMIT_EXCEEDED' }); assert.equal(work.engine.root, workOld);
  coherent(workOld, [], fields, offsets); await work.engine.dispose(); released(work.host);
});

test('later participant failure cannot publish an already prepared real position/offset root', async () => {
  const tracking = tracker(), positions = instrumentedPositions(tracking); let fail = true, engine;
  const later = { manifest: { ...positions.manifest, id: 'later', provides: [{ id: 'later-state', contractVersion: 1 }], requires: [{ id: 'positions:title', contractVersion: 1 }], dataRequirements: { fields: [], source: false, positions: false, offsets: false, metadata: false } }, participant: {
    initialize: () => Object.freeze({ revision: 0 }), *prepare(previous, context) {
      assert.equal(tracking.prepared.revision, context.revision); assert.equal(engine.root.revision, context.previousRevision); assert.equal(engine.root.participants.positions.revision, context.previousRevision);
      yield { workUnits: 1 }; if (fail) throw new RaveldexError('RESOURCE_EXHAUSTED'); return Object.freeze({ revision: context.revision });
    },
  } };
  const selected = setup(schema, { addons: [later, createPositionPhrases({ fields }), positions], limits: { checkpointWorkUnits: 1 } }); engine = selected.engine; const old = engine.root;
  await assert.rejects(selected.call('add', input('a')), { code: 'RESOURCE_EXHAUSTED' }); assert.equal(tracking.prepared.revision, 1); assert.equal(engine.root, old); coherent(old, [], fields, offsets); released(selected.host);
  fail = false; await selected.call('add', input('a')); coherent(engine.root, [input('a')], fields, offsets); await reference(selected.call, [input('a')], 1);
  assert.equal(engine.root.participants.later.revision, 1); await engine.dispose(); released(selected.host);
});

test('queued records, value arrays and positional phrase payloads remain owned at their FIFO execution revision', async () => {
  const { engine, host } = fixture(tracker(), { limits: { checkpointWorkUnits: 1 } });
  const blocker = observe(engine.add(input('blocker', 'stable '.repeat(20))));
  const record = input('owned', ['red blue', '½ file']), values = record.text.title, added = observe(engine.add(record));
  const query = extension('red blue', ['title']), options = { limit: 100, deadlineMs: 100 }, before = observe(engine.search(query, options));
  const replacement = input('owned', 'blue red'), replaced = observe(engine.replace(replacement)), after = observe(engine.search(extension('red blue', ['title'])));
  record.id = 'later'; values[0] = 'later'; record.text.body = 'later'; record.metadata.tags.push('later'); query.payload.text = 'later'; query.payload.fields[0] = 'body'; options.limit = 0; options.deadlineMs = 1; replacement.text.title = 'later';
  host.advance(2); host.runReady(); assert.equal((await blocker).value.revision, 1); assert.equal((await added).value.revision, 2);
  assert.equal((await before).value.revision, 2); assert.deepEqual((await before).value.hits.map(hit => hit.id), ['owned']);
  assert.equal((await replaced).value.revision, 3); assert.equal((await after).value.revision, 3); assert.equal((await after).value.total, 0);
  coherent(engine.root, [input('blocker', 'stable '.repeat(20)), input('owned', 'blue red')], fields, offsets); await engine.dispose(); released(host);
});

test('stale/incompatible/missing positional providers fail even for empty candidates and cannot silently exclude selected fields', async () => {
  const selected = fixture(); await selected.call('add', input('a')); const root = selected.engine.root, positions = root.participants.positions;
  for (const [changed, code] of [
    [Object.freeze({ ...positions, revision: 0 }), 'REVISION_MISMATCH'],
    [Object.freeze({ ...positions, analyzer: Object.freeze({ ...positions.analyzer, id: 'other' }) }), 'INCOMPATIBLE_CAPABILITY'],
    [Object.freeze({ ...positions, analyzer: Object.freeze({ ...positions.analyzer, environmentProfile: 'different' }) }), 'INCOMPATIBLE_CAPABILITY'],
    [undefined, 'MISSING_CAPABILITY'], [Object.freeze({ ...positions, fields: Object.freeze(['title', 'other']) }), 'MISSING_CAPABILITY'],
  ]) {
    const changedRoot = Object.freeze({ ...root, participants: Object.freeze({ ...root.participants, positions: changed }) });
    for (const text of ['', 'absent']) assert.throws(() => drain(executeSearch(changedRoot, extension(text))), { code });
  }
  const missing = Object.freeze({ ...positions, records: emptyDirectory(), retainedEntries: 0, occurrenceCount: 0, offsetCount: 0, termEntries: 0, termCodeUnits: 0 });
  assert.throws(() => drain(executeSearch(Object.freeze({ ...root, participants: Object.freeze({ positions: missing }) }), extension('red blue'))), { code: 'MISSING_CAPABILITY' });
  coherent(root, [input('a')], fields, offsets); await reference(selected.call, [input('a')], 1); await selected.engine.dispose(); released(selected.host);
});

test('deadlines inside real positional verification and staging unwind iterators and preserve the coherent revision', async () => {
  for (const method of ['search', 'replace']) {
    const tracking = tracker(), selected = fixture(tracking, { limits: { checkpointWorkUnits: 1 } });
    const records = [input('a', 'red gap '.repeat(6) + 'blue', 'stable')]; await selected.call('addMany', records);
    tracking.phase = undefined; const old = selected.engine.root, signal = new FakeSignal();
    const operation = observe(selected.engine[method](method === 'search' ? extension('red blue') : input('a'), { signal, deadlineMs: 5 }));
    while (tracking.phase !== (method === 'search' ? 'position-verify' : 'position-prepare')) assert.equal(selected.host.runNext(), true);
    selected.host.advance(5); selected.host.runReady(); await failed(operation, 'DEADLINE_EXCEEDED');
    assert.equal(selected.engine.root, old); coherent(old, records, fields, offsets); released(selected.host, signal);
    assert.equal(tracking.calls, tracking.closed); assert.equal(tracking.verifiers, tracking.verifierClosures);
    await reference(selected.call, records, 1); await selected.engine.dispose(); released(selected.host);
  }
});

test('every selected host suspension of position phrase search and replacement can abort and recover exact roots, totals and resources', async t => {
  const records = [input('a', 'red gap blue', 'stable'), input('b', 'red blue', 'stable')], replacement = input('a', ['red blue blue', ''], 'stable');
  const after = records.map(record => record.id === 'a' ? replacement : record), diagnostics = [];
  for (const method of ['search', 'replace']) {
    const baseline = fixture(tracker(), { limits: { checkpointWorkUnits: 1 } }); await baseline.call('addMany', records);
    const baselineOutcome = observe(baseline.engine[method](method === 'search' ? extension('red blue') : replacement)), suspensions = baseline.host.runReady();
    assert.equal((await baselineOutcome).status, 'fulfilled'); assert.ok(suspensions > 0); await baseline.engine.dispose(); released(baseline.host);
    let positionSuspensions = 0;
    for (let stop = 0; stop < suspensions; stop++) {
      const tracking = tracker(), selected = fixture(tracking, { limits: { checkpointWorkUnits: 1 } }); await selected.call('addMany', records); tracking.phase = undefined;
      const old = selected.engine.root, before = JSON.stringify(old), signal = new FakeSignal();
      const operation = observe(selected.engine[method](method === 'search' ? extension('red blue') : replacement, { signal }));
      for (let step = 0; step < stop; step++) assert.equal(selected.host.runNext(), true);
      if (tracking.phase === (method === 'search' ? 'position-verify' : 'position-prepare')) positionSuspensions++;
      signal.stop(); await failed(operation, 'CANCELLED'); assert.equal(selected.engine.root, old); assert.equal(JSON.stringify(old), before); coherent(old, records, fields, offsets); released(selected.host, signal);
      assert.equal(tracking.calls, tracking.closed); assert.equal(tracking.verifiers, tracking.verifierClosures);
      if (method === 'replace') { assert.equal((await selected.call('replace', replacement)).revision, 2); coherent(selected.engine.root, after, fields, offsets); }
      await reference(selected.call, method === 'replace' ? after : records, method === 'replace' ? 2 : 1); released(selected.host, signal);
      await selected.engine.dispose(); assert.equal(selected.engine.root, undefined); released(selected.host, signal);
    }
    assert.ok(positionSuspensions > 0); diagnostics.push({ method, suspensionCases: suspensions, positionSuspensionCases: positionSuspensions });
  }
  t.diagnostic(JSON.stringify(diagnostics));
});

test('active/queued disposal releases position roots and listeners, and stale host callbacks cannot republish them', async () => {
  for (const method of ['search', 'replace']) {
    const tracking = tracker(), selected = fixture(tracking, { limits: { checkpointWorkUnits: 1 } }); await selected.call('add', input('a'));
    tracking.phase = undefined; const activeSignal = new FakeSignal(), queuedSignal = new FakeSignal();
    const active = observe(selected.engine[method](method === 'search' ? extension('red blue') : input('a', 'blue red'), { signal: activeSignal }));
    while (tracking.phase !== (method === 'search' ? 'position-verify' : 'position-prepare')) assert.equal(selected.host.runNext(), true);
    const queued = observe(selected.engine.replace(input('a', 'blue red'), { signal: queuedSignal })), callbacks = selected.host.callbacks(), disposal = selected.engine.dispose();
    assert.equal(selected.engine.dispose(), disposal); await failed(active, 'DISPOSED'); await failed(queued, 'DISPOSED'); await disposal;
    assert.equal(selected.engine.root, undefined); released(selected.host, activeSignal, queuedSignal); assert.equal(tracking.verifiers, tracking.verifierClosures); assert.equal(tracking.calls, tracking.closed);
    for (const callback of callbacks) callback(); assert.equal(selected.engine.root, undefined); released(selected.host, activeSignal, queuedSignal);
    await assert.rejects(selected.engine.search(extension('red blue')), { code: 'DISPOSED' });
  }
  const committed = fixture(), signal = new FakeSignal();
  const added = observe(committed.engine.add(input('a'), { signal })); assert.equal(committed.engine.root.revision, 1); signal.stop();
  const changed = observe(committed.engine.replace(input('a', 'blue red'))); assert.equal(committed.engine.root.revision, 2);
  await committed.engine.dispose(); assert.equal((await added).value.revision, 1); assert.equal((await changed).value.revision, 2);
  assert.equal(committed.engine.root, undefined); released(committed.host, signal);
});

test('a positional phrase registration work cap rejects the whole exact-total query and is shared across repeated leaves', async () => {
  const selected = setup(schema, { addons: [createPositionProvider({ fields, offsets }), createPositionPhrases({ fields, maxWorkUnits: 10 })] });
  const records = [input('a', 'red gap '.repeat(5) + 'blue'), input('b')]; await selected.call('addMany', records); const old = selected.engine.root;
  for (const query of [extension('red blue'), { kind: 'or', children: [extension('red blue'), extension('red blue')] }]) {
    await assert.rejects(selected.call('search', query, { limit: 0 }), { code: 'WORK_LIMIT_EXCEEDED' }); assert.equal(selected.engine.root, old); coherent(old, records, fields, offsets);
  }
  await selected.engine.dispose(); released(selected.host);
  let measuredWork = 0;
  const original = createPositionPhrases({ fields });
  const measured = { ...original, refinement: { ...original.refinement, *prepare(context) {
    const prepare = original.refinement.prepare(context); let prepared;
    try { for (;;) { const next = prepare.next(); if (next.done) { prepared = next.value; break; } measuredWork += next.value.workUnits; yield next.value; } }
    finally { prepare.return(undefined); }
    return { *test(id) { const cursor = prepared.test(id); try { for (;;) { const next = cursor.next(); if (next.done) return next.value; measuredWork += next.value.workUnits; yield next.value; } } finally { cursor.return(false); } } };
  } } };
  const baseline = setup(schema, { addons: [createPositionProvider({ fields, offsets }), measured] }); await baseline.call('addMany', records);
  const expected = await baseline.call('search', extension('red blue'), { limit: 0 }); assert.ok(measuredWork > 10); await baseline.engine.dispose();
  const bounded = setup(schema, { addons: [createPositionProvider({ fields, offsets }), createPositionPhrases({ fields, maxWorkUnits: measuredWork })] }); await bounded.call('addMany', records);
  assert.deepEqual(await bounded.call('search', extension('red blue'), { limit: 0 }), expected);
  const boundedOld = bounded.engine.root;
  await assert.rejects(bounded.call('search', { kind: 'or', children: [extension('red blue'), extension('red blue')] }, { limit: 0 }), { code: 'WORK_LIMIT_EXCEEDED' });
  assert.equal(bounded.engine.root, boundedOld); coherent(boundedOld, records, fields, offsets); await bounded.engine.dispose(); released(bounded.host);
});

test('a valid earlier phrase occurrence cannot hide later malformed position-length or original-offset provider data', async () => {
  const selected = fixture(); await selected.call('add', input('a', ['red blue', 'red blue']));
  const root = selected.engine.root, positionRoot = root.participants.positions, record = directoryGet(positionRoot.records, 'a');
  for (const patch of [{ positionLength: 2 }, { position: NaN }, { start: undefined }, { end: 0 }]) {
    const originalValue = record.positions.title[1], terms = Object.assign(Object.create(null), originalValue.terms, { red: Object.freeze([Object.freeze({ ...originalValue.terms.red[0], ...patch })]) });
    const values = Object.freeze([record.positions.title[0], Object.freeze({ ...originalValue, terms: Object.freeze(terms) })]);
    const positions = Object.freeze(Object.assign(Object.create(null), record.positions, { title: values })), replacement = Object.freeze({ ...record, positions });
    const stage = new DirectoryStage(positionRoot.records, workUnits => ({ workUnits })); drain(stage.set('a', replacement)); const records = drain(stage.finish()).value;
    const corrupted = Object.freeze({ ...root, participants: Object.freeze({ positions: Object.freeze({ ...positionRoot, records }) }) });
    assert.throws(() => drain(executeSearch(corrupted, extension('red blue', ['title']))), { code: 'INCOMPATIBLE_CAPABILITY' });
  }
  coherent(root, [input('a', ['red blue', 'red blue'])], fields, offsets); await selected.engine.dispose(); released(selected.host);
});
