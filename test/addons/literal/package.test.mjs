import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {measurePackedLiteral} from '../../measurements/literal-package.mjs';
let report;
before(async()=>{report=await measurePackedLiteral();if(process.env.RAVELDEX_LITERAL_PACKAGE_REPORT)await writeFile(process.env.RAVELDEX_LITERAL_PACKAGE_REPORT,JSON.stringify(report,null,2)+'\n');});
test('actual offline-installed and minified literal consumers preserve exact source membership, zero-score predicates and mixed BM25 pages',()=>{
  assert.equal(report.correctness.status,'Pass');assert.equal(report.correctness.authoredQueries,25);assert.equal(report.correctness.fullPageComparisonsPerRun,75);assert.equal(report.correctness.ordinaryQueries,10);assert.equal(report.correctness.bundledParity,'Pass');assert.equal(report.correctness.unrequestedCapability,'Pass');assert.equal(report.package.private,false);assert.equal(report.packed.typed.length,4);assert.match(report.packed.numerical,/handwritten basic frequencies/);
});
test('literal source/native restore preserves overlaps, raw Unicode spans, Boolean evidence and analyzer-independent membership',()=>{
  assert.equal(report.snapshots.status,'Pass');assert.equal(report.snapshots.comparisons,58);assert.equal(report.snapshots.mismatchRefusals,4);assert.equal(report.snapshots.mismatchRows.filter(row=>row.change==='selected analyzer only, identical manifests'&&row.reason==='ANALYZER_MISMATCH').length,2);assert.equal(report.snapshots.mismatchRows.filter(row=>row.change==='literal version only'&&row.reason==='CAPABILITY_MISMATCH').length,2);assert.equal(report.snapshots.analyzerComparisons,38);assert.equal(report.snapshots.rows.length,2);assert.equal(report.documentation.status,'Pass');assert.match(report.snapshots.qualificationScope,/no all-Unicode or cross-host/);
});
test('actual Node worker messages and source recovery bind literal implementation and exact policy identities',()=>{
  assert.equal(report.worker.status,'Pass');assert.equal(report.worker.comparisons,30);assert.equal(report.worker.mismatchRefusals.length,3);assert.equal(report.worker.restoreReceipt.status,'committed');assert.equal(report.worker.restoreReceipt.result.receivingAnalyzer.id,'basic-v1');assert.equal(report.worker.foreignAnalyzerReceipt,'INVALID_TRANSPORT');assert.equal(report.worker.foreignAnalyzerRestore,'OUTCOME_UNKNOWN');assert.match(report.worker.scope,/not browser/);
});
test('literal code is optional, fresh imports and registration are inert, and readonly public declarations remain isolated',()=>{
  assert.ok(report.core.inputs.every(({path})=>!path.includes('/addons/literal/')));assert.ok(report.literalOnly.inputs.some(({path})=>path.includes('/addons/literal/')));assert.ok(report.literalOnly.inputs.every(({path})=>!path.includes('/execution/engine.js')));assert.ok(report.startup.every(row=>row.reads.length===0));assert.equal(report.logicalState.extraLiteralCorpusParticipantEntries,0);assert.match(report.logicalState.basis,/not heap/);assert.match(report.declarations,/no DOM\/Node ambient types/);
});
