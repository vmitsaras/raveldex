import test from 'node:test';
import assert from 'node:assert/strict';
import { createBulkVerifier } from '../../bench/n9/bulk-verify.mjs';
import { createRecoveryVerification, RECOVERY_VERIFICATION_REVISION } from '../../bench/n10/host-recovery-verification.mjs';
import { PRIOR_RECORD, verifyRecoveryState, exerciseHostRecovery } from '../../bench/n10/host-recovery-case.mjs';
import { RECOVERY_METHOD, assertRecoveryVerificationRevision, recoveryPlan, validateRecoveryRow } from '../../bench/n10/host-recovery.mjs';

const bulk = createBulkVerifier();
function snapshot(records, originRevision = 1, extraHeader = {}) {
  const payload = records.map(record => ({ id: record.id,
    text: { body: Array.isArray(record.text.body) ? record.text.body : [record.text.body] },
    metadata: record.metadata ?? {},
  })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const body = { header: { originRevision, ...extraHeader }, payload: { records: payload } };
  let hash = 2166136261;
  const encodedBody = bulk.canonical(body);
  for (let i = 0; i < encodedBody.length; i++) hash = Math.imul(hash ^ encodedBody.charCodeAt(i), 16777619);
  return bulk.canonical({ format: 'raveldex-source', formatVersion: 1,
    codec: { id: 'raveldex-json-v1', version: 1 }, body,
    integrity: { algorithm: 'fnv1a32-utf16', value: (hash >>> 0).toString(16).padStart(8, '0') },
  });
}
const records = () => [{ id: 'a', text: { body: ['A\u030A a😀B', ''] }, metadata: { revision: 7 } }];
const create = input => createRecoveryVerification({ records: input, priorRecord: PRIOR_RECORD, variant: 'source' });

test('each fresh capture is validated once; comparisons do not reparse already validated snapshots', () => {
  const input = records(), before = snapshot(input, 1), after = snapshot(input, 2), verifier = create(input);
  const parse = JSON.parse; let parses = 0;
  try {
    JSON.parse = (...args) => { parses++; return parse(...args); };
    const left = verifier.validateSource(before), right = verifier.validateSource(after);
    assert.equal(parses, 2);
    assert.equal(verifier.compareSources(left, before, right, after).outcome, 'Pass');
    verifier.verifySource(right, after, verifier.donorPopulation);
    assert.deepEqual(verifier.expectedIds(verifier.donorPopulation), ['a']);
    assert.equal(parses, 2);
    const repeatedCapture = verifier.validateSource(after);
    assert.notEqual(repeatedCapture, right);
    assert.equal(parses, 3, 'identical bytes captured again still receive fresh validation');
  } finally { JSON.parse = parse; verifier.release(); }
});

test('source handles bind immutable complete facts to exact encoded bytes and their exercise', () => {
  const input = records(), encoded = snapshot(input), verifier = create(input), foreign = create(input);
  try {
    const handle = verifier.validateSource(encoded), facts = verifier.sourceFacts(handle, encoded);
    assert.ok(Object.isFrozen(handle) && Object.isFrozen(facts) && Object.isFrozen(facts.payload));
    assert.ok(Object.isFrozen(facts.payload[0].text.body) && Object.isFrozen(facts.payload[0].metadata));
    assert.throws(() => { facts.canonical = 'forged'; }, TypeError);
    assert.throws(() => { facts.payload[0].text.body[0] = 'forged'; }, TypeError);
    assert.throws(() => verifier.sourceFacts(handle, encoded + ' '), /exact encoded source binding/);
    for (const forged of [{}, { ...facts }, structuredClone(handle)]) {
      assert.throws(() => verifier.sourceFacts(forged, encoded), /authentic/);
    }
    assert.throws(() => foreign.sourceFacts(handle, encoded), /authentic/);
    assert.throws(() => foreign.expectedIds(verifier.donorPopulation), /authentic/);
  } finally { verifier.release(); foreign.release(); }
});

test('source parity normalizes only established header revision/integrity and still compares metadata and header leaves', () => {
  const input = records(), verifier = create(input);
  try {
    const first = snapshot(input, 1, { declaration: { fields: ['body'] } });
    const second = snapshot(input, 99, { declaration: { fields: ['body'] } });
    const a = verifier.validateSource(first), b = verifier.validateSource(second);
    assert.equal(verifier.compareSources(a, first, b, second).outcome, 'Pass');
    const changedMetadata = records(); changedMetadata[0].metadata.revision++;
    for (const bad of [snapshot(changedMetadata, 99, { declaration: { fields: ['body'] } }),
      snapshot(input, 99, { declaration: { fields: ['different'] } })]) {
      assert.throws(() => verifier.compareSources(a, first, verifier.validateSource(bad), bad), /complete source/);
    }
    const corrupted = JSON.parse(first); corrupted.integrity.value = '00000000';
    assert.throws(() => verifier.validateSource(JSON.stringify(corrupted)), /integrity/);
  } finally { verifier.release(); }
});

test('literal ownership survives native mutation of input references before first lazy verification', () => {
  const input = records(), expectedEncoding = snapshot(input), verifier = create(input);
  try {
    input[0].text.body[0] = 'poisoned'; input[0].metadata.revision = 100;
    const own = verifier.expectedRecords(verifier.donorPopulation);
    assert.equal(own[0].text.body[0], 'A\u030A a😀B'); assert.equal(own[0].metadata.revision, 7);
    assert.ok(Object.isFrozen(own) && Object.isFrozen(own[0]) && Object.isFrozen(own[0].metadata));
    const valid = verifier.validateSource(expectedEncoding);
    assert.equal(verifier.verifySource(valid, expectedEncoding, verifier.donorPopulation).outcome, 'Pass');
    const poisoned = snapshot(input), bad = verifier.validateSource(poisoned);
    assert.throws(() => verifier.verifySource(bad, poisoned, verifier.donorPopulation), /literal source/);
  } finally { verifier.release(); }
});

test('later-write expectations own replacements before calls and distinguish complete replacement data', () => {
  const input = records(), verifier = create(input);
  try {
    const replacement = { id: 'a', text: { body: 'new source' }, metadata: { revision: 8 } };
    const first = verifier.prepareLaterWrite(verifier.donorPopulation, replacement);
    const good = snapshot([replacement]);
    replacement.text.body = 'mutated'; replacement.metadata.revision = 9;
    assert.equal(verifier.verifySource(verifier.validateSource(good), good, first).outcome, 'Pass');
    const next = verifier.prepareLaterWrite(verifier.donorPopulation, replacement), changed = snapshot([replacement]);
    assert.equal(verifier.verifySource(verifier.validateSource(changed), changed, next).outcome, 'Pass');
    assert.throws(() => verifier.verifySource(verifier.validateSource(good), good, next), /literal source/);
    assert.equal(verifier.verifySource(verifier.validateSource(good), good, first).outcome, 'Pass');
    const priorWrite = { ...replacement, id: 'prior-state' }, prior = verifier.prepareLaterWrite(verifier.priorPopulation, priorWrite);
    assert.deepEqual(verifier.expectedIds(prior), ['prior-state']);
    assert.deepEqual(verifier.expectedIds(first), ['a']);
    assert.throws(() => verifier.prepareLaterWrite(first, replacement), /base population/);
  } finally { verifier.release(); }
});

test('literal copies preserve shared data, negative zero and safe own prototype-named keys', () => {
  const metadata = JSON.parse('{"__proto__":{"ordinary":true},"constructor":"data","revision":1}');
  const shared = { score: -0 }; metadata.left = shared; metadata.right = shared;
  const input = [{ id: 'a', text: { body: 'a' }, metadata }], verifier = create(input);
  try {
    const own = verifier.expectedRecords(verifier.donorPopulation)[0].metadata;
    assert.equal(Object.getPrototypeOf(own), Object.prototype);
    assert.equal(own.__proto__.ordinary, true); assert.equal(own.constructor, 'data');
    assert.equal(own.left, own.right); assert.ok(Object.is(own.left.score, -0));
    const encoded = snapshot(input);
    assert.equal(verifier.verifySource(verifier.validateSource(encoded), encoded, verifier.donorPopulation).outcome, 'Pass');
    const wrong = structuredClone(input); wrong[0].metadata.left.score = 0;
    const bad = snapshot(wrong);
    assert.throws(() => verifier.verifySource(verifier.validateSource(bad), bad, verifier.donorPopulation), /literal source/);
  } finally { verifier.release(); }
});

test('literal ownership rejects accessors, hidden/symbol data, holes, cycles, nonfinite values and foreign prototypes', () => {
  let getterCalls = 0;
  const accessor = {}; Object.defineProperty(accessor, 'value', { enumerable: true, get() { getterCalls++; return 1; } });
  const hidden = {}; Object.defineProperty(hidden, 'value', { value: 1 });
  const symbol = { [Symbol('hidden')]: 1 }, cycle = {}; cycle.self = cycle;
  for (const metadata of [accessor, hidden, symbol, cycle, { x: Infinity }, new Date()]) {
    assert.throws(() => create([{ id: 'a', text: { body: 'a' }, metadata }]), /literal/);
  }
  const hole = new Array(1);
  assert.throws(() => create(hole), /literal/);
  assert.equal(getterCalls, 0);
});

test('release closes validation, population and comparison authority and is idempotent', () => {
  const verifier = create(records()), encoded = snapshot(records()), handle = verifier.validateSource(encoded);
  verifier.release(); verifier.release();
  for (const action of [() => verifier.validateSource(encoded), () => verifier.sourceFacts(handle, encoded),
    () => verifier.expectedIds(verifier.donorPopulation), () => verifier.expectedRecords(verifier.priorPopulation),
    () => verifier.prepareLaterWrite(verifier.donorPopulation, records()[0]),
    () => verifier.verifySource(handle, encoded, verifier.donorPopulation),
    () => verifier.compareSources(handle, encoded, handle, encoded)]) assert.throws(action, /released/);
});

function literalState(withPositions) {
  const state = { documents: { a: { id: 'a', textCodeUnits: 7, metadata: { revision: 7 }, fields: { body: { length: 3, terms: { å: 1, a: 1, b: 1 } } } } },
    counts: { documents: 1, textCodeUnits: 7, tokens: 3, dictionaryEntries: 3, postingEntries: 3 },
    fields: { body: { documents: 1, length: 3, terms: Object.fromEntries(['å', 'a', 'b'].map(term => [term, { df: 1, frequency: 1, postings: { a: 1 } }])) } },
    participants: { source: { kind: 'raveldex-source-v1', retainedEntries: 4, textCodeUnits: 7,
      records: { a: { text: { body: ['A\u030A a😀B', ''] }, retainedEntries: 4, textCodeUnits: 7 } } } } };
  if (withPositions) state.participants.positions = { kind: 'raveldex-positions-v1', fields: ['body'], offsetFields: ['body'],
    retainedEntries: 16, occurrenceCount: 3, offsetCount: 3, termEntries: 3, termCodeUnits: 3,
    records: { a: { positions: { body: [{ tokenCount: 3, terms: {
      å: [{ position: 0, positionLength: 1, start: 0, end: 2 }],
      a: [{ position: 1, positionLength: 1, start: 3, end: 4 }],
      b: [{ position: 2, positionLength: 1, start: 6, end: 7 }],
    } }, { tokenCount: 0, terms: {} }] }, retainedEntries: 16, occurrenceCount: 3, offsetCount: 3, termEntries: 3, termCodeUnits: 3 } } };
  return state;
}
test('source-only state still checks all TF/DF/source leaves and exact provider membership', () => {
  const state = literalState(false);
  assert.equal(verifyRecoveryState(state, records(), 'source').offsets, 0);
  for (const mutate of [s => s.fields.body.terms.å.postings.a++, s => s.participants.source.records.a.text.body[0] += 'x',
    s => s.participants.positions = literalState(true).participants.positions]) {
    const changed = structuredClone(state); mutate(changed);
    assert.throws(() => verifyRecoveryState(changed, records(), 'source'));
  }
});
test('positions mode preserves all source coordinates and every occurrence assertion', () => {
  const state = literalState(true);
  assert.equal(verifyRecoveryState(state, records(), 'positions-offsets').offsets, 3);
  const changed = structuredClone(state); changed.participants.positions.records.a.positions.body[0].terms.b[0].start = 5;
  assert.throws(() => verifyRecoveryState(changed, records(), 'positions-offsets'), /UTF-16/);
});
test('dated verification identity is explicit without changing original collection/native policy', async () => {
  assert.equal(RECOVERY_VERIFICATION_REVISION.date, '2026-11-06');
  assert.equal(RECOVERY_METHOD.budgetMs, 10800000); assert.equal(RECOVERY_METHOD.perContextWatchdogMs, 300000);
  assertRecoveryVerificationRevision(structuredClone(RECOVERY_VERIFICATION_REVISION));
  for (const bad of [undefined, { ...RECOVERY_VERIFICATION_REVISION, date: 'other' }, { ...RECOVERY_VERIFICATION_REVISION, budgetMs: 27000000 }]) {
    assert.throws(() => assertRecoveryVerificationRevision(bad));
  }
  let disposed = 0;
  const row = await exerciseHostRecovery({ create: () => ({ addMany: async () => { throw Object.assign(Error('refused'), { code: 'WORK_LIMIT_EXCEEDED' }); }, dispose: async () => { disposed++; } }),
    createSnapshots: () => { throw Error('dependent snapshot must not execute'); }, records: records(), queries: [], variant: 'source', mode: 'normal', deadlineOptions: {} });
  assert.deepEqual(row.verificationRevision, RECOVERY_VERIFICATION_REVISION);
  assert.equal(row.samples[0].outcome, 'Refused'); assert.equal(disposed, 1);
});

// Metadata is optional only for genuinely historical rows; an advertised new
// revision must be complete, exact and consistently bound even without context.
test('standalone row validation rejects falsey, forged and single-sided revision advertisements', async () => {
  const exercise = await exerciseHostRecovery({ create: () => ({ addMany: async () => { throw Object.assign(Error('refused'), { code: 'WORK_LIMIT_EXCEEDED' }); }, dispose: async () => {} }),
    createSnapshots: () => { throw Error('dependent snapshot must not execute'); }, records: records(), queries: [], variant: 'source', mode: 'normal', deadlineOptions: {} });
  const valid = { job: recoveryPlan()[0], verificationRevision: RECOVERY_VERIFICATION_REVISION, outcome: 'Collected', exercise };
  assert.equal(validateRecoveryRow(valid, valid.job).length, 5);
  for (const mutate of [r => { delete r.verificationRevision; }, r => { delete r.exercise.verificationRevision; },
    r => { r.verificationRevision = undefined; }, r => { r.verificationRevision = null; },
    r => { r.exercise.verificationRevision = false; }, r => { r.exercise.verificationRevision.date = 'stale'; }]) {
    const bad = structuredClone(valid); mutate(bad);
    assert.throws(() => validateRecoveryRow(bad, bad.job), /verification revision/);
  }
  for (const verificationRevision of [undefined, null, false]) {
    assert.throws(() => validateRecoveryRow(valid, valid.job, { verificationRevision }), /verification revision/);
  }
  const legacy = structuredClone(valid); delete legacy.verificationRevision; delete legacy.exercise.verificationRevision;
  assert.equal(validateRecoveryRow(legacy, legacy.job).length, 5);
});
