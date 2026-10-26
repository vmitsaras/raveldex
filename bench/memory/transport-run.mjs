// New traces only. Existing packed consumer; no pack/install/production patches.
import assert from 'node:assert/strict';
import{copyFile,mkdtemp,open,readFile,readdir,realpath}from'node:fs/promises';
import{join,resolve}from'node:path';
import{createServer}from'node:http';
import{gzipSync}from'node:zlib';
import{platform,release,arch}from'node:os';
import{chromium}from'playwright-core';
import{build,version as esbuild}from'esbuild';
import{digest,REPO_ROOT}from'../../scripts/lib/packed-consumer.mjs';
import{nestedSession}from'./browser-cdp.mjs';
import{analyzeTransportTrace}from'./transport-trace.mjs';
import{recordsFor}from'../cost-common.mjs';

assert.ok(process.argv[2]&&process.argv[3],'Supply real installed consumer and NEW output JSON');
const consumer=await realpath(process.argv[2]),output=resolve(process.argv[3]),smoke=process.argv.includes('--smoke'),file=await open(output,'wx');
const report={kind:'rx4002-product-transport-tracing-v1',startedAt:new Date().toISOString(),consumer,output,environment:{node:process.version,platform:platform(),osRelease:release(),arch:arch(),esbuild},
  method:{sizes:smoke?[1000]:[1000,10000],repetitions:smoke?1:3,smoke,deadlineMs:60000,configuration:'source-phrase module worker, public source snapshots, unchanged limits',
    scope:'Fresh serial headless Chrome browser/page/module-worker per size/repetition. Actual native postMessage plus first event.data access bracketed with primitive performance marks; only primitive envelope metadata retained.',
    instrumentation:'First data access moves into observer wrapper before actual adapter listener. Native arguments/events and ordering remain; observer marks/logs/trace can perturb elapsed time. No performance.mark detail, fake transport or production source patch.',
    work:'Complete named native factory elapsed intervals inside exact send/read brackets, correlated to adapter IDs and distinct main/worker targets/isolates/threads. Neither CPU time nor total adapter capture/validation/FIFO/codec cost.',
    memory:'Detailed global MemoryInfra point dump commands, full raw allocator attrs and serialization-named paths. Hierarchical/overlapping type/allocator quantities are not summed, assigned per message, converted to physical copies or called allocation peaks. Raw command dump GUIDs and exported event IDs remain separate.',
    archive:'Tracing ReturnAsStream original JSON bytes via bounded IO.read, gzip archived with raw/compressed hashes. Only fields used for correlation must be safe numbers; native flow IDs are unused. 64MiB raw cap, no trace loss,60s CDP/180s operation timeouts.',
    limits:'Public deadlines remain60s and response timeout120s. Typed resource/deadline restore refusals must preserve prior exact state; instrumentation does not increase native ceilings. No AT/browser-native/physical/portability/publication claim.'},
  productionFiles:[],sourceBindings:[],bundles:{},preservedEvidence:[],observations:[],outcome:'Running'};
