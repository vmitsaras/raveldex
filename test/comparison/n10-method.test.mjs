import test from 'node:test';
import {mkdtemp,readFile,writeFile,rm}from'node:fs/promises';
import{tmpdir}from'node:os';
import{join}from'node:path';
import assert from 'node:assert/strict';
import { CONTRACT, CONTRACT_SHA256, plan, jobKey, validateManifest, validateRows, summarize, run, verifyEnvironment } from '../../bench/n10/run.mjs';
import { hash } from '../../bench/n10/contract.mjs';
import { workloadFor, verifyFrozen } from '../../bench/n9/workloads.mjs';
const environment={node:{node:process.version,versions:process.versions,platform:process.platform,arch:process.arch,execPath:process.execPath,executable:{status:'Observed',realPath:process.execPath,sha256:hash(await readFile(process.execPath))}}};
const digest = 'a'.repeat(64), metadataHash = 'f'.repeat(64), commit = '1'.repeat(40);
const artifactHashes = {preN9:'3f4f31eb03951f13366256dd019710f0bd5c58b29d7ae687d8a96f0ea5ecec11',acceptedN9:'1d7dab63dbbd9bee7dd67394dd6893c227711caad471d448a02e704c91225fbe',current:'c'.repeat(64)};
function manifest() { return {kind:'rx9001-artifacts-v1',source:{head:commit},provisional:false,freshCurrentCandidate:true,environment:structuredClone(environment),artifacts:CONTRACT.roles.map(role=>({role,sha256:artifactHashes[role],archive:'/fixture/'+role+'.tgz',consumer:'/fixture/'+role,source:{commit:role==='preN9'?'919c9ed133b1dd004e3059cb15ddac18f474ef08':role==='acceptedN9'?'6d00200697074749f077706e3f7fa0ff3162d247':commit},members:[{path:'package.json',bytes:5,sha256:metadataHash}]}))}; }
const cache = new Map();
function workload(family,size) { const key=family+size;if(!cache.has(key))cache.set(key,verifyFrozen(workloadFor(family,size)));return cache.get(key); }
const timing = {wallMs:1,cpuUserMs:.5,cpuSystemMs:.1};
const counters = {emittedSteps:1,emittedWorkUnits:1,hostYields:0};
function error(code,path='work') { return {name:'RaveldexError',code,reason:null,details:{path},message:'Raveldex: '+code}; }
function fixture(profile='pilot') {
  const m=manifest(),rows=plan(profile).map((job,index)=>{
    const a=m.artifacts.find(a=>a.role===job.role),w=workload(job.family,job.size),data=[];
    const row={kind:'rx9001-node-child-v1',...job,requestedSamples:job.samples,requestedWarmups:job.warmups,pid:1000+index,variant:job.role,outcome:'Collected',identity:w.identity,samples:job.mode==='normal'?data:[],observations:job.mode==='diagnostic'?data:[],warmups:[],resultCaptures:{},results:{},queryTransitions:[],contractSha256:CONTRACT_SHA256,artifactManifestSha256:digest,harnessSha256:digest,artifactSha256:a.sha256,artifactSource:a.source,packageInventorySha256:hash(a.members),packageMetadataSha256:metadataHash,configurationSha256:hash(CONTRACT.configuration),runtime:{node:process.version}};
    const add=item=>data.push({...timing,...item,...(job.mode==='diagnostic'?{counters}: {})});
    add({operation:'build',outcome:'Pass',result:{revision:Math.ceil(w.size/256)}});
    for(const q of w.queries) {
      const capture=q.expectedError?{error:error(q.expectedError.code,q.expectedError.path)}:{result:{completeness:'complete',model:'raveldex-bm25-v1',revision:Math.ceil(w.size/256),total:q.expectedIds.length,hits:q.expectedIds.slice(0,20).map(id=>({id,score:0}))}};
      const sha=hash(capture);row.resultCaptures[sha]=capture;row.results[q.id]=capture;
      for(let r=0;r<job.warmups;r++)row.warmups.push({operation:'query:'+q.id,repetition:r,outcome:capture.error?'Refused':'Pass'});
      for(let r=0;r<job.samples;r++)add({operation:'query:'+q.id,repetition:r,phase:job.mode==='diagnostic'?'diagnostic-first-call':job.warmups?'after-two-warmups':r?'repeat-same-owner':'first-call-for-query',outcome:capture.error?'Refused':'Pass',...(capture.error?{error:capture.error}:{}),resultSha256:sha});
    }
    add({operation:'exportSource',outcome:'Pass',result:{encodedBytes:10,encodedSha256:digest}});
    add({operation:'restoreSource',outcome:'Pass',result:{revision:2,originRevision:Math.ceil(w.size/256)},completeSource:{records:w.size}});
    return row;
  });
  return {rows,options:{profile,manifest:m,manifestSha256:digest,harnessSha256:digest}};
}
const seed=fixture();const fresh=()=>structuredClone(seed);const data=row=>row.mode==='normal'?row.samples:row.observations;
function query(row,id='common'){return data(row).find(x=>x.operation==='query:'+id);}
function setCapture(row,item,capture){const sha=hash(capture);row.resultCaptures[sha]=capture;item.resultSha256=sha;return capture;}

