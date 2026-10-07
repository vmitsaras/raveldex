import assert from 'node:assert/strict';
import test from 'node:test';
import { createFilters } from '../../../dist/addons/filters/index.js';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { fields, nativeQuery, range, records, schema, set, setup } from './helpers.mjs';

const code = expected => error => error.code === expected;

test('range bounds apply to one numeric element with finite typed endpoints', async () => {
  const state = setup(); await state.call('addMany', records);
  const cases = [
    [{ gte: 10, lte: 20 }, ['b', 'c', 'h']],
    [{ gt: 10, lt: 20 }, ['c', 'h']],
    [{ gte: 10, lte: 10 }, ['b']],
    [{ gt: 10, lte: 10 }, []],
    [{ gte: 10, lt: 10 }, []],
    [{ gt: 10, lt: 10 }, []],
    [{ lt: 0 }, ['g']],
    [{ gte: -0, lte: 0 }, ['g']],
  ];
  for (const [bounds, ids] of cases) {
    const result = await state.call('search', nativeQuery(range({ field: 'price', ...bounds })), { limit: 100 });
    assert.deepEqual(result.hits.map(hit => hit.id), ids);
    assert.equal(result.total, ids.length);
    assert.ok(result.hits.every(hit => hit.score === 0));
  }
  await state.call('dispose');
});

test('set membership distinguishes missing, empty, null, scalar types, case and duplicate values', async () => {
  const state = setup(); await state.call('addMany', records);
  const cases = [
    [{ field: 'tags', values: ['red', 'red'] }, ['a', 'b']],
    [{ field: 'tags', values: [null] }, ['a', 'c', 'e']],
    [{ field: 'tags', values: ['Red'] }, ['h']],
    [{ field: 'tags', values: ['10'] }, ['g']],
    [{ field: 'status', values: [''] }, ['a']],
    [{ field: 'price', values: [0, -0] }, ['g']],
    [{ field: 'active', values: [false] }, ['a', 'c', 'g']],
    [{ field: 'active', values: [null, true] }, ['a', 'b', 'e', 'g', 'h']],
  ];
  for (const [payload, ids] of cases) {
    const result = await state.call('search', nativeQuery(set(payload)), { limit: 100 });
    assert.deepEqual(result.hits.map(hit => hit.id), ids);
    assert.equal(result.total, ids.length); assert.ok(result.hits.every(hit => hit.score === 0));
  }
  const result = await state.call('search', nativeQuery({ kind: 'not', child: set({ field: 'tags', values: [null] }) }), { limit: 100 });
  assert.deepEqual(result.hits.map(hit => hit.id), ['b', 'd', 'f', 'g', 'h']);
  await state.call('dispose');
});

test('nullable scalar fields retain exact null/empty/zero/false membership and numeric null exclusion', async () => {
  const selectedSchema = { text: { title: {} }, metadata: { item: { type: 'string', nullable: true }, num: { type: 'number', nullable: true }, flag: { type: 'boolean', nullable: true } } };
  const state = setup({ schema: selectedSchema, addons: [createFilters({ fields: ['item', 'num', 'flag'] })] });
  await state.call('addMany', [
    { id: 'a', text: {}, metadata: { item: null, num: null, flag: null } },
    { id: 'b', text: {}, metadata: { item: '', num: 0, flag: false } },
    { id: 'c', text: {} },
  ]);
  for (const field of ['item', 'num', 'flag']) assert.deepEqual((await state.call('search', nativeQuery(set({ field, values: [null] })))).hits.map(hit => hit.id), ['a']);
  for (const [field, value] of [['item', ''], ['num', -0], ['flag', false]]) assert.deepEqual((await state.call('search', nativeQuery(set({ field, values: [value] })))).hits.map(hit => hit.id), ['b']);
  assert.deepEqual((await state.call('search', nativeQuery(range({ field: 'num', gte: 0 })))).hits.map(hit => hit.id), ['b']);
  assert.deepEqual((await state.call('search', nativeQuery({ kind: 'not', child: range({ field: 'num', gte: 0 }) }))).hits.map(hit => hit.id), ['a', 'c']);
  await state.call('dispose');
});

