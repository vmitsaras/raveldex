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
let consumer, server, browser, origin, context, page, errors, imageRequests, nativeLinkKey;
const selected = process.env.RAVELDEX_DIRECTORY_CARDS_BROWSER ?? process.env.RAVELDEX_UI_BROWSER ?? 'chrome';
const report = { kind: 'raveldex-installed-directory-cards-v1', observations: [], environment: { node: process.version, platform: process.platform, arch: process.arch, selected },
  scope: 'Fresh physical installed package, native core/filter/facet search, independent oracle, actual image responses/native navigation, scripted keyboard/lifecycle, selected axe and emulated media/layout. No human AT, physical input, actual zoom or Safari claim.' };
const record = (name, details) => report.observations.push({ name, status: 'Pass', details });
const snap = () => page.evaluate(() => window.directoryCards.controller().getSnapshot());
const ids = () => page.locator('[data-raveldex-directory-result]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-raveldex-directory-result')));
const input = () => page.locator('[data-raveldex-directory-input]');
const links = () => page.locator('[data-raveldex-directory-result-link]');
const image = () => page.locator('[data-raveldex-directory-card-image]');
async function ready(text = '', number = 1) { await page.waitForFunction(({ text, number }) => {
  const s = window.directoryCards.controller().getSnapshot(); return s.status === 'ready' && s.state.text === text && s.state.page === number && document.querySelector('.raveldex-directory')?.dataset.state === 'ready';
}, { text, number }); }
async function setPresentation(presentation) { await page.evaluate(p => window.directoryCards.view().setPresentation(p), presentation); }
async function compare(query, filters, text = '', number = 1) {
  await ready(text, number); const expected = directoryExpected(records, schema, query, filters, groups, 2, number), actual = await snap();
  assert.equal(actual.result.total, expected.total); assert.deepEqual(await ids(), expected.hits.map(hit => hit.id)); assert.deepEqual(actual.result.facets, expected.facets);
}
before(async () => {
  assert.ok(['chrome', 'chromium', 'webkit'].includes(selected)); consumer = await prepareConsumer([], []);
  for (const [from, to] of [['test/ui/directory-cards-fixture.mjs', 'fixture-entry.mjs'], ['test/fixtures/directory.mjs', 'directory-data.mjs']]) await copyFile(join(REPO_ROOT, from), join(consumer.directory, to));
  const built = await build({ absWorkingDir: consumer.directory, entryPoints: ['fixture-entry.mjs'], outfile: 'fixture.mjs', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', metafile: true, logLevel: 'silent' });
  report.inputs = Object.keys(built.metafile.inputs); assert.ok(report.inputs.every(p => ['fixture-entry.mjs', 'directory-data.mjs'].includes(p) || p.startsWith('node_modules/@vmitsaras/raveldex/dist/')));
  assert.ok(report.inputs.every(p => !/\/adapters\/|\/addons\/(?:evidence|snippets|sections|inspector)\//.test(p)));
  report.package = consumer.package; report.consumer = { directory: consumer.directory, installed: consumer.installed };
  const source = ['src/addons/ui/directory-cards.ts', 'src/addons/ui/directory-cards-types.ts', 'src/addons/ui/directory-cards-options.ts', 'src/addons/ui/directory-cards.css', 'src/addons/ui/directory-view.ts', 'src/addons/ui/directory-view-mount.ts', 'test/ui/directory-cards.test.mjs', 'test/ui/directory-cards-fixture.mjs'];
  report.sourceSHA256 = Object.fromEntries(await Promise.all(source.map(async p => [p, digest(await readFile(join(REPO_ROOT, p)))])));
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path.startsWith('/images/')) {
      imageRequests.push(path); response.setHeader('cache-control', 'no-store');
      if (path === '/images/broken.png') { response.writeHead(404, { 'content-type': 'text/plain' }); response.end('Missing image'); }
      else { response.setHeader('content-type', 'image/svg+xml'); const send = () => response.end('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><rect width="480" height="320" fill="#35704a"/></svg>'); if (path === '/images/late.svg') setTimeout(send, 150); else send(); }
    } else if (path === '/fixture.mjs') { response.setHeader('content-type', 'text/javascript'); response.end(await readFile(join(consumer.directory, 'fixture.mjs'))); }
    else if (path.endsWith('.css')) { response.setHeader('content-type', 'text/css'); response.end(await readFile(join(consumer.installed, 'dist/addons/ui', path.slice(1)))); }
    else if (path.startsWith('/resource/')) response.end('<!doctype html><html lang="en"><title>Resource destination</title><main><h1>Resource ' + path.split('/')[2] + '</h1></main></html>');
    else response.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Directory cards</title><link rel="stylesheet" href="/directory.css"><link rel="stylesheet" href="/directory-cards.css"><main><h1>Walking library</h1><section id="directory" aria-label="Resource search"><p>Authored browse fallback</p></section><a href="/outside/">Outside</a></main><script type="module" src="/fixture.mjs"></script></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = selected === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ ...(selected === 'chrome' ? { channel: 'chrome' } : {}), headless: true }); report.environment.browser = browser.version();
  const baseline = await browser.newPage(); await baseline.setContent('<!doctype html><a id=one href=/one>One</a><a id=two href=/two>Two</a><button>Button</button>');
  const policy = {}; for (const key of ['Tab', 'Alt+Tab']) { await baseline.locator('#one').focus(); await baseline.keyboard.press(key); policy[key] = await baseline.evaluate(() => document.activeElement.id || document.activeElement.tagName); }
  nativeLinkKey = policy.Tab === 'two' ? 'Tab' : 'Alt+Tab'; assert.equal(policy[nativeLinkKey], 'two', 'the native baseline must expose a supported link-traversal chord'); report.nativeLinkTraversal = { ...policy, exercisedKey: nativeLinkKey, scope: 'Default browser/native link keyboard policy in an otherwise empty document; no preference change or human AT claim.' }; await baseline.close();
}, { timeout: 120000 });
beforeEach(async () => { imageRequests = []; context = await browser.newContext(); page = await context.newPage(); page.setDefaultTimeout(12000); errors = []; page.on('pageerror', e => errors.push(e.message)); await page.goto(origin + '/directory/?unrelated=a%20b#kept'); await page.waitForFunction(() => window.directoryCardsReady); await ready(); });
afterEach(async () => { try { if (await page.evaluate(() => !!window.directoryCards)) await page.evaluate(() => window.directoryCards.cleanup()); assert.deepEqual(errors, []); } finally { await context.close(); } });
after(async () => { await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } if (process.env.RAVELDEX_DIRECTORY_CARDS_REPORT) { const p = resolve(process.env.RAVELDEX_DIRECTORY_CARDS_REPORT); await mkdir(dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(report, null, 2) + '\n'); } });

