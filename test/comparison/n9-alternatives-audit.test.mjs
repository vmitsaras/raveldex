import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertBudgetError, auditAlternatives } from '../../bench/n9/alternatives-audit.mjs';
import { workloadFor, verifyFrozen } from '../../bench/n9/workloads.mjs';
import { hash, compareMembership, summarizeAlternatives } from '../../bench/n9/alternatives-method.mjs';

test('acceptance audit rejects programming errors and unmatched native cap details', () => {
  assert.throws(() => assertBudgetError({ name: 'TypeError', code: null }, {}, 'raveldex'));
  assert.throws(() => assertBudgetError({ name: 'AssertionError', code: 'ERR_ASSERTION' }, {}, 'raveldex'));
  assert.throws(() => assertBudgetError({ name: 'RaveldexError', code: 'WORK_LIMIT_EXCEEDED' }, {}, 'minisearch'));
  assert.doesNotThrow(() => assertBudgetError({ name: 'RaveldexError', code: 'WORK_LIMIT_EXCEEDED' }, {}, 'raveldex'));
  const definition = { expectedError: { code: 'LIMIT_EXCEEDED', path: 'expansions.group' } };
  const error = { name: 'RaveldexError', code: 'LIMIT_EXCEEDED', details: { path: 'expansions.group', limit: 256, actual: 257 } };
  assert.doesNotThrow(() => assertBudgetError(error, definition, 'raveldex'));
  assert.throws(() => assertBudgetError({ ...error, details: { ...error.details, actual: 300 } }, definition, 'raveldex'));
  assert.throws(() => assertBudgetError({ ...error, code: 'MISSING_CAPABILITY' }, definition, 'raveldex'));
});

function fixture() {
  const workload = verifyFrozen(workloadFor('adversarial', 100));
  const row = { engine: 'raveldex', family: workload.family, size: workload.size, owner: 0, status: 'Collected', identity: workload.identity, queries: [], samples: [{ operation: 'build', phase: 'fresh-owner', outcome: 'Pass', wallMs: 1, cpuUserMs: 1, cpuSystemMs: 0 }], warmups: [], captures: {} };
  for (const definition of workload.queries) {
    const q = { id: definition.id, query: definition.query, expectedTotal: definition.expectedIds.length, expectedIdsSha256: hash([...definition.expectedIds].sort()), expectedError: definition.expectedError ?? null };
    row.queries.push(q);
    if (definition.expectedError) { q.status = 'Refused'; q.error = { name: 'RaveldexError', code: 'LIMIT_EXCEEDED', details: { path: 'expansions.group', limit: 256, actual: 257 } }; continue; }
    if (definition.kind === 'phrase') { q.status = 'Not comparable'; q.reason = 'Core-only native configuration'; continue; }
    q.status = 'Native exact-total/top20 control';
    q.capture = { completeness: 'complete', model: 'raveldex-bm25-v1', revision: 1, total: definition.expectedIds.length, hits: definition.expectedIds.slice(0, 20).map(id => ({ id, score: 1 })) };
    q.completeIds = [...definition.expectedIds]; q.completeMembership = compareMembership({ ids: q.completeIds, total: q.completeIds.length }, definition.expectedIds);
    const key = hash(q.capture); row.captures[key] = q.capture;
    row.warmups.push({ query: q.id, index: 0 }, { query: q.id, index: 1 });
    for (let index = 0; index < 40; index++) row.samples.push({ operation: 'query:' + q.id, phase: 'after-two-warmups', outcome: 'Pass', wallMs: index / 100, cpuUserMs: .1, cpuSystemMs: 0, resultSha256: key });
  }
  const report = { inputsUnchanged: true, modulesBefore: [], modulesAfter: [], method: { owners: 1, engines: ['raveldex'], families: ['adversarial'], sizes: [100] }, runs: [{ engine: row.engine, family: row.family, size: row.size, owner: 0, exitCode: 0, file: 'child.json' }] };
  refresh(report, row); return { report, row };
}
function refresh(report, row) {
  report.summaries = summarizeAlternatives([row]);
  report.coverage = row.queries.map(q => ({ engine: row.engine, family: row.family, size: row.size, owner: row.owner, id: q.id, status: q.status, reason: q.reason ?? null, completeMembership: q.completeMembership ?? null }));
}
async function withFixture(mutate, expected) {
  const { report, row } = fixture(), directory = await mkdtemp(join(tmpdir(), 'raveldex-alternatives-audit-'));
  try {
    mutate?.(report, row);
    await writeFile(join(directory, 'report.json'), JSON.stringify(report)); await writeFile(join(directory, 'child.json'), JSON.stringify(row));
    if (expected) await assert.rejects(auditAlternatives(directory), expected);
    else { const audited = await auditAlternatives(directory); assert.equal(audited.status, 'Pass'); assert.equal(audited.children, 1); assert.equal(audited.verifiedCompleteNativeQueries, 6); }
  } finally { await rm(directory, { recursive: true, force: true }); }
}
test('supplemental gate accepts a complete internally consistent raw observation fixture', () => withFixture());
const cases = [
  ['all repeats removed', (report, row) => { row.samples = row.samples.filter(sample => sample.operation !== 'query:common'); refresh(report, row); }, /repeated samples/],
  ['one repeated sample removed', (report, row) => { row.samples.pop(); refresh(report, row); }, /repeated samples/],
  ['successful sample missing hash', (_report, row) => { delete row.samples[1].resultSha256; }, /capture hash/],
  ['successful sample wrong hash', (_report, row) => { row.samples[1].resultSha256 = 'foreign'; }, /capture hash/],
  ['query capture missing', (_report, row) => { delete row.queries[0].capture; }, /native capture required/],
  ['stored capture missing', (_report, row) => { delete row.captures[Object.keys(row.captures)[0]]; }, /raw capture/],
  ['query row missing', (_report, row) => { row.queries.pop(); }, /lost query/],
  ['duplicate query ID', (_report, row) => { row.queries[1].id = row.queries[0].id; }, /duplicate query/],
  ['changed source query', (_report, row) => { row.queries[0].query = { kind: 'all' }; }, /source query drift/],
  ['out-of-matrix owner', (report, row) => { report.runs[0].owner = row.owner = 1; }, /Cartesian matrix/],
  ['lost child', report => { report.runs = []; }, /lost or extra child/],
  ['missing native pages', (_report, row) => { delete row.queries[0].completeMembership; }, /complete membership observation/],
  ['corrupt native complete membership', (_report, row) => { row.queries[0].completeIds.pop(); }, /Equivalent membership/],
  ['duplicate native top20 ID', (_report, row) => { row.queries[0].capture.hits[1].id = row.queries[0].capture.hits[0].id; }, /duplicate native/],
  ['wrong native total', (_report, row) => { row.queries[0].capture.total--; }, /Expected values/],
  ['missing warmup', (report, row) => { row.warmups.pop(); refresh(report, row); }, /warmups/],
  ['unexpected exception labeled refusal', (_report, row) => { row.queries[6].error = { name: 'TypeError', code: null }; }, /unexpected exception/],
  ['summary corruption', report => { report.summaries[0].count++; }, /derived summaries/],
  ['coverage corruption', report => { report.coverage.pop(); }, /derived coverage/],
];
for (const [name, mutate, error] of cases) test(`supplemental gate rejects ${name}`, () => withFixture(mutate, error));

