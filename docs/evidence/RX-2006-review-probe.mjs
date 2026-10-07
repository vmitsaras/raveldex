// Independent packed public consumer probes. Run from any checkout location:
// npm run build && node docs/evidence/RX-2006-review-probe.mjs
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, release, arch } from 'node:os';
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { prepareConsumer, digest, REPO_ROOT, command } from '../../scripts/lib/packed-consumer.mjs';

const destination = dirname(fileURLToPath(import.meta.url));
const report = { kind: 'raveldex-independent-ui-review-v1', startedAt: new Date().toISOString(),
  environment: { node: process.version, platform: platform(), release: release(), arch: arch(),
    ...(platform()==='darwin'?{macOS:(await command('sw_vers',['-productVersion'])).stdout.trim()}: {}) },
  limitations: ['Synthetic browser composition events are not OS IME observations.', 'No screen reader or physical latency/heap qualification.'],
  probes: [] };
let browser, server;
const consumer = await prepareConsumer([], []);
const source = `
import {createRaveldex} from '@vmitsaras/raveldex';
import {createSourceProvider} from '@vmitsaras/raveldex/addons/phrases/source';
import {createFacets} from '@vmitsaras/raveldex/addons/facets';
import {createInspector} from '@vmitsaras/raveldex/addons/inspector';
import {createSnippetEvidence} from '@vmitsaras/raveldex/addons/snippets';
import {mountRaveldexUI} from '@vmitsaras/raveldex/addons/ui';
window.mountReview=async(settings={})=>{
 const root=document.querySelector('#root'),original=[...root.childNodes];
 const engine=createRaveldex({schema:{text:{body:{}},metadata:{category:{type:'string'}}},addons:[
  createSourceProvider({fields:['body']}),createFacets({fields:['category']}),createInspector(),createSnippetEvidence({fields:{body:'source'}})]});
 const records=[{id:'alpha',text:{body:'red apple'},metadata:{category:'Guide'}},{id:'beta',text:{body:'blue berry'},metadata:{category:'Reference'}}];
 await engine.addMany(records);
 const state={calls:[],mutateAfterMain:false,holdMain:false,holdInspector:false,pending:[],disposals:0};
 const borrowed=Object.freeze({...engine,async search(query,options={}){
  const call={query,options:{...options,signal:undefined},signal:options.signal};state.calls.push(call);
  const hold=(!options.extensions?.snippets&&!options.extensions?.inspector&&state.holdMain)||(options.extensions?.inspector&&state.holdInspector);
  if(hold){state.holdMain=false;state.holdInspector=false;}
  const {signal,...withoutSignal}=options;
  const result=await engine.search(query,hold?withoutSignal:options);call.revision=result.revision;
  if(state.mutateAfterMain&&!options.extensions?.snippets&&!options.extensions?.inspector){state.mutateAfterMain=false;await engine.replace({id:'beta',text:{body:'blue blueberry'},metadata:{category:'Reference'}});}
  if(hold)await new Promise(resolve=>state.pending.push(resolve));
  return result;
 },async dispose(){state.disposals++;await engine.dispose();}});
 const docs=[{id:'alpha',title:'Alpha document',url:'/docs/alpha'},{id:'beta',title:'Beta document',url:'/docs/beta'}];
 const options={root,engine:borrowed,documents:docs,facets:[{field:'category',label:'Category'}],snippetFields:['body'],debounceMs:500,pageSize:1,...settings};
 let handle=mountRaveldexUI(options);
 const harness={root,original,engine,borrowed,state,docs,options,get handle(){return handle;},
  release(){for(const resume of state.pending.splice(0))resume();},
  remount(){handle=mountRaveldexUI(options);},
  async cleanup(){handle.destroy();this.release();await engine.dispose();},
  calls(){return state.calls.map(c=>({query:c.query,options:c.options,aborted:c.signal?.aborted,revision:c.revision}));},
  validate(){
   const out=[];let invoked=0;
   const d={id:'alpha',title:'Alpha',url:'/docs/alpha'};Object.defineProperty(d,'title',{enumerable:true,get(){invoked++;return'getter';}});
   const sparse=new Array(1);
   for(const change of [{documents:[d]},{documents:sparse},{documents:[{id:'alpha',title:'Alpha',url:'javascript:alert(1)'}]},{pageSize:101},{snippetFields:['body','body']}]){
    const isolated=document.createElement('div'),text=document.createTextNode('authored');isolated.append(text);document.body.append(isolated);let code;
    try{mountRaveldexUI({...options,...change,root:isolated});}catch(e){code=e.code;}
    out.push({code,restored:isolated.firstChild===text&&isolated.childNodes.length===1});isolated.remove();
   }
   return{out,invoked};
  },
  alternate(optionsOverride){const isolated=document.createElement('div');document.body.append(isolated);return{root:isolated,handle:mountRaveldexUI({...options,root:isolated,...optionsOverride})};}
 };window.h=harness;return true;
};
window.mountRaveldexUI=mountRaveldexUI;
window.createPagingReview=async()=>{
 const root=document.createElement('div');root.id='paging';document.body.append(root);
 const engine=createRaveldex({schema:{text:{body:{}}},limits:{maxDocuments:5},addons:[createInspector()]});
 const ids=['a','b','c','d','e'];await engine.addMany(ids.map(id=>({id,text:{body:'word'}})));
 const handle=mountRaveldexUI({root,engine,documents:ids.map(id=>({id,title:id,url:'/docs/'+id})),pageSize:3});
 await handle.search();window.bounded={root,engine,handle};return true;
};
`;
await writeFile(join(consumer.directory, 'review-entry.mjs'), source);
const bundle = await build({ absWorkingDir: consumer.directory, entryPoints: ['review-entry.mjs'], outfile: join(consumer.directory, 'review.mjs'),
  platform: 'browser', format: 'esm', bundle: true, target: 'es2022', metafile: true, logLevel: 'silent' });
