import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { initializeParticipants } from '../../../dist/core/capabilities/participants.js';
import { emptyRoot, ExecutionOwner } from '../../../dist/core/execution/engine.js';
import { directoryEntries, directoryGet } from '../../../dist/core/index/directory.js';
import { emptyDirectory } from '../../../dist/core/index/staging.js';
import { inspectIndex } from '../../../dist/core/index/invariants.js';
import { executeSearch } from '../../../dist/core/query/search.js';
import { RaveldexError } from '../../../dist/core/errors/error.js';
import { FakeHost, FakeSignal } from '../../fixtures/execution/host.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../../oracle/phrases.mjs';
import { compare, drain, extension, nativeQuery, setup } from './helpers.mjs';

const schema = { text: { title: { boost: 2 }, body: {} }, metadata: { tags: { type: 'string', multi: true } } };
const input = (id, title = 'red blue', body = 'stable red') => ({ id, text: { title, body }, metadata: { tags: ['original'] } });
const phrase = { kind: 'phrase', text: 'red blue' };
const recoveryQuery = { kind: 'or', children: [phrase, { kind: 'text', text: 'stable' }] };

function observe(promise) {
  return promise.then(value => ({ status: 'fulfilled', value }), error => ({ status: 'rejected', error }));
}
async function failed(outcome, code) {
  const result = await outcome;
  assert.equal(result.status, 'rejected'); assert.ok(result.error instanceof RaveldexError); assert.equal(result.error.code, code);
  return result.error;
}
function released(host, ...signals) {
  assert.equal(host.pending, 0, 'deadline and continuation tasks released');
  for (const signal of signals) assert.equal(signal.listenerCount, 0, 'abort listener released');
}
function selectedValues(record, field) {
  return Object.hasOwn(record.text, field) ? typeof record.text[field] === 'string' ? [record.text[field]] : record.text[field] : undefined;
}
function coherent(root, records, fields = ['title', 'body'], sourceId = 'source') {
  drain(inspectIndex(root));
  const source = root.participants[sourceId];
  assert.equal(source.revision, root.revision); assert.deepEqual(source.analyzer, root.configuration.analyzer);
  assert.ok(Object.isFrozen(source) && Object.isFrozen(source.records) && Object.isFrozen(source.records.buckets));
  assert.deepEqual([...directoryEntries(root.documents)].map(([id]) => id).sort(), records.map(record => record.id).sort());
  assert.deepEqual([...directoryEntries(source.records)].map(([id]) => id).sort(), records.map(record => record.id).sort());
  let entries = 0, codeUnits = 0;
  for (const record of records) {
    const retained = directoryGet(source.records, record.id);
    assert.ok(Object.isFrozen(retained) && Object.isFrozen(retained.text));
    assert.deepEqual(Object.keys(retained).sort(), ['retainedEntries', 'text', 'textCodeUnits']);
    let ownEntries = 1, ownUnits = 0;
    for (const field of fields) {
      const values = selectedValues(record, field);
      if (values === undefined) { assert.equal(Object.hasOwn(retained.text, field), false); continue; }
      assert.deepEqual(retained.text[field], values); assert.ok(Object.isFrozen(retained.text[field]));
      ownEntries += 1 + values.length; ownUnits += values.reduce((total, value) => total + value.length, 0);
    }
    assert.deepEqual(Object.keys(retained.text).sort(), fields.filter(field => Object.hasOwn(record.text, field)).sort());
    assert.equal(retained.retainedEntries, ownEntries); assert.equal(retained.textCodeUnits, ownUnits);
    entries += ownEntries; codeUnits += ownUnits;
  }
  assert.equal(source.retainedEntries, entries); assert.equal(source.textCodeUnits, codeUnits);
}
async function reference(call, records, revision, queries = [phrase, recoveryQuery, { kind: 'not', child: phrase }]) {
  const corpus = scanPhraseSourceCorpus(records, schema);
  for (const query of queries) compare(await call('search', nativeQuery(query), { limit: 100 }), sourcePhraseQueryResult(corpus, query, { limit: 100 }), revision);
}
function instrumentedSource(tracker, options = {}) {
  const source = createSourceProvider({ fields: ['title', 'body'], ...options });
  return { ...source, participant: { initialize: source.participant.initialize, *prepare(previous, context) {
    tracker.calls++; tracker.context = context;
    const cursor = source.participant.prepare(previous, context);
    try {
      for (;;) {
        const step = cursor.next();
        if (step.done) { tracker.prepared = step.value; return step.value; }
        tracker.phase = 'source-prepare'; tracker.sourceSteps++;
        yield step.value; tracker.phase = undefined;
      }
    } finally { cursor.return(undefined); tracker.closed++; tracker.phase = undefined; }
  } } };
}
function instrumentedPhrases(tracker) {
  const phrases = createSourcePhrases({ fields: ['title', 'body'] });
  return { ...phrases, refinement: { ...phrases.refinement, *prepare(context) {
    const prepared = yield* phrases.refinement.prepare(context);
    return { *test(id) {
      tracker.verifiers++;
      const cursor = prepared.test(id);
      try {
        for (;;) {
          const step = cursor.next();
          if (step.done) return step.value;
          tracker.phase = 'source-verify'; tracker.scanSteps++;
          yield step.value; tracker.phase = undefined;
        }
      } finally { cursor.return(false); tracker.verifiersClosed++; tracker.phase = undefined; }
    } };
  } } };
}
function tracker() { return { calls: 0, closed: 0, sourceSteps: 0, verifiers: 0, verifiersClosed: 0, scanSteps: 0, phase: undefined, prepared: undefined, context: undefined }; }

