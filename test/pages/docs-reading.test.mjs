import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {buildUsageCorpus} from '../../examples/docs-search/usage-corpus.mjs';
const baseline=JSON.parse(await readFile(new URL('../../docs/evidence/RX-9907/baseline.json',import.meta.url),'utf8'));
let server,exited,browser,base;
before(async()=>{
 server=spawn(process.execPath,['scripts/preview-pages.mjs','--port','0'],{stdio:['ignore','pipe','pipe']});exited=once(server,'exit');let log='';server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
 const deadline=Date.now()+20000;while(!/Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.test(log)){assert.equal(server.exitCode,null,log);assert.ok(Date.now()<deadline,log);await new Promise(r=>setTimeout(r,50));}
 base=/Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.exec(log)[1];browser=await chromium.launch({channel:'chrome'});console.log(`Reading: ${browser.version()} / ${process.version} / ${process.platform} ${process.arch}`);
});
after(async()=>{await browser?.close();server?.kill('SIGTERM');await exited;});
async function open(route,options={}){const p=await browser.newPage(options);p.setDefaultTimeout(5000);await p.goto(new URL(route+'/',base).href);return p;}
const fences=md=>[...md.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map(m=>m[1]);

// Removing contextual targets or the task path must fail actual keyboard navigation.
test('guide outline targets real preserved headings',async()=>{
 const page=await open('guide/overview',{viewport:{width:1600,height:1000}});try{
  assert.equal(await page.locator('main').getAttribute('data-reading-layout'),'guide');
  assert.equal(await page.locator('[data-reading-steps] li').count(),4);
  for(const route of Object.keys(baseline.anchors)){
   await page.goto(new URL(route+'/',base).href);
   if(process.env.RAVELDEX_READING_CAPTURES){await mkdir(process.env.RAVELDEX_READING_CAPTURES,{recursive:true});const name=route.replaceAll('/','-');await page.screenshot({path:`${process.env.RAVELDEX_READING_CAPTURES}/${name}-1600.png`});await page.setViewportSize({width:320,height:800});await page.screenshot({path:`${process.env.RAVELDEX_READING_CAPTURES}/${name}-320.png`});await page.setViewportSize({width:1600,height:1000});}
   for(const id of baseline.anchors[route])assert.equal(await page.locator(`[id="${id}"]`).count(),1,id);
   const links=page.getByRole('navigation',{name:'On this page',exact:true}).getByRole('link');assert.ok(await links.count()>=4);
   for(const link of await links.all()){
    const href=await link.getAttribute('href');const target=page.locator(`main [id="${decodeURIComponent(href.slice(1))}"]`);assert.equal(await target.count(),1);
    await link.focus();await link.press('Enter');assert.equal(new URL(page.url()).hash,href);const positions=await page.evaluate(async id=>{const values=[];for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);values.push(document.getElementById(id).getBoundingClientRect().y);}return values;},decodeURIComponent(href.slice(1)));assert.ok(positions.slice(-3).every(y=>y>=0&&y<1000),route+href+JSON.stringify(positions));
   }
  }
  await page.goto(new URL('reference/hosts/',base).href);assert.equal(await page.locator('[data-reading-steps] li').count(),4);
  await page.locator('[data-reading-steps]').getByRole('link',{name:'Try an interface',exact:true}).click();await page.waitForURL('**/examples/');assert.equal(await page.locator('[data-solution-gallery] > li:not(.examples-gallery__live)').count(),5);
 }finally{await page.close();}
});

// Rendered grouping cannot drop source signatures, defaults, failures or code.
test('reference retains signatures defaults failures and examples',async()=>{
 const page=await open('reference/core',{viewport:{width:1600,height:1000}});try{
  assert.equal(await page.locator('main').getAttribute('data-reading-layout'),'reference');
  for(const name of ['Create an engine','Parameters and defaults','Minimal use','Signatures','Returns','Options and defaults','Failures and recovery','Related recipes'])assert.ok(await page.getByRole('heading',{name,exact:true}).count()>=1,name);
  const text=await page.locator('main').innerText();for(const fact of ['createRaveldex(configuration: Configuration): Raveldex','Promise<SearchResult>','ID_EXISTS','ID_NOT_FOUND','min(20, maxHits, maxDocuments - offset)','min(30_000, maxDeadlineMs)','DISPOSED','original UTF-16 span'])assert.ok(text.includes(fact),fact);
  for(const route of ['guide/overview','reference/hosts','reference/core']){
   await page.goto(new URL(route+'/',base).href);const source=route==='guide/overview'?'GETTING_STARTED':route==='reference/hosts'?'HOSTS':'CORE';const md=await readFile(new URL(`../../docs/api/${source}.md`,import.meta.url),'utf8');const rendered=await page.locator('main pre code').allTextContents();for(const code of fences(md))assert.ok(rendered.includes(code),source+' exact fence');
  }
 }finally{await page.close();}
});

