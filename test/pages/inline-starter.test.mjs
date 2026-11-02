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

test('inline gallery serves exact complete source downloads and the installed starter preview', { timeout: 60_000 }, async () => {
  const server = spawn(process.execPath, ['scripts/preview-pages.mjs', '--port', '0'], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(server, 'exit');
  let log = '', browser;
  server.stdout.on('data', bytes => { log += bytes; });
  server.stderr.on('data', bytes => { log += bytes; });
  const observations = [], errors = [];
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
    await page.goto(new URL('examples/inline/', url).href);
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Ready to use inline search');
    const frame = page.frameLocator('iframe[title="Inline search starter preview"]');
    const input = frame.getByRole('searchbox', { name: 'Search walking guides', exact: true });
    await input.fill('walking guide'); await input.press('Enter');
    await frame.locator('[data-raveldex-inline-result]').first().waitFor();
    assert.equal(await frame.locator('[data-raveldex-inline-result]').count(), 3);
    await frame.getByRole('button', { name: 'Load more', exact: true }).click();
    await frame.locator('[data-raveldex-inline-result]').nth(5).waitFor();
    assert.equal(await frame.locator('[data-raveldex-inline-result]').count(), 6);
    const destination = await frame.locator('[data-raveldex-inline-result] a').first().getAttribute('href');
    assert.ok(new URL(destination, url).pathname.startsWith('/raveldex/examples/inline-preview/guides/'));
    assert.equal((await fetch(destination)).status, 200);
    observations.push({ name: 'real installed preview, exact paging and generated destination', visible: 6, destination });

    const scratch = await mkdtemp(join(tmpdir(), 'raveldex-gallery-downloads-'));
    for (const starter of STARTERS.filter(item => item.family === 'inline')) {
      const guide = await fetch(new URL(`examples/${starter.id}/`, url));
      assert.equal(guide.status, 200);
      const response = await fetch(new URL(starterArchive(starter.id), url));
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer()), archive = join(scratch, starter.id + '.tar.gz');
      await writeFile(archive, bytes);
      const extracted = join(scratch, starter.id); await mkdir(extracted);
      await command('tar', ['-xzf', archive, '--strip-components=1', '-C', extracted]);
      for (const path of starter.files) {
        const source = await readFile(join(REPO_ROOT, 'examples', starter.id, path));
        assert.deepEqual(await readFile(join(extracted, path)), source, `${starter.id} archive: ${path}`);
        const publicText = await fetch(new URL(starterSource(starter.id, path), url));
        assert.equal(publicText.status, 200);
        const text = await publicText.text();
        const displayed = path.endsWith('.astro')
          ? await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').querySelector('pre code').textContent, text)
          : text;
        assert.equal(displayed, source.toString(), `${starter.id} exact public source text: ${path}`);
      }
      observations.push({ name: starter.id + ' complete archive and exact source', files: starter.files.length, bytes: bytes.length, sha256: digest(bytes) });
    }
    const noJS = await browser.newContext({ javaScriptEnabled: false });
    const fallback = await noJS.newPage();
    await fallback.goto(new URL('examples/inline-preview/', url).href);
    assert.equal(await fallback.getByRole('navigation', { name: 'Browse all guides' }).getByRole('link').count(), 7);
    await fallback.getByRole('navigation', { name: 'Browse all guides' }).getByRole('link').first().click();
    assert.equal(await fallback.getByRole('heading', { level: 1 }).count(), 1);
    await noJS.close();
    assert.deepEqual(errors, []);
    if (process.env.RAVELDEX_INLINE_STARTER_SCREENSHOTS) {
      await mkdir(process.env.RAVELDEX_INLINE_STARTER_SCREENSHOTS, { recursive: true });
      await input.fill('weather'); await input.press('Enter');
      await frame.locator('[data-raveldex-inline-result]').first().waitFor();
      await frame.locator('body').evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: join(process.env.RAVELDEX_INLINE_STARTER_SCREENSHOTS, 'gallery-desktop.png'), fullPage: true });
      // A fresh viewport also avoids Chrome's stale full-page compositor tiles
      // when resizing a scrolled iframe immediately before capture.
      const mobile = await browser.newPage({ viewport: { width: 360, height: 800 } });
      await mobile.goto(new URL('examples/inline/', url).href);
      const mobileFrame = mobile.frameLocator('iframe[title="Inline search starter preview"]');
      await mobileFrame.getByRole('searchbox', { name: 'Search walking guides', exact: true }).waitFor();
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await mobile.screenshot({ path: join(process.env.RAVELDEX_INLINE_STARTER_SCREENSHOTS, 'gallery-mobile.png'), fullPage: true });
      await mobile.close();
    }
    const report = { environment: { node: process.version, browser: browser.version() }, observations, pageErrors: errors,
      scope: 'Generated local Pages inventory, source/archive equality, installed-browser preview, no-JavaScript navigation. No deployment, human AT, physical input or actual zoom.' };
    if (process.env.RAVELDEX_INLINE_STARTER_SITE_REPORT) await writeFile(process.env.RAVELDEX_INLINE_STARTER_SITE_REPORT, JSON.stringify(report, null, 2) + '\n');
  } finally {
    await browser?.close(); server.kill('SIGTERM'); await exited;
  }
});
