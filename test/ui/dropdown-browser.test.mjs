import assert from 'node:assert/strict';
import { before, beforeEach, afterEach, after, test } from 'node:test';
import { createServer } from 'node:http';
import { copyFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { platform, release, arch } from 'node:os';
import { gzipSync } from 'node:zlib';
import { build, version as esbuildVersion } from 'esbuild';
import { chromium, webkit } from 'playwright-core';
import axe from 'axe-core';
import { prepareConsumer, digest, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

let consumer, server, origin, browser, context, page, errors;
let controlTab = 'Tab';
const engine = process.env.RAVELDEX_DROPDOWN_ENGINE ?? process.env.RAVELDEX_UI_BROWSER ?? 'chrome';
const report = { kind: 'raveldex-installed-dropdown-browser-v1', startedAt: new Date().toISOString(),
  environment: { node: process.version, os: { platform: platform(), release: release(), arch: arch() }, esbuild: esbuildVersion, engine },
  observations: [], limits: { humanAT: 'Not run; role snapshots and selected axe checks are automated supporting evidence.',
    physicalIME: 'Not run; composition events are synthetic.', actualZoomTouchKeyboard: 'Not run; viewport/text scaling and scripted input are separate.',
    memory: 'Not measured; bundle/serialized/DOM quantities are not retained or peak heap.',
    WebKit: 'Playwright WebKit is not native Safari or all WebKit versions.' } };
const root = () => page.locator('#dropdown-root');
const part = name => root().locator(`.raveldex-dropdown__${name}`);
const input = () => part('input');
const popup = () => part('popup');
const cells = () => root().locator('[data-raveldex-dropdown-result]');
const ids = () => cells().evaluateAll(nodes => nodes.map(node => node.getAttribute('data-raveldex-dropdown-result')));
const active = () => input().getAttribute('aria-activedescendant');
const calls = () => page.evaluate(() => window.dropdownHarness.calls());
const observe = (name, evidence) => report.observations.push({ name, status: 'Pass', evidence });
async function save() {
  if (!process.env.RAVELDEX_DROPDOWN_REPORT) return;
  const path = resolve(process.env.RAVELDEX_DROPDOWN_REPORT); await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2) + '\n');
}
async function screenshot(name) {
  if (!process.env.RAVELDEX_DROPDOWN_REPORT) return;
  const path = resolve(process.env.RAVELDEX_DROPDOWN_REPORT.replace(/\.json$/, '') + `-${name}.png`);
  await page.screenshot({ path, fullPage: true }); (report.screenshots ??= []).push({ name, path, viewport: page.viewportSize() });
}
async function mount(options = {}, setup = {}) {
  await page.evaluate(async ({ options, setup }) => { await window.cleanupDropdownFixtures(); await window.createDropdownFixture(options, setup); }, { options, setup });
}
async function search(text) { await page.evaluate(text => window.dropdownHarness.handle.search(text), text); }
async function matchIDs(expected) {
  await page.waitForFunction(expected => {
    const root = document.getElementById('dropdown-root');
    return JSON.stringify([...root.querySelectorAll('[data-raveldex-dropdown-result]')].map(node => node.getAttribute('data-raveldex-dropdown-result'))) === JSON.stringify(expected)
      && !root.querySelector('[aria-busy="true"]');
  }, expected);
}
async function expanded() { return popup().evaluate(node => node.matches(':popover-open')); }
async function clearActive() {
  assert.ok(!(await active()));
  assert.equal(await cells().evaluateAll(nodes => nodes.filter(node => node.getAttribute('aria-selected') === 'true').length), 0);
}
async function state(expected) { await page.waitForFunction(expected => document.querySelector('#dropdown-root .raveldex-dropdown')?.dataset.state === expected, expected); }
async function nativeActivation(targetPage, link, options, expected) {
  const opened = targetPage.waitForEvent('popup', { timeout: 1500 }).then(p => p).catch(() => null);
  const followed = targetPage.waitForURL(expected, { timeout: 1500 }).then(() => true).catch(() => false);
  await link.click(options); const [destination, navigated] = await Promise.all([opened, followed]);
  let destinationURL;
  if (destination) { await destination.waitForURL(expected); await destination.waitForLoadState(); destinationURL = destination.url(); await destination.close(); }
  return { mode: destination ? 'new-page' : navigated ? 'same-page' : 'none', destinationURL, mainURL: targetPage.url() };
}

before(async () => {
  assert.ok(['chrome', 'chromium', 'webkit'].includes(engine), 'explicit optional engine selection');
  consumer = await prepareConsumer([], []);
  for (const file of ['dropdown-fixture.mjs', 'dropdown-worker.mjs']) await copyFile(join(REPO_ROOT, 'test/ui', file), join(consumer.directory, file));
  const settings = { absWorkingDir: consumer.directory, bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
    minify: true, treeShaking: true, legalComments: 'none', metafile: true, logLevel: 'silent' };
  const product = await build({ ...settings, entryPoints: ['dropdown-fixture.mjs'], outfile: join(consumer.directory, 'fixture.mjs') });
  const worker = await build({ ...settings, entryPoints: ['dropdown-worker.mjs'], outfile: join(consumer.directory, 'worker.mjs') });
  for (const graph of [product, worker]) for (const path of Object.keys(graph.metafile.inputs))
    assert.ok(['dropdown-fixture.mjs', 'dropdown-worker.mjs'].includes(path) || path.startsWith('node_modules/@vmitsaras/raveldex/dist/'), path);
  await copyFile(join(consumer.directory, 'worker.mjs'), join(consumer.directory, 'dropdown-worker.mjs'));
  await writeFile(join(consumer.directory, 'dropdown-entry.mjs'), "export {mountRaveldexDropdown} from '@vmitsaras/raveldex/addons/ui/dropdown';\n");
  const selected = await build({ ...settings, entryPoints: ['dropdown-entry.mjs'], outfile: join(consumer.directory, 'dropdown-only.mjs') });
  const selectedInputs = Object.keys(selected.metafile.inputs);
  assert.ok(selectedInputs.every(path => path === 'dropdown-entry.mjs' || path.includes('/addons/ui/')
    || path.endsWith('/core/errors/error.js') || path.endsWith('/core/contracts/data.js')), 'dropdown-only imports no engine/provider/worker implementation');
  const bytes = await readFile(join(consumer.directory, 'dropdown-only.mjs'));
  for (const css of ['dropdown.css', 'inline.css']) await copyFile(join(consumer.installed, 'dist/addons/ui', css), join(consumer.directory, css));
  await writeFile(join(consumer.directory, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dropdown verification</title><link rel="stylesheet" href="/dropdown.css"><style>body{margin:1rem;font:16px system-ui}main{min-height:1500px}button,input{font:inherit}#dropdown-root,#second-root{max-width:40rem;min-width:0}#before,#after{min-height:44px}#clip-host{max-width:44rem}</style></head><body><main><h1>Search-result dropdown</h1><button id="before">Before search</button><div id="clip-host"><div id="dropdown-root"><p id="authored">Browse <a href="/guide/a/#details">the guides</a></p></div></div><button id="after">After search</button><label>Other input<input id="outside-input"></label><div id="outside-editable" contenteditable="true" aria-label="Other editable">Edit here</div><div id="second-root"><p>Second fallback</p></div><button id="modal-trigger">Open another search</button><div id="modal-root"><p>Modal fallback</p></div><dialog id="application-dialog"><h2>Application dialog</h2><button id="application-button">Application action</button><div id="dialog-root"><p>Dialog fallback</p></div></dialog></main><script type="module" src="/fixture.mjs"></script></body></html>`);
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/native-controls/') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end('<!doctype html><html lang="en"><title>Native controls baseline</title><main><h1>Native controls</h1><label>First<input id="native-first"></label><button id="native-button">Native action</button><a id="native-full" href="/guide/a/#details">Native full route</a><label>Last<input id="native-last"></label><div id="native-popup" role="grid" popover="manual"><div role="row"><div role="gridcell"><a id="native-link" tabindex="-1" href="/guide/a/#details">Native result</a></div></div></div></main></html>'); return;
    }
    if (path === '/search/') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Full native results</title><link rel="stylesheet" href="/inline.css"><main><h1>Full native results</h1><p id="query-echo"></p><div id="full-root"></div></main><script type="module" src="/fixture.mjs"></script></html>'); return;
    }
    if (/^\/guide\/(?:[a-g]|unicode|unsafe|other)\/$/.test(path)) {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Native destination</title><main><h1>Guide ' + path.split('/')[2] + '</h1><h2 id="details">Details</h2></main></html>'); return;
    }
    const file = { '/': 'index.html', '/fixture.mjs': 'fixture.mjs', '/dropdown-worker.mjs': 'dropdown-worker.mjs', '/dropdown.css': 'dropdown.css', '/inline.css': 'inline.css' }[path];
    if (!file) { response.writeHead(404).end(); return; }
    response.setHeader('content-type', file.endsWith('.css') ? 'text/css' : file.endsWith('.mjs') ? 'text/javascript' : 'text/html');
    response.end(await readFile(join(consumer.directory, file)));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ ...(engine === 'chrome' ? { channel: 'chrome' } : {}), headless: true });
  report.environment.browser = browser.version(); report.package = consumer.package;
  if (engine === 'webkit') {
    const nativeContext = await browser.newContext(), native = await nativeContext.newPage(); nativeContext.setDefaultTimeout(5000);
    try {
      await native.goto(origin + '/native-controls/'); const traversal = [];
      for (const chord of ['Tab', 'Alt+Tab']) {
        await native.locator('#native-first').focus(); const sequence = [];
        for (let i = 0; i < 4; i++) { await native.keyboard.press(chord); sequence.push(await native.evaluate(() => ({ tag: document.activeElement.tagName, id: document.activeElement.id, documentFocused: document.hasFocus() }))); }
        traversal.push({ chord, sequence });
      }
      const reachesControls = item => item.sequence.some(n => n.id === 'native-button') && item.sequence.some(n => n.id === 'native-full');
      controlTab = reachesControls(traversal[0]) ? 'Tab' : 'Alt+Tab'; assert.ok(reachesControls(traversal.find(item => item.chord === controlTab)));
      const activation = {};
      for (const kind of ['middle', 'meta']) {
        await native.goto(origin + '/native-controls/'); await native.evaluate(() => document.getElementById('native-popup').showPopover());
        activation[kind] = await nativeActivation(native, native.locator('#native-link'), kind === 'middle' ? { button: 'middle' } : { modifiers: ['Meta'] }, origin + '/guide/a/#details');
      }
      report.nativeControlBaseline = { method: 'Plain native fields/button/anchors and manual popover; no Raveldex code or setting change', traversal, controlTab, activation };
      if (activation.meta.mode !== 'new-page') report.limits.modifiedNewTab = 'Blocked in recorded WebKit automation: plain native Meta-click did not expose a new page; component parity/events do not establish physical/new-tab support.';
    } finally { await nativeContext.close(); }
  }
  report.consumer = { directory: consumer.directory, installed: consumer.installed,
    dropdownJavaScriptSHA256: digest(await readFile(join(consumer.installed, 'dist/addons/ui/dropdown.js'))),
    copiedFixtureSHA256: digest(await readFile(join(consumer.directory, 'dropdown-fixture.mjs'))) };
  report.graph = { selectedInputs, minifiedBytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9 }).length, sha256: digest(bytes),
    CSS: { bytes: (await readFile(join(consumer.directory, 'dropdown.css'))).length, sha256: digest(await readFile(join(consumer.directory, 'dropdown.css'))) } };
  report.sourceHashes = Object.fromEntries(await Promise.all(['test/ui/dropdown-browser.test.mjs', 'test/ui/dropdown-fixture.mjs', 'test/ui/dropdown-worker.mjs', 'src/addons/ui/dropdown.ts', 'src/addons/ui/dropdown.css']
    .map(async path => [path, digest(await readFile(join(REPO_ROOT, path)))])));
}, { timeout: 120_000 });
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 1100, height: 850 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(15_000);
  page = await context.newPage(); page.setDefaultTimeout(15_000); errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin); await page.waitForFunction(() => typeof window.createDropdownFixture === 'function'); await mount();
});
afterEach(async () => {
  try {
    await page.evaluate(async () => { for (const h of window.dropdownExtraUI ?? []) h.destroy(); await window.cleanupDropdownFixtures?.(); await window.cleanupDestination?.(); });
    assert.deepEqual(errors, []);
  } finally { await context?.close(); await save(); }
});
after(async () => {
  await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  report.finishedAt = new Date().toISOString(); await save();
});

