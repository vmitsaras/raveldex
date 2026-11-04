import test from 'node:test';
import assert from 'node:assert/strict';
import { createPairedVerifier } from '../../bench/n9/paired-verify.mjs';
const verifier = createPairedVerifier();
const clone = value => structuredClone(value);
const ids = Array.from({ length: 205 }, (_, i) => 'r' + String(i).padStart(3, '0'));
const resultFor = (all = ids, revision = 7, offset = 0, limit = 100) => ({
  revision, model: 'raveldex-bm25-v1', completeness: 'complete', total: all.length,
  hits: all.slice(offset, offset + limit).map(id => ({ id, score: 0 })),
  extensions: { facets: { revision, fields: [{ field: 'group', buckets: [{ kind: 'value', value: 'g0', count: all.length }], distinctValueTotal: 1, omittedBucketCount: 0 }] },
    'match-evidence': { revision, documents: [{ id: all[0] ?? 'none', ranges: [{ field: 'body', valueIndex: 0, position: 0, start: 3, end: 8, term: 'café' }] }] },
    custom: { revision: 91, nested: ['kept'] } },
});
const owner = (mutate = () => {}) => ({ async search(query, options) { const result = resultFor(ids, 7, options.offset, options.limit); mutate(result, options); return result; } });
const capture = engine => verifier.capturePages(engine, 'query', { expectedIds: ids, revision: 7 });
const typed = code => ({ name: 'RaveldexError', code, reason: null, details: { path: 'work' }, message: 'Raveldex: ' + code });
function inspection() {
  const N = 2, df = 1, tf = 2, length = 2, totalLength = 3, avgLength = totalLength / N;
  const idf = Math.log(1 + (N - df + .5) / (df + .5)), normalizer = 1.2 * (.25 + .75 * length / avgLength), tfPart = tf * 2.2 / (tf + normalizer), base = 2 * idf * tfPart, selected = .5 * base;
  const result = { revision: 7, model: 'raveldex-bm25-v1', completeness: 'complete', total: 1, hits: [{ id: 'a', score: selected }] };
  result.extensions = { inspector: { kind: 'raveldex-inspector-v1', revision: 7, model: result.model,
    trace: { revision: 7, model: result.model, facts: [
      { kind: 'field', id: 'a', group: 'g0', field: 'body', k1: 1.2, b: .75, N, df, tf, length, totalLength, avgLength, idf, normalizer, tfPart, boost: 2, weight: .5, base, selected },
      { kind: 'group', id: 'a', group: 'g0', score: selected }, { kind: 'document', id: 'a', score: selected },
    ] }, result: { total: 1, returned: 1 }, resources: { outcome: 'complete', unit: 'work-v1', searchWorkUnits: 140, maxSearchWorkUnits: 1000, counts: { documents: 2 }, heapBytes: { status: 'unavailable', reason: 'not-measured' } }, documents: [{ id: 'a', source: { values: ['café'] } }] } };
  return result;
}

test('paired factory is self-contained and canonicalizes only object-map key order', () => {
  const portable = (0, eval)('(' + createPairedVerifier.toString() + ')')();
  assert.equal(portable.canonical({ b: 2, a: [1, -0] }), '{"a":[1,-0],"b":2}');
  assert.notEqual(portable.canonical({ revision: 1 }), portable.canonical({ revision: 2 }));
  for (const input of [NaN, Infinity, undefined, new Date(), [, 1], { get a() { throw Error('must not invoke getter'); } }]) assert.throws(() => portable.canonical(input));
  const cycle = {}; cycle.self = cycle; assert.throws(() => portable.canonical(cycle));
});

