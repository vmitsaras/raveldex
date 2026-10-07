import test from 'node:test';
import assert from 'node:assert/strict';
import { captureSchema, captureConfiguration } from '../../dist/core/contracts/schema.js';
import { captureRecord, captureBatch, captureRemoveIds, analyzeRecord, canonicalMetadata } from '../../dist/core/contracts/record.js';
import { captureQuery, analyzeQuery } from '../../dist/core/contracts/query.js';
import { captureOptions } from '../../dist/core/contracts/options.js';
import { Admission } from '../../dist/core/contracts/data.js';
import { DEFAULT_LIMITS as L, resolveLimits, validateStateCounts } from '../../dist/core/limits/limits.js';
import { WorkBudget, validateExpansionCounts } from '../../dist/core/limits/work.js';
import { ERROR_CODES, RaveldexError } from '../../dist/core/errors/error.js';

const schemaInput = { text: { title: { boost: 2 }, body: {} }, metadata: { kind: { type: 'string' }, tags: { type: 'string', multi: true, nullable: true }, year: { type: 'number', nullable: true }, flag: { type: 'boolean' } } };
const S = captureSchema(schemaInput, L);
const record = (text = 'Hello') => ({ id: '__proto__', text: { title: text }, metadata: { tags: ['A', 'A', null], year: -0 } });
const fail = (fn, code, path) => assert.throws(fn, (error) => {
  assert.ok(error instanceof RaveldexError);
  assert.equal(error.code, code);
  if (path) assert.equal(error.details.path, path);
  return true;
});
const query = (input, limits = L) => captureQuery(input, S, limits);
const queryTokens = (input, limits = L) => [...analyzeQuery(query(input, limits), S, limits)].filter((step) => step.token).map((step) => step.token.term);

test('schema defaults, null-prototype dictionaries, owned configuration and optional capabilities', () => {
  const input = structuredClone(schemaInput);
  const c = captureConfiguration({ schema: input, analyzer: { id: 'basic-v1', environmentProfile: 'unqualified' }, addons: [], limits: { maxDocuments: 3 } });
  input.text.title.boost = 10;
  delete input.metadata.tags;
  assert.equal(c.schema.text.title.boost, 2);
  assert.equal(c.schema.text.body.boost, 1);
  assert.equal(c.schema.metadata.kind.multi, false);
  assert.equal(c.limits.maxDocuments, 3);
  assert.equal(Object.getPrototypeOf(c.schema.text), null);
  assert.ok(Object.isFrozen(c.schema.metadata.tags));
  assert.throws(() => { c.limits.maxDocuments = 100; }, TypeError);
  const nullSchema = Object.assign(Object.create(null), { text: Object.assign(Object.create(null), { title: Object.create(null) }) });
  assert.equal(captureSchema(nullSchema, L).text.title.boost, 1);
  fail(() => captureConfiguration({ schema: S, analyzer: { id: 'other', environmentProfile: 'unqualified' } }), 'MISSING_CAPABILITY');
  fail(() => captureConfiguration({ schema: S, analyzer: { id: 'basic-v1', environmentProfile: 'claimed-qualified' } }), 'INCOMPATIBLE_CAPABILITY');
  fail(() => captureConfiguration({ schema: S, addons: [{}] }), 'INCOMPATIBLE_CAPABILITY');
  fail(() => captureConfiguration({ schema: S, limits: undefined }), 'INVALID_OPTIONS');
});

test('invalid schema data is rejected without calling getters or toJSON', () => {
  const cases = [null, [], new Date(), { text: {} }, { text: { title: {} }, extra: true }, { text: { title: { boost: undefined } } }, { text: { title: { boost: 0 } } }, { text: { title: { boost: Infinity } } }, { text: { title: { boost: 17 } } }, { text: { title: { other: 1 } } }, { text: { constructor: {} } }, { text: { prototype: {} } }, { text: { 'x-y': {} } }, { text: { ['a'.repeat(65)]: {} } }, { text: { title: {} }, metadata: { title: { type: 'string' } } }, { text: { title: {} }, metadata: { kind: { type: 'date' } } }, { text: { title: {} }, metadata: { kind: { type: 'string', multi: undefined } } }, { text: { title: {} }, metadata: undefined }];
  for (const value of cases) fail(() => captureSchema(value, L), 'INVALID_SCHEMA');
  const getter = { get text() { throw new Error('getter executed'); } };
  fail(() => captureSchema(getter, L), 'INVALID_SCHEMA');
  fail(() => captureSchema({ text: { title: {} }, toJSON() { throw new Error('toJSON executed'); } }, L), 'INVALID_SCHEMA');
  fail(() => captureSchema({ text: { title: {} }, [Symbol('secret')]: 1 }, L), 'INVALID_SCHEMA');
});

