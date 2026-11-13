import assert from 'node:assert/strict';
import { test, before, beforeEach, afterEach, after } from 'node:test';
import { createServer } from 'node:http';
import { copyFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { platform, release, arch } from 'node:os';
import { gzipSync } from 'node:zlib';
import { build, version as esbuildVersion } from 'esbuild';
import { chromium } from 'playwright-core';
import { prepareConsumer, command, digest, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';
import { contrast } from '../helpers/contrast.mjs';

let consumer, browser, server, origin, context, page, errors;
const defaults = { facets: [{ field: 'category', label: 'Category' }], snippetFields: ['body'] };
const expected = Array.from({ length: 12 }, (_, i) => `item-${String(i).padStart(2, '0')}`);
const report = { kind: 'raveldex-inline-controls-browser-v1', startedAt: new Date().toISOString(), observations: [], screenshots: [],
  environment: { node: process.version, os: { platform: platform(), release: release(), arch: arch() }, esbuild: esbuildVersion },
  limits: { assistiveTechnology: 'Not run; automated DOM and axe observations only.', physicalIME: 'Not run; synthetic composition regression remains in the foundation suite.',
    zoomAndTouch: 'Actual browser zoom, physical touch and on-screen keyboard not run.', memory: 'Not measured. Bundle bytes and DOM counts are not retained/peak memory.' } };
const root = () => page.locator('#controls-root');
const part = name => root().locator(`.raveldex-inline__${name}`);
const ids = () => part('result').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-raveldex-inline-result')));
const observation = (name, evidence) => report.observations.push({ name, status: 'Pass', evidence });
async function open(options = {}, setup = {}) {
  await page.evaluate(async ({ options, setup, defaults }) => { await window.controlsHarness?.cleanup(); await window.createControlsFixture({ ...defaults, ...options }, setup); }, { options, setup, defaults });
}
async function search(value = 'source prov') { await page.evaluate(text => window.controlsHarness.handle.search(text), value); }
async function settled() { await page.waitForFunction(() => document.querySelector('#controls-root .raveldex-inline')?.getAttribute('aria-busy') === 'false'); }
async function activate(name) { await root().getByRole('button', { name, exact: true }).click(); await settled(); }
async function snippets() {
  return part('result').evaluateAll(nodes => nodes.map(item => ({ id: item.getAttribute('data-raveldex-inline-result'),
    snippets: [...item.querySelectorAll('.raveldex-inline__snippet')].map(node => ({
      text: [...node.childNodes].filter(child => !(child instanceof Element && child.getAttribute('aria-hidden') === 'true')).map(child => child.textContent).join(''),
      marks: [...node.querySelectorAll('mark')].map(mark => mark.textContent),
    })), omissions: item.querySelector('.raveldex-inline__snippet-omissions')?.textContent ?? '' })));
}
async function selectCategory(label) {
  const value = await part('facet').locator('option').evaluateAll((nodes, label) => nodes.find(node => node.textContent.startsWith(label + ' ('))?.value, label);
  assert.notEqual(value, undefined, `category option ${label}`); await part('facet').selectOption(value); await settled();
}
async function save() {
  if (!process.env.RAVELDEX_INLINE_CONTROLS_REPORT) return;
  const path = resolve(process.env.RAVELDEX_INLINE_CONTROLS_REPORT); await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2) + '\n');
}
async function screenshot(name) {
  if (!process.env.RAVELDEX_INLINE_CONTROLS_REPORT) return;
  const path = resolve(process.env.RAVELDEX_INLINE_CONTROLS_REPORT.replace(/\.json$/, '') + `-${name}.png`);
  await mkdir(dirname(path), { recursive: true }); await page.screenshot({ path, fullPage: true });
  report.screenshots.push({ name, path, viewport: page.viewportSize() });
}