test('complete capture enumerates every page and validates global membership, scores, order and revision', async () => {
  const calls = [], engine = { async search(query, options) { calls.push(options); return resultFor(ids, 7, options.offset, options.limit); } };
  const actual = await capture(engine);
  assert.equal(actual.outcome, 'Pass'); assert.equal(actual.complete, true); assert.equal(actual.pages.length, 3); assert.deepEqual(actual.hits.map(hit => hit.id), ids);
  assert.deepEqual(calls.map(({ offset, limit }) => [offset, limit]), [[0, 100], [100, 100], [200, 5]]);
  assert.ok(calls.every(options => options.deadlineMs === 60000));
  assert.equal(verifier.compareCaptures(actual, clone(actual)).completeMembershipVerified, true);
  const empty = await verifier.capturePages({ async search(query, options) { return resultFor([], 7, options.offset, options.limit); } }, { kind: 'all' }, { expectedIds: [], revision: 7 });
  assert.equal(empty.pages.length, 1); assert.deepEqual(empty.hits, []);
});

test('complete capture rejects drift in the last page, duplicate hits, later score ties and metadata headers', async () => {
  const mutations = [
    (r, o) => { if (o.offset === 200) r.hits[4].id = 'missing'; },
    (r, o) => { if (o.offset === 200) r.hits[4].id = ids[0]; },
    (r, o) => { if (o.offset === 200) r.hits.reverse(); },
    (r, o) => { if (o.offset === 200) r.hits[0].score = 1; },
    (r, o) => { if (o.offset === 200) r.hits.pop(); },
    (r, o) => { if (o.offset === 200) r.revision++; },
    (r, o) => { if (o.offset === 200) r.total--; },
    r => { r.extensions.facets.revision++; },
  ];
  for (const mutation of mutations) await assert.rejects(capture(owner(mutation)), /Paired verification/);
  await assert.rejects(verifier.capturePages(owner(), 'x', { expectedIds: [...ids, ids[0]], revision: 7 }), /expected IDs/);
});

test('cross-capture comparison protects every returned score, facet, offset and custom data revision', async () => {
  const before = await capture(owner());
  for (const mutation of [
    r => { r.hits.at(-1).score = .01; },
    r => { r.pages.at(-1).hits.at(-1).score = .01; },
    r => { r.pages.at(-1).extensions.facets.fields[0].buckets[0].count--; },
    r => { r.pages.at(-1).extensions['match-evidence'].documents[0].ranges[0].start++; },
    r => { r.pages.at(-1).extensions.custom.revision++; },
    r => { r.pages.pop(); },
  ]) {
    const after = clone(before); mutation(after); assert.throws(() => verifier.compareCaptures(before, after), /Paired verification/);
  }
  const after = clone(before); after.revision++;
  for (const page of after.pages) { page.revision++; page.extensions.facets.revision++; page.extensions['match-evidence'].revision++; }
  assert.throws(() => verifier.compareCaptures(before, after), /revision/);
  assert.equal(verifier.compareCaptures(before, after, { allowRevisionChange: true }).status, 'Pass');
  after.pages[0].extensions.custom.revision++;
  assert.throws(() => verifier.compareCaptures(before, after, { allowRevisionChange: true }), /differs/);
});

test('Inspector formulas are independently replayed and exact selected facts survive explicit work normalization', () => {
  const before = inspection(); assert.ok(verifier.replayInspector(before).arithmeticAssertions >= 10);
  const after = clone(before); after.extensions.inspector.resources.searchWorkUnits = 99;
  assert.throws(() => verifier.compareResults(before, after), /differs/);
  const comparison = verifier.compareResults(before, after, { allowInspectorWorkChange: true });
  assert.equal(comparison.status, 'Pass'); assert.deepEqual(comparison.inspectorWork, { before: 140, after: 99 });
  for (const mutate of [
    r => { r.extensions.inspector.trace.facts[0].idf += .01; },
    r => { r.extensions.inspector.trace.facts[1].score += .01; },
    r => { r.hits[0].score += .01; },
    r => { r.extensions.inspector.resources.searchWorkUnits = 1001; },
    r => { r.extensions.inspector.trace.revision++; },
  ]) { const drift = clone(before); mutate(drift); assert.throws(() => verifier.replayInspector(drift), /Paired verification/); }
  after.extensions.inspector.resources.maxSearchWorkUnits++;
  assert.throws(() => verifier.compareResults(before, after, { allowInspectorWorkChange: true }), /differs/);
});