test('N10 freezes exact finite pilot/full matrices and sample/deadline budgets',()=>{
  assert.equal(plan('pilot').length,18);assert.equal(plan('full').length,216);assert.equal(new Set(plan('full').map(jobKey)).size,216);
  assert.equal(plan('full').filter(j=>j.mode==='normal').reduce((n,j)=>n+8*j.samples,0),13536);
  assert.equal(plan('full').filter(j=>j.mode==='diagnostic').reduce((n,j)=>n+8*j.samples,0),432);
  assert.equal(CONTRACT.pilot.totalMs,600000);assert.equal(CONTRACT.pilot.perChildMs,90000);assert.equal(CONTRACT.full.totalMs,10800000);
  for(const j of plan('pilot'))assert.deepEqual(j.deadlineOptions,j.deadline==='default30s'?{}:{deadlineMs:60000});
  assert.throws(()=>plan('partial'));assert.throws(()=>{CONTRACT.pilot.sizes.push(1000);});
});
test('N10 accepts its complete pilot rather than weakening historical six-stage validation',()=>{const f=fresh();assert.equal(validateRows(f.rows,f.options).length,240);});
test('N10 validates full tail/warmup matrix independently of the reduced pilot',()=>{const f=fixture('full');assert.ok(validateRows(f.rows,f.options).length>0);const tail=f.rows.find(r=>r.requestedWarmups);tail.warmups.pop();assert.throws(()=>validateRows(f.rows,f.options));});
test('N10 rejects missing/extra/duplicate cells, PIDs, owner and deadline labels',()=>{
  for(const mutate of [f=>f.rows.pop(),f=>f.rows.push(f.rows[0]),f=>{f.rows[1]=structuredClone(f.rows[0]);f.rows[1].pid=9900;},f=>f.rows[1].pid=f.rows[0].pid,f=>f.rows[0].owner=99,f=>f.rows[0].deadline='other',f=>f.options.profile='full']){const f=fresh();mutate(f);assert.throws(()=>validateRows(f.rows,f.options));}
});
test('N10 rejects changed input, artifact, source, manifest, harness and configuration identities',()=>{
  for(const mutate of [f=>f.rows[0].identity={...f.rows[0].identity,corpusSha256:digest},f=>f.rows[0].artifactSha256=digest,f=>f.rows[0].artifactSource.commit='2'.repeat(40),f=>f.rows[0].artifactManifestSha256='b'.repeat(64),f=>f.rows[0].harnessSha256='b'.repeat(64),f=>f.rows[0].contractSha256='b'.repeat(64),f=>f.rows[0].configurationSha256='b'.repeat(64),f=>f.rows[0].packageInventorySha256='b'.repeat(64),f=>f.rows[0].runtime.node='v0.0.0',f=>f.rows[0].deadlineOptions.extra=true]){const f=fresh();mutate(f);assert.throws(()=>validateRows(f.rows,f.options));}
});
test('N10 rejects provisional, missing, duplicate, unpinned and malformed artifact manifests',()=>{
  for(const mutate of [m=>m.provisional=true,m=>delete m.provisional,m=>delete m.freshCurrentCandidate,m=>delete m.environment,m=>m.freshCurrentCandidate=false,m=>m.artifacts.pop(),m=>m.artifacts.push(m.artifacts[0]),m=>m.source.head='unknown',m=>m.artifacts[0].sha256=digest,m=>m.artifacts[0].source.commit='unknown',m=>m.artifacts[2].source.commit='2'.repeat(40),m=>m.artifacts[0].source.commit='2'.repeat(40),m=>m.artifacts[0].members[0].path='../escape',m=>m.artifacts[0].members.push(m.artifacts[0].members[0]),m=>{[m.artifacts[0].role,m.artifacts[1].role]=[m.artifacts[1].role,m.artifacts[0].role];},m=>m.artifacts.push({...m.artifacts[2],role:'reviewedCurrent'})]){const m=manifest();mutate(m);assert.throws(()=>validateManifest(m));}
});
test('N10 rejects operation/repetition loss, hidden diagnostics, wrong phases and missing counters',()=>{
  for(const mutate of [f=>f.rows[0].samples.pop(),f=>f.rows[0].samples.push(f.rows[0].samples[0]),f=>query(f.rows[0]).repetition=1,f=>query(f.rows[0]).phase='wrong',f=>query(f.rows[0]).counters=counters,f=>f.rows[0].observations.push(f.rows[0].samples[0]),f=>delete query(f.rows.find(r=>r.mode==='diagnostic')).counters,f=>query(f.rows[0]).wallMs=NaN]){const f=fresh();mutate(f);assert.throws(()=>validateRows(f.rows,f.options));}
});
test('N10 compares every successful score/order capture even when a prior reference refused',()=>{
  const f=fresh(),row=f.rows[0],item=query(row),capture=structuredClone(row.resultCaptures[item.resultSha256]);capture.result.hits[0].score=.25;setCapture(row,item,capture);row.results.common={error:error('WORK_LIMIT_EXCEEDED')};assert.throws(()=>validateRows(f.rows,f.options));
  const wrong=fresh(),r=wrong.rows[0],s=query(r),c=structuredClone(r.resultCaptures[s.resultSha256]);c.result.hits[0].id='not-a-member';setCapture(r,s,c);assert.throws(()=>validateRows(wrong.rows,wrong.options));
});
test('N10 refuses unexpected errors, outcome/capture mismatch and changed expansion error paths',()=>{
  for(const code of ['INTERNAL_ERROR','OUTCOME_UNKNOWN','CANCELLED']){const f=fresh(),r=f.rows[0],q=query(r);q.outcome='Refused';q.error=error(code);setCapture(r,q,{error:q.error});assert.throws(()=>validateRows(f.rows,f.options));}
  const f=fresh();query(f.rows[0]).outcome='Refused';assert.throws(()=>validateRows(f.rows,f.options));
});
test('N10 retains actual export refusal and unmeasured dependent restore without inventing zeros',()=>{
  const f=fresh(),r=f.rows[0],exp=r.samples.find(x=>x.operation==='exportSource');exp.outcome='Refused';exp.error=error('WORK_LIMIT_EXCEEDED');delete exp.result;
  const index=r.samples.findIndex(x=>x.operation==='restoreSource');r.samples[index]={operation:'restoreSource',outcome:'Not run',reason:'Actual source export refused'};
  assert.ok(validateRows(f.rows,f.options).length);r.samples[index].wallMs=0;assert.throws(()=>validateRows(f.rows,f.options));
});
test('N10 restore refusal must prove prior state and cannot hide an unexpected failure',()=>{
  const f=fresh(),item=f.rows[0].samples.find(x=>x.operation==='restoreSource');item.outcome='Refused';item.error=error('WORK_LIMIT_EXCEEDED');item.oldStatePreserved=true;delete item.result;delete item.completeSource;
  assert.ok(validateRows(f.rows,f.options).length);item.oldStatePreserved=false;assert.throws(()=>validateRows(f.rows,f.options));item.oldStatePreserved=true;item.error=error('INTERNAL_ERROR');assert.throws(()=>validateRows(f.rows,f.options));
});
test('N10 summaries preserve deadline cohorts and never promote pilot/sparse observations to p95',()=>{
  const f=fresh(),result=summarize(f.rows);assert.equal(new Set(result.map(x=>x.deadline)).size,2);assert.ok(result.every(x=>x.p95WallMs===null));
  const common=result.filter(x=>x.operation==='query:common'&&x.variant==='current');assert.equal(common.length,4);assert.ok(common.every(x=>x.owners===2));
});


