import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';

let server, exited, browser, base;
before(async () => {
  server = spawn(process.execPath, ['scripts/preview-pages.mjs', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  exited = once(server, 'exit');
  let log = '';
  server.stdout.on('data', bytes => { log += bytes; });
  server.stderr.on('data', bytes => { log += bytes; });
  const deadline = Date.now() + 20_000;
  while (!/Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.test(log)) {
    assert.equal(server.exitCode, null, log); assert.ok(Date.now() < deadline, log);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  base = /Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.exec(log)[1];
  browser = await chromium.launch({ channel: process.env.RAVELDEX_CANDIDATE_BROWSER === 'chromium' ? undefined : 'chrome', headless: true });
  console.log(`Site search: ${browser.version()} / ${process.version} / ${process.platform} ${process.arch}`);
});
after(async () => { await browser?.close(); server?.kill('SIGTERM'); await exited; });

const trigger = page => page.locator('[data-site-search-trigger]');
const input = page => page.locator('.site-search [data-raveldex-inline-input]');
const ready = page => page.waitForFunction(() => document.querySelector('.site-search .raveldex-inline')?.getAttribute('aria-busy') === 'false');
async function open(page) {
  assert.equal(await trigger(page).count(), 1, 'The site header must use Raveldex modal search');
  await trigger(page).click(); await input(page).waitFor(); await ready(page);
}

test('every shared header offers lazy modal search instead of a Demo navigation link', async () => {
  const page = await browser.newPage();
  try {
    const requests = []; page.on('request', request => { if (request.url().endsWith('/site-assets/search/content.json')) requests.push(request.url()); });
    for (const route of ['', 'guide/overview/', 'reference/core/', 'examples/modal/', 'demo/']) {
      await page.goto(new URL(route, base).href);
      assert.equal(await trigger(page).count(), 1, route);
      await trigger(page).waitFor({ state: 'visible' });
      assert.equal(await page.locator('.site-header').getByRole('link', { name: 'Demo', exact: true }).count(), 0);
    }
    assert.deepEqual(requests, [], 'The corpus is loaded only on first open');
    await open(page); assert.equal(requests.length, 1);
    assert.equal(await page.locator('.site-search dialog:modal').count(), 1);
    assert.equal(await input(page).evaluate(node => node === document.activeElement), true);
  } finally { await page.close(); }
});

test('header modal uses native prefix results, exact counts, real links and preserved query/focus', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(new URL('guide/overview/', base).href); await open(page);
    const content = await (await fetch(new URL('site-assets/search/content.json', base))).json();
    const scan = scanSourceCorpus(content.records, content.schema);
    for (const [text, earlier, ending] of [['module worker', 'module', 'worker'], ['source prov', 'source', 'prov']]) {
      await input(page).fill(text); await input(page).press('Enter'); await ready(page);
      const expected = sourceQueryResult(scan, { kind: 'and', children: [{ kind: 'text', text: earlier }, { kind: 'group', variants: [{ text: ending, match: 'prefix' }] }] }, { limit: 5 });
      assert.deepEqual(await page.locator('.site-search [data-raveldex-inline-result]').evaluateAll(nodes => nodes.map(node => node.dataset.raveldexInlineResult)), expected.hits.map(hit => hit.id));
      assert.match(await page.locator('.site-search [data-raveldex-inline-status]').innerText(), new RegExp(`^${expected.total} result`));
      assert.equal(await page.locator('.site-search__excerpt').count(), expected.hits.length);
      if (text === 'module worker' && process.env.RAVELDEX_SITE_SEARCH_SCREENSHOTS) {
        await mkdir(process.env.RAVELDEX_SITE_SEARCH_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: `${process.env.RAVELDEX_SITE_SEARCH_SCREENSHOTS}/desktop.png` });
      }
    }
    await page.locator('.site-search [data-raveldex-modal-close]').click();
    assert.equal(await trigger(page).evaluate(node => node === document.activeElement), true);
    await open(page); assert.equal(await input(page).inputValue(), 'source prov'); await ready(page);
    const link = page.locator('.site-search [data-raveldex-inline-result-title]').first();
    const destination = new URL(await link.getAttribute('href'), base);
    assert.equal(destination.origin, new URL(base).origin); assert.ok(destination.hash);
    await link.click();
    await page.waitForURL(destination.href);
    assert.equal(await page.locator(`[id="${decodeURIComponent(destination.hash.slice(1))}"]`).count(), 1);
    await trigger(page).waitFor({ state: 'visible' });
    await open(page);
    await page.goBack();
    await trigger(page).waitFor({ state: 'visible' });
    assert.equal(await page.locator('.site-search dialog:modal').count(), 0);
    await open(page);
    assert.equal(await page.locator('.site-search .raveldex-modal').count(), 1, 'Back restores one working owner/interface');
  } finally { await page.close(); }
});

