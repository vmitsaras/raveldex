// Independent data-only boundary checks. No native engine or collector import.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { createRecoveryVerification } from '../../../../../bench/n10/host-recovery-verification.mjs';
import { createBulkVerifier } from '../../../../../bench/n9/bulk-verify.mjs';

const bulk = createBulkVerifier();
const helperPath = new URL('../../../../../bench/n10/host-recovery-verification.mjs', import.meta.url);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const before = digest(await readFile(helperPath));
const cases = [];
function check(name, body) {
  try { body(); cases.push({ name, status: 'Pass' }); }
  catch (error) { cases.push({ name, status: 'Fail', error: { name: error.name, message: error.message, stack: error.stack } }); }
}
function record(metadata = {}) { return { id: 'owned', text: { body: ['Å a😀B', ''] }, metadata }; }
const prior = { id: 'prior-state', text: { body: 'n9oldstate' }, metadata: { group: 'prior' } };
function context(records) { return createRecoveryVerification({ records, priorRecord: prior, variant: 'source' }); }
function encode(records, revision = 1) {
  const normalized = records.map(r => ({ id: r.id, text: { body: Array.isArray(r.text.body) ? r.text.body : [r.text.body] }, metadata: r.metadata ?? {} }))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const body = { header: { originRevision: revision, revision: 'non-normalized-header-data' }, payload: { records: normalized } };
  const text = bulk.canonical(body); let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return bulk.canonical({ format: 'raveldex-source', formatVersion: 1,
    codec: { id: 'raveldex-json-v1', version: 1 }, body,
    integrity: { algorithm: 'fnv1a32-utf16', value: (hash >>> 0).toString(16).padStart(8, '0') } });
}

