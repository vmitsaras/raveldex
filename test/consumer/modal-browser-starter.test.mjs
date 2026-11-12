import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { cp, readFile, writeFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { release as osRelease } from 'node:os';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright-core';
import { prepareConsumer, command, REPO_ROOT, digest } from '../../scripts/lib/packed-consumer.mjs';
import { seedStarterCache } from './inline-astro-starter-cache.mjs';

let consumer, browser;
const selectedEngine = process.env.RAVELDEX_MODAL_STARTER_ENGINE ?? 'chrome';
assert.ok(['chrome', 'webkit'].includes(selectedEngine), 'RAVELDEX_MODAL_STARTER_ENGINE must be chrome or webkit');
const sites = [], report = { kind: 'raveldex-modal-browser-starter-v1', observations: [] };
const record = (name, evidence) => report.observations.push({ name, status: 'Pass', evidence });
async function save() {
  if (process.env.RAVELDEX_MODAL_BROWSER_STARTER_REPORT)
    await writeFile(process.env.RAVELDEX_MODAL_BROWSER_STARTER_REPORT, JSON.stringify(report, null, 2) + '\n');
}
async function startPreview(directory, base) {
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; reservation.close(); await once(reservation, 'close');
  const child = spawn(process.execPath, ['preview.mjs', '--port', String(port)], { cwd: directory,
    env: { ...process.env, RAVELDEX_MODAL_BASE: base }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Preview timeout: ${output}`)), 20000);
    const done = () => { clearTimeout(timeout); resolve(); };
    child.stdout.on('data', chunk => { output += chunk; if (output.includes('Open http:')) done(); });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Preview exited ${code}: ${output}`)); });
  });
  return { directory, base, child, origin: `http://127.0.0.1:${port}`, async close() { if (child.exitCode !== null || child.signalCode !== null) return; const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } };
}

