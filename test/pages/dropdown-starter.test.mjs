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

test('dropdown gallery serves its exact installed header starter and a real complete full-results route', { timeout: 60_000 }, async () => {
  const server = spawn(process.execPath, ['scripts/preview-pages.mjs', '--port', '0'], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(server, 'exit');
  let log = '', browser;
  server.stdout.on('data', bytes => { log += bytes; });
  server.stderr.on('data', bytes => { log += bytes; });
  const observations = [], errors = [];
  try {
    const deadline = Date.now() + 20_000;
    while (!/Open http:\/\/127\.0\.0\.1:\d+\/raveldex\//.test(log)) {
      assert.equal(server.exitCode, null, log); assert.ok(Date.now() < deadline, log);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const url = /Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.exec(log)[1];
    browser = await chromium.launch({ ...(process.env.RAVELDEX_CANDIDATE_BROWSER === 'chromium' ? {} : { channel: 'chrome' }), headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(10_000);
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(new URL('examples/dropdown/', url).href);
    assert.match(await page.getByRole('heading', { level: 1 }).innerText(), /dropdown|header/i);
    const preview = page.locator('iframe[title="Dropdown header starter preview"]');
    await preview.scrollIntoViewIfNeeded();
    const frame = page.frameLocator('iframe[title="Dropdown header starter preview"]');
    const input = frame.locator('[data-raveldex-dropdown-input]');
    const raw = '  walking   gui  ';
    await input.fill(raw); await input.press('Enter');
    const cells = frame.locator('[data-raveldex-dropdown-result]');
    await cells.nth(2).waitFor();
    assert.equal(await cells.count(), 3);
    const shortIDs = await cells.evaluateAll(nodes => nodes.map(node => node.dataset.raveldexDropdownResult));
    const recipe = await page.locator('pre[aria-label="Dropdown search theme properties"] code').textContent();
    assert.ok(recipe?.includes('--raveldex-dropdown-accent: #145b45;'));
    await input.focus();
    await frame.locator('html').evaluate((_, css) => { const style = document.createElement('style'); style.textContent = css; document.head.append(style); }, recipe);
    const computed = await frame.locator('.raveldex-dropdown').evaluate(node => {
      const style = getComputedStyle(node), field = node.querySelector('input');
      return { accent: style.getPropertyValue('--raveldex-dropdown-accent').trim(), gap: style.getPropertyValue('--raveldex-dropdown-gap').trim(),
        radius: style.getPropertyValue('--raveldex-dropdown-radius').trim(), inputFocused: document.activeElement === field, raw: field.value,
        borderRadius: getComputedStyle(field).borderRadius };
    });
    assert.deepEqual(computed, { accent: '#145b45', gap: '.75rem', radius: '.75rem', inputFocused: true, raw, borderRadius: '12px' });
    assert.deepEqual(await cells.evaluateAll(nodes => nodes.map(node => node.dataset.raveldexDropdownResult)), shortIDs);
    assert.match(await frame.locator('[data-raveldex-dropdown-status]').innerText(), /7 results\. Showing 3/);
    observations.push({ name: 'exact published CSS recipe', computed, unchangedNativeIDs: shortIDs });
    const full = frame.locator('[data-raveldex-dropdown-full-results]');
    const destination = new URL(await full.getAttribute('href'), url);
    assert.equal(destination.pathname, '/raveldex/examples/dropdown-preview/search/');
    assert.equal(destination.searchParams.get('q'), raw);
    assert.equal((await fetch(destination)).status, 200);
    await input.press('Escape');
    assert.equal(await input.getAttribute('aria-expanded'), 'false');
    assert.equal(await input.inputValue(), raw);
    await full.click();
    await frame.locator('[data-raveldex-inline-result]').first().waitFor();
    assert.equal(await frame.locator('html').evaluate(() => location.href), destination.href);
    const resultIDs = () => frame.locator('[data-raveldex-inline-result]').evaluateAll(nodes => nodes.map(node => node.dataset.raveldexInlineResult));
    assert.deepEqual(await resultIDs(), shortIDs);
    assert.equal(await frame.locator('[data-raveldex-inline-input]').inputValue(), raw);
    await frame.getByRole('button', { name: 'Load more', exact: true }).click();
    await frame.locator('[data-raveldex-inline-result]').nth(5).waitFor();
    const six = await resultIDs();
    await frame.getByRole('button', { name: 'Next results', exact: true }).click();
    await frame.locator('[data-raveldex-inline-result]').nth(1).waitFor({ state: 'detached' });
    await frame.locator('[data-raveldex-inline-result]').first().waitFor();
    assert.equal(await frame.locator('[data-raveldex-inline-result]').count(), 1);
    const complete = [...six, ...await resultIDs()];
    assert.deepEqual([...complete].sort(), ['access', 'care', 'getting-started', 'maps', 'packing', 'symbols', 'weather']);
    const guide = frame.locator('[data-raveldex-inline-result] a').first();
    const guideURL = new URL(await guide.getAttribute('href'), url);
    assert.ok(guideURL.pathname.startsWith('/raveldex/examples/dropdown-preview/guides/'));
    await guide.click();
    await frame.getByRole('heading', { level: 1 }).waitFor();
    assert.equal(await frame.locator('html').evaluate(() => location.href), guideURL.href);
    observations.push({ name: 'native header/full-results/guide navigation', raw, destination: destination.pathname + destination.search + destination.hash, shortIDs, completeIDs: complete, guideURL: guideURL.pathname });

    const scratch = await mkdtemp(join(tmpdir(), 'raveldex-dropdown-gallery-downloads-'));
    const starters = STARTERS.filter(item => item.family === 'dropdown');
    assert.equal(starters.length, 1, 'one complete browser starter in this slice');
    for (const starter of starters) {
      assert.equal((await fetch(new URL(`examples/${starter.id}/`, url))).status, 200);
      const response = await fetch(new URL(starterArchive(starter.id), url)); assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer()), archive = join(scratch, starter.id + '.tar.gz');
      await writeFile(archive, bytes); const extracted = join(scratch, starter.id); await mkdir(extracted);
      await command('tar', ['-xzf', archive, '--strip-components=1', '-C', extracted]);
      for (const path of starter.files) {
        const source = await readFile(join(REPO_ROOT, 'examples', starter.id, path));
        assert.deepEqual(await readFile(join(extracted, path)), source, `${starter.id} archive: ${path}`);
        const publicSource = await fetch(new URL(starterSource(starter.id, path), url)); assert.equal(publicSource.status, 200);
        assert.equal(await publicSource.text(), source.toString(), `${starter.id} exact public source: ${path}`);
      }
      observations.push({ name: starter.id + ' complete archive and exact source', files: starter.files.length, bytes: bytes.length, sha256: digest(bytes) });
    }
    const noJS = await browser.newContext({ javaScriptEnabled: false }), fallback = await noJS.newPage();
    await fallback.goto(new URL('examples/dropdown-preview/search/?q=walking', url).href);
    assert.equal(await fallback.getByRole('navigation', { name: 'Browse all guides' }).getByRole('link').count(), 7);
    await fallback.getByRole('navigation', { name: 'Browse all guides' }).getByRole('link').first().click();
    assert.equal(await fallback.getByRole('heading', { level: 1 }).count(), 1); await noJS.close();

    const mobile = await browser.newPage({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' });
    mobile.setDefaultTimeout(10_000);
    await mobile.goto(new URL('examples/dropdown/', url).href);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mobile.locator('iframe[title="Dropdown header starter preview"]').scrollIntoViewIfNeeded();
    const narrow = mobile.frameLocator('iframe[title="Dropdown header starter preview"]');
    await narrow.locator('[data-raveldex-dropdown-input]').fill('walking guide');
    await narrow.locator('[data-raveldex-dropdown-input]').press('Enter');
    await narrow.locator('[data-raveldex-dropdown-full-results]').waitFor();
    assert.equal(await narrow.locator('html').evaluate(node => node.scrollWidth <= innerWidth), true);
    const screenshots = process.env.RAVELDEX_DROPDOWN_STARTER_SCREENSHOTS;
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await mobile.screenshot({ path: join(screenshots, 'gallery-dropdown-320.png'), fullPage: true });
      await page.goto(new URL('examples/dropdown/', url).href);
      await page.locator('iframe[title="Dropdown header starter preview"]').scrollIntoViewIfNeeded();
      await page.frameLocator('iframe[title="Dropdown header starter preview"]').locator('[data-raveldex-dropdown-input]').fill('walking guide');
      await page.frameLocator('iframe[title="Dropdown header starter preview"]').locator('[data-raveldex-dropdown-input]').press('Enter');
      await page.frameLocator('iframe[title="Dropdown header starter preview"]').locator('[data-raveldex-dropdown-result]').first().waitFor();
      await page.screenshot({ path: join(screenshots, 'gallery-dropdown-desktop.png'), fullPage: true });
    }
    await mobile.close(); assert.deepEqual(errors, []);
    const report = { kind: 'raveldex-dropdown-gallery-v1', environment: { node: process.version, browser: browser.version() }, observations, pageErrors: errors,
      scope: 'Generated allowlisted inventory, exact complete copied source/archive, installed-browser preview with native full-results and guide navigation, no-JavaScript browsing and emulated320px reflow. No deployment, human AT, physical input or actual zoom.' };
    if (process.env.RAVELDEX_DROPDOWN_STARTER_SITE_REPORT) await writeFile(process.env.RAVELDEX_DROPDOWN_STARTER_SITE_REPORT, JSON.stringify(report, null, 2) + '\n');
  } finally {
    await browser?.close(); server.kill('SIGTERM'); await exited;
  }
});
