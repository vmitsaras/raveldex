import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { release } from 'node:os';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright-core';
import { prepareConsumer, REPO_ROOT, digest } from '../../scripts/lib/packed-consumer.mjs';
import { contrast } from '../helpers/contrast.mjs';

const selected = process.env.RAVELDEX_FAMILY_BROWSER ?? 'chrome', surfaces = ['inline', 'modal', 'dropdown', 'directory', 'cards'];
const expectedShared = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const report = { kind: 'raveldex-installed-family-states-v1', observations: [], environment: { node: process.version, platform: process.platform, arch: process.arch, release: release(), selected },
  scope: 'Fresh physically installed public package. Body-only hand-derived equal-length/frequency corpus, real successful native results, deliberately injected search failure, held real native replies, scripted composition/keyboard/lifecycle. No snippets/sections configured here; their current dedicated suites remain separate. No human AT/physical input/actual zoom/Safari qualification.' };
let consumer, server, origin, browser;
const directory = surface => surface === 'directory' || surface === 'cards';
const shell = surface => directory(surface) ? '.raveldex-directory' : surface === 'dropdown' ? '.raveldex-dropdown' : '.raveldex-inline';
const resultAttribute = surface => `data-raveldex-${directory(surface) ? 'directory' : surface === 'dropdown' ? 'dropdown' : 'inline'}-result`;
const root = page => page.locator('#family-root');
const input = page => root(page).locator('input[type="search"], input[role="combobox"]');
const ids = (page, surface) => root(page).locator(`[${resultAttribute(surface)}]`).evaluateAll((nodes, attribute) => nodes.map(node => node.getAttribute(attribute)), resultAttribute(surface));
const record = (surface, name, details) => report.observations.push({ surface, name, status: 'Pass', details });
async function ready(page, surface, text, total) {
  await page.waitForFunction(({ selector, text, total, isDirectory }) => {
    const f = window.family, element = f.root.querySelector(selector), call = f.state.calls.at(-1);
    return element?.dataset.state === (isDirectory ? 'ready' : total ? 'results' : 'empty')
      && !f.root.querySelector('[aria-busy="true"]') && f.root.querySelector('input[type=search], input[role=combobox]')?.value === text
      && call?.complete && call.result?.total === total;
  }, { selector: shell(surface), text, total, isDirectory: directory(surface) });
}
async function query(page, surface, text, total) { await input(page).focus(); await page.evaluate(text => window.family.handle().search(text), text); await ready(page, surface, text, total); }
async function disabled(button) { return await button.getAttribute('aria-disabled') === 'true'; }
async function completePages(page, surface, expected, text) {
  if (directory(surface)) {
    for (let number = 1; number <= Math.ceil(expected.length / 2); number++) {
      await ready(page, surface, text, expected.length); assert.deepEqual(await ids(page, surface), expected.slice((number - 1) * 2, number * 2));
      const snapshot = await page.evaluate(() => window.family.snapshot()); assert.equal(snapshot.state.page, number); assert.equal(snapshot.result.total, expected.length);
      if (number < Math.ceil(expected.length / 2)) { await root(page).getByRole('button', { name: 'Next page', exact: true }).click(); await page.waitForFunction(number => window.family.snapshot().status === 'ready' && window.family.snapshot().state.page === number, number + 1); }
    }
    return;
  }
  let count = Math.min(2, expected.length);
  for (let guard = 0; guard < 10; guard++) {
    assert.deepEqual(await ids(page, surface), expected.slice(0, count));
    assert.equal(await root(page).locator('[data-raveldex-inline-next], [data-raveldex-inline-previous]').count(), 0);
    if (count >= expected.length) {
      assert.equal(await root(page).locator('[data-raveldex-inline-load-more]').getAttribute('aria-disabled'), 'true');
      return;
    }
    const more = root(page).getByRole('button', { name: 'Load more', exact: true });
    assert.equal(await disabled(more), false);
    const offset = count, added = Math.min(2, expected.length - count);
    await more.click(); count += added;
    await page.waitForFunction(count => {
      const f = window.family, nodes = [...f.root.querySelectorAll('[data-raveldex-inline-result]')];
      return f.root.querySelector('.raveldex-inline')?.dataset.state === 'results' && !f.root.querySelector('[aria-busy="true"]') && nodes.length === count;
    }, count);
    await ready(page, surface, text, expected.length);
    const call = await page.evaluate(() => window.family.state.calls.at(-1));
    assert.equal(call.offset, offset); assert.equal(call.limit, added);
  }
  assert.fail('Every native result must remain reachable');
}
async function withSurface(surface, work) {
  const context = await browser.newContext(), page = await context.newPage(), errors = []; page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
  try { await page.goto(origin + `/${surface}/`); await page.waitForFunction(() => window.familyReady); await work(page); assert.deepEqual(errors, []); }
  finally {
    try {
      const cleanup = await page.evaluate(async () => { const f = window.family; if (!f) return null; await f.cleanup(); return { ownerDisposals: f.state.ownerDisposals, borrowedDisposals: f.state.borrowedDisposals, restored: f.restored() }; });
      if (cleanup) assert.deepEqual(cleanup, { ownerDisposals: 1, borrowedDisposals: 0, restored: true });
    } finally { await context.close(); }
  }
}
before(async () => {
  assert.ok(['chrome', 'chromium', 'webkit'].includes(selected)); consumer = await prepareConsumer([], []);
  await copyFile(join(REPO_ROOT, 'test/consumer/family-qualification-fixture.mjs'), join(consumer.directory, 'fixture-entry.mjs'));
  const built = await build({ absWorkingDir: consumer.directory, entryPoints: ['fixture-entry.mjs'], outfile: 'fixture.mjs', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', metafile: true, logLevel: 'silent' });
  report.inputs = Object.keys(built.metafile.inputs); assert.ok(report.inputs.every(path => path === 'fixture-entry.mjs' || path.startsWith('node_modules/@vmitsaras/raveldex/dist/')));
  assert.ok(report.inputs.every(path => !/\/adapters\/|\/integrations\/|\/addons\/(?:evidence|snippets|inspector)\//.test(path) && (!path.includes('/addons/sections/') || path.endsWith('/addons/sections/validation.js'))));
  report.package = consumer.package; report.consumer = { directory: consumer.directory, installed: consumer.installed };
  const sources = ['test/consumer/family-qualification-fixture.mjs', 'test/consumer/family-qualification.test.mjs', 'src/addons/ui/inline.ts', 'src/addons/ui/modal.ts', 'src/addons/ui/dropdown.ts', 'src/addons/ui/directory-controller.ts', 'src/addons/ui/directory-view-mount.ts', 'src/addons/ui/directory-cards.ts'];
  report.sourceSHA256 = Object.fromEntries(await Promise.all(sources.map(async path => [path, digest(await readFile(join(REPO_ROOT, path)))])));
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/fixture.mjs') { response.setHeader('content-type', 'text/javascript'); response.end(await readFile(join(consumer.directory, 'fixture.mjs'))); return; }
    const styles = ['inline.css', 'modal.css', 'dropdown.css', 'directory.css', 'directory-cards.css'];
    if (styles.some(name => path === '/' + name)) { response.setHeader('content-type', 'text/css'); response.end(await readFile(join(consumer.installed, 'dist/addons/ui', path.slice(1)))); return; }
    if (!['/full/', ...surfaces.map(surface => `/${surface}/`)].includes(path)) { response.writeHead(404).end(); return; }
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Search family qualification</title>${styles.map(name => `<link rel="stylesheet" href="/${name}">`).join('')}</head><body><main><h1>Search family</h1><p id="query-echo"></p><button id="family-trigger">Find documentation</button><section id="family-root" aria-label="Qualified search"><p>Original browse fallback</p></section></main><script type="module" src="/fixture.mjs"></script></body></html>`);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); origin = `http://127.0.0.1:${server.address().port}`;
  browser = selected === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ ...(selected === 'chrome' ? { channel: 'chrome' } : {}), headless: true }); report.environment.browser = browser.version();
}, { timeout: 120000 });
after(async () => { await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } if (process.env.RAVELDEX_FAMILY_REPORT) { const path = resolve(process.env.RAVELDEX_FAMILY_REPORT); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(report, null, 2) + '\n'); } });

