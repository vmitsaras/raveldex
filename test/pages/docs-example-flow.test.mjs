import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { STARTERS } from '../../site/starters.mjs';
let browser, server, exited, base;
before(async () => {
  server = spawn(process.execPath, ['scripts/preview-pages.mjs', '--port', '0'], { stdio: ['ignore','pipe','pipe'] });
  exited = once(server,'exit'); let log='';
  server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
  const deadline=Date.now()+20000;
  while(!/Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.test(log)){assert.equal(server.exitCode,null,log);assert.ok(Date.now()<deadline,log);await new Promise(r=>setTimeout(r,50));}
  base=/Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.exec(log)[1];
  browser=await chromium.launch({channel:process.env.RAVELDEX_CANDIDATE_BROWSER==='chromium'?undefined:'chrome'});
  console.log(`Example flow: ${browser.version()} / ${process.version} / ${process.platform} ${process.arch}`);
});
after(async()=>{await browser?.close();server?.kill('SIGTERM');await exited;});
async function open(options={}){const page=await browser.newPage(options);page.setDefaultTimeout(5000);await page.goto(new URL('examples/inline/',base).href);return page;}

// A platform choice must change setup only, never the real preview implementation.
test('inline keeps preview implementation separate from install platform',async()=>{
 const page=await open();try{
  assert.equal(await page.locator('[data-preview-implementation]').innerText(),'Browser starter');
  await page.getByLabel('Installation platform',{exact:true}).selectOption('inline-astro');
  assert.equal(await page.locator('[data-preview-implementation]').innerText(),'Browser starter');
  assert.equal(await page.locator('[data-starter-id="inline-astro"]').isVisible(),true);
  assert.equal(await page.locator('[data-starter-id="inline-browser"]').isVisible(),false);
  assert.match(await page.locator('[data-starter-id="inline-astro"]').innerText(),/src\/style\.css/);
  for(const id of ['copy-inline','inline-theme','inline-support'])assert.equal(await page.locator('#'+id).count(),1);
  assert.match(await page.locator('[data-install-prerequisites]').innerText(),/tarball/i);
 }finally{await page.close();}
});

// A view toggle must retain the existing frame document, input, result nodes and one content request.
test('switching views retains the same iframe and query',async()=>{
 const page=await open();try{
  const frame=page.frameLocator('iframe'), input=frame.getByRole('searchbox',{name:'Search walking guides',exact:true});
  await input.fill('walking guide');await input.press('Enter');
  await frame.locator('[data-raveldex-inline-result]').first().waitFor();
  await frame.locator('html').evaluate(n=>n.dataset.identity='retained');
  const original=await page.locator('iframe').elementHandle();
  for(let i=0;i<3;i++){
   await page.getByRole('button',{name:'Code',exact:true}).click();
   assert.equal(await page.locator('iframe').isVisible(),false);
   await page.getByLabel('Code project',{exact:true}).selectOption('inline-astro');
   await page.getByLabel('Installation platform',{exact:true}).selectOption(i%2?'inline-browser':'inline-astro');
   await page.getByRole('button',{name:'Preview',exact:true}).click();
  }
  assert.equal(await page.locator('iframe').evaluate((n,old)=>n===old,original),true);
  assert.equal(await frame.locator('html').getAttribute('data-identity'),'retained');
  assert.equal(await input.inputValue(),'walking guide');
  assert.equal(await frame.locator('[data-raveldex-inline-result]').count(),3);
  const count=await frame.locator('html').evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.endsWith('/content.json')).length);assert.equal(count,1);
  const codeButton=page.getByRole('button',{name:'Code',exact:true});await codeButton.focus();await codeButton.press('Tab');
  assert.equal(await page.locator('iframe').evaluate(n=>n===document.activeElement),true);
  assert.equal(await input.evaluate(n=>n===document.activeElement),true);
  await input.press('Shift+Tab');assert.equal(await codeButton.evaluate(n=>n===document.activeElement),true);
  const last=frame.getByRole('navigation',{name:'Browse all guides',exact:true}).getByRole('link').last();await last.focus();await last.press('Tab');
  const install=page.getByLabel('Installation platform',{exact:true});assert.equal(await install.evaluate(n=>n===document.activeElement),true);
  await install.press('Shift+Tab');assert.equal(await page.locator('iframe').evaluate(n=>n===document.activeElement),true);assert.equal(await last.evaluate(n=>n===document.activeElement),true);
  await page.getByRole('link',{name:'Open full preview',exact:true}).press('Enter');
  await page.waitForURL('**/raveldex/examples/inline-preview/');assert.equal(page.frames().length,1);await page.getByRole('searchbox',{name:'Search walking guides',exact:true}).waitFor();assert.equal(await page.getByRole('searchbox',{name:'Search walking guides',exact:true}).isVisible(),true);
 }finally{await page.close();}
});

