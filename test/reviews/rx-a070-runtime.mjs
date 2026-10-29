import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRaveldex } from '../../dist/index.js';
import { createProximity } from '../../dist/addons/proximity/index.js';
import { createPositionProvider } from '../../dist/addons/positions/index.js';
import { createPositionPhrases } from '../../dist/addons/positions/phrases.js';
import { createSourceProvider } from '../../dist/addons/phrases/source.js';
import { createMatchEvidence } from '../../dist/addons/evidence/index.js';
import { executeSearch } from '../../dist/core/query/search.js';
import { DirectoryStage, emptyDirectory } from '../../dist/core/index/staging.js';
import { directoryGet } from '../../dist/core/index/directory.js';
import { setup as fake, drain } from '../addons/typo/helpers.mjs';
import { FakeSignal } from '../fixtures/execution/host.mjs';

// Deliberately excludes the review author's oracle, labels and evaluation tests.
const schema = { text: { title: { boost: 2 }, body: {} } }, fields = ['body', 'title'];
const q = (groups, maxGap = 0, selected) => ({ kind: 'extension', capability: 'proximity', version: 1, payload: { groups, maxGap, ...(selected ? { fields: selected } : {}) } });
const ids = result => result.hits.map(hit => hit.id).sort();
const config = (addon = createProximity({ fields }), extra = []) => ({ schema, addons: [createPositionProvider({ fields }), addon, ...extra] });
const rows = [];
async function probe(name, fn) {
  try { rows.push({ name, status: 'Pass', ...await fn() }); }
  catch (error) { rows.push({ name, status: 'Fail', code: error.code ?? null, message: error.message, stack: error.stack }); }
}

await probe('Seeded first-party runtime agrees with a separate exhaustive index-path search', async () => {
  let state = 0x7070abcd;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state >>> 12; };
  const alphabet = ['a', 'b', 'c'], records = Array.from({ length: 80 }, (_, index) => ({ id: `r${String(index).padStart(3, '0')}`, text: { title: Array.from({ length: next() % 12 }, () => alphabet[next() % 3]).join(' ') } }));
  const engine = createRaveldex(config(undefined, [createPositionPhrases({ fields })])); let comparisons = 0, phraseComparisons = 0;
  function expected(value, groups, gap) {
    const words = value ? value.split(' ') : [];
    function find(groupIndex, previous) {
      if (groupIndex === groups.length) return true;
      for (let position = previous + 1; position < words.length; position++) {
        if (previous >= 0 && position - previous - 1 > gap) break;
        if (groups[groupIndex].includes(words[position]) && find(groupIndex + 1, position)) return true;
      }
      return false;
    }
    return find(0, -1);
  }
  try {
    await engine.addMany(records);
    for (let index = 0; index < 100; index++) {
      const groups = Array.from({ length: 1 + next() % 5 }, () => Array.from({ length: 1 + next() % 3 }, () => alphabet[next() % 3])), gap = next() % 4;
      const actual = await engine.search(q(groups, gap), { limit: 100 });
      const wanted = records.filter(record => expected(record.text.title, groups, gap)).map(record => record.id).sort();
      assert.deepEqual(ids(actual), wanted); assert.equal(actual.total, wanted.length); assert.equal(actual.completeness, 'complete'); comparisons++;
      if (index < 20) {
        const singletons = groups.map(group => [group[0]]), actualZero = await engine.search(q(singletons, 0), { limit: 100 });
        const strict = await engine.search({ kind: 'extension', capability: 'phrases', version: 1, payload: { text: singletons.flat().join(' '), fields } }, { limit: 100 });
        assert.deepEqual(actualZero, strict); phraseComparisons++;
      }
    }
  } finally { await engine.dispose(); }
  return { seed: '0x7070abcd', finalState: state, documents: records.length, completeRandomQueries: comparisons, eligibilityPairs: records.length * comparisons, exactZeroGapPhraseComparisons: phraseComparisons, reference: 'Separate direct source word arrays and exhaustive increasing index recursion; no own oracle, production tokenizer or matcher used for expected results.' };
});

