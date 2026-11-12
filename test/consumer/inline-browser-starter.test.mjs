import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { cp, readFile, writeFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { prepareConsumer, command, REPO_ROOT, digest } from '../../scripts/lib/packed-consumer.mjs';
import { seedStarterCache } from './inline-astro-starter-cache.mjs';

let consumer, browser;
const sites = [], report = { kind: 'raveldex-inline-browser-starter-v1', observations: [] };
const record = (name, evidence) => report.observations.push({ name, status: 'Pass', evidence });
async function save() {
  if (process.env.RAVELDEX_INLINE_BROWSER_STARTER_REPORT)
    await writeFile(process.env.RAVELDEX_INLINE_BROWSER_STARTER_REPORT, JSON.stringify(report, null, 2) + '\n');
}
async function startPreview(directory, base) {
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; reservation.close(); await once(reservation, 'close');
  const child = spawn(process.execPath, ['preview.mjs', '--port', String(port)], { cwd: directory,
    env: { ...process.env, RAVELDEX_INLINE_BASE: base }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Preview timeout: ${output}`)), 20000);
    const done = () => { clearTimeout(timeout); resolve(); };
    child.stdout.on('data', chunk => { output += chunk; if (output.includes('Open http:')) done(); });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Preview exited ${code}: ${output}`)); });
  });
  return { directory, base, child, origin: `http://127.0.0.1:${port}`, async close() { child.kill('SIGTERM'); await once(child, 'exit'); } };
}