test('core-only idle mount and bounded native results expose a computed combobox/grid/link hierarchy', async () => {
  assert.equal(await input().getAttribute('type'), 'text');
  assert.equal(await input().getAttribute('role'), 'combobox');
  assert.equal(await input().getAttribute('aria-haspopup'), 'grid');
  assert.equal(await input().getAttribute('aria-autocomplete'), 'list');
  assert.equal(await input().getAttribute('aria-expanded'), 'false');
  assert.equal(await input().getAttribute('aria-controls'), await popup().getAttribute('id'));
  assert.equal(await popup().getAttribute('role'), 'grid'); assert.equal(await popup().getAttribute('popover'), 'manual');
  assert.equal(await expanded(), false); assert.deepEqual(await calls(), []); assert.equal(await part('full-results').isHidden(), true);
  await input().fill('shared'); await input().press('Enter'); await matchIDs(['a', 'b', 'c', 'd', 'e']);
  assert.equal(await expanded(), true); assert.equal(await input().getAttribute('aria-expanded'), 'true');
  assert.equal(await input().evaluate(node => node === document.activeElement), true); await clearActive();
  assert.equal(await part('status').textContent(), '7 results. Showing 5.');
  assert.equal(await popup().getByRole('row').count(), 5); assert.equal(await popup().getByRole('gridcell').count(), 5);
  assert.equal(await popup().getByRole('link').count(), 5); assert.deepEqual(await popup().getByRole('link').evaluateAll(nodes => nodes.map(n => n.tabIndex)), [-1, -1, -1, -1, -1]);
  const native = (await calls()).at(-1); assert.equal(native.result.total, 7); assert.equal(native.request.limit, 5); assert.equal(native.request.offset, 0); assert.equal(native.request.extensions, undefined);
  assert.equal(await root().locator('dialog,[data-raveldex-inspect],.raveldex-ui__score,.raveldex-inline').count(), 0);
  const DOMARIA = await root().ariaSnapshot(); assert.match(DOMARIA, /combobox/); assert.match(DOMARIA, /grid/); assert.match(DOMARIA, /gridcell/); assert.match(DOMARIA, /link "Alpha guide"/);
  let nativeAX = { status: 'Not run', reason: 'This engine has no Chrome CDP AX capture here; Playwright ariaSnapshot is a separate page DOM/ARIA-derived snapshot.' };
  if (engine !== 'webkit') {
    await input().press('ArrowDown');
    const session = await context.newCDPSession(page);
    try {
      const { nodes } = await session.send('Accessibility.getFullAXTree');
      const relevant = nodes.filter(n => !n.ignored && ['combobox', 'grid', 'row', 'gridcell', 'link'].includes(n.role?.value))
        .map(n => ({ nodeId: n.nodeId, backendDOMNodeId: n.backendDOMNodeId, role: n.role.value, name: n.name?.value,
          properties: Object.fromEntries((n.properties ?? []).map(p => [p.name, p.value])) }));
      const combo = relevant.find(n => n.role === 'combobox'), grid = relevant.find(n => n.role === 'grid');
      const selected = relevant.filter(n => n.role === 'gridcell' && n.properties.selected?.value === true);
      assert.ok(combo && grid); assert.equal(combo.properties.expanded.value, true); assert.equal(selected.length, 1);
      assert.ok(relevant.some(n => n.role === 'link' && n.name === 'Alpha guide'));
      assert.equal(relevant.filter(n => n.role === 'row').length, 5); assert.equal(relevant.filter(n => n.role === 'gridcell').length, 5);
      assert.ok(combo.properties.controls.relatedNodes.some(n => n.backendDOMNodeId === grid.backendDOMNodeId));
      assert.ok(combo.properties.activedescendant.relatedNodes.some(n => n.backendDOMNodeId === selected[0].backendDOMNodeId));
      nativeAX = { status: 'Pass', method: 'Chrome CDP Accessibility.getFullAXTree; native browser AX tree, not human speech/OS AT testing', nodes: relevant };
    } finally { await session.detach(); }
  }
  await screenshot('desktop'); observe('core idle / native finite hits / semantic hierarchy', { IDs: await ids(), total: 7, limit: 5, offset: 0,
    DOMARIA: { method: 'Playwright locator.ariaSnapshot(), derived in page from DOM/ARIA; not a native platform AX capture', text: DOMARIA }, nativeAX });
});

test('prefix/text modes and Unicode keep literal native membership and exact handoff query meaning', async () => {
  await search('shared alph'); assert.deepEqual(await ids(), ['a']);
  await search('shar alph'); assert.deepEqual(await ids(), []);
  await search('CAFE\u0301'); assert.deepEqual(await ids(), ['unicode']);
  await mount({ fullResults: { url: '/search/?lang=de&mode=prefix&query=old&q=unrelated#results', queryParameter: 'query' } });
  const customRaw = '  shared alph!!  '; await search(customRaw);
  const customURL = new URL(await part('full-results').getAttribute('href'));
  assert.equal(customURL.searchParams.get('query'), customRaw); assert.equal(customURL.searchParams.get('q'), 'unrelated'); assert.equal(customURL.hash, '#results');
  await mount({ mode: 'text', fullResults: { url: '/search/?lang=de&mode=text&q=old#results' } });
  await search('shared alph'); assert.deepEqual(await ids(), []);
  await search('shared alpha'); assert.deepEqual(await ids(), ['a']);
  const raw = '  shared alpha!!  ';
  await search(raw); assert.deepEqual(await ids(), ['a']);
  const href = new URL(await part('full-results').getAttribute('href'));
  assert.equal(href.searchParams.get('q'), raw); assert.equal(href.searchParams.get('mode'), 'text'); assert.equal(href.searchParams.get('lang'), 'de'); assert.equal(href.hash, '#results');
  await part('full-results').click(); await page.getByRole('heading', { name: 'Full native results', exact: true }).waitFor();
  assert.equal(await page.locator('#query-echo').textContent(), raw);
  await page.waitForFunction(() => document.querySelectorAll('[data-raveldex-inline-result]').length === 1);
  assert.equal(await page.locator('[data-raveldex-inline-result]').getAttribute('data-raveldex-inline-result'), 'a');
  observe('literal modes, Unicode and real full-results handoff', { prefix: ['a'], earlierPartial: [], Unicode: ['unicode'], customQuery: customRaw, customHref: customURL.href, raw, href: href.href, destinationIDs: ['a'] });
});

