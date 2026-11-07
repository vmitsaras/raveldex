import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { tmpdir, platform, release, arch } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { chromium, webkit } from 'playwright-core';
import { build } from 'esbuild';
import { command, REPO_ROOT, parsePackedMetadata, digest } from '../../scripts/lib/packed-consumer.mjs';
import { packAstro } from '../../scripts/pack-astro.mjs';
import { seedStarterCache } from './inline-astro-starter-cache.mjs';

let directory, site, browser, server;
const selectedEngine = process.env.RAVELDEX_MODAL_STARTER_ENGINE ?? 'chrome';
assert.ok(['chrome', 'webkit'].includes(selectedEngine), 'RAVELDEX_MODAL_STARTER_ENGINE must be chrome or webkit');
const report = { kind: 'raveldex-modal-astro-starter-v1', environment: {
  node: process.version, platform: platform(), release: release(), arch: arch(), astro: '7.3.2' },
  observations: [], scope: 'Fresh paired installed private packages, copied Astro source, actual Astro build/preview and finite headless browser tests in the selected recorded engine. No human AT, physical input, actual zoom, unrecorded engines or deployment.' };
async function buildSite(base) {
  const saved = process.env.RAVELDEX_ASTRO_BASE;
  process.env.RAVELDEX_ASTRO_BASE = base; process.env.ASTRO_TELEMETRY_DISABLED = '1';
  try {
    const result = await command(process.execPath, [join(site, 'node_modules/astro/bin/astro.mjs'), 'build'], site);
    await writeFile(join(directory, `build-${base === '/' ? 'root' : 'help'}.log`), result.stdout + result.stderr);
  } finally { if (saved === undefined) delete process.env.RAVELDEX_ASTRO_BASE; else process.env.RAVELDEX_ASTRO_BASE = saved; }
}
async function preview(base) {
  const reserve = createServer(); await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, [join(site, 'node_modules/astro/bin/astro.mjs'), 'preview', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: site, env: { ...process.env, RAVELDEX_ASTRO_BASE: base, ASTRO_TELEMETRY_DISABLED: '1', ASTRO_PREVIEW_BACKGROUND: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', x => { output += x; }); child.stderr.on('data', x => { output += x; });
  const origin = `http://127.0.0.1:${port}`;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw Error(output);
      try { if ((await fetch(origin + base)).ok) return { origin, base, async close() {
        child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
        await writeFile(join(directory, `preview-${base === '/' ? 'root' : 'help'}.log`), output);
      } }; } catch { /* Wait for actual Astro listener. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('Astro preview did not start: ' + output);
  } catch (error) { child.kill('SIGTERM'); throw error; }
}
const ready = page => page.getByRole('searchbox', { name: 'Search the workshop guide', exact: true }).waitFor();
async function search(page, words) {
  const input = page.getByRole('searchbox', { name: 'Search the workshop guide', exact: true });
  await input.fill(words); await input.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#search-root [aria-busy="true"]'));
}
const ids = page => page.locator('[data-raveldex-inline-result]').evaluateAll(nodes => nodes.map(x => x.dataset.raveldexInlineResult));
before(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'raveldex-modal-astro-starter-')));
  const cache = join(directory, '.npm-cache');
  report.toolingCache = await seedStarterCache(cache);
  await mkdir(join(directory, 'core'));
  const core = parsePackedMetadata((await command('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', join(directory, 'core'), '--cache', cache])).stdout);
  const corePackage = join(directory, 'core', core.filename), astro = await packAstro({ output: join(directory, 'astro') });
  site = join(directory, 'site'); await cp(join(REPO_ROOT, 'examples/modal-astro'), site, { recursive: true });
  const installation = await command('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', cache, corePackage, astro.tarball], site);
  await writeFile(join(directory, 'installation.log'), installation.stdout + installation.stderr);
  for (const name of ['raveldex', 'raveldex-astro']) {
    const path = join(site, 'node_modules/@vmitsaras', name);
    assert.equal(await realpath(path), path);
    const metadata = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
    assert.equal(metadata.private, true); assert.deepEqual(metadata.dependencies ?? {}, {});
  }
  report.packages = { coreSHA256: digest(await readFile(corePackage)), astroSHA256: digest(await readFile(astro.tarball)), sourceDirectory: site };
  // Exercise the documented replacement and scoped CSS recipe in the copied app.
  const content = JSON.parse(await readFile(join(site, 'content.json'), 'utf8'));
  content.buildId = 'workshop-sections-modified-v2';
  content.entries.find(x => x.slug === 'sewing').sections[1].text += ' Bring a purple spool to the workshop.';
  await writeFile(join(site, 'content.json'), JSON.stringify(content));
  await writeFile(join(site, 'src/style.css'), await readFile(join(site, 'src/style.css'), 'utf8') + '\n.raveldex-modal { --raveldex-modal-max-width: 43rem; }\n');
  await writeFile(join(site, 'probe-entry.mjs'), "export {createDocumentationSearch} from './src/search.mjs';\nexport {loadStaticSearch} from '@vmitsaras/raveldex-astro/client';\nexport {configuration} from './configuration.mjs';\nexport {mountRaveldexModal} from '@vmitsaras/raveldex/addons/ui/modal';\n");
  const bundled = await build({ absWorkingDir: site, entryPoints: ['probe-entry.mjs'], outfile: join(directory, 'probe.mjs'), bundle: true,
    platform: 'browser', format: 'esm', target: 'es2022', metafile: true, logLevel: 'silent' });
  report.runtimeGraph = Object.keys(bundled.metafile.inputs);
  for (const path of report.runtimeGraph) assert.ok(['probe-entry.mjs', 'configuration.mjs'].includes(path)
    || path.startsWith('src/') || /^node_modules\/@vmitsaras\/raveldex(?:-astro)?\/dist\//.test(path), path);
  browser = selectedEngine === 'webkit' ? await webkit.launch({ headless: true })
    : await chromium.launch({ ...(process.env.RAVELDEX_CANDIDATE_BROWSER === 'chromium' ? {} : { channel: 'chrome' }), headless: true });
  report.environment.browserEngine = selectedEngine === 'webkit' ? 'webkit' : 'chromium';
  report.environment.browserChannel = selectedEngine === 'webkit' ? 'Playwright WebKit'
    : process.env.RAVELDEX_CANDIDATE_BROWSER === 'chromium' ? 'Playwright Chromium' : 'chrome';
  report.environment.browser = browser.version();
  assert.match(report.environment.browser, /^\d+\.\d+/);
  report.environment.headless = true;
}, { timeout: 120000 });
after(async () => {
  await browser?.close(); await server?.close();
  if (process.env.RAVELDEX_MODAL_ASTRO_STARTER_REPORT) await writeFile(process.env.RAVELDEX_MODAL_ASTRO_STARTER_REPORT, JSON.stringify(report, null, 2) + '\n');
});

test('copied paired installed Astro modal builds and previews actual encoded heading links at root and changed base', async () => {
  for (const base of ['/', '/help/']) {
    await buildSite(base); server = await preview(base);
    const manifest = JSON.parse(await readFile(join(site, 'dist/raveldex/manifest.json'), 'utf8'));
    assert.equal(manifest.base, base); assert.equal(manifest.recordCount, 6); assert.equal(manifest.assets.native, undefined);
    await cp(join(directory, 'probe.mjs'), join(site, 'dist/probe.mjs'));
    const page = await browser.newPage(), requests = [], errors = [];
    page.on('request', r => { if (r.url().includes('/raveldex/')) requests.push(r.url()); });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(server.origin + base); await page.getByRole('button', { name: 'Search the guide', exact: true }).waitFor();
    assert.deepEqual(requests, []);
    await page.getByRole('button', { name: 'Search the guide', exact: true }).click(); await ready(page);
    assert.equal(await page.locator('.raveldex-modal').evaluate(x => getComputedStyle(x).getPropertyValue('--raveldex-modal-max-width').trim()), '43rem');
    await search(page, 'workshop'); assert.match(await page.locator('.raveldex-inline__status').innerText(), /6 results/);
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-raveldex-inline-result]').length === 6);
    assert.deepEqual((await ids(page)).sort(), ['access','booking','directions','first-visit','sewing','woodworking']);
    await page.getByLabel('Topic', { exact: true }).selectOption({ label: 'Tools (2)' });
    await page.waitForFunction(() => document.querySelectorAll('[data-raveldex-inline-result]').length === 2);
    await page.getByRole('button', { name: 'Close search', exact: true }).click();
    assert.equal(await page.locator('#search-trigger').evaluate(x => x === document.activeElement), true);
    await page.getByRole('button', { name: 'Search the guide', exact: true }).click(); await ready(page);
    assert.equal(await page.getByRole('searchbox').inputValue(), 'workshop');
    await page.waitForFunction(() => document.querySelectorAll('[data-raveldex-inline-result]').length === 2);
    assert.match(await page.getByLabel('Topic', { exact: true }).locator('option:checked').innerText(), /^Tools/);
    assert.equal(requests.filter(x => x.endsWith('/manifest.json')).length, 1, 'Ready reopen reuses its owned source index');
    await page.getByRole('button', { name: 'Clear search and filters', exact: true }).click();
    await search(page, 'purple'); assert.deepEqual(await ids(page), ['sewing']);
    const link = page.getByRole('link', { name: 'Wind the bobbin', exact: true });
    const target = server.origin + base + 'guide/sewing/#%25%23caf%C3%A9-bobbin';
    assert.equal(await link.getAttribute('href'), target);
    assert.ok(await page.locator('.raveldex-inline mark').count() > 0);
    await link.click(); await page.waitForURL(target);
    assert.equal(await page.evaluate(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.textContent), 'Wind the bobbin');
    assert.equal(await page.getByRole('heading', { name: 'Sewing machines', exact: true }).count(), 1);
    assert.deepEqual(errors, []); await page.close();
    const context = await browser.newContext({ javaScriptEnabled: false }), fallback = await context.newPage();
    await fallback.goto(server.origin + base);
    assert.equal(await fallback.getByRole('navigation', { name: 'Workshop guide pages' }).getByRole('link').count(), 6);
    assert.equal(await fallback.getByRole('button', { name: 'Search the guide', exact: true }).count(), 0);
    await fallback.getByRole('link', { name: 'Sewing machines', exact: true }).click();
    assert.equal(await fallback.locator('[id="%#café-bobbin"]').innerText(), 'Wind the bobbin');
    await context.close();
    report.observations.push({ name: 'actual Astro build and preview', base, status: 'Pass', changedContent: 'purple spool', theme: '43rem', total: 6, target, requests, errors, noJS: true });
    if (base === '/') { await server.close(); server = undefined; }
  }
}, { timeout: 120000 });

test('each real manifest/source/display/section asset can fail and retry without mounting partial search; stale and mixed builds refuse', async () => {
  const page = await browser.newPage(), url = server.origin + '/help/';
  for (const pattern of ['**/raveldex/manifest.json','**/raveldex/source-*.json','**/raveldex/documents-*.json','**/raveldex/sections-manifest.json',/\/raveldex\/sections-[a-f0-9]+\.json$/]) {
    await page.goto(url);
    await page.route(pattern, route => route.fulfill({ status: 503, body: 'temporarily unavailable' }));
    await page.getByRole('button', { name: 'Search the guide', exact: true }).click();
    await page.getByRole('button', { name: 'Retry loading search', exact: true }).waitFor();
    assert.equal(await page.getByRole('searchbox').count(), 0);
    assert.match(await page.locator('#search-status').innerText(), /could not load/);
    await page.unroute(pattern);
    await page.getByRole('button', { name: 'Retry loading search', exact: true }).click(); await ready(page);
    await search(page, 'bobbin'); assert.deepEqual(await ids(page), ['sewing']);
  }
  for (const [pattern, transform] of [
    ['**/raveldex/manifest.json', body => JSON.stringify({ ...JSON.parse(body), buildId: 'other-build' })],
    ['**/raveldex/documents-*.json', body => body.replace('Sewing', 'Sowing')],
    [/\/raveldex\/sections-[a-f0-9]+\.json$/, body => body.replace('bobbin', 'bobban')],
  ]) {
    await page.goto(url);
    await page.route(pattern, async route => { const response = await route.fetch(); await route.fulfill({ response, body: transform(await response.text()) }); });
    await page.getByRole('button', { name: 'Search the guide', exact: true }).click();
    await page.getByRole('button', { name: 'Retry loading search', exact: true }).waitFor();
    assert.equal(await page.getByRole('searchbox').count(), 0);
    await page.unroute(pattern);
    await page.getByRole('button', { name: 'Close search', exact: true }).click();
    await page.getByRole('button', { name: 'Search the guide', exact: true }).click(); await ready(page);
  }
  await page.close(); report.observations.push({ name: 'actual asset failures and mixed builds', status: 'Pass', failedAssets: 5, mixedAssets: 3, retried: true });
}, { timeout: 120000 });

test('Escape during delayed loading abandons the attempt; rapid reopen and pagehide/pageshow cannot revive it', async () => {
  const page = await browser.newPage(); let reached, release;
  const waiting = new Promise(resolve => { reached = resolve; }), gate = new Promise(resolve => { release = resolve; });
  await page.route('**/raveldex/documents-*.json', async route => { reached(); await gate; await route.continue().catch(() => {}); });
  await page.goto(server.origin + '/help/');
  await page.getByRole('button', { name: 'Search the guide', exact: true }).click(); await waiting;
  assert.match(await page.locator('#search-status').innerText(), /Loading search/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.locator('#search-trigger').evaluate(x => x === document.activeElement), true);
  await page.unroute('**/raveldex/documents-*.json');
  await page.getByRole('button', { name: 'Search the guide', exact: true }).click();
  release(); await ready(page);
  await search(page, 'bobbin'); assert.deepEqual(await ids(page), ['sewing']);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  assert.equal(await page.locator('.raveldex-modal').count(), 0);
  await page.evaluate(async () => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    await Promise.resolve(); await Promise.resolve();
  });
  assert.equal(await page.locator('#search-trigger').isHidden(), true, 'A later pagehide cancels a pending restored-wrapper creation');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await page.getByRole('button', { name: 'Search the guide', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Search the guide', exact: true }).click(); await ready(page);
  await page.close(); report.observations.push({ name: 'delayed real display and navigation lifecycle', status: 'Pass', escapeBeforeCompletion: true, rapidReopen: true, bfcacheEvents: true });
});

test('first pointer loading cancellation and ready close restore the logical trigger', async () => {
  if (!server) {
    await buildSite('/help/'); server = await preview('/help/');
    await cp(join(directory, 'probe.mjs'), join(site, 'dist/probe.mjs'));
  }
  const outcomes = [];
  for (const phase of ['held', 'failed', 'ready']) {
    const page = await browser.newPage(); let release = () => {}, reached;
    const requested = new Promise(resolve => { reached = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    try {
      if (phase === 'held') await page.route('**/raveldex/documents-*.json', async route => {
        reached(); await gate; await route.continue().catch(() => {});
      });
      if (phase === 'failed') await page.route('**/raveldex/manifest.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
      await page.goto(server.origin + '/help/');
      const trigger = page.getByRole('button', { name: 'Search the guide', exact: true }); await trigger.waitFor();
      assert.equal(await page.evaluate(() => document.activeElement === document.body), true, 'First pointer activation starts without a previously focused trigger');
      await trigger.click();
      if (phase === 'held') await requested;
      if (phase === 'failed') await page.getByRole('button', { name: 'Retry loading search', exact: true }).waitFor();
      if (phase === 'ready') {
        await ready(page);
        assert.equal(await page.getByRole('searchbox').evaluate(node => node === document.activeElement), true);
        await page.locator('.raveldex-modal').getByRole('button', { name: 'Close search', exact: true }).click();
      } else await page.locator('#search-loading').getByRole('button', { name: 'Close search', exact: true }).click();
      release(); await page.waitForTimeout(30);
      const focus = await trigger.evaluate(node => ({ trigger: node === document.activeElement,
        hiddenLoading: !!document.activeElement?.closest('dialog:not([open])'), open: document.querySelectorAll('dialog:modal').length }));
      assert.deepEqual(focus, { trigger: true, hiddenLoading: false, open: 0 });
      outcomes.push({ phase, ...focus });
    } finally { release(); await page.close(); }
  }
  report.observations.push({ name: 'first pointer logical opener restoration', status: 'Pass', outcomes });
});

test('copied wrapper deduplicates, cancels and disposes real late owners/documents/sections; borrowed owners and reset policy stay explicit', async () => {
  const page = await browser.newPage(); await page.goto(server.origin + '/help/');
  const output = await page.evaluate(async ({ origin }) => {
    const { createDocumentationSearch, loadStaticSearch, configuration, mountRaveldexModal } = await import('/help/probe.mjs');
    const options = { manifestUrl: origin + '/help/raveldex/manifest.json', expectedBuildId: 'workshop-sections-modified-v2', configuration: configuration() };
    const nodes = () => {
      const root = document.createElement('section'), trigger = document.createElement('button'), loadingDialog = document.createElement('dialog');
      const fallback = document.createTextNode('Original fallback'); root.append(fallback); trigger.textContent = 'Probe search';
      loadingDialog.innerHTML = '<button data-loading-close>Close loading</button><p role="status"></p><button data-retry>Retry</button>';
      document.body.append(trigger, root, loadingDialog);
      return { root, trigger, loadingDialog, status: loadingDialog.querySelector('p'), retry: loadingDialog.querySelector('[data-retry]'), fallback };
    };
    const output = [];
    {
      const n = nodes(); let wrapper, loads = 0;
      customElements.define('modal-astro-status-reentry', class extends HTMLElement {
        disconnectedCallback() { void wrapper?.destroy(); }
      });
      const authored = document.createElement('modal-astro-status-reentry'); n.status.append(authored);
      wrapper = createDocumentationSearch({ ...n, load: async () => { loads++; return loadStaticSearch(options); } });
      n.trigger.focus(); await wrapper.open(); await wrapper.destroy();
      output.push({ phase: 'status-disconnect-reentry', loads, opened: n.loadingDialog.open, authoredRestored: n.status.firstChild === authored });
      n.root.remove(); n.trigger.remove(); n.loadingDialog.remove();
    }
    {
      const n = nodes(); n.retry.hidden = true;
      let wrapper, reached, release, disposals = 0;
      const waiting = new Promise(r => { reached = r; }), gate = new Promise(r => { release = r; });
      customElements.define('modal-astro-failed-status-reentry', class extends HTMLElement {
        disconnectedCallback() { void wrapper?.destroy(); }
      });
      wrapper = createDocumentationSearch({ ...n, load: async () => {
        const actual = await loadStaticSearch(options);
        return { ...actual, async loadDocuments() { await actual.loadDocuments(); reached(); await gate; throw new Error('held failed display'); },
          async dispose() { disposals++; await actual.dispose(); } };
      } });
      n.trigger.focus(); const pending = wrapper.open(); await waiting;
      n.status.append(document.createElement('modal-astro-failed-status-reentry'));
      release(); await pending; await wrapper.destroy();
      output.push({ phase: 'failed-status-disconnect-reentry', disposals, opened: n.loadingDialog.open, retryHidden: n.retry.hidden });
      n.root.remove(); n.trigger.remove(); n.loadingDialog.remove();
    }
    for (const phase of ['owner','documents','sections','reentry']) {
      const n = nodes(); let reached, release, count = 0, loads = 0, signal, wrapper;
      const waiting = new Promise(r => { reached = r; }), gate = new Promise(r => { release = r; });
      const load = async input => {
        loads++; signal = input.signal;
        if (phase === 'reentry') { void wrapper.destroy(); reached(); await gate; }
        const actual = await loadStaticSearch(options);
        if (phase === 'owner') { reached(); await gate; }
        return { ...actual,
          async loadDocuments() { const result = await actual.loadDocuments(); if (phase === 'documents') { reached(); await gate; } return result; },
          async loadSections() { const result = await actual.loadSections(); if (phase === 'sections') { reached(); await gate; } return result; },
          async dispose() { count++; await actual.dispose(); } };
      };
      wrapper = createDocumentationSearch({ ...n, load, manifestUrl: options.manifestUrl, buildId: options.expectedBuildId });
      n.trigger.focus(); const first = wrapper.open(), duplicate = wrapper.open(); await waiting;
      const destroyed = wrapper.destroy(), stable = destroyed === wrapper.destroy(); release(); await destroyed; await first;
      output.push({ phase, loads, count, deduplicated: duplicate === first, stable, aborted: signal.aborted,
        dialogs: n.root.querySelectorAll('dialog').length, fallback: n.root.firstChild === n.fallback });
      n.root.remove(); n.trigger.remove(); n.loadingDialog.remove();
    }
    {
      const n = nodes(); let release, reached, disposals = 0, calls = 0;
      const waiting = new Promise(r => { reached = r; }), gate = new Promise(r => { release = r; });
      const wrapper = createDocumentationSearch({ ...n, load: async () => {
        const id = ++calls, actual = await loadStaticSearch(options);
        if (id === 1) { reached(); await gate; }
        return { ...actual, async dispose() { disposals++; await actual.dispose(); } };
      } });
      const first = wrapper.open(); await waiting; wrapper.close(); const second = wrapper.open(); await second; release(); await first;
      const opened = Boolean(n.root.querySelector('dialog[open]')); await wrapper.destroy();
      output.push({ phase: 'rapid-reopen', calls, disposals, opened });
      n.root.remove(); n.trigger.remove(); n.loadingDialog.remove();
    }
    {
      const n = nodes(); let release, reached, disposals = 0, calls = 0, reentered, wrapper;
      const waiting = new Promise(r => { reached = r; }), gate = new Promise(r => { release = r; });
      wrapper = createDocumentationSearch({ ...n, load: async input => {
        const id = ++calls, actual = await loadStaticSearch(options);
        if (id === 1) {
          input.signal.addEventListener('abort', () => { reentered = wrapper.open(); }, { once: true });
          reached(); await gate;
        }
        return { ...actual, async dispose() { disposals++; await actual.dispose(); } };
      } });
      n.trigger.focus(); const first = wrapper.open(); await waiting;
      n.loadingDialog.close(); const reconciled = wrapper.open();
      await reconciled; release(); await first;
      const opened = Boolean(n.root.querySelector('dialog[open]')); await wrapper.destroy();
      output.push({ phase: 'raw-close-abort-reentry', calls, disposals, opened, deduplicated: reconciled === reentered });
      n.root.remove(); n.trigger.remove(); n.loadingDialog.remove();
    }
    {
      const n = nodes(); let calls = 0, disposals = 0;
      const wrapper = createDocumentationSearch({ ...n, load: async () => {
        const id = ++calls, actual = await loadStaticSearch(options);
        return { ...actual,
          async loadDocuments() { const documents = await actual.loadDocuments(); return id === 1 ? [{ ...documents[0], url: 'javascript:alert(1)' }] : documents; },
          async dispose() { disposals++; await actual.dispose(); } };
      } });
      n.trigger.focus(); await wrapper.open();
      const recoveryVisible = n.loadingDialog.open && !n.retry.hidden && /could not load/.test(n.status.textContent);
      n.retry.click(); await wrapper.open();
      const opened = Boolean(n.root.querySelector('dialog[open]')); await wrapper.destroy();
      output.push({ phase: 'mount-failure-retry', calls, disposals, recoveryVisible, opened });
      n.root.remove(); n.trigger.remove(); n.loadingDialog.remove();
    }
    {
      const n = nodes(); let disposals = 0;
      const wrapper = createDocumentationSearch({ ...n, resetOnClose: true, load: async () => {
        const actual = await loadStaticSearch(options);
        return { ...actual, async dispose() { disposals++; await actual.dispose(); } };
      } });
      n.trigger.focus(); await wrapper.open();
      n.root.querySelector('input[type="search"]').value = 'bobbin';
      wrapper.close(); await wrapper.open();
      const reset = n.root.querySelector('input[type="search"]').value === '';
      await wrapper.destroy(); output.push({ phase: 'owned-wrapper-reset', reset, disposals });
      n.root.remove(); n.trigger.remove(); n.loadingDialog.remove();
    }
    {
      const n = nodes(), opener = document.createElement('button'); let disposals = 0;
      opener.textContent = 'Actual programmatic opener'; document.body.append(opener);
      const wrapper = createDocumentationSearch({ ...n, load: async () => {
        const actual = await loadStaticSearch(options);
        return { ...actual, async dispose() { disposals++; await actual.dispose(); } };
      } });
      opener.focus(); await wrapper.open(); wrapper.close();
      const restored = document.activeElement === opener;
      await wrapper.destroy(); output.push({ phase: 'actual-programmatic-opener', restored, disposals });
      n.root.remove(); n.trigger.remove(); n.loadingDialog.remove(); opener.remove();
    }
    {
      const n = nodes(); let release, calls = 0, disposals = 0, reentered;
      const gate = new Promise(resolve => { release = resolve; });
      const wrapper = createDocumentationSearch({ ...n, load: async () => {
        const id = ++calls, actual = await loadStaticSearch(options);
        if (id === 1) await gate;
        return { ...actual, async dispose() { disposals++; await actual.dispose(); } };
      } });
      n.trigger.focus(); const first = wrapper.open();
      await Promise.resolve();
      n.trigger.addEventListener('focus', () => { reentered = wrapper.open(); }, { once: true });
      wrapper.close(); await reentered; release(); await first;
      const opened = Boolean(n.root.querySelector('dialog:modal'));
      const inputFocused = n.root.querySelector('input') === document.activeElement;
      await wrapper.destroy(); output.push({ phase: 'focus-reopen', calls, disposals, opened, inputFocused });
      n.root.remove(); n.trigger.remove(); n.loadingDialog.remove();
    }
    {
      const n = nodes(); const actual = await loadStaticSearch(options), documents = await actual.loadDocuments(), pageSections = await actual.loadSections();
      const ui = mountRaveldexModal({ root: n.root, trigger: n.trigger, engine: actual.engine, documents, pageSections, resetOnClose: true });
      ui.open(); ui.search('bobbin'); ui.close(); ui.open();
      const reset = n.root.querySelector('input[type="search"]').value === ''; ui.destroy();
      const result = await actual.engine.search('bobbin'); await actual.dispose();
      output.push({ phase: 'direct-borrowed-reset', reset, borrowedStillUsable: result.total === 1 });
      n.root.remove(); n.trigger.remove(); n.loadingDialog.remove();
    }
    return output;
  }, { origin: server.origin });
  assert.deepEqual(output.find(x => x.phase === 'status-disconnect-reentry'), { phase: 'status-disconnect-reentry', loads: 0, opened: false, authoredRestored: true });
  assert.deepEqual(output.find(x => x.phase === 'failed-status-disconnect-reentry'), { phase: 'failed-status-disconnect-reentry', disposals: 1, opened: false, retryHidden: true });
  for (const item of output.filter(x => ['owner','documents','sections','reentry'].includes(x.phase)))
    assert.deepEqual(item, { phase: item.phase, loads: 1, count: 1, deduplicated: true, stable: true, aborted: true, dialogs: 0, fallback: true });
  assert.deepEqual(output.find(x => x.phase === 'rapid-reopen'), { phase: 'rapid-reopen', calls: 2, disposals: 2, opened: true });
  assert.deepEqual(output.find(x => x.phase === 'raw-close-abort-reentry'), { phase: 'raw-close-abort-reentry', calls: 2, disposals: 2, opened: true, deduplicated: true });
  assert.deepEqual(output.find(x => x.phase === 'mount-failure-retry'), { phase: 'mount-failure-retry', calls: 2, disposals: 2, recoveryVisible: true, opened: true });
  assert.deepEqual(output.find(x => x.phase === 'owned-wrapper-reset'), { phase: 'owned-wrapper-reset', reset: true, disposals: 1 });
  assert.deepEqual(output.find(x => x.phase === 'actual-programmatic-opener'), { phase: 'actual-programmatic-opener', restored: true, disposals: 1 });
  assert.deepEqual(output.find(x => x.phase === 'focus-reopen'), { phase: 'focus-reopen', calls: 2, disposals: 2, opened: true, inputFocused: true });
  assert.deepEqual(output.find(x => x.phase === 'direct-borrowed-reset'), { phase: 'direct-borrowed-reset', reset: true, borrowedStillUsable: true });
  await page.close(); report.observations.push({ name: 'genuine owned and borrowed lifecycle probes', status: 'Pass', output });
}, { timeout: 120000 });
