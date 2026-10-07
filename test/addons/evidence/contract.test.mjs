import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatchEvidence } from '../../../dist/addons/evidence/index.js';
import { createSnippetEvidence } from '../../../dist/addons/snippets/index.js';
import { createRaveldex } from '../../../dist/index.js';
import { createSourceProvider } from '../../../dist/addons/phrases/source.js';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { executeSearch } from '../../../dist/core/query/search.js';
import { emptyDirectory } from '../../../dist/core/index/staging.js';
import { coreResult, data, drain, entries, frozen, publicEngine, request, schema, setup } from './helpers.mjs';

const typed = expected => error => error.code === expected && error.message === `Raveldex: ${expected}`;
function malformedPayloads(counter) {
  const accessor = { get ids() { counter.calls++; return ['a']; } };
  const idsGetter = ['a']; Object.defineProperty(idsGetter, '0', { get() { counter.calls++; return 'a'; } });
  const sparse = new Array(1), cyclic = { ids: ['a'] }; cyclic.extra = cyclic;
  return [null, [], {}, { ids: 'a' }, { ids: [''] }, { ids: ['a', 'a'] }, { ids: [1] }, { ids: ['a'], extra: true },
    { ids: ['a'], maxFacts: 0 }, { ids: ['a'], maxFacts: 1.5 }, { ids: ['a'], maxFacts: NaN }, { ids: ['a'], maxFacts: Infinity },
    { ids: ['a'], maxRanges: 0 }, { ids: ['a'], maxRanges: 1.5 }, { ids: ['a'], maxRanges: NaN },
    { ids: ['a'], expectedRevision: -1 }, { ids: ['a'], expectedRevision: 1.5 }, { ids: ['a'], expectedRevision: '1' },
    { ids: ['a'], fields: ['title', 'title'] }, { ids: ['a'], fields: 'title' }, { ids: ['a'], fields: [1] },
    accessor, { ids: idsGetter }, { ids: sparse }, cyclic, { ids: ['a'], [Symbol('bad')]: true },
    Object.assign(Object.create({ inherited: true }), { ids: ['a'] }), { ids: ['a'], extra: undefined }, { ids: ['\ud800'] }, { ids: ['\udc00'] }];
}

test('range and snippet requests own bounded plain data without invoking getters on empty or irrelevant queries', async t => {
  const counter = { calls: 0 }, malformed = malformedPayloads(counter); let rejected = 0;
  for (const snippets of [false, true]) {
    const capability = snippets ? 'snippets' : 'match-evidence', engine = publicEngine('source', {}, { snippets });
    for (const payload of malformed) for (const query of [{ kind: 'none' }, { kind: 'all' }]) {
      await assert.rejects(engine.search(query, { limit: 0, extensions: { [capability]: payload } }), typed('INVALID_OPTIONS')); rejected++;
    }
    await engine.dispose();
  }
  assert.equal(counter.calls, 0); t.diagnostic(JSON.stringify({ malformedRequestRejections: rejected, gettersExecuted: counter.calls }));
});