test('invalid payloads reject before candidate traversal on an empty index and irrelevant Boolean branches', async () => {
  const state = setup();
  const invalid = [
    range({ field: 'price' }), range({ field: 'price', gt: 1, gte: 1 }), range({ field: 'price', lt: 2, lte: 2 }),
    range({ field: 'price', gte: 20, lte: 10 }), range({ field: 'price', gt: '10' }), range({ field: 'price', gt: null }),
    range({ field: 'price', gt: NaN }), range({ field: 'price', gt: Infinity }), range({ field: 'price', gt: undefined }),
    range({ field: 'tags', gt: 1 }), range({ field: 'unknown', gt: 1 }), range({ field: 'price', gt: 1, unexpected: true }),
    set({ field: 'tags', values: [] }), set({ field: 'price', values: ['10'] }), set({ field: 'tags', values: [10] }),
    set({ field: 'active', values: ['true'] }), set({ field: 'quality', values: [null] }), set({ field: 'price', values: [NaN] }),
    set({ field: 'tags', values: [{}] }), set({ field: 'tags', values: ['x'], extra: 1 }),
  ];
  for (const query of invalid) {
    for (const envelope of [nativeQuery(query), nativeQuery({ kind: 'and', children: [{ kind: 'none' }, query] }), nativeQuery({ kind: 'or', children: [{ kind: 'all' }, query] })]) {
      await assert.rejects(state.call('search', envelope, { limit: 0 }), code('INVALID_QUERY'));
    }
  }
  await assert.rejects(state.call('search', nativeQuery(set({ field: 'disabled', values: ['x'] }))), code('MISSING_CAPABILITY'));
  await state.call('dispose');
});

test('set values obey both v1 cardinality and stricter metadata string/cardinality limits', async () => {
  const state = setup({ limits: { maxMetadataValuesPerField: 2, maxMetadataStringCodeUnits: 3 } });
  await state.call('search', nativeQuery(set({ field: 'tags', values: ['a', 'b'] })));
  await assert.rejects(state.call('search', nativeQuery(set({ field: 'tags', values: ['a', 'b', 'c'] }))), code('LIMIT_EXCEEDED'));
  await assert.rejects(state.call('search', nativeQuery(set({ field: 'tags', values: ['four'] }))), code('LIMIT_EXCEEDED'));
  await state.call('dispose');
  const defaultState = setup();
  await defaultState.call('search', nativeQuery(set({ field: 'price', values: Array.from({ length: 128 }, (_, i) => i) })));
  await assert.rejects(defaultState.call('search', nativeQuery(set({ field: 'price', values: Array.from({ length: 129 }, (_, i) => i) }))), code('LIMIT_EXCEEDED'));
  await defaultState.call('dispose');
});

test('plain payload ownership rejects malformed JSON/UTF-16 without executing accessors even for zero results', async () => {
  const state = setup();
  let calls = 0;
  const values = ['red']; Object.defineProperty(values, '0', { get() { calls++; return 'red'; } });
  const accessor = { field: 'tags', get values() { calls++; return ['red']; } };
  const sparse = new Array(1), cycle = { field: 'tags', values: ['red'] }; cycle.other = cycle;
  const symbol = { field: 'tags', values: ['red'], [Symbol('input')]: 1 };
  const cases = [
    accessor, { field: 'tags', values }, { field: 'tags', values: sparse }, cycle, symbol,
    Object.assign(Object.create({ inherited: true }), { field: 'tags', values: ['red'] }),
    { field: 'tags', values: ['red'], date: new Date() }, { field: 'tags', values: ['red'], fn: () => true },
    { field: 'tags', values: ['\ud800'] }, { field: 'tags', values: ['\udc00'] },
    { field: 'tags', values: ['red'], ['bad\ud800']: true },
  ];
  for (const payload of cases) {
    const extension = { kind: 'extension', capability: 'set-membership', version: 1, payload };
    await assert.rejects(state.call('search', extension, { limit: 0 }), code('INVALID_QUERY'));
    await assert.rejects(state.call('search', { kind: 'or', children: [{ kind: 'all' }, extension] }, { limit: 0 }), code('INVALID_QUERY'));
  }
  assert.equal(calls, 0);
  await state.call('dispose');
});

