import test from 'node:test';
import assert from 'node:assert/strict';
import { createBulkVerifier } from '../../bench/n9/bulk-verify.mjs';

const verifier = createBulkVerifier();
const clone = value => structuredClone(value);
const hash = text => {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return (value >>> 0).toString(16).padStart(8, '0');
};
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
function snapshot(revision = 1, records = [{ id: 'a', text: { body: ['red blue', ''] }, metadata: { revision: 3, group: ['x', 'y'] } }]) {
  const body = sorted({ header: { schemaVersion: 1, schema: { text: { body: { boost: 1 } }, metadata: {} }, analyzer: { id: 'basic-v1', environmentProfile: 'unqualified' },
    capabilities: [], ranking: { model: 'raveldex-bm25-v1' }, indexDetail: {}, limits: {}, originRevision: revision, nativeQualification: null }, payload: { records } });
  return JSON.stringify({ format: 'raveldex-source', formatVersion: 1, codec: { id: 'raveldex-json-v1', version: 1 }, body,
    integrity: { algorithm: 'fnv1a32-utf16', value: hash(JSON.stringify(body)) } });
}
function directory(values) {
  const buckets = Object.create(null);
  for (const [key, value] of Object.entries(values)) {
    let slot = 2166136261;
    for (let index = 0; index < key.length; index++) slot = Math.imul(slot ^ key.charCodeAt(index), 16777619);
    (buckets[String((slot >>> 0) % 256)] ??= Object.create(null))[key] = value;
  }
  return { size: Object.keys(values).length, buckets };
}
const node = (key, left = null, right = null) => ({ key, height: 1 + Math.max(left?.height ?? 0, right?.height ?? 0), left, right });
function root(revision = 1) {
  const analyzer = { id: 'basic-v1', environmentProfile: 'unqualified' };
  const terms = { a: 1, b: 1, c: 1, d: 1 };
  const positions = Object.fromEntries(Object.keys(terms).map((term, index) => [term, [{ position: index, positionLength: 1, start: index * 2, end: index * 2 + 1 }]]));
  return { revision, configuration: { schema: { text: { body: { boost: 1 } }, metadata: {} }, analyzer, limits: {} },
    documents: directory({ document: { id: 'document', textCodeUnits: 7, metadata: { revision: 8 }, fields: { body: { length: 4, terms } } } }),
    fields: { body: { documents: 1, length: 4, terms: directory(Object.fromEntries(Object.keys(terms).map(term => [term, { df: 1, frequency: 1, postings: directory({ document: 1 }) }]))),
      order: node('b', node('a'), node('c', null, node('d'))) } },
    counts: { documents: 1, textCodeUnits: 7, tokens: 4, dictionaryEntries: 4, postingEntries: 4 },
    participants: {
      source: { kind: 'raveldex-source-v1', revision, analyzer, fields: ['body'], records: directory({ document: { text: { body: ['a b c d'] }, retainedEntries: 3, textCodeUnits: 7 } }),
        retainedEntries: 3, textCodeUnits: 7, maxRetainedEntries: 999, maxTextCodeUnits: 999 },
      positions: { kind: 'raveldex-positions-v1', revision, analyzer, fields: ['body'], offsetFields: ['body'], records: directory({ document: {
        positions: { body: [{ tokenCount: 4, terms: positions }] }, retainedEntries: 19, occurrenceCount: 4, offsetCount: 4, termEntries: 4, termCodeUnits: 4 } }),
        retainedEntries: 19, occurrenceCount: 4, offsetCount: 4, termEntries: 4, termCodeUnits: 4, limits: {}, maxRetainedEntries: 999, maxOccurrences: 999, maxTermCodeUnits: 999 },
    } };
}
const first = directory => Object.values(directory.buckets).flatMap(bucket => Object.values(bucket))[0];

test('bulk source comparison covers every record/metadata/array and normalizes only protocol origin revision', () => {
  assert.equal(hash('hello'), '4f9f2cab');
  assert.equal(verifier.compareSourceSnapshots(snapshot(1), snapshot(87)).outcome, 'Pass');
  const records = Array.from({ length: 1000 }, (_, index) => ({ id: String(index).padStart(4, '0'), text: { body: ['body', ''] }, metadata: { revision: index } }));
  const expected = snapshot(1, records);
  for (const change of [item => item.text.body.reverse(), item => item.metadata.revision++, item => delete item.text.body]) {
    const changed = clone(records); change(changed[999]);
    assert.throws(() => verifier.compareSourceSnapshots(expected, snapshot(2, changed)), /complete source/);
  }
  const changedHeader = JSON.parse(snapshot()); changedHeader.body.header.nativeQualification = { profileId: 'invented' };
  changedHeader.integrity.value = hash(JSON.stringify(sorted(changedHeader.body)));
  assert.throws(() => verifier.compareSourceSnapshots(snapshot(), JSON.stringify(changedHeader)), /complete source/);
  const damaged = JSON.parse(snapshot()); damaged.integrity.value = '00000000';
  assert.throws(() => verifier.sourceSnapshot(JSON.stringify(damaged)), /integrity/);
});

