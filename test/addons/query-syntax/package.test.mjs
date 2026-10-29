import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {measurePackedQuerySyntax} from '../../measurements/query-syntax-package.mjs';

let report;
before(async()=>{report=await measurePackedQuerySyntax();if(process.env.RAVELDEX_QUERY_SYNTAX_PACKAGE_REPORT)await writeFile(process.env.RAVELDEX_QUERY_SYNTAX_PACKAGE_REPORT,JSON.stringify(report,null,2)+'\n');});
test('installed and minified syntax compilation preserves manual public trees, complete results and independent native arithmetic',()=>{
  assert.equal(report.correctness.status,'Pass');assert.equal(report.correctness.authoredQueries,17);assert.equal(report.correctness.completePagesPerRun,51);assert.equal(report.correctness.ordinaryControls,6);assert.equal(report.correctness.syntaxRefusals,6);assert.equal(report.correctness.minifiedParity,'Pass');assert.equal(report.package.private,true);assert.match(report.packed.numerical,/independent native BM25/);
});
test('source/native restores preserve parsed and explicit typed queries across basic, English and identifier analysis',()=>{
  assert.equal(report.snapshots.status,'Pass');assert.equal(report.snapshots.comparisons,102);assert.equal(report.snapshots.rows.length,6);assert.deepEqual(report.snapshots.mismatches.map(row=>row.nativeCode),['MISSING_CAPABILITY','MISSING_CAPABILITY']);assert.match(report.snapshots.scope,/Not browser/);
});
test('actual Node workers receive existing native query envelopes without parser registration and recover source state',()=>{
  assert.equal(report.worker.status,'Pass');assert.equal(report.worker.comparisons,37);assert.equal(report.worker.parserHostRegistration,false);assert.equal(report.worker.receipt.status,'committed');assert.match(report.worker.transport,/Actual Node worker_threads/);
});
test('optional parser declarations, inert imports and exact installed documentation remain separate from unchanged core runtime',()=>{
  assert.equal(report.coreUnchanged.status,'Pass');assert.ok(report.core.inputs.every(({path})=>!path.includes('/addons/query-syntax/')));assert.ok(report.syntaxOnly.inputs.some(({path})=>path.includes('/addons/query-syntax/')));assert.ok(report.startup.every(row=>row.reads.length===0));assert.equal(report.state.parserParticipantEntries,0);assert.equal(report.state.parserCodec,false);assert.match(report.declarations,/no DOM\/Node/);assert.equal(report.documentation.status,'Pass');assert.equal(report.documentation.stdout,'1 guide\n');assert.match(report.documentation.exampleSha256,/^[a-f0-9]{64}$/);
});