before(async () => {
  consumer = await prepareConsumer([], []);
  for (const [from, to] of [['inline-controls-fixture.mjs', 'controls-entry.mjs'], ['inline-controls-worker.mjs', 'inline-controls-worker.mjs']])
    await copyFile(join(REPO_ROOT, 'test/ui', from), join(consumer.directory, to));
  const settings = { absWorkingDir: consumer.directory, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true,
    treeShaking: true, legalComments: 'none', metafile: true, logLevel: 'silent' };
  const product = await build({ ...settings, entryPoints: ['controls-entry.mjs'], outfile: join(consumer.directory, 'fixture.mjs') });
  await build({ ...settings, entryPoints: ['inline-controls-worker.mjs'], outfile: join(consumer.directory, 'controls-worker.mjs') });
  for (const path of Object.keys(product.metafile.inputs)) assert.ok(['controls-entry.mjs', 'inline-controls-worker.mjs'].includes(path)
    || path.startsWith('node_modules/@vmitsaras/raveldex/dist/'), `foreign fixture source ${path}`);
  await writeFile(join(consumer.directory, 'inline-entry.mjs'), "export { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';\n");
  const inline = await build({ ...settings, entryPoints: ['inline-entry.mjs'], outfile: join(consumer.directory, 'inline.mjs') });
  const graph = Object.keys(inline.metafile.inputs);
  assert.ok(graph.every(path => path === 'inline-entry.mjs' || path.includes('/addons/ui/') || path.endsWith('/addons/sections/validation.js') || path.endsWith('/core/contracts/data.js') || path.endsWith('/core/errors/error.js')),
    'inline stays isolated from engine/provider implementations');
  const bytes = await readFile(join(consumer.directory, 'inline.mjs'));
  const css = await readFile(join(consumer.installed, 'dist/addons/ui/inline.css')); await writeFile(join(consumer.directory, 'inline.css'), css);
  await copyFile(join(REPO_ROOT, 'test/consumer/inline-types.ts'), join(consumer.directory, 'inline-types.ts'));
  await writeFile(join(consumer.directory, 'inline-tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM'], types: [], strict: true,
    noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, verbatimModuleSyntax: true, skipLibCheck: false, noEmit: true,
  }, include: ['inline-types.ts'] }));
  await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', join(consumer.directory, 'inline-tsconfig.json')], consumer.directory);
  report.package = consumer.package;
  report.graph = { inputs: graph, minifiedBytes: bytes.length, gzipBytes: gzipSync(bytes).length, sha256: digest(bytes), cssBytes: css.length,
    cssSha256: digest(css), publicTypes: 'Pass' };
  await writeFile(join(consumer.directory, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inline controls verification</title><link rel="stylesheet" href="/inline.css"></head><body><main><h1>Inline search controls</h1><div id="controls-root"><p id="authored">Browse the guides</p></div></main><script type="module" src="/fixture.mjs"></script></body></html>');
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const file = { '/': 'index.html', '/fixture.mjs': 'fixture.mjs', '/controls-worker.mjs': 'controls-worker.mjs', '/inline.css': 'inline.css' }[path];
    if (!file) { response.writeHead(404); response.end(); return; }
    try { response.setHeader('content-type', file.endsWith('.css') ? 'text/css' : file.endsWith('.mjs') ? 'text/javascript' : 'text/html');
      response.setHeader('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self'; img-src 'none'");
      response.end(await readFile(join(consumer.directory, file)));
    } catch { response.writeHead(500); response.end(); }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); }); origin = `http://127.0.0.1:${server.address().port}`;
  const channel = process.env.RAVELDEX_UI_BROWSER ?? 'chrome'; assert.ok(['chrome', 'chromium'].includes(channel));
  browser = await chromium.launch({ ...(channel === 'chrome' ? { channel: 'chrome' } : {}), headless: true });
  report.environment.browser = { channel, version: browser.version(), headless: true };
  console.log(JSON.stringify({ kind: report.kind, graph: report.graph, browser: report.environment.browser }));
}, { timeout: 120_000 });
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 1100, height: 850 }, reducedMotion: 'reduce' });
  page = await context.newPage(); errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin); await page.waitForFunction(() => typeof window.createControlsFixture === 'function'); await open();
});
afterEach(async () => { try { await page.evaluate(() => window.controlsHarness?.cleanup()); assert.deepEqual(errors, []); }
  finally { await context?.close(); await save(); } });
after(async () => { try { await browser?.close(); } finally {
  if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  report.finishedAt = new Date().toISOString(); await save();
} });

test('recovered retry retires after focus leaves; empty feedback does not introduce an empty results section', async () => {
  await page.evaluate(() => { window.controlsHarness.state.failNext = true; }); await search();
  const retry = part('retry'); await retry.focus(); await retry.press('Enter'); await settled();
  assert.deepEqual(await ids(), expected.slice(0, 5));
  assert.equal(await retry.evaluate(n => n === document.activeElement && !n.hidden), true);
  assert.equal(await retry.getAttribute('aria-disabled'), 'true');
  const calls = await page.evaluate(() => window.controlsHarness.calls().length);
  await retry.press('Enter'); assert.equal(await page.evaluate(() => window.controlsHarness.calls().length), calls);
  await part('input').focus(); assert.equal(await retry.isVisible(), false);
  await search('missing'); assert.equal(await part('results-heading').isVisible(), false); assert.equal(await part('results').isVisible(), false);
  assert.match(await part('status').textContent(), /Try a different search/);
  await page.evaluate(() => { window.controlsHarness.state.failNext = true; }); await search();
  await part('clear').click(); assert.equal(await retry.isVisible(), false);
  observation('retry focus retirement and empty hierarchy', { focusedUnavailableRetry: true, hiddenAfterBlur: true, emptyHeading: false, clearRemovesRetry: true });
});

test('empty feedback safely identifies bounded submitted text and reset neither searches nor repeats idle announcements', async () => {
  const query = '<img src=x onerror=alert(1)> "<script>" ' + '😀'.repeat(180);
  await part('input').focus(); await search(query);
  assert.equal(await part('status').textContent(), `No results for “${Array.from(query).slice(0,160).join('')}…”. Try a different search.`);
  assert.equal(await part('input').inputValue(), query); assert.equal(await part('input').evaluate(n=>n===document.activeElement), true);
  assert.equal(await root().locator('img,script').count(),0);
  await page.setViewportSize({width:320,height:850});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  if(process.env.RAVELDEX_INLINE_CONTROLS_REPORT) await page.screenshot({path:resolve(process.env.RAVELDEX_INLINE_CONTROLS_REPORT.replace(/\.json$/,'')+'-empty-320.png'),fullPage:true});
  await page.evaluate(()=>window.controlsHarness.handle.clear());
  const before=await page.evaluate(()=>{
    window.feedbackMutations=0;
    new MutationObserver(records=>window.feedbackMutations+=records.length).observe(document.querySelector('.raveldex-inline__status'),{childList:true,characterData:true,subtree:true});
    return window.controlsHarness.calls().length;
  });
  await page.evaluate(()=>{window.controlsHarness.handle.clear();window.controlsHarness.handle.clear();});
  assert.equal(await page.evaluate(()=>window.feedbackMutations),0);assert.equal(await page.evaluate(()=>window.controlsHarness.calls().length),before);
  observation('safe empty query and idle dedup',{previewCodePoints:160,originalCodePoints:Array.from(query).length,narrow:320,resetQueries:0,idleMutations:0});
});