test('virtual arrows clamp, preserve raw input/focus and use stable current cell IDs without automatic selection', async () => {
  await search('shared'); await clearActive();
  const first = await cells().first().getAttribute('id'), last = await cells().last().getAttribute('id');
  await input().press('ArrowDown'); assert.equal(await active(), first);
  for (let i = 0; i < 8; i++) await input().press('ArrowDown'); assert.equal(await active(), last);
  for (let i = 0; i < 8; i++) await input().press('ArrowUp'); assert.equal(await active(), first);
  assert.equal(await cells().locator('[aria-selected="true"]').count(), 0, 'Selection is on the actual cell, not nested decoration');
  assert.equal(await popup().locator('[aria-selected="true"]').count(), 1);
  assert.equal(await input().inputValue(), 'shared'); assert.equal(await input().evaluate(n => n === document.activeElement), true);
  await search('shared'); assert.equal(await cells().first().getAttribute('id'), first); await clearActive();
  await input().press('ArrowUp'); assert.equal(await active(), last);
  await search('shared golf'); await clearActive(); await input().press('ArrowDown');
  assert.notEqual(await active(), first); assert.equal(await ids().then(x => x[0]), 'g');
  observe('virtual selection and stable identity', { first, last, automaticSelection: false, clamps: true, rawPreserved: true });
});

test('native editing and modifier combinations clear virtual selection without replacing text or activating links', async () => {
  // macOS Home/End can scroll a long outer page. Match an ordinary text
  // control in the same non-scrolling document before comparing caret moves.
  await page.locator('main').evaluate(n => { n.style.minHeight = '0'; });
  await page.evaluate(() => window.scrollTo(0, 0)); await page.bringToFront();
  assert.equal(await page.evaluate(() => document.hasFocus()), true);
  const ordinary = page.locator('#outside-input'); await ordinary.fill('shared');
  await ordinary.evaluate(n => n.setSelectionRange(5, 6));
  await ordinary.press('Home'); const nativeHome = await ordinary.evaluate(n => [n.selectionStart, n.selectionEnd]);
  await ordinary.press('End'); const nativeEnd = await ordinary.evaluate(n => [n.selectionStart, n.selectionEnd]);
  await search('shared'); await input().press('ArrowDown');
  await input().evaluate(node => node.setSelectionRange(node.value.length, node.value.length));
  await input().press('Shift+ArrowLeft'); await clearActive();
  assert.equal(await input().inputValue(), 'shared');
  assert.deepEqual(await input().evaluate(n => [n.selectionStart, n.selectionEnd]), [5, 6]);
  await input().press('Home'); assert.deepEqual(await input().evaluate(n => [n.selectionStart, n.selectionEnd]), nativeHome);
  await input().press('End'); assert.deepEqual(await input().evaluate(n => [n.selectionStart, n.selectionEnd]), nativeEnd);
  const before = (await calls()).length;
  await input().press('Control+ArrowDown'); await input().press('Meta+ArrowDown'); await input().press('Shift+Enter');
  assert.equal(await input().inputValue(), 'shared'); await clearActive(); assert.equal(page.url(), origin + '/');
  await page.waitForFunction(() => !document.querySelector('#dropdown-root [aria-busy="true"]'));
  assert.ok((await calls()).length >= before && (await calls()).length <= before + 1, 'Modified Enter may retain native form-submit search, but never activates a hit');
  await input().press(platform() === 'darwin' ? 'Meta+a' : 'Control+a');
  assert.deepEqual(await input().evaluate(n => [n.selectionStart, n.selectionEnd]), [0, 6]);
  observe('native editing/modifiers', { selection: [5, 6], nativeHome, nativeEnd, documentFocused: await page.evaluate(() => document.hasFocus()),
    matchedBaseline: 'Same document/control state with deliberate outer-page scroll removed; original scroll confound and native-only probes preserved separately.',
    modifiedNavigationActivation: false, modifiedEnterSearches: (await calls()).length - before, selectAll: true });
});

test('Enter without a virtual selection searches; Enter on the current result follows its actual anchor', async () => {
  await input().fill('shared alph'); await input().press('Enter'); await matchIDs(['a']); await clearActive();
  assert.equal(page.url(), origin + '/');
  await input().press('ArrowDown'); await input().press('Enter');
  await page.getByRole('heading', { name: 'Guide a', exact: true }).waitFor();
  assert.equal(page.url(), origin + '/guide/a/#details'); assert.equal(await page.locator(':target').getAttribute('id'), 'details');
  observe('Enter search versus actual result activation', { withoutSelection: 'native query', selectedHref: '/guide/a/#details', titleNotInserted: true });
});

test('a focused input preserves native pointer result navigation through its focus transition', async () => {
  await input().fill('shared alph'); await input().press('Enter'); await matchIDs(['a']);
  assert.equal(await input().evaluate(node => document.activeElement === node), true);
  // An explicit blur to no next control must still dismiss the presentation.
  await input().evaluate(node => node.blur()); await state('closed');
  assert.equal(await expanded(), false);
  await input().focus(); await input().press('Enter'); await matchIDs(['a']); await clearActive();
  assert.equal(await input().evaluate(node => document.activeElement === node), true);
  const target = origin + '/guide/a/#details';
  await popup().getByRole('link', { name: 'Alpha guide', exact: true }).click();
  await page.waitForURL(target);
  await page.getByRole('heading', { name: 'Guide a', exact: true }).waitFor();
  assert.equal(page.url(), target);
  observe('focused-input native pointer navigation', { inputInitiallyFocused: true, activeSelection: false,
    bareBlurDismissed: true, nativeHref: target, syntheticActivation: false });
});

test('result anchors retain actual modified/new-tab and context-menu behavior', async () => {
  if (engine === 'webkit') {
    await search('shared');
    const middle = await nativeActivation(page, popup().getByRole('link', { name: 'Alpha guide', exact: true }), { button: 'middle' }, origin + '/guide/a/#details');
    assert.equal(middle.mode, report.nativeControlBaseline.activation.middle.mode);
    if (middle.mode === 'same-page') assert.equal(page.url(), origin + '/guide/a/#details');
    if (middle.mode === 'new-page') assert.equal(middle.destinationURL, origin + '/guide/a/#details');
    if (middle.mode === 'same-page') { await page.goto(origin); await page.waitForFunction(() => typeof window.createDropdownFixture === 'function'); await mount(); }
    await search('shared');
    await page.evaluate(() => {
      window.nativeLinkEvents = [];
      for (const type of ['click', 'auxclick', 'contextmenu']) document.addEventListener(type, e => {
        if (e.target.closest('.raveldex-dropdown__link')) window.nativeLinkEvents.push({ type, prevented: e.defaultPrevented, trusted: e.isTrusted, button: e.button, meta: e.metaKey, ctrl: e.ctrlKey });
      });
    });
    const meta = await nativeActivation(page, popup().getByRole('link', { name: 'Bravo guide', exact: true }), { modifiers: ['Meta'] }, origin + '/guide/b/#details');
    assert.equal(meta.mode, report.nativeControlBaseline.activation.meta.mode);
    if (meta.mode === 'new-page') assert.equal(meta.destinationURL, origin + '/guide/b/#details');
    if (meta.mode === 'none') assert.equal(page.url(), origin + '/');
    await search('shared'); await popup().getByRole('link', { name: 'Charlie guide', exact: true }).click({ button: 'right' }); await page.keyboard.press('Escape');
    const trace = await page.evaluate(() => window.nativeLinkEvents);
    assert.ok(trace.some(e => e.type === 'click' && e.meta && e.trusted && !e.prevented));
    assert.ok(trace.some(e => e.type === 'contextmenu' && e.trusted && !e.prevented));
    observe('native anchor activation', { middle, meta, trace, plainNativeBaseline: report.nativeControlBaseline.activation,
      modifiedNewTab: meta.mode === 'new-page' ? 'Actual new page observed' : 'Blocked; ordinary native control has the same automation behavior. No synthesized activation.' });
    return;
  }
  await search('shared');
  await page.evaluate(() => {
    window.nativeLinkEvents = [];
    for (const type of ['click', 'auxclick', 'contextmenu']) document.addEventListener(type, e => {
      if (e.target.closest('.raveldex-dropdown__link')) window.nativeLinkEvents.push({ type, prevented: e.defaultPrevented, trusted: e.isTrusted, button: e.button, meta: e.metaKey, ctrl: e.ctrlKey });
    });
  });
  const opened = context.waitForEvent('page'); await popup().getByRole('link', { name: 'Alpha guide', exact: true }).click({ button: 'middle' });
  const destination = await opened; await destination.waitForURL(origin + '/guide/a/#details'); await destination.waitForLoadState(); assert.equal(destination.url(), origin + '/guide/a/#details'); await destination.close();
  assert.equal(page.url(), origin + '/'); await search('shared');
  const another = context.waitForEvent('page'); await popup().getByRole('link', { name: 'Bravo guide', exact: true }).click({ modifiers: [platform() === 'darwin' ? 'Meta' : 'Control'] });
  const modified = await another; await modified.waitForURL(origin + '/guide/b/#details'); await modified.waitForLoadState(); assert.equal(modified.url(), origin + '/guide/b/#details'); await modified.close();
  await search('shared'); await popup().getByRole('link', { name: 'Charlie guide', exact: true }).click({ button: 'right' }); await page.keyboard.press('Escape');
  const trace = await page.evaluate(() => window.nativeLinkEvents);
  assert.ok(trace.some(e => e.type === 'auxclick' && e.button === 1 && e.trusted && !e.prevented));
  assert.ok(trace.some(e => e.type === 'click' && (e.meta || e.ctrl) && e.trusted && !e.prevented));
  assert.ok(trace.some(e => e.type === 'contextmenu' && e.trusted && !e.prevented));
  observe('native anchor activation', { mainURLUnchanged: true, newTabHrefs: ['/guide/a/#details', '/guide/b/#details'], trace });
});

