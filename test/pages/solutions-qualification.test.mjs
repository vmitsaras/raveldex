import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { release } from 'node:os';
import { chromium } from 'playwright-core';
import { REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

test('solution chooser and published CSS recipes preserve actual installed search results and keyboard focus', { timeout: 60_000 }, async () => {
  const server = spawn(process.execPath, ['scripts/preview-pages.mjs', '--port', '0'], {
    cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
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
    const base = /Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.exec(log)[1];
    browser = await chromium.launch({
      ...(process.env.RAVELDEX_CANDIDATE_BROWSER === 'chromium' ? {} : { channel: 'chrome' }), headless: true,
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    page.setDefaultTimeout(15_000);
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(new URL('examples/', base).href);
    assert.equal(new URL(await page.getByRole('link', { name: 'inline search', exact: true }).getAttribute('href'), base).pathname,
      '/raveldex/examples/inline/');
    assert.equal(new URL(await page.getByRole('link', { name: 'documentation search modal', exact: true }).getAttribute('href'), base).pathname,
      '/raveldex/examples/modal/');

    for (const entry of [
      { family: 'inline', other: 'modal', title: 'Inline search starter preview', label: 'Search walking guides',
        recipe: 'Inline search theme properties', query: 'walking guide', total: 7, gap: '20px', radius: '12px' },
      { family: 'modal', other: 'inline', title: 'Documentation modal starter preview', label: 'Search the workshop guide',
        recipe: 'Documentation modal theme properties', query: 'workshop', total: 6, gap: '16px' },
    ]) {
      await page.goto(new URL(`examples/${entry.family}/`, base).href);
      assert.ok(await page.locator(`a[href="/raveldex/examples/${entry.other}/"]`).count(), 'The two solutions are cross-linked');
      assert.equal(await page.getByRole('link', { name: 'Download the complete starter', exact: true }).count(), 2);
      const frame = page.frameLocator(`iframe[title="${entry.title}"]`);
      if (entry.family === 'modal') await frame.getByRole('button', { name: 'Search documentation', exact: true }).click();
      const input = frame.getByRole('searchbox', { name: entry.label, exact: true });
      await input.fill(entry.query); await input.press('Enter');
      const status = frame.locator('.raveldex-inline__status');
      await status.filter({ hasText: `${entry.total} results. Showing 3.` }).waitFor();
      const results = frame.locator('[data-raveldex-inline-result]');
      const before = await results.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-raveldex-inline-result')));
      assert.equal(before.length, 3);

      // Run the actual published recipe after the installed starter styles.
      // This is a browser cascade check, not a substitute for the fresh
      // installed-project edit/build/preview walkthroughs.
      const css = await page.locator(`pre[aria-label="${entry.recipe}"] code`).innerText();
      await frame.locator('head').evaluate((head, text) => {
        const style = head.ownerDocument.createElement('style'); style.textContent = text; head.append(style);
      }, css);
      const styles = await frame.locator('.raveldex-inline').evaluate(root => {
        const style = getComputedStyle(root), button = root.querySelector('.raveldex-inline__submit');
        return { gap: getComputedStyle(root.querySelector('.raveldex-inline__form')).gap,
          accent: getComputedStyle(root.querySelector('.raveldex-inline__result-title')).color, radius: getComputedStyle(button).borderRadius,
          publicAccent: style.getPropertyValue('--raveldex-inline-accent').trim() };
      });
      assert.equal(styles.publicAccent, '#145b45');
      assert.equal(styles.accent, 'rgb(20, 91, 69)');
      assert.equal(styles.gap, entry.gap);
      if (entry.radius) assert.equal(styles.radius, entry.radius);
      if (entry.family === 'modal') {
        const modal = await frame.locator('.raveldex-modal').evaluate(dialog => ({
          maxWidth: getComputedStyle(dialog).getPropertyValue('--raveldex-modal-max-width').trim(),
          radius: getComputedStyle(dialog).borderRadius, width: dialog.getBoundingClientRect().width,
        }));
        assert.equal(modal.maxWidth, '40rem'); assert.equal(modal.radius, '12px'); assert.ok(modal.width <= 640);
        styles.modal = modal;
      }
      assert.deepEqual(await results.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-raveldex-inline-result'))), before);
      assert.equal(await status.innerText(), `${entry.total} results. Showing 3.`);
      await input.focus(); await input.press('Tab');
      const focus = await frame.locator('.raveldex-inline').evaluate(root => {
        const active = root.ownerDocument.activeElement, style = getComputedStyle(active);
        return { inside: root.contains(active), text: active.textContent, outline: style.outlineStyle, width: style.outlineWidth };
      });
      assert.equal(focus.inside, true); assert.equal(focus.text, 'Search');
      assert.notEqual(focus.outline, 'none'); assert.ok(parseFloat(focus.width) > 0);
      // Native iframe keyboard focus can independently scroll the outer page.
      // Restore its interaction viewport before the ordinary pointer action.
      await page.locator(`iframe[title="${entry.title}"]`).scrollIntoViewIfNeeded();
      await frame.getByRole('button', { name: 'Load more', exact: true }).click();
      await status.filter({ hasText: `${entry.total} results. Showing 6.` }).waitFor();
      assert.equal(await results.count(), 6);
      observations.push({ family: entry.family, initialIDs: before, total: entry.total, renderedAfterLoadMore: 6, styles, focus });
    }
    assert.deepEqual(errors, []);
    if (process.env.RAVELDEX_SOLUTIONS_SITE_REPORT) await writeFile(process.env.RAVELDEX_SOLUTIONS_SITE_REPORT,
      JSON.stringify({ environment: { node: process.version, browser: browser.version(), platform: process.platform, arch: process.arch, osRelease: release() },
        observations, pageErrors: errors,
        scope: 'Generated galleries and existing installed previews. Actual published CSS cascade, unchanged native IDs/counts and scripted keyboard focus. No fresh package installation in this test, physical input, human AT, actual zoom or deployment.' }, null, 2) + '\n');
  } finally {
    await browser?.close(); server.kill('SIGTERM'); await exited;
  }
});