test('filter-only empty feedback retains selections and old translated empty overrides cover variants', async () => {
  await search();await selectCategory('Guide');await page.evaluate(()=>window.controlsHarness.recategorize());await search('');
  assert.equal(await part('status').textContent(),'No results with the selected filters. Change a filter or clear search and filters.');
  assert.equal(await part('input').inputValue(),'');assert.equal(await part('facet').locator('option:checked').textContent(),'Guide (not in displayed values)');
  await page.evaluate(()=>window.controlsHarness.remount({messages:{noResults:'Aucun résultat: {query}'}}));
  await search();await selectCategory('Reference');await search('missing');
  assert.equal(await part('status').textContent(),'Aucun résultat: missing');
  await page.evaluate(()=>window.controlsHarness.remount({messages:{noResults:'Text {query}',noResultsFiltered:'Filtres {query}'}}));
  await search();await selectCategory('Reference');await search('missing');
  assert.equal(await part('status').textContent(),'Filtres missing');
  observation('filtered empty compatibility',{retainedSelection:'Guide',oldOverrideFallback:true,explicitFilteredOverride:true});
});

test('older empty replies cannot announce after a new query, composition or destroy', async () => {
  await page.evaluate(()=>{
    window.emptyAnnouncements=[];
    new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)window.emptyAnnouncements.push(n.textContent);}).observe(document.querySelector('.raveldex-inline__status'),{childList:true});
    window.controlsHarness.state.holdMain=true;window.oldFeedback=window.controlsHarness.handle.search('obsolete_missing');
  });
  await page.waitForFunction(()=>window.controlsHarness.state.pending.length===1);
  await search('current_missing');await page.evaluate(async()=>{window.controlsHarness.release();await window.oldFeedback;});
  assert.equal(await part('status').textContent(),'No results for “current_missing”. Try a different search.');
  await page.evaluate(()=>{window.controlsHarness.state.holdMain=true;window.oldFeedback=window.controlsHarness.handle.search('obsolete_composing');});
  await page.waitForFunction(()=>window.controlsHarness.state.pending.length===1);await part('input').focus();
  await part('input').evaluate(n=>{n.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));n.value='未確定';n.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));});
  await page.evaluate(async()=>{window.controlsHarness.release();await window.oldFeedback;});
  assert.equal(await part('status').textContent(),'Finish entering text to search.');assert.equal(await part('input').inputValue(),'未確定');
  await part('input').evaluate(n=>n.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
  await page.evaluate(()=>{window.controlsHarness.state.holdMain=true;window.oldFeedback=window.controlsHarness.handle.search('obsolete_destroy');});
  await page.waitForFunction(()=>window.controlsHarness.state.pending.length===1);
  const before=await page.evaluate(()=>window.emptyAnnouncements.length);
  await page.evaluate(async()=>{window.controlsHarness.handle.destroy();window.controlsHarness.release();await window.oldFeedback;});await page.waitForTimeout(40);
  assert.equal(await page.evaluate(()=>window.emptyAnnouncements.length),before);
  assert.equal(await page.evaluate(()=>window.emptyAnnouncements.some(s=>s.includes('obsolete_'))),false);
  observation('settled context freshness',{obsoleteAnnouncements:0,compositionPreserved:true,destroyMutations:0});
});

test('idle filters explain query-first choices and keyboard reset clears intent without searching or losing focus', async () => {
  const guidance = 'Enter a search term to see filter choices.';
  assert.equal(await page.evaluate(() => window.controlsHarness.calls().length), 0);
  assert.deepEqual(await part('facet').locator('option').allTextContents(), ['All']);
  assert.equal(await part('status').textContent(), guidance);
  const described = await part('facet').evaluate(node => node.getAttribute('aria-describedby').split(/\s+/).map(id => ({ id, exists: !!node.ownerDocument.getElementById(id), text: node.ownerDocument.getElementById(id)?.textContent })));
  assert.ok(described.every(target => target.exists));
  assert.deepEqual(described.map(target => target.text).filter(Boolean), [guidance]);
  const clear = root().getByRole('button', { name: 'Clear search and filters', exact: true });
  assert.equal(await clear.textContent(), 'Clear search and filters');
  await part('input').focus(); await part('input').press('Enter'); await page.waitForTimeout(60);
  assert.equal(await page.evaluate(() => window.controlsHarness.calls().length), 0);
  await search(); await selectCategory('Guide');
  const before = await page.evaluate(() => window.controlsHarness.calls().length);
  await clear.focus(); await clear.press('Enter'); await page.waitForTimeout(60);
  assert.equal(await part('input').inputValue(), ''); assert.equal(await part('facet').inputValue(), '');
  assert.deepEqual(await part('facet').locator('option').allTextContents(), ['All']);
  assert.equal(await part('status').textContent(), guidance);
  assert.equal(await clear.evaluate(node => node === document.activeElement), true);
  assert.equal(await page.evaluate(() => window.controlsHarness.calls().length), before);
  await part('facet').focus(); await page.evaluate(() => window.controlsHarness.handle.clear());
  assert.equal(await part('facet').evaluate(node => node === document.activeElement && !node.disabled), true);
  await part('input').focus(); await page.evaluate(() => window.controlsHarness.handle.clear());
  assert.equal(await part('input').evaluate(node => node === document.activeElement), true);
  assert.equal(await page.evaluate(() => window.controlsHarness.calls().length), before);
  await open({ messages: { clear: 'Suche und Filter leeren', idle: 'Zuerst einen Suchbegriff eingeben.' } });
  await page.evaluate(() => { const messages = window.controlsHarness.options.messages; messages.clear = 'Changed outside'; messages.idle = 'Changed outside'; });
  assert.equal(await root().getByRole('button', { name: 'Suche und Filter leeren', exact: true }).textContent(), 'Suche und Filter leeren');
  assert.equal(await part('status').textContent(), 'Zuerst einen Suchbegriff eingeben.');
  assert.equal(await page.evaluate(() => window.controlsHarness.calls().length), 0);
  observation('query-first guidance / keyboard reset / surviving focus', { mountAndEmptySubmitCalls: 0, resetCalls: 0, focus: ['reset button', 'facet', 'input'], guidance });
});

