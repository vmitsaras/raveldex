// One task-owned browser for native hook calibration, controlled over stdin.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const directory=resolve(process.argv[2]);await mkdir(directory);
const executable='/Users/vasilis/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const digest=createHash('sha256');for await(const b of createReadStream(executable))digest.update(b);const binarySha256=digest.digest('hex');
assert.equal(binarySha256,'a0bfe7b4da4787b66058477d696cd1d09065d25f06a548947722b9af77ee8282');
const report={schema:'raveldex-native-browser-control-v2',directory,executable,binarySha256,started:new Date().toISOString(),commands:[],outcome:'Running'};
let http,server,browser,context,page,cdp,closed=false;
async function save(){await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');}
async function close(){if(closed)return;closed=true;await context?.close();await browser?.close();await server?.close();if(http?.listening)await new Promise(yes=>http.close(yes));report.finished=new Date().toISOString();report.ownedBrowserClosed=true;await save();}
const worker=`self.onmessage=event=>{const value=event.data;if(value?.kind!=='rx-native-control')throw Error('Unexpected fixture envelope');let checksum=0;for(let i=0;i<value.text.length;i++)checksum=(checksum+value.text.charCodeAt(i))>>>0;self.postMessage({kind:value.kind,id:value.id,label:value.label,text:value.text,checksum});};self.postMessage({kind:'ready'});`;
const main=`let worker,ready,resolveReady,pending=new Map(),held=[],next=1;ready=new Promise(yes=>resolveReady=yes);worker=new Worker('/worker.mjs',{type:'module'});worker.onmessage=event=>{const value=event.data;if(value.kind==='ready'){resolveReady();return;}const receiver=pending.get(value.id);if(!receiver)throw Error('Unexpected reply');pending.delete(value.id);held.push(value);receiver(value);};window.nativeControl={ready:()=>ready,async run(kind,label){await ready;const text=kind==='large-two-byte'?'λ中'.repeat(131072):kind==='large-latin1'?'Aé'.repeat(131072):'tiny fixture';const id=next++;let expected=0;for(let i=0;i<text.length;i++)expected=(expected+text.charCodeAt(i))>>>0;performance.mark('rx-native:'+label+':send-begin');const result=await new Promise((yes,no)=>{pending.set(id,yes);try{worker.postMessage({kind:'rx-native-control',id,label,text});}catch(error){pending.delete(id);no(error);}performance.mark('rx-native:'+label+':send-end');});performance.mark('rx-native:'+label+':received');if(result.text!==text||result.checksum!==expected)throw Error('Payload parity failed');return{id,label,codeUnits:text.length,checksum:result.checksum,allCodeUnitsVerified:true};},fail(label){performance.mark('rx-native:'+label+':send-begin');try{worker.postMessage({kind:'invalid',bad:()=>{}});throw Error('Expected clone refusal');}catch(error){if(error.name!=='DataCloneError')throw error;return{name:error.name};}finally{performance.mark('rx-native:'+label+':send-end');}},release(){held=[];return{heldReplies:held.length};},terminate(){worker.terminate();return{terminated:true};}};`;
try{
 http=createServer((req,res)=>{const p=new URL(req.url,'http://127.0.0.1').pathname;res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'");if(p==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="en"><script type="module" src="/main.mjs"></script><body>Owned native calibration</body></html>');}else if(p==='/main.mjs'||p==='/worker.mjs'){res.setHeader('content-type','text/javascript');res.end(p==='/main.mjs'?main:worker);}else{res.writeHead(404);res.end();}});
 await new Promise((yes,no)=>{http.once('error',no);http.listen(0,'127.0.0.1',yes);});report.origin='http://127.0.0.1:'+http.address().port;
 server=await chromium.launchServer({executablePath:executable,headless:true,host:'127.0.0.1'});report.browserPid=server.process().pid;report.browserArguments=server.process().spawnargs;
 browser=await chromium.connect(server.wsEndpoint());context=await browser.newContext();page=await context.newPage();cdp=await browser.newBrowserCDPSession();report.version=await cdp.send('Browser.getVersion');assert.match(report.version.product,/153\.0\.8010\.12/);
 await page.goto(report.origin);await page.waitForFunction(()=>!!window.nativeControl);await page.evaluate(()=>window.nativeControl.ready());
 const label='rx-native-owned-renderer-'+report.browserPid;
 await cdp.send('Tracing.start',{transferMode:'ReturnAsStream',traceConfig:{recordMode:'recordUntilFull',includedCategories:['blink.user_timing']}});await page.evaluate(label=>performance.mark(label),label);
 const completion=new Promise(yes=>cdp.once('Tracing.tracingComplete',yes));await cdp.send('Tracing.end');const ended=await completion;assert.equal(ended.dataLossOccurred,false);
 const pieces=[];for(;;){const p=await cdp.send('IO.read',{handle:ended.stream,size:65536});pieces.push(Buffer.from(p.data,p.base64Encoded?'base64':'utf8'));if(p.eof)break;}await cdp.send('IO.close',{handle:ended.stream});const raw=Buffer.concat(pieces);assert.ok(raw.length<4*1024*1024);await writeFile(join(directory,'pid-proof-trace.json'),raw,{flag:'wx'});
 const events=JSON.parse(raw).traceEvents.filter(e=>e.name===label);const pids=[...new Set(events.map(e=>e.pid))];assert.equal(pids.length,1);report.rendererPid=pids[0];report.processInfo=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;assert.ok(report.processInfo.some(p=>p.id===report.rendererPid&&p.type==='renderer'));report.pidProof={label,events,sha256:createHash('sha256').update(raw).digest('hex')};await save();
 console.log(JSON.stringify({ready:true,directory,browserPid:report.browserPid,rendererPid:report.rendererPid,version:report.version.product,origin:report.origin}));
 const watchdog=setTimeout(async()=>{report.outcome='Owned controller timeout';await close();process.exitCode=1;},15*60*1000);
 const input=createInterface({input:process.stdin,terminal:false});
 for await(const line of input){if(!line.trim())continue;const command=JSON.parse(line);const row={command,started:new Date().toISOString()};report.commands.push(row);try{
  if(command.cmd==='case'){assert.ok(['small','large-latin1','large-two-byte','fail'].includes(command.kind));assert.match(command.label,/^[a-z0-9-]{1,64}$/);row.result=command.kind==='fail'?await page.evaluate(label=>window.nativeControl.fail(label),command.label):await page.evaluate(({kind,label})=>window.nativeControl.run(kind,label),command);}
  else if(command.cmd==='release')row.result=await page.evaluate(()=>window.nativeControl.release());
  else if(command.cmd==='terminate')row.result=await page.evaluate(()=>window.nativeControl.terminate());
  else if(command.cmd==='phase'){assert.match(command.label,/^[a-z0-9-]{1,64}$/);await writeFile(join(directory,'phase.txt'),command.label+'\n');row.result={phaseWritten:command.label};}
  else if(command.cmd==='status')row.result={closed:page.isClosed(),processInfo:(await cdp.send('SystemInfo.getProcessInfo')).processInfo};
  else if(command.cmd==='close'){row.result={closing:true};row.finished=new Date().toISOString();report.outcome='Observed controls';await save();console.log(JSON.stringify(row));break;}
  else throw Error('Unknown owned-controller command');
 }catch(error){row.error={name:error.name,message:error.message};}row.finished=new Date().toISOString();await save();console.log(JSON.stringify(row));}
 input.close();process.stdin.pause();clearTimeout(watchdog);await close();
}catch(error){report.outcome='Fail';report.failure={name:error.name,message:error.message,stack:error.stack};await save();await close();throw error;}
