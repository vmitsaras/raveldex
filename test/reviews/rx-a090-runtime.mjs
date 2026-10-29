/** Independent runtime review by the patch evaluation author. This reproducer
 * imports none of the reviewer-owned evaluation fixtures/tests or patch helpers. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createRaveldex } from '../../dist/index.js';
import { createPatch } from '../../dist/addons/patch/index.js';
import { createSourceProvider } from '../../dist/addons/phrases/source.js';
import { createSnapshots } from '../../dist/adapters/snapshots/index.js';
import { captureConfiguration } from '../../dist/core/contracts/schema.js';
import { createOwnedRaveldex, getExecutionOwner } from '../../dist/core/execution/engine.js';
import { FakeHost, FakeSignal } from '../fixtures/execution/host.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname), observations = [];
const sha = data => createHash('sha256').update(data).digest('hex');
const schema = { text: { body: {}, title: {} }, metadata: { flag: { type: 'boolean' }, tags: { type: 'string', multi: true, nullable: true } } };
const initial = { id: 'x', text: { body: ['alpha beta', 'gamma'], title: 'alpha' }, metadata: { flag: true, tags: ['one', 'one', null] } };
const plain = value => JSON.parse(JSON.stringify(value));
const observe = promise => promise.then(value => ({ value }), error => ({ error }));
const metrics = () => ({ workUnits: 0, steps: 0, hostYields: 0, maxTaskWorkUnits: 0, maxStepWorkUnits: 0, checks: 0, phaseChecks: {} });
function setup({ limits = {}, addons, selectedSchema = schema, observedMetrics } = {}) {
  const host = new FakeHost();
  const configuration = captureConfiguration({ schema: selectedSchema, addons: addons ?? [createSourceProvider({ fields: Object.keys(selectedSchema.text) })], limits: { checkpointWorkUnits: 1, ...limits } });
  const engine = createOwnedRaveldex(configuration, host, observedMetrics), owner = getExecutionOwner(engine), patch = createPatch(engine);
  return { host, engine, owner, patch, configuration,
    async call(method, ...args) { const pending = engine[method](...args); host.runReady(); return pending; },
    async apply(request, options) { const pending = patch.patch(request, options); host.runReady(); return pending; },
    async source() { const pending = createSnapshots(engine).exportSource(); host.runReady(); return JSON.parse(await pending).body.payload.records; },
  };
}
function released(fixture, ...signals) { assert.equal(fixture.host.pending, 0); for (const signal of signals) assert.equal(signal.listenerCount, 0); }
async function probe(name, callback) { const started = Date.now(), result = await callback(); observations.push({ name, status: 'Pass', elapsedMs: Date.now() - started, ...result }); }
function participant(prepare, initialize = () => Object.freeze({ revision: 0 })) {
  return { manifest: { id: 'review-patch-participant', version: '0.1.0', contractVersion: 1, roles: ['transaction-participant'], provides: [{ id: 'review-patch-state', contractVersion: 1 }], requires: [], dataRequirements: { fields: [], source: false, positions: false, offsets: false, metadata: false }, indexEffect: 'transactional', rebuildPolicy: 'new-index', execution: { direct: true, worker: false }, limits: { maxPayloadCodeUnits: 1024, maxWorkUnits: 1000000, maxRetainedEntries: 1, maxOutputEntries: 0 }, costs: { importedCode: 'Independent review probe', retainedRepresentation: 'One immutable revision marker', transientWork: 'Review only', externalResources: 'none' } }, participant: { initialize, prepare } };
}
const paths = [
  'src/addons/patch/index.ts', 'src/addons/patch/types.ts', 'src/addons/patch/capture.ts', 'src/addons/patch/compose.ts',
  'src/core/execution/engine.ts', 'src/core/mutations/owner.ts', 'src/core/contracts/data.ts', 'src/core/contracts/options.ts', 'src/core/contracts/record.ts', 'src/core/capabilities/participants.ts', 'src/addons/phrases/store.ts',
  'dist/addons/patch/index.js', 'dist/addons/patch/types.d.ts', 'dist/addons/patch/capture.js', 'dist/addons/patch/compose.js', 'dist/core/execution/engine.js', 'dist/core/mutations/owner.js', 'dist/core/contracts/data.js', 'dist/core/contracts/options.js', 'dist/core/contracts/record.js', 'dist/core/capabilities/participants.js', 'dist/addons/phrases/store.js',
];
const sourceBindings = [];
for (const path of paths) { const bytes = await readFile(resolve(root, path)); sourceBindings.push({ path, bytes: bytes.length, sha256: sha(bytes) }); }
let failure;
try {
  await probe('Borrowed handle does not initialize participants or change ordinary facade', async () => {
    let initializes = 0, prepares = 0;
    const source = createSourceProvider({ fields: ['body', 'title'] }), addon = { ...source, participant: { initialize(configuration) { initializes++; return source.participant.initialize(configuration); }, *prepare(previous, context) { prepares++; return yield* source.participant.prepare(previous, context); } } };
    const engine = createRaveldex({ schema, addons: [addon] });
    try {
      assert.equal(initializes, 1); const first = createPatch(engine), second = createPatch(engine);
      assert.equal(initializes, 1); assert.equal(prepares, 0); assert.deepEqual(Object.keys(first), ['patch']); assert.ok(Object.isFrozen(first));
      assert.deepEqual(Object.keys(engine), ['search', 'add', 'addMany', 'replace', 'remove', 'clear', 'dispose']);
      for (const foreign of [{ ...engine }, {}, null, 1]) assert.throws(() => createPatch(foreign), { code: 'MISSING_CAPABILITY' });
      await engine.add(initial); await first.patch({ id: 'x', expectedRevision: 1, set: { metadata: { flag: false } } });
      assert.equal(initializes, 1); assert.equal(prepares, 2);
      await engine.dispose(); await assert.rejects(second.patch({ id: 'x', expectedRevision: 2, unset: { text: ['title'] } }), { code: 'DISPOSED' });
      return { participantInitializations: initializes, preparesAcrossAddAndPatch: prepares, rejectedForeignHandles: 4, ordinaryFacadeUnchanged: true };
    } finally { await engine.dispose(); }
  });

  await probe('Data descriptor ownership survives queue delay without invoking any caller accessor', async () => {
    const fixture = setup(); let getterReads = 0;
    try {
      await fixture.call('add', initial);
      const blocker = fixture.engine.search({ kind: 'all' }), values = ['delta beta'], tags = ['fresh', null], fields = ['title'];
      const request = { id: 'x', expectedRevision: 1, set: { text: { body: values }, metadata: { tags } }, unset: { text: fields } }, options = { deadlineMs: 100 };
      const patching = fixture.patch.patch(request, options);
      values[0] = 'secret lost'; tags.push('lost'); fields[0] = 'body'; request.id = 'absent'; request.expectedRevision = 0; options.deadlineMs = 1;
      fixture.host.advance(2); fixture.host.runReady(); await blocker; assert.equal((await patching).revision, 2);
      assert.deepEqual(plain(await fixture.source()), [{ id: 'x', text: { body: ['delta beta'] }, metadata: { flag: true, tags: ['fresh', null] } }]);
      for (const bad of [
        Object.defineProperty({ id: 'x', expectedRevision: 2 }, 'set', { get() { getterReads++; return { text: { body: 'lost' } }; } }),
        { id: 'x', expectedRevision: 2, set: { text: Object.defineProperty({}, 'body', { get() { getterReads++; return 'lost'; } }) } },
        { id: 'x', expectedRevision: 2, unset: { text: Object.defineProperty(['body'], '0', { get() { getterReads++; return 'body'; } }) } },
      ]) await assert.rejects(fixture.patch.patch(bad), { code: 'INVALID_RECORD' });
      assert.equal(getterReads, 0); assert.equal(fixture.owner.root.revision, 2); released(fixture);
      return { queuedOwnedReplacement: true, rejectedAccessorInputs: 3, callerGetterReads: getterReads };
    } finally { await fixture.engine.dispose(); }
  });

  await probe('One FIFO admission observes predecessor revision and rejects a competing same-revision patch', async () => {
    const fixture = setup();
    try {
      const adding = fixture.engine.add(initial);
      const first = fixture.patch.patch({ id: 'x', expectedRevision: 1, set: { text: { body: 'delta' } } });
      const competing = observe(fixture.patch.patch({ id: 'x', expectedRevision: 1, unset: { text: ['title'] } }));
      const reading = fixture.engine.search('delta'); fixture.host.runReady();
      assert.equal((await adding).revision, 1); assert.equal((await first).revision, 2); assert.equal((await competing).error?.code, 'REVISION_MISMATCH');
      assert.equal((await reading).revision, 2); assert.equal((await reading).total, 1);
      const before = fixture.owner.root, unrelated = fixture.engine.add({ id: 'other', text: { body: 'other' } }), stale = observe(fixture.patch.patch({ id: 'x', expectedRevision: 2, unset: { text: ['title'] } }));
      fixture.host.runReady(); assert.equal((await unrelated).revision, 3); assert.equal((await stale).error?.code, 'REVISION_MISMATCH'); assert.notEqual(fixture.owner.root, before);
      assert.equal(fixture.owner.root.revision, 3); assert.equal((await fixture.call('search', 'alpha')).total, 1); released(fixture);
      return { precursorRevision: 1, firstPatchRevision: 2, competingPatch: 'REVISION_MISMATCH', unrelatedWriteMakesExpectedRevisionStale: true, finalRevision: 3 };
    } finally { await fixture.engine.dispose(); }
  });

  await probe('Complete source coverage, provider revision and target originals fail before any publication', async () => {
    let refusals = 0;
    for (const [addons, code] of [[[], 'MISSING_CAPABILITY'], [[createSourceProvider({ fields: ['body'] })], 'MISSING_CAPABILITY']]) {
      const fixture = setup({ addons }); try {
        await fixture.call('add', initial); const rootBefore = fixture.owner.root;
        await assert.rejects(fixture.apply({ id: 'x', expectedRevision: 1, set: { metadata: { flag: false } } }), { code }); refusals++;
        assert.equal(fixture.owner.root, rootBefore);
        await assert.rejects(fixture.apply({ id: 'absent', expectedRevision: 0, unset: { text: ['title'] } }), { code: 'REVISION_MISMATCH' }); refusals++;
        await assert.rejects(fixture.apply({ id: 'absent', expectedRevision: 1, unset: { text: ['title'] } }), { code: 'MISSING_CAPABILITY' }); refusals++;
      } finally { await fixture.engine.dispose(); }
    }
    for (const mode of ['stale', 'missing-record', 'wrong-length']) {
      const source = createSourceProvider({ fields: ['body', 'title'] });
      const addon = { ...source, participant: { initialize: source.participant.initialize, *prepare(previous, context) {
        const prepared = yield* source.participant.prepare(previous, context);
        if (mode === 'stale') return Object.freeze({ ...prepared, revision: prepared.revision - 1 });
        if (mode === 'missing-record') return Object.freeze({ ...prepared, records: source.participant.initialize({ ...configurationForSource, limits: configurationForSource.limits }).records });
        // Remove the title original through a genuine source directory built for
        // the same ID but deliberately inconsistent with the indexed record.
        const records = context.records.map(record => Object.freeze({ ...record, text: Object.freeze({ body: record.text.body }) }));
        return yield* source.participant.prepare(previous, { ...context, records });
      } } };
      const configurationForSource = captureConfiguration({ schema, addons: [source] });
      const fixture = setup({ addons: [addon] });
      try {
        await fixture.call('add', initial); const rootBefore = fixture.owner.root;
        await assert.rejects(fixture.apply({ id: 'x', expectedRevision: 1, set: { metadata: { flag: false } } }), { code: mode === 'stale' ? 'REVISION_MISMATCH' : mode === 'missing-record' ? 'MISSING_CAPABILITY' : 'INCOMPATIBLE_CAPABILITY' }); refusals++;
        assert.equal(fixture.owner.root, rootBefore); released(fixture);
      } finally { await fixture.engine.dispose(); }
    }
    const complete = setup(); try { await complete.call('add', initial); const before = complete.owner.root; await assert.rejects(complete.apply({ id: 'absent', expectedRevision: 1, unset: { text: ['title'] } }), { code: 'ID_NOT_FOUND' }); assert.equal(complete.owner.root, before); refusals++; } finally { await complete.engine.dispose(); }
    return { explicitSourceAndRevisionRefusals: refusals, faultScope: 'Trusted source fixture headers/directories deliberately violate producer invariants; no external source authenticity claim.' };
  });

  await probe('Composition and actual replacement consume one calibrated complete mutation work budget', async () => {
    const selectedSchema = { text: { body: {} }, metadata: { flag: { type: 'boolean' } } }, record = { id: 'x', text: { body: 'alpha beta' }, metadata: { flag: true } }, mutation = { id: 'x', expectedRevision: 1, set: { metadata: { flag: false } } }, full = { id: 'x', text: { body: 'alpha beta' }, metadata: { flag: false } };
    const measured = metrics(), fixture = setup({ selectedSchema, observedMetrics: measured }); let initialWork, patchWork, replacementWork;
    try {
      await fixture.call('add', record); initialWork = measured.workUnits;
      let before = measured.workUnits; await fixture.apply(mutation); patchWork = measured.workUnits - before;
      before = measured.workUnits; await fixture.call('replace', full); replacementWork = measured.workUnits - before;
    } finally { await fixture.engine.dispose(); }
    assert.ok(patchWork > replacementWork); assert.ok(replacementWork >= initialWork);
    for (const [cap, expected] of [[patchWork - 1, 'WORK_LIMIT_EXCEEDED'], [patchWork, 'Pass']]) {
      const bounded = setup({ selectedSchema, limits: { maxMutationWorkUnits: cap } });
      try {
        await bounded.call('add', record); const before = bounded.owner.root;
        if (expected === 'Pass') assert.equal((await bounded.apply(mutation)).revision, 2);
        else { await assert.rejects(bounded.apply(mutation), { code: expected }); assert.equal(bounded.owner.root, before); assert.equal((await bounded.call('replace', full)).revision, 2, 'Same full replacement fits while composition plus replacement exceeds shared cap'); }
        released(bounded);
      } finally { await bounded.engine.dispose(); }
    }
    return { initialAddWorkUnits: initialWork, fullReplacementWorkUnits: replacementWork, completePatchWorkUnits: patchWork, compositionAdditionalWorkUnits: patchWork - replacementWork, exactBoundary: 'Pass at complete total; whole operation fails one unit below', scope: 'Logical charged work; no heap/allocation/copy/latency claim.' };
  });

  await probe('Every independently observed patch suspension can abort with exact old core and participant identity', async () => {
    const request = { id: 'x', expectedRevision: 1, set: { text: { body: ['delta beta', 'epsilon'] }, metadata: { tags: ['new', null] } }, unset: { text: ['title'] } };
    const calibration = setup(); let suspensions;
    try { await calibration.call('add', initial); const pending = calibration.patch.patch(request); suspensions = calibration.host.runReady(); await pending; } finally { await calibration.engine.dispose(); }
    assert.ok(suspensions > 20); let rejected = 0;
    for (let resume = 0; resume < suspensions; resume++) {
      const fixture = setup(), signal = new FakeSignal();
      try {
        await fixture.call('add', initial); const old = fixture.owner.root, pending = observe(fixture.patch.patch(request, { signal }));
        for (let count = 0; count < resume; count++) assert.equal(fixture.host.runNext(), true);
        signal.stop(); assert.equal((await pending).error?.code, 'CANCELLED'); assert.equal(fixture.owner.root, old); assert.equal(fixture.owner.root.participants, old.participants);
        fixture.host.runReady(); released(fixture, signal); assert.equal((await fixture.call('search', 'alpha')).total, 1);
        assert.equal((await fixture.apply(request)).revision, 2); rejected++;
      } finally { await fixture.engine.dispose(); }
    }
    return { observedSuspensions: suspensions, abortedAndRecovered: rejected, exactOldRootIdentityPreserved: true, scope: 'All suspensions of this fixed independent fixture, not every admitted corpus.' };
  });

  await probe('Returning and zero-unit participant callbacks cannot bypass cancellation, failure or disposal before commit', async () => {
    const rows = [];
    for (const mode of ['return-abort', 'zero-abort', 'throw', 'return-dispose']) {
      let signal, engine, closes = 0, zeroSteps = 0;
      const addon = participant(function* (previous, context) {
        try {
          if (context.kind === 'replace') {
            if (mode === 'throw') throw Error('private review payload must not escape');
            if (mode === 'zero-abort') { yield { workUnits: 0 }; zeroSteps++; signal.stop(false); yield { workUnits: 0 }; }
            if (mode === 'return-abort') signal.stop(false);
            if (mode === 'return-dispose') void engine.dispose();
          }
          return Object.freeze({ revision: context.revision });
        } finally { if (context.kind === 'replace') closes++; }
      });
      const fixture = setup({ addons: [createSourceProvider({ fields: ['body', 'title'] }), addon] }); engine = fixture.engine; signal = new FakeSignal();
      try {
        await fixture.call('add', initial); const before = fixture.owner.root, failure = await observe(fixture.apply({ id: 'x', expectedRevision: 1, unset: { text: ['title'] } }, { signal }));
        const expected = mode === 'throw' ? 'INTERNAL_ERROR' : mode === 'return-dispose' ? 'DISPOSED' : 'CANCELLED';
        assert.equal(failure.error?.code, expected); assert.equal(closes, 1); assert.ok(!failure.error.message.includes('private review'));
        if (mode === 'return-dispose') assert.equal(fixture.owner.root, undefined); else assert.equal(fixture.owner.root, before);
        released(fixture, signal); rows.push({ mode, code: failure.error.code, closed: closes, zeroSteps });
      } finally { await fixture.engine.dispose(); }
    }
    return { participantStops: rows };
  });

  await probe('Queue deadlines, disposal and stale host callbacks cannot publish suspended patch state', async () => {
    let queuedAndActiveDeadlines = 0;
    for (const queued of [false, true]) {
      const fixture = setup(), signal = new FakeSignal();
      try {
        await fixture.call('add', initial); const before = fixture.owner.root, blocker = queued ? fixture.engine.search({ kind: 'all' }) : undefined;
        const pending = observe(fixture.patch.patch({ id: 'x', expectedRevision: 1, set: { text: { body: 'delta' } } }, { deadlineMs: 5, signal }));
        fixture.host.advance(5); fixture.host.runReady(); if (blocker) await blocker;
        assert.equal((await pending).error?.code, 'DEADLINE_EXCEEDED'); assert.equal(fixture.owner.root, before); released(fixture, signal); queuedAndActiveDeadlines++;
      } finally { await fixture.engine.dispose(); }
    }
    const disposed = setup(), signal = new FakeSignal();
    await disposed.call('add', initial); const pending = observe(disposed.patch.patch({ id: 'x', expectedRevision: 1, unset: { text: ['title'] } }, { signal })), stale = disposed.host.callbacks();
    await disposed.engine.dispose(); assert.equal((await pending).error?.code, 'DISPOSED'); assert.equal(disposed.owner.root, undefined);
    for (const callback of stale) callback(); disposed.host.runReady(); released(disposed, signal);
    return { queuedAndActiveDeadlines, disposedSuspendedOperation: true, staleCallbacksInvoked: stale.length };
  });

  await probe('A committed native cursor is returned without a subsequent signal read or stop check', async () => {
    const fixture = setup(); let readsAfterCommit = 0;
    const signal = new FakeSignal();
    Object.defineProperty(signal, 'aborted', { get() { if (fixture.owner.root?.revision === 2) { readsAfterCommit++; return true; } return false; } });
    try {
      await fixture.call('add', initial);
      const result = await fixture.apply({ id: 'x', expectedRevision: 1, unset: { text: ['title'] } }, { signal });
      assert.deepEqual(result, { revision: 2, changed: true, added: 0, replaced: 1, removed: 0 }); assert.equal(readsAfterCommit, 0); assert.equal(fixture.owner.root.revision, 2); released(fixture, signal);
      assert.equal((await fixture.call('search', 'alpha')).total, 1);
      return { successfulRevision: result.revision, signalReadsAfterCommit: readsAfterCommit, noAfterCommitFailure: true };
    } finally { await fixture.engine.dispose(); }
  });
} catch (error) { failure = { name: error.name, code: error.code, message: error.message, stack: error.stack }; }
const changed = [];
for (const row of sourceBindings) if (sha(await readFile(resolve(root, row.path))) !== row.sha256) changed.push(row.path);
const report = { kind: 'raveldex-rx-a090-runtime-review-v1', recordedAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, arch: process.arch }, authorshipBoundary: 'Independent review of other-authored optional patch runtime/admission/source composition and private owner seam. Reviewer-owned evaluation fixtures and tests are excluded and never imported.', sourceBindings, bindingAudit: { status: changed.length ? 'Fail' : 'Pass', unchanged: sourceBindings.length - changed.length, changed }, observations, passCount: observations.length, failCount: failure ? 1 : 0, mandatoryFindings: failure ? [failure] : [], failure, verdict: failure || changed.length ? 'Changes required' : 'Ready with follow-ups', limitations: ['Trusted source/participant implementations and structural host handles are not hostile-code sandboxes.', 'This is current local Node runtime/controlled-host evidence, not installed-browser or physical AT qualification.', 'Public package/minified/declaration and artifact qualification are separately executed by the parent.', 'Logical work counts do not measure allocation, heap peaks, transport copies or physical latency.', 'No remote CI, remote write or publication claim.'] };
const output = resolve(root, process.argv[2] ?? 'docs/evidence/RX-A090-runtime-review.json');
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ report: output, sha256: sha(await readFile(output)), passCount: observations.length, failure, bindingAudit: report.bindingAudit }));
if (failure || changed.length) process.exitCode = 1;