test('cards reuse contextual empty recovery without presentation queries or focus movement',async()=>{
  await page.evaluate(()=>window.directoryCards.view().search('missing'));await ready('missing');
  assert.equal(await page.locator('[role=status]').textContent(),'No results for “missing”. Try a different search or clear all to browse resources.');
  const input=page.locator('[data-raveldex-directory-input]');await input.focus();
  const calls=await page.evaluate(()=>window.directoryCards.calls.length);await setPresentation({layout:'grid'});
  assert.equal(await page.evaluate(()=>window.directoryCards.calls.length),calls);assert.equal(await input.evaluate(n=>n===document.activeElement),true);
  assert.equal(await page.locator('[role=status]').textContent(),'No results for “missing”. Try a different search or clear all to browse resources.');
  record('shared empty feedback',{extraQueries:0,focus:'input'});
});

test('list, cards and grid retain all independent native IDs, exact totals and pages without extra searches', async () => {
  const expected = directoryExpected(records, schema, { kind: 'all' }, {}, groups, 2), all = [];
  for (let number = 1; number <= 4; number++) {
    await compare({ kind: 'all' }, {}, '', number); const before = await snap(), calls = await page.evaluate(() => window.directoryCards.calls.length);
    for (const layout of ['grid', 'cards', 'list']) { await setPresentation({ layout, density: layout === 'cards' ? 'compact' : 'comfortable' }); assert.deepEqual(await snap(), before); assert.deepEqual(await ids(), expected.allIDs.slice((number - 1) * 2, number * 2)); }
    assert.equal(await page.evaluate(() => window.directoryCards.calls.length), calls); all.push(...await ids());
    if (number < 4) { await page.getByRole('button', { name: 'Next page', exact: true }).click(); await ready('', number + 1); }
  }
  assert.deepEqual(all, expected.allIDs); assert.equal(await page.getByRole('grid').count(), 0); assert.equal(await page.locator('ol > li[data-raveldex-directory-result]').count(), 2);
  record('independent complete presentation parity', { ids: all, pages: 4, layouts: ['list', 'cards', 'grid'], extraQueries: 0 });
});

