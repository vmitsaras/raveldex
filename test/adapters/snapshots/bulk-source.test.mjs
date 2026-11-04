import test from 'node:test';
import assert from 'node:assert/strict';
import { RaveldexError } from '../../../dist/index.js';
import { createSnapshots, currentNodeSnapshotEnvironment } from '../../../dist/adapters/snapshots/index.js';
import { createQualifiedSnapshotEngine } from '../../../dist/adapters/snapshots/snapshots.js';
import { getExecutionOwner } from '../../../dist/core/execution/engine.js';
import { inspectIndex } from '../../../dist/core/index/invariants.js';
import { bulkParticipant } from '../../../dist/core/capabilities/bulk-participant.js';
import { createSourceProvider } from '../../../dist/addons/phrases/source.js';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { createPositionPhrases } from '../../../dist/addons/positions/phrases.js';
import { createEnglishAnalyzer, ENGLISH_ANALYZER } from '../../../dist/integrations/languages/english/index.js';
import { createIdentifierAnalyzer, IDENTIFIER_ANALYZER } from '../../../dist/addons/identifiers/index.js';
import { FakeHost, FakeSignal } from '../../fixtures/execution/host.mjs';
import { schema, records, phrase } from '../../fixtures/snapshots/records.mjs';
import { alter, bodyText, checksum, byId } from '../../fixtures/snapshots/integrity.mjs';
import { addonsFor, inspectSemantics, withoutRevision, plain, close } from './semantics.mjs';
import { replay } from '../../addons/inspector/helpers.mjs';