await probe('Later endpoints, repeated alternatives and pairwise slack have explicit original-source counterexamples', async () => {
  const records = [
    { id: 'late', text: { title: 'a b b x c' } }, { id: 'pair', text: { title: 'a x b x c' } }, { id: 'fail', text: { title: 'a b x x c' } },
    { id: 'one', text: { title: 'a' } }, { id: 'two', text: { title: 'a a' } }, { id: 'values', text: { title: ['a', 'b', 'c'] } }, { id: 'fields', text: { title: 'a', body: 'b c' } },
  ], engine = createRaveldex(config());
  try {
    await engine.addMany(records);
    assert.deepEqual(ids(await engine.search(q([['a'], ['b'], ['c']], 1))), ['late', 'pair']);
    assert.deepEqual(ids(await engine.search(q([['a', 'b'], ['a', 'b']], 0))), ['fail', 'late', 'two']);
    assert.deepEqual(ids(await engine.search(q([['a'], ['b'], ['c']], 32))), ['fail', 'late', 'pair']);
    const repeated = await engine.search(q([['a'], ['a']], 0)), ordinary = await engine.search('a', { limit: 100 });
    assert.deepEqual(ids(repeated), ['two']); assert.equal(repeated.hits[0].score, ordinary.hits.find(hit => hit.id === 'two').score);
    return { explicitCases: 4, boundariesNeverJoined: true, repeatedGroupScoredOnce: true };
  } finally { await engine.dispose(); }
});

await probe('Owned admission rejects option/group/maxGap/field accessors without invoking them', async () => {
  let reads = 0, refusals = 0;
  const getter = () => { reads++; return [['a']]; }, option = {};
  Object.defineProperty(option, 'fields', { enumerable: true, get: getter }); assert.throws(() => createProximity(option), { code: 'INVALID_OPTIONS' }); refusals++;
  const engine = createRaveldex(config());
  try {
    await engine.add({ id: 'a', text: { title: 'a b' } });
    for (const key of ['groups', 'maxGap', 'fields']) {
      const payload = { groups: [['a']], maxGap: 0 }; Object.defineProperty(payload, key, { enumerable: true, get: getter });
      await assert.rejects(engine.search({ kind: 'extension', capability: 'proximity', version: 1, payload }), { code: 'INVALID_QUERY' }); refusals++;
    }
    const alternatives = []; Object.defineProperty(alternatives, '0', { enumerable: true, get: getter }); alternatives.length = 1;
    await assert.rejects(engine.search(q([alternatives])), { code: 'INVALID_QUERY' }); refusals++;
  } finally { await engine.dispose(); }
  const fixture = fake(config()); await fixture.call('add', { id: 'a', text: { title: 'a b' } });
  const groups = [['a'], ['b']], query = q(groups, 1, ['title']), pending = fixture.engine.search(query);
  groups[0][0] = 'x'; query.payload.fields[0] = 'body'; query.payload.maxGap = 0; fixture.host.runReady();
  assert.deepEqual(ids(await pending), ['a']); assert.equal(reads, 0); await fixture.call('dispose');
  return { refusals, getterReads: reads, queuedNestedGroupsFieldsAndGapOwned: true };
});

await probe('Exact positions-only registration requirements reject broadened source/state dependencies', async () => {
  const native = createProximity({ fields: ['title'] }), providers = [createPositionProvider({ fields }), createSourceProvider({ fields })]; let refusals = 0;
  for (const extra of ['source:title', 'positions:body']) {
    const changed = { ...native, manifest: { ...native.manifest, requires: [...native.manifest.requires, { id: extra, contractVersion: 1 }] } };
    assert.throws(() => createRaveldex({ schema, addons: [...providers, changed] }), { code: 'INCOMPATIBLE_CAPABILITY' }); refusals++;
  }
  assert.throws(() => createRaveldex({ schema, addons: [native] }), { code: 'MISSING_CAPABILITY' }); refusals++;
  const changed = { ...native, manifest: { ...native.manifest, dataRequirements: { ...native.manifest.dataRequirements, source: true } } };
  assert.throws(() => createRaveldex({ schema, addons: [...providers, changed] }), { code: 'INCOMPATIBLE_CAPABILITY' }); refusals++;
  return { completeConfigurationRefusals: refusals, scope: 'Declared provider gates over trusted immutable participant roots; not a hostile-code sandbox or projection of every field inside a provider root.' };
});

