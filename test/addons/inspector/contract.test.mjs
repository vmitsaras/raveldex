import assert from 'node:assert/strict';
import test from 'node:test';
import { createInspector, exportDiagnostics } from '../../../dist/addons/inspector/index.js';
import { createSourceProvider } from '../../../dist/addons/phrases/source.js';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { coreResult, data, frozen, publicEngine, records, request, schema, plain } from './helpers.mjs';

const code = expected => error => error.code === expected && error.message === `Raveldex: ${expected}`;
function entries(value) { return value && typeof value === 'object' ? Reflect.ownKeys(value).length + Object.values(value).reduce((sum, child) => sum + entries(child), 0) : 0; }

function malformedPayloads(counter) {
  const accessor = { get ids() { counter.calls++; return ['a']; } };
  const idsGetter = ['a']; Object.defineProperty(idsGetter, '0', { get() { counter.calls++; return 'a'; } });
  const sparse = new Array(1), cyclic = { ids: ['a'] }; cyclic.extra = cyclic;
  return [null, [], {}, { ids: 'a' }, { ids: [''] }, { ids: ['a', 'a'] }, { ids: [1] }, { ids: ['a'], extra: true },
    { ids: ['a'], maxFacts: 0 }, { ids: ['a'], maxFacts: 1.5 }, { ids: ['a'], maxFacts: NaN }, { ids: ['a'], maxFacts: Infinity },
    { ids: ['a'], expectedRevision: -1 }, { ids: ['a'], expectedRevision: 1.5 }, { ids: ['a'], expectedRevision: '1' },
    { ids: ['a'], sourceFields: ['title', 'title'] }, { ids: ['a'], sourceFields: 'title' }, { ids: ['a'], sourceFields: [1] },
    accessor, { ids: idsGetter }, { ids: sparse }, cyclic, { ids: ['a'], [Symbol('bad')]: true },
    Object.assign(Object.create({ inherited: true }), { ids: ['a'] }), { ids: ['a'], extra: new Date() },
    { ids: ['a'], extra: () => true }, { ids: ['a'], extra: undefined }, { ids: ['\ud800'] }, { ids: ['\udc00'] },
    { ids: ['a'], ['bad\ud800']: true }];
}

test('Inspector requests reject malformed owned payloads on empty and irrelevant searches without executing getters', async t => {
  const engine = publicEngine(); const counter = { calls: 0 }, malformed = malformedPayloads(counter);
  for (const payload of malformed) for (const query of [{ kind: 'none' }, { kind: 'all' }]) {
    await assert.rejects(engine.search(query, { limit: 0, extensions: { inspector: payload } }), code('INVALID_OPTIONS'));
  }
  assert.equal(counter.calls, 0);
  t.diagnostic(JSON.stringify({ malformedAdmissionCases: malformed.length * 2, gettersExecuted: counter.calls }));
  await engine.dispose();
});

test('request and factory caps are inclusive; complete traces fail overflow without affecting ordinary search', async () => {
  const engine = publicEngine(); await engine.addMany(records);
  const baseline = await engine.search('red', request(['a']));
  const required = data(baseline).trace.facts.length + 1;
  const exact = await engine.search('red', request(['a'], { maxFacts: required }));
  assert.deepEqual(exact, baseline);
  await assert.rejects(engine.search('red', request(['a'], { maxFacts: required - 1 })), code('LIMIT_EXCEEDED'));
  for (const [payload, expected] of [
    [{ ids: [], maxFacts: 4097 }, 'LIMIT_EXCEEDED'], [{ ids: Array.from({ length: 129 }, (_, i) => `i${i}`) }, 'LIMIT_EXCEEDED'],
    [{ ids: ['x'.repeat(257)] }, 'LIMIT_EXCEEDED'],
  ]) await assert.rejects(engine.search({ kind: 'none' }, { extensions: { inspector: payload } }), code(expected));
  const empty = data(await engine.search({ kind: 'none' }, request([], { maxFacts: 1 })));
  assert.deepEqual(empty.trace.facts, []); assert.deepEqual(empty.documents, []);
  assert.equal(data(await engine.search({ kind: 'none' }, request(Array.from({ length: 128 }, (_, i) => `i${i}`)))).documents.length, 128);
  assert.deepEqual(await engine.search('red'), coreResult(baseline));
  await engine.dispose();
  const narrowed = publicEngine({ addons: [createInspector({ maxFacts: required })] }); await narrowed.addMany(records);
  await narrowed.search('red', request(['a']));
  await assert.rejects(narrowed.search('red', request(['a'], { maxFacts: required + 1 })), code('LIMIT_EXCEEDED'));
  await narrowed.dispose();
  const ids = publicEngine({ limits: { maxDocuments: 2 } });
  await ids.search({ kind: 'all' }, request(['a', 'b']));
  await assert.rejects(ids.search({ kind: 'all' }, request(['a', 'b', 'c'])), code('LIMIT_EXCEEDED'));
  await ids.dispose();
});

