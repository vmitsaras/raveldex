import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { measurePackedPatch } from '../../measurements/patch-package.mjs';

let report;
before(async () => { report = await measurePackedPatch(); if (process.env.RAVELDEX_PATCH_PACKAGE_REPORT) await writeFile(process.env.RAVELDEX_PATCH_PACKAGE_REPORT, JSON.stringify(report, null, 2) + '\n'); });

test('installed and minified patches equal independently specified complete replacements through every field action', () => {
  assert.equal(report.package.private, true); assert.equal(report.correctness.status, 'Pass'); assert.equal(report.correctness.fullReplacementCasesPerRun, 5); assert.equal(report.correctness.completeComparisonsPerRun, 120); assert.equal(report.correctness.minifiedParity, 'Pass'); assert.deepEqual(report.packed.failures, ['REVISION_MISMATCH', 'INVALID_RECORD', 'MISSING_CAPABILITY', 'MISSING_CAPABILITY']);
});
test('source snapshot recovery allows guarded direct patches and an actual worker refuses the optional direct handle', () => {
  assert.equal(report.snapshots.status, 'Pass'); assert.equal(report.snapshots.restoredRevision, 1); assert.equal(report.snapshots.patchRevision, 2); assert.equal(report.snapshots.unchangedSourceCodec, true); assert.equal(report.worker.status, 'Pass'); assert.equal(report.worker.code, 'MISSING_CAPABILITY'); assert.equal(report.worker.ordinaryWorkerReplacement, 'Pass'); assert.match(report.worker.transport, /Actual Node worker_threads/);
});
test('public declarations and exact installed documentation execute with inert optional imports and measured separate graphs', () => {
  assert.match(report.declarations, /without DOM\/Node/); assert.equal(report.documentation.status, 'Pass'); assert.equal(report.documentation.stdout, '2 1 guide\n'); assert.match(report.documentation.exampleSha256, /^[a-f0-9]{64}$/); assert.ok(report.startup.every(row => row.reads.length === 0)); assert.ok(report.core.inputs.every(({ path }) => !path.includes('/addons/patch/'))); assert.ok(report.patchOnly.inputs.some(({ path }) => path.includes('/addons/patch/'))); assert.equal(report.state.patchParticipants, 0); assert.equal(report.state.patchCodec, false); assert.equal(report.state.hiddenSourceRetention, false); assert.ok(Number.isSafeInteger(report.coreDelta.gzipBytes));
});
