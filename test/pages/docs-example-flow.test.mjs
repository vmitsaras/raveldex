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
  await page.waitForURL('**/raveldex/examples/inline-preview/');assert.equal(page.frames().length,1);assert.equal(await page.getByRole('searchbox',{name:'Search walking guides',exact:true}).isVisible(),true);
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
  assert.deepEqual(await page.evaluate(async()=> (await axe.run({runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>v.id)),[]);
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
