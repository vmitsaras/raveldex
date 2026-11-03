import test from 'node:test';
import assert from 'node:assert/strict';
import { requireCandidateCoverage, compareCandidateSamples, candidateSummaries, timingComparisons } from '../../bench/n9/candidate-costs.mjs';

const ids = ['common', 'rare', 'overlapping-or', 'negative-only', 'filtered', 'narrow-prefix', 'broad-prefix-refusal', 'source-phrase'];
const build = { operation: 'build', outcome: 'Pass' };
const queries = mode => ids.flatMap(id => (mode === 'normal' ? ['first-call-for-query', 'repeat-same-owner'] : ['first-call-for-query']).map(phase => ({ operation: 'query:' + id, phase, outcome: 'Pass' })));
const row = mode => ({ mode, samples: mode === 'normal' ? [build, ...queries(mode)] : [], observations: mode === 'diagnostic' ? [build, ...queries(mode)] : [] });

test('paired candidate coverage rejects blocked, duplicated, mistimed or mixed-scope observations', () => {
  requireCandidateCoverage(row('normal'), ids); requireCandidateCoverage(row('diagnostic'), ids);
  const blocked = row('normal'); blocked.samples = blocked.samples.map(sample => sample.operation === 'build' ? { ...sample, outcome: 'Refused' } : sample);
  assert.throws(() => requireCandidateCoverage(blocked, ids));
  const missing = row('normal'); missing.samples.pop(); assert.throws(() => requireCandidateCoverage(missing, ids));
  const repeated = row('normal'); repeated.samples[2] = repeated.samples[1]; assert.throws(() => requireCandidateCoverage(repeated, ids));
  const duplicate = row('normal'); duplicate.samples[2] = { ...duplicate.samples[2], operation: 'query:unknown' }; assert.throws(() => requireCandidateCoverage(duplicate, ids));
  const mixed = row('normal'); mixed.observations.push({ operation: 'unexpected' }); assert.throws(() => requireCandidateCoverage(mixed, ids));
});

test('paired parity compares exact successful scores and full error facts, preserving budget transitions', () => {
  const success = { result: { total: 1, hits: [{ id: 'a', score: .25 }], revision: 1 } };
  assert.equal(compareCandidateSamples(success, structuredClone(success)), 'equal-result');
  assert.throws(() => compareCandidateSamples(success, { result: { ...success.result, hits: [{ id: 'a', score: .25000001 }] } }));
  const expansion = { error: { name: 'RaveldexError', code: 'LIMIT_EXCEEDED', details: { path: 'expansions.group', limit: 256, actual: 257 } } };
  assert.equal(compareCandidateSamples(expansion, structuredClone(expansion)), 'equal-error');
  assert.throws(() => compareCandidateSamples(expansion, { error: { ...expansion.error, details: { path: 'another' } } }));
  assert.throws(() => compareCandidateSamples(success, expansion));
  const work = { error: { name: 'RaveldexError', code: 'WORK_LIMIT_EXCEEDED', details: { path: 'work' } } };
  assert.equal(compareCandidateSamples(work, success), 'resource-outcome-change');
  assert.equal(compareCandidateSamples(success, work), 'resource-outcome-change');
  assert.equal(compareCandidateSamples(work, { error: { ...work.error, code: 'DEADLINE_EXCEEDED' } }), 'resource-outcome-change');
  assert.throws(() => compareCandidateSamples({}, {}));
});

test('paired timing summaries separate variants and phases, exclude diagnostics, and retain unsuccessful attempts', () => {
  const sample = (wallMs, outcome = 'Pass') => ({ operation: 'query:rare', phase: 'first-call-for-query', outcome, wallMs, cpuUserMs: wallMs / 2, cpuSystemMs: 1 });
  const summaries = candidateSummaries([
    { variant: 'baseline', size: 100, mode: 'normal', samples: [sample(10), sample(14), sample(2, 'Refused'), sample(3, 'Unknown')] },
    { variant: 'candidate', size: 100, mode: 'normal', samples: [sample(3), sample(5)] },
    { variant: 'candidate', size: 100, mode: 'diagnostic', samples: [], observations: [sample(9000)] },
  ]);
  assert.equal(summaries.length, 2); assert.equal(summaries[0].medianWallMs, 12); assert.equal(summaries[0].observedMaximumWallMs, 14);
  assert.deepEqual(summaries[0].outcomes, { Pass: 2, Refused: 1, Unknown: 1 });
  assert.equal(summaries[1].medianWallMs, 4); assert.deepEqual(summaries[0].cpuSamples, [{ cpuUserMs: 5, cpuSystemMs: 1 }, { cpuUserMs: 7, cpuSystemMs: 1 }]);
  const [comparison] = timingComparisons(summaries);
  assert.equal(comparison.candidateOverBaseline, 1 / 3); assert.ok(Math.abs(comparison.deltaPercent + 66.66666666666667) < 1e-10);
  assert.equal(comparison.baselineAttempts, 4); assert.equal(comparison.candidateAttempts, 2);
  assert.throws(() => candidateSummaries([{ variant: 'baseline', size: 100, mode: 'normal', samples: [{ ...sample(1), counters: {} }] }]));
  assert.throws(() => candidateSummaries([{ variant: 'baseline', size: 100, mode: 'normal', samples: [sample(NaN)] }]));
  const refused = candidateSummaries([{ variant: 'baseline', size: 100, mode: 'normal', samples: [sample(3, 'Refused')] }]);
  assert.equal(refused[0].medianWallMs, null);
  assert.throws(() => timingComparisons(summaries.slice(0, 1)));
});
