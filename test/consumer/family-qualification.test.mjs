import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { release } from 'node:os';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright-core';
import { prepareConsumer, REPO_ROOT, digest } from '../../scripts/lib/packed-consumer.mjs';

const selected = process.env.RAVELDEX_FAMILY_BROWSER ?? 'chrome', surfaces = ['inline', 'modal', 'dropdown', 'directory', 'cards'];
const expectedShared = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const report = { kind: 'raveldex-installed-family-states-v1', observations: [], environment: { node: process.version, platform: process.platform, arch: process.arch, release: release(), selected },
  scope: 'Fresh physically installed public package. Body-only hand-derived equal-length/frequency corpus, real successful native results, deliberately injected search failure, held real native replies, scripted composition/keyboard/lifecycle. No snippets/sections configured here; their current dedicated suites remain separate. No human AT/physical input/actual zoom/Safari qualification.' };
let consumer, server, origin, browser;
const directory = surface => surface === 'directory' || surface === 'cards';
const shell = surface => directory(surface) ? '.raveldex-directory' : surface === 'dropdown' ? '.raveldex-dropdown' : '.raveldex-inline';
const resultAttribute = surface => `data-raveldex-${directory(surface) ? 'directory' : surface === 'dropdown' ? 'dropdown' : 'inline'}-result`;
const root = page => page.locator('#family-root');
const input = page => root(page).locator('input[type="search"], input[role="combobox"]');
const ids = (page, surface) => root(page).locator(`[${resultAttribute(surface)}]`).evaluateAll((nodes, attribute) => nodes.map(node => node.getAttribute(attribute)), resultAttribute(surface));
const record = (surface, name, details) => report.observations.push({ surface, name, status: 'Pass', details });
async function ready(page, surface, text, total) {
  await page.waitForFunction(({ selector, text, total, isDirectory }) => {
    const f = window.family, element = f.root.querySelector(selector), call = f.state.calls.at(-1);
    return element?.dataset.state === (isDirectory ? 'ready' : total ? 'results' : 'empty')
      && !f.root.querySelector('[aria-busy="true"]') && f.root.querySelector('input[type=search], input[role=combobox]')?.value === text
      && call?.complete && call.result?.total === total;
  }, { selector: shell(surface), text, total, isDirectory: directory(surface) });
}
async function query(page, surface, text, total) { await input(page).focus(); await page.evaluate(text => window.family.handle().search(text), text); await ready(page, surface, text, total); }
async function disabled(button) { return await button.getAttribute('aria-disabled') === 'true'; }
async function completePages(page, surface, expected, text) {
  if (directory(surface)) {
    for (let number = 1; number <= Math.ceil(expected.length / 2); number++) {
      await ready(page, surface, text, expected.length); assert.deepEqual(await ids(page, surface), expected.slice((number - 1) * 2, number * 2));
      const snapshot = await page.evaluate(() => window.family.snapshot()); assert.equal(snapshot.state.page, number); assert.equal(snapshot.result.total, expected.length);
      if (number < Math.ceil(expected.length / 2)) { await root(page).getByRole('button', { name: 'Next page', exact: true }).click(); await page.waitForFunction(number => window.family.snapshot().status === 'ready' && window.family.snapshot().state.page === number, number + 1); }
    }
    return;
  }
  let start = 0, count = 2;
  for (let guard = 0; guard < 10; guard++) {
    assert.deepEqual(await ids(page, surface), expected.slice(start, start + count));
    if (start + count >= expected.length) return;
    const more = root(page).getByRole('button', { name: 'Load more', exact: true });
    if (!await disabled(more)) { count = Math.min(4, count + 2, expected.length - start); await more.click(); }
    else { start += count; count = Math.min(2, expected.length - start); await root(page).getByRole('button', { name: 'Next results', exact: true }).click(); }
    await page.waitForFunction(({ start, count }) => {
      const nodes = [...document.querySelectorAll('[data-raveldex-inline-result]')];
      return document.querySelector('.raveldex-inline')?.dataset.state === 'results' && nodes.length === count && nodes[0]?.getAttribute('data-raveldex-inline-result') === ['a', 'b', 'c', 'd', 'e', 'f', 'g'][start];
    }, { start, count });
  }
  assert.fail('Every native result must remain reachable');
}
async function withSurface(surface, work) {
  const context = await browser.newContext(), page = await context.newPage(), errors = []; page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
  try { await page.goto(origin + `/${surface}/`); await page.waitForFunction(() => window.familyReady); await work(page); assert.deepEqual(errors, []); }
  finally {
    try {
      const cleanup = await page.evaluate(async () => { const f = window.family; if (!f) return null; await f.cleanup(); return { ownerDisposals: f.state.ownerDisposals, borrowedDisposals: f.state.borrowedDisposals, restored: f.restored() }; });
      if (cleanup) assert.deepEqual(cleanup, { ownerDisposals: 1, borrowedDisposals: 0, restored: true });
    } finally { await context.close(); }
  }
}
before(async () => {
  assert.ok(['chrome', 'chromium', 'webkit'].includes(selected)); consumer = await prepareConsumer([], []);
  await copyFile(join(REPO_ROOT, 'test/consumer/family-qualification-fixture.mjs'), join(consumer.directory, 'fixture-entry.mjs'));
  const built = await build({ absWorkingDir: consumer.directory, entryPoints: ['fixture-entry.mjs'], outfile: 'fixture.mjs', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', metafile: true, logLevel: 'silent' });
  report.inputs = Object.keys(built.metafile.inputs); assert.ok(report.inputs.every(path => path === 'fixture-entry.mjs' || path.startsWith('node_modules/@vmitsaras/raveldex/dist/')));
  assert.ok(report.inputs.every(path => !/\/adapters\/|\/integrations\/|\/addons\/(?:evidence|snippets|inspector)\//.test(path) && (!path.includes('/addons/sections/') || path.endsWith('/addons/sections/validation.js'))));
  report.package = consumer.package; report.consumer = { directory: consumer.directory, installed: consumer.installed };
  const sources = ['test/consumer/family-qualification-fixture.mjs', 'test/consumer/family-qualification.test.mjs', 'src/addons/ui/inline.ts', 'src/addons/ui/modal.ts', 'src/addons/ui/dropdown.ts', 'src/addons/ui/directory-controller.ts', 'src/addons/ui/directory-view-mount.ts', 'src/addons/ui/directory-cards.ts'];
  report.sourceSHA256 = Object.fromEntries(await Promise.all(sources.map(async path => [path, digest(await readFile(join(REPO_ROOT, path)))])));
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/fixture.mjs') { response.setHeader('content-type', 'text/javascript'); response.end(await readFile(join(consumer.directory, 'fixture.mjs'))); return; }
    const styles = ['inline.css', 'modal.css', 'dropdown.css', 'directory.css', 'directory-cards.css'];
    if (styles.some(name => path === '/' + name)) { response.setHeader('content-type', 'text/css'); response.end(await readFile(join(consumer.installed, 'dist/addons/ui', path.slice(1)))); return; }
    if (!['/full/', ...surfaces.map(surface => `/${surface}/`)].includes(path)) { response.writeHead(404).end(); return; }
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Search family qualification</title>${styles.map(name => `<link rel="stylesheet" href="/${name}">`).join('')}</head><body><main><h1>Search family</h1><p id="query-echo"></p><button id="family-trigger">Find documentation</button><section id="family-root" aria-label="Qualified search"><p>Original browse fallback</p></section></main><script type="module" src="/fixture.mjs"></script></body></html>`);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); origin = `http://127.0.0.1:${server.address().port}`;
  browser = selected === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ ...(selected === 'chrome' ? { channel: 'chrome' } : {}), headless: true }); report.environment.browser = browser.version();
}, { timeout: 120000 });
after(async () => { await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } if (process.env.RAVELDEX_FAMILY_REPORT) { const path = resolve(process.env.RAVELDEX_FAMILY_REPORT); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(report, null, 2) + '\n'); } });

