import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import { originalSourceTokens, scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../oracle/phrases.mjs';

const finalPrefix = (earlier, ending) => ({ kind: 'and', children: [
  { kind: 'text', text: earlier }, { kind: 'group', variants: [{ text: ending, match: 'prefix' }] },
] });

let server, exited, browser, base;
before(async () => {
  server = spawn(process.execPath, ['scripts/preview-pages.mjs', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  exited = once(server, 'exit');
  let log = '';
  server.stdout.on('data', chunk => { log += chunk; });
  server.stderr.on('data', chunk => { log += chunk; });
  const deadline = Date.now() + 20_000;
  while (!/Open http:\/\/127\.0\.0\.1:\d+\/raveldex\//.test(log)) {
    assert.equal(server.exitCode, null, log);
    assert.ok(Date.now() < deadline, log);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  base = /Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.exec(log)[1];
  browser = await chromium.launch({ channel: process.env.RAVELDEX_CANDIDATE_BROWSER === 'chromium' ? undefined : 'chrome', headless: true });
  console.log(`Workbench browser: ${browser.version()} / ${process.platform} ${process.arch} / ${process.version}`);
});

async function ready(page) {
  await page.waitForFunction(() => document.querySelector('[data-pilot-search]')?.dataset.pilotState === 'ready'
    && document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') === 'false');
}

test('Workbench uses the actual corpus, query buttons, filters and keyboard Inspector', async () => {
  const page = await browser.newPage({ viewport: { width: 1536, height: 1024 }, reducedMotion: 'reduce' });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => requests.push(request.url()));
  try {
    await page.goto(new URL('demo/', base).href); await ready(page);
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Try search on the usage guides');
    assert.equal(await page.locator('[data-raveldex-input]').inputValue(), '');
    assert.equal(await page.locator('.search-workbench').count(), 1);
    const corpus = JSON.parse(await readFile(new URL('../../docs/demo/corpus.json', import.meta.url)));
    const scan = scanSourceCorpus(corpus.records, corpus.schema);
    for (const query of ['source provider', 'typed filters', 'module worker']) {
      const button = page.getByRole('button', { name: query, exact: true });
      await button.focus(); await page.keyboard.press('Enter'); await ready(page);
      const [earlier, ending] = query.split(' ');
      const expected = sourceQueryResult(scan, finalPrefix(earlier, ending), { limit: 5 });
      assert.deepEqual(await page.locator('[data-raveldex-result]').evaluateAll(nodes => nodes.map(node => node.dataset.raveldexResult)), expected.hits.map(hit => hit.id));
      assert.equal(await page.locator('[data-raveldex-status]').innerText(), `${expected.total} ${expected.total === 1 ? 'result' : 'results'}. Showing 1–${expected.hits.length}.`);
      assert.ok(await button.evaluate(node => node === document.activeElement));
    }
    const input = page.locator('[data-raveldex-input]');
    await input.fill('source provide'); await input.press('Enter'); await ready(page);
    const partial = sourceQueryResult(scan, finalPrefix('source', 'provide'), { limit: 5 });
    assert.deepEqual(await page.locator('[data-raveldex-result]').evaluateAll(nodes => nodes.map(node => node.dataset.raveldexResult)), partial.hits.map(hit => hit.id));
    assert.equal(await page.locator('[data-raveldex-status]').innerText(), `${partial.total} ${partial.total === 1 ? 'result' : 'results'}. Showing 1–${partial.hits.length}.`);
    await input.fill('source'); await input.press('Enter'); await ready(page);
    await page.locator('[data-raveldex-next]').click(); await ready(page);
    assert.match(await page.locator('[data-raveldex-page]').innerText(), /Page 2/);
    await page.locator('[data-raveldex-facet]').selectOption({ index: 1 }); await ready(page);
    await page.locator('[data-raveldex-facet]').selectOption({ index: 0 }); await ready(page);
    await page.getByRole('button', { name: 'module worker', exact: true }).click(); await ready(page);
    await page.locator('[data-raveldex-inspect]').click();
    assert.ok(await page.locator('[data-raveldex-inspector-close]').evaluate(node => node === document.activeElement));
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('[data-raveldex-inspect]').evaluate(node => node === document.activeElement));
    assert.equal(await page.locator('[data-raveldex-submit]').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(197, 246, 75)');
    await page.locator('[data-raveldex-input]').fill('unmatchedword'); await input.press('Enter'); await ready(page);
    assert.equal(await page.locator('[data-raveldex-status]').innerText(), 'No results. Try a different search.');
    await page.getByRole('button', { name: 'module worker', exact: true }).click(); await ready(page);
    if (process.env.RAVELDEX_WORKBENCH_SCREENSHOTS) {
      await mkdir(process.env.RAVELDEX_WORKBENCH_SCREENSHOTS, { recursive: true });
      await page.setViewportSize({ width: 1536, height: 1250 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${process.env.RAVELDEX_WORKBENCH_SCREENSHOTS}/home-desktop.png` });
      await page.screenshot({ path: `${process.env.RAVELDEX_WORKBENCH_SCREENSHOTS}/home-full.png`, fullPage: true });
    }
    for (const width of [320, 390, 768, 1024, 1536]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `home reflow ${width}`);
      assert.ok(await page.locator('[data-raveldex-submit]').isVisible());
      assert.ok(await page.locator('[data-raveldex-facet]').isVisible());
      if (width === 390 && process.env.RAVELDEX_WORKBENCH_SCREENSHOTS) await page.screenshot({ path: `${process.env.RAVELDEX_WORKBENCH_SCREENSHOTS}/home-mobile.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    assert.ok(requests.every(url => new URL(url).origin === new URL(base).origin));
    assert.ok(requests.some(url => url.endsWith('/raveldex/demo/corpus.json')));
  } finally { await page.close(); }
});

test('prefix results, original highlights, facets and every page agree across both hosts and representations', async () => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const corpus = JSON.parse(await readFile(new URL('../../docs/demo/corpus.json', import.meta.url)));
  const scan = scanSourceCorpus(corpus.records, corpus.schema);
  const phraseScan = scanPhraseSourceCorpus(corpus.records, corpus.schema);
  const byId = new Map(corpus.records.map(record => [record.id, record]));
  const baselines = new Map();
  try {
    await page.goto(new URL('demo/', base).href); await ready(page);
    assert.equal(await page.locator('[data-pilot-mode]').inputValue(), 'prefix');
    assert.equal(await page.locator('.search-workbench__settings').getAttribute('open'), null);
    await page.getByText('Advanced demo settings', { exact: true }).click();
    const input = page.locator('[data-raveldex-input]');
    const submit = async text => { await input.fill(text); await input.press('Enter'); await ready(page); };
    const allPages = async (query, label, phrase = false) => {
      const expected = (phrase ? sourcePhraseQueryResult(phraseScan, query, { limit: corpus.records.length })
        : sourceQueryResult(scan, query, { limit: corpus.records.length }));
      const collected = [];
      let offset = 0;
      do {
        const rows = await page.locator('[data-raveldex-result]').evaluateAll(nodes => nodes.map(node => ({
          id: node.dataset.raveldexResult,
          score: Number(node.querySelector('[data-raveldex-score]').textContent.slice(6)),
          snippets: [...node.querySelectorAll('[data-raveldex-snippet]')].map(snippet => {
            let offset = 0;
            const marks = [], parts = [];
            for (const child of snippet.childNodes) {
              if (child.nodeType === 1 && child.getAttribute('aria-hidden') === 'true') continue;
              const text = child.textContent;
              if (child.nodeName === 'MARK') marks.push({ text, start: offset, end: offset + text.length });
              parts.push(text); offset += text.length;
            }
            return { text: parts.join(''), marks };
          }),
        })));
        const wanted = expected.hits.slice(offset, offset + 5);
        assert.deepEqual(rows.map(row => row.id), wanted.map(hit => hit.id), label);
        assert.equal(await page.locator('[data-raveldex-status]').innerText(), expected.total
          ? `${expected.total} ${expected.total === 1 ? 'result' : 'results'}. Showing ${offset + 1}–${offset + rows.length}.` : 'No results. Try a different search.', label);
        for (const [i, row] of rows.entries()) {
          assert.ok(Math.abs(row.score - wanted[i].score) < 1e-10, `${label}: score`);
          const source = byId.get(row.id).text.body;
          const tokens = originalSourceTokens(source);
          for (const snippet of row.snippets) {
            let start = source.indexOf(snippet.text);
            let valid = false;
            while (start >= 0) {
              if (snippet.marks.every(mark => tokens.some(token => token.start === start + mark.start
                && token.end === start + mark.end && source.slice(token.start, token.end) === mark.text))) { valid = true; break; }
              start = source.indexOf(snippet.text, start + 1);
            }
            assert.ok(valid, `${label}: snippet/highlights retain full original words`);
          }
        }
        collected.push(...rows);
        if (await page.locator('[data-raveldex-next]').getAttribute('aria-disabled') === 'true') break;
        assert.ok(rows.length > 0 && offset < corpus.records.length, `${label}: finite pagination`);
        await page.locator('[data-raveldex-next]').click(); await ready(page);
        assert.ok(await page.locator('[data-raveldex-next]').evaluate(node => node === document.activeElement));
        offset += rows.length;
      } while (true);
      assert.equal(collected.length, expected.total, label);
      assert.equal(new Set(collected.map(row => row.id)).size, expected.total, label);
      if (baselines.has(label)) assert.deepEqual(collected, baselines.get(label), `${label}: host/provider parity`);
      else baselines.set(label, collected);
      return collected;
    };
    for (const host of ['direct', 'worker']) for (const representation of ['source', 'offsets']) {
      const retained = await input.inputValue();
      await page.locator('[data-pilot-execution]').selectOption(host); await ready(page);
      assert.equal(await input.inputValue(), retained);
      assert.equal(await page.locator('[data-raveldex-facet]').inputValue(), '');
      await page.locator('[data-pilot-representation]').selectOption(representation); await ready(page);
      assert.equal(await input.inputValue(), retained);
      assert.equal(await page.locator('[data-raveldex-facet]').inputValue(), '');
      await page.locator('[data-pilot-mode]').selectOption('prefix'); await ready(page);
      for (const ending of ['prov', 'provide', 'provider']) {
        await submit(`source ${ending}`);
        assert.ok(await input.evaluate(node => node === document.activeElement));
        const rows = await allPages(finalPrefix('source', ending), ending);
        assert.ok(rows.some(row => row.id === 'usage:docs/api/ADDONS.md#source-positions-and-phrases'));
        assert.ok(rows.flatMap(row => row.snippets).flatMap(snippet => snippet.marks)
          .some(mark => mark.text.toLowerCase().startsWith('provider')), 'completion highlights the entire provider word');
      }
      await submit('source provide');
      const unfiltered = sourceQueryResult(scan, finalPrefix('source', 'provide'), { limit: corpus.records.length });
      const counts = new Map();
      for (const hit of unfiltered.hits) {
        const category = byId.get(hit.id).metadata.category;
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
      const choices = await page.locator('[data-raveldex-facet] option').evaluateAll(nodes => nodes.slice(1).map(node => ({ value: node.value, text: node.textContent })));
      assert.deepEqual(choices.map(choice => choice.text).sort(), [...counts].map(([category, count]) => `${category} (${count})`).sort());
      for (const [category] of counts) {
        await submit('source provide');
        const choice = await page.locator('[data-raveldex-facet] option').evaluateAll((nodes, label) => nodes.find(node => node.textContent.startsWith(label + ' (')).value, category);
        await page.locator('[data-raveldex-facet]').selectOption(choice); await ready(page);
        const filtered = { kind: 'and', children: [finalPrefix('source', 'provide'), { kind: 'eq', field: 'category', value: category }] };
        await allPages(filtered, `category ${category}`);
        await page.locator('[data-raveldex-facet]').selectOption(''); await ready(page);
      }
      for (const mode of ['text', 'phrase']) {
        const currentQuery = await input.inputValue();
        await page.locator('[data-pilot-mode]').selectOption(mode); await ready(page);
        assert.equal(await input.inputValue(), currentQuery);
        await submit('source provider');
        const query = mode === 'text' ? { kind: 'text', text: 'source provider' }
          : { kind: 'phrase', text: 'source provider' };
        await allPages(query, mode, mode === 'phrase');
      }
    }
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('workbench pages and open Inspector have no automated WCAG A/AA violations', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    for (const route of ['demo/']) {
      await page.goto(new URL(route, base).href); await ready(page);
      await page.addScriptTag({ path: new URL('../../node_modules/axe-core/axe.min.js', import.meta.url).pathname });
      const code = page.locator('pre[tabindex="0"]').first();
      if (await code.evaluate(node => node.scrollWidth > node.clientWidth)) {
        await code.focus(); await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => document.querySelector('pre[tabindex="0"]').scrollLeft > 0);
      }
      for (const state of ['results', 'Inspector']) {
        if (state === 'Inspector') await page.locator('[data-raveldex-inspect]').click();
        const violations = await page.evaluate(async () => (await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })));
        assert.deepEqual(violations, [], `${route || 'home'} ${state}`);
        if (state === 'Inspector') await page.keyboard.press('Escape');
      }
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 320, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.ok(await page.locator('[data-raveldex-input]').isVisible());
      await page.emulateMedia({ forcedColors: 'none' });
    }
  } finally { await page.close(); }
});

test('loading, initialization failure and retry preserve a useful page', async () => {
  const page = await browser.newPage();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/demo/corpus.json', async route => { await gate; await route.fulfill({ status: 503, body: 'Unavailable' }); });
  try {
    await page.goto(new URL('demo/', base).href, { waitUntil: 'domcontentloaded' });
    assert.ok(await page.getByRole('button', { name: 'module worker', exact: true }).isDisabled());
    assert.ok(await page.getByRole('link', { name: 'Getting started', exact: true }).isVisible());
    release();
    await page.waitForFunction(() => document.querySelector('[data-pilot-search]').dataset.pilotState === 'error');
    assert.ok(await page.getByRole('button', { name: 'Retry loading guides' }).isVisible());
    assert.equal(await page.locator('[data-pilot-status]').textContent(), 'The guides could not be loaded. Use Retry loading guides or browse the guides.');
    assert.equal(await page.locator('[data-pilot-diagnostics]').isVisible(), true);
    await page.locator('[data-pilot-diagnostics] summary').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-pilot-error]').textContent(), 'CORPUS_OR_INITIALIZATION_ERROR');
    await page.unroute('**/demo/corpus.json');
    await page.getByRole('button', { name: 'Retry loading guides' }).click(); await ready(page);
    assert.equal(await page.locator('[data-raveldex-ui]').count(), 1);
    assert.equal(await page.locator('[data-raveldex-input]').inputValue(), '');
    const retry=page.getByRole('button', { name: 'Retry loading guides' });
    assert.equal(await retry.evaluate(node=>node===document.activeElement&&!node.hidden),true);
    assert.equal(await retry.getAttribute('aria-disabled'),'true');
    await page.locator('[data-raveldex-input]').focus();
    assert.ok(await retry.isHidden());
    assert.equal(await page.locator('[data-pilot-diagnostics]').isVisible(), false);
  } finally { release(); await page.close(); }
});

test('without JavaScript the homepage keeps documentation and an honest search fallback', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
  try {
    const page = await context.newPage(); await page.goto(base);
    assert.ok(await page.locator('noscript p').isVisible());
    assert.match(await page.locator('noscript p').innerText(), /Search needs JavaScript/);
    assert.ok(await page.getByRole('main').getByRole('link', { name: 'Get started', exact: true }).isVisible());
    assert.equal(await page.locator('.search-workbench__queries').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole('main').getByRole('link', { name: 'Get started', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/raveldex/guide/overview/');
  } finally { await context.close(); }
});
after(async () => {
  await browser?.close();
  if (server && server.exitCode === null && server.signalCode === null) server.kill('SIGTERM');
  await exited;
});

test('shared reading shell reflows, identifies the current page and supports keyboard skip', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(new URL('reference/', base).href);
    assert.equal(await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'API reference', exact: true }).getAttribute('aria-current'), 'page');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('main').evaluate(node => node === document.activeElement), true);
    for (const width of [320, 390, 768, 1024, 1536]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['guide/overview/', 'reference/']) {
        await page.goto(new URL(route, base).href);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} reflow ${width}`);
      }
    }
  } finally { await page.close(); }
});