test('real source/core roots publish one revision, preserve old snapshots and reset every mutation/no-op lifecycle', async () => {
  const tracking = tracker(), { engine, call, host } = setup(schema, { addons: [createSourcePhrases({ fields: ['title', 'body'] }), instrumentedSource(tracking)] });
  const start = engine.root;
  for (const [method, argument] of [['clear'], ['addMany', []], ['remove', []], ['remove', ['absent']]]) assert.equal((await call(method, argument)).changed, false);
  assert.equal(engine.root, start); assert.equal(tracking.calls, 0); coherent(engine.root, []);
  let records = [input('a'), input('b', ['red', 'blue']), { id: 'missing-field', text: {}, metadata: { tags: [] } }];
  assert.equal((await call('addMany', records)).revision, 1); coherent(engine.root, records); await reference(call, records, 1);
  assert.ok(Object.isFrozen(tracking.context) && Object.isFrozen(tracking.context.records));
  assert.equal(Object.hasOwn(tracking.context, 'core'), false); assert.equal(Object.hasOwn(tracking.context, 'previous'), false);
  const old = engine.root, oldJson = JSON.stringify(old), oldExpected = drain(executeSearch(old, extension('red blue'), { limit: 100 })).value;
  const replacement = input('a', 'blue red'); records = records.map(record => record.id === 'a' ? replacement : record);
  assert.equal((await call('replace', replacement)).revision, 2); coherent(engine.root, records); await reference(call, records, 2);
  assert.equal(JSON.stringify(old), oldJson); assert.deepEqual(drain(executeSearch(old, extension('red blue'), { limit: 100 })).value, oldExpected);
  assert.equal((await call('replace', replacement)).revision, 3); coherent(engine.root, records);
  assert.equal((await call('remove', ['b', 'absent'])).removed, 1); records = records.filter(record => record.id !== 'b');
  coherent(engine.root, records); await reference(call, records, 4);
  assert.equal((await call('clear')).revision, 5); coherent(engine.root, []);
  const cleared = engine.root; assert.equal((await call('clear')).changed, false); assert.equal(engine.root, cleared);
  assert.equal((await call('add', input('repopulated'))).revision, 6); coherent(engine.root, [input('repopulated')]);
  assert.equal(tracking.calls, 6); assert.equal(tracking.closed, 6);
  await engine.dispose(); assert.equal(engine.root, undefined); released(host);
});