// Real source text, including Astro frontmatter and HTML scripts, must stay literal and byte-exact.
test('source views and copy equal allowlisted bytes',async()=>{
 const page=await open();try{
  await page.evaluate(()=>{window.copies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copies.push(text)}});});
  await page.getByRole('button',{name:'Code',exact:true}).click();
  for(const starter of STARTERS.filter(s=>s.family==='inline')){
   await page.getByLabel('Code project',{exact:true}).selectOption(starter.id);
   const panels=page.locator(`[data-code-project="${starter.id}"] [data-code-panel]`);assert.equal(await panels.count(),starter.files.length);
   for(const file of starter.files){
    const panel=panels.filter({has:page.locator(`summary[data-code-file="${file}"]`)});
    await panel.locator('summary').click();
    const text=await readFile(new URL(`../../examples/${starter.id}/${file}`,import.meta.url),'utf8');
    assert.equal(await panel.locator('pre code').textContent(),text,starter.id+'/'+file);
    assert.equal(await panel.locator('script,iframe').count(),0);
    await panel.getByRole('button',{name:'Copy '+file,exact:true}).click();
    await page.waitForFunction(()=>window.copies.length>0);
    assert.equal(await page.evaluate(()=>window.copies.pop()),text);
    assert.match(await panel.getByRole('status').innerText(),/Copied/);
    await panel.locator('summary').click();
   }
  }
 }finally{await page.close();}
});

test('clipboard denial and unavailable API offer manual recovery without success',async()=>{
 const page=await open();try{
  await page.getByRole('button',{name:'Code',exact:true}).click();
  const panel=page.locator('[data-code-project="inline-browser"] [data-code-panel]').first();await panel.locator('summary').click();
  for(const denied of [true,false]){
   await page.evaluate(denied=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:denied?{writeText:async()=>{throw new DOMException('Denied','NotAllowedError');}}:undefined}),denied);
   await panel.locator('[data-copy-code]').click();
   await page.waitForFunction(()=>document.querySelector('[data-code-panel] [role="status"]').textContent.includes('manually'));
   assert.match(await panel.getByRole('status').innerText(),/Select.*manually/);assert.doesNotMatch(await panel.getByRole('status').innerText(),/Copied/);
   await panel.locator('pre').focus();assert.equal(await panel.locator('pre').evaluate(n=>n===document.activeElement),true);
   await panel.getByRole('button',{name:'Select source',exact:true}).focus();await panel.getByRole('button',{name:'Select source',exact:true}).press('Enter');
   const selected=panel.getByRole('textbox',{name:'Selected source',exact:true});
   assert.equal(await selected.evaluate(n=>n.value.slice(n.selectionStart,n.selectionEnd)),await readFile(new URL('../../examples/inline-browser/README.md',import.meta.url),'utf8'));
   assert.equal(await selected.evaluate(n=>n===document.activeElement&&n.readOnly),true);
  }
 }finally{await page.close();}
});

