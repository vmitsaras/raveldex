import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { measurePackedSynonyms } from '../../measurements/synonyms-package.mjs';

let report;
before(async () => { report = await measurePackedSynonyms(); });

test('installed and minified synonyms preserve literal one-step outcomes, native weighted scores and current-revision mutations', () => {
  assert.equal(report.correctness.status, 'Pass');
  assert.equal(report.correctness.authoredQueries, 13);
  assert.equal(report.correctness.fullPageScoreComparisonsPerRun, 39);
  assert.equal(report.correctness.strictUnrequestedComparisonsPerRun, 3);
  assert.equal(report.correctness.bundledParity, 'Pass');
  assert.equal(report.package.private, true);
});

test('core excludes optional synonyms and selected addon imports are inert, separately packaged and DOM-free', () => {
  assert.ok(report.core.inputs.every(({ path }) => !path.includes('/addons/synonyms/')));
  assert.ok(report.synonymsOnly.inputs.some(({ path }) => path.endsWith('/addons/synonyms/index.js')));
  assert.ok(report.synonymsOnly.inputs.every(({ path }) => !path.includes('/execution/engine.js')));
  assert.ok(report.combined.inputs.some(({ path }) => path.endsWith('/execution/engine.js')));
  assert.ok(report.combined.inputs.some(({ path }) => path.endsWith('/addons/synonyms/index.js')));
  assert.ok(report.startup.every(row => row.reads.length === 0));
  assert.equal(report.logicalState.extraRetainedIndexEntries, 0);
  assert.equal(report.logicalState.retainedConfiguration.normalizedMappings, 6);
  assert.match(report.logicalState.basis, /not a heap/i);
  const paths = report.package.files.map(({ path }) => path);
  assert.ok(paths.includes('dist/addons/synonyms/index.js'));
  assert.ok(paths.includes('dist/addons/synonyms/index.d.ts'));
  assert.match(report.declarations, /no DOM\/Node ambient types/);
});

test('real Node worker parity accepts canonical-equivalent tables and rejects changed contents, versions and budgets', () => {
  assert.equal(report.worker.status, 'Pass');
  assert.equal(report.worker.comparisons, 19);
  assert.equal(report.worker.canonicalReorderAndNormalization, 'Pass');
  assert.equal(report.worker.semanticMismatches.length, 3);
  assert.ok(report.worker.semanticMismatches.every(row => row.result === 'INCOMPATIBLE_WORKER'));
  assert.equal(report.documentation.status, 'Pass');
  assert.match(report.worker.scope, /no browser/);
});
