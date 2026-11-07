import assert from 'node:assert/strict';
import { test, before, beforeEach, afterEach, after } from 'node:test';
import { createServer } from 'node:http';
import { copyFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { platform, release, arch } from 'node:os';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { prepareConsumer, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

const corpus = JSON.parse(await readFile(new URL('../fixtures/page-sections/corpus.json', import.meta.url)));
const projection = JSON.parse(await readFile(new URL('../fixtures/page-sections/projection.json', import.meta.url)));
let consumer, browser, server, origin, context, page, errors;
const report = { kind: 'raveldex-modal-browser-v1', startedAt: new Date().toISOString(), observations: [],
  environment: { node: process.version, platform: platform(), release: release(), arch: arch() },
  limitations: 'Installed-package automated Chromium DOM/keyboard/pointer/navigation/axe and emulated viewport evidence. Human AT, physical IME/touch/on-screen keyboard, actual zoom, other engines/devices, calibrated memory/latency and physical paint not run.' };
const root = () => page.locator('#modal-root');
const dialog = () => root().locator('dialog');
const part = name => root().locator(`.raveldex-inline__${name}`);
const modalPart = name => root().locator(`.raveldex-modal__${name}`);
const ids = () => part('result').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-raveldex-inline-result')));
const opened = () => dialog().evaluate(d => d.open && d.matches(':modal'));
async function mount(options = {}, setup = {}) { await page.evaluate(async args => { await window.cleanupModalFixtures(); await window.createModalFixture(...args); }, [options, setup]); }
async function show() { await page.evaluate(() => window.modalHarness.handle.open()); }
async function close() { await page.evaluate(() => window.modalHarness.handle.close()); }
async function search(text = 'alpha') { await page.evaluate(text => window.modalHarness.handle.search(text), text); }
async function settle() { await page.waitForFunction(() => document.querySelector('#modal-root .raveldex-inline')?.getAttribute('aria-busy') === 'false'); }
async function calls() { return page.evaluate(() => window.modalHarness.state.calls.length); }
function observe(name, data) { report.observations.push({ name, status: 'Pass', data }); }
async function save() { if (!process.env.RAVELDEX_MODAL_REPORT) return; const path = resolve(process.env.RAVELDEX_MODAL_REPORT); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(report, null, 2) + '\n'); }
async function rows() {
  return part('result').evaluateAll(nodes => nodes.map(node => ({ id: node.getAttribute('data-raveldex-inline-result'), state: node.getAttribute('data-raveldex-inline-section-state'),
    sections: [...node.querySelectorAll('.raveldex-inline__section')].map(s => ({ anchor: s.getAttribute('data-raveldex-inline-section'), href: s.querySelector('a').href,
      text: [...s.querySelector('.raveldex-inline__snippet')?.childNodes ?? []].filter(n => !(n instanceof Element && n.getAttribute('aria-hidden') === 'true')).map(n => n.textContent).join(''),
      marks: [...s.querySelectorAll('mark')].map(n => n.textContent) })) })));
}
before(async () => {
  consumer = await prepareConsumer([], []);
  for (const file of ['modal-fixture.mjs', 'modal-configuration.mjs', 'modal-worker.mjs']) await copyFile(join(REPO_ROOT, 'test/ui', file), join(consumer.directory, file));
  for (const file of ['corpus.json', 'projection.json']) await copyFile(join(REPO_ROOT, 'test/fixtures/page-sections', file), join(consumer.directory, file));
  const settings = { absWorkingDir: consumer.directory, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, legalComments: 'none', logLevel: 'silent', metafile: true };
  const product = await build({ ...settings, entryPoints: ['modal-fixture.mjs'], outfile: join(consumer.directory, 'fixture.mjs') });
  const worker = await build({ ...settings, entryPoints: ['modal-worker.mjs'], outfile: join(consumer.directory, 'worker-bundle.mjs') });
  await copyFile(join(consumer.directory, 'worker-bundle.mjs'), join(consumer.directory, 'modal-worker.mjs'));
  for (const graph of [product, worker]) for (const input of Object.keys(graph.metafile.inputs)) assert.ok(input.startsWith('node_modules/@vmitsaras/raveldex/dist/') || /^(modal-|corpus\.json$|projection\.json$)/.test(input), input);
  report.graphs = { productInputs: Object.keys(product.metafile.inputs), workerInputs: Object.keys(worker.metafile.inputs) };
  for (const file of ['modal.css', 'inline.css']) await copyFile(join(consumer.installed, 'dist/addons/ui', file), join(consumer.directory, file));
  await copyFile(join(REPO_ROOT, 'node_modules/axe-core/axe.min.js'), join(consumer.directory, 'axe.js'));
  await writeFile(join(consumer.directory, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Modal verification</title><link rel="stylesheet" href="/modal.css"><style>body{margin:1rem;font:16px system-ui}main{min-height:1600px}button,input{font:inherit}#modal-root,#second-root{min-width:0}</style></head><body><main><h1>Documentation search</h1><button id="modal-trigger">Find documentation</button><button id="second-trigger">Find other documentation</button><button id="opener">Other action</button><label>Outside field<input id="editable"></label><div id="editable-content" contenteditable="true" aria-label="Editable text">Edit here</div><div id="shadow-host"></div><div id="modal-root"><p id="authored">Browse the guides</p></div><div id="second-root"><p>Other fallback</p></div><dialog id="foreign-dialog"><h2>Application dialog</h2><button id="foreign-close">Application action</button></dialog></main><script type="module" src="/fixture.mjs"></script></body></html>`);
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const file = { '/': 'index.html', '/fixture.mjs': 'fixture.mjs', '/modal-worker.mjs': 'modal-worker.mjs', '/modal.css': 'modal.css', '/inline.css': 'inline.css', '/axe.js': 'axe.js' }[path];
    if (!file) {
      if (/^\/(help\/)?guide\/[a-d]\/$/.test(path)) {
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.end('<!doctype html><html lang="en"><title>Anchored destination</title><main><h1>Guide</h1>' + ['details', 'details-2', 'next-steps', '%#café', 'covered', 'title', 'later-value', 'early-value'].map(id => '<h2 id="' + id + '">' + id + '</h2>').join('') + '</main></html>'); return;
      }
      response.writeHead(404); response.end(); return;
    }
    response.setHeader('content-type', file.endsWith('.css') ? 'text/css' : file.endsWith('.mjs') || file.endsWith('.js') ? 'text/javascript' : 'text/html');
    response.end(await readFile(join(consumer.directory, file)));
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); }); origin = `http://127.0.0.1:${server.address().port}`;
  const channel = process.env.RAVELDEX_UI_BROWSER ?? 'chrome'; browser = await chromium.launch({ ...(channel === 'chrome' ? { channel } : {}), headless: true });
  report.environment.browser = browser.version(); report.package = consumer.package;
}, { timeout: 120000 });
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 1100, height: 850 }, reducedMotion: 'reduce' }); page = await context.newPage(); errors = [];
  page.on('pageerror', e => errors.push(e.message)); await page.goto(origin); await page.waitForFunction(() => typeof window.createModalFixture === 'function'); await mount();
});
afterEach(async () => { try { await page.evaluate(() => window.cleanupModalFixtures?.()); assert.deepEqual(errors, []); } finally { await context?.close(); await save(); } });
after(async () => { await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); } report.finishedAt = new Date().toISOString(); await save(); });

