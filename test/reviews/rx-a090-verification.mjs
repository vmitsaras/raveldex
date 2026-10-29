/** Runtime author's independent review of OTHER-authored verification artifacts.
 * No production patch/capture/composition/tokenizer/scorer is imported. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PATCH_SCHEMA, patchRecords, patchPairs, patchQueries, invalidPatchCases } from '../fixtures/mutations/patch.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../oracle/phrases.mjs';

const sha = value => createHash('sha256').update(value).digest('hex'), rows = [];
const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const near = (a, b) => assert.ok(Math.abs(a - b) <= Math.max(1e-12, Math.abs(b) * 1e-12), `${a} != ${b}`);
async function probe(name, run) { const start = Date.now(), details = await run(); rows.push({ name, status: 'Pass', elapsedMs: Date.now() - start, ...details }); }

// Separate scalar-by-scalar character scan, rather than the oracle's whole-word
// regular expression or any production analysis helper.
function tokens(value) {
  const result = []; let word = '';
  for (const point of value) {
    if (/[\p{L}\p{N}]/u.test(point) || word && /\p{M}/u.test(point)) word += point;
    else if (word) { result.push(word.normalize('NFKC').toLowerCase()); word = ''; }
  }
  if (word) result.push(word.normalize('NFKC').toLowerCase());
  return result;
}
function canonical(record) {
  return { id: record.id, text: Object.fromEntries(Object.entries(record.text).map(([field, value]) => [field, typeof value === 'string' ? [value] : [...value]])),
    metadata: Object.fromEntries(Object.entries(record.metadata ?? {}).map(([field, value]) => [field, Array.isArray(value) ? [...new Set(value)] : value === 0 ? 0 : value])) };
}
/** Resolve each final field from its independent presence equation. This never
 * calls production patch code or mutates the original/expected fixture. */