test('opaque IDs, missing values, canonical equality metadata, and input/result ownership', () => {
  for (const id of ['__proto__', 'constructor', ' A ', 'a', 'A', '😀']) {
    const input = record(['one', '', 'two']);
    input.id = id;
    const owned = captureRecord(input, S, L);
    input.id = 'changed'; input.text.title[0] = 'changed'; input.metadata.tags.push('later'); input.metadata.year = 3;
    assert.equal(owned.id, id);
    assert.deepEqual(owned.text.title, ['one', '', 'two']);
    assert.deepEqual(owned.metadata.tags, ['A', 'A', null]);
    assert.equal(Object.is(owned.metadata.year, -0), false);
    const tokens = [...analyzeRecord(owned, L)].filter((step) => step.token);
    assert.deepEqual(tokens.map(({ field, token }) => [field, token.term, token.valueIndex, token.position, token.start, token.end]), [['title', 'one', 0, 0, 0, 3], ['title', 'two', 2, 0, 0, 3]]);
    assert.deepEqual(canonicalMetadata(owned).tags, ['A', null]);
    assert.ok(Object.isFrozen(owned.text.title));
  }
  const empty = captureRecord({ id: 'none', text: {} }, S, L);
  assert.deepEqual([...analyzeRecord(empty, L)].filter((s) => s.token), []);
  assert.equal(Object.hasOwn(empty.metadata, 'year'), false);
  assert.equal(captureRecord({ id: 'null', text: {}, metadata: { year: null } }, S, L).metadata.year, null);
});

test('malformed records, arrays, metadata, and IDs have exact typed failures', () => {
  const cases = [null, [], new Date(), { id: 1, text: {} }, { id: '', text: {} }, { id: 'a' }, { id: 'a', text: {}, other: 1 }, { id: 'a', text: { undeclared: 'x' } }, { id: 'a', text: { title: null } }, { id: 'a', text: { title: undefined } }, { id: 'a', text: { title: ['x', 2] } }, { id: 'a', text: { title: [['x']] } }, { id: 'a', text: { title: Array(1) } }, { id: 'a', text: {}, metadata: { tags: 'x' } }, { id: 'a', text: {}, metadata: { kind: ['x'] } }, { id: 'a', text: {}, metadata: { kind: null } }, { id: 'a', text: {}, metadata: { year: NaN } }, { id: 'a', text: {}, metadata: { year: Infinity } }, { id: 'a', text: {}, metadata: { year: 1n } }, { id: 'a', text: {}, metadata: { flag: 'false' } }, { id: 'a', text: {}, metadata: { kind: undefined } }, { id: 'a', text: {}, metadata: { tags: [new Date()] } }, { id: 'a', text: {}, metadata: undefined }];
  for (const value of cases) fail(() => captureRecord(value, S, L), 'INVALID_RECORD');
  const a = []; Object.defineProperty(a, '0', { get() { throw new Error('getter executed'); }, enumerable: true });
  fail(() => captureRecord(record(a), S, L), 'INVALID_RECORD');
  const extra = ['a']; extra.secret = 'value';
  fail(() => captureRecord(record(extra), S, L), 'INVALID_RECORD');
  fail(() => captureRecord({ get id() { throw new Error('getter executed'); }, text: {} }, S, L), 'INVALID_RECORD');
});

test('UTF-16 scans happen after capture and rejected content has no completed analysis', () => {
  for (const input of [{ id: '\ud800', text: {} }, { id: 'x', text: { title: 'a\udc00' } }, { id: 'x', text: {}, metadata: { kind: '\ud800' } }, { id: 'x', text: {}, metadata: { tags: ['a', '\udc00'] } }]) {
    const owned = captureRecord(input, S, L);
    fail(() => [...analyzeRecord(owned, L)], 'INVALID_RECORD');
  }
});

