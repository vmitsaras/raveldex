import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { STARTERS, starterSource, starterArchive } from '../../site/starters.mjs';
import { command, digest, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

test('modal gallery exposes exact complete starters and a first-open installed preview with real heading links', { timeout: 60_000 }, async () => {
  const server = spawn(process.execPath, ['scripts/preview-pages.mjs', '--port', '0'], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(server, 'exit');
  let log = '', browser;
  server.stdout.on('data', bytes => { log += bytes; });
  server.stderr.on('data', bytes => { log += bytes; });
  const observations = [], errors = [], requests = [];
  try {
    const deadline = Date.now() + 20_000;
    while (!/Open http:\/\/127\.0\.0\.1:\d+\/raveldex\//.test(log)) {
      assert.equal(server.exitCode, null, log);
      assert.ok(Date.now() < deadline, log);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const url = /Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.exec(log)[1];
    browser = await chromium.launch({ ...(process.env.RAVELDEX_CANDIDATE_BROWSER === 'chromium' ? {} : { channel: 'chrome' }), headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', error => errors.push(String(error)));
    page.on('request', request => { if (request.url().endsWith('/content.json')) requests.push(request.url()); });
    await page.goto(new URL('examples/modal/', url).href);
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Documentation search modal starters');
    const frame = page.frameLocator('iframe[title="Documentation modal starter preview"]');
    const trigger = frame.getByRole('button', { name: 'Search documentation', exact: true });
    await trigger.waitFor();
    assert.equal(await frame.locator('dialog[open]').count(), 0);
    assert.deepEqual(requests, [], 'No data request before first open');
    await trigger.click();
    const input = frame.getByRole('searchbox', { name: 'Search the workshop guide', exact: true });
    await input.fill('bobbin'); await input.press('Enter');
    const link = frame.getByRole('link', { name: 'Thread the machine', exact: true });
    await link.waitFor();
    const destination = new URL(await link.getAttribute('href'), url);
    assert.equal(destination.pathname, '/raveldex/examples/modal-preview/guide/sewing/');
    assert.equal(destination.hash, '#threading-100%25');
    assert.equal(await frame.locator('[data-raveldex-inline-result]').count(), 1);
    assert.equal((await fetch(destination)).status, 200);
    await frame.getByRole('button', { name: 'Close search', exact: true }).click();
    await trigger.click();
    assert.equal(await input.inputValue(), 'bobbin');
    await link.waitFor();
    if (process.env.RAVELDEX_MODAL_STARTER_SCREENSHOTS) {
      await mkdir(process.env.RAVELDEX_MODAL_STARTER_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: join(process.env.RAVELDEX_MODAL_STARTER_SCREENSHOTS, 'gallery-modal-desktop.png'), fullPage: true });
    }
    // Full-page capture restores the outer page scroll independently of its
    // modal iframe. Bring the actual interaction viewport back into view.
    await page.locator('iframe[title="Documentation modal starter preview"]').scrollIntoViewIfNeeded();
    await link.click();
    await frame.getByRole('heading', { name: 'Thread the machine', exact: true }).waitFor();
    assert.equal(await frame.locator('html').evaluate(() => location.href), destination.href, 'Native iframe link follows the actual generated page');
    assert.equal(await frame.locator('[id="threading-100%"]:target').count(), 1);
    assert.equal(requests.length, 1, 'Ready reopen reuses its owned index');
    observations.push({ name: 'first-open installed preview and preserved query', dataRequests: requests.length, destination: destination.pathname + destination.hash, targetID: 'threading-100%' });

    const scratch = await mkdtemp(join(tmpdir(), 'raveldex-modal-gallery-downloads-'));
    for (const starter of STARTERS.filter(item => item.family === 'modal')) {
      assert.equal((await fetch(new URL(`examples/${starter.id}/`, url))).status, 200);
      const response = await fetch(new URL(starterArchive(starter.id), url));
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer()), archive = join(scratch, starter.id + '.tar.gz');
      await writeFile(archive, bytes);
      const extracted = join(scratch, starter.id); await mkdir(extracted);
      await command('tar', ['-xzf', archive, '--strip-components=1', '-C', extracted]);
      for (const path of starter.files) {
        const source = await readFile(join(REPO_ROOT, 'examples', starter.id, path));
        assert.deepEqual(await readFile(join(extracted, path)), source, `${starter.id} archive: ${path}`);
        const response = await fetch(new URL(starterSource(starter.id, path), url));
        assert.equal(response.status, 200);
        const text = await response.text();
        const displayed = path.endsWith('.astro')
          ? await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').querySelector('pre code').textContent, text)
          : text;
        assert.equal(displayed, source.toString(), `${starter.id} exact public source: ${path}`);
      }
      observations.push({ name: starter.id + ' complete archive and source', files: starter.files.length, bytes: bytes.length, sha256: digest(bytes) });
    }
    const noJS = await browser.newContext({ javaScriptEnabled: false }), fallback = await noJS.newPage();
    await fallback.goto(new URL('examples/modal-preview/', url).href);
    assert.equal(await fallback.getByRole('navigation', { name: 'Browse all guides' }).getByRole('link').count(), 6);
    await fallback.getByRole('navigation', { name: 'Browse all guides' }).getByRole('link').first().click();
    assert.equal(await fallback.getByRole('heading', { level: 1 }).count(), 1);
    await noJS.close();
    assert.deepEqual(errors, []);
    const mobile = await browser.newPage({ viewport: { width: 320, height: 568 } });
    await mobile.goto(new URL('examples/modal/', url).href);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const mobileFrame = mobile.frameLocator('iframe[title="Documentation modal starter preview"]');
    await mobileFrame.getByRole('button', { name: 'Search documentation', exact: true }).click();
    await mobileFrame.getByRole('searchbox', { name: 'Search the workshop guide', exact: true }).waitFor();
    assert.equal(await mobileFrame.locator('html').evaluate(node => node.scrollWidth <= innerWidth), true);
    if (process.env.RAVELDEX_MODAL_STARTER_SCREENSHOTS)
      await mobile.screenshot({ path: join(process.env.RAVELDEX_MODAL_STARTER_SCREENSHOTS, 'gallery-modal-320.png'), fullPage: true });
    await mobile.close();
    const report = { environment: { node: process.version, browser: browser.version() }, observations, pageErrors: errors,
      scope: 'Generated approved Pages inventory, exact starter archives/source, installed browser modal preview, native heading navigation, preserved query and no-JavaScript browse. Viewports are emulated, not physical keyboard/zoom or human AT evidence.' };
    if (process.env.RAVELDEX_MODAL_STARTER_SITE_REPORT) await writeFile(process.env.RAVELDEX_MODAL_STARTER_SITE_REPORT, JSON.stringify(report, null, 2) + '\n');
  } finally {
    await browser?.close(); server.kill('SIGTERM'); await exited;
  }
});
