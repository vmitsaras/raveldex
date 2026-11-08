import assert from 'node:assert/strict';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { build } from 'esbuild';
import axe from 'axe-core';
import { prepareConsumer, REPO_ROOT, digest } from '../../scripts/lib/packed-consumer.mjs';
import { schema, groups, records } from '../fixtures/directory.mjs';
import { directoryExpected } from '../oracle/directory.mjs';
let consumer, server, browser, origin, context, page, errors;
const selected = process.env.RAVELDEX_DIRECTORY_VIEW_BROWSER ?? process.env.RAVELDEX_UI_BROWSER ?? 'chrome';
const report = { kind: 'raveldex-installed-directory-view-v1', observations: [], environment: { node: process.version, platform: process.platform, arch: process.arch, selected },
  scope: 'Installed public API and native browser controls, scripted keyboard/composition, actual Back/Forward, selected axe and emulated media/layout. No human AT, physical input, real zoom or Safari claim.' };
const record = (name, details) => report.observations.push({ name, status: 'Pass', details });
const snap = () => page.evaluate(() => window.directoryView.controller().getSnapshot());
async function ready(text, number = 1) { await page.waitForFunction(({text,number}) => {
  const s = window.directoryView.controller().getSnapshot(); return s.status === 'ready' && s.state.text === text && s.state.page === number && document.querySelector('.raveldex-directory')?.dataset.state === 'ready';
}, {text,number}); }
const ids = () => page.locator('[data-raveldex-directory-result]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-raveldex-directory-result')));
const input = () => page.locator('[data-raveldex-directory-input]');
const checkbox = (field, value) => page.locator(`input[data-field=${JSON.stringify(field)}][value=${JSON.stringify(value)}]`);
async function openFilters() { if (!await page.locator('details').getAttribute('open')) { await page.getByText('Filter resources', { exact: true }).click(); } }
async function compare(query, filters, text, number = 1, projection = groups) {
  await ready(text, number); const expected = directoryExpected(records, schema, query, filters, projection, 2, number);
  const actual = await snap(); assert.equal(actual.result.total, expected.total); assert.deepEqual(await ids(), expected.hits.map(h => h.id)); assert.deepEqual(actual.result.facets, expected.facets);
}
before(async () => {
  assert.ok(['chrome','chromium','webkit'].includes(selected)); consumer = await prepareConsumer([],[]);
  for (const [from,to] of [['test/ui/directory-view-fixture.mjs','fixture-entry.mjs'],['test/fixtures/directory.mjs','directory-data.mjs']]) await copyFile(join(REPO_ROOT,from),join(consumer.directory,to));
  const built = await build({absWorkingDir:consumer.directory,entryPoints:['fixture-entry.mjs'],outfile:'fixture.mjs',bundle:true,platform:'browser',format:'esm',target:'es2022',metafile:true,logLevel:'silent'});
  report.inputs = Object.keys(built.metafile.inputs); assert.ok(report.inputs.every(p => ['fixture-entry.mjs','directory-data.mjs'].includes(p) || p.startsWith('node_modules/@vmitsaras/raveldex/dist/')));
  assert.ok(report.inputs.every(p => !/\/adapters\/|\/addons\/(?:evidence|snippets|sections|inspector)\//.test(p)));
  report.package = consumer.package; report.consumer = { directory: consumer.directory, installed: consumer.installed };
  report.sourceSHA256 = Object.fromEntries(await Promise.all(['src/addons/ui/directory-view.ts','src/addons/ui/directory-view-options.ts','src/addons/ui/directory-view-types.ts','src/addons/ui/directory.css','test/ui/directory-view.test.mjs','test/ui/directory-view-fixture.mjs'].map(async p => [p,digest(await readFile(join(REPO_ROOT,p)))])));
  server = createServer(async (request,response) => {
    const path = new URL(request.url,'http://localhost').pathname;
    if (path === '/fixture.mjs') { response.setHeader('content-type','text/javascript');response.end(await readFile(join(consumer.directory,'fixture.mjs'))); }
    else if (path === '/directory.css') { response.setHeader('content-type','text/css'); response.end(await readFile(join(consumer.installed,'dist/addons/ui/directory.css'))); }
    else response.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Directory controls</title><link rel="stylesheet" href="/directory.css"><main><h1>Resource directory</h1><section id="directory" aria-label="Resource search"><p>Authored browse fallback</p></section><a href="/outside/">Outside</a></main><script type="module" src="/fixture.mjs"></script></html>');
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  browser = selected === 'webkit' ? await webkit.launch({headless:true}) : await chromium.launch({...(selected==='chrome'?{channel:'chrome'}:{}),headless:true}); report.environment.browser=browser.version();
  const baseline=await browser.newPage();await baseline.setContent('<!doctype html><button id=plain-button>Native button</button><label><input type=checkbox id=plain-checkbox>Native checkbox</label>');await baseline.locator('#plain-button').click();const buttonFocus=await baseline.evaluate(()=>document.activeElement.id||document.activeElement.tagName);await baseline.locator('#plain-checkbox').click();const checkboxFocus=await baseline.evaluate(()=>document.activeElement.id||document.activeElement.tagName);await baseline.locator('#plain-button').focus();await baseline.locator('#plain-button').click();const focusedButtonClick=await baseline.evaluate(()=>document.activeElement.id||document.activeElement.tagName);await baseline.locator('#plain-button').focus();await baseline.locator('#plain-button').press('Enter');const keyboardButton=await baseline.evaluate(()=>document.activeElement.id||document.activeElement.tagName);report.nativePointerFocus={buttonFocus,checkboxFocus,focusedButtonClick,keyboardButton,scope:'Native controls in an otherwise empty document; pointer focus policy, not keyboard/AT qualification.'};await baseline.close();
},{timeout:120000});
beforeEach(async()=> { context=await browser.newContext();page=await context.newPage();page.setDefaultTimeout(12000);errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/directory/?unrelated=a%20b#kept');await page.waitForFunction(()=>window.directoryReady);await ready(''); });
afterEach(async()=> {try{await page.evaluate(()=>window.directoryView.cleanup());assert.deepEqual(errors,[]);}finally{await context.close();}});
after(async()=> {await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(process.env.RAVELDEX_DIRECTORY_VIEW_REPORT){const p=resolve(process.env.RAVELDEX_DIRECTORY_VIEW_REPORT);await mkdir(dirname(p),{recursive:true});await writeFile(p,JSON.stringify(report,null,2)+'\n');}});

test('empty directory feedback distinguishes safe query text, selected filters and explicit empty-browse refresh',async()=>{
  const query='<img src=x onerror=alert(1)> '+ '😀'.repeat(180);
  await input().focus();await page.evaluate(q=>window.directoryView.view().search(q),query);await ready(query);
  assert.equal(await page.locator('[role=status]').textContent(),`No results for “${Array.from(query).slice(0,160).join('')}…”. Try a different search or clear all to browse resources.`);
  assert.equal(await input().inputValue(),query);assert.equal(await input().evaluate(n=>n===document.activeElement),true);assert.equal(await page.locator('#directory img,#directory script').count(),0);
  await page.setViewportSize({width:320,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  if(process.env.RAVELDEX_DIRECTORY_VIEW_REPORT)await page.screenshot({path:resolve(process.env.RAVELDEX_DIRECTORY_VIEW_REPORT.replace(/\.json$/,'')+'-empty-320.png'),fullPage:true});
  await page.evaluate(()=>window.directoryView.view().clear());await ready('');await openFilters();await checkbox('kind','absent').check();await ready('');
  assert.equal(await page.locator('[role=status]').textContent(),'No results with the selected filters. Change or remove a filter, or clear all to browse resources.');
  assert.equal(await checkbox('kind','absent').isChecked(),true);assert.equal(await page.getByRole('button',{name:'Remove Type: absent',exact:true}).count(),1);
  await page.evaluate(async()=>{const f=window.directoryView;await f.engine.remove(f.documents.map(d=>d.id));await f.view().clear();});await ready('');
  assert.equal(await page.locator('[role=status]').textContent(),'No resources to show. Use Refresh results to check for updates.');
  const before=await page.evaluate(()=>window.directoryView.calls.length),refresh=page.getByRole('button',{name:'Refresh results',exact:true});
  assert.equal(await refresh.getAttribute('aria-disabled'),'false');await refresh.focus();await refresh.press('Enter');await ready('');
  assert.equal(await refresh.evaluate(n=>n===document.activeElement),true);assert.equal(await page.evaluate(()=>window.directoryView.calls.length),before+1);
  record('contextual empty recovery',{querySafe:true,previewCodePoints:160,filterRetained:true,explicitRefreshQueries:1});
});

test('old empty overrides cover filtered and browse variants and detached stale status never republishes',async()=>{
  await page.evaluate(()=>{
    const messages={noResults:'Aucun résultat: {query}'};
    return window.directoryView.remount({view:{messages}}).then(()=>{messages.noResults='Changed outside';});
  });
  await page.evaluate(()=>window.directoryView.view().search('missing'));await ready('missing');assert.equal(await page.locator('[role=status]').textContent(),'Aucun résultat: missing');
  await page.evaluate(()=>window.directoryView.view().clear());await ready('');await openFilters();await checkbox('kind','absent').check();await ready('');assert.equal(await page.locator('[role=status]').textContent(),'Aucun résultat: ');
  await page.evaluate(()=>window.directoryView.view().clear());await ready('');
  await page.evaluate(()=>{
    window.emptyFeedback=[];
    new MutationObserver(rs=>{for(const r of rs)for(const n of r.addedNodes)window.emptyFeedback.push(n.textContent);}).observe(document.querySelector('[role=status]'),{childList:true});
    window.directoryView.hold();window.oldFeedback=window.directoryView.view().search('obsolete_missing');
  });
  await page.waitForFunction(()=>window.directoryHeld);await page.evaluate(()=>window.directoryView.view().search('current_missing'));await ready('current_missing');
  await page.evaluate(async()=>{window.directoryView.release();await window.oldFeedback;});assert.equal(await page.locator('[role=status]').textContent(),'Aucun résultat: current_missing');
  assert.equal(await page.evaluate(()=>window.emptyFeedback.some(s=>s.includes('obsolete_missing'))),false);
  await page.evaluate(async()=>{const f=window.directoryView;await f.engine.remove(f.documents.map(d=>d.id));await f.view().clear();});await ready('');assert.equal(await page.locator('[role=status]').textContent(),'Aucun résultat: ');
  await page.evaluate(()=>{
    const messages={noResults:'Texte {query}',noResultsFiltered:'Filtres {query}',noResultsBrowse:'Aucune ressource'};
    return window.directoryView.remount({view:{messages}}).then(()=>{messages.noResultsFiltered='Changed';messages.noResultsBrowse='Changed';});
  });await ready('');assert.equal(await page.locator('[role=status]').textContent(),'Aucune ressource');
  await openFilters();await checkbox('kind','absent').check();await ready('');assert.equal(await page.locator('[role=status]').textContent(),'Filtres ');
  record('captured empty fallback and freshness',{oldOverrideVariants:3,explicitVariantOverrides:2,obsoleteAnnouncements:0});
});

test('native empty browse exposes exact complete pages with stable navigation and no implicit URL state',async()=>{
  assert.equal(await page.getByRole('search').count(),1);assert.equal(await page.getByRole('searchbox',{name:'Search resources'}).count(),1);assert.equal(await page.locator('details').getAttribute('open'),null);
  const expected = directoryExpected(records,schema,{kind:'all'},{},groups,2), all=[];
  for(let n=1;n<=4;n++){await compare({kind:'all'},{},'',n);all.push(...await ids());if(n<4){await page.getByRole('button',{name:'Next page',exact:true}).focus();await page.getByRole('button',{name:'Next page',exact:true}).press('Enter');await ready('',n+1);}}
  assert.deepEqual(all,expected.allIDs);assert.equal(await page.getByRole('button',{name:'Next page',exact:true}).getAttribute('aria-disabled'),'true');
  assert.ok(await page.getByRole('button',{name:'Next page',exact:true}).evaluate(n=>n===document.activeElement));assert.equal(page.url(),origin+'/directory/?unrelated=a%20b#kept');record('native complete browse',{ids:all,pages:4});
});
test('text and OR-within/AND-across checkbox edits preserve native conjunctive totals and full counts',async()=>{
  await input().fill('shared');await input().press('Enter');await openFilters();
  await checkbox('kind','guide').check();await checkbox('kind','manual').check();await checkbox('tags','red').focus();await checkbox('tags','red').press('Space');
  const filters={kind:['guide','manual'],tags:['red']};await compare({kind:'text',text:'shared'},filters,'shared');
  const d=await snap();for(const f of d.result.facets){for(const b of f.buckets.filter(b=>b.kind==='value'&&typeof b.value==='string')){const label=checkbox(f.field,b.value);if(await label.count())assert.ok((await label.locator('..').innerText()).includes(`(${b.count})`));}}
  assert.equal(await page.getByRole('group',{name:'Type',exact:true}).count(),1);assert.ok(await checkbox('tags','red').evaluate(n=>n===document.activeElement));record('native multi-selection/counts',{total:d.result.total,facets:d.result.facets});
});
test('plain count guidance explains an enabled zero choice expanding mutually exclusive results',async()=>{
  await openFilters();
  const hint=page.locator('[data-raveldex-directory-hint]');
  assert.equal(await hint.textContent(),'Counts cover all results matching your search and selected filters, not just this page. Within a group, results can match any selected choice. Results must also match each other selected group. A choice showing 0 can add results when selected alongside another choice in its group.');
  await checkbox('kind','guide').focus();await checkbox('kind','guide').press('Space');await ready('');
  await compare({kind:'all'},{kind:['guide']},'');assert.equal((await snap()).result.total,3);
  assert.deepEqual(await ids(),['a','c']);
  assert.ok((await checkbox('kind','guide').locator('..').innerText()).includes('(3)'));
  const manual=checkbox('kind','manual');assert.ok((await manual.locator('..').innerText()).includes('(0)'));assert.equal(await manual.isEnabled(),true);
  await manual.evaluate(n=>{window.originalManual=n;});await manual.focus();await manual.press('Space');await ready('');
  await compare({kind:'all'},{kind:['guide','manual']},'');assert.equal((await snap()).result.total,5);
  assert.equal(await manual.evaluate(n=>n===window.originalManual&&n===document.activeElement&&n.checked),true);
  assert.equal(await page.getByRole('button',{name:'Remove Type: Guide',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Remove Type: Manual',exact:true}).count(),1);
  const all=[];
  for(let number=1;number<=3;number++){
    await compare({kind:'all'},{kind:['guide','manual']},'',number);all.push(...await ids());
    if(number<3){await page.getByRole('button',{name:'Next page',exact:true}).press('Enter');await ready('',number+1);}
  }
  assert.deepEqual(all,['a','b','c','e','f']);
  await checkbox('tags','red').focus();await checkbox('tags','red').press('Space');await ready('');
  await compare({kind:'all'},{kind:['guide','manual'],tags:['red']},'');assert.equal((await snap()).result.total,2);assert.deepEqual(await ids(),['a','b']);
  assert.equal(await checkbox('tags','red').evaluate(n=>n===document.activeElement),true);
  assert.equal(await page.locator('[data-raveldex-directory-page]').textContent(),'Page 1 of 1.');
  await page.setViewportSize({width:320,height:850});assert.equal(await hint.isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
  if(process.env.RAVELDEX_DIRECTORY_VIEW_REPORT)await page.screenshot({path:resolve(process.env.RAVELDEX_DIRECTORY_VIEW_REPORT.replace(/\.json$/,'')+'-counts-320.png')});
  const translated={countHint:'<b>Alle aktuellen Treffer zählen.</b>'};
  await page.evaluate(async messages=>{await window.directoryView.remount({view:{messages}});messages.countHint='Changed after capture';},translated);await openFilters();
  assert.equal(await hint.textContent(),translated.countHint);assert.equal(await hint.locator('b').count(),0);
  record('plain current counts and zero-choice expansion',{guide:3,manualBefore:0,guideOrManual:5,ids:all,withRed:2,nativeSpace:true,stableFocus:true,width:320,capturedTextOverride:true});
});
test('selected zero and projected-out values remain checked, removable and accurately labeled',async()=>{
  await page.evaluate(()=>window.directoryView.remount({limit:1}));await ready('');await openFilters();await checkbox('kind','absent').check();await ready('');
  assert.equal((await snap()).result.total,0);assert.ok((await checkbox('kind','absent').locator('..').innerText()).includes('(0)'));assert.equal(await checkbox('kind','absent').isChecked(),true);
  await page.getByRole('button',{name:'Clear all',exact:true}).click();await ready('');await checkbox('tags','red').check();await ready('');
  await checkbox('tags','blue').check();await ready('');const state=await snap();assert.equal(state.state.filters.tags.length,2);assert.equal(await page.getByRole('button',{name:/Remove Tags:/}).count(),2);
  assert.ok(await page.locator('[data-raveldex-directory-count]').allTextContents().then(a=>a.some(s=>s.includes('count unavailable'))));record('selected zero/omission',{selected:state.result.selected});
});
test('chip removal recovers adjacent focus and Clear all retains its stable native button',async()=>{
  await openFilters();await checkbox('kind','guide').check();await checkbox('tags','red').check();await checkbox('tags','blue').check();await ready('');
  await page.getByRole('button',{name:'Remove Tags: blue',exact:true}).click();await ready('');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Remove Tags: red');
  await page.getByRole('button',{name:'Remove Tags: red',exact:true}).click();await ready('');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Remove Type: Guide');
  await page.getByRole('button',{name:'Remove Type: Guide',exact:true}).click();await ready('');assert.ok(await input().evaluate(n=>n===document.activeElement));
  await input().fill('shared');await input().press('Enter');await ready('shared');await page.getByRole('button',{name:'Clear all',exact:true}).focus();await page.getByRole('button',{name:'Clear all',exact:true}).press('Enter');await ready('');assert.ok(await page.getByRole('button',{name:'Clear all',exact:true}).evaluate(n=>n===document.activeElement));record('chip and clear focus',{fallback:'adjacent chip then search input'});
});
test('narrow native disclosure has keyboard close and opener restoration without resize resets',async()=>{
  await page.setViewportSize({width:320,height:800});const summary=page.locator('summary');await summary.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('details').open);
  await checkbox('kind','guide').focus();await page.keyboard.press('Space');await ready('');await page.setViewportSize({width:1100,height:800});assert.equal(await page.locator('details').getAttribute('open'),'');
  await checkbox('tags','red').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('details').getAttribute('open'),null);assert.ok(await summary.evaluate(n=>n===document.activeElement));
  await summary.press('Enter');await page.getByRole('button',{name:'Close filters',exact:true}).click();assert.ok(await summary.evaluate(n=>n===document.activeElement));assert.deepEqual((await snap()).state.filters.kind,['guide']);record('disclosure keyboard',{narrow:320,resizePreserved:true,focus:'summary'});
});
test('composition defers text and checkbox searches; clear and explicit commands win over late composition events',async()=>{
  const before=await page.evaluate(()=>window.directoryView.calls.length);await openFilters();await input().evaluate(n=>{n.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));n.value='qui';n.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));});await checkbox('kind','guide').check();
  await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>window.directoryView.calls.length),before);assert.equal(await page.locator('.raveldex-directory').getAttribute('data-state'),'composing');
  await input().evaluate(n=>{n.value='quiet';n.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));n.dispatchEvent(new InputEvent('input',{bubbles:true}));});await ready('quiet');assert.deepEqual((await snap()).state.filters.kind,['guide']);
  await input().evaluate(n=>n.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})));await page.evaluate(()=>window.directoryView.view().search('shared'));await ready('shared');
  await input().evaluate(n=>{n.value='stale';n.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));n.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));});await page.waitForTimeout(40);await ready('shared');assert.equal(await input().inputValue(),'shared');record('scripted composition',{provisionalSearches:0,explicitWins:true});
});
test('late ignored-abort result cannot overwrite a newer view search or revive destroyed markup',async()=>{
  await page.evaluate(()=>{window.directoryView.hold();window.old=window.directoryView.view().search('shared');});await page.waitForFunction(()=>window.directoryHeld);
  await page.evaluate(()=>window.directoryView.view().search('quiet'));await ready('quiet');const expected=await ids();await page.evaluate(async()=>{window.directoryView.release();await window.old;});assert.deepEqual(await ids(),expected);
  await page.evaluate(()=>{window.directoryView.hold();window.old=window.directoryView.view().search('shared');});await page.waitForFunction(()=>window.directoryHeld);await page.evaluate(()=>window.directoryView.view().destroy());
  await page.evaluate(async()=>{window.directoryView.release();await window.old;});assert.equal(await page.locator('.raveldex-directory').count(),0);assert.equal(await page.evaluate(()=>window.directoryView.root.firstChild===window.directoryView.original),true);assert.equal(await page.evaluate(()=>window.directoryView.disposed()),0);record('late and destroyed views',{borrowedOwnerDisposals:0});
});
test('actual Back/Forward restores controls, chips and complete page state without replay pushes',async()=>{
  await page.evaluate(()=>window.directoryView.remount({url:true}));await ready('');await page.getByRole('button',{name:'Next page',exact:true}).click();await ready('',2);await openFilters();await checkbox('kind','guide').check();await ready('');
  await input().fill('shared');await input().press('Enter');await ready('shared');const length=await page.evaluate(()=>history.length);
  await page.goBack();await ready('');assert.equal(await checkbox('kind','guide').isChecked(),true);await page.goBack();await ready('',2);assert.equal(await checkbox('kind','guide').isChecked(),false);assert.equal(await page.getByRole('button',{name:/Remove /}).count(),0);
  await page.goForward();await ready('');await page.goForward();await ready('shared');assert.equal(await page.evaluate(()=>history.length),length);assert.equal(new URL(page.url()).searchParams.get('unrelated'),'a b');assert.equal(new URL(page.url()).hash,'#kept');record('native view/history replay',{back:2,forward:2,extraEntries:0});
});
test('a revision change clears results and Refresh explicitly accepts the new native revision',async()=>{
  await page.getByRole('button',{name:'Next page',exact:true}).click();await ready('',2);await page.evaluate(()=>window.directoryView.mutate());await page.getByRole('button',{name:'Next page',exact:true}).click();
  await page.getByText('The collection changed. Refresh results to continue.',{exact:true}).waitFor();assert.deepEqual(await ids(),[]);await page.getByRole('button',{name:'Refresh results',exact:true}).click();await ready('');assert.equal((await snap()).result.revision,2);assert.equal((await snap()).result.total,8);record('native revision recovery',{revision:2,page:1});
});
test('missing registrations and a missing display record refuse explicitly instead of showing false no-results',async()=>{
  await page.evaluate(()=>window.directoryView.remount({missing:true}));await page.getByText('Search could not complete. Refresh results or change your search and filters.',{exact:true}).waitFor();assert.deepEqual(await ids(),[]);assert.equal((await snap()).error,'MISSING_CAPABILITY');
  await page.evaluate(()=>window.directoryView.remount({view:{documents:[],messages:{error:'Search is unavailable ({code}). Try again.'}}}));await page.getByText('Search is unavailable (INCOMPATIBLE_CAPABILITY). Try again.',{exact:true}).waitFor();assert.deepEqual(await ids(),[]);record('explicit refusal',{capability:'MISSING_CAPABILITY',display:'INCOMPATIBLE_CAPABILITY'});
});
test('mount admission is captured and safe before replacing authored nodes, duplicate ownership is bounded',async()=>{
  const details=await page.evaluate(()=>{
    const f=window.directoryView;const other=document.createElement('section');document.body.append(other);const original=document.createElement('p');original.textContent='Keep';other.append(original);
    const options={root:other,controller:f.controller(),documents:f.documents,groups:f.labels};let getter=0;const bad=Object.defineProperty({},'label',{get(){getter++;return 'no';}});const cases=[{documents:[{id:'bad',title:'Bad',url:'javascript:alert(1)'}]},{groups:[]},{messages:bad}];const refused=[];
    for(const patch of cases){try{f.mountRaveldexDirectory({...options,...patch});refused.push(false);}catch{refused.push(other.firstChild===original);}}
    const one=f.mountRaveldexDirectory(options),two=f.mountRaveldexDirectory(options);one.destroy();
    const blank=f.createDirectory({engine:f.engine,groups:[{field:'kind',values:[' ']}]});let blankRefused=false;try{f.mountRaveldexDirectory({...options,controller:blank,groups:[{field:'kind',label:'Type'}]});}catch{blankRefused=other.firstChild===original;}const named=f.mountRaveldexDirectory({...options,controller:blank,groups:[{field:'kind',label:'Type',values:[{value:' ',label:'Unspecified'}]}]});const namedBlank=other.querySelector('label.raveldex-directory__choice').textContent.includes('Unspecified');named.destroy();blank.destroy();other.remove();return{refused,getter,duplicate:one===two,borrowed:f.disposed(),blankRefused,namedBlank};
  });assert.deepEqual(details,{refused:[true,true,true],getter:0,duplicate:true,borrowed:0,blankRefused:true,namedBlank:true});record('admission and root ownership',details);
});
test('focus callback reentry preserves newer state and foreign replacement survives teardown',async()=>{
  const first=page.locator('[data-raveldex-directory-result-link]').first();await first.focus();
  await page.evaluate(async()=>{const f=window.directoryView;document.querySelector('[data-raveldex-directory-input]').addEventListener('focus',()=>{window.newest=f.view().search('quiet');},{once:true});await f.controller().update({text:'shared'});await window.newest;});await ready('quiet');assert.equal(await input().inputValue(),'quiet');
  await page.evaluate(()=>{window.directoryView.root.textContent='Foreign replacement';window.directoryView.view().destroy();});assert.equal(await page.locator('#directory').innerText(),'Foreign replacement');record('reentrant focus/foreign DOM',{newest:'quiet',foreignPreserved:true});
});
test('safe labels and result links use text and native navigation; hostile markup is not inserted',async()=>{
  await page.evaluate(()=>{const f=window.directoryView;return f.remount({view:{documents:f.documents.map((d,i)=>({...d,title:i===0?'<img src=x onerror=alert(1)>':d.title})),messages:{label:'<b>Find resources</b>'}}});});await ready('');assert.equal(await page.locator('#directory img, #directory b').count(),0);
  assert.equal(await page.getByRole('searchbox',{name:'<b>Find resources</b>',exact:true}).count(),1);await page.locator('[data-raveldex-directory-result-link]').first().click();await page.waitForURL('**/resource/a/');record('safe text/native destination',{destination:new URL(page.url()).pathname});
});
test('long RTL/dark/forced-colors themes reflow with visible focus and selected axe checks',async()=>{
  await page.evaluate(()=>window.directoryView.remount({view:{messages:{label:'ابحث عن الموارد والكتيبات والأدلة الطويلة',filters:'خيارات تصفية الموارد'},groups:[{field:'kind',label:'أنواع الموارد والأدلة الطويلة'},{field:'tags',label:'الموضوعات'}]}}));await ready('');
  for(const mode of ['light','dark','forced']){
    await page.emulateMedia({colorScheme:mode==='light'?'light':'dark',forcedColors:mode==='forced'?'active':'none',reducedMotion:'reduce'});assert.equal(await page.evaluate(()=>matchMedia('(forced-colors: active)').matches),mode==='forced');await page.setViewportSize({width:320,height:900});await page.locator('html').evaluate(n=>n.dir='rtl');await page.locator('summary').click();await input().focus();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.ok(await input().evaluate(n=>getComputedStyle(n).outlineStyle!=='none'));
    await page.addScriptTag({content:axe.source});const violations=await page.evaluate(async()=> (await axe.run(document.querySelector('main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}})).violations);assert.deepEqual(violations,[],mode);
  }
  record('emulated themes/reflow/axe',{width:320,modes:['light','dark','forced'],violations:0,physicalZoom:false});
});

test('chip focus follows actual DOM order when choices were selected in a different order',async()=>{
  await openFilters();await checkbox('tags','red').check();await checkbox('kind','guide').check();await checkbox('tags','blue').check();await ready('');
  assert.deepEqual(await page.locator('[data-raveldex-directory-remove]').allTextContents(),['Remove Type: Guide','Remove Tags: blue','Remove Tags: red']);
  await page.getByRole('button',{name:'Remove Tags: blue',exact:true}).click();await ready('');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Remove Tags: red');record('chip DOM order focus',{selectionOrder:['red','guide','blue'],next:'red'});
});
test('an older out-of-range recovery cannot discard a newer composition draft',async()=>{
  await page.evaluate(()=>{window.directoryView.hold();window.old=window.directoryView.controller().restore({text:'',filters:{},page:99});});await page.waitForFunction(()=>window.directoryHeld);
  await input().evaluate(n=>{n.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));n.value='quiet';n.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));});
  await page.evaluate(async()=>{window.directoryView.release();await window.old;});assert.equal(await input().inputValue(),'quiet');assert.equal(await page.locator('.raveldex-directory').getAttribute('data-state'),'composing');assert.equal((await snap()).state.text,'');
  await input().evaluate(n=>n.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));await ready('quiet');assert.equal((await snap()).result.total,2);record('older recovery/newer draft',{draftPreserved:true,finalText:'quiet'});
});
test('actual URL traversal wins over active composition without committing late old words',async()=>{
  await page.evaluate(()=>window.directoryView.remount({url:true}));await page.evaluate(()=>window.directoryView.view().search('shared'));await ready('shared');await page.evaluate(()=>window.directoryView.view().search('quiet'));await ready('quiet');
  await input().evaluate(n=>{n.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));n.value='uncommitted';n.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));});
  await page.goBack();await ready('shared');const count=await page.evaluate(()=>window.directoryView.calls.length);
  await input().evaluate(n=>{n.value='obsolete';n.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));n.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));});await page.waitForTimeout(40);assert.equal(await input().inputValue(),'shared');assert.equal(await page.evaluate(()=>window.directoryView.calls.length),count);assert.equal(new URL(page.url()).searchParams.get('q'),'shared');record('native replay/composition',{winner:'shared',lateQueries:0});
});
test('selection ceilings refuse the seventeenth checkbox without changing admitted state or querying',async()=>{
  await page.evaluate(()=>window.directoryView.remount({groups:[{field:'kind',values:Array.from({length:17},(_,i)=>'value'+i)}],view:{groups:[{field:'kind',label:'Type'}]}}));await ready('');await openFilters();
  for(let i=0;i<16;i++){await checkbox('kind','value'+i).check();await ready('');}
  const count=await page.evaluate(()=>window.directoryView.calls.length);await checkbox('kind','value16').click();await page.getByText('This search or selection exceeds the directory limits. Remove a choice or shorten the search.',{exact:true}).waitFor();
  assert.equal((await snap()).state.filters.kind.length,16);assert.equal(await checkbox('kind','value16').isChecked(),false);assert.equal(await page.evaluate(()=>window.directoryView.calls.length),count);
  await page.getByRole('button',{name:'Clear all',exact:true}).click();await ready('');assert.equal((await snap()).result.total,8);record('native selection bounds',{retained:16,extraQueries:0});
});
test('authored disconnection can destroy during mount and foreign-document views remain inactive',async()=>{
  const result=await page.evaluate(async()=>{
    const f=window.directoryView,c=f.createDirectory({engine:f.engine,groups:[{field:'kind',values:['guide']}]});const root=document.createElement('section');document.body.append(root);
    customElements.define('directory-fallback-probe',class extends HTMLElement{disconnectedCallback(){c.destroy();}});const original=document.createElement('directory-fallback-probe');root.append(original);
    const view=f.mountRaveldexDirectory({root,controller:c,documents:f.documents,groups:[{field:'kind',label:'Type'}]});const restored=root.firstChild===original;await view.search('shared');const destroyed=c.getSnapshot().status;view.destroy();root.remove();
    const foreign=document.implementation.createHTMLDocument('Foreign');const second=document.createElement('section');document.body.append(second);const v=f.mountRaveldexDirectory({root:second,controller:f.controller(),documents:f.documents,groups:f.labels});foreign.adoptNode(second);const before=f.calls.length;await v.search('quiet');const noForeignQuery=f.calls.length===before;v.destroy();
    return{restored,destroyed,noForeignQuery,ownerStillWorks:(await f.engine.search('quiet')).total};
  });assert.deepEqual(result,{restored:true,destroyed:'destroyed',noForeignQuery:true,ownerStillWorks:2});record('mount/adoption lifecycle',result);
});

test('the explicitly supplied closed shadow root retains result focus recovery without discovering other trees',async()=>{
 const result=await page.evaluate(async()=>{
  const f=window.directoryView,host=document.createElement('div'),tree=host.attachShadow({mode:'closed'}),root=document.createElement('section'),original=document.createElement('p');original.textContent='Authored';root.append(original);tree.append(root);document.body.append(host);
  const controller=f.createDirectory({engine:f.engine,groups:[],pageSize:2}),view=f.mountRaveldexDirectory({root,controller,documents:f.documents,groups:[]});await controller.refresh();root.querySelector('a').focus();const nativeHost=document.activeElement===host;
  await controller.update({text:'quiet'});const recovered=tree.activeElement===root.querySelector('input[type=search]');view.destroy();const restored=root.firstChild===original;controller.destroy();host.remove();return{nativeHost,recovered,restored,borrowedDisposals:f.disposed()};
 });assert.deepEqual(result,{nativeHost:true,recovered:true,restored:true,borrowedDisposals:0});record('known closed root focus',result);
});