before(async () => {
  consumer = await prepareConsumer([], []);
  const cache = join(consumer.directory, 'starter-npm-cache');
  report.cache = await seedStarterCache(cache);
  report.package = consumer.package;
  report.environment = { node: process.version, platform: process.platform, release: osRelease(), arch: process.arch, tooling: 'Actual offline npm install of esbuild0.28.2 and core tarball, no tool/runtime symlinks.' };
  for (const base of ['/', '/help/']) {
    const directory = join(consumer.directory, base === '/' ? 'browser-root' : 'browser-help');
    await cp(join(REPO_ROOT, 'examples/modal-browser'), directory, { recursive: true, filter: path => !/(?:^|\/)dist(?:\/|$)|build-meta\.json$|node_modules/.test(path) });
    const content = JSON.parse(await readFile(join(directory, 'content.json'), 'utf8'));
    content[0].title = 'Your first riverside workshop visit'; content[0].sections[0].body += ' Riverside projects are welcome.';
    await writeFile(join(directory, 'content.json'), JSON.stringify(content));
    const css = await readFile(join(directory, 'theme.css'), 'utf8');
    await writeFile(join(directory, 'theme.css'), css.replace('--raveldex-inline-gap: 1rem;', '--raveldex-inline-gap: 1.25rem;'));
    await command('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', cache,
      join(consumer.directory, consumer.packed.filename)], directory);
    assert.equal(await realpath(join(directory, 'node_modules/esbuild')), join(directory, 'node_modules/esbuild'));
    assert.equal(await realpath(join(directory, 'node_modules/@vmitsaras/raveldex')), join(directory, 'node_modules/@vmitsaras/raveldex'));
    const built = await command('env', [`RAVELDEX_MODAL_BASE=${base}`, 'npm', 'run', 'build', '--cache', cache], directory);
    assert.match(built.stdout, /Built 6 explicit documentation pages/);
    const graph = JSON.parse(await readFile(join(directory, 'build-meta.json'), 'utf8'));
    for (const [path, input] of Object.entries(graph.inputs)) {
      assert.ok(!path.includes('/src/'), `No repository runtime source ${path}`);
      // Snippet evidence reuses inspector/output.js's generic bounded copier;
      // that utility does not install the optional Inspector capability.
      assert.ok(!/\/addons\/inspector\/(?:index|inspector)\.js$/.test(path) && !path.includes('/adapters/worker/'), `No Inspector registration/worker adapter ${path}`);
      assert.ok(input.imports.every(item => !item.external), `Unbundled runtime import ${path}`);
    }
    assert.ok(Object.keys(graph.inputs).some(path => path.includes('node_modules/@vmitsaras/raveldex/dist/')));
    // Separate test entry exercises the exact copied lifecycle module with real
    // installed engines, without adding debug hooks to the starter product.
    await writeFile(join(directory, 'lifecycle-entry.mjs'), "export {createDocumentationSearch} from './controller.mjs';export {createRaveldex} from '@vmitsaras/raveldex';export {createFacets} from '@vmitsaras/raveldex/addons/facets';export {mountRaveldexModal} from '@vmitsaras/raveldex/addons/ui/modal';\n");
    await build({ absWorkingDir: directory, entryPoints: ['lifecycle-entry.mjs'], outfile: 'dist/assets/lifecycle.js',
      bundle: true, platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent' });
    const site = await startPreview(directory, base); sites.push(site);
    record(`copied build ${base}`, { base, changedRecords: content.length, changedTitle: content[0].title,
      graphInputs: Object.keys(graph.inputs), bundleSha256: digest(await readFile(join(directory, 'dist/assets/main.js'))) });
  }
  browser = selectedEngine === 'webkit' ? await webkit.launch({ headless: true })
    : await chromium.launch({ ...(process.env.RAVELDEX_UI_BROWSER === 'chromium' ? {} : { channel: 'chrome' }), headless: true });
  report.environment.browserEngine = selectedEngine === 'webkit' ? 'webkit' : 'chromium';
  report.environment.browserChannel = selectedEngine === 'webkit' ? 'Playwright WebKit'
    : process.env.RAVELDEX_UI_BROWSER === 'chromium' ? 'Playwright Chromium' : 'chrome';
  report.environment.browser = browser.version();
  assert.match(report.environment.browser, /^\d+\.\d+/);
  report.environment.headless = true;
}, { timeout: 120000 });
after(async () => {
  await browser?.close();
  for (const site of sites) await site.close();
  await save();
});

const searchbox = page => page.getByRole('searchbox', { name: 'Search the workshop guide', exact: true });
const ids = page => page.locator('[data-raveldex-inline-result]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-raveldex-inline-result')));
async function search(page, text) { await searchbox(page).fill(text); await searchbox(page).press('Enter'); await page.waitForFunction(() => document.querySelector('.raveldex-modal[open] .raveldex-inline__status')?.textContent.includes('result')); }