for (const host of ['direct', 'worker']) for (const strategy of ['source', 'offsets']) {
  test(`${host}/${strategy}: native full-batch IDs, exact counts, snippets and filters agree with hand fixtures`, async () => {
    await open({}, { host, strategy }); await search();
    assert.deepEqual(await ids(), expected.slice(0, 5));
    assert.match(await part('status').textContent(), /12/);
    for (const row of await snippets()) assert.deepEqual(row.snippets, [{ text: 'source provider', marks: ['source', 'provider'] }]);
    await activate('Load more'); assert.deepEqual(await ids(), expected.slice(0, 10));
    assert.equal(await part('load-more').evaluate(node => node === document.activeElement), true);
    await activate('Load more'); assert.deepEqual(await ids(), expected);
    assert.equal(await part('load-more').getAttribute('aria-disabled'), 'true');
    const optionLabels = await part('facet').locator('option').allTextContents();
    assert.ok(optionLabels.includes('Guide (7)')); assert.ok(optionLabels.includes('Reference (5)'));
    await selectCategory('Reference'); assert.deepEqual(await ids(), expected.slice(7));
    assert.match(await part('status').textContent(), /5/);
    const calls = await page.evaluate(() => window.controlsHarness.calls());
    const nativeResults = calls.filter(call => !call.evidence && call.result).map(call => ({ total: call.result.total, offset: call.options.offset, revision: call.result.revision }));
    assert.deepEqual(nativeResults.map(row => row.total), [12, 12, 12, 5]);
    assert.deepEqual(nativeResults.map(row => row.offset), [0, 5, 10, 0]);
    observation(`${host}/${strategy} complete ordered native pages and source snippets`, { expectedIDs: expected, filteredIDs: expected.slice(7), nativeResults });
  });
}

test('Load more appends every match beyond the legacy cap without replacing earlier results', async () => {
  await open({ pageSize: 5, maxRenderedResults: 20, facets: [], snippetFields: [] }, { count: 31, features: 'core' });
  const all = Array.from({ length: 31 }, (_, i) => `item-${String(i).padStart(2, '0')}`);
  await search();
  await page.evaluate(() => { window.firstAppendedResult = document.querySelector('[data-raveldex-inline-result]'); });
  for (const count of [10, 15, 20, 25, 30, 31]) {
    assert.equal(await part('load-more').getAttribute('aria-disabled'), 'false', `Load more before ${count}`);
    await activate('Load more');
    assert.deepEqual(await ids(), all.slice(0, count));
    assert.equal(await part('page-summary').textContent(), `Showing 1–${count} of 31.`);
    assert.equal(await page.evaluate(() => window.firstAppendedResult === document.querySelector('[data-raveldex-inline-result]') && window.firstAppendedResult.isConnected), true);
    assert.equal(await part('load-more').evaluate(node => node === document.activeElement), true);
    assert.equal(await root().getByRole('button', { name: 'Next results', exact: true }).count(), 0);
    assert.equal(await root().getByRole('button', { name: 'Previous results', exact: true }).count(), 0);
  }
  assert.equal(await part('load-more').getAttribute('aria-disabled'), 'true');
  const before = await page.evaluate(() => window.controlsHarness.calls().length);
  await part('load-more').press('Enter'); await settled();
  assert.equal(await page.evaluate(() => window.controlsHarness.calls().length), before);
  assert.deepEqual(await ids(), all);
  const calls = await page.evaluate(() => window.controlsHarness.calls().filter(call => !call.evidence));
  assert.deepEqual(calls.map(call => [call.options.offset, call.options.limit]), [[0, 5], [5, 5], [10, 5], [15, 5], [20, 5], [25, 5], [30, 1]]);
  observation('continuous 31-match append beyond legacy 20-hit cap', { total: 31, retainedFirstNode: true, batches: calls.map(call => [call.options.offset, call.options.limit]) });
});

test('a legacy nonmultiple cap does not truncate native batches or hide Load more', async () => {
  await open({ maxRenderedResults: 7 }); await search();
  await activate('Load more'); assert.deepEqual(await ids(), expected.slice(0, 10));
  assert.equal(await part('load-more').getAttribute('aria-disabled'), 'false');
  assert.equal(await part('page-summary').textContent(), 'Showing 1–10 of 12.');
  await activate('Load more'); assert.deepEqual(await ids(), expected);
  assert.equal(await part('load-more').getAttribute('aria-disabled'), 'true');
  assert.equal(await part('page-summary').textContent(), 'Showing 1–12 of 12.');
  observation('legacy nonmultiple cap / complete native batches', { legacyCap: 7, batchSize: 5, displayed: 12 });
});

