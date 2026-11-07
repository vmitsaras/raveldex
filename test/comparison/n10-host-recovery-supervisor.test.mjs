import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,readdir,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {superviseRecoveryAttempt,RECOVERY_SUPERVISOR_REVISION} from '../../bench/n10/host-recovery-supervisor.mjs';

// Short Node fixture processes only. No native engine, browser or collector.
const moduleURL=new URL('../../bench/n10/host-recovery-supervisor.mjs',import.meta.url);
const modulePath=fileURLToPath(moduleURL),sha=value=>createHash('sha256').update(value).digest('hex');
const imports=`import {childControllerHandshake,finishController,beginRecoveryContext,endRecoveryContext,createSupervisedBrowserLauncher} from ${JSON.stringify(moduleURL.href)};import {writeFile,mkdir,readFile} from 'node:fs/promises';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';import {createConnection} from 'node:net';import {join} from 'node:path';const context=await childControllerHandshake();`;
const terminal=`await writeFile(join(context.output,'inner','report.json'),JSON.stringify({outcome:'Collected',guards:'Pass',elapsedMs:0,supervisorBinding:{attemptId:context.attemptId,bindingSha256:context.bindingSha256}}));finishController();`;
async function fixture(body,options={}){
  const directory=await realpath(await mkdtemp(join(tmpdir(),'rx9006-supervisor-test-'))),entry=join(directory,'controller.mjs'),auth=join(directory,'authorization.json');
  await writeFile(entry,imports+body);await writeFile(auth,'{"scope":"fixture-only"}\n');
  const paths=[entry,modulePath,auth,await realpath(process.execPath)],pins=await Promise.all(paths.map(async path=>({path,sha256:sha(await readFile(path))})));
  return {directory,entry,output:join(directory,'attempt'),pins,authorizationSha256:sha(await readFile(auth)),budgetMs:3500,shutdownReserveMs:1000,terminationGraceMs:150,
    identity:{kind:'fake-only',revision:RECOVERY_SUPERVISOR_REVISION},validateInner:inner=>assert.equal(inner.guards,'Pass'),...options};
}
async function run(body,options={},check){const setup=await fixture(body,options);try{const report=await superviseRecoveryAttempt(setup);if(check)await check(report,setup);return report;}finally{await rm(setup.directory,{recursive:true,force:true});}}
const supported=['darwin','linux'].includes(process.platform);
const scoped=(name,call)=>test(name,{skip:!supported,timeout:15000},call);
const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
function liveWork(pid){try{return !execFileSync('/bin/ps',['-p',String(pid),'-o','stat='],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:1000}).trim().startsWith('Z');}catch(error){if(error.status===1)return false;throw error;}}

