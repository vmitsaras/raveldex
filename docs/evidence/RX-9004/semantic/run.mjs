// RX-9004 separate, bounded full semantic lane. No build/install/network.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { inventory, digest } from '../../../../bench/n9/run.mjs';
import { createPairedVerifier } from '../../../../bench/n9/paired-verify.mjs';
import { FAMILIES, SIZES } from '../../../../bench/n9/workloads.mjs';
import { validateRows, validateManifest, verifyEnvironment } from '../../../../bench/n10/run.mjs';
import { sourceExpectations, verifyPublicResult, verifyCoreSource, verifySelectedSource } from './oracle.mjs';

const ROOT=fileURLToPath(new URL('../../../../',import.meta.url)), verifier=createPairedVerifier();
const ROLES=['preN9','acceptedN9','current'];
const normalized=rows=>[...rows].sort((a,b)=>a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const pins=[
 'docs/evidence/RX-9004/semantic/run.mjs','docs/evidence/RX-9004/semantic/oracle.mjs',
 'docs/evaluation/RX-9001-method.json','docs/evaluation/RX-9001-method.md',
 'bench/n9/paired-semantics.mjs','bench/n9/paired-verify.mjs','bench/n9/bulk-verify.mjs',
 'bench/n9/workloads.mjs','bench/n9/paired-node.mjs','bench/n9/run.mjs',
 'bench/n10/run.mjs','bench/n10/contract.mjs','bench/n10/child.mjs',
 'test/fixtures/snapshots/records.mjs','test/fixtures/n9/freeze.json','test/fixtures/relevance/corpus.json',
 'test/oracle/query.mjs','test/oracle/phrases.mjs'
];
export const BOUNDS=Object.freeze({cases:27,perChildMs:600000,totalMs:10800000,scope:'Separate untimed controlled zero-clock semantic phase after ordinary timing; not a latency/default-deadline/fairness observation.'});
export async function inspectRow(row,core,reference) {
 assert.equal(row.outcome,'Collected');assert.equal(row.host.pending,0);assert.deepEqual(row.identity,reference.workload.identity);
 assert.equal(row.receipt.revision,Math.ceil(row.size/256));
 const queryIds=reference.workload.queries.map(q=>q.id);assert.deepEqual(row.queries.map(q=>q.id),queryIds);assert.deepEqual(row.selected.map(q=>q.id),queryIds);
 const stats={completeQueries:0,refusedQueries:0,pages:0,sourceScores:0,selectedSourceFacts:0,inspectorFormulaAssertions:0,core:verifyCoreSource(core,reference)};
 for(const item of row.queries) {
  const ref=reference.queries.get(item.id),capture=item.capture;
  assert.equal(capture.revision,row.receipt.revision);assert.equal(capture.total,ref.query.expectedIds.length);
  for(let i=0;i<capture.pages.length;i++) {
   const page=capture.pages[i],checked=verifyPublicResult(page,ref,{offset:i*(capture.pageSize??100),limit:capture.pageSize??100,revision:row.receipt.revision});stats.pages+=checked.pages;stats.sourceScores+=checked.scores;
  }
  if(capture.complete) {
   assert.equal(capture.outcome,'Pass');assert.ok(!ref.query.expectedError);assert.equal(capture.hits.length,ref.expected.total);
   assert.deepEqual(capture.hits.map(h=>h.id),ref.expected.hits.map(h=>h.id));stats.completeQueries++;
  } else {
   assert.equal(capture.outcome,'Refused');assert.ok(['WORK_LIMIT_EXCEEDED','DEADLINE_EXCEEDED','LIMIT_EXCEEDED','RESOURCE_EXHAUSTED'].includes(capture.error?.code));
   // Clock0 cannot expire; a deadline in this lane would invalidate the fixture.
   assert.notEqual(capture.error.code,'DEADLINE_EXCEEDED');
   if(ref.query.expectedError){assert.equal(capture.error.code,ref.query.expectedError.code);assert.equal(capture.error.details?.path,ref.query.expectedError.path);}
   else assert.ok(['WORK_LIMIT_EXCEEDED','RESOURCE_EXHAUSTED'].includes(capture.error.code));
   stats.refusedQueries++;
  }
 }
 for(const item of row.selected) {
  if(item.outcome==='Pass') {
   const checked=verifySelectedSource(item.result,reference,item.id);stats.selectedSourceFacts+=checked.fieldFacts;
   stats.inspectorFormulaAssertions+=verifier.replayInspector(item.result).arithmeticAssertions;
  } else {
   assert.equal(item.outcome,'Refused');assert.notEqual(item.error.code,'DEADLINE_EXCEEDED');
   const ref=reference.queries.get(item.id);
   if(ref.query.expectedError){assert.equal(item.error.code,ref.query.expectedError.code);assert.equal(item.error.details?.path,ref.query.expectedError.path);}
   else assert.ok(['WORK_LIMIT_EXCEEDED','RESOURCE_EXHAUSTED','LIMIT_EXCEEDED'].includes(item.error.code));
  }
 }
 if(row.family==='adversarial'&&row.size===100){assert.deepEqual(row.fixtures.map(f=>f.kind),['source','positions','offsets','mixed']);assert.ok(row.fixtures.every(f=>f.outcome==='Pass'&&f.writes.length===3));}
 return stats;
}
function compareFixture(a,b) {
 assert.equal(a.kind,b.kind);assert.equal(a.observations.length,b.observations.length);
 const observations=a.observations.map((x,i)=>{const y=b.observations[i];assert.equal(x.id,y.id);return {id:x.id,comparison:x.captured?verifier.compareCaptures(x.captured,y.captured,{allowInspectorWorkChange:true,allowCapacityTransition:true}):verifier.compareResults(x.result,y.result,{allowInspectorWorkChange:true})};});
 assert.equal(a.initialCore.sha256,b.initialCore.sha256);assert.deepEqual(a.recovery,b.recovery);assert.equal(a.writes.length,b.writes.length);
 for(let i=0;i<a.writes.length;i++){const x=a.writes[i],y=b.writes[i];assert.equal(x.method,y.method);assert.deepEqual(x.receipt,y.receipt);assert.equal(x.core.sha256,y.core.sha256);assert.equal(x.core.encounterSha256,y.core.encounterSha256);verifier.compareCaptures(x.membership,y.membership);verifier.compareCaptures(x.phrases,y.phrases);}
 return {kind:a.kind,observations,stateParity:'Pass',laterWrites:3};
}
async function child(args,timeout,cwd) {
 let log='';return new Promise((yes,no)=>{const p=spawn(process.execPath,args,{cwd,stdio:['ignore','pipe','pipe']});let timedOut=false;
 // Distinguish watchdog termination from a native error/result.
 const watchdog=setTimeout(()=>{timedOut=true;p.kill('SIGKILL');},timeout);
 p.stdout.on('data',x=>log+=x);p.stderr.on('data',x=>log+=x);p.on('error',e=>{clearTimeout(watchdog);no(e);});p.on('close',(code,signal)=>{clearTimeout(watchdog);yes({code,signal,timedOut,log});});});
}
export async function collect({manifestPath,timedDirectory,output}) {
 const began=performance.now(), deadline=began+BOUNDS.totalMs;
 manifestPath=await realpath(manifestPath);timedDirectory=await realpath(timedDirectory);await mkdir(output);output=await realpath(output);
 const bytes=await readFile(manifestPath),manifest=JSON.parse(bytes);validateManifest(manifest);await verifyEnvironment(manifest.environment);
 const timedBytes=await readFile(join(timedDirectory,'report.json')),timed=JSON.parse(timedBytes);assert.equal(timed.profile,'full');assert.equal(timed.outcome,'Collected');assert.equal(timed.guards,'Pass');assert.equal(timed.intendedPerformanceCollection,true);assert.equal(timed.artifactManifestSha256,digest(bytes));assert.equal(timed.runs.length,216);
 const harness=await Promise.all(pins.map(async path=>({path,sha256:digest(await readFile(join(ROOT,path)))})));
 for(const pin of harness){const shared=timed.harness.find(p=>p.path===pin.path);if(shared)assert.equal(pin.sha256,shared.sha256,'timed/semantic harness drift');}
 const report={kind:'rx9004-full-semantic-v1',outcome:'Running',startedAt:new Date().toISOString(),manifestSha256:digest(bytes),timedReportSha256:digest(timedBytes),harness,bounds:BOUNDS,runs:[],comparisons:[],scope:BOUNDS.scope};
 const packages={},rows=new Map(),references=new Map();
 try {
  for(const role of ROLES){const artifact=manifest.artifacts.find(a=>a.role===role);assert.equal(digest(await readFile(artifact.archive)),artifact.sha256);const root=join(await realpath(artifact.consumer),'node_modules/@vmitsaras/raveldex');assert.equal(await realpath(root),root);const before=normalized(await inventory(root));assert.deepEqual(before,normalized(artifact.members));packages[role]={root,before,archive:artifact.archive,archiveSha256:artifact.sha256};}
  for(const family of FAMILIES)for(const size of SIZES) {
   const reference=sourceExpectations(family,size);references.set(family+':'+size,reference);
   for(const role of ROLES) {
    const artifact=manifest.artifacts.find(a=>a.role===role),name=[family,size,role].join('-'),file=join(output,name+'.json'),args=[join(ROOT,'bench/n9/paired-semantics.mjs'),'--child',artifact.consumer,role,family,String(size),file];assert.ok(performance.now()<deadline,'global semantic budget exhausted');
    const result=await child(args,Math.max(1,Math.min(BOUNDS.perChildMs,deadline-performance.now())),ROOT);await writeFile(join(output,name+'.txt'),result.log);
    const run={role,family,size,command:[process.execPath,...args],exitCode:result.code,signal:result.signal,timedOut:result.timedOut,output:name+'.json',archiveSha256:artifact.sha256};report.runs.push(run);await writeFile(join(output,'progress.json'),JSON.stringify(report,null,2)+'\n');assert.equal(result.timedOut,false,'semantic watchdog; incomplete collection');assert.equal(result.code,0,name+' failed');
    const row=JSON.parse(await readFile(file));assert.equal(row.variant,role);assert.equal(row.family,family);assert.equal(row.size,size);assert.equal(digest(await readFile(join(output,row.core.canonicalFile))),row.core.sha256);
    const core=JSON.parse(await readFile(join(output,row.core.canonicalFile)));run.independent=await inspectRow(row,core,reference);rows.set([family,size,role].join(':'),row);
    console.log(JSON.stringify({name,outcome:'Collected',independent:run.independent}));
   }
   for(const [before,after]of[['preN9','acceptedN9'],['preN9','current'],['acceptedN9','current']]) {
    const a=rows.get([family,size,before].join(':')),b=rows.get([family,size,after].join(':'));assert.equal(a.core.sha256,b.core.sha256);assert.equal(a.core.encounterSha256,b.core.encounterSha256);assert.deepEqual(a.receipt,b.receipt);
    const queries=a.queries.map((q,i)=>{assert.equal(q.id,b.queries[i].id);return {id:q.id,comparison:verifier.compareCaptures(q.capture,b.queries[i].capture,{allowInspectorWorkChange:true,allowCapacityTransition:true})};});
    const selected=a.selected.map((q,i)=>{assert.equal(q.id,b.selected[i].id);assert.deepEqual(q.ids,b.selected[i].ids);return {id:q.id,comparison:verifier.compareOutcomes(q,b.selected[i],{allowInspectorWorkChange:true,allowCapacityTransition:true})};});
    const fixtures=a.fixtures?a.fixtures.map((f,i)=>compareFixture(f,b.fixtures[i])):[];
    report.comparisons.push({family,size,before,after,core:'Pass',queries,selected,fixtures});
   }
  }
  assert.equal(rows.size,BOUNDS.cases);assert.equal(new Set([...rows.values()].map(r=>r.pid)).size,BOUNDS.cases,'fresh semantic process per case');
  const timedRows=[];for(const run of timed.runs)timedRows.push(JSON.parse(await readFile(join(timedDirectory,run.output))));
  validateRows(timedRows,{profile:'full',manifest,manifestSha256:digest(bytes),harnessSha256:timed.harnessSha256});
  let timedCapturesLinked=0,timedSourceScores=0;const timedOutcomeCounts={},linkCells=[];
  for(const row of timedRows) {
   const reference=references.get(row.family+':'+row.size),semantic=rows.get([row.family,row.size,row.role].join(':')),data=row.mode==='normal'?row.samples:row.observations;
   let linked=0,scores=0;const outcomes={};
   for(const item of data.filter(s=>s.operation.startsWith('query:'))) {
    const queryId=item.operation.slice(6),ref=reference.queries.get(queryId),capture=row.resultCaptures[item.resultSha256];assert.ok(capture);assert.equal(digest(JSON.stringify(capture)),item.resultSha256);
    const semanticCapture=semantic.queries.find(q=>q.id===queryId).capture;
    if(capture.result) {
     scores+=verifyPublicResult(capture.result,ref,{limit:20,revision:Math.ceil(row.size/256)}).scores;
     if(semanticCapture.hits.length>=capture.result.hits.length){assert.equal(semanticCapture.total,capture.result.total);assert.deepEqual(capture.result.hits,semanticCapture.hits.slice(0,20));}
     // Full reference, not parity, is authoritative even when full-page work
     // itself refuses after the admitted top20 prefix.
    } else {
     const error=capture.error;assert.equal(item.outcome,'Refused');assert.ok(error&&typeof error.message==='string');
     if(ref.query.expectedError){assert.equal(error.code,ref.query.expectedError.code);assert.equal(error.details?.path,ref.query.expectedError.path);assert.deepEqual(error,semanticCapture.error);}
     else {assert.ok(['WORK_LIMIT_EXCEEDED','DEADLINE_EXCEEDED'].includes(error.code));if(semanticCapture.error&&semanticCapture.error.code===error.code)assert.deepEqual(error,semanticCapture.error);}
    }
    const outcome=capture.error?.code??'Pass';outcomes[outcome]=(outcomes[outcome]??0)+1;timedOutcomeCounts[outcome]=(timedOutcomeCounts[outcome]??0)+1;linked++;
   }
   timedCapturesLinked+=linked;timedSourceScores+=scores;linkCells.push({family:row.family,size:row.size,role:row.role,mode:row.mode,deadline:row.deadline,owner:row.owner,capturesLinked:linked,scores,outcomes});
  }
  assert.equal(timedCapturesLinked,13968);report.timedCapturesLinked=timedCapturesLinked;report.timedSourceScoreAssertions=timedSourceScores;report.timedOutcomeCounts=timedOutcomeCounts;report.linkCells=linkCells;
  report.totals={cases:report.runs.length,...Object.fromEntries(['completeQueries','refusedQueries','pages','sourceScores','selectedSourceFacts','inspectorFormulaAssertions'].map(k=>[k,report.runs.reduce((s,r)=>s+r.independent[k],0)]))};
  report.outcome='Pass';assert.ok(performance.now()<=deadline,'global semantic budget exhausted');
 }catch(error){report.outcome='Fail';report.failure={name:error.name,message:error.message,stack:error.stack};throw error;}
 finally {
  try {
   for(const p of Object.values(packages)){assert.deepEqual(normalized(await inventory(p.root)),p.before,'semantic package changed');assert.equal(digest(await readFile(p.archive)),p.archiveSha256);}
   assert.equal(digest(await readFile(manifestPath)),report.manifestSha256);assert.equal(digest(await readFile(join(timedDirectory,'report.json'))),report.timedReportSha256);
   for(const pin of harness)assert.equal(digest(await readFile(join(ROOT,pin.path))),pin.sha256,'semantic harness changed');await verifyEnvironment(manifest.environment);report.guards='Pass';
  }catch(error){report.outcome='Fail';report.guardFailure={name:error.name,message:error.message};throw error;}
  finally {report.finishedAt=new Date().toISOString();report.elapsedMs=performance.now()-began;await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
 }
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){assert.equal(process.argv.length,5,'usage: run.mjs MANIFEST TIMED_FULL FRESH_OUTPUT');await collect({manifestPath:process.argv[2],timedDirectory:process.argv[3],output:process.argv[4]});}