test('Escape preserves the field; Tab leaves normally and the separate full-results link remains reachable', async () => {
  await search('shared'); await input().press('ArrowDown'); await input().press('Escape');
  assert.equal(await expanded(), false); assert.equal(await input().getAttribute('aria-expanded'), 'false'); await clearActive();
  assert.equal(await input().inputValue(), 'shared'); assert.equal(await input().evaluate(n => n === document.activeElement), true);
  await input().press('Enter'); await matchIDs(['a', 'b', 'c', 'd', 'e']);
  await input().press('Tab'); assert.equal(await expanded(), false); await clearActive();
  const ordinaryTabDestination = await page.evaluate(() => ({ tag: document.activeElement.tagName, id: document.activeElement.id }));
  await input().focus(); const traversed = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press(controlTab);
    traversed.push(await page.evaluate(() => ({ tag: document.activeElement.tagName, cls: document.activeElement.className, text: document.activeElement.textContent })));
    if (await part('full-results').evaluate(n => n === document.activeElement)) break;
  }
  assert.equal(await part('full-results').evaluate(n => n === document.activeElement), true);
  assert.ok(traversed.every(n => !String(n.cls).includes('__link')), 'Popup links are excluded from page Tab traversal');
  await page.keyboard.press(controlTab); assert.equal(await page.locator('#after').evaluate(n => n === document.activeElement), true);
  observe('Escape and normal Tab / full-results access', { preservedQuery: true, ordinaryTabDestination, controlTraversal: controlTab, traversed,
    nativeMethod: controlTab === 'Alt+Tab' ? 'Recorded WebKit Option/Alt+Tab full-control navigation, verified against plain controls; normal Tab still dismisses' : 'Ordinary Tab',
    fullResultsOutsideGrid: await part('full-results').evaluate(n => !n.closest('[role="grid"]')) });
});

test('Escape dismisses from every owned control and restores editing focus when a result is removed', async () => {
  for (const name of ['submit', 'clear', 'full-results', 'result-link']) {
    await search('shared'); await matchIDs(['a', 'b', 'c', 'd', 'e']);
    const target = name === 'result-link' ? popup().getByRole('link', { name: 'Alpha guide', exact: true }) : part(name);
    await target.focus(); assert.equal(await expanded(), true);
    await target.press('Escape');
    assert.equal(await expanded(), false, `Escape dismisses from ${name}`);
    assert.equal(await input().inputValue(), 'shared'); await clearActive();
    assert.equal(await (name === 'result-link' ? input() : target).evaluate(node => node === document.activeElement), true);
  }
  observe('Escape across owned controls', { controls: ['submit', 'clear', 'full-results', 'result-link'], queryPreserved: true, removedResultFocusRecovered: true });
});

test('Tab dismisses from owned actions without preventing native traversal', async () => {
  for (const name of ['submit', 'clear', 'full-results']) {
    await search('shared'); await matchIDs(['a', 'b', 'c', 'd', 'e']);
    const target = part(name); await target.focus();
    await page.evaluate(() => { window.dismissalTabPrevented = undefined; document.addEventListener('keydown', event => { if (event.key === 'Tab') window.dismissalTabPrevented = event.defaultPrevented; }, { once: true }); });
    await target.press('Tab');
    assert.equal(await expanded(), false, `Tab dismisses from ${name}`);
    assert.equal(await page.evaluate(() => window.dismissalTabPrevented), false);
    assert.equal(await input().inputValue(), 'shared'); await clearActive();
  }
  observe('Tab across owned actions', { controls: ['submit', 'clear', 'full-results'], defaultPrevented: false, queryPreserved: true });
});

test('result dismissal cannot close a newer search started by an authored focus callback', async () => {
  await search('shared'); await matchIDs(['a', 'b', 'c', 'd', 'e']);
  const link = popup().getByRole('link', { name: 'Alpha guide', exact: true }); await link.focus();
  await input().evaluate(node => node.addEventListener('focus', () => { void window.dropdownHarness.handle.search('other'); }, { once: true }));
  await link.press('Escape'); await matchIDs(['other']);
  assert.equal(await expanded(), true); assert.equal(await input().inputValue(), 'other');
  assert.equal(await input().evaluate(node => node === document.activeElement), true); await clearActive();
  observe('dismissal focus reentry', { newerQuery: 'other', currentIDs: ['other'], expanded: true });
});

test('Tab from a focused result preserves the same native destination as the plain document', async () => {
  const destination = target => target.evaluate(() => ({ tag: document.activeElement.tagName, id: document.activeElement.id, classes: document.activeElement.className }));
  for (const chord of ['Tab', 'Shift+Tab']) {
    await search('shared'); await matchIDs(['a', 'b', 'c', 'd', 'e']);
    const html = await page.evaluate(() => { const clone = document.documentElement.cloneNode(true); clone.querySelectorAll('script').forEach(script => script.remove()); return '<!doctype html>' + clone.outerHTML; });
    const native = await context.newPage();
    let expected;
    try {
      await native.goto(origin + '/native-controls/'); await native.setContent(html);
      await native.locator('.raveldex-dropdown__popup').evaluate(node => node.showPopover());
      await native.locator('.raveldex-dropdown__link').first().focus(); await native.keyboard.press(chord); expected = await destination(native);
    } finally { await native.close(); }
    await page.bringToFront(); await search('shared'); await matchIDs(['a', 'b', 'c', 'd', 'e']);
    await popup().getByRole('link', { name: 'Alpha guide', exact: true }).focus();
    await page.keyboard.press(chord);
    assert.equal(await expanded(), false, `${chord} dismisses the popup`);
    assert.deepEqual(await destination(page), expected, `${chord} retains the ordinary browser traversal destination`);
    assert.equal(await input().inputValue(), 'shared');
    observe('native result traversal ' + chord, { expected, actual: await destination(page), plainBaselineHasNoRaveldexHandlers: true });
  }
});

test('composition suppresses interim submit/navigation and performs one committed native search', async () => {
  await search('shared'); await input().press('ArrowDown'); const before = (await calls()).length;
  await input().evaluate(node => {
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); node.value = 'shared alph';
    node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    node.form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
  });
  await input().press('ArrowDown'); await input().press('Enter'); await page.waitForTimeout(80);
  assert.equal((await calls()).length, before); await clearActive(); assert.equal(await expanded(), false);
  assert.equal(await part('full-results').isHidden(), true); await state('composing');
  await input().evaluate(node => {
    node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'shared alph' }));
    node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: false, inputType: 'insertText' }));
  });
  await matchIDs(['a']); await page.waitForTimeout(80); assert.equal((await calls()).length, before + 1);
  assert.equal(await input().inputValue(), 'shared alph'); await clearActive();
  const committedCalls = (await calls()).length;
  await input().evaluate(node => {
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); node.value = 'shared bra';
    node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    window.dropdownHarness.handle.close();
    node.value = 'shared bravo';
    node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'shared bravo' }));
    node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: false }));
  });
  await page.waitForTimeout(80); assert.equal((await calls()).length, committedCalls); assert.equal(await expanded(), false); await state('closed');
  assert.equal(await input().inputValue(), 'shared bravo'); assert.equal(await part('full-results').isVisible(), true);
  const finalRoute = new URL(await part('full-results').getAttribute('href')); assert.equal(finalRoute.searchParams.get('q'), 'shared bravo');
  observe('synthetic composition', { interimRequests: 0, committedRequests: 1, committedIDs: ['a'], closedCompositionRequests: 0,
    closedFinalRoute: finalRoute.href, physicalIME: 'Not run' });
});