function withFailedBuild(report, row) {
  report.failedAttempts = [{ ...report.runs[0], exitCode: 1, file: 'failed.json' }];
  report.runs[0].retryOf = 'failed.json';
  const error = { name: 'RaveldexError', code: 'DEADLINE_EXCEEDED', message: 'Raveldex: DEADLINE_EXCEEDED', details: null };
  const failed = { engine: row.engine, family: row.family, size: row.size, owner: row.owner, identity: row.identity, status: 'Fail', queries: [], warmups: [], captures: {}, samples: [{ operation: 'build', phase: 'fresh-owner', outcome: 'Refused', wallMs: 77600, cpuUserMs: 8000, cpuSystemMs: 200, error }], failure: { name: 'Error', code: null, message: 'admitted build failed: ' + error.message } };
  report.attemptSummaries = summarizeAlternatives([failed]); return failed;
}
async function auditRetry(mutate, expected) {
  const { report, row } = fixture(), failed = withFailedBuild(report, row), directory = await mkdtemp(join(tmpdir(), 'raveldex-alternatives-retry-audit-'));
  try {
    mutate?.(report, row, failed);
    await writeFile(join(directory, 'report.json'), JSON.stringify(report)); await writeFile(join(directory, 'child.json'), JSON.stringify(row)); await writeFile(join(directory, 'failed.json'), JSON.stringify(failed));
    if (expected) await assert.rejects(auditAlternatives(directory), expected);
    else { const audited = await auditAlternatives(directory); assert.equal(audited.failedBuildAttempts, 1); assert.equal(audited.failedBuildSamples, 1); assert.equal(audited.samples, row.samples.length); }
  } finally { await rm(directory, { recursive: true, force: true }); }
}
test('failed native build attempts remain separate and keep explicit retry identity', () => auditRetry());
for (const [name, mutate, error] of [
  ['failed attempt lost retry link', report => { delete report.runs[0].retryOf; }, /explicit accepted retry/],
  ['failed build mislabeled programming exception', (_report, _row, failed) => { failed.samples[0].error.name = 'TypeError'; }, /unexpected exception/],
  ['failed build lost raw refusal summary', report => { report.attemptSummaries = []; }, /failed attempt summaries/],
  ['failed attempt silently pooled into accepted summaries', (report, row, failed) => { report.summaries = summarizeAlternatives([row, failed]); }, /derived summaries/],
  ['failed attempt contains partial query results', (_report, _row, failed) => { failed.queries = [{ id: 'common' }]; }, /Expected values/],
  ['retry points outside retained attempts', report => { report.runs[0].retryOf = 'missing.json'; }, /explicit accepted retry/],
]) test(`supplemental gate rejects ${name}`, () => auditRetry(mutate, error));