test('all setup content remains readable without JavaScript',async()=>{
 const page=await open({javaScriptEnabled:false,viewport:{width:320,height:800}});try{
  assert.equal(await page.getByRole('button',{name:'Code',exact:true}).isVisible(),false);
  for(const id of ['inline-browser','inline-astro']){
   assert.equal(await page.locator(`[data-starter-id="${id}"]`).isVisible(),true);
   const code=page.locator(`[data-code-project="${id}"] [data-code-panel]`).first();await code.locator('summary').click();assert.equal(await code.locator('pre').isVisible(),true);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }finally{await page.close();}
});

test('example controls clean up listeners and ignore late copy feedback across page lifecycle',async()=>{
 const page=await open({viewport:{width:320,height:800}});try{
  await page.getByRole('button',{name:'Code',exact:true}).click();
  const panel=page.locator('[data-code-panel]').first();await panel.locator('summary').click();
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(r=>window.finishCopy=r)}}));
  await panel.locator('[data-copy-code]').click();
  await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide'));window.finishCopy();});
  assert.doesNotMatch(await panel.getByRole('status').innerText(),/Copied/);
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await page.getByRole('button',{name:'Preview',exact:true}).click();await page.getByRole('button',{name:'Code',exact:true}).press('Space');
  assert.equal(await page.locator('iframe').isVisible(),false);
  await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});
  assert.notEqual(await page.getByRole('button',{name:'Code',exact:true}).evaluate(n=>getComputedStyle(n).outlineStyle),'none');
  await page.emulateMedia({forcedColors:'none'});
  await page.addScriptTag({content:await readFile(new URL('../../node_modules/axe-core/axe.min.js',import.meta.url),'utf8')});
  assert.deepEqual(await page.evaluate(async()=> (await axe.run({runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations),[]);
  if(process.env.RAVELDEX_EXAMPLE_CAPTURES){await mkdir(process.env.RAVELDEX_EXAMPLE_CAPTURES,{recursive:true});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:process.env.RAVELDEX_EXAMPLE_CAPTURES+'/inline-code-320.png',fullPage:true});await page.getByRole('button',{name:'Preview',exact:true}).click();await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:process.env.RAVELDEX_EXAMPLE_CAPTURES+'/inline-preview-1440.png',fullPage:true});}
 }finally{await page.close();}
});

test('legacy starter fragments reveal the matching installation on load and hash changes',async()=>{
 const page=await open();try{
  await page.goto(new URL('examples/inline/#starter-inline-astro',base).href);
  await page.waitForFunction(()=>document.querySelector('#install-inline').value==='inline-astro');
  assert.equal(await page.locator('#starter-inline-astro').isVisible(),true);
  await page.evaluate(()=>location.hash='starter-inline-browser');await page.waitForFunction(()=>document.querySelector('#install-inline').value==='inline-browser');
  assert.equal(await page.locator('#starter-inline-browser').isVisible(),true);
 }finally{await page.close();}
});

test('installation guidance names each projects actual tarballs fields and build identity',async()=>{
 const page=await open();try{
  const browser=page.locator('[data-starter-id="inline-browser"]');assert.match(await browser.locator('[data-package-guidance]').innerText(),/core tarball/);assert.doesNotMatch(await browser.locator('[data-package-guidance]').innerText(),/Astro tarball/);
  await page.getByLabel('Installation platform',{exact:true}).selectOption('inline-astro');
  const astro=page.locator('[data-starter-id="inline-astro"]');assert.match(await astro.locator('[data-package-guidance]').innerText(),/core and Astro tarballs/);
  const step=await astro.locator('[data-starter-steps] li').nth(2).innerText();for(const field of ['entries','slug','title','category','body','buildId','manifest'])assert.ok(step.includes(field),field);
 }finally{await page.close();}
});

