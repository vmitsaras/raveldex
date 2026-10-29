import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { measurePackedTypo } from '../../measurements/typo-package.mjs';

let report;
before(async () => { report = await measurePackedTypo(); });

test('installed and minified typo consumers preserve authored repairs, native weighted scores, exact queries and lifecycle freshness', () => {
  assert.equal(report.correctness.status, 'Pass');
  assert.equal(report.correctness.authoredQueries, 10);
  assert.equal(report.correctness.fullPageScoreComparisonsPerRun, 30);
  assert.equal(report.correctness.strictUnrequestedComparisonsPerRun, 3);
  assert.equal(report.correctness.bundledParity, 'Pass');
  assert.equal(report.package.private, true);
});

test('core excludes typo implementation and selected addon imports are inert and independently packaged', () => {
  assert.ok(report.core.inputs.every(({ path }) => !path.includes('/addons/typo/')));
  assert.ok(report.typoOnly.inputs.some(({ path }) => path.endsWith('/addons/typo/distance.js')));
  assert.ok(report.typoOnly.inputs.every(({ path }) => !path.includes('/execution/engine.js')));
  assert.ok(report.combined.inputs.some(({ path }) => path.endsWith('/execution/engine.js')));
  assert.ok(report.combined.inputs.some(({ path }) => path.endsWith('/addons/typo/index.js')));
  assert.ok(report.startup.every(row => row.reads.length === 0));
  assert.equal(report.logicalState.extraRetainedIndexEntries, 0);
  const paths = report.package.files.map(({ path }) => path);
  assert.ok(paths.includes('dist/addons/typo/index.js'));
  assert.ok(paths.includes('dist/addons/typo/index.d.ts'));
});

test('real Node worker protocol preserves typo results and rejects mismatched semantic options', () => {
  assert.equal(report.worker.status, 'Pass');
  assert.equal(report.worker.comparisons, 14);
  assert.equal(report.documentation.status, 'Pass');
  assert.equal(report.worker.semanticOptionMismatch, 'INCOMPATIBLE_WORKER');
  assert.match(report.worker.scope, /no browser/);
});