test('early arrows share pending work and retain only explicit first/last navigation intent', async () => {
  await page.evaluate(() => { window.dropdownHarness.state.holdNext = true; });
  await input().fill('shared'); await input().press('ArrowDown');
  await page.waitForFunction(() => window.dropdownHarness.state.pending.length === 1);
  for (let i = 0; i < 4; i++) await input().press('ArrowDown');
  await input().press('ArrowUp'); assert.equal((await calls()).length, 1);
  assert.equal(await input().evaluate(n => n === document.activeElement), true);
  await page.evaluate(() => window.dropdownHarness.release()); await matchIDs(['a', 'b', 'c', 'd', 'e']);
  assert.equal(await active(), await cells().last().getAttribute('id'));
  await search('shared'); await clearActive();
  observe('early navigation intent', { pendingRequests: 1, repeatedArrowRequests: 0, finalIntent: 'last', ordinaryReplyAutoSelection: false });
});

test('input edits, revision replacements and late ignored-abort replies cannot retain or revive stale active IDs', async () => {
  await search('shared'); await input().press('ArrowDown');
  await page.evaluate(() => { window.dropdownHarness.state.holdNext = true; void window.dropdownHarness.handle.search('shared'); });
  await page.waitForFunction(() => window.dropdownHarness.state.pending.length === 1); await clearActive();
  await input().fill('singular'); await clearActive();
  await input().press('Enter'); await matchIDs(['unicode']);
  const current = await calls(); const latest = current.at(-1).result;
  await page.evaluate(() => window.dropdownHarness.release()); await page.waitForTimeout(30); assert.deepEqual(await ids(), ['unicode']);
  await page.evaluate(async () => { await window.dropdownHarness.owner.replace({ id: 'a', text: { body: 'other words' } }); });
  await search('shared'); assert.deepEqual(await ids(), ['b', 'c', 'd', 'e', 'f']); await clearActive();
  const revision = (await calls()).at(-1).result.revision; assert.ok(revision > latest.revision); assert.equal((await calls()).at(-1).result.total, 6);
  assert.ok((await calls()).some(c => c.aborted));
  observe('stale requests and revision replacement', { afterLate: ['unicode'], afterRefresh: ['b', 'c', 'd', 'e', 'f'], total: 6, revision });
});

test('outside pointer and focus changes cancel pending programmatic presentation even when focus was already outside', async () => {
  for (const action of ['pointer', 'focus']) {
    await page.locator('#before').focus();
    await page.evaluate(() => { window.dropdownHarness.state.holdNext = true; void window.dropdownHarness.handle.search('shared'); });
    await page.waitForFunction(() => window.dropdownHarness.state.pending.length === 1);
    assert.equal(await page.locator('#before').evaluate(n => n === document.activeElement), true, 'Programmatic search never steals focus');
    if (action === 'pointer') await page.locator('#before').click(); else await page.locator('#outside-input').focus();
    await page.evaluate(() => window.dropdownHarness.release()); await page.waitForTimeout(30);
    assert.equal(await expanded(), false); assert.deepEqual(await ids(), []); await clearActive();
    assert.equal((await calls()).at(-1).aborted, true);
  }
  observe('outside pending dismissal', { pointerWithSameOutsideFocus: true, focusChange: true, latePublication: false });
});

test('native failures, malformed results, no-results and Clear retain deliberate recoverable feedback', async () => {
  await page.evaluate(() => { window.dropdownHarness.state.failNext = true; }); await search('shared');
  await state('error'); assert.match(await part('status').textContent(), /WORK_LIMIT_EXCEEDED/); assert.equal(await part('retry').isVisible(), true); await clearActive();
  await input().focus(); const retryTabs = [];
  for (let i = 0; i < 6 && !await part('retry').evaluate(n => n === document.activeElement); i++) {
    await page.keyboard.press(controlTab);
    assert.equal(await part('retry').isVisible(), true, 'Settled collapsed error retains its keyboard recovery action');
    retryTabs.push(await page.evaluate(() => ({ tag: document.activeElement.tagName, cls: document.activeElement.className, text: document.activeElement.textContent })));
  }
  assert.equal(await part('retry').evaluate(n => n === document.activeElement), true);
  await part('retry').press('Enter'); await matchIDs(['a', 'b', 'c', 'd', 'e']);
  assert.equal(await input().evaluate(n => n === document.activeElement), true, 'Retry deliberately returns focus to editing before it hides');
  for (const kind of ['total', 'revision', 'model', 'hits']) {
    await input().press('ArrowDown'); await page.evaluate(kind => { window.dropdownHarness.state.badReply = kind; }, kind); await search('shared');
    await state('error'); assert.deepEqual(await ids(), []); await clearActive(); assert.match(await part('status').textContent(), /INCOMPATIBLE_CAPABILITY/);
  }
  await search('zzzzmissing'); await state('empty'); assert.equal(await part('status').textContent(), 'No results.'); assert.equal(await input().inputValue(), 'zzzzmissing');
  await part('clear').evaluate(n => n.addEventListener('click', () => {
    window.pointerClearFocus = { node: document.activeElement, tag: document.activeElement.tagName, cls: document.activeElement.className };
  }, { capture: true, once: true }));
  const previous = (await calls()).length; await part('clear').click(); await state('idle'); assert.equal(await input().inputValue(), '');
  const pointerClear = await page.evaluate(() => ({ preserved: document.activeElement === window.pointerClearFocus.node, tag: window.pointerClearFocus.tag, cls: window.pointerClearFocus.cls }));
  assert.equal(pointerClear.preserved, true, 'Clear preserves the actual native pointer-focus owner; WebKit need not focus a clicked button'); assert.equal((await calls()).length, previous);
  assert.equal(await part('full-results').isHidden(), true); assert.equal(await expanded(), false);
  const clearFocus = [];
  for (const name of ['retry', 'full-results', 'popup-link']) {
    if (name !== 'popup-link') { await page.evaluate(() => { window.dropdownHarness.state.failNext = true; }); await search('shared'); await state('error'); }
    else await search('shared');
    const target = name === 'popup-link' ? cells().first().locator('a') : part(name);
    await target.focus(); const count = (await calls()).length;
    await page.evaluate(() => window.dropdownHarness.handle.clear()); await state('idle');
    assert.equal(await input().evaluate(n => n === document.activeElement), true, `Clear replaces the hidden focused ${name} with editing focus`);
    assert.equal((await calls()).length, count); clearFocus.push({ from: name, after: 'input' });
  }
  for (const name of ['input', 'submit', 'clear', 'external']) {
    await search('shared'); const target = name === 'external' ? page.locator('#before') : part(name); await target.focus();
    const count = (await calls()).length; await page.evaluate(() => window.dropdownHarness.handle.clear());
    assert.equal(await target.evaluate(n => n === document.activeElement), true, `Clear preserves ${name} focus`);
    assert.equal((await calls()).length, count); clearFocus.push({ from: name, after: name });
  }
  observe('typed errors / malformed / no-results / clear', { malformed: ['total', 'revision', 'model', 'hits'], retry: true, retryTraversal: controlTab, retryTabs, pointerClear, clearRequests: 0, clearFocus });
});

test('public single-line refusal leaves earlier input intact; malformed/oversized values stay visible with no handoff', async () => {
  await search('shared'); await input().press('ArrowDown'); const before = (await calls()).length;
  const refused = await page.evaluate(() => {
    const h = window.dropdownHarness, before = document.querySelector('.raveldex-dropdown__input').value;
    return [123, 'shared\nalpha', 'shared\ralpha'].map(value => {
      let code; try { h.handle.search(value); } catch (error) { code = error.code; }
      return { code, unchanged: document.querySelector('.raveldex-dropdown__input').value === before };
    });
  });
  assert.deepEqual(refused, [{ code: 'INVALID_OPTIONS', unchanged: true }, { code: 'INVALID_OPTIONS', unchanged: true }, { code: 'INVALID_OPTIONS', unchanged: true }]);
  assert.equal((await calls()).length, before);
  for (const value of ['\ud800', 'x'.repeat(2049)]) {
    await search(value); await state('error'); assert.equal(await input().inputValue(), value); assert.equal(await part('full-results').isHidden(), true); await clearActive();
  }
  await search('   '); await state('idle'); assert.equal(await part('full-results').isHidden(), true);
  await search('safe html'); assert.deepEqual(await ids(), ['unsafe']); assert.equal(await popup().locator('img').count(), 0); assert.equal(await page.evaluate(() => window.dropdownInjection), 0);
  observe('single-line validation / raw refusal / safe text', { refused, malformedAndOversizedVisible: true, unsafeTitleRenderedAsText: true });
});

