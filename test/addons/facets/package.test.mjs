import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { measurePackedFilterFacets } from '../../measurements/filter-facet-package.mjs';
let report;
before(async () => { report = await measurePackedFilterFacets(); });

test('offline installed package and minified consumer preserve complete filter/phrase scores and exact facets through all pages and writes', () => {
  assert.equal(report.correctness.status, 'Pass');
  assert.equal(report.correctness.completeComparisonsPerRun, 159);
  assert.equal(report.correctness.completeFacetTablesPerRun, 159);
  assert.equal(report.correctness.bundledParity, 'Pass');
  assert.equal(report.correctness.scenarios, 3);
  assert.equal(report.declarations.status, 'Pass');
  assert.equal(report.compiledFiles.status, 'Pass');
  assert.ok(report.compiledFiles.filesVerified > 0);
  assert.ok(report.compiledFiles.mapping.every(file => file.sourcePath.endsWith('.ts')));
  assert.equal(report.corpus.records, 34);
  assert.equal(report.package.private, true);
});

test('complete import graphs keep utility/core boundaries, deny private paths and perform no guarded startup access', () => {
  assert.equal(report.core.targetGzipBytes, 15 * 1024);
  assert.equal(report.core.targetMet, report.core.gzipBytes <= report.core.targetGzipBytes);
  assert.ok(report.core.inputs.every(({ path }) => !/addons|adapters/.test(path)));
  assert.ok(report.graphs.filters.inputs.every(({ path }) => !/facets\/|phrases\/|positions\/|adapters\/|core\/(execution|query|index|mutations)\//.test(path)));
  assert.ok(report.graphs.facets.inputs.every(({ path }) => !/filters\/|phrases\/|positions\/|adapters\/|core\/(execution|query|index|mutations)\//.test(path)));
  assert.equal(report.privateDenial.length, 8);
  assert.ok(report.privateDenial.every(row => row.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'));
  assert.ok(report.startup.every(row => row.reads.length === 0));
});
