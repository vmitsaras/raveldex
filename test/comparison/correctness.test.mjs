import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCorrectness } from '../../bench/correctness.mjs';

test('public native qualification replays independent membership, mutation, phrase and hand-score cases', async () => {
  const report = await verifyCorrectness();
  assert.equal(report.status, 'Pass');
  assert.ok(report.queryComparisons > 100 && report.mutationComparisons > 500 && report.phraseComparisons > 400);
  assert.ok(report.rejections > 0 && report.noops > 0 && report.commits > 0);
  assert.equal(report.handScoreAssertions, 10);
});
