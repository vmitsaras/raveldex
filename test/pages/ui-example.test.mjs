import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { prepareConsumer } from '../../scripts/lib/packed-consumer.mjs';
import { buildUsageCorpus } from '../../examples/docs-search/usage-corpus.mjs';

test('the documented minimal markup, JavaScript and CSS work from a fresh installed tarball', { timeout: 120_000 }, async () => {
  const consumer = await prepareConsumer(buildUsageCorpus(), []);
  const host = await readFile(join(consumer.installed, 'docs/api/HOSTS.md'), 'utf8');
  const markup = /```html\n([\s\S]*?)\n```/.exec(host)[1];
  const code = [...host.matchAll(/```js\n([\s\S]*?)\n```/g)].find(item => item[1].includes("from './ui.mjs'"))[1];
  await writeFile(join(consumer.directory, 'ui.mjs'), await readFile(join(consumer.installed, 'docs/api/examples/ui.mjs')));
  await build({ absWorkingDir: consumer.directory, stdin: { contents: code + '\nwindow.example = search;',
    resolveDir: consumer.directory, sourcefile: 'documented-example.mjs' }, outfile: join(consumer.directory, 'example.mjs'),
    bundle: true, platform: 'browser', format: 'esm', target: 'es2022' });
  const html = `<!doctype html><html lang="en"><head><title>Copied UI example</title><link rel="stylesheet" href="/example.css"></head><body>${markup}<script type="module" src="/example.mjs"></script></body></html>`;
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
    await page.getByRole('searchbox', { name: 'Search documentation', exact: true }).fill('atomic');
    await page.getByRole('searchbox').press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-raveldex-status]')?.textContent === '1 results. Showing 1–1.');
    assert.equal(await page.getByRole('link', { name: 'Atomic updates', exact: true }).count(), 1);
    assert.equal(await page.getByRole('searchbox').evaluate(node => node === document.activeElement), true);
    assert.equal(await page.locator('.raveldex-ui').evaluate(node => getComputedStyle(node).getPropertyValue('--raveldex-ui-color').trim()), '#17212b');
    await page.evaluate(async () => { await window.example.dispose(); });
    assert.equal(await page.locator('#search').innerHTML(), '');
    assert.equal(await page.evaluate(async () => { try { await window.example.engine.search('atomic'); } catch (error) { return error.code; } }), 'DISPOSED');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ copiedInstalledExample: 'Pass', private: consumer.package.private,
      packageSha256: consumer.package.sha256, total: 1, cssLoaded: true, cleanup: true }));
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(accept => server.close(accept));
  }
});
