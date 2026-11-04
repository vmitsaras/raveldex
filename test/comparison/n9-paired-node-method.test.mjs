import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { quantile, summarizeRows, compareCaptures, validateRows } from '../../bench/n9/paired-node.mjs';
import { FAMILIES, SIZES, workloadFor, verifyFrozen } from '../../bench/n9/workloads.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const error = (code, path = 'work') => ({ name: 'RaveldexError', code, reason: null, details: { path }, message: 'Raveldex: ' + code });
const timing = { wallMs: 1, cpuUserMs: .5, cpuSystemMs: .1 };
const counters = { emittedSteps: 1, emittedWorkUnits: 1, maxStepWorkUnits: 1, hostYields: 0, continuationsScheduled: 0, deadlineCallbacks: 0, candidates: 0, documentsEvaluated: 0, documentsScored: 0, exactDictionaryProbes: 0, prefixDictionaryVisits: 0, postingsVisited: 0, averageLengthComputations: 0, idfComputations: 0, fieldsPrepared: 0, restorePhase: null, restorePhases: {} };
const variants = ['baseline', 'planning', 'scheduling', 'prefix', 'ranking', 'combined'];
const frozen = new Map(FAMILIES.flatMap(family => SIZES.map(size => [[family, size].join(':'), verifyFrozen(workloadFor(family, size))])));
function makeFixture() {
  const rows = []; let pid = 1000;
  for (const family of FAMILIES) for (const size of SIZES) {
    const workload = frozen.get([family, size].join(':')), tail = family === 'adversarial' && size === 100;
    for (const variant of family === 'adversarial' ? variants : ['baseline', 'combined']) for (const owner of tail ? [0, 1, 2, 3] : [0, 1, 3]) {
      const mode = owner === 3 ? 'diagnostic' : 'normal', data = [], revision = Math.ceil(size / 256);
      const row = { kind: 'rx8009-node-child-v1', pid: pid++, family, size, variant, mode, owner, identity: workload.identity,
        samples: mode === 'normal' ? data : [], observations: mode === 'diagnostic' ? data : [], warmups: [], results: {}, resultCaptures: {}, queryTransitions: [], outcome: 'Collected' };
      const add = value => data.push({ ...timing, ...value, ...(mode === 'diagnostic' ? { counters } : {}) });
      add({ operation: 'build', outcome: 'Pass', result: { revision, changed: true, added: size % 256 || 256, replaced: 0, removed: 0 } });
      for (const query of workload.queries) {
        const capture = query.expectedError ? { error: error(query.expectedError.code, query.expectedError.path) } : { result: {
          completeness: 'complete', model: 'raveldex-bm25-v1', revision, total: query.expectedIds.length,
          hits: query.expectedIds.slice(0, 20).map(id => ({ id, score: 0 })),
        } };
        const resultSha256 = hash(capture), outcome = capture.error ? 'Refused' : 'Pass';
        row.results[query.id] = capture; row.resultCaptures[resultSha256] = capture;
        if (mode === 'normal' && tail) for (let repetition = 0; repetition < 2; repetition++) row.warmups.push({ operation: 'query:' + query.id, repetition, outcome });
        const count = mode === 'diagnostic' ? 1 : tail ? 40 : 2;
        for (let repetition = 0; repetition < count; repetition++) add({ operation: 'query:' + query.id, repetition,
          phase: mode === 'diagnostic' ? 'diagnostic-first-call' : tail ? 'after-two-warmups' : repetition ? 'repeat-same-owner' : 'first-call-for-query',
          outcome, ...(capture.error ? { error: capture.error } : {}), resultSha256 });
      }
      add({ operation: 'exportSource', outcome: 'Pass', result: { encodedBytes: 42, encodedSha256: 'a'.repeat(64), header: { originRevision: revision } }, snapshotArtifact: 'fixture.source.json' });
      add({ operation: 'restoreSource', outcome: 'Pass', result: { revision: 2, originRevision: revision, reindexed: true, format: 'raveldex-source' }, completeSource: { outcome: 'Pass', records: size } });
      rows.push(row);
    }
  }
  return rows;
}
const fixture = makeFixture();
const fresh = () => structuredClone(fixture);
const operations = row => row.mode === 'normal' ? row.samples : row.observations;
function firstQuery(row) { return operations(row).find(item => item.operation === 'query:common'); }
function capture(row, sample, value) { const key = hash(value); row.resultCaptures[key] = value; sample.resultSha256 = key; return value; }

