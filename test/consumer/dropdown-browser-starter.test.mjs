import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { cp, readFile, writeFile, realpath, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { release } from 'node:os';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright-core';
import { prepareConsumer, command, REPO_ROOT, digest } from '../../scripts/lib/packed-consumer.mjs';
import { seedStarterCache } from './inline-astro-starter-cache.mjs';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';
import { STARTERS } from '../../site/starters.mjs';

let consumer, browser;
const sites = [], report = { kind: 'raveldex-dropdown-browser-starter-v1', observations: [] };
const selected = process.env.RAVELDEX_DROPDOWN_BROWSER_STARTER_ENGINE ?? process.env.RAVELDEX_UI_BROWSER ?? 'chrome';
assert.ok(['chrome', 'chromium', 'webkit'].includes(selected));
const record = (name, evidence) => report.observations.push({ name, status: 'Pass', evidence });
const input = page => page.locator('[data-raveldex-dropdown-input]');
const resultIDs = (page, kind = 'dropdown') => page.locator(`[data-raveldex-${kind}-result]`).evaluateAll((nodes, selectedKind) => nodes.map(node => node.getAttribute(`data-raveldex-${selectedKind}-result`)), kind);
async function ready(page) { await page.getByText('Search is ready.', { exact: true }).waitFor(); }
async function headerQuery(page, raw) {
  await input(page).fill(raw); await input(page).press('Enter');
  await page.waitForFunction(() => document.querySelector('.raveldex-dropdown')?.getAttribute('aria-busy') === 'false');
}
async function startPreview(directory, base) {
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; const released = once(reservation, 'close'); reservation.close(); await released;
  const child = spawn(process.execPath, ['preview.mjs', '--port', String(port)], { cwd: directory,
    env: { ...process.env, RAVELDEX_DROPDOWN_BASE: base }, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit'); let output = '';
  child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
  const deadline = Date.now() + 20_000;
  try {
    while (!output.includes('Open http:')) {
      assert.equal(child.exitCode, null, output); assert.ok(Date.now() < deadline, output);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } catch (error) { child.kill('SIGTERM'); await exited; throw error; }
  return { directory, base, origin: `http://127.0.0.1:${port}`, async close() { child.kill('SIGTERM'); await exited; } };
}

before(async () => {
  consumer = await prepareConsumer([], []);
  report.consumer = { directory: consumer.directory, installed: consumer.installed, packedFilename: consumer.packed.filename };
  const cache = join(consumer.directory, 'starter-npm-cache'); report.cache = await seedStarterCache(cache);
  report.package = consumer.package;
  report.installedRuntimeSHA256 = Object.fromEntries(await Promise.all(['dropdown', 'inline', 'modal'].map(async name =>
    [name, digest(await readFile(join(consumer.installed, `dist/addons/ui/${name}.js`)))])));
  report.environment = { node: process.version, platform: process.platform, release: release(), arch: process.arch, selectedEngine: selected,
    tooling: 'Fresh actual offline installed core tarball and esbuild0.28.2; no runtime or tooling symlinks.' };
  const starter = STARTERS.find(item => item.id === 'dropdown-browser'); assert.ok(starter);
  report.sourceSHA256 = Object.fromEntries(await Promise.all(starter.files.map(async file => [file, digest(await readFile(join(REPO_ROOT, 'examples/dropdown-browser', file)))])));
  for (const base of ['/', '/help/']) {
    const directory = join(consumer.directory, base === '/' ? 'dropdown-root' : 'dropdown-help');
    await cp(join(REPO_ROOT, 'examples/dropdown-browser'), directory, { recursive: true,
      filter: path => !/(?:^|\/)dist(?:\/|$)|build-meta\.json$|node_modules/.test(path) });
    const entries = JSON.parse(await readFile(join(directory, 'content.json'), 'utf8'));
    entries[0].title = 'Plan a riverside walking trip — a detailed guide to a long and welcoming route';
    entries[0].body += ' Riverside paths are part of this walking guide.';
    await writeFile(join(directory, 'content.json'), JSON.stringify(entries));
    const css = await readFile(join(directory, 'theme.css'), 'utf8'); assert.match(css, /--raveldex-dropdown-gap: 1rem;/);
    await writeFile(join(directory, 'theme.css'), css.replace('--raveldex-dropdown-gap: 1rem;', '--raveldex-dropdown-gap: 1.25rem;'));
    const configuration = await readFile(join(directory, 'configuration.mjs'), 'utf8'); assert.match(configuration, /modalHandoff:\s*false/);
    if (base === '/help/') await writeFile(join(directory, 'configuration.mjs'), configuration.replace(/modalHandoff:\s*false/, 'modalHandoff: true'));
    await command('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', cache,
      join(consumer.directory, consumer.packed.filename)], directory);
    for (const path of ['esbuild', '@vmitsaras/raveldex']) assert.equal(await realpath(join(directory, 'node_modules', path)), join(directory, 'node_modules', path));
    await command('env', [`RAVELDEX_DROPDOWN_BASE=${base}`, 'npm', 'run', 'build', '--cache', cache], directory);
    const graph = JSON.parse(await readFile(join(directory, 'build-meta.json'), 'utf8'));
    for (const [path, data] of Object.entries(graph.inputs)) {
      assert.ok(!path.includes('/src/'), `No repository runtime source ${path}`);
      assert.doesNotMatch(path, /\/adapters\/|\/addons\/(?:facets|snippets|evidence|inspector|sections)\/(?:index|builder|inspector|facets|snippets)\.js$/);
      assert.ok(data.imports.every(item => !item.external), `Unbundled runtime dependency ${path}`);
    }
    assert.ok(Object.keys(graph.inputs).some(path => path.endsWith('/dist/addons/ui/dropdown.js')));
    assert.ok(Object.keys(graph.inputs).some(path => path.endsWith('/dist/addons/ui/inline.js')));
    await writeFile(join(directory, 'lifecycle-entry.mjs'), "export {createHeaderSearch} from './controller.mjs';export {readInitialQuery,configuration} from './configuration.mjs';export {createRaveldex} from '@vmitsaras/raveldex';\n");
    await build({ absWorkingDir: directory, entryPoints: ['lifecycle-entry.mjs'], outfile: 'dist/assets/lifecycle.js',
      bundle: true, platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent' });
    const site = await startPreview(directory, base); site.entries = entries;
    // Independent oracle owns analysis and scoring. The fixture explicitly
    // means exact 'walking' AND a final prefix group 'gui', no UI query helper.
    const scan = scanSourceCorpus(entries.map(entry => ({ id: entry.id, text: { title: entry.title, body: entry.body } })), { text: { title: { boost: 2 }, body: {} } });
    site.expected = sourceQueryResult(scan, { kind: 'and', children: [{ kind: 'text', text: 'walking' },
      { kind: 'group', variants: [{ text: 'gui', match: 'prefix' }] }] }, { limit: 20 });
    assert.deepEqual(site.expected.hits.map(hit => hit.id).sort(), ['access', 'care', 'getting-started', 'maps', 'packing', 'symbols', 'weather']);
    sites.push(site);
    record(`copied installed build ${base}`, { base, modalHandoff: base === '/help/', changedTitle: entries[0].title,
      directory, copiedSourceSHA256: Object.fromEntries(await Promise.all(starter.files.map(async file => [file, digest(await readFile(join(directory, file)))]))),
      copiedControllerSHA256: digest(await readFile(join(directory, 'controller.mjs'))), graphInputs: Object.keys(graph.inputs),
      JSBytes: (await readFile(join(directory, 'dist/assets/main.js'))).length, JSsha256: digest(await readFile(join(directory, 'dist/assets/main.js'))),
      CSSBytes: (await readFile(join(directory, 'dist/assets/main.css'))).length, CSSsha256: digest(await readFile(join(directory, 'dist/assets/main.css'))) });
  }
  browser = selected === 'webkit' ? await webkit.launch({ headless: true })
    : await chromium.launch({ ...(selected === 'chromium' ? {} : { channel: 'chrome' }), headless: true });
  report.environment.browser = browser.version();
  report.limitations = ['No human AT/speech, physical IME/touch/on-screen keyboard or actual browser zoom. Scripted composition, viewport/text scaling and DOM checks are separate.',
    'Playwright WebKit is not Safari; ordinary native keyboard preference and new-tab boundaries remain separately scoped. No memory, physical paint or latency claim.'];
}, { timeout: 120000 });
after(async () => {
  await browser?.close();
  for (const site of sites) await site.close();
  if (process.env.RAVELDEX_DROPDOWN_BROWSER_STARTER_REPORT) await writeFile(process.env.RAVELDEX_DROPDOWN_BROWSER_STARTER_REPORT, JSON.stringify(report, null, 2) + '\n');
});

test('copied installed header and full-results route preserve exact query/order/all pages and real destinations at root/help', async () => {
  for (const site of sites) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } }); page.setDefaultTimeout(10_000);
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.goto(site.origin + site.base); await ready(page);
    assert.equal(await page.locator('[data-search-modal-trigger]').isHidden(), site.base === '/');
    assert.equal(await page.locator('.raveldex-dropdown').evaluate(node => getComputedStyle(node).getPropertyValue('--raveldex-dropdown-gap').trim()), '1.25rem');
    const raw = '  walking   gui  '; await headerQuery(page, raw);
    await page.locator('[data-raveldex-dropdown-result]').nth(2).waitFor();
    const expected = site.expected.hits.map(hit => hit.id);
    assert.deepEqual(await resultIDs(page), expected.slice(0, 3));
    assert.match(await page.locator('[data-raveldex-dropdown-status]').innerText(), /7 results\. Showing 3/);
    const full = page.locator('[data-raveldex-dropdown-full-results]');
    const destination = new URL(await full.getAttribute('href'));
    assert.equal(destination.pathname, site.base + 'search/'); assert.equal(destination.searchParams.get('q'), raw);
    assert.equal(destination.searchParams.get('from'), 'header'); assert.equal(destination.hash, '#results');
    await full.click(); await ready(page);
    await page.locator('[data-raveldex-inline-result]').nth(2).waitFor();
    assert.equal(page.url(), destination.href);
    assert.equal(await page.locator('[data-raveldex-inline-input]').inputValue(), raw);
    assert.deepEqual(await resultIDs(page, 'inline'), expected.slice(0, 3));
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await page.locator('[data-raveldex-inline-result]').nth(5).waitFor();
    const six = await resultIDs(page, 'inline'); assert.deepEqual(six, expected.slice(0, 6));
    await page.getByRole('button', { name: 'Next results', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-raveldex-inline-result]').length === 1);
    const last = await resultIDs(page, 'inline'); assert.deepEqual([...six, ...last], expected);
    const guide = page.locator('[data-raveldex-inline-result] a').first(); const href = new URL(await guide.getAttribute('href'));
    assert.ok(href.pathname.startsWith(site.base + 'guides/')); await guide.click();
    await page.getByRole('heading', { level: 1 }).waitFor(); assert.equal(page.url(), href.href);
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), site.entries.find(entry => entry.id === last[0]).title);
    await ready(page);
    const keyboardID = last[0] === 'getting-started' ? 'weather' : 'getting-started';
    await headerQuery(page, keyboardID === 'weather' ? 'forecast' : 'riverside');
    await page.locator('[data-raveldex-dropdown-result]').first().waitFor();
    const keyboardDestination = new URL(site.entries.find(entry => entry.id === keyboardID).path.slice(1), site.origin + site.base).href;
    await input(page).press('ArrowDown'); await input(page).press('Enter'); await page.waitForURL(keyboardDestination);
    await page.getByRole('heading', { level: 1 }).waitFor(); assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), site.entries.find(entry => entry.id === keyboardID).title);
    assert.deepEqual(errors, []); await page.close();
    record(`native full route ${site.base}`, { raw, destination: destination.pathname + destination.search + destination.hash, expectedIDs: expected, actualCompleteIDs: [...six, ...last], guide: href.pathname, nativeArrowEnterDestination: keyboardDestination });
  }
}, { timeout: 45000 });

