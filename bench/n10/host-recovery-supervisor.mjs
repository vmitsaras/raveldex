// Named recovery attempts only: an external process owns orchestration deadlines.
// This is process-group containment for the controlled POSIX harness, not a
// sandbox for hostile executables or a real-time operating-system guarantee.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {createServer, createConnection} from 'node:net';
import {mkdir, readFile, writeFile, chmod, realpath, stat, unlink} from 'node:fs/promises';
import {join, resolve, dirname, basename, relative} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const RECOVERY_SUPERVISOR_REVISION = Object.freeze({
  id:'rx9006-owned-posix-supervision-2026-11-06-slice3', date:'2026-11-06',
});
const modulePath=fileURLToPath(import.meta.url), sha=value=>createHash('sha256').update(value).digest('hex');
const ensure=(value,message)=>assert.ok(value,'Recovery supervisor: '+message);
const failure=error=>({name:error?.name??'Error',message:String(error?.message??error)});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const finite=value=>Number.isFinite(value)&&value>=0;
const json=value=>JSON.stringify(value,null,2)+'\n';
const HASH=/^[a-f0-9]{64}$/;

// ps has a finite subprocess timeout. Start time and session/group identity are
// recorded before any signal; no unrelated process is discovered via a name.
function processIdentity(pid){
  ensure(Number.isSafeInteger(pid)&&pid>1,'owned pid');
  try{
    const line=execFileSync('/bin/ps',['-p',String(pid),'-o','pid=,ppid=,pgid=,lstart='],{encoding:'utf8',timeout:1000,stdio:['ignore','pipe','ignore']}).trim();
    if(!line)return null;
    const match=/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    ensure(match,'process identity format');
    return {pid:Number(match[1]),ppid:Number(match[2]),pgid:Number(match[3]),started:match[4]};
  }catch(error){if(error.status===1)return null;throw error;}
}
function groupExists(pid){
  try{process.kill(-pid,0);}catch(error){if(error.code==='ESRCH')return false;if(error.code!=='EPERM')throw error;}
  // Orphan zombies cannot execute and may await the OS reaper. Do not confuse
  // their retained PID records with live owned work after SIGKILL.
  const rows=execFileSync('/bin/ps',['-ax','-o','pgid=,stat='],{encoding:'utf8',timeout:1000,stdio:['ignore','pipe','ignore']}).trim().split('\n');
  const live=rows.some(line=>{const match=/^\s*(\d+)\s+(\S+)/.exec(line);return match&&Number(match[1])===pid&&!match[2].startsWith('Z');});
  // macOS can report EPERM for signal 0 while a killed orphan group is being
  // reaped. Actual signal errors remain failures; ps establishes live work.
  return live;
}
function exactKeys(value,keys){ensure(value&&typeof value==='object'&&!Array.isArray(value),'object');assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),'Recovery supervisor: message keys');}
function safeIdentity(value){const serialized=JSON.stringify(value);ensure(typeof serialized==='string'&&serialized.length<=1024*1024,'bounded identity');return JSON.parse(serialized);}
async function verifyPins(pins,check=()=>{}){
  ensure(Array.isArray(pins)&&pins.length>0&&pins.length<=10000,'input pins');
  const paths=new Set(),result=[];
  for(const pin of pins){check();exactKeys(pin,['path','sha256']);ensure(typeof pin.path==='string'&&HASH.test(pin.sha256),'input pin');const path=await realpath(pin.path);check();ensure((await stat(path)).isFile(),'input pin must be a regular file');check();ensure(!paths.has(path),'duplicate input pin');paths.add(path);const actual=sha(await readFile(path));check();ensure(actual===pin.sha256,'input changed: '+path);result.push({path,sha256:actual});}
  return result;
}

/** A fixed-policy caller supplies these bounds; this generic helper also serves
 * short fake-child tests. It never supplies execution authorization itself. */