test('copied installed modal browser starter loads only on open, preserves native pages and navigates literal headings at both bases', async () => {
  for (const site of sites) {
    const page = await browser.newPage(), requests = [], errors = [];
    page.on('request', request => requests.push(request.url())); page.on('pageerror', error => errors.push(error.message));
    try {
    await page.goto(site.origin + site.base);
    const trigger = page.getByRole('button', { name: 'Search documentation', exact: true }); await trigger.waitFor();
    assert.equal(requests.filter(url => url.endsWith('/content.json')).length, 0);
    assert.equal(await page.locator('dialog:modal').count(), 0);
    await trigger.click(); await searchbox(page).waitFor();
    assert.equal(await page.locator('.raveldex-inline').evaluate(node => getComputedStyle(node).getPropertyValue('--raveldex-inline-gap').trim()), '1.25rem');
    await search(page, 'workshop'); assert.match(await page.locator('.raveldex-inline__status').innerText(), /6 results/);
    assert.equal((await ids(page)).length, 3);
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-raveldex-inline-result]').length === 6);
    assert.deepEqual((await ids(page)).sort(), ['access','booking','directions','first-visit','sewing','woodworking']);
    await page.getByRole('combobox', { name: 'Topic', exact: true }).selectOption({ label: 'Tools (2)' });
    await page.waitForFunction(() => document.querySelectorAll('[data-raveldex-inline-result]').length === 2);
    assert.deepEqual((await ids(page)).sort(), ['sewing','woodworking']);
    await page.getByRole('button', { name: 'Close search', exact: true }).click(); await trigger.click(); await searchbox(page).waitFor();
    assert.equal(await searchbox(page).inputValue(), 'workshop');
    assert.match(await page.getByRole('combobox', { name: 'Topic', exact: true }).locator('option:checked').textContent(), /^Tools/);
    await page.getByRole('button', { name: 'Clear search and filters', exact: true }).click();
    await search(page, 'bobbin'); await page.getByRole('link', { name: 'Thread the machine', exact: true }).waitFor();
    assert.deepEqual(await ids(page), ['sewing']);
    const link = page.getByRole('link', { name: 'Thread the machine', exact: true });
    assert.equal(await link.getAttribute('href'), site.origin + site.base + 'guide/sewing/#threading-100%25');
    assert.equal(await page.locator('.raveldex-inline__section mark').allTextContents().then(x=>x.join('')), 'bobbin');
    assert.equal(requests.filter(url => url.endsWith('/content.json')).length, 1);
    await link.click();
    await page.getByRole('heading', { name: 'Thread the machine', exact: true }).waitFor();
    assert.equal(await page.locator(':target').getAttribute('id'), 'threading-100%');
    assert.ok(requests.every(url => url.startsWith(site.origin + site.base)));
    assert.deepEqual(errors, []);
    record(`root/help exact content and anchor ${site.base}`, { totalPages:6, ids:['access','booking','directions','first-visit','sewing','woodworking'], dataLoads:1, rawAnchor:'threading-100%', encodedAnchor:'threading-100%25', topic:'Tools', errors });
    } catch (error) { console.error('Interaction failure',site.base,error.stack); throw error; } finally { await page.close(); }
  }
});

test('no-JavaScript browse pages contain actual raw headings and no data fetch', async () => {
  const site=sites[1], context=await browser.newContext({javaScriptEnabled:false}), page=await context.newPage();
  const data=[];page.on('request',r=>{if(r.url().endsWith('/content.json'))data.push(r.url());});
  await page.goto(site.origin+site.base);
  assert.equal(await page.getByRole('navigation',{name:'Browse all guides'}).getByRole('link').count(),6);
  assert.equal(await page.getByRole('button',{name:'Search documentation'}).count(),0);
  await page.getByRole('link',{name:'Use the sewing machines',exact:true}).click();
  assert.equal(await page.getByRole('heading',{name:'Check a test stitch',exact:true}).getAttribute('id'),'stitch#check');
  assert.deepEqual(data,[]);await context.close();record('no JavaScript', {links:6,dataFetches:0,rawHeading:'stitch#check'});
});