test('batch/remove capture shares admission budgets and detects duplicate IDs', () => {
  const a = record(), b = { id: 'b', text: {} };
  const owned = captureBatch([a, b], S, L); a.text.title = 'later';
  assert.equal(owned[0].text.title[0], 'Hello');
  fail(() => captureBatch([record(), record()], S, L), 'INVALID_RECORD', 'records[1].id');
  fail(() => captureBatch([b, b], S, resolveLimits({ maxMutationBatch: 1 })), 'LIMIT_EXCEEDED');
  assert.deepEqual(captureBatch([], S, L), []);
  assert.deepEqual(captureRemoveIds(['__proto__', ' A '], L), ['__proto__', ' A ']);
  fail(() => captureRemoveIds(['x', 'x'], L), 'INVALID_OPTIONS');
  fail(() => captureRemoveIds([1], L), 'INVALID_OPTIONS');
  fail(() => captureBatch([a, b], S, resolveLimits({ maxAdmissionEntries: 5 })), 'LIMIT_EXCEEDED');
});

test('every limit key accepts its minimum/rejects invalid and raised ceilings', () => {
  for (const [name, cap] of Object.entries(L)) {
    const minimum = ['maxMetadataFields', 'maxQueuedOperations'].includes(name) ? 0 : name === 'minPrefixCodePoints' ? 2 : 1;
    const dependencies = ['maxSearchWorkUnits', 'maxMutationWorkUnits'].includes(name) ? { checkpointWorkUnits: 1 } : {};
    assert.equal(resolveLimits({ ...dependencies, [name]: minimum })[name], minimum);
    for (const value of [minimum - 1, 1.5, NaN, Infinity, '1', undefined]) fail(() => resolveLimits({ [name]: value }), 'INVALID_OPTIONS');
    if (name !== 'minPrefixCodePoints') fail(() => resolveLimits({ [name]: cap + 1 }), 'LIMIT_EXCEEDED');
  }
  assert.equal(resolveLimits({ minPrefixCodePoints: 3 }).minPrefixCodePoints, 3);
  fail(() => resolveLimits({ unknown: 1 }), 'INVALID_OPTIONS');
  fail(() => resolveLimits({ maxSearchWorkUnits: 1 }), 'INVALID_OPTIONS', 'limits.checkpointWorkUnits');
  const override = { maxDocuments: 2 }; const owned = resolveLimits(override); override.maxDocuments = 3; assert.equal(owned.maxDocuments, 2);
});

test('schema/record/content bounds enforce exact inclusive edges and aggregate pre-dedup limits', () => {
  const tests = [
    [{ maxIdCodeUnits: 2 }, { id: 'ab', text: {} }, { id: 'abc', text: {} }],
    [{ maxTextValuesPerField: 2 }, record(['', '']), record(['', '', ''])],
    [{ maxTextCodeUnitsPerValue: 2 }, record('ab'), record('abc')],
    [{ maxTextCodeUnitsPerRecord: 4 }, record(['ab', 'cd']), record(['ab', 'cde'])],
    [{ maxMetadataValuesPerField: 2 }, { id: 'x', text: {}, metadata: { tags: ['a', 'a'] } }, { id: 'x', text: {}, metadata: { tags: ['a', 'a', 'a'] } }],
    [{ maxMetadataStringCodeUnits: 2 }, { id: 'x', text: {}, metadata: { kind: 'ab' } }, { id: 'x', text: {}, metadata: { kind: 'abc' } }],
    [{ maxMetadataCodeUnitsPerRecord: 4 }, { id: 'x', text: {}, metadata: { tags: ['ab', 'ab'] } }, { id: 'x', text: {}, metadata: { tags: ['ab', 'ab', 'ab'] } }],
  ];
  for (const [overrides, accepted, rejected] of tests) {
    const limits = resolveLimits(overrides);
    captureRecord(accepted, S, limits);
    fail(() => captureRecord(rejected, S, limits), 'LIMIT_EXCEEDED');
  }
  const one = resolveLimits({ maxTextFields: 1 }); captureSchema({ text: { a: {} } }, one); fail(() => captureSchema({ text: { a: {}, b: {} } }, one), 'LIMIT_EXCEEDED');
  const noMeta = resolveLimits({ maxMetadataFields: 0 }); captureSchema({ text: { a: {} } }, noMeta); fail(() => captureSchema({ text: { a: {} }, metadata: { b: { type: 'string' } } }, noMeta), 'LIMIT_EXCEEDED');
  const name = resolveLimits({ maxFieldNameCodeUnits: 1 }); captureSchema({ text: { a: {} } }, name); fail(() => captureSchema({ text: { ab: {} } }, name), 'LIMIT_EXCEEDED');
  const tokenLimit = resolveLimits({ maxTokensPerRecord: 2 });
  [...analyzeRecord(captureRecord(record('a b'), S, tokenLimit), tokenLimit)];
  fail(() => [...analyzeRecord(captureRecord(record('a b a'), S, tokenLimit), tokenLimit)], 'LIMIT_EXCEEDED');
});