export async function superviseRecoveryAttempt({entry,args=[],output,budgetMs,identity,pins,
  authorizationSha256,contextPolicy,env={},signal,validateInner,
  shutdownReserveMs=5000,terminationGraceMs=1000}={}){
  ensure(['darwin','linux'].includes(process.platform),'unsupported POSIX platform');
  ensure(finite(budgetMs)&&budgetMs>0&&finite(shutdownReserveMs)&&shutdownReserveMs>0&&shutdownReserveMs<budgetMs,'total/finalization bound');
  ensure(finite(terminationGraceMs)&&terminationGraceMs>0&&terminationGraceMs<shutdownReserveMs,'termination reserve');
  ensure(typeof entry==='string'&&Array.isArray(args)&&args.every(arg=>typeof arg==='string'),'entry/args');
  ensure(typeof output==='string'&&HASH.test(authorizationSha256),'output/authorization binding');
  ensure(typeof validateInner==='function','independent inner validator required');
  if(contextPolicy){exactKeys(contextPolicy,['workCutoffMs','perContextWatchdogMs']);ensure(finite(contextPolicy.workCutoffMs)&&finite(contextPolicy.perContextWatchdogMs)&&contextPolicy.perContextWatchdogMs>0&&contextPolicy.workCutoffMs+shutdownReserveMs<=budgetMs,'context policy');}
  const started=performance.now(),elapsed=()=>performance.now()-started,attemptId=randomUUID(),binding=safeIdentity(identity),bindingSha256=sha(JSON.stringify(binding));
  let absoluteOutput=resolve(output),innerPath=join(absoluteOutput,'inner','report.json');
  let child,exited,childExit,closed=false,outputCreated=false,context,contextTimer,totalTimer,externalFailure,cleanupFailure,lastRequestId=0;
  let stdout='',stderr='',stdoutDropped=0,stderrDropped=0,childReady=false;
  const groups=new Map(),launchers=new Map(),sockets=new Set(),events=[];
  const event=value=>{ensure(events.length<1000,'bounded supervisor event ledger');events.push(value);};
  const endpoint=join(tmpdir(),'rx6-'+randomUUID()+'.sock'),token=randomUUID()+randomUUID();
  const report={kind:'rx9006-supervisor-terminal-v1',revision:RECOVERY_SUPERVISOR_REVISION,attemptId,bindingSha256,identity:binding,
    authorizationSha256,budgetMs,shutdownReserveMs,terminationGraceMs,contextPolicy:contextPolicy??null,
    startedAt:new Date().toISOString(),outcome:'Running',nativeOutcome:null,events,
    scope:'External POSIX owned-group orchestration only. A supervisor interruption is incomplete evidence, never a native refusal/cancellation/rollback. OS scheduling, filesystem and signal delivery are not hard real-time guarantees.'};
  const interrupt=error=>{externalFailure??=failure(error);closed=true;};
  const requestStop=error=>{interrupt(error);if(child)try{signalGroups('SIGTERM');}catch(cleanupError){cleanupFailure??=failure(cleanupError);}};
  const checkTime=()=>{ensure(!closed,'supervisor stopped');ensure(elapsed()<budgetMs-shutdownReserveMs,'supervisor work cutoff');};
  async function bounded(promise,cutoff,label){
    let timer;
    try{return await Promise.race([promise,new Promise((_,no)=>{timer=setTimeout(()=>{const error=Error('Bounded supervisor '+label);requestStop(error);no(error);},Math.max(0,cutoff-elapsed()));})]);}
    finally{clearTimeout(timer);}
  }
  function signalGroups(sig){
    for(const owner of groups.values()){
      const current=processIdentity(owner.pid);
      if(current)ensure(current.started===owner.started&&current.pgid===owner.pid,'owned pid/group identity changed');
      try{process.kill(-owner.pid,sig);event({type:'signal',pid:owner.pid,signal:sig,elapsedMs:elapsed()});}catch(error){if(error.code!=='ESRCH'&&!(error.code==='EPERM'&&!groupExists(owner.pid)))throw error;}
    }
  }
  async function acknowledge(socket,message){socket.end(JSON.stringify(message)+'\n');}
  const server=createServer(socket=>{
    if(sockets.size>=4||closed){socket.destroy();requestStop(Error('Owned registration connection bound/closed'));return;}
    sockets.add(socket);socket.once('close',()=>sockets.delete(socket));let bytes='';
    socket.setTimeout(2000,()=>socket.destroy());socket.on('error',()=>{});
    socket.on('data',chunk=>{
      bytes+=chunk.toString('utf8');if(bytes.length>8192){socket.destroy();requestStop(Error('Oversized owned-process registration'));return;}
      if(!bytes.includes('\n'))return;socket.pause();
      void(async()=>{
        try{
          const message=JSON.parse(bytes.trim());exactKeys(message,['kind','token','attemptId','pid','launcher']);
          ensure(!closed&&childReady&&childExit===undefined,'registration after stop/controller exit');checkTime();
          ensure(message.kind==='rx9006-owned-browser'&&message.token===token&&message.attemptId===attemptId,'owned registration binding');
          const owner=processIdentity(message.pid);ensure(owner&&owner.ppid===child.pid&&owner.pgid===owner.pid,'owned direct-child group leader');
          ensure(groups.size<2&&!groups.has(owner.pid),'owned group bound/duplicate registration');
          // Claim a proven direct-child group before awaiting its file check;
          // the wrapper still cannot start the browser until acknowledgement.
          groups.set(owner.pid,{...owner,role:'browser-wrapper',launcher:message.launcher});event({type:'owned-registration',pid:owner.pid,role:'browser-wrapper',launcher:message.launcher,elapsedMs:elapsed()});
          const launcher=launchers.get(message.launcher);ensure(launcher&&sha(await bounded(readFile(launcher.path),budgetMs-shutdownReserveMs,'registration pin'))===launcher.sha256,'pinned launcher');
          ensure(!closed&&childExit===undefined,'controller ended during registration');checkTime();
          await acknowledge(socket,{ok:true,attemptId,bindingSha256});
        }catch(error){await acknowledge(socket,{ok:false,error:failure(error)}).catch(()=>{});requestStop(error);}
      })().catch(error=>requestStop(error));
    });
  });
  const onAbort=()=>requestStop(Error('Supervisor caller aborted attempt'));
  signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();
  totalTimer=setTimeout(()=>requestStop(Error('Absolute external total work cutoff; native outcome unobserved')),Math.max(1,budgetMs-shutdownReserveMs-elapsed()));
  try{
    checkTime();absoluteOutput=join(await bounded(realpath(dirname(absoluteOutput)),budgetMs-shutdownReserveMs,'output parent identity'),basename(absoluteOutput));innerPath=join(absoluteOutput,'inner','report.json');report.output=absoluteOutput;
    await bounded(mkdir(absoluteOutput),budgetMs-shutdownReserveMs,'output creation');outputCreated=true;await bounded(mkdir(join(absoluteOutput,'inner')),budgetMs-shutdownReserveMs,'inner output creation');
    report.pins=await bounded(verifyPins(pins,checkTime),budgetMs-shutdownReserveMs,'input validation');
    const executable=await bounded(realpath(process.execPath),budgetMs-shutdownReserveMs,'Node identity'),resolvedEntry=await bounded(realpath(entry),budgetMs-shutdownReserveMs,'entry identity');
    ensure(report.pins.some(pin=>pin.path===resolvedEntry),'controller entry must be pinned');
    report.nodeExecutable={path:executable,sha256:sha(await bounded(readFile(executable),budgetMs-shutdownReserveMs,'Node hash'))};
    const ownModuleSha256=sha(await bounded(readFile(modulePath),budgetMs-shutdownReserveMs,'supervisor hash'));
    ensure(report.pins.some(pin=>pin.path===modulePath&&pin.sha256===ownModuleSha256),'supervisor module must be pinned');
    ensure(report.pins.some(pin=>pin.sha256===authorizationSha256),'authorization file must be pinned');
    checkTime();ensure(!signal?.aborted,'already aborted');
    await bounded(new Promise((yes,no)=>{server.once('error',no);server.listen(endpoint,yes);}),budgetMs-shutdownReserveMs,'ownership listener');await bounded(chmod(endpoint,0o600),budgetMs-shutdownReserveMs,'ownership permissions');
    await bounded(writeFile(join(absoluteOutput,'supervisor-start.json'),json({...report,outcome:'Starting'}),{flag:'wx'}),budgetMs-shutdownReserveMs,'start report');
    checkTime();
    child=spawn(executable,[resolvedEntry,...args],{cwd:dirname(resolvedEntry),env:{...process.env,...env},detached:true,stdio:['ignore','pipe','pipe','ipc']});
    childExit=undefined;
    exited=new Promise(resolveExit=>{child.once('error',error=>{requestStop(error);childExit={code:null,signal:null,error:failure(error)};resolveExit(childExit);});child.once('exit',(code,signal)=>{childExit={code,signal};resolveExit(childExit);});});
    const controller=processIdentity(child.pid);ensure(controller&&controller.pgid===child.pid&&controller.ppid===process.pid,'spawned controller group');groups.set(child.pid,{...controller,role:'controller'});
    report.controller={pid:child.pid,entry:resolvedEntry,args};
    const append=(which,chunk)=>{const value=chunk.toString('utf8'),limit=262144;if(which==='stdout'){stdoutDropped+=Math.max(0,stdout.length+value.length-limit);stdout=(stdout+value).slice(0,limit);}else{stderrDropped+=Math.max(0,stderr.length+value.length-limit);stderr=(stderr+value).slice(0,limit);}};
    child.stdout.on('data',chunk=>append('stdout',chunk));child.stderr.on('data',chunk=>append('stderr',chunk));
    child.on('message',message=>{void(async()=>{
      try{
        ensure(message&&typeof message==='object','controller message');checkTime();ensure(!closed,'controller message after stop');
        if(message.kind==='rx9006-controller-ready'){
          exactKeys(message,['kind']);ensure(!childReady,'duplicate controller handshake');childReady=true;
          child.send({kind:'rx9006-supervisor-init',attemptId,bindingSha256,output:absoluteOutput,endpoint,token,controllerPid:child.pid,elapsedMs:elapsed(),deadlineEpochMs:Date.now()+Math.max(0,budgetMs-elapsed())});return;
        }
        ensure(childReady,'controller not initialized');ensure(Number.isSafeInteger(message.requestId)&&message.requestId>lastRequestId&&message.requestId<=1024,'request id/order/bound');lastRequestId=message.requestId;
        let result;
        if(message.kind==='rx9006-launcher-created'){
          exactKeys(message,['kind','requestId','path','sha256','executablePath','executableSha256','moduleSha256']);
          const path=await bounded(realpath(message.path),budgetMs-shutdownReserveMs,'launcher path');ensure(relative(absoluteOutput,path)&&!relative(absoluteOutput,path).startsWith('..'),'launcher outside attempt');
          ensure(HASH.test(message.sha256)&&sha(await bounded(readFile(path),budgetMs-shutdownReserveMs,'launcher hash'))===message.sha256,'launcher bytes');
          ensure(message.moduleSha256===sha(await bounded(readFile(modulePath),budgetMs-shutdownReserveMs,'launcher module hash')),'launcher module identity');
          ensure(sha(await bounded(readFile(message.executablePath),budgetMs-shutdownReserveMs,'browser hash'))===message.executableSha256,'browser executable identity');
          ensure(report.pins.some(pin=>pin.path===message.executablePath&&pin.sha256===message.executableSha256),'browser executable not pinned');
          ensure(launchers.size<1&&!launchers.has(path),'launcher bound/duplicate');launchers.set(path,{path,sha256:message.sha256,executablePath:message.executablePath,executableSha256:message.executableSha256,moduleSha256:message.moduleSha256});result={path};
        }else if(message.kind==='rx9006-context-begin'){
          exactKeys(message,['kind','requestId','key']);ensure(contextPolicy&&!context,'context admission policy/seriality');ensure(typeof message.key==='string'&&message.key.length>0&&message.key.length<=300,'context key');
          ensure(elapsed()+contextPolicy.perContextWatchdogMs<=contextPolicy.workCutoffMs,'full context allowance unavailable before work cutoff');
          const contextStarted=performance.now(),dispatchElapsedMs=contextStarted-started;
          context={key:message.key,started:contextStarted,dispatchElapsedMs};event({type:'context-begin',key:context.key,dispatchElapsedMs,elapsedMs:dispatchElapsedMs});
          contextTimer=setTimeout(()=>requestStop(Error('Absolute external context watchdog; native outcome unobserved')),contextPolicy.perContextWatchdogMs);
          result={key:context.key,dispatchElapsedMs,remainingMs:contextPolicy.workCutoffMs-dispatchElapsedMs,contextWatchdogMs:contextPolicy.perContextWatchdogMs};
        }else if(message.kind==='rx9006-context-end'){
          exactKeys(message,['kind','requestId','key']);ensure(context&&context.key===message.key,'context end identity');const ended=performance.now(),contextElapsedMs=ended-context.started,endElapsedMs=ended-started;
          ensure(contextElapsedMs<=contextPolicy.perContextWatchdogMs,'external context exceeded watchdog');clearTimeout(contextTimer);result={key:context.key,dispatchElapsedMs:context.dispatchElapsedMs,contextElapsedMs,endElapsedMs};event({type:'context-end',...result,elapsedMs:endElapsedMs});context=undefined;
        }else throw Error('Unexpected controller supervision message');
        ensure(!closed&&childExit===undefined,'controller ended during acknowledgement');child.send({kind:'rx9006-supervisor-ack',requestId:message.requestId,result});
      }catch(error){if(child?.connected&&message?.requestId)child.send({kind:'rx9006-supervisor-ack',requestId:message.requestId,error:failure(error)});requestStop(error);}
    })().catch(error=>requestStop(error));});
    // No controller close/finally is trusted to settle. The supervisor continues
    // on its own clock even if IPC/stdout/teardown is held open by descendants.
    while(childExit===undefined&&!externalFailure){await sleep(Math.min(20,Math.max(1,budgetMs-shutdownReserveMs-elapsed())));if(elapsed()>=budgetMs-shutdownReserveMs)requestStop(Error('External total work cutoff'));}
    if(!externalFailure){try{ensure(childReady,'controller exited before handshake');ensure(childExit.code===0&&!childExit.signal,'controller did not exit successfully');ensure(!context,'controller exited with incomplete context');}catch(error){interrupt(error);}}
    closed=true;clearTimeout(totalTimer);clearTimeout(contextTimer);
    // Include all registered process groups even when their group leaders exited.
    signalGroups('SIGTERM');const termStarted=performance.now();
    while([...groups.keys()].some(groupExists)&&performance.now()-termStarted<terminationGraceMs&&elapsed()<budgetMs-shutdownReserveMs/2)await sleep(10);
    if([...groups.keys()].some(groupExists))signalGroups('SIGKILL');
    const reapCutoff=Math.max(0,budgetMs-Math.min(1000,shutdownReserveMs/4));
    while([...groups.keys()].some(groupExists)&&elapsed()<reapCutoff)await sleep(10);
    ensure(![...groups.keys()].some(groupExists),'owned process groups remain after bounded cleanup');
    await bounded(exited,reapCutoff,'controller exit');
    report.cleanup=launchers.size&&groups.size!==2?'Unconfirmed':'Pass';
    if(report.cleanup!=='Pass')externalFailure??=failure(Error('Created browser launcher never registered: startup process ownership unobserved'));
    if(!externalFailure){
      const bytes=await bounded(readFile(innerPath),budgetMs-Math.min(1000,shutdownReserveMs/4),'inner terminal read');const inner=JSON.parse(bytes);report.innerReport={path:innerPath,sha256:sha(bytes)};
      assert.deepEqual(inner.supervisorBinding,{attemptId,bindingSha256},'Recovery supervisor: inner binding');
      ensure(inner.outcome==='Collected'&&inner.guards==='Pass'&&finite(inner.elapsedMs)&&inner.elapsedMs<=budgetMs,'inner terminal/guards/budget');
      // Even a hung asynchronous validator is raced against the external cap.
      const remaining=Math.max(0,budgetMs-Math.min(1000,shutdownReserveMs/4)-elapsed());let timer;
      try{await Promise.race([Promise.resolve().then(()=>validateInner(inner)),new Promise((_,no)=>{timer=setTimeout(()=>no(Error('Bounded inner validation deadline')),remaining);})]);}finally{clearTimeout(timer);}
      ensure(elapsed()<budgetMs,'complete supervisor total bound');report.outcome='Pass';
    }
  }catch(error){if(externalFailure)cleanupFailure??=failure(error);else externalFailure=failure(error);}
  finally{
    closed=true;clearTimeout(totalTimer);clearTimeout(contextTimer);signal?.removeEventListener('abort',onAbort);
    if(child){try{signalGroups('SIGKILL');if(report.cleanup!=='Pass'){child.kill('SIGKILL');if(exited)await bounded(exited,budgetMs-Math.min(500,shutdownReserveMs/8),'last owned controller exit');}}catch(error){cleanupFailure=failure(error);}}
    for(const socket of sockets)socket.destroy();server.close();if(child){child.stdout?.destroy();child.stderr?.destroy();if(child.connected)child.disconnect();}
    await bounded(unlink(endpoint),budgetMs-Math.min(500,shutdownReserveMs/8),'ownership unlink').catch(error=>{if(error.code!=='ENOENT')cleanupFailure??=failure(error);});
    report.ownedGroups=[...groups.values()];report.launchers=[...launchers.values()];report.childExit=childExit??null;
    report.stdout=stdout;report.stderr=stderr;report.stdoutDroppedCodeUnits=stdoutDropped;report.stderrDroppedCodeUnits=stderrDropped;
    report.elapsedMs=elapsed();report.finishedAt=new Date().toISOString();
    if(externalFailure){report.outcome='Fail';report.failure=externalFailure;}if(cleanupFailure){report.outcome='Fail';report.cleanupFailure=cleanupFailure;}
    if(report.elapsedMs>budgetMs){report.outcome='Fail';report.budgetExceeded=true;}
    if(report.cleanup!=='Pass')report.cleanup='Unconfirmed';
    // Separate exclusive terminal file: never overwrite the inner result.
    try{if(outputCreated)await bounded(writeFile(join(absoluteOutput,'supervisor.json'),json(report),{flag:'wx'}),budgetMs,'terminal write');}catch(error){
      report.outcome='Fail';report.reportWriteFailure=failure(error);report.elapsedMs=elapsed();
      if(outputCreated)try{await bounded(writeFile(join(absoluteOutput,'supervisor-incomplete.json'),json(report),{flag:'wx'}),budgetMs,'incomplete terminal witness');}catch{}
      throw Object.assign(Error('Recovery supervisor terminal could not be persisted'),{supervisorReport:report,cause:error});
    }
    if(elapsed()>budgetMs){
      report.outcome='Fail';report.budgetExceeded=true;report.elapsedMs=elapsed();
      // A late OS write is not accepted merely because its serialized prefix
      // preceded settlement. Preserve an explicit overrun witness when possible.
      const late=json(report);void writeFile(join(absoluteOutput,'supervisor-overrun.json'),late,{flag:'wx'}).catch(()=>{});
      throw Object.assign(Error('Recovery supervisor completed after total bound'),{supervisorReport:report});
    }
  }
  return report;
}

