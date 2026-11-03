import assert from 'node:assert/strict';
import { test, before, beforeEach, afterEach, after } from 'node:test';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright-core';
import { prepareConsumer } from '../../scripts/lib/packed-consumer.mjs';

let consumer, browser, server, origin, context, page;
const report = { kind: 'raveldex-inline-shadow-focus-v1', observations: [],
  scope: 'Installed native engine, programmatic update/Clear and retained-result append failure in owned open/closed shadow ancestry. Automated focus evidence; human AT speech and physical input not run.' };
async function save() {
  if (!process.env.RAVELDEX_SHADOW_FOCUS_REPORT) return;
  const path = resolve(process.env.RAVELDEX_SHADOW_FOCUS_REPORT); await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2) + '\n');
}
before(async () => {
  consumer = await prepareConsumer([], []);
  await writeFile(join(consumer.directory, 'shadow-fixture.mjs'), `
import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';
import { mountRaveldexModal } from '@vmitsaras/raveldex/addons/ui/modal';
window.start = async (surface, ancestry) => {
  const owner = createRaveldex({ schema: { text: { body: {} } } });
  await owner.addMany(['a', 'b', 'c'].map(id => ({ id, text: { body: 'alpha' } })).concat([{ id: 'd', text: { body: 'beta' } }]));
  let fail = false;
  const borrowed = { ...owner, async search(...args) { if (fail) { fail = false; throw new RaveldexError('WORK_LIMIT_EXCEEDED'); } return owner.search(...args); } };
  const host = document.createElement('div'); document.querySelector('main').append(host);
  const outer = host.attachShadow({ mode: ancestry === 'open' ? 'open' : 'closed' });
  let tree = outer;
  if (ancestry === 'nested') { const inner = document.createElement('div'); outer.append(inner); tree = inner.attachShadow({ mode: 'closed' }); }
  const root = document.createElement('div'), authored = document.createElement('p'); authored.textContent = 'Authored fallback'; root.append(authored); tree.append(root);
  const trigger = document.querySelector('#trigger');
  const options = { root, engine: borrowed, documents: ['a', 'b', 'c', 'd'].map(id => ({ id, title: 'Document ' + id, url: '/' + id + '/' })), pageSize: 1, maxRenderedResults: 2, debounceMs: 0 };
  const handle = surface === 'modal' ? mountRaveldexModal({ ...options, trigger }) : mountRaveldexInline(options);
  if (surface === 'modal') handle.open();
  window.shadowHarness = { root, tree, handle, owner, fail() { fail = true; },
    focused() { return tree.activeElement === root.querySelector('input'); },
    focusResult() { root.querySelector('.raveldex-inline__result-title').focus(); return tree.activeElement === root.querySelector('.raveldex-inline__result-title'); },
    async cleanup() { handle.destroy(); const restored = root.childNodes.length === 1 && root.firstChild === authored; await owner.dispose(); host.remove(); return restored; } };
};
`);
  await build({ absWorkingDir: consumer.directory, entryPoints: ['shadow-fixture.mjs'], outfile: join(consumer.directory, 'fixture.mjs'), bundle: true, platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent' });
  await copyFile(join(consumer.installed, 'dist/addons/ui/inline.css'), join(consumer.directory, 'inline.css'));
  await copyFile(join(consumer.installed, 'dist/addons/ui/modal.css'), join(consumer.directory, 'modal.css'));
  await writeFile(join(consumer.directory, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shadow focus regression</title><main><h1>Search focus</h1><button id="trigger">Open search</button></main><script type="module" src="/fixture.mjs"></script></html>');
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname, file = { '/': 'index.html', '/fixture.mjs': 'fixture.mjs', '/inline.css': 'inline.css', '/modal.css': 'modal.css' }[pathname];
    if (!file) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); response.end(await readFile(join(consumer.directory, file)));
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); }); origin = `http://127.0.0.1:${server.address().port}`;
  const channel = process.env.RAVELDEX_UI_BROWSER ?? 'chrome';
  browser = await (channel === 'webkit' ? webkit : chromium).launch({ ...(channel === 'chrome' ? { channel } : {}), headless: true });
  report.environment = { node: process.version, browserSelection: channel, browser: browser.version() }; report.package = consumer.package;
}, { timeout: 120000 });
beforeEach(async () => { context = await browser.newContext(); page = await context.newPage(); await page.goto(origin); await page.waitForFunction(() => typeof window.start === 'function'); });
afterEach(async () => { try { assert.equal(await page.evaluate(() => window.shadowHarness?.cleanup()), true); } finally { await context?.close(); await save(); } });
after(async () => { await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); } await save(); });

for (const surface of ['inline', 'modal']) for (const ancestry of ['open', 'closed', 'nested']) test(`${surface}: ${ancestry} shadow ancestry recovers focused results before replacement, Clear and failed append`, async () => {
  await page.evaluate(args => window.start(...args), [surface, ancestry]);
  await page.evaluate(async () => { const h = window.shadowHarness; await h.handle.search('alpha'); });
  assert.equal(await page.evaluate(() => window.shadowHarness.focusResult()), true);
  await page.evaluate(async () => window.shadowHarness.handle.search('beta'));
  assert.equal(await page.evaluate(() => window.shadowHarness.focused()), true, 'Replacing a focused result must recover to the input inside its own shadow root.');
  assert.equal(await page.evaluate(() => window.shadowHarness.focusResult()), true);
  await page.evaluate(() => window.shadowHarness.handle.clear());
  assert.equal(await page.evaluate(() => window.shadowHarness.focused()), true, 'Clear must recover focused result content before removing it.');
  await page.evaluate(async () => window.shadowHarness.handle.search('alpha'));
  assert.equal(await page.evaluate(() => window.shadowHarness.focusResult()), true);
  await page.evaluate(() => { const h = window.shadowHarness; h.fail(); h.root.querySelector('.raveldex-inline__load-more').click(); });
  await page.waitForFunction(() => { const shell = window.shadowHarness.root.querySelector('.raveldex-inline'); return shell.dataset.state === 'error' && shell.getAttribute('aria-busy') === 'false'; });
  assert.equal(await page.evaluate(() => window.shadowHarness.focused()), true, 'Failure of an append must recover before clearing retained focused results.');
  assert.equal(await page.evaluate(() => window.shadowHarness.root.querySelectorAll('.raveldex-inline__result').length), 0);
  report.observations.push({ surface, ancestry, status: 'Pass', replacement: 'input focused', clear: 'input focused', failedAppend: 'input focused', originalNodes: 'checked in cleanup' });
});
