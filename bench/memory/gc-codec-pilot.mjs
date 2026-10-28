// Stage this file and cost-fixture.mjs in the verified installed consumer.
// Execute with the separately calibrated GC-aware runtime, never stock Node.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';
import { recordsFor, schema, QUERY_ROWS, checkPage } from './cost-fixture.mjs';
const trace = createRequire(import.meta.url)('internal/test/binding').internalBinding('v8');
const directory = process.argv[2];
assert.ok(directory?.startsWith('/'));
const report = { schema: 'raveldex-gc-codec-pilot-v1', size: 1000, deadlineMs: 60000,
  runtime: { path: process.execPath, argv: process.execArgv, versions: process.versions, pid: process.pid },
  scope: 'New monitored managed occupied extents at mutator frontiers and reconciled GC boundaries. Includes host/harness work; excludes preexisting state, collector overlap, external backing and physical/process peaks.',
  operations: [], outcome: 'Running' };
const engine = createRaveldex({ schema, addons: [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })] });
let active = false;
try {
  let records = recordsFor(1000);
  for (let i = 0; i < records.length; i += 256) await engine.addMany(records.slice(i, i + 256), { deadlineMs: 60000 });
  report.before = [];
  for (const row of QUERY_ROWS) report.before.push(checkPage(await engine.search(row.query, { limit: 20, deadlineMs: 60000 }), records, row));
  assert.ok(report.before.every(row => row.revision === 4));
  records = undefined;
  const snapshots = createSnapshots(engine), file = join(directory, 'source-export-1000.rdxgc');
  global.gc();
  let encoded, failure;
  trace.managedAllocationTraceStart(file, 1000000, 128); active = true;
  try {
    trace.managedAllocationTraceMark(100);
    try { encoded = await snapshots.exportSource({ deadlineMs: 60000 }); }
    catch (error) { failure = error; }
    trace.managedAllocationTraceMark(101);
  } finally { report.traceStatus = trace.managedAllocationTraceStop(); active = false; }
  report.operations.push({ name: 'source-export', file, traceStatus: report.traceStatus,
    publicOutcome: failure ? 'Rejected' : 'Pass',
    error: failure ? { name: failure.name, code: failure.code, message: failure.message } : null });
  if (failure) assert.ok(['DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(failure.code));
  else {
    assert.equal(typeof encoded, 'string');
    writeFileSync(join(directory, 'encoded-source.json'), encoded, { flag: 'wx' });
    report.export = { codeUnits: encoded.length, encodedLengthIsNotMemory: true };
  }
  const expected = recordsFor(1000); report.after = [];
  for (const row of QUERY_ROWS) report.after.push(checkPage(await engine.search(row.query, { limit: 20, deadlineMs: 60000 }), expected, row));
  assert.deepEqual(report.after, report.before);
  report.outcome = report.traceStatus === 0 ? 'Public state preserved; guarded window recorded' : 'Public state preserved; invalid measurement retained';
} catch (error) { report.outcome = 'Fail'; report.error = { name: error.name, message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  if (active) report.emergencyStop = trace.managedAllocationTraceStop();
  try { await engine.dispose(); report.disposed = true; }
  catch (error) { report.cleanupError = error.message; process.exitCode = 1; }
  writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
