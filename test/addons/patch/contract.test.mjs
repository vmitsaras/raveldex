import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaveldex, RaveldexError } from '../../../dist/index.js';
import { createPatch } from '../../../dist/addons/patch/index.js';
import { createSourceProvider } from '../../../dist/addons/phrases/source.js';
import { getExecutionOwner } from '../../../dist/core/execution/engine.js';
import { directoryGet } from '../../../dist/core/index/directory.js';

const schema = { text: { title: {}, body: {} }, metadata: {
  category: { type: 'string' }, tags: { type: 'string', multi: true }, count: { type: 'number', nullable: true }, enabled: { type: 'boolean' },
} };
const record = () => ({ id: 'a', text: { title: 'red apple', body: ['blue sky', 'second value'] }, metadata: { category: 'Guide', tags: ['one', 'one', 'two'], count: 3, enabled: true } });
function engine(options = {}) { return createRaveldex({ schema, addons: [createSourceProvider({ fields: ['title', 'body'] })], ...options }); }
function current(owner, id = 'a') {
  const root = getExecutionOwner(owner).root, source = directoryGet(root.participants.source.records, id), document = directoryGet(root.documents, id);
  return JSON.parse(JSON.stringify({ revision: root.revision, text: source?.text, metadata: document?.metadata }));
}
async function rejected(promise, code) { await assert.rejects(promise, error => error instanceof RaveldexError && error.code === code); }

test('patch is a frozen borrowed direct-owner handle with no new engine methods, source setup or participant initialization', async () => {
  const source = createSourceProvider({ fields: ['title', 'body'] }), observed = { initialize: 0, prepare: 0 };
  const selected = { ...source, participant: { initialize(configuration) { observed.initialize++; return source.participant.initialize(configuration); }, *prepare(previous, context) { observed.prepare++; return yield* source.participant.prepare(previous, context); } } };
  const owner = engine({ addons: [selected] }), keys = Object.keys(owner), patches = createPatch(owner);
  assert.ok(Object.isFrozen(patches)); assert.deepEqual(Object.keys(patches), ['patch']); assert.deepEqual(Object.keys(owner), keys);
  assert.deepEqual(observed, { initialize: 1, prepare: 0 });
  await owner.add(record()); await patches.patch({ id: 'a', expectedRevision: 1, set: { text: { title: 'green apple' } } });
  assert.deepEqual(observed, { initialize: 1, prepare: 2 });
  assert.equal((await owner.search('green')).total, 1);
  for (const foreign of [{}, { ...owner }, null, 3]) assert.throws(() => createPatch(foreign), { code: 'MISSING_CAPABILITY' });
  await owner.dispose(); await rejected(patches.patch({ id: 'a', expectedRevision: 2, unset: { text: ['title'] } }), 'DISPOSED');
});

test('whole-field set, unset, nullable metadata and complete arrays preserve untouched authoritative values', async () => {
  const owner = engine(), patches = createPatch(owner); await owner.add(record());
  const result = await patches.patch({ id: 'a', expectedRevision: 1, set: { text: { title: ['green pear', 'third'] }, metadata: { tags: ['new', 'new'], count: null } }, unset: { metadata: ['enabled'] } });
  assert.deepEqual(result, { revision: 2, changed: true, added: 0, replaced: 1, removed: 0 });
  assert.deepEqual(current(owner), { revision: 2, text: { title: ['green pear', 'third'], body: ['blue sky', 'second value'] }, metadata: { category: 'Guide', tags: ['new'], count: null } });
  assert.equal((await owner.search('red')).total, 0); assert.equal((await owner.search('second')).total, 1); assert.equal((await owner.search('green')).total, 1);
  await patches.patch({ id: 'a', expectedRevision: 2, unset: { text: ['title'], metadata: ['category', 'tags'] }, set: { text: { body: [] } } });
  assert.deepEqual(current(owner), { revision: 3, text: { body: [] }, metadata: { count: null } });
  await patches.patch({ id: 'a', expectedRevision: 3, set: { text: { title: '', body: [''] } } });
  assert.deepEqual(current(owner).text, { title: [''], body: [''] });
  await owner.dispose();
});