await probe('Missing/stale provider headers and malformed later values fail whole qualification', async () => {
  const fixture = fake(config()); await fixture.call('add', { id: 'a', text: { title: ['a b', 'a b'], body: 'a b' } });
  const root = fixture.engine.root, positions = root.participants.positions;
  const withPositions = value => Object.freeze({ ...root, participants: Object.freeze({ ...root.participants, positions: value }) });
  let refusals = 0;
  for (const query of [q([['absent']]), { kind: 'and', children: [{ kind: 'none' }, q([['a']])] }, { kind: 'not', child: q([['a']]) }]) {
    assert.throws(() => drain(executeSearch(withPositions(Object.freeze({ ...positions, revision: root.revision + 1 })), query)), { code: 'REVISION_MISMATCH' }); refusals++;
  }
  assert.throws(() => drain(executeSearch(withPositions(Object.freeze({ ...positions, records: emptyDirectory() })), q([['a'], ['b']]))), { code: 'MISSING_CAPABILITY' }); refusals++;
  const record = directoryGet(positions.records, 'a'), values = record.positions.title, malformedTerms = Object.freeze(Object.assign(Object.create(null), values[1].terms, { b: Object.freeze([Object.freeze({ position: 1, positionLength: 2 })]) }));
  const malformed = Object.freeze({ ...record, positions: Object.freeze(Object.assign(Object.create(null), record.positions, { title: Object.freeze([values[0], Object.freeze({ ...values[1], terms: malformedTerms })]) })) });
  const stage = new DirectoryStage(positions.records, workUnits => ({ workUnits })); drain(stage.set('a', malformed));
  assert.throws(() => drain(executeSearch(withPositions(Object.freeze({ ...positions, records: drain(stage.finish()).value })), q([['a'], ['b']]))), { code: 'INCOMPATIBLE_CAPABILITY' }); refusals++;
  assert.equal(fixture.engine.root, root); await fixture.call('dispose');
  return { completeRefusals: refusals, earlierMatchingValueDidNotHideMalformedTail: true, sourceRootPreserved: true };
});

await probe('Canonical group ceilings preserve repeated zero-gap parity and every raw alternative consumes shared token admission', async () => {
  const engine = createRaveldex({ ...config(undefined, [createPositionPhrases({ fields })]), limits: { maxQueryGroups: 1, maxQueryTokens: 3 } }); let refusals = 0;
  try {
    await engine.add({ id: 'a', text: { title: 'a a' } });
    assert.deepEqual(await engine.search(q([['a'], ['a']])), await engine.search({ kind: 'extension', capability: 'phrases', version: 1, payload: { text: 'a a', fields } }));
    assert.equal((await engine.search(q([['a', 'A'], ['a']]))).total, 1);
    for (const query of [q([['a', 'A'], ['a', 'A']]), q([['a'], ['b']])]) { await assert.rejects(engine.search(query), { code: 'LIMIT_EXCEEDED' }); refusals++; }
    return { repeatedCanonicalGroupParity: true, normalizedDuplicateAlternativeParity: true, completeRefusals: refusals, staticFinding: 'Original raw-group admission cap included maxQueryGroups; parent corrected it before direct execution. No pre-repair runtime failure claimed.' };
  } finally { await engine.dispose(); }
});

await probe('One registration budget covers all duplicate and alias leaves without partial results', async () => {
  let used = 0;
  function* meter(cursor) { try { for (;;) { const step = cursor.next(); if (step.done) return step.value; used += step.value.workUnits; yield step.value; } } finally { try { cursor.return(undefined); } catch {} } }
  const native = createProximity({ fields }), instrumented = { ...native, refinement: { ...native.refinement, *prepare(context) { const prepared = yield* meter(native.refinement.prepare(context)); return { *test(id) { return yield* meter(prepared.test(id)); } }; } } };
  const first = createRaveldex(config(instrumented)), record = { id: 'a', text: { title: 'a x b' } };
  try { await first.add(record); used = 0; assert.equal((await first.search(q([['a'], ['b']], 1))).total, 1); } finally { await first.dispose(); }
  const cap = used, limited = createProximity({ fields, maxWorkUnits: cap }), aliased = { ...limited, manifest: { ...limited.manifest, provides: [...limited.manifest.provides, { id: 'nearAlias', contractVersion: 1 }] } }, second = createRaveldex(config(aliased));
  try {
    await second.add(record); assert.equal((await second.search(q([['a'], ['b']], 1))).total, 1);
    const left = q([['a'], ['b']], 1), right = q([['a'], ['b']], 1); right.capability = 'nearAlias';
    await assert.rejects(second.search({ kind: 'and', children: [left, right] }), { code: 'WORK_LIMIT_EXCEEDED' });
    return { exactSingleLeafModuleWork: cap, exactBudgetSingleLeafPass: true, aliasLeavesShareOneBudget: true, completeFailure: true };
  } finally { await second.dispose(); }
});

