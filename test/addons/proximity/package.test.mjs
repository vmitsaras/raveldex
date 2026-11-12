import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {measurePackedProximity} from '../../measurements/proximity-package.mjs';
let report;
before(async()=>{report=await measurePackedProximity();if(process.env.RAVELDEX_PROXIMITY_PACKAGE_REPORT)await writeFile(process.env.RAVELDEX_PROXIMITY_PACKAGE_REPORT,JSON.stringify(report,null,2)+'\n');});
test('offline installed and minified ordered queries preserve native membership, complete pages and independent scores',()=>{
  assert.equal(report.correctness.status,'Pass');assert.equal(report.correctness.authoredQueries,15);assert.equal(report.correctness.fullPageComparisonsPerRun,45);assert.equal(report.correctness.ordinaryQueries,6);assert.equal(report.correctness.bundledParity,'Pass');assert.equal(report.package.private,false);assert.equal(report.packed.typed.length,4);assert.match(report.packed.numerical,/independent native BM25/);assert.equal(report.documentation.status,'Pass');assert.equal(report.documentation.source,'docs/api/PROXIMITY.md');assert.equal(report.documentation.stdout,'1 guide\n');assert.match(report.documentation.exampleSha256,/^[a-f0-9]{64}$/);assert.match(report.documentation.scope,/Exact first installed/);
});
test('source/native restored positions preserve ordered alternatives under all three selected analyzers',()=>{
  assert.equal(report.snapshots.status,'Pass');assert.equal(report.snapshots.comparisons,90);assert.equal(report.snapshots.mismatchRows.length,4);assert.equal(report.snapshots.rows.length,6);assert.equal(report.snapshots.mismatchRows.filter(row=>row.reason==='ANALYZER_MISMATCH').length,2);assert.equal(report.snapshots.mismatchRows.filter(row=>row.reason==='CAPABILITY_MISMATCH').length,2);assert.match(report.snapshots.scope,/not browser/);
});
test('real Node worker messages and source recovery bind proximity presence, version and gap policy',()=>{
  assert.equal(report.worker.status,'Pass');assert.equal(report.worker.comparisons,33);assert.equal(report.worker.mismatchRefusals.length,3);assert.equal(report.worker.restoreReceipt.status,'committed');assert.match(report.worker.scope,/not browser/);
});
test('proximity imports and public declarations are inert, optional and readonly without new retained state',()=>{
  assert.ok(report.core.inputs.every(({path})=>!path.includes('/addons/proximity/')));assert.ok(report.proximityOnly.inputs.some(({path})=>path.includes('/addons/proximity/')));assert.ok(report.proximityOnly.inputs.every(({path})=>!path.includes('/execution/engine.js')));assert.ok(report.startup.every(row=>row.reads.length===0));assert.equal(report.logicalState.extraProximityCorpusParticipantEntries,0);assert.match(report.logicalState.basis,/not heap/);assert.match(report.declarations,/no DOM\/Node ambient types/);
});
