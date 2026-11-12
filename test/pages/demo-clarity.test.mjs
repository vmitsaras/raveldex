import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { STARTERS, starterArchive, starterSource } from '../../site/starters.mjs';

let server, exited, browser, base;
before(async () => {
  server = spawn(process.execPath, ['scripts/preview-pages.mjs', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  exited = once(server, 'exit');
  let log = '';
  server.stdout.on('data', bytes => { log += bytes; });
  server.stderr.on('data', bytes => { log += bytes; });
  const deadline = Date.now() + 20_000;
  while (!/Open http:\/\/127\.0\.0\.1:\d+\/raveldex\//.test(log)) {
    assert.equal(server.exitCode, null, log); assert.ok(Date.now() < deadline, log);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  base = /Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.exec(log)[1];
  browser = await chromium.launch({ channel: process.env.RAVELDEX_CANDIDATE_BROWSER === 'chromium' ? undefined : 'chrome', headless: true });
  console.log(`Demo clarity: ${browser.version()} / ${process.platform} ${process.arch} / ${process.version}`);
});
after(async () => {
  await browser?.close();
  if (server?.exitCode === null && server.signalCode === null) server.kill('SIGTERM');
  await exited;
});

test('home lets visitors try installed inline search and reach every interface without engine settings', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  try {
    await page.goto(base);
    if (process.env.RAVELDEX_DEMO_SCREENSHOTS) {
      await mkdir(process.env.RAVELDEX_DEMO_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: `${process.env.RAVELDEX_DEMO_SCREENSHOTS}/home-desktop.png`, fullPage: true });
    }
    const preview = page.locator('iframe[title="Inline search starter preview"]');
    assert.equal(await preview.count(), 1, 'The first live demo is a complete consumer interface');
    const frame = page.frameLocator('iframe[title="Inline search starter preview"]');
    const input = frame.getByRole('searchbox', { name: 'Search walking guides', exact: true });
    await input.fill('walking guide'); await input.press('Enter');
    await frame.locator('[data-raveldex-inline-status]').filter({ hasText: '7 results' }).waitFor();
    assert.equal(await frame.locator('[data-raveldex-inline-result]').count(), 3);
    await input.focus(); await input.press('Tab');
    assert.ok(await frame.getByRole('button', { name: 'Search', exact: true }).evaluate(node => node === node.ownerDocument.activeElement));
    const chooser = page.getByRole('navigation', { name: 'Search solutions', exact: true });
    for (const family of ['inline', 'modal', 'dropdown', 'directory', 'cards']) {
      const link = chooser.locator(`a[href="/raveldex/examples/${family}/"]`);
      assert.equal(await link.count(), 1); await link.focus(); await link.press('Enter');
      assert.equal(new URL(page.url()).pathname, `/raveldex/examples/${family}/`);
      await page.goBack();
    }
    assert.equal(await page.locator('[data-pilot-representation]').count(), 0);
    await page.getByRole('link', { name: 'Explore the search Workbench', exact: true }).click();
    await page.locator('[data-raveldex-input]').waitFor();
    assert.equal(new URL(page.url()).pathname, '/raveldex/demo/');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('consumer entry remains useful without JavaScript and reflows in narrow themes and RTL text', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
  try {
    const page = await context.newPage(); await page.goto(base);
    const chooser = page.getByRole('navigation', { name: 'Search solutions', exact: true });
    assert.equal(await chooser.getByRole('link').count(), 5);
    const frame = page.frameLocator('iframe[title="Inline search starter preview"]');
    await frame.getByRole('link', { name: 'Plan your first walking trip', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Get started', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/raveldex/guide/overview/');
  } finally { await context.close(); }
  const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
  try {
    await page.goto(base);
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.locator('.solution-chooser a').first().evaluate(node => { node.dir = 'rtl'; node.textContent = 'دليل البحث ' + 'Averylonginterfacename'.repeat(5); });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    await page.emulateMedia({ forcedColors: 'active' });
    const link = page.locator('.solution-chooser a').first(); await link.focus();
    assert.notEqual(await link.evaluate(node => getComputedStyle(node).outlineStyle), 'none');
  } finally { await page.close(); }
});

test('Workbench shows readable overviews and discloses exact original excerpts and scores in Inspector', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(new URL('demo/', base).href);
    const input = page.locator('[data-raveldex-input]');
    await input.fill('source provider'); await input.press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-pilot-search]')?.dataset.pilotState === 'ready'
      && document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') === 'false');
    const results = page.locator('[data-raveldex-result]');
    assert.ok(await results.count() > 0);
    for (const result of await results.all()) {
      const overview = result.locator('[data-pilot-overview]');
      assert.equal(await overview.count(), 1, 'Each result has an application-owned section overview');
      assert.ok(await overview.isVisible());
      assert.doesNotMatch(await overview.innerText(), /\[[^\]]+\]\(|```|`/);
      assert.ok(await result.locator('[data-raveldex-score]').isHidden());
      for (const raw of await result.locator('[data-raveldex-snippet]').all()) assert.ok(await raw.isHidden());
    }
    const ids = await results.evaluateAll(nodes => nodes.map(node => node.dataset.raveldexResult));
    if (process.env.RAVELDEX_DEMO_SCREENSHOTS) {
      await mkdir(process.env.RAVELDEX_DEMO_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: `${process.env.RAVELDEX_DEMO_SCREENSHOTS}/workbench-readable.png`, fullPage: true });
    }
    await page.locator('[data-raveldex-inspect]').click();
    const inspector = page.locator('[data-raveldex-inspector]');
    await page.waitForFunction(() => document.querySelector('[data-raveldex-inspector]')?.getAttribute('aria-busy') === 'false');
    assert.ok(await inspector.locator('[data-pilot-original-results]').isVisible());
    assert.ok(await inspector.locator('[data-pilot-original-results] h3').evaluate(node => {
      const box = node.getBoundingClientRect(), dialog = node.closest('dialog').getBoundingClientRect();
      return box.top >= dialog.top && box.bottom <= Math.min(dialog.bottom, innerHeight);
    }), 'Original matching excerpts are visible when Inspector opens, before its large raw report');
    assert.match(await inspector.locator('[data-pilot-original-results]').innerText(), /Score \d/);
    assert.ok(await inspector.locator('[data-pilot-original-results] mark').count() > 0);
    if (process.env.RAVELDEX_DEMO_SCREENSHOTS) await page.screenshot({ path: `${process.env.RAVELDEX_DEMO_SCREENSHOTS}/workbench-inspector.png` });
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('[data-raveldex-inspect]').evaluate(node => node === document.activeElement));
    assert.deepEqual(await results.evaluateAll(nodes => nodes.map(node => node.dataset.raveldexResult)), ids);
    await input.fill('unmatchedword'); await input.press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('[data-pilot-original-results] [data-pilot-original-excerpt]').count(), 0);
  } finally { await page.close(); }
});

