import test from 'node:test';
import assert from 'node:assert/strict';
import { captureConfiguration } from '../../dist/core/contracts/schema.js';
import { initializeParticipants } from '../../dist/core/capabilities/participants.js';
import { emptyRoot, ExecutionOwner } from '../../dist/core/execution/engine.js';
import { captureSearch, executeOwnedSearch, executeSearch } from '../../dist/core/query/search.js';
import { directoryEntries } from '../../dist/core/index/directory.js';
import { emptyDirectory } from '../../dist/core/index/staging.js';
import { createFilters } from '../../dist/addons/filters/index.js';
import { createFacets } from '../../dist/addons/facets/index.js';
import { createInspector } from '../../dist/addons/inspector/index.js';
import { addonsFor } from '../addons/positions/helpers.mjs';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../oracle/phrases.mjs';
import { FakeHost } from '../fixtures/execution/host.mjs';

const schema = { text: { title: {}, body: { boost: 2 } }, metadata: { price: { type: 'number' }, category: { type: 'string' } } };
const records = [
  { id: 'a', text: { title: 'rare red', body: 'red blue' }, metadata: { price: 5, category: 'one' } },
  { id: 'b', text: { title: 'red', body: ['red', 'blue'] }, metadata: { price: 15, category: 'two' } },
  { id: 'c', text: { title: 'blue', body: 'blue red' }, metadata: { price: 25, category: 'one' } },
  { id: 'd', text: { title: 'green', body: 'red gap blue' }, metadata: { price: 35, category: 'two' } },
  { id: 'empty', text: {} },
  { id: 'z', text: { title: 'unrelated', body: 'white' }, metadata: { price: 45, category: 'one' } },
  { id: '__proto__', text: { title: 'rare', body: 'red blue red' }, metadata: { price: 55, category: 'one' } },
];
const text = value => ({ kind: 'text', text: value });
const and = (...children) => ({ kind: 'and', children });
const or = (...children) => ({ kind: 'or', children });
const not = child => ({ kind: 'not', child });
const eq = (field, value) => ({ kind: 'eq', field, value });
const phrase = value => ({ kind: 'phrase', text: value, fields: ['body'] });
const range = bounds => ({ kind: 'extension', capability: 'numeric-range', version: 1, payload: { field: 'price', ...bounds } });
const prefix = value => ({ kind: 'group', fields: ['body'], variants: [{ text: value, match: 'prefix' }] });
const native = query => query.kind === 'phrase' ? { kind: 'extension', capability: 'phrases', version: 1, payload: { text: query.text, fields: query.fields } } :
  query.kind === 'not' ? { ...query, child: native(query.child) } :
  query.kind === 'and' || query.kind === 'or' ? { ...query, children: query.children.map(native) } : query;
const ids = result => result.hits.map(hit => hit.id).sort();
const plain = value => JSON.parse(JSON.stringify(value));
function drain(cursor) {
  let workUnits = 0, steps = 0;
  for (;;) {
    const step = cursor.next();
    if (step.done) return { value: step.value, workUnits, steps };
    assert.ok(Number.isSafeInteger(step.value.workUnits) && step.value.workUnits > 0);
    workUnits += step.value.workUnits; steps++;
  }
}
function fixture({ addons = [], limits = {}, selectedSchema = schema } = {}) {
  const host = new FakeHost(), configuration = captureConfiguration({ schema: selectedSchema, addons, limits });
  const installed = initializeParticipants(configuration);
  const engine = new ExecutionOwner(emptyRoot(configuration, installed.states), host, installed.participants);
  return { engine, host, async call(method, ...args) { const promise = engine[method](...args); host.runReady(); return promise; } };
}
function compare(actual, expected, revision = 1) {
  assert.equal(actual.revision, revision); assert.equal(actual.model, 'raveldex-bm25-v1'); assert.equal(actual.completeness, 'complete');
  assert.equal(actual.total, expected.total); assert.deepEqual(actual.hits.map(hit => hit.id), expected.hits.map(hit => hit.id));
  actual.hits.forEach((hit, index) => assert.ok(Math.abs(hit.score - expected.hits[index].score) <= Math.max(1e-12, Math.abs(expected.hits[index].score) * 1e-12)));
}