for (const surface of surfaces) {
  test(`${surface}: Reading index styling has measured contrast, comfortable targets and scoped host themes`,async()=>withSurface(surface,async page=>{
    assert.equal(contrast('rgb(0, 0, 0)','rgb(255, 255, 255)'),21);
    assert.equal(contrast('rgb(255, 255, 255)','rgb(255, 255, 255)'),1);
    await page.setViewportSize({width:1100,height:850});await query(page,surface,'shared',7);
    if(directory(surface))await root(page).locator('summary').click();
    await page.addStyleTag({content:await readFile(join(consumer.installed,'docs/api/examples/consumer-themes.css'),'utf8')});
    await page.addStyleTag({content:'a{text-decoration:none}#host-sentinel{font:17px serif;color:rgb(84,28,50);background:rgb(250,245,240);padding:9px;border:1px solid rgb(100,80,70)}'});
    await page.evaluate(()=>{const n=document.createElement('a');n.id='host-sentinel';n.href='#outside';n.textContent='Host link';document.body.append(n);});
    const sentinel=()=>page.locator('#host-sentinel').evaluate(n=>{const s=getComputedStyle(n);return[s.color,s.backgroundColor,s.padding,s.font,s.border,s.textDecorationLine];});
    const outside=await sentinel(),observations=[];
    const variants=[
      {name:'default-light',scheme:'light',theme:'',width:1100,size:'100%',dir:'ltr'},
      {name:'explicit-dark',scheme:'light',theme:'search-theme-dark',width:1100,size:'100%',dir:'ltr'},
      {name:'automatic-dark',scheme:'dark',theme:'',width:1100,size:'100%',dir:'ltr'},
      {name:'explicit-light-over-dark',scheme:'dark',theme:'search-theme-light',width:320,size:'100%',dir:'rtl'},
      {name:'host-override-enlarged',scheme:'dark',theme:'search-theme-light',width:640,size:'200%',dir:'ltr'},
      ...(surface==='modal'?[]:[{name:'transparent-host',scheme:'light',theme:'search-theme-light',width:1100,size:'100%',dir:'ltr'}]),
    ];
    for(const variant of variants){
      await page.emulateMedia({colorScheme:variant.scheme,reducedMotion:'reduce'});await page.setViewportSize({width:variant.width,height:850});
      await page.evaluate(({variant,surface})=>{
        document.body.className=variant.theme;document.documentElement.style.fontSize=variant.size;document.documentElement.dir=variant.dir;
        for(const prefix of ['inline','dropdown','directory'])document.body.style.removeProperty(`--raveldex-${prefix}-accent`);
        for(const prefix of ['inline','dropdown','directory'])document.body.style.removeProperty(`--raveldex-${prefix}-background`);
        document.body.style.backgroundColor='white';
        document.body.style.removeProperty('--raveldex-directory-card-background');
        if(variant.name==='host-override-enlarged'){
          for(const prefix of ['inline','dropdown','directory'])document.body.style.setProperty(`--raveldex-${prefix}-accent`,'#145b45');
          document.body.style.setProperty('--raveldex-directory-card-background','#f5f7f9');
        }
        if(variant.name==='transparent-host')for(const prefix of ['inline','dropdown','directory'])document.body.style.setProperty(`--raveldex-${prefix}-background`,'transparent');
      },{variant,surface});
      await input(page).focus();await page.keyboard.press('ArrowLeft');
      if(surface==='dropdown'){
        await input(page).press('ArrowDown');await ready(page,surface,'shared',7);
        if(!await root(page).locator(`[${resultAttribute(surface)}] a`).count()){
          const recovery=root(page).getByRole('link',{name:'See all results',exact:true});assert.equal(await recovery.isVisible(),true);
          assert.match(await root(page).locator('[role=status]').textContent(),/7 results\. Showing 0\./);assert.deepEqual(await sentinel(),outside);
          observations.push({variant,popup:'No usable result row; native exact-total/full-results recovery retained',titleContrast:'Not applicable while popup collapsed'});continue;
        }
      }
      else await root(page).locator(`[${resultAttribute(surface)}] a`).first().focus();
      const found=await page.evaluate(({selector,attribute})=>{
        const root=window.family.root,scope=root.querySelector('dialog')??root.querySelector(selector),body=root.querySelector(selector);
        const link=root.querySelector(`[${attribute}] a`),field=root.querySelector('input[type=search],input[role=combobox]'),submit=root.querySelector('button[type=submit]');
        const background=n=>{for(let p=n;p;p=p.parentElement){const s=getComputedStyle(p),c=s.backgroundColor;if(s.display!=='contents'&&!/^rgba\(.*?, 0\)$/.test(c))return c;}return'rgb(255, 255, 255)';};
        const pair=n=>({text:getComputedStyle(n).color,background:background(n)}),focus=getComputedStyle(document.activeElement);
        const muted=root.querySelector('.raveldex-inline__status,.raveldex-dropdown__hint,.raveldex-directory__hint');
        const targets=[...root.querySelectorAll('button,input[type=search],input[role=combobox]')].filter(n=>n.getClientRects().length&&!n.closest('[hidden]')).map(n=>({name:n.textContent||n.getAttribute('aria-label')||n.type,height:n.getBoundingClientRect().height}));
        targets.push({name:'result link',height:link.getBoundingClientRect().height});
        const s=getComputedStyle(link),b=getComputedStyle(body),inputStyle=getComputedStyle(field);
        const focused=document.activeElement,rect=focused.getBoundingClientRect();let top=Math.max(0,rect.top),bottom=Math.min(innerHeight,rect.bottom);
        for(let p=focused.parentElement;p;p=p.parentElement){
          if(/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowY)){const r=p.getBoundingClientRect();top=Math.max(top,r.top);bottom=Math.min(bottom,r.bottom);}
          // Native top-layer dialogs are not clipped by page scroll-lock ancestors.
          if(p.matches(':modal'))break;
        }
        return{body:pair(body),muted:pair(muted),title:pair(link),submit:pair(submit),border:[inputStyle.borderTopColor,background(field)],focus:[focus.outlineColor,background(document.activeElement)],focusWidth:focus.outlineWidth,focusStyle:focus.outlineStyle,targets,
          focusVisibleHeight:Math.max(0,bottom-top),focusTargetHeight:rect.height,
          typography:{body:parseFloat(b.fontSize),line:parseFloat(b.lineHeight),title:parseFloat(s.fontSize),titleLine:parseFloat(s.lineHeight),weight:s.fontWeight,underline:s.textDecorationLine},
          metadata:[...root.querySelectorAll('.raveldex-directory-cards__excerpt,.raveldex-directory-cards__field')].map(pair),documentOverflow:document.documentElement.scrollWidth>innerWidth+1,
          resultOverflow:link.scrollWidth>link.clientWidth+1,scopeWidth:scope.getBoundingClientRect().width,active:root.querySelector('.raveldex-dropdown__cell.is-active')?pair(root.querySelector('.raveldex-dropdown__cell.is-active a')):null};
      },{selector:shell(surface),attribute:resultAttribute(surface)});
      const ratios={};for(const key of ['body','muted','title','submit']){ratios[key]=contrast(found[key].text,found[key].background);assert.ok(ratios[key]>=4.5,`${surface}/${variant.name}/${key}: ${JSON.stringify(found[key])} = ${ratios[key]}`);}
      if(surface==='dropdown'){
        await input(page).press('ArrowLeft');
        const normal=await root(page).locator(`[${resultAttribute(surface)}] a`).first().evaluate(n=>{
          for(let p=n;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display!=='contents'&&!/^rgba\(.*?, 0\)$/.test(s.backgroundColor))return{text:getComputedStyle(n).color,background:s.backgroundColor};}
          return{text:getComputedStyle(n).color,background:'rgb(255, 255, 255)'};
        });
        found.unselectedTitle=normal;ratios.unselectedTitle=contrast(normal.text,normal.background);assert.ok(ratios.unselectedTitle>=4.5);await input(page).press('ArrowDown');
      }
      ratios.border=contrast(...found.border);ratios.focus=contrast(...found.focus);assert.ok(ratios.border>=3);assert.ok(ratios.focus>=3);assert.equal(found.focusWidth,'3px');assert.equal(found.focusStyle,'solid');
      assert.ok(found.focusVisibleHeight>=Math.min(44,found.focusTargetHeight)-1,`${surface}/${variant.name}: focused target clipped ${found.focusVisibleHeight}/${found.focusTargetHeight}`);
      for(const item of found.metadata)assert.ok(contrast(item.text,item.background)>=4.5);
      if(found.active)assert.ok(contrast(found.active.text,found.active.background)>=4.5);
      for(const target of found.targets)assert.ok(target.height>=43.9,`${surface}/${variant.name}/${JSON.stringify(target)}`);
      assert.ok(Math.abs(found.typography.title/found.typography.body-1.15)<.01);assert.ok(Math.abs(found.typography.line/found.typography.body-1.6)<.01);assert.equal(found.typography.weight,'650');assert.ok(found.typography.underline.includes('underline'));
      assert.equal(found.documentOverflow,false);assert.equal(found.resultOverflow,false);assert.deepEqual(await sentinel(),outside);
      if(directory(surface)&&variant.name==='automatic-dark')assert.equal(found.body.background,'rgb(21, 32, 51)');
      if(!directory(surface)&&variant.name==='automatic-dark')assert.equal(found.body.background,'rgb(255, 255, 255)');
      if(variant.name==='explicit-light-over-dark')assert.equal(found.body.background,'rgb(255, 255, 255)');
      if(['default-light','explicit-dark'].includes(variant.name)){
        // A different query exercises directory update rather than its identical-state no-op.
        await page.evaluate(()=>{window.family.fail();return window.family.handle().search('shared alpha');});
        await page.waitForFunction(selector=>window.family.root.querySelector(selector)?.dataset.state==='error',shell(surface));
        const pair=await root(page).locator('[role=status]').evaluate(n=>{
          for(let p=n;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display!=='contents'&&!/^rgba\(.*?, 0\)$/.test(s.backgroundColor))return{text:getComputedStyle(n).color,background:s.backgroundColor};}
          return{text:getComputedStyle(n).color,background:'rgb(255, 255, 255)'};
        });
        ratios.error=contrast(pair.text,pair.background);assert.ok(ratios.error>=4.5);await query(page,surface,'shared',7);
      }
      if(process.env.RAVELDEX_FAMILY_REPORT&&['default-light','explicit-dark','explicit-light-over-dark','host-override-enlarged'].includes(variant.name))await page.screenshot({path:resolve(process.env.RAVELDEX_FAMILY_REPORT.replace(/\.json$/,'')+`-${surface}-${variant.name}.png`),fullPage:true});
      observations.push({variant,...found,ratios});
    }
    record(surface,'measured scoped Reading index styling',{observations,hostSentinelUnchanged:true,actualZoom:'Not run; 200% root CSS text enlargement is separate from browser zoom.'});
  }));

  test(`${surface}: independent prefix meaning, exact native totals and every result remain reachable`, async () => withSurface(surface, async page => {
    const cases = [['s', []], ['sh', expectedShared], ['shar al', []], ['shared al', ['a']], ['café', ['unicode']], ['cafe', []]];
    for (const [text, expected] of cases) { await query(page, surface, text, expected.length); assert.deepEqual(await ids(page, surface), expected.slice(0, 2)); }
    const text = ' sha '; await query(page, surface, text, 7); assert.deepEqual(await ids(page, surface), ['a', 'b']);
    if (surface === 'dropdown') {
      const href = await root(page).getByRole('link', { name: 'See all results', exact: true }).getAttribute('href'), target = new URL(href);
      assert.equal(target.searchParams.get('q'), text); assert.equal(target.searchParams.get('lang'), 'en'); assert.equal(target.hash, '#results');
      await Promise.all([page.waitForURL(href), root(page).getByRole('link', { name: 'See all results', exact: true }).click()]); await page.waitForFunction(() => window.familyReady);
      assert.equal(await page.locator('#query-echo').textContent(), text); await ready(page, 'inline', text, 7); await completePages(page, 'inline', expectedShared, text);
    } else await completePages(page, surface, expectedShared, text);
    record(surface, 'native query meaning and complete results', { prefixMinimumCodePoints: 2, earlierWordsRemainExact: true, accentSensitive: true, nativeTotal: 7, allIDs: expectedShared, display: surface === 'dropdown' ? 'Bounded two-link window, complete accumulating inline destination with raw query' : directory(surface) ? 'Complete native page sequence' : 'All native results accumulated through Load more', snippetsAndSections: 'Not configured in this body-only fixture' });
  }));

  test(`${surface}: provisional composition, no-results and Clear preserve each surface contract`, async () => withSurface(surface, async page => {
    const before = await page.evaluate(() => window.family.state.calls.length); await input(page).focus();
    await input(page).evaluate(node => { node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); node.value = 'sha'; node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true })); node.form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true })); });
    await page.waitForTimeout(45); assert.equal(await page.evaluate(() => window.family.state.calls.length), before); assert.equal(await root(page).locator(shell(surface)).getAttribute('data-state'), 'composing');
    await input(page).evaluate(node => { node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); node.dispatchEvent(new InputEvent('input', { bubbles: true })); }); await ready(page, surface, 'sha', 7); await page.waitForTimeout(35); assert.equal(await page.evaluate(() => window.family.state.calls.length), before + 1); assert.ok(await input(page).evaluate(node => node === document.activeElement));
    if (directory(surface)) { await root(page).locator('summary').click(); const choice = root(page).getByRole('checkbox', { name: /^guide / }); await choice.focus(); await choice.press('Space'); await ready(page, surface, 'sha', 4); assert.deepEqual(await ids(page, surface), ['a', 'c']); }
    await input(page).fill('zzzzzz'); await input(page).press('Enter'); await ready(page, surface, 'zzzzzz', 0); assert.deepEqual(await ids(page, surface), []); assert.equal(await input(page).inputValue(), 'zzzzzz');
    const admitted = await page.evaluate(() => window.family.state.calls.length), clear = root(page).getByRole('button', { name: directory(surface) ? 'Clear all' : 'Clear search', exact: true }); await clear.focus(); await clear.press('Enter');
    if (directory(surface)) { await ready(page, surface, '', 10); assert.deepEqual((await page.evaluate(() => window.family.snapshot())).state.filters.kind, []); }
    else await page.waitForFunction(selector => window.family.root.querySelector(selector)?.dataset.state === 'idle', shell(surface));
    await page.waitForTimeout(35); assert.equal(await page.evaluate(() => window.family.state.calls.length), admitted + (directory(surface) ? 1 : 0)); assert.ok(await clear.evaluate(node => node === document.activeElement)); assert.equal(await input(page).inputValue(), '');
    record(surface, 'composition empty and clear', { provisionalRequests: 0, committedRequests: 1, noResultsTotal: 0, clearBehavior: directory(surface) ? 'Remove text/selections and browse ten records' : 'Idle without another native query', clearKeyboardFocus: true, physicalIME: 'Not run; synthetic CompositionEvent/InputEvent' });
  }));

  test(`${surface}: injected refusal/Retry and genuine held replies cannot overwrite newer or destroyed views`, async () => withSurface(surface, async page => {
    await page.evaluate(() => { window.family.fail(); return window.family.handle().search('sha'); }); await page.waitForFunction(selector => window.family.root.querySelector(selector)?.dataset.state === 'error', shell(surface)); assert.deepEqual(await ids(page, surface), []);
    const retry = root(page).getByRole('button', { name: directory(surface) ? 'Refresh results' : 'Retry search', exact: true }); await retry.focus(); await retry.press('Enter'); await ready(page, surface, 'sha', 7); assert.deepEqual(await ids(page, surface), ['a', 'b']);
    await page.evaluate(() => { window.family.hold(); window.heldFamilySearch = window.family.handle().search('shared al'); }); await page.waitForFunction(() => window.family.state.pending.length === 1); await query(page, surface, 'quiet', 1); assert.deepEqual(await ids(page, surface), ['other']);
    await page.evaluate(async () => { window.family.release(); await window.heldFamilySearch; }); assert.deepEqual(await ids(page, surface), ['other']);
    await page.evaluate(() => { window.family.hold(); window.heldFamilySearch = window.family.handle().search('shared'); }); await page.waitForFunction(() => window.family.state.pending.length === 1);
    const result = await page.evaluate(async () => { const f = window.family, old = f.handle(); old.destroy(); const restored = f.restored(); f.release(); await window.heldFamilySearch; const admitted = f.state.calls.length; await old.search('quiet'); return { restored, noRevival: f.restored(), closedRequests: f.state.calls.length - admitted, borrowedDisposals: f.state.borrowedDisposals, ownerTotal: (await f.engine.search({ kind: 'all' })).total }; });
    assert.deepEqual(result, { restored: true, noRevival: true, closedRequests: 0, borrowedDisposals: 0, ownerTotal: 10 }); await page.evaluate(() => window.family.remount()); await query(page, surface, 'sha', 7);
    record(surface, 'failure freshness and borrowed lifecycle', { injectedRefusal: 'WORK_LIMIT_EXCEEDED thrown before native execution; not a measured native budget refusal', retryTotal: 7, heldReplies: 'Real native results deliberately delayed after completion and ignoring abort', newestIDs: ['other'], ...result, remountTotal: 7 });
  }));

  test(`${surface}: revised collection cannot mix old page state with new native results`, async () => withSurface(surface, async page => {
    await query(page, surface, 'shared', 7); const firstRevision = await page.evaluate(() => window.family.state.calls.at(-1).result.revision); await page.evaluate(() => window.family.mutate());
    if (surface === 'dropdown') await query(page, surface, 'shared', 8);
    else {
      await root(page).getByRole('button', { name: directory(surface) ? 'Next page' : 'Load more', exact: true }).click();
      await page.waitForFunction(({ selector, expected }) => window.family.root.querySelector(selector)?.dataset.state === expected, { selector: shell(surface), expected: directory(surface) ? 'stale' : 'error' }); assert.deepEqual(await ids(page, surface), []);
      await root(page).getByRole('button', { name: directory(surface) ? 'Refresh results' : 'Retry search', exact: true }).click(); await ready(page, surface, 'shared', 8);
    }
    assert.deepEqual(await ids(page, surface), ['a', 'b']); const current = await page.evaluate(() => window.family.state.calls.at(-1).result); assert.ok(current.revision > firstRevision); assert.equal(current.total, 8); if (directory(surface)) assert.equal((await page.evaluate(() => window.family.snapshot())).state.page, 1);
    record(surface, 'native revision boundary', { firstRevision, currentRevision: current.revision, totalBefore: 7, totalAfter: 8, behavior: surface === 'dropdown' ? 'Explicit new bounded query adopts current revision' : 'Mixed page refused, visible first-page Retry adopts revision', currentIDs: ['a', 'b'] });
  }));
}
