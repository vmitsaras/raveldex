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
import { STARTERS } from '../../site/starters.mjs';
import { directoryExpected } from '../oracle/directory.mjs';
let consumer,browser,linkTraversal;const sites=[];
const selected=process.env.RAVELDEX_CARDS_STARTER_BROWSER??process.env.RAVELDEX_UI_BROWSER??'chrome';
const report={kind:'raveldex-installed-cards-starter-v1',observations:[],environment:{node:process.version,platform:process.platform,arch:process.arch,selected},scope:'Exact copied project, physical offline package/tool installations, root/help builds, real native data/history and scripted image/control/lifecycle checks; emulated layout/media. No human AT, physical input, actual zoom/Safari/device/release claim.'};
const record=(name,details)=>report.observations.push({name,status:'Pass',details});
async function nativeLinkTraversal() {
 const page=await browser.newPage();
 try {
  await page.setContent('<!doctype html><html lang="en"><head><title>Native two-link baseline</title></head><body><a id="native-first" href="#first">First</a> <a id="native-second" href="#second">Second</a></body></html>');
  const active=()=>page.evaluate(()=>document.activeElement.id||document.activeElement.tagName);
  await page.locator('#native-first').focus();await page.keyboard.press('Tab');const plainTabTarget=await active();
  let altTabTarget=null,forward='Tab',reverse='Shift+Tab';
  if(plainTabTarget!=='native-second') {
   await page.locator('#native-first').focus();await page.keyboard.press('Alt+Tab');altTabTarget=await active();
   assert.equal(altTabTarget,'native-second','Native browser baseline must establish its link traversal chord');forward='Alt+Tab';reverse='Alt+Shift+Tab';
  }
  await page.keyboard.press(reverse);const reverseTarget=await active();assert.equal(reverseTarget,'native-first','Native baseline must also establish reverse link traversal');
  return {plainTabTarget,altTabTarget,forward,reverse,reverseTarget,preferencesChanged:false,scope:'Actual keyboard traversal on an unstyled two-anchor page establishes the native browser policy; no browser preference or application key handler changes. This is scripted browser evidence, not human keyboard or AT qualification.'};
 } finally {await page.close();}
}

