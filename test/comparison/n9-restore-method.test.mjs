import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreOutcome, priorRestoreRecords, RESTORE_OPERATIONS } from '../../bench/n9/restore-case.mjs';
import { requireRestoreCase, validateRestoreRows, summarizeRestores } from '../../bench/n9/restore-node.mjs';
const error = code => ({ name: 'RaveldexError', code, details: { path: 'work' }, message: 'Raveldex: ' + code });
function fixture(mode = 'normal', owner = 0) {
  const samples = RESTORE_OPERATIONS.map(operation => ({ operation, outcome: operation === 'build' || operation === 'exportSource' ? 'Pass' : operation === 'abortedRestore' ? 'Cancelled' : 'Refused', wallMs: 10, cpuUserMs: 2, cpuSystemMs: 1,
    ...(operation === 'build' ? { result: { revision: 1 } } : operation === 'exportSource' ? { result: { encodedBytes: 99, encodedCodeUnits: 99, encodedSha256: 'a'.repeat(64), header: { originRevision: 1 }, snapshotArtifact: 'owner' + owner } } : { error: error(operation === 'abortedRestore' ? 'CANCELLED' : operation === 'deadlineRestore' ? 'DEADLINE_EXCEEDED' : 'WORK_LIMIT_EXCEEDED'), oldQueriesPreserved: true, oldSourceBytesPreserved: true }) }));
  if (mode === 'diagnostic') for (const item of samples) item.counters = { emittedSteps: 1, emittedWorkUnits: 2, hostYields: 1, restore: { phaseWork: {}, detailWork: {}, snapshots: [], authoritativeUnchangedDuringStaging: true, oldRoot: { revision: 1, documents: 100 }, finalAuthoritativeSame: true } };
  return { outcome: 'Collected', pid: 100 + owner, mode, owner, size: 100, variant: 'source', exercise: { outcome: 'Collected', mode, size: 100, priorRecords: 100, donorResults: [{ id: 'all', outcome: 'Pass', result: { total: 100 } }], samples: mode === 'normal' ? samples : [], observations: mode === 'diagnostic' ? samples : [] } };
}
const rows = () => [fixture('normal', 0), fixture('diagnostic', 1), fixture('normal', 2)];
test('restore method preserves typed refusal/cancellation/transport uncertainty and bounded real prior inputs', () => {
  assert.equal(restoreOutcome(), 'Pass'); assert.equal(restoreOutcome(error('WORK_LIMIT_EXCEEDED')), 'Refused'); assert.equal(restoreOutcome(error('DEADLINE_EXCEEDED')), 'Refused'); assert.equal(restoreOutcome(error('CANCELLED')), 'Cancelled'); assert.equal(restoreOutcome(error('OUTCOME_UNKNOWN')), 'Unknown');
  for (const code of ['TIMEOUT', 'TERMINATED']) assert.equal(restoreOutcome({ name: 'WorkerAdapterError', code }), 'Unknown');
  assert.equal(restoreOutcome(error('INVALID_QUERY')), 'Rejected'); assert.equal(restoreOutcome({ reason: 'ENCODED_LIMIT_EXCEEDED' }), 'Refused');
  const source = Array.from({ length: 1200 }, (_, index) => ({ id: String(index), text: { body: 'source body' }, metadata: { group: 'g0' } }));
  const prior = priorRestoreRecords(source); assert.equal(prior.length, 1000); assert.deepEqual(prior[0], { id: 'prior:0', text: { body: ['n9priorstate n9red n9blue', 'source body'] }, metadata: { group: 'prior' } }); assert.equal(source[0].text.body, 'source body');
});
test('restore coverage rejects missing operations/owners/source or diagnostic preservation and never calls a refusal success', () => {
  assert.equal(validateRestoreRows(rows(), [100], ['source']).length, 3);
  let broken = rows(); broken.pop(); assert.throws(() => validateRestoreRows(broken, [100], ['source']));
  broken = rows(); broken[0].exercise.samples.pop(); assert.throws(() => requireRestoreCase(broken[0]));
  broken = rows(); broken[0].exercise.samples[2].oldSourceBytesPreserved = false; assert.throws(() => requireRestoreCase(broken[0]));
  broken = rows(); broken[0].exercise.samples[2].outcome = 'Pass'; assert.throws(() => requireRestoreCase(broken[0]));
  broken = rows(); broken[0].exercise.samples[2].error = error('INVALID_QUERY'); assert.throws(() => requireRestoreCase(broken[0]));
  broken = rows(); delete broken[1].exercise.observations[2].counters.restore.oldRoot; assert.throws(() => requireRestoreCase(broken[1]));
  broken = rows(); broken[1].exercise.observations[2].counters.restore.finalAuthoritativeSame = false; assert.throws(() => requireRestoreCase(broken[1]));
  broken = rows(); broken[2].exercise.samples[1].result.encodedSha256 = 'b'.repeat(64); assert.throws(() => validateRestoreRows(broken, [100], ['source']));
  broken = rows(); broken[2].pid = broken[0].pid; assert.throws(() => validateRestoreRows(broken, [100], ['source']));
});
test('restore summaries separate refusal/stop costs, omit intrusive rows and make blocked input explicit', () => {
  const input = rows(); input[1].exercise.observations.forEach(item => item.wallMs = 99999); const summary = summarizeRestores(input), restored = summary.find(item => item.operation === 'restoreSource');
  assert.equal(restored.attempts, 2); assert.deepEqual(restored.outcomes, { Refused: 2 }); assert.equal(restored.timingByOutcome[0].medianWallMs, 10); assert.equal('p95WallMs' in restored, false);
  const blocked = fixture(); blocked.exercise.samples[1] = { operation: 'exportSource', outcome: 'Refused', error: error('WORK_LIMIT_EXCEEDED'), wallMs: 10, donorQueriesPreserved: true };
  blocked.exercise.samples = blocked.exercise.samples.map((item, index) => index < 2 ? item : { operation: item.operation, outcome: 'Not run', reason: 'Source export did not produce an admitted snapshot' }); requireRestoreCase(blocked);
  blocked.exercise.samples[2].outcome = 'Refused'; assert.throws(() => requireRestoreCase(blocked));
  const unknown = fixture(); Object.assign(unknown.exercise.samples[2], { outcome: 'Unknown', error: error('OUTCOME_UNKNOWN'), stateClaim: 'No authoritative-state claim', authority: { status: 'pending' } }); delete unknown.exercise.samples[2].oldSourceBytesPreserved; delete unknown.exercise.samples[2].oldQueriesPreserved; requireRestoreCase(unknown);
});
