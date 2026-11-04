import test from 'node:test';
import assert from 'node:assert/strict';
import { BROWSER_PAIRED_METHOD, validatePairedBrowser, summarizePairedBrowser, exercisePairedBrowser, localPairedDiagnostic, pairedBrowserQuantile } from '../../bench/n9/paired-browser.mjs';
import { createPairedVerifier } from '../../bench/n9/paired-verify.mjs';
const strictCompare = (before, after) => createPairedVerifier().compareOutcomes(before, after, { allowCapacityTransition: true });

const method = { ...BROWSER_PAIRED_METHOD, owners: 1, samples: 2, warmups: 1 };
const result = () => ({ revision: 1, model: 'raveldex-bm25-v1', completeness: 'complete', total: 1, hits: [{ id: 'a', score: .25 }] });
const capture = () => ({ outcome: 'Pass', complete: true, revision: 1, total: 1, hits: [{ id: 'a', score: .25 }], pages: [result()], pageSize: 100 });
function rows(options = method) {
  const data = [];
  for (const execution of options.executions) for (const variant of ['baseline', 'candidate']) for (let owner = 0; owner <= options.owners; owner++) {
    const mode = owner === options.owners ? 'diagnostic' : 'normal';
    const observations = options.queries.flatMap(query => Array.from({ length: mode === 'normal' ? options.samples : 1 }, (_, repetition) => ({ query, repetition, outcome: 'Pass', wallMs: repetition + 1, ...(mode === 'diagnostic' ? { counters: { emittedSteps: 1, emittedWorkUnits: 2, hostYields: 1, continuationsScheduled: 1 } } : {}) })));
    data.push({ variant, execution, owner, mode, size: options.size, pageErrors: [], externalRequests: [], case: { outcome: 'Collected', build: { outcome: 'Pass', revision: 1 },
      samples: mode === 'normal' ? observations : [], observations: mode === 'diagnostic' ? observations : [],
      warmups: mode === 'normal' ? options.queries.flatMap(query => Array.from({ length: options.warmups }, (_, repetition) => ({ query, repetition, outcome: 'Pass' }))) : [],
      queryResults: Object.fromEntries(options.queries.map(query => [query, { outcome: 'Pass', result: result() }])), completeQueries: Object.fromEntries(options.queries.map(query => [query, capture()])) } });
  }
  return data;
}
test('paired browser matrix requires fresh owner/query/diagnostic coverage and complete actual pages', () => {
  assert.equal(validatePairedBrowser(rows(), method).owners, 8);
  const mutate = change => { const data = rows(); change(data); assert.throws(() => validatePairedBrowser(data, method)); };
  mutate(data => data.pop()); mutate(data => data[0].owner = 9); mutate(data => data[0].case.samples.pop());
  mutate(data => data[0].case.samples[1].repetition = 0); mutate(data => data[0].case.warmups[0].query = 'missing');
  mutate(data => delete data[0].case.completeQueries.common); mutate(data => data[0].case.completeQueries.common.complete = false);
  mutate(data => data[0].case.completeQueries.common.revision = 0); mutate(data => data[0].case.completeQueries.common.hits.pop());
  mutate(data => data[0].case.completeQueries.common.pages = []); mutate(data => data[0].case.build.revision++);
  mutate(data => data[0].case.observations.push(data[0].case.samples[0])); mutate(data => data[0].case.samples[0].counters = {});
  mutate(data => data[0].case.samples[0].cpuUserMs = 0); mutate(data => data[1].case.observations[0].counters.hostYields = undefined);
  mutate(data => data[0].pageErrors.push('error')); mutate(data => data[0].externalRequests.push('https://example.test'));
});
test('paired browser parity rejects numerical/order/last-page drift and keeps typed outcome transitions as findings', () => {
  let data = rows(); data[2].case.queryResults.common.result.hits[0].score++; assert.throws(() => validatePairedBrowser(data, method));
  data = rows(); data[2].case.completeQueries.common.pages[0].hits[0].id = 'changed'; assert.throws(() => validatePairedBrowser(data, method));
  data = rows(); const changed = data.find(row => row.variant === 'candidate');
  const error = { name: 'RaveldexError', code: 'WORK_LIMIT_EXCEEDED', reason: null, details: { path: 'work' }, message: 'Raveldex: WORK_LIMIT_EXCEEDED' };
  changed.case.queryResults.common = { outcome: 'Refused', error }; changed.case.completeQueries.common = { outcome: 'Refused', complete: false, error, revision: 1, total: 1, hits: [], pages: [] };
  for (const sample of changed.case.warmups.filter(sample => sample.query === 'common')) Object.assign(sample, { outcome: 'Refused', error });
  for (const sample of changed.case.samples.filter(sample => sample.query === 'common')) Object.assign(sample, { outcome: 'Refused', error });
  const checked = validatePairedBrowser(data, method); assert.ok(checked.transitions.some(row => row.query === 'common' && row.observed.error.code === 'WORK_LIMIT_EXCEEDED')); assert.equal(checked.allCompleteQueryCaptures, false); assert.ok(checked.parity.some(row => row.completeCaptures === false));
  const summary = summarizePairedBrowser(data).find(row => row.variant === 'candidate' && row.execution === 'direct' && row.query === 'common');
  assert.equal(summary.failureRate, 1); assert.equal(summary.successes, 0); assert.equal(summary.p50WallMs, null); assert.equal(summary.p95WallMs, null);
});
test('paired browser quantiles use only ordinary successful samples and require100 successes for p95', () => {
  let data = rows({ ...method, samples: 100 }); data.filter(row => row.mode === 'diagnostic').forEach(row => row.case.observations.forEach(sample => sample.wallMs = 1e9));
  let summary = summarizePairedBrowser(data); assert.ok(summary.every(row => row.attempts === 100 && row.p50WallMs === 50 && row.p95WallMs === 95 && row.observedMaximumWallMs === 100));
  data = rows(); summary = summarizePairedBrowser(data); assert.ok(summary.every(row => row.p95WallMs === null && row.p50WallMs === 1));
  assert.ok(summary.every(row => row.cpu === 'Not measured' && row.heap === 'Not measured'));
  for (const fraction of [0, -1, 1.01, NaN, Infinity]) assert.throws(() => pairedBrowserQuantile([1, 2], fraction), /fraction/);
  assert.equal(pairedBrowserQuantile([1, 2], 1), 2); assert.equal(pairedBrowserQuantile([1, 2], .5), 1);
});
test('host-neutral paired browser exercise excludes warmups/complete capture from sample windows and disposes actual owner', async () => {
  let closed = 0, searches = 0, captures = 0;
  const engine = { async addMany(records) { return { revision: 1, added: records.length }; }, async search() { searches++; return result(); }, async dispose() { closed++; } };
  const actual = await exercisePairedBrowser({ create: async () => engine, records: [{ id: 'a' }], queries: [{ id: 'common', query: 'word', expectedIds: ['a'] }], mode: 'normal', samples: 2, warmups: 1, deadlineMs: 60000,
    compareObservations: strictCompare, captureComplete: async (_engine, _query, revision) => { captures++; assert.equal(revision, 1); return capture(); } });
  assert.equal(actual.outcome, 'Collected'); assert.equal(actual.samples.length, 2); assert.equal(actual.warmups.length, 1); assert.equal(actual.observations.length, 0);
  assert.equal(searches, 3); assert.equal(captures, 1); assert.equal(closed, 1); assert.ok(actual.samples.every(sample => Number.isFinite(sample.wallMs) && sample.counters === undefined));
});
test('paired browser diagnostic factory serializes and removes its global counter scope', () => {
  const make = (0, eval)('(' + localPairedDiagnostic.toString() + ')'), a = make(), b = make();
  a.start(); assert.throws(() => b.start(), /serial/); const counters = a.stop(); assert.equal(counters.emittedWorkUnits, 0);
  assert.equal(globalThis[Symbol.for('raveldex.n9.diagnostics')], undefined); assert.throws(() => a.stop(), /missing/);
});

