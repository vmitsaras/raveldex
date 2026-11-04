import test from 'node:test';
import assert from 'node:assert/strict';
import { rankingQueries, RANKING_METHOD, compareRankingSamples, requireRankingCoverage, validateRankingRows, rankingSummaries, validateRankingDiagnostics } from '../../bench/n9/ranking-costs.mjs';
import { workloadFor } from '../../bench/n9/workloads.mjs';

const success = operation => ({ operation, outcome: 'Pass', result: { revision: 1, total: 0, hits: [] }, wallMs: 2, cpuUserMs: 1, cpuSystemMs: .1 });
const refusal = operation => ({ operation, outcome: 'Refused', error: { name: 'RaveldexError', code: 'WORK_LIMIT_EXCEEDED', details: { path: 'work' }, message: 'work limit' }, wallMs: 5, cpuUserMs: 2, cpuSystemMs: .1 });
const queries = rankingQueries(workloadFor('adversarial', 100)), ids = queries.map(query => query.id);
function owner(variant = 'baseline', mode = 'normal', pid = 1) {
  const operation = id => id === 'source-phrase' ? refusal('query:' + id) : success('query:' + id);
  const operations = [success('build'), ...ids.flatMap(id => Array.from({ length: mode === 'normal' ? RANKING_METHOD.samples : 1 }, (_, repetition) => ({ ...operation(id), repetition })))];
  if (mode === 'diagnostic') for (const item of operations) item.counters = { idfComputations: 1, averageLengthComputations: 1, fieldsPrepared: 0 };
  return { variant, mode, pid, size: 100, outcome: 'Pass', samples: mode === 'normal' ? operations : [], observations: mode === 'diagnostic' ? operations : [], warmups: mode === 'normal' ? ids.flatMap(id => Array.from({ length: RANKING_METHOD.warmups }, (_, repetition) => { const { wallMs, cpuUserMs, cpuSystemMs, ...rest } = operation(id); return { ...rest, repetition }; })) : [] };
}
function rows() { return ['baseline', 'candidate'].flatMap((variant, index) => [owner(variant, 'normal', 1 + index * 4), owner(variant, 'normal', 2 + index * 4), owner(variant, 'normal', 3 + index * 4), owner(variant, 'diagnostic', 4 + index * 4)]); }
const stableCounters = ['emittedSteps', 'emittedWorkUnits', 'hostYields', 'continuationsScheduled', 'candidates', 'documentsEvaluated', 'documentsScored', 'exactDictionaryProbes', 'prefixDictionaryVisits', 'postingsVisited', 'maxStepWorkUnits', 'deadlineCallbacks'];
function diagnostics() { return ['build', ...ids.map(id => 'query:' + id)].map(operation => ({ size: 100, operation, baselineOutcome: 'Pass', candidateOutcome: 'Pass', baseline: { ...Object.fromEntries(stableCounters.map(name => [name, 3])), idfComputations: 100, averageLengthComputations: 100, fieldsPrepared: 0 }, candidate: { ...Object.fromEntries(stableCounters.map(name => [name, 3])), idfComputations: 1, averageLengthComputations: 1, fieldsPrepared: 1 } })); }

test('ranking controls retain frozen membership and compare full actual numerical trace and errors', () => {
  assert.deepEqual(ids, ['common', 'rare', 'overlapping-or', 'filtered', 'source-phrase', 'weighted-alternatives', 'inspector-common']);
  assert.deepEqual(queries[5].expectedIds, queries[0].expectedIds); assert.deepEqual(queries[6].expectedIds, queries[0].expectedIds); assert.equal(queries[5].query.variants.length, 4); assert.ok(queries[5].query.variants.every(variant => Number.isFinite(variant.weight) && variant.weight > 0 && variant.weight <= 1)); assert.equal(queries[6].options.extensions.inspector.ids.length, 4);
  const expected = success('query:trace'); expected.result.extensions = { inspector: { trace: { facts: [{ idf: .1 }] }, resources: { searchWorkUnits: 99 } } };
  assert.equal(compareRankingSamples(expected, structuredClone(expected)), 'equal-result');
  for (const change of [row => row.result.extensions.inspector.trace.facts[0].idf++, row => row.result.extensions.inspector.resources.searchWorkUnits++]) { const changed = structuredClone(expected); change(changed); assert.throws(() => compareRankingSamples(expected, changed)); }
  const error = refusal('query:refused'); assert.equal(compareRankingSamples(error, structuredClone(error)), 'equal-error'); const changed = structuredClone(error); changed.error.details.path = 'changed'; assert.throws(() => compareRankingSamples(error, changed)); assert.throws(() => compareRankingSamples(error, success(error.operation)));
});
test('ranking coverage and computation claims fail closed for missing owners/cases/warmups or counter and result drift', () => {
  assert.equal(validateRankingRows(rows(), [100]).length, 1);
  let broken = rows(); broken.pop(); assert.throws(() => validateRankingRows(broken, [100]));
  broken = rows(); broken[0].samples.pop(); assert.throws(() => requireRankingCoverage(broken[0], ids));
  broken = rows(); broken[0].warmups.pop(); assert.throws(() => requireRankingCoverage(broken[0], ids));
  broken = rows(); broken[0].samples[1].repetition = 9; assert.throws(() => requireRankingCoverage(broken[0], ids));
  broken = rows(); broken[4].samples[1].result.total++; assert.throws(() => validateRankingRows(broken, [100]));
  broken = rows(); broken[0].samples[1] = { ...refusal('query:common'), outcome: 'Unknown' }; assert.throws(() => validateRankingRows(broken, [100]));
  validateRankingDiagnostics(diagnostics(), [100]); let counts = diagnostics(); counts.pop(); assert.throws(() => validateRankingDiagnostics(counts, [100]));
  counts = diagnostics(); counts.find(row => row.operation === 'query:common').candidate.idfComputations = 100; assert.throws(() => validateRankingDiagnostics(counts, [100]));
  counts = diagnostics(); delete counts[0].candidate.fieldsPrepared; assert.throws(() => validateRankingDiagnostics(counts, [100]));
  for (const name of stableCounters) { counts = diagnostics(); counts.find(row => row.operation === 'query:common').candidate[name]++; assert.throws(() => validateRankingDiagnostics(counts, [100]), new RegExp(name + ' must remain unchanged')); }
  counts = diagnostics(); delete counts[0].candidate.emittedSteps; assert.throws(() => validateRankingDiagnostics(counts, [100]), /emittedSteps diagnostic counter missing/);
});
test('ranking summaries exclude intrusive observations/warmups, retain refused costs and do not claim p95 or latency improvement', () => {
  const input = rows(); input[3].observations.forEach(item => item.wallMs = 90000); const summary = rankingSummaries(input);
  const common = summary.find(row => row.variant === 'baseline' && row.operation === 'query:common'); assert.equal(common.attempts, 18); assert.equal(common.medianWallMs, 2); assert.equal(common.medianCpuUserMs, 1); assert.equal('p95WallMs' in common, false);
  const refused = summary.find(row => row.variant === 'baseline' && row.operation === 'query:source-phrase'); assert.equal(refused.successes, 0); assert.equal(refused.medianWallMs, null); assert.deepEqual(refused.outcomes, { Refused: 18 }); assert.equal(refused.refusedWallMs.length, 18);
  assert.equal(summary.find(row => row.variant === 'baseline' && row.operation === 'build').attempts, 3);
  input[0].samples[0].counters = {}; assert.throws(() => rankingSummaries(input)); const invalid = rows(); invalid[0].samples[0].wallMs = NaN; assert.throws(() => rankingSummaries(invalid));
});
