// Staged inside a real installed consumer; public package imports resolve there.
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';
const [workloadURL, instrumentURL, family, rawSize, mode, output, rawRotation] = process.argv.slice(2);
const { workloadFor, verifyFrozen, schema } = await import(workloadURL);
const { collectDiagnostics } = await import(instrumentURL);
const workload = verifyFrozen(workloadFor(family, Number(rawSize)));
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const report = { kind: 'rx8002-node-direct-source-v1', pid: process.pid, mode, rotation: Number(rawRotation), family, size: workload.size,
  identity: workload.identity, samples: [], observations: [], runtime: { node: process.version, versions: process.versions, execArgv: process.execArgv },
  scope: 'Node direct, installed public exports, source+source phrases; fresh process/owner. Not core-only, browser, worker or installed UI.' };
const make = () => createRaveldex({ schema, addons: [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })] });
function errorData(error) { return { name: error.name, code: error.code ?? null, reason: error.reason ?? null, details: error.details ?? null, message: error.message }; }
async function observe(operation, call, extra = {}) {
  // No expected-match checking, JSON serialization or hashes inside timed window.
  const cpu = process.cpuUsage(), start = performance.now(); let result, error, counters;
  if (mode === 'diagnostic') ({ result, error, counters } = await collectDiagnostics(call));
  else try { result = await call(); } catch (caught) { error = caught; }
  const wallMs = performance.now() - start, usage = process.cpuUsage(cpu);
  const row = { operation, ...extra, outcome: error ? (/UNKNOWN/.test(error.code ?? '') ? 'Unknown' : ['DEADLINE_EXCEEDED','WORK_LIMIT_EXCEEDED','LIMIT_EXCEEDED','EXPANSION_LIMIT_EXCEEDED','RESOURCE_EXHAUSTED'].includes(error.code) ? 'Refused' : 'Rejected') : 'Pass',
    wallMs, cpuUserMs: usage.user / 1000, cpuSystemMs: usage.system / 1000, ...(error ? { error: errorData(error) } : {}), ...(counters ? { counters } : {}) };
  (mode === 'diagnostic' ? report.observations : report.samples).push(row);
  return { result, error, row };
}
function verify(result, query, row) {
  if (query.expectedError) { assert.fail(`expected ${JSON.stringify(query.expectedError)} for ${query.id}`); }
  const expected = new Set(query.expectedIds);
  assert.equal(result.completeness, 'complete'); assert.equal(result.total, expected.size);
  assert.equal(result.hits.length, Math.min(20, expected.size));
  assert.equal(new Set(result.hits.map(hit => hit.id)).size, result.hits.length);
  for (const hit of result.hits) { assert.ok(expected.has(hit.id), query.id + ':' + hit.id); assert.ok(Number.isFinite(hit.score)); }
  row.result = result; row.resultSha256 = hash(result); row.expectedMembershipSha256 = hash(query.expectedIds);
}
const engine = make();
try {
  const built = await observe('build', async () => { for (let offset = 0; offset < workload.records.length; offset += 256) await engine.addMany(workload.records.slice(offset, offset + 256), { deadlineMs: 60000 }); });
  if (built.error) throw built.error;
  else {
    for (const query of workload.queries) for (let repeat = 0; repeat < (mode === 'normal' ? 2 : 1); repeat++) {
      const found = await observe('query:' + query.id, () => engine.search(query.query, { limit: 20, deadlineMs: 60000 }), { phase: repeat ? 'repeat-same-owner' : 'first-call-for-query' });
      if (found.result) verify(found.result, query, found.row);
      else if (query.expectedError) { assert.equal(found.error.code, query.expectedError.code ?? query.expectedError); if (query.expectedError.path) assert.equal(found.error.details?.path, query.expectedError.path); }
      else if (!['DEADLINE_EXCEEDED','WORK_LIMIT_EXCEEDED'].includes(found.error.code)) throw found.error;
    }
    // Recovery is measured separately from export and public postcondition checks.
    const encoded = await observe('exportSource', () => createSnapshots(engine).exportSource({ deadlineMs: 60000 }));
    if (encoded.result) {
      encoded.row.snapshotHeader = JSON.parse(encoded.result).body.header;
      encoded.row.encodedBytes = Buffer.byteLength(encoded.result); encoded.row.encodedSha256 = hash(encoded.result);
      const receiver = make();
      try {
        await receiver.add({ id: 'prior', text: { body: 'prior state' }, metadata: { group: 'prior' } });
        const prior = await receiver.search({ kind: 'all' }, { limit: 20 });
        const restored = await observe('restoreSource', () => createSnapshots(receiver).restore(encoded.result, { deadlineMs: 60000 }));
        if (restored.error) {
          if (!['DEADLINE_EXCEEDED','WORK_LIMIT_EXCEEDED','LIMIT_EXCEEDED','RESOURCE_EXHAUSTED'].includes(restored.error.code)) throw restored.error;
          assert.deepEqual(await receiver.search({ kind: 'all' }, { limit: 20 }), prior);
          restored.row.oldStatePreserved = true;
        } else {
          assert.equal(restored.result.revision, 2); restored.row.result = restored.result;
          const all = await receiver.search({ kind: 'all' }, { limit: 20, deadlineMs: 60000 });
          assert.equal(all.total, workload.size); assert.equal(all.revision, 2); restored.row.postcondition = all;
        }
      } finally { await receiver.dispose(); }
    } else {
      if (!['DEADLINE_EXCEEDED','WORK_LIMIT_EXCEEDED','LIMIT_EXCEEDED','RESOURCE_EXHAUSTED'].includes(encoded.error.code)) throw encoded.error;
      report.recoveryNotRun = 'Source export refused';
    }
    const deadline = await observe('deadline-probe', () => engine.search({ kind: 'all' }, { deadlineMs: 1 }));
    if (deadline.error) assert.equal(deadline.error.code, 'DEADLINE_EXCEEDED');
    deadline.row.probe = 'One millisecond deadline, actual outcome retained; small searches may finish before expiry.';
    const abort = new AbortController(); abort.abort();
    const cancelled = await observe('cancelled-admission', () => engine.search('common', { signal: abort.signal }));
    assert.equal(cancelled.error?.code, 'CANCELLED');
  }
} finally { await engine.dispose(); }
report.packageMetadataSha256 = hash(await readFile(new URL('./node_modules/@vmitsaras/raveldex/package.json', import.meta.url)));
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