test('typed refusal is explicit incomplete coverage and capacity transitions cannot masquerade as parity', async () => {
  const error = typed('WORK_LIMIT_EXCEEDED'), engine = { async search() { throw error; } }, before = await capture(engine), after = await capture(owner());
  assert.equal(before.outcome, 'Refused'); assert.equal(before.complete, false); assert.equal(before.failedOffset, 0);
  const matched = verifier.compareCaptures(before, clone(before)); assert.equal(matched.kind, 'equal-error'); assert.equal(matched.completeMembershipVerified, false);
  assert.throws(() => verifier.compareCaptures(before, after), /undeclared outcome/);
  const changed = verifier.compareCaptures(before, after, { allowCapacityTransition: true });
  assert.equal(changed.status, 'Finding'); assert.equal(changed.kind, 'capacity-improvement'); assert.equal(changed.completeMembershipVerified, false);
  assert.equal(verifier.compareCaptures(after, before, { allowCapacityTransition: true }).kind, 'capacity-regression');
  const drift = clone(before); drift.error.details.path = 'different'; assert.throws(() => verifier.compareCaptures(before, drift), /typed error/);
  await assert.rejects(verifier.capturePages(engine, 'x', { expectedIds: ids, revision: 7, expectedError: { code: 'LIMIT_EXCEEDED', path: 'expansions.group' } }), /expected typed refusal/);
  await assert.rejects(verifier.capturePages(owner(), 'x', { expectedIds: ids, revision: 7, expectedError: { code: 'LIMIT_EXCEEDED' } }), /unexpectedly succeeded/);
});

test('late refusal preserves completed pages without claiming full membership or a successful duration', async () => {
  const engine = { async search(query, options) { if (options.offset === 200) throw typed('DEADLINE_EXCEEDED'); return resultFor(ids, 7, options.offset, options.limit); } };
  const capture = await verifier.capturePages(engine, 'q', { expectedIds: ids, revision: 7 });
  assert.equal(capture.outcome, 'Refused'); assert.equal(capture.complete, false); assert.equal(capture.pages.length, 2); assert.equal(capture.hits.length, 200); assert.equal(capture.failedOffset, 200);
  assert.equal(capture.wallMs, undefined); assert.equal(verifier.compareCaptures(capture, clone(capture)).completeMembershipVerified, false);
});

test('Unknown, Not-run and malformed success rows remain findings or fail closed', () => {
  const unknown = { outcome: 'Unknown', error: { ...typed('OUTCOME_UNKNOWN'), name: 'WorkerAdapterError' } };
  assert.equal(verifier.compareOutcomes(unknown, clone(unknown)).status, 'Finding');
  const notRun = { outcome: 'Not run', reason: 'Source export refused' };
  assert.equal(verifier.compareOutcomes(notRun, clone(notRun)).stateParityVerified, false);
  for (const row of [{ outcome: 'Pass' }, { outcome: 'Pass', result: resultFor(), error: typed('WORK_LIMIT_EXCEEDED') }, { outcome: 'Pass', error: typed('WORK_LIMIT_EXCEEDED') }, { outcome: 'Refused', error: typed('INVALID_QUERY') }]) assert.throws(() => verifier.compareOutcomes(row, row));
  const before = { outcome: 'Refused', error: typed('WORK_LIMIT_EXCEEDED') }, after = { outcome: 'Refused', error: typed('DEADLINE_EXCEEDED') };
  assert.throws(() => verifier.compareOutcomes(before, after), /typed error/);
});