test('closed mount/search/clear remain idle; native dialog and actual opener own keyboard focus', async () => {
  assert.equal(await opened(), false); assert.equal(await dialog().isVisible(), false); assert.equal(await calls(), 0);
  await search('alpha'); assert.equal(await calls(), 0); assert.equal(await part('input').inputValue(), 'alpha');
  await page.evaluate(() => window.modalHarness.handle.clear()); assert.equal(await part('input').inputValue(), '');
  await page.evaluate(() => { window.modalFocusTrace = []; document.addEventListener('focusin', event => window.modalFocusTrace.push(event.target.className)); });
  await page.locator('#modal-trigger').click(); assert.equal(await opened(), true); assert.equal(await calls(), 0);
  assert.equal(await part('input').evaluate(n => n === document.activeElement), true);
  assert.deepEqual(await page.evaluate(() => window.modalFocusTrace.filter(name => name.startsWith('raveldex-'))), ['raveldex-inline__input']);
  assert.equal(await dialog().getAttribute('closedby'), 'closerequest');
  assert.equal(await dialog().getAttribute('aria-labelledby'), await modalPart('title').getAttribute('id'));
  await search();
  if (process.env.RAVELDEX_MODAL_SCREENSHOTS) { const directory = resolve(process.env.RAVELDEX_MODAL_SCREENSHOTS); await mkdir(directory, { recursive: true }); await page.screenshot({ path: join(directory, 'modal-desktop.png') }); }
  const tabs = [];
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press('Tab'); const position = await dialog().evaluate(d => ({ inside: d.contains(document.activeElement), tag: document.activeElement.tagName, id: document.activeElement.id, focused: document.hasFocus() }));
    tabs.push(position);
    // Native Chromium may put focus in its own browser chrome between cycles;
    // no authored control outside the modal may receive document focus.
    assert.ok(position.inside || position.tag === 'BODY' && !position.focused, `Tab ${i}: ${JSON.stringify(tabs)}`);
  }
  await page.keyboard.press('Escape'); assert.equal(await opened(), false); assert.equal(await page.locator('#modal-trigger').evaluate(n => n === document.activeElement), true);
  await page.locator('#opener').focus(); await show(); await modalPart('close').click();
  assert.equal(await page.locator('#opener').evaluate(n => n === document.activeElement), true);
  observe('closed idle/native focus/Tab/Escape/actual opener', { noClosedQueries: true, nativeModal: true, tabSteps: 18, tabs });
});

for (const host of ['direct', 'worker']) for (const strategy of ['source', 'offsets']) test(`${host}/${strategy}: native literal page totals/order and original section ranges survive modal presentation`, async () => {
  await mount({}, { host, strategy }); await show();
  for (const fixture of projection.cases.filter(c => !c.mapOverride)) {
    await page.evaluate(id => window.modalHarness.literal(id), fixture.queryId);
    assert.deepEqual(await ids(), ['page:a', 'page:b']); await part('load-more').click(); await settle();
    const actual = await rows(); assert.deepEqual(actual.map(r => r.id), corpus.expectedPages.ids);
    for (const expected of fixture.expected) {
      const row = actual.find(r => r.id === expected.pageId); assert.equal(row.state, expected.state); assert.deepEqual(row.sections.map(s => s.anchor), expected.selectedAnchors);
      for (let i = 0; i < expected.excerpts.length; i++) {
        const excerpt = expected.excerpts[i], source = corpus.sourceSlices[excerpt.sourceSliceIndex];
        assert.equal(row.sections[i].text, source.text); assert.deepEqual(row.sections[i].marks, excerpt.highlights.map(([a, b]) => source.text.slice(a, b)));
        assert.equal(decodeURIComponent(new URL(row.sections[i].href).hash.slice(1)), row.sections[i].anchor);
      }
    }
    const native = await page.evaluate(query => window.modalHarness.owner.search(query, { limit: 4 }), corpus.queries.find(q => q.id === fixture.queryId).query);
    assert.equal(native.total, 4); assert.deepEqual(native.hits.map(h => h.id), corpus.expectedPages.ids);
    for (const hit of native.hits) assert.ok(Math.abs(hit.score - corpus.queries.find(q => q.id === fixture.queryId).expectedScore) < 1e-14);
  }
  await close(); assert.deepEqual(await ids(), []); assert.equal(await page.evaluate(() => window.modalHarness.state.disposals), 0);
  observe(`${host}/${strategy} literal matrix`, { queries: 7, pages: corpus.expectedPages.ids, exactScores: true, sourceSlices: corpus.sourceSlices.length });
});

test('core-only borrowed owner searches without optional providers or Inspector', async () => {
  for (const host of ['direct', 'worker']) { await mount({}, { feature: 'core', host }); await show(); await search(); assert.deepEqual(await ids(), ['page:a', 'page:b']); assert.equal(await part('section').count(), 0); await close(); }
  observe('core-only direct/worker', { nativeResults: true, optionalProvidersRequired: false });
});

test('root/help encoded destinations navigate natively and modified links keep their browser behavior', async () => {
  for (const base of ['/', '/help/']) {
    await mount({}, { base }); await show(); await search('gamma');
    const link = root().locator('[data-raveldex-inline-section="%#café"] a');
    assert.equal(await link.getAttribute('href'), origin + base + 'guide/a/#%25%23caf%C3%A9');
    const popupPromise = context.waitForEvent('page'); await link.click({ button: 'middle' }); const popup = await popupPromise;
    await popup.waitForURL(origin + base + 'guide/a/#%25%23caf%C3%A9'); await popup.waitForLoadState();
    assert.equal(popup.url(), origin + base + 'guide/a/#%25%23caf%C3%A9'); assert.equal(await popup.locator('h2[id="%#café"]').count(), 1); await popup.close();
    assert.equal(await opened(), true); await link.click(); await page.waitForURL(origin + base + 'guide/a/#%25%23caf%C3%A9');
    assert.equal(await page.evaluate(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.textContent), '%#café');
    await page.goto(origin); await page.waitForFunction(() => typeof window.createModalFixture === 'function'); await mount();
  }
  observe('root/help actual target navigation', { bases: ['/', '/help/'], rawAnchor: '%#café', modifiedActivation: 'middle-button native tab' });
});