test('list, cards and grid share plain current counts and enabled zero-choice keyboard filtering', async () => {
  const choice=(field,value)=>page.locator(`input[data-field="${field}"][value="${value}"]`);
  for(const layout of ['list','cards','grid']){
    await page.evaluate(()=>window.directoryCards.view().clear());await ready();await setPresentation({layout});
    await page.locator('details').evaluate(n=>{n.open=true;});
    assert.ok((await page.locator('[data-raveldex-directory-hint]').textContent()).includes('not just this page'));
    await choice('kind','guide').focus();await choice('kind','guide').press('Space');await ready();
    await compare({kind:'all'},{kind:['guide']});assert.equal((await snap()).result.total,3);
    const manual=choice('kind','manual');assert.ok((await manual.locator('..').innerText()).includes('(0)'));assert.equal(await manual.isEnabled(),true);
    await manual.focus();await manual.press('Space');await ready();
    await compare({kind:'all'},{kind:['guide','manual']});assert.equal((await snap()).result.total,5);assert.equal(await manual.evaluate(n=>n===document.activeElement&&n.checked),true);
    await choice('tags','red').focus();await choice('tags','red').press('Space');await ready();
    await compare({kind:'all'},{kind:['guide','manual'],tags:['red']});assert.deepEqual(await ids(),['a','b']);assert.equal((await snap()).result.total,2);
    const calls=await page.evaluate(()=>window.directoryCards.calls.length);await setPresentation({density:'compact'});assert.equal(await page.evaluate(()=>window.directoryCards.calls.length),calls);
    assert.equal(await choice('tags','red').evaluate(n=>n===document.activeElement),true);
  }
  record('plain counts across rich layouts',{layouts:['list','cards','grid'],guide:3,manualBefore:0,guideOrManual:5,withRed:2,keyboard:'native Space',presentationQueries:0});
});

test('filtered non-first-page presentation changes preserve query, selections, facets, URL and native history', async () => {
  await page.evaluate(async () => { const f = window.directoryCards; await f.remount({ url: true }); await f.controller().update({ text: 'shared', filters: { kind: ['guide'] } }); await f.controller().setPage(2); });
  await compare({ kind: 'group', variants: [{ text: 'shared', match: 'prefix' }] }, { kind: ['guide'] }, 'shared', 2);
  const before = await snap(), url = page.url(), history = await page.evaluate(() => window.history.length), calls = await page.evaluate(() => window.directoryCards.calls.length);
  for (const layout of ['grid', 'list', 'cards']) { await setPresentation({ layout, density: 'compact', images: false }); assert.deepEqual(await snap(), before); assert.equal(page.url(), url); }
  assert.equal(await page.evaluate(() => window.history.length), history); assert.equal(await page.evaluate(() => window.directoryCards.calls.length), calls); assert.equal(await page.locator('input[data-field="kind"][value="guide"]').isChecked(), true);
  await page.goBack(); await ready('shared'); assert.deepEqual((await snap()).state.filters.kind, ['guide']); assert.equal(new URL(page.url()).searchParams.get('unrelated'), 'a b'); assert.equal(new URL(page.url()).hash, '#kept');
  record('filtered URL/page parity', { page: 2, total: before.result.total, nativeBack: true, extraHistoryEntries: 0, extraQueries: 0 });
});

