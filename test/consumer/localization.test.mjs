import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { release } from 'node:os';
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import axe from 'axe-core';
import { prepareConsumer, REPO_ROOT, command, digest } from '../../scripts/lib/packed-consumer.mjs';
import { validateCandidateManifest } from '../../scripts/candidate-check.mjs';

const surfaces = ['inline', 'modal', 'dropdown', 'directory', 'cards'];
const isDirectory = surface => ['directory', 'cards'].includes(surface);
let consumer, browser, server, origin, german;
const report = { kind: 'raveldex-installed-consumer-localization-v1', environment: { node: process.version, platform: process.platform, arch: process.arch, release: release() }, observations: [],
  scope: 'Complete German example, explicit partial fallbacks and long synthetic RTL stress. Native installed engine and controls with scripted input/focus/remount. No translation-quality, human AT, physical-input, actual zoom or additional-engine claim.' };
const input = page => page.locator('#root input[type=search],#root input[role=combobox]');
const status = page => page.locator('#root [role=status]');
const format = (text, values) => text.replace(/\{([A-Za-z]+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
const messages = surface => isDirectory(surface) ? german.directory : surface === 'dropdown' ? german.dropdown : german.inlineWithFilters;
async function ready(page, total) {
  await page.waitForFunction(total => { const f=window.localized,call=f.state.calls.at(-1);return call?.complete&&call.total===total&&!f.root.querySelector('[aria-busy=true]'); },total);
}
async function search(page, text, total) { await input(page).focus();await page.evaluate(text=>window.localized.view().search(text),text);await ready(page,total); }
async function withSurface(surface, work) {
  const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try { await page.goto(origin+'/'+surface+'/');await page.waitForFunction(()=>window.localizedReady);await work(page);assert.deepEqual(errors,[]); }
  finally { try { assert.deepEqual(await page.evaluate(()=>window.localized.cleanup()),{restored:true,borrowedDisposals:0}); } finally {await page.close();} }
}
before(async()=>{
  consumer=await prepareConsumer([],[]);
  const module='docs/api/examples/consumer-messages.de.mjs';await copyFile(join(consumer.installed,module),join(consumer.directory,'messages.mjs'));
  german=(await import(pathToFileURL(join(consumer.directory,'messages.mjs')).href)).german;
  await copyFile(join(REPO_ROOT,'test/consumer/localization-fixture.mjs'),join(consumer.directory,'fixture-entry.mjs'));
  const built=await build({absWorkingDir:consumer.directory,entryPoints:['fixture-entry.mjs'],outfile:'fixture.mjs',bundle:true,platform:'browser',format:'esm',target:'es2022',metafile:true,logLevel:'silent'});
  report.package=consumer.package;report.consumer={directory:consumer.directory,installed:consumer.installed};report.inputs=Object.keys(built.metafile.inputs);
  assert.ok(report.inputs.every(p=>['fixture-entry.mjs','messages.mjs'].includes(p)||p.startsWith('node_modules/@vmitsaras/raveldex/dist/')));
  report.inventory=validateCandidateManifest(JSON.parse(await readFile(join(consumer.installed,'package.json'),'utf8')),consumer.package.files);
  report.sourceSHA256=Object.fromEntries(await Promise.all(['test/consumer/localization.test.mjs','test/consumer/localization-fixture.mjs',module].map(async p=>[p,digest(await readFile(join(REPO_ROOT,p)))])));
  server=createServer(async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/fixture.mjs'){res.setHeader('content-type','text/javascript');res.end(await readFile(join(consumer.directory,'fixture.mjs')));}
    else if(['inline.css','modal.css','dropdown.css','directory.css','directory-cards.css'].includes(path.split('/').at(-1))){res.setHeader('content-type','text/css');res.end(await readFile(join(consumer.installed,'dist/addons/ui',path.split('/').at(-1))));}
    else if(path==='/broken.png'){res.writeHead(404);res.end();}
    else res.end('<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lokalisierte Suche</title>'+['inline','modal','dropdown','directory','directory-cards'].map(n=>`<link rel="stylesheet" href="/${n}.css">`).join('')+'<main><h1>Suche</h1><button id="trigger">Dokumentation durchsuchen</button><section id="root" aria-label="Suche"><p>Ursprüngliche Inhalte</p></section></main><script type="module" src="/fixture.mjs"></script></html>');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true});report.environment.browser=browser.version();
},{timeout:120000});
after(async()=>{
  await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  if(process.env.RAVELDEX_LOCALIZATION_REPORT){const p=resolve(process.env.RAVELDEX_LOCALIZATION_REPORT);await mkdir(dirname(p),{recursive:true});await writeFile(p,JSON.stringify(report,null,2)+'\n');}
});

test('copied complete German bundle matches every installed message key and strict public types',async()=>{
  const inventory=[['inline','inline.d.ts','InlineUIMessages'],['inlineWithFilters','inline.d.ts','InlineUIMessages'],['modal','modal.d.ts','ModalUIMessages'],['dropdown','dropdown.d.ts','DropdownUIMessages'],['directory','directory-view-types.d.ts','DirectoryViewMessages']];
  const counts={};
  for(const [name,file,type] of inventory){
    const source=await readFile(join(consumer.installed,'dist/addons/ui',file),'utf8');
    const declaration=source.match(new RegExp(`export interface ${type} \\{([\\s\\S]*?)\\n\\}`));assert.ok(declaration,type);
    const keys=[...declaration[1].matchAll(/readonly\s+(\w+)\??:\s*string;/g)].map(m=>m[1]).sort();assert.deepEqual(Object.keys(german[name]).sort(),keys,name);counts[name]=keys.length;
    for(const text of Object.values(german[name]))assert.ok(text.trim().length&&text.length<=512&&text.isWellFormed());
  }
  await writeFile(join(consumer.directory,'tsconfig-messages.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022','DOM'],types:[],allowJs:true,checkJs:true,strict:true,noEmit:true,skipLibCheck:false},include:['messages.mjs']}));
  await command(join(REPO_ROOT,'node_modules/.bin/tsc'),['-p','tsconfig-messages.json'],consumer.directory);
  assert.equal(german.imageUnavailable,'Bild nicht verfügbar');report.observations.push({name:'complete installed message inventory and checked JS',counts,result:'Pass'});
});