test('no-JavaScript browsing and real failed-data retry keep actual guides usable', async () => {
  const site = sites[0], context = await browser.newContext({ javaScriptEnabled: false }), fallback = await context.newPage();
  await fallback.goto(site.origin + site.base + 'search/?q=walking');
  assert.equal(await fallback.locator('[data-search-root] form').isVisible(),false,'No-JavaScript pages offer truthful browse links, not a nonworking search form');
  assert.equal(await fallback.getByRole('navigation', { name: 'Browse all guides' }).getByRole('link').count(), 7);
  await fallback.getByRole('navigation', { name: 'Browse all guides' }).getByRole('link').first().click();
  assert.equal(await fallback.getByRole('heading', { level: 1 }).count(), 1); await context.close();
  const page = await browser.newPage(); page.setDefaultTimeout(10_000);
  await page.route('**/content.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.goto(site.origin + site.base); await page.locator('[data-search-retry]').waitFor();
  assert.equal(await page.locator('.raveldex-dropdown').count(), 0);
  assert.equal(await page.getByRole('navigation', { name: 'Browse all guides' }).getByRole('link').count(), 7);
  await page.unroute('**/content.json'); await page.locator('[data-search-retry]').click(); await ready(page);
  await headerQuery(page, 'riverside'); await page.locator('[data-raveldex-dropdown-result]').first().waitFor();
  assert.deepEqual(await resultIDs(page), ['getting-started']);
  const href = await page.locator('[data-raveldex-dropdown-result] a').getAttribute('href'); await page.locator('[data-raveldex-dropdown-result] a').click();
  await page.waitForURL(href); assert.equal(page.url(), href); await page.close(); record('no-JavaScript and real failed-data retry', { browseLinks: 7, recoveredIDs: ['getting-started'], actualGuide: href });
});

test('without native popovers a real header form reaches a working full-results page at each base', async () => {
  for (const site of sites) {
    const context = await browser.newContext({ viewport: { width: 320, height: 700 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      delete HTMLElement.prototype.showPopover; delete HTMLElement.prototype.hidePopover;
    });
    const page = await context.newPage(); page.setDefaultTimeout(8000); let contentRequests = 0;
    page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/content.json')) contentRequests++; });
    await page.goto(site.origin + site.base);
    await page.getByText(/Quick search is unavailable/).waitFor();
    const form = page.locator('[data-search-root] form'), field = form.getByRole('searchbox');
    assert.equal(await field.isVisible(), true); assert.equal(contentRequests, 0, 'Header-only unsupported search does not load a needless owner');
    const raw = '  walking   gui  '; await field.fill(raw); await field.press('Enter');
    await page.waitForURL(url => url.pathname === site.base + 'search/');
    assert.equal(new URL(page.url()).searchParams.get('q'), raw);
    await page.locator('[data-raveldex-inline-result]').nth(2).waitFor();
    assert.deepEqual(await resultIDs(page, 'inline'), site.expected.hits.slice(0,3).map(h=>h.id));
    assert.equal(await page.locator('.raveldex-dropdown').count(), 0);
    assert.equal(await page.getByRole('navigation', {name:'Browse all guides'}).getByRole('link').count(), 7);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    if (process.env.RAVELDEX_DROPDOWN_BROWSER_STARTER_REPORT) await page.screenshot({path:resolve(process.env.RAVELDEX_DROPDOWN_BROWSER_STARTER_REPORT.replace(/\.json$/,'')+`-no-popover-${site.base==='/'?'root':'help'}.png`),fullPage:true});
    await context.close(); record(`no native popover ${site.base}`, { raw, headerLoads:0, fullPageIDs:site.expected.hits.slice(0,3).map(h=>h.id), borrowedPresetFallback:false });
  }
});

test('a supported header never offers a draft field that loading will replace', async () => {
  const site=sites[0],page=await browser.newPage();let release,entered;
  const gate=new Promise(ok=>release=ok),waiting=new Promise(ok=>entered=ok);
  await page.route('**/content.json',async route=>{entered();await gate;await route.continue().catch(()=>{});});
  try{
    await page.goto(site.origin+site.base);await waiting;
    assert.equal(await page.locator('[data-search-root] input').isVisible(),false);
    assert.equal(await page.getByRole('navigation',{name:'Browse all guides'}).getByRole('link').count(),7);
    release();await ready(page);await input(page).fill('riverside');await input(page).press('Enter');await page.locator('[data-raveldex-dropdown-result]').first().waitFor();
    assert.deepEqual(await resultIDs(page),['getting-started']);
  }finally{release();await page.close();}
});

test('delayed loading and pagehide/pageshow cannot mount an abandoned owner', async () => {
  const site = sites[0], page = await browser.newPage(); page.setDefaultTimeout(10_000);
  let entered, release; const waiting = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  await page.route('**/content.json', async route => { entered(); await gate; await route.continue().catch(() => {}); });
  await page.goto(site.origin + site.base); await waiting;
  assert.match(await page.locator('[data-search-status]').innerText(), /Loading search/);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  assert.match(await page.locator('[data-search-status]').innerText(), /closed/i);
  release(); await page.unroute('**/content.json');
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 50)));
  assert.equal(await page.locator('.raveldex-dropdown').count(), 0);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await ready(page); assert.equal(await page.locator('.raveldex-dropdown').count(), 1);
  await page.close(); record('scripted page lifecycle after delayed fetch', { abandonedMounts: 0, freshRestoredMounts: 1, physicalBFCache: 'Not claimed' });
});