await probe('Reentrant silent cancellation wins before module overflow/invalid result and closes exact cursors', async () => {
  const observations = [];
  for (const phase of ['prepare-yield', 'prepare-return', 'test-yield', 'test-return']) {
    const signal = new FakeSignal(), native = createProximity({ fields }); let closed = 0;
    const modified = { ...native, manifest: { ...native.manifest, limits: { ...native.manifest.limits, maxWorkUnits: 1 } }, refinement: { ...native.refinement,
      *prepare() {
        try {
          if (phase.startsWith('prepare')) { signal.stop(false); if (phase === 'prepare-yield') yield { workUnits: 2 }; }
          return { *test() { try { signal.stop(false); if (phase === 'test-yield') yield { workUnits: 2 }; return 'invalid'; } finally { if (phase.startsWith('test')) closed++; } } };
        } finally { if (phase.startsWith('prepare')) closed++; }
      },
    } };
    const fixture = fake(config(modified)); await fixture.call('add', { id: 'a', text: { title: 'a b' } }); const before = fixture.engine.root;
    await assert.rejects(fixture.call('search', q([['a'], ['b']]), { signal }), { code: 'CANCELLED' });
    assert.equal(fixture.engine.root, before); assert.equal(signal.listenerCount, 0); assert.equal(fixture.host.pending, 0); assert.equal(closed, 1);
    observations.push({ phase, error: 'CANCELLED', closed, rootPreserved: true }); await fixture.call('dispose');
  }
  return { observations };
});

await probe('Token range evidence refuses proximity trees instead of inventing strict phrase spans', async () => {
  const engine = createRaveldex(config(undefined, [createSourceProvider({ fields }), createMatchEvidence({ fields: Object.fromEntries(fields.map(field => [field, 'source'])) })])); let refusals = 0;
  try {
    await engine.add({ id: 'a', text: { title: 'a x b' } });
    for (const query of [q([['a'], ['b']], 1), { kind: 'or', children: [{ kind: 'text', text: 'a' }, { kind: 'and', children: [{ kind: 'none' }, q([['a']], 0)] }] }, { kind: 'not', child: q([['absent']], 0) }]) {
      await assert.rejects(engine.search(query, { extensions: { evidence: { ids: [] } } }), { code: 'MISSING_CAPABILITY' }); refusals++;
    }
    assert.equal((await engine.search(q([['a'], ['b']], 1))).total, 1); return { completeProjectionRefusals: refusals, ordinaryProximitySearchStillPasses: true };
  } finally { await engine.dispose(); }
});

const paths = ['src/core/capabilities/types.ts', 'src/core/capabilities/registration.ts', 'src/core/capabilities/refinement.ts', 'src/core/contracts/query.ts', 'src/core/query/compile.ts', 'src/core/query/evaluate.ts', 'src/core/query/search.ts', 'src/addons/proximity/index.ts', 'src/addons/proximity/options.ts', 'src/addons/proximity/types.ts', 'src/addons/proximity/verifier.ts', 'src/addons/positions/verifier.ts', 'src/addons/positions/store.ts', 'src/addons/evidence/builder.ts'];
const bindings = [];
for (const source of paths) for (const path of [source, source.replace(/^src\//, 'dist/').replace(/\.ts$/, '.js')]) {
  const bytes = await readFile(new URL('../../' + path, import.meta.url)); bindings.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const failures = rows.filter(row => row.status === 'Fail'), report = {
  kind: 'raveldex-rx-a070-independent-runtime-review-v1', recordedAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, arch: process.arch },
  authorshipBoundary: 'Independent other-authored runtime/protocol review. Excludes own test/oracle/proximity.mjs, proximity fixture/labels and evaluation tests from independent assessment.',
  sourceBindings: bindings, observations: rows, passCount: rows.length - failures.length, failCount: failures.length,
  verdict: failures.length ? 'Changes required' : 'Ready with follow-ups', mandatoryFindings: failures,
  historicalAttempts: [{ path: 'docs/evidence/RX-A070-runtime-review-attempt1.json', category: 'review harness defect', outcome: 'Eight runtime probes passed. Evidence probe used an array for fields although its established API requires a provider strategy map; INVALID_OPTIONS occurred before this evidence runtime probe. Corrected the harness, without changing product behavior or expected outcome.' }],
  limitations: ['Direct finite current-Node execution only; package owner separately verifies packed/minified/workers/snapshots.', 'Trusted participant roots are not a hostile-code sandbox.', 'Logical work/entry bounds do not establish heap peaks, transport copies or latency.', 'No new browser, manual AT, remote CI, publication or broader language qualification.'],
};
await writeFile(new URL('../../docs/evidence/RX-A070-runtime-review.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passCount: report.passCount, failCount: report.failCount, verdict: report.verdict, observations: rows }, null, 2));
if (failures.length) process.exitCode = 1;