test('header Load more appends all addon matches past twenty without switching to pagination', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(new URL('examples/inline/', base).href); await open(page);
    const content = await (await fetch(new URL('site-assets/search/content.json', base))).json();
    const expected = sourceQueryResult(scanSourceCorpus(content.records, content.schema),
      { kind: 'group', variants: [{ text: 'addon', match: 'prefix' }] }, { limit: content.records.length });
    assert.ok(expected.total > 20, 'The actual docs query must cross the reported boundary');
    const modal = page.locator('.site-search');
    const results = modal.locator('[data-raveldex-inline-result]');
    const more = modal.getByRole('button', { name: 'Load more', exact: true });
    await input(page).fill('addon'); await input(page).press('Enter'); await ready(page);
    const first = await results.first().elementHandle();
    let displayed = 5, lastBatchStart = 0;
    while (displayed < expected.total) {
      assert.equal(await more.getAttribute('aria-disabled'), 'false');
      lastBatchStart = displayed;
      await more.click(); await ready(page); displayed = Math.min(displayed + 5, expected.total);
      assert.deepEqual(await results.evaluateAll(nodes => nodes.map(node => node.dataset.raveldexInlineResult)), expected.hits.slice(0, displayed).map(hit => hit.id));
      assert.equal(await first.evaluate(node => node.isConnected && node === node.parentElement.firstElementChild), true);
      assert.equal(await modal.locator('[data-raveldex-inline-page-summary]').textContent(), `Showing 1–${displayed} of ${expected.total}.`);
      assert.equal(await modal.getByRole('button', { name: 'Next results', exact: true }).count(), 0);
      assert.equal(await more.evaluate(node => node === document.activeElement), true);
    }
    assert.equal(await more.getAttribute('aria-disabled'), 'true');
    await more.press('Tab'); assert.equal(await more.isVisible(), false);
    await modal.getByRole('button', { name: 'Go to new results', exact: true }).press('Enter');
    assert.equal(await results.nth(lastBatchStart).locator('a').first().evaluate(node => node === document.activeElement), true);
    if (process.env.RAVELDEX_SITE_SEARCH_SCREENSHOTS) {
      await mkdir(process.env.RAVELDEX_SITE_SEARCH_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: `${process.env.RAVELDEX_SITE_SEARCH_SCREENSHOTS}/addon-complete.png` });
    }
  } finally { await page.close(); }
});