for (const surface of surfaces) {
  test(`${surface}: independent prefix meaning, exact native totals and every result remain reachable`, async () => withSurface(surface, async page => {
    const cases = [['s', []], ['sh', expectedShared], ['shar al', []], ['shared al', ['a']], ['café', ['unicode']], ['cafe', []]];
    for (const [text, expected] of cases) { await query(page, surface, text, expected.length); assert.deepEqual(await ids(page, surface), expected.slice(0, 2)); }
    const text = ' sha '; await query(page, surface, text, 7); assert.deepEqual(await ids(page, surface), ['a', 'b']);
    if (surface === 'dropdown') {
      const href = await root(page).getByRole('link', { name: 'See all results', exact: true }).getAttribute('href'), target = new URL(href);
      assert.equal(target.searchParams.get('q'), text); assert.equal(target.searchParams.get('lang'), 'en'); assert.equal(target.hash, '#results');
      await Promise.all([page.waitForURL(href), root(page).getByRole('link', { name: 'See all results', exact: true }).click()]); await page.waitForFunction(() => window.familyReady);
      assert.equal(await page.locator('#query-echo').textContent(), text); await ready(page, 'inline', text, 7); await completePages(page, 'inline', expectedShared, text);
    } else await completePages(page, surface, expectedShared, text);
    record(surface, 'native query meaning and complete results', { prefixMinimumCodePoints: 2, earlierWordsRemainExact: true, accentSensitive: true, nativeTotal: 7, allIDs: expectedShared, display: surface === 'dropdown' ? 'Bounded two-link window, complete actual inline destination with raw query' : 'Complete native page/window sequence', snippetsAndSections: 'Not configured in this body-only fixture' });
  }));

  test(`${surface}: provisional composition, no-results and Clear preserve each surface contract`, async () => withSurface(surface, async page => {
    const before = await page.evaluate(() => window.family.state.calls.length); await input(page).focus();
    await input(page).evaluate(node => { node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); node.value = 'sha'; node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true })); node.form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true })); });
    await page.waitForTimeout(45); assert.equal(await page.evaluate(() => window.family.state.calls.length), before); assert.equal(await root(page).locator(shell(surface)).getAttribute('data-state'), 'composing');
    await input(page).evaluate(node => { node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); node.dispatchEvent(new InputEvent('input', { bubbles: true })); }); await ready(page, surface, 'sha', 7); await page.waitForTimeout(35); assert.equal(await page.evaluate(() => window.family.state.calls.length), before + 1); assert.ok(await input(page).evaluate(node => node === document.activeElement));
    if (directory(surface)) { await root(page).locator('summary').click(); const choice = root(page).getByRole('checkbox', { name: /^guide / }); await choice.focus(); await choice.press('Space'); await ready(page, surface, 'sha', 4); assert.deepEqual(await ids(page, surface), ['a', 'c']); }
    await input(page).fill('zzzzzz'); await input(page).press('Enter'); await ready(page, surface, 'zzzzzz', 0); assert.deepEqual(await ids(page, surface), []); assert.equal(await input(page).inputValue(), 'zzzzzz');
    const admitted = await page.evaluate(() => window.family.state.calls.length), clear = root(page).getByRole('button', { name: directory(surface) ? 'Clear all' : surface === 'dropdown' ? 'Clear' : 'Clear search', exact: true }); await clear.focus(); await clear.press('Enter');
    if (directory(surface)) { await ready(page, surface, '', 10); assert.deepEqual((await page.evaluate(() => window.family.snapshot())).state.filters.kind, []); }
    else await page.waitForFunction(selector => window.family.root.querySelector(selector)?.dataset.state === 'idle', shell(surface));
    await page.waitForTimeout(35); assert.equal(await page.evaluate(() => window.family.state.calls.length), admitted + (directory(surface) ? 1 : 0)); assert.ok(await clear.evaluate(node => node === document.activeElement)); assert.equal(await input(page).inputValue(), '');
    record(surface, 'composition empty and clear', { provisionalRequests: 0, committedRequests: 1, noResultsTotal: 0, clearBehavior: directory(surface) ? 'Remove text/selections and browse ten records' : 'Idle without another native query', clearKeyboardFocus: true, physicalIME: 'Not run; synthetic CompositionEvent/InputEvent' });
  }));

  test(`${surface}: injected refusal/Retry and genuine held replies cannot overwrite newer or destroyed views`, async () => withSurface(surface, async page => {
    await page.evaluate(() => { window.family.fail(); return window.family.handle().search('sha'); }); await page.waitForFunction(selector => window.family.root.querySelector(selector)?.dataset.state === 'error', shell(surface)); assert.deepEqual(await ids(page, surface), []);
    const retry = root(page).getByRole('button', { name: directory(surface) ? 'Refresh results' : 'Retry search', exact: true }); await retry.focus(); await retry.press('Enter'); await ready(page, surface, 'sha', 7); assert.deepEqual(await ids(page, surface), ['a', 'b']);
    await page.evaluate(() => { window.family.hold(); window.heldFamilySearch = window.family.handle().search('shared al'); }); await page.waitForFunction(() => window.family.state.pending.length === 1); await query(page, surface, 'quiet', 1); assert.deepEqual(await ids(page, surface), ['other']);
    await page.evaluate(async () => { window.family.release(); await window.heldFamilySearch; }); assert.deepEqual(await ids(page, surface), ['other']);
    await page.evaluate(() => { window.family.hold(); window.heldFamilySearch = window.family.handle().search('shared'); }); await page.waitForFunction(() => window.family.state.pending.length === 1);
    const result = await page.evaluate(async () => { const f = window.family, old = f.handle(); old.destroy(); const restored = f.restored(); f.release(); await window.heldFamilySearch; const admitted = f.state.calls.length; await old.search('quiet'); return { restored, noRevival: f.restored(), closedRequests: f.state.calls.length - admitted, borrowedDisposals: f.state.borrowedDisposals, ownerTotal: (await f.engine.search({ kind: 'all' })).total }; });
    assert.deepEqual(result, { restored: true, noRevival: true, closedRequests: 0, borrowedDisposals: 0, ownerTotal: 10 }); await page.evaluate(() => window.family.remount()); await query(page, surface, 'sha', 7);
    record(surface, 'failure freshness and borrowed lifecycle', { injectedRefusal: 'WORK_LIMIT_EXCEEDED thrown before native execution; not a measured native budget refusal', retryTotal: 7, heldReplies: 'Real native results deliberately delayed after completion and ignoring abort', newestIDs: ['other'], ...result, remountTotal: 7 });
  }));

  test(`${surface}: revised collection cannot mix old page state with new native results`, async () => withSurface(surface, async page => {
    await query(page, surface, 'shared', 7); const firstRevision = await page.evaluate(() => window.family.state.calls.at(-1).result.revision); await page.evaluate(() => window.family.mutate());
    if (surface === 'dropdown') await query(page, surface, 'shared', 8);
    else {
      await root(page).getByRole('button', { name: directory(surface) ? 'Next page' : 'Load more', exact: true }).click();
      await page.waitForFunction(({ selector, expected }) => window.family.root.querySelector(selector)?.dataset.state === expected, { selector: shell(surface), expected: directory(surface) ? 'stale' : 'error' }); assert.deepEqual(await ids(page, surface), []);
      await root(page).getByRole('button', { name: directory(surface) ? 'Refresh results' : 'Retry search', exact: true }).click(); await ready(page, surface, 'shared', 8);
    }
    assert.deepEqual(await ids(page, surface), ['a', 'b']); const current = await page.evaluate(() => window.family.state.calls.at(-1).result); assert.ok(current.revision > firstRevision); assert.equal(current.total, 8); if (directory(surface)) assert.equal((await page.evaluate(() => window.family.snapshot())).state.page, 1);
    record(surface, 'native revision boundary', { firstRevision, currentRevision: current.revision, totalBefore: 7, totalAfter: 8, behavior: surface === 'dropdown' ? 'Explicit new bounded query adopts current revision' : 'Mixed page refused, visible first-page Retry adopts revision', currentIDs: ['a', 'b'] });
  }));
}
