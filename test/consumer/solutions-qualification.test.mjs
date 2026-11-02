import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'node:http';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { platform, release, arch } from 'node:os';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { prepareConsumer, REPO_ROOT, digest } from '../../scripts/lib/packed-consumer.mjs';

let consumer, browser, server, origin;
const report = { kind: 'raveldex-first-wave-states-v1', environment: {
  node: process.version, platform: platform(), release: release(), arch: arch(),
}, observations: [], scope: 'Fresh installed native package; scripted keyboard and synthetic composition. No human AT or physical IME observation.' };

before(async () => {
  consumer = await prepareConsumer([], []);
  for (const file of ['inline-fixture-entry.mjs', 'modal-fixture.mjs', 'modal-configuration.mjs', 'modal-worker.mjs'])
    await copyFile(join(REPO_ROOT, 'test/ui', file), join(consumer.directory, file));
  for (const file of ['corpus.json', 'projection.json'])
    await copyFile(join(REPO_ROOT, 'test/fixtures/page-sections', file), join(consumer.directory, file));
  for (const [entry, output] of [['inline-fixture-entry.mjs', 'inline.mjs'], ['modal-fixture.mjs', 'modal.mjs']]) {
    const bundled = await build({ absWorkingDir: consumer.directory, entryPoints: [entry], outfile: output,
      bundle: true, platform: 'browser', format: 'esm', target: 'es2022', metafile: true, logLevel: 'silent' });
    for (const input of Object.keys(bundled.metafile.inputs))
      assert.ok(input.startsWith('node_modules/@vmitsaras/raveldex/dist/')
        || ['inline-fixture-entry.mjs', 'modal-fixture.mjs', 'modal-configuration.mjs', 'corpus.json', 'projection.json'].includes(input), input);
  }
  for (const file of ['inline.css', 'modal.css'])
    await copyFile(join(consumer.installed, 'dist/addons/ui', file), join(consumer.directory, file));
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/inline/' || path === '/modal/') {
      const surface = path.slice(1, -1);
      const markup = surface === 'inline'
        ? '<div id="inline-root"><p>Browse the guides</p></div>'
        : '<button id="modal-trigger">Find documentation</button><div id="modal-root"><p>Browse the guides</p></div>';
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>First-wave states</title><link rel="stylesheet" href="/${surface}.css"></head><body><main><h1>First-wave search</h1>${markup}</main><script type="module" src="/${surface}.mjs"></script></body></html>`);
      return;
    }
    const file = { '/inline.mjs': 'inline.mjs', '/modal.mjs': 'modal.mjs', '/inline.css': 'inline.css', '/modal.css': 'modal.css' }[path];
    if (!file) { response.writeHead(404).end(); return; }
    response.setHeader('content-type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
    response.end(await readFile(join(consumer.directory, file)));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(process.env.RAVELDEX_UI_BROWSER === 'chromium' ? {} : { channel: 'chrome' }), headless: true });
  report.environment.browser = browser.version(); report.package = consumer.package;
  report.fixtureSHA256 = Object.fromEntries(await Promise.all(['inline-fixture-entry.mjs', 'modal-fixture.mjs', 'modal-configuration.mjs', 'corpus.json', 'projection.json']
    .map(async file => [file, digest(await readFile(join(consumer.directory, file)))])));
}, { timeout: 120_000 });

after(async () => {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (process.env.RAVELDEX_SOLUTIONS_QUALIFICATION_REPORT)
    await writeFile(process.env.RAVELDEX_SOLUTIONS_QUALIFICATION_REPORT, JSON.stringify(report, null, 2) + '\n');
});

for (const surface of ['inline', 'modal']) test(`${surface}: committed composition, no-results and clear retain native state and editing focus`, async () => {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin + `/${surface}/`);
    await page.waitForFunction(surface => typeof window[surface === 'inline' ? 'createInlineFixture' : 'createModalFixture'] === 'function', surface);
    await page.evaluate(async surface => {
      if (surface === 'inline') await window.createInlineFixture({ debounceMs: 30 });
      else { await window.createModalFixture({ debounceMs: 30 }, { feature: 'core' }); window.modalHarness.handle.open(); }
    }, surface);
    const root = page.locator(`#${surface}-root`), input = root.getByRole('searchbox'), status = root.locator('.raveldex-inline__status');
    const calls = () => page.evaluate(surface => surface === 'inline' ? window.inlineHarness.calls() : window.modalHarness.state.calls, surface);
    const ids = () => root.locator('[data-raveldex-inline-result]').evaluateAll(nodes => nodes.map(node => node.dataset.raveldexInlineResult));
    assert.equal(await status.innerText(), 'Enter a search term.'); assert.equal((await calls()).length, 0);
    const query = surface === 'inline' ? 'source prov' : 'alpha', total = surface === 'inline' ? 3 : 4;
    await input.focus();
    await input.evaluate((node, query) => {
      node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); node.value = query;
      node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText' }));
      node.form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    }, query);
    await page.waitForTimeout(80);
    assert.equal((await calls()).length, 0); assert.equal(await status.innerText(), 'Finish composing to search.');
    assert.equal(await root.locator('.raveldex-inline').getAttribute('data-state'), 'composing');
    await input.evaluate(node => {
      node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    });
    await page.waitForFunction(rootID => document.querySelector(`#${rootID} .raveldex-inline`)?.dataset.state === 'results'
      && !document.querySelector(`#${rootID} [aria-busy="true"]`), `${surface}-root`);
    const committed = await calls(); assert.equal(committed.length, 1); assert.equal(committed[0].result.total, total);
    assert.deepEqual(await ids(), surface === 'inline' ? ['alpha', 'beta', 'gamma'] : ['page:a', 'page:b']);
    assert.equal(await input.evaluate(node => node === document.activeElement), true);
    await input.fill('zzzzzz'); await input.press('Enter');
    await page.waitForFunction(rootID => document.querySelector(`#${rootID} .raveldex-inline`)?.dataset.state === 'empty'
      && !document.querySelector(`#${rootID} [aria-busy="true"]`), `${surface}-root`);
    assert.equal(await status.innerText(), 'No results.'); assert.equal(await input.inputValue(), 'zzzzzz');
    assert.deepEqual(await ids(), []); assert.equal((await calls()).at(-1).result.total, 0);
    assert.equal(await input.evaluate(node => node === document.activeElement), true);
    await root.getByRole('button', { name: 'Clear', exact: true }).click();
    assert.equal(await status.innerText(), 'Enter a search term.'); assert.equal(await input.inputValue(), '');
    const clear = root.getByRole('button', { name: 'Clear', exact: true });
    assert.equal(await clear.evaluate(node => node === document.activeElement), true);
    const clearedCalls = (await calls()).length; await page.waitForTimeout(80); assert.equal((await calls()).length, clearedCalls);
    assert.deepEqual(errors, []);
    report.observations.push({ surface, status: 'Pass', composingRequests: 0, committedRequests: 1,
      nativeTotal: total, noResultsTotal: 0, clearRequests: 0, inputFocusRetained: true, clearFocusRetained: true,
      physicalIME: 'Not run; CompositionEvent/InputEvent are synthetic.' });
  } finally {
    await page.evaluate(async surface => {
      if (surface === 'inline') await window.inlineHarness?.cleanup(); else await window.cleanupModalFixtures?.();
    }, surface);
    await page.close();
  }
});
