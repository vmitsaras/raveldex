import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { prepareConsumer } from '../../scripts/lib/packed-consumer.mjs';
import { validateCandidateManifest } from '../../scripts/candidate-check.mjs';
import { buildUsageCorpus } from '../../examples/docs-search/usage-corpus.mjs';

test('the static documentation recipe disposes its published owner when display loading or mounting fails', async () => {
  const source = await readFile(new URL('../../docs/api/STATIC_ASTRO.md', import.meta.url), 'utf8');
  const entry = [...source.matchAll(/```js\n([\s\S]*?)\n```/g)].find(match => match[1].includes('const loaded = await loadStaticSearch'))[1];
  // Execute the copied recipe with explicit dependency doubles at its loader/
  // mount boundary. This checks documented ownership, not static transport.
  const body = entry.replace(/^import .+;\n/gm, '') + '\nreturn ui;';
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction('loadStaticSearch', 'mountRaveldexInline', 'configuration', 'document', 'HTMLElement', 'location', body);
  class Element {}
  for (const stage of ['documents', 'mount']) {
    const calls = [], failure = new Error(stage);
    const loaded = {
      engine: {},
      async loadDocuments() { calls.push('documents'); if (stage === 'documents') throw failure; return []; },
      async dispose() { calls.push('dispose'); },
    };
    const mount = () => { calls.push('mount'); throw failure; };
    await assert.rejects(run(async () => loaded, mount, {}, { querySelector: () => new Element() }, Element,
      { origin: 'https://example.test' }), error => error === failure);
    assert.deepEqual(calls, stage === 'documents' ? ['documents', 'dispose'] : ['documents', 'mount', 'dispose']);
  }
});

test('the documented consumer markup, prefix search, CSS and owned cleanup work from a fresh installed tarball', { timeout: 120_000 }, async () => {
  const consumer = await prepareConsumer(buildUsageCorpus(), []);
  const host = await readFile(join(consumer.installed, 'docs/api/HOSTS.md'), 'utf8');
  const markup = /<!-- consumer-example: markup -->\n```html\n([\s\S]*?)\n```/.exec(host)[1];
  const code = /<!-- consumer-example: entry -->\n```js\n([\s\S]*?)\n```/.exec(host)[1];
  const theme = /<!-- consumer-example: theme -->\n```css\n([\s\S]*?)\n```/.exec(host)[1];
  const metadata = JSON.parse(await readFile(join(consumer.installed, 'package.json'), 'utf8'));
  validateCandidateManifest(metadata, consumer.packed.files);
  assert.ok(consumer.packed.files.some(file => file.path === 'docs/api/PAGEFIND_MIGRATION.md'));
  await writeFile(join(consumer.directory, 'inline.mjs'), await readFile(join(consumer.installed, 'docs/api/examples/inline.mjs')));
  await build({ absWorkingDir: consumer.directory, stdin: { contents: code + '\nwindow.example = search;',
    resolveDir: consumer.directory, sourcefile: 'documented-example.mjs' }, outfile: join(consumer.directory, 'example.mjs'),
    bundle: true, platform: 'browser', format: 'esm', target: 'es2022' });
  const html = `<!doctype html><html lang="en"><head><title>Copied consumer example</title><link rel="stylesheet" href="/example.css"><style>${theme}</style></head><body>${markup}<script type="module" src="/example.mjs"></script></body></html>`;
  let browser;
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/') { response.writeHead(200, { 'content-type': 'text/html' }); response.end(html); }
    else if (['/example.mjs', '/example.css'].includes(path)) {
      response.writeHead(200, { 'content-type': path.endsWith('.css') ? 'text/css' : 'text/javascript' });
      response.end(await readFile(join(consumer.directory, path.slice(1))));
    } else { response.writeHead(404); response.end(); }
  });
  try {
    await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
    browser = await chromium.launch({ ...(process.env.RAVELDEX_CANDIDATE_BROWSER === 'chromium' ? {} : { channel: 'chrome' }), headless: true });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => Boolean(window.example));
    assert.equal(await page.locator('.raveldex-inline').getAttribute('data-state'), 'idle');
    assert.equal(await page.locator('.raveldex-ui').count(), 0, 'consumer route does not mount the Workbench');
    assert.equal(await page.getByRole('button', { name: 'Inspect results' }).count(), 0);
    await page.getByRole('searchbox', { name: 'Search documentation', exact: true }).fill('atom');
    await page.getByRole('searchbox').press('Enter');
    await page.waitForFunction(() => document.querySelector('.raveldex-inline__status')?.textContent === '1 result. Showing 1.');
    assert.equal(await page.getByRole('link', { name: 'Atomic updates', exact: true }).count(), 1);
    assert.ok((await page.getByRole('link', { name: 'Atomic updates', exact: true }).getAttribute('href')).endsWith('/guide/updates/'));
    assert.equal(await page.getByRole('searchbox').evaluate(node => node === document.activeElement), true);
    assert.equal(await page.locator('.raveldex-inline').evaluate(node => getComputedStyle(node).color), 'rgb(23, 33, 43)');
    assert.equal(await page.locator('.raveldex-inline').evaluate(node => getComputedStyle(node).getPropertyValue('--raveldex-inline-accent').trim()), '#145b45');
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    assert.equal(await page.locator('.raveldex-inline').getAttribute('data-state'), 'idle');
    assert.equal(await page.getByRole('link', { name: 'Atomic updates', exact: true }).count(), 0);
    await page.evaluate(async () => { await window.example.dispose(); });
    assert.equal(await page.locator('#search').innerHTML(), '');
    assert.equal(await page.evaluate(async () => { try { await window.example.engine.search('atomic'); } catch (error) { return error.code; } }), 'DISPOSED');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ copiedInstalledExample: 'Pass', directory: consumer.directory, installed: consumer.installed,
      browser: browser.version(), private: consumer.package.private, packageSha256: consumer.package.sha256,
      total: 1, prefixQuery: 'atom', idleAndClear: true, cssLoaded: true, scopedOverride: true, workbenchMounted: false, cleanup: true }));
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(accept => server.close(accept));
  }
});
