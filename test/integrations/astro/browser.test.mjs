import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { measurePackedAstro } from '../../measurements/astro-package.mjs';

let report;
before(async () => { report = await measurePackedAstro(); if (process.env.RAVELDEX_ASTRO_PACKAGE_REPORT) await writeFile(process.env.RAVELDEX_ASTRO_PACKAGE_REPORT, JSON.stringify(report, null, 2) + '\n'); });

test('genuine paired-package Astro builds preserve independent complete native results and navigation after deployment-base changes', () => {
  assert.equal(report.status, 'Pass'); assert.equal(report.corePackage.private, false); assert.equal(report.integrationPackage.private, false); assert.equal(report.environment.astro, '7.3.2'); assert.deepEqual(report.builds.map(item => item.base), ['/', '/docs/']); assert.equal(report.correctness.browserComparisons, 42); assert.equal(report.correctness.nodeSourceNativeComparisons, 84); assert.ok(report.builds.every(item => item.browser.pageErrors.length === 0 && item.browser.externalRequests.length === 0)); assert.equal(report.corpus.records, 3);
});
test('source/default and exact-Node native artifacts preserve explicit lazy display loading and finite accessible native UI behavior', () => {
  for (const build of report.builds) { assert.deepEqual(build.node.formats.map(item => item.format), ['source', 'native']); assert.equal(build.node.failures.length, 4); assert.equal(build.browser.observations[0].optionalDisplayRequestsBeforeOpen, 0); assert.equal(build.browser.observations[0].delayedDisplayUnload.openDisabled,true); assert.equal(build.browser.observations[0].delayedDisplayUnload.state,'unloaded'); assert.equal(build.browser.observations[0].nativeBrowserRefusal.reason, 'UNQUALIFIED_PROFILE'); assert.equal(build.browser.observations[1].authoredFallbackRestored, true); assert.deepEqual(build.browser.observations[1].axe.violations, []); assert.equal(build.browser.observations[2].excludedQueryTotal, 0); }
});
test('reserved namespaces, declarations, exact installed examples and import graphs keep framework behavior outside unchanged core', () => {
  assert.equal(report.coreUnchanged.currentPackageSha256, report.corePackage.sha256);
  assert.deepEqual(report.coreUnchanged.currentAfterIntegration, report.coreUnchanged.currentBeforeIntegration);
  assert.equal(report.hookOwnership.status, 'Pass'); assert.equal(report.hookOwnership.capturedMaxHits,2); assert.equal(report.hookOwnership.getterCalls,0); assert.equal(report.collision.userWitnessPreserved, true); assert.equal(report.collision.manifestWritten, false); assert.match(report.declarations, /no Node ambient/); assert.equal(report.documentation.stdout, '1 /docs/\n'); assert.equal(report.coreUnchanged.status, 'Pass'); assert.ok(report.startup.every(row => row.reads.length === 0 && row.callbacks === 0)); assert.ok(report.core.inputs.every(item => !item.path.includes('raveldex-astro'))); assert.deepEqual(report.integrationPackage.runtimeDependencies ?? [], []);
});
