// Fresh installed public native producer OR receiver. No in-child heap parsing.
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { release, arch } from 'node:os';
import { getHeapStatistics } from 'node:v8';
import { getExecutionOwner } from '../node_modules/@vmitsaras/raveldex/dist/core/execution/engine.js';
import { sourceRuntime } from './codec-common.mjs';
import { recordsFor, schema } from './codec-fixture.mjs';

const [role, rawSize, directory, encodedPath, output] = process.argv.slice(2), size = Number(rawSize);
assert.ok(['producer', 'receiver'].includes(role) && [1000, 10000].includes(size)); assert.equal(typeof global.gc, 'function');
const hash = b => createHash('sha256').update(b).digest('hex'), started = performance.now();
const report = { kind: 'rx4002-native-codec-child-v1', role, size, pid: process.pid, node: process.version, versions: process.versions,
  environment: { osRelease: release(), arch: arch() }, startedAt: new Date().toISOString(), protocol: [], samples: [], verifications: [], witnessStages: [], outcome: 'Running' };
let runtime, engine, owner, encoded, worker, corpus;
const refs = [], expectedStages = role === 'producer' ? ['encode-prejoin', 'encode-envelope'] : ['decode-envelope', 'restore-precommit'];
let captureCount = 0;
function memory() { return { atMs: performance.now() - started, bytes: process.memoryUsage(), mainUsedHeapSize: getHeapStatistics().used_heap_size }; }
function reading() { return refs.map(({ stage, key, ref }) => ({ stage, key, collected: ref.deref() === undefined })); }
async function settle(stage) { for (let cycle = 0; cycle < 3; cycle++) { await new Promise(yes => setImmediate(yes)); global.gc(); await new Promise(yes => setTimeout(yes, 25)); report.samples.push({ stage, cycle, ...memory() }); } }
async function verify(expectedSize, revision, prior = false) {
  for (const [query, total, eligible] of prior ? [[{kind:'all'},1,id=>id==='prior'],['prior',1,id=>id==='prior']] :
    [[{kind:'all'},size,()=>true],['value7',Math.floor((size-8)/37)+1,id=>Number(id.slice(5))%37===7],
      [{kind:'extension',capability:'phrases',version:1,payload:{text:'red blue',fields:['body']}},Math.ceil(size/3),id=>Number(id.slice(5))%3===0],['prior',0,()=>false]]) {
    const r=await engine.search(query,{limit:20,deadlineMs:60000});assert.equal(r.completeness,'complete');assert.equal(r.total,total);assert.equal(r.revision,revision);
    assert.equal(r.hits.length,Math.min(20,total));assert.equal(new Set(r.hits.map(h=>h.id)).size,r.hits.length);
    for(const h of r.hits){assert.ok(eligible(h.id)&&Number.isFinite(h.score));if(!prior){assert.match(h.id,/^item:[0-9]{5}$/);assert.ok(Number(h.id.slice(5))<expectedSize);}}
    report.verifications.push({prior,total:r.total,returned:r.hits.length,revision:r.revision,literalEligibility:true});
  }
}
async function startObserver() {
  worker = new Worker(new URL('./codec-debugger.mjs',import.meta.url), {workerData:{role,size,directory,installed:join(directory,'../node_modules/@vmitsaras/raveldex')}});
  await new Promise((yes,no)=>{ worker.once('error',no);worker.on('message',m=>{report.protocol.push(m);if(m.type==='ready')yes();}); });
}
async function closeObserver() {
  const w=worker;const closed=new Promise((yes,no)=>{w.once('error',no);w.on('message',m=>{if(m.type==='closed')yes(m);});});const exited=new Promise(yes=>w.once('exit',yes));
  w.postMessage('close');const result=await closed;assert.equal(await exited,0);worker=undefined;assert.deepEqual(result,{type:'closed',captures:2,failed:false});
}
try {
  runtime=await sourceRuntime(schema);engine=runtime.engine;owner=getExecutionOwner(engine);report.qualification=runtime.qualification;
  await settle('imported-harness-empty-owner');
  if(role==='producer') {
    corpus=recordsFor(size);report.corpusSha256=hash(JSON.stringify(corpus));
    for(let i=0;i<size;i+=256)await engine.addMany(corpus.slice(i,i+256),{deadlineMs:60000});corpus=undefined;
    await verify(size,Math.ceil(size/256));await settle('built-input-released');
  } else {
    encoded=await readFile(encodedPath,'utf8');report.input={utf8Bytes:Buffer.byteLength(encoded),codeUnits:encoded.length,sha256:hash(encoded)};
    await settle('input-held-empty-receiver');await engine.add({id:'prior',text:{body:'prior state'}},{deadlineMs:60000});await verify(1,1,true);await settle('input-and-prior-held');
  }
  globalThis.__raveldexCodecPositive={literal:'held control'};
  refs.push({stage:'control',key:'positive',ref:new WeakRef(globalThis.__raveldexCodecPositive)},{stage:'control',key:'negative',ref:new WeakRef({literal:'released control'})});
  globalThis.__raveldexCodecBefore=(stage,data,wrappers,facts)=>{
    assert.equal(stage,expectedStages[captureCount]);assert.ok(!Object.hasOwn(globalThis,'__raveldexCodecMarkers'));
    assert.equal(wrappers.root,owner.root);assert.equal(data.oldDocuments,owner.root.documents);assert.equal(data.oldFields,owner.root.fields);assert.equal(data.oldParticipants,owner.root.participants);
    globalThis.__raveldexCodecMarkers={data,wrappers};
    for(const [prefix,values]of [['data',data],['wrapper',wrappers]])for(const [key,value]of Object.entries(values))if(value!==null&&typeof value==='object')refs.push({stage,key:`${prefix}.${key}`,ref:new WeakRef(value)});
    captureCount++;return {stage,facts,oldIsCommitted:true,...memory()};
  };
  globalThis.__raveldexCodecAfter=()=>{const m=globalThis.__raveldexCodecMarkers;assert.equal(m.wrappers.root,owner.root);delete globalThis.__raveldexCodecMarkers;return {oldStillCommitted:true,...memory()};};
  await startObserver();
  if(role==='producer') {
    encoded=await runtime.snapshots.exportNative({deadlineMs:60000});
    report.operation={outcome:'Pass',kind:'exportNative'};
    await closeObserver();assert.equal(captureCount,2);
    report.output={utf8Bytes:Buffer.byteLength(encoded),codeUnits:encoded.length,sha256:hash(encoded)};await writeFile(encodedPath,encoded,{flag:'wx'});
    await verify(size,Math.ceil(size/256));
  } else {
    const result=await runtime.snapshots.restore(encoded,{deadlineMs:60000});report.operation={outcome:'Pass',kind:'restore',result};
    await closeObserver();assert.equal(captureCount,2);
    assert.deepEqual([result.format,result.reindexed,result.originRevision,result.revision],['raveldex-native',false,Math.ceil(size/256),2]);await verify(size,2);
  }
  await settle('operation-complete-input-output-string-held');report.witnessStages.push({stage:'after-operation',readings:reading()});
  const initial=report.witnessStages[0].readings;
  assert.equal(initial.find(r=>r.key==='positive').collected,false);assert.equal(initial.find(r=>r.key==='negative').collected,true);
  for(const r of initial.filter(r=>r.stage!=='control')) {
    const live = role==='producer' ? r.key.startsWith('data.old')||r.key==='wrapper.root' : r.key.startsWith('data.candidate')||r.key==='wrapper.candidate';
    assert.equal(r.collected,!live,`Unexpected direct witness: ${r.stage}/${r.key}`);
  }
  encoded=undefined;await settle('caller-string-released');
  await engine.dispose();assert.equal(owner.root,undefined);engine=owner=runtime=undefined;
  await settle('disposed');report.witnessStages.push({stage:'disposed',readings:reading()});
  assert.ok(report.witnessStages.at(-1).readings.filter(r=>r.stage!=='control').every(r=>r.collected));
  report.cleanup={allListedObjectsCollected:true,observerExited:worker===undefined,markersDeleted:!Object.hasOwn(globalThis,'__raveldexCodecMarkers')};
  report.outcome='Observed';
}catch(error){report.outcome='Fail';report.failure={name:error.name,code:error.code,reason:error.reason,message:error.message,stack:error.stack};process.exitCode=1;}
finally{
  for(const key of ['__raveldexCodecBefore','__raveldexCodecAfter','__raveldexCodecMarkers','__raveldexCodecRoot','__raveldexCodecPositive'])delete globalThis[key];
  if(worker)await worker.terminate();await engine?.dispose();report.finishedAt=new Date().toISOString();await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
console.log(JSON.stringify({role,size,outcome:report.outcome}));