// Missing family filtering would publish another starter's code or label its runtime incorrectly.
test('embedded modal explains its frame boundary',async()=>{
 const page=await open();try{
  await page.goto(new URL('examples/modal/',base).href);
  assert.equal(await page.getByRole('heading',{name:'Try modal search',exact:true}).isVisible(),true);
  assert.equal(await page.locator('[data-preview-implementation]').innerText(),'Browser starter');
  const note=page.locator('[data-preview-boundary]');assert.match(await note.innerText(),/inside.*frame/i);
  const full=page.getByRole('link',{name:'Open full preview',exact:true});assert.equal(await full.getAttribute('href'),'/raveldex/examples/modal-preview/');
  assert.match(await note.innerText(),/full preview.*whole.window/i);
  await page.getByRole('button',{name:'Code',exact:true}).click();
  assert.deepEqual(await page.locator('[data-code-project]').evaluateAll(nodes=>nodes.map(n=>n.dataset.codeProject)),['modal-browser','modal-astro']);
  await page.getByLabel('Code project',{exact:true}).selectOption('modal-astro');
  await page.getByLabel('Installation platform',{exact:true}).selectOption('modal-astro');
  const setup=page.locator('[data-starter-id="modal-astro"]');assert.match(await setup.locator('[data-starter-steps] li').nth(2).innerText(),/sections.*anchor.*heading.*text/);
  assert.doesNotMatch(await setup.locator('[data-starter-steps] li').nth(2).innerText(),/body/);
  for(const id of ['copy-modal','modal-theme','modal-support'])assert.equal(await page.locator('#'+id).count(),1);
 }finally{await page.close();}
});

// Opening a standalone preview must reach the actual starter, not a gallery re-creation.
test('dropdown full-page handoff preserves raw query',async()=>{
 const page=await open();try{
  await page.goto(new URL('examples/dropdown/',base).href);
  assert.equal(await page.locator('[data-preview-implementation]').innerText(),'Browser starter');
  await page.getByRole('button',{name:'Code',exact:true}).click();
  assert.deepEqual(await page.locator('[data-code-project]').evaluateAll(nodes=>nodes.map(n=>n.dataset.codeProject)),['dropdown-browser']);
  assert.deepEqual(await page.getByLabel('Installation platform',{exact:true}).locator('option').evaluateAll(nodes=>nodes.map(n=>n.value)),['dropdown-browser']);
  assert.match(await page.locator('[data-install-prerequisites]').innerText(),/Popover/);
  assert.doesNotMatch(await page.locator('[data-install-prerequisites]').innerText(),/Snippets require|Astro also/);
  await page.getByRole('link',{name:'Open full preview',exact:true}).click();await page.waitForURL('**/examples/dropdown-preview/');
  const raw='  walking   gui  ',input=page.locator('[data-raveldex-dropdown-input]');
  await input.fill(raw);await input.press('Enter');await page.locator('[data-raveldex-dropdown-result]').nth(2).waitFor();
  await input.press('ArrowDown');assert.ok(await input.getAttribute('aria-activedescendant'));
  await input.press('Escape');assert.equal(await input.getAttribute('aria-expanded'),'false');assert.equal(await input.inputValue(),raw);
  await input.press('Tab');assert.equal(await input.evaluate(n=>n!==document.activeElement),true);
  const full=page.locator('[data-raveldex-dropdown-full-results]');assert.equal(new URL(await full.getAttribute('href'),base).searchParams.get('q'),raw);
  await full.click();await page.waitForURL('**/dropdown-preview/search/**');
  await page.locator('[data-raveldex-inline-result]').first().waitFor();assert.equal(await page.locator('[data-raveldex-inline-input]').inputValue(),raw);
  await page.goto(new URL('examples/dropdown-preview/',base).href);await page.locator('[data-raveldex-dropdown-input]').fill('walking guide');await page.locator('[data-raveldex-dropdown-input]').press('Enter');await page.locator('[data-raveldex-dropdown-result]').first().waitFor();
  const field=page.locator('[data-raveldex-dropdown-input]');await field.press('ArrowDown');const selected=await field.getAttribute('aria-activedescendant');const link=page.locator(`[id="${selected}"]`);const target=new URL(await link.locator('a').getAttribute('href'),base).href;await field.press('Enter');await page.waitForURL(target);assert.equal(await page.getByRole('heading',{level:1}).count(),1);
 }finally{await page.close();}
});

