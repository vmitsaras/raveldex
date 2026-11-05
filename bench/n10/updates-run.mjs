// RX-9005 finite serial update collector. No install/build/network on import or run.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp, copyFile, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { inventory } from '../n9/run.mjs';
import { instrumentPackage } from '../n9/instrument.mjs';
import { validateManifest, verifyEnvironment } from './run.mjs';
import { UPDATE_CONTRACT, UPDATE_CONTRACT_SHA256, UPDATE_METHOD, updateHash as hash, planUpdates, updateJobKey, casesFor, notApplicableCasesFor, repetitionsFor, warmupsFor, workloadForUpdate, scenarioFor, schema } from './updates-contract.mjs';
export { planUpdates, updateJobKey } from './updates-contract.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const SHA=/^[a-f0-9]{64}$/u;
const normalize=rows=>[...rows].sort((a,b)=>a.path.localeCompare(b.path));
export const UPDATE_HARNESS=Object.freeze(['bench/n10/updates-run.mjs','bench/n10/updates-child.mjs','bench/n10/updates-contract.mjs','bench/n10/updates-verify.mjs','bench/n10/run.mjs','bench/n10/contract.mjs','bench/n9/paired-node.mjs','bench/n9/run.mjs','bench/n9/instrument.mjs','bench/n9/workloads.mjs','test/oracle/query.mjs','test/comparison/n10-updates-method.test.mjs','test/fixtures/n9/freeze.json','test/fixtures/relevance/corpus.json','docs/evaluation/RX-9001-method.json','docs/evaluation/RX-9001-method.md','docs/evidence/RX-9005/collection-budget-revision.json']);
export const configurationHash=id=>hash({schema,configuration:UPDATE_METHOD.configurations.find(c=>c.id===id),limits:'unchanged-native-defaults'});
export function validateUpdateRows(rows,{profile,manifest,manifestSha256,harnessSha256}) {
 assert.ok(['full','pilot'].includes(profile)); validateManifest(manifest);assert.match(manifestSha256,SHA);assert.match(harnessSha256,SHA);
 const jobs=planUpdates(profile),expected=new Map(jobs.map(j=>[updateJobKey(j),j])),seen=new Set();
 assert.equal(rows.length,jobs.length,'missing/extra update children');assert.equal(new Set(rows.map(r=>r.pid)).size,rows.length,'fresh process per child');
 const totals={children:rows.length,normalWindows:0,diagnosticWindows:0,warmups:0,publicCalls:0,normalPublicCalls:0,diagnosticPublicCalls:0,notApplicableCaseRows:0};
 for(const row of rows) {
  const key=updateJobKey(row),job=expected.get(key);assert.ok(job&&!seen.has(key),'missing/duplicate/unexpected child');seen.add(key);
  assert.equal(row.kind,'rx9005-update-child-v1');assert.equal(row.outcome,'Collected');assert.ok(Number.isSafeInteger(row.pid)&&row.pid>0);
  for(const name of ['profile','size','configuration','deadline','deadlineOptions','role','owner','mode'])assert.deepEqual(row[name],job[name],'job drift '+name);
  const artifact=manifest.artifacts.find(a=>a.role===job.role);
  assert.equal(row.artifactSha256,artifact.sha256);assert.deepEqual(row.artifactSource,artifact.source);assert.equal(row.packageInventorySha256,hash(normalize(artifact.members)));
  assert.equal(row.contractSha256,UPDATE_CONTRACT_SHA256);assert.equal(row.artifactManifestSha256,manifestSha256);assert.equal(row.harnessSha256,harnessSha256);assert.equal(row.configurationSha256,configurationHash(job.configuration));
  assert.deepEqual(row.identity,workloadForUpdate(job.size).identity);assert.equal(row.runtime.node,process.version);assert.deepEqual(row.runtime.execArgv,[]);
  assert.equal(row.packageMetadataSha256,artifact.members.find(m=>m.path==='package.json').sha256);
  assert.deepEqual(row.notApplicable,notApplicableCasesFor(job.size),'zero-attempt inapplicable coverage');totals.notApplicableCaseRows+=row.notApplicable.length;
  const selected=job.mode==='normal'?row.samples:row.observations,hidden=job.mode==='normal'?row.observations:row.samples;assert.deepEqual(hidden,[],'hidden lane');
  const descriptors=casesFor(job.size),keys=new Set();
  for(const descriptor of descriptors) {
   const samples=selected.filter(x=>x.caseKey===descriptor.caseKey),warmups=row.warmups.filter(x=>x.caseKey===descriptor.caseKey),reps=repetitionsFor(job,descriptor);
   assert.equal(samples.length,reps,'sample count');assert.equal(warmups.length,warmupsFor(job,descriptor),'warmup count');
   assert.deepEqual(samples.map(x=>x.repetition),Array.from({length:reps},(_,i)=>i),'ordered repetitions');assert.deepEqual(warmups.map(x=>x.repetition),Array.from({length:warmupsFor(job,descriptor)},(_,i)=>i),'ordered warmups');
   for(const [isWarm,items]of [[false,samples],[true,warmups]])for(const item of items) {
    const identity=[descriptor.caseKey,isWarm,item.repetition].join(':');assert.ok(!keys.has(identity));keys.add(identity);
    const scenario=scenarioFor(descriptor,job.size,{repetition:item.repetition});assert.equal(item.requestedCalls,scenario.calls.length);assert.equal(item.beforePopulation,scenario.beforeRecords.length);
    assert.match(item.traceSha256,SHA);const trace=row.traces[item.traceSha256];assert.ok(trace);assert.equal(hash(trace),item.traceSha256);assert.equal(trace.caseKey,descriptor.caseKey);assert.equal(trace.batch,descriptor.batch);assert.equal(trace.vocabularyRule,scenario.vocabularyRule);assert.deepEqual(trace.calls,scenario.calls,'actual ordered input trace');assert.deepEqual(trace.preparationCalls,scenario.preparationCalls);assert.equal(trace.beforeRecordsSha256,hash(scenario.beforeRecords));assert.equal(trace.afterRecordsSha256,hash(scenario.afterRecords));assert.equal(item.id,descriptor.id);assert.equal(item.kind,descriptor.kind);assert.equal(item.batch,descriptor.batch);assert.equal(item.publicCall,descriptor.publicCall);
    assert.ok(['Pass','Refused'].includes(item.outcome),'unexpected mutation outcome');assert.ok(Number.isSafeInteger(item.beforeRevision)&&item.beforeRevision>0);assert.ok(Number.isSafeInteger(item.afterRevision));
    assert.equal(item.callWindows.length,item.attemptedCalls);for(const [callIndex,call]of item.callWindows.entries()){assert.equal(call.callIndex,callIndex);assert.equal(call.method,scenario.calls[callIndex].method);assert.equal(call.returned,true,'public factory returns Promise');assert.equal(call.outcome,callIndex<item.completedCalls?'Pass':'Refused');assert.ok(Math.abs(call.invocationToSettlementMs-call.invocationToReturnMs-call.returnToSettlementMs)<1e-6,'observable boundary sum');assert.ok(Number.isFinite(call.invocationToSettlementMs)&&call.invocationToSettlementMs>=0);if(call.invocationToReturnMs!==undefined)assert.ok(Number.isFinite(call.invocationToReturnMs)&&call.invocationToReturnMs>=0);if(call.returnToSettlementMs!==undefined)assert.ok(Number.isFinite(call.returnToSettlementMs)&&call.returnToSettlementMs>=0);}assert.equal(item.completedCalls,item.receipts.length);assert.equal(item.atomicCallsVerified,item.completedCalls);assert.equal(item.prefixStates.length,item.completedCalls);assert.equal(item.attemptedCalls,item.completedCalls+(item.outcome==='Refused'?1:0));assert.ok(item.attemptedCalls<=item.requestedCalls);
    let population=item.beforePopulation;
    for(let i=0;i<item.receipts.length;i++) {
     const call=scenario.calls[i],receipt=item.receipts[i],count=call.method==='addMany'?call.input.length:1;
     assert.deepEqual(receipt,{revision:item.beforeRevision+i+1,changed:true,added:['add','addMany'].includes(call.method)?count:0,replaced:call.method==='replace'?1:0,removed:call.method==='remove'?1:0},'independent literal per-call receipt');
     population+=receipt.added-receipt.removed;assert.equal(item.prefixStates[i].revision,receipt.revision);assert.match(item.prefixStates[i].state,SHA);assert.ok(row.states[item.prefixStates[i].state],'prefix state capture missing');
    }
    assert.equal(item.afterRevision,item.beforeRevision+item.completedCalls);assert.equal(item.afterPopulation,population);assert.match(item.beforeState,SHA);assert.match(item.afterState,SHA);assert.ok(row.states[item.beforeState]&&row.states[item.afterState]);
    if(item.outcome==='Pass'){assert.equal(item.completedCalls,item.requestedCalls);assert.equal(item.afterPopulation,scenario.afterRecords.length);assert.equal(item.error,undefined);}
    else {assert.ok(['WORK_LIMIT_EXCEEDED','DEADLINE_EXCEEDED','LIMIT_EXCEEDED','RESOURCE_EXHAUSTED'].includes(item.error?.code));assert.equal(item.failedCallPreservedAuthoritativePrefix,true);}
    if(isWarm){assert.equal(item.phase,'untimed-warmup');for(const n of ['wallMs','cpuUserMs','cpuSystemMs'])assert.equal(item[n],undefined);totals.warmups++;}
    else {
     assert.ok([item.wallMs,item.cpuUserMs,item.cpuSystemMs].every(x=>Number.isFinite(x)&&x>=0),'invalid wall/CPU');
     const phase=job.mode==='diagnostic'?'diagnostic-first-call':job.size===1000&&descriptor.id==='replace-existing-vocabulary'?'after-two-warmups':item.repetition?'repeat-same-owner':'first-call-for-case';assert.equal(item.phase,phase);
     if(job.mode==='normal'){assert.equal(item.counters,undefined);totals.normalWindows++;totals.normalPublicCalls+=item.attemptedCalls;}
     else {assert.ok(item.counters);for(const n of ['emittedSteps','emittedWorkUnits','hostYields'])assert.ok(Number.isSafeInteger(item.counters[n])&&item.counters[n]>=0);totals.diagnosticWindows++;totals.diagnosticPublicCalls+=item.attemptedCalls;}
     totals.publicCalls+=item.attemptedCalls;
    }
   }
  }
  assert.equal(selected.length,descriptors.reduce((s,c)=>s+repetitionsFor(job,c),0));assert.equal(row.warmups.length,descriptors.reduce((s,c)=>s+warmupsFor(job,c),0));
  assert.ok(row.preparation.length>0&&row.checkpoints.length>0);assert.equal(row.preparation[0].purpose,'initialize-native-factory-and-providers');
  for(const p of row.preparation)assert.equal(p.outcome,'Pass','preparation refusal invalidates complete selected cohort');
 }
 assert.equal(seen.size,jobs.length);if(profile==='full'){assert.equal(totals.normalWindows,5544);assert.equal(totals.diagnosticWindows,696);assert.equal(totals.warmups,72);}
 return totals;
}
async function pins(){return Promise.all(UPDATE_HARNESS.map(async path=>({path,sha256:hash(await readFile(join(ROOT,path)))})));}
function runChild(args,cwd,ms){return new Promise((yes,no)=>{const child=spawn(process.execPath,args,{cwd,stdio:['ignore','pipe','pipe']});let log='',timedOut=false,kill;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');kill=setTimeout(()=>child.kill('SIGKILL'),1000);},ms);child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);child.on('error',e=>{clearTimeout(timer);clearTimeout(kill);no(e);});child.on('close',(code,signal)=>{clearTimeout(timer);clearTimeout(kill);yes({code,signal,timedOut,log});});});}
export const APPROVED_UPDATE_BUDGET_REVISION=Object.freeze({id:'owner-approved-150m-20261105',originalBudgetMs:5400000,revisedBudgetMs:9000000,perChildMs:600000});
export function resolveUpdateBudget(profile,{probeJob,budgetRevision}={}) {
 assert.ok(['full','pilot'].includes(profile));
 if(budgetRevision===undefined)return {budgetMs:probeJob?UPDATE_METHOD.watchdogMs:UPDATE_METHOD.budgetMs,budgetRevision:null};
 assert.equal(profile,'full','budget revision is full-only');assert.equal(probeJob,undefined,'budget revision cannot alter probes');assert.equal(budgetRevision,APPROVED_UPDATE_BUDGET_REVISION.id,'unknown/unapproved budget revision');
 return {budgetMs:APPROVED_UPDATE_BUDGET_REVISION.revisedBudgetMs,budgetRevision:APPROVED_UPDATE_BUDGET_REVISION};
}
export async function runUpdates({artifacts,profile='full',output,probeJob,budgetRevision}) {
 assert.ok(['full','pilot'].includes(profile));if(probeJob){assert.equal(profile,'full');assert.ok(planUpdates('full').some(j=>JSON.stringify(j)===JSON.stringify(probeJob)),'probe must be exact full job');}
 const resolvedBudget=resolveUpdateBudget(profile,{probeJob,budgetRevision});output=resolve(output);await mkdir(output);const began=performance.now(),budget=resolvedBudget.budgetMs;
 const report={kind:'rx9005-update-run-v1',profile:probeJob?'bounded-full-job-probe':profile,outcome:'Running',startedAt:new Date().toISOString(),observedCheckoutHead:null,intendedPerformanceCollection:profile==='full'&&!probeJob,acceptedPerformanceEvidence:false,budgetMs:budget,budgetRevision:resolvedBudget.budgetRevision,perChildMs:UPDATE_METHOD.watchdogMs,scope:'Serial actual public mutation windows on isolated installed artifacts. Untimed independent complete-state/prefix verification, preparation/reset, native errors and inapplicable cases retained separately.',runs:[],packages:{}};
 const rows=[],configs=[],outputPins=[];let manifestBytes,manifest,harness;
 try {
  manifestBytes=await readFile(artifacts);manifest=validateManifest(JSON.parse(manifestBytes));report.artifactManifestSha256=hash(manifestBytes);report.artifacts=manifest;await verifyEnvironment(manifest.environment);
  report.observedCheckoutHead=manifest.rx9005RunIdentity.observedCheckoutHead;assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),report.observedCheckoutHead,'actual checkout HEAD drift');harness=await pins();report.harness=harness;report.harnessSha256=hash(harness);for(const pin of harness){const target=join(output,'executed-harness',pin.path);await mkdir(dirname(target),{recursive:true});await copyFile(join(ROOT,pin.path),target);assert.equal(hash(await readFile(target)),pin.sha256);}report.executedHarness='executed-harness';report.contract=UPDATE_CONTRACT;report.contractSha256=UPDATE_CONTRACT_SHA256;
  for(const a of manifest.artifacts)assert.equal(hash(await readFile(a.archive)),a.sha256);
  for(const role of UPDATE_CONTRACT.roles){
   const a=manifest.artifacts.find(x=>x.role===role),input=await realpath(a.consumer),root=join(input,'node_modules/@vmitsaras/raveldex');assert.equal(await realpath(root),root);const members=await inventory(root);assert.deepEqual(normalize(members),normalize(a.members));const contexts={};
   for(const mode of ['normal','diagnostic']){const directory=join(output,role+'-'+mode),copy=join(directory,'node_modules/@vmitsaras/raveldex');await mkdir(dirname(copy),{recursive:true});await cp(root,copy,{recursive:true});await writeFile(join(directory,'package.json'),JSON.stringify({private:true,type:'module'})+'\n');const instrumentation=mode==='diagnostic'?await instrumentPackage(copy):null;await copyFile(join(ROOT,'bench/n10/updates-child.mjs'),join(directory,'updates-child.mjs'));contexts[mode]={directory,root:copy,members:await inventory(copy),instrumentation};}
   report.packages[role]={input,root,members,contexts};
  }
  await writeFile(join(output,'start.json'),JSON.stringify(report,null,2)+'\n');
  const jobs=probeJob?[probeJob]:planUpdates(profile);
  for(const job of jobs){
   const name=updateJobKey(job),file=join(output,name+'.json'),configFile=join(output,name+'.config.json'),a=manifest.artifacts.find(x=>x.role===job.role);
   const config={...job,contractSha256:UPDATE_CONTRACT_SHA256,artifactManifestSha256:report.artifactManifestSha256,harnessSha256:report.harnessSha256,artifactSha256:a.sha256,artifactSource:a.source,packageInventorySha256:hash(normalize(a.members)),configurationSha256:configurationHash(job.configuration)};
   await writeFile(configFile,JSON.stringify(config,null,2)+'\n');configs.push({path:configFile,sha256:hash(await readFile(configFile))});assert.ok(performance.now()-began<budget,'global update collection budget exhausted');
   const context=report.packages[job.role].contexts[job.mode],args=[join(context.directory,'updates-child.mjs'),pathToFileURL(join(ROOT,'bench/n10/updates-contract.mjs')).href,pathToFileURL(join(ROOT,'bench/n10/updates-verify.mjs')).href,pathToFileURL(join(ROOT,'bench/n9/instrument.mjs')).href,configFile,file];
   const result=await runChild(args,context.directory,Math.max(1,Math.min(UPDATE_METHOD.watchdogMs,budget-(performance.now()-began))));await writeFile(join(output,name+'.txt'),result.log);
   report.runs.push({name,...job,command:[process.execPath,...args],exitCode:result.code,signal:result.signal,timedOut:result.timedOut,output:name+'.json'});await writeFile(join(output,'progress.json'),JSON.stringify(report,null,2)+'\n');
   assert.equal(result.timedOut,false,'watchdog: incomplete update collection '+name);assert.equal(result.code,0,name+' failed');const row=JSON.parse(await readFile(file));rows.push(row);outputPins.push({path:file,sha256:hash(await readFile(file))});for(const state of Object.values(row.states)){assert.ok(typeof state.file==='string'&&!state.file.startsWith('/')&&!state.file.split('/').includes('..'));const statePath=join(output,state.file),bytes=await readFile(statePath);assert.equal(hash(bytes),state.sha256,'state file drift');assert.equal(bytes.length,state.bytes);outputPins.push({path:statePath,sha256:state.sha256});}console.log(JSON.stringify({name,outcome:row.outcome,windows:row.samples.length+row.observations.length}));
  }
  if(probeJob){assert.equal(rows.length,1);assert.equal(rows[0].outcome,'Collected');report.probe={requestedJob:probeJob,scope:'Feasibility/harness only; never full-matrix performance acceptance',windows:rows[0].samples.length+rows[0].observations.length};}
  else report.totals=validateUpdateRows(rows,{profile,manifest,manifestSha256:report.artifactManifestSha256,harnessSha256:report.harnessSha256});
  assert.ok(performance.now()-began<=budget,'global update collection budget exhausted');report.outcome='Collected';
 }catch(error){report.outcome='Fail';report.failure={name:error.name,message:error.message,stack:error.stack};throw error;}
 finally{
  try{
   if(report.observedCheckoutHead)assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),report.observedCheckoutHead,'actual checkout HEAD drift');if(manifestBytes)assert.equal(hash(await readFile(artifacts)),hash(manifestBytes),'manifest drift');if(harness){assert.deepEqual(await pins(),harness,'harness/workload drift');for(const pin of harness)assert.equal(hash(await readFile(join(output,'executed-harness',pin.path))),pin.sha256,'retained executed harness drift');}
   for(const [role,p]of Object.entries(report.packages)){assert.deepEqual(await inventory(p.root),p.members,'input consumer drift');const a=manifest.artifacts.find(x=>x.role===role);assert.equal(hash(await readFile(a.archive)),a.sha256);for(const c of Object.values(p.contexts)){assert.deepEqual(await inventory(c.root),c.members,'staged package drift');assert.equal(hash(await readFile(join(c.directory,'updates-child.mjs'))),harness.find(x=>x.path==='bench/n10/updates-child.mjs').sha256,'staged child drift');}}
   for(const c of [...configs,...outputPins])assert.equal(hash(await readFile(c.path)),c.sha256,'config/output drift');if(manifest){for(const a of manifest.artifacts)assert.equal(hash(await readFile(a.archive)),a.sha256);await verifyEnvironment(manifest.environment);}assert.ok(performance.now()-began<=budget,'global collection budget including output identity guards exhausted');report.guards='Pass';
  }catch(error){report.outcome='Fail';report.guardFailure={name:error.name,message:error.message};throw error;}
  finally{report.finishedAt=new Date().toISOString();report.elapsedMs=performance.now()-began;await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
 }
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);assert.ok([6,8].includes(args.length),'usage: --artifacts MANIFEST --profile full|pilot --output NEW_DIRECTORY [--budget-revision owner-approved-150m-20261105]');assert.deepEqual([args[0],args[2],args[4]],['--artifacts','--profile','--output']);if(args.length===8)assert.equal(args[6],'--budget-revision');await runUpdates({artifacts:resolve(args[1]),profile:args[3],output:args[5],budgetRevision:args[7]});
}