test('batch and terminal boundaries expose a native keyboard route to every appended result', async () => {
  const cases = [];
  for (const total of [0, 1, 4, 5, 6, 7, 8, 10, 11, 12]) {
    await open({ pageSize: 5, maxRenderedResults: 7, facets: [], snippetFields: [] }, { count: total, features: 'core' });
    await search();
    const all = Array.from({ length: total }, (_, i) => `item-${String(i).padStart(2, '0')}`);
    assert.deepEqual(await ids(), all.slice(0, 5));
    assert.equal(await part('previous').count(), 0); assert.equal(await part('next').count(), 0);
    assert.equal(await part('new-results').isVisible(), false);
    assert.equal(await part('load-more').isVisible(), total > 5);
    assert.equal(await part('page-summary').textContent(), total ? `Showing 1–${Math.min(5, total)} of ${total}.` : '');
    if (total <= 5) {
      assert.equal(await part('navigation').isVisible(), false);
      cases.push({ total, displayed: total, actions: [] }); continue;
    }
    const more = part('load-more'); await more.focus(); await more.press('Enter'); await settled();
    const first = all.slice(0, 10); assert.deepEqual(await ids(), first);
    assert.equal(await part('page-summary').textContent(), `Showing 1–${first.length} of ${total}.`);
    assert.equal(await more.evaluate(node => node === document.activeElement && !node.hidden), true);
    assert.equal(await more.getAttribute('aria-disabled'), String(total <= 10));
    assert.equal(await part('status').textContent(), `Results added: ${first.length - 5}. Showing 1–${first.length} of ${total}.`);
    const beforeJump = await page.evaluate(() => window.controlsHarness.calls().length);
    await more.press('Tab');
    assert.equal(await part('new-results').evaluate(node => node === document.activeElement), true);
    assert.equal(await more.isVisible(), total > 10);
    await part('new-results').press('Enter');
    assert.equal(await part('result-title').nth(5).evaluate(node => node === document.activeElement), true);
    assert.equal(await page.evaluate(() => window.controlsHarness.calls().length), beforeJump);
    if (total > 10) {
      await activate('Load more'); assert.deepEqual(await ids(), all);
      assert.equal(await part('page-summary').textContent(), `Showing 1–${total} of ${total}.`);
      assert.equal(await more.getAttribute('aria-disabled'), 'true');
    }
    cases.push({ total, firstAppend: first, jumpIndex: 5 });
  }
  observation('batch/terminal boundaries and keyboard append discovery', { pageSize: 5, legacyCap: 7, cases });
});

test('query changes reset fully accumulated results and restart native offsets', async () => {
  await open({ pageSize: 5, maxRenderedResults: 7, facets: [], snippetFields: [] }, { count: 15, features: 'core' });
  const all = Array.from({ length: 15 }, (_, i) => `item-${String(i).padStart(2, '0')}`);
  await search(); await activate('Load more'); await activate('Load more');
  assert.deepEqual(await ids(), all);
  await search('source'); assert.deepEqual(await ids(), all.slice(0, 5));
  assert.equal(await part('page-summary').textContent(), 'Showing 1–5 of 15.');
  assert.equal(await part('new-results').isVisible(), false);
  const calls = await page.evaluate(() => window.controlsHarness.calls().filter(call => !call.evidence));
  assert.deepEqual(calls.map(call => call.options.offset), [0, 5, 10, 0]);
  observation('query reset after full accumulation', { total: 15, nativeOffsets: [0, 5, 10, 0] });
});

test('append status and discovery labels use captured optional translations', async () => {
  await open({ pageSize: 5, maxRenderedResults: 7, facets: [], snippetFields: [],
    messages: { newResults: 'Neue Ergebnisse', resultsAdded: '{added} neu; {start}–{end}/{total}; {count} sichtbar' } }, { count: 6, features: 'core' });
  await page.evaluate(() => { const messages = window.controlsHarness.options.messages; messages.newResults = 'Changed'; messages.resultsAdded = 'Changed'; });
  await search(); await activate('Load more');
  assert.equal(await part('status').textContent(), '1 neu; 1–6/6; 6 sichtbar');
  assert.equal(await root().getByRole('button', { name: 'Neue Ergebnisse', exact: true }).count(), 1);
  observation('optional captured append messages', { label: 'Neue Ergebnisse', status: '1 neu; 1–6/6; 6 sichtbar', added: 1 });
});

test('focused unavailable actions retire after blur and clear/error/retry cannot retain stale ranges or jump targets', async () => {
  await search(); await activate('Load more');
  const more = part('load-more'), jump = part('new-results');
  await jump.focus(); await page.evaluate(() => window.controlsHarness.handle.clear());
  assert.equal(await jump.evaluate(node => node === document.activeElement && !node.hidden), true);
  assert.equal(await jump.getAttribute('aria-disabled'), 'true');
  assert.equal(await part('page-summary').textContent(), '');
  const before = await page.evaluate(() => window.controlsHarness.calls().length);
  await jump.press('Enter'); assert.equal(await page.evaluate(() => window.controlsHarness.calls().length), before);
  await part('input').focus(); assert.equal(await part('navigation').isVisible(), false);
  await search(); await page.evaluate(() => { window.controlsHarness.state.holdMain = true; });
  await more.focus(); await more.press('Enter'); await page.waitForFunction(() => window.controlsHarness.state.pending.length === 1);
  assert.equal(await more.evaluate(node => node === document.activeElement && !node.hidden), true);
  const held = await page.evaluate(() => window.controlsHarness.calls().length);
  await more.press('Enter'); assert.equal(await page.evaluate(() => window.controlsHarness.calls().length), held);
  await page.evaluate(() => { window.controlsHarness.handle.clear(); window.controlsHarness.release(); });
  await page.waitForTimeout(40); assert.deepEqual(await ids(), []); assert.equal(await part('page-summary').textContent(), '');
  assert.equal(await jump.isVisible(), false);
  await part('input').focus(); assert.equal(await part('navigation').isVisible(), false);
  await search(); await page.evaluate(() => { window.controlsHarness.state.failNext = true; }); await activate('Load more');
  assert.match(await part('status').textContent(), /Search could not complete\. Retry search/);
  assert.equal(await part('page-summary').textContent(), ''); assert.equal(await jump.isVisible(), false);
  await activate('Retry search'); assert.deepEqual(await ids(), expected.slice(0, 5));
  assert.equal(await part('page-summary').textContent(), 'Showing 1–5 of 12.');
  assert.equal(await more.isVisible(), true); assert.equal(await part('next').isVisible(), false);
  observation('focused retirement / held reset / failed append / retry', { staleRanges: false, staleJump: false, unavailableRequests: 0, retryOffset: 0 });
});