test('late malformed batches and selected-source caps roll back the complete core/source root and permit recovery', async () => {
  const { engine, call, host } = setup(schema, { limits: { checkpointWorkUnits: 1 } });
  const records = [input('a')]; await call('addMany', records);
  const old = engine.root, before = JSON.stringify(old);
  for (const [method, value, code] of [
    ['addMany', [input('new'), input('late', 'late \ud800')], 'INVALID_RECORD'],
    ['addMany', [input('new'), input('a')], 'ID_EXISTS'],
    ['replace', input('missing'), 'ID_NOT_FOUND'],
  ]) {
    const signal = new FakeSignal(); await assert.rejects(call(method, value, { signal }), { code });
    assert.equal(engine.root, old); assert.equal(JSON.stringify(old), before); coherent(engine.root, records); await reference(call, records, 1); released(host, signal);
  }
  await call('add', input('recovered')); coherent(engine.root, [...records, input('recovered')]); await engine.dispose(); released(host);
  const capped = setup(schema, { addons: [createSourceProvider({ fields: ['title', 'body'], maxRetainedEntries: 6 }), createSourcePhrases({ fields: ['title', 'body'] })] });
  await capped.call('add', input('a')); const capRoot = capped.engine.root;
  const signal = new FakeSignal(); await assert.rejects(capped.call('add', input('b'), { signal }), { code: 'LIMIT_EXCEEDED' });
  assert.equal(capped.engine.root, capRoot); coherent(capped.engine.root, records); await reference(capped.call, records, 1); released(capped.host, signal);
  await capped.call('replace', input('a', 'red red blue')); coherent(capped.engine.root, [input('a', 'red red blue')]);
  await capped.engine.dispose(); released(capped.host);
});

test('a later public participant failure cannot publish a real source root that already finished preparation', async () => {
  const tracking = tracker(), source = instrumentedSource(tracking);
  let fail = true, engine;
  const later = { manifest: { ...source.manifest, id: 'later', provides: [{ id: 'later-state', contractVersion: 1 }], requires: [{ id: 'source:title', contractVersion: 1 }],
    dataRequirements: { fields: [], source: false, positions: false, offsets: false, metadata: false } }, participant: {
    initialize: () => Object.freeze({ revision: 0 }),
    *prepare(previous, context) {
      assert.equal(tracking.prepared.revision, context.revision); assert.equal(engine.root.revision, context.previousRevision);
      assert.equal(engine.root.participants.source.revision, context.previousRevision);
      yield { workUnits: 1 };
      if (fail) throw new RaveldexError('RESOURCE_EXHAUSTED');
      return Object.freeze({ revision: context.revision });
    },
  } };
  const fixture = setup(schema, { addons: [later, createSourcePhrases({ fields: ['title', 'body'] }), source], limits: { checkpointWorkUnits: 1 } });
  engine = fixture.engine; const old = engine.root;
  await assert.rejects(fixture.call('add', input('a')), { code: 'RESOURCE_EXHAUSTED' });
  assert.equal(tracking.prepared.revision, 1); assert.equal(engine.root, old); coherent(engine.root, []); released(fixture.host);
  fail = false; await fixture.call('add', input('a')); coherent(engine.root, [input('a')]); await reference(fixture.call, [input('a')], 1);
  assert.equal(engine.root.participants.later.revision, 1); await engine.dispose(); released(fixture.host);
});

test('selected-field retention excludes other originals/metadata and omitted record fields are ordinary phrase nonmatches', async () => {
  const options = { fields: ['title'] }, source = createSourceProvider(options), phrases = createSourcePhrases(options);
  options.fields[0] = 'body';
  const { engine, call, host } = setup(schema, { addons: [source, phrases] });
  const records = [input('matching'), { id: 'body-only', text: { body: 'red blue' }, metadata: { tags: ['secret'] } }, { id: 'values', text: { title: ['red', 'blue'] } }];
  await call('addMany', records); coherent(engine.root, records, ['title']);
  compare(await call('search', extension('red blue', ['title'])), sourcePhraseQueryResult(scanPhraseSourceCorpus(records, schema), { ...phrase, fields: ['title'] }), 1);
  for (const text of ['red blue', 'absent', '']) await assert.rejects(call('search', extension(text, ['title', 'body'])), { code: 'MISSING_CAPABILITY' });
  const retained = directoryGet(engine.root.participants.source.records, 'matching');
  assert.equal(retained.text.body, undefined); assert.equal(retained.metadata, undefined);
  assert.throws(() => { retained.text.title[0] = 'mutated'; }, TypeError);
  assert.throws(() => { retained.text.body = ['mutated']; }, TypeError);
  assert.throws(() => { engine.root.participants.source.revision = 42; }, TypeError);
  await engine.dispose(); released(host);
});

