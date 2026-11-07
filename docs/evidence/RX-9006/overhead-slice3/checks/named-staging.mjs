// Static preparation/import/syntax only: no collection, authorization or engine.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { prepareRecovery, checkPrepared, recoveryAttemptBinding, RECOVERY_METHOD } from '../../../../../bench/n10/host-recovery.mjs';
import { RECOVERY_RUN_POLICIES, RECOVERY_RUN_POLICY_REVISION, recoveryPolicyJobs } from '../../../../../bench/n10/host-recovery-policy.mjs';
import { RECOVERY_PROFILE_REVISION } from '../../../../../bench/n10/host-recovery-profile.mjs';
import { RECOVERY_VERIFICATION_REVISION } from '../../../../../bench/n10/host-recovery-case.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../..');
const temporary = '/private/tmp/raveldex-rx9006-overhead-slice3-20261106';
await mkdir(temporary, { recursive: true });
const attempt = process.argv[2] ?? 'staging-only-01';
assert.match(attempt, /^staging-only-\d\d$/);
const output = join(temporary, attempt);
await mkdir(output);
const sha = value => createHash('sha256').update(value).digest('hex');
const sourcePaths = ['bench/n10/host-recovery.mjs', 'bench/n10/host-recovery-case.mjs',
  'bench/n10/host-recovery-verification.mjs', 'bench/n10/host-recovery-profile.mjs',
  'bench/n10/host-recovery-policy.mjs', 'bench/n10/host-recovery-policy-child.mjs',
  'bench/n10/host-recovery-supervisor.mjs', 'bench/n9/bulk-verify.mjs'];
const pins = () => Promise.all(sourcePaths.map(async path => ({ path, sha256: sha(await readFile(join(root, path))) })));
const before = await pins(), startedAt = new Date().toISOString(), policies = [];
for (const policy of RECOVERY_RUN_POLICIES) {
  const directory = join(output, policy.id);
  const prepared = await prepareRecovery({ artifacts: join(root, 'docs/evidence/RX-9006/identity/artifacts.json'), output: directory, policy: policy.id });
  await checkPrepared(prepared);
  assert.deepEqual(prepared.runPolicy, policy);
  assert.deepEqual(prepared.policyRevision, RECOVERY_RUN_POLICY_REVISION);
  assert.deepEqual(prepared.policyJobs, recoveryPolicyJobs(prepared.jobs, policy));
  assert.deepEqual(prepared.method, RECOVERY_METHOD);
  assert.equal(prepared.method.contexts, 204);
  assert.equal(prepared.method.budgetMs, 10800000);
  assert.equal(prepared.method.perContextWatchdogMs, 300000);
  assert.deepEqual(prepared.verificationRevision, RECOVERY_VERIFICATION_REVISION);
  assert.deepEqual(prepared.profilingRevision, RECOVERY_PROFILE_REVISION);
  for (const path of sourcePaths.slice(4, 7)) assert.ok(prepared.harness.some(pin => pin.path === path));
  const checks = [];
  for (const [name, item] of Object.entries(prepared.packages)) {
    assert.equal(execFileSync(process.execPath, ['--check', join(item.directory, 'node-child.mjs')], { encoding: 'utf8' }), '');
    const module = await import(pathToFileURL(join(item.directory, 'host-recovery-case.mjs')).href);
    assert.deepEqual(module.RECOVERY_VERIFICATION_REVISION, RECOVERY_VERIFICATION_REVISION);
    const profiling = await import(pathToFileURL(join(item.directory, 'host-recovery-profile.mjs')).href);
    assert.deepEqual(profiling.RECOVERY_PROFILE_REVISION, RECOVERY_PROFILE_REVISION);
    const helper = await import(pathToFileURL(join(item.directory, 'host-recovery-verification.mjs')).href);
    assert.equal(typeof helper.createRecoveryVerification, 'function');
    for (const type of ['app', 'worker']) {
      const bundle = prepared.bundles[name][type];
      assert.equal(sha(await readFile(join(item.directory, bundle.file))), bundle.sha256);
      for (const file of ['host-recovery-case.mjs', 'host-recovery-verification.mjs', 'host-recovery-profile.mjs']) assert.ok(Object.keys(bundle.inputs).includes(file));
    }
    checks.push({ package: name, mode: item.mode, nodeChildSyntax: 'Pass', supportImports: 'Pass', bundles: 'Pass' });
  }
  let binding;
  if (policy.phase === 'preflight') {
    binding = await recoveryAttemptBinding({ prepared: directory, output: join(output, policy.id + '-not-started') });
    assert.deepEqual(binding.policy, policy);
    assert.deepEqual(binding.baseMethod, RECOVERY_METHOD);
  }
  const blob = await readFile(join(directory, 'prepared.json'));
  await writeFile(join(here, policy.id + '-prepared.json.gz'), gzipSync(blob));
  policies.push({ policy, directory, preparedSha256: sha(blob), sourceIdentity: prepared.sourceIdentity,
    cohortIdentity: prepared.cohortIdentity, executables: prepared.executables, bindingReadOnly: binding ?? 'Not invoked: full binding requires real passing preflight', checks });
}
for (const item of policies) {
  assert.equal(item.sourceIdentity, policies[0].sourceIdentity);
  assert.equal(item.cohortIdentity, policies[0].cohortIdentity);
  assert.deepEqual(item.executables, policies[0].executables);
}
assert.equal(execFileSync(process.execPath, ['--check', join(root, 'bench/n10/host-recovery-policy-child.mjs')], { encoding: 'utf8' }), '');
assert.deepEqual(await pins(), before);
const report = { status: 'Pass', startedAt, finishedAt: new Date().toISOString(), output,
  policies, sourceInputsUnchanged: before, stagedPackages: policies.length * 6, browserBundles: policies.length * 12,
  contextsExecuted: 0, engineFactoriesInvoked: 0, executionAuthorizationCreated: false,
  scope: 'Four named preparations only; actual sealed bytes, same compiled cohort across stages, 24 package copies/child syntax checks, support imports and 48 bundles. No generated entry, collector, launcher, engine, canary or benchmark is executed. Full launch binding remains unavailable without actual passing preflight.' };
await writeFile(join(here, 'staging.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, namedPolicies: policies.length, stagedPackages: report.stagedPackages, browserBundles: report.browserBundles, contextsExecuted: 0 }, null, 2));
