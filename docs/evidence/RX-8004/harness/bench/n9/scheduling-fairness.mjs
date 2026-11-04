// RX-8004 diagnostic-only long-work fairness probe. No normal timing claims.
// All mutable assets/packages live under the fresh output directory.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { chromium, webkit } from 'playwright-core';
import { build, version as esbuildVersion } from 'esbuild';
import { instrumentScheduling } from './scheduling.mjs';
import { localSchedulingDiagnostic } from './scheduling-child.mjs';
import { workloadFor, verifyFrozen, schema } from './workloads.mjs';
import { inventory, digest } from './run.mjs';

async function stage(directory, workload) {
  directory=await realpath(directory);
  const packageRoot=join(directory,'node_modules/@vmitsaras/raveldex');
  const instrumentation=await instrumentScheduling(packageRoot);
  const enginePath=join(packageRoot,'dist/core/execution/engine.js'),engine=await readFile(enginePath,'utf8');
  const anchor='if(n9){n9.workUnits += step.value.workUnits; n9.steps++;}';
  assert.equal(engine.split(anchor).length-1,1,'first-work fairness anchor drift');
  const changed=engine.replace(anchor,anchor+" if(n9 && !n9.armed){n9.armed=true;n9.arm?.();}");
  await writeFile(enginePath,changed);
  const imports="import {createRaveldex} from '@vmitsaras/raveldex';import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';";
  const definitions=`const configuration=()=>({schema:${JSON.stringify(schema)},addons:[createSourceProvider({fields:['body']}),createSourcePhrases({fields:['body']})]});const diagnostic=(${localSchedulingDiagnostic.toString()})();const key=Symbol.for('raveldex.n9.scheduling');`;
  const worker=imports+"import {serveRaveldexWorker} from '@vmitsaras/raveldex/adapters/worker/host';"+definitions+`
self.addEventListener('message',event=>{if(!event.data?.fairnessControl)return;event.stopImmediatePropagation();const {id,operation}=event.data;let value;
 try{if(operation==='start'){diagnostic.start();const d=globalThis[key];d.arm=()=>{setTimeout(()=>{d.timer={steps:d.steps,pending:!d.engineSettled,at:performance.now()};},0);self.postMessage({fairnessControl:true,started:true,steps:d.steps});};}
 else if(operation==='ping'){const d=globalThis[key];value={steps:d?.steps??0,pending:!!d&&!d.engineSettled,at:performance.now()};if(d)d.inboundPing=value;}
 else if(operation==='stop'){const d=globalThis[key];if(d)delete d.arm;value=diagnostic.stop();}
 self.postMessage({fairnessControl:true,id,value});}catch(error){self.postMessage({fairnessControl:true,id,error:{name:error.name,message:error.message}});}});
const scope={postMessage(message){const d=globalThis[key];if(d&&message.operation==='search'&&(message.kind==='result'||message.kind==='error')){d.engineSettled=true;d.engineSettledAt=performance.now();}self.postMessage(message);},addEventListener:self.addEventListener.bind(self),removeEventListener:self.removeEventListener.bind(self)};serveRaveldexWorker(scope,{addons:configuration().addons});`;
  const app=imports+"import {createWorkerRaveldex} from '@vmitsaras/raveldex/adapters/worker';"+definitions+`
const records=${JSON.stringify(workload.records)},query=${JSON.stringify(workload.queries.find(row=>row.id==='common').query)};
window.runFairness=async execution=>{let owner,worker,sequence=0,pingPromise;const pending=new Map();
 const rpc=operation=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Fairness worker control outcome unknown'));},60000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});worker.postMessage({fairnessControl:true,id,operation});});
 let windowListener;
 try{if(execution==='direct')owner=createRaveldex(configuration());else{worker=new Worker('./worker.mjs',{type:'module'});worker.addEventListener('message',event=>{if(!event.data?.fairnessControl)return;event.stopImmediatePropagation();if(event.data.started){pingPromise=rpc('ping');return;}const p=pending.get(event.data.id);if(p){pending.delete(event.data.id);event.data.error?p.reject(Error(event.data.error.message)):p.resolve(event.data.value);}});owner=await createWorkerRaveldex({worker,configuration:configuration(),ownership:'owned',sameHost:true,responseTimeoutMs:60000});}
 for(let offset=0;offset<records.length;offset+=256)await owner.addMany(records.slice(offset,offset+256),{deadlineMs:60000});
 if(execution==='direct'){diagnostic.start();const d=globalThis[key];windowListener=event=>{if(event.source===window&&event.data?.fairnessWindowPing)d.windowMessage={steps:d.steps,pending:!d.engineSettled,at:performance.now()};};window.addEventListener('message',windowListener);d.arm=()=>{setTimeout(()=>{d.timer={steps:d.steps,pending:!d.engineSettled,at:performance.now()};},0);window.postMessage({fairnessWindowPing:true},location.origin);};}else await rpc('start');
 const start=performance.now();let result,error;try{result=await owner.search(query,{limit:20,deadlineMs:60000});}catch(caught){error={name:caught.name,code:caught.code,reason:caught.reason??null,details:caught.details??null,message:caught.message};}
 const observedWallMs=performance.now()-start;
 let counters,ping;if(execution==='direct'){const d=globalThis[key];d.engineSettled=true;d.engineSettledAt=performance.now();delete d.arm;await new Promise(resolve=>setTimeout(resolve,10));counters=diagnostic.stop();}else{if(pingPromise)ping=await pingPromise;counters=await rpc('stop');}
 return{execution,result,error,observedWallMs,counters,ping,classification:{timerDuringBusy:counters.timer?.pending===true,heartbeatDuringBusy:counters.heartbeats>0,inboundEventDuringBusy:execution==='direct'?counters.windowMessage?.pending===true:counters.inboundPing?.pending===true},scope:'One intrusive 1000-record query. Initial-work hook arms actual zero-delay timer and Window message or worker outbound-start/inbound-ping exchange. Event records say whether native query was still pending. These are not physical input, whole-task timing or latency samples.'};
 }finally{if(windowListener)window.removeEventListener('message',windowListener);await owner?.dispose();worker?.terminate();for(const p of pending.values())p.reject(Error('worker ended'));pending.clear();delete globalThis[key];}
};`;
  const bundles={};
  for(const [name,contents] of [['app.mjs',app],['worker.mjs',worker]]){
    const result=await build({stdin:{contents,resolveDir:directory,sourcefile:name+'.entry.mjs'},absWorkingDir:directory,bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,treeShaking:true,legalComments:'none',charset:'ascii',write:false,metafile:true,logLevel:'silent'});
    for(const [path,input] of Object.entries(result.metafile.inputs)){assert.ok(path===name+'.entry.mjs'||path.startsWith('node_modules/@vmitsaras/raveldex/dist/'),path);assert.ok(input.imports.every(item=>!item.external));}
    const bytes=result.outputFiles[0].contents;await writeFile(join(directory,name),bytes);bundles[name]={sha256:digest(bytes),bytes:bytes.length,inputs:result.metafile.inputs};
  }
  await writeFile(join(directory,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><title>RX-8004 fairness probe</title><body><h1>Fairness probe</h1><script type="module" src="./app.mjs"></script></body></html>');
  return{instrumentation,firstWorkPatch:{originalSha256:digest(engine),instrumentedSha256:digest(changed),anchor},bundles};
}
async function main(){
  assert.equal(process.argv.length,5,'Pass baseline consumer, candidate consumer, fresh output');const output=resolve(process.argv[4]);await mkdir(output);
  const workload=verifyFrozen(workloadFor('adversarial',1000)),packages={},routes={};
  for(const variant of ['baseline','candidate']){const consumer=await realpath(resolve(process.argv[variant==='baseline'?2:3])),source=join(consumer,'node_modules/@vmitsaras/raveldex');assert.equal(await realpath(source),source);const metadata=JSON.parse(await readFile(join(source,'package.json'),'utf8'));assert.equal(metadata.name,'@vmitsaras/raveldex');assert.deepEqual(metadata.dependencies??{},{});const members=await inventory(source),directory=join(output,variant);await mkdir(join(directory,'node_modules/@vmitsaras'),{recursive:true});await cp(source,join(directory,'node_modules/@vmitsaras/raveldex'),{recursive:true});await writeFile(join(directory,'package.json'),JSON.stringify({private:true,type:'module'}));const staged=await stage(directory,workload);packages[variant]={source,metadata,members,inventorySha256:digest(JSON.stringify(members)),directory,...staged};routes[variant]=directory;}
  const server=createServer(async(request,response)=>{const match=/^\/(baseline|candidate)\/(index\.html|app\.mjs|worker\.mjs)$/.exec(new URL(request.url,'http://localhost').pathname);if(!match){response.writeHead(404).end();return;}try{response.setHeader('content-type',match[2].endsWith('.html')?'text/html':'text/javascript');response.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'");response.end(await readFile(join(routes[match[1]],match[2])));}catch{response.writeHead(500).end();}});
  await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});const origin=`http://127.0.0.1:${server.address().port}`;
  const ownPath=fileURLToPath(import.meta.url),ownHash=digest(await readFile(ownPath)),report={kind:'rx8004-long-work-fairness-v1',startedAt:new Date().toISOString(),harness:{path:ownPath,sha256:ownHash},packages,workload:workload.identity,environment:{node:process.version,platform:process.platform,arch:process.arch,esbuild:esbuildVersion},browsers:[],runs:[],outcome:'Running',limitations:['One diagnostic owner/query per configuration, no p50/p95/CPU or exclusive physical-task claim.','Window message and worker ping are actual task deliveries, not physical input. Timer/heartbeat records are same-realm work-pending observations.','This probe does not replace cancellation/receipt regression suites.']};let browser;
  try{for(const channel of (process.env.RAVELDEX_SCHEDULING_BROWSERS??'chrome,chromium,webkit').split(',')){assert.ok(['chrome','chromium','webkit'].includes(channel));try{browser=channel==='webkit'?await webkit.launch({headless:true}):await chromium.launch({...(channel==='chrome'?{channel:'chrome'}:{}),headless:true});}catch(error){report.browsers.push({channel,outcome:'Blocked',reason:error.message});continue;}report.browsers.push({channel,version:browser.version(),outcome:'Pass'});
    for(const execution of ['direct','worker'])for(const variant of ['baseline','candidate']){const context=await browser.newContext(),page=await context.newPage(),pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));const name=[channel,execution,variant].join('-');try{await page.goto(`${origin}/${variant}/index.html`);await page.waitForFunction(()=>typeof window.runFairness==='function');const row=await page.evaluate(execution=>window.runFairness(execution),execution);const full={...row,variant,browser:channel,browserVersion:browser.version(),pageErrors};await writeFile(join(output,name+'.json'),JSON.stringify(full,null,2)+'\n');report.runs.push({variant,browser:channel,execution,output:name+'.json',classification:row.classification});assert.deepEqual(pageErrors,[]);assert.equal(row.error,undefined,JSON.stringify(row.error));assert.equal(row.result.total,1000);assert.equal(row.result.completeness,'complete');assert.equal(row.result.revision,4);assert.equal(row.result.hits.length,20);assert.ok(row.result.hits.every(hit=>workload.queries.find(q=>q.id==='common').expectedIds.includes(hit.id)&&Number.isFinite(hit.score)));await writeFile(join(output,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({name,...row.classification}));}catch(error){report.failureContext={name,pageErrors};throw error;}finally{await context.close();}}
    await browser.close();browser=undefined;}
    assert.ok(report.browsers.some(row=>row.outcome==='Pass'));report.parity=[];for(const entry of report.browsers.filter(row=>row.outcome==='Pass'))for(const execution of ['direct','worker']){const selected=await Promise.all(report.runs.filter(row=>row.browser===entry.channel&&row.execution===execution).map(row=>readFile(join(output,row.output),'utf8').then(JSON.parse)));assert.equal(selected.length,2);const a=selected.find(row=>row.variant==='baseline'),b=selected.find(row=>row.variant==='candidate');assert.deepEqual(b.result,a.result);assert.equal(b.counters.steps,a.counters.steps);assert.equal(b.counters.workUnits,a.counters.workUnits);assert.equal(b.counters.hostYields,a.counters.hostYields);report.parity.push({browser:entry.channel,execution,exactResult:true,sameWorkStepsYields:true});}
    report.outcome=report.browsers.some(row=>row.outcome==='Blocked')?'Pass with blocked configurations':'Pass';
  }catch(error){report.outcome='Fail';report.failure={name:error.name,message:error.message};throw error;}
  finally{await browser?.close();await new Promise(resolve=>server.close(resolve));try{for(const pack of Object.values(packages)){assert.deepEqual(await inventory(pack.source),pack.members);pack.originalPackageUnchanged=true;}assert.equal(digest(await readFile(ownPath)),ownHash);}catch(error){report.outcome='Fail';report.guardFailure=error.message;throw error;}finally{report.finishedAt=new Date().toISOString();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}}
}
if(process.argv[1]&&await realpath(resolve(process.argv[1]))===fileURLToPath(import.meta.url))await main();