test('declared metadata is safe text, missing metadata is readable and mapping is captured before later source mutation', async () => {
  const result = await page.evaluate(async () => {
    const f = window.directoryCards, docs = f.documents.map(d => ({ ...d })); docs[0] = { ...docs[0], title: '<script>unsafe()</script>', excerpt: '<img src=x onerror=unsafe()>', category: 'الفئة العربية', breadcrumb: ['<b>Library</b>', '日本語'], date: '٢ نوفمبر ٢٠٢٦', fields: [{ name: '<em>Length</em>', value: '5 km & more' }] };
    await f.remount({ view: { documents: docs } }); docs[0].excerpt = 'MUTATED'; docs[0].fields[0].value = 'MUTATED'; f.view().setPresentation({ layout: 'grid' });
    return { text: f.root.querySelector('[data-raveldex-directory-result]').textContent, html: f.root.querySelectorAll('script,b,em,img').length };
  });
  assert.equal(result.html, 0); for (const text of ['<script>unsafe()</script>', '<img src=x onerror=unsafe()>', 'الفئة العربية', '<b>Library</b>', '日本語', '٢ نوفمبر ٢٠٢٦', '<em>Length</em>', '5 km & more']) assert.ok(result.text.includes(text), text); assert.ok(!result.text.includes('MUTATED'));
  await page.getByRole('button', { name: 'Next page', exact: true }).click(); await ready('', 2); assert.deepEqual(await ids(), ['c', 'd']); const missing = page.locator('[data-raveldex-directory-result="c"]'); assert.ok((await missing.innerText()).includes('Gamma guide')); assert.equal(await missing.locator('[data-raveldex-directory-card-excerpt],img,dl').count(), 0);
  record('captured safe optional metadata', { hostileTextOnly: true, localized: true, missingOptional: 'title/link retained' });
});

test('unsafe image URLs, unnamed alternatives, dimensions, unknown projection and getters refuse before authored DOM changes even with images off', async () => {
  const result = await page.evaluate(() => {
    const f = window.directoryCards, root = document.createElement('section'), original = document.createElement('p'); original.textContent = 'Keep'; root.append(original); document.body.append(root);
    const base = { root, controller: f.controller(), groups: f.labels, documents: f.documents }, bad = [];
    const patches = [{ image: { src: 'javascript:alert(1)', alt: 'Unsafe', width: 2, height: 2 } }, { image: { src: 'data:image/svg+xml,unsafe', alt: 'Unsafe', width: 2, height: 2 } }, { image: { src: 'https://user:secret@example.invalid/x', alt: 'Unsafe', width: 2, height: 2 } }, { image: { src: '/safe.png', width: 2, height: 2 } }, { image: { src: '/safe.png', alt: '', width: 0, height: 2 } }, { image: { src: '/safe.png', alt: '', width: 2, height: Infinity } }, { excerpt: { html: '<b>No</b>' } }, { fields: [{ name: 'Distance', value: { html: 'No' } }] }, { html: '<b>No</b>' }];
    for (const patch of patches) { try { f.mountRaveldexDirectoryCards({ ...base, documents: [{ ...f.documents[0], ...patch }], presentation: { images: false } }); bad.push(false); } catch { bad.push(root.firstChild === original); } }
    let getters = 0; const doc = { ...f.documents[0] }; Object.defineProperty(doc, 'excerpt', { enumerable: true, get() { getters++; return 'No'; } }); try { f.mountRaveldexDirectoryCards({ ...base, documents: [doc] }); bad.push(false); } catch { bad.push(root.firstChild === original); }
    root.remove(); return { bad, getters };
  });
  assert.deepEqual(result, { bad: Array(10).fill(true), getters: 0 }); assert.deepEqual(imageRequests, []); record('strict pre-DOM capture', { rejected: result.bad.length, getterExecutions: result.getters, disabledImageRequests: 0 });
});

