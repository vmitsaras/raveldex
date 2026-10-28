// Serial bounded workload runner. Instrumented runtime is supplied explicitly.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, open, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { recordsFor } from '../cost-common.mjs';
const [rawConsumer,rawRuntime,rawDirectory,rawRepetitions='1',rawCapacity='262144',selection='all',phase='all'] = process.argv.slice(2);
assert.ok(rawConsumer&&rawRuntime&&rawDirectory,'Supply installed consumer, calibrated runtime and NEW output directory');
const consumer=await realpath(rawConsumer),runtime=await realpath(rawRuntime),directory=resolve(rawDirectory);
const repetitions=Number(rawRepetitions),capacity=Number(rawCapacity);
assert.ok(Number.isInteger(repetitions)&&repetitions>=1&&repetitions<=3);
assert.ok(Number.isInteger(capacity)&&capacity>0&&capacity<=1000000);
assert.ok(['all','core-only','source-phrase','positions-offsets'].includes(selection)); assert.ok(['all','mutation'].includes(phase));
await mkdir(directory);
const hash = b => createHash('sha256').update(b).digest('hex');
async function fileHash(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
const report={schema:'raveldex-managed-workloads-v2',started:new Date().toISOString(),consumer,runtime,directory,
 method:{modes:selection==='all'?['core-only','source-phrase','positions-offsets']:[selection],sizes:[1000,10000],phase,repetitions,capacity,eventRecordBytes:56,nativeEventBufferBytes:capacity*56,batchSize:256,deadlineMs:60000,
  scope:'Same admitted cost fixture and public methods; producer/receiver fresh serial processes. Modified calibrated no-inline/no-fold runtime, whole operation new monitored managed extents; no exclusive stage/default/physical/browser-copy claim.',
  invalid:'Any GC, drop, abort or unsupported/overlapping event invalidates peak fields. Successful operation and measurement validity remain distinct. No partial-prefix peak, event stitching or baseline subtraction.',
  verification:'Exact fixture totals/revisions, literal all-query first20 and unique eligible finite-score query first pages; no complete-ranking oracle claim.'},
 runtimeSha256:await fileHash(runtime),sourceBindings:[],productionFiles:[],processes:[],errors:[],outcome:'Running'};
assert.equal(report.runtimeSha256,'28d5845f1e59182b5c8d81403836500728972b9816a7195f49e3442fcb9b5e67');
const out=await open(join(directory,'report.json'),'wx');
async function save(){const s=JSON.stringify(report,null,2)+'\n';await out.write(s,0,'utf8');await out.truncate(Buffer.byteLength(s));}
const env=Object.fromEntries(['PATH','TMPDIR','LANG','LC_ALL'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
async function child(mode,size,repetition,role,input='',format='',changed=true){
 const name=[mode,size,repetition,role,format].filter(x=>x!==''&&x!==undefined).join('-'),folder=join(directory,name);await mkdir(folder);
 const output=join(folder,'child.json'),args=['--expose-internals','--expose-gc','--no-inline-new','--min-semi-space-size=16','--max-semi-space-size=16',join(report.stagedDirectory,'runtime-child.mjs'),mode,String(size),role,folder,output,input,format,String(capacity),String(changed),phase];
 const row={mode,size,repetition,role,format,folder,output,command:{executable:runtime,args,cwd:consumer,started:new Date().toISOString(),timeoutMs:role==='producer'?240000:180000,stdoutLimitBytes:16*1024*1024},outcome:'Running'};report.processes.push(row);await save();
 const streams={stdout:createWriteStream(join(folder,'stdout.log'),{flags:'wx'}),stderr:createWriteStream(join(folder,'stderr.log'),{flags:'wx'})};let sizes={stdout:0,stderr:0},timer,killTimer,spawnError,termination;
 const process=spawn(runtime,args,{cwd:consumer,env,detached:true,stdio:['ignore','pipe','pipe']});row.command.ownedPid=process.pid;
 const stop=reason=>{if(termination)return;termination=reason;try{globalThis.process.kill(-process.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{globalThis.process.kill(-process.pid,'SIGKILL');}catch{}},5000);};
 timer=setTimeout(()=>stop('Owned child timeout'),row.command.timeoutMs);
 for(const kind of ['stdout','stderr'])process[kind].on('data',bytes=>{sizes[kind]+=bytes.length;if(sizes[kind]>row.command.stdoutLimitBytes)stop('Owned child output limit');else streams[kind].write(bytes);});
 process.on('error',error=>{spawnError=error.message;});
 const ended=await new Promise(yes=>process.once('close',(exitCode,signal)=>yes({exitCode,signal})));
 clearTimeout(timer);clearTimeout(killTimer);await Promise.all(Object.values(streams).map(s=>new Promise((yes,no)=>{s.on('error',no);s.end(yes);})));row.command={...row.command,...ended,finished:new Date().toISOString(),spawnError:spawnError??null,termination:termination??null,...sizes};
 try{
  assert.equal(ended.exitCode,0);assert.equal(ended.signal,null);assert.equal(spawnError,undefined);assert.equal(termination,undefined);
  row.child=JSON.parse(await readFile(output,'utf8'));assert.equal(row.child.pid,process.pid);assert.equal(row.child.disposed,true);assert.equal(row.child.errors.length,0);assert.notEqual(row.child.outcome,'Fail');
  row.traces=[];for(const op of row.child.operations){const s=await stat(op.file);row.traces.push({name:op.name,path:op.file,bytes:s.size,sha256:await fileHash(op.file)});}
  for(const exported of row.child.exports)if(exported.path){exported.bytes=(await stat(exported.path)).size;exported.sha256=await fileHash(exported.path);}
  row.outcome=row.child.outcome;
 }catch(error){row.outcome='Fail';row.failure={name:error.name,message:error.message};try{row.partialChild=JSON.parse(await readFile(output,'utf8'));}catch{}}
 await save();console.log(JSON.stringify({name,outcome:row.outcome,operations:row.child?.operations.map(x=>({name:x.name,status:x.status,publicOutcome:x.publicOutcome,events:x.summary.events,dropped:x.summary.dropped_events,gc:x.summary.gc_prologues}))}));return row;
}
try{
 const installed=join(consumer,'node_modules/@vmitsaras/raveldex');assert.equal(await realpath(installed),installed);
 async function walk(p='dist'){for(const e of await readdir(join(installed,p),{withFileTypes:true})){const name=join(p,e.name);if(e.isDirectory())await walk(name);else{assert.ok(e.isFile());const a=await readFile(join(installed,name)),b=await readFile(name);assert.equal(hash(a),hash(b));report.productionFiles.push({path:name,bytes:a.length,sha256:hash(a)});}}}await walk();
 report.packageMetadataSha256=hash(await readFile(join(installed,'package.json')));report.tarballSha256=await fileHash(join(consumer,'vmitsaras-raveldex-0.0.0.tgz'));assert.equal(report.tarballSha256,'6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437');
 report.stagedDirectory=await mkdtemp(join(consumer,'runtime-workloads-'));
 for(const [source,name]of[['bench/memory/runtime-child.mjs','runtime-child.mjs'],['bench/cost-common.mjs','cost-fixture.mjs']]){const target=join(report.stagedDirectory,name);await copyFile(source,target);report.sourceBindings.push({source,target,sha256:await fileHash(target)});}
 report.sourceBindings.push({source:'bench/memory/runtime-run.mjs',sha256:await fileHash('bench/memory/runtime-run.mjs')});
 report.corpora=[1000,10000].map(size=>({size,sha256:hash(Buffer.from(JSON.stringify(recordsFor(size))))}));await save();
 for(const size of report.method.sizes)for(const mode of report.method.modes)for(let rep=0;rep<repetitions;rep++){
  const producer=await child(mode,size,rep,'producer');
  if(producer.outcome==='Fail'){report.errors.push({mode,size,rep,message:'Producer failure; receiver not attempted'});continue;}
  for(const exported of producer.child.exports)if(exported.path)await child(mode,size,rep,'receiver',exported.path,exported.format,exported.changed);
 }
 for(const b of report.productionFiles)assert.equal(await fileHash(join(installed,b.path)),b.sha256);
 for(const b of report.sourceBindings){assert.equal(await fileHash(b.source),b.sha256);if(b.target)assert.equal(await fileHash(b.target),b.sha256);}
 assert.equal(await fileHash(runtime),report.runtimeSha256);
 report.outcome=report.processes.some(x=>x.outcome==='Fail')?'Fail':report.processes.every(x=>x.outcome==='ObservedValidWindows')?'ObservedValidWindows':'ObservedWithMeasurementOrOperationLimits';
}catch(error){report.outcome='Fail';report.errors.push({name:error.name,message:error.message,stack:error.stack});}
finally{report.finished=new Date().toISOString();await save();await out.close();}
console.log(JSON.stringify({outcome:report.outcome,processes:report.processes.length,directory}));if(report.outcome==='Fail')process.exitCode=1;