test('native editing, composition, Clear and outside dismissal preserve the installed header state', async () => {
  const site = sites[0], page = await browser.newPage({ viewport: { width: 1080, height: 900 } }); page.setDefaultTimeout(10_000);
  await page.goto(site.origin + site.base); await ready(page);
  await headerQuery(page, 'walking gui'); await page.locator('[data-raveldex-dropdown-result]').nth(2).waitFor();
  await input(page).press('ArrowDown'); const active = await input(page).getAttribute('aria-activedescendant'); assert.ok(active);
  assert.equal(await page.locator('#' + active).getAttribute('aria-selected'), 'true');
  assert.equal(await input(page).evaluate(node => document.activeElement === node), true);
  await input(page).press('Home'); assert.equal(await input(page).getAttribute('aria-activedescendant'), null);
  await input(page).evaluate(node => {
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); node.value = 'river';
    node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, data: 'river' }));
  });
  assert.equal(await input(page).getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('[data-raveldex-dropdown-full-results]').isHidden(), true);
  await input(page).evaluate(node => {
    node.value = 'riverside'; node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'riverside' }));
    node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: 'riverside' }));
  });
  await page.locator('[data-raveldex-dropdown-result]').first().waitFor(); assert.deepEqual(await resultIDs(page), ['getting-started']);
  await page.mouse.click(5, 500); assert.equal(await input(page).getAttribute('aria-expanded'), 'false');
  assert.equal(await input(page).inputValue(), 'riverside');
  await input(page).focus(); await input(page).press('ArrowDown'); await page.locator('[data-raveldex-dropdown-result]').first().waitFor();
  await input(page).press('Tab'); assert.equal(await input(page).getAttribute('aria-expanded'), 'false');
  await page.locator('[data-raveldex-dropdown-clear]').click(); assert.equal(await input(page).inputValue(), '');
  assert.equal(await page.locator('[data-raveldex-dropdown-full-results]').isHidden(), true);
  await headerQuery(page, 'unmatchednonce'); await page.getByText('No results for “unmatchednonce”. Try a different search or open the full-results page.', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-raveldex-dropdown-result]').count(), 0);
  await page.close(); record('installed native editing and synthetic composition', { activeDescendant: true, composedIDs: ['getting-started'], outsideTabClearNoResults: 'Pass', physicalIME: 'Not run' });
});

