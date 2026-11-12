import assert from 'node:assert/strict';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile, copyFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { build } from 'esbuild';
import { prepareConsumer, REPO_ROOT, digest } from '../../scripts/lib/packed-consumer.mjs';
let consumer, server, browser, origin, page, errors;
const selected = process.env.RAVELDEX_DIRECTORY_FOCUS_BROWSER ?? process.env.RAVELDEX_UI_BROWSER ?? 'chrome';
const report = { kind: 'raveldex-installed-directory-focus-v1', environment: { selected, node: process.version, platform: process.platform, arch: process.arch }, observations: [] };
const ready = (text = '', number = 1) => page.waitForFunction(({ text, number }) => { const state = window.directoryFocus.controller.getSnapshot(); return state.status === 'ready' && state.state.text === text && state.state.page === number; }, { text, number });
const active = locator => locator.evaluate(element => element === document.activeElement);
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const calls = () => page.evaluate(() => window.directoryFocus.calls.length);
before(async () => {
  assert.ok(['chrome', 'chromium', 'webkit'].includes(selected)); consumer = await prepareConsumer([], []);
  await copyFile(join(REPO_ROOT, 'test/ui/directory-focus-fixture.mjs'), join(consumer.directory, 'directory-focus-fixture.mjs'));
  await build({ absWorkingDir: consumer.directory, entryPoints: ['directory-focus-fixture.mjs'], outfile: 'focus.mjs', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent' });
  report.package = consumer.package;
  report.sourceSHA256 = Object.fromEntries(await Promise.all(['src/addons/ui/directory-view-mount.ts', 'src/addons/ui/directory-cards-options.ts', 'test/ui/directory-focus.test.mjs', 'test/ui/directory-focus-fixture.mjs'].map(async path => [path, digest(await readFile(join(REPO_ROOT, path)))])));
  server = createServer(async (request, response) => {
    if (new URL(request.url, 'http://localhost').pathname === '/focus.mjs') { response.setHeader('content-type', 'text/javascript'); response.end(await readFile(join(consumer.directory, 'focus.mjs'))); }
    else response.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Directory focus</title><main><h1>Resources</h1><section id="directory"><p>Authored resources</p></section></main><script type="module" src="/focus.mjs"></script></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = selected === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ ...(selected === 'chrome' ? { channel: 'chrome' } : {}), headless: true }); report.environment.browser = browser.version();
}, { timeout: 120000 });
beforeEach(async () => { page = await browser.newPage(); errors = []; page.on('pageerror', reason => errors.push(reason.message)); page.setDefaultTimeout(10000); });
afterEach(async () => { try { await page.evaluate(() => window.directoryFocus?.cleanup()); assert.deepEqual(errors, []); } finally { await page.close(); } });
after(async () => {
  await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (process.env.RAVELDEX_DIRECTORY_FOCUS_REPORT) { const path = resolve(process.env.RAVELDEX_DIRECTORY_FOCUS_REPORT); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(report, null, 2) + '\n'); }
});
for (const surface of ['base', 'cards']) {
  const load = async () => { await page.goto(origin + '/?surface=' + surface); await page.waitForFunction(() => window.directoryFocusReady); await ready(); };
  test(surface + ': focused Next remains visible and guarded through genuine held native loading', async () => {
    await load(); const next = page.getByRole('button', { name: 'Next page', exact: true }); await next.focus();
    await page.evaluate(() => window.directoryFocus.hold()); await next.press('Enter'); await page.waitForFunction(() => window.directoryHeld); await frames();
    assert.equal(await next.isVisible(), true); assert.equal(await active(next), true); assert.equal(await next.getAttribute('aria-disabled'), 'true');
    assert.equal(await page.locator('[data-raveldex-directory-results-region]').getAttribute('aria-busy'), 'true'); assert.equal(await page.locator('[data-raveldex-directory-page]').innerText(), '');
    const count = await calls(); await next.press('Enter'); assert.equal(await calls(), count);
    await page.evaluate(() => window.directoryFocus.release()); await ready('', 2); await frames(); assert.equal(await active(next), true);
    assert.equal(await next.getAttribute('aria-disabled'), 'true'); assert.deepEqual(await page.locator('[data-raveldex-directory-result]').evaluateAll(nodes => nodes.map(node => node.dataset.raveldexDirectoryResult)), ['c', 'd']);
    report.observations.push({ surface, name: 'held page focus and guarded activation', status: 'Pass' });
  });
  test(surface + ': focused Retry survives held recovery and zero results without issuing duplicate queries', async () => {
    await load(); await page.evaluate(async () => { window.directoryFocus.fail(); await window.directoryFocus.view.search('absent'); });
    const retry = page.getByRole('button', { name: 'Refresh results', exact: true }); await retry.focus();
    await page.evaluate(() => window.directoryFocus.hold()); await retry.press('Enter'); await page.waitForFunction(() => window.directoryHeld); await frames();
    assert.equal(await retry.isVisible(), true); assert.equal(await active(retry), true); assert.equal(await retry.getAttribute('aria-disabled'), 'true');
    const count = await calls(); await retry.press('Enter'); assert.equal(await calls(), count);
    await page.evaluate(() => window.directoryFocus.release()); await ready('absent'); await frames();
    assert.equal(await active(retry), true); assert.equal(await retry.isVisible(), true); assert.equal(await retry.getAttribute('aria-disabled'), 'true'); assert.equal(await page.locator('[data-raveldex-directory-result]').count(), 0);
    await retry.press('Enter'); assert.equal(await calls(), count); assert.ok((await page.locator('[data-raveldex-directory-status]').innerText()).includes('No results'));
    report.observations.push({ surface, name: 'held Retry zero-result focus and guarded activation', status: 'Pass' });
  });
  test(surface + ': settled empty recovery retires unused actions after native focus leaves', async () => {
    await load();
    await page.evaluate(async () => { window.directoryFocus.fail(); await window.directoryFocus.view.search('absent'); });
    const retry = page.locator('[data-raveldex-directory-retry]'); await retry.focus(); await retry.press('Enter'); await ready('absent'); await frames();
    assert.equal(await active(retry), true); assert.equal(await retry.getAttribute('aria-disabled'), 'true');
    const input = page.locator('[data-raveldex-directory-input]'); await input.focus(); await frames();
    assert.equal(await retry.isVisible(), false);
    assert.equal(await page.locator('[data-raveldex-directory-navigation]').isVisible(), false);
    assert.equal(await page.locator('[data-raveldex-directory-heading]').isVisible(), false);
    assert.match(await page.locator('[data-raveldex-directory-status]').textContent(), /No results/);
    report.observations.push({surface,name:'empty recovery controls retired after blur',status:'Pass'});
  });

  test(surface + ': page refusal retains its focused unavailable control and explicit Retry recovers', async () => {
    await load(); const next = page.getByRole('button', { name: 'Next page', exact: true }); await next.focus(); await page.evaluate(() => window.directoryFocus.fail()); await next.press('Enter');
    await page.getByText('Search could not complete. Refresh results or change your search and filters.', { exact: true }).waitFor(); await frames();
    assert.equal(await active(next), true); assert.equal(await next.isVisible(), true); assert.equal(await next.getAttribute('aria-disabled'), 'true'); assert.equal(await page.locator('[data-raveldex-directory-page]').innerText(), '');
    const count = await calls(); await next.press('Enter'); assert.equal(await calls(), count);
    const retry = page.getByRole('button', { name: 'Refresh results', exact: true }); await retry.focus(); await retry.press('Enter'); await ready(); await frames(); assert.equal(await active(retry), true); assert.equal(await retry.getAttribute('aria-disabled'), 'true');
    report.observations.push({ surface, name: 'page refusal focus and explicit recovery', status: 'Pass' });
  });
}


test('cards: late admission controller destruction refuses before replacing authored Nodes', async () => {
  await page.goto(origin + '/?surface=cards'); await page.waitForFunction(() => window.directoryFocusReady); await ready();
  const result = await page.evaluate(async () => {
    const f = window.directoryFocus, root = document.createElement('section'), original = document.createElement('p');
    original.textContent = 'Authored fallback'; root.append(original); document.body.append(root);
    const controller = f.createDirectory({ engine: f.engine }); let handle, error;
    try {
      handle = f.mountRaveldexDirectoryCards({ root, controller, documents: f.documents, groups: [],
        presentation: new Proxy({ images: false }, { ownKeys(target) { controller.destroy(); return Reflect.ownKeys(target); } }),
      });
    } catch (reason) { error = reason.code; }
    const captured = { error: error ?? null, controller: controller.getSnapshot().status, authoredPreserved: root.firstChild === original,
      mounted: !!root.querySelector('.raveldex-directory'), borrowedTotal: (await f.engine.search({ kind: 'all' })).total };
    handle?.destroy(); controller.destroy(); root.remove(); return captured;
  });
  assert.deepEqual(result, { error: 'INVALID_OPTIONS', controller: 'destroyed', authoredPreserved: true, mounted: false, borrowedTotal: 4 });
  report.observations.push({ surface: 'cards', name: 'late captured controller destruction preserves authored Nodes', status: 'Pass', details: result });
});