// Every expected membership is literal; the independent full-source oracle also
// checks ranking and unrounded scores. It imports no production query machinery.
test('candidate upper sets preserve complete Boolean membership, scores and pages including universe fallbacks', async () => {
  const state = fixture(); await state.call('addMany', records);
  const corpus = scanSourceCorpus(records, schema);
  const cases = [
    [text('rare'), ['a', '__proto__']],
    [and(text('rare'), text('red')), ['a', '__proto__']],
    [or(text('rare'), text('green')), ['a', 'd', '__proto__']],
    [or(and(text('rare'), text('absent')), text('rare')), ['a', '__proto__']],
    [and(text('rare'), not({ kind: 'text', text: 'red', fields: ['title'] })), ['__proto__']],
    [not(text('rare')), ['b', 'c', 'd', 'empty', 'z']],
    [not(not(text('rare'))), ['a', '__proto__']],
    [or(text('rare'), not(text('red'))), ['a', '__proto__', 'empty', 'z']],
    [or(text('rare'), eq('category', 'two')), ['a', 'b', 'd', '__proto__']],
    [and(text('rare'), eq('category', 'one')), ['a', '__proto__']],
    [eq('category', 'one'), ['a', 'c', 'z', '__proto__']],
    [{ kind: 'all' }, records.map(record => record.id)],
    [{ kind: 'none' }, []],
    [and(text('absent'), { kind: 'all' }), []],
    [or(text('absent'), { kind: 'all' }), records.map(record => record.id)],
  ];
  try {
    for (const [query, expectedIds] of cases) {
      assert.deepEqual(sourceQueryResult(corpus, query, { limit: 100 }).hits.map(hit => hit.id).sort(), [...expectedIds].sort());
      for (const page of [{ limit: 100 }, { limit: 0 }, { offset: 1, limit: 2 }]) compare(await state.call('search', query, page), sourceQueryResult(corpus, query, page));
    }
  } finally { await state.engine.dispose(); }
});

test('selective lexical evaluation skips irrelevant documents and empty postings without allocating a universe scan', async () => {
  const state = fixture({ selectedSchema: { text: { body: {} } } });
  const input = Array.from({ length: 240 }, (_, index) => ({ id: `item:${String(index).padStart(3, '0')}`, text: { body: index === 239 ? 'rare common' : 'common ordinary' } }));
  await state.call('addMany', input);
  try {
    const root = state.engine.root;
    function observe(query) {
      let evaluationChecks = 0;
      const result = drain(executeOwnedSearch(root, captureSearch(root.configuration, query, { limit: 100 }), { checkpoint(phase) { if (phase === 'evaluation') evaluationChecks++; } }));
      return { ...result, evaluationChecks };
    }
    const sparse = observe('rare'), universe = observe({ kind: 'all' }), absent = observe('notpresent');
    assert.deepEqual(sparse.value.hits.map(hit => hit.id), ['item:239']);
    assert.equal(sparse.value.total, 1); assert.equal(absent.value.total, 0);
    assert.ok(sparse.evaluationChecks > 0 && sparse.evaluationChecks < 20, String(sparse.evaluationChecks));
    assert.equal(absent.evaluationChecks, 0);
    assert.ok(universe.evaluationChecks > 240);
    assert.ok(sparse.workUnits < universe.workUnits / 4, `${sparse.workUnits} vs ${universe.workUnits}`);
  } finally { await state.engine.dispose(); }
});

test('opaque numeric predicates retain universe OR membership while lexical AND bounds preserve native scores and facets', async () => {
  const state = fixture({ addons: [createFilters({ fields: ['price'] }), createFacets({ fields: ['category'] })] });
  await state.call('addMany', records);
  try {
    const query = or(text('rare'), range({ gte: 20, lte: 30 }));
    const full = await state.call('search', query, { limit: 100 });
    assert.deepEqual(ids(full), ['__proto__', 'a', 'c']); assert.equal(full.total, 3);
    assert.equal(full.hits.find(hit => hit.id === 'c').score, 0);
    const rare = await state.call('search', text('rare'), { limit: 100 });
    for (const hit of rare.hits) assert.equal(full.hits.find(row => row.id === hit.id).score, hit.score);
    assert.deepEqual(ids(await state.call('search', and(text('rare'), range({ gte: 50 })), { limit: 100 })), ['__proto__']);
    assert.deepEqual(ids(await state.call('search', not(range({ gte: 20, lte: 30 })), { limit: 100 })), ['__proto__', 'a', 'b', 'd', 'empty', 'z']);
    const options = { extensions: { facets: { fields: [{ field: 'category', missing: true }] } } };
    for (const page of [{ limit: 1 }, { offset: 2, limit: 1 }, { limit: 0 }]) {
      const result = await state.call('search', text('red'), { ...page, ...options });
      assert.equal(result.total, 5);
      assert.deepEqual(plain(result.extensions.facets), { fields: [{ field: 'category', buckets: [{ kind: 'value', value: 'one', count: 3 }, { kind: 'value', value: 'two', count: 2 }], distinctValueTotal: 2, omittedBucketCount: 0 }] });
    }
  } finally { await state.engine.dispose(); }
});