test('factory admission owns options and preserves explicit identity/source bounds without introducing side state', () => {
  const sourceFields = ['title'], options = { id: 'audit', sourceFields, maxFacts: 100, maxWorkUnits: 100_000, maxOutputEntries: 2000 };
  const addon = createInspector(options); sourceFields[0] = 'body'; options.id = 'changed'; options.maxFacts = 1;
  assert.equal(addon.manifest.id, 'audit'); assert.equal(addon.manifest.limits.maxWorkUnits, 100_000);
  assert.deepEqual(addon.manifest.dataRequirements.fields, ['title']); assert.equal(addon.manifest.indexEffect, 'none');
  assert.deepEqual(addon.manifest.provides.map(capability => capability.id), ['inspector']);
  frozen(addon);
  let calls = 0;
  for (const invalid of [null, [], Object.create({ id: 'bad' }), { get id() { calls++; return 'bad'; } }, { id: '' }, { id: 'bad id' },
    { sourceFields: ['title', 'title'] }, { sourceFields: ['unknown.field'] }, { sourceFields: ['constructor'] }, { sourceFields: 'title' },
    { maxFacts: 0 }, { maxWorkUnits: 0 }, { maxOutputEntries: 0 }, { maxFacts: 1.5 }, { maxFacts: NaN }, { extra: true }]) assert.throws(() => createInspector(invalid), code('INVALID_OPTIONS'));
  for (const invalid of [{ maxFacts: 4097 }, { maxWorkUnits: 10_000_001 }, { maxOutputEntries: 16_385 }]) assert.throws(() => createInspector(invalid), code('LIMIT_EXCEEDED'));
  assert.equal(calls, 0);
});

test('missing Inspector, unknown source requests, and incompatible source manifests fail explicitly even without documents', async () => {
  const ordinary = publicEngine({ addons: [] });
  await assert.rejects(ordinary.search({ kind: 'all' }, request()), code('MISSING_CAPABILITY')); await ordinary.dispose();
  const engine = publicEngine();
  await assert.rejects(engine.search({ kind: 'none' }, request([], { sourceFields: ['title'] })), code('MISSING_CAPABILITY'));
  await assert.rejects(engine.search({ kind: 'none' }, request([], { sourceFields: ['unknown'] })), code('MISSING_CAPABILITY'));
  await engine.dispose();
  assert.throws(() => captureConfiguration({ schema, addons: [createInspector({ sourceFields: ['title'] })] }), code('MISSING_CAPABILITY'));
  assert.throws(() => captureConfiguration({ schema, addons: [createInspector({ sourceFields: ['unknown'] }), createSourceProvider({ fields: ['title'] })] }), code('INCOMPATIBLE_CAPABILITY'));
});

test('output entries and registration work ceilings fail complete evidence at the exact boundary', async t => {
  const baseline = publicEngine(); await baseline.addMany(records);
  const output = data(await baseline.search('red', request(['a']))); const count = entries(output);
  await baseline.dispose();
  const exact = publicEngine({ addons: [createInspector({ maxOutputEntries: count })] }); await exact.addMany(records);
  assert.equal(entries(data(await exact.search('red', request(['a'])))), count); await exact.dispose();
  const below = publicEngine({ addons: [createInspector({ maxOutputEntries: count - 1 })] }); await below.addMany(records);
  await assert.rejects(below.search('red', request(['a'])), code('LIMIT_EXCEEDED'));
  assert.equal((await below.search('red')).total, 2); await below.dispose();
  const work = publicEngine({ addons: [createInspector({ maxWorkUnits: 1 })] }); await work.addMany(records);
  await assert.rejects(work.search('red', request(['a'])), code('WORK_LIMIT_EXCEEDED'));
  assert.equal((await work.search('red')).total, 2); await work.dispose();
  t.diagnostic(JSON.stringify({ exactInspectorOutputEntries: count }));
});