test('query/facet preservation, reset-on-close and map revision revalidation are explicit', async () => {
  for (const resetOnClose of [false, true]) {
    await mount({ resetOnClose }, { facets: true });
    const closedCount = await calls(); await show(); await settle();
    assert.equal(await calls(), closedCount);
    assert.equal(await part('status').textContent(), 'Enter a search term to see filter choices.');
    assert.deepEqual(await part('facet').locator('option').allTextContents(), ['All']);
    assert.equal(await root().getByRole('button', { name: 'Clear search and filters', exact: true }).textContent(), 'Clear search and filters');
    await search();
    const value = await part('facet').locator('option').evaluateAll(nodes => nodes.find(n => n.textContent.startsWith('Guide'))?.value);
    await part('facet').selectOption(value); await settle(); assert.deepEqual(await ids(), ['page:a', 'page:b']);
    const options = await part('facet').locator('option').evaluateAll(nodes => nodes.map(n => n.value));
    await close(); assert.deepEqual(await ids(), []); assert.equal(await part('input').inputValue(), resetOnClose ? '' : 'alpha');
    assert.equal(await part('facet').inputValue(), resetOnClose ? '' : value);
    if (!resetOnClose) assert.deepEqual(await part('facet').locator('option').evaluateAll(nodes => nodes.map(n => n.value)), options);
    const count = await calls(); await show(); await settle(); assert.equal((await calls()) > count, !resetOnClose);
    if (resetOnClose) {
      assert.equal(await part('status').textContent(), 'Enter a search term to see filter choices.');
      assert.deepEqual(await part('facet').locator('option').allTextContents(), ['All']);
    } else assert.match(await part('facet').locator('option:checked').textContent(), /^Guide/);
    const clearCount = await calls();
    const clear = root().getByRole('button', { name: 'Clear search and filters', exact: true });
    await clear.focus(); await clear.press('Enter');
    assert.equal(await part('input').inputValue(), ''); assert.equal(await part('facet').inputValue(), '');
    assert.equal(await clear.evaluate(node => node === document.activeElement), true);
    assert.equal(await part('status').textContent(), 'Enter a search term to see filter choices.');
    await close(); await show(); await settle(); assert.equal(await calls(), clearCount);
  }
  await mount(); await show(); await search(); await close();
  await page.evaluate(() => { const h = window.modalHarness; return h.owner.replace({ ...h.rows[0], metadata: { category: 'Changed' } }); });
  await show(); await settle(); assert.deepEqual(await ids(), ['page:a', 'page:b']);
  assert.equal((await rows())[0].state, 'stale-map');
  observe('preserve/reset/reopen revalidation', { preservedQueryAndFacet: true, resetQueryAndFacet: true, staleMap: true });
});

test('closing held main/context work aborts presentation and stale generations cannot alter reopened results', async () => {
  for (const phase of ['Main', 'Context']) {
    await mount(); await show();
    await page.evaluate(phase => { const h = window.modalHarness; h.state['hold' + phase] = true; void h.handle.search('alpha'); }, phase);
    await page.waitForFunction(() => window.modalHarness.state.pending.length === 1); await close();
    assert.equal(await page.evaluate(() => window.modalHarness.state.calls.every(c => c.aborted)), true); assert.deepEqual(await ids(), []);
    await search('delta'); const count = await calls(); assert.equal(await opened(), false); assert.equal(await calls(), count);
    await show(); await settle(); const html = await root().locator('.raveldex-inline').innerHTML(); await page.evaluate(() => window.modalHarness.release());
    await page.waitForTimeout(30); assert.equal(await root().locator('.raveldex-inline').innerHTML(), html); assert.equal(await part('input').inputValue(), 'delta');
    await close(); await show(); await settle(); assert.equal(await opened(), true);
  }
  observe('pending close/reopen generation', { phases: ['main', 'section context'], aborted: true, staleReplyDOMUnchanged: true });
});

test('close cancels pending debounce and clears synthetic composition state before reopening current input', async () => {
  const outcomes = [];
  for (const composing of [false, true]) {
    await mount({ debounceMs: 80 }); await show();
    await page.evaluate(composing => {
      const input = window.modalHarness.root.querySelector('input');
      if (composing) input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      input.value = 'alpha'; input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: composing })); window.modalHarness.handle.close();
      if (composing) input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    }, composing);
    await page.waitForTimeout(100); assert.equal(await calls(), 0); assert.equal(await part('input').inputValue(), 'alpha');
    await show(); await settle(); assert.deepEqual(await ids(), ['page:a', 'page:b']); outcomes.push({ composing, closedQueries: 0, reopenedCurrentQuery: true });
  }
  observe('debounce and synthetic composition suspension', { outcomes, physicalIME: 'Not run' });
});

test('destroy while open/pending aborts and restores exact nodes; all stale handle methods are harmless', async () => {
  for (const phase of ['Main', 'Context']) {
    await mount(); await show();
    await page.evaluate(phase => { const h = window.modalHarness; h.state['hold' + phase] = true; void h.handle.search('alpha'); }, phase);
    await page.waitForFunction(() => window.modalHarness.state.pending.length === 1);
    const outcome = await page.evaluate(async () => {
      const h = window.modalHarness; h.handle.destroy(); h.handle.destroy(); h.release();
      await h.handle.search(123); h.handle.open(); h.handle.close(); h.handle.clear();
      const native = await h.owner.search({ kind: 'text', text: 'delta' });
      return { restored: h.restored(), aborted: h.state.calls.every(c => c.aborted), disposals: h.state.disposals, total: native.total, trigger: h.trigger.getAttribute('aria-expanded') };
    });
    await page.waitForTimeout(30); assert.deepEqual(outcome, { restored: true, aborted: true, disposals: 0, total: 4, trigger: null }); assert.equal(await dialog().count(), 0);
  }
  observe('pending destroy and stale handles', { phases: ['main', 'section context'], exactNodes: true, ownerDisposed: false, nativeStillUsable: true });
});

