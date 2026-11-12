import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {measurePackedIdentifiers} from '../../measurements/identifier-package.mjs';
let report;
before(async()=>{report=await measurePackedIdentifiers();if(process.env.RAVELDEX_IDENTIFIER_PACKAGE_REPORT)await writeFile(process.env.RAVELDEX_IDENTIFIER_PACKAGE_REPORT,JSON.stringify(report,null,2)+'\n');});
test('actual offline-installed and minified identifier consumers preserve whole/fragment Boolean, prefix, BM25 pages and mutations',()=>{
  assert.equal(report.correctness.status,'Pass');assert.equal(report.correctness.authoredQueries,13);assert.equal(report.correctness.fullPageComparisonsPerRun,39);assert.equal(report.correctness.bundledParity,'Pass');assert.equal(report.correctness.unselectedPack,'Pass');assert.equal(report.package.private,false);assert.equal(report.packed.typed.length,2);assert.match(report.packed.numerical,/Independent literal frequencies/);
});
test('source/offset evidence, original-only strict phrases and qualified source/native snapshots preserve selected identifiers',()=>{
  assert.equal(report.snapshots.status,'Pass');assert.equal(report.snapshots.comparisons,76);assert.equal(report.snapshots.mismatchRefusals,8);assert.equal(report.snapshots.rows.length,4);assert.equal(report.documentation.status,'Pass');assert.match(report.snapshots.qualificationScope,/no all-Unicode or cross-host/);
});
test('actual Node worker messages and source restore bind complete identifier policy identity',()=>{
  assert.equal(report.worker.status,'Pass');assert.equal(report.worker.comparisons,22);assert.equal(report.worker.mismatchRefusals.length,3);assert.equal(report.worker.restoreReceipt.status,'committed');assert.equal(report.worker.restoreReceipt.result.receivingAnalyzer.id,'code-identifiers-v1');assert.equal(report.worker.foreignAnalyzerReceipt,'INVALID_TRANSPORT');assert.equal(report.worker.foreignAnalyzerRestore,'OUTCOME_UNKNOWN');assert.match(report.worker.scope,/not browser/);
});
test('identifier implementation stays optional, imports inertly and exposes isolated readonly public declarations',()=>{
  assert.ok(report.core.inputs.every(({path})=>!path.includes('/addons/identifiers/')));assert.ok(report.identifierOnly.inputs.some(({path})=>path.endsWith('/identifiers/scanner.js')));assert.ok(report.identifierOnly.inputs.every(({path})=>!path.includes('/execution/engine.js')));assert.ok(report.startup.every(row=>row.reads.length===0));assert.equal(report.logicalState.separateCorpusParticipantEntries,0);assert.equal(report.logicalState.selectedFixtureIndexedOccurrences,26);assert.match(report.logicalState.basis,/not heap/);assert.match(report.declarations,/no DOM\/Node ambient types/);
});