const qualification = () => ({ profileId: 'rx-8008-test-declared-node', scope: 'exact-node-runtime', environment: currentNodeSnapshotEnvironment(), evidence: ['test/adapters/snapshots/bulk-source.test.mjs: declared matching-host contract fixture; no cross-host qualification claim'] });
function fixture(configuration = {}) {
  const host = new FakeHost(), metrics = { workUnits: 0, steps: 0, hostYields: 0, maxTaskWorkUnits: 0, maxStepWorkUnits: 0, checks: 0, phaseChecks: {} };
  const engine = createQualifiedSnapshotEngine({ schema, addons: addonsFor('offsets', true), ...configuration, limits: { checkpointWorkUnits: 128, maxMutationBatch: 2, ...configuration.limits } }, qualification(), host, metrics);
  const snapshots = createSnapshots(engine);
  return { host, metrics, engine, snapshots, owner: getExecutionOwner(engine),
    async call(method, ...args) { const pending = engine[method](...args); host.runReady(); return pending; },
    async snapshot(method, ...args) { const pending = snapshots[method](...args); host.runReady(); return pending; },
  };
}
const observe = pending => pending.then(value => ({ value }), error => ({ error }));
const drain = cursor => { for (;;) { const step = cursor.next(); if (step.done) return step.value; } };
async function append(f, input) { for (const record of input) await f.call('add', record); }
async function drive(f, pending) {
  let settled = false;
  const result = pending.finally(() => { settled = true; });
  for (let count = 0; !settled; count++) {
    assert.ok(count < 100_000, 'nested public operations did not settle');
    f.host.runReady(); await Promise.resolve();
  }
  return result;
}
function unchanged(f, root, signal) {
  assert.equal(f.owner.root, root); assert.equal(f.owner.root.documents, root.documents);
  assert.equal(f.owner.root.fields, root.fields); assert.equal(f.owner.root.participants, root.participants);
  for (const id of Object.keys(root.participants)) assert.equal(f.owner.root.participants[id], root.participants[id]);
  assert.equal(f.host.pending, 0); if (signal) assert.equal(signal.listenerCount, 0);
}
// Compare all persisted core/sidecar data, including every reverse term,
// posting, retained counter and offset. The AVL is derived: validate its complete
// membership, height and balance separately rather than prescribing its shape.
function state(root) {
  drain(inspectIndex(root));
  return withoutRevision(plain({ documents: root.documents, fields: Object.fromEntries(Object.entries(root.fields).map(([name, { order, ...field }]) => [name, field])), counts: root.counts, participants: root.participants }));
}
function canonicalSource(encoded) {
  const body = bodyText(encoded).replace(/"originRevision":\d+/, '"originRevision":0');
  return encoded.replace(bodyText(encoded), body).replace(/("integrity":\{"algorithm":"fnv1a32-utf16","value":")[0-9a-f]+/, (_match, prefix) => prefix + checksum(body));
}

for (const kind of ['source', 'offsets', 'mixed']) {
  test(`bulk source reconstruction equals sequential per-record ${kind} state, complete wire payload and later writes`, async () => {
    const donor = fixture({ addons: addonsFor(kind, true) }), legacy = fixture({ addons: addonsFor(kind, true) }), target = fixture({ addons: addonsFor(kind, true) });
    try {
      await append(donor, records);
      const source = await donor.snapshot('exportSource');
      // The old source loop saw payload encounter order, which need not equal
      // insertion order because source records traverse hash directories.
      await append(legacy, JSON.parse(source).body.payload.records);
      await target.call('add', { id: 'old', text: { title: 'old-state' } });
      const before = target.owner.root, receipt = await target.snapshot('restore', source);
      assert.equal(receipt.revision, before.revision + 1); assert.equal(receipt.originRevision, records.length);
      assert.deepEqual(state(target.owner.root), state(legacy.owner.root));
      assert.deepEqual(withoutRevision(JSON.parse(await target.snapshot('exportNative')).body.payload), withoutRevision(JSON.parse(await legacy.snapshot('exportNative')).body.payload));
      assert.equal(canonicalSource(await target.snapshot('exportSource')), canonicalSource(await legacy.snapshot('exportSource')));
      // Semantic helper performs literal membership, phrases, facets, evidence
      // and source coordinate assertions independently of the reconstruction.
      const expected = await drive(legacy, inspectSemantics(legacy.engine, kind, true));
      assert.deepEqual(withoutRevision(await drive(target, inspectSemantics(target.engine, kind, true))), withoutRevision(expected));
      const inspection = { limit: 100, extensions: { inspector: { ids: records.map(record => record.id) }, facets: { fields: [{ field: 'tags', missing: true }] } } };
      const traced = await target.call('search', 'red blue', inspection);
      assert.deepEqual(withoutRevision(traced), withoutRevision(await legacy.call('search', 'red blue', inspection)));
      assert.ok(replay(traced.extensions.inspector, traced) > 0, 'replay actual field and group score arithmetic from complete trace');
      for (const method of ['replace', 'remove', 'add']) {
        const input = method === 'replace' ? { id: 'a', text: { title: 'new red red', body: [] }, metadata: { tags: ['new'] } } : method === 'remove' ? 'b' : { id: 'after', text: { title: 'red blue' } };
        await legacy.call(method, input); await target.call(method, input);
        assert.deepEqual(state(target.owner.root), state(legacy.owner.root));
      }
    } finally { await donor.engine.dispose(); await legacy.engine.dispose(); await target.engine.dispose(); }
  });
}

const unicodeRecords = [
  { id: 'astral', text: { title: ['😀 cafe\u0301 ﬁle', 'fooBar fooBar WORK_LIMIT running searches'], body: [] }, metadata: { tags: ['x', 'x', null], price: [2, 1, 2], active: true } },
  { id: 'empty-array', text: { title: [], body: [''] }, metadata: { tags: [] } },
  { id: 'missing', text: {} },
  { id: 'repeat', text: { title: ['red red red', 'red'], body: 'running fooBar' } },
];
for (const selection of ['basic', 'english', 'identifiers']) {
  test(`bulk source preserves full ${selection} reverse and position representation, Unicode offsets and value boundaries`, async () => {
    const configuration = () => ({ addons: [createSourceProvider({ fields: ['title', 'body'] }), createPositionProvider({ fields: ['title', 'body'], offsets: ['title', 'body'] }), createPositionPhrases({ fields: ['title', 'body'] }), ...(selection === 'english' ? [createEnglishAnalyzer()] : selection === 'identifiers' ? [createIdentifierAnalyzer()] : [])], ...(selection === 'english' ? { analyzer: ENGLISH_ANALYZER } : selection === 'identifiers' ? { analyzer: IDENTIFIER_ANALYZER } : {}) });
    const donor = fixture(configuration()), legacy = fixture(configuration()), target = fixture(configuration());
    try {
      await append(donor, unicodeRecords); const encoded = await donor.snapshot('exportSource');
      await append(legacy, JSON.parse(encoded).body.payload.records); await target.snapshot('restore', encoded);
      assert.deepEqual(state(target.owner.root), state(legacy.owner.root));
      assert.equal(canonicalSource(await target.snapshot('exportSource')), canonicalSource(await legacy.snapshot('exportSource')));
      const positions = Object.values(target.owner.root.participants).find(root => root.kind.startsWith('raveldex-positions-'));
      assert.equal(positions.kind, selection === 'identifiers' ? 'raveldex-positions-v2' : 'raveldex-positions-v1');
      const values = byId(positions.records, 'astral').positions.title;
      const cafe = Object.values(values[0].terms).flat().find(item => item.start === 3);
      assert.deepEqual(plain(cafe), { position: 0, positionLength: 1, ...(selection === 'identifiers' ? { kind: 'original' } : {}), start: 3, end: 8 });
      assert.deepEqual(plain(byId(positions.records, 'empty-array').positions.title), []);
      assert.equal(Object.hasOwn(byId(positions.records, 'missing').positions, 'title'), false);
      if (selection === 'identifiers') {
        assert.equal(values[1].originalCount, 5); assert.ok(values[1].tokenCount > values[1].originalCount);
        assert.deepEqual(plain(values[1].terms.foo[0]), { position: 0, positionLength: 1, kind: 'component', start: 0, end: 3 });
      }
      for (const query of ['red', 'café', 'file', 'run', 'foo', 'fooBar', phrase('red red', ['title']), phrase('red red red red', ['title'])]) {
        assert.deepEqual(withoutRevision(await target.call('search', query)), withoutRevision(await legacy.call('search', query)));
      }
      assert.equal((await target.call('search', phrase('red red red red', ['title']))).total, 0, 'phrases cannot cross original value boundaries');
      // Native export validates every retained occurrence and its correspondence
      // to the complete reverse-frequency core after the single publication.
      assert.deepEqual(withoutRevision(JSON.parse(await target.snapshot('exportNative')).body.payload), withoutRevision(JSON.parse(await legacy.snapshot('exportNative')).body.payload));
    } finally { await donor.engine.dispose(); await legacy.engine.dispose(); await target.engine.dispose(); }
  });
}

test('bulk source hand-derived BM25 scores retain the positive-length population and repeated term frequency', async () => {
  const configuration = { schema: { text: { title: { boost: 2 } } }, addons: [createSourceProvider({ fields: ['title'] })] };
  const donor = fixture(configuration), target = fixture(configuration);
  try {
    await append(donor, [{ id: 'a', text: { title: 'red red blue' } }, { id: 'b', text: { title: 'red' } }, { id: 'empty', text: { title: ['', '!!!'] } }, { id: 'absent', text: {} }]);
    await target.snapshot('restore', await donor.snapshot('exportSource'));
    const idf = Math.log(1 + .5 / 2.5), expected = { a: 2 * idf * 4.4 / (2 + 1.2 * (.25 + .75 * 3 / 2)), b: 2 * idf * 2.2 / (1 + 1.2 * (.25 + .75 / 2)) };
    const result = await target.call('search', 'red'); assert.equal(result.total, 2); assert.deepEqual(result.hits.map(hit => hit.id), ['b', 'a']);
    for (const hit of result.hits) close(hit.score, expected[hit.id]);
    assert.equal(target.owner.root.fields.title.documents, 2); assert.equal(target.owner.root.counts.documents, 4);
  } finally { await donor.engine.dispose(); await target.engine.dispose(); }
});

test('bulk source late duplicate, malformed record and incompatible headers preserve exact prior roots and permit recovery', async () => {
  const donor = fixture(), target = fixture();
  try {
    await append(donor, records); const encoded = await donor.snapshot('exportSource');
    await target.call('add', { id: 'old', text: { title: 'old-state' }, metadata: { tags: ['old'] } }); const root = target.owner.root;
    const cases = [
      [envelope => { envelope.body.payload.records.push(envelope.body.payload.records[0]); }, 'INVALID_NATIVE_STATE'],
      [envelope => { envelope.body.payload.records.at(-1).metadata = { active: 'wrong' }; }, 'INVALID_NATIVE_STATE'],
      [envelope => { envelope.body.payload.records.at(-1).text = { title: ['valid', '\ud800'] }; }, 'MALFORMED_SNAPSHOT'],
      [envelope => { envelope.body.header.capabilities = []; }, 'CAPABILITY_MISMATCH'],
      [envelope => { envelope.body.header.limits.maxMutationBatch++; }, 'LIMITS_MISMATCH'],
    ];
    for (const [change, reason] of cases) { await assert.rejects(target.snapshot('restore', alter(encoded, change)), { reason }); unchanged(target, root); }
    assert.equal((await target.call('search', 'old-state')).total, 1);
    await target.snapshot('restore', encoded); assert.equal(target.owner.root.revision, root.revision + 1); assert.deepEqual(state(target.owner.root), state(donor.owner.root));
  } finally { await donor.engine.dispose(); await target.engine.dispose(); }
});

test('bulk source checks a late prospective dictionary ceiling before invoking its participant and permits recovery', async () => {
  const control = { calls: [], closed: 0 }, configuration = { limits: { maxDictionaryEntries: 2 }, addons: [wrappedSource(control)] };
  const donor = fixture(configuration), target = fixture(configuration);
  try {
    await append(donor, [{ id: 'a', text: { title: 'red' } }, { id: 'b', text: { title: 'blue' } }]);
    const encoded = await donor.snapshot('exportSource'); await target.call('add', { id: 'old', text: { title: 'old' } }); const root = target.owner.root;
    control.calls = []; control.closed = 0;
    const excessive = alter(encoded, envelope => { envelope.body.payload.records.push({ id: 'late', text: { title: ['green'] }, metadata: {} }); });
    await assert.rejects(target.snapshot('restore', excessive), { reason: 'INVALID_NATIVE_STATE' });
    assert.equal(control.calls.length, 2, 'the third new term refuses before its arbitrary participant callback'); assert.equal(control.closed, 2); unchanged(target, root);
    assert.equal((await target.call('search', 'old')).total, 1);
    await target.snapshot('restore', encoded); assert.equal(target.owner.root.revision, root.revision + 1); assert.deepEqual(state(target.owner.root), state(donor.owner.root));
  } finally { await donor.engine.dispose(); await target.engine.dispose(); }
});

function wrappedSource(control, limits = {}) {
  const native = createSourceProvider({ fields: ['title', 'body'], ...limits });
  return { ...native, participant: { initialize: native.participant.initialize, *prepare(previous, context) {
    control.calls.push(context); control.enter?.(context); try {
      if (control.failAt === context.revision) throw Error('custom callback failure');
      if (control.work) yield { workUnits: control.work };
      return yield* native.participant.prepare(previous, context);
    } finally { control.closed++; }
  } } };
}

test('only exact captured first-party identity selects bulk sessions; spread and wrapped registrations retain generic callbacks', async () => {
  const exact = createSourceProvider({ fields: ['title', 'body'] }), copied = { ...exact }, control = { calls: [], closed: 0 };
  for (const [registration, eligible] of [[exact, true], [copied, false], [wrappedSource(control), false]]) {
    const target = fixture({ addons: [registration] });
    try {
      const captured = target.owner.root.configuration.capabilities.ordered.find(value => value.manifest.id === registration.manifest.id);
      const session = bulkParticipant(captured, target.owner.root.participants[registration.manifest.id]);
      assert.equal(Boolean(session), eligible);
      if (session) { assert.equal(typeof session.add, 'function'); assert.equal(typeof session.finish, 'function'); }
      assert.deepEqual(Object.keys(registration).sort(), ['manifest', 'participant'], 'private eligibility adds no public property or protocol');
    } finally { await target.engine.dispose(); }
  }
});

test('first-party bulk participant cumulative work includes final directory sealing and retains the old root on late refusal', async () => {
  // Source record a/b each emits 16 units: id(2), selected field names(11),
  // one original value(1), directory write(2). Their distinct occupied buckets
  // require six final units: two id keys(4), two bucket pointers(2).
  const configuration = { addons: [createSourceProvider({ fields: ['title', 'body'], maxWorkUnits: 37 })] };
  const donor = fixture(configuration), target = fixture(configuration);
  try {
    await append(donor, [{ id: 'a', text: { title: 'x' } }, { id: 'b', text: { title: 'x' } }]);
    const encoded = await donor.snapshot('exportSource'); await target.call('add', { id: 'old', text: { title: 'x' } }); const root = target.owner.root;
    target.metrics.phaseChecks = {};
    await assert.rejects(target.snapshot('restore', encoded), { code: 'WORK_LIMIT_EXCEEDED' });
    assert.ok(target.metrics.phaseChecks['snapshot.source.participant-finalization'] > 0, 'both individually admitted records fit; cumulative refusal occurs during actual final sealing');
    unchanged(target, root);
    await target.snapshot('restore', alter(encoded, envelope => { envelope.body.payload.records = envelope.body.payload.records.slice(0, 1); }));
    assert.equal(target.owner.root.revision, root.revision + 1); assert.equal(target.owner.root.counts.documents, 1); drain(inspectIndex(target.owner.root));
  } finally { await donor.engine.dispose(); await target.engine.dispose(); }
});
test('bulk source calls wrapped first-party registrations per record with unchanged contexts, cleanup, cumulative budgets and failure mapping', async () => {
  const control = { calls: [], closed: 0 }, configuration = { addons: [wrappedSource(control, { maxWorkUnits: 1200 })] };
  const donor = fixture(configuration), target = fixture(configuration);
  try {
    await append(donor, records.slice(0, 3)); const encoded = await donor.snapshot('exportSource');
    await target.call('add', { id: 'old', text: { title: 'old-state' } }); const root = target.owner.root;
    control.calls = []; control.closed = 0; control.work = 1201;
    await assert.rejects(target.snapshot('restore', encoded), { code: 'WORK_LIMIT_EXCEEDED' });
    assert.equal(control.calls.length, 1); assert.equal(control.closed, 1); unchanged(target, root);
    control.calls = []; control.closed = 0; control.work = 800;
    await assert.rejects(target.snapshot('restore', encoded), { code: 'WORK_LIMIT_EXCEEDED' });
    assert.equal(control.calls.length, 2); assert.equal(control.closed, 2); unchanged(target, root);
    control.calls = []; control.closed = 0; control.work = 0; control.failAt = 3;
    await assert.rejects(target.snapshot('restore', encoded), { reason: 'INVALID_NATIVE_STATE' });
    assert.equal(control.calls.length, 3); assert.equal(control.closed, 3); unchanged(target, root);
    control.calls = []; control.closed = 0; delete control.failAt;
    const result = await target.snapshot('restore', encoded); assert.equal(result.revision, 2);
    const contexts = control.calls; assert.equal(contexts.length, 3); assert.equal(control.closed, 3);
    for (const [index, context] of contexts.entries()) {
      assert.equal(Object.isFrozen(context), true); assert.equal(context.kind, 'add'); assert.equal(context.previousRevision, index); assert.equal(context.revision, index + 1);
      assert.equal(context.records.length, 1); assert.deepEqual(context.removedIds, []); assert.equal(context.analyze, contexts[0].analyze);
      assert.equal(context.records[0].id, JSON.parse(encoded).body.payload.records[index].id);
    }
  } finally { await donor.engine.dispose(); await target.engine.dispose(); }
});

test('bulk source closes custom participant iterators after success and failure while preserving the first outcome', async () => {
  const native = createSourceProvider({ fields: ['title', 'body'] }), control = { returned: [], fail: false };
  const selected = { ...native, participant: { initialize: native.participant.initialize, prepare(previous, context) {
    const cursor = native.participant.prepare(previous, context);
    return {
      next() { if (control.fail && context.revision === 2) throw new RaveldexError('RESOURCE_EXHAUSTED'); return cursor.next(); },
      return(value) { control.returned.push(context.revision); cursor.return(value); throw Error('cleanup must not replace success or first failure'); },
    };
  } } };
  const donor = fixture({ addons: [selected] }), target = fixture({ addons: [selected] });
  try {
    await append(donor, records.slice(0, 3)); const encoded = await donor.snapshot('exportSource');
    await target.call('add', { id: 'old', text: { title: 'old-state' } }); const root = target.owner.root;
    control.returned = []; control.fail = true;
    await assert.rejects(target.snapshot('restore', encoded), { code: 'RESOURCE_EXHAUSTED' });
    assert.deepEqual(control.returned, [1, 2]); unchanged(target, root);
    control.returned = []; control.fail = false;
    assert.equal((await target.snapshot('restore', encoded)).revision, 2);
    assert.deepEqual(control.returned, [1, 2, 3], 'return is observable even for the iterator whose final next returned done');
    assert.deepEqual(state(target.owner.root), state(donor.owner.root));
  } finally { await donor.engine.dispose(); await target.engine.dispose(); }
});

test('bulk source preserves cumulative selected-analyzer and retained-source ceilings without resetting per record', async () => {
  const native = createEnglishAnalyzer(), control = { extra: 0, calls: 0, closed: 0 };
  const selected = { ...native, manifest: { ...native.manifest, limits: { ...native.manifest.limits, maxWorkUnits: 1000 } }, analyzer: { ...native.analyzer, *transform(term) { control.calls++; try { if (control.extra) yield { workUnits: control.extra }; return yield* native.analyzer.transform(term); } finally { control.closed++; } } } };
  const configuration = { analyzer: ENGLISH_ANALYZER, addons: [selected, createSourceProvider({ fields: ['title', 'body'], maxRetainedEntries: 6 })] };
  const donor = fixture(configuration), target = fixture(configuration);
  try {
    await append(donor, [{ id: 'a', text: { title: 'running' } }, { id: 'b', text: { title: 'running' } }]);
    const encoded = await donor.snapshot('exportSource'); await target.call('add', { id: 'old', text: { title: 'old' } }); const root = target.owner.root;
    control.extra = 1001; control.calls = 0; control.closed = 0;
    await assert.rejects(target.snapshot('restore', encoded), { code: 'WORK_LIMIT_EXCEEDED' });
    assert.equal(control.calls, 1); assert.equal(control.closed, 1); unchanged(target, root);
    control.extra = 600; control.calls = 0; control.closed = 0;
    await assert.rejects(target.snapshot('restore', encoded), { code: 'WORK_LIMIT_EXCEEDED' });
    assert.equal(control.calls, 2); assert.equal(control.closed, 2); unchanged(target, root);
    control.extra = 0;
    await assert.rejects(target.snapshot('restore', alter(encoded, envelope => { envelope.body.payload.records.push({ id: 'third', text: { title: ['running'] }, metadata: {} }); })), { reason: 'INVALID_NATIVE_STATE' });
    unchanged(target, root); await target.snapshot('restore', encoded); assert.equal(target.owner.root.revision, 2);
  } finally { await donor.engine.dispose(); await target.engine.dispose(); }
});

test('bulk source phase stops, reentrant callbacks and final publication preserve atomic roots and release ownership', async () => {
  const control = { calls: [], closed: 0 }, configuration = { addons: [wrappedSource(control), createPositionProvider({ fields: ['title', 'body'], offsets: ['title', 'body'] })] };
  const donor = fixture(configuration), target = fixture(configuration);
  try {
    await append(donor, records); const encoded = await donor.snapshot('exportSource');
    await target.call('add', { id: 'old', text: { title: 'old-state' } }); const root = target.owner.root;
    for (const phase of ['snapshot.decode', 'snapshot.integrity', 'snapshot.compatibility', 'snapshot.staging', 'snapshot.source.admission', 'snapshot.source.analysis', 'snapshot.source.core', 'snapshot.source.participant', 'snapshot.source.finalization', 'snapshot.source.participant-finalization', 'snapshot.precommit']) {
      target.metrics.phaseChecks = {}; const signal = new FakeSignal();
      Object.defineProperty(signal, 'aborted', { get() { return Boolean(target.metrics.phaseChecks[phase]); } });
      await assert.rejects(target.snapshot('restore', encoded, { signal }), { code: 'CANCELLED' }); unchanged(target, root, signal);
    }
    control.enter = () => { target.host.advance(1); };
    await assert.rejects(target.snapshot('restore', encoded, { deadlineMs: 1 }), { code: 'DEADLINE_EXCEEDED' }); unchanged(target, root); delete control.enter;
    const signal = new FakeSignal(); let queued;
    control.enter = context => { if (context.revision === 2) { queued = target.engine.search('old-state'); signal.stop(false); } };
    await assert.rejects(target.snapshot('restore', encoded, { signal }), { code: 'CANCELLED' });
    target.host.runReady(); assert.equal((await queued).total, 1); unchanged(target, root, signal); delete control.enter;
    const postcommit = new FakeSignal(); let lateReads = 0;
    Object.defineProperty(postcommit, 'aborted', { get() { if (target.owner.root !== root) { lateReads++; return true; } return false; } });
    assert.equal((await target.snapshot('restore', encoded, { signal: postcommit })).revision, 2); assert.equal(lateReads, 0);
    assert.equal(postcommit.listenerCount, 0); assert.equal(target.host.pending, 0);
    let entered = false; control.enter = () => { entered = true; };
    const pending = observe(target.snapshots.restore(encoded)), waiting = observe(target.engine.search('red'));
    while (!entered) assert.equal(target.host.runNext(), true, 'restore reaches an active participant before disposal');
    await target.engine.dispose(); assert.equal((await pending).error.code, 'DISPOSED'); assert.equal((await waiting).error.code, 'DISPOSED');
    assert.equal(target.owner.root, undefined); assert.equal(target.host.pending, 0);
  } finally { await donor.engine.dispose(); await target.engine.dispose(); }
});
