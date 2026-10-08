import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRaveldex } from '@vmitsaras/raveldex';
import { convertLocalSearchSnapshot, MigrationError } from '@vmitsaras/raveldex/integrations/localsearch';
import { createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';
import { expectedRecords, sharedQueries } from './fixtures/records.mjs';
import { migrationConfiguration, addConvertedRecords, withoutRevision } from './native-configuration.mjs';
import { rebuildCompanionSource } from '../../examples/migration/convert-and-rebuild.mjs';
const fixture = async name => new Uint8Array(await readFile(new URL(`./fixtures/${name}.json`, import.meta.url)));
const representative = await fixture('representative');
const provenance = JSON.parse(await readFile(new URL('./fixtures/provenance.json', import.meta.url)));
const encode = value => new TextEncoder().encode(value);
const json = value => Array.isArray(value) ? '[' + value.map(json).join(',') + ']' : value && typeof value === 'object'
  ? '{' + Object.keys(value).map(key => JSON.stringify(key) + ':' + json(value[key])).join(',') + '}' : Object.is(value, -0) ? '-0' : JSON.stringify(value);
function changed(update) {
  const envelope = JSON.parse(new TextDecoder().decode(representative)); update(envelope);
  envelope.checksum.value = createHash('sha256').update('localsearch-source-v1\n').update(json(envelope.payload)).digest('hex');
  return encode(json(envelope));
}
function frozenTree(value) {
  if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) frozenTree(child); }
}
const reports = [];
const observe = (name, work) => test(name, async () => {
  try { const evidence = await work(); reports.push({ name, status: 'Pass', evidence }); }
  catch (error) { reports.push({ name, status: 'Fail', error: String(error) }); throw error; }
});
observe('actual public companion exports match pinned fixture provenance and independent data', async () => {
  for (const generated of provenance.generated) {
    const bytes = await fixture(generated.name);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), generated.sha256);
  }
  assert.equal(provenance.producer.revision, '5f334a8ca4f7d9d95b6b731ac539f4b1dda302cb');
  assert.ok(provenance.historicalEvidence.length > 0);
  const plan = await convertLocalSearchSnapshot(representative);
  assert.deepEqual(JSON.parse(JSON.stringify(plan.records)), expectedRecords);
  assert.deepEqual(JSON.parse(JSON.stringify(plan.configuration)), { schema: { text: { title: { boost: 2 }, body: { boost: 1 } }, metadata: { category: { type: 'string', multi: false, nullable: false }, price: { type: 'number', multi: false, nullable: false }, active: { type: 'boolean', multi: false, nullable: false } } }, analyzer: { id: 'basic-v1', environmentProfile: 'unqualified' } });
  assert.equal(plan.sourceRevision, 'rx-3004-owned-source');
  assert.deepEqual(plan.origin, provenance.generated.find(row => row.name === 'representative').origin);
  assert.deepEqual(plan.returnFields, ['title', 'category']);
  assert.equal(plan.identity.dependency, 'minisearch@7.2.0');
  assert.equal(plan.identity.nativeScoreModel, 'raveldex-bm25-v1');
  frozenTree(plan);
  assert.equal(Object.is(plan.records[0].metadata.price, -0), false);
  return { fixtureSha256: provenance.generated[0].sha256, recordCount: plan.records.length, legacyNegativeZeroNormalizedToNativePositiveZero: true, frozen: true };
});
observe('owned input is captured before asynchronous checksum and returned values cannot mutate', async () => {
  const callerBytes = new Uint8Array(representative); const pending = convertLocalSearchSnapshot(callerBytes); callerBytes.fill(0);
  const plan = await pending; assert.deepEqual(JSON.parse(JSON.stringify(plan.records)), expectedRecords);
  assert.throws(() => plan.records[0].text.body.push('changed'), TypeError);
  assert.throws(() => { plan.configuration.schema.text.title.boost = 9; }, TypeError);
  assert.throws(() => { plan.origin.generation = 0; }, TypeError);
  const again = await convertLocalSearchSnapshot(representative); assert.notEqual(again, plan); assert.notEqual(again.records, plan.records);
  return { independentlyOwnedCalls: true, callerBytesChangedWhilePending: true };
});
observe('genuine empty export preserves absent source revision and fresh native zero revision', async () => {
  const plan = await convertLocalSearchSnapshot(await fixture('empty')); assert.deepEqual(plan.records, []); assert.equal(plan.sourceRevision, null); assert.equal(plan.origin.generation, 0);
  const engine = createRaveldex(migrationConfiguration(plan)); try { const result = await engine.search({ kind: 'all' }); assert.equal(result.total, 0); assert.equal(result.revision, 0); return { result }; } finally { await engine.dispose(); }
});
observe('public conversion rebuild query update source export and reload match independently authored native records', async () => {
  const plan = await convertLocalSearchSnapshot(representative);
  const actual = createRaveldex(migrationConfiguration(plan)), expected = createRaveldex(migrationConfiguration(plan)), reload = createRaveldex(migrationConfiguration(plan));
  try {
    await addConvertedRecords(actual, plan.records); await addConvertedRecords(expected, expectedRecords);
    const rows = [];
    for (const row of sharedQueries) {
      const result = await actual.search(row.native, { limit: 100 }); const reference = await expected.search(row.native, { limit: 100 });
      assert.deepEqual(result.hits.map(hit => hit.id).sort(), row.ids); assert.equal(result.total, row.ids.length); assert.equal(result.model, 'raveldex-bm25-v1');
      assert.deepEqual(result, reference); rows.push({ label: row.label, result });
    }
    const mutation = { id: 'b', text: { title: ['green truck'], body: ['red blue'] }, metadata: { category: 'Guide', price: 99, active: true } };
    const receipt = await actual.replace(mutation); await expected.replace(mutation); assert.equal(receipt.revision, 7);
    const encoded = await createSnapshots(actual).exportSource(), restore = await createSnapshots(reload).restore(encoded); assert.equal(restore.reindexed, true);
    for (const row of sharedQueries) assert.deepEqual(withoutRevision(await reload.search(row.native, { limit: 100 })), withoutRevision(await expected.search(row.native, { limit: 100 })));
    return { comparisons: rows.length * 2, rows, replaced: receipt, restore, sourceFormat: JSON.parse(encoded).format };
  } finally { await Promise.all([actual.dispose(), expected.dispose(), reload.dispose()]); }
});
observe('native Unicode normalization is explicit expected semantic change', async () => {
  const migration = await rebuildCompanionSource(representative);
  try {
    const result = await migration.engine.search('file car', { limit: 100 }); assert.deepEqual(result.hits.map(row => row.id), ['unicode']);
    assert.ok(migration.differences.some(value => /NFKC/.test(value)));
    return { nativeResult: result, expectation: 'Fullwidth CAR and fi ligature normalize natively; this branch is excluded from shared NFC-only membership parity.' };
  } finally { await migration.engine.dispose(); }
});
const cases = [
  ['corrupt checksum', encode(new TextDecoder().decode(representative).replace('Red red car', 'Bad red car')), 'CHECKSUM_MISMATCH'],
  ['unsupported envelope version', changed(e => { e.format = 2; }), 'INCOMPATIBLE_SNAPSHOT'],
  ['unsupported contract', changed(e => { e.payload.contract = 'native-v1'; }), 'INCOMPATIBLE_SNAPSHOT'],
  ['unsupported dependency', changed(e => { e.payload.dependency = 'minisearch@8.0.0'; }), 'INCOMPATIBLE_SNAPSHOT'],
  ['unsupported analyzer', changed(e => { e.payload.analyzerId = 'custom-v2'; }), 'INCOMPATIBLE_SNAPSHOT'],
  ['unsupported scoring model', changed(e => { e.payload.scoreModel = 'raveldex-bm25-v1'; }), 'INCOMPATIBLE_SNAPSHOT'],
  ['opaque MiniSearch index', encode('{"documentCount":1,"index":[["red",{}]],"serializationVersion":2}'), 'INVALID_SNAPSHOT'],
  ['noncanonical whitespace', encode(' ' + new TextDecoder().decode(representative)), 'NONCANONICAL_SNAPSHOT'],
  ['noncanonical schema order', changed(e => { e.payload.config = { returnFields: e.payload.config.returnFields, schema: e.payload.config.schema }; }), 'INVALID_SNAPSHOT'],
  ['noncanonical record order', changed(e => { e.payload.records.reverse(); }), 'NONCANONICAL_SNAPSHOT'],
  ['duplicate lexical key', encode(new TextDecoder().decode(representative).replace('"format":1,', '"format":1,"format":1,')), 'INVALID_SNAPSHOT'],
  ['duplicate record ids', changed(e => { e.payload.records[1].id = 'a'; }), 'INVALID_SNAPSHOT'],
  ['duplicate schema fields', changed(e => { e.payload.config.schema[1].name = 'title'; }), 'INVALID_SNAPSHOT'],
  ['count mismatch', changed(e => { e.payload.counts.recordCount++; }), 'INVALID_SNAPSHOT'],
  ['token count mismatch', changed(e => { e.payload.counts.indexedTokens++; }), 'INVALID_SNAPSHOT'],
  ['array count mismatch', changed(e => { e.payload.counts.arraySlots++; }), 'INVALID_SNAPSHOT'],
  ['source count mismatch', changed(e => { e.payload.counts.sourceStringUnits++; }), 'INVALID_SNAPSHOT'],
  ['unknown schema type', changed(e => { e.payload.config.schema[2].type = 'object'; }), 'INVALID_SNAPSHOT'],
  ['unsafe schema field', changed(e => { e.payload.config.schema[0].name = '__proto__'; }), 'INVALID_SNAPSHOT'],
  ['undeclared record field', changed(e => { e.payload.records[0].other = 'x'; }), 'INVALID_SNAPSHOT'],
  ['unknown projection field', changed(e => { e.payload.config.returnFields.push('unknown'); }), 'INVALID_SNAPSHOT'],
  ['duplicate projection field', changed(e => { e.payload.config.returnFields.push('title'); }), 'INVALID_SNAPSHOT'],
  ['unsafe origin generation', changed(e => { e.payload.origin.generation = Number.MAX_SAFE_INTEGER + 1; }), 'INVALID_SNAPSHOT'],
  ['overlong source revision', changed(e => { e.payload.sourceRevision = 'x'.repeat(257); }), 'INVALID_SNAPSHOT'],
  ['text scalar given array', changed(e => { e.payload.records[0].title = ['Red red car']; }), 'INVALID_SNAPSHOT'],
  ['native boost limit', changed(e => { e.payload.config.schema[0].boost = 17; }), 'NATIVE_INCOMPATIBLE'],
  ['native keyword limit', changed(e => { e.payload.records[0].category = 'x'.repeat(1025); e.payload.counts.sourceStringUnits += 1020; }), 'NATIVE_INCOMPATIBLE'],
  ['native text array limit', changed(e => { e.payload.records[2].body = Array(65).fill(''); e.payload.counts.arraySlots += 65; }), 'NATIVE_INCOMPATIBLE'],
  ['native malformed UTF16', changed(e => { e.payload.records[0].category = '\ud800'; e.payload.counts.sourceStringUnits -= 4; }), 'NATIVE_INCOMPATIBLE'],
  ['native raw token limit', changed(e => { e.payload.records[2].title = 'x'.repeat(257); e.payload.counts.sourceStringUnits += 253; }), 'NATIVE_INCOMPATIBLE'],
  ['maximum byte bound', new Uint8Array(33_554_433), 'INVALID_BYTES'],
  ['empty bytes', new Uint8Array(), 'INVALID_BYTES'],
  ['UTF8 BOM', new Uint8Array([239, 187, 191, ...representative]), 'INVALID_SNAPSHOT'],
  ['malformed UTF8', new Uint8Array([0xc0, 0xaf]), 'INVALID_SNAPSHOT'],
  ['deep payload before parse', encode('{"x":'.repeat(7) + '1' + '}'.repeat(7)), 'INVALID_SNAPSHOT'],
  ['truncated payload', representative.slice(0, -1), 'INVALID_SNAPSHOT'],
  ['ordinary object', {}, 'INVALID_BYTES'],
  ['Node Buffer subtype', Buffer.from(representative), 'INVALID_BYTES'],
  ['typed array subclass', new (class ForeignBytes extends Uint8Array {})(representative), 'INVALID_BYTES'],
  ['shared backing memory', new Uint8Array(new SharedArrayBuffer(8)), 'INVALID_BYTES'],
];
for (const [label, input, code] of cases) observe(`explicit rejection: ${label}`, async () => {
  await assert.rejects(convertLocalSearchSnapshot(input), error => { assert.ok(error instanceof MigrationError); assert.equal(error.code, code); assert.ok(Object.isFrozen(error.details)); return true; });
  return { code };
});
observe('byte capture rejects detached views and hostile accessors without invoking them', async () => {
  const detached = new Uint8Array(representative); structuredClone(detached, { transfer: [detached.buffer] });
  await assert.rejects(convertLocalSearchSnapshot(detached), { code: 'INVALID_BYTES' });
  let called = 0; const input = Object.create(Uint8Array.prototype); Object.defineProperty(input, 'byteLength', { get() { called++; throw Error('must not run'); } });
  await assert.rejects(convertLocalSearchSnapshot(input), { code: 'INVALID_BYTES' }); assert.equal(called, 0);
  return { detached: 'Rejected', hostileAccessorCalls: called };
});
observe('conversion failure never mutates an existing native owner or native source snapshot', async () => {
  const migration = await rebuildCompanionSource(representative);
  try {
    const sourceBefore = await migration.snapshots.exportSource(), resultBefore = await migration.engine.search({ kind: 'all' }, { limit: 100 });
    await assert.rejects(convertLocalSearchSnapshot(cases[0][1]), { code: 'CHECKSUM_MISMATCH' });
    assert.deepEqual(await migration.engine.search({ kind: 'all' }, { limit: 100 }), resultBefore); assert.equal(await migration.snapshots.exportSource(), sourceBefore);
    return { before: resultBefore, completeSourceUnchanged: true };
  } finally { await migration.engine.dispose(); }
});
process.once('beforeExit', async () => {
  const path = process.env.RAVELDEX_MIGRATION_REPORT ?? '/tmp/raveldex-rx3004-migration.json';
  await writeFile(path, JSON.stringify({ kind: 'raveldex-source-migration-behavior-v1', environment: { node: process.version, v8: process.versions.v8, icu: process.versions.icu, unicode: process.versions.unicode }, provenance,
    records: reports, summary: { passed: reports.filter(row => row.status === 'Pass').length, failed: reports.filter(row => row.status === 'Fail').length } }, null, 2) + '\n');
});