test('base and rich views cannot silently share ownership and repeated rich mounts return their exact handle', async () => {
  const result = await page.evaluate(() => {
    const f = window.directoryCards, options = { root: f.root, controller: f.controller(), documents: f.documents, groups: f.labels };
    const repeated = f.mountRaveldexDirectoryCards(options) === f.view(); let baseRefused = false;
    try { f.mountRaveldexDirectory({ ...options, documents: f.documents.map(({ id, title, url }) => ({ id, title, url })) }); } catch { baseRefused = true; }
    const root = document.createElement('section'); document.body.append(root); const base = f.mountRaveldexDirectory({ ...options, root, documents: f.documents.map(({ id, title, url }) => ({ id, title, url })) });
    let cardsRefused = false; try { f.mountRaveldexDirectoryCards({ ...options, root }); } catch { cardsRefused = true; } base.destroy(); root.remove();
    return { repeated, baseRefused, cardsRefused, ownerTotal: f.controller().getSnapshot().result.total };
  });
  assert.deepEqual(result, { repeated: true, baseRefused: true, cardsRefused: true, ownerTotal: 8 }); record('preset root ownership', result);
});

test('presentation setters validate atomically and cannot mutate captured presentation snapshots', async () => {
  const result = await page.evaluate(() => {
    const f = window.directoryCards, view = f.view(), initial = view.getPresentation(), snapshot = f.controller().getSnapshot(), calls = f.calls.length, failures = [];
    for (const value of [{ layout: 'masonry' }, { density: 'huge' }, { images: 'true' }, { extra: true }, null]) { try { view.setPresentation(value); failures.push(false); } catch { failures.push(JSON.stringify(view.getPresentation()) === JSON.stringify(initial) && f.controller().getSnapshot() === snapshot); } }
    let reads = 0; const value = Object.defineProperty({}, 'images', { enumerable: true, get() { reads++; return true; } }); try { view.setPresentation(value); failures.push(false); } catch { failures.push(reads === 0); }
    const frozen = Object.isFrozen(initial), mutationRefused = Reflect.set(initial, 'images', true) === false; return { failures, frozen, mutationRefused, currentImages: view.getPresentation().images, calls: f.calls.length - calls, initial, reads };
  });
  assert.ok(result.failures.every(Boolean)); assert.equal(result.failures.length, 6); assert.equal(result.frozen, true); assert.equal(result.mutationRefused, true); assert.equal(result.currentImages, false); assert.deepEqual(result.initial, { layout: 'list', density: 'comfortable', images: false }); assert.equal(result.calls, 0); assert.equal(result.reads, 0);
  record('atomic presentation admission', result);
});

test('images require explicit opt-in, reserve dimensions and load only current-page metadata with safe broken-image recovery', async () => {
  assert.equal(await image().count(), 0); assert.deepEqual(imageRequests, []); const disabledDOMNodes = await page.locator('#directory *').count();
  const before = await snap(); await setPresentation({ layout: 'cards', images: true }); await image().first().scrollIntoViewIfNeeded(); await page.waitForFunction(() => document.querySelector('[data-raveldex-directory-card-image]')?.naturalWidth > 0);
  await page.locator('[data-raveldex-directory-result="b"]').scrollIntoViewIfNeeded(); await page.getByText('Image unavailable', { exact: false }).waitFor();
  const successful = await image().first().evaluate(n => ({ alt: n.alt, width: Number(n.getAttribute('width')), height: Number(n.getAttribute('height')), loading: n.loading, decoding: n.decoding, referrerPolicy: n.referrerPolicy, frameHeight: n.parentElement.getBoundingClientRect().height }));
  assert.equal(successful.alt, 'Trail photograph a'); assert.equal(successful.width, 480); assert.equal(successful.height, 320); assert.equal(successful.loading, 'lazy'); assert.equal(successful.decoding, 'async'); assert.equal(successful.referrerPolicy, 'no-referrer'); assert.ok(successful.frameHeight > 0);
  const failed = page.locator('[data-raveldex-directory-result="b"]'); assert.ok((await failed.innerText()).includes('Trail photograph b')); assert.equal(await failed.locator('[data-raveldex-directory-result-link]').count(), 1);
  assert.deepEqual([...imageRequests].sort(), ['/images/a.svg', '/images/broken.png']); const requests = imageRequests.length, enabledDOMNodes = await page.locator('#directory *').count(); await page.waitForTimeout(80); assert.equal(imageRequests.length, requests); assert.deepEqual(await snap(), before);
  await setPresentation({ images: false }); assert.equal(await image().count(), 0); await page.getByRole('button', { name: 'Next page', exact: true }).click(); await ready('', 2); await page.waitForTimeout(30); assert.equal(imageRequests.length, requests);
  await setPresentation({ images: true }); await image().scrollIntoViewIfNeeded(); await page.waitForFunction(() => document.querySelector('[data-raveldex-directory-card-image]')?.naturalWidth > 0); assert.deepEqual(imageRequests, ['/images/a.svg', '/images/broken.png', '/images/d.svg']); assert.equal(await image().getAttribute('alt'), '');
  record('actual image boundaries', { initialRequests: 0, firstPageRequests: requests, afterDisabledPageRequests: requests, requests: imageRequests, reserved: successful, disabledDOMNodes, enabledDOMNodes, domCostScope: 'Observed current-page element counts, not retained memory or physical paint', automaticRetries: 0, decorativeAlternative: '' });
});