test('only the explicitly configured modal handoff transfers unchanged raw query to the same search content', async () => {
  const root = sites[0], disabled = await browser.newPage(); disabled.setDefaultTimeout(10_000);
  await disabled.goto(root.origin + root.base); await ready(disabled);
  assert.equal(await disabled.locator('[data-search-modal-trigger]').isHidden(), true);
  await disabled.setViewportSize({ width: 320, height: 568 }); assert.equal(await disabled.locator('dialog[open]').count(), 0); await disabled.close();
  const site = sites[1], page = await browser.newPage({ viewport: { width: 1080, height: 900 } }); page.setDefaultTimeout(10_000);
  const dataRequests = []; page.on('request', request => { if (request.url().endsWith('/content.json')) dataRequests.push(request.url()); });
  await page.goto(site.origin + site.base); await ready(page);
  const raw = '  walking   gui  '; await headerQuery(page, raw); await page.locator('[data-raveldex-dropdown-result]').nth(2).waitFor();
  const trigger = page.getByRole('button', { name: 'Open expanded search', exact: true }); await trigger.click();
  const dialog = page.locator('dialog[open]'); await dialog.waitFor();
  assert.equal(await input(page).getAttribute('aria-expanded'), 'false');
  assert.equal(await dialog.locator('[data-raveldex-inline-input]').inputValue(), raw);
  await dialog.locator('[data-raveldex-inline-result]').nth(2).waitFor();
  assert.deepEqual(await resultIDs(dialog, 'inline'), site.expected.hits.slice(0, 3).map(hit => hit.id));
  assert.equal(await dialog.locator('[aria-keyshortcuts]').count(), 0);
  await dialog.getByRole('button', { name: 'Close search', exact: true }).click();
  assert.equal(await trigger.evaluate(node => document.activeElement === node), true);
  assert.equal(await input(page).inputValue(), raw);
  // Reuse the already mounted modal. Its persistent native trigger binding
  // must not reopen an old query after the wrapper refuses this activation.
  for (const invalid of ['composing', 'malformed', 'oversize']) {
    await input(page).evaluate((node, kind) => {
      node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      if (kind === 'composing') node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      node.value = kind === 'composing' ? 'interim' : kind === 'malformed' ? String.fromCharCode(0xd800) : 'x'.repeat(2049);
      node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: kind === 'composing' }));
    }, invalid);
    await trigger.click();
    assert.equal(await page.locator('dialog[open]').count(), 0, `Refused ${invalid} cannot reopen the persistent modal`);
  }
  await headerQuery(page, raw);
  await page.evaluate(() => { window.originalDialogShowModal = HTMLDialogElement.prototype.showModal; HTMLDialogElement.prototype.showModal = undefined; });
  try {
    await trigger.click();
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.match(await page.locator('[data-search-status]').innerText(), /Expanded search could not open/);
    assert.equal(new URL(await page.locator('[data-raveldex-dropdown-full-results]').getAttribute('href')).searchParams.get('q'), raw);
  } finally { await page.evaluate(() => { HTMLDialogElement.prototype.showModal = window.originalDialogShowModal; delete window.originalDialogShowModal; }); }
  await trigger.click(); await page.locator('dialog[open] [data-raveldex-inline-result]').nth(2).waitFor();
  assert.equal(await page.locator('dialog[open] [data-raveldex-inline-input]').inputValue(), raw);
  assert.equal(await page.locator('[data-search-status]').innerText(), 'Search is ready.');
  assert.equal(dataRequests.length, 1, 'Expanded search and its failure/recovery do not reload or create another content owner');
  await page.close();
  record('explicit changed configuration modal handoff', { default: false, enabledByCopiedConfiguration: true, raw, sameContentAndOrder: true,
    refusedAfterFirstValidMount: ['composing', 'malformed', 'oversize'], optionalDialogRefusalAndRetry: true, dataRequests: dataRequests.length, automaticViewportHandoff: false });
});