test('demo overviews render hostile display text literally and do not duplicate across remount', async () => {
  const page = await browser.newPage();
  const literal = '<img src=x onerror="window.overviewInjection=1"> دَليل 🙂';
  try {
    await page.route('**/demo/corpus.json', async route => {
      const response = await route.fetch(), corpus = await response.json();
      for (const section of corpus.sections) section.overview = literal;
      await route.fulfill({ response, json: corpus });
    });
    await page.goto(new URL('demo/', base).href);
    await page.locator('[data-raveldex-input]').fill('source provider');
    await page.locator('[data-raveldex-input]').press('Enter');
    await page.locator('[data-pilot-overview]').first().waitFor();
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal(await page.locator('[data-pilot-overview]').first().textContent(), literal);
      assert.equal(await page.locator('[data-raveldex-result] img').count(), 0);
      assert.equal(await page.evaluate(() => window.overviewInjection), undefined);
      assert.equal(await page.locator('[data-pilot-overview]').count(), await page.locator('[data-raveldex-result]').count());
      await page.locator('.search-workbench__settings summary').click();
      await page.locator('[data-pilot-destroy]').click();
      assert.equal(await page.locator('[data-pilot-original-results]').count(), 0);
      await page.locator('[data-pilot-initialize]').click();
      await page.locator('[data-pilot-overview]').first().waitFor();
      await page.locator('.search-workbench__settings summary').click();
    }
  } finally { await page.close(); }
});