test('first pointer loading cancellation and ready close restore the logical trigger', async () => {
  const site = sites[0], outcomes = [];
  for (const phase of ['held', 'failed', 'ready']) {
    const page = await browser.newPage(); let release = () => {}, reached;
    const requested = new Promise(resolve => { reached = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    try {
      if (phase === 'held') await page.route('**/content.json', async route => {
        reached(); await gate; await route.continue().catch(() => {});
      });
      if (phase === 'failed') await page.route('**/content.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
      await page.goto(site.origin + site.base);
      const trigger = page.getByRole('button', { name: 'Search documentation', exact: true }); await trigger.waitFor();
      assert.equal(await page.evaluate(() => document.activeElement === document.body), true, 'First pointer activation starts without a previously focused trigger');
      await trigger.click();
      if (phase === 'held') await requested;
      if (phase === 'failed') await page.getByRole('button', { name: 'Retry loading search', exact: true }).waitFor();
      if (phase === 'ready') {
        await searchbox(page).waitFor();
        assert.equal(await searchbox(page).evaluate(node => node === document.activeElement), true);
        await page.getByRole('button', { name: 'Close search', exact: true }).click();
      } else await page.getByRole('button', { name: 'Cancel loading search', exact: true }).click();
      release();
      await page.waitForTimeout(30);
      const focus = await trigger.evaluate(node => ({ trigger: node === document.activeElement,
        hiddenLoading: !!document.activeElement?.closest('dialog:not([open])'), open: document.querySelectorAll('dialog:modal').length }));
      assert.deepEqual(focus, { trigger: true, hiddenLoading: false, open: 0 });
      outcomes.push({ phase, ...focus });
    } finally { release(); await page.close(); }
  }
  record('first pointer logical opener restoration', outcomes);
});

test('failed and mixed content generations have useful retry and no partial search owner', async () => {
  const site=sites[0], page=await browser.newPage();
  await page.route('**/content.json',r=>r.fulfill({status:503,body:'unavailable'}));
  await page.goto(site.origin+site.base);await page.getByRole('button',{name:'Search documentation',exact:true}).click();
  await page.getByRole('button',{name:'Retry loading search',exact:true}).waitFor();
  assert.equal(await page.locator('.raveldex-modal').count(),0);
  await page.unroute('**/content.json');
  const mixed=JSON.parse(await readFile(join(site.directory,'content.json'),'utf8'));mixed[2].sections[0].body='Different build bobbin text';
  await page.route('**/content.json',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(mixed)}));
  await page.getByRole('button',{name:'Retry loading search',exact:true}).click();
  await page.getByRole('button',{name:'Retry loading search',exact:true}).waitFor();
  assert.equal(await page.locator('.raveldex-modal').count(),0);
  await page.unroute('**/content.json');await page.getByRole('button',{name:'Retry loading search',exact:true}).click();
  await searchbox(page).waitFor();await search(page,'stitch');
  const link=page.getByRole('link',{name:'Check a test stitch',exact:true});await link.waitFor();
  assert.equal(await link.getAttribute('href'),site.origin+site.base+'guide/sewing/#stitch%23check');
  await link.click();assert.equal(await page.locator(':target').getAttribute('id'),'stitch#check');
  await page.close();record('503 then mixed build then recovery', {partialOwners:0,rawAnchor:'stitch#check'});
});

test('delayed first-open cancellation and pagehide do not revive abandoned UI, bfcache recreates closed controller', async () => {
  const site=sites[0],page=await browser.newPage();let release,requested;
  const held=new Promise(resolve=>{requested=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/content.json',async r=>{requested();await gate;await r.continue().catch(()=>{});});
  await page.goto(site.origin+site.base);await page.getByRole('button',{name:'Search documentation',exact:true}).click();await held;
  await page.getByRole('dialog',{name:'Load documentation search'}).waitFor();
  await page.getByRole('button',{name:'Cancel loading search'}).click();
  release();await page.unroute('**/content.json');await page.waitForTimeout(30);
  assert.equal(await page.locator('dialog:modal').count(),0);assert.equal(await page.locator('.raveldex-modal').count(),0);
  await page.getByRole('button',{name:'Search documentation',exact:true}).click();await searchbox(page).waitFor();
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
  assert.equal(await page.locator('.raveldex-modal').count(),0);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  assert.equal(await page.locator('dialog:modal').count(),0);
  await page.getByRole('button',{name:'Search documentation',exact:true}).click();await searchbox(page).waitFor();
  await page.close();record('delayed cancellation, pagehide and bfcache', {abandonedModal:0,restoredClosed:true});
});

test('exact controller owns late and reentrant engines once, deduplicates current opens, preserves Nodes and reset policy', async () => {
  const site=sites[0],page=await browser.newPage();await page.goto(site.origin+site.base);
  const outcomes=await page.evaluate(async base=>{
    const {createDocumentationSearch,createRaveldex,createFacets,mountRaveldexModal}=await import(base+'assets/lifecycle.js');
    const nodes=()=>{
      const root=document.createElement('div'),trigger=document.createElement('button'),loadingDialog=document.createElement('dialog'),status=document.createElement('p'),retry=document.createElement('button'),cancel=document.createElement('button');
      trigger.textContent='Probe trigger';cancel.dataset.searchCancel='';cancel.textContent='Cancel';retry.textContent='Retry';loadingDialog.append(status,retry,cancel);
      const original=document.createTextNode('Exact fallback');root.append(original);document.body.append(trigger,root,loadingDialog);
      return {root,trigger,loadingDialog,status,retry,original};
    };
    const owner=async()=>{
      const engine=createRaveldex({schema:{text:{body:{}},metadata:{category:{type:'string'}}},addons:[createFacets({fields:['category']})]});
      await engine.addMany([{id:'x',text:{body:'bobbin workshop'},metadata:{category:'Tools'}}]);let disposed=0;
      return {engine,documents:[{id:'x',title:'Bobbin project',url:'/guide/'}],dispose:async()=>{disposed++;await engine.dispose();},count:()=>disposed};
    };
    const cleanup=async(n,c)=>{await c.destroy();n.trigger.remove();n.root.remove();n.loadingDialog.remove();};
    const results=[];
    {
      const n=nodes(),o=await owner();let release,signal;const gate=new Promise(r=>{release=r;});
      const c=createDocumentationSearch({...n,load:async s=>{signal=s;await gate;return o;}});
      const pending=c.open(),deduplicated=pending===c.open();await Promise.resolve();const ended=c.destroy(),same=ended===c.destroy();release();await ended;await pending;
      results.push({case:'destroy late',deduplicated,same,aborted:signal.aborted,disposed:o.count(),restored:n.root.firstChild===n.original,modal:n.root.querySelectorAll('dialog').length});await cleanup(n,c);
    }
    {
      const n=nodes(),a=await owner(),b=await owner();let release,attempt=0;const gate=new Promise(r=>{release=r;});
      const c=createDocumentationSearch({...n,load:async()=>++attempt===1?(await gate,a):b});
      const first=c.open();await Promise.resolve();c.close();const next=c.open();await next;release();await first;
      results.push({case:'rapid reopen',attempt,oldDisposed:a.count(),newDisposedBefore:b.count(),open:!!n.root.querySelector('dialog:modal')});await cleanup(n,c);results.at(-1).newDisposedAfter=b.count();
    }
    {
      const n=nodes(),a=await owner(),b=await owner();let release,attempt=0;const gate=new Promise(r=>{release=r;});let c,reopened;
      c=createDocumentationSearch({...n,load:async signal=>{if(++attempt===1){signal.addEventListener('abort',()=>{reopened=c.open();},{once:true});await gate;return a;}return b;}});
      const first=c.open();await Promise.resolve();c.close();await reopened;release();await first;
      results.push({case:'abort reopen',attempt,oldDisposed:a.count(),open:!!n.root.querySelector('dialog:modal')});await cleanup(n,c);results.at(-1).newDisposedAfter=b.count();
    }
    {
      const n=nodes(),a=await owner(),b=await owner();let release,attempt=0;const gate=new Promise(r=>{release=r;});
      const c=createDocumentationSearch({...n,load:async()=>++attempt===1?(await gate,a):b});const first=c.open();await Promise.resolve();n.loadingDialog.close();const second=c.open();await second;release();await first;
      results.push({case:'raw close immediate reopen',attempt,oldDisposed:a.count(),open:!!n.root.querySelector('dialog:modal')});await cleanup(n,c);
    }
    {
      const n=nodes(),o=await owner(),c=createDocumentationSearch({...n,resetOnClose:true,load:async()=>o});
      await c.open();const input=n.root.querySelector('input[type=search]');input.value='bobbin';input.dispatchEvent(new Event('input',{bubbles:true}));c.close();await c.open();
      results.push({case:'reset',value:input.value});await cleanup(n,c);
    }
    {
      const n=nodes(),o=await owner(),opener=document.createElement('button');opener.textContent='Actual opener';document.body.append(opener);opener.focus();
      const c=createDocumentationSearch({...n,load:async()=>o});await c.open();c.close();results.push({case:'actual opener',restored:document.activeElement===opener});await cleanup(n,c);opener.remove();
    }
    {
      const n=nodes(),a=await owner(),b=await owner();let release,attempt=0,reopened;
      const gate=new Promise(resolve=>{release=resolve;});
      const c=createDocumentationSearch({...n,load:async()=>++attempt===1?(await gate,a):b});
      n.trigger.focus();const first=c.open();await Promise.resolve();
      n.trigger.addEventListener('focus',()=>{reopened=c.open();},{once:true});
      c.close();await reopened;release();await first;
      results.push({case:'focus reopen',attempt,oldDisposed:a.count(),open:!!n.root.querySelector('dialog:modal'),inputFocused:n.root.querySelector('input')===document.activeElement});
      await cleanup(n,c);results.at(-1).newDisposedAfter=b.count();
    }
    {
      const n=nodes(),a=await owner(),b=await owner();let attempts=0;
      const c=createDocumentationSearch({...n,load:async()=>++attempts===1?{...a,pageSections:{kind:'foreign'}}:b});
      await c.open();const visibleRetry=n.loadingDialog.open&&!n.retry.hidden;
      const failedDisposed=a.count();await c.open();
      results.push({case:'mount failure retry',attempts,visibleRetry,failedDisposed,open:!!n.root.querySelector('dialog:modal')});await cleanup(n,c);results.at(-1).disposed=b.count();
    }
    {
      const n=nodes(),o=await owner();const ui=mountRaveldexModal({root:n.root,trigger:n.trigger,engine:o.engine,documents:o.documents});ui.open();ui.destroy();
      const stillWorks=(await o.engine.search('bobbin')).total;
      results.push({case:'borrowed',disposed:o.count(),stillWorks});await o.dispose();n.trigger.remove();n.root.remove();n.loadingDialog.remove();
    }
    return results;
  },site.base);
  assert.deepEqual(outcomes,[
    {case:'destroy late',deduplicated:true,same:true,aborted:true,disposed:1,restored:true,modal:0},
    {case:'rapid reopen',attempt:2,oldDisposed:1,newDisposedBefore:0,open:true,newDisposedAfter:1},
    {case:'abort reopen',attempt:2,oldDisposed:1,open:true,newDisposedAfter:1},
    {case:'raw close immediate reopen',attempt:2,oldDisposed:1,open:true},
    {case:'reset',value:''}, {case:'actual opener',restored:true},
    {case:'focus reopen',attempt:2,oldDisposed:1,open:true,inputFocused:true,newDisposedAfter:1},
    {case:'mount failure retry',attempts:2,visibleRetry:true,failedDisposed:1,open:true,disposed:1}, {case:'borrowed',disposed:0,stillWorks:1}
  ]);
  record('direct genuine-owner lifecycle probes',outcomes);await page.close();
});

test('authored status disconnection can destroy during initial or failure text without reopening a loading dialog or retry', async () => {
  const site=sites[0],page=await browser.newPage();await page.goto(site.origin+site.base);
  const cases=await page.evaluate(async base=>{
    const {createDocumentationSearch,createRaveldex}=await import(base+'assets/lifecycle.js');
    const outcomes=[];
    for(const stage of ['initial','failure']) {
      const root=document.createElement('div'),trigger=document.createElement('button'),loadingDialog=document.createElement('dialog'),status=document.createElement('p'),retry=document.createElement('button'),cancel=document.createElement('button');
      cancel.dataset.searchCancel='';loadingDialog.append(status,retry,cancel);document.body.append(trigger,root,loadingDialog);
      let controller,disposal,loads=0;
      const tag='modal-status-destroy-'+stage;
      customElements.define(tag,class extends HTMLElement { disconnectedCallback(){disposal=controller.destroy();} });
      const child=document.createElement(tag);
      if(stage==='initial')status.append(child);
      controller=createDocumentationSearch({root,trigger,loadingDialog,status,retry,load:async()=>{loads++;status.append(child);throw new Error('Unavailable');}});
      await controller.open();await disposal;
      outcomes.push({stage,loads,open:loadingDialog.open,retryHidden:retry.hidden,stable:disposal===controller.destroy(),mounted:root.querySelectorAll('.raveldex-modal').length});
      trigger.click();await Promise.resolve();outcomes.at(-1).loadsAfterTrigger=loads;
      trigger.remove();root.remove();loadingDialog.remove();
    }
    {
      const root=document.createElement('div'),trigger=document.createElement('button'),loadingDialog=document.createElement('dialog'),status=document.createElement('p'),retry=document.createElement('button'),cancel=document.createElement('button');
      cancel.dataset.searchCancel='';loadingDialog.append(status,retry,cancel);document.body.append(trigger,root,loadingDialog);
      const engine=createRaveldex({schema:{text:{body:{}}}});let loads=0,disposed=0,release,disposal,controller;
      const gate=new Promise(resolve=>{release=resolve;});
      controller=createDocumentationSearch({root,trigger,loadingDialog,status,retry,load:async signal=>{
        loads++;signal.addEventListener('abort',()=>{disposal=controller.destroy();status.textContent='Destroyed by abort';},{once:true});
        await gate;return {engine,documents:[],dispose:async()=>{disposed++;await engine.dispose();}};
      }});
      const pending=controller.open();await Promise.resolve();loadingDialog.close();await controller.open();
      const afterAbort=status.textContent;release();await pending;await disposal;
      outcomes.push({stage:'raw close abort destroy',loads,disposed,open:loadingDialog.open,retryHidden:retry.hidden,afterAbort});
      trigger.remove();root.remove();loadingDialog.remove();
    }
    return outcomes;
  },site.base);
  assert.deepEqual(cases,[{stage:'initial',loads:0,open:false,retryHidden:true,stable:true,mounted:0,loadsAfterTrigger:0},{stage:'failure',loads:1,open:false,retryHidden:true,stable:true,mounted:0,loadsAfterTrigger:1},{stage:'raw close abort destroy',loads:1,disposed:1,open:false,retryHidden:true,afterAbort:'Destroyed by abort'}]);
  record('authored status reentry',cases);await page.close();
});


test('copied content preparation and build refuse unusable titles and blank section headings without replacing useful pages', async () => {
  const site = sites[0], contentPath = join(site.directory, 'content.json');
  const original = await readFile(contentPath, 'utf8');
  const output = await readFile(join(site.directory, 'dist/index.html'), 'utf8');
  const { preparePages } = await import(pathToFileURL(join(site.directory, 'content.mjs')).href);
  const valid = JSON.parse(original); valid[0].title = '  A valid authored title  ';
  assert.equal(preparePages(valid)[0].title, valid[0].title, 'Valid title whitespace is preserved');
  try {
    for (const title of ['', ' \t ', 'x'.repeat(1025), '\ud800']) {
      const content = JSON.parse(original); content[0].title = title;
      assert.throws(() => preparePages(content), /Invalid or duplicate page/);
      await writeFile(contentPath, JSON.stringify(content));
      await assert.rejects(command(process.execPath, ['build.mjs'], site.directory), /Invalid or duplicate page/);
      assert.equal(await readFile(join(site.directory, 'dist/index.html'), 'utf8'), output);
    }
    const invalidHeading = JSON.parse(original); invalidHeading[0].sections[0].heading = ' \t ';
    assert.throws(() => preparePages(invalidHeading), /Invalid or duplicate section/);
    await writeFile(contentPath, JSON.stringify(invalidHeading));
    await assert.rejects(command(process.execPath, ['build.mjs'], site.directory), /Invalid or duplicate section/);
    assert.equal(await readFile(join(site.directory, 'dist/index.html'), 'utf8'), output);
  } finally {
    await writeFile(contentPath, original);
    await command(process.execPath, ['build.mjs'], site.directory);
    await build({ absWorkingDir: site.directory, entryPoints: ['lifecycle-entry.mjs'], outfile: 'dist/assets/lifecycle.js',
      bundle: true, platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent' });
  }
  record('unusable title content/build refusal', { cases: ['empty', 'whitespace', 'overlong', 'malformed UTF-16'], priorOutputPreserved: true, validWhitespacePreserved: true, sharedBuildAndLoadValidation: true, blankSectionHeadingRefused: true });
});