test('factories own strategy fields and caps, reject unsupported strategies and sanitize errors', () => {
  let calls = 0;
  for (const create of [createMatchEvidence, createSnippetEvidence]) {
    const fields = { title: 'source', body: 'offsets' }, options = { fields, id: 'owned', maxRanges: 100, maxFacts: 200, maxWorkUnits: 100_000, maxOutputEntries: 2_000 };
    const addon = create(options); fields.title = 'offsets'; delete fields.body; options.id = 'changed'; options.maxRanges = 1;
    assert.equal(addon.manifest.id, 'owned'); assert.equal(addon.manifest.indexEffect, 'none'); assert.equal(addon.manifest.limits.maxWorkUnits, 100_000); frozen(addon);
    assert.ok(addon.manifest.requires.some(reference => reference.id === 'source:title'));
    assert.ok(addon.manifest.requires.some(reference => reference.id === 'offsets:body'));
    for (const invalid of [undefined, null, [], {}, { fields: [] }, { fields: {} }, { fields: { title: 'auto' } }, { fields: { title: 'positions' } },
      { fields: { title: true } }, { fields: { constructor: 'source' } }, { fields: { 'bad-name': 'source' } },
      { fields: { get title() { calls++; return 'source'; } } }, { fields: { title: 'source' }, get id() { calls++; return 'private'; } },
      { fields: { title: 'source' }, maxRanges: 0 }, { fields: { title: 'source' }, maxFacts: 1.5 },
      { fields: { title: 'source' }, maxWorkUnits: 0 }, { fields: { title: 'source' }, maxOutputEntries: NaN },
      { fields: { title: 'source' }, extra: true }]) assert.throws(() => create(invalid), typed('INVALID_OPTIONS'));
    for (const invalid of [{ maxRanges: 4097 }, { maxFacts: 4097 }, { maxWorkUnits: 10_000_001 }, { maxOutputEntries: 16_385 }]) assert.throws(() => create({ fields: { title: 'source' }, ...invalid }), typed('LIMIT_EXCEEDED'));
  }
  for (const invalid of [{ maxSnippets: 0 }, { maxCodeUnits: 0 }, { maxHighlights: 0 }, { maxSnippets: 1.5 }]) assert.throws(() => createSnippetEvidence({ fields: { title: 'source' }, ...invalid }), typed('INVALID_OPTIONS'));
  for (const invalid of [{ maxSnippets: 4 }, { maxCodeUnits: 241 }, { maxHighlights: 33 }]) assert.throws(() => createSnippetEvidence({ fields: { title: 'source' }, ...invalid }), typed('LIMIT_EXCEEDED'));
  assert.equal(calls, 0);
});

test('source, original offsets and display source are separate explicit requirements even before any data exists', async () => {
  const fields = { title: 'source' }, offsets = { title: 'offsets' };
  for (const addons of [
    [createMatchEvidence({ fields })], [createMatchEvidence({ fields: offsets })],
    [createPositionProvider({ fields: ['title'] }), createMatchEvidence({ fields: offsets })],
    [createPositionProvider({ fields: ['title'], offsets: ['title'] }), createSnippetEvidence({ fields: offsets })],
    [createSourceProvider({ fields: ['body'] }), createSnippetEvidence({ fields })],
  ]) assert.throws(() => captureConfiguration({ schema, addons }), typed('MISSING_CAPABILITY'));
  const ordinary = createRaveldex({ schema });
  for (const capability of ['match-evidence', 'snippets']) await assert.rejects(ordinary.search({ kind: 'none' }, request([], {}, capability)), typed('MISSING_CAPABILITY'));
  await ordinary.dispose();
  for (const snippets of [false, true]) {
    const capability = snippets ? 'snippets' : 'match-evidence', engine = publicEngine('source', {}, { fields, snippets });
    for (const field of ['body', 'unknown']) await assert.rejects(engine.search({ kind: 'none' }, request([], { fields: [field] }, capability)), typed('MISSING_CAPABILITY'));
    await engine.dispose();
  }
});

test('global range/fact/ID limits are inclusive, narrow only, and reject complete overflow while ordinary search recovers', async () => {
  const engine = publicEngine('source', {}, { fields: { title: 'source' } });
  await engine.add({ id: 'a', text: { title: 'red red red' } });
  const ordinary = await engine.search('red');
  const complete = await engine.search('red', request(['a'], { maxRanges: 3 }));
  assert.deepEqual(coreResult(complete), ordinary); assert.equal(data(complete).documents[0].ranges.length, 3);
  await assert.rejects(engine.search('red', request(['a'], { maxRanges: 2 })), typed('LIMIT_EXCEEDED'));
  await assert.rejects(engine.search('red', request(['a'], { maxFacts: 1 })), typed('LIMIT_EXCEEDED'));
  for (const payload of [{ ids: [], maxRanges: 4097 }, { ids: [], maxFacts: 4097 }, { ids: Array.from({ length: 129 }, (_, i) => `i${i}`) }, { ids: ['x'.repeat(257)] }]) await assert.rejects(engine.search({ kind: 'none' }, { extensions: { 'match-evidence': payload } }), typed('LIMIT_EXCEEDED'));
  assert.deepEqual(data(await engine.search({ kind: 'none' }, request([], { maxFacts: 1, maxRanges: 1 }))).documents, []);
  assert.equal(data(await engine.search({ kind: 'none' }, request(Array.from({ length: 128 }, (_, i) => `i${i}`)))).documents.length, 128);
  assert.deepEqual(await engine.search('red'), ordinary); await engine.dispose();
  const narrowed = publicEngine('source', {}, { fields: { title: 'source' }, factory: { maxRanges: 3 } });
  await narrowed.add({ id: 'a', text: { title: 'red red red' } }); await narrowed.search('red', request(['a']));
  await assert.rejects(narrowed.search('red', request(['a'], { maxRanges: 4 })), typed('LIMIT_EXCEEDED'));
  await narrowed.add({ id: 'b', text: { title: 'red' } });
  await assert.rejects(narrowed.search('red', request(['a', 'b'])), typed('LIMIT_EXCEEDED'));
  assert.equal((await narrowed.search('red')).total, 2); await narrowed.dispose();
});