test('shortcut respects editable fields and loading cancellation cannot reopen the modal', async () => {
  const page = await browser.newPage();
  let release;
  try {
    await page.goto(new URL('demo/', base).href);
    assert.equal(await trigger(page).count(), 1);
    const workbench = page.locator('[data-raveldex-input]'); await workbench.waitFor();
    await workbench.focus(); await workbench.press('Control+k');
    assert.equal(await page.locator('.site-search dialog:modal').count(), 0);
    let requested;
    const seen = new Promise(resolve => { requested = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/site-assets/search/content.json', async route => { requested(); await gate; try { await route.continue(); } catch { /* the cancelled fetch is already gone */ } });
    const opener = page.locator('.site-header__nav').getByRole('link', { name: 'Guides', exact: true });
    await opener.focus(); await opener.press('Control+k'); await seen;
    await page.locator('[data-site-search-loading][open]').waitFor();
    await page.locator('[data-site-search-cancel]').click(); release();
    assert.equal(await page.locator('.site-search dialog:modal').count(), 0);
    assert.equal(await opener.evaluate(node => node === document.activeElement), true, 'First-open cancellation restores the shortcut opener');
    await page.unroute('**/site-assets/search/content.json');
    await open(page);
    await input(page).press('Escape');
    assert.equal(await page.locator('.site-search dialog:modal').count(), 0);
    assert.equal(await trigger(page).evaluate(node => node === document.activeElement), true);
  } finally { release?.(); await page.close(); }
});

test('a failed first load offers explicit retry and ready reopen reuses the same index', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(base); assert.equal(await trigger(page).count(), 1);
    let requests = 0;
    await page.route('**/site-assets/search/content.json', route => {
      requests++;
      if (requests === 1) return route.fulfill({ status: 503, body: 'Unavailable' });
      if (requests === 2) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"wrongBuild":true}' });
      return route.continue();
    });
    await trigger(page).click();
    const retry = page.locator('[data-site-search-retry]'); await retry.waitFor({ state: 'visible' });
    assert.match(await page.locator('[data-site-search-status]').innerText(), /try again|Try again/);
    await retry.click();
    await page.waitForFunction(() => !document.querySelector('[data-site-search-retry]').hidden);
    assert.equal(requests, 2);
    assert.equal(await page.locator('.site-search .raveldex-modal').count(), 0, 'Mismatched corpus bytes cannot initialize an owner');
    await retry.click(); await input(page).waitFor(); await ready(page);
    assert.equal(requests, 3);
    await page.locator('.site-search [data-raveldex-modal-close]').click(); await open(page);
    assert.equal(requests, 3);
    await input(page).fill('unmatchedword'); await input(page).press('Enter'); await ready(page);
    assert.match(await page.locator('.site-search [data-raveldex-inline-status]').innerText(), /No results/);
    await page.locator('.site-search [data-raveldex-inline-clear]').click();
    assert.equal(await input(page).inputValue(), '');
  } finally { await page.close(); }
});

test('header and modal remain usable at narrow/short widths and forced colors', async () => {
  const page = await browser.newPage();
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 900 }, { width: 320, height: 568 }, { width: 568, height: 320 }]) {
      await page.setViewportSize(viewport); await page.goto(base); await open(page);
      await input(page).fill('source'); await input(page).press('Enter'); await ready(page);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const bounds = await page.locator('.site-search .raveldex-modal').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1);
      assert.ok(await input(page).isVisible());
      if (viewport.width === 320 && process.env.RAVELDEX_SITE_SEARCH_SCREENSHOTS) {
        await mkdir(process.env.RAVELDEX_SITE_SEARCH_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: `${process.env.RAVELDEX_SITE_SEARCH_SCREENSHOTS}/mobile.png` });
      }
      await page.locator('.site-search [data-raveldex-inline-result-title]').first().focus();
      assert.notEqual(await page.locator('.site-search [data-raveldex-inline-result-title]').first().evaluate(node => getComputedStyle(node).outlineStyle), 'none');
      await page.locator('.site-search [data-raveldex-modal-close]').click();
    }
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' }); await open(page);
    assert.notEqual(await input(page).evaluate(node => getComputedStyle(node).outlineStyle), 'none');
    assert.equal(await page.locator('.site-search .raveldex-modal').evaluate(node => getComputedStyle(node).animationName), 'none');
    await page.emulateMedia({ forcedColors: 'none' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addScriptTag({ content: await readFile(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8') });
    const findings = await page.evaluate(async () => (await axe.run('.site-search', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })));
    assert.deepEqual(findings, []);
  } finally { await page.close(); }
});

test('without JavaScript the header retains ordinary guide navigation', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage(); await page.goto(base);
    const fallback = page.locator('[data-site-search-fallback]');
    assert.equal(await fallback.count(), 1); assert.equal(await fallback.isVisible(), true);
    await fallback.click(); assert.equal(new URL(page.url()).pathname, '/raveldex/guide/');
  } finally { await context.close(); }
});