// Labels, highlighting and copied text have independent expectations from original fences.
test('reading code copies literal snippets and recovers from denied clipboard',async()=>{
 const page=await open('guide/overview');try{
  await page.evaluate(()=>{window.copies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copies.push(text)}});});
  const blocks=page.locator('main [data-code-panel]');assert.ok(await blocks.count()>0);
  const original=fences(await readFile(new URL('../../docs/api/GETTING_STARTED.md',import.meta.url),'utf8'));
  for(let i=0;i<await blocks.count();i++){
   const block=blocks.nth(i);assert.ok((await block.locator('figcaption').innerText()).length>0);assert.ok(await block.locator('pre code span[style]').count()>0);
   assert.equal(await block.locator('pre code').textContent(),original[i]);await block.locator('[data-copy-code]').click();assert.equal(await page.evaluate(()=>window.copies.pop()),original[i]);assert.match(await block.getByRole('status').innerText(),/Copied/);
  }
  const block=blocks.first();await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}}));await block.locator('[data-copy-code]').click();await page.waitForFunction(()=>document.querySelector('main [data-copy-status]').textContent.includes('unavailable'));await block.locator('[data-select-code]').click();const field=block.getByRole('textbox',{name:'Selected source',exact:true});assert.equal(await field.evaluate(n=>n.value.slice(n.selectionStart,n.selectionEnd)),original[0]);assert.equal(await field.evaluate(n=>n===document.activeElement&&n.readOnly),true);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(r=>window.finishCopy=r)}}));await block.locator('[data-copy-code]').click();await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide'));window.finishCopy();});assert.doesNotMatch(await block.locator('[data-copy-status]').textContent(),/Copied/);await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));assert.equal(await block.locator('[data-copy-code]').isVisible(),true);
 }finally{await page.close();}
});

test('long code and tables do not force page overflow',async()=>{
 for(const route of ['guide/overview','reference/hosts','reference/core']){
  const page=await open(route,{viewport:{width:320,height:800}});try{
   assert.equal(await page.locator('main').getAttribute('data-reading-layout'),route==='guide/overview'?'guide':'reference');
   await page.locator('main').evaluate(n=>{n.querySelector('pre code').append(document.createTextNode('long_unbroken_example'.repeat(120)));const cell=n.querySelector('td');if(cell)cell.textContent='long_unbroken_parameter'.repeat(80);});
   for(const font of ['100%','200%']){
    await page.locator('html').evaluate((n,font)=>n.style.fontSize=font,font);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
    const pre=page.locator('main pre').first();assert.ok(await pre.evaluate(n=>n.scrollWidth>n.clientWidth));await pre.focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.activeElement.scrollLeft>0);assert.notEqual(await pre.evaluate(n=>getComputedStyle(n).outlineStyle),'none');
    const table=page.locator('main table').first();if(await table.count()){assert.ok(await table.evaluate(n=>parseFloat(getComputedStyle(n.querySelector('td')).minInlineSize)<160));assert.ok(await page.getByRole('table').count()>0);}
   }
   await page.addScriptTag({content:await readFile(new URL('../../node_modules/axe-core/axe.min.js',import.meta.url),'utf8')});assert.deepEqual(await page.evaluate(async()=>(await axe.run({runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations),[]);
  }finally{await page.close();}
 }
});

test('reading layouts retain no-JavaScript code navigation and complete contracts',async()=>{
 for(const route of ['guide/overview','reference/hosts','reference/core']){
  const page=await open(route,{javaScriptEnabled:false,viewport:{width:320,height:800}});try{
   assert.ok(await page.locator('main [data-code-panel]').count()>0);assert.equal(await page.locator('main [data-copy-code]:visible').count(),0);assert.ok(await page.locator('main pre code').first().isVisible());assert.ok(await page.getByRole('table').count()>0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
   const summary=page.locator('[data-site-section] summary');await summary.focus();await summary.press('Enter');assert.equal(await page.locator('[data-site-section] nav').isVisible(),false);await summary.press('Enter');assert.equal(await page.locator('[data-site-section] nav').isVisible(),true);
  }finally{await page.close();}
 }
});

test('reading presentation preserves the five-guide indexed bodies and original offsets',()=>{
 assert.deepEqual(buildUsageCorpus(),baseline.usage);
});

// Highlighting HTML must not turn the sample search root into active markup.
test('reading HTML remains literal and copies without caption text',async()=>{
 const page=await open('reference/hosts');try{
  await page.evaluate(()=>{window.copies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copies.push(text)}});});
  const expected='<section id="search" class="help-search" aria-label="Documentation search"></section>\n';const block=page.locator('main [data-code-panel]').filter({has:page.locator('pre code').filter({hasText:'class="help-search"'})}).first();
  assert.equal(await block.locator('pre code').textContent(),expected);assert.equal(await block.locator('section,script').count(),0);await block.locator('[data-copy-code]').click();assert.equal(await page.evaluate(()=>window.copies.pop()),expected);
 }finally{await page.close();}
});