before(async () => {
  consumer = await prepareConsumer([], []);
  const cache = join(consumer.directory, 'starter-npm-cache');
  report.cache = await seedStarterCache(cache);
  report.package = consumer.package;
  report.environment = { node: process.version, platform: process.platform, arch: process.arch, tooling: 'Actual offline npm install of esbuild0.28.2 and core tarball, no tool/runtime symlinks.' };
  for (const base of ['/', '/help/']) {
    const directory = join(consumer.directory, base === '/' ? 'browser-root' : 'browser-help');
    await cp(join(REPO_ROOT, 'examples/inline-browser'), directory, { recursive: true, filter: path => !/(?:^|\/)dist(?:\/|$)|build-meta\.json$|node_modules/.test(path) });
    const content = JSON.parse(await readFile(join(directory, 'content.json'), 'utf8'));
    content[0].title = 'Plan a riverside walking trip'; content[0].body += ' Riverside paths are part of this walking guide.';
    await writeFile(join(directory, 'content.json'), JSON.stringify(content));
    const css = await readFile(join(directory, 'theme.css'), 'utf8');
    await writeFile(join(directory, 'theme.css'), css.replace('--raveldex-inline-gap: 1rem;', '--raveldex-inline-gap: 1.25rem;'));
    await command('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', cache,
      join(consumer.directory, consumer.packed.filename)], directory);
    assert.equal(await realpath(join(directory, 'node_modules/esbuild')), join(directory, 'node_modules/esbuild'));
    assert.equal(await realpath(join(directory, 'node_modules/@vmitsaras/raveldex')), join(directory, 'node_modules/@vmitsaras/raveldex'));
    const built = await command('env', [`RAVELDEX_INLINE_BASE=${base}`, 'npm', 'run', 'build', '--cache', cache], directory);
    assert.match(built.stdout, /Built 7 explicit guides/);
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
    await writeFile(join(directory, 'lifecycle-entry.mjs'), "export {createInlineSearch} from './controller.mjs';export {createRaveldex} from '@vmitsaras/raveldex';export {loadGuides} from './load.mjs';\n");
    await build({ absWorkingDir: directory, entryPoints: ['lifecycle-entry.mjs'], outfile: 'dist/assets/lifecycle.js',
      bundle: true, platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent' });
    const site = await startPreview(directory, base); sites.push(site);
    record(`copied build ${base}`, { base, changedRecords: content.length, changedTitle: content[0].title,
      graphInputs: Object.keys(graph.inputs), bundleSha256: digest(await readFile(join(directory, 'dist/assets/main.js'))) });
  }
  browser = await chromium.launch({ ...(process.env.RAVELDEX_UI_BROWSER === 'chromium' ? {} : { channel: 'chrome' }), headless: true });
  report.environment.browser = browser.version();
}, { timeout: 120000 });
after(async () => {
  await browser?.close();
  for (const site of sites) await site.close();
  await save();
});

test('exact copied installed browser starter searches, filters, pages and opens changed content at root and help bases', async () => {
  for (const site of sites) {
    const page = await browser.newPage(); const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.goto(site.origin + site.base);
    await page.getByText('Search is ready.', { exact: true }).waitFor();
    assert.equal(await page.locator('.raveldex-inline').evaluate(node => getComputedStyle(node).getPropertyValue('--raveldex-inline-gap').trim()), '1.25rem');
    const input = page.getByRole('searchbox', { name: 'Search walking guides' });
    await input.fill('walking guide'); await input.press('Enter');
    await page.locator('.raveldex-inline__page-summary').filter({ hasText: 'of 7' }).waitFor();
    const ids = () => page.locator('.raveldex-inline__result').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-raveldex-inline-result')));
    const first = await ids(); assert.equal(first.length, 3);
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.raveldex-inline__result').length === 6);
    const six = await ids(); assert.equal(new Set(six).size, 6); assert.deepEqual(six.slice(0, 3), first);
    await page.getByRole('button', { name: 'Next results', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.raveldex-inline__result').length === 1);
    const seven = [...six, ...await ids()]; assert.equal(new Set(seven).size, 7);
    await page.getByRole('button', { name: 'Previous results', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.raveldex-inline__result').length === 3);
    assert.deepEqual(await ids(), first);
    await page.getByRole('combobox', { name: 'Type of guide' }).selectOption({ label: 'Guide (5)' });
    await page.locator('.raveldex-inline__page-summary').filter({ hasText: 'of 5' }).waitFor();
    assert.ok(await page.locator('.raveldex-inline mark').count() > 0);
    await input.fill('riverside'); await input.press('Enter');
    const result = page.locator('.raveldex-inline__result a', { hasText: 'Plan a riverside walking trip' }); await result.waitFor();
    assert.equal(new URL(await result.getAttribute('href'), site.origin).pathname, site.base + 'guides/getting-started/');
    await result.click();
    await page.getByRole('heading', { name: 'Plan a riverside walking trip', exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, site.base + 'guides/getting-started/');
    assert.ok(requests.every(url => url.startsWith(site.origin + site.base)), 'Every asset/data/result remains inside deployment base');
    assert.deepEqual(errors, []); await page.close();
    record(`native interaction ${site.base}`, { total: 7, completeUniqueIds: seven, filterTotal: 5, changedTitleNavigated: true, cssGap: '1.25rem', pageErrors: errors });
  }
});

test('browser starter preserves browse navigation without JavaScript and retries a failed data asset', async () => {
  const site = sites[1], context = await browser.newContext({ javaScriptEnabled: false }), page = await context.newPage();
  const requests = []; page.on('request', request => requests.push(request.url()));
  await page.goto(site.origin + site.base);
  assert.equal(await page.getByRole('navigation', { name: 'Browse all guides' }).getByRole('link').count(), 7);
  assert.match(await page.locator('[data-search-status]').textContent(), /needs JavaScript/);
  assert.ok(!requests.some(url => url.endsWith('/content.json')));
  await page.getByRole('link', { name: 'Check the weather before leaving' }).click();
  await page.getByRole('heading', { name: 'Check the weather before leaving', exact: true }).waitFor();
  await context.close();
  const retryPage = await browser.newPage();
  await retryPage.route('**/content.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await retryPage.goto(site.origin + site.base);
  await retryPage.getByRole('button', { name: 'Retry loading search' }).waitFor();
  assert.equal(await retryPage.locator('.raveldex-inline').count(), 0);
  assert.equal(await retryPage.getByRole('navigation', { name: 'Browse all guides' }).getByRole('link').count(), 7);
  await retryPage.unroute('**/content.json');
  await retryPage.getByRole('button', { name: 'Retry loading search' }).click();
  await retryPage.getByRole('searchbox', { name: 'Search walking guides' }).waitFor();
  assert.equal(await retryPage.locator('[data-search-retry]').isHidden(), true);
  await retryPage.close(); record('no JavaScript and asset retry', { base: site.base, browseLinks: 7, unrequestedDataWithoutJS: true, failed503ThenRetry: true });
});

test('browser starter announces delayed loading and pagehide abort cannot mount abandoned data', async () => {
  const site = sites[0], page = await browser.newPage();
  let held, release;
  const requested = new Promise(resolve => { held = resolve; });
  const released = new Promise(resolve => { release = resolve; });
  await page.route('**/content.json', async route => { held(); await released; await route.continue().catch(() => {}); });
  await page.goto(site.origin + site.base); await requested;
  assert.match(await page.locator('[data-search-status]').textContent(), /Loading search/);
  assert.equal(await page.locator('.raveldex-inline').count(), 0);
  assert.equal(await page.getByRole('navigation', { name: 'Browse all guides' }).getByRole('link').count(), 7);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  assert.match(await page.locator('[data-search-status]').textContent(), /Search is closed/);
  release(); await page.unroute('**/content.json');
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 50)));
  assert.equal(await page.locator('.raveldex-inline').count(), 0);
  // A restored page explicitly starts a fresh owned integration.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await page.getByRole('searchbox', { name: 'Search walking guides' }).waitFor();
  await page.close(); record('delayed data, pagehide and restored page', { browseLinks: 7, abandonedMounts: 0, restoredPageReady: true });
});

test('copied controller disposes late, failed and reentrant owners exactly once and keeps teardown promise stable', async () => {
  const site = sites[0], page = await browser.newPage(); await page.goto(site.origin + site.base);
  await page.getByRole('searchbox', { name: 'Search walking guides' }).waitFor();
  const outcomes = await page.evaluate(async base => {
    const { createInlineSearch, createRaveldex } = await import(base + 'assets/lifecycle.js');
    const makeElements = () => {
      const root = document.createElement('div'), status = document.createElement('p'), retry = document.createElement('button');
      const original = document.createElement('p'); original.textContent = 'Original browse'; root.append(original);
      document.body.append(root, status, retry); return { root, status, retry, original };
    };
    const makeOwner = () => {
      const engine = createRaveldex({ schema: { text: { body: {} } } }); let count = 0;
      return { engine, documents: [], dispose: async () => { count++; await engine.dispose(); }, count: () => count };
    };
    const result = [];
    {
      const nodes = makeElements(), owner = makeOwner(); let release, signal;
      const gate = new Promise(resolve => { release = resolve; });
      const controller = createInlineSearch({ ...nodes, load: async current => { signal = current; await gate; return owner; } });
      const pending = controller.start(), deduplicated = pending === controller.start();
      await Promise.resolve(); await Promise.resolve();
      const destroyed = controller.destroy(), samePromise = destroyed === controller.destroy();
      release(); await destroyed; await pending;
      result.push({ name: 'late owner', deduplicated, samePromise, aborted: signal.aborted, disposed: owner.count(), mounted: nodes.root.querySelectorAll('.raveldex-inline').length, preserved: nodes.root.firstChild === nodes.original });
    }
    {
      const nodes = makeElements(), owner = makeOwner(); let attempts = 0;
      const controller = createInlineSearch({ ...nodes, load() { if (++attempts === 1) throw new Error('synchronous refusal'); return owner; } });
      await controller.start(); const offeredRetry = !nodes.retry.hidden;
      await controller.start(); const mounted = Boolean(nodes.root.querySelector('.raveldex-inline'));
      await controller.destroy();
      result.push({ name: 'synchronous failure retry', attempts, offeredRetry, mounted, disposed: owner.count() });
    }
    {
      const nodes = makeElements(), owner = makeOwner(); let controller;
      customElements.define('inline-abandon-on-remove', class extends HTMLElement { disconnectedCallback() { void controller.destroy(); } });
      const original = document.createElement('inline-abandon-on-remove'); nodes.root.replaceChildren(original);
      controller = createInlineSearch({ ...nodes, load: async () => owner });
      await controller.start(); await controller.destroy();
      result.push({ name: 'reentrant mount abandonment', disposed: owner.count(), mounted: nodes.root.querySelectorAll('.raveldex-inline').length, preserved: nodes.root.firstChild === original, closed: nodes.status.textContent.includes('closed') });
    }
    {
      const nodes = makeElements(), invalid = makeOwner(), valid = makeOwner(); let attempts = 0, release, entered;
      const gate = new Promise(resolve => { release = resolve; });
      const cleaning = new Promise(resolve => { entered = resolve; });
      const controller = createInlineSearch({ ...nodes, load: async () => ++attempts === 1
        ? { ...invalid, documents: [{ id: 'bad', title: 'Bad link', url: 'javascript:alert(1)' }], dispose: async () => { entered(); await gate; await invalid.dispose(); } }
        : valid });
      const first = controller.start(); await cleaning;
      const retryHiddenDuringCleanup = nodes.retry.hidden;
      release(); await first; const offeredRetry = !nodes.retry.hidden;
      await controller.start(); await controller.destroy();
      result.push({ name: 'failed candidate cleanup', retryHiddenDuringCleanup, offeredRetry, attempts, disposedInvalid: invalid.count(), disposedValid: valid.count(), preserved: nodes.root.firstChild === nodes.original });
    }
    {
      const nodes = makeElements(), owner = makeOwner(); let controller, entered = false, nested, release;
      const gate = new Promise(resolve => { release = resolve; });
      customElements.define('inline-reenter-on-restore', class extends HTMLElement { connectedCallback() { if (entered) nested = controller.destroy(); } });
      const original = document.createElement('inline-reenter-on-restore'); nodes.root.replaceChildren(original);
      controller = createInlineSearch({ ...nodes, load: async () => ({ ...owner, dispose: async () => { await gate; await owner.dispose(); } }) });
      await controller.start(); entered = true;
      const first = controller.destroy(); let settled = false; first.then(() => { settled = true; });
      await Promise.resolve(); await Promise.resolve();
      const before = settled; release(); await first;
      result.push({ name: 'reentrant restoration', stablePromise: first === nested, waitedForDisposal: !before, disposed: owner.count(), preserved: nodes.root.firstChild === original });
    }
    return result;
  }, site.base);
  assert.deepEqual(outcomes, [
    { name: 'late owner', deduplicated: true, samePromise: true, aborted: true, disposed: 1, mounted: 0, preserved: true },
    { name: 'synchronous failure retry', attempts: 2, offeredRetry: true, mounted: true, disposed: 1 },
    { name: 'reentrant mount abandonment', disposed: 1, mounted: 0, preserved: true, closed: true },
    { name: 'failed candidate cleanup', retryHiddenDuringCleanup: true, offeredRetry: true, attempts: 2, disposedInvalid: 1, disposedValid: 1, preserved: true },
    { name: 'reentrant restoration', stablePromise: true, waitedForDisposal: true, disposed: 1, preserved: true },
  ]);
  await page.close(); record('ownership and synchronous lifecycle', outcomes);
});

test('copied browser controller publishes pending work before loading and failure status callbacks', async () => {
  const site = sites[0], page = await browser.newPage(); await page.goto(site.origin + site.base);
  await page.getByRole('searchbox', { name: 'Search walking guides' }).waitFor();
  const outcomes = await page.evaluate(async base => {
    const { createInlineSearch, createRaveldex } = await import(base + 'assets/lifecycle.js');
    const output = [];
    for (const phase of ['loading-destroy', 'loading-start', 'failure-destroy']) {
      const root = document.createElement('div'), status = document.createElement('p'), retry = document.createElement('button');
      document.body.append(root, status, retry);
      let controller, callbackWork, loads = 0, disposals = 0, release, entered;
      const waiting = new Promise(resolve => { entered = resolve; });
      const gate = new Promise((_, reject) => { release = reject; });
      controller = createInlineSearch({ root, status, retry, load: async () => {
        loads++;
        if (phase === 'failure-destroy') { entered(); return gate; }
        const engine = createRaveldex({ schema: { text: { body: {} } } });
        return { engine, documents: [], async dispose() { disposals++; await engine.dispose(); } };
      } });
      customElements.define('browser-status-' + phase, class extends HTMLElement {
        disconnectedCallback() { callbackWork = phase === 'loading-start' ? controller.start() : controller.destroy(); }
      });
      const child = document.createElement('browser-status-' + phase);
      if (phase !== 'failure-destroy') status.append(child);
      const work = controller.start();
      if (phase === 'failure-destroy') { await waiting; status.append(child); release(new Error('expected failure')); }
      await work; await callbackWork;
      const deduplicated = phase !== 'loading-start' || callbackWork === work;
      const destroyed = controller.destroy(); await destroyed;
      output.push({ phase, loads, disposals, deduplicated, stableDestroy: destroyed === controller.destroy(),
        retryHidden: retry.hidden, closed: status.textContent.includes('closed'), mounted: root.querySelectorAll('.raveldex-inline').length });
      root.remove(); status.remove(); retry.remove();
    }
    return output;
  }, site.base);
  assert.deepEqual(outcomes, [
    { phase: 'loading-destroy', loads: 0, disposals: 0, deduplicated: true, stableDestroy: true, retryHidden: true, closed: true, mounted: 0 },
    { phase: 'loading-start', loads: 1, disposals: 1, deduplicated: true, stableDestroy: true, retryHidden: true, closed: true, mounted: 0 },
    { phase: 'failure-destroy', loads: 1, disposals: 0, deduplicated: true, stableDestroy: true, retryHidden: true, closed: true, mounted: 0 },
  ]);
  await page.close(); record('loading and failure status reentry', outcomes);
});


test('copied starter refuses unusable display titles before replacing generated pages', async () => {
  const site = sites[0], contentPath = join(site.directory, 'content.json');
  const original = await readFile(contentPath, 'utf8');
  const output = await readFile(join(site.directory, 'dist/index.html'), 'utf8');
  const invalidTitles = ['', ' \t ', 'x'.repeat(1025), '\ud800'];
  try {
    for (const title of invalidTitles) {
      const content = JSON.parse(original); content[0].title = title;
      await writeFile(contentPath, JSON.stringify(content));
      await assert.rejects(command(process.execPath, ['build.mjs'], site.directory), /Invalid or duplicate guide/);
      assert.equal(await readFile(join(site.directory, 'dist/index.html'), 'utf8'), output,
        'An invalid title cannot replace the existing useful browse output');
    }
  } finally {
    await writeFile(contentPath, original);
    await command(process.execPath, ['build.mjs'], site.directory);
    await build({ absWorkingDir: site.directory, entryPoints: ['lifecycle-entry.mjs'], outfile: 'dist/assets/lifecycle.js',
      bundle: true, platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent' });
  }
  record('unusable title build refusal', { cases: ['empty', 'whitespace', 'overlong', 'malformed UTF-16'], priorOutputPreserved: true });
});

test('copied loader refuses unusable fetched titles before handing out an owner and retains recovery', async () => {
  const site = sites[0], page = await browser.newPage();
  const original = JSON.parse(await readFile(join(site.directory, 'content.json'), 'utf8'));
  await page.goto(site.origin + site.base);
  await page.getByRole('searchbox', { name: 'Search walking guides' }).waitFor();
  for (const title of ['', ' \t ', 'x'.repeat(1025), '\ud800']) {
    const content = structuredClone(original); content[0].title = title;
    await page.route('**/content.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(content) }));
    const result = await page.evaluate(async base => {
      const { loadGuides } = await import(base + 'assets/lifecycle.js');
      let owner;
      try { owner = await loadGuides(new URL(base + 'content.json', location.origin), new AbortController().signal); return 'owner returned'; }
      catch (error) { return error.message; }
      finally { await owner?.dispose(); }
    }, site.base);
    assert.equal(result, 'Invalid guide record', 'The data loader refuses before creating/returning an engine owner');
    await page.unroute('**/content.json');
  }
  const malformed = structuredClone(original); malformed[0].title = '';
  await page.route('**/content.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(malformed) }));
  await page.reload();
  await page.getByRole('button', { name: 'Retry loading search' }).waitFor();
  assert.equal(await page.locator('.raveldex-inline').count(), 0);
  assert.match(await page.locator('[data-search-root]').textContent(), /guide links below are always available/);
  assert.equal(await page.getByRole('navigation', { name: 'Browse all guides' }).getByRole('link').count(), 7);
  await page.unroute('**/content.json');
  await page.getByRole('button', { name: 'Retry loading search' }).click();
  await page.getByRole('searchbox', { name: 'Search walking guides' }).waitFor();
  await page.close();
  record('unusable title fetch refusal and recovery', { cases: ['empty', 'whitespace', 'overlong', 'malformed UTF-16'], returnedOwners: 0, partialUI: false, browseLinks: 7, retryLoadsValidData: true });
});