test('malformed native/context replies and actual worker failure show recoverable error feedback', async () => {
  for (const badReply of ['main', 'context']) {
    await mount(); await show(); await page.evaluate(value => { window.modalHarness.state.badReply = value; }, badReply); await search();
    assert.deepEqual(await ids(), []); assert.equal(await part('retry').isVisible(), true); assert.match(await part('status').textContent(), /INCOMPATIBLE_CAPABILITY/);
    await part('retry').click(); await settle(); assert.deepEqual(await ids(), ['page:a', 'page:b']);
  }
  await mount({}, { host: 'worker' }); await show();
  await page.evaluate(() => window.modalHarness.worker.postMessage({ fixtureCrash: true }));
  await page.waitForTimeout(50); await search(); assert.deepEqual(await ids(), []); assert.equal(await part('retry').isVisible(), true);
  assert.match(await part('status').textContent(), /DISPOSED/);
  assert.deepEqual(await page.evaluate(() => window.modalHarness.state.workerErrors), ['Uncaught Error: Intentional modal fixture worker failure']);
  observe('malformed replies/worker loss', { malformed: ['main', 'context'], retryAfterMalformed: true, actualWorkerError: true, postLossSearchPresentation: 'DISPOSED' });
});

test('shortcuts coordinate deterministic independent instances and respect editable/composition/default prevention', async () => {
  const dispatch = async (extra = {}, target = 'document') => page.evaluate(({ extra, target }) => {
    const node = target === 'document' ? document : document.querySelector(target);
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, composed: true, cancelable: true, ...extra });
    node.dispatchEvent(event); return event.defaultPrevented;
  }, { extra, target });
  assert.equal(await dispatch(), false); assert.equal(await opened(), false);
  await page.evaluate(() => {
    const add = document.addEventListener, remove = document.removeEventListener, listeners = new Set(); window.modalKeyListeners = listeners;
    document.addEventListener = function(type, callback, options) { if (type === 'keydown') listeners.add(callback); return add.call(this, type, callback, options); };
    document.removeEventListener = function(type, callback, options) { if (type === 'keydown') listeners.delete(callback); return remove.call(this, type, callback, options); };
  });
  await mount({ shortcut: true }); await page.evaluate(() => window.createModalFixture({ shortcut: true }, { root: 'second-root', trigger: 'second-trigger' }));
  assert.equal(await page.evaluate(() => window.modalKeyListeners.size), 1);
  await page.evaluate(() => { window.modalHarness = window.modalInstances[0]; });
  for (const extra of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }, { altKey: true }, { shiftKey: true }, { metaKey: true }, { key: 'j' }]) { assert.equal(await dispatch(extra), false); assert.equal(await opened(), false); }
  for (const target of ['#editable', '#editable-content']) assert.equal(await dispatch({}, target), false);
  assert.equal(await page.evaluate(() => {
    const input = document.createElement('input'), shadow = document.querySelector('#shadow-host').attachShadow({ mode: 'open' }); shadow.append(input);
    const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, composed: true, cancelable: true }); input.dispatchEvent(e); return e.defaultPrevented;
  }), false);
  assert.equal(await page.evaluate(() => { const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }); e.preventDefault(); document.dispatchEvent(e); return document.querySelector('#modal-root dialog').open; }), false);
  assert.equal(await dispatch(), true); assert.equal(await opened(), true); assert.equal(await page.locator('#second-root dialog').evaluate(d => d.open), false);
  assert.equal(await dispatch({}, '#modal-root .raveldex-inline__input'), false);
  await modalPart('close').focus(); const count = await calls(); assert.equal(await dispatch(), true); assert.equal(await calls(), count); await close();
  await page.evaluate(() => { window.modalInstances[0].handle.destroy(); }); assert.equal(await dispatch({ ctrlKey: false, metaKey: true }), true);
  assert.equal(await page.locator('#second-root dialog').evaluate(d => d.open), true); await page.evaluate(() => window.modalInstances[1].handle.destroy());
  assert.equal(await dispatch(), false);
  assert.equal(await page.evaluate(() => window.modalKeyListeners.size), 0);
  observe('coordinated shortcuts', { optIn: true, registrationOrder: true, ignoredContexts: 11, finalUnregistered: true });
});

test('foreign native dialogs, disabled triggers and detached/adopted roots cannot claim open or shortcuts', async () => {
  await mount({ shortcut: true });
  const outcome = await page.evaluate(() => {
    const h = window.modalHarness, d = document.querySelector('#foreign-dialog'); d.showModal(); h.handle.open();
    const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true, bubbles: true }); document.dispatchEvent(e);
    const blocked = !h.root.querySelector('dialog').open && !e.defaultPrevented; d.close();
    const host = document.createElement('div'), shadow = host.attachShadow({ mode: 'open' }), foreign = document.createElement('dialog'), action = document.createElement('button');
    action.textContent = 'Shadow application action'; foreign.append(action); shadow.append(foreign); document.body.append(host); foreign.showModal(); action.focus(); h.handle.open();
    const shadowKey = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true, bubbles: true, composed: true }); action.dispatchEvent(shadowKey);
    const shadowBlocked = !h.root.querySelector('dialog').open && !shadowKey.defaultPrevented && shadow.activeElement === action; foreign.close(); host.remove();
    h.trigger.disabled = true; const disabled = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true, bubbles: true }); document.dispatchEvent(disabled);
    h.trigger.disabled = false; const next = h.root.nextSibling; h.root.remove(); h.handle.open(); const detached = !h.root.querySelector('dialog').open;
    document.querySelector('main').insertBefore(h.root, next); h.handle.open(); const restored = h.root.querySelector('dialog').open; h.handle.close();
    const foreignDocument = document.implementation.createHTMLDocument('foreign'); foreignDocument.body.append(h.root); h.handle.open(); const adopted = !h.root.querySelector('dialog').open;
    document.querySelector('main').append(h.root); return { blocked, shadowBlocked, disabled: !disabled.defaultPrevented, detached, restored, adopted };
  });
  assert.deepEqual(outcome, { blocked: true, shadowBlocked: true, disabled: true, detached: true, restored: true, adopted: true }); observe('foreign/disabled/detached/adopted opening', outcome);
});