test('posting-derived phrase bounds retain source, positions and mixed eligibility, failed-branch scores and value boundaries', async () => {
  const states = ['source', 'positions', 'mixed'].map(strategy => fixture({ addons: addonsFor(schema, strategy, ['body']) }));
  for (const state of states) await state.call('addMany', records);
  const corpus = scanPhraseSourceCorpus(records, schema);
  const cases = [
    [phrase('red blue'), ['a', '__proto__']],
    [or(phrase('red blue'), text('green')), ['a', 'd', '__proto__']],
    [and(phrase('red blue'), text('rare')), ['a', '__proto__']],
    [not(phrase('red blue')), ['b', 'c', 'd', 'empty', 'z']],
    [or(and(phrase('red blue'), text('absent')), text('green')), ['d']],
    [phrase('red red'), []],
    [phrase('!!!'), []],
  ];
  try {
    for (const [query, expectedIds] of cases) {
      let first;
      for (const state of states) {
        const result = await state.call('search', native(query), { limit: 100 });
        assert.deepEqual(ids(result), [...expectedIds].sort()); compare(result, sourcePhraseQueryResult(corpus, query, { limit: 100 }));
        if (first) assert.deepEqual(result, first); else first = result;
      }
    }
    // Every representation changes its candidate state on replacement/removal.
    for (const state of states) {
      await state.call('replace', { ...records[0], text: { title: 'rare red', body: 'red gap blue' } });
      assert.deepEqual(ids(await state.call('search', native(phrase('red blue')), { limit: 100 })), ['__proto__']);
      await state.call('remove', '__proto__');
      const empty = await state.call('search', native(phrase('red blue')), { limit: 0 });
      assert.equal(empty.total, 0); assert.equal(empty.revision, 3);
    }
  } finally { for (const state of states) await state.engine.dispose(); }
});

test('selected nonmatch and missing Inspector IDs retain complete node facts, zero scores, original trace order and fact caps', async () => {
  const state = fixture({ addons: [createInspector()] }); await state.call('addMany', records);
  const selected = ['z', '__proto__', 'a', 'b', 'missing'], query = or(and(text('rare'), text('absent')), text('green'));
  const options = { limit: 100, extensions: { inspector: { ids: selected } } };
  try {
    const result = await state.call('search', query, options), detail = result.extensions.inspector;
    assert.deepEqual(ids(result), ['d']); assert.equal(result.total, 1);
    for (const id of selected.filter(id => id !== 'missing')) {
      const doc = detail.documents.find(doc => doc.id === id);
      assert.equal(doc.exists, true); assert.equal(doc.eligibility, 'excluded'); assert.equal(doc.score, 0); assert.deepEqual(doc.groups, []);
      const nodes = detail.trace.facts.filter(fact => fact.id === id && fact.kind === 'node');
      assert.ok(nodes.some(fact => fact.path === 'query.children[0]' && fact.node === 'and' && !fact.matched && fact.groups.length === 0));
      assert.ok(nodes.some(fact => fact.path === 'query' && !fact.matched));
    }
    const missing = detail.documents.find(doc => doc.id === 'missing');
    assert.equal(missing.exists, false); assert.equal(missing.score, null); assert.equal(missing.eligibility, 'absent');
    const expectedOrder = [...directoryEntries(state.engine.root.documents)].map(([id]) => id).filter(id => selected.includes(id)); expectedOrder.push('missing');
    assert.deepEqual(detail.trace.facts.filter(fact => fact.kind === 'document').map(fact => fact.id), expectedOrder);
    const required = detail.trace.facts.length + 1;
    assert.deepEqual((await state.call('search', query, { ...options, extensions: { inspector: { ids: selected, maxFacts: required } } })).extensions.inspector.trace, detail.trace);
    await assert.rejects(state.call('search', query, { ...options, extensions: { inspector: { ids: selected, maxFacts: required - 1 } } }), { code: 'LIMIT_EXCEEDED', details: { path: 'trace.facts', limit: required - 1, actual: required } });
    assert.deepEqual(ids(await state.call('search', query, { limit: 100 })), ['d']);
  } finally { await state.engine.dispose(); }
});