test('queued phrase payloads and original arrays are owned before callers mutate them; FIFO queries use their actual revision', async () => {
  const { engine, host } = setup(schema, { limits: { checkpointWorkUnits: 1 } });
  const blocker = observe(engine.add(input('blocker', 'stable '.repeat(20))));
  const original = input('owned', ['red blue', 'a a b']), originals = original.text.title;
  const added = observe(engine.add(original));
  const query = extension('red blue', ['title']), options = { limit: 100, deadlineMs: 100 };
  const readBefore = observe(engine.search(query, options));
  const changed = input('owned', 'blue red'), replaced = observe(engine.replace(changed));
  const readAfter = observe(engine.search(extension('red blue', ['title'])));
  original.id = 'later'; originals[0] = 'later'; original.text.body = 'later'; original.metadata.tags.push('later');
  query.payload.text = 'later'; query.payload.fields[0] = 'body'; options.limit = 0; options.deadlineMs = 1; changed.text.title = 'later';
  host.advance(2); host.runReady();
  assert.equal((await blocker).value.revision, 1); assert.equal((await added).value.revision, 2);
  const before = (await readBefore).value; assert.equal(before.revision, 2); assert.deepEqual(before.hits.map(hit => hit.id), ['owned']);
  assert.equal((await replaced).value.revision, 3); assert.equal((await readAfter).value.total, 0); assert.equal((await readAfter).value.revision, 3);
  assert.equal(directoryGet(engine.root.participants.source.records, 'owned').text.title[0], 'blue red');
  coherent(engine.root, [input('blocker', 'stable '.repeat(20)), input('owned', 'blue red')]);
  await engine.dispose(); released(host);
});

test('stale/incompatible source fails before an empty lexical candidate set; missing authoritative candidate records fail explicitly', async () => {
  const { engine, call, host } = setup(schema); await call('add', input('a'));
  const root = engine.root, source = root.participants.source;
  for (const [changed, code] of [
    [Object.freeze({ ...source, revision: 0 }), 'REVISION_MISMATCH'],
    [Object.freeze({ ...source, analyzer: Object.freeze({ ...source.analyzer, id: 'other-v1' }) }), 'INCOMPATIBLE_CAPABILITY'],
    [Object.freeze({ ...source, analyzer: Object.freeze({ ...source.analyzer, environmentProfile: 'other' }) }), 'INCOMPATIBLE_CAPABILITY'],
    [undefined, 'MISSING_CAPABILITY'],
  ]) {
    const corrupt = Object.freeze({ ...root, participants: Object.freeze({ source: changed }) });
    for (const text of ['absent', '']) assert.throws(() => drain(executeSearch(corrupt, extension(text))), { code });
  }
  const missing = Object.freeze({ ...source, records: emptyDirectory(), retainedEntries: 0, textCodeUnits: 0 });
  const corrupt = Object.freeze({ ...root, participants: Object.freeze({ source: missing }) });
  assert.throws(() => drain(executeSearch(corrupt, extension('red blue'))), { code: 'MISSING_CAPABILITY' });
  coherent(engine.root, [input('a')]); await reference(call, [input('a')], 1); await engine.dispose(); released(host);
});

test('deadline during real source verification/preparation unwinds work and leaves the old root coherent', async () => {
  for (const method of ['search', 'replace']) {
    const tracking = tracker(), fixture = setup(schema, { addons: [instrumentedSource(tracking), instrumentedPhrases(tracking)], limits: { checkpointWorkUnits: 1 } });
    const records = [input('a', 'red gap '.repeat(8) + 'blue', 'stable')]; await fixture.call('addMany', records);
    tracking.phase = undefined; const old = fixture.engine.root, signal = new FakeSignal();
    const operation = observe(fixture.engine[method](method === 'search' ? extension('red blue') : input('a', 'red blue'), { signal, deadlineMs: 5 }));
    const phase = method === 'search' ? 'source-verify' : 'source-prepare';
    while (tracking.phase !== phase) assert.equal(fixture.host.runNext(), true, `operation reached ${phase}`);
    fixture.host.advance(5); fixture.host.runReady(); await failed(operation, 'DEADLINE_EXCEEDED');
    assert.equal(fixture.engine.root, old); coherent(old, records); released(fixture.host, signal);
    assert.equal(tracking.verifiers, tracking.verifiersClosed); assert.equal(tracking.calls, tracking.closed);
    await reference(fixture.call, records, 1); await fixture.engine.dispose(); released(fixture.host);
  }
});

