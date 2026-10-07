import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { measureEvidencePackage } from '../../measurements/evidence-package.mjs';
let report;
before(async()=>{report=await measureEvidencePackage();});
test('installed range/snippet declarations and real-document results match independent occurrences and minified source/offset/mixed consumers',()=>{
 assert.equal(report.correctness.status,'Pass');assert.equal(report.correctness.completeComparisonsPerRun,198);assert.equal(report.correctness.selectedDocumentComparisonsPerRun,792);
 assert.ok(report.correctness.originalRangeComparisonsPerRun>0);assert.ok(report.correctness.snippetWindowsPerRun>0);assert.equal(report.correctness.bundledParity,'Pass');assert.equal(report.declarations.status,'Pass');assert.equal(report.compiledFiles.status,'Pass');
});
test('full optional graphs, lazy startup and private exports preserve core and range-only boundaries',()=>{
 assert.equal(report.core.targetGzipBytes,15360);assert.equal(report.core.targetMet,report.core.gzipBytes<=15360);assert.ok(report.core.inputs.every(i=>!/addons|adapters/.test(i.path)));
 assert.ok(report.graphs.evidence.inputs.every(i=>!/snippets\//.test(i.path)));assert.ok(report.startup.every(i=>i.reads.length===0));assert.ok(report.privateDenial.every(i=>i.code==='ERR_PACKAGE_PATH_NOT_EXPORTED'));
});
