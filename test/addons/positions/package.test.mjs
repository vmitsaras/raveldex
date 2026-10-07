import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { measurePackedPositions } from '../../measurements/position-package.mjs';
let report;
before(async () => { report = await measurePackedPositions(); });
test('installed declarations, real tarball and minified consumer preserve four representation memberships, pages, scores and mutations', () => {
  assert.equal(report.correctness.status, 'Pass'); assert.equal(report.correctness.representations, 4);
  assert.equal(report.correctness.completeComparisonsPerRepresentation, 23); assert.equal(report.correctness.bundledParity, 'Pass');
  assert.equal(report.core.targetMet, true);
});
test('core/source/position utilities exclude unselected verifier modules and public imports have no host access', () => {
  assert.ok(report.core.inputs.every(({ path }) => !/addons|adapters/.test(path)));
  assert.ok(report.graphs.source.inputs.every(({ path }) => !/verifier|positions\//.test(path)));
  assert.ok(report.graphs.sourcePhrases.inputs.every(({ path }) => !/positions\//.test(path)));
  assert.ok(report.graphs.positions.inputs.every(({ path }) => !/verifier|positions\/phrases|phrases\//.test(path)));
  assert.ok(report.startup.every(row => row.reads.length === 0));
});