test('options are captured before DOM mutation and root ownership stays exclusive across UI presets', async () => {
  const output = await page.evaluate(() => {
    const h = window.dropdownHarness, f = window.dropdownFactories; let getters = 0;
    const getter = {}; Object.defineProperty(getter, 'label', { enumerable: true, get() { getters++; return 'No'; } });
    const invalid = [
      { maxResults: 0 }, { maxResults: 21 }, { debounceMs: 2001 }, { mode: 'phrase' }, { shortcut: 1 }, { unknown: true },
      { messages: { label: ' ' } }, { messages: { label: () => 'No' } }, { messages: getter }, { messages: { unknown: 'No' } },
      { fullResults: null }, { fullResults: { url: 'javascript:alert(1)' } }, { fullResults: { url: 'https://user:secret@example.test/' } },
      { fullResults: { url: '/search/', queryParameter: 'a&b' } }, { fullResults: { url: '/search/', queryParameter: '' } },
    ];
    const results = invalid.map(extra => {
      const target = document.createElement('div'), original = document.createTextNode('Original fallback'); target.append(original); document.body.append(target);
      let code; try { f.mountRaveldexDropdown({ ...h.uiOptions, root: target, ...extra }); } catch (error) { code = error.code; }
      const preserved = target.childNodes.length === 1 && target.firstChild === original; target.remove(); return { code, preserved };
    });
    const duplicate = f.mountRaveldexDropdown({ root: h.root, unknown: 'ignored duplicate options' }) === h.handle;
    const collisions = [];
    for (const name of ['mountRaveldexUI', 'mountRaveldexInline']) {
      let code; try { f[name]({ root: h.root, engine: h.borrowed, documents: h.documents }); } catch (error) { code = error.code; }
      collisions.push(code);
    }
    let modalCode; try { f.mountRaveldexModal({ root: h.root, trigger: document.getElementById('modal-trigger'), engine: h.borrowed, documents: h.documents }); } catch (error) { modalCode = error.code; }
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'showPopover');
    const target = document.createElement('div'), fallback = document.createTextNode('Capability fallback'); target.append(fallback); document.body.append(target);
    let unsupported, capabilityPreserved;
    try {
      Object.defineProperty(HTMLElement.prototype, 'showPopover', { ...descriptor, value: undefined });
      try { f.mountRaveldexDropdown({ ...h.uiOptions, root: target }); } catch (error) { unsupported = error.code; }
      capabilityPreserved = target.childNodes.length === 1 && target.firstChild === fallback;
    } finally { Object.defineProperty(HTMLElement.prototype, 'showPopover', descriptor); target.remove(); }
    h.documents[0].title = 'Caller changed title'; h.documents[0].url = 'javascript:alert(1)';
    return { results, getters, duplicate, collisions, modalCode, unsupported, capabilityPreserved, queries: h.state.calls.length };
  });
  assert.ok(output.results.every(r => r.code === 'INVALID_OPTIONS' && r.preserved)); assert.equal(output.getters, 0); assert.equal(output.duplicate, true);
  assert.deepEqual(output.collisions, ['INVALID_OPTIONS', 'INVALID_OPTIONS']); assert.equal(output.modalCode, 'INVALID_OPTIONS'); assert.equal(output.queries, 0);
  assert.equal(output.unsupported, 'UNSUPPORTED_ENVIRONMENT'); assert.equal(output.capabilityPreserved, true);
  await search('shared'); assert.equal(await cells().first().locator('a').textContent(), 'Alpha guide');
  assert.equal(await cells().first().locator('a').getAttribute('href'), origin + '/guide/a/#details');
  observe('capture and exclusive ownership', output);
});

test('pending destruction restores exact authored Nodes and never disposes or revives its borrowed owner', async () => {
  await page.evaluate(() => { window.dropdownHarness.state.holdNext = true; void window.dropdownHarness.handle.search('shared'); });
  await page.waitForFunction(() => window.dropdownHarness.state.pending.length === 1);
  const output = await page.evaluate(async () => {
    const h = window.dropdownHarness; h.handle.destroy(); h.handle.destroy(); h.release();
    await h.handle.search(123); h.handle.open(); h.handle.close(); h.handle.clear();
    const result = await h.owner.search('shared');
    return { restored: h.restored(), borrowedDisposals: h.state.borrowedDisposals, currentTotal: result.total,
      searches: h.state.calls.length, aborted: h.state.calls[0].aborted, UI: h.root.querySelectorAll('.raveldex-dropdown').length };
  });
  await page.waitForTimeout(30); assert.deepEqual(output, { restored: true, borrowedDisposals: 0, currentTotal: 7, searches: 1, aborted: true, UI: 0 });
  const detached = [];
  for (const phase of ['removed', 'adopted']) {
    await page.evaluate(() => { const h = window.dropdownHarness; h.remount(); h.state.holdNext = true; window.detachedDropdownWork = h.handle.search('shared'); });
    await page.waitForFunction(() => window.dropdownHarness.state.pending.length === 1);
    const outcome = await page.evaluate(async phase => {
      const h = window.dropdownHarness, count = h.state.calls.length;
      if (phase === 'removed') h.root.remove();
      else document.implementation.createHTMLDocument('Different owner document').body.append(h.root);
      h.release(); await window.detachedDropdownWork; await h.handle.search('singular');
      const noLateRows = h.root.querySelectorAll('[data-raveldex-dropdown-result]').length === 0;
      h.handle.destroy();
      const restored = h.restored(), newQueries = h.state.calls.length - count;
      document.getElementById('clip-host').append(h.root);
      return { phase, noLateRows, restored, newQueries, borrowedDisposals: h.state.borrowedDisposals };
    }, phase);
    assert.deepEqual(outcome, { phase, noLateRows: true, restored: true, newQueries: 0, borrowedDisposals: 0 }); detached.push(outcome);
  }
  observe('pending destroy and borrowed ownership', { ...output, detached });
});

test('authored fallback callbacks and abort-triggered replacements cannot erase newer mounts', async () => {
  const mountResult = await page.evaluate(async () => {
    const h = window.dropdownHarness, target = document.createElement('div'); document.body.append(target);
    let duplicate, original, armed = true;
    const options = { ...h.uiOptions, root: target };
    customElements.define('dropdown-duplicate-fallback', class extends HTMLElement {
      disconnectedCallback() { if (armed) { armed = false; duplicate = window.dropdownFactories.mountRaveldexDropdown(options); } }
    });
    original = document.createElement('dropdown-duplicate-fallback'); original.textContent = 'Authored fallback'; target.append(original);
    const first = window.dropdownFactories.mountRaveldexDropdown(options); await first.search('shared'); const duplicateSame = first === duplicate;
    first.destroy(); const preserved = target.childNodes.length === 1 && target.firstChild === original; target.remove(); return { duplicateSame, preserved };
  });
  assert.deepEqual(mountResult, { duplicateSame: true, preserved: true });
  await page.evaluate(() => {
    const h = window.dropdownHarness; h.state.holdNext = true; void h.handle.search('shared');
  });
  await page.waitForFunction(() => window.dropdownHarness.state.pending.length === 1);
  await page.evaluate(() => {
    const h = window.dropdownHarness;
    h.state.onAbort = () => { h.state.onAbort = null; h.remount(); void h.handle.search('singular'); };
    h.handle.close(); h.release();
  });
  await matchIDs(['unicode']); assert.equal(await expanded(), true); await clearActive();
  observe('authored duplicate mount and abort replacement', { ...mountResult, replacementIDs: ['unicode'], oldReplyPublication: false });
});

test('native popover cancellation/closure and queued old toggles keep expansion and active references truthful', async () => {
  await popup().evaluate(node => node.addEventListener('beforetoggle', event => { if (event.newState === 'open') event.preventDefault(); }, { once: true }));
  await search('shared'); assert.equal(await expanded(), false); assert.equal(await input().getAttribute('aria-expanded'), 'false'); await clearActive();
  await search('shared'); assert.equal(await expanded(), true); await input().press('ArrowDown');
  await popup().evaluate(node => node.hidePopover()); await clearActive(); assert.equal(await input().getAttribute('aria-expanded'), 'false');
  await page.evaluate(() => { void window.dropdownHarness.handle.search('singular'); }); await matchIDs(['unicode']);
  await page.waitForTimeout(30); assert.equal(await expanded(), true); await clearActive();
  observe('native popover lifecycle', { canceledOpen: 'collapsed', externalClose: 'active cleared synchronously', oldQueuedToggle: 'cannot close current reply' });
});

test('one popup per document uses independent state and a shared borrowed engine without disposing it', async () => {
  await search('shared'); await input().press('ArrowDown');
  await page.evaluate(() => window.createDropdownFixture({ messages: { label: 'Other dropdown' } }, { root: 'second-root', shared: true }));
  await page.evaluate(() => window.dropdownHarness.handle.search('singular'));
  assert.equal(await page.locator('#second-root [popover]').evaluate(n => n.matches(':popover-open')), true);
  assert.equal(await expanded(), false); await clearActive(); assert.equal(await input().inputValue(), 'shared');
  assert.equal(await page.locator('#second-root [data-raveldex-dropdown-result]').getAttribute('data-raveldex-dropdown-result'), 'unicode');
  assert.equal(await page.evaluate(() => window.dropdownOwnerCreations), 1);
  const IDs = await page.locator('.raveldex-dropdown__input').evaluateAll(nodes => nodes.map(n => n.id)); assert.equal(new Set(IDs).size, 2);
  const disposed = await page.evaluate(() => window.dropdownFixtures.map(h => h.state.borrowedDisposals)); assert.deepEqual(disposed, [0, 0]);
  observe('multiple instances / one borrowed owner', { IDs, ownerCreations: 1, disposed });
});