test('declared absent unsets and identical assignments still commit once, while zero-action requests reject', async () => {
  const owner = engine(), patches = createPatch(owner); await owner.add({ id: 'a', text: { title: 'red' } });
  for (const request of [{ id: 'a', expectedRevision: 1 }, { id: 'a', expectedRevision: 1, set: {} }, { id: 'a', expectedRevision: 1, unset: { text: [], metadata: [] } }]) await rejected(patches.patch(request), 'INVALID_RECORD');
  assert.equal(current(owner).revision, 1);
  assert.equal((await patches.patch({ id: 'a', expectedRevision: 1, unset: { text: ['body'] } })).revision, 2);
  assert.equal((await patches.patch({ id: 'a', expectedRevision: 2, set: { text: { title: 'red' } } })).revision, 3);
  await owner.dispose();
});

test('native descriptor capture owns queued patch arrays, metadata, options and IDs before caller mutation', async () => {
  const owner = engine({ limits: { checkpointWorkUnits: 1 } }), patches = createPatch(owner);
  const preceding = owner.add(record()), values = ['green'], tags = ['saved'], unset = ['category'], options = { deadlineMs: 30000 };
  const request = { id: 'a', expectedRevision: 1, set: { text: { title: values }, metadata: { tags } }, unset: { metadata: unset } };
  const pending = patches.patch(request, options);
  request.id = 'missing'; request.expectedRevision = 999; values[0] = 'mutated'; values.push('later'); tags[0] = 'changed'; unset[0] = 'enabled'; options.deadlineMs = 1;
  await preceding; assert.equal((await pending).revision, 2);
  assert.deepEqual(current(owner).text.title, ['green']); assert.deepEqual(current(owner).metadata.tags, ['saved']); assert.equal(Object.hasOwn(current(owner).metadata, 'category'), false); assert.equal(current(owner).metadata.enabled, true);
  await owner.dispose();
});

