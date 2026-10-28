// Fresh receiving process; stage beside cost-fixture.mjs in the packed consumer.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';
import { recordsFor, schema, QUERY_ROWS, checkPage } from './cost-fixture.mjs';
const trace = createRequire(import.meta.url)('internal/test/binding').internalBinding('v8');
const [directory, input, rawStreamMiB = '128'] = process.argv.slice(2);
const streamMiB = Number(rawStreamMiB);
assert.ok(directory?.startsWith('/') && input?.startsWith('/'));
assert.ok([128, 512].includes(streamMiB));
const encoded = readFileSync(input, 'utf8');
const engine = createRaveldex({ schema, addons: [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })] });
const report = { schema: 'raveldex-gc-codec-receiver-v2', size: 1000, input, streamMiB, deadlineMs: 60000,
  runtime: { path: process.execPath, argv: process.execArgv, versions: process.versions, pid: process.pid }, outcome: 'Running' };
let active = false;
try {
  await engine.add({ id: 'prior', text: { body: 'prior state' }, metadata: { group: 'prior' } }, { deadlineMs: 60000 });
  const prior = await engine.search({ kind: 'all' }, { deadlineMs: 60000 });
  assert.equal(prior.total, 1); assert.equal(prior.revision, 1);
  const snapshots = createSnapshots(engine), file = join(directory, 'source-restore-1000.rdxgc');
  global.gc(); let restored, failure;
  trace.managedAllocationTraceStart(file, 1000000, streamMiB); active = true;
  try {
    trace.managedAllocationTraceMark(100);
    try { restored = await snapshots.restore(encoded, { deadlineMs: 60000 }); }
    catch (error) { failure = error; }
    trace.managedAllocationTraceMark(101);
  } finally { report.traceStatus = trace.managedAllocationTraceStop(); active = false; }
  report.operation = { name: 'source-restore', file, traceStatus: report.traceStatus,
    publicOutcome: failure ? 'Rejected' : 'Pass', restored,
    error: failure ? { name: failure.name, code: failure.code, message: failure.message } : null };
  if (failure) {
    assert.ok(['DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(failure.code));
    assert.deepEqual(await engine.search({ kind: 'all' }, { deadlineMs: 60000 }), prior);
    report.priorStatePreserved = true;
  } else {
    assert.equal(restored.format, 'raveldex-source'); assert.equal(restored.reindexed, true);
    assert.equal(restored.originRevision, 4); assert.equal(restored.revision, 2);
    const records = recordsFor(1000); report.checks = [];
    for (const row of QUERY_ROWS) report.checks.push(checkPage(await engine.search(row.query, { limit: 20, deadlineMs: 60000 }), records, row));
    assert.ok(report.checks.every(row => row.revision === 2));
  }
  report.outcome = report.traceStatus === 0 ? 'Public state verified; guarded window recorded' : 'Public state verified; invalid measurement retained';
} catch (error) { report.outcome = 'Fail'; report.error = { name: error.name, message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  if (active) report.emergencyStop = trace.managedAllocationTraceStop();
  try { await engine.dispose(); report.disposed = true; }
  catch (error) { report.cleanupError = error.message; process.exitCode = 1; }
  writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