async function serve(root,base){const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://local').pathname;if(!p.startsWith(base))throw Error();let path=decodeURIComponent(p.slice(base.length));if(path.split('/').includes('..'))throw Error();if(!path||path.endsWith('/'))path+='index.html';const bytes=await readFile(join(root,path));res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]??'application/octet-stream');res.end(bytes);}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));return{origin:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(r=>{server.closeAllConnections();server.close(r);})};}
const input=p=>p.getByRole('searchbox',{name:'Search walking resources',exact:true});
const ids=p=>p.locator('[data-raveldex-directory-result]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-raveldex-directory-result')));
async function ready(p){await p.getByText('Directory is ready.',{exact:true}).waitFor();await p.waitForFunction(()=>document.querySelector('.raveldex-directory')?.dataset.state==='ready');}
async function query(p,text){await input(p).fill(text);await input(p).press('Enter');await p.waitForFunction(()=>document.querySelector('.raveldex-directory')?.dataset.state==='ready');}
const schema={text:{title:{boost:2},body:{}},metadata:{format:{type:'string'},topics:{type:'string',multi:true}}},groups=[{field:'format',values:['guide','checklist','tool']},{field:'topics',values:['planning','safety','access','nature','water']}];
function expected(site,query,filters={},page=1){return directoryExpected(site.entries.map(e=>({id:e.id,text:{title:e.title,body:e.body},metadata:{format:e.format,topics:e.topics}})),schema,query,filters,groups,3,page);}
before(async()=>{
 assert.ok(['chrome','chromium','webkit'].includes(selected));consumer=await prepareConsumer([],[]);report.package=consumer.package;report.consumer={directory:consumer.directory,installed:consumer.installed};
 const cache=join(consumer.directory,'starter-cache');report.cache=await seedStarterCache(cache);const inventory=STARTERS.find(s=>s.id==='cards-browser');assert.ok(inventory);
 for(const base of ['/','/help/']){
  const directory=join(consumer.directory,'cards-browser-'+(base==='/'?'root':'help'));await cp(join(REPO_ROOT,'examples/cards-browser'),directory,{recursive:true,filter:p=>!/(?:^|\/)dist(?:\/|$)|build-meta\.json$|node_modules/.test(p)});
  const entries=JSON.parse(await readFile(join(directory,'content.json'),'utf8'));entries[0].title='Plan a riverside walking trip — an accessible route guide';entries[0].body+=' Riverside paths are part of this walking resource.';entries[0].excerpt='A changed riverside excerpt from the copied projection.';await writeFile(join(directory,'content.json'),JSON.stringify(entries,null,2)+'\n');
  const css=await readFile(join(directory,'theme.css'),'utf8');assert.ok(css.includes('--raveldex-directory-card-gap: 1rem;'));await writeFile(join(directory,'theme.css'),css.replace('--raveldex-directory-card-gap: 1rem;','--raveldex-directory-card-gap: 1.25rem;'));
  await command('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--cache',cache,join(consumer.directory,consumer.packed.filename)],directory);
  for(const pkg of ['@vmitsaras/raveldex','esbuild'])assert.equal(await realpath(join(directory,'node_modules',pkg)),join(directory,'node_modules',pkg));
  const built=await command('env',[`RAVELDEX_CARDS_BASE=${base}`,'npm','run','build','--cache',cache],directory);await writeFile(join(directory,'verification-build.log'),built.stdout+built.stderr);
  await writeFile(join(directory,'probe-entry.mjs'),"export {configuration} from './configuration.mjs';export {createCardSearch} from './controller.mjs';export {loadResources} from './load.mjs';export {createRaveldex} from '@vmitsaras/raveldex';");
  const graph=await build({absWorkingDir:directory,entryPoints:['probe-entry.mjs'],outfile:'dist/probe.mjs',bundle:true,platform:'browser',format:'esm',target:'es2022',metafile:true,logLevel:'silent'});const inputs=Object.keys(graph.metafile.inputs);assert.ok(inputs.some(p=>p.endsWith('/addons/ui/directory-cards.js')));assert.ok(inputs.every(p=>!p.includes('/addons/snippets/')&&!p.includes('/addons/sections/')));
  const server=await serve(join(directory,'dist'),base),sourceSHA256=Object.fromEntries(await Promise.all(inventory.files.map(async p=>[p,digest(await readFile(join(REPO_ROOT,'examples/cards-browser',p)))])));sites.push({...server,base,directory,entries});record('copied build '+base,{base,directory,sourceSHA256,inputs,changedTitle:entries[0].title,changedExcerpt:entries[0].excerpt,changedCardGap:'1.25rem'});
 }
 browser=selected==='webkit'?await webkit.launch({headless:true}):await chromium.launch({...(selected==='chrome'?{channel:'chrome'}:{}),headless:true});report.environment.browser=browser.version();linkTraversal=await nativeLinkTraversal();report.nativeLinkTraversal=linkTraversal;
},{timeout:120000});
after(async()=>{await browser?.close();for(const s of sites)await s.close();if(process.env.RAVELDEX_CARDS_STARTER_REPORT){const p=resolve(process.env.RAVELDEX_CARDS_STARTER_REPORT);await mkdir(dirname(p),{recursive:true});await writeFile(p,JSON.stringify(report,null,2)+'\n');}});