test('empty candidate bounds cannot hide invalid opaque leaves or expansion refusals in unreachable branches', async () => {
  const state = fixture({ addons: [createFilters({ fields: ['price'] })] }); await state.call('addMany', records);
  try {
    for (const query of [and(text('absent'), range({ gte: 10, lte: 1 })), or({ kind: 'none' }, range({ gte: 10, lte: 1 }))]) {
      await assert.rejects(state.call('search', query), { code: 'INVALID_QUERY', details: { path: 'filters.bounds' } });
    }
    assert.equal((await state.call('search', text('rare'))).total, 2);
  } finally { await state.engine.dispose(); }
  const limited = fixture({ selectedSchema: { text: { body: {} } }, limits: { maxExpansionsPerGroup: 1 } });
  await limited.call('addMany', [{ id: 'a', text: { body: 'preone pretwo' } }]);
  try {
    await assert.rejects(limited.call('search', and({ kind: 'none' }, prefix('pre'))), { code: 'LIMIT_EXCEEDED', details: { path: 'expansions.group', limit: 1, actual: 2 } });
    assert.equal((await limited.call('search', 'preone')).total, 1);
  } finally { await limited.engine.dispose(); }
});

test('compound bounds preserve per-record opaque failures and missing authoritative phrase records outside positive sibling matches', async () => {
  const base = createFilters({ fields: ['price'] });
  const invalid = { ...base, predicate: { ...base.predicate, *prepare(context) {
    const prepared = yield* base.predicate.prepare(context);
    return { *test(metadata) {
      if (metadata.price === 45) { yield { workUnits: 1 }; return 'invalid predicate result'; }
      return yield* prepared.test(metadata);
    } };
  } } };
  const opaque = fixture({ addons: [invalid] }); await opaque.call('addMany', records);
  try {
    for (const query of [and(text('rare'), range({ gte: 50 })), or(text('rare'), range({ gte: 50 }))]) {
      await assert.rejects(opaque.call('search', query), { code: 'INCOMPATIBLE_CAPABILITY', details: { path: 'query.refinement' } });
    }
    assert.equal((await opaque.call('search', text('rare'))).total, 2);
  } finally { await opaque.engine.dispose(); }
  const source = fixture({ addons: addonsFor(schema, 'source') }); await source.call('addMany', records);
  try {
    const root = source.engine.root, previous = root.participants.source;
    const missing = Object.freeze({ ...previous, records: emptyDirectory(), retainedEntries: 0, textCodeUnits: 0 });
    const broken = Object.freeze({ ...root, participants: Object.freeze({ source: missing }) });
    assert.throws(() => drain(executeSearch(broken, and(text('absent'), native(phrase('red blue'))))), { code: 'MISSING_CAPABILITY', details: { path: 'phrases.source.record' } });
    assert.equal((await source.call('search', native(phrase('red blue')))).total, 2);
  } finally { await source.engine.dispose(); }
});

test('candidate work remains charged at the exact budget boundary and cancellation preserves the revision', async () => {
  const selectedSchema = { text: { body: {} } }, input = Array.from({ length: 100 }, (_, index) => ({ id: `r${index}`, text: { body: index % 20 === 0 ? 'rare common' : 'common' } }));
  const baseline = fixture({ selectedSchema, limits: { checkpointWorkUnits: 1 } }); await baseline.call('addMany', input);
  const root = baseline.engine.root, measured = drain(executeSearch(root, 'rare', { limit: 100 }));
  const low = fixture({ selectedSchema, limits: { checkpointWorkUnits: 1, maxSearchWorkUnits: measured.workUnits - 1 } });
  const exact = fixture({ selectedSchema, limits: { checkpointWorkUnits: 1, maxSearchWorkUnits: measured.workUnits } });
  await low.call('addMany', input); await exact.call('addMany', input);
  try {
    await assert.rejects(low.call('search', 'rare', { limit: 100 }), { code: 'WORK_LIMIT_EXCEEDED' });
    assert.deepEqual(await exact.call('search', 'rare', { limit: 100 }), measured.value);
    for (const [target, threshold] of [['candidates', 20], ['evaluation', 1]]) {
      const abort = new AbortController(); let checks = 0;
      const cursor = executeOwnedSearch(root, captureSearch(root.configuration, 'rare', { limit: 100, signal: abort.signal }), { checkpoint(phase) {
        if (phase === target && ++checks === threshold) abort.abort();
      } });
      assert.throws(() => drain(cursor), { code: 'CANCELLED' }); assert.equal(checks, threshold);
    }
    assert.equal(baseline.engine.root, root); assert.equal(root.revision, 1);
    assert.deepEqual(await baseline.call('search', 'rare', { limit: 100 }), measured.value);
    assert.equal(baseline.host.pending, 0);
  } finally { await baseline.engine.dispose(); await low.engine.dispose(); await exact.engine.dispose(); }
});