test('every host suspension in phrase search and replacement can abort and recover exact revision/membership/resources', async t => {
  const records = [input('a', 'red gap blue', 'stable'), input('b', 'red blue', 'stable')];
  const replacement = input('a', 'red blue blue', 'stable');
  const after = records.map(record => record.id === 'a' ? replacement : record);
  const diagnostics = [];
  for (const method of ['search', 'replace']) {
    const baselineTracking = tracker(), baseline = setup(schema, { addons: [instrumentedSource(baselineTracking), instrumentedPhrases(baselineTracking)], limits: { checkpointWorkUnits: 1 } });
    await baseline.call('addMany', records); baseline.host.executed = 0;
    const baselineOutcome = observe(baseline.engine[method](method === 'search' ? extension('red blue') : replacement));
    const suspensions = baseline.host.runReady(); assert.equal((await baselineOutcome).status, 'fulfilled');
    assert.ok(suspensions > 0); await baseline.engine.dispose(); released(baseline.host);
    let sourceSuspensions = 0;
    for (let stop = 0; stop < suspensions; stop++) {
      const tracking = tracker(), fixture = setup(schema, { addons: [instrumentedSource(tracking), instrumentedPhrases(tracking)], limits: { checkpointWorkUnits: 1 } });
      await fixture.call('addMany', records); tracking.phase = undefined;
      const old = fixture.engine.root, oldJson = JSON.stringify(old), signal = new FakeSignal();
      const operation = observe(fixture.engine[method](method === 'search' ? extension('red blue') : replacement, { signal }));
      for (let i = 0; i < stop; i++) assert.equal(fixture.host.runNext(), true);
      if (tracking.phase === (method === 'search' ? 'source-verify' : 'source-prepare')) sourceSuspensions++;
      signal.stop(); await failed(operation, 'CANCELLED');
      assert.equal(fixture.engine.root, old); assert.equal(JSON.stringify(old), oldJson); coherent(old, records); released(fixture.host, signal);
      assert.equal(tracking.calls, tracking.closed); assert.equal(tracking.verifiers, tracking.verifiersClosed);
      if (method === 'replace') { assert.equal((await fixture.call('replace', replacement)).revision, 2); coherent(fixture.engine.root, after); }
      const expectedRecords = method === 'replace' ? after : records, revision = method === 'replace' ? 2 : 1;
      compare(await fixture.call('search', nativeQuery(recoveryQuery), { limit: 100 }), sourcePhraseQueryResult(scanPhraseSourceCorpus(expectedRecords, schema), recoveryQuery, { limit: 100 }), revision);
      released(fixture.host, signal); await fixture.engine.dispose(); assert.equal(fixture.engine.root, undefined); released(fixture.host, signal);
    }
    assert.ok(sourceSuspensions > 0, `sweep reached real ${method === 'search' ? 'source verification' : 'source preparation'} yields`);
    diagnostics.push({ method, suspensionCases: suspensions, sourceSuspensionCases: sourceSuspensions });
  }
  t.diagnostic(JSON.stringify(diagnostics));
});

test('active/queued disposal releases source roots, listeners and stale callbacks; committed source results keep their revision', async () => {
  const { engine, call, host } = setup(schema, { limits: { checkpointWorkUnits: 1 } }); await call('add', input('a'));
  const activeSignal = new FakeSignal(), queuedSignal = new FakeSignal();
  const active = observe(engine.search(extension('red blue'), { signal: activeSignal }));
  const queued = observe(engine.replace(input('a', 'blue red'), { signal: queuedSignal }));
  const callbacks = host.callbacks(), disposal = engine.dispose(); assert.equal(engine.dispose(), disposal);
  await failed(active, 'DISPOSED'); await failed(queued, 'DISPOSED'); await disposal;
  assert.equal(engine.root, undefined); released(host, activeSignal, queuedSignal);
  for (const callback of callbacks) callback(); assert.equal(engine.root, undefined); released(host, activeSignal, queuedSignal);
  await assert.rejects(engine.search(extension('red blue')), { code: 'DISPOSED' });
  const completed = setup(schema); const signal = new FakeSignal();
  const committed = observe(completed.engine.add(input('a'), { signal })); assert.equal(completed.engine.root.revision, 1);
  signal.stop(); const newer = observe(completed.engine.replace(input('a', 'blue red'))); assert.equal(completed.engine.root.revision, 2);
  await completed.engine.dispose(); assert.equal((await committed).value.revision, 1); assert.equal((await newer).value.revision, 2);
  assert.equal(completed.engine.root, undefined); released(completed.host, signal);
});