test('copied rich-results projects preserve independent native pages and edited projection at root/help',async()=>{
 for(const site of sites){const page=await browser.newPage();try{await page.goto(site.origin+site.base);await ready(page);await query(page,'walking resource');const all=[];
  const q={kind:'and',children:[{kind:'text',text:'walking'},{kind:'group',variants:[{text:'resource',match:'prefix'}]}]};
  for(let n=1;n<=3;n++){const e=expected(site,q,{},n);assert.deepEqual(await ids(page),e.hits.map(h=>h.id));all.push(...await ids(page));const url=page.url(),before=await ids(page),status=await page.locator('[data-raveldex-directory-status]').innerText();
   for(const layout of ['grid','cards','list']){await page.getByLabel('Layout',{exact:true}).selectOption(layout);await page.getByLabel('Density',{exact:true}).selectOption('compact');assert.deepEqual(await ids(page),before);assert.equal(page.url(),url);assert.equal(await page.locator('[data-raveldex-directory-status]').innerText(),status);assert.equal(await page.locator('[role=grid]').count(),0);}
   if(n<3){await page.getByRole('button',{name:'Next page',exact:true}).click();await page.getByText(`Page ${n+1} of 3.`,{exact:true}).waitFor();}
  }
  assert.deepEqual(all,expected(site,q).allIDs);await query(page,'riverside');assert.deepEqual(await ids(page),['maps']);await page.getByText(site.entries[0].excerpt,{exact:true}).waitFor();assert.equal(await page.locator('.raveldex-directory').evaluate(n=>getComputedStyle(n).getPropertyValue('--raveldex-directory-card-gap').trim()),'1.25rem');await page.locator('[data-raveldex-directory-result-link]').click();await page.waitForURL('**'+site.base+'resources/maps/');assert.equal(await page.getByRole('heading',{level:1}).innerText(),site.entries[0].title);record('native pages/projection/destination '+site.base,{ids:all,total:7,allLayouts:true,destination:new URL(page.url()).pathname});
 }finally{await page.close();}}
});
test('local images request only after opt-in and broken image leaves safe metadata and native navigation',async()=>{
 for(const site of sites){const page=await browser.newPage(),requests=[];page.on('request',r=>{if(new URL(r.url()).pathname.includes('/images/'))requests.push(new URL(r.url()).pathname);});try{
  await page.goto(site.origin+site.base);await ready(page);await query(page,'riverside');assert.equal(await page.locator('[data-directory-root] img').count(),0);assert.deepEqual(requests,[]);await page.getByLabel('Layout',{exact:true}).selectOption('grid');assert.deepEqual(requests,[]);
  await page.getByRole('checkbox',{name:'Show images',exact:true}).check();await page.waitForFunction(()=>{const i=document.querySelector('[data-directory-root] img');return i?.complete&&i.naturalWidth>0;});assert.deepEqual(requests,[site.base+'images/map.svg']);const image=page.locator('[data-directory-root] img');assert.equal(await image.getAttribute('alt'),site.entries[0].image.alt);assert.equal(await image.getAttribute('width'),'640');assert.equal(await image.getAttribute('height'),'360');assert.equal(await image.getAttribute('referrerpolicy'),'no-referrer');
  await page.getByRole('checkbox',{name:'Show images',exact:true}).uncheck();assert.equal(await image.count(),0);const before=requests.length;await query(page,'litter');assert.deepEqual(await ids(page),['care']);assert.equal(requests.length,before);const missing=page.waitForResponse(response=>response.url().endsWith('/images/unavailable.svg'));await page.getByRole('checkbox',{name:'Show images',exact:true}).check();assert.equal((await missing).status(),404);await page.locator('[data-raveldex-directory-card-image-unavailable]').waitFor();assert.equal(requests.filter(path=>path.endsWith('unavailable.svg')).length,1);assert.equal(await page.locator('[data-raveldex-directory-result-link]').innerText(),site.entries.find(e=>e.id==='care').title);assert.ok((await page.locator('[data-directory-root]').innerText()).includes('Leave gates, paths and communities'));record('explicit local image boundary '+site.base,{requests,initialRequests:0,brokenImageAutomaticRetries:0,titleRetained:true});
 }finally{await page.close();}}
});
test('copied rich controls keep filter/history state, keyboard order and narrow media usability',async()=>{
 for(const site of sites){const page=await browser.newPage({viewport:{width:320,height:950}});try{await page.goto(site.origin+site.base+'?unrelated=a%20b#keep');await ready(page);await page.locator('summary').click();await page.getByRole('checkbox',{name:/^Guides /}).check();await page.getByText('3 results. Showing 1–3.',{exact:true}).waitFor();const before=await ids(page),url=page.url();await page.getByLabel('Layout',{exact:true}).selectOption('grid');await page.getByLabel('Density',{exact:true}).selectOption('compact');assert.deepEqual(await ids(page),before);assert.equal(page.url(),url);
  await page.getByRole('checkbox',{name:/^Safety /}).check();await page.getByText('2 results. Showing 1–2.',{exact:true}).waitFor();await page.goBack();await page.getByText('3 results. Showing 1–3.',{exact:true}).waitFor();assert.deepEqual(await ids(page),before);await page.goForward();await page.getByText('2 results. Showing 1–2.',{exact:true}).waitFor();
  await page.locator('html').evaluate(n=>n.dir='rtl');await page.emulateMedia({colorScheme:'dark',forcedColors:'active',reducedMotion:'reduce'});assert.equal(await page.evaluate(()=>matchMedia('(forced-colors: active)').matches),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.locator('[data-raveldex-directory-result-link]').first().focus();await page.keyboard.press(linkTraversal.forward);assert.ok(await page.locator('[data-raveldex-directory-result-link]').nth(1).evaluate(n=>n===document.activeElement));await page.keyboard.press(linkTraversal.reverse);assert.ok(await page.locator('[data-raveldex-directory-result-link]').first().evaluate(n=>n===document.activeElement&&getComputedStyle(n).outlineStyle!=='none'));await page.addScriptTag({content:axe.source});assert.deepEqual(await page.evaluate(async()=> (await axe.run(document.querySelector('main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}})).violations),[]);record('filter/history/media '+site.base,{before,filtered:await ids(page),width:320,violations:0,actualZoom:false,nativeKeyboardTraversal:linkTraversal});
 }finally{await page.close();}}
});
test('complete project has no-JavaScript routes, genuine initial Retry and late-owned disposal',async()=>{
 for(const site of sites){const context=await browser.newContext({javaScriptEnabled:false});const fallback=await context.newPage();try{await fallback.goto(site.origin+site.base);const links=fallback.getByRole('navigation',{name:'Browse all resources'}).getByRole('link');assert.equal(await links.count(),7);await links.first().click();assert.equal(await fallback.getByRole('heading',{level:1}).innerText(),site.entries[0].title);}finally{await context.close();}
  const page=await browser.newPage();try{await page.route('**/content.json',r=>r.fulfill({status:503,body:'unavailable'}));await page.goto(site.origin+site.base);await page.getByRole('button',{name:'Retry loading directory',exact:true}).waitFor();assert.equal(await page.locator('.raveldex-directory').count(),0);assert.equal(await page.locator('[data-card-controls]').getAttribute('disabled'),'');await page.unroute('**/content.json');await page.getByRole('button',{name:'Retry loading directory',exact:true}).click();await ready(page);
   const r=await page.evaluate(async base=>{const api=await import(base+'probe.mjs'),host=document.createElement('section');document.body.append(host);host.innerHTML='<div><p>Original</p></div><p></p><button>Enable</button>';const root=host.children[0],original=root.firstChild,engine=api.createRaveldex(api.configuration());let release,loads=0,disposed=0;const gate=new Promise(r=>release=r);const app=api.createCardSearch({root,status:host.children[1],retry:host.children[2],urlState:false,load:async()=>{loads++;await gate;return{engine,documents:[],dispose:async()=>{disposed++;await engine.dispose();}};}});const a=app.start(),b=app.start();await Promise.resolve();const close=app.destroy();release();await a;await close;const answer={loads,disposed,dedup:a===b,stableClose:close===app.destroy(),authored:root.firstChild===original};host.remove();return answer;},site.base);assert.deepEqual(r,{loads:1,disposed:1,dedup:true,stableClose:true,authored:true});record('fallback/retry/disposal '+site.base,r);
  }finally{await page.close();}}
});