const privateRecords = [
  { id: 'PERSONAL-ID-a', text: { title: ['red SECRET-TITLE-a 😀e\u0301', 'EXTRA-PRIVATE-TEXT'], body: 'SECRET-BODY-a' }, metadata: { price: 1, active: true } },
  { id: 'PERSONAL-ID-b', text: {}, metadata: { price: 2 } },
];
test('source is explicit per request and shares original values while default diagnostics export metadata only', async () => {
  const engine = publicEngine({ addons: [createSourceProvider({ fields: ['title', 'body'] }), createInspector({ sourceFields: ['title', 'body'] })] });
  await engine.addMany(privateRecords);
  const selected = ['PERSONAL-ID-a', 'PERSONAL-ID-b', 'PERSONAL-ID-missing'];
  const ordinary = data(await engine.search('red', request(selected)));
  assert.ok(ordinary.documents.every(document => document.source.status === 'not-requested'));
  const inspected = data(await engine.search('red', request(selected, { sourceFields: ['title'] })));
  assert.deepEqual(plain(inspected.documents[0].source), { status: 'available', fields: { title: { status: 'available', values: privateRecords[0].text.title } } });
  assert.deepEqual(plain(inspected.documents[1].source), { status: 'available', fields: { title: { status: 'absent' } } });
  assert.deepEqual(plain(inspected.documents[2].source), { status: 'unavailable', reason: 'record-absent' });
  const defaultExport = exportDiagnostics(inspected);
  assert.equal(defaultExport.complete, true); assert.deepEqual(defaultExport.omitted, []);
  const metadata = JSON.parse(defaultExport.json);
  assert.deepEqual(Object.keys(metadata).sort(), ['configuration', 'kind', 'model', 'numericalTolerance', 'resources', 'result', 'revision', 'diagnostic'].sort());
  for (const text of ['PERSONAL-ID', 'SECRET-', 'PRIVATE-']) assert.equal(defaultExport.json.includes(text), false);
  const facts = exportDiagnostics(inspected, { includeFacts: true });
  const parsedFacts = JSON.parse(facts.json); assert.deepEqual(parsedFacts.trace, plain(inspected.trace));
  assert.ok(parsedFacts.documents.every(document => !Object.hasOwn(document, 'source')));
  assert.equal(facts.json.includes('SECRET-'), false);
  const sourceOnly = JSON.parse(exportDiagnostics(inspected, { includeSource: true }).json);
  assert.equal(Object.hasOwn(sourceOnly, 'trace'), false); assert.deepEqual(sourceOnly.sources[0], { id: selected[0], source: plain(inspected.documents[0].source) });
  assert.ok(JSON.stringify(sourceOnly).includes('SECRET-TITLE')); assert.equal(JSON.stringify(sourceOnly).includes('SECRET-BODY'), false);
  assert.deepEqual(JSON.parse(exportDiagnostics(inspected, { includeFacts: true, includeSource: true }).json).sources, sourceOnly.sources);
  frozen(inspected);
  await engine.dispose();
});

