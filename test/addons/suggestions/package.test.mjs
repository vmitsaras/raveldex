import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { measurePackedSuggestions } from '../../measurements/suggestions-package.mjs';

let report;
before(async () => { report = await measurePackedSuggestions(); });

test('installed and minified suggestions preserve authored completion counts/order, unchanged search hits and live mutation revisions', () => {
  assert.equal(report.correctness.status, 'Pass');
  assert.equal(report.correctness.authoredRequests, 9);
  assert.equal(report.correctness.fullPageComparisonsPerRun, 27);
  assert.equal(report.correctness.strictUnrequestedComparisonsPerRun, 3);
  assert.equal(report.correctness.queryIndependentOutput, 'Pass, suggestions are present even for no search hits');
  assert.equal(report.correctness.bundledParity, 'Pass');
  assert.equal(report.package.private, false);
});

test('core excludes optional suggestions and all selected public imports are inert, isolated and independently packaged', () => {
  assert.ok(report.core.inputs.every(({ path }) => !path.includes('/addons/suggestions/')));
  assert.ok(report.suggestionsOnly.inputs.some(({ path }) => path.endsWith('/addons/suggestions/index.js')));
  assert.ok(report.suggestionsOnly.inputs.every(({ path }) => !path.includes('/execution/engine.js')));
  assert.ok(report.combined.inputs.some(({ path }) => path.endsWith('/execution/engine.js')));
  assert.ok(report.combined.inputs.some(({ path }) => path.endsWith('/addons/suggestions/index.js')));
  assert.ok(report.startup.every(row => row.reads.length === 0));
  assert.equal(report.logicalState.extraRetainedIndexEntries, 0);
  const paths = report.package.files.map(({ path }) => path);
  assert.ok(paths.includes('dist/addons/suggestions/index.js'));
  assert.ok(paths.includes('dist/addons/suggestions/index.d.ts'));
});

test('real Node worker protocol preserves separate dictionary output and rejects mismatched suggestion limits', () => {
  assert.equal(report.worker.status, 'Pass');
  assert.equal(report.worker.comparisons, 13);
  assert.equal(report.documentation.status, 'Pass');
  assert.equal(report.worker.semanticOptionMismatch, 'INCOMPATIBLE_WORKER');
  assert.match(report.worker.scope, /no browser/);
});
