import test from 'node:test';
import assert from 'node:assert/strict';
import { createFacets } from '../../../dist/addons/facets/index.js';
import { createFilters } from '../../../dist/addons/filters/index.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { plain, request, options, scanFacets, qualifies, setup } from './helpers.mjs';

const schema = { text: { title: {} }, metadata: {
  tags: { type: 'string', multi: true, nullable: true }, category: { type: 'string', nullable: true },
  other: { type: 'string', multi: true }, number: { type: 'number', multi: true, nullable: true }, active: { type: 'boolean' },
} };
const corpus = [
  { id: 'a', text: { title: 'red blue' }, metadata: { tags: ['red', 'red', 'blue'], category: 'one', number: [5, 25], active: true } },
  { id: 'b', text: { title: 'red gap blue' }, metadata: { tags: ['red', null], category: 'two', number: [15], active: false } },
  { id: 'c', text: { title: 'red blue' }, metadata: { tags: ['blue', 'blue'], category: 'one', number: [10, 20], active: true } },
  { id: 'd', text: { title: 'blue red' }, metadata: { category: null, number: [null] } },
  { id: 'e', text: { title: 'green' }, metadata: { tags: ['__missing__', ''], category: 'two', number: [] } },
  { id: 'f', text: {}, metadata: { tags: [], category: 'one', number: [100] } },
  { id: 'g', text: { title: 'red blue' }, metadata: {} },
];
const facets = () => createFacets({ fields: ['tags', 'category', 'other'] });
const filter = (capability, payload) => ({ kind: 'extension', capability, version: 1, payload });
const within = payload => filter('numeric-range', payload);
const member = (field, values) => filter('set-membership', { field, values });
const phrase = text => ({ kind: 'extension', capability: 'phrases', version: 1, payload: { text, fields: ['title'] } });

test('registration rejects unknown/non-string enabled metadata fields before an operation', async () => {
  for (const fields of [['absent'], ['title'], ['number'], ['active']]) assert.throws(() => setup(schema, { addons: [createFacets({ fields })] }), { code: 'INCOMPATIBLE_CAPABILITY' });
  const installed = setup(schema, { addons: [facets()] });
  assert.deepEqual(Object.keys(installed.engine.root.participants), []);
  assert.equal(installed.engine.root.configuration.capabilities.providers.facets.manifest.dataRequirements.metadata, true);
  assert.equal(installed.engine.root.configuration.capabilities.providers.facets.manifest.indexEffect, 'none');
  await installed.engine.dispose();
});

test('facets count complete conjunctive membership including own selections before every page limit/offset', async () => {
  const installed = setup(schema); await installed.call('addMany', corpus);
  const selections = [request({ field: 'tags', missing: true, limit: 100 }, 'category'), request({ field: 'tags', limit: 1 }, { field: 'category', missing: true, limit: 0 })];
  const queries = [
    { kind: 'all' }, { kind: 'none' }, { kind: 'eq', field: 'tags', value: 'red' },
    { kind: 'not', child: { kind: 'eq', field: 'tags', value: 'red' } },
    { kind: 'or', children: [{ kind: 'eq', field: 'tags', value: 'red' }, { kind: 'eq', field: 'tags', value: null }] },
    { kind: 'and', children: [{ kind: 'eq', field: 'tags', value: 'blue' }, { kind: 'eq', field: 'category', value: 'one' }] },
    { kind: 'and', children: [{ kind: 'not', child: { kind: 'eq', field: 'category', value: 'one' } }, { kind: 'or', children: [{ kind: 'eq', field: 'active', value: false }, { kind: 'not', child: { kind: 'eq', field: 'active', value: true } }] }] },
  ];
  let comparisons = 0;
  for (const query of queries) for (const payload of selections) for (const page of [{ limit: 0 }, { limit: 1 }, { limit: 2, offset: 2 }, { limit: 100, offset: 100 }]) {
    const expectedRecords = corpus.filter(record => qualifies(record, query)), expected = scanFacets(expectedRecords, payload);
    const ordinary = await installed.call('search', query, page), actual = await installed.call('search', query, options(payload, page));
    assert.deepEqual(plain(actual.extensions.facets), expected); assert.equal(actual.total, expectedRecords.length);
    assert.deepEqual({ ...actual, extensions: undefined }, { ...ordinary, extensions: undefined }); comparisons++;
  }
  assert.equal(comparisons, 56); await installed.engine.dispose();
});

test('facet requests compose with numeric/set predicates and source phrases without lexical score changes', async () => {
  const installed = setup(schema, { addons: [facets(), createFilters({ fields: ['tags', 'category', 'number', 'active'] }), createSourceProvider({ fields: ['title'] }), createSourcePhrases({ fields: ['title'] })] });
  await installed.call('addMany', corpus);
  const payload = request({ field: 'tags', missing: true }, { field: 'category', missing: true });
  const cases = [
    [member('tags', ['red']), ['a', 'b']],
    [within({ field: 'number', gte: 10, lte: 20 }), ['b', 'c']],
    [{ kind: 'and', children: [member('tags', ['blue', 'red']), within({ field: 'number', gt: 10, lt: 20 })] }, ['b']],
    [{ kind: 'and', children: [phrase('red blue'), member('category', ['one'])] }, ['a', 'c']],
    [{ kind: 'or', children: [{ kind: 'and', children: [phrase('red blue'), member('category', ['one'])] }, { kind: 'not', child: within({ field: 'number', gte: 0, lte: 100 }) }] }, ['a', 'c', 'd', 'e', 'g']],
  ];
  for (const [query, ids] of cases) for (const page of [{ limit: 0 }, { limit: 1, offset: 1 }, { limit: 100 }]) {
    const ordinary = await installed.call('search', query, page), actual = await installed.call('search', query, options(payload, page));
    assert.deepEqual(plain(actual.extensions.facets), scanFacets(corpus.filter(record => ids.includes(record.id)), payload));
    assert.equal(actual.total, ids.length); assert.deepEqual(actual.hits, ordinary.hits); assert.equal(actual.revision, 1);
  }
  await installed.engine.dispose();
});

