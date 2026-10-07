import test from 'node:test';
import assert from 'node:assert/strict';
import { createFacets } from '../../../dist/addons/facets/index.js';
import { DEFAULT_LIMITS } from '../../../dist/core/limits/limits.js';
import { Admission } from '../../../dist/core/contracts/data.js';
import { drain, plain, request, scanFacets } from './helpers.mjs';

const schema = { text: { title: { boost: 1 } }, metadata: {
  tag: { type: 'string', multi: true, nullable: true }, other: { type: 'string', multi: false, nullable: false }, quantity: { type: 'number', multi: false, nullable: false },
} };
const prepare = (registration, input, limits = DEFAULT_LIMITS) => {
  const { value: payload } = registration.aggregation.capture(input, { admission: new Admission(limits.maxAdmissionEntries), limits, maxCodeUnits: limits.maxQueryCodeUnits });
  return drain(registration.aggregation.prepare({ revision: 1, schema, limits, capability: 'facets', payload }));
};
const aggregate = (records, payload, factoryOptions = {}, limits = DEFAULT_LIMITS) => {
  const registration = createFacets({ fields: ['tag', 'other'], ...factoryOptions });
  const prepared = prepare(registration, payload, limits);
  let workUnits = prepared.workUnits, steps = prepared.steps;
  for (const record of records) { const counted = drain(prepared.value.add(record.metadata ?? {})); workUnits += counted.workUnits; steps += counted.steps; }
  const final = drain(prepared.value.finish()); return { value: final.value.value, entries: final.value.entries, workUnits: workUnits + final.workUnits, steps: steps + final.steps };
};

test('facet factory captures bounded options without getters and declares no retained representation', () => {
  const fields = ['tag'], input = { fields, id: 'selected-facets', maxWorkUnits: 1000, maxDistinctValuesPerField: 99, maxBucketsPerField: 3 };
  const registration = createFacets(input); fields[0] = 'other'; input.id = 'changed'; input.maxWorkUnits = 1;
  assert.equal(registration.manifest.id, 'selected-facets'); assert.deepEqual(registration.manifest.dataRequirements.fields, ['tag']);
  assert.equal(registration.manifest.limits.maxWorkUnits, 1000); assert.equal(registration.manifest.limits.maxRetainedEntries, 0);
  assert.equal(registration.manifest.indexEffect, 'none'); assert.deepEqual(registration.manifest.roles, ['aggregation']);
  assert.equal(registration.aggregation.fieldType, 'string'); assert.ok(Object.isFrozen(registration) && Object.isFrozen(registration.manifest));
  let getters = 0;
  for (const options of [{}, { fields: [] }, { fields: ['tag', 'tag'] }, { fields: ['constructor'] }, { fields: ['bad-field'] },
    { fields: ['tag'], unknown: true }, { fields: ['tag'], id: '' }, { fields: ['tag'], maxWorkUnits: 0 }, { fields: ['tag'], maxDistinctValuesPerField: 0 },
    { fields: ['tag'], maxBucketsPerField: -1 }, { fields: ['tag'], get id() { getters++; return 'bad'; } }]) {
    assert.throws(() => createFacets(options), { code: 'INVALID_OPTIONS' });
  }
  assert.equal(getters, 0);
  for (const options of [{ fields: ['tag'], maxBucketsPerField: 101 }, { fields: ['tag'], maxDistinctValuesPerField: 10_001 }, { fields: ['tag'], maxWorkUnits: DEFAULT_LIMITS.maxSearchWorkUnits + 1 }]) assert.throws(() => createFacets(options), { code: 'LIMIT_EXCEEDED' });
});

test('requests reject invalid complete payloads even with no qualifying records', () => {
  const registration = createFacets({ fields: ['tag'] }); let getters = 0;
  for (const payload of [{}, { fields: [] }, { fields: ['tag'] }, { fields: [{ field: 'tag' }, { field: 'tag' }] }, { fields: [{ field: 'tag', limit: -1 }] },
    { fields: [{ field: 'tag', limit: 0.5 }] }, { fields: [{ field: 'tag', missing: 1 }] }, { fields: [{ field: 'tag', typo: true }] }, { fields: [{ field: 'tag' }], typo: true },
    { fields: [{ field: 'absent' }] }, { fields: [{ field: 'quantity' }] }, { fields: [{ get field() { getters++; return 'tag'; } }] }]) {
    assert.throws(() => prepare(registration, payload), { code: 'INVALID_OPTIONS' });
  }
  assert.equal(getters, 0);
  assert.throws(() => prepare(registration, request('other')), { code: 'MISSING_CAPABILITY' });
  assert.throws(() => prepare(registration, request({ field: 'tag', limit: 101 })), { code: 'LIMIT_EXCEEDED' });
  assert.throws(() => prepare(registration, { fields: Array.from({ length: 9 }, () => ({ field: 'tag' })) }), { code: 'LIMIT_EXCEEDED' });
});