test('reattaching a root removed while open reestablishes native modality and input focus', async () => {
  await show(); await search();
  const outcome = await page.evaluate(() => {
    const h = window.modalHarness, next = h.root.nextSibling, count = h.state.calls.length; h.root.remove(); h.handle.open();
    const detachedQueries = h.state.calls.length - count; document.querySelector('main').insertBefore(h.root, next); h.handle.open();
    const d = h.root.querySelector('dialog'); return { detachedQueries, open: d.open, modal: d.matches(':modal'), input: h.root.querySelector('input') === document.activeElement };
  });
  assert.deepEqual(outcome, { detachedQueries: 0, open: true, modal: true, input: true }); await settle();
  observe('open root detachment/recovery', outcome);
});

test('deliberate backdrop gesture dismisses; drags, cancellation and secondary/other pointers do not', async () => {
  await show(); const box = await dialog().boundingBox(); const outside = { x: Math.max(1, box.x - 8), y: box.y + 30 }, inside = { x: box.x + 20, y: box.y + 20 };
  for (const [from, to] of [[inside, outside], [outside, inside]]) {
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y); await page.mouse.up(); assert.equal(await opened(), true);
  }
  await page.mouse.click(outside.x, outside.y, { button: 'right' }); assert.equal(await opened(), true);
  const synthetic = await page.evaluate(({ x, y }) => {
    const d = window.modalHarness.root.querySelector('dialog'), init = { bubbles: true, clientX: x, clientY: y, button: 0, isPrimary: true, pointerId: 3 };
    d.dispatchEvent(new PointerEvent('pointerdown', init)); d.dispatchEvent(new PointerEvent('pointercancel', init)); d.dispatchEvent(new PointerEvent('pointerup', init)); d.dispatchEvent(new PointerEvent('click', init));
    const cancelled = d.open;
    d.dispatchEvent(new PointerEvent('pointerdown', init)); d.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerId: 4 })); d.dispatchEvent(new PointerEvent('click', init));
    const otherPointer = d.open;
    const nonPrimary = { ...init, isPrimary: false };
    for (const type of ['pointerdown', 'pointerup', 'click']) d.dispatchEvent(new PointerEvent(type, nonPrimary));
    const secondaryPointer = d.open;
    d.dispatchEvent(new PointerEvent('pointerdown', init)); window.modalHarness.handle.close(); window.modalHarness.handle.open();
    d.dispatchEvent(new PointerEvent('pointerup', init)); d.dispatchEvent(new PointerEvent('click', init));
    return { cancelled, otherPointer, secondaryPointer, oldGeneration: d.open };
  }, outside);
  assert.deepEqual(synthetic, { cancelled: true, otherPointer: true, secondaryPointer: true, oldGeneration: true });
  await page.mouse.click(outside.x, outside.y); assert.equal(await opened(), false);
  observe('backdrop gestures', { realDrags: 2, realSecondary: true, syntheticCancelAndForeignPointer: true, realPrimaryDismiss: true });
});

test('trigger attributes, authored Node identities and conditional scroll styles restore without disposing borrowed owner', async () => {
  await page.evaluate(() => {
    const h = window.modalHarness; h.handle.destroy(); h.trigger.setAttribute('type', 'submit'); h.trigger.setAttribute('aria-haspopup', 'menu'); h.trigger.setAttribute('aria-controls', 'old'); h.trigger.setAttribute('aria-expanded', 'mixed'); h.trigger.setAttribute('aria-keyshortcuts', 'Alt+F');
    document.documentElement.style.setProperty('overflow', 'clip', 'important'); document.body.style.setProperty('overflow', 'scroll'); window.scrollTo(0, 250); h.remount({ shortcut: true });
  });
  const before = await page.evaluate(() => ({ x: scrollX, y: scrollY })); await show(); await close();
  assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), before);
  const restored = await page.evaluate(async () => {
    const h = window.modalHarness; h.handle.destroy(); const attrs = ['type', 'aria-haspopup', 'aria-controls', 'aria-expanded', 'aria-keyshortcuts'].map(name => h.trigger.getAttribute(name));
    const native = await h.owner.search({ kind: 'text', text: 'alpha' });
    return { attrs, root: h.restored(), html: [document.documentElement.style.getPropertyValue('overflow'), document.documentElement.style.getPropertyPriority('overflow')], body: document.body.style.overflow, disposals: h.state.disposals, total: native.total };
  });
  assert.deepEqual(restored, { attrs: ['submit', 'menu', 'old', 'mixed', 'Alt+F'], root: true, html: ['clip', 'important'], body: 'scroll', disposals: 0, total: 4 });
  await page.evaluate(() => { const h = window.modalHarness; h.remount({ shortcut: true }); h.handle.open(); h.trigger.setAttribute('aria-controls', 'application-new'); document.documentElement.style.setProperty('overflow', 'visible', 'important'); document.body.style.setProperty('overflow', 'auto'); h.handle.destroy(); });
  assert.equal(await page.locator('#modal-trigger').getAttribute('aria-controls'), 'application-new'); assert.equal(await page.evaluate(() => document.documentElement.style.overflow), 'visible'); assert.equal(await page.evaluate(() => document.body.style.overflow), 'auto');
  observe('trigger/scroll/exact-node restoration', restored);
});

test('removed opener, native external close and newer modal never steal unrelated focus', async () => {
  await page.locator('#opener').focus(); await show(); await page.locator('#opener').evaluate(n => n.remove()); await close();
  await page.locator('#editable').focus(); await close(); assert.equal(await page.locator('#editable').evaluate(n => n === document.activeElement), true);
  await show(); await search(); await page.evaluate(() => window.modalHarness.root.querySelector('dialog').close()); await page.waitForTimeout(30);
  assert.deepEqual(await ids(), []); assert.equal(await page.locator('#modal-trigger').getAttribute('aria-expanded'), 'false');
  await show(); await close(); await show(); await page.waitForTimeout(30); assert.equal(await opened(), true);
  await close(); await page.evaluate(() => { const d = document.querySelector('#foreign-dialog'); d.showModal(); document.querySelector('#foreign-close').focus(); window.modalHarness.handle.close(); window.modalHarness.handle.destroy(); });
  assert.equal(await page.locator('#foreign-close').evaluate(n => n === document.activeElement), true);
  observe('opener/native-close/new-session/foreign focus', { removedOpener: true, externalCloseCleaned: true, staleCloseIgnored: true, unrelatedFocusPreserved: true });
});