scoped('supervisor persists distinct bound terminal after successful child and cleanup',async()=>{
  await run(terminal,{},async(report,setup)=>{
    assert.equal(report.outcome,'Pass',JSON.stringify(report));assert.equal(report.cleanup,'Pass',JSON.stringify(report));assert.equal(report.nativeOutcome,null);
    assert.deepEqual(report.revision,RECOVERY_SUPERVISOR_REVISION);assert.equal(report.ownedGroups.length,1);
    assert.equal(report.childExit.code,0);assert.equal(alive(report.controller.pid),false);
    const persisted=JSON.parse(await readFile(join(setup.output,'supervisor.json'))),inner=JSON.parse(await readFile(join(setup.output,'inner','report.json')));
    assert.equal(persisted.outcome,'Pass');assert.equal(inner.outcome,'Collected');assert.equal(inner.supervisorBinding.attemptId,report.attemptId);
    assert.equal(report.innerReport.sha256,sha(await readFile(join(setup.output,'inner','report.json'))));
  });
});
scoped('missing inner semantic acceptance fails without overwriting inner report',async()=>{
  await run(`await writeFile(join(context.output,'inner','report.json'),'original-failure');finishController();`,{},async(report,setup)=>{
    assert.equal(report.outcome,'Fail');assert.equal(await readFile(join(setup.output,'inner','report.json'),'utf8'),'original-failure');assert.equal(report.cleanup,'Pass',JSON.stringify(report));
  });
});
scoped('wrong attempt inner binding fails even when its native row claims success',async()=>{
  const report=await run(terminal.replace('attemptId:context.attemptId','attemptId:"forged"'));assert.equal(report.outcome,'Fail');assert.match(report.failure.message,/inner binding/);
});
scoped('changed source pin rejects before controller spawn',async()=>{
  const setup=await fixture(terminal);try{await writeFile(setup.entry,'throw Error("must never execute");');const report=await superviseRecoveryAttempt(setup);assert.equal(report.outcome,'Fail');assert.equal(report.controller,undefined);assert.match(report.failure.message,/input changed/);}finally{await rm(setup.directory,{recursive:true,force:true});}
});
scoped('existing output is untouched on freshness rejection',async()=>{
  const setup=await fixture(terminal);try{await mkdir(setup.output);await writeFile(join(setup.output,'human'),'keep');const report=await superviseRecoveryAttempt(setup);assert.equal(report.outcome,'Fail');assert.deepEqual(await readdir(setup.output),['human']);}finally{await rm(setup.directory,{recursive:true,force:true});}
});
scoped('hung controller ignoring SIGTERM is killed and total interruption stays orchestration',async()=>{
  const report=await run(`process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`,{budgetMs:1600,shutdownReserveMs:600,terminationGraceMs:120});
  assert.equal(report.outcome,'Fail');assert.equal(report.nativeOutcome,null);assert.equal(report.cleanup,'Pass',JSON.stringify(report));assert.match(report.failure.message,/cutoff/);assert.ok(report.events.some(event=>event.signal==='SIGKILL'));assert.equal(alive(report.controller.pid),false);assert.ok(report.elapsedMs<1600);
});
scoped('controller crash retains first exit failure and kills an inherited descendant',async()=>{
  await run(`const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});await writeFile(join(context.output,'descendant.pid'),String(child.pid));setTimeout(()=>process.exit(7),100);`,{},async(report,setup)=>{
    assert.equal(report.outcome,'Fail');assert.match(report.failure.message,/exit successfully/);assert.equal(report.nativeOutcome,null);
    const pid=Number(await readFile(join(setup.output,'descendant.pid'),'utf8'));
    // The supervisor ignores non-executing orphan zombie PID records; a live
    // child must not survive. Successful cleanup is independently recorded.
    assert.equal(report.cleanup,'Pass',JSON.stringify(report));assert.ok(Number.isSafeInteger(pid));assert.equal(liveWork(pid),false,'inherited descendant cannot still execute');
  });
});
scoped('external context timer stops hung controller before total bound',async()=>{
  const report=await run(`await beginRecoveryContext({key:'fixture-context'});process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`,{contextPolicy:{workCutoffMs:2300,perContextWatchdogMs:180}});
  assert.equal(report.outcome,'Fail');assert.match(report.failure.message,/context watchdog/);assert.equal(report.nativeOutcome,null);assert.equal(report.events.filter(event=>event.type==='context-end').length,0);assert.equal(report.cleanup,'Pass',JSON.stringify(report));
});
scoped('complete context returns same authoritative monotonic ledger values',async()=>{
  await run(`const admitted=await beginRecoveryContext({key:'one'});const ended=await endRecoveryContext({key:'one'});await writeFile(join(context.output,'ledger.json'),JSON.stringify({admitted,ended}));`+terminal,{contextPolicy:{workCutoffMs:2300,perContextWatchdogMs:1000}},async(report,setup)=>{
    assert.equal(report.outcome,'Pass');const {admitted,ended}=JSON.parse(await readFile(join(setup.output,'ledger.json'))),start=report.events.find(event=>event.type==='context-begin'),end=report.events.find(event=>event.type==='context-end');
    assert.equal(admitted.dispatchElapsedMs,start.dispatchElapsedMs);assert.equal(ended.dispatchElapsedMs,start.dispatchElapsedMs);assert.equal(ended.contextElapsedMs,end.contextElapsedMs);assert.equal(ended.endElapsedMs,end.endElapsedMs);assert.ok(start.dispatchElapsedMs+1000<=2300);assert.equal(ended.contextElapsedMs,ended.endElapsedMs-ended.dispatchElapsedMs);
  });
});
scoped('serial context and wrong end identity fail closed',async()=>{
  for(const call of [`await beginRecoveryContext({key:'two'});`,`await endRecoveryContext({key:'wrong'});`]){
    const report=await run(`await beginRecoveryContext({key:'one'});try{${call}}catch{}finishController();`,{contextPolicy:{workCutoffMs:2300,perContextWatchdogMs:1000}});assert.equal(report.outcome,'Fail');assert.equal(report.nativeOutcome,null);
  }
});
scoped('whole watchdog admission cannot consume reserved closing interval',async()=>{
  const report=await run(`try{await beginRecoveryContext({key:'too-late'});}catch{}finishController();`,{contextPolicy:{workCutoffMs:1,perContextWatchdogMs:1000}});
  assert.equal(report.outcome,'Fail');assert.match(report.failure.message,/full context allowance/);assert.equal(report.events.some(event=>event.type==='context-begin'),false);
});
scoped('hung semantic validator is bounded and cannot produce Pass',async()=>{
  const report=await run(terminal,{budgetMs:1800,shutdownReserveMs:600,terminationGraceMs:100,validateInner:()=>new Promise(()=>{})});assert.equal(report.outcome,'Fail');assert.match(report.failure.message,/validation deadline/);assert.equal(report.cleanup,'Pass',JSON.stringify(report));
});
scoped('caller abort terminates only its own controller group',async()=>{
  const control=new AbortController(),setup=await fixture(`setInterval(()=>{},1000);`,{signal:control.signal});const other=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
  try{setTimeout(()=>control.abort(),250);const report=await superviseRecoveryAttempt(setup);assert.equal(report.outcome,'Fail');assert.match(report.failure.message,/caller aborted/);assert.equal(report.cleanup,'Pass',JSON.stringify(report));assert.equal(alive(other.pid),true);}finally{other.kill('SIGKILL');await new Promise(resolve=>other.once('exit',resolve));await rm(setup.directory,{recursive:true,force:true});}
});
scoped('already aborted signal refuses controller spawn',async()=>{
  const signal=AbortSignal.abort();const report=await run(terminal,{signal});assert.equal(report.outcome,'Fail');assert.equal(report.controller,undefined);
});
scoped('terminal report write collision is a truthful report failure',async()=>{
  const setup=await fixture(`await mkdir(join(context.output,'supervisor.json'));`+terminal);try{await assert.rejects(superviseRecoveryAttempt(setup),error=>{assert.equal(error.supervisorReport.outcome,'Fail');assert.match(error.message,/could not be persisted/);assert.ok(error.supervisorReport.reportWriteFailure);return true;});}finally{await rm(setup.directory,{recursive:true,force:true});}
});
scoped('wrapper handshakes before fake executable spawn and forwards fd3/fd4 exactly',async()=>{
  const body=`const executable=process.execPath,hash=createHash('sha256').update(await readFile(executable)).digest('hex'),wrapper=await createSupervisedBrowserLauncher({executablePath:executable,executableSha256:hash});const child=spawn(wrapper,['-e',"require('node:fs').writeSync(3,'three');require('node:fs').writeSync(4,'four');console.log('fake-browser-only')"],{detached:true,stdio:['ignore','pipe','pipe','pipe','pipe']});let a='',b='';child.stdio[3].on('data',value=>a+=value);child.stdio[4].on('data',value=>b+=value);const code=await new Promise(resolve=>child.once('close',resolve));await writeFile(join(context.output,'forwarded.json'),JSON.stringify({a,b,code}));`+terminal;
  await run(body,{},async(report,setup)=>{assert.equal(report.outcome,'Pass');assert.equal(report.ownedGroups.length,2);assert.equal(report.launchers.length,1);assert.equal(report.events.filter(event=>event.type==='owned-registration').length,1);assert.deepEqual(JSON.parse(await readFile(join(setup.output,'forwarded.json'))),{a:'three',b:'four',code:0});});
});
scoped('acknowledged wrapper and fake executable are reclaimed if controller crashes',async()=>{
  const body=`const hash=createHash('sha256').update(await readFile(process.execPath)).digest('hex'),wrapper=await createSupervisedBrowserLauncher({executablePath:process.execPath,executableSha256:hash});const child=spawn(wrapper,['-e',"require('node:fs').writeFileSync(process.argv[1],String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)",join(context.output,'fake.pid')],{detached:true,stdio:['ignore','ignore','ignore','pipe','pipe']});for(let i=0;i<100;i++){try{await readFile(join(context.output,'fake.pid'));break;}catch{}await new Promise(resolve=>setTimeout(resolve,10));}process.exit(9);`;
  await run(body,{},async(report,setup)=>{assert.equal(report.outcome,'Fail');assert.equal(report.cleanup,'Pass',JSON.stringify(report));assert.equal(report.ownedGroups.length,2);assert.ok(report.events.some(event=>event.signal==='SIGKILL'));assert.equal(liveWork(Number(await readFile(join(setup.output,'fake.pid'),'utf8'))),false,'fake executable cannot still execute');for(const group of report.ownedGroups)assert.equal(liveWork(group.pid),false,'registered group leader cannot still execute');});
});
scoped('failed wrapper acknowledgement cannot spawn the fake executable',async()=>{
  const body=`const hash=createHash('sha256').update(await readFile(process.execPath)).digest('hex'),wrapper=await createSupervisedBrowserLauncher({executablePath:process.execPath,executableSha256:hash});const child=spawn(wrapper,['-e',"require('node:fs').writeFileSync(process.argv[1],'must-not-exist')",join(context.output,'forbidden')],{detached:false,stdio:['ignore','ignore','ignore','pipe','pipe']});await new Promise(resolve=>child.once('exit',resolve));finishController();`;
  await run(body,{},async(report,setup)=>{assert.equal(report.outcome,'Fail');assert.equal(report.ownedGroups.length,1);assert.equal((await readdir(setup.output)).includes('forbidden'),false);assert.match(report.failure.message,/group leader/);});
});
scoped('uninitialized direct module callers cannot mint wrapper or context authority',async()=>{
  const {createSupervisedBrowserLauncher,beginRecoveryContext}=await import(moduleURL.href);
  await assert.rejects(createSupervisedBrowserLauncher({executablePath:process.execPath,executableSha256:'a'.repeat(64)}),/handshake/);assert.throws(()=>beginRecoveryContext({key:'wrong'}),/live controller/);
});
scoped('abrupt controller death before wrapper acknowledgement never starts executable or claims cleanup proof',async()=>{
  const body=`const hash=createHash('sha256').update(await readFile(process.execPath)).digest('hex'),wrapper=await createSupervisedBrowserLauncher({executablePath:process.execPath,executableSha256:hash});const payload="require('node:fs').writeFileSync(process.argv[1],'forbidden')",script='process.argv='+JSON.stringify([process.execPath,wrapper,'-e',payload,join(context.output,'forbidden')])+';setTimeout(()=>import('+JSON.stringify('file://'+wrapper)+'),200);';const child=spawn(process.execPath,['-e',script],{detached:true,stdio:'ignore'});await writeFile(join(context.output,'preack.pid'),String(child.pid));process.exit(8);`;
  await run(body,{},async(report,setup)=>{
    assert.equal(report.outcome,'Fail');assert.equal(report.cleanup,'Unconfirmed',JSON.stringify(report));assert.equal(report.ownedGroups.length,1);assert.equal(report.events.some(event=>event.type==='owned-registration'),false);
    const pid=Number(await readFile(join(setup.output,'preack.pid'),'utf8'));for(let i=0;i<150&&liveWork(pid);i++)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(liveWork(pid),false,'unacknowledged wrapper exits without a native executable');assert.equal((await readdir(setup.output)).includes('forbidden'),false);
  });
});
scoped('forged owned-process registration never signals an unrelated process',async()=>{
  const other=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
  const body=`const hash=createHash('sha256').update(await readFile(process.execPath)).digest('hex'),wrapper=await createSupervisedBrowserLauncher({executablePath:process.execPath,executableSha256:hash});const socket=createConnection(process.env.RAVELDEX_RX9006_SUPERVISOR_ENDPOINT);socket.on('connect',()=>socket.write(JSON.stringify({kind:'rx9006-owned-browser',token:process.env.RAVELDEX_RX9006_SUPERVISOR_TOKEN,attemptId:context.attemptId,pid:Number(process.env.FIXTURE_FOREIGN_PID),launcher:wrapper})+'\\n'));socket.on('error',()=>{});setInterval(()=>{},1000);`;
  try{const report=await run(body,{env:{FIXTURE_FOREIGN_PID:String(other.pid)}});assert.equal(report.outcome,'Fail');assert.equal(report.ownedGroups.length,1);assert.equal(liveWork(other.pid),true);assert.match(report.failure.message,/owned direct-child group leader/);}finally{other.kill('SIGKILL');await new Promise(resolve=>other.once('exit',resolve));}
});
scoped('non-regular input pin is rejected before any blocking read or controller spawn',async()=>{
  const setup=await fixture(terminal,{budgetMs:1600,shutdownReserveMs:600,terminationGraceMs:100}),fifo=join(setup.directory,'blocked-pin');execFileSync('/usr/bin/mkfifo',[fifo]);setup.pins.push({path:fifo,sha256:sha('released')});
  try{const report=await superviseRecoveryAttempt(setup);assert.equal(report.outcome,'Fail');assert.equal(report.controller,undefined);assert.match(report.failure.message,/regular file/);assert.ok(report.elapsedMs<1600);}finally{await rm(setup.directory,{recursive:true,force:true});}
});
scoped('unused declared launcher cannot pass even with a valid inner terminal',async()=>{
  let validated=false;
  const body=`const hash=createHash('sha256').update(await readFile(process.execPath)).digest('hex');await createSupervisedBrowserLauncher({executablePath:process.execPath,executableSha256:hash});`+terminal;
  await run(body,{validateInner:()=>{validated=true;}},async(report,setup)=>{
    assert.equal(report.outcome,'Fail');assert.equal(report.cleanup,'Unconfirmed');assert.equal(report.launchers.length,1);assert.equal(report.ownedGroups.length,1);assert.equal(validated,false);
    assert.match(report.failure.message,/launcher never registered/);assert.equal(JSON.parse(await readFile(join(setup.output,'inner','report.json'))).outcome,'Collected');assert.equal(JSON.parse(await readFile(join(setup.output,'supervisor.json'))).outcome,'Fail');
  });
});