test('typed query ownership, defaults, missing/null equality and shared analysis', () => {
  const input = { kind: 'and', children: [{ kind: 'text', text: 'ﬁle ½', fields: ['title'] }, { kind: 'eq', field: 'year', value: -0 }] };
  const owned = query(input); input.children[0].text = 'changed'; input.children[0].fields.push('body'); input.children.pop();
  assert.equal(owned.children.length, 2);
  assert.deepEqual([...analyzeQuery(owned, S, L)].filter((s) => s.token).map((s) => s.token.term), ['file', '1⁄2']);
  assert.equal(Object.is(owned.children[1].value, -0), false);
  assert.ok(Object.isFrozen(owned.children[0].fields));
  assert.deepEqual(queryTokens('a a'), ['a', 'a']);
  assert.deepEqual(queryTokens('😀 '), []);
  assert.deepEqual(queryTokens({ kind: 'not', child: { kind: 'all' } }), []);
  assert.equal(query({ kind: 'eq', field: 'year', value: null }).value, null);
  assert.equal(query({ kind: 'text', text: 'a' }).operator, 'and');
});

test('invalid query shapes, accessors, cycles and unsupported capabilities', () => {
  const cycle = { kind: 'not' }; cycle.child = cycle;
  const cases = [null, 4, [], { kind: 'unknown' }, { kind: 'all', extra: 1 }, { kind: 'and', children: [] }, { kind: 'not' }, cycle, { kind: 'text', text: 'a', operator: undefined }, { kind: 'text', text: 'a', fields: [] }, { kind: 'text', text: 'a', fields: ['title', 'title'] }, { kind: 'text', text: 'a', fields: ['absent'] }, { kind: 'group', variants: [] }, { kind: 'group', variants: [{ text: 'a', match: 'fuzzy' }] }, { kind: 'group', variants: [{ text: 'a', match: 'exact', weight: 2 }] }, { kind: 'eq', field: 'kind', value: null }, { kind: 'eq', field: 'year', value: '2026' }, { kind: 'eq', field: 'tags', value: ['a'] }, { kind: 'eq', field: 'missing', value: 'a' }, { get kind() { throw new Error('getter'); } }];
  for (const input of cases) fail(() => query(input), 'INVALID_QUERY');
  fail(() => query({ kind: 'extension', capability: 'phrases', version: 1, payload: {} }), 'MISSING_CAPABILITY');
  fail(() => queryTokens({ kind: 'group', variants: [{ text: '', match: 'exact' }] }), 'INVALID_QUERY');
  fail(() => queryTokens({ kind: 'group', variants: [{ text: 'a b', match: 'exact' }] }), 'INVALID_QUERY');
  fail(() => queryTokens({ kind: 'group', variants: [{ text: '😀𐐀', match: 'prefix' }] }), 'INVALID_QUERY');
  assert.deepEqual(queryTokens({ kind: 'group', variants: [{ text: '𐐀𐐁', match: 'prefix' }] }), ['𐐨𐐩']);
  fail(() => queryTokens('\ud800'), 'INVALID_QUERY');
  fail(() => queryTokens({ kind: 'eq', field: 'kind', value: '\udc00' }), 'INVALID_QUERY');
});

test('query node/depth/lexical/all-content/token/group/variant caps count before dedup where required', () => {
  fail(() => query({ kind: 'not', child: { kind: 'all' } }, resolveLimits({ maxQueryNodes: 1 })), 'LIMIT_EXCEEDED');
  fail(() => query({ kind: 'not', child: { kind: 'all' } }, resolveLimits({ maxQueryDepth: 1 })), 'LIMIT_EXCEEDED');
  const lexical = resolveLimits({ maxQueryLexicalCodeUnits: 3 }); query('abc', lexical); fail(() => query('abcd', lexical), 'LIMIT_EXCEEDED');
  fail(() => query({ kind: 'and', children: [{ kind: 'text', text: 'ab' }, { kind: 'text', text: 'ab' }] }, lexical), 'LIMIT_EXCEEDED');
  fail(() => query({ kind: 'eq', field: 'kind', value: 'abc' }, resolveLimits({ maxQueryCodeUnits: 8 })), 'LIMIT_EXCEEDED');
  assert.deepEqual(queryTokens('a a', resolveLimits({ maxQueryTokens: 2 })), ['a', 'a']);
  fail(() => queryTokens('a a a', resolveLimits({ maxQueryTokens: 2 })), 'LIMIT_EXCEEDED');
  assert.deepEqual(queryTokens('A a', resolveLimits({ maxQueryGroups: 1 })), ['a', 'a']);
  fail(() => queryTokens('a b', resolveLimits({ maxQueryGroups: 1 })), 'LIMIT_EXCEEDED');
  fail(() => query({ kind: 'group', variants: [{ text: 'a', match: 'exact' }, { text: 'a', match: 'exact' }] }, resolveLimits({ maxVariantsPerGroup: 1 })), 'LIMIT_EXCEEDED');
  // A document's per-value cap does not replace the lexical query cap.
  assert.deepEqual(queryTokens('hello', resolveLimits({ maxTextCodeUnitsPerValue: 1 })), ['hello']);
});