test('synchronous external close/reopen and handoff keep the current modal scroll lock until its own close', async () => {
  await page.evaluate(() => {
    document.documentElement.style.overflow = 'auto'; const h = window.modalHarness;
    h.handle.open(); h.root.querySelector('dialog').close(); h.handle.open();
  });
  await page.waitForTimeout(30); assert.equal(await opened(), true); assert.equal(await page.evaluate(() => document.documentElement.style.overflow), 'hidden');
  await close(); assert.equal(await page.evaluate(() => document.documentElement.style.overflow), 'auto');
  await page.evaluate(async () => {
    await window.createModalFixture({}, { root: 'second-root', trigger: 'second-trigger' });
    const [a, b] = window.modalInstances; window.modalHarness = a;
    a.handle.open(); a.root.querySelector('dialog').close(); b.handle.open();
  });
  await page.waitForTimeout(30); assert.equal(await page.locator('#second-root dialog').evaluate(d => d.open), true);
  assert.equal(await page.evaluate(() => document.documentElement.style.overflow), 'hidden');
  await page.evaluate(() => window.modalInstances[1].handle.close()); assert.equal(await page.evaluate(() => document.documentElement.style.overflow), 'auto');
  observe('external native close and scroll handoff', { sameInstanceReopen: true, independentInstanceHandoff: true, originalStyleRestored: true });
});

test('handle search immediately after native close or detachment updates input without any hidden native query', async () => {
  const outcomes = [];
  for (const change of ['close', 'root removal', 'dialog removal']) {
    await mount();
    const result = await page.evaluate(async change => {
      const h = window.modalHarness; h.handle.open(); const d = h.root.querySelector('dialog'), input = d.querySelector('input'), parent = h.root.parentNode;
      if (change === 'close') d.close(); else if (change === 'root removal') h.root.remove(); else d.remove();
      const count = h.state.calls.length; await h.handle.search('alpha');
      const outcome = { change, calls: h.state.calls.length - count, input: input.value, modal: d.matches(':modal'), results: d.querySelectorAll('.raveldex-inline__result').length };
      if (!h.root.isConnected) parent.append(h.root); if (!d.isConnected) h.root.append(d); return outcome;
    }, change);
    assert.deepEqual(result, { change, calls: 0, input: 'alpha', modal: false, results: 0 }); outcomes.push(result);
  }
  observe('native externally closed/detached handle search', outcomes);
});

test('late main/context resolution in native-close microtask gap cannot publish hidden results or start context work', async () => {
  const outcomes = [];
  for (const phase of ['Main', 'Context']) {
    await mount();
    const outcome = await page.evaluate(async phase => {
      const h = window.modalHarness; h.handle.open(); h.state['hold' + phase] = true;
      const held = new Promise(done => { h.state.onHeld = done; }), pending = h.handle.search('alpha'); await held; h.state.onHeld = null;
      const d = h.root.querySelector('dialog'); let closeEvents = 0; d.addEventListener('close', () => closeEvents++);
      const count = h.state.calls.length, beforeStatus = d.querySelector('.raveldex-inline__status').textContent; d.close(); h.release(); await pending;
      return { phase, closeEvents, calls: h.state.calls.length - count, results: d.querySelectorAll('.raveldex-inline__result').length,
        beforeStatus, status: d.querySelector('.raveldex-inline__status').textContent, open: d.open };
    }, phase);
    assert.deepEqual(outcome, { phase, closeEvents: 0, calls: 0, results: 0, beforeStatus: 'Searching…', status: 'Searching…', open: false });
    await page.waitForFunction(() => document.querySelector('#modal-root .raveldex-inline__status').textContent === ''); assert.deepEqual(await ids(), []); outcomes.push(outcome);
  }
  observe('native close before queued event/late resolution', outcomes);
});

test('foreign native modal in a closed shadow root blocks an owned second modal stack', async () => {
  const outcomes = [];
  for (const tag of ['div', 'raveldex-foreign-dialog-host']) {
    const outcome = await page.evaluate(tag => {
      const host = document.createElement(tag), shadow = host.attachShadow({ mode: 'closed' }), foreign = document.createElement('dialog'), button = document.createElement('button');
      button.textContent = 'Closed shadow action'; foreign.append(button); shadow.append(foreign); document.body.append(host); foreign.showModal(); button.focus();
      const before = { activeHost: document.activeElement === host, tag: document.activeElement?.localName, focusWithin: host.matches(':focus-within'), shadowActiveButton: shadow.activeElement === button, documentFocus: document.hasFocus() };
      window.modalHarness.handle.open();
      const result = { before, foreign: foreign.matches(':modal'), own: window.modalHarness.root.querySelector('dialog').open, activeHost: document.activeElement === host };
      foreign.close(); host.remove(); return result;
    }, tag);
    assert.equal(outcome.before.activeHost, true); assert.equal(outcome.before.shadowActiveButton, true); assert.equal(outcome.before.documentFocus, true); assert.equal(outcome.before.tag, tag);
    assert.deepEqual({ foreign: outcome.foreign, own: outcome.own, activeHost: outcome.activeHost }, { foreign: true, own: false, activeHost: true }); outcomes.push(outcome);
  }
  const owned = await page.evaluate(() => {
    const h = window.modalHarness; h.handle.open(); const baseline = h.root.querySelector('dialog').matches(':modal'); h.handle.close();
    const host = document.createElement('div'), shadow = host.attachShadow({ mode: 'closed' }), root = document.createElement('div'), trigger = document.createElement('button'), authored = document.createTextNode('Closed shadow fallback');
    trigger.textContent = 'Owned closed shadow search'; root.append(authored); shadow.append(trigger, root); document.body.append(host);
    const handle = h.mount({ root, trigger, shortcut: true }); trigger.focus();
    const key = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true, composed: true, bubbles: true }); trigger.dispatchEvent(key);
    const d = root.querySelector('dialog'), shortcutOpened = key.defaultPrevented && d.matches(':modal'); handle.close(); trigger.click();
    const opened = d.open && d.matches(':modal'), input = shadow.activeElement === d.querySelector('input');
    const editableKey = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true, composed: true, bubbles: true }); d.querySelector('input').dispatchEvent(editableKey);
    const editableIgnored = !editableKey.defaultPrevented; handle.close(); const restoredFocus = shadow.activeElement === trigger;
    handle.destroy(); const restored = root.childNodes.length === 1 && root.firstChild === authored; host.remove(); return { baseline, shortcutOpened, opened, input, editableIgnored, restoredFocus, restored };
  });
  assert.deepEqual(owned, { baseline: true, shortcutOpened: true, opened: true, input: true, editableIgnored: true, restoredFocus: true, restored: true }); observe('closed-shadow foreign/known owned native modal', { foreign: outcomes, owned });
});