for(const family of ['modal','dropdown']){
 test(`${family} shared views keep a live query and exact family source`,async()=>{
  const page=await open({viewport:{width:320,height:800}});try{
   await page.goto(new URL(`examples/${family}/`,base).href);
   const frame=page.frameLocator('iframe');if(family==='modal')await frame.getByRole('button',{name:'Search documentation',exact:true}).click();
   const input=frame.locator(family==='modal'?'[data-raveldex-inline-input]':'[data-raveldex-dropdown-input]');await input.fill(family==='modal'?'bobbin':'walking guide');await input.press('Enter');
   await frame.locator(family==='modal'?'[data-raveldex-inline-result]':'[data-raveldex-dropdown-result]').first().waitFor();
   const original=await page.locator('iframe').elementHandle();await frame.locator('html').evaluate(n=>n.dataset.identity='same');
   await page.getByRole('button',{name:'Code',exact:true}).click();
   await page.evaluate(()=>{window.copies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copies.push(text)}});});
   for(const starter of STARTERS.filter(s=>s.family===family)){
    await page.getByLabel('Code project',{exact:true}).selectOption(starter.id);await page.getByLabel('Installation platform',{exact:true}).selectOption(starter.id);
    const panels=page.locator(`[data-code-project="${starter.id}"] [data-code-panel]`);assert.equal(await panels.count(),starter.files.length);
    for(const file of starter.files){
     const panel=panels.filter({has:page.locator(`summary[data-code-file="${file}"]`)});await panel.locator('summary').click();
     const text=await readFile(new URL(`../../examples/${starter.id}/${file}`,import.meta.url),'utf8');assert.equal(await panel.locator('pre code').textContent(),text,starter.id+'/'+file);assert.equal(await panel.locator('script,iframe').count(),0);
     await panel.locator('[data-copy-code]').click();await page.waitForFunction(()=>window.copies.length>0);assert.equal(await page.evaluate(()=>window.copies.pop()),text);await panel.locator('summary').click();
    }
   }
   const panel=page.locator('[data-code-project]:visible [data-code-panel]').first();await panel.locator('summary').click();
   await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new DOMException('Denied','NotAllowedError')}}}));await panel.locator('[data-copy-code]').click();await page.waitForFunction(()=>[...document.querySelectorAll('[data-copy-status]')].some(n=>n.textContent.includes('manually')));assert.doesNotMatch(await panel.getByRole('status').innerText(),/Copied/);
   await panel.getByRole('button',{name:'Select source',exact:true}).click();const selected=panel.getByRole('textbox',{name:'Selected source',exact:true});assert.equal(await selected.evaluate(n=>n.value.slice(n.selectionStart,n.selectionEnd)),await panel.locator('pre code').textContent());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
   await page.addScriptTag({content:await readFile(new URL('../../node_modules/axe-core/axe.min.js',import.meta.url),'utf8')});assert.deepEqual(await page.evaluate(async()=> (await axe.run({runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations),[]);
   if(process.env.RAVELDEX_EXAMPLE_CAPTURES)await page.screenshot({path:`${process.env.RAVELDEX_EXAMPLE_CAPTURES}/${family}-code-320.png`,fullPage:true});
   await page.getByRole('button',{name:'Preview',exact:true}).click();assert.equal(await page.locator('iframe').evaluate((n,old)=>n===old,original),true);assert.equal(await frame.locator('html').getAttribute('data-identity'),'same');assert.equal(await input.inputValue(),family==='modal'?'bobbin':'walking guide');assert.equal(await frame.locator('html').evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.endsWith('/content.json')).length),1);
  }finally{await page.close();}
 });
 test(`${family} sources setup and old anchors work without JavaScript`,async()=>{
  const page=await open({javaScriptEnabled:false,viewport:{width:320,height:800}});try{
   await page.goto(new URL(`examples/${family}/`,base).href);for(const id of [`try-${family}`,`copy-${family}`,`${family}-theme`,`${family}-support`,...(family==='dropdown'?['dropdown-narrow']:[])])assert.equal(await page.locator('#'+id).count(),1);for(const starter of STARTERS.filter(s=>s.family===family)){
    assert.equal(await page.locator(`[data-starter-id="${starter.id}"]`).isVisible(),true);const panel=page.locator(`[data-code-project="${starter.id}"] [data-code-panel]`).first();await panel.locator('summary').click();assert.equal(await panel.locator('pre').isVisible(),true);
   }assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
  }finally{await page.close();}
 });
}