test('N10 preflight refuses a self-described wrong archive and retains a failed report before collection',async()=>{
  const root=await mkdtemp(join(tmpdir(),'raveldex-n10-preflight-'));
  try {
    const m=manifest();const archive=join(root,'wrong.tgz');await writeFile(archive,'wrong actual archive bytes');
    m.artifacts.forEach(a=>a.archive=archive);const file=join(root,'manifest.json');await writeFile(file,JSON.stringify(m));
    const output=join(root,'out');await assert.rejects(run({artifacts:file,profile:'pilot',output}),/archive bytes/);
    const report=JSON.parse(await readFile(join(output,'report.json'),'utf8'));
    assert.equal(report.outcome,'Fail');assert.equal(report.runs.length,0);assert.equal(report.acceptedPerformanceEvidence,false);assert.ok(report.guardFailure);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('N10 does not pool two sixty-sample deadline cohorts into a fabricated p95',()=>{
  const rows=CONTRACT.deadlines.map((deadline,i)=>({variant:'current',family:'adversarial',size:100,deadline:deadline.id,mode:'normal',owner:0,pid:i+1,samples:Array.from({length:60},()=>({operation:'query:common',phase:'same',outcome:'Pass',...timing}))}));
  const summaries=summarize(rows);assert.equal(summaries.length,2);assert.ok(summaries.every(x=>x.attempts===60&&x.p95WallMs===null));
});


test('N10 checks the actual frozen Node binary and versions, not only the manifest label',async()=>{
  await verifyEnvironment(environment);
  for(const mutate of [e=>e.node.node='v0',e=>e.node.executable.sha256='a'.repeat(64),e=>e.node.versions={node:'0'},e=>e.node.execPath='/wrong/node']) {
    const e=structuredClone(environment);mutate(e);await assert.rejects(verifyEnvironment(e));
  }
});