test('requested output structure is bounded inclusively and its registration work cap counts all selected documents', async t => {
  const base = publicEngine('source', {}, { fields: { title: 'source' } });
  const records = [{ id: 'a', text: { title: 'red red' } }, { id: 'b', text: { title: 'red red' } }]; await base.addMany(records);
  const count = entries(data(await base.search('red', request(['a', 'b'])))); await base.dispose();
  const exact = publicEngine('source', {}, { fields: { title: 'source' }, factory: { maxOutputEntries: count } }); await exact.addMany(records);
  assert.equal(entries(data(await exact.search('red', request(['a', 'b'])))), count); await exact.dispose();
  const below = publicEngine('source', {}, { fields: { title: 'source' }, factory: { maxOutputEntries: count - 1 } }); await below.addMany(records);
  await assert.rejects(below.search('red', request(['a', 'b'])), typed('LIMIT_EXCEEDED')); assert.equal((await below.search('red')).total, 2); await below.dispose();
  let measuredWork = 0;
  const original = createMatchEvidence({ fields: { title: 'source' } });
  const measured = { ...original, evidence: { ...original.evidence, *prepare(context) {
    const cursor = original.evidence.prepare(context); let prepared;
    try { for (;;) { const step = cursor.next(); if (step.done) { prepared = step.value; break; } measuredWork += step.value.workUnits; yield step.value; } }
    finally { cursor.return(); }
    return { *finish(context) { const output = prepared.finish(context); try { for (;;) { const step = output.next(); if (step.done) return step.value; measuredWork += step.value.workUnits; yield step.value; } } finally { output.return(); } } };
  } } };
  const measuring = setup('source', {}, { fields: { title: 'source' }, evidence: measured }); await measuring.call('addMany', records);
  const expected = await measuring.call('search', 'red', request(['a', 'b'])); assert.ok(measuredWork > 1); await measuring.call('dispose');
  for (const [work, passes] of [[measuredWork, true], [measuredWork - 1, false]]) {
    const state = setup('source', {}, { fields: { title: 'source' }, factory: { maxWorkUnits: work } }); await state.call('addMany', records); const root = state.engine.root;
    if (passes) assert.deepEqual(await state.call('search', 'red', request(['a', 'b'])), expected);
    else { await assert.rejects(state.call('search', 'red', request(['a', 'b'])), typed('WORK_LIMIT_EXCEEDED')); assert.equal(state.engine.root, root); assert.equal((await state.call('search', 'red')).total, 2); }
    await state.call('dispose');
  }
  t.diagnostic(JSON.stringify({ exactOutputEntries: count, exactSharedEvidenceWork: measuredWork }));
});