test('advanced controls preserve the query, reset category and page, and retain focus on the chosen setting', async () => {
  const page = await browser.newPage();
  const ready = () => page.waitForFunction(() => document.querySelector('[data-pilot-search]')?.dataset.pilotState === 'ready'
    && document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') === 'false');
  try {
    await page.goto(new URL('demo/', base).href); await ready();
    const input = page.locator('[data-raveldex-input]');
    await input.fill('source'); await input.press('Enter'); await ready();
    const category = page.locator('[data-raveldex-facet]');
    const value = await category.locator('option').evaluateAll(nodes => nodes.find(node => node.textContent.startsWith('Integrations (')).value);
    await category.selectOption(value); await ready();
    await page.locator('[data-raveldex-next]').click(); await ready();
    assert.match(await page.locator('[data-raveldex-page]').innerText(), /Page 2/);
    assert.ok(await page.locator('[data-pilot-representation]').isHidden());
    await page.locator('.search-workbench__settings summary').click();
    const setting = page.getByLabel('Find phrases using', { exact: true });
    await setting.focus(); await setting.selectOption('offsets'); await ready();
    assert.equal(await input.inputValue(), 'source'); assert.equal(await category.inputValue(), '');
    assert.match(await page.locator('[data-raveldex-page]').innerText(), /Page 1/);
    assert.ok(await setting.evaluate(node => node === document.activeElement));
    await page.getByRole('button', { name: 'Stop search', exact: true }).click();
    assert.equal(await page.locator('[data-raveldex-ui]').count(), 0);
    await page.getByRole('button', { name: 'Restart search', exact: true }).click(); await ready();
    assert.equal(await input.inputValue(), 'source'); assert.equal(await category.inputValue(), '');
    assert.equal(await page.locator('[data-pilot-overview]').count(), await page.locator('[data-raveldex-result]').count());
    assert.ok(await page.getByRole('button', { name: 'Restart search', exact: true }).evaluate(node => node === document.activeElement));
  } finally { await page.close(); }
});

test('every gallery exposes a project-specific install, content and styling path with exact downloads', async () => {
  const page = await browser.newPage();
  try {
    for (const family of ['inline', 'modal', 'dropdown', 'directory', 'cards']) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(new URL(`examples/${family}/`, base).href);
      for (const starter of STARTERS.filter(starter => starter.family === family)) {
        const project = page.locator(`[aria-labelledby="starter-${starter.id}"]`);
        assert.equal(await project.count(), 1);
        const steps = project.locator('ol[data-starter-steps]');
        assert.equal(await steps.count(), 1, 'A visitor can follow adoption without reconstructing scattered instructions');
        assert.equal(await steps.locator(':scope > li').count(), 4);
        assert.match(await steps.innerText(), /npm install @vmitsaras\/raveldex@1\.0\.0/);
        assert.match(await steps.innerText(), /content\.json/);
        assert.match(await steps.innerText(), starter.id.endsWith('-astro') ? /src\/style\.css/ : /theme\.css/);
        const archive = project.locator(`a[href="/raveldex/${starterArchive(starter.id)}"]`);
        assert.equal(await archive.count(), 1); assert.equal((await fetch(new URL(await archive.getAttribute('href'), base))).status, 200);
        for (const file of starter.files) assert.equal(await project.locator(`a[href="/raveldex/${starterSource(starter.id, file)}"]`).count(), 1);
      }
      await page.setViewportSize({ width: 320, height: 900 });
      for (const colorScheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${family}: outer gallery reflows`);
      }
      await page.locator('[id^="starter-"]').first().evaluate(node => { node.dir = 'rtl'; node.textContent = 'دليل ' + 'Longprojectname'.repeat(10); });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${family}: long RTL project label`);
      await page.emulateMedia({ forcedColors: 'active' });
      const download = page.getByRole('link', { name: 'Download the complete starter', exact: true }).first(); await download.focus();
      assert.notEqual(await download.evaluate(node => getComputedStyle(node).outlineStyle), 'none');
      await page.emulateMedia({ forcedColors: 'none' });
    }
  } finally { await page.close(); }
});
