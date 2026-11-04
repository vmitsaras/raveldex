// Staged inside a real installed consumer. Only public package operations timed.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';

const [workloadURL, instrumentURL, harnessURL, rawSize, variant, mode, output, rawRotation] = process.argv.slice(2);
assert.ok(['baseline', 'candidate'].includes(variant)); assert.ok(['normal', 'diagnostic'].includes(mode));
const { workloadFor, verifyFrozen, schema } = await import(workloadURL), { collectDiagnostics } = await import(instrumentURL), { prefixQueries, PREFIX_METHOD } = await import(harnessURL);
const workload = verifyFrozen(workloadFor('adversarial', Number(rawSize))), queries = prefixQueries(workload);
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const report = { kind: 'rx8005-prefix-child-v1', pid: process.pid, variant, mode, rotation: Number(rawRotation), size: workload.size, identity: workload.identity, samples: [], observations: [], warmups: [],
  runtime: { node: process.version, versions: process.versions, execArgv: process.execArgv }, scope: 'Fresh Node direct source+source-phrase owner, real installed package. Normal query windows exclude warmups, imports, fixture generation, owner construction and result checking.' };
const errorData = error => ({ name: error.name, code: error.code ?? null, reason: error.reason ?? null, details: error.details ?? null, message: error.message });
function classify(error) { return !error ? 'Pass' : ['DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(error.code) ? 'Refused' : /UNKNOWN/.test(error.code ?? '') ? 'Unknown' : 'Rejected'; }
async function observe(operation, call, extra = {}) {
  const cpu = process.cpuUsage(), start = performance.now(); let result, error, counters;
  if (mode === 'diagnostic') ({ result, error, counters } = await collectDiagnostics(call)); else try { result = await call(); } catch (caught) { error = caught; }
  const wallMs = performance.now() - start, usage = process.cpuUsage(cpu), row = { operation, ...extra, outcome: classify(error), wallMs, cpuUserMs: usage.user / 1000, cpuSystemMs: usage.system / 1000,
    ...(error ? { error: errorData(error) } : {}), ...(counters ? { counters } : {}) };
  (mode === 'normal' ? report.samples : report.observations).push(row); return { result, error, row };
}
function verify(found, query, row) {
  if (found.result) {
    assert.equal(query.expectedError, undefined, 'declared expansion refusal unexpectedly succeeded'); const expected = new Set(query.expectedIds), result = found.result;
    assert.equal(result.completeness, 'complete'); assert.equal(result.model, 'raveldex-bm25-v1'); assert.equal(result.revision, Math.ceil(workload.size / 256)); assert.equal(result.total, expected.size);
    assert.equal(result.hits.length, Math.min(20, expected.size)); assert.equal(new Set(result.hits.map(hit => hit.id)).size, result.hits.length);
    for (const hit of result.hits) { assert.ok(expected.has(hit.id), query.id + ':' + hit.id); assert.ok(Number.isFinite(hit.score)); }
    row.result = result; row.resultSha256 = hash(result); row.expectedMembershipSha256 = hash(query.expectedIds);
  } else if (query.expectedError) {
    assert.equal(found.error.code, query.expectedError.code); assert.deepEqual(found.error.details, { path: query.expectedError.path, limit: 256, actual: 257 });
  } else throw found.error;
}
const engine = createRaveldex({ schema, addons: [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })] });
try {
  const built = await observe('build', async () => { let receipt; for (let offset = 0; offset < workload.size; offset += 256) receipt = await engine.addMany(workload.records.slice(offset, offset + 256), { deadlineMs: 60000 }); return { revision: receipt.revision, records: workload.size, admittedBatches: Math.ceil(workload.size / 256) }; });
  if (built.error) throw built.error; built.row.result = built.result;
  for (const query of queries) {
    if (mode === 'normal') for (let repetition = 0; repetition < PREFIX_METHOD.warmups; repetition++) {
      let result, error; try { result = await engine.search(query.query, { limit: 20, deadlineMs: 60000 }); } catch (caught) { error = caught; }
      const row = { operation: 'query:' + query.id, repetition, outcome: classify(error), ...(error ? { error: errorData(error) } : {}) }; report.warmups.push(row); verify({ result, error }, query, row);
    }
    for (let repetition = 0; repetition < (mode === 'normal' ? PREFIX_METHOD.samples : 1); repetition++) {
      const found = await observe('query:' + query.id, () => engine.search(query.query, { limit: 20, deadlineMs: 60000 }), { repetition }); verify(found, query, found.row);
    }
  }
  const first = workload.records[0], values = Array.isArray(first.text.body) ? first.text.body : [first.text.body];
  for (const [operation, record] of [['replace-new-term', { ...first, text: { body: [...values, 'n9mutationnewkey'] } }], ['replace-original', first]]) {
    const changed = await observe('mutation:' + operation, () => engine.replace(record, { deadlineMs: 60000 })); if (changed.error) throw changed.error; changed.row.result = changed.result;
  }
  report.outcome = 'Pass';
} catch (error) { report.outcome = 'Fail'; report.failure = errorData(error); throw error; }
finally { await engine.dispose(); report.packageMetadataSha256 = hash(await readFile(new URL('./node_modules/@vmitsaras/raveldex/package.json', import.meta.url))); await writeFile(output, JSON.stringify(report, null, 2) + '\n'); }