test('aggregate query and installed payload caps account owned keys and scalar strings', async () => {
  const addon = createFilters({ fields });
  const capped = { ...addon, manifest: { ...addon.manifest, limits: { ...addon.manifest.limits, maxPayloadCodeUnits: 17 } } };
  const state = setup({ addons: [capped] });
  await assert.rejects(state.call('search', nativeQuery(set({ field: 'tags', values: ['red'] }))), code('LIMIT_EXCEEDED'));
  await state.call('dispose');
  const shared = setup({ limits: { maxQueryCodeUnits: 50 } });
  const query = nativeQuery(set({ field: 'tags', values: ['red'] }));
  await shared.call('search', query);
  await assert.rejects(shared.call('search', { kind: 'and', children: [query, query] }), code('LIMIT_EXCEEDED'));
  await shared.call('dispose');
});

test('filter factory owns immutable bounded options and rejects accessor/prototype/field/cap mistakes', () => {
  const selected = ['price', 'tags'], options = { fields: selected, id: 'selected-filters', maxWorkUnits: 1000 };
  const addon = createFilters(options);
  selected[0] = 'disabled'; options.id = 'changed'; options.maxWorkUnits = 1;
  assert.equal(addon.manifest.id, 'selected-filters');
  assert.equal(addon.manifest.limits.maxWorkUnits, 1000);
  assert.deepEqual(addon.manifest.dataRequirements.fields, ['price', 'tags']);
  assert.deepEqual(addon.manifest.provides.map(entry => entry.id), ['numeric-range', 'set-membership']);
  for (const value of [addon, addon.manifest, addon.manifest.dataRequirements, addon.manifest.dataRequirements.fields, addon.predicate]) assert.ok(Object.isFrozen(value));
  let calls = 0;
  const accessor = { get fields() { calls++; return fields; } };
  const invalid = [accessor, Object.create({ fields }), { fields: [] }, { fields: ['price', 'price'] }, { fields: ['__proto__'] }, { fields: ['constructor'] }, { fields: ['price'], extra: true }, { fields: ['price'], id: '' }, { fields: ['price'], maxWorkUnits: 0 }, { fields: ['price'], maxWorkUnits: Infinity }];
  for (const input of invalid) assert.throws(() => createFilters(input), code('INVALID_OPTIONS'));
  assert.equal(calls, 0);
  assert.throws(() => createFilters({ fields, maxWorkUnits: 10_000_001 }), code('LIMIT_EXCEEDED'));
});

test('configured fields must be metadata and require explicit capability installation/version', async () => {
  assert.throws(() => captureConfiguration({ schema, addons: [createFilters({ fields: ['title'] })] }), code('INCOMPATIBLE_CAPABILITY'));
  assert.throws(() => captureConfiguration({ schema, addons: [createFilters({ fields: ['unknown'] })] }), code('INCOMPATIBLE_CAPABILITY'));
  const state = setup({ addons: [] });
  await assert.rejects(state.call('search', nativeQuery(range({ field: 'price', gt: 1 }))), code('MISSING_CAPABILITY'));
  await state.call('dispose');
  const enabled = setup();
  const query = { ...nativeQuery(set({ field: 'tags', values: ['red'] })), version: 2 };
  await assert.rejects(enabled.call('search', query), code('INCOMPATIBLE_CAPABILITY'));
  await enabled.call('dispose');
});