test('paired quantiles use nearest rank without mutation and reject invalid fractions/data', () => {
  const values = [3, 0, 2, 1];
  assert.equal(quantile(values, .5), 1); assert.equal(quantile(values, .95), 3); assert.deepEqual(values, [3, 0, 2, 1]);
  assert.equal(quantile([0], 1), 0);
  for (const fraction of [0, -.1, 1.01, NaN, Infinity]) assert.throws(() => quantile(values, fraction));
  for (const bad of [[], [-1], [NaN], [Infinity], [undefined]]) assert.throws(() => quantile(bad, .5));
});

test('paired summaries separate outcomes/diagnostics and require100 real observations for p95', () => {
  const rows = Array.from({ length: 3 }, (_, owner) => ({ variant: 'baseline', family: 'adversarial', size: 100, mode: 'normal', owner, pid: owner + 10,
    samples: Array.from({ length: 40 }, (_, index) => ({ operation: 'query:common', phase: 'after-two-warmups', outcome: 'Pass', wallMs: owner * 40 + index + 1, cpuUserMs: .5, cpuSystemMs: .1 })) }));
  rows.push({ variant: 'baseline', family: 'adversarial', size: 100, mode: 'diagnostic', owner: 3, pid: 13, samples: [], observations: [{ operation: 'query:common', outcome: 'Pass', wallMs: 1e9, counters }] });
  rows.push({ variant: 'baseline', family: 'adversarial', size: 100, mode: 'normal', owner: 4, pid: 14, samples: [{ operation: 'query:common', phase: 'after-two-warmups', outcome: 'Refused', ...timing, wallMs: 1e6, error: error('WORK_LIMIT_EXCEEDED') }, { operation: 'restoreSource', outcome: 'Not run', reason: 'Actual source export refused' }] });
  const result = summarizeRows(rows), pass = result.find(row => row.outcome === 'Pass'), refused = result.find(row => row.outcome === 'Refused'), notRun = result.find(row => row.outcome === 'Not run');
  assert.equal(pass.attempts, 120); assert.equal(pass.owners, 3); assert.equal(pass.p50WallMs, 60); assert.equal(pass.p95WallMs, 114); assert.equal(pass.totalAttempts, 121); assert.equal(pass.failureRate, 1 / 121); assert.deepEqual(pass.outcomes, { Pass: 120, Refused: 1 });
  assert.equal(refused.attempts, 1); assert.equal(refused.p50WallMs, 1e6); assert.equal(refused.p95WallMs, null);
  assert.equal(notRun.records, 1); assert.equal(notRun.attempts, 0); assert.equal(notRun.totalAttempts, 0); assert.equal(notRun.failureRate, null); assert.equal(notRun.p50WallMs, null); assert.equal(notRun.p95WallMs, null); assert.deepEqual(notRun.samples, []);
  const small = structuredClone(rows.slice(0, 3)); small[2].samples.splice(19);
  assert.equal(summarizeRows(small)[0].attempts, 99); assert.equal(summarizeRows(small)[0].p95WallMs, null);
  assert.throws(() => summarizeRows([{ ...rows[0], samples: [{ ...rows[0].samples[0], counters }] }]));
  assert.throws(() => summarizeRows([{ ...rows[0], samples: [{ operation: 'query:common', outcome: 'Pass', cpuUserMs: 1, cpuSystemMs: 1 }] }]));
});

test('paired comparisons retain exact scores/order/errors and explicit resource capacity findings', () => {
  const good = { result: { revision: 1, total: 2, hits: [{ id: 'a', score: .5 }, { id: 'b', score: .25 }] } };
  assert.equal(compareCaptures(good, structuredClone(good)), 'Equal result');
  const numeric = structuredClone(good); numeric.result.hits[0].score += Number.EPSILON; assert.throws(() => compareCaptures(good, numeric));
  const reversed = structuredClone(good); reversed.result.hits.reverse(); assert.throws(() => compareCaptures(good, reversed));
  const limit = { error: error('LIMIT_EXCEEDED', 'expansions.group') }, reordered = { error: Object.fromEntries(Object.entries(limit.error).reverse()) };
  assert.equal(compareCaptures(limit, reordered), 'Equal error');
  assert.throws(() => compareCaptures(limit, { error: error('LIMIT_EXCEEDED', 'expansions.query') }));
  const work = { error: error('WORK_LIMIT_EXCEEDED') }, deadline = { error: error('DEADLINE_EXCEEDED', 'options.deadlineMs') };
  assert.equal(compareCaptures(work, good), 'Finding: resource outcome transition');
  assert.equal(compareCaptures(good, work), 'Finding: resource outcome transition');
  assert.equal(compareCaptures(work, deadline), 'Finding: resource outcome transition');
  for (const invalid of [{}, { result: good.result, error: work.error }, { error: error('INTERNAL_ERROR') }, { error: error('OUTCOME_UNKNOWN') }]) assert.throws(() => compareCaptures(work, invalid));
});