test('one-time full-route query admission preserves valid raw input and refuses ambiguous or invalid values', async () => {
  const site = sites[0], page = await browser.newPage(); page.setDefaultTimeout(10_000);
  await page.goto(site.origin + site.base); await ready(page);
  const values = await page.evaluate(async base => {
    const { readInitialQuery } = await import(base + 'assets/lifecycle.js');
    return ['?q=++walking+++gui++', '?q=one&q=two', '?q=a%0Ab', '?q=' + 'a'.repeat(2049), '?q=' + String.fromCharCode(0xd800), '?other=keep#results',
      '?q=' + encodeURIComponent(' café e\u0301 🧵 & + 100% '), '?q=%EF%BF%BD', '?q=%ED%A0%80'].map(search => ({ input: search, ...readInitialQuery(search) }));
  }, site.base);
  assert.deepEqual(values.map(value => ({ query: value.query, refused: value.refused })), [
    { query: '  walking   gui  ', refused: false }, { query: undefined, refused: true }, { query: undefined, refused: true },
    { query: undefined, refused: true }, { query: undefined, refused: true }, { query: undefined, refused: false },
    { query: ' café e\u0301 🧵 & + 100% ', refused: false }, { query: '\ufffd', refused: false }, { query: undefined, refused: true },
  ]);
  for (const search of ['?q=one&q=two', '?q=a%0Ab', '?q=' + 'a'.repeat(2049)]) {
    await page.goto(site.origin + site.base + 'search/' + search); await page.locator('.raveldex-inline').waitFor();
    assert.equal(await page.locator('[data-raveldex-inline-input]').inputValue(), '');
    assert.equal(await page.locator('[data-raveldex-inline-result]').count(), 0);
    assert.match(await page.locator('[data-search-status]').innerText(), /query|address|link/i);
  }
  await page.goto(site.origin + site.base); await ready(page);
  const unicode = ' café e\u0301 🧵 & + 100% '; await headerQuery(page, unicode);
  const full = page.locator('[data-raveldex-dropdown-full-results]'), target = new URL(await full.getAttribute('href'));
  assert.equal(target.searchParams.get('q'), unicode); await full.click(); await page.locator('.raveldex-inline').waitFor();
  assert.equal(await page.locator('[data-raveldex-inline-input]').inputValue(), unicode);
  await page.close(); record('one-time query admission', { validRaw: values[0].query, unicodeRaw: unicode, refusedCases: 5, noHistoryOrStorageState: true });
});

test('exact copied controller deduplicates, disposes late/failed/reentrant real owners and preserves authored Nodes', async () => {
  const site = sites[0], page = await browser.newPage(); page.setDefaultTimeout(10_000); await page.goto(site.origin + site.base); await ready(page);
  const outcomes = await page.evaluate(async base => {
    const { createHeaderSearch, createRaveldex } = await import(base + 'assets/lifecycle.js');
    const nodes = () => {
      const root = document.createElement('div'), status = document.createElement('p'), retry = document.createElement('button');
      const original = document.createElement('p'); original.textContent = 'Original browse'; root.append(original); document.body.append(root, status, retry);
      return { root, status, retry, original, fullResultsURL: new URL('search/?from=probe#results', location.href).href };
    };
    const owner = () => {
      const engine = createRaveldex({ schema: { text: { title: { boost: 2 }, body: {} } } }); let disposed = 0;
      return { engine, documents: [], async dispose() { disposed++; await engine.dispose(); }, count: () => disposed };
    };
    const output = [];
    {
      const n = nodes(), o = owner(); let release, signal;
      const gate = new Promise(resolve => { release = resolve; });
      const c = createHeaderSearch({ ...n, load: async s => { signal = s; await gate; return o; } });
      const work = c.start(), deduplicated = work === c.start(); await Promise.resolve(); await Promise.resolve();
      const disposal = c.destroy(), stable = disposal === c.destroy(); release(); await disposal; await work;
      output.push({ name: 'late owner', deduplicated, stable, aborted: signal.aborted, disposed: o.count(), mounted: n.root.querySelectorAll('.raveldex-dropdown').length, original: n.root.firstChild === n.original });
    }
    {
      const n = nodes(), o = owner(); let attempts = 0;
      const c = createHeaderSearch({ ...n, load() { if (++attempts === 1) throw Error('expected synchronous failure'); return o; } });
      await c.start(); const retry = !n.retry.hidden; await c.start(); const mounted = !!n.root.querySelector('.raveldex-dropdown'); await c.destroy();
      output.push({ name: 'failure retry', attempts, retry, mounted, disposed: o.count() });
    }
    {
      const n = nodes(), o = owner(); let c;
      customElements.define('dropdown-starter-abandon', class extends HTMLElement { disconnectedCallback() { void c.destroy(); } });
      const original = document.createElement('dropdown-starter-abandon'); n.root.replaceChildren(original);
      c = createHeaderSearch({ ...n, load: async () => o }); await c.start(); await c.destroy();
      output.push({ name: 'mount reentry', disposed: o.count(), mounted: n.root.querySelectorAll('.raveldex-dropdown').length, original: n.root.firstChild === original });
    }
    {
      const n = nodes(), bad = owner(), good = owner(); let release, cleaning, attempts = 0;
      const gate = new Promise(resolve => { release = resolve; }), entered = new Promise(resolve => { cleaning = resolve; });
      const c = createHeaderSearch({ ...n, load: async () => ++attempts === 1 ? { ...bad, documents: [{ id: 'bad', title: 'Unsafe', url: 'javascript:alert(1)' }],
        async dispose() { cleaning(); await gate; await bad.dispose(); } } : good });
      const work = c.start(); await entered; const retryHiddenDuringDisposal = n.retry.hidden; release(); await work;
      const retry = !n.retry.hidden; await c.start(); await c.destroy();
      output.push({ name: 'candidate cleanup', retryHiddenDuringDisposal, retry, attempts, badDisposed: bad.count(), goodDisposed: good.count(), original: n.root.firstChild === n.original });
    }
    {
      const n = nodes(), o = owner(); let c, connected = false, nested, release;
      const gate = new Promise(resolve => { release = resolve; });
      customElements.define('dropdown-starter-restore', class extends HTMLElement { connectedCallback() { if (connected) nested = c.destroy(); } });
      const original = document.createElement('dropdown-starter-restore'); n.root.replaceChildren(original);
      c = createHeaderSearch({ ...n, load: async () => ({ ...o, async dispose() { await gate; await o.dispose(); } }) });
      await c.start(); connected = true; const disposal = c.destroy(); let settled = false; disposal.then(() => { settled = true; });
      await Promise.resolve(); await Promise.resolve(); const waited = !settled; release(); await disposal;
      output.push({ name: 'restore reentry', stable: disposal === nested, waited, disposed: o.count(), original: n.root.firstChild === original });
    }
    return output;
  }, site.base);
  assert.deepEqual(outcomes, [
    { name: 'late owner', deduplicated: true, stable: true, aborted: true, disposed: 1, mounted: 0, original: true },
    { name: 'failure retry', attempts: 2, retry: true, mounted: true, disposed: 1 },
    { name: 'mount reentry', disposed: 1, mounted: 0, original: true },
    { name: 'candidate cleanup', retryHiddenDuringDisposal: true, retry: true, attempts: 2, badDisposed: 1, goodDisposed: 1, original: true },
    { name: 'restore reentry', stable: true, waited: true, disposed: 1, original: true },
  ]);
  await page.close(); record('genuine owner lifecycle and authored callbacks', outcomes);
});