let server;
async function save(){const s=JSON.stringify(report,null,2)+'\n';await file.write(s,0,'utf8');await file.truncate(Buffer.byteLength(s));}
async function bounded(p,label,ms=60000){let timer;try{return await Promise.race([p,new Promise((_,no)=>{timer=setTimeout(()=>no(Error(`Owned observation timeout:${label}`)),ms);})]);}finally{clearTimeout(timer);}}
async function observe(origin,size,repetition){
  const row={size,repetition,corpusSha256:digest(JSON.stringify(recordsFor(size))),outcome:'Running'};report.observations.push(row);
  let browser,context,page,main,worker,session,tracing=false;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});session=await browser.newBrowserCDPSession();row.browser=await session.send('Browser.getVersion');
    context=await browser.newContext();page=await context.newPage();main=await context.newCDPSession(page);
    await page.goto(origin);await page.waitForFunction(()=>!!window.transportHarness);
    const attached=new Promise((yes,no)=>main.once('Target.attachedToTarget',event=>{(async()=>{assert.equal(event.targetInfo.type,'worker');assert.equal(event.targetInfo.url,`${origin}/transport-worker.mjs`);assert.equal(event.waitingForDebugger,true);row.workerTarget=event;worker=nestedSession(main,event.sessionId);await worker.send('Runtime.enable');await worker.send('Runtime.runIfWaitingForDebugger');yes();})().catch(no);}));
    await main.send('Runtime.enable');await main.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:false,filter:[{type:'worker'},{exclude:true}]});
    await bounded(Promise.all([page.evaluate(()=>window.transportHarness.start()),attached]),'start');
    row.mainTarget=await main.send('Target.getTargetInfo');row.isolates={main:await main.send('Runtime.getIsolateId'),worker:await worker.send('Runtime.getIsolateId')};assert.notEqual(row.isolates.main.id,row.isolates.worker.id);
    const call=(method,arg)=>bounded(page.evaluate(({method,arg})=>window.transportHarness[method](arg),{method,arg}),method,180000);
    await call('build',size);row.built=await call('verify');const builtRevision=Math.ceil(size/256)+1;assert.ok(row.built.every(r=>r.revision===builtRevision));
    row.traceConfiguration={transferMode:'ReturnAsStream',streamFormat:'json',traceConfig:{recordMode:'recordUntilFull',includedCategories:['blink','blink.user_timing','disabled-by-default-memory-infra']}};
    await bounded(session.send('Tracing.start',row.traceConfiguration),'trace-start');tracing=true;
    row.memoryCommands=[];
    async function memory(label){await page.evaluate(label=>performance.mark(`rx:dump:${label}:begin`),label);let result;
      try{result=await bounded(session.send('Tracing.requestMemoryDump',{levelOfDetail:'detailed'}),`dump-${label}`);}catch(error){result={outcome:'Unavailable',message:error.message};}
      await page.evaluate(label=>performance.mark(`rx:dump:${label}:end`),label);row.memoryCommands.push({label,result});}
    await memory('before');row.export=await call('exportSource');await call('priorReceiver');row.prior=await call('verify',true);
    const priorRevision=builtRevision+2;assert.equal(row.prior[0].revision,priorRevision);
    row.restore=await call('restoreSource');await memory('after');
    const complete=new Promise(yes=>session.once('Tracing.tracingComplete',yes));await session.send('Tracing.end');row.traceComplete=await bounded(complete,'trace-complete');tracing=false;
    assert.equal(row.traceComplete.dataLossOccurred,false);assert.ok(row.traceComplete.stream);let handle=row.traceComplete.stream;
    const pieces=[];let bytes=0;
    try{for(;;){const part=await bounded(session.send('IO.read',{handle,size:262144}),'trace-read');const b=Buffer.from(part.data,part.base64Encoded?'base64':'utf8');bytes+=b.length;assert.ok(bytes<=64*1024*1024,'Trace exceeds64MiB bound');pieces.push(b);if(part.eof)break;}}finally{await session.send('IO.close',{handle});}
    const raw=Buffer.concat(pieces),compressed=gzipSync(raw,{level:9}),path=output.replace(/\.json$/,'')+`-trace-${size}-${repetition}.json.gz`,out=await open(path,'wx');try{await out.writeFile(compressed);}finally{await out.close();}
    row.trace={path,bytes:compressed.length,sha256:digest(compressed),decompressedBytes:raw.length,decompressedSha256:digest(raw)};
    row.received=await call('verify',row.restore.outcome!=='Pass');
    if(row.restore.outcome==='Pass'){assert.equal(row.restore.result.format,'raveldex-source');assert.equal(row.restore.result.reindexed,true);assert.equal(row.restore.result.originRevision,builtRevision);assert.equal(row.restore.result.revision,priorRevision+1);assert.ok(row.received.every(r=>r.revision===priorRevision+1));}
    else{assert.ok(['DEADLINE_EXCEEDED','WORK_LIMIT_EXCEEDED','LIMIT_EXCEEDED','RESOURCE_EXHAUSTED'].includes(row.restore.error.code));assert.deepEqual(row.received,row.prior);}
    await call('dispose');row.mainObservation=await call('observation');row.workerObservation=(await worker.send('Runtime.evaluate',{expression:'globalThis.transportObservation()',returnByValue:true})).result.value;
    assert.equal(row.mainObservation.messageListeners,0);assert.equal(row.workerObservation.messageListeners,0);
    row.analysis=analyzeTransportTrace(JSON.parse(raw),[row.mainObservation,row.workerObservation],row.traceComplete);
    row.outcome=row.restore.outcome==='Pass'?'Observed':'ObservedWithRejectedRestore';
  }catch(error){row.outcome='Fail';row.failure={name:error.name,message:error.message,stack:error.stack};}
  finally{
    if(tracing){try{await bounded(session.send('Tracing.end'),'failed-trace-end',5000);}catch{}}
    worker?.close();row.cleanupFailures=[];try{await context?.close();}catch(error){row.cleanupFailures.push(error.message);}try{await browser?.close();row.ownedBrowserClosed=!!browser;}catch(error){row.cleanupFailures.push(error.message);}
    if(row.cleanupFailures.length)row.outcome='Fail';await save();
  }
  console.log(JSON.stringify({size,repetition,outcome:row.outcome,restore:row.restore?.outcome}));
}
try{
  const installed=await realpath(join(consumer,'node_modules/@vmitsaras/raveldex'));assert.equal(installed,join(consumer,'node_modules/@vmitsaras/raveldex'));report.packageMetadataSha256=digest(await readFile(join(installed,'package.json')));report.tarballSha256=digest(await readFile(join(consumer,'vmitsaras-raveldex-0.0.0.tgz')));
  async function walk(path='dist'){for(const e of await readdir(join(installed,path),{withFileTypes:true})){const p=join(path,e.name);if(e.isDirectory())await walk(p);else{assert.ok(e.isFile());const sha256=digest(await readFile(join(installed,p)));assert.equal(sha256,digest(await readFile(p)));report.productionFiles.push({path:p,sha256});}}}await walk();report.productionFiles.sort((a,b)=>a.path.localeCompare(b.path));
  for(const name of ['RX-4002-memory.json','RX-4002-memory-graphs.json','RX-4002-memory-retainers.json','RX-4002-memory-restore.json','RX-4002-memory-browser.json.gz','RX-4002-memory-collection.json','RX-4002-memory-collection-reconciliation.json','RX-4002-memory-mutation.json','RX-4002-memory-codec.json']){const path=`docs/evidence/${name}`;report.preservedEvidence.push({path,sha256:digest(await readFile(path))});}
  const directory=await mkdtemp(join(consumer,'memory-transport-'));report.stagedDirectory=directory;
  for(const [path,name]of [['bench/memory/transport-fixture.mjs','transport-fixture.mjs'],['bench/memory/transport-worker.mjs','transport-worker.mjs'],['bench/memory/transport-observer.mjs','transport-observer.mjs'],['bench/cost-common.mjs','cost-fixture.mjs']]){const staged=join(directory,name);await copyFile(path,staged);report.sourceBindings.push({path,staged,sha256:digest(await readFile(staged))});}
  for(const path of ['bench/memory/transport-run.mjs','bench/memory/transport-trace.mjs','bench/memory/transport-trace.test.mjs','bench/memory/browser-cdp.mjs','scripts/lib/packed-consumer.mjs'])report.sourceBindings.push({path,sha256:digest(await readFile(path))});
  for(const [entry,outfile]of [['transport-fixture.mjs','transport-fixture-bundle.mjs'],['transport-worker.mjs','transport-worker-bundle.mjs']]){const built=await build({absWorkingDir:directory,entryPoints:[entry],outfile,bundle:true,format:'esm',platform:'browser',target:'es2022',minify:false,metafile:true,logLevel:'silent'}),inputs=[];
    for(const [path,input]of Object.entries(built.metafile.inputs)){assert.ok(['transport-fixture.mjs','transport-worker.mjs','transport-observer.mjs','cost-fixture.mjs'].includes(path)||path.includes('node_modules/@vmitsaras/raveldex/dist/'));assert.ok(input.imports.every(i=>!i.external));inputs.push({path,sha256:digest(await readFile(join(directory,path)))});}assert.ok(Object.values(built.metafile.outputs).every(o=>o.imports.length===0));report.bundles[outfile]={sha256:digest(await readFile(join(directory,outfile))),inputs,metafile:built.metafile};}
  server=createServer(async(req,res)=>{res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'");const path=new URL(req.url,'http://localhost').pathname;
    if(req.method!=='GET'){res.writeHead(405);res.end();}else if(path==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="en"><script type="module" src="/transport-fixture.mjs"></script><body>Transport observation</body></html>');}
    else if(['/transport-fixture.mjs','/transport-worker.mjs'].includes(path)){res.setHeader('content-type','text/javascript');res.end(await readFile(join(directory,path.includes('fixture')?'transport-fixture-bundle.mjs':'transport-worker-bundle.mjs')));}else{res.writeHead(404);res.end();}});
  await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});report.origin=`http://127.0.0.1:${server.address().port}`;
  for(const size of report.method.sizes)for(let repetition=0;repetition<report.method.repetitions;repetition++)await observe(report.origin,size,repetition);
  for(const b of [...report.productionFiles,...report.sourceBindings,...report.preservedEvidence]){assert.equal(digest(await readFile(b.path)),b.sha256);if(b.staged)assert.equal(digest(await readFile(b.staged)),b.sha256);}for(const b of report.productionFiles)assert.equal(digest(await readFile(join(installed,b.path))),b.sha256);
  for(const [name,b]of Object.entries(report.bundles))assert.equal(digest(await readFile(join(directory,name))),b.sha256);
  report.preservation='Pass';report.outcome=report.observations.some(r=>r.outcome==='Fail')?'Fail':'ObservedWork_PeakCopiesBlocked';
}catch(error){report.outcome='Fail';report.failure={name:error.name,message:error.message,stack:error.stack};}
finally{if(server?.listening)await new Promise(yes=>server.close(yes));report.finishedAt=new Date().toISOString();await save();await file.close();}
console.log(JSON.stringify({output,outcome:report.outcome,cases:report.observations.length}));if(report.outcome==='Fail')process.exitCode=1;