test('mount ownership and strict modal options reject before touching authored nodes or trigger', async () => {
  const results = await page.evaluate(() => {
    const h = window.modalHarness, f = window.modalFactories, duplicate = h.mount() === h.handle;
    const outcomes = [], cases = [ ['trigger missing', { trigger: undefined }], ['trigger inside root', null], ['reset type', { resetOnClose: 'yes' }], ['shortcut type', { shortcut: 1 }], ['hints type', { keyboardHints: null }], ['blank title', { modalMessages: { title: ' ' } }], ['extra message', { modalMessages: { wrong: 'x' } }], ['message unicode', { modalMessages: { title: '\ud800' } }], ['message length', { modalMessages: { title: 'x'.repeat(513) } }], ['message getter', { modalMessages: Object.defineProperty({}, 'title', { enumerable: true, get() { throw Error('getter ran'); } }) }] ];
    for (const [name, extra] of cases) {
      const root = document.createElement('div'), trigger = document.createElement('button'), original = document.createTextNode('fallback'); trigger.textContent = 'Search'; root.append(original); document.body.append(trigger, root);
      if (!extra) root.append(trigger); const attrs = trigger.outerHTML; let code;
      try { f.mountRaveldexModal({ ...h.uiOptions, root, trigger, ...(extra ?? {}) }); } catch (e) { code = e.code; }
      outcomes.push({ name, code, root: root.firstChild === original, trigger: trigger.outerHTML === attrs }); root.remove(); trigger.remove();
    }
    let conflict, sharedTrigger; try { f.mountRaveldexInline(h.uiOptions); } catch (e) { conflict = e.code; }
    try { f.mountRaveldexModal({ ...h.uiOptions, root: document.querySelector('#second-root') }); } catch (e) { sharedTrigger = e.code; }
    let invalidSearch; try { h.handle.search(123); } catch (e) { invalidSearch = e.code; }
    const root = document.createElement('div'), trigger = document.createElement('button'), original = document.createTextNode('native fallback'); root.append(original); trigger.textContent = 'Find'; document.body.append(trigger, root);
    const showModal = HTMLDialogElement.prototype.showModal; let unsupported;
    HTMLDialogElement.prototype.showModal = undefined;
    try { f.mountRaveldexModal({ ...h.uiOptions, root, trigger }); } catch (error) { unsupported = error.code; } finally { HTMLDialogElement.prototype.showModal = showModal; }
    const nativePreserved = root.firstChild === original && trigger.attributes.length === 0; root.remove(); trigger.remove();
    return { duplicate, outcomes, conflict, sharedTrigger, invalidSearch, frozen: Object.isFrozen(h.handle), unsupported, nativePreserved };
  });
  assert.equal(results.duplicate, true); assert.equal(results.frozen, true); assert.equal(results.conflict, 'INVALID_OPTIONS'); assert.equal(results.sharedTrigger, 'INVALID_OPTIONS'); assert.equal(results.invalidSearch, 'INVALID_OPTIONS');
  assert.equal(results.unsupported, 'UNSUPPORTED_ENVIRONMENT'); assert.equal(results.nativePreserved, true);
  for (const result of results.outcomes) { assert.equal(result.code, 'INVALID_OPTIONS', result.name); assert.equal(result.root, true, result.name); assert.equal(result.trigger, true, result.name); }
  observe('modal validation/ownership', results);
});

test('abort/focus/DOM/restoration callbacks cannot resurrect old sessions or erase a replacement mount', async () => {
  await show();
  await page.evaluate(() => { const h = window.modalHarness; h.state.holdMain = true; void h.handle.search('alpha'); }); await page.waitForFunction(() => window.modalHarness.state.pending.length === 1);
  await page.evaluate(() => { const h = window.modalHarness; h.state.onAbort = () => { h.state.onAbort = null; h.handle.open(); }; h.handle.close(); h.release(); });
  await page.waitForTimeout(30); assert.equal(await opened(), false); assert.deepEqual(await ids(), []);
  const outcome = await page.evaluate(() => {
    const h = window.modalHarness; let focusCallbacks = 0;
    const originalFocus = h.trigger.focus;
    h.trigger.focus = function(...args) { originalFocus.apply(this, args); if (++focusCallbacks === 1) h.handle.open(); };
    h.handle.open(); h.handle.close(); delete h.trigger.focus;
    const newerOpen = h.root.querySelector('dialog').open; h.handle.destroy();
    let reactions = 0, nested, replacement;
    const tag = 'modal-restoration-' + Math.random().toString(36).slice(2);
    customElements.define(tag, class extends HTMLElement {
      disconnectedCallback() { if (++reactions === 1) nested = window.modalFactories.mountRaveldexModal(h.uiOptions); }
      connectedCallback() { if (reactions === 1 && !replacement) { reactions++; replacement = window.modalFactories.mountRaveldexModal(h.uiOptions); } }
    });
    const authored = document.createElement(tag); h.root.replaceChildren(authored);
    const first = window.modalFactories.mountRaveldexModal(h.uiOptions); const duplicate = nested === first; first.destroy();
    const replacementAlive = !!replacement && h.root.querySelector('dialog') !== null;
    if (replacement) { replacement.open(); replacement.close(); replacement.destroy(); }
    return { newerOpen, duplicate, replacementAlive, authoredRestored: h.root.firstChild === authored, reactions };
  });
  assert.equal(outcome.newerOpen, true); assert.equal(outcome.duplicate, true); assert.equal(outcome.replacementAlive, true); assert.equal(outcome.authoredRestored, true);
  observe('reentrant abort/focus/mount/restoration', outcome);
});

test('initial focus callback can close/destroy without starting a hidden query or retaining scroll ownership', async () => {
  for (const method of ['close', 'destroy']) {
    await mount(); await search('alpha');
    const outcome = await page.evaluate(method => {
      const h = window.modalHarness, input = h.root.querySelector('input');
      input.addEventListener('focus', () => h.handle[method](), { once: true }); h.handle.open();
      return { open: !!h.root.querySelector('dialog')?.open, calls: h.state.calls.length, overflow: document.documentElement.style.overflow, restored: h.restored() };
    }, method);
    assert.deepEqual(outcome, { open: false, calls: 0, overflow: '', restored: method === 'destroy' });
  }
  observe('initial autofocus reentrant close/destroy', { nativeQueries: 0, scrollReleased: true });
});