test('a focused discovery action cannot follow an old target during replacement or a late reply', async () => {
  await search(); await activate('Load more'); await part('new-results').focus();
  await page.evaluate(() => { const h = window.controlsHarness; h.state.holdMain = true; window.heldReplacement = h.handle.search('missing'); });
  await page.waitForFunction(() => window.controlsHarness.state.pending.length === 1);
  assert.equal(await part('new-results').evaluate(node => node === document.activeElement && !node.hidden), true);
  assert.equal(await part('new-results').getAttribute('aria-disabled'), 'true');
  assert.equal(await part('page-summary').textContent(), '');
  const count = await page.evaluate(() => window.controlsHarness.calls().length);
  await part('new-results').press('Enter'); assert.equal(await page.evaluate(() => window.controlsHarness.calls().length), count);
  await search();
  await page.evaluate(async () => { window.controlsHarness.release(); await window.heldReplacement; });
  assert.deepEqual(await ids(), expected.slice(0, 5));
  assert.equal(await part('page-summary').textContent(), 'Showing 1–5 of 12.');
  assert.equal(await part('new-results').getAttribute('aria-disabled'), 'true');
  await part('input').focus(); assert.equal(await part('new-results').isVisible(), false);
  observation('focused discovery / replacement / ignored-abort target invalidation', { focusRetained: true, staleTargetActivated: false, currentIDs: expected.slice(0, 5) });
});

test('filter-only browsing, zero projected selections and clear retain coherent state/focus', async () => {
  assert.equal(await page.evaluate(() => window.controlsHarness.calls().length), 0);
  // Initial idle facets need a real query before their native buckets exist.
  await search(); await part('facet').focus(); await selectCategory('Guide');
  assert.equal(await part('facet').evaluate(node => node === document.activeElement), true);
  await activate('Load more'); assert.deepEqual(await ids(), expected.slice(0, 7));
  await page.evaluate(() => { window.controlsHarness.state.failNext = true; }); await search();
  assert.match(await part('status').textContent(), /Search could not complete\. Retry search/);
  assert.equal(await part('input').inputValue(), 'source prov');
  assert.match(await part('facet').locator('option:checked').textContent(), /Guide/);
  assert.equal(await part('facet').isEnabled(), true);
  await activate('Retry search'); assert.deepEqual(await ids(), expected.slice(0, 5));
  const retried = await page.evaluate(() => window.controlsHarness.calls().filter(call => !call.evidence).at(-1));
  assert.ok(retried.query.children.some(query => query.kind === 'eq' && query.field === 'category' && query.value === 'Guide'));
  assert.equal(retried.options.offset, 0);
  await page.evaluate(() => window.controlsHarness.recategorize()); await search();
  assert.deepEqual(await ids(), []);
  const selected = await part('facet').evaluate(node => node.selectedOptions[0].textContent);
  assert.match(selected, /Guide/); assert.match(selected, /not in displayed/);
  await root().getByRole('button', { name: 'Clear search and filters', exact: true }).click();
  assert.equal(await part('clear').evaluate(node => node === document.activeElement), true);
  assert.equal(await part('facet').inputValue(), ''); assert.equal(await part('input').inputValue(), '');
  assert.equal(await part('status').textContent(), 'Enter a search term to see filter choices.');
  await search(); await selectCategory('Reference');
  await part('input').fill(''); await part('input').press('Enter'); await settled();
  assert.deepEqual(await ids(), expected.slice(0, 5)); assert.match(await part('status').textContent(), /12/);
  observation('selected missing bucket / clear / filter-only query', { retained: selected, clearedToIdle: true, filterOnlyTotal: 12 });
});

test('native facet projection exposes omitted buckets without changing exact result counts', async () => {
  await open({}, { corpus: 'projection' }); await search();
  assert.equal(await part('facet').locator('option').count(), 101);
  assert.match(await part('facet-summary').textContent(), /Filter choices: 101\. Not shown: 1\./);
  assert.doesNotMatch(await part('facet-summary').textContent(), /distinct|buckets/);
  const main = await page.evaluate(() => window.controlsHarness.calls().find(call => !call.evidence).result);
  const field = main.extensions.facets.fields[0];
  assert.deepEqual([main.total, field.distinctValueTotal, field.omittedBucketCount, field.buckets.length], [101, 101, 1, 100]);
  observation('native 100-bucket projection remains explicit', { total: 101, distinct: 101, omitted: 1, renderedBuckets: 100 });
});

