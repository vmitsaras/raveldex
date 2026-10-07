import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { measurePackedPhrases } from '../../measurements/phrase-package.mjs';
let report;
before(async () => { report = await measurePackedPhrases(); });
test('installed tarball and complete minified selected-module consumer preserve phrase membership, scores, revisions and clear', () => {
  assert.equal(report.correctness.status, 'Pass'); assert.equal(report.correctness.completeComparisonsPerRun, 23); assert.equal(report.correctness.bundledParity, 'Pass');
});
test('core excludes optional code, source utility excludes verification, selected phrase graph has no foreign/external runtime', () => {
  assert.ok(report.core.inputs.every(({ path }) => !/addons|adapters/.test(path)));
  assert.ok(report.source.inputs.every(({ path }) => !/verifier|phrases\/index/.test(path)));
  assert.ok(report.combined.inputs.some(({ path }) => path.endsWith('/phrases/verifier.js')));
  assert.ok(report.core.gzipBytes > 1000); assert.equal(report.core.targetGzipBytes, 15360);
});
test('fresh public imports have no host access and contain only public factory exports', () => {
  assert.ok(report.startup.every(row => row.reads.length === 0));
  const paths = report.package.files.map(({ path }) => path);
  assert.ok(paths.includes('dist/addons/phrases/index.js')); assert.ok(paths.includes('dist/addons/phrases/source.d.ts'));
});
