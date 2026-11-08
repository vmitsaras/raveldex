import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'node:http';
import { cp, mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { join, dirname, extname, resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { build } from 'esbuild';
import axe from 'axe-core';
import { prepareConsumer, command, REPO_ROOT, digest } from '../../scripts/lib/packed-consumer.mjs';
import { seedStarterCache } from './inline-astro-starter-cache.mjs';
import { packAstro } from '../../scripts/pack-astro.mjs';
import { STARTERS } from '../../site/starters.mjs';
import { directoryExpected } from '../oracle/directory.mjs';
let consumer, browser;const sites=[];
const selected=process.env.RAVELDEX_DIRECTORY_STARTER_BROWSER??process.env.RAVELDEX_UI_BROWSER??'chrome';
const report={kind:'raveldex-installed-directory-starters-v1',observations:[],environment:{node:process.version,platform:process.platform,arch:process.arch,selected},scope:'Exact copied browser/Astro projects, real offline package/tool installs, root/help builds, scripted browser interaction and emulated media. No human AT, physical input or actual zoom/Safari/release qualification.'};
const record=(name,details)=>report.observations.push({name,status:'Pass',details});
async function serve(root,base){const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://local').pathname;if(!p.startsWith(base))throw Error();let path=decodeURIComponent(p.slice(base.length));if(path.split('/').includes('..'))throw Error();if(!path||path.endsWith('/'))path+='index.html';const bytes=await readFile(join(root,path));res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css'})[extname(path)]??'application/octet-stream');res.end(bytes);}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));return{origin:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(r=>{server.closeAllConnections();server.close(r);})};}
const input=p=>p.getByRole('searchbox',{name:'Search walking resources',exact:true});
const ids=p=>p.locator('[data-raveldex-directory-result]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-raveldex-directory-result')));
async function ready(p){await p.getByText('Directory is ready.',{exact:true}).waitFor();await p.waitForFunction(()=>document.querySelector('.raveldex-directory')?.dataset.state==='ready');}
async function enable(p,site){if(site.family==='astro')await p.getByRole('button',{name:'Enable directory',exact:true}).click();await ready(p);}
async function query(p,text){await input(p).fill(text);await input(p).press('Enter');await p.waitForFunction(()=>document.querySelector('.raveldex-directory')?.dataset.state==='ready');}
const schema={text:{title:{boost:2},body:{}},metadata:{format:{type:'string'},topics:{type:'string',multi:true}}};
const groups=[{field:'format',values:['guide','checklist','tool']},{field:'topics',values:['planning','safety','access','nature','water']}];
function expected(site,query,filters={},page=1){const data=site.entries.map(e=>({id:e.id,text:{title:e.title,body:e.body},metadata:{format:e.format,topics:e.topics}}));return directoryExpected(data,schema,query,filters,groups,3,page);}
before(async()=>{
 assert.ok(['chrome','chromium','webkit'].includes(selected));consumer=await prepareConsumer([],[]);report.package=consumer.package;report.consumer={directory:consumer.directory,installed:consumer.installed};
 const cache=join(consumer.directory,'starter-cache');report.cache=await seedStarterCache(cache);const astro=await packAstro({output:join(consumer.directory,'astro-package')});report.astro={sha256:digest(await readFile(astro.tarball)),tarball:astro.tarball};
 for(const family of ['browser','astro'])for(const base of ['/','/help/']){
  const id='directory-'+family,directory=join(consumer.directory,id+'-'+(base==='/'?'root':'help'));await cp(join(REPO_ROOT,'examples',id),directory,{recursive:true,filter:p=>!/(?:^|\/)dist(?:\/|$)|build-meta\.json$|node_modules/.test(p)});
  const raw=JSON.parse(await readFile(join(directory,'content.json'),'utf8')),entries=family==='browser'?raw:raw.entries;entries[0].title='Plan a riverside walking trip — an accessible route guide';entries[0].body+=' Riverside paths are part of this walking resource.';if(family==='astro')raw.buildId+='-changed';await writeFile(join(directory,'content.json'),JSON.stringify(raw,null,2)+'\n');
  const cssPath=family==='browser'?'theme.css':'src/style.css',css=await readFile(join(directory,cssPath),'utf8');assert.ok(css.includes('--raveldex-directory-gap: 1rem;'));await writeFile(join(directory,cssPath),css.replace('--raveldex-directory-gap: 1rem;','--raveldex-directory-gap: 1.25rem;'));
  await command('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--cache',cache,join(consumer.directory,consumer.packed.filename),...(family==='astro'?[astro.tarball]:[])],directory);
  for(const pkg of ['@vmitsaras/raveldex',family==='astro'?'astro':'esbuild',...(family==='astro'?['@vmitsaras/raveldex-astro']:[])])assert.equal(await realpath(join(directory,'node_modules',pkg)),join(directory,'node_modules',pkg));
  const built=await command('env',[...(family==='astro'?['ASTRO_TELEMETRY_DISABLED=1',`RAVELDEX_ASTRO_BASE=${base}`]:[`RAVELDEX_DIRECTORY_BASE=${base}`]),'npm','run','build','--cache',cache],directory);await writeFile(join(directory,'verification-build.log'),built.stdout+built.stderr);
  const probe="export {configuration} from './configuration.mjs';" + (family==='browser'?"export {createDirectorySearch} from './controller.mjs';export {loadResources} from './load.mjs';export {createRaveldex} from '@vmitsaras/raveldex';":"export {createDirectorySearch} from './src/search.mjs';export {loadStaticSearch} from '@vmitsaras/raveldex-astro/client';export {createRaveldex} from '@vmitsaras/raveldex';");
  await writeFile(join(directory,'probe-entry.mjs'),probe);const graph=await build({absWorkingDir:directory,entryPoints:['probe-entry.mjs'],outfile:'dist/probe.mjs',bundle:true,platform:'browser',format:'esm',target:'es2022',metafile:true,logLevel:'silent'});
  const inputs=Object.keys(graph.metafile.inputs);assert.ok(inputs.every(p=>p==='probe-entry.mjs'||p==='controller.mjs'||p==='load.mjs'||p==='configuration.mjs'||p==='content.mjs'||p==='src/search.mjs'||/^node_modules\/@vmitsaras\/raveldex(?:-astro)?\/dist\//.test(p)));assert.ok(inputs.some(p=>p.endsWith('/addons/ui/directory-view.js')));assert.ok(inputs.every(p=>!p.includes('/addons/snippets/')&&!p.includes('/addons/sections/')));
  const server=await serve(join(directory,'dist'),base);const inventory=STARTERS.find(s=>s.id===id);assert.ok(inventory);const sourceSHA256=Object.fromEntries(await Promise.all(inventory.files.map(async p=>[p,digest(await readFile(join(REPO_ROOT,'examples',id,p)))])));
  sites.push({...server,family,base,directory,entries,buildId:raw.buildId});record(`copied installed build ${id} ${base}`,{directory,base,sourceSHA256,inputs,changedTitle:entries[0].title,changedCSS:'1.25rem',buildId:raw.buildId});
 }
 browser=selected==='webkit'?await webkit.launch({headless:true}):await chromium.launch({...(selected==='chrome'?{channel:'chrome'}:{}),headless:true});report.environment.browser=browser.version();
},{timeout:120000});
after(async()=>{await browser?.close();for(const s of sites)await s.close();if(process.env.RAVELDEX_DIRECTORY_STARTER_REPORT){const p=resolve(process.env.RAVELDEX_DIRECTORY_STARTER_REPORT);await mkdir(dirname(p),{recursive:true});await writeFile(p,JSON.stringify(report,null,2)+'\n');}});

test('both copied starters use independent native membership/counts and complete pages at root/help',async()=>{
 for(const site of sites){const page=await browser.newPage();try{await page.goto(site.origin+site.base);await enable(page,site);await query(page,'walking resource');const all=[];const total=expected(site,{kind:'and',children:[{kind:'text',text:'walking'},{kind:'group',variants:[{text:'resource',match:'prefix'}]}]});
  for(let n=1;n<=3;n++){const e=expected(site,{kind:'and',children:[{kind:'text',text:'walking'},{kind:'group',variants:[{text:'resource',match:'prefix'}]}]},{},n);assert.deepEqual(await ids(page),e.hits.map(h=>h.id));all.push(...await ids(page));if(n<3){await page.getByRole('button',{name:'Next page',exact:true}).click();await page.getByText(`Page ${n+1} of 3.`,{exact:true}).waitFor();}}
  assert.deepEqual(all,total.allIDs);assert.equal(all.length,7);await query(page,'riverside');assert.deepEqual(await ids(page),['maps']);assert.equal(await page.locator('.raveldex-directory').evaluate(n=>getComputedStyle(n).getPropertyValue('--raveldex-directory-gap').trim()),'1.25rem');
  await page.locator('[data-raveldex-directory-result-link]').click();await page.waitForURL('**'+site.base+'resources/maps/');assert.equal(await page.getByRole('heading',{level:1}).innerText(),site.entries[0].title);record(`independent pages/destination ${site.family} ${site.base}`,{ids:all,total:7,destination:new URL(page.url()).pathname});
 }finally{await page.close();}}
});
test('checkboxes/chips/clear and actual native history replay work in both installed applications',async()=>{
 for(const site of sites){const page=await browser.newPage();try{await page.goto(site.origin+site.base+'?unrelated=a%20b#keep');await enable(page,site);await page.locator('summary').click();
  const guide=page.getByRole('checkbox',{name:/^Guides /});await guide.check();await page.waitForFunction(()=>document.querySelector('.raveldex-directory')?.dataset.state==='ready');const e=expected(site,{kind:'all'},{format:['guide']});assert.deepEqual(await ids(page),e.hits.map(h=>h.id));
  const safety=page.getByRole('checkbox',{name:/^Safety /});await safety.check();await page.waitForFunction(()=>document.querySelector('.raveldex-directory')?.dataset.state==='ready');const filtered=expected(site,{kind:'all'},{format:['guide'],topics:['safety']});assert.deepEqual(await ids(page),filtered.hits.map(h=>h.id));
  await page.goBack();await page.waitForFunction(()=>!document.querySelector('input[data-field="topics"][value="safety"]').checked);assert.deepEqual(await ids(page),e.hits.map(h=>h.id));await page.goForward();await page.waitForFunction(()=>document.querySelector('input[data-field="topics"][value="safety"]').checked&&document.querySelector('.raveldex-directory')?.dataset.state==='ready');assert.deepEqual(await ids(page),filtered.hits.map(h=>h.id));
  await page.getByRole('button',{name:'Remove Topic: Safety',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.raveldex-directory')?.dataset.state==='ready');await page.getByRole('button',{name:'Clear all',exact:true}).click();await page.getByText('7 results. Showing 1–3.',{exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('unrelated'),'a b');assert.equal(new URL(page.url()).hash,'#keep');record(`controls/native history ${site.family} ${site.base}`,{filteredIDs:filtered.allIDs,backForward:true,unrelatedPreserved:true});
 }finally{await page.close();}}
});
test('zero results recover and native mobile disclosure closes with stable focus in copied projects',async()=>{
 for(const site of sites){const page=await browser.newPage({viewport:{width:320,height:850}});try{await page.goto(site.origin+site.base);await enable(page,site);await page.locator('summary').click();await page.getByRole('checkbox',{name:/^Water routes /}).check();await page.getByText('No results with the selected filters. Change or remove a filter, or clear all to browse resources.',{exact:true}).waitFor();assert.equal(await page.getByRole('checkbox',{name:/^Water routes /}).isChecked(),true);await page.getByRole('button',{name:'Close filters',exact:true}).click();assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SUMMARY');await page.getByRole('button',{name:'Remove Topic: Water routes',exact:true}).click();await page.getByText('7 results. Showing 1–3.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);record(`zero/mobile ${site.family} ${site.base}`,{width:320,focus:'summary',recoveredTotal:7});}finally{await page.close();}}
});
test('authored browsing works without JavaScript and failed initial data/assets can genuinely retry',async()=>{
 for(const site of sites){const noJS=await browser.newContext({javaScriptEnabled:false});const page=await noJS.newPage();try{await page.goto(site.origin+site.base);const links=page.getByRole('navigation',{name:'Browse all resources'}).getByRole('link');assert.equal(await links.count(),7);await links.first().click();assert.equal(await page.getByRole('heading',{level:1}).innerText(),site.entries[0].title);}finally{await noJS.close();}
  const p=await browser.newPage();try{const blocked=site.family==='browser'?'**/content.json':'**/raveldex/manifest.json';await p.route(blocked,r=>r.fulfill({status:503,body:'unavailable'}));await p.goto(site.origin+site.base);if(site.family==='astro')await p.getByRole('button',{name:'Enable directory',exact:true}).click();await p.getByRole('button',{name:'Retry loading directory',exact:true}).waitFor();assert.equal(await p.locator('.raveldex-directory').count(),0);assert.equal(await p.getByRole('navigation',{name:'Browse all resources'}).getByRole('link').count(),7);await p.unroute(blocked);await p.getByRole('button',{name:'Retry loading directory',exact:true}).click();await ready(p);record(`no-JS/actual asset retry ${site.family} ${site.base}`,{browseLinks:7,retry:true});}finally{await p.close();}}
});
test('copied wrappers deduplicate and dispose late real owners',async()=>{
 for(const site of sites){const page=await browser.newPage();try{await page.goto(site.origin+site.base);await enable(page,site);const r=await page.evaluate(async({base,family})=>{
   const api=await import(base+'probe.mjs');const host=document.createElement('section');document.body.append(host);host.innerHTML='<div id="probe-root"><p>Original</p></div><p id="probe-status"></p><button id="probe-retry">Enable</button>';
   const root=host.querySelector('#probe-root'),status=host.querySelector('#probe-status'),retry=host.querySelector('button'),original=root.firstChild;
   const engine=api.createRaveldex({schema:{text:{title:{}}}});await engine.add({id:'a',text:{title:'real'}});let release,disposed=0,loads=0;const gate=new Promise(r=>{release=r;});const instance=api.createDirectorySearch({root,status,retry,urlState:false,load:async()=>{loads++;await gate;return{engine,documents:[{id:'a',title:'Real',url:location.origin+base}],dispose:async()=>{disposed++;await engine.dispose();}};}});
   const first=instance.start(),second=instance.start();await Promise.resolve();const closing=instance.destroy();release();await first;await closing;const same=closing===instance.destroy();const kept=root.firstChild===original;host.remove();return{loads,disposed,dedup:first===second,stableDisposal:same,authored:kept};
  },{base:site.base,family:site.family});assert.deepEqual(r,{loads:1,disposed:1,dedup:true,stableDisposal:true,authored:true});record(`late owned lifecycle ${site.family} ${site.base}`,r);}finally{await page.close();}}
});
test('copied directory themes retain keyboard focus and pass selected automated accessibility checks',async()=>{
 for(const site of sites.filter(s=>s.base==='/help/')){const page=await browser.newPage({viewport:{width:320,height:900},colorScheme:'dark',reducedMotion:'reduce'});try{await page.goto(site.origin+site.base);await enable(page,site);await page.locator('html').evaluate(n=>n.dir='rtl');await page.locator('summary').click();await input(page).focus();assert.ok(await input(page).evaluate(n=>getComputedStyle(n).outlineStyle!=='none'));await page.addScriptTag({content:axe.source});assert.deepEqual(await page.evaluate(async()=> (await axe.run(document.querySelector('main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}})).violations),[]);await page.emulateMedia({forcedColors:'active'});assert.equal(await page.evaluate(()=>matchMedia('(forced-colors: active)').matches),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);record(`copied dark/RTL/axe ${site.family}`,{width:320,violations:0,actualZoom:false});}finally{await page.close();}}
});

test('authored feedback callbacks can destroy during loading/ready or retry a failed attempt without reviving older UI',async()=>{
 for(const site of sites.filter(s=>s.base==='/help/')){const page=await browser.newPage();try{await page.goto(site.origin+site.base);await enable(page,site);const results=await page.evaluate(async base=>{
  const api=await import(base+'probe.mjs'),native=Object.getOwnPropertyDescriptor(Node.prototype,'textContent'),out=[];
  for(const mode of ['loading','ready','retry']){
   const host=document.createElement('section');document.body.append(host);host.innerHTML='<div><p>Original</p></div><p></p><button>Enable</button>';const root=host.children[0],status=host.children[1],retry=host.children[2],original=root.firstChild;
   let instance,closing,next,loads=0,disposed=0,once=true;
   Object.defineProperty(status,'textContent',{get(){return native.get.call(this);},set(value){native.set.call(this,value);if(!instance||!once)return;
    if(mode==='loading'&&value.startsWith('Loading directory.')){once=false;closing=instance.destroy();}
    else if(mode==='ready'&&value==='Directory is ready.'){once=false;closing=instance.destroy();}
    else if(mode==='retry'&&value.startsWith('Directory could not load.')){once=false;next=instance.start();}
   }});
   instance=api.createDirectorySearch({root,status,retry,urlState:false,load:async()=>{loads++;if(mode==='retry'&&loads===1)throw Error('first attempt');const engine=api.createRaveldex(api.configuration());await engine.add({id:'real',text:{title:'walking resource',body:'genuine native data'},metadata:{format:'guide',topics:['planning']}});return{engine,documents:[{id:'real',title:'Real resource',url:location.origin+base}],dispose:async()=>{disposed++;await engine.dispose();}};}});
   await instance.start();await next;if(mode==='retry'){if(root.querySelectorAll('.raveldex-directory').length!==1)throw Error('new retry lost');closing=instance.destroy();}await closing;
   out.push({mode,loads,disposed,authored:root.firstChild===original,closed:status.textContent==='Directory is closed. Browse the resources below.'});host.remove();
  }return out;
 },site.base);assert.deepEqual(results,[{mode:'loading',loads:0,disposed:0,authored:true,closed:true},{mode:'ready',loads:1,disposed:1,authored:true,closed:true},{mode:'retry',loads:2,disposed:1,authored:true,closed:true}]);record(`feedback reentry ${site.family}`,results);}finally{await page.close();}}
});
test('Astro source/display integrity failures and wrong builds retain browse links and retry a fresh loader',async()=>{
 const site=sites.find(s=>s.family==='astro'&&s.base==='/help/'),manifest=JSON.parse(await readFile(join(site.directory,'dist/raveldex/manifest.json'),'utf8'));
 for(const kind of ['source','documents','build']){const page=await browser.newPage();try{const asset=kind==='build'?'manifest.json':manifest.assets[kind].file,pattern='**/raveldex/'+asset;
  await page.route(pattern,route=>route.fulfill({status:200,contentType:'application/json',body:kind==='build'?JSON.stringify({...manifest,buildId:'wrong-generation'}):'{}'}));await page.goto(site.origin+site.base);await page.getByRole('button',{name:'Enable directory',exact:true}).click();await page.getByRole('button',{name:'Retry loading directory',exact:true}).waitFor();assert.equal(await page.locator('.raveldex-directory').count(),0);assert.equal(await page.getByRole('navigation',{name:'Browse all resources'}).getByRole('link').count(),7);
  await page.unroute(pattern);await page.getByRole('button',{name:'Retry loading directory',exact:true}).click();await ready(page);record(`Astro refused ${kind}/retry`,{partialUI:0,retried:true});
 }finally{await page.close();}}
});
test('pagehide/persisted-pageshow and injected History refusal recover without stale UI or another data fetch',async()=>{
 for(const site of sites.filter(s=>s.base==='/help/')){const page=await browser.newPage();let loads=0;page.on('request',request=>{if(request.url().endsWith(site.family==='browser'?'/content.json':'/raveldex/manifest.json'))loads++;});try{
  await page.goto(site.origin+site.base);await enable(page,site);await page.evaluate(()=>{window.savedPush=history.pushState;history.pushState=()=>{throw new DOMException('test refusal','SecurityError');};});
  await query(page,'riverside');await page.getByText('Search works, but the address could not be updated. Try updating the search link.',{exact:true}).waitFor();const before=loads;await page.evaluate(()=>{history.pushState=window.savedPush;});await page.getByRole('button',{name:'Update search link',exact:true}).click();assert.equal(new URL(page.url()).searchParams.get('q'),'riverside');assert.equal(loads,before);assert.deepEqual(await ids(page),['maps']);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await page.getByText('Directory is closed. Browse the resources below.',{exact:true}).waitFor();assert.equal(await page.locator('.raveldex-directory').count(),0);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));if(site.family==='astro'){await page.getByRole('button',{name:'Enable directory',exact:true}).waitFor();await page.getByRole('button',{name:'Enable directory',exact:true}).click();}await ready(page);assert.equal(await page.locator('.raveldex-directory').count(),1);assert.equal(await input(page).inputValue(),'riverside');record(`page lifecycle/History refusal ${site.family}`,{injectedRefusal:true,extraFetchForURLRetry:0,scriptedPageTransitions:true,restoredText:'riverside'});
 }finally{await page.close();}}
});