test('full-page modal cancels first load retries failure and restores its opener',async()=>{
 const page=await open();let release;try{
  let attempts=0;const held=new Promise(r=>release=r);
  await page.route('**/modal-preview/content.json',async route=>{attempts++;if(attempts===1){await held;await route.abort().catch(()=>{});}else if(attempts===2)await route.fulfill({status:503,body:'unavailable'});else await route.continue();});
  await page.goto(new URL('examples/modal-preview/',base).href);const trigger=page.getByRole('button',{name:'Search documentation',exact:true});assert.equal(attempts,0);
  const firstRequest=page.waitForRequest('**/modal-preview/content.json',{timeout:5000});await Promise.all([firstRequest,trigger.click()]);await page.waitForFunction(()=>document.querySelector('[data-search-loading]').open);await page.getByRole('button',{name:'Cancel loading search',exact:true}).click();release();await page.waitForTimeout(50);assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await trigger.evaluate(n=>n===document.activeElement),true);
  await trigger.click();await page.getByRole('button',{name:'Retry loading search',exact:true}).waitFor();assert.match(await page.locator('[data-search-status]').innerText(),/could not load/);
  await page.getByRole('button',{name:'Retry loading search',exact:true}).click();const input=page.getByRole('searchbox',{name:'Search the workshop guide',exact:true});await input.fill('bobbin');await input.press('Enter');await page.getByRole('link',{name:'Thread the machine',exact:true}).waitFor();
  await page.getByRole('button',{name:'Close search',exact:true}).click();assert.equal(await trigger.evaluate(n=>n===document.activeElement),true);await trigger.click();assert.equal(await input.inputValue(),'bobbin');assert.equal(attempts,3);
  await page.getByRole('link',{name:'Thread the machine',exact:true}).click();await page.waitForURL('**/guide/sewing/#threading-100%25');assert.equal(await page.locator('[id="threading-100%"]:target').count(),1);
 }finally{release?.();await page.close();}
});

test('dropdown without native Popover retains a working full-results form',async()=>{
 const page=await browser.newPage();try{
  await page.addInitScript(()=>{delete HTMLElement.prototype.showPopover;});
  await page.goto(new URL('examples/dropdown-preview/',base).href);const form=page.getByRole('search',{name:'Search all walking guides',exact:true});await form.waitFor();const raw='  walking   gui  ';await form.getByRole('searchbox').fill(raw);await form.getByRole('button',{name:'Search all guides',exact:true}).click();await page.waitForURL('**/dropdown-preview/search/**');assert.equal(new URL(page.url()).searchParams.get('q'),raw);await page.locator('[data-raveldex-inline-result]').first().waitFor();assert.equal(await page.locator('[data-raveldex-inline-input]').inputValue(),raw);
 }finally{await page.close();}
});
