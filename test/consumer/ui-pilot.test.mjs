import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { chromium } from 'playwright-core';
import { prepareUIPilot } from '../../scripts/lib/ui-consumer.mjs';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../oracle/phrases.mjs';

let pilot, browser, page, server, origin;
const observations = [];
before(async () => {
  pilot = await prepareUIPilot();
  const files = { '/': ['index.html', 'text/html'], '/main.mjs': ['main.mjs', 'text/javascript'],
    '/engine-worker.mjs': ['engine-worker.mjs', 'text/javascript'], '/ui.css': ['ui.css', 'text/css'], '/pilot.css': ['pilot.css', 'text/css'], '/corpus.json': ['corpus.json', 'application/json'] };
  server = createServer(async (request, response) => {
    const file = files[new URL(request.url, 'http://localhost').pathname];
    if (!file) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', file[1]); response.end(await readFile(join(pilot.directory, file[0])));
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(process.env.RAVELDEX_UI_BROWSER === 'chromium' ? {} : { channel: 'chrome' }), headless: true });
  page = await browser.newPage({ viewport: { width: 1080, height: 900 }, reducedMotion: 'reduce' });
}, { timeout: 120_000 });
after(async () => {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
  if (process.env.RAVELDEX_UI_PILOT_REPORT && pilot) {
    const target = resolve(process.env.RAVELDEX_UI_PILOT_REPORT); await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify({ ...pilot.report, browser: { version: browser.version(),
      channel: process.env.RAVELDEX_UI_BROWSER ?? 'chrome', headless: true }, observations,
      unrun: ['screen-reader observations', 'real OS IME', 'cross-browser qualification', 'physical latency/heap'] }, null, 2) + '\n');
  }
});
async function settled() {
  await page.waitForFunction(() => document.querySelector('[data-pilot-search]')?.dataset.pilotState === 'ready');
  await page.waitForFunction(() => document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') === 'false'
    && /result|failed/i.test(document.querySelector('[data-raveldex-status]')?.textContent ?? ''));
}
async function submit(text) {
  const input = page.locator('[data-raveldex-input]'); await input.fill(text); await input.press('Enter'); await settled();
}
async function observed() {
  return { status: await page.locator('[data-raveldex-status]').innerText(),
    hits: await page.locator('[data-raveldex-result]').evaluateAll(nodes => nodes.map(node => ({
      id: node.dataset.raveldexResult, score: Number(node.querySelector('[data-raveldex-score]').textContent.slice(6)),
      title: node.querySelector('a').textContent, url: node.querySelector('a').href,
    }))) };
}
function compare(actual, expected) {
  assert.equal(actual.status, expected.total === 0 ? 'No results. Try a different search.' : `${expected.total} ${expected.total === 1 ? 'result' : 'results'}. Showing 1–${expected.hits.length}.`);
  assert.deepEqual(actual.hits.map(hit => hit.id), expected.hits.map(hit => hit.id));
  for (let i = 0; i < actual.hits.length; i++) {
    assert.ok(Math.abs(actual.hits[i].score - expected.hits[i].score) <= Math.max(1e-12, Math.abs(expected.hits[i].score) * 1e-12));
    const section = pilot.corpus.sections.find(item => item.id === actual.hits[i].id);
    assert.equal(actual.hits[i].title, section.title); assert.equal(actual.hits[i].url, section.sourceUrl);
  }
}