test('Load more passes the former default and maximum caps with exact 1005-record coverage', async () => {
  const all = Array.from({ length: 1005 }, (_, i) => `large-${String(i).padStart(4, '0')}`);
  for (const legacyOptions of [{}, { maxRenderedResults: 1000 }]) {
    await open({ pageSize: 100, facets: [], snippetFields: [], ...legacyOptions }, { corpus: 'capacity', features: 'core' });
    await search();
    await page.evaluate(() => { window.capacityFirstResult = document.querySelector('[data-raveldex-inline-result]'); });
    for (const count of [200, 300, 400, 500, 600, 700, 800, 900, 1000, 1005]) {
      assert.equal(await part('load-more').getAttribute('aria-disabled'), 'false');
      await activate('Load more'); assert.deepEqual(await ids(), all.slice(0, count));
      assert.equal(await page.evaluate(() => window.capacityFirstResult === document.querySelector('[data-raveldex-inline-result]')), true);
    }
    assert.equal(await part('load-more').getAttribute('aria-disabled'), 'true');
    assert.equal(await part('page-summary').textContent(), 'Showing 1–1005 of 1005.');
    const calls = await page.evaluate(() => window.controlsHarness.calls().filter(call => !call.evidence));
    assert.deepEqual(calls.map(call => [call.options.offset, call.options.limit]), [[0, 100], [100, 100], [200, 100], [300, 100], [400, 100], [500, 100], [600, 100], [700, 100], [800, 100], [900, 100], [1000, 5]]);
  }
  observation('append beyond former default and maximum caps', { records: 1005, retainedRows: 1005, batchSize: 100,
    claim: 'Observed DOM item counts, not a universal latency/capacity or memory guarantee.' });
});

for (const corpus of ['unicode', 'values', 'omissions']) test(`${corpus}: snippets preserve exact original values, highlights and omission facts`, async () => {
  const observations = [];
  for (const strategy of ['source', 'offsets']) {
    await open({}, { strategy, corpus }); await search(corpus === 'omissions' ? 'source prov' : 'café prov');
    const visible = await snippets(); assert.equal(visible.length, 1);
    if (corpus === 'unicode') assert.deepEqual(visible[0].snippets, [{ text: '😀 CAFE\u0301—Provider <script>literal</script>', marks: ['CAFE\u0301', 'Provider'] }]);
    if (corpus === 'values') assert.deepEqual(visible[0].snippets, [
      { text: 'CAFE\u0301 source', marks: ['CAFE\u0301'] }, { text: 'Provider after', marks: ['Provider'] },
    ]);
    const raw = await page.evaluate(() => {
      const h = window.controlsHarness, call = h.calls().find(call => call.evidence && call.result);
      return { original: h.rows[0].text.body, document: call.result.extensions.snippets.documents[0] };
    });
    for (const snippet of raw.document.snippets) {
      const original = Array.isArray(raw.original) ? raw.original[snippet.valueIndex] : raw.original;
      assert.equal(snippet.text, original.slice(snippet.start, snippet.end));
      for (const mark of snippet.highlights) assert.ok(['source', 'provider', 'CAFE\u0301', 'Provider'].includes(snippet.text.slice(mark.start, mark.end)));
    }
    if (corpus === 'omissions') {
      assert.equal(raw.document.snippetOmissions.unshownMatches, 119);
      assert.match(visible[0].omissions, /119/); assert.equal(visible[0].snippets[0].marks.length, 1);
    }
    assert.equal(await root().locator('script, img').count(), 0);
    observations.push({ strategy, visible, raw });
  }
  assert.deepEqual(observations[0].visible, observations[1].visible);
  observation(`${corpus} original source / offsets parity`, observations);
});

test('append and evidence revision races clear stale accumulation and retry starts a coherent first batch', async () => {
  await search(); await activate('Load more'); assert.equal((await ids()).length, 10);
  await page.evaluate(() => window.controlsHarness.replaceFirst()); await activate('Load more');
  assert.deepEqual(await ids(), []);
  assert.equal(await part('status').textContent(), 'Search results changed. Retry search to see the latest results.');
  await activate('Retry search'); assert.deepEqual(await ids(), expected.slice(0, 5));
  await page.evaluate(() => { window.controlsHarness.state.mutateBeforeEvidence = true; }); await search();
  assert.deepEqual(await ids(), []); assert.equal(await part('status').textContent(), 'Search results changed. Retry search to see the latest results.');
  await activate('Retry search'); assert.deepEqual(await ids(), expected.slice(0, 5));
  observation('append / main-versus-snippets revision refusal', { resetCounts: true, retryIDs: expected.slice(0, 5) });
});

test('ignored-abort evidence and pending Load more cannot publish after clear, new query or destroy', async () => {
  await page.evaluate(() => { window.controlsHarness.state.holdEvidence = true; void window.controlsHarness.handle.search('source prov'); });
  await page.waitForFunction(() => window.controlsHarness.state.pending.length === 1);
  await search('missing'); await page.evaluate(() => window.controlsHarness.release()); await page.waitForTimeout(50);
  assert.deepEqual(await ids(), []); assert.equal(await part('status').textContent(), 'No results for “missing”. Try a different search.');
  await search();
  await page.evaluate(() => { window.controlsHarness.state.holdMain = true; });
  await part('load-more').click(); await page.waitForFunction(() => window.controlsHarness.state.pending.length === 1);
  await page.evaluate(() => { window.controlsHarness.handle.clear(); window.controlsHarness.release(); }); await page.waitForTimeout(50);
  assert.deepEqual(await ids(), []); assert.equal(await part('status').textContent(), 'Enter a search term to see filter choices.');
  assert.deepEqual(await part('facet').locator('option').allTextContents(), ['All']);
  await search(); await page.evaluate(() => { window.controlsHarness.state.holdMain = true; });
  await part('load-more').click(); await page.waitForFunction(() => window.controlsHarness.state.pending.length === 1);
  const destroyed = await page.evaluate(async () => {
    const h = window.controlsHarness; h.handle.destroy(); h.release();
    const restored = h.root.childNodes.length === h.originalNodes.length && h.originalNodes.every((node, i) => h.root.childNodes[i] === node);
    const found = await h.owner.search({ kind: 'all' }); return { restored, total: found.total, disposals: h.state.disposals };
  });
  assert.deepEqual(destroyed, { restored: true, total: 12, disposals: 0 });
  observation('stale optional evidence / append / destroyed owner', destroyed);
});

