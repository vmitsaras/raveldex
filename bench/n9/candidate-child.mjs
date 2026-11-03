// Staged inside one real installed consumer. Only public package imports are timed.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';

const [workloadURL, instrumentURL, rawSize, variant, mode, output, rawRotation] = process.argv.slice(2);
assert.ok(['baseline', 'candidate'].includes(variant));
assert.ok(['normal', 'diagnostic'].includes(mode));
const { workloadFor, verifyFrozen, schema } = await import(workloadURL);
const { collectDiagnostics } = await import(instrumentURL);
const workload = verifyFrozen(workloadFor('adversarial', Number(rawSize)));
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const report = {
  kind: 'rx8003-node-candidate-child-v1', pid: process.pid, variant, mode, rotation: Number(rawRotation), family: workload.family, size: workload.size,
  identity: workload.identity, samples: [], observations: [],
  runtime: { node: process.version, versions: process.versions, execArgv: process.execArgv },
  scope: 'Node direct installed public exports, source+source phrases. One fresh process and owner; imports, fixture generation and owner construction precede timing.',
};
function errorData(error) { return { name: error.name, code: error.code ?? null, reason: error.reason ?? null, details: error.details ?? null, message: error.message }; }
async function observe(operation, call, extra = {}) {
  const cpu = process.cpuUsage(), start = performance.now(); let result, error, counters;
  if (mode === 'diagnostic') ({ result, error, counters } = await collectDiagnostics(call));
  else try { result = await call(); } catch (caught) { error = caught; }
  const wallMs = performance.now() - start, usage = process.cpuUsage(cpu);
  const row = { operation, ...extra, outcome: error ? ['DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(error.code) ? 'Refused' : /UNKNOWN/.test(error.code ?? '') ? 'Unknown' : 'Rejected' : 'Pass',
    wallMs, cpuUserMs: usage.user / 1000, cpuSystemMs: usage.system / 1000,
    ...(error ? { error: errorData(error) } : {}), ...(counters ? { counters } : {}) };
  (mode === 'diagnostic' ? report.observations : report.samples).push(row);
  return { result, error, row };
}
function verify(result, query, row) {
  assert.equal(query.expectedError, undefined, 'declared expansion refusal unexpectedly succeeded');
  const expected = new Set(query.expectedIds);
  assert.equal(result.completeness, 'complete'); assert.equal(result.model, 'raveldex-bm25-v1');
  assert.equal(result.revision, Math.ceil(workload.size / 256)); assert.equal(result.total, expected.size);
  assert.equal(result.hits.length, Math.min(20, expected.size));
  assert.equal(new Set(result.hits.map(hit => hit.id)).size, result.hits.length);
  for (const hit of result.hits) { assert.ok(expected.has(hit.id), query.id + ':' + hit.id); assert.ok(Number.isFinite(hit.score)); }
  row.result = result; row.resultSha256 = hash(result); row.expectedMembershipSha256 = hash(query.expectedIds);
}
const engine = createRaveldex({ schema, addons: [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })] });
try {
  const built = await observe('build', async () => {
    for (let offset = 0; offset < workload.records.length; offset += 256) await engine.addMany(workload.records.slice(offset, offset + 256), { deadlineMs: 60000 });
  });
  if (built.error) throw built.error;
  for (const query of workload.queries) for (let repeat = 0; repeat < (mode === 'normal' ? 2 : 1); repeat++) {
    const found = await observe('query:' + query.id, () => engine.search(query.query, { limit: 20, deadlineMs: 60000 }),
      { phase: repeat ? 'repeat-same-owner' : 'first-call-for-query' });
    if (found.result) verify(found.result, query, found.row);
    else if (query.expectedError) {
      assert.equal(found.error.code, query.expectedError.code);
      assert.equal(found.error.details?.path, query.expectedError.path);
    } else if (!['DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED'].includes(found.error.code)) throw found.error;
  }
  report.outcome = 'Pass';
} catch (error) { report.outcome = 'Fail'; report.failure = errorData(error); throw error; }
finally {
  await engine.dispose();
  report.packageMetadataSha256 = hash(await readFile(new URL('./node_modules/@vmitsaras/raveldex/package.json', import.meta.url)));
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