function resolveFields(previous, request, namespace) {
  const before = previous[namespace] ?? {}, set = request.set?.[namespace] ?? {}, removed = new Set(request.unset?.[namespace] ?? []);
  return Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(set)])].filter(field => !removed.has(field)).map(field => [field, Object.hasOwn(set, field) ? set[field] : before[field]]));
}
function independentModel(records, schema) {
  const fields = Object.keys(schema.text).sort(ordinal), documents = records.map(record => ({ id: record.id, metadata: record.metadata ?? {}, fields: Object.fromEntries(fields.map(field => {
    const raw = record.text[field], values = raw === undefined ? [] : typeof raw === 'string' ? [raw] : raw, byValue = values.map(tokens);
    return [field, { byValue, flat: byValue.flat() }];
  })) }));
  const statistics = Object.fromEntries(fields.map(field => {
    const present = documents.filter(document => document.fields[field].flat.length > 0), terms = [...new Set(present.flatMap(document => document.fields[field].flat))].sort(ordinal);
    return [field, { population: present.length, length: present.reduce((sum, document) => sum + document.fields[field].flat.length, 0), boost: schema.text[field].boost ?? 1, terms,
      df: Object.fromEntries(terms.map(term => [term, present.filter(document => document.fields[field].flat.includes(term)).length])) }];
  }));
  return { fields, documents, statistics };
}
function independentResult(model, input, page = {}) {
  function group(fields, alternatives) {
    const names = [...fields].sort(ordinal), values = [...new Map(alternatives.map(value => [JSON.stringify([value.term, value.match, value.weight]), value])).entries()].sort(([a], [b]) => ordinal(a, b)).map(([, value]) => value);
    return { fields: names, alternatives: values, identity: JSON.stringify([names, values]) };
  }
  const exact = (terms, fields) => terms.map(term => group(fields, [{ term, match: 'exact', weight: 1 }]));
  const eligible = (value, document) => value.fields.some(field => document.fields[field].flat.some(term => value.alternatives.some(variant => variant.match === 'exact' ? variant.term === term : term.startsWith(variant.term))));
  function participate(raw, document) {
    const query = typeof raw === 'string' ? { kind: 'text', text: raw } : raw;
    if (query.kind === 'all' || query.kind === 'none') return { matched: query.kind === 'all', groups: [] };
    if (query.kind === 'eq') { const value = document.metadata[query.field]; return { matched: Object.hasOwn(document.metadata, query.field) && (Array.isArray(value) ? value.includes(query.value) : value === query.value), groups: [] }; }
    if (query.kind === 'not') return { matched: !participate(query.child, document).matched, groups: [] };
    if (query.kind === 'text') {
      const groups = exact(tokens(query.text), query.fields ?? model.fields), matched = groups.length > 0 && (query.operator === 'or' ? groups.some(value => eligible(value, document)) : groups.every(value => eligible(value, document)));
      return { matched, groups: matched ? groups.filter(value => eligible(value, document)) : [] };
    }
    if (query.kind === 'group') { const value = group(query.fields ?? model.fields, query.variants.map(variant => ({ term: tokens(variant.text)[0], match: variant.match, weight: variant.weight ?? 1 }))), matched = eligible(value, document); return { matched, groups: matched ? [value] : [] }; }
    if (query.kind === 'phrase') {
      const terms = tokens(query.text), fields = query.fields ?? model.fields, matched = terms.length > 0 && fields.some(field => document.fields[field].byValue.some(value => value.some((_, at) => terms.every((term, offset) => value[at + offset] === term))));
      return { matched, groups: matched ? exact(terms, fields) : [] };
    }
    assert.ok(query.kind === 'and' || query.kind === 'or');
    const children = query.children.map(child => participate(child, document)), matched = query.kind === 'and' ? children.every(value => value.matched) : children.some(value => value.matched);
    return { matched, groups: matched ? children.filter(value => value.matched).flatMap(value => value.groups) : [] };
  }
  function score(group, document) {
    let total = 0;
    for (const field of group.fields) {
      const stat = model.statistics[field], values = document.fields[field].flat; let best = 0;
      for (const term of stat.terms) {
        const variants = group.alternatives.filter(variant => variant.match === 'exact' ? variant.term === term : term.startsWith(variant.term));
        const frequency = values.filter(value => value === term).length;
        if (!variants.length || !frequency) continue;
        const idf = Math.log(1 + (stat.population - stat.df[term] + 0.5) / (stat.df[term] + 0.5));
        const part = (2.2 * frequency) / (frequency + 1.2 * (0.25 + 0.75 * values.length / (stat.length / stat.population)));
        best = Math.max(best, stat.boost * idf * part * Math.max(...variants.map(value => value.weight)));
      }
      total += best;
    }
    return total;
  }
  const hits = [];
  for (const document of model.documents) {
    const result = participate(input, document); if (!result.matched) continue;
    const groups = [...new Map(result.groups.map(value => [value.identity, value])).entries()].sort(([a], [b]) => ordinal(a, b));
    hits.push({ id: document.id, score: groups.reduce((sum, [, value]) => sum + score(value, document), 0) });
  }
  hits.sort((a, b) => b.score - a.score || ordinal(a.id, b.id));
  const offset = page.offset ?? 0;
  return { total: hits.length, hits: hits.slice(offset, offset + (page.limit ?? 20)) };
}
function same(actual, expected) { assert.equal(actual.total, expected.total); assert.deepEqual(actual.hits.map(value => value.id), expected.hits.map(value => value.id)); for (let index = 0; index < actual.hits.length; index++) near(actual.hits[index].score, expected.hits[index].score); }

