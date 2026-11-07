// Bind the owner's current preflight-only instruction; never launches a run.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { recoveryAttemptBinding, checkPrepared } from '../../../../bench/n10/host-recovery.mjs';
import { RECOVERY_RUN_POLICY_REVISION, RECOVERY_PREFLIGHT_INDEXES, validateRecoveryAuthorization } from '../../../../bench/n10/host-recovery-policy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const temporary = '/private/tmp/raveldex-rx9006-preflight-20261106-01';
const preparedPath = join(temporary, 'prepared/prepared.json');
const bytes = await readFile(preparedPath), prepared = JSON.parse(bytes);
await checkPrepared(prepared);
const binding = await recoveryAttemptBinding({ prepared: preparedPath, output: join(temporary, 'attempt') });
assert.equal(binding.policy.id, 'rx9006-recommended-preflight-2026-11-06');
assert.equal(binding.policy.budgetMs, 9000000);
assert.equal(binding.policy.perContextWatchdogMs, 360000);
assert.equal(binding.policy.preflightGateMs, 324000);
assert.equal(binding.policy.closingReserveMs, 600000);
assert.deepEqual(prepared.policyJobs.map(job => job.index), RECOVERY_PREFLIGHT_INDEXES);
assert.equal(prepared.policyJobs.length, 22);
assert.equal(binding.preflight, null);
const sha = value => createHash('sha256').update(value).digest('hex');
const instruction = await readFile(join(here, 'owner-instruction.txt'));
const issued = new Date();
const authorization = {
  kind: 'rx9006-owner-run-authorization-v1', revision: RECOVERY_RUN_POLICY_REVISION,
  issuedAt: issued.toISOString(), expiresAt: new Date(issued.getTime() + 180 * 60000).toISOString(),
  ownerInstruction: {
    reference: 'Current owner instruction in Codex chat, 6 November 2026; exact UTF-8 text with final LF: ' + join(here, 'owner-instruction.txt'),
    sha256: sha(instruction), scopes: ['preflight'],
  }, binding,
};
validateRecoveryAuthorization(authorization, binding);
assert.deepEqual(authorization.ownerInstruction.scopes, ['preflight']);
await writeFile(join(here, 'authorization.json'), JSON.stringify(authorization, null, 2) + '\n', { flag: 'wx' });
await writeFile(join(here, 'binding.json'), JSON.stringify(binding, null, 2) + '\n', { flag: 'wx' });
await writeFile(join(here, 'prepared.json.gz'), gzipSync(bytes), { flag: 'wx' });
await writeFile(join(here, 'launch-manifest.json'), JSON.stringify({
  kind: 'rx9006-recommended-preflight-launch-v1', preparedPath, preparedSha256: sha(bytes),
  output: binding.output, authorizationPath: join(here, 'authorization.json'),
  authorizationSha256: sha(await readFile(join(here, 'authorization.json'))),
  policy: binding.policy, jobs: prepared.policyJobs, sourceIdentity: prepared.sourceIdentity,
  cohortIdentity: prepared.cohortIdentity, executables: prepared.executables,
  instructionSha256: sha(instruction), preparationCommand: ['node', 'bench/n10/host-recovery.mjs', 'prepare',
    '--artifacts', 'docs/evidence/RX-9006/identity/artifacts.json', '--output', join(temporary, 'prepared'),
    '--policy', binding.policy.id],
  fullRunAuthorized: false, fullRunStarted: false, sourceRoot: root,
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'Bound, not launched', prepared: preparedPath,
  output: binding.output, policy: binding.policy.id, contexts: prepared.policyJobs.length,
  scopes: authorization.ownerInstruction.scopes, expiresAt: authorization.expiresAt }, null, 2));
