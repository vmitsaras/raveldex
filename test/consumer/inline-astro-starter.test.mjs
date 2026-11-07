import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, cp, mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { tmpdir, platform, release, arch } from 'node:os';
import { join, extname } from 'node:path';
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import axe from 'axe-core';
import { command, REPO_ROOT, parsePackedMetadata, digest } from '../../scripts/lib/packed-consumer.mjs';
import { packAstro } from '../../scripts/pack-astro.mjs';
import { seedStarterCache } from './inline-astro-starter-cache.mjs';

let directory, site, browser, corePackage, astroPackage;
const report = { kind: 'raveldex-inline-astro-starter-v1', environment: {
  node: process.version, platform: platform(), release: release(), arch: arch(), astro: '7.3.2' },
  observations: [], scope: 'Exact copied starter, real installed private packages, real static builds and finite headless browser behavior. No human AT, physical input, actual zoom, deployment or publication.' };
const inputs = [];
async function serve(root, base) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://local');
    if (!url.pathname.startsWith(base)) { response.writeHead(404).end(); return; }
    let path = decodeURIComponent(url.pathname.slice(base.length));
    if (!path || path.endsWith('/')) path += 'index.html';
    if (path.split('/').some(x => x === '..')) { response.writeHead(404).end(); return; }
    try {
      const data = await readFile(join(root, path));
      response.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[extname(path)] ?? 'application/octet-stream');
      response.end(data);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
async function buildSite(base) {
  process.env.RAVELDEX_ASTRO_BASE = base; process.env.ASTRO_TELEMETRY_DISABLED = '1';
  const result = await command(process.execPath, [join(site, 'node_modules/astro/bin/astro.mjs'), 'build'], site);
  delete process.env.RAVELDEX_ASTRO_BASE;
  await writeFile(join(directory, `build-${base === '/' ? 'root' : 'help'}.log`), result.stdout + result.stderr);
}
async function waitReady(page) {
  await page.waitForFunction(() => document.querySelector('#search-status')?.textContent.startsWith('Search is ready.'));
}
async function search(page, words) {
  const input = page.getByRole('searchbox', { name: 'Search the workshop guide', exact: true });
  await input.fill(words); await input.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#search-root [aria-busy="true"]'));
}
const resultIDs = page => page.locator('[data-raveldex-inline-result]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-raveldex-inline-result')));

before(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'raveldex-inline-astro-starter-')));
  const cache = join(directory, '.npm-cache');
  report.archiveOnlySourceCache = await seedStarterCache(cache, { archivesOnly: true });
  assert.equal(report.archiveOnlySourceCache.reconstructedManifests, 0);
  // Resolve from the same isolated archive-only cache, proving no warm
  // historical registry manifest is needed after an ordinary npm ci.
  report.toolingCache = await seedStarterCache(cache, { sourceCache: cache });
  await mkdir(join(directory, 'core'));
  const packed = parsePackedMetadata((await command('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', join(directory, 'core'), '--cache', cache])).stdout);
  corePackage = join(directory, 'core', packed.filename);
  const packedAstro = await packAstro({ output: join(directory, 'astro') }); astroPackage = packedAstro.tarball;
  site = join(directory, 'site'); await cp(join(REPO_ROOT, 'examples/inline-astro'), site, { recursive: true });
  const installation = await command('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', cache, corePackage, astroPackage], site);
  await writeFile(join(directory, 'installation.log'), installation.stdout + installation.stderr);
  for (const name of ['raveldex', 'raveldex-astro']) {
    const installed = join(site, 'node_modules/@vmitsaras', name);
    assert.equal(await realpath(installed), installed, 'Actual installed tarball, no workspace symlink');
    const metadata = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
    assert.equal(metadata.private, true); assert.deepEqual(metadata.dependencies ?? {}, {});
  }
  assert.equal(JSON.parse(await readFile(join(site, 'node_modules/astro/package.json'), 'utf8')).version, '7.3.2');
  report.packages = { coreSha256: digest(await readFile(corePackage)), astroSha256: digest(await readFile(astroPackage)),
    sourceDirectory: site, toolchain: 'Astro installed offline from npm cache, not linked to checkout' };
  // This test-only probe imports the exact copied application wrapper and the
  // actual installed loader. No test hooks are included in the starter itself.
  await writeFile(join(site, 'probe-entry.mjs'), "export { createInlineSearch } from './src/search.mjs';\nexport { loadStaticSearch } from '@vmitsaras/raveldex-astro/client';\n");
  const probe = await build({ absWorkingDir: site, entryPoints: ['probe-entry.mjs'], outfile: join(directory, 'probe.mjs'),
    bundle: true, platform: 'browser', format: 'esm', target: 'es2022', metafile: true, logLevel: 'silent' });
  for (const [path, data] of Object.entries(probe.metafile.inputs)) {
    assert.ok(path === 'probe-entry.mjs' || path.startsWith('src/') || path === 'configuration.mjs'
      || /^node_modules\/@vmitsaras\/raveldex(?:-astro)?\/dist\//.test(path), `foreign runtime input: ${path}`);
    assert.ok(data.imports.every(item => !item.external)); inputs.push(path);
  }
  report.installedRuntimeGraph = inputs;
  const channel = process.env.RAVELDEX_CANDIDATE_BROWSER === 'chromium' ? undefined : 'chrome';
  browser = await chromium.launch({ channel, headless: true });
  report.environment.browser = browser.version();
});
after(async () => {
  await browser?.close();
  if (process.env.RAVELDEX_INLINE_ASTRO_STARTER_REPORT)
    await writeFile(process.env.RAVELDEX_INLINE_ASTRO_STARTER_REPORT, JSON.stringify(report, null, 2) + '\n');
});