const paths = ['test/fixtures/mutations/patch.mjs', 'test/addons/patch/evaluation.test.mjs', 'test/addons/patch/lifecycle.test.mjs', 'test/addons/patch/package.test.mjs', 'test/measurements/patch-package.mjs', 'test/oracle/query.mjs', 'test/oracle/phrases.mjs', 'test/fixtures/execution/host.mjs', 'docs/specs/RECORD_PATCH.md', 'docs/api/RECORD_PATCH.md', 'test/measurements/query-syntax-package.mjs', 'test/addons/query-syntax/package.test.mjs'];
const bindings = [];
for (const path of paths) { const bytes = await readFile(path); bindings.push({ path, bytes: bytes.length, sha256: sha(bytes) }); }
let failure;
try {
  await probe('Handwritten full records satisfy independent per-field presence equations and canonical source preservation', () => {
    const records = new Map(patchRecords.map(record => [record.id, canonical(record)]));
    for (const pair of patchPairs) {
      const old = records.get(pair.request.id), reconstructed = canonical({ id: old.id, text: resolveFields(old, pair.request, 'text'), metadata: resolveFields(old, pair.request, 'metadata') });
      assert.deepEqual(reconstructed, canonical(pair.replacement), pair.name); records.set(reconstructed.id, reconstructed);
    }
    assert.equal(patchPairs.length, 12); assert.equal(patchQueries.length, 18); assert.equal(invalidPatchCases.length, 12);
    assert.deepEqual(records.get('a'), { id: 'a', text: {}, metadata: {} }); assert.deepEqual(records.get('empty'), { id: 'empty', text: { body: [] }, metadata: { kind: null, tags: [null] } });
    return { handwrittenPairs: 12, independentlyReconstructedCompleteRecords: 12, finalDocuments: records.size, retainedEmptyAndMissingDistinctions: true };
  });
  await probe('Separate character/window scanner and native paper arithmetic validate every fixture-state query page against the source oracle', () => {
    const records = new Map(patchRecords.map(record => [record.id, structuredClone(record)])); let comparisons = 0;
    for (const pair of patchPairs) {
      records.set(pair.replacement.id, structuredClone(pair.replacement)); const values = [...records.values()], separate = independentModel(values, PATCH_SCHEMA), reference = scanPhraseSourceCorpus(values, PATCH_SCHEMA);
      for (const query of patchQueries) for (const page of [{ limit: 100 }, { limit: 0 }, { offset: 1, limit: 2 }]) { same(sourcePhraseQueryResult(reference, query, page), independentResult(separate, query, page)); comparisons++; }
    }
    assert.equal(comparisons, 648);
    return { fixtureStates: 12, queriesPerState: 18, pagesPerQuery: 3, independentCompleteNumericalComparisons: comparisons, productionTokenizerScorerImported: false };
  });
  await probe('Declared evaluation counts and adversarial field coverage follow the actual test loops', async () => {
    const source = await readFile('test/addons/patch/evaluation.test.mjs', 'utf8');
    assert.match(source, /committed, 36/); assert.match(source, /snapshots, 72/); assert.match(source, /comparisons, 1944/);
    assert.equal(12 * 3 * 18 * 3, 1944); assert.equal(12 * 3 * 2, 72);
    for (const row of invalidPatchCases) assert.equal(row.code, 'INVALID_RECORD');
    assert.match(source, /comparisons, 48/); assert.match(source, /facts, 5/); assert.match(source, /comparisons, 6/); assert.match(source, /comparisons, 7/); assert.match(source, /judgments.length, 76/);
    for (const path of ['test/oracle/query.mjs', 'test/oracle/phrases.mjs']) assert.doesNotMatch(await readFile(path, 'utf8'), /from\s+['"][^'"]*(?:dist|src)\//);
    return { actualPrimaryCombinations: 1944, exactSourceSnapshots: 72, replacementCommits: 36, invalidRollbackComparisons: 48, handDerivedFieldFacts: 5, originalRanges: 6, selectedAnalyzerComparisons: 7, unchangedOrdinaryJudgments: 76, counterScope: 'Primary comparisons include repeated executions across three representations, not distinct query forms.' };
  });
  await probe('Five independent hand-derived BM25 field facts reflect token-bearing document populations and native replacement statistics', () => {
    const states = [[{ id: 'a', text: { title: 'red red' } }, { id: 'b', text: { title: 'red blue' } }, { id: 'c', text: { title: 'blue' } }], [{ id: 'a', text: { title: 'red' } }, { id: 'b', text: { title: 'red blue' } }, { id: 'c', text: { title: 'blue' } }], [{ id: 'a', text: {} }, { id: 'b', text: { title: 'red blue' } }, { id: 'c', text: { title: 'blue' } }]];
    const expected = [{ N: 3, df: 2, total: 5, ids: ['a', 'b'] }, { N: 3, df: 2, total: 4, ids: ['a', 'b'] }, { N: 2, df: 1, total: 3, ids: ['b'] }]; let facts = 0;
    for (let index = 0; index < states.length; index++) { const model = independentModel(states[index], { text: { title: { boost: 2 } } }), stat = model.statistics.title, result = independentResult(model, 'red', { limit: 100 }); assert.deepEqual([stat.population, stat.df.red, stat.length], [expected[index].N, expected[index].df, expected[index].total]); assert.deepEqual(result.hits.map(value => value.id).sort(), expected[index].ids); for (const hit of result.hits) { assert.ok(hit.score > 0); facts++; } }
    assert.equal(facts, 5); return { fieldFacts: facts, populations: [3, 3, 2], distinction: 'Removing text leaves the record but removes it from this field population.' };
  });
  await probe('Parent-authored lifecycle suite actually replays every observed suspension, nested cleanup, complete work refusal and three corpus sizes', () => {
    const output = execFileSync(process.execPath, ['--test', '--test-timeout=120000', 'test/addons/patch/lifecycle.test.mjs'], { encoding: 'utf8' });
    assert.match(output, /(?:ℹ|#) pass 7\b/); assert.match(output, /(?:ℹ|#) fail 0\b/);
    const objects = output.split('\n').flatMap(line => { const at = line.indexOf('{'); if (at < 0) return []; try { return [JSON.parse(line.slice(at))]; } catch { return []; } });
    const stops = objects.find(value => Object.hasOwn(value, 'observedSuspensions')), work = objects.find(value => Object.hasOwn(value, 'fullPatchYieldedWorkUnits')), sizes = objects.find(value => Array.isArray(value.rows));
    assert.deepEqual(stops, { observedSuspensions: 149, cancellationsWithExactRollbackAndRecovery: 149 }); assert.equal(work.fullPatchYieldedWorkUnits, 563); assert.equal(work.failingCompleteCap, 562); assert.equal(work.participantInitializations, 1);
    assert.deepEqual(sizes.rows.map(value => value.records), [100, 1000, 10000]); assert.ok(sizes.rows.every(value => value.replacementRecords === 1 && value.unchangedDocumentBuckets > 0));
    const source = execFileSync(process.execPath, ['--input-type=module', '--eval', "import{readFileSync}from'node:fs';process.stdout.write(readFileSync('test/addons/patch/lifecycle.test.mjs','utf8'))"], { encoding: 'utf8' });
    assert.ok(source.indexOf('rows.push({ records: count') < source.indexOf("s.run('search', 'blue', { limit: 0 })"));
    return { actualCommand: 'node --test --test-timeout=120000 test/addons/patch/lifecycle.test.mjs', pass: 7, ...stops, completeWork: work, rows: sizes.rows, scope: 'Replay of independently parent-authored tests. Runtime author does not issue an independent verdict on their own implementation.' };
  });
  await probe('Other-authored evaluation suite actually replays source/native arithmetic, metadata/facets, analyzer parity and untouched regressions', () => {
    const output = execFileSync(process.execPath, ['--test', '--test-timeout=120000', 'test/addons/patch/evaluation.test.mjs'], { encoding: 'utf8' });
    assert.match(output, /(?:ℹ|#) pass 7\b/); assert.match(output, /(?:ℹ|#) fail 0\b/); assert.match(output, /"completePatchedReplacementIndependentSourceComparisons":1944/); assert.match(output, /"exactSourceSnapshots":72/); assert.match(output, /"handDerivedFieldFacts":5/);
    return { actualCommand: 'node --test --test-timeout=120000 test/addons/patch/evaluation.test.mjs', pass: 7, scope: 'Replay plus separately reconstructed expected data and arithmetic above; not a second independent production implementation review.' };
  });
  await probe('Actual installed/minified consumer report measures the direct boundary, existing worker replacement and separate graph costs', async () => {
    const reportPath = process.argv[2] ?? '/tmp/raveldex-rx-a090-package-initial.json', bytes = await readFile(reportPath), report = JSON.parse(bytes), baseline = JSON.parse(await readFile('docs/evidence/RX-A080-package.json'));
    assert.deepEqual(report.correctness, { status: 'Pass', fullReplacementCasesPerRun: 5, completeComparisonsPerRun: 120, minifiedParity: 'Pass', typedRefusalsPerRun: 4 });
    assert.equal(report.packed.rows.length, 5); assert.deepEqual(report.packed.rows.map(value => value.revision), [2, 3, 4, 5, 6]); assert.deepEqual(report.packed.failures, ['REVISION_MISMATCH', 'INVALID_RECORD', 'MISSING_CAPABILITY', 'MISSING_CAPABILITY']);
    assert.equal(report.package.private, true); assert.equal(report.worker.code, 'MISSING_CAPABILITY'); assert.equal(report.worker.ordinaryWorkerReplacement, 'Pass'); assert.match(report.worker.transport, /Actual Node worker_threads/);
    assert.equal(report.snapshots.format, 'source'); assert.equal(report.snapshots.restoredRevision, 1); assert.equal(report.snapshots.patchRevision, 2);
    assert.equal(report.coreDelta.minifiedBytes, report.core.minifiedBytes - baseline.core.minifiedBytes); assert.equal(report.coreDelta.gzipBytes, report.core.gzipBytes - baseline.core.gzipBytes);
    assert.ok(report.core.inputs.every(value => !value.path.includes('/addons/patch/'))); assert.ok(report.patchOnly.inputs.some(value => value.path.includes('/addons/patch/'))); assert.ok(report.patchOnly.inputs.every(value => !value.path.includes('/adapters/'))); assert.ok(report.startup.every(value => value.reads.length === 0));
    const document = await readFile('docs/api/RECORD_PATCH.md', 'utf8'), example = /```js\n([\s\S]*?)\n```/.exec(document)?.[1]; assert.equal(sha(example), report.documentation.exampleSha256); assert.equal(report.documentation.stdout, '2 1 guide\n');
    return { actualReport: reportPath, reportSha256: sha(bytes), packageSha256: report.package.sha256, installedMinifiedCompleteComparisonsPerRun: 120, directSourceRestoredRevision: 1, workerPatchSupported: false, ordinaryWorkerReplacement: 'Pass', coreDelta: report.coreDelta, documentedExampleSha256: sha(example), scope: 'Actual initial parent-executed installed report. Final candidate byte-current audit remains separate; graphs overlap and are not summable heap/copy peaks.' };
  });
  await probe('Query syntax isolation regression compares equal current-runtime bundles and actually replays installed syntax consumers', async () => {
    const source = await readFile('test/measurements/query-syntax-package.mjs', 'utf8'), assertions = await readFile('test/addons/query-syntax/package.test.mjs', 'utf8');
    assert.match(source, /unselectedSyntax=await graph/); assert.match(source, /for\(const key of \['minifiedBytes','gzipBytes','sha256','gzipSha256'\]\)assert.equal\(unselectedSyntax\[key\],core\[key\]/);
    assert.match(source, /import \{ createQuerySyntax \} from '@vmitsaras\/raveldex\/addons\/query-syntax'/); assert.match(assertions, /report.coreIsolation.status,'Pass'/);
    assert.doesNotMatch(source, /RX-A070-package\.json/);
    const output = execFileSync(process.execPath, ['--test', '--test-timeout=120000', 'test/addons/query-syntax/package.test.mjs'], { encoding: 'utf8' });
    assert.match(output, /(?:ℹ|#) pass 4\b/); assert.match(output, /(?:ℹ|#) fail 0\b/);
    return { actualCommand: 'node --test --test-timeout=120000 test/addons/query-syntax/package.test.mjs', pass: 4, comparison: 'Same runtime, same root exports and bundle options, with and without an unused optional syntax import; bytes and SHA identities must all agree.', scope: 'Historical RX-A080 unchanged-core evidence remains historical. Current private owner seam cost is separately measured.' };
  });
} catch (error) { failure = { name: error.name, message: error.message, stack: error.stack }; }
let unchanged = 0;
for (const binding of bindings) { assert.equal(sha(await readFile(binding.path)), binding.sha256, binding.path); unchanged++; }
const report = { kind: 'raveldex-rx-a090-verification-review-v1', recordedAt: new Date().toISOString(), status: failure ? 'Fail' : 'Pass', verdict: failure ? 'Changes required' : 'Ready with follow-ups', mandatoryFindings: failure ? [failure] : [], authorshipBoundary: 'Independent review of other-authored full-record fixtures, evaluation/oracle, parent lifecycle suite and package helper/report. This author implemented patch runtime, private owner seam and contract tests; those are excluded from this independent verdict.', probes: rows, passCount: rows.length, sourceBindings: bindings, bindingAudit: { status: 'Pass', unchanged }, failure, limitations: ['No independent self-review verdict on patch runtime/private seam/contract tests.', 'Primary1944 comparisons are repeated complete executions across three representations; independent648 reference pages are additional review executions, not new project-test count.', 'Packed artifact audit is scoped to the actual initial report and documented example; final artifact/current-tree binding remains separate.', 'Logical work, immutable bucket sharing and overlapping graph bytes are not memory/copy peaks or constant update cost.', 'No remote CI, publication, native browser/manual AT, physical input or heap qualification.'] };
await writeFile('docs/evidence/RX-A090-verification-review.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, passCount: rows.length, bindingAudit: report.bindingAudit, failure }));
if (failure) process.exitCode = 1;