test('missing, stale and incompatible selected source/offset roots fail before empty-result projection', async () => {
  for (const strategy of ['source', 'offsets']) {
    const state = setup(strategy, {}, { fields: { title: strategy } }); await state.call('add', { id: 'a', text: { title: 'red' } });
    const original = state.engine.root, id = strategy === 'source' ? 'source' : 'positions', participant = original.participants[id];
    for (const [selected, expected] of [
      [undefined, 'MISSING_CAPABILITY'], [{ ...participant }, 'INCOMPATIBLE_CAPABILITY'],
      [Object.freeze({ ...participant, revision: 0 }), 'REVISION_MISMATCH'],
      [Object.freeze({ ...participant, analyzer: Object.freeze({ ...participant.analyzer, id: 'foreign' }) }), 'INCOMPATIBLE_CAPABILITY'],
      [Object.freeze({ ...participant, fields: Object.freeze(['body']), ...(strategy === 'offsets' ? { offsetFields: Object.freeze(['body']) } : {}) }), 'MISSING_CAPABILITY'],
    ]) {
      const root = Object.freeze({ ...original, participants: Object.freeze({ ...original.participants, [id]: selected }) });
      assert.throws(() => drain(executeSearch(root, { kind: 'none' }, request([]))), typed(expected));
    }
    const missing = Object.freeze({ ...original, participants: Object.freeze({ ...original.participants, [id]: Object.freeze({ ...participant, records: emptyDirectory() }) }) });
    assert.throws(() => drain(executeSearch(missing, 'red', request(['a']))), typed('MISSING_CAPABILITY'));
    assert.equal(data(await state.call('search', 'red', request(['a']))).documents[0].ranges.length, 1); assert.equal(state.engine.root, original);
    await state.call('dispose');
  }
});

test('installed but unrequested presentation executes no evidence cursor and a second evidence request cannot reset limits', async () => {
  let prepares = 0, finishes = 0;
  const original = createMatchEvidence({ fields: { title: 'source' } });
  const observed = { ...original, evidence: { ...original.evidence, *prepare(context) {
    prepares++; const prepared = yield* original.evidence.prepare(context);
    return { *finish(context) { finishes++; return yield* prepared.finish(context); } };
  } } };
  const state = setup('source', {}, { fields: { title: 'source' }, evidence: observed });
  await state.call('add', { id: 'a', text: { title: 'red' } });
  for (const query of ['red', { kind: 'all' }, { kind: 'none' }]) await state.call('search', query);
  assert.equal(prepares, 0); assert.equal(finishes, 0); assert.deepEqual(Object.keys(state.engine.root.participants), ['source']);
  await state.call('search', 'red', request(['a'])); assert.equal(prepares, 1); assert.equal(finishes, 1); await state.call('dispose');
  const engine = createRaveldex({ schema, addons: [createSourceProvider({ fields: ['title'] }), original, createSnippetEvidence({ fields: { title: 'source' } })] });
  await engine.add({ id: 'a', text: { title: 'red' } });
  await assert.rejects(engine.search('red', { extensions: { 'match-evidence': { ids: ['a'] }, snippets: { ids: ['a'] } } }), typed('INVALID_OPTIONS'));
  assert.equal((await engine.search('red')).total, 1); await engine.dispose();
});

test('snippet source projection shares complete structural and range ceilings and never returns a partial overflow', async t => {
  const fields = { title: 'source' }, records = [{ id: 'a', text: { title: 'red red' } }, { id: 'b', text: { title: 'red' } }];
  const options = request(['a', 'b'], {}, 'snippets');
  const baseline = publicEngine('source', {}, { fields, snippets: true }); await baseline.addMany(records);
  const expected = await baseline.search('red', options), count = entries(data(expected, 'snippets')); await baseline.dispose();
  for (const [cap, passes] of [[count, true], [count - 1, false]]) {
    const engine = publicEngine('source', {}, { fields, snippets: true, factory: { maxOutputEntries: cap } }); await engine.addMany(records);
    if (passes) assert.deepEqual(await engine.search('red', options), expected);
    else { await assert.rejects(engine.search('red', options), typed('LIMIT_EXCEEDED')); assert.equal((await engine.search('red')).total, 2); }
    await engine.dispose();
  }
  const limited = publicEngine('source', {}, { fields, snippets: true, factory: { maxRanges: 2 } }); await limited.addMany(records);
  await limited.search('red', request(['a'], {}, 'snippets'));
  await assert.rejects(limited.search('red', options), typed('LIMIT_EXCEEDED')); assert.equal((await limited.search('red')).total, 2); await limited.dispose();
  t.diagnostic(JSON.stringify({ exactSnippetOutputEntries: count, completeCrossDocumentRangeCeiling: 3 }));
});