test('requested absent snippets/facets fail explicitly even for zero matching IDs', async () => {
  await open({ facets: [], messages: { error: 'Search unavailable ({code}). Retry search.' } }, { features: 'facets-only' }); await search('missing');
  assert.deepEqual(await ids(), []); assert.match(await part('status').textContent(), /MISSING_CAPABILITY/);
  await open({ snippetFields: [], messages: { error: 'Search unavailable ({code}). Retry search.' } }, { features: 'snippets-only' }); await search();
  assert.deepEqual(await ids(), []); assert.match(await part('status').textContent(), /MISSING_CAPABILITY/);
  await open({ facets: [], snippetFields: [] }, { features: 'core' }); await search();
  assert.deepEqual(await ids(), expected.slice(0, 5));
  observation('explicit optional capability boundaries', { snippetsMissingEvenWithZeroHits: true, facetsMissing: true, coreOnlyIDs: expected.slice(0, 5) });
});

test('new option nulls, invalid arrays and display caps fail before replacing authored DOM or searching', async () => {
  const actual = await page.evaluate(() => window.controlsHarness.invalidOptions());
  assert.equal(actual.searches, 0);
  for (const row of actual.outcomes) { assert.equal(row.code, 'INVALID_OPTIONS', row.name); assert.equal(row.preserved, true, row.name); }
  observation('strict new option admission', actual);
});

test('actual source marks stay distinct from measured focus and accented Search in complete light/dark host recipes',async()=>{
  await search();await page.addStyleTag({content:await readFile(join(consumer.installed,'docs/api/examples/consumer-themes.css'),'utf8')});
  const observed=[];
  for(const theme of ['search-theme-light','search-theme-dark']){
    await page.evaluate(theme=>document.body.className=theme,theme);await part('input').focus();await page.keyboard.press('ArrowLeft');
    const found=await root().evaluate(root=>{
      const mark=root.querySelector('mark'),field=root.querySelector('input'),submit=root.querySelector('button[type=submit]'),m=getComputedStyle(mark),f=getComputedStyle(field),s=getComputedStyle(submit);
      return{mark:[m.color,m.backgroundColor],focus:[f.outlineColor,f.backgroundColor],submit:[s.color,s.backgroundColor],outlineWidth:f.outlineWidth,outlineStyle:f.outlineStyle,markTabIndex:mark.tabIndex};
    });
    const ratios={mark:contrast(...found.mark),focus:contrast(...found.focus),submit:contrast(...found.submit)};
    assert.ok(ratios.mark>=4.5);assert.ok(ratios.focus>=3);assert.ok(ratios.submit>=4.5);assert.notEqual(found.focus[0],found.mark[1]);assert.equal(found.outlineWidth,'3px');assert.equal(found.outlineStyle,'solid');assert.equal(found.markTabIndex,-1);
    observed.push({theme,...found,ratios});
  }
  observation('rendered match vs focus and primary action',{observed,sourceHighlights:true,focusAndMatchDistinct:true});
});

test('theme overrides, long RTL labels, narrow layout and forced colors retain usable controls and highlights', async () => {
  await search(); await screenshot('desktop');
  await open({ messages: { label: 'ابحث في جميع أدلة الإعداد ومراجع واجهة البحث الطويلة '.repeat(8) } });
  await search();
  await root().evaluate(node => {
    node.dir = 'rtl'; node.style.setProperty('--raveldex-inline-background', '#101820'); node.style.setProperty('--raveldex-inline-color', '#f6f8fa');
    node.style.setProperty('--raveldex-inline-muted', '#c8d3de'); node.style.setProperty('--raveldex-inline-accent', '#d1edff');
    node.style.setProperty('--raveldex-inline-font-size', '18px'); node.style.setProperty('--raveldex-inline-radius', '12px');
  });
  await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const styles = await part('input').evaluate(node => ({ fontSize: getComputedStyle(node).fontSize, radius: getComputedStyle(node).borderRadius }));
  assert.deepEqual(styles, { fontSize: '18px', radius: '12px' });
  await screenshot('mobile-rtl-dark'); await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await part('input').focus();
  assert.notEqual(await part('input').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
  await page.addScriptTag({ path: join(REPO_ROOT, 'node_modules/axe-core/axe.min.js') });
  const axe = await page.evaluate(async () => {
    const found = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    return { violations: found.violations.map(item => ({ id: item.id, impact: item.impact, targets: item.nodes.map(node => node.target) })), tool: found.testEngine };
  });
  assert.deepEqual(axe.violations, []);
  observation('automated theme / RTL / 320px / forced colors', { styles, axe, physicalZoomAndAT: 'Not run' });
});
