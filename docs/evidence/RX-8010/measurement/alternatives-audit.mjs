// Supplemental independent acceptance gate; never used by the timed collector.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyFrozen, workloadFor } from './workloads.mjs';
import { compareMembership, hash, summarizeAlternatives } from './alternatives-method.mjs';

export function assertBudgetError(error, definition, engine) {
  assert.equal(engine, 'raveldex', 'foreign/programming exceptions are acceptance failures');
  assert.equal(error.name, 'RaveldexError', 'unexpected exception type');
  if (definition?.expectedError) {
    assert.equal(error.code, definition.expectedError.code);
    assert.equal(error.details?.path, definition.expectedError.path);
    assert.equal(error.details?.limit, 256);
    assert.equal(error.details?.actual, 257);
  } else assert.ok(['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED'].includes(error.code), 'unexpected non-budget native exception');
}
const runKey = row => JSON.stringify([row.engine, row.family, row.size, row.owner]);
const unique = (values, message) => assert.equal(new Set(values).size, values.length, message);
function nativeCapture(capture, definition, workload) {
  assert.ok(capture && typeof capture === 'object', 'native capture required');
  assert.equal(capture.completeness, 'complete');
  assert.equal(capture.model, 'raveldex-bm25-v1');
  assert.equal(capture.revision, Math.ceil(workload.size / 256));
  assert.equal(capture.total, definition.expectedIds.length);
  assert.equal(capture.hits.length, Math.min(20, capture.total));
  unique(capture.hits.map(hit => hit.id), 'duplicate native top20 ID');
  const expected = new Set(definition.expectedIds);
  for (const hit of capture.hits) {
    assert.ok(expected.has(hit.id), 'unexpected native top20 ID');
    assert.ok(Number.isFinite(hit.score), 'nonfinite native score');
  }
}
export async function auditAlternatives(directory) {
  const bytes = await readFile(join(directory, 'report.json')), report = JSON.parse(bytes), rows = [], failedRows = [];
  assert.equal(report.inputsUnchanged, true);
  assert.deepEqual(report.modulesAfter, report.modulesBefore, 'recorded installed inventories differ');
  const { engines, families, sizes, owners } = report.method;
  assert.ok(Number.isSafeInteger(owners) && owners > 0);
  for (const list of [engines, families, sizes]) { assert.ok(Array.isArray(list) && list.length); unique(list, 'duplicate matrix dimension'); }
  const expectedRuns = new Set();
  for (let owner = 0; owner < owners; owner++) for (const engine of engines) for (const family of families) for (const size of sizes)
    expectedRuns.add(runKey({ engine, family, size, owner }));
  assert.equal(report.runs.length, expectedRuns.size, 'lost or extra child');
  const keys = new Set(); let errors = 0, complete = 0, equivalent = 0, mismatched = 0, samples = 0;
  const safeFile = file => assert.ok(typeof file === 'string' && !isAbsolute(file) && !file.split(/[\\/]/u).includes('..'), 'unsafe raw child path');
  const finiteSample = sample => assert.ok([sample.wallMs, sample.cpuUserMs, sample.cpuSystemMs].every(value => Number.isFinite(value) && value >= 0));
  const failedFiles = new Set();
  for (const attempt of report.failedAttempts ?? []) {
    assert.ok(Number.isInteger(attempt.exitCode) && attempt.exitCode !== 0, 'failed attempt must retain nonzero exit');
    assert.ok(expectedRuns.has(runKey(attempt)), 'failed attempt outside Cartesian matrix');
    safeFile(attempt.file); assert.ok(!failedFiles.has(attempt.file), 'duplicate failed attempt'); failedFiles.add(attempt.file);
    assert.ok(!report.runs.some(run => run.file === attempt.file), 'failed attempt cannot replace accepted run');
    const failed = JSON.parse(await readFile(join(directory, attempt.file))); failedRows.push(failed);
    assert.equal(runKey(failed), runKey(attempt)); assert.equal(failed.status, 'Fail');
    assert.equal(failed.engine, 'raveldex', 'unexpected foreign failed attempt');
    const workload = verifyFrozen(workloadFor(failed.family, failed.size)); assert.deepEqual(failed.identity, workload.identity);
    assert.deepEqual(failed.queries, []); assert.deepEqual(failed.warmups, []); assert.deepEqual(failed.captures, {});
    assert.equal(failed.samples.length, 1, 'only the documented native build budget refusal is retryable here');
    const sample = failed.samples[0]; assert.equal(sample.operation, 'build'); assert.equal(sample.phase, 'fresh-owner'); assert.equal(sample.outcome, 'Refused');
    finiteSample(sample); assertBudgetError(sample.error, undefined, failed.engine); errors++;
    assert.equal(failed.failure.name, 'Error'); assert.equal(failed.failure.code, null);
    assert.equal(failed.failure.message, 'admitted build failed: ' + sample.error.message, 'failed wrapper must preserve actual raw budget reason');
    const retry = report.runs.filter(run => run.retryOf === attempt.file); assert.equal(retry.length, 1, 'failed attempt needs its explicit accepted retry');
    assert.equal(runKey(retry[0]), runKey(attempt), 'retry must be same matrix cell');
  }
  if (failedRows.length || report.attemptSummaries !== undefined) assert.deepEqual(report.attemptSummaries, summarizeAlternatives(failedRows), 'failed attempt summaries differ from raw refusals');
  for (const run of report.runs) {
    assert.equal(run.exitCode, 0);
    const key = runKey(run); assert.ok(expectedRuns.has(key), 'child outside expected Cartesian matrix'); assert.ok(!keys.has(key), 'duplicate child'); keys.add(key);
    safeFile(run.file);
    if (run.retryOf !== undefined) assert.ok(failedFiles.has(run.retryOf), 'retry lost its failed source attempt');
    const row = JSON.parse(await readFile(join(directory, run.file))); rows.push(row);
    assert.equal(row.status, 'Collected'); assert.equal(runKey(row), key);
    const workload = verifyFrozen(workloadFor(row.family, row.size));
    assert.deepEqual(row.identity, workload.identity);
    const knownIds = new Set(workload.records.map(record => record.id));
    assert.equal(row.queries.length, workload.queries.length, 'lost query row'); unique(row.queries.map(q => q.id), 'duplicate query ID');
    assert.deepEqual([...row.queries.map(q => q.id)].sort(), workload.queries.map(q => q.id).sort(), 'source query set differs');
    assert.equal(row.samples.filter(sample => sample.operation === 'build').length, 1, 'one build required');
    assert.equal(row.samples.find(sample => sample.operation === 'build').outcome, 'Pass');
    const expectedCaptures = new Set(), allowedOperations = new Set(['build']);
    for (const q of row.queries) {
      const definition = workload.queries.find(item => item.id === q.id), operation = 'query:' + q.id;
      allowedOperations.add(operation);
      assert.deepEqual(q.query, definition.query, 'source query drift');
      assert.equal(q.expectedTotal, definition.expectedIds.length);
      assert.equal(q.expectedIdsSha256, hash([...definition.expectedIds].sort()));
      assert.deepEqual(q.expectedError, definition.expectedError ?? null);
      assert.ok(['Native exact-total/top20 control', 'Equivalent membership', 'Not comparable', 'Refused'].includes(q.status), 'unexpected query status');
      if (q.status === 'Refused') { assert.ok(q.error, 'refusal missing error'); assertBudgetError(q.error, definition, row.engine); errors++; }
      else assert.equal(q.error, undefined, 'nonrefused query contains error');
      if (q.status === 'Not comparable') assert.ok(typeof q.reason === 'string' && q.reason.length, 'unsupported row missing reason');
      if (row.engine === 'raveldex') {
        if (definition.expectedError) assert.equal(q.status, 'Refused', 'expected native expansion refusal absent');
        else if (definition.kind === 'phrase') assert.equal(q.status, 'Not comparable', 'core-only phrase must remain unsupported');
        else assert.ok(['Native exact-total/top20 control', 'Refused'].includes(q.status));
        if (q.status === 'Native exact-total/top20 control') {
          nativeCapture(q.capture, definition, workload);
          if (row.owner === 0) {
            assert.ok(q.completeMembership, 'owner0 complete membership observation required');
            assert.ok(['Equivalent membership', 'Refused'].includes(q.completeMembership.status));
            if (q.completeMembership.status === 'Equivalent membership') {
              assert.equal(compareMembership({ ids: q.completeIds, total: q.completeIds.length }, definition.expectedIds).status, 'Equivalent membership'); complete++;
            } else { assertBudgetError(q.completeMembership.error, { ...definition, expectedError: undefined }, row.engine); errors++; }
          }
        }
      } else {
        if (definition.expectedError) { assert.equal(q.status, 'Not comparable'); assert.equal(q.capture, undefined, 'foreign cap refusal cannot be synthesized'); }
        if (q.capture) {
          const compared = compareMembership(q.capture, definition.expectedIds);
          assert.ok(q.capture.ids.every(id => knownIds.has(id)), 'unknown foreign source ID');
          if (row.engine === 'fuse') assert.equal(q.status, 'Not comparable', 'fuzzy coincidence is not lexical equivalence');
          else { assert.equal(q.status, compared.status); if (q.status === 'Equivalent membership') equivalent++; else mismatched++; }
        } else assert.equal(q.status, 'Not comparable', 'equivalent foreign result missing capture');
      }
      if (q.capture) expectedCaptures.add(hash(q.capture));
      const timedEligible = q.status === 'Native exact-total/top20 control' || q.status === 'Equivalent membership' || row.engine === 'fuse' && Boolean(q.capture);
      const querySamples = row.samples.filter(sample => sample.operation === operation);
      assert.equal(querySamples.length, timedEligible ? row.size === 100 ? 40 : 2 : 0, 'missing/extra repeated samples');
      const warmups = row.warmups.filter(warmup => warmup.query === q.id);
      assert.equal(warmups.length, timedEligible ? 2 : 0, 'missing/extra warmups');
      if (timedEligible) assert.deepEqual(warmups.map(warmup => warmup.index).sort(), [0, 1]);
      for (const sample of querySamples) {
        assert.equal(sample.phase, 'after-two-warmups');
        if (sample.outcome === 'Pass') { assert.equal(sample.error, undefined); assert.equal(sample.resultSha256, hash(q.capture), 'successful sample missing/wrong capture hash'); }
        else { assert.equal(sample.outcome, 'Refused'); assertBudgetError(sample.error, definition, row.engine); errors++; assert.equal(sample.resultSha256, undefined); }
      }
    }
    for (const warmup of row.warmups) assert.ok(row.queries.some(q => q.id === warmup.query), 'unknown warmup query');
    assert.deepEqual(Object.keys(row.captures).sort(), [...expectedCaptures].sort(), 'missing/extra raw capture');
    for (const [captureHash, capture] of Object.entries(row.captures)) assert.equal(hash(capture), captureHash, 'raw capture hash mismatch');
    for (const sample of row.samples) {
      samples++; assert.ok(allowedOperations.has(sample.operation), 'unknown sampled operation');
      finiteSample(sample);
    }
  }
  assert.deepEqual([...keys].sort(), [...expectedRuns].sort(), 'Cartesian coverage differs');
  assert.deepEqual(report.summaries, summarizeAlternatives(rows), 'derived summaries differ from raw samples');
  assert.deepEqual(report.coverage, rows.flatMap(row => row.queries.map(q => ({ engine: row.engine, family: row.family, size: row.size, owner: row.owner, id: q.id, status: q.status, reason: q.reason ?? null, completeMembership: q.completeMembership ?? null }))), 'derived coverage differs from raw rows');
  return { kind: 'rx8010-independent-acceptance-audit-v1', status: 'Pass', reportSha256: hash(bytes), children: rows.length, failedBuildAttempts: failedRows.length, failedBuildSamples: failedRows.reduce((sum, row) => sum + row.samples.length, 0), samples, typedBudgetErrors: errors, verifiedCompleteNativeQueries: complete, equivalentForeignRows: equivalent, observedMismatchRows: mismatched,
    notes: 'Expected Cartesian/query coverage, mandatory samples/warmups/captures, native pages, foreign memberships, raw errors and derived summaries verified. Unsupported rows and fuzzy/static tracks remain separate.' };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await auditAlternatives(resolve(process.argv[2]));
  await writeFile(resolve(process.argv[3]), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
}