const css = await readFile(join(consumer.installed, 'dist/addons/ui/styles.css'));
await writeFile(join(consumer.directory, 'styles.css'), css);
await writeFile(join(consumer.directory, 'index.html'), '<!doctype html><html lang="en"><head><title>Independent UI review</title><link rel="stylesheet" href="/styles.css"></head><body><main><h1>Independent UI review</h1><div id="root"><p id="authored">Original content <a href="/docs">Docs</a></p></div></main><script type="module" src="/review.mjs"></script></body></html>');
report.package = { sha256: consumer.package.sha256, runtimeDependencies: [], uiSourceHashes: Object.fromEntries(await Promise.all(['ui.ts','options.ts','render.ts','styles.css'].map(async name=>[name,digest(await readFile(join(REPO_ROOT,'src/addons/ui',name)))]))),
  shippedUIHashes: Object.fromEntries(await Promise.all(['ui.js','options.js','render.js','styles.css'].map(async name=>{
    const shipped=await readFile(join(consumer.installed,'dist/addons/ui',name)),compiled=await readFile(join(REPO_ROOT,'dist/addons/ui',name));
    assert.deepEqual(shipped,compiled,'packed module matches current compiled module: '+name);return[name,digest(shipped)];
  }))) };
report.bundleInputs = Object.keys(bundle.metafile.inputs);
assert.ok(report.bundleInputs.every(path=>path==='review-entry.mjs'||path.startsWith('node_modules/@vmitsaras/raveldex/dist/')));
server = createServer(async(req,res)=>{
  const asset={'/':'index.html','/review.mjs':'review.mjs','/styles.css':'styles.css'}[req.url];
  if(!asset){res.writeHead(404);res.end();return;}
  const type=asset.endsWith('.mjs')?'text/javascript':asset.endsWith('.css')?'text/css':'text/html';
  res.setHeader('Content-Type',type);res.end(await readFile(join(consumer.directory,asset)));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin=`http://127.0.0.1:${server.address().port}`;
const hook=name=>`[data-raveldex-${name}]`;
const probes=[];
function probe(name,run){probes.push({name,run});}
async function settled(page){await page.waitForFunction(()=>document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy')==='false'&&/results|failed/i.test(document.querySelector('[data-raveldex-status]')?.textContent??''));}
async function search(page,text){await page.locator(hook('input')).fill(text);await page.locator(hook('submit')).click();await settled(page);}

probe('interleaving committed write rejects mixed main/snippet revisions and recovers',async page=>{
 await page.evaluate(()=>{h.state.mutateAfterMain=true;});await search(page,'blue');
 assert.match(await page.locator(hook('error')).innerText(),/REVISION_MISMATCH/);assert.equal(await page.locator(hook('result')).count(),0);
 await page.locator(hook('retry')).click();await settled(page);
 assert.equal(await page.locator('[data-raveldex-result="beta"]').count(),1);
 const calls=await page.evaluate(()=>h.calls());assert.equal(calls.at(-1).revision,2);assert.equal(calls.at(-1).options.extensions.snippets.expectedRevision,2);
 return{failure:'REVISION_MISMATCH',partialRows:0,recoveredRevision:2};
});
probe('Inspector refuses intervening writes then recovers after current search',async page=>{
 await search(page,'blue');await page.evaluate(()=>h.engine.replace({id:'beta',text:{body:'blue blueberry'},metadata:{category:'Reference'}}));
 await page.locator(hook('inspect')).click();await page.waitForFunction(()=>document.querySelector('[data-raveldex-inspector-error]')?.textContent.includes('REVISION_MISMATCH'));
 assert.equal(await page.locator(hook('inspector-data')).innerText(),'');await page.locator(hook('inspector-close')).click();
 await search(page,'blue');await page.locator(hook('inspect')).click();await page.waitForFunction(()=>document.querySelector('[data-raveldex-inspector-status]')?.textContent.includes('revision 2'));
 return{oldRevision:1,recoveredRevision:2,staleFactsRendered:false};
});
probe('closing Inspector aborts its signal and suppresses ignored-cancel late facts',async page=>{
 await search(page,'blue');await page.evaluate(()=>{h.state.holdInspector=true;});await page.locator(hook('inspect')).click();
 await page.waitForFunction(()=>h.state.pending.length===1);await page.keyboard.press('Escape');
 assert.equal(await page.locator(hook('inspect')).evaluate(n=>n===document.activeElement),true);
 assert.equal(await page.evaluate(()=>h.calls().at(-1).aborted),true);await page.evaluate(()=>h.release());await page.waitForTimeout(70);
 assert.equal(await page.locator(hook('inspector')).evaluate(n=>n.open),false);assert.equal(await page.locator(hook('inspector-data')).innerText(),'');
 return{signalAborted:true,lateFactsRendered:false,openerFocusRestored:true};
});
probe('changed input invalidates held result immediately before debounce',async page=>{
 await page.evaluate(()=>{h.state.holdMain=true;});await page.locator(hook('input')).fill('red');await page.locator(hook('submit')).click();
 await page.waitForFunction(()=>h.state.pending.length===1);const count=await page.evaluate(()=>h.state.calls.length);
 await page.locator(hook('input')).fill('blue');assert.equal(await page.locator(hook('result')).count(),0);assert.match(await page.locator(hook('status')).innerText(),/Waiting/);
 await page.evaluate(()=>h.release());await page.waitForTimeout(80);assert.equal(await page.locator(hook('result')).count(),0);
 assert.equal(await page.evaluate(()=>h.state.calls.length),count);await settled(page);assert.equal(await page.locator('[data-raveldex-result="beta"]').count(),1);
 return{staleResultVisibleDuringDebounce:false,newQuery:'blue'};
});
probe('destroy cancels timer and removes detached control listeners while borrowing engine',async page=>{
 await page.evaluate(()=>{h.oldInput=document.querySelector('[data-raveldex-input]');});await page.locator(hook('input')).fill('blue');
 const count=await page.evaluate(()=>h.state.calls.length);await page.evaluate(()=>{h.handle.destroy();h.handle.destroy();h.oldInput.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForTimeout(650);
 assert.equal(await page.evaluate(()=>h.state.calls.length),count);assert.equal(await page.evaluate(()=>h.original.every((n,i)=>h.root.childNodes[i]===n)),true);
 assert.equal(await page.evaluate(()=>h.state.disposals),0);assert.equal(await page.evaluate(async()=> (await h.engine.search('blue')).total),1);
 await page.evaluate(()=>h.remount());await settled(page);await search(page,'blue');
 assert.equal(await page.locator('[data-raveldex-result="beta"]').count(),1);
 return{timerCallsAfterDestroy:0,oldListenersRemoved:true,originalNodesIdentical:true,borrowedDisposals:0};
});
probe('captured options are stable and duplicate root keeps first handle',async page=>{
 await page.evaluate(()=>{h.docs[0].title='Changed caller title';h.docs[0].url='javascript:alert(1)';h.options.pageSize=100;});
 const duplicate=await page.evaluate(()=>window.mountRaveldexUI({root:h.root,documents:null,engine:null})===h.handle);assert.equal(duplicate,true);
 await search(page,'red');assert.equal(await page.locator(hook('result-title')).innerText(),'Alpha document');
 assert.equal(await page.locator(hook('result-title')).getAttribute('href'),origin+'/docs/alpha');
 const invalid=await page.evaluate(()=>h.validate());assert.equal(invalid.invoked,0);assert.ok(invalid.out.every(item=>item.code==='INVALID_OPTIONS'&&item.restored));
 return{duplicateSameHandle:true,capturedDocumentsStable:true,invalidOptions:invalid};
});
probe('protocol-relative HTTP(S) navigation follows declared allowlist contract',async page=>{
 const info=await page.evaluate(async()=>{const mounted=h.alternate({documents:[{id:'alpha',title:'Alpha',url:'//example.test/docs/alpha'},{id:'beta',title:'Beta',url:'/docs/beta'}]});await mounted.handle.search();const link=mounted.root.querySelector('[data-raveldex-result-title]').href;mounted.handle.destroy();mounted.root.remove();return link;});
 assert.ok(info.startsWith('http://example.test/'));return{resolvedAllowedURL:info};
});
probe('whitespace-only human-facing labels reject before changing authored content',async page=>{
 const info=await page.evaluate(()=>[{label:'   '},{documents:[{id:'alpha',title:'   ',url:'/docs/alpha'}]},{facets:[{field:'category',label:'   '}]}].map(change=>{
  const root=document.createElement('div'),original=document.createTextNode('authored');root.append(original);document.body.append(root);let code;
  try{mountRaveldexUI({...h.options,...change,root});}catch(e){code=e.code;}
  const sameOriginal=root.firstChild===original&&root.childNodes.length===1;root.remove();return{code,sameOriginal};
 }));assert.ok(info.every(item=>item.code==='INVALID_OPTIONS'&&item.sameOriginal));return{rejectedBlankLabels:info};
});
probe('a reduced corpus bound permits the final partial result page',async page=>{
 await page.evaluate(()=>createPagingReview());assert.match(await page.locator('#paging '+hook('status')).innerText(),/5 results.*1.*3/);
 await page.locator('#paging '+hook('next')).click();await page.waitForFunction(()=>document.querySelector('#paging [data-raveldex-ui]')?.getAttribute('aria-busy')==='false');
 const observed={status:await page.locator('#paging '+hook('status')).innerText(),error:await page.locator('#paging '+hook('error')).innerText(),rows:await page.locator('#paging '+hook('result')).count()};
 report.paginationObservation={maxDocuments:5,pageSize:3,...observed};
 assert.equal(observed.status,'5 results. Showing 4–5.');assert.equal(observed.rows,2);
 await page.locator('#paging '+hook('inspect')).click();await page.waitForFunction(()=>document.querySelector('#paging [data-raveldex-inspector-status]')?.textContent.includes('2 selected documents'));
 const facts=JSON.parse(await page.locator('#paging '+hook('inspector-data')).innerText());assert.equal(facts.documents.length,2);assert.equal(facts.revision,1);
 return{maxDocuments:5,pageSize:3,...observed,inspectorDocuments:facts.documents.length,inspectorRevision:facts.revision};
});

try {
 browser=await chromium.launch({channel:'chrome',headless:true});report.environment.browser={version:browser.version(),channel:'chrome',headless:true};
 report.environment.playwright=JSON.parse(await readFile(join(REPO_ROOT,'node_modules/playwright-core/package.json'))).version;
 for(const {name,run}of probes){
  const context=await browser.newContext({viewport:{width:980,height:850}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  try{await page.goto(origin);await page.waitForFunction(()=>typeof mountReview==='function');await page.evaluate(()=>mountReview());await settled(page);
   const evidence=await run(page);assert.deepEqual(errors,[]);report.probes.push({name,status:'Pass',evidence});console.log('Pass: '+name);
  }catch(error){report.probes.push({name,status:'Fail',error:String(error),pageErrors:errors});console.log('Fail: '+name+' — '+String(error));}
  finally{await page.evaluate(async()=>{await h?.cleanup();if(window.bounded){bounded.handle.destroy();await bounded.engine.dispose();}}).catch(()=>{});await context.close();}
 }
}catch(error){report.infrastructure={status:'Blocked',error:String(error)};}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));report.finishedAt=new Date().toISOString();await writeFile(join(destination,'RX-2006-review-probe.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({probes:report.probes.map(({name,status,evidence,error})=>({name,status,evidence,error})),infrastructure:report.infrastructure},null,2));
if(report.infrastructure||report.probes.some(probe=>probe.status==='Fail'))process.exitCode=1;