// A real comparison table needs readable columns and a working local scroll region.
test('dense reading tables keep usable word widths and keyboard scrolling',async()=>{
 const page=await open('reference/hosts',{viewport:{width:320,height:800}});try{
  const table=page.locator('main table').filter({hasText:'Filters and exact counts'});assert.equal(await table.count(),1);
  for(const font of ['100%','200%']){
   await page.locator('html').evaluate((n,v)=>n.style.fontSize=v,font);
   const metrics=await table.evaluate(n=>{const cells=[...n.querySelector('tbody tr').cells],s=getComputedStyle(cells[1]),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=s.font;return{scroll:n.scrollWidth>n.clientWidth,row:n.querySelector('tbody tr').getBoundingClientRect().height,line:parseFloat(s.lineHeight),word:ctx.measureText('selected').width,widths:cells.slice(1).map(c=>{const s=getComputedStyle(c);return c.getBoundingClientRect().width-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight);})};});
   assert.ok(metrics.scroll,JSON.stringify(metrics));assert.ok(metrics.row<=metrics.line*20,JSON.stringify(metrics));assert.ok(metrics.widths.every(w=>w>=metrics.word),JSON.stringify(metrics));
   await table.evaluate(n=>n.scrollLeft=0);await table.focus();await table.press('ArrowRight');await page.waitForFunction(()=>[...document.querySelectorAll('main table')].some(n=>n.scrollLeft>0),null,{timeout:5000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
  }
 }finally{await page.close();}
});

// Older clipboard completions must not overwrite a more recent success or recovery.
test('reading copy feedback belongs to the latest attempt per panel',async()=>{
 const page=await open('reference/hosts');try{
  await page.evaluate(()=>{window.writes=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise((resolve,reject)=>window.writes.push({resolve,reject}))}});});
  const panel=page.locator('main [data-code-panel]').first(),button=panel.locator('[data-copy-code]'),status=panel.locator('[data-copy-status]');
  await button.click();await button.click();await page.evaluate(()=>window.writes[1].reject(Error('new denied')));await page.waitForFunction(()=>document.querySelector('main [data-copy-status]').textContent.includes('unavailable'));
  await page.evaluate(async()=>{window.writes[0].resolve();await new Promise(requestAnimationFrame);});assert.match(await status.textContent(),/unavailable/);
  await button.click();await button.click();await page.evaluate(()=>window.writes[3].resolve());await page.waitForFunction(()=>document.querySelector('main [data-copy-status]').textContent.includes('Copied'));
  await page.evaluate(async()=>{window.writes[2].reject(Error('old denied'));await new Promise(requestAnimationFrame);});assert.match(await status.textContent(),/Copied/);
  const other=page.locator('main [data-code-panel]').nth(1);await button.click();await other.locator('[data-copy-code]').click();await page.evaluate(async()=>{window.writes[4].resolve();window.writes[5].resolve();await new Promise(requestAnimationFrame);});assert.match(await status.textContent(),/Copied/);assert.match(await other.locator('[data-copy-status]').textContent(),/Copied/);
 }finally{await page.close();}
});