for(const surface of surfaces){
  test(surface+': complete German labels, zero/one/many, capture, recovery and native focus',async()=>withSurface(surface,async page=>{
    const m=messages(surface);assert.equal(await page.evaluate(()=>window.localized.state.calls.length),0);
    assert.equal(await input(page).getAttribute('placeholder'),m.placeholder);assert.equal(await input(page).getAttribute('aria-label')??await input(page).evaluate(n=>n.labels?.[0]?.textContent.replace(n.value,'').trim()),m.label);
    await page.getByRole(surface==='dropdown'?'combobox':'searchbox',{name:m.label,exact:true}).waitFor();
    if(surface==='modal'){assert.equal(await page.getByRole('dialog',{name:german.modal.title,exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:german.modal.close,exact:true}).count(),1);}
    if(surface==='dropdown')assert.equal(await input(page).evaluate(n=>document.getElementById(n.getAttribute('aria-describedby')).textContent),m.keyboardHint);
    await page.evaluate(()=>window.localized.mutateMessages());
    await search(page,'einzeln',1);assert.equal(await status(page).textContent(),format(isDirectory(surface)?m.resultOne:m.resultsOne,{total:1,count:1,start:1,end:1}));
    assert.equal(await input(page).evaluate(n=>n===document.activeElement),true);
    await search(page,'gemeinsam',2);assert.equal(await status(page).textContent(),format(isDirectory(surface)?m.results:m.resultsMany,{total:2,count:2,start:1,end:2}));
    await search(page,'<b>fehlt</b>',0);assert.equal(await status(page).textContent(),format(m.noResults,{query:'<b>fehlt</b>'}));assert.equal(await page.locator('#root b').count(),0);
    await page.evaluate(()=>window.localized.fail());await page.evaluate(()=>window.localized.view().search('einzeln'));await page.getByText(m.error,{exact:true}).waitFor();
    const retry=page.getByRole('button',{name:m.retry,exact:true});await retry.focus();await retry.press('Enter');await ready(page,1);
    const before=await page.evaluate(()=>window.localized.state.calls.length);await page.getByRole('button',{name:m.clear,exact:true}).focus();await page.getByRole('button',{name:m.clear,exact:true}).press('Enter');
    if(isDirectory(surface)){await ready(page,3);assert.equal(await page.evaluate(()=>window.localized.state.calls.length),before+1);}
    else {assert.equal(await page.evaluate(()=>window.localized.state.calls.length),before);assert.equal(await status(page).textContent(),m.idle);}
    assert.equal(await page.getByRole('button',{name:m.clear,exact:true}).evaluate(n=>n===document.activeElement),true);
    if(surface==='cards'){await page.evaluate(()=>window.localized.view().setPresentation({images:true}));await page.getByText(german.imageUnavailable+': Bild der Ressource',{exact:true}).first().waitFor();}
    report.observations.push({surface,name:'complete German actual states',totals:[0,1,2],inertMount:true,capture:true,nativeFocus:true,result:'Pass'});
  }));

  test(surface+': partial fallback, unknown tokens and old empty overrides remain explicit',async()=>withSurface(surface,async page=>{
    const patch={messages:{label:'Eigene Suche',noResults:'Leer {query}'}};
    await page.evaluate(p=>window.localized.remount('de',p),patch);
    assert.equal(await input(page).getAttribute('placeholder'),isDirectory(surface)?'Enter a word':'Search');
    await search(page,'fehlt',0);assert.equal(await status(page).textContent(),'Leer fehlt');
    if(isDirectory(surface)){
      await page.locator('details').evaluate(n=>{n.open=true;});await page.locator('input[value=absent]').check();await ready(page,0);assert.equal(await status(page).textContent(),'Leer fehlt');
      await page.evaluate(()=>window.localized.view().clear());await ready(page,3);
    }else if(surface==='inline'||surface==='modal'){
      await search(page,'gemeinsam',2);await page.locator('select').selectOption({label:'manual (1)'});await ready(page,1);await page.evaluate(()=>window.localized.view().search('einzeln'));await ready(page,0);assert.equal(await status(page).textContent(),'Leer einzeln');
    }
    const key=isDirectory(surface)?'results':'resultsMany';await page.evaluate(({key})=>window.localized.remount('de',{messages:{[key]:'Treffer {total}; {unknown}'}}),{key});
    await search(page,'gemeinsam',2);assert.equal(await status(page).textContent(),'Treffer 2; {unknown}');
    report.observations.push({surface,name:'partial English fallback and literal unavailable tokens',oldEmptyFallback:true,result:'Pass'});
  }));

  test(surface+': deliberate RTL remount owns focus and respects old replies and borrowed state',async()=>withSurface(surface,async page=>{
    await search(page,'gemeinsam',2);await page.evaluate(()=>{window.oldInput=window.localized.input();});
    const snapshot=isDirectory(surface)?await page.evaluate(()=>window.localized.controller.getSnapshot()):undefined;
    if(!isDirectory(surface)){
      await page.evaluate(()=>{window.localized.hold();window.oldSearch=window.localized.view().search('einzeln');});
      await page.waitForFunction(()=>window.localized.state.releases.length===1);
    }
    const calls=await page.evaluate(()=>window.localized.state.calls.length);
    await page.evaluate(()=>window.localized.switchWithFocus('ar'));
    assert.equal(await page.evaluate(()=>window.localized.state.calls.length),calls);assert.equal(await input(page).evaluate(n=>n!==window.oldInput&&n===document.activeElement),true);
    assert.equal(await page.evaluate(()=>window.localized.duplicate({label:'Ignored'})),true);assert.notEqual(await input(page).getAttribute('aria-label'),'Ignored');
    if(isDirectory(surface))assert.deepEqual(await page.evaluate(()=>window.localized.controller.getSnapshot()),snapshot);
    else {await page.evaluate(async()=>{window.localized.release();await window.oldSearch;});assert.equal(await input(page).inputValue(),'');}
    assert.equal(await input(page).evaluate(n=>n===document.activeElement),true);assert.equal(await page.locator('#root').innerText().then(s=>s.includes('MUTATED')),false);
    await search(page,'gemeinsam',2);const translated=await page.evaluate(()=>window.localized.messages());
    const m=isDirectory(surface)?translated.directory:surface==='dropdown'?translated.dropdown:translated.inlineWithFilters;
    await page.getByRole(surface==='dropdown'?'combobox':'searchbox',{name:m.label,exact:true}).waitFor();
    await page.setViewportSize({width:320,height:850});await page.emulateMedia({reducedMotion:'reduce',forcedColors:'active'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
    await input(page).focus();assert.notEqual(await input(page).evaluate(n=>getComputedStyle(n).outlineStyle),'none');
    await page.addScriptTag({content:axe.source});assert.deepEqual(await page.evaluate(async()=> (await axe.run(document.querySelector('main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}})).violations),[]);
    report.observations.push({surface,name:'explicit language remount and long synthetic RTL',inertRemount:true,appOwnedFocus:true,oldWorkSuppressed:!isDirectory(surface),borrowedSnapshotPreserved:isDirectory(surface),width:320,axeViolations:0,result:'Pass'});
  }));
}