test('browser successful references supersede early warmup refusal and still reject later score drift', async () => {
  const error = Object.assign(Error('Raveldex: WORK_LIMIT_EXCEEDED'), { code: 'WORK_LIMIT_EXCEEDED', details: { path: 'work' } });
  async function exercise(drift) {
    let calls = 0, closed = false;
    const engine = { async addMany() { return { revision: 1 }; }, async search() {
      calls++; if (calls === 1) throw error;
      const found = result(); if (drift && calls === 3) found.hits[0].score++;
      return found;
    }, async dispose() { closed = true; } };
    const actual = await exercisePairedBrowser({ create: async () => engine, records: [{ id: 'a' }], queries: [{ id: 'common', query: 'word', expectedIds: ['a'] }], mode: 'normal', samples: 2, warmups: 1, deadlineMs: 60000,
      compareObservations: strictCompare, captureComplete: async () => capture() });
    assert.equal(closed, true); return actual;
  }
  const valid = await exercise(false); assert.equal(valid.outcome, 'Collected'); assert.equal(valid.queryResults.common.outcome, 'Pass'); assert.equal(valid.queryTransitions.length, 1); assert.equal(valid.queryTransitions[0].comparison.kind, 'capacity-improvement');
  const drift = await exercise(true); assert.equal(drift.outcome, 'Fail'); assert.match(drift.failure.message, /result\/trace\/facets\/evidence\/order/);
});
test('browser cross-owner successes and successful partial pages cannot hide behind an earlier refusal', () => {
  const error = { name: 'RaveldexError', code: 'WORK_LIMIT_EXCEEDED', reason: null, details: { path: 'work' }, message: 'Raveldex: WORK_LIMIT_EXCEEDED' };
  function refusedReference() {
    const data = rows(), first = data[0];
    first.case.queryResults.common = { outcome: 'Refused', error };
    for (const sample of [...first.case.samples, ...first.case.warmups].filter(sample => sample.query === 'common')) Object.assign(sample, { outcome: 'Refused', error });
    first.case.completeQueries.common = { outcome: 'Refused', complete: false, error, revision: 1, total: 1, pages: [], hits: [] };
    return data;
  }
  assert.ok(validatePairedBrowser(refusedReference(), method).transitions.length > 0);
  let data = refusedReference(); data[2].case.queryResults.common.result.hits[0].score++; assert.throws(() => validatePairedBrowser(data, method), /result\/trace\/facets\/evidence\/order/);
  data = refusedReference(); data[2].case.completeQueries.common.pages[0].hits[0].score++; assert.throws(() => validatePairedBrowser(data, method), /result\/trace\/facets\/evidence\/order|ordered scores/);
  data = refusedReference(); data[0].case.completeQueries.common.pages.push(result()); data[0].case.completeQueries.common.pages[0].hits[0].score++;
  assert.throws(() => validatePairedBrowser(data, method), /result\/trace\/facets\/evidence\/order/);
  data = refusedReference(); data[0].case.samples[0] = { ...data[0].case.samples[0], outcome: 'Pass' }; delete data[0].case.samples[0].error;
  assert.throws(() => validatePairedBrowser(data, method), /successful query reference/);
});
test('browser error comparison keeps Unknown unproven and rejects nonresource error transitions', () => {
  const resource = { name: 'RaveldexError', code: 'WORK_LIMIT_EXCEEDED', reason: null, details: { path: 'work' }, message: 'Raveldex: WORK_LIMIT_EXCEEDED' };
  let data = rows(), row = data[2];
  const unknown = { name: 'WorkerAdapterError', code: 'TIMEOUT', reason: null, details: null, message: 'Worker: TIMEOUT' };
  row.case.queryTransitions = [{ query: 'common', reference: { outcome: 'Unknown', error: unknown }, observed: row.case.queryResults.common }];
  const checked = validatePairedBrowser(data, method); assert.ok(checked.transitions.some(change => change.comparison.kind === 'unproven-outcome' && change.stateParityVerified === false));
  data = rows(); row = data[2]; row.case.queryTransitions = [{ query: 'common', reference: { outcome: 'Refused', error: resource }, observed: { outcome: 'Rejected', error: { ...resource, code: 'INVALID_QUERY' } } }];
  assert.throws(() => validatePairedBrowser(data, method), /nonresource/);
  data = rows(); data[2].case.completeQueries.common = { outcome: 'Rejected', complete: false, revision: 1, total: 1, pages: [], hits: [], error: { ...resource, code: 'INVALID_QUERY' } };
  assert.throws(() => validatePairedBrowser(data, method), /nonresource/);
  data = rows(); row = data[2]; row.case.queryTransitions = [{ query: 'common', reference: { outcome: 'Refused', error: resource }, observed: { outcome: 'Refused', error: { ...resource, details: { path: 'different' } } } }];
  assert.throws(() => validatePairedBrowser(data, method), /typed error/);
});