test('narrow/short emulated viewports, RTL, themes and long labels retain reachable search/close and contained scrolling', async () => {
  const long = text => text.repeat(100).slice(0, 511) + 'X';
  await mount({ shortcut: true, modalMessages: { title: long('Search documentation '), close: long('Close search '), escapeHint: long('Escape closes this documentation search '), shortcutHint: long('Control or Command K ') },
    messages: { label: long('Search the complete documentation collection '), submit: long('Find matching documentation ') }, facets: [{ field: 'category', label: long('Documentation category ').slice(0, 256) }] }, { facets: true });
  await dialog().evaluate(d => {
    for (const [name, value] of Object.entries({ '--raveldex-inline-background': '#101820', '--raveldex-inline-color': '#f8fafc', '--raveldex-inline-muted': '#cbd5e1',
      '--raveldex-inline-accent': '#93c5fd', '--raveldex-inline-border': '#94a3b8', '--raveldex-inline-focus': '#fbbf24', '--raveldex-modal-max-width': '38rem' })) d.style.setProperty(name, value);
  });
  await page.addScriptTag({ url: origin + '/axe.js' });
  const observations = [];
  for (const viewport of [{ width: 320, height: 568 }, { width: 640, height: 320 }, { width: 320, height: 240 }]) {
    await page.setViewportSize(viewport); await page.evaluate(() => { document.documentElement.dir = 'rtl'; }); await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'none', colorScheme: 'dark' });
    await show(); await search('alpha'); await part('load-more').click(); await settle();
    const theme = await dialog().evaluate(d => { const s = getComputedStyle(d); return { background: s.backgroundColor, color: s.color, maxWidth: s.getPropertyValue('--raveldex-modal-max-width').trim() }; });
    assert.deepEqual(theme, { background: 'rgb(16, 24, 32)', color: 'rgb(248, 250, 252)', maxWidth: '38rem' });
    assert.equal(await root().getByRole('dialog', { name: long('Search documentation '), exact: true }).count(), 1);
    assert.equal(await root().getByRole('searchbox', { name: long('Search the complete documentation collection '), exact: true }).count(), 1);
    assert.equal(await root().getByRole('button', { name: long('Close search '), exact: true }).count(), 1);
    assert.deepEqual(await modalPart('hint').evaluateAll(nodes => nodes.map(n => n.textContent.length)), [512, 512]);
    const geometry = await page.evaluate(() => {
      const d = document.querySelector('#modal-root dialog'), body = d.querySelector('.raveldex-modal__body'), input = d.querySelector('input'), close = d.querySelector('.raveldex-modal__close');
      const rect = n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      body.scrollTop = body.scrollHeight;
      return { dialog: rect(d), input: rect(input), close: rect(close), scroll: [body.scrollHeight, body.clientHeight, body.scrollTop], overflow: getComputedStyle(body).overflowY, documentWidth: document.documentElement.scrollWidth, viewport: [innerWidth, innerHeight],
        visualViewport: window.visualViewport && { width: visualViewport.width, height: visualViewport.height, offsetTop: visualViewport.offsetTop, scale: visualViewport.scale }, modal: d.matches(':modal') };
    });
    (report.responsiveAttempts ??= []).push({ viewport, geometry }); await save();
    if (process.env.RAVELDEX_MODAL_SCREENSHOTS) { const directory = resolve(process.env.RAVELDEX_MODAL_SCREENSHOTS); await mkdir(directory, { recursive: true }); await page.screenshot({ path: join(directory, `modal-${viewport.width}x${viewport.height}.png`) }); }
    for (const key of ['dialog', 'input', 'close']) { const r = geometry[key]; assert.ok(r.x >= -1 && r.y >= -1 && r.right <= viewport.width + 1 && r.bottom <= viewport.height + 1, `${key} ${JSON.stringify(geometry)}`); }
    assert.ok(geometry.close.height >= 44); assert.ok(geometry.close.width >= 44); assert.ok(geometry.documentWidth <= viewport.width + 1); assert.equal(geometry.overflow, 'auto'); assert.ok(geometry.scroll[0] > geometry.scroll[1]); assert.ok(geometry.scroll[2] > 0);
    assert.deepEqual(await page.evaluate(async () => (await window.axe.run(document.querySelector('#modal-root'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) }))), []);
    const keyboardScroll = [];
    for (const region of [modalPart('title'), part('label')]) {
      const state = await region.evaluate(n => { const r = n.getBoundingClientRect(); return { hidden: r.width <= 2 || r.height <= 2, overflow: n.scrollHeight > n.clientHeight + 1, scrolling: /auto|scroll/.test(getComputedStyle(n).overflowY), tabIndex: n.tabIndex }; });
      if (state.hidden) assert.ok(state.tabIndex < 0, 'A visually hidden label must not add an invisible Tab stop.');
      else if (state.overflow && state.scrolling) {
        await region.evaluate(n => { n.scrollTop = 0; }); await region.focus(); assert.equal(await region.evaluate(n => n === document.activeElement), true);
        await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150); const top = await region.evaluate(n => n.scrollTop); assert.ok(top > 0, 'Visible overflowing text must scroll from the keyboard.'); keyboardScroll.push(top);
      }
    }
    geometry.keyboardScroll = keyboardScroll;
    const tabs = [];
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press('Tab'); const position = await dialog().evaluate(d => { const n = document.activeElement, r = n.getBoundingClientRect(); return { inside: d.contains(n), tag: n.tagName, className: n.className, focused: document.hasFocus(), hidden: r.width <= 2 || r.height <= 2 }; });
      assert.ok(position.inside && !position.hidden || position.tag === 'BODY' && !position.focused, JSON.stringify(position)); tabs.push(position);
    }
    geometry.tabs = tabs; geometry.theme = theme;
    await page.emulateMedia({ forcedColors: 'active' }); assert.equal(await part('input').isVisible(), true); assert.equal(await modalPart('close').isVisible(), true);
    await part('input').focus(); assert.equal(await part('input').evaluate(n => n === document.activeElement), true);
    if (process.env.RAVELDEX_MODAL_SCREENSHOTS) { const directory = resolve(process.env.RAVELDEX_MODAL_SCREENSHOTS); await mkdir(directory, { recursive: true }); await page.screenshot({ path: join(directory, `modal-${viewport.width}x${viewport.height}-forced-colors.png`) }); }
    observations.push(geometry); await close();
  }
  await mount({ keyboardHints: false, shortcut: true }); await show(); assert.equal(await modalPart('footer').count(), 0); await close();
  await page.locator('#modal-trigger').focus(); await page.keyboard.press('Control+k'); assert.equal(await opened(), true);
  observe('responsive/theme/axe emulation', { observations, axeViolations: 0, hintsHidden: true, physicalKeyboardAndZoom: 'Not run' });
});