check('equivalent re-encoding cannot reuse an old exact-byte authority', () => {
  const input = [record()], c = context(input), encoded = encode(input), padded = ' \n' + encoded;
  try {
    const old = c.validateSource(encoded), fresh = c.validateSource(padded);
    assert.throws(() => c.sourceFacts(old, padded), /exact encoded/);
    assert.equal(c.compareSources(old, encoded, fresh, padded).outcome, 'Pass');
  } finally { c.release(); }
});
check('proxy, inherited and foreign-realm empty tokens cannot forge private authority', () => {
  const input = [record()], c = context(input), encoded = encode(input);
  try {
    const valid = c.validateSource(encoded);
    for (const token of [new Proxy(valid, {}), Object.create(valid), vm.runInNewContext('Object.freeze({})')]) {
      assert.throws(() => c.sourceFacts(token, encoded), /authentic/);
      assert.throws(() => c.expectedIds(token), /authentic/);
    }
  } finally { c.release(); }
});
check('valid-looking copied canonical facts cannot replace an opaque validated handle', () => {
  const input = [record()], c = context(input), encoded = encode(input);
  try {
    const token = c.validateSource(encoded), copied = Object.freeze({ ...c.sourceFacts(token, encoded) });
    assert.throws(() => c.verifySource(copied, encoded, c.donorPopulation), /authentic/);
    assert.throws(() => c.compareSources(token, encoded, copied, encoded), /authentic/);
  } finally { c.release(); }
});
check('descriptor copy rejects an accessor without executing it', () => {
  let calls = 0; const metadata = {};
  Object.defineProperty(metadata, 'revision', { enumerable: true, get() { calls++; throw Error('must not run'); } });
  assert.throws(() => context([record(metadata)]), /literal data descriptor/);
  assert.equal(calls, 0);
});
check('array hole plus named property cannot masquerade as dense input', () => {
  const metadata = []; metadata.length = 1; metadata.named = 'balances enumerable key count';
  assert.throws(() => context([record({ nested: metadata })]), /literal data descriptor/);
});
check('non-enumerable indexed array data is rejected', () => {
  const metadata = []; Object.defineProperty(metadata, '0', { value: 'hidden', enumerable: false });
  assert.throws(() => context([record({ nested: metadata })]), /literal/);
});
check('null-prototype own reserved-looking keys and sharing remain ordinary literal data', () => {
  const shared = Object.freeze({ n: -0 }), metadata = Object.create(null);
  metadata.__proto__ = { revision: 7 }; metadata.constructor = 'ordinary'; metadata.left = shared; metadata.right = shared;
  const input = [record(metadata)], c = context(input);
  try {
    const expected = c.expectedRecords(c.donorPopulation)[0].metadata;
    assert.equal(Object.getPrototypeOf(expected), null);
    assert.equal(expected.left, expected.right);
    assert.ok(Object.is(expected.left.n, -0));
    assert.equal(expected.__proto__.revision, 7); assert.equal(expected.constructor, 'ordinary');
    const encoded = encode(input);
    assert.equal(c.verifySource(c.validateSource(encoded), encoded, c.donorPopulation).outcome, 'Pass');
  } finally { c.release(); }
});
check('shared arrays are allowed but a cross-object cycle is rejected', () => {
  const shared = ['a', { revision: 1 }], input = [record({ one: shared, two: shared })], c = context(input);
  try { assert.equal(c.expectedRecords(c.donorPopulation)[0].metadata.one, c.expectedRecords(c.donorPopulation)[0].metadata.two); }
  finally { c.release(); }
  const a = {}, b = {}; a.next = b; b.next = a;
  assert.throws(() => context([record(a)]), /cycle/);
});
check('negative zero and metadata revision stay distinct after populated cache', () => {
  const input = [record({ n: -0, revision: 1 })], c = context(input);
  try {
    const good = encode(input); c.verifySource(c.validateSource(good), good, c.donorPopulation); c.expectedIds(c.donorPopulation);
    for (const metadata of [{ n: 0, revision: 1 }, { n: -0, revision: 2 }]) {
      const bad = encode([record(metadata)]);
      assert.throws(() => c.verifySource(c.validateSource(bad), bad, c.donorPopulation), /literal source/);
    }
  } finally { c.release(); }
});
check('both donor and prior post-write populations survive alternating replacement cache entries', () => {
  const input = [record()], c = context(input);
  try {
    const first = record({ revision: 10 }), second = record({ revision: 11 }); second.text.body.reverse();
    const a = c.prepareLaterWrite(c.donorPopulation, first), b = c.prepareLaterWrite(c.donorPopulation, second);
    const replacement = { ...prior, text: { body: 'changed' }, metadata: { revision: 12 } };
    const p = c.prepareLaterWrite(c.priorPopulation, replacement);
    for (const [population, records] of [[a, [first]], [b, [second]], [p, [replacement]], [a, [first]], [b, [second]]]) {
      const encoded = encode(records); assert.equal(c.verifySource(c.validateSource(encoded), encoded, population).outcome, 'Pass');
    }
    const wrong = encode([first]);
    assert.throws(() => c.verifySource(c.validateSource(wrong), wrong, b), /literal source/);
  } finally { c.release(); }
});
check('released authority remains closed despite valid escaped immutable facts and bound methods', () => {
  const input = [record()], c = context(input), encoded = encode(input), handle = c.validateSource(encoded);
  const facts = c.sourceFacts(handle, encoded), read = c.sourceFacts, verify = c.verifySource;
  c.release(); c.release();
  assert.ok(Object.isFrozen(facts));
  assert.throws(() => read(handle, encoded), /released/);
  assert.throws(() => verify(handle, encoded, c.donorPopulation), /released/);
});

const after = digest(await readFile(helperPath));
const report = {
  status: cases.every(c => c.status === 'Pass') && before === after ? 'Pass' : 'Fail',
  reviewedAt: new Date().toISOString(), helperSha256: before, helperUnchangedDuringCheck: before === after,
  checks: cases,
  scope: 'Independent helper-boundary data checks only. No native engine, canary, collector or performance measurement. Does not prove physical collection or new-host runtime behavior.',
};
await writeFile(new URL('adversarial.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'Pass') process.exitCode = 1;