function directory(entries) {
  const buckets = Object.create(null);
  for (const [key, value] of entries) {
    let hash = 2166136261; for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
    (buckets[String((hash >>> 0) & 255)] ??= Object.create(null))[key] = value;
  }
  return { size: entries.length, buckets };
}
function rootFixture(ordered) {
  const fields = { body: { documents: 1, length: 2, terms: directory([['red', { df: 1, frequency: 2, postings: directory([['a', 2]]) }]]) } };
  if (ordered) fields.body.order = { key: 'red', height: 1, left: null, right: null };
  return { revision: 7, configuration: { schema: { text: { body: {} } }, analyzer: { id: 'basic-v1', environmentProfile: 'unqualified' }, limits: { maxDocuments: 10000 }, capabilities: { ordered: [{ manifest: { id: 'source' }, participant: { prepare() {} } }] } },
    documents: directory([['a', { id: 'a', textCodeUnits: 7, metadata: { revision: 21 }, fields: { body: { length: 2, terms: { red: 2 } } } }]]), fields,
    counts: { documents: 1, textCodeUnits: 7, tokens: 2, dictionaryEntries: 1, postingEntries: 1 },
    participants: { source: { kind: 'raveldex-source-v1', revision: 7, records: directory([['a', { text: { body: ['red red'] }, retainedEntries: 3, textCodeUnits: 7 }]]), retainedEntries: 3, textCodeUnits: 7 } } };
}
test('complete core comparison supports a genuine legacy order absence without fabricating a tree', () => {
  const legacy = verifier.canonicalCore(rootFixture(false)), current = verifier.canonicalCore(rootFixture(true));
  assert.equal(legacy.canonical, current.canonical); assert.equal(legacy.encounterCanonical, current.encounterCanonical);
  assert.deepEqual(legacy.derivedOrder.body, { status: 'not-present-in-baseline', keys: null });
  assert.deepEqual(current.derivedOrder.body, { status: 'validated', keys: 1 });
  for (const mutate of [
    root => { root.fields.body.order.height = 2; }, root => { root.fields.body.order.key = 'blue'; },
    root => { root.documents.size = 2; }, root => { root.counts.tokens = 3; },
    root => { Object.values(root.fields.body.terms.buckets)[0].red.frequency = 3; },
    root => { Object.values(root.documents.buckets)[0].a.fields.body.terms.red = 1; },
    root => { root.participants.source.revision++; },
  ]) { const root = rootFixture(true); mutate(root); assert.throws(() => verifier.canonicalCore(root), /Paired verification/); }
});
test('core revision normalization affects only known root and selected sidecar headers', () => {
  const before = rootFixture(false), after = rootFixture(true); after.revision = 8; after.participants.source.revision = 8;
  assert.notEqual(verifier.canonicalCore(before).canonical, verifier.canonicalCore(after).canonical);
  assert.equal(verifier.canonicalCore(before, { normalizeRevision: true }).canonical, verifier.canonicalCore(after, { normalizeRevision: true }).canonical);
  Object.values(after.documents.buckets)[0].a.metadata.revision++;
  assert.notEqual(verifier.canonicalCore(before, { normalizeRevision: true }).canonical, verifier.canonicalCore(after, { normalizeRevision: true }).canonical);
  Object.values(after.participants.source.records.buckets)[0].a.text.body[0] = 'changed';
  assert.notEqual(verifier.canonicalCore(before).canonical, verifier.canonicalCore(after).canonical);
});

test('incomplete captures still compare every observed page and expose progress transitions', async () => {
  const engine = { async search(query, options) { if (options.offset === 200) throw typed('WORK_LIMIT_EXCEEDED'); return resultFor(ids, 7, options.offset, options.limit); } };
  const before = await verifier.capturePages(engine, 'q', { expectedIds: ids, revision: 7 });
  const alteredPage = clone(before); alteredPage.pages[1].extensions.facets.fields[0].buckets[0].count--;
  assert.throws(() => verifier.compareCaptures(before, alteredPage), /differs/);
  const alteredHit = clone(before); alteredHit.hits[0].score++;
  assert.throws(() => verifier.compareCaptures(before, alteredHit), /partial ordered/);
  const earlier = await capture({ async search() { throw typed('WORK_LIMIT_EXCEEDED'); } });
  const transition = verifier.compareCaptures(before, earlier);
  assert.equal(transition.status, 'Finding'); assert.equal(transition.kind, 'partial-coverage-transition'); assert.equal(transition.completeMembershipVerified, false);
  const malformed = clone(before); malformed.outcome = 'Pass';
  assert.throws(() => verifier.compareCaptures(before, malformed), /completion mismatch/);
});
