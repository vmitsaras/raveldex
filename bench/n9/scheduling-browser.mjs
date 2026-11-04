// Actual installed/bundled browser direct and real module-worker observations.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, realpath } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { chromium, webkit } from 'playwright-core';
import { build, version as esbuildVersion } from 'esbuild';
import { method, prepareScheduling, schedulingPins, finishScheduling, validateScheduling, summarizeScheduling } from './scheduling.mjs';
import { exerciseScheduling, localSchedulingDiagnostic } from './scheduling-child.mjs';
import { workloadFor, verifyFrozen, schema } from './workloads.mjs';
import { digest } from './run.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
async function bundle(directory, source, file) {
  directory = await realpath(directory);
  const result=await build({stdin:{contents:source,resolveDir:directory,sourcefile:file+'.entry.mjs'},absWorkingDir:directory,bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,treeShaking:true,legalComments:'none',charset:'ascii',write:false,metafile:true,logLevel:'silent'});
  for(const [path,input] of Object.entries(result.metafile.inputs)){assert.ok(path===file+'.entry.mjs'||path.startsWith('node_modules/@vmitsaras/raveldex/dist/'),path);assert.ok(input.imports.every(i=>!i.external));}
  const bytes=result.outputFiles[0].contents;await writeFile(join(directory,file),bytes);return {file,sha256:digest(bytes),bytes:bytes.length,inputs:result.metafile.inputs};
}
async function stage(directory, workload, forcedFallback) {
  const imports=`import {createRaveldex} from '@vmitsaras/raveldex';import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';`;
  const common=`const exercise=${exerciseScheduling.toString()};const localDiagnostic=${localSchedulingDiagnostic.toString()};const records=${JSON.stringify(workload.records)};const queries=${JSON.stringify(workload.queries.filter(q=>method.queries.includes(q.id)))};const schema=${JSON.stringify(schema)};const configuration=()=>({schema,addons:[createSourceProvider({fields:['body']}),createSourcePhrases({fields:['body']})]});`;
  const mask=forcedFallback?`for(const key of ['setImmediate','clearImmediate','MessageChannel'])Object.defineProperty(globalThis,key,{value:undefined,configurable:true,writable:true});`:'';
  const workerSource=imports+`import {serveRaveldexWorker} from '@vmitsaras/raveldex/adapters/worker/host';${mask}const diagnostic=(${localSchedulingDiagnostic.toString()})();
self.addEventListener('message',event=>{if(event.data?.schedulingBench){event.stopImmediatePropagation();const {id,operation}=event.data;try{const value=operation==='start'?diagnostic.start():diagnostic.stop();self.postMessage({schedulingBench:true,id,value});}catch(error){self.postMessage({schedulingBench:true,id,error:{message:error.message}});}}});
const scope={postMessage(message){const d=globalThis[Symbol.for('raveldex.n9.scheduling')];if(d&&message.operation==='search'&&(message.kind==='result'||message.kind==='error')){d.engineSettled=true;d.engineSettledAt=performance.now();}self.postMessage(message);},addEventListener:self.addEventListener.bind(self),removeEventListener:self.removeEventListener.bind(self)};serveRaveldexWorker(scope,{addons:[createSourceProvider({fields:['body']}),createSourcePhrases({fields:['body']})]});`;
  const appSource=imports+`import {createWorkerRaveldex} from '@vmitsaras/raveldex/adapters/worker';${mask}${common}
window.schedulingExercise=async({execution,mode,samples,warmups})=>{
 let worker,remote,sequence=0;const pending=new Map();
 const rpc=operation=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Diagnostic worker control outcome unknown'));},60000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});worker.postMessage({schedulingBench:true,id,operation});});
 const create=execution==='direct'?()=>createRaveldex(configuration()):async()=>{worker=new Worker('./worker.mjs',{type:'module'});worker.addEventListener('message',event=>{if(event.data?.schedulingBench){event.stopImmediatePropagation();const p=pending.get(event.data.id);if(p){pending.delete(event.data.id);event.data.error?p.reject(Error(event.data.error.message)):p.resolve(event.data.value);}}});remote=await createWorkerRaveldex({worker,configuration:configuration(),ownership:'owned',sameHost:true,responseTimeoutMs:60000});return remote;};
 try{return await exercise({create,records,queries,mode,samples,warmups,diagnostic:execution==='direct'?localDiagnostic():{start:()=>rpc('start'),stop:()=>rpc('stop')}});}finally{worker?.terminate();for(const p of pending.values())p.reject(Error('worker ended'));pending.clear();}
};`;
  const worker=await bundle(directory,workerSource,'worker.mjs'),app=await bundle(directory,appSource,'app.mjs');
  await writeFile(join(directory,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><title>RX-8004 scheduling measurement</title><body><h1>Scheduling measurement</h1><script type="module" src="./app.mjs"></script></body></html>');
  return {worker,app};
}
async function main() {
  assert.equal(process.argv.length,5,'Pass baseline consumer, candidate consumer, fresh output');const output=resolve(process.argv[4]);await mkdir(output);
  const harness=await schedulingPins(),packages=await prepareScheduling({baseline:process.argv[2],candidate:process.argv[3]},output),size=Number(process.env.RAVELDEX_SCHEDULING_BROWSER_SIZE??method.browserSize),samples=Number(process.env.RAVELDEX_SCHEDULING_SAMPLES??method.samplesPerOwner),forcedFallback=process.env.RAVELDEX_SCHEDULING_FALLBACK==='1';
  assert.ok([100,1000].includes(size)&&Number.isInteger(samples)&&samples>0);
  const workload=verifyFrozen(workloadFor('adversarial',size)),routes={},bundles={};
  for(const variant of ['baseline','candidate'])for(const mode of ['normal','diagnostic']){
    const directory=mode==='normal'?packages[variant].directory:packages[variant].diagnostic;
    const label=variant+'-'+mode;bundles[label]=await stage(directory,workload,forcedFallback);routes[label]=directory;
  }
  const server=createServer(async(request,response)=>{const path=new URL(request.url,'http://localhost').pathname;const match=/^\/((?:baseline|candidate)-(?:normal|diagnostic))\/(index\.html|app\.mjs|worker\.mjs)$/.exec(path);if(!match){response.writeHead(404).end();return;}try{response.setHeader('content-type',match[2].endsWith('.html')?'text/html':'text/javascript');response.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'");response.end(await readFile(join(routes[match[1]],match[2])));}catch{response.writeHead(500).end();}});
  await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});const origin=`http://127.0.0.1:${server.address().port}`;
  const report={kind:'rx8004-browser-scheduling-v1',startedAt:new Date().toISOString(),harness,packages,bundles,workload:workload.identity,
    method:{...method,browserSize:size,samplesPerOwner:samples,forcedFallback,normal:'Three fresh browser contexts/owners per variant/execution/channel; two discarded warmups and forty measured calls per query. Direct and real module-worker Promise latency measured independently. CPU is Not measured; never subtract hosts.',diagnostic:'Private instrumented package copies only, engine pump spans and same-realm4ms timer heartbeat. Worker counters cross an explicit out-of-band control protocol; timer pulses count only after emitted work starts and before native search result publication. No physical-input/paint/whole-OS-task claims.'},environment:{node:process.version,platform:process.platform,arch:process.arch,playwright:JSON.parse(await readFile(join(root,'node_modules/playwright-core/package.json'))).version,esbuild:esbuildVersion},browsers:[],runs:[],outcome:'Running'};
  let activeBrowser;
  try {
    const channels=(process.env.RAVELDEX_SCHEDULING_BROWSERS??'chrome,chromium,webkit').split(',');assert.ok(channels.every(c=>['chrome','chromium','webkit'].includes(c)));
    for(const channel of channels){
      try{activeBrowser=channel==='webkit'?await webkit.launch({headless:true}):await chromium.launch({...(channel==='chrome'?{channel:'chrome'}:{}),headless:true});}
      catch(error){report.browsers.push({channel,outcome:'Blocked',reason:error.message});continue;}
      const version=activeBrowser.version();report.browsers.push({channel,version,outcome:'Pass'});
      for(let owner=0;owner<4;owner++)for(const execution of owner%2?['worker','direct']:['direct','worker'])for(const variant of owner%2?['candidate','baseline']:['baseline','candidate']){
        const mode=owner===3?'diagnostic':'normal',context=await activeBrowser.newContext(),page=await context.newPage(),pageErrors=[],requests=[];page.on('pageerror',error=>pageErrors.push(error.message));page.on('request',request=>{if(!request.url().startsWith(origin))requests.push(request.url());});
        const name=[channel,execution,variant,owner,mode].join('-');
        try{await page.goto(`${origin}/${variant}-${mode}/index.html`);await page.waitForFunction(()=>typeof window.schedulingExercise==='function');
          const row=await page.evaluate(options=>window.schedulingExercise(options),{execution,mode,samples,warmups:method.warmups});
          const full={...row,variant,owner,mode,size,browser:channel,browserVersion:version,execution:forcedFallback?execution+'-timer-fallback':execution,pageErrors,externalRequests:requests};
          await writeFile(join(output,name+'.json'),JSON.stringify(full,null,2)+'\n');report.runs.push({variant,owner,mode,size,browser:channel,execution:full.execution,output:name+'.json',outcome:row.outcome});await writeFile(join(output,'progress.json'),JSON.stringify(report,null,2)+'\n');assert.deepEqual(pageErrors,[]);assert.deepEqual(requests,[]);assert.equal(row.outcome,'Pass',name+' failed');console.log(JSON.stringify({name,outcome:row.outcome}));
        }catch(error){const failure={variant,owner,mode,size,browser:channel,execution,pageErrors,externalRequests:requests,outcome:'Fail',error:{name:error.name,message:error.message}};await writeFile(join(output,name+'-failure.json'),JSON.stringify(failure,null,2)+'\n');report.runs.push({...failure,output:name+'-failure.json'});throw error;}finally{await context.close();}
      }
      await activeBrowser.close();activeBrowser=undefined;
    }
    assert.ok(report.browsers.some(b=>b.outcome==='Pass'),'No supported browser available');const rows=await Promise.all(report.runs.map(row=>readFile(join(output,row.output),'utf8').then(JSON.parse)));report.parity=validateScheduling(rows,samples);report.summaries=summarizeScheduling(rows);report.outcome=report.browsers.some(b=>b.outcome==='Blocked')?'Pass with blocked configurations':'Pass';
  }catch(error){report.outcome='Fail';report.failure={name:error.name,message:error.message};throw error;}
  finally{await activeBrowser?.close();await new Promise(resolve=>server.close(resolve));try{await finishScheduling(packages,harness);}catch(error){report.outcome='Fail';report.guardFailure=error.message;throw error;}finally{report.finishedAt=new Date().toISOString();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