test('options validate pagination/deadlines/live signals without initialization', () => {
  assert.deepEqual(captureOptions({}, L, true), { deadlineMs: 30_000, offset: 0, limit: 20 });
  const limits = resolveLimits({ maxDocuments: 3, maxHits: 2, maxDeadlineMs: 5 });
  assert.deepEqual(captureOptions({ offset: 2 }, limits, true), { deadlineMs: 5, offset: 2, limit: 1 });
  assert.equal(captureOptions({ offset: 3, limit: 0 }, limits, true).limit, 0);
  fail(() => captureOptions({ offset: 2, limit: 2 }, limits, true), 'LIMIT_EXCEEDED');
  for (const options of [{ deadlineMs: 0 }, { deadlineMs: undefined }, { offset: -1 }, { limit: 1.2 }, { signal: undefined }, { unknown: 1 }]) fail(() => captureOptions(options, L, true), 'INVALID_OPTIONS');
  fail(() => captureOptions({ limit: 101 }, L, true), 'LIMIT_EXCEEDED');
  fail(() => captureOptions({ deadlineMs: 60_001 }, L, false), 'LIMIT_EXCEEDED');
  fail(() => captureOptions({ limit: 1 }, L, false), 'INVALID_OPTIONS');
  fail(() => captureOptions({ extensions: { phrases: {} } }, L, true), 'MISSING_CAPABILITY');
  const controller = new AbortController();
  const owned = captureOptions({ signal: controller.signal }, L, false); controller.abort(); assert.equal(owned.signal.aborted, true);
  const a = new Admission(1); captureOptions({ deadlineMs: 1 }, L, false, a); fail(() => captureOptions({ deadlineMs: 1 }, L, false, a), 'LIMIT_EXCEEDED');
});

test('pure proposed-state, expansion and work accounting guards fail before a caller can accept success', () => {
  const counts = { documents: 10_000, textCodeUnits: 67_108_864, tokens: 4_000_000, dictionaryEntries: 250_000, postingEntries: 2_000_000 };
  validateStateCounts(counts, L);
  for (const name of Object.keys(counts)) fail(() => validateStateCounts({ ...counts, [name]: counts[name] + 1 }, L), 'LIMIT_EXCEEDED');
  fail(() => validateStateCounts({ ...counts, documents: -1 }, L), 'INTERNAL_ERROR');
  validateExpansionCounts(256, 1024, L);
  fail(() => validateExpansionCounts(257, 1024, L), 'LIMIT_EXCEEDED');
  fail(() => validateExpansionCounts(256, 1025, L), 'LIMIT_EXCEEDED');
  const budget = new WorkBudget(2); budget.charge(2); assert.equal(budget.consumed, 2); fail(() => budget.charge(1), 'WORK_LIMIT_EXCEEDED');
  fail(() => new WorkBudget(2).charge(-1), 'INTERNAL_ERROR');
});

test('all declared errors expose bounded fixed messages and value-free validator details', () => {
  for (const code of ERROR_CODES) {
    const error = new RaveldexError(code, { path: 'x'.repeat(300), actual: 2, limit: 1 });
    assert.equal(error.message, `Raveldex: ${code}`);
    assert.equal(error.details.path.length, 256);
    assert.ok(Object.isFrozen(error.details));
  }
  const secret = 'caller-private-value';
  try { captureRecord({ id: 'x', text: {}, metadata: { [secret]: secret } }, S, L); assert.fail('must reject'); }
  catch (error) { assert.ok(!JSON.stringify(error).includes(secret)); assert.ok(!error.message.includes(secret)); }
});
