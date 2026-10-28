// Stage beside cost-fixture.mjs in a verified packed consumer. This is an
// explicit task-runtime experiment, not a default-runtime qualification.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { recordsFor, schema, QUERY_ROWS, checkPage } from './cost-fixture.mjs';
import { createSnapshotRaveldex, createSnapshots, currentNodeSnapshotEnvironment } from '@vmitsaras/raveldex/adapters/snapshots';

const [mode, rawSize, role, format, directory, input = '', rawStreamMiB = '512', runtimeSha256, rawExtentCap = '1000000'] = process.argv.slice(2);
const size = Number(rawSize), streamMiB = Number(rawStreamMiB), extentCap = Number(rawExtentCap);
assert.ok(['source-phrase', 'positions-offsets'].includes(mode));
assert.ok([1000, 10000].includes(size));
assert.ok(['producer', 'receiver'].includes(role));
assert.ok(['native', 'source'].includes(format) && (format !== 'source' || mode === 'source-phrase'));
assert.ok([512, 2048, 4096, 8192].includes(streamMiB));
assert.ok([1000000, 2000000].includes(extentCap));
assert.ok(directory?.startsWith('/') && (role !== 'receiver' || input.startsWith('/')));
assert.match(runtimeSha256, /^[a-f0-9]{64}$/);
const trace = createRequire(import.meta.url)('internal/test/binding').internalBinding('v8');
// The host verifies this digest against the executable before/after each run.
// This private no-OpenSSL runtime deliberately has no node:crypto module.
const qualification = { profileId: `rx4002-gc-${runtimeSha256.slice(0, 12)}-ascii-v2`, scope: 'exact-node-runtime',
  environment: currentNodeSnapshotEnvironment(), evidence: ['docs/evaluation/RX-4002-memory-method.md'] };
let addons;
if (mode === 'source-phrase') {
  const p = await import('@vmitsaras/raveldex/addons/phrases');
  addons = [p.createSourceProvider({ fields: ['body'] }), p.createSourcePhrases({ fields: ['body'] })];
} else {
  const p = await import('@vmitsaras/raveldex/addons/positions');
  const q = await import('@vmitsaras/raveldex/addons/phrases/positions');
  addons = [p.createPositionProvider({ fields: ['body'], offsets: ['body'] }), q.createPositionPhrases({ fields: ['body'] })];
}
const engine = createSnapshotRaveldex({ schema, addons }, { nativeQualification: qualification });
const report = { schema: 'raveldex-gc-codec-matrix-child-v1', mode, size, role, format, streamMiB, extentCap,
  deadlineMs: 60000, batchSize: 256, changedFixture: false, qualification,
  runtime: { path: process.execPath, sha256: runtimeSha256, argv: process.execArgv, versions: process.versions, pid: process.pid },
  scope: 'New monitored managed occupied extents at mutator frontiers/completed GC checkpoints; includes host/harness, excludes preexisting state, collector overlap, external/native backing and physical/process peaks.',
  outcome: 'Running', verification: [] };
let active = false;
const sanitize = e => ({ name: e.name, code: e.code ?? null, reason: e.reason ?? null, message: e.message });
async function verify(revision) {
  const records = recordsFor(size), result = await engine.search({ kind: 'all' }, { limit: 20, deadlineMs: 60000 });
  assert.equal(result.total, size); assert.equal(result.revision, revision); assert.equal(result.completeness, 'complete');
  assert.deepEqual(result.hits.map(x => x.id), records.slice(0, 20).map(x => x.id));
  const checks = [];
  for (const row of QUERY_ROWS) {
    const checked = checkPage(await engine.search(row.query, { limit: 20, deadlineMs: 60000 }), records, row);
    assert.equal(checked.revision, revision); checks.push({ name: row.name, ...checked });
  }
  report.verification.push({ revision, literalFirst20AllIds: true, total: result.total, checks,
    scope: 'Exact totals/revisions and eligible unique finite-score first pages; not a full ranking oracle.' });
}
try {
  let prior, encoded;
  if (role === 'producer') {
    let records = recordsFor(size);
    for (let i = 0; i < size; i += 256) await engine.addMany(records.slice(i, i + 256), { deadlineMs: 60000 });
    records = undefined; await verify(Math.ceil(size / 256));
  } else {
    encoded = readFileSync(input, 'utf8');
    await engine.add({ id: 'prior', text: { body: 'prior receiver state' }, metadata: { group: 'prior' } }, { deadlineMs: 60000 });
    prior = await engine.search({ kind: 'all' }, { limit: 20, deadlineMs: 60000 });
    assert.equal(prior.total, 1); assert.equal(prior.revision, 1);
  }
  const snapshots = createSnapshots(engine), name = `${role === 'producer' ? 'export' : 'restore'}-${format}`;
  const file = join(directory, `${name}.rdxgc`);
  let value, error;
  global.gc();
  trace.managedAllocationTraceStart(file, extentCap, streamMiB); active = true;
  try {
    trace.managedAllocationTraceMark(100);
    try {
      value = await (role === 'receiver' ? snapshots.restore(encoded, { deadlineMs: 60000 }) :
        format === 'native' ? snapshots.exportNative({ deadlineMs: 60000 }) : snapshots.exportSource({ deadlineMs: 60000 }));
    } catch (caught) { error = caught; }
    trace.managedAllocationTraceMark(101);
  } finally { report.traceStatus = trace.managedAllocationTraceStop(); active = false; }
  report.operation = { name, file, traceStatus: report.traceStatus, publicOutcome: error ? 'Rejected' : 'Pass', error: error ? sanitize(error) : null };
  if (error) assert.ok(['RaveldexError', 'SnapshotAdapterError'].includes(error.name) &&
    ['DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(error.code));
  if (role === 'producer') {
    if (!error) {
      assert.equal(typeof value, 'string'); const path = join(directory, 'encoded.json');
      writeFileSync(path, value, { flag: 'wx' });
      report.export = { path, codeUnits: value.length, utf8Bytes: Buffer.byteLength(value), encodedLengthsAreNotMemory: true };
    }
    await verify(Math.ceil(size / 256));
    assert.deepEqual(report.verification[1], report.verification[0]);
  } else if (error) {
    assert.deepEqual(await engine.search({ kind: 'all' }, { limit: 20, deadlineMs: 60000 }), prior);
    report.priorStatePreserved = true;
  } else {
    assert.equal(value.format, `raveldex-${format}`); assert.equal(value.reindexed, format === 'source');
    assert.equal(value.originRevision, Math.ceil(size / 256)); assert.equal(value.revision, 2);
    report.restore = value; await verify(2);
  }
  report.outcome = report.traceStatus === 0 ? 'Public state verified; guarded window recorded' : 'Public state verified; invalid measurement retained';
} catch (error) { report.outcome = 'Fail'; report.error = sanitize(error); report.stack = error.stack; process.exitCode = 1; }
finally {
  if (active) report.emergencyStop = trace.managedAllocationTraceStop();
  try { await engine.dispose(); report.disposed = true; }
  catch (error) { report.cleanupError = sanitize(error); process.exitCode = 1; }
  writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