test('optional shortcut coordinates with modal, ignores native editing contexts and removes its owned listener', async () => {
  const shortcut = platform() === 'darwin' ? 'Meta+k' : 'Control+k';
  await page.locator('#before').focus(); await page.keyboard.press(shortcut); assert.equal(await input().evaluate(n => n === document.activeElement), false);
  await page.evaluate(() => {
    window.dropdownDocumentKeys = new Set();
    const add = document.addEventListener, remove = document.removeEventListener;
    document.addEventListener = function(type, callback, options) { if (type === 'keydown') window.dropdownDocumentKeys.add(callback); return add.call(this, type, callback, options); };
    document.removeEventListener = function(type, callback, options) { if (type === 'keydown') window.dropdownDocumentKeys.delete(callback); return remove.call(this, type, callback, options); };
  });
  await mount({ shortcut: true });
  await page.locator('#clip-host').evaluate(n => { n.style.cssText = 'margin-top:1600px;width:400px'; });
  await page.locator('#before').focus(); await page.keyboard.press(shortcut);
  assert.equal(await input().evaluate(n => n === document.activeElement), true); assert.equal((await calls()).length, 0);
  const shortcutBounds = await input().boundingBox(); assert.ok(shortcutBounds.y >= 0 && shortcutBounds.y + shortcutBounds.height <= 851, 'Explicit footer shortcut reveals its input');
  await page.locator('#outside-input').focus(); await page.keyboard.press(shortcut); assert.equal(await page.locator('#outside-input').evaluate(n => n === document.activeElement), true);
  await page.locator('#outside-editable').focus(); await page.keyboard.press(shortcut); assert.equal(await page.locator('#outside-editable').evaluate(n => n === document.activeElement), true);
  const output = await page.evaluate(() => {
    const ignored = [{ repeat: true }, { isComposing: true }, { shiftKey: true }, { altKey: true }, { ctrlKey: true, metaKey: true }].map(extra => {
      document.getElementById('before').focus();
      const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true, ...extra }); document.dispatchEvent(e);
      return { prevented: e.defaultPrevented, inside: window.dropdownHarness.root.contains(document.activeElement) };
    });
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }); event.preventDefault(); document.dispatchEvent(event);
    const preventedStillOutside = !window.dropdownHarness.root.contains(document.activeElement);
    const h = window.dropdownHarness;
    const modal = window.dropdownFactories.mountRaveldexModal({ root: document.getElementById('modal-root'), trigger: document.getElementById('modal-trigger'), engine: h.borrowed, documents: h.documents, shortcut: true });
    window.dropdownExtraUI = [modal]; modal.open();
    return { ignored, preventedStillOutside };
  });
  assert.ok(output.ignored.every(v => !v.prevented && !v.inside)); assert.equal(output.preventedStillOutside, true);
  assert.equal(await page.evaluate(() => window.dropdownDocumentKeys.size), 1, 'Modal and dropdown share one document key listener');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.dropdownHarness.handle.destroy(); document.getElementById('before').focus(); });
  await page.keyboard.press(shortcut); assert.equal(await page.locator('#modal-root dialog').evaluate(n => n.open), true, 'Shared coordinator retains remaining modal registration');
  await page.evaluate(() => window.dropdownExtraUI[0].destroy());
  assert.equal(await page.evaluate(() => window.dropdownDocumentKeys.size), 0);
  observe('opt-in coordinated shortcut', { ...output, shortcutBounds, offscreenShortcutRevealsInput: true, editingContextsRetained: true, modalRegistrationSurvivesDropdownDestroy: true });
});

test('owned open/closed shadow focus stays inside; ancestor native dialog Escape dismisses only the dropdown first', async () => {
  await search('shared'); await input().press('ArrowDown');
  await page.evaluate(() => { document.getElementById('application-dialog').showModal(); document.getElementById('application-button').focus(); });
  await page.waitForFunction(() => !document.querySelector('#dropdown-root [data-raveldex-dropdown-result]'));
  assert.equal(await expanded(), false); await clearActive();
  assert.equal(await root().locator('.raveldex-dropdown').getAttribute('data-state'), 'closed');
  assert.doesNotMatch(await part('status').textContent(), /7 results|Showing 5/);
  await page.evaluate(() => document.getElementById('application-dialog').close());
  assert.doesNotMatch(await part('status').textContent(), /7 results|Showing 5/);
  const observations = [];
  for (const mode of ['open', 'closed']) {
    await page.evaluate(async mode => {
      const h = window.dropdownHarness, host = document.createElement('div'), shadow = host.attachShadow({ mode }), target = document.createElement('div');
      host.style.cssText = 'position:fixed;top:24px;left:24px;width:400px';
      shadow.append(target); document.body.append(host);
      const sheet = document.createElement('link'); sheet.rel = 'stylesheet'; sheet.href = '/dropdown.css';
      const ready = new Promise((resolve, reject) => { sheet.addEventListener('load', resolve, { once: true }); sheet.addEventListener('error', reject, { once: true }); });
      shadow.prepend(sheet); await ready;
      const handle = window.dropdownFactories.mountRaveldexDropdown({ ...h.uiOptions, root: target });
      (window.dropdownExtraUI ??= []).push(handle); window.ownedShadowDropdown = { host, shadow, target, handle };
      handle.open();
    }, mode);
    await page.evaluate(() => window.ownedShadowDropdown.handle.search('shared'));
    await page.keyboard.press('ArrowDown');
    const result = await page.evaluate(() => {
      const h = window.ownedShadowDropdown, field = h.target.querySelector('.raveldex-dropdown__input'), id = field.getAttribute('aria-activedescendant');
      const cell = h.shadow.getElementById(id);
      return { inputFocused: h.shadow.activeElement === field, hostFocused: document.activeElement === h.host,
        validActive: !!cell && cell.getAttribute('data-raveldex-dropdown-result') === 'a', open: h.target.querySelector('[popover]').matches(':popover-open') };
    });
    assert.deepEqual(result, { inputFocused: true, hostFocused: true, validActive: true, open: true });
    await page.keyboard.press('Escape'); await page.evaluate(() => { window.ownedShadowDropdown.handle.destroy(); window.ownedShadowDropdown.host.remove(); }); observations.push({ mode, ...result });
  }
  await page.evaluate(() => document.getElementById('application-dialog').showModal());
  await page.locator('#application-button').focus();
  await page.evaluate(() => window.dropdownHarness.handle.open());
  assert.equal(await page.locator('#application-button').evaluate(n => n === document.activeElement), true);
  assert.equal(await expanded(), false, 'An unrelated modal refuses the ordinary dropdown');
  await page.evaluate(() => window.createDropdownFixture({}, { root: 'dialog-root', shared: true }));
  await page.evaluate(() => { window.dropdownHarness.handle.open(); }); await page.evaluate(() => window.dropdownHarness.handle.search('shared'));
  const dialogInput = page.locator('#dialog-root .raveldex-dropdown__input'); await dialogInput.press('ArrowDown'); await dialogInput.press('Escape');
  assert.equal(await page.locator('#application-dialog').evaluate(n => n.open), true); assert.equal(await page.locator('#dialog-root [popover]').evaluate(n => n.matches(':popover-open')), false);
  await dialogInput.press('Escape'); assert.equal(await page.locator('#application-dialog').evaluate(n => n.open), false);
  observe('captured shadow and ancestor modality', { observations, foreignModalClearsOldCounts: true, firstEscape: 'dropdown', secondEscape: 'native dialog' });
});

test('real module-worker hits remain native and actual worker loss is visible without fallback', async () => {
  await mount({}, { host: 'worker' }); await search('shared'); assert.deepEqual(await ids(), ['a', 'b', 'c', 'd', 'e']); assert.equal((await calls()).at(-1).result.total, 7);
  const ownerCreations = await page.evaluate(() => window.dropdownOwnerCreations);
  await page.evaluate(() => window.dropdownHarness.worker.postMessage({ fixtureCrash: true }));
  await page.waitForFunction(() => window.dropdownHarness.state.workerErrors.length === 1);
  await search('shared alph'); await state('error'); assert.deepEqual(await ids(), []); assert.match(await part('status').textContent(), /DISPOSED/);
  assert.equal(await page.evaluate(() => window.dropdownOwnerCreations), ownerCreations);
  observe('real worker parity and loss', { total: 7, IDs: ['a', 'b', 'c', 'd', 'e'], ownerCreationsBeforeAndAfterLoss: ownerCreations, fallbackOwners: 0, error: await part('status').textContent(), workerErrors: await page.evaluate(() => window.dropdownHarness.state.workerErrors) });
});