test('layout, density and image changes retain native link identities, keyboard focus and semantic reading order', async () => {
  await links().first().focus(); await page.evaluate(() => { window.originalCardLinks = Array.from(document.querySelectorAll('[data-raveldex-directory-result-link]')); });
  for (const presentation of [{ layout: 'grid', density: 'compact' }, { layout: 'cards', density: 'comfortable' }, { layout: 'list', images: true }, { images: false }]) {
    await setPresentation(presentation); assert.equal(await page.evaluate(() => window.originalCardLinks.every((link, index) => link === document.querySelectorAll('[data-raveldex-directory-result-link]')[index])), true); assert.ok(await links().first().evaluate(n => n === document.activeElement)); assert.deepEqual(await ids(), ['a', 'b']);
  }
  await setPresentation({ layout: 'grid' }); assert.equal(await page.locator('[data-raveldex-directory-results]').evaluate(n => getComputedStyle(n).display), 'grid'); await page.keyboard.press(nativeLinkKey); assert.ok(await links().nth(1).evaluate(n => n === document.activeElement)); assert.equal(await page.getByRole('grid').count(), 0);
  await links().nth(1).press('Enter'); await page.waitForURL('**/resource/b/'); assert.equal(await page.locator('h1').innerText(), 'Resource b'); record('semantic native links', { retainedAnchors: 2, keyboardOrder: ['a', 'b'], navigation: '/resource/b/' });
});

test('teardown removes dynamic image behavior, restores original Nodes and preserves foreign markup and borrowed owner', async () => {
  const result = await page.evaluate(async () => {
    const f = window.directoryCards; f.view().setPresentation({ images: true }); const img = f.root.querySelector('img'), frame = img.parentElement; f.view().destroy(); const restored = f.root.firstChild === f.original, detached = frame.textContent; img.dispatchEvent(new Event('error')); const noLateMutation = frame.textContent === detached; f.view().setPresentation({ images: true, layout: 'grid' });
    await f.remount(); f.view().setPresentation({ images: true }); const other = f.root.querySelector('img'), otherFrame = other.parentElement; f.root.textContent = 'Foreign replacement'; f.view().destroy(); other.dispatchEvent(new Event('error')); const foreign = f.root.textContent === 'Foreign replacement'; await f.controller().refresh();
    return { restored, noLateMutation, foreign, disposed: f.disposed(), ownerTotal: (await f.engine.search({ kind: 'all' })).total };
  });
  assert.deepEqual(result, { restored: true, noLateMutation: true, foreign: true, disposed: 0, ownerTotal: 8 }); record('dynamic image teardown', result);
});