test('handler yields respect disposal, abort, deadline, then shared work failure in all implemented roles', async () => {
  for (const phase of ['participant', 'refinement-prepare', 'refinement-test']) for (const stop of ['disposed', 'abort', 'deadline', 'work']) {
    const source = createSourceProvider({ fields: ['title', 'body'] }), phrases = createSourcePhrases({ fields: ['title', 'body'] });
    const signal = new FakeSignal(); let armed = false, entered = 0, closed = 0, fixture, disposal;
    function* stopStep() {
      entered++;
      try {
        if (stop !== 'work') fixture.host.advance(5);
        if (stop === 'disposed' || stop === 'abort') signal.stop(false);
        if (stop === 'disposed') disposal = fixture.engine.dispose();
        yield { workUnits: 5_001 };
      } finally { closed++; }
    }
    const provided = { ...source, participant: { initialize: source.participant.initialize, *prepare(previous, context) {
      const next = yield* source.participant.prepare(previous, context);
      if (armed && phase === 'participant') yield* stopStep();
      return next;
    } } };
    const refined = { ...phrases, refinement: { ...phrases.refinement, *prepare(context) {
      const prepared = yield* phrases.refinement.prepare(context);
      if (armed && phase === 'refinement-prepare') yield* stopStep();
      return { *test(id) { if (armed && phase === 'refinement-test') yield* stopStep(); return yield* prepared.test(id); } };
    } } };
    fixture = setup(schema, { addons: [provided, refined], limits: { maxMutationWorkUnits: 5_000, maxSearchWorkUnits: 5_000, checkpointWorkUnits: 1 } });
    await fixture.call('add', input('a')); const old = fixture.engine.root; armed = true;
    const operation = observe(phase === 'participant' ? fixture.engine.replace(input('a', 'blue red'), { signal, deadlineMs: 5 }) : fixture.engine.search(extension('red blue'), { signal, deadlineMs: 5 }));
    fixture.host.runReady(); await failed(operation, { disposed: 'DISPOSED', abort: 'CANCELLED', deadline: 'DEADLINE_EXCEEDED', work: 'WORK_LIMIT_EXCEEDED' }[stop]);
    assert.equal(entered, 1); assert.equal(closed, 1); released(fixture.host, signal);
    if (stop === 'disposed') { await disposal; assert.equal(fixture.engine.root, undefined); }
    else { assert.equal(fixture.engine.root, old); coherent(old, [input('a')]); armed = false; await reference(fixture.call, [input('a')], 1); await fixture.engine.dispose(); }
    released(fixture.host, signal);
  }
});

test('phrase source scanning joins the shared search budget and a manifest cap rejects partial verification', async () => {
  const records = [input('a', 'red gap '.repeat(5) + 'blue'), input('b', 'red blue')], fixture = setup(schema);
  await fixture.call('addMany', records); const root = fixture.engine.root;
  const complete = drain(executeSearch(root, extension('red blue'), { limit: 100 }));
  const configuration = captureConfiguration({ schema, addons: [createSourceProvider({ fields: ['title', 'body'] }), createSourcePhrases({ fields: ['title', 'body'] })], limits: { maxSearchWorkUnits: complete.workUnits - 1, checkpointWorkUnits: 1 } });
  const limitedRoot = Object.freeze({ ...root, configuration }), host = new FakeHost(), limited = new ExecutionOwner(limitedRoot, host, initializeParticipants(configuration).participants);
  const signal = new FakeSignal(), operation = observe(limited.search(extension('red blue'), { signal, limit: 100 }));
  host.runReady(); await failed(operation, 'WORK_LIMIT_EXCEEDED'); assert.equal(limited.root, limitedRoot); coherent(limited.root, records); released(host, signal);
  await limited.dispose(); released(host); await fixture.engine.dispose(); released(fixture.host);
  const capped = setup(schema, { addons: [createSourceProvider({ fields: ['title', 'body'] }), createSourcePhrases({ fields: ['title', 'body'], maxWorkUnits: 20 })] });
  await capped.call('addMany', records); const old = capped.engine.root;
  await assert.rejects(capped.call('search', extension('red blue'), { limit: 0 }), { code: 'WORK_LIMIT_EXCEEDED' });
  assert.equal(capped.engine.root, old); coherent(old, records); await capped.engine.dispose(); released(capped.host);
});