test('fixed-seed multi-value full scans agree across nesting, own-filters and bounded bucket projection', async () => {
  let state = 0x2003; const random = max => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % max; };
  const tags = [null, '', 'red', 'Blue', '__missing__', '😀', '\uE000', 'é', 'e\u0301'];
  const records = Array.from({ length: 180 }, (_, index) => {
    const metadata = {};
    if (random(4)) metadata.tags = Array.from({ length: random(8) }, () => tags[random(tags.length)]);
    if (random(4)) metadata.category = tags[random(tags.length)];
    if (random(3)) metadata.active = Boolean(random(2));
    return { id: `generated-${index}`, text: {}, metadata };
  });
  const installed = setup(schema); await installed.call('addMany', records);
  let comparisons = 0;
  for (let index = 0; index < 40; index++) {
    const leaf = () => ({ kind: 'eq', field: random(2) ? 'tags' : 'category', value: tags[random(tags.length)] });
    const query = { kind: random(2) ? 'and' : 'or', children: [leaf(), { kind: 'not', child: leaf() }, { kind: 'or', children: [leaf(), leaf()] }] };
    const payload = request({ field: 'tags', limit: random(5), missing: Boolean(random(2)) }, { field: 'category', limit: random(5), missing: Boolean(random(2)) });
    const matching = records.filter(record => qualifies(record, query));
    for (const page of [{ limit: 0 }, { limit: 1 }, { limit: 10, offset: 2 }]) {
      const actual = await installed.call('search', query, options(payload, page));
      assert.equal(actual.total, matching.length); assert.deepEqual(plain(actual.extensions.facets), scanFacets(matching, payload)); comparisons++;
    }
  }
  assert.equal(comparisons, 120); await installed.engine.dispose();
});

test('mutation revisions and failed writes leave facet tables coherent without retained facet roots', async () => {
  const installed = setup(schema); const payload = request({ field: 'tags', missing: true }, { field: 'category', missing: true });
  let records = []; const verify = async revision => {
    const result = await installed.call('search', { kind: 'all' }, options(payload, { limit: 0 }));
    assert.equal(result.revision, revision); assert.equal(result.total, records.length); assert.deepEqual(plain(result.extensions.facets), scanFacets(records, payload));
    assert.deepEqual(Object.keys(installed.engine.root.participants), []);
  };
  await verify(0); await installed.call('addMany', corpus); records = [...corpus]; await verify(1);
  const replacement = { id: 'a', text: { title: 'green' }, metadata: { tags: ['changed', 'changed'], category: null } };
  await installed.call('replace', replacement); records[0] = replacement; await verify(2);
  await installed.call('remove', ['b', 'f']); records = records.filter(record => !['b', 'f'].includes(record.id)); await verify(3);
  await installed.call('remove', ['already-absent']); await verify(3);
  await assert.rejects(installed.call('addMany', [{ id: 'valid', text: {}, metadata: { tags: 'staged' } }, { id: 'bad', text: {}, metadata: { tags: 42 } }]), { code: 'INVALID_RECORD' }); await verify(3);
  await installed.call('clear'); records = []; await verify(4); await installed.call('clear'); await verify(4);
  await installed.engine.dispose();
});

test('counting overflow is a typed full-operation failure even with zero result and bucket limits', async () => {
  const installed = setup(schema, { addons: [createFacets({ fields: ['tags'], maxDistinctValuesPerField: 2 })] });
  await installed.call('addMany', corpus); const previous = installed.engine.root;
  await assert.rejects(installed.call('search', { kind: 'all' }, options(request({ field: 'tags', limit: 0, missing: true }), { limit: 0 })), { code: 'LIMIT_EXCEEDED' });
  assert.equal(installed.engine.root, previous); assert.equal(installed.host.pending, 0);
  const empty = await installed.call('search', { kind: 'none' }, options(request({ field: 'tags', limit: 0, missing: true }), { limit: 0 }));
  assert.deepEqual(plain(empty.extensions.facets), scanFacets([], request({ field: 'tags', limit: 0, missing: true })));
  const ordinary = await installed.call('search', { kind: 'all' }, { limit: 0 }); assert.equal(ordinary.total, corpus.length); assert.equal(Object.hasOwn(ordinary, 'extensions'), false);
  await installed.engine.dispose();
});

test('all eight maximum-sized facet outputs are complete and fit declared structural output bounds', async () => {
  const fields = Array.from({ length: 8 }, (_, index) => `field${index}`), schema = { text: { title: {} }, metadata: Object.fromEntries(fields.map(field => [field, { type: 'string' }])) };
  const records = Array.from({ length: 100 }, (_, index) => ({ id: `max-${index}`, text: {}, metadata: Object.fromEntries(fields.map(field => [field, `${field}-value-${index}`])) }));
  const installed = setup(schema), payload = request(...fields.map(field => ({ field, limit: 100, missing: true })));
  await installed.call('addMany', records); const result = await installed.call('search', { kind: 'all' }, options(payload, { limit: 0 }));
  assert.equal(result.total, 100); assert.equal(result.extensions.facets.fields.length, 8); assert.deepEqual(plain(result.extensions.facets), scanFacets(records, payload));
  for (const field of result.extensions.facets.fields) { assert.equal(field.buckets.length, 100); assert.equal(field.omittedBucketCount, 0); assert.ok(Object.isFrozen(field.buckets)); }
  await installed.engine.dispose();
});