test('exact values, null, tagged missing and empty arrays are distinct and documents deduplicate values', () => {
  const records = [
    { metadata: { tag: ['red', 'red', null, null, ''], other: 'red' } }, { metadata: { tag: ['red', '__missing__'] } },
    { metadata: {} }, { metadata: { tag: [] } }, { metadata: { tag: ['', 'Red', 'Ｒｅｄ', 'red'] } }, { metadata: { tag: null } },
  ];
  const payload = request({ field: 'tag', missing: true, limit: 100 }, { field: 'other', missing: true });
  const actual = aggregate(records, payload); assert.deepEqual(plain(actual.value), scanFacets(records, payload));
  assert.ok(actual.workUnits > 0 && actual.steps > records.length); assert.ok(Object.isFrozen(actual.value.fields[0].buckets[0]));
  assert.deepEqual(plain(actual.value.fields[0].buckets), [
    { kind: 'value', value: 'red', count: 3 }, { kind: 'value', value: null, count: 2 }, { kind: 'value', value: '', count: 2 },
    { kind: 'value', value: 'Red', count: 1 }, { kind: 'value', value: '__missing__', count: 1 }, { kind: 'value', value: 'Ｒｅｄ', count: 1 }, { kind: 'missing', count: 1 },
  ]);
  assert.equal(actual.value.fields[0].distinctValueTotal, 7);
});

test('UTF-16 tie order is original, stable and independent of document insertion order', () => {
  const values = [null, 'z', '', '__missing__', 'a', 'é', 'e\u0301', '😀', '\uE000', 'aa', 'A'];
  const records = values.map(tag => ({ metadata: { tag } })).concat({ metadata: {} });
  for (const limit of [0, 1, 3, 10, 100]) {
    const payload = request({ field: 'tag', missing: true, limit });
    const expected = scanFacets(records, payload);
    assert.deepEqual(plain(aggregate(records, payload).value), expected);
    assert.deepEqual(plain(aggregate([...records].reverse(), payload).value), expected);
    assert.equal(expected.fields[0].distinctValueTotal, 12);
  }
});

test('bounded projection selects exact highest counts beyond early buckets without incomplete counting', () => {
  const records = Array.from({ length: 140 }, (_, i) => ({ metadata: { tag: `value-${String(i).padStart(3, '0')}` } }));
  for (let i = 0; i < 5; i++) records.push({ metadata: { tag: ['value-139', 'value-138', 'value-137', 'value-137'] } });
  for (const limit of [0, 1, 2, 20, 100]) {
    const payload = request({ field: 'tag', limit });
    assert.deepEqual(plain(aggregate(records, payload).value), scanFacets(records, payload));
  }
  const narrowed = request({ field: 'tag' }); assert.deepEqual(plain(aggregate(records, narrowed, { maxBucketsPerField: 2 }).value), scanFacets(records, narrowed, 2));
  const zero = aggregate(records, narrowed, { maxBucketsPerField: 0 }).value.fields[0];
  assert.deepEqual(zero.buckets, []); assert.equal(zero.distinctValueTotal, 140); assert.equal(zero.omittedBucketCount, 140);
});

test('distinct ceiling includes opted-in missing and applies even with zero output', () => {
  const payload = request({ field: 'tag', missing: true, limit: 0 }), records = [{ metadata: { tag: 'a' } }, { metadata: { tag: null } }, { metadata: {} }];
  assert.deepEqual(plain(aggregate(records, payload, { maxDistinctValuesPerField: 3 }).value), scanFacets(records, payload));
  assert.throws(() => aggregate(records, payload, { maxDistinctValuesPerField: 2 }), { code: 'LIMIT_EXCEEDED' });
  assert.throws(() => aggregate([{ metadata: { tag: ['a', 'b', 'c'] } }], payload, {}, { ...DEFAULT_LIMITS, maxDocuments: 1, maxMetadataValuesPerField: 2 }), { code: 'LIMIT_EXCEEDED' });
  assert.throws(() => aggregate([{ metadata: { tag: 1 } }], payload), { code: 'INCOMPATIBLE_CAPABILITY' });
  assert.throws(() => aggregate([{ metadata: { other: null } }], request('other')), { code: 'INCOMPATIBLE_CAPABILITY' });
});

test('empty complete aggregation reports exact zero buckets for every selected field', () => {
  const payload = request({ field: 'tag', limit: 0, missing: true }, { field: 'other', missing: true });
  assert.deepEqual(plain(aggregate([], payload).value), { fields: [
    { field: 'tag', buckets: [], distinctValueTotal: 0, omittedBucketCount: 0 }, { field: 'other', buckets: [], distinctValueTotal: 0, omittedBucketCount: 0 },
  ] });
});

test('default ten-thousand distinct ceiling counts fully at output zero and fails the next value', () => {
  const records = Array.from({ length: 5_000 }, (_, index) => ({ metadata: { tag: [`v${index * 2}`, `v${index * 2 + 1}`] } }));
  const payload = request({ field: 'tag', limit: 0 });
  const result = aggregate(records, payload);
  assert.deepEqual(plain(result.value), { fields: [{ field: 'tag', buckets: [], distinctValueTotal: 10_000, omittedBucketCount: 10_000 }] });
  assert.throws(() => aggregate([...records, { metadata: { tag: ['next'] } }], payload), { code: 'LIMIT_EXCEEDED' });
  const shown = request({ field: 'tag', limit: 100 });
  assert.deepEqual(plain(aggregate(records, shown).value), scanFacets(records, shown));
});
