// Staged inside a real installed consumer; only public package operations timed.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { createInspector } from '@vmitsaras/raveldex/addons/inspector';

const [workloadURL, instrumentURL, harnessURL, rawSize, variant, mode, output, rawRotation] = process.argv.slice(2);
assert.ok(['baseline', 'candidate'].includes(variant)); assert.ok(['normal', 'diagnostic'].includes(mode));
const { workloadFor, verifyFrozen, schema } = await import(workloadURL), { collectDiagnostics } = await import(instrumentURL), { rankingQueries, RANKING_METHOD } = await import(harnessURL);
const workload = verifyFrozen(workloadFor('adversarial', Number(rawSize))), queries = rankingQueries(workload);
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const report = { kind: 'rx8006-ranking-child-v1', pid: process.pid, variant, mode, rotation: Number(rawRotation), size: workload.size, identity: workload.identity, samples: [], observations: [], warmups: [],
  runtime: { node: process.version, versions: process.versions, execArgv: process.execArgv }, scope: 'Fresh installed Node direct source+source-phrase+Inspector owner. Normal windows exclude warmups, imports, fixture generation, owner construction and verification. No p95/heap/browser/worker claim.' };
const errorData = error => ({ name: error.name, code: error.code ?? null, reason: error.reason ?? null, details: error.details ?? null, message: error.message });
const resource = error => ['DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(error.code);
function classify(error) { return !error ? 'Pass' : resource(error) ? 'Refused' : /UNKNOWN/.test(error.code ?? '') ? 'Unknown' : 'Rejected'; }
async function observe(operation, call, extra = {}) {
  const cpu = process.cpuUsage(), start = performance.now(); let result, error, counters;
  if (mode === 'diagnostic') ({ result, error, counters } = await collectDiagnostics(call)); else try { result = await call(); } catch (caught) { error = caught; }
  const wallMs = performance.now() - start, usage = process.cpuUsage(cpu), row = { operation, ...extra, outcome: classify(error), wallMs, cpuUserMs: usage.user / 1000, cpuSystemMs: usage.system / 1000,
    ...(error ? { error: errorData(error) } : {}), ...(counters ? { counters } : {}) };
  (mode === 'normal' ? report.samples : report.observations).push(row); return { result, error, row };
}
function verify(found, query, row) {
  if (found.result) {
    assert.equal(query.expectedError, undefined, 'declared refusal unexpectedly succeeded'); const expected = new Set(query.expectedIds), result = found.result;
    assert.equal(result.completeness, 'complete'); assert.equal(result.model, 'raveldex-bm25-v1'); assert.equal(result.revision, Math.ceil(workload.size / 256)); assert.equal(result.total, expected.size);
    assert.equal(result.hits.length, Math.min(20, expected.size)); assert.equal(new Set(result.hits.map(hit => hit.id)).size, result.hits.length);
    for (const hit of result.hits) { assert.ok(expected.has(hit.id), query.id + ':' + hit.id); assert.ok(Number.isFinite(hit.score)); }
    if (query.id === 'inspector-common') {
      const inspector = result.extensions?.inspector; assert.equal(inspector.kind, 'raveldex-inspector-v1'); assert.equal(inspector.revision, result.revision);
      assert.equal(inspector.trace.revision, result.revision); assert.ok(inspector.trace.facts.some(fact => fact.kind === 'field'));
      const documents = new Map(inspector.documents.map(doc => [doc.id, doc]));
      for (const id of query.options.extensions.inspector.ids) { assert.ok(documents.has(id)); assert.equal(documents.get(id).eligibility, expected.has(id) ? 'matched' : 'absent'); }
      for (const fact of inspector.trace.facts.filter(fact => fact.kind === 'field')) {
        assert.equal(fact.N, workload.size); assert.equal(fact.df, workload.size);
        assert.equal(fact.avgLength, fact.totalLength / fact.N); assert.ok(Number.isFinite(fact.idf));
      }
    }
    row.result = result; row.resultSha256 = hash(result); row.expectedMembershipSha256 = hash(query.expectedIds);
  } else {
    assert.ok(found.error); if (query.expectedError) { assert.equal(found.error.code, query.expectedError.code); assert.equal(found.error.details?.path, query.expectedError.path); }
    else if (!resource(found.error)) throw found.error;
    row.expectedMembershipSha256 = hash(query.expectedIds);
  }
}
const engine = createRaveldex({ schema, addons: [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] }), createInspector()] });
try {
  const built = await observe('build', async () => { let receipt; for (let offset = 0; offset < workload.size; offset += 256) receipt = await engine.addMany(workload.records.slice(offset, offset + 256), { deadlineMs: 60000 }); return { receipt, records: workload.size, admittedBatches: Math.ceil(workload.size / 256) }; });
  if (built.error) throw built.error; built.row.result = built.result;
  for (const query of queries) {
    const options = { limit: 20, deadlineMs: 60000, ...query.options };
    if (mode === 'normal') for (let repetition = 0; repetition < RANKING_METHOD.warmups; repetition++) {
      let result, error; try { result = await engine.search(query.query, options); } catch (caught) { error = caught; }
      const row = { operation: 'query:' + query.id, repetition, outcome: classify(error), ...(error ? { error: errorData(error) } : {}) }; report.warmups.push(row); verify({ result, error }, query, row);
    }
    for (let repetition = 0; repetition < (mode === 'normal' ? RANKING_METHOD.samples : 1); repetition++) {
      const found = await observe('query:' + query.id, () => engine.search(query.query, options), { repetition }); verify(found, query, found.row);
    }
  }
  report.outcome = 'Pass';
} catch (error) { report.outcome = 'Fail'; report.failure = errorData(error); throw error; }
finally { await engine.dispose(); report.packageMetadataSha256 = hash(await readFile(new URL('./node_modules/@vmitsaras/raveldex/package.json', import.meta.url))); await writeFile(output, JSON.stringify(report, null, 2) + '\n'); }
