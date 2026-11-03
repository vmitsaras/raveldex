import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
import { STARTERS, starterSource, starterArchive } from '../../site/starters.mjs';
import { command, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';
import { walk } from '../../scripts/lib/pages.mjs';
import { directoryExpected } from '../oracle/directory.mjs';

test('directory gallery publishes exact complete browser/Astro projects and an installed native resource preview', {timeout:120000}, async()=>{
 const server=spawn(process.execPath,['scripts/preview-pages.mjs','--port','0'],{stdio:['ignore','pipe','pipe']});const exited=once(server,'exit');let log='',browser;server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
 try{
  const deadline=Date.now()+20000;while(!/Open http:\/\/127\.0\.0\.1:\d+\/raveldex\//.test(log)){assert.equal(server.exitCode,null,log);assert.ok(Date.now()<deadline,log);await new Promise(r=>setTimeout(r,50));}
  const base=/Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.exec(log)[1];browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('examples/directory/',base).href);assert.equal(await page.getByRole('heading',{level:1}).innerText(),'Faceted resource directory starters');
  const work=await mkdtemp(join(tmpdir(),'raveldex-directory-gallery-'));
  for(const starter of STARTERS.filter(s=>s.family==='directory')){
   for(const path of starter.files){const source=await readFile(join(REPO_ROOT,'examples',starter.id,path),'utf8'),response=await fetch(new URL(starterSource(starter.id,path),base));assert.equal(response.status,200);let actual=await response.text();if(path.endsWith('.astro'))actual=/<code>([\s\S]*?)<\/code>/.exec(actual)[1].replaceAll('&#39;',"'").replaceAll('&quot;','"').replaceAll('&gt;','>').replaceAll('&lt;','<').replaceAll('&amp;','&');assert.equal(actual,source,path);}
   const response=await fetch(new URL(starterArchive(starter.id),base));assert.equal(response.status,200);const tarball=join(work,starter.id+'.tgz'),output=join(work,starter.id);await mkdir(output);await writeFile(tarball,new Uint8Array(await response.arrayBuffer()));await command('tar',['-xzf',tarball,'--strip-components=1','-C',output]);assert.deepEqual(await walk(output),[...starter.files].sort());for(const path of starter.files)assert.deepEqual(await readFile(join(output,path)),await readFile(join(REPO_ROOT,'examples',starter.id,path)),path);
  }
  const frame=page.frameLocator('iframe[title="Resource directory starter preview"]');await frame.getByText('Directory is ready.',{exact:true}).waitFor();const input=frame.getByRole('searchbox',{name:'Search walking resources',exact:true});await input.fill('walking resource');await input.press('Enter');await frame.getByText('7 results. Showing 1–3.',{exact:true}).waitFor();
  const entries=JSON.parse(await readFile(join(REPO_ROOT,'examples/directory-browser/content.json'),'utf8')),schema={text:{title:{boost:2},body:{}},metadata:{format:{type:'string'},topics:{type:'string',multi:true}}},groups=[{field:'format'},{field:'topics'}];
  const data=entries.map(e=>({id:e.id,text:{title:e.title,body:e.body},metadata:{format:e.format,topics:e.topics}}));const query={kind:'and',children:[{kind:'text',text:'walking'},{kind:'group',variants:[{text:'resource',match:'prefix'}]}]};const expected=directoryExpected(data,schema,query,{},groups,3),all=[];
  for(let n=1;n<=3;n++){all.push(...await frame.locator('[data-raveldex-directory-result]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-raveldex-directory-result'))));if(n<3){await frame.getByRole('button',{name:'Next page',exact:true}).click();await frame.getByText(`Page ${n+1} of 3.`,{exact:true}).waitFor();}}
  assert.deepEqual(all,expected.allIDs);await input.fill('walking resource');await input.press('Enter');await frame.getByText('Page 3 of 3.',{exact:true}).waitFor();
  const before=await frame.locator('[data-raveldex-directory-result]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-raveldex-directory-result'))),recipe=await page.locator('pre[aria-label="Resource directory theme properties"] code').innerText();await input.focus();await frame.locator('body').evaluate((_,css)=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);},recipe);
  assert.ok(await input.evaluate(n=>n===document.activeElement));const styles=await frame.locator('.raveldex-directory').evaluate(n=>({accent:getComputedStyle(n.querySelector('a')).color,radius:getComputedStyle(n).borderRadius,gap:getComputedStyle(n).getPropertyValue('--raveldex-directory-gap').trim()}));assert.deepEqual(styles,{accent:'rgb(20, 91, 69)',radius:'12px',gap:'1.25rem'});assert.deepEqual(await frame.locator('[data-raveldex-directory-result]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-raveldex-directory-result'))),before);
  await frame.getByRole('button',{name:'Clear all',exact:true}).click();await frame.getByText('7 results. Showing 1–3.',{exact:true}).waitFor();await frame.locator('summary').click();await frame.getByRole('checkbox',{name:/^Guides /}).check();await frame.getByRole('checkbox',{name:/^Safety /}).check();await frame.getByText('2 results. Showing 1–2.',{exact:true}).waitFor();
  if(process.env.RAVELDEX_DIRECTORY_GALLERY_SCREENSHOT){await mkdir(dirname(process.env.RAVELDEX_DIRECTORY_GALLERY_SCREENSHOT),{recursive:true});await page.screenshot({path:process.env.RAVELDEX_DIRECTORY_GALLERY_SCREENSHOT,fullPage:true});}
  const chosen=await frame.locator('[data-raveldex-directory-result]').first().getAttribute('data-raveldex-directory-result'),expectedDestination=entries.find(e=>e.id===chosen);assert.ok(expectedDestination);
  const link=frame.locator('[data-raveldex-directory-result-link]').first(),destination=await link.getAttribute('href'),preview=page.frames().find(f=>f.parentFrame()===page.mainFrame());assert.ok(preview);
  await Promise.all([preview.waitForURL(destination),link.click()]);await preview.getByRole('heading',{level:1,name:expectedDestination.title,exact:true}).waitFor();assert.equal(await preview.getByRole('heading',{level:1}).innerText(),expectedDestination.title);assert.deepEqual(errors,[]);
  const noJS=await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:850}});const fallback=await noJS.newPage();await fallback.goto(new URL('examples/directory-preview/',base).href);assert.equal(await fallback.getByRole('navigation',{name:'Browse all resources'}).getByRole('link').count(),7);assert.equal(await fallback.locator('.raveldex-directory').count(),0);assert.equal(await fallback.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await noJS.close();
  console.log(JSON.stringify({status:'Pass',browser:browser.version(),completeProjects:2,sourceFiles:STARTERS.filter(s=>s.family==='directory').reduce((sum,s)=>sum+s.files.length,0),nativeIDs:all,styles,scope:'Installed gallery/downloads, scripted focus and 320px no-JS viewport. Not human AT, physical input or actual browser zoom.'}));
 }finally{await browser?.close();if(server.exitCode===null&&server.signalCode===null)server.kill('SIGTERM');await exited;}
});
