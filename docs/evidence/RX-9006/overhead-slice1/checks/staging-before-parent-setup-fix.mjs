// Build/import/syntax verification only. No engine factory or collector call.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { prepareRecovery, RECOVERY_METHOD } from '../../../../../bench/n10/host-recovery.mjs';
import { RECOVERY_VERIFICATION_REVISION } from '../../../../../bench/n10/host-recovery-case.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../..');
const output = '/private/tmp/raveldex-rx9006-overhead-slice1-20261106/staging-only-01';
const sha = value => createHash('sha256').update(value).digest('hex');
const sourcePaths = ['bench/n10/host-recovery.mjs', 'bench/n10/host-recovery-case.mjs',
  'bench/n10/host-recovery-verification.mjs', 'bench/n9/bulk-verify.mjs'];
const before = await Promise.all(sourcePaths.map(async path => ({ path, sha256: sha(await readFile(join(root, path))) })));
const startedAt = new Date().toISOString();
const prepared = await prepareRecovery({
  artifacts: join(root, 'docs/evidence/RX-9006/identity/artifacts.json'), output,
});
assert.deepEqual(prepared.verificationRevision, RECOVERY_VERIFICATION_REVISION);
assert.deepEqual(prepared.method, RECOVERY_METHOD);
assert.equal(prepared.method.contexts, 204);
assert.equal(prepared.method.budgetMs, 10800000);
assert.equal(prepared.method.perContextWatchdogMs, 300000);
const checks = [];
for (const [name, item] of Object.entries(prepared.packages)) {
  const syntax = execFileSync(process.execPath, ['--check', join(item.directory, 'node-child.mjs')], { encoding: 'utf8' });
  assert.equal(syntax, '');
  const module = await import(pathToFileURL(join(item.directory, 'host-recovery-case.mjs')).href);
  assert.deepEqual(module.RECOVERY_VERIFICATION_REVISION, RECOVERY_VERIFICATION_REVISION);
  const helper = await import(pathToFileURL(join(item.directory, 'host-recovery-verification.mjs')).href);
  assert.equal(typeof helper.createRecoveryVerification, 'function');
  for (const type of ['app', 'worker']) {
    const bundle = prepared.bundles[name][type];
    assert.equal(sha(await readFile(join(item.directory, bundle.file))), bundle.sha256);
    assert.ok(Object.keys(bundle.inputs).includes('host-recovery-verification.mjs'));
  }
  checks.push({ package: name, nodeChildSyntax: 'Pass', supportModuleImports: 'Pass',
    browserBundleHelperInput: 'Pass', mode: item.mode });
}
const after = await Promise.all(sourcePaths.map(async path => ({ path, sha256: sha(await readFile(join(root, path))) })));
assert.deepEqual(after, before);
const blob = await readFile(join(output, 'prepared.json'));
await writeFile(join(here, 'staging-prepared.json.gz'), gzipSync(blob));
const report = { status: 'Pass', startedAt, finishedAt: new Date().toISOString(), output,
  contextsPlannedOnly: 204, contextsExecuted: 0, engineFactoriesInvoked: 0,
  preparedSha256: sha(blob), verificationRevision: RECOVERY_VERIFICATION_REVISION,
  method: RECOVERY_METHOD, sourceInputsUnchanged: before, checks,
  scope: 'Six isolated package staging copies, generated Node-child syntax, pure support imports and twelve browser bundles only. No child execution, engine initialization, queries, canary or collection. Not measurement qualification.' };
await writeFile(join(here, 'staging.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, stagedPackages: checks.length,
  browserBundles: checks.length * 2, contextsExecuted: 0 }, null, 2));
