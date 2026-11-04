import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePrefixSamples, prefixQueries, prefixSummaries, requirePrefixCoverage, validatePrefixRows, PREFIX_METHOD } from '../../bench/n9/prefix-costs.mjs';
import { workloadFor } from '../../bench/n9/workloads.mjs';

const success = operation => ({ operation, outcome: 'Pass', result: { revision: 1, total: 0, hits: [] }, wallMs: 2, cpuUserMs: 1, cpuSystemMs: .1 });
const refusal = operation => ({ operation, outcome: 'Refused', error: { name: 'RaveldexError', code: 'LIMIT_EXCEEDED', details: { path: 'expansions.group', limit: 256, actual: 257 }, message: 'limit' }, wallMs: 5, cpuUserMs: 2, cpuSystemMs: .1 });
const ids = prefixQueries(workloadFor('adversarial', 100)).map(query => query.id);
function owner(variant = 'baseline', mode = 'normal', pid = 1) {
  const operation = id => id.includes('broad-prefix') ? refusal('query:' + id) : success('query:' + id);
  const operations = [success('build'), ...ids.flatMap(id => Array.from({ length: mode === 'normal' ? PREFIX_METHOD.samples : 1 }, (_, repetition) => ({ ...operation(id), repetition }))), success('mutation:replace-new-term'), success('mutation:replace-original')];
  if (mode === 'diagnostic') for (const item of operations) item.counters = { prefixDictionaryVisits: 3 };
  return { variant, mode, pid, size: 100, outcome: 'Pass', samples: mode === 'normal' ? operations : [], observations: mode === 'diagnostic' ? operations : [], warmups: mode === 'normal' ? ids.flatMap(id => Array.from({ length: PREFIX_METHOD.warmups }, (_, repetition) => { const { wallMs, cpuUserMs, cpuSystemMs, ...rest } = operation(id); return { ...rest, repetition }; })) : [] };
}
function rows() { return ['baseline', 'candidate'].flatMap((variant, index) => [owner(variant, 'normal', 1 + index * 4), owner(variant, 'normal', 2 + index * 4), owner(variant, 'normal', 3 + index * 4), owner(variant, 'diagnostic', 4 + index * 4)]); }

test('prefix method retains independent frozen controls, exact refusals and duplicate/exact-prefix overlap', () => {
  const queries = prefixQueries(workloadFor('adversarial', 100)); assert.equal(queries.length, 4); assert.deepEqual(queries[2].expectedIds, []); assert.deepEqual(queries[3].expectedIds, queries[0].expectedIds); assert.ok(queries[1].expectedError);
  const sample = refusal('query:overflow'); assert.equal(comparePrefixSamples(sample, structuredClone(sample)), 'equal-error');
  const changed = structuredClone(sample); changed.error.details.actual++; assert.throws(() => comparePrefixSamples(sample, changed)); assert.throws(() => comparePrefixSamples(sample, success(sample.operation)));
});
test('prefix coverage fails closed for missing owners, operations, warmups, outcomes and semantic drift', () => {
  const valid = rows(); assert.equal(validatePrefixRows(valid, [100]).length, 1);
  let broken = rows(); broken.pop(); assert.throws(() => validatePrefixRows(broken, [100]));
  broken = rows(); broken[0].samples.pop(); assert.throws(() => requirePrefixCoverage(broken[0], ids));
  broken = rows(); broken[0].warmups.pop(); assert.throws(() => requirePrefixCoverage(broken[0], ids));
  broken = rows(); broken[0].samples[1].repetition = 99; assert.throws(() => requirePrefixCoverage(broken[0], ids));
  broken = rows(); broken[4].samples[1].result.total = 9; assert.throws(() => validatePrefixRows(broken, [100]));
  broken = rows(); broken[0].outcome = 'Fail'; assert.throws(() => validatePrefixRows(broken, [100]));
});
test('prefix summaries separate intrusive diagnostics, excluded warmups, successful latency and refusal timings', () => {
  const input = rows(); input[3].observations.forEach(item => item.wallMs = 90000); const summaries = prefixSummaries(input);
  const narrow = summaries.find(row => row.variant === 'baseline' && row.operation === 'query:narrow-prefix'); assert.equal(narrow.attempts, 18); assert.equal(narrow.medianWallMs, 2); assert.equal(narrow.observedMaximumWallMs, 2); assert.equal(narrow.medianCpuUserMs, 1); assert.equal('p95WallMs' in narrow, false);
  const refused = summaries.find(row => row.variant === 'baseline' && row.operation === 'query:broad-prefix-refusal'); assert.equal(refused.successes, 0); assert.equal(refused.medianWallMs, null); assert.deepEqual(refused.outcomes, { Refused: 18 }); assert.equal(refused.refusedWallMs.length, 18);
  input[0].samples[0].counters = {}; assert.throws(() => prefixSummaries(input)); const invalid = rows(); invalid[0].samples[0].wallMs = NaN; assert.throws(() => prefixSummaries(invalid));
});