test('long RTL metadata reflows in list/cards/grid with emulated dark, forced colors, reduced motion and selected axe checks', async () => {
  await page.evaluate(async () => { const f = window.directoryCards; await f.remount({ view: { documents: f.documents.map(d => ({ ...d, title: 'عنوان طويل '.repeat(40), excerpt: 'وصف المورد الطويل '.repeat(30), category: 'الموارد', breadcrumb: ['المكتبة', 'المسارات'], fields: [{ name: 'المسافة', value: 'المعلومات'.repeat(30) }] })), imageUnavailable: 'الصورة غير متاحة' } }); document.documentElement.dir = 'rtl'; });
  await page.setViewportSize({ width: 320, height: 900 });
  for (const mode of ['light', 'dark', 'forced']) {
    await page.emulateMedia({ colorScheme: mode === 'light' ? 'light' : 'dark', forcedColors: mode === 'forced' ? 'active' : 'none', reducedMotion: 'reduce' }); assert.equal(await page.evaluate(() => matchMedia('(forced-colors: active)').matches), mode === 'forced');
    for (const layout of ['list', 'cards', 'grid']) { await setPresentation({ layout, density: 'compact' }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, mode + '/' + layout); assert.deepEqual(await ids(), ['a', 'b']); }
    await links().first().focus(); assert.ok(await links().first().evaluate(n => getComputedStyle(n).outlineStyle !== 'none')); await page.addScriptTag({ content: axe.source }); const violations = await page.evaluate(async () => (await axe.run(document.querySelector('main'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations); assert.deepEqual(violations, [], mode);
  }
  record('automated rich themes/reflow', { width: 320, direction: 'rtl', layouts: ['list', 'cards', 'grid'], modes: ['light', 'dark', 'forced'], selectedAxeViolations: 0, actualZoom: false });
});

test('validation reentry cannot revive destroyed presentation or overwrite a newer accepted setter', async () => {
  const result = await page.evaluate(async () => {
    const f = window.directoryCards, view = f.view(), before = view.getPresentation();
    const input = new Proxy({ layout: 'grid' }, { ownKeys(target) { view.destroy(); return Reflect.ownKeys(target); } });
    view.setPresentation(input);
    const endedUnchanged = view.getPresentation() === before, restored = f.root.firstChild === f.original;
    await f.remount(); const next = f.view(), state = f.controller().getSnapshot(), calls = f.calls.length;
    next.setPresentation(new Proxy({ layout: 'list' }, { ownKeys(target) { next.setPresentation({ layout: 'cards', density: 'compact' }); return Reflect.ownKeys(target); } }));
    return { endedUnchanged, restored, nested: next.getPresentation(), snapshotRetained: state === f.controller().getSnapshot(), extraQueries: f.calls.length - calls };
  });
  assert.deepEqual(result, { endedUnchanged: true, restored: true, nested: { layout: 'cards', density: 'compact', images: false }, snapshotRetained: true, extraQueries: 0 });
  record('validation callback reentry', result);
});

test('failed image fallback remains fully readable with long alternatives, shallow dimensions and a fixed image height', async () => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(async () => {
    const f = window.directoryCards;
    await f.remount({ view: { documents: f.documents.map((d, index) => ({ ...d, image: index === 0 ? { src: '/images/broken.png', alt: 'A localized alternative for the unavailable path. '.repeat(18), width: 4096, height: 1 } : undefined })), imageUnavailable: 'The requested resource illustration is unavailable', presentation: { layout: 'grid', images: true } } });
    f.root.style.setProperty('--raveldex-directory-card-image-height', '1px');
  });
  const frame = page.locator('[data-raveldex-directory-result="a"] [data-raveldex-directory-card-image-frame]');
  await frame.scrollIntoViewIfNeeded(); await frame.locator('[data-raveldex-directory-card-image-unavailable]').waitFor();
  const dimensions = await frame.evaluate(n => {
    const text = n.firstElementChild, box = n.getBoundingClientRect(), content = text.getBoundingClientRect();
    return { height: box.height, textHeight: content.height, overflow: getComputedStyle(n).overflow, completeText: text.textContent, pageFits: document.documentElement.scrollWidth <= innerWidth + 1 };
  });
  assert.ok(dimensions.height >= dimensions.textHeight, 'the full fallback must fit inside the frame');
  assert.equal(dimensions.pageFits, true); assert.ok(dimensions.completeText.includes('A localized alternative'));
  assert.equal(await page.locator('[data-raveldex-directory-result="a"] [data-raveldex-directory-result-link]').count(), 1);
  assert.ok(imageRequests.includes('/images/broken.png'));
  record('unclipped informative image failure', dimensions);
});