test('bulk private comparator checks full reverse/posting/stats/source/position state and rebased sidecar revisions', () => {
  assert.equal(verifier.compareRootStates(root(1), root(50)).outcome, 'Pass');
  const mutations = [
    value => first(value.documents).metadata.revision++,
    value => first(value.documents).fields.body.length++,
    value => first(value.documents).fields.body.terms.a++,
    value => first(value.fields.body.terms).frequency++,
    value => first(value.fields.body.terms).df++,
    value => { const posting = first(value.fields.body.terms).postings; Object.values(posting.buckets)[0].document++; },
    value => value.counts.tokens++,
    value => first(value.participants.source.records).text.body.push(''),
    value => value.participants.positions.occurrenceCount++,
    value => first(value.participants.positions.records).positions.body[0].terms.a[0].end++,
    value => first(value.participants.positions.records).positions.body[0].terms.a[0].positionLength++,
    value => { value.participants.positions.kind = 'raveldex-positions-v2'; first(value.participants.positions.records).positions.body[0].terms.a[0].kind = 'component'; },
  ];
  for (const mutate of mutations) { const actual = root(2); mutate(actual); assert.throws(() => verifier.compareRootStates(root(), actual), /complete private/); }
  const stale = root(2); stale.participants.positions.revision = 1;
  assert.throws(() => verifier.rootState(stale), /participant revision/);
  const unsupported = root(); unsupported.participants.thirdParty = { kind: 'opaque-root', revision: 1 };
  assert.throws(() => verifier.rootState(unsupported), /unsupported participant/);
});

test('bulk private comparator validates every directory and tree while allowing equivalent balanced tree shapes', () => {
  const alternative = root(2); alternative.fields.body.order = node('c', node('b', node('a')), node('d'));
  assert.equal(verifier.compareRootStates(root(), alternative).outcome, 'Pass');
  const mutations = [
    value => value.documents.size++,
    value => { const [key] = Object.keys(value.documents.buckets); value.documents.buckets[String((Number(key) + 1) % 256)] = value.documents.buckets[key]; delete value.documents.buckets[key]; },
    value => value.fields.body.order.height++,
    value => { value.fields.body.order.left.key = 'z'; },
    value => { value.fields.body.order.left = value.fields.body.order; },
    value => { value.fields.body.order.right = null; },
    value => { value.fields.body.order = node('a', null, node('b', null, node('c', null, node('d')))); },
  ];
  for (const mutate of mutations) { const actual = root(); mutate(actual); assert.throws(() => verifier.rootState(actual), /Bulk verification/); }
});

test('bulk method factory serializes across realms and rejects callback/cyclic data without reading accessors', () => {
  const remote = (0, eval)('(' + createBulkVerifier.toString() + ')')();
  assert.deepEqual(remote.rootState(root()), verifier.rootState(root()));
  let calls = 0; const data = {};
  Object.defineProperty(data, 'getter', { enumerable: true, get() { calls++; return 1; } });
  assert.throws(() => remote.canonical(data), /accessor/); assert.equal(calls, 0);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => remote.canonical(cyclic), /cyclic/);
  assert.notEqual(remote.canonical({ value: -0 }), remote.canonical({ value: 0 }));
});

test('complete public enumeration proves all 10000 ids across pages and catches errors beyond top20', async () => {
  const ids = Array.from({ length: 10000 }, (_, index) => 'id-' + String(index).padStart(5, '0'));
  const calls = [];
  const owner = { async search(query, options) {
    calls.push({ query, options });
    return { revision: 9, model: 'raveldex-bm25-v1', completeness: 'complete', total: ids.length,
      hits: ids.slice(options.offset, options.offset + options.limit).map(id => ({ id, score: 0 })) };
  } };
  const result = await verifier.enumerateMembership(owner, ids, 9);
  assert.equal(result.pages, 100); assert.equal(result.records, 10000); assert.deepEqual(result.ids, ids);
  assert.equal(calls.at(-1).options.offset, 9900); assert.equal(calls.at(-1).options.limit, 100);
  for (const mutate of [row => { row.hits[0].id = 'wrong'; }, row => { row.hits[0].id = ids[0]; }, row => { row.total--; }, row => { row.revision++; }, row => { row.hits.pop(); }, row => { row.hits.reverse(); }, row => { row.hits[0].score = 1; }]) {
    const broken = { async search(query, options) { const row = await owner.search(query, options); if (options.offset === 9900) mutate(row); return row; } };
    await assert.rejects(verifier.enumerateMembership(broken, ids, 9), /Bulk verification/);
  }
});

test('membership failures are propagated instead of labelled restored capacity and empty state is queried', async () => {
  const refused = Object.assign(Error('bounded refusal'), { code: 'WORK_LIMIT_EXCEEDED' });
  await assert.rejects(verifier.enumerateMembership({ async search() { throw refused; } }, ['a'], 1), error => error === refused);
  let calls = 0;
  const empty = await verifier.enumerateMembership({ async search() { calls++; return { revision: 1, model: 'raveldex-bm25-v1', completeness: 'complete', total: 0, hits: [] }; } }, [], 1);
  assert.equal(calls, 1); assert.equal(empty.records, 0);
});