test('loading/failure status reentry and shared header/full/modal ownership remain bounded', async () => {
  const site = sites[0], page = await browser.newPage(); page.setDefaultTimeout(10_000); await page.goto(site.origin + site.base); await ready(page);
  const outcomes = await page.evaluate(async base => {
    const { createHeaderSearch, createRaveldex } = await import(base + 'assets/lifecycle.js');
    const output = [];
    for (const phase of ['loading-destroy', 'loading-start', 'failure-destroy']) {
      const root = document.createElement('div'), status = document.createElement('p'), retry = document.createElement('button'); document.body.append(root, status, retry);
      let c, callback, loads = 0, disposals = 0, release, entered;
      const waiting = new Promise(resolve => { entered = resolve; }), gate = new Promise((_, reject) => { release = reject; });
      c = createHeaderSearch({ root, status, retry, fullResultsURL: new URL('search/', location.href).href, load: async () => {
        loads++; if (phase === 'failure-destroy') { entered(); return gate; }
        const engine = createRaveldex({ schema: { text: { body: {} } } }); return { engine, documents: [], async dispose() { disposals++; await engine.dispose(); } };
      } });
      customElements.define('dropdown-status-' + phase, class extends HTMLElement { disconnectedCallback() { callback = phase === 'loading-start' ? c.start() : c.destroy(); } });
      const child = document.createElement('dropdown-status-' + phase); if (phase !== 'failure-destroy') status.append(child);
      const work = c.start(); if (phase === 'failure-destroy') { await waiting; status.append(child); release(Error('expected refusal')); }
      await work; await callback; const deduplicated = phase !== 'loading-start' || callback === work; const destroyed = c.destroy(); await destroyed;
      output.push({ phase, loads, disposals, deduplicated, stable: destroyed === c.destroy(), retryHidden: retry.hidden, mounted: root.querySelectorAll('.raveldex-dropdown').length });
      root.remove(); status.remove(); retry.remove();
    }
    {
      const root = document.createElement('div'), fullRoot = document.createElement('div'), status = document.createElement('p'), retry = document.createElement('button');
      document.body.append(root, fullRoot, status, retry);
      const engine = createRaveldex({ schema: { text: { body: {} } } }); let release, entered, disposals = 0;
      const waiting = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
      const borrowed = { ...engine, async search(...args) { entered(); await gate; return engine.search(...args); } };
      const c = createHeaderSearch({ root, fullRoot, status, retry, initialQuery: 'walking',
        fullResultsURL: new URL('search/', location.href).href, load: async () => ({ engine: borrowed, documents: [], async dispose() { disposals++; await engine.dispose(); } }) });
      const first = c.start(); await waiting; const samePending = first === c.start();
      const disposal = c.destroy(); let disposedEarly = false; disposal.then(() => { disposedEarly = true; });
      await Promise.resolve(); await Promise.resolve(); const waitedForInitialQuery = !disposedEarly;
      release(); await disposal; await first;
      output.push({ phase: 'initial query pending', samePending, waitedForInitialQuery, disposals });
      for (const node of [root, fullRoot, status, retry]) node.remove();
    }
    {
      const root = document.createElement('div'), status = document.createElement('p'), retry = document.createElement('button'); document.body.append(root, status, retry);
      const engine = createRaveldex({ schema: { text: { body: {} } } }); let release, entered, disposals = 0;
      const waiting = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
      const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
      Object.defineProperty(status, 'textContent', { get() { return descriptor.get.call(this); }, set(value) {
        if (value === 'Search is ready.') throw Error('authored ready write failed'); descriptor.set.call(this, value);
      } });
      const c = createHeaderSearch({ root, status, retry, fullResultsURL: new URL('search/', location.href).href,
        load: async () => ({ engine, documents: [], async dispose() { disposals++; entered(); await gate; await engine.dispose(); } }) });
      const first = c.start(); await waiting; const disposal = c.destroy(); let settled = false; disposal.then(() => { settled = true; });
      await Promise.resolve(); await Promise.resolve(); const waitedForFailedOwner = !settled;
      release(); await disposal; await first;
      output.push({ phase: 'committed failure cleanup', waitedForFailedOwner, disposals, mounted: root.querySelectorAll('.raveldex-dropdown').length });
      for (const node of [root, status, retry]) node.remove();
    }
    {
      const root = document.createElement('div'), modalRoot = document.createElement('div'), modalTrigger = document.createElement('button');
      const status = document.createElement('p'), retry = document.createElement('button'); document.body.append(root, modalRoot, modalTrigger, status, retry);
      const engine = createRaveldex({ schema: { text: { body: {} } } }); let loads = 0, disposals = 0;
      const c = createHeaderSearch({ root, modalRoot, modalTrigger, status, retry, modalHandoff: false,
        fullResultsURL: new URL('search/', location.href).href, load: async () => { loads++; return { engine, documents: [], async dispose() { disposals++; await engine.dispose(); } }; } });
      await c.start(); await c.openModal();
      const modalPresentations = modalRoot.children.length, triggerHidden = modalTrigger.hidden; await c.destroy();
      output.push({ phase: 'disabled public handoff', loads, disposals, modalPresentations, triggerHidden });
      for (const node of [root, modalRoot, modalTrigger, status, retry]) node.remove();
    }
    {
      const root = document.createElement('div'), fullRoot = document.createElement('div'), modalRoot = document.createElement('div');
      const modalTrigger = document.createElement('button'), status = document.createElement('p'), retry = document.createElement('button');
      document.body.append(root, fullRoot, modalRoot, modalTrigger, status, retry);
      const engine = createRaveldex({ schema: { text: { title: { boost: 2 }, body: {} } } });
      await engine.addMany([{ id: 'a', text: { title: 'Alpha', body: 'walking guide' } }, { id: 'b', text: { title: 'Beta', body: 'walking guide' } }]);
      let loads = 0, disposals = 0;
      const c = createHeaderSearch({ root, fullRoot, modalRoot, modalTrigger, status, retry, modalHandoff: true, initialQuery: 'walking gui',
        fullResultsURL: new URL('search/', location.href).href, load: async () => { loads++; return { engine, documents: [{ id: 'a', title: 'Alpha', url: location.href + '#a' }, { id: 'b', title: 'Beta', url: location.href + '#b' }], async dispose() { disposals++; await engine.dispose(); } }; } });
      await c.start(); const field = root.querySelector('input'); field.value = '  walking   gui  '; field.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await c.openModal();
      const raw = modalRoot.querySelector('input')?.value;
      const query = { kind: 'and', children: [{ kind: 'text', text: 'walking' }, { kind: 'group', variants: [{ text: 'gui', match: 'prefix' }] }] };
      const totalBeforeDestroy = (await engine.search(query)).total; await c.destroy();
      let disposedOwner = false; try { await engine.search(query); } catch (error) { disposedOwner = error.code === 'DISPOSED'; }
      output.push({ phase: 'one shared owner', loads, raw, totalBeforeDestroy, disposals, disposedOwner,
        presentationsAfterDestroy: root.children.length + fullRoot.children.length + modalRoot.children.length });
      for (const node of [root, fullRoot, modalRoot, modalTrigger, status, retry]) node.remove();
    }
    for (const variant of ['nested-close', 'refused-inner']) {
      const root = document.createElement('div'), modalRoot = document.createElement('div'), modalTrigger = document.createElement('button');
      const status = document.createElement('p'), retry = document.createElement('button'); document.body.append(root, modalRoot, modalTrigger, status, retry);
      const engine = createRaveldex({ schema: { text: { body: {} } } }); let disposals = 0;
      await engine.addMany([{ id: 'alpha', text: { body: 'alpha' } }, { id: 'beta', text: { body: 'beta' } }]);
      const c = createHeaderSearch({ root, modalRoot, modalTrigger, status, retry, modalHandoff: true,
        fullResultsURL: new URL('search/', location.href).href, load: async () => ({ engine,
          documents: ['alpha', 'beta'].map(id => ({ id, title: id, url: location.href + '#' + id })),
          async dispose() { disposals++; await engine.dispose(); } }) });
      await c.start(); const field = root.querySelector('input'); field.value = 'alpha'; field.focus(); let inner;
      modalTrigger.addEventListener('focus', () => {
        field.value = variant === 'nested-close' ? 'beta' : 'x'.repeat(2049);
        inner = c.openModal();
        if (variant === 'nested-close') modalRoot.querySelector('.raveldex-modal__close')?.click();
      }, { once: true });
      const outer = c.openModal(); await Promise.all([outer, inner]);
      await new Promise(resolve => setTimeout(resolve, 20));
      const modalOpen = !!modalRoot.querySelector('dialog[open]'), rendered = modalRoot.querySelectorAll('[data-raveldex-inline-result]').length;
      const rawLength = field.value.length; await c.destroy();
      output.push({ phase: variant, modalOpen, rendered, rawLength, disposals });
      for (const node of [root, modalRoot, modalTrigger, status, retry]) node.remove();
    }
    return output;
  }, site.base);
  assert.deepEqual(outcomes, [
    { phase: 'loading-destroy', loads: 0, disposals: 0, deduplicated: true, stable: true, retryHidden: true, mounted: 0 },
    { phase: 'loading-start', loads: 1, disposals: 1, deduplicated: true, stable: true, retryHidden: true, mounted: 0 },
    { phase: 'failure-destroy', loads: 1, disposals: 0, deduplicated: true, stable: true, retryHidden: true, mounted: 0 },
    { phase: 'initial query pending', samePending: true, waitedForInitialQuery: true, disposals: 1 },
    { phase: 'committed failure cleanup', waitedForFailedOwner: true, disposals: 1, mounted: 0 },
    { phase: 'disabled public handoff', loads: 1, disposals: 1, modalPresentations: 0, triggerHidden: true },
    { phase: 'one shared owner', loads: 1, raw: '  walking   gui  ', totalBeforeDestroy: 2, disposals: 1, disposedOwner: true, presentationsAfterDestroy: 0 },
    { phase: 'nested-close', modalOpen: false, rendered: 0, rawLength: 4, disposals: 1 },
    { phase: 'refused-inner', modalOpen: false, rendered: 0, rawLength: 2049, disposals: 1 },
  ]);
  await page.close(); record('status reentry and genuine one-owner handoff', outcomes);
});

