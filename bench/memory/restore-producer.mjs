// Staged into a fresh installed consumer by restore-run.mjs. Preparation only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { sourceRuntime, RESTORE_METHOD, classifyRestoreError } from './restore-common.mjs';
import { recordsFor, schema } from './restore-fixture.mjs';

const [rawSize, encodedPath, reportPath] = process.argv.slice(2), size = Number(rawSize);
assert.ok(RESTORE_METHOD.sizes.includes(size));
const report = { kind: 'rx4002-restore-preparation-v1', size, pid: process.pid, node: process.version, argv: [...process.argv], outcome: 'Not Run' };
let engine;
try {
  const runtime = await sourceRuntime(schema); engine = runtime.engine; report.qualification = runtime.qualification;
  const records = recordsFor(size); report.corpusSha256 = createHash('sha256').update(JSON.stringify(records)).digest('hex');
  for (let at = 0; at < size; at += RESTORE_METHOD.batchSize) await engine.addMany(records.slice(at, at + RESTORE_METHOD.batchSize), { deadlineMs: RESTORE_METHOD.deadlineMs });
  const all = await engine.search({ kind: 'all' }, { limit: 20, deadlineMs: RESTORE_METHOD.deadlineMs });
  assert.equal(all.total, size); assert.equal(all.completeness, 'complete'); report.originRevision = all.revision;
  const encoded = await runtime.snapshots.exportNative({ deadlineMs: RESTORE_METHOD.deadlineMs });
  report.encodedFileSha256 = createHash('sha256').update(encoded, 'utf8').digest('hex');
  report.encodedUtf8Bytes = Buffer.byteLength(encoded, 'utf8'); report.encodedCodeUnits = encoded.length;
  assert.ok(report.encodedUtf8Bytes <= 64 * 1024 * 1024); await writeFile(encodedPath, encoded, { flag: 'wx' }); report.outcome = 'Pass';
} catch (error) {
  report.outcome = classifyRestoreError(error);
  report.error = { name: error.name, code: error.code ?? null, reason: error.reason ?? null, message: error.message }; process.exitCode = 1;
} finally {
  if (engine) { await engine.dispose(); report.producerDisposed = true; }
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ stage: 'snapshot-preparation', size, outcome: report.outcome, encodedUtf8Bytes: report.encodedUtf8Bytes }));