test('top-layer placement survives clipping/transform, viewport edges and active-cell scrolling with finite rendered growth', async () => {
  await mount({ maxResults: 20 }, { stress: true });
  await page.locator('#clip-host').evaluate(n => { n.style.cssText = 'overflow:hidden;transform:translateZ(0);width:270px;height:260px'; });
  await page.addStyleTag({ content: '.raveldex-dropdown{--raveldex-dropdown-max-height:8rem}' });
  await search('shared'); assert.equal(await cells().count(), 20); assert.equal((await calls()).at(-1).result.total, 40);
  await input().press('ArrowDown'); for (let i = 0; i < 25; i++) await input().press('ArrowDown');
  const geometry = await popup().evaluate(node => {
    const r = node.getBoundingClientRect(), id = document.querySelector('#dropdown-root .raveldex-dropdown__input').getAttribute('aria-activedescendant');
    const cell = document.getElementById(id).getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height, scrollTop: node.scrollTop,
      activeTop: cell.top, activeBottom: cell.bottom, activeHeight: cell.height, clientHeight: node.clientHeight,
      viewport: [innerWidth, innerHeight], elements: node.querySelectorAll('*').length,
      serializedBytes: new TextEncoder().encode(node.outerHTML).length };
  });
  assert.ok(geometry.left >= 0 && geometry.right <= geometry.viewport[0] + 1 && geometry.top >= 0 && geometry.bottom <= geometry.viewport[1] + 1);
  assert.ok(geometry.scrollTop > 0);
  const visibleActive = Math.min(geometry.activeBottom, geometry.bottom) - Math.max(geometry.activeTop, geometry.top);
  assert.ok(geometry.activeTop >= geometry.top - 1 && visibleActive >= Math.min(44, geometry.clientHeight), 'The active oversized cell exposes at least a usable 44px portion inside its scrollport');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator('#clip-host').evaluate(n => { n.style.cssText = 'position:fixed;bottom:4px;left:8px;width:300px;height:auto;overflow:hidden;transform:translateZ(0)'; });
  await search('shared');
  const edge = await popup().evaluate(n => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, anchor: document.querySelector('#dropdown-root .raveldex-dropdown__input').getBoundingClientRect().top }; });
  assert.ok(edge.left >= 0 && edge.right <= 320 + 1 && edge.top >= 0 && edge.bottom <= 568 + 1); assert.ok(edge.bottom <= edge.anchor + 1, 'Bottom-edge popup chooses available space above');
  const controls = await root().locator('button,a.raveldex-dropdown__full-results').evaluateAll(nodes => nodes.filter(n => !n.hidden).map(n => {
    const r = n.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    return { text: n.textContent, inViewport: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight,
      hit: n === document.elementFromPoint(x, y) || n.contains(document.elementFromPoint(x, y)) };
  }));
  assert.ok(controls.filter(c => c.inViewport).every(c => c.hit), 'Top-layer results do not occlude visible actions');
  await screenshot('320-bottom-clipped-header');
  await page.setViewportSize({ width: 1100, height: 850 });
  await page.locator('#clip-host').evaluate(n => { n.style.cssText = 'margin-top:1600px;width:400px'; });
  await page.locator('#before').focus();
  await page.evaluate(() => { window.dropdownHarness.state.holdNext = true; window.dropdownHarness.handle.open(); });
  await page.waitForFunction(() => window.dropdownHarness.state.pending.length === 1);
  const explicitBounds = await input().boundingBox(); assert.ok(explicitBounds.y >= 0 && explicitBounds.y + explicitBounds.height <= 851);
  assert.equal(await input().evaluate(n => n === document.activeElement), true);
  await page.locator('#before').focus(); await page.evaluate(() => window.dropdownHarness.release()); await page.waitForTimeout(30);
  assert.equal(await page.locator('#before').evaluate(n => n === document.activeElement), true); assert.equal(await expanded(), false);
  observe('finite native projection / top-layer geometry / active visibility', { total: 40, rendered: 20, geometry, edge, controls, explicitBounds,
    explicitOpenRevealsFooterInput: true, noAsyncRefocusAfterOutside: true, quantity: 'DOM/serialized bytes only; not heap/paint/latency' });
});

test('long RTL/dark/text-scaled and forced-color layouts retain controls, active indication and selected axe rules', async () => {
  const label = 'Search the complete documentation '.repeat(10);
  await mount({ maxResults: 5, messages: { label, placeholder: 'Find a guide', resultsLabel: 'Documentation matches' } }, { stress: true });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => { document.documentElement.dir = 'rtl'; document.documentElement.style.fontSize = '200%'; });
  await page.addStyleTag({ content: '.raveldex-dropdown{--raveldex-dropdown-background:#111c29;--raveldex-dropdown-color:#f0f4f8;--raveldex-dropdown-muted:#c4d1de;--raveldex-dropdown-accent:#9bd8fc;--raveldex-dropdown-border:#657b90;--raveldex-dropdown-focus:#ffde59;--raveldex-dropdown-active-background:#243f58;--raveldex-dropdown-active-color:#f0f4f8}' });
  await input().scrollIntoViewIfNeeded(); await search('shared'); await input().press('ArrowDown');
  await page.waitForFunction(() => !document.querySelector('#dropdown-root [aria-busy="true"]'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const focus = await input().evaluate(n => ({ width: getComputedStyle(n).outlineWidth, style: getComputedStyle(n).outlineStyle, label: n.labels[0].textContent, motion: getComputedStyle(n).transitionDuration }));
  assert.equal(focus.label, label); assert.notEqual(focus.style, 'none'); assert.ok(parseFloat(focus.width) > 0); assert.equal(focus.motion, '0s');
  const longLabelRecovery = { popup: await expanded(), status: await part('status').textContent(), fullResults: await part('full-results').isVisible() };
  if (!longLabelRecovery.popup) { assert.match(longLabelRecovery.status, /40.*0/); assert.match(longLabelRecovery.status, /Not enough space/); assert.equal(longLabelRecovery.fullResults, true); }
  await screenshot('320-rtl-long-label-text200');
  // A 340-unit label at 200% can consume the entire short viewport. Its
  // truthful full-results recovery is distinct from the themed popup case.
  await mount({ maxResults: 5, messages: { label: 'Search documentation', resultsLabel: 'Documentation matches' } }, { stress: true });
  await input().scrollIntoViewIfNeeded(); await search('shared'); await input().press('ArrowDown');
  await page.waitForFunction(() => !document.querySelector('#dropdown-root [aria-busy="true"]'));
  const bounds = await popup().boundingBox(); assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 321);
  await screenshot('320-rtl-dark-text200');
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.length })));
  assert.deepEqual(violations, []);
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  const forcedColors = await page.evaluate(() => matchMedia('(forced-colors: active)').matches);
  if (forcedColors) { await screenshot('320-forced-colors-text200'); assert.ok(await popup().locator('.is-active').count()); }
  observe('long labels / RTL / dark / text scaling / forced colors', { labelUnits: label.length, viewport: [320, 568], focus, longLabelRecovery, axeViolations: violations,
    forcedColors: forcedColors ? 'Browser media emulation; not physical high-contrast observation' : 'Not supported by this engine emulation', actualZoom: 'Not run; root CSS font-size200% is text scaling' });
});

test('a short viewport with no usable row retains truthful totals and an accessible full-results recovery without auto-reopening', async () => {
  await page.setViewportSize({ width: 320, height: 240 });
  await page.locator('#clip-host').evaluate(n => { n.style.cssText = 'position:fixed;top:32px;left:8px;width:304px;height:auto'; });
  await page.addStyleTag({ content: '.raveldex-dropdown{--raveldex-dropdown-gap:1.5rem}' });
  await search('shared');
  assert.equal((await calls()).at(-1).result.total, 7); assert.equal(await expanded(), false); assert.deepEqual(await ids(), []); await clearActive();
  assert.notEqual(await root().locator('.raveldex-dropdown').getAttribute('data-state'), 'empty');
  assert.notEqual(await root().locator('.raveldex-dropdown').getAttribute('data-state'), 'error');
  assert.match(await part('status').textContent(), /7.*0/);
  assert.match(await root().textContent(), /Not enough space for this result list\. Open the full-results page\./);
  assert.equal(await part('full-results').isVisible(), true);
  const route = new URL(await part('full-results').getAttribute('href')); assert.equal(route.searchParams.get('q'), 'shared');
  await input().focus();
  for (let i = 0; i < 4 && !await part('full-results').evaluate(n => n === document.activeElement); i++) await page.keyboard.press(controlTab);
  assert.equal(await part('full-results').evaluate(n => n === document.activeElement), true);
  assert.match(await part('status').textContent(), /7.*0/);
  assert.match(await root().textContent(), /Not enough space for this result list\. Open the full-results page\./);
  const linkHit = await part('full-results').evaluate(n => {
    const r = n.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    return { x, y, hit: n === document.elementFromPoint(x, y) || n.contains(document.elementFromPoint(x, y)) };
  });
  assert.equal(linkHit.hit, true); await screenshot('320x240-no-space');
  const count = (await calls()).length; await page.setViewportSize({ width: 1100, height: 850 }); await page.waitForTimeout(50);
  assert.equal(await expanded(), false); assert.equal((await calls()).length, count);
  await input().press('ArrowDown'); await matchIDs(['a', 'b', 'c', 'd', 'e']);
  assert.equal(await expanded(), true); assert.equal(await active(), await cells().first().getAttribute('id'));
  observe('no-space recovery', { viewport: [320, 240], total: 7, shown: 0, noFakeEmptyError: true, controlTraversal: controlTab, fullResultsHref: route.href, linkHit, resizeQueries: 0, explicitArrowReopens: true });
});