test('diagnostic JSON bounds preserve parseable whole sections and state every omitted requested section', async () => {
  const engine = publicEngine({ addons: [createSourceProvider({ fields: ['title'] }), createInspector({ sourceFields: ['title'] })] });
  await engine.addMany(privateRecords);
  const inspected = data(await engine.search('red', request(['PERSONAL-ID-a'], { sourceFields: ['title'] })));
  const full = exportDiagnostics(inspected, { includeFacts: true, includeSource: true });
  assert.equal(full.complete, true); assert.deepEqual(full.omitted, []);
  const exact = exportDiagnostics(inspected, { includeFacts: true, includeSource: true, maxCodeUnits: full.json.length });
  assert.deepEqual(exact, full);
  const truncated = exportDiagnostics(inspected, { includeFacts: true, includeSource: true, maxCodeUnits: full.json.length - 1 });
  assert.equal(truncated.complete, false); assert.ok(truncated.omitted.length > 0); assert.ok(truncated.json.length < full.json.length);
  const parsed = JSON.parse(truncated.json);
  for (const omitted of truncated.omitted) {
    if (omitted === 'facts') for (const key of ['trace', 'query', 'documents']) assert.equal(Object.hasOwn(parsed, key), false);
    if (omitted === 'source') assert.equal(Object.hasOwn(parsed, 'sources'), false);
  }
  const metadata = exportDiagnostics(inspected);
  const reservedMetadata = { ...JSON.parse(metadata.json), diagnostic: { complete: false, omitted: ['facts', 'source'] } };
  const allOmitted = exportDiagnostics(inspected, { includeFacts: true, includeSource: true, maxCodeUnits: JSON.stringify(reservedMetadata).length });
  assert.equal(allOmitted.complete, false); assert.deepEqual(allOmitted.omitted, ['facts', 'source']); assert.deepEqual(JSON.parse(allOmitted.json), reservedMetadata);
  assert.throws(() => exportDiagnostics(inspected, { maxCodeUnits: metadata.json.length - 1 }), code('LIMIT_EXCEEDED'));
  let calls = 0;
  for (const options of [null, [], { extra: 1 }, { includeFacts: 1 }, { includeSource: 'yes' }, { maxCodeUnits: 0 }, { maxCodeUnits: NaN }, { maxCodeUnits: 1.5 }, { get includeFacts() { calls++; return true; } }]) assert.throws(() => exportDiagnostics(inspected, options), code('INVALID_OPTIONS'));
  assert.throws(() => exportDiagnostics(inspected, { maxCodeUnits: 262145 }), code('LIMIT_EXCEEDED'));
  assert.equal(calls, 0);
  await engine.dispose();
});

test('diagnostic schema round trips and rejects foreign/inconsistent/malformed data without toJSON or getter calls', async t => {
  const engine = publicEngine(); await engine.addMany(records);
  const inspected = data(await engine.search('red', request(['a'])));
  const roundTrip = JSON.parse(JSON.stringify(inspected));
  assert.deepEqual(exportDiagnostics(roundTrip, { includeFacts: true }), exportDiagnostics(inspected, { includeFacts: true }));
  let calls = 0;
  const mutations = [
    data => { data.kind = 'foreign-inspector'; }, data => { data.model = 'minisearch'; },
    data => { data.trace.model = 'foreign-score'; }, data => { data.trace.revision++; }, data => { data.trace.analyzer.id = 'foreign'; },
    data => { data.trace.facts[0].kind = 'invented-percentage'; }, data => { data.trace.facts.find(fact => fact.kind === 'field').selected = Infinity; },
    data => { data.documents[0].eligibility = 'unknown'; }, data => { data.documents[0].absoluteRank.reason = 'guessed'; },
    data => { data.resources.heapBytes = { status: 'available', bytes: 100 }; }, data => { data.result.returned = data.result.total + 1; },
    data => { data.numericalTolerance.relative = 1; }, data => { data.extra = 'private'; },
    data => { Object.defineProperty(data, 'trace', { get() { calls++; return inspected.trace; } }); },
    data => { data.toJSON = () => { calls++; return {}; }; }, data => { data.documents[0].id = '\ud800'; },
    data => { data.documents.push(data); }, data => { data[Symbol('hidden')] = 'private'; },
  ];
  for (const change of mutations) { const copied = JSON.parse(JSON.stringify(inspected)); change(copied); assert.throws(() => exportDiagnostics(copied), { code: 'INVALID_OPTIONS' }); }
  assert.equal(calls, 0); t.diagnostic(JSON.stringify({ invalidDiagnosticDataCases: mutations.length, hooksExecuted: calls }));
  await engine.dispose();
});

test('explicit source projection enforces aggregate original UTF-16 text ceiling and leaves ordinary search usable', async () => {
  const engine = publicEngine({ addons: [createSourceProvider({ fields: ['title'] }), createInspector({ sourceFields: ['title'] })] });
  // Four legal punctuation-only values meet the per-record input ceiling; the
  // requested evidence adds its keys/header and must fail rather than exceed it.
  await engine.add({ id: 'large', text: { title: Array.from({ length: 4 }, () => '!'.repeat(65_536)) } });
  const ordinary = await engine.search({ kind: 'all' });
  const withoutSource = await engine.search({ kind: 'all' }, request(['large']));
  assert.deepEqual(coreResult(withoutSource), ordinary);
  await assert.rejects(engine.search({ kind: 'all' }, request(['large'], { sourceFields: ['title'] })), code('LIMIT_EXCEEDED'));
  assert.deepEqual(await engine.search({ kind: 'all' }), ordinary);
  await engine.dispose();
});
