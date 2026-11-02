import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';
import { PAGES } from '../../site/pages.mjs';

test('branch Pages projection and real packed demo work at /raveldex/', { timeout: 120_000 }, async context => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const server = spawn(process.execPath, ['scripts/preview-pages.mjs', '--port', '0'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(server, 'exit');
  let log = '', browser;
  const observations = [], failures = [];
  server.stdout.on('data', bytes => { log += bytes; });
  server.stderr.on('data', bytes => { log += bytes; });
  try {
    const deadline = Date.now() + 20_000;
    while (!/Open http:\/\/127\.0\.0\.1:\d+\/raveldex\//.test(log)) {
      assert.equal(server.exitCode, null, log);
      assert.ok(Date.now() < deadline, `preview startup timeout: ${log}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const url = /Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.exec(log)[1];
    const channel = process.env.RAVELDEX_CANDIDATE_BROWSER === 'chromium' ? undefined : 'chrome';
    browser = await chromium.launch({ channel, headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [], badRequests = [], network = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    page.on('request', request => network.push(request.url()));
    page.on('response', response => { if (response.status() >= 400) badRequests.push({ url: response.url(), status: response.status() }); });
    await page.goto(url);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('main').evaluate(node => node === document.activeElement), true);
    await page.getByRole('link', { name: 'setup/build/preview example', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/raveldex/examples/astro/');
    assert.match(await page.locator('main').innerText(), /preview stop --root/);
    await page.reload();
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Add search to Astro pages');
    const recipe = await fetch(new URL('example-files/core.mjs', url));
    assert.equal(recipe.status, 200);
    assert.equal(await recipe.text(), await readFile(join(root, 'docs/api/examples/core.mjs'), 'utf8'));
    for (const path of ['evidence/PUBLIC-DOCS-20261030-raw.tar.gz', 'history/CANDIDATE_HISTORY.md', 'planning/roadmap.json', '_pages-manifest.json', '_config.yml',
      'guide/release-scope/', 'guide/publication-status/', 'guide/release-notes/', 'contracts/core-contract/', 'missing-page/']) {
      const result = await fetch(new URL(path, url));
      assert.equal(result.status, 404, path);
      assert.match(await result.text(), /Page not found/);
    }
    observations.push({ name: 'onboarding, deep-link refresh, exact recipe and private-path refusal', status: 'Pass' });
    console.log('Pages browser: onboarding and private-path checks complete');
    const manifest = JSON.parse(await readFile(join(root, 'docs/_pages-manifest.json'), 'utf8'));
    for (const item of manifest.files.filter(item => item.path.endsWith('.html'))) {
      const html = await readFile(join(root, 'docs', item.path), 'utf8');
      const prose = html.replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<code[\s\S]*?<\/code>/g, '').replace(/<[^>]+>/g, ' ');
      assert.doesNotMatch(prose, /RX-\d{4}|owner.reported|user confirmed|Medium verbosity|VoiceOver Utility|15 KiB|3407c2a/i, item.path);
    }
    await page.goto(new URL('demo/', url).href);
    const ready = async () => {
      await page.waitForFunction(() => document.querySelector('[data-pilot-search]')?.dataset.pilotState === 'ready');
      await page.waitForFunction(() => document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') === 'false');
    };
    const search = async text => {
      await page.locator('[data-raveldex-input]').fill(text);
      await page.locator('[data-raveldex-submit]').click();
      await ready();
    };
    const collect = () => page.locator('[data-raveldex-result]').evaluateAll(nodes => nodes.map(node => ({
      id: node.dataset.raveldexResult, score: node.querySelector('[data-raveldex-score]').textContent,
      text: [...node.querySelectorAll('[data-raveldex-snippet]')].map(item => item.textContent),
    })));
    await ready();
    const corpus = JSON.parse(await readFile(join(root, 'docs/demo/corpus.json'), 'utf8'));
    assert.equal(corpus.algorithmVersion, 'raveldex-usage-guides-v1');
    assert.equal(await page.locator('[data-pilot-identity]').innerText(), `Searches ${corpus.records.length} sections from 5 guides.`);
    const routes = new Map(PAGES.map(([source, route]) => [source, route]));
    const guideBodies = new Map();
    for (const section of corpus.sections) {
      const route = routes.get(section.sourcePath); assert.ok(route);
      if (!guideBodies.has(route)) {
        const response = await fetch(new URL(route + '/', url)); assert.equal(response.status, 200);
        guideBodies.set(route, await response.text());
      }
      assert.ok(guideBodies.get(route).includes(`id="${section.anchor}"`), `guide heading exists: ${section.id}`);
    }
    const scan = scanSourceCorpus(corpus.records, corpus.schema);
    for (const [query, intended] of [['source provider', 'usage:docs/api/ADDONS.md#source-positions-and-phrases'],
      ['typed filters', 'usage:docs/api/ADDONS.md#typed-filters-and-exact-facets'],
      ['module worker', 'usage:docs/api/HOSTS.md#one-owner-module-worker']]) {
      await search(query);
      const [earlier, ending] = query.split(' ');
      const typedQuery = { kind: 'and', children: [{ kind: 'text', text: earlier },
        { kind: 'group', variants: [{ text: ending, match: 'prefix' }] }] };
      const expected = sourceQueryResult(scan, typedQuery, { limit: 5 });
      assert.deepEqual((await collect()).map(item => item.id), expected.hits.map(item => item.id));
      assert.equal(await page.locator('[data-raveldex-status]').innerText(), `${expected.total} results. Showing 1–${expected.hits.length}.`);
      const all = sourceQueryResult(scan, typedQuery, { limit: corpus.records.length });
      assert.ok(all.hits.some(item => item.id === intended), `sample query finds its guide: ${query}`);
    }
    await search('source provider');
    assert.ok(await page.locator('[data-raveldex-result]').count() > 0);
    const link = page.locator('[data-raveldex-result-title]').first();
    const destination = await link.getAttribute('href');
    assert.ok(new URL(destination, url).pathname.startsWith('/raveldex/reference/') || new URL(destination, url).pathname.startsWith('/raveldex/guide/'));
    assert.equal(new URL(destination, url).origin, new URL(url).origin);
    await link.click();
    assert.equal(new URL(page.url()).origin, new URL(url).origin);
    const anchor = decodeURIComponent(new URL(page.url()).hash.slice(1));
    assert.equal(await page.locator(`[id="${anchor}"]`).count(), 1);
    await page.goBack();
    await ready();
    await search('source');
    assert.equal(await page.locator('[data-raveldex-next]').getAttribute('aria-disabled'), 'false');
    const firstPage = await collect();
    await page.locator('[data-raveldex-next]').click(); await ready();
    assert.notDeepEqual(await collect(), firstPage);
    const facet = page.locator('[data-raveldex-facet]');
    assert.ok(await facet.locator('option').count() > 1);
    await facet.selectOption({ index: 1 }); await ready();
    await facet.selectOption({ index: 0 }); await ready();
    await search('source provider');
    assert.equal(await page.locator('details').getAttribute('open'), null);
    await page.getByText('Advanced demo settings', { exact: true }).click();
    await page.locator('[data-pilot-mode]').selectOption('phrase'); await ready();
    const direct = await collect(); assert.ok(direct.length > 0);
    await page.locator('[data-pilot-representation]').selectOption('offsets'); await ready();
    assert.deepEqual(await collect(), direct);
    await page.locator('[data-pilot-execution]').selectOption('worker'); await ready();
    assert.deepEqual(await collect(), direct);
    assert.ok(network.some(item => new URL(item).pathname.endsWith('/demo/engine-worker.mjs')));
    const inspect = page.locator('[data-raveldex-inspect]');
    await inspect.click();
    await page.waitForFunction(() => document.querySelector('[data-raveldex-inspector-data]')?.textContent.includes('raveldex-bm25-v1'));
    assert.equal(await page.locator('[data-raveldex-inspector-close]').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await inspect.evaluate(node => node === document.activeElement), true);
    await page.locator('[data-pilot-destroy]').click();
    assert.equal(await page.locator('[data-raveldex-ui]').count(), 0);
    await page.locator('[data-pilot-initialize]').click(); await ready();
    assert.equal(await page.locator('[data-raveldex-input]').inputValue(), 'source provider');
    await search('unmatchedword');
    assert.equal(await page.locator('[data-raveldex-status]').innerText(), 'No results.');
    await search('source provider');
    observations.push({ name: 'real packed demo navigation, pagination, facets, phrase/offset/worker parity, Inspector, empty recovery, teardown', status: 'Pass', direct });
    console.log('Pages browser: guide search and lifecycle checks complete');
    for (const width of [320, 390, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(new URL('guide/overview/', url).href);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `guide reflow at ${width}`);
      await page.goto(new URL('reference/', url).href);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `reference table reflow at ${width}`);
      await page.locator('table').first().evaluate(table => { if (table.scrollWidth > table.clientWidth) {
        table.scrollLeft = table.scrollWidth;
        if (table.scrollLeft === 0) throw new Error('Wide reference table cannot scroll');
      } });
      await page.goto(new URL('demo/', url).href); await ready();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `demo reflow at ${width}`);
    }
    observations.push({ name: '320/390/768/1024/1280px reflow; viewport emulation, not physical browser zoom', status: 'Pass' });
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(badRequests, []);
    assert.ok(network.every(item => new URL(item).origin === new URL(url).origin));
    console.log(JSON.stringify({ browser: browser.version(), observations, pageErrors, badRequests }));
  } catch (error) { failures.push({ message: error.message, stack: error.stack }); throw error; }
  finally {
    if (context.signal.aborted && !failures.length) failures.push({ message: 'Browser test was cancelled or timed out' });
    const version = browser?.version();
    await browser?.close();
    if (server.exitCode === null && server.signalCode === null) server.kill('SIGTERM');
    await exited;
    await writeFile(process.env.RAVELDEX_PAGES_REPORT ?? join(tmpdir(), 'raveldex-pages-browser.json'), JSON.stringify({
      status: failures.length ? 'Fail' : 'Pass', browser: version, node: process.version, observations, failures,
      scope: 'One automated Chrome/Chromium session; no human AT, physical input, real zoom, heap/copy peaks or live deployment qualification.',
    }, null, 2) + '\n');
  }
});
