import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { measureInspectorPackage } from '../../measurements/inspector-package.mjs';
let report;
before(async()=>{report=await measureInspectorPackage();});
test('installed public Inspector declarations, complete native facts and original source agree with independent source expectations and minified consumer',()=>{
 assert.equal(report.correctness.completeComparisonsPerRun,27);assert.equal(report.correctness.selectedDocumentComparisonsPerRun,108);
 assert.equal(report.correctness.status,'Pass');assert.equal(report.correctness.bundledParity,'Pass');assert.equal(report.declarations.status,'Pass');assert.equal(report.compiledFiles.status,'Pass');
});
test('core/Inspector full graphs preserve optional boundaries, startup has no host access and private paths fail',()=>{
 assert.equal(report.core.targetGzipBytes,15360);assert.equal(report.core.targetMet,report.core.gzipBytes<=15360);
 assert.ok(report.core.inputs.every(i=>!/addons|adapters/.test(i.path)));assert.ok(report.privateDenial.every(i=>i.code==='ERR_PACKAGE_PATH_NOT_EXPORTED'));assert.ok(report.startup.every(i=>i.reads.length===0));
});