let controllerContext,requestSequence=0;
const requests=new Map();
export async function childControllerHandshake(){
  ensure(!controllerContext&&process.send&&process.connected,'dedicated IPC controller required');
  const value=await new Promise((yes,no)=>{
    const timer=setTimeout(()=>{process.off('message',listener);no(Error('Supervisor handshake timed out'));},5000);
    function listener(message){if(message?.kind!=='rx9006-supervisor-init')return;clearTimeout(timer);process.off('message',listener);yes(message);}
    process.on('message',listener);process.send({kind:'rx9006-controller-ready'});
  });
  ensure(typeof value.attemptId==='string'&&HASH.test(value.bindingSha256)&&typeof value.endpoint==='string'&&typeof value.token==='string'&&value.controllerPid===process.pid,'controller handshake binding');
  controllerContext=value;
  process.env.RAVELDEX_RX9006_SUPERVISOR_ENDPOINT=value.endpoint;process.env.RAVELDEX_RX9006_SUPERVISOR_TOKEN=value.token;process.env.RAVELDEX_RX9006_ATTEMPT_ID=value.attemptId;
  process.on('message',message=>{if(message?.kind!=='rx9006-supervisor-ack')return;const item=requests.get(message.requestId);if(!item)return;requests.delete(message.requestId);clearTimeout(item.timer);message.error?item.no(Error(message.error.message)):item.yes(message.result);});
  process.on('disconnect',()=>{for(const item of requests.values()){clearTimeout(item.timer);item.no(Error('Supervisor IPC disconnected'));}requests.clear();});
  return Object.freeze({attemptId:value.attemptId,bindingSha256:value.bindingSha256,output:value.output,elapsedMs:value.elapsedMs,deadlineEpochMs:value.deadlineEpochMs});
}
function request(kind,data){ensure(controllerContext&&process.connected,'live controller supervision');ensure(requests.size<8&&requestSequence<1024,'bounded controller requests');const requestId=++requestSequence;return new Promise((yes,no)=>{const timer=setTimeout(()=>{requests.delete(requestId);no(Error('Supervisor acknowledgement timed out'));},5000);requests.set(requestId,{yes,no,timer});process.send({kind,requestId,...data});});}
export const beginRecoveryContext=({key})=>request('rx9006-context-begin',{key});
export const endRecoveryContext=({key})=>request('rx9006-context-end',{key});
export function finishController(){ensure(requests.size===0,'unacknowledged controller requests');if(process.connected)process.disconnect();}