test('malformed field actions, undefined values, nested paths, duplicate names and set/unset overlaps reject without changes', async () => {
  const owner = engine(), patches = createPatch(owner); await owner.add(record()); const root = getExecutionOwner(owner).root;
  const base = { id: 'a', expectedRevision: 1 }, malformed = [
    null, [], { ...base, extra: true }, { ...base, expectedRevision: undefined }, { ...base, expectedRevision: -1 }, { ...base, expectedRevision: 1.5 }, { ...base, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
    { ...base, set: undefined }, { ...base, set: null }, { ...base, set: { extra: true } }, { ...base, set: { text: undefined } }, { ...base, set: { metadata: undefined } },
    { ...base, set: { text: { 'body.0': 'bad' } } }, { ...base, set: { text: { title: null } } }, { ...base, set: { metadata: { category: null } } }, { ...base, set: { metadata: { enabled: 'true' } } }, { ...base, set: { metadata: { tags: 'one' } } }, { ...base, set: { metadata: { count: Infinity } } },
    { ...base, unset: undefined }, { ...base, unset: { extra: [] } }, { ...base, unset: { text: undefined } }, { ...base, unset: { text: ['unknown'] } }, { ...base, unset: { metadata: ['title'] } }, { ...base, unset: { text: ['body', 'body'] } },
    { ...base, set: { text: { title: 'new' } }, unset: { text: ['title'] } }, { ...base, set: { metadata: { count: null } }, unset: { metadata: ['count'] } },
  ];
  for (const input of malformed) { await rejected(patches.patch(input), 'INVALID_RECORD'); assert.equal(getExecutionOwner(owner).root, root); }
  let reads = 0; const accessor = { ...base }; Object.defineProperty(accessor, 'set', { enumerable: true, get() { reads++; return { text: { title: 'bad' } }; } });
  await rejected(patches.patch(accessor), 'INVALID_RECORD');
  const nested = { ...base, set: { text: {} } }; Object.defineProperty(nested.set.text, 'title', { enumerable: true, get() { reads++; return 'bad'; } });
  await rejected(patches.patch(nested), 'INVALID_RECORD'); assert.equal(reads, 0); assert.equal(getExecutionOwner(owner).root, root);
  await owner.dispose();
});

test('assigned-value limits, final assembled-record limits and scheduled Unicode checks all preserve previous roots', async () => {
  const owner = engine({ limits: { maxTextCodeUnitsPerRecord: 10, maxTextCodeUnitsPerValue: 8, maxTextValuesPerField: 2 } }), patches = createPatch(owner);
  await owner.add({ id: 'a', text: { title: '12345', body: 'abc' } }); const root = getExecutionOwner(owner).root;
  for (const [set, code] of [
    [{ text: { title: '123456789' } }, 'LIMIT_EXCEEDED'],
    [{ text: { title: ['a', 'b', 'c'] } }, 'LIMIT_EXCEEDED'],
    [{ text: { title: '12345678' } }, 'LIMIT_EXCEEDED'],
    [{ text: { title: '\ud800' } }, 'INVALID_RECORD'],
    [{ metadata: { category: '\udc00' } }, 'INVALID_RECORD'],
  ]) { await rejected(patches.patch({ id: 'a', expectedRevision: 1, set }), code); assert.equal(getExecutionOwner(owner).root, root); }
  assert.equal((await patches.patch({ id: 'a', expectedRevision: 1, set: { text: { title: '😀' } } })).revision, 2);
  assert.deepEqual(current(owner).text, { title: ['😀'], body: ['abc'] }); await owner.dispose();
});

test('revision conflicts precede complete source coverage, which precedes record lookup', async () => {
  const missing = createRaveldex({ schema }), patches = createPatch(missing);
  await rejected(patches.patch({ id: 'absent', expectedRevision: 1, unset: { text: ['title'] } }), 'REVISION_MISMATCH');
  await rejected(patches.patch({ id: 'absent', expectedRevision: 0, unset: { text: ['title'] } }), 'MISSING_CAPABILITY');
  await missing.add(record()); await rejected(patches.patch({ id: 'a', expectedRevision: 1, set: { text: { title: 'all replaced', body: 'still refused' } } }), 'MISSING_CAPABILITY');
  const partial = engine({ addons: [createSourceProvider({ fields: ['title'] })] }); await partial.add(record());
  await rejected(createPatch(partial).patch({ id: 'a', expectedRevision: 1, set: { metadata: { count: 4 } } }), 'MISSING_CAPABILITY');
  const complete = engine(); await complete.add(record()); await rejected(createPatch(complete).patch({ id: 'absent', expectedRevision: 1, unset: { text: ['title'] } }), 'ID_NOT_FOUND');
  await Promise.all([missing.dispose(), partial.dispose(), complete.dispose()]);
});

test('separately selected providers compose all original fields at one actual revision', async () => {
  const owner = engine({ addons: [createSourceProvider({ id: 'titles', fields: ['title'] }), createSourceProvider({ id: 'bodies', fields: ['body'] })] });
  await owner.add(record()); const result = await createPatch(owner).patch({ id: 'a', expectedRevision: 1, set: { metadata: { count: null } } });
  assert.equal(result.revision, 2); assert.equal((await owner.search('red blue')).total, 1);
  const root = getExecutionOwner(owner).root; assert.equal(root.participants.titles.revision, 2); assert.equal(root.participants.bodies.revision, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(directoryGet(root.participants.titles.records, 'a').text)), { title: ['red apple'] }); assert.deepEqual(JSON.parse(JSON.stringify(directoryGet(root.participants.bodies.records, 'a').text)), { body: ['blue sky', 'second value'] });
  await owner.dispose();
});