test('a real worker failure offers explicit restart or direct search and preserves the query on recovery', async () => {
  const context = await browser.newContext({viewport:{width:390,height:850},reducedMotion:'reduce'});
  await context.addInitScript(() => {
    const NativeWorker = window.Worker; window.fixtureWorkers = []; window.fixtureWorkerErrors = [];
    window.Worker = class extends NativeWorker { constructor(...args) { super(...args); window.fixtureWorkers.push(this); this.addEventListener('error', event=>{window.fixtureWorkerErrors.push(event.message);event.preventDefault();}); } };
  });
  const view = await context.newPage(); view.setDefaultTimeout(8000);
  await view.route('**/engine-worker.mjs*', async route => {
    const response = await route.fetch();
    await route.fulfill({response,body:await response.text()+'\nself.addEventListener("message", event => { if(event.data?.fixtureCrash) throw new Error("Intentional recovery worker failure"); });'});
  });
  const ready = () => view.waitForFunction(()=>document.querySelector('[data-pilot-search]')?.dataset.pilotState==='ready'&&document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy')==='false');
  try {
    await view.goto(origin); await ready(); await view.getByText('Advanced demo settings', {exact:true}).click();
    await view.locator('[data-pilot-execution]').selectOption('worker'); await ready();
    const field=view.locator('[data-raveldex-input]'); await field.fill('term contribution'); await field.press('Enter'); await ready();
    const before=await view.locator('[data-raveldex-result]').evaluateAll(nodes=>nodes.map(n=>n.dataset.raveldexResult)); assert.ok(before.length);
    await view.evaluate(()=>window.fixtureWorkers[0].postMessage({fixtureCrash:true}));
    await view.waitForFunction(()=>window.fixtureWorkerErrors.length===1);
    await field.press('Enter'); await view.waitForFunction(()=>document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy')==='false');
    assert.match(await view.locator('[data-pilot-status]').textContent(), /Background search stopped/);
    assert.match(await view.locator('[data-pilot-status]').textContent(), /This page/);
    assert.equal(await view.locator('[data-pilot-retry]').isVisible(),true);
    assert.equal(await field.evaluate(n=>n===document.activeElement),true);
    await view.locator('[data-pilot-diagnostics] summary').click(); assert.match(await view.locator('[data-pilot-error]').textContent(), /DISPOSED|TERMINATED/);
    if(process.env.RAVELDEX_UI_PILOT_REPORT) await view.screenshot({path:resolve(process.env.RAVELDEX_UI_PILOT_REPORT.replace(/\.json$/,'')+'-worker-recovery.png'),fullPage:true});
    const restart=view.locator('[data-pilot-retry]'); await restart.focus(); await restart.press('Enter');
    assert.equal(await restart.evaluate(n=>n===document.activeElement&&!n.hidden),true,'Restart must not hide the focused action');
    await ready(); assert.equal(await restart.evaluate(n=>n===document.activeElement&&!n.hidden),true);
    await field.focus(); assert.equal(await restart.isVisible(),false);
    assert.equal(await field.inputValue(),'term contribution'); assert.deepEqual(await view.locator('[data-raveldex-result]').evaluateAll(nodes=>nodes.map(n=>n.dataset.raveldexResult)),before);
    assert.equal(await view.locator('[data-pilot-execution]').inputValue(),'worker');
    assert.equal(await view.evaluate(()=>window.fixtureWorkers.length),2); assert.equal(await view.locator('[data-pilot-diagnostics]').isVisible(),false);
    observations.push({name:'actual worker crash and explicit owned restart',query:'term contribution',sameIDs:before,workers:2,implicitFallback:false,focus:'input until explicit retry'});
  } finally { await context.close(); }
});

async function readFailureFixture() {
  const context=await browser.newContext();
  await context.addInitScript(()=>{
    const NativeWorker=window.Worker, timer=window.setTimeout.bind(window);
    window.fixtureWorkers=[];window.fixtureReadFault=null;window.fixtureHeldRead=null;
    window.setTimeout=(callback,ms,...args)=>timer(callback,window.fixtureReadFault==='timeout'&&ms===65000?25:ms,...args);
    window.Worker=class extends NativeWorker {
      constructor(...args){super(...args);window.fixtureWorkers.push(this);}
      postMessage(message,...args){
        if(message.operation==='search'&&window.fixtureReadFault){
          const fault=window.fixtureReadFault;window.fixtureReadFault=null;
          if(fault==='send')throw new DOMException('Controlled single-read send refusal','DataCloneError');
          if(fault==='hold'){window.fixtureHeldRead={worker:this,message};return;}
          if(fault==='limit'||fault==='invalid'){queueMicrotask(()=>window.fixtureReadError(this,message,fault==='limit'?'TRANSPORT_LIMIT':'INVALID_TRANSPORT'));return;}
          if(fault==='timeout')return;
        }
        return super.postMessage(message,...args);
      }
    };
    window.fixtureReadError=(worker,message,code)=>worker.dispatchEvent(new MessageEvent('message',{data:{protocol:message.protocol,session:message.session,id:message.id,operation:message.operation,kind:'error',value:{name:'WorkerAdapterError',code,details:{}}}}));
    window.fixtureReleaseRead=()=>{const held=window.fixtureHeldRead;window.fixtureHeldRead=null;window.fixtureReadError(held.worker,held.message,'DISPOSED');};
  });
  const view=await context.newPage();view.setDefaultTimeout(8000);await view.goto(origin);
  const ready=()=>view.waitForFunction(()=>document.querySelector('[data-pilot-search]')?.dataset.pilotState==='ready'&&document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy')==='false');
  await ready();await view.getByText('Advanced demo settings',{exact:true}).click();await view.locator('[data-pilot-execution]').selectOption('worker');await ready();
  const field=view.locator('[data-raveldex-input]');
  const submit=async(text)=>{await field.fill(text);await field.press('Enter');await view.waitForFunction(()=>document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy')==='false');};
  return{context,view,field,ready,submit};
}

for(const [fault,code]of [['send','TERMINATED'],['invalid','INVALID_TRANSPORT'],['timeout','TIMEOUT'],['limit','TRANSPORT_LIMIT']]) test(`per-read ${code} keeps explicit retry on the same real worker with the original code`,async()=>{
    const f=await readFailureFixture();try{
      await f.view.evaluate(fault=>window.fixtureReadFault=fault,fault);await f.submit('term contribution');
      assert.match(await f.view.locator('[data-pilot-status]').textContent(),/could not complete this request/);
      assert.equal(await f.view.locator('[data-pilot-search]').getAttribute('data-pilot-state'),'ready');
      await f.view.locator('[data-pilot-diagnostics] summary').click();assert.equal(await f.view.locator('[data-pilot-error]').textContent(),code);
      assert.equal(await f.view.locator('[data-raveldex-submit]').isEnabled(),true);
      await f.submit('term contribution');await f.ready();assert.ok(await f.view.locator('[data-raveldex-result]').count());
      assert.equal(await f.view.evaluate(()=>window.fixtureWorkers.length),1);assert.equal(await f.view.locator('[data-pilot-diagnostics]').isVisible(),false);
      observations.push({name:'single-read refusal with usable worker',fault,code,workers:1,retry:'explicit Search',timer: fault==='timeout'?'one adapter timer shortened to 25ms':'ordinary'});
    }finally{await f.context.close();}
});

for(const phase of ['new-query','closed-inspector']) test(`an aborted older read cannot publish a late worker refusal after ${phase}`,async()=>{
    const f=await readFailureFixture();try{
      await f.submit('term contribution');await f.ready();
      await f.view.evaluate(()=>window.fixtureReadFault='hold');
      if(phase==='new-query'){await f.field.fill('obsolete');await f.field.press('Enter');}
      else await f.view.locator('[data-raveldex-inspect]').click();
      await f.view.waitForFunction(()=>window.fixtureHeldRead!==null);
      if(phase==='new-query'){await f.submit('term contribution');await f.ready();}
      else await f.view.locator('[data-raveldex-inspector-close]').click();
      await f.view.evaluate(()=>window.fixtureReleaseRead());await f.view.evaluate(()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok))));
      assert.equal(await f.view.locator('[data-pilot-search]').getAttribute('data-pilot-state'),'ready');
      assert.match(await f.view.locator('[data-pilot-status]').textContent(),/Search is ready/);
      assert.equal(await f.view.locator('[data-pilot-diagnostics]').isVisible(),false);
      assert.equal(await f.field.inputValue(),'term contribution');assert.ok(await f.view.locator('[data-raveldex-result]').count());
      observations.push({name:'aborted read refusal discarded',phase,workers:1});
    }finally{await f.context.close();}
});

test('real packaged documentation UI preserves judged tasks, source links, Inspector, representations and cleanup', async () => {
  const errors = [], external = [], workers = [];
  page.on('worker', worker => workers.push(worker.url()));
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => { if (!request.url().startsWith(origin)) external.push(request.url()); });
  await page.goto(origin); await settled();
  await page.getByText('Advanced demo settings', { exact: true }).click();
  const scan = scanSourceCorpus(pilot.corpus.records, pilot.corpus.schema);
  for (const query of ['term contribution', 'original source', 'atomic batch', 'How do I stop an operation that is waiting in the queue?']) {
    await submit(query); const actual = await observed();
    compare(actual, sourceQueryResult(scan, { kind: 'text', text: query }, { limit: 5 }));
    observations.push({ query, representation: 'source', mode: 'text', ...actual, statusResult: 'Pass' });
  }
  await submit('term contribution');
  const textSource = await observed();
  await page.locator('[data-raveldex-inspect]').click();
  await page.waitForFunction(() => document.querySelector('[data-raveldex-inspector-data]')?.textContent.includes('raveldex-inspector-v1'));
  const facts = JSON.parse(await page.locator('[data-raveldex-inspector-data]').innerText());
  assert.equal(facts.revision, 1);
  assert.equal(facts.result.total, sourceQueryResult(scan, { kind: 'text', text: 'term contribution' }, { limit: 5 }).total);
  assert.ok(facts.trace.facts.some(fact => fact.kind === 'field'));
  observations.push({ name: 'actual real-document Inspector', revision: facts.revision, total: facts.result.total, facts: facts.trace.facts.length });
  await page.keyboard.press('Escape');
  await page.locator('[data-pilot-representation]').selectOption('offsets'); await settled();
  assert.equal(await page.locator('[data-raveldex-input]').inputValue(), 'term contribution');
  assert.deepEqual(await observed(), textSource);
  observations.push({ name: 'text source / stored offsets complete displayed page parity', ...textSource });
  await page.locator('[data-pilot-mode]').selectOption('phrase'); await settled(); await submit('commit point');
  const phrasePositions = await observed();
  const phraseScan = scanPhraseSourceCorpus(pilot.corpus.records, pilot.corpus.schema);
  compare(phrasePositions, sourcePhraseQueryResult(phraseScan, { kind: 'phrase', text: 'commit point' }, { limit: 5 }));
  await page.locator('[data-pilot-representation]').selectOption('source'); await settled();
  assert.deepEqual(await observed(), phrasePositions);
  observations.push({ query: 'commit point', mode: 'phrase', representation: 'source / positions', ...phrasePositions, statusResult: 'Pass' });
  const link = page.locator('[data-raveldex-result-title]').first();
  const href = await link.getAttribute('href');
  await page.route(href.split('#')[0], route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Intercepted source navigation</title><h1>Source navigation destination</h1>' }));
  await link.click(); await page.waitForURL(href);
  assert.equal(page.url(), href);
  observations.push({ name: 'native source-link navigation', href, remotePageFetched: false,
    boundary: 'Navigation observed; target response intercepted locally, GitHub source rendering unrun.' });
  await page.goto(origin); await settled();
  await page.getByText('Advanced demo settings', { exact: true }).click();
  await page.locator('[data-pilot-destroy]').click();
  await page.waitForFunction(() => document.querySelector('[data-pilot-search]')?.dataset.pilotState === 'stopped');
  assert.equal(await page.locator('[data-raveldex-ui]').count(), 0);
  await page.locator('[data-pilot-initialize]').click(); await settled();
  await page.evaluate(() => { const select = document.querySelector('[data-pilot-representation]');
    for (const value of ['offsets', 'source', 'offsets']) { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); } });
  await settled();
  assert.equal(await page.locator('[data-raveldex-ui]').count(), 1);
  assert.equal(await page.locator('[data-pilot-representation]').inputValue(), 'offsets');
  await submit('term contribution'); compare(await observed(), sourceQueryResult(scan, { kind: 'text', text: 'term contribution' }, { limit: 5 }));
  observations.push({ name: 'destroy / reinitialize / rapid representation transitions', interfaces: 1, latestRepresentation: 'offsets' });
  const directPage = await observed();
  await page.locator('[data-pilot-execution]').selectOption('worker'); await settled();
  assert.equal(await page.locator('[data-pilot-execution]').inputValue(), 'worker');
  assert.ok(workers.some(url => new URL(url).pathname === '/engine-worker.mjs'), 'The real module worker was created');
  assert.deepEqual(await observed(), directPage);
  await page.locator('[data-raveldex-inspect]').click();
  await page.waitForFunction(() => document.querySelector('[data-raveldex-inspector-data]')?.textContent.includes('raveldex-inspector-v1'));
  const workerFacts = JSON.parse(await page.locator('[data-raveldex-inspector-data]').innerText());
  assert.equal(workerFacts.revision, 1); assert.equal(workerFacts.result.total, sourceQueryResult(scan, { kind: 'text', text: 'term contribution' }, { limit: 5 }).total);
  await page.keyboard.press('Escape');
  await page.locator('[data-pilot-mode]').selectOption('phrase'); await settled(); await submit('commit point');
  compare(await observed(), sourcePhraseQueryResult(phraseScan, { kind: 'phrase', text: 'commit point' }, { limit: 5 }));
  observations.push({ name: 'real-document worker text/phrase/Inspector parity', facts: workerFacts.trace.facts.length, ...await observed() });
  await page.locator('[data-pilot-execution]').selectOption('direct'); await settled();
  assert.equal(await page.locator('[data-pilot-execution]').inputValue(), 'direct');
  assert.equal(await page.locator('[data-raveldex-ui]').count(), 1);

  assert.deepEqual(errors, []);
  // The only external request was the explicitly intercepted native navigation.
  assert.ok(external.every(url => url.split('#')[0] === href.split('#')[0]));
  observations.push({ name: 'network boundary', sourceNavigation: external, otherExternalRequests: 0 });
  if (process.env.RAVELDEX_UI_SCREENSHOTS) {
    await mkdir(resolve(process.env.RAVELDEX_UI_SCREENSHOTS), { recursive: true });
    await page.screenshot({ path: join(resolve(process.env.RAVELDEX_UI_SCREENSHOTS), 'rx-2006-docs-desktop.png'), fullPage: true });
  }
}, { timeout: 90_000 });