/** Wrapper PGID is acknowledged before the pinned browser can exist. Playwright
 * launches it as its detached leader; Chrome inherits that group and fd3/fd4. */
export async function createSupervisedBrowserLauncher({executablePath,executableSha256,output}){
  ensure(controllerContext,'browser wrapper requires supervisor handshake');ensure(HASH.test(executableSha256),'browser executable hash');
  const executable=await realpath(executablePath);ensure(sha(await readFile(executable))===executableSha256,'browser executable changed');
  const directory=resolve(output??controllerContext.output);ensure(!relative(controllerContext.output,directory).startsWith('..'),'wrapper output outside attempt');
  const path=join(directory,'browser-launcher.mjs'),moduleSha256=sha(await readFile(modulePath));
  const source='#!'+process.execPath+'\nimport {runSupervisedExecutable} from '+JSON.stringify(pathToFileURL(modulePath).href)+';\nawait runSupervisedExecutable('+JSON.stringify({executablePath:executable,executableSha256,moduleSha256})+');\n';
  await writeFile(path,source,{flag:'wx',mode:0o700});
  await request('rx9006-launcher-created',{path,sha256:sha(source),executablePath:executable,executableSha256,moduleSha256});
  return path;
}
export async function runSupervisedExecutable({executablePath,executableSha256,moduleSha256}){
  ensure(['darwin','linux'].includes(process.platform),'wrapper POSIX platform');ensure(HASH.test(executableSha256)&&HASH.test(moduleSha256),'wrapper hashes');
  const endpoint=process.env.RAVELDEX_RX9006_SUPERVISOR_ENDPOINT,token=process.env.RAVELDEX_RX9006_SUPERVISOR_TOKEN,attemptId=process.env.RAVELDEX_RX9006_ATTEMPT_ID;
  ensure(endpoint&&token&&attemptId,'wrapper supervisor binding');let stopping=false;
  const stop=()=>{stopping=true;};process.once('SIGTERM',stop);process.once('SIGINT',stop);
  await new Promise((yes,no)=>{
    const socket=createConnection(endpoint);let text='';const timer=setTimeout(()=>{socket.destroy();no(Error('Owned browser acknowledgement timed out'));},2000);
    socket.on('error',error=>{clearTimeout(timer);no(error);});socket.on('connect',()=>socket.write(JSON.stringify({kind:'rx9006-owned-browser',token,attemptId,pid:process.pid,launcher:process.argv[1]})+'\n'));
    socket.on('data',chunk=>{text+=chunk.toString();if(text.length>8192){socket.destroy();clearTimeout(timer);no(Error('Oversized supervisor acknowledgement'));return;}if(!text.includes('\n'))return;clearTimeout(timer);socket.end();try{const reply=JSON.parse(text.trim());ensure(reply.ok&&reply.attemptId===attemptId,'owned browser acknowledgement refused');yes();}catch(error){no(error);}});
  });
  ensure(!stopping,'wrapper stopped before executable spawn');
  ensure(sha(await readFile(modulePath))===moduleSha256&&sha(await readFile(executablePath))===executableSha256,'wrapper/executable changed');ensure(!stopping,'wrapper stopped during executable verification');
  // Explicit fd forwarding is used instead of process.execve: Node's execve
  // contract preserves only standard descriptors, while Chromium needs 3/4.
  const env={...process.env};delete env.RAVELDEX_RX9006_SUPERVISOR_ENDPOINT;delete env.RAVELDEX_RX9006_SUPERVISOR_TOKEN;delete env.RAVELDEX_RX9006_ATTEMPT_ID;
  const child=spawn(executablePath,process.argv.slice(2),{detached:false,stdio:[0,1,2,3,4],env});
  const result=await new Promise((yes,no)=>{child.once('error',no);child.once('exit',(code,signal)=>yes({code,signal}));});
  process.exitCode=result.code??1;
}