test('exact installed Astro inline starter builds root/help bases with real search, facets, snippets and destination pages', async () => {
  for (const base of ['/', '/help/']) {
    process.env.RAVELDEX_ASTRO_BASE = base; process.env.ASTRO_TELEMETRY_DISABLED = '1';
    await buildSite(base);
    const manifest = JSON.parse(await readFile(join(site, 'dist/raveldex/manifest.json'), 'utf8'));
    assert.equal(manifest.base, base); assert.equal(manifest.recordCount, 6); assert.equal(manifest.assets.native, undefined);
    const server = await serve(join(site, 'dist'), base), context = await browser.newContext(), page = await context.newPage();
    const requests = [], errors = [];
    page.on('request', request => { if (request.url().includes('/raveldex/')) requests.push(request.url()); });
    page.on('pageerror', error => errors.push(String(error)));
    try {
      await page.goto(server.origin + base);
      await page.getByRole('button', { name: 'Enable search', exact: true }).waitFor();
      assert.deepEqual(requests, [], 'No asset load before explicit enable');
      await page.getByRole('button', { name: 'Enable search', exact: true }).click(); await waitReady(page);
      await search(page, 'workshop'); assert.equal((await resultIDs(page)).length, 3);
      assert.match(await page.locator('.raveldex-inline__status').innerText(), /6 results/);
      await page.getByRole('button', { name: 'Load more', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('[data-raveldex-inline-result]').length === 6);
      assert.deepEqual([...(await resultIDs(page))].sort(), ['access', 'booking', 'directions', 'first-visit', 'sewing', 'woodworking']);
      assert.ok(await page.locator('.raveldex-inline__snippet mark').count() > 0);
      await page.getByLabel('Topic', { exact: true }).selectOption({ label: 'Tools (2)' });
      await page.waitForFunction(() => document.querySelectorAll('[data-raveldex-inline-result]').length === 2);
      assert.deepEqual([...(await resultIDs(page))].sort(), ['sewing', 'woodworking']);
    await page.getByRole('button', { name: 'Clear search and filters', exact: true }).click();
      await search(page, 'bobbin'); assert.deepEqual(await resultIDs(page), ['sewing']);
      const link = page.locator('a.raveldex-inline__result-title').first();
      assert.equal(await link.getAttribute('href'), server.origin + base + 'guide/sewing/');
      await link.click(); await page.waitForURL(server.origin + base + 'guide/sewing/');
      assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Sewing machines');
      await page.getByRole('link', { name: 'Back to the workshop guide', exact: true }).click();
      await page.waitForURL(server.origin + base);
      await page.getByRole('button', { name: 'Enable search', exact: true }).waitFor();
      assert.ok(requests.every(url => url.startsWith(server.origin + base + 'raveldex/')));
      assert.deepEqual(errors, []);
      const noJS = await browser.newContext({ javaScriptEnabled: false }), fallback = await noJS.newPage();
      try {
        await fallback.goto(server.origin + base);
        assert.equal(await fallback.getByRole('navigation', { name: 'Workshop guide pages' }).getByRole('link').count(), 6);
        assert.equal(await fallback.getByRole('button', { name: 'Enable search' }).count(), 0);
        await fallback.getByRole('link', { name: 'Sewing machines', exact: true }).click();
        assert.equal(await fallback.getByRole('heading', { level: 1 }).innerText(), 'Sewing machines');
      } finally { await noJS.close(); }
      report.observations.push({ name: 'installed exact starter', base, status: 'Pass', total: 6,
        completeIDs: ['access', 'booking', 'directions', 'first-visit', 'sewing', 'woodworking'],
        facetIDs: ['sewing', 'woodworking'], actualResultNavigation: true, noJavaScriptBrowse: true, requests, errors });
    } finally { await context.close(); await server.close(); }
  }
  delete process.env.RAVELDEX_ASTRO_BASE;
});

test('installed Astro wrapper recovers from each failed artifact and preserves fallback during delayed documents', async () => {
  await buildSite('/help/');
  const base = '/help/', server = await serve(join(site, 'dist'), base), context = await browser.newContext(), page = await context.newPage();
  try {
    for (const pattern of ['**/raveldex/manifest.json', '**/raveldex/source-*.json', '**/raveldex/documents-*.json']) {
      await page.goto(server.origin + base);
      await page.route(pattern, route => route.fulfill({ status: 503, body: 'temporarily unavailable' }));
      await page.getByRole('button', { name: 'Enable search', exact: true }).click();
      await page.getByRole('button', { name: 'Retry search', exact: true }).waitFor();
      assert.match(await page.locator('#search-status').innerText(), /could not load/);
      assert.equal(await page.getByRole('searchbox').count(), 0);
      assert.equal(await page.getByRole('navigation', { name: 'Workshop guide pages' }).getByRole('link').count(), 6);
      await page.unroute(pattern);
      await page.getByRole('button', { name: 'Retry search', exact: true }).click(); await waitReady(page);
      await search(page, 'bobbin'); assert.deepEqual(await resultIDs(page), ['sewing']);
    }
    await page.goto(server.origin + base);
    let reached, release;
    const waiting = new Promise(resolve => { reached = resolve; }), gate = new Promise(resolve => { release = resolve; });
    await page.route('**/raveldex/documents-*.json', async route => { reached(); await gate; await route.continue(); });
    await page.getByRole('button', { name: 'Enable search', exact: true }).click(); await waiting;
    assert.match(await page.locator('#search-status').innerText(), /Loading search/);
    assert.equal(await page.getByRole('searchbox').count(), 0);
    assert.equal(await page.getByRole('navigation', { name: 'Workshop guide pages' }).getByRole('link').count(), 6);
    release(); await waitReady(page);
    report.observations.push({ name: 'real artifact loading', status: 'Pass', failedAndRetried: ['manifest', 'source', 'documents'], delayedDocumentsFallback: true });
  } finally { await context.close(); await server.close(); }
});

test('exact Astro controller deduplicates initialization and disposes late owners/documents after destruction', async () => {
  await buildSite('/help/');
  await cp(join(directory, 'probe.mjs'), join(site, 'dist/probe.mjs'));
  const base = '/help/', server = await serve(join(site, 'dist'), base), context = await browser.newContext(), page = await context.newPage();
  try {
    await page.goto(server.origin + base);
    const observations = await page.evaluate(async ({ origin, base }) => {
      const { createInlineSearch, loadStaticSearch } = await import(base + 'probe.mjs');
      const output = [];
      for (const phase of ['owner', 'documents', 'loader-reentry']) {
        const root = document.createElement('section'), status = document.createElement('p'), button = document.createElement('button');
        const fallback = document.createTextNode('authored fallback'); root.append(fallback); document.body.append(root, status, button);
        let release, reached, actual, search, loads = 0, disposals = 0;
        const gate = new Promise(resolve => { release = resolve; }), waiting = new Promise(resolve => { reached = resolve; });
        const load = async options => {
          loads++;
          if (phase === 'loader-reentry') { void search.destroy(); reached(); await gate; }
          // A real loader receives no abort here to exercise an uncooperative
          // host's late completion. The wrapper must release its real owner.
          const { signal, ...unabortable } = options; void signal;
          actual = await loadStaticSearch(unabortable);
          if (phase === 'owner') { reached(); await gate; }
          return { ...actual,
            async loadDocuments() {
              const documents = await actual.loadDocuments();
              if (phase === 'documents') { reached(); await gate; }
              return documents;
            },
            async dispose() { disposals++; await actual.dispose(); },
          };
        };
        search = createInlineSearch({ root, status, button, load, buildId: 'workshop-guide-v1', manifestUrl: origin + base + 'raveldex/manifest.json' });
        const first = search.start(), second = search.start(), deduplicated = first === second;
        await waiting;
        const destroyed = search.destroy(), destroyedAgain = search.destroy();
        release(); await Promise.all([first, destroyed, destroyedAgain]);
        let afterDispose;
        try { await actual.engine.search('workshop'); } catch (error) { afterDispose = error.code; }
        output.push({ phase, loads, disposals, deduplicated, destroyDeduplicated: destroyed === destroyedAgain,
          afterDispose, fallbackPreserved: root.firstChild === fallback, noLateUI: root.querySelector('input') === null,
          closed: status.textContent, buttonHidden: button.hidden });
        root.remove(); status.remove(); button.remove();
      }
      let reconnect, callbackPromise, armed = false;
      customElements.define('astro-inline-reentrant-fallback', class extends HTMLElement {
        connectedCallback() { if (armed) callbackPromise = reconnect(); }
      });
      const root = document.createElement('section'), status = document.createElement('p'), button = document.createElement('button');
      const fallback = document.createElement('astro-inline-reentrant-fallback'); fallback.textContent = 'Original browse fallback';
      root.append(fallback); document.body.append(root, status, button);
      let actual, releaseDisposal, disposalReached, disposals = 0;
      const disposalGate = new Promise(resolve => { releaseDisposal = resolve; }), disposalWaiting = new Promise(resolve => { disposalReached = resolve; });
      const search = createInlineSearch({ root, status, button, buildId: 'workshop-guide-v1', manifestUrl: origin + base + 'raveldex/manifest.json',
        load: async options => {
          actual = await loadStaticSearch(options);
          return { ...actual, async dispose() { disposals++; await actual.dispose(); disposalReached(); await disposalGate; } };
        } });
      reconnect = () => search.destroy();
      await search.start(); armed = true;
      const disposing = search.destroy(); let settled = false; disposing.then(() => { settled = true; });
      await disposalWaiting; await Promise.resolve();
      const waitedForActualDisposal = !settled;
      releaseDisposal(); await disposing;
      output.push({ phase: 'fallback-reentry', loads: 1, disposals, deduplicated: true,
        destroyDeduplicated: callbackPromise === disposing, afterDispose: await actual.engine.search('workshop').then(() => 'unexpected', error => error.code),
        fallbackPreserved: root.firstChild === fallback, noLateUI: root.querySelector('input') === null,
        waitedForActualDisposal, buttonHidden: button.hidden });
      root.remove(); status.remove(); button.remove();
      return output;
    }, { origin: server.origin, base });
    for (const item of observations) {
      assert.equal(item.loads, 1); assert.equal(item.disposals, 1); assert.equal(item.deduplicated, true);
      assert.equal(item.destroyDeduplicated, true); assert.equal(item.afterDispose, 'DISPOSED');
      assert.equal(item.fallbackPreserved, true); assert.equal(item.noLateUI, true); assert.equal(item.buttonHidden, true);
      if (item.phase === 'fallback-reentry') assert.equal(item.waitedForActualDisposal, true);
    }
    report.observations.push({ name: 'actual late owned handle cleanup', status: 'Pass', observations });
  } finally { await context.close(); await server.close(); }
});

test('copied Astro controller guards authored loading and failure callbacks before starting or updating work', async () => {
  await buildSite('/help/'); await cp(join(directory, 'probe.mjs'), join(site, 'dist/probe.mjs'));
  const base = '/help/', server = await serve(join(site, 'dist'), base), page = await browser.newPage();
  try {
    await page.goto(server.origin + base);
    const observations = await page.evaluate(async base => {
      const { createInlineSearch, loadStaticSearch } = await import(base + 'probe.mjs');
      const output = [];
      for (const phase of ['loading-destroy', 'loading-start', 'failure-button', 'failure-status']) {
        const root = document.createElement('section'), status = document.createElement('p'), button = document.createElement('button');
        document.body.append(root, status, button);
        let search, callbackWork, loads = 0, disposals = 0, release, entered;
        const waiting = new Promise(resolve => { entered = resolve; }), gate = new Promise((_, reject) => { release = reject; });
        search = createInlineSearch({ root, status, button, buildId: 'workshop-guide-v1', manifestUrl: location.origin + base + 'raveldex/manifest.json',
          load: async options => {
            loads++;
            if (phase.startsWith('failure-')) { entered(); return gate; }
            const owner = await loadStaticSearch(options);
            return { ...owner, async dispose() { disposals++; await owner.dispose(); } };
          } });
        customElements.define('astro-status-' + phase, class extends HTMLElement {
          disconnectedCallback() { callbackWork = phase === 'loading-start' ? search.start() : search.destroy(); }
        });
        const child = document.createElement('astro-status-' + phase);
        if (!phase.startsWith('failure-')) status.append(child);
        const work = search.start();
        if (phase.startsWith('failure-')) {
          await waiting; (phase === 'failure-button' ? button : status).append(child); release(new Error('expected failure'));
        }
        await work; await callbackWork;
        const deduplicated = phase !== 'loading-start' || work === callbackWork;
        const destroyed = search.destroy(); await destroyed;
        output.push({ phase, loads, disposals, deduplicated, stableDestroy: destroyed === search.destroy(),
          closed: status.textContent.includes('closed'), hidden: button.hidden, mounted: root.querySelectorAll('.raveldex-inline').length });
        root.remove(); status.remove(); button.remove();
      }
      return output;
    }, base);
    assert.deepEqual(observations, [
      { phase: 'loading-destroy', loads: 0, disposals: 0, deduplicated: true, stableDestroy: true, closed: true, hidden: true, mounted: 0 },
      { phase: 'loading-start', loads: 1, disposals: 1, deduplicated: true, stableDestroy: true, closed: true, hidden: true, mounted: 0 },
      { phase: 'failure-button', loads: 1, disposals: 0, deduplicated: true, stableDestroy: true, closed: true, hidden: true, mounted: 0 },
      { phase: 'failure-status', loads: 1, disposals: 0, deduplicated: true, stableDestroy: true, closed: true, hidden: true, mounted: 0 },
    ]);
    report.observations.push({ name: 'loading and failure authored reentry', status: 'Pass', observations });
  } finally { await page.close(); await server.close(); }
});

test('copied Astro starter accepts changed content and documented CSS without repository runtime imports', async () => {
  const contentPath = join(site, 'content.json'), content = JSON.parse(await readFile(contentPath, 'utf8'));
  content.buildId = 'workshop-guide-v2';
  content.entries.push({ slug: 'ceramics', title: 'Ceramics bench', category: 'Tools', body: 'The workshop ceramics bench has a cobalt glazing station. Book an introduction before using the kiln.' });
  await writeFile(contentPath, JSON.stringify(content, null, 2) + '\n');
  await writeFile(join(site, 'src/style.css'), (await readFile(join(site, 'src/style.css'), 'utf8')) + '\n.raveldex-inline { --raveldex-inline-accent: #563c83; --raveldex-inline-radius: .75rem; }\n');
  process.env.RAVELDEX_ASTRO_BASE = '/help/'; process.env.ASTRO_TELEMETRY_DISABLED = '1';
  await buildSite('/help/'); delete process.env.RAVELDEX_ASTRO_BASE;
  const server = await serve(join(site, 'dist'), '/help/'), context = await browser.newContext({ viewport: { width: 320, height: 800 }, reducedMotion: 'reduce' }), page = await context.newPage();
  try {
    await page.goto(server.origin + '/help/'); await page.getByRole('button', { name: 'Enable search', exact: true }).click(); await waitReady(page);
    await search(page, 'cobalt'); assert.deepEqual(await resultIDs(page), ['ceramics']);
    assert.equal(await page.locator('.raveldex-inline').evaluate(node => getComputedStyle(node).getPropertyValue('--raveldex-inline-accent').trim()), '#563c83');
    assert.equal(await page.locator('.raveldex-inline').evaluate(node => getComputedStyle(node).getPropertyValue('--raveldex-inline-radius').trim()), '.75rem');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.length })));
    assert.deepEqual(violations, []);
    await page.locator('a.raveldex-inline__result-title').click();
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Ceramics bench');
    report.observations.push({ name: 'consumer replacement', status: 'Pass', buildId: content.buildId, records: 7,
      query: 'cobalt', result: 'ceramics', accent: '#563c83', radius: '.75rem', viewport: 320, axeViolations: violations });
  } finally { await context.close(); await server.close(); }
});