test('paired coverage requires the complete matrix with fresh and uniquely labelled owners', () => {
  assert.equal(fixture.length, 96); assert.ok(validateRows(fresh()).length > 0);
  const missing = fresh(); missing.pop(); assert.throws(() => validateRows(missing));
  const duplicatePid = fresh(); duplicatePid[1].pid = duplicatePid[0].pid; assert.throws(() => validateRows(duplicatePid));
  const duplicateOwner = fresh(); duplicateOwner[1].owner = duplicateOwner[0].owner; assert.throws(() => validateRows(duplicateOwner));
  const extra = fresh(); extra.push({ ...structuredClone(extra[0]), variant: 'untracked-stage', pid: 99999 }); assert.throws(() => validateRows(extra));
  const invalidMode = fresh(); invalidMode[0].mode = 'hidden'; assert.throws(() => validateRows(invalidMode));
});

test('paired coverage rejects missing/duplicate query and nonquery observations and wrong repetition/warmup scopes', () => {
  const missing = fresh(); missing[0].samples.splice(1, 1); assert.throws(() => validateRows(missing));
  const repeated = fresh(); repeated[0].samples[2].repetition = repeated[0].samples[1].repetition; assert.throws(() => validateRows(repeated));
  for (const operation of ['build', 'exportSource', 'restoreSource']) {
    const duplicate = fresh(); duplicate[0].samples.push(structuredClone(duplicate[0].samples.find(item => item.operation === operation))); assert.throws(() => validateRows(duplicate));
  }
  const tail = fresh(), tailRow = tail.find(row => row.family === 'adversarial' && row.size === 100 && row.mode === 'normal'); tailRow.warmups.pop(); assert.throws(() => validateRows(tail));
  const measuredWarmup = fresh(), warm = measuredWarmup.find(row => row.warmups.length); warm.warmups[0].wallMs = 0; assert.throws(() => validateRows(measuredWarmup));
});

test('paired coverage rejects hidden instrumentation and inconsistent outcome/capture facts', () => {
  const normalCounter = fresh(); normalCounter[0].samples[1].counters = counters; assert.throws(() => validateRows(normalCounter));
  const absentCounter = fresh(), diagnostic = absentCounter.find(row => row.mode === 'diagnostic'); delete diagnostic.observations[1].counters; assert.throws(() => validateRows(absentCounter));
  const mismatched = fresh(); firstQuery(mismatched[0]).outcome = 'Refused'; assert.throws(() => validateRows(mismatched));
  const unknown = fresh(), item = firstQuery(unknown[0]); item.outcome = 'Unknown'; capture(unknown[0], item, { error: error('OUTCOME_UNKNOWN') }); item.error = error('OUTCOME_UNKNOWN'); assert.throws(() => validateRows(unknown));
});

test('paired export refusal makes restore Not run explicit without inventing latency or success', () => {
  const rows = fresh(), row = rows[0], exported = row.samples.find(item => item.operation === 'exportSource');
  exported.outcome = 'Refused'; exported.error = error('WORK_LIMIT_EXCEEDED'); delete exported.result;
  row.recoveryNotRun = 'Actual source export refused';
  const index = row.samples.findIndex(item => item.operation === 'restoreSource'); row.samples[index] = { operation: 'restoreSource', outcome: 'Not run', reason: row.recoveryNotRun };
  assert.ok(validateRows(rows).length > 0);
  row.samples[index].wallMs = 0; assert.throws(() => validateRows(rows));
  delete row.samples[index].wallMs; row.samples[index].outcome = 'Pass'; assert.throws(() => validateRows(rows));
});

test('a canonical warmup refusal cannot hide divergent successful numerical results', () => {
  const rows = fresh(), row = rows[0], samples = row.samples.filter(item => item.operation === 'query:common');
  row.results.common = { error: error('WORK_LIMIT_EXCEEDED') }; row.resultCaptures[hash(row.results.common)] = row.results.common;
  const drift = structuredClone(row.resultCaptures[samples[1].resultSha256]); drift.result.hits[0].score += .1;
  capture(row, samples[1], drift);
  assert.throws(() => validateRows(rows));
});