test('changed CSS, long RTL labels and dark/forced-colors narrow layouts keep actual full-results recovery usable', async () => {
  await verifyNarrowSkipLink();
  const site = sites[0], observations = [];
  for (const forcedColors of ['none', 'active']) {
    const context = await browser.newContext({ viewport: { width: 320, height: 568 }, colorScheme: 'dark', forcedColors, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(10_000); await page.goto(site.origin + site.base); await ready(page);
    const media = await page.evaluate(() => ({ dark: matchMedia('(prefers-color-scheme: dark)').matches, forcedColors: matchMedia('(forced-colors: active)').matches }));
    assert.equal(media.dark, true); assert.equal(media.forcedColors, forcedColors === 'active');
    await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
    await headerQuery(page, 'walking gui'); await page.locator('[data-raveldex-dropdown-full-results]').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const full = page.locator('[data-raveldex-dropdown-full-results]');
    const bounds = await full.boundingBox(); assert.ok(bounds && bounds.height >= 44 && bounds.width > 0);
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await full.click(); await page.locator('[data-raveldex-inline-result]').nth(2).waitFor();
    await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.addScriptTag({ path: join(REPO_ROOT, 'node_modules/axe-core/axe.min.js') });
    const violations = await page.evaluate(async () => (await window.axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => node.target) })));
    assert.deepEqual(violations, []);
    if (process.env.RAVELDEX_DROPDOWN_BROWSER_STARTER_SCREENSHOTS) {
      await mkdir(process.env.RAVELDEX_DROPDOWN_BROWSER_STARTER_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: join(process.env.RAVELDEX_DROPDOWN_BROWSER_STARTER_SCREENSHOTS, `starter-320-rtl-${forcedColors}.png`), fullPage: true });
    }
    observations.push({ forcedColors, actualMedia: media, fullLinkHeight: bounds.height, horizontalOverflow: false, axeViolations: violations.length });
    await context.close();
  }
  record('emulated narrow theme recovery', { observations, physicalZoomTouchKeyboard: 'Not run' });
});


async function verifyNarrowSkipLink() {
  const observations = [];
  for (const site of sites) for (const media of [{ colorScheme: 'light', forcedColors: 'none' }, { colorScheme: 'dark', forcedColors: 'none' }, { colorScheme: 'dark', forcedColors: 'active' }]) {
    const context = await browser.newContext({ viewport: { width: 320, height: 568 }, ...media, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(10_000);
    try {
      await page.goto(site.origin + site.base); await ready(page);
      const skip = page.getByRole('link', { name: 'Skip to content', exact: true });
      await skip.focus();
      const state = await skip.evaluate(element => {
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { focused: element === document.activeElement, focusVisible: element.matches(':focus-visible'),
          background: style.backgroundColor, color: style.color, outline: style.outlineStyle, outlineWidth: style.outlineWidth,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
          ownsHit: top === element || element.contains(top), horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          actualMedia: { dark: matchMedia('(prefers-color-scheme: dark)').matches, forcedColors: matchMedia('(forced-colors: active)').matches } };
      });
      (report.skipLinkAttempts ??= []).push({ base: site.base, media, ...state });
      if (process.env.RAVELDEX_DROPDOWN_BROWSER_STARTER_SCREENSHOTS) {
        await mkdir(process.env.RAVELDEX_DROPDOWN_BROWSER_STARTER_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: join(process.env.RAVELDEX_DROPDOWN_BROWSER_STARTER_SCREENSHOTS, `skip-${site.base === '/' ? 'root' : 'help'}-${media.colorScheme}-${media.forcedColors}.png`) });
      }
      assert.equal(state.focused, true); assert.equal(state.focusVisible, true);
      assert.notEqual(state.background, 'rgba(0, 0, 0, 0)', 'A focused skip link needs its own opaque surface over the mobile header.');
      assert.notEqual(state.background, 'transparent'); assert.notEqual(state.outline, 'none'); assert.notEqual(state.outlineWidth, '0px');
      assert.ok(state.rect.width >= 24 && state.rect.height >= 24, 'The focused target must meet the minimum target dimensions.');
      assert.ok(state.rect.x >= 0 && state.rect.y >= 0 && state.rect.right <= 320 && state.rect.bottom <= 568);
      assert.equal(state.ownsHit, true); assert.equal(state.horizontalOverflow, false);
      assert.deepEqual(state.actualMedia, { dark: media.colorScheme === 'dark', forcedColors: media.forcedColors === 'active' });
      await page.addScriptTag({ path: join(REPO_ROOT, 'node_modules/axe-core/axe.min.js') });
      const violations = await page.evaluate(async () => (await window.axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => node.target) })));
      assert.deepEqual(violations, []);
      await skip.press('Enter');
      assert.equal(new URL(page.url()).hash, '#main');
      assert.equal(await page.locator('main#main').evaluate(element => element === document.activeElement), true);
      observations.push({ base: site.base, media, ...state, axeViolations: violations.length, nativeEnterDestination: '#main' });
    } finally { await context.close(); }
  }
  record('narrow focused skip link', { observations, actualZoomOrAT: 'Not run', focusSetup: 'Native link.focus; genuine keyboard Enter activation.' });
}


test('copied content preparation and build refuse unusable display titles without replacing useful pages', async () => {
  const site = sites[0], contentPath = join(site.directory, 'content.json');
  const original = await readFile(contentPath, 'utf8');
  const output = await readFile(join(site.directory, 'dist/index.html'), 'utf8');
  const { prepareGuides } = await import(pathToFileURL(join(site.directory, 'content.mjs')).href);
  const valid = JSON.parse(original); valid[0].title = '  A valid authored title  ';
  assert.equal(prepareGuides(valid)[0].title, valid[0].title, 'Valid title whitespace is preserved');
  try {
    for (const title of ['', ' \t ', 'x'.repeat(1025), '\ud800']) {
      const content = JSON.parse(original); content[0].title = title;
      assert.throws(() => prepareGuides(content), /Invalid guide title/);
      await writeFile(contentPath, JSON.stringify(content));
      await assert.rejects(command(process.execPath, ['build.mjs'], site.directory), /Invalid guide title/);
      assert.equal(await readFile(join(site.directory, 'dist/index.html'), 'utf8'), output);
    }
  } finally {
    await writeFile(contentPath, original);
    await command(process.execPath, ['build.mjs'], site.directory);
    await build({ absWorkingDir: site.directory, entryPoints: ['lifecycle-entry.mjs'], outfile: 'dist/assets/lifecycle.js',
      bundle: true, platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent' });
  }
  record('unusable title content/build refusal', { cases: ['empty', 'whitespace', 'overlong', 'malformed UTF-16'], priorOutputPreserved: true, validWhitespacePreserved: true, sharedBuildAndLoadValidation: true });
});
