import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { release } from 'node:os';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright-core';
import { contrast } from '../helpers/contrast.mjs';

let server, exited, browser, base;
const families = ['inline', 'modal', 'dropdown', 'directory', 'cards'];
const routes = ['examples/', 'guide/overview/', 'reference/core/', ...families.map(f => `examples/${f}/`)];
const report = { scope: 'Scripted installed Chrome, CSS viewports and emulated media only; no human AT, physical input, OS clipboard or actual browser zoom.', layouts: [], colors: [], media: [] };
const output = process.env.RAVELDEX_INTEGRATED_REPORT;
before(async () => {
  server = spawn(process.execPath, ['scripts/preview-pages.mjs', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  exited = once(server, 'exit'); let log = '';
  server.stdout.on('data', b => log += b); server.stderr.on('data', b => log += b);
  const deadline = Date.now() + 20000;
  while (!/Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.test(log)) {
    assert.equal(server.exitCode, null, log); assert.ok(Date.now() < deadline, log);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  base = /Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.exec(log)[1];
  browser = await chromium.launch({ channel: process.env.RAVELDEX_CANDIDATE_BROWSER === 'chromium' ? undefined : 'chrome' });
  report.environment = { browser: browser.version(), node: process.version, os: process.platform, release: release(), arch: process.arch };
  console.log(`Integrated site: ${JSON.stringify(report.environment)}`);
});
after(async () => {
  await browser?.close(); server?.kill('SIGTERM'); await exited;
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
});

// A fixed-width child, hidden skip destination or unavailable narrow navigation breaks this check.
test('integrated page roles reflow and preserve keyboard access across wide narrow and short viewports', { timeout: 120000 }, async () => {
  for (const route of routes) for (const viewport of [
    { width: 320, height: 800 }, { width: 768, height: 900 }, { width: 1280, height: 900 },
    { width: 1440, height: 1000 }, { width: 568, height: 320 },
  ]) {
    const page = await browser.newPage({ viewport }); page.setDefaultTimeout(5000);
    try {
      await page.goto(new URL(route, base).href);
      const skip = page.locator('.skip'); await skip.focus(); await skip.press('Enter');
      assert.equal(await page.locator('main').evaluate(n => n === document.activeElement), true, route);
      const section = page.locator('[data-site-section]');
      if (await section.locator('summary').isVisible()) {
        const summary = section.locator('summary'); await summary.focus();
        if (!await section.evaluate(n => n.open)) await summary.press('Enter');
        await summary.press('Tab');
        assert.equal(await section.locator('a').first().evaluate(n => n === document.activeElement), true, route);
      }
      const geometry = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      assert.ok(geometry.scrollWidth <= geometry.clientWidth, `${route} ${JSON.stringify(viewport)}: ${JSON.stringify(geometry)}`);
      if (route.startsWith('examples/') && route !== 'examples/') {
        const iframe = page.locator('iframe'); await iframe.scrollIntoViewIfNeeded();
        assert.equal(await iframe.count(), 1); await page.frameLocator('iframe').locator('main').waitFor();
        const frameGeometry = await page.frameLocator('iframe').locator('html').evaluate(n => ({ scrollWidth: n.scrollWidth, clientWidth: n.clientWidth }));
        assert.ok(frameGeometry.scrollWidth <= frameGeometry.clientWidth, `${route} frame ${JSON.stringify(frameGeometry)}`);
        const preview = page.getByRole('button', { name: 'Preview', exact: true });
        const code = page.getByRole('button', { name: 'Code', exact: true });
        await code.focus(); await code.press('Enter');
        assert.equal(await iframe.isVisible(), false);
        await preview.focus(); await preview.press('Enter'); assert.equal(await iframe.isVisible(), true);
        if (viewport.width === 1280) {
          await code.focus(); await code.press('Tab');
          assert.equal(await iframe.evaluate(n => n === document.activeElement), true, route + ' frame entry');
          const frame = page.frameLocator('iframe');
          assert.equal(await frame.locator('html').evaluate(() => document.activeElement !== document.body), true);
          await frame.locator('html').evaluate(() => {
            const nodes = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
              .filter(n => n.checkVisibility() && !n.disabled && n.tabIndex >= 0);
            nodes.at(-1).focus();
          });
          await page.keyboard.press('Tab');
          const next = route === 'examples/directory/'
            ? page.locator('.example-showcase__docs > details > summary').first()
            : page.getByLabel('Installation platform', { exact: true });
          assert.equal(await next.evaluate(n => n === document.activeElement), true, route + ' frame exit');
          await next.press('Shift+Tab');
          assert.equal(await iframe.evaluate(n => n === document.activeElement), true, route + ' reverse entry');
        }
      }
      report.layouts.push({ route, viewport, ...geometry });
      if (output && [320, 1440].includes(viewport.width)) {
        const directory = join(dirname(output), 'captures'); await mkdir(directory, { recursive: true });
        if (await section.locator('summary').isVisible() && await section.evaluate(n => n.open)) {
          await section.locator('summary').press('Enter');
        }
        await skip.focus(); await skip.press('Enter');
        await page.screenshot({ path: `${directory}/${route.replaceAll('/', '-')}${viewport.width}.png` });
      }
    } finally { await page.close(); }
  }
});

// A low-contrast shell token, syntax token, copy button or focus ring fails using its rendered color pair.
test('integrated shell code and setup use legible final rendered colors', { timeout: 60000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    for (const route of routes) {
      await page.goto(new URL(route, base).href);
      if (families.some(f => route === `examples/${f}/`)) {
        await page.getByRole('button', { name: 'Code', exact: true }).click();
        await page.locator('[data-code-project]:not([hidden]) details').first().locator('summary').click();
      }
      const pairs = await page.evaluate(() => {
        const background = node => {
          for (let n = node; n; n = n.parentElement) {
            const color = getComputedStyle(n).backgroundColor;
            if (color.startsWith('rgb(')) return color;
            if (color !== 'rgba(0, 0, 0, 0)') throw new Error('Unsupported translucent background: ' + color);
          }
          return 'rgb(255, 255, 255)';
        };
        return [...document.querySelectorAll('.site-header a, .site-breadcrumb a, .site-section a, .site-outline a, main p, main button, main select, main figcaption, main pre code span, main caption, main th, main td')]
          .filter(n => n.checkVisibility() && n.textContent.trim() && !n.disabled)
          .map(n => { const s = getComputedStyle(n); return { text: n.textContent.trim().slice(0, 60), foreground: s.color, background: background(n) }; });
      });
      assert.ok(pairs.length > 10, route);
      for (const pair of pairs) {
        const ratio = contrast(pair.foreground, pair.background);
        assert.ok(ratio >= 4.5, `${route} ${JSON.stringify(pair)} ratio ${ratio}`);
      }
      const focus = page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link').first();
      await page.keyboard.press('Tab');
      await focus.focus();
      const ring = await focus.evaluate(n => ({ color: getComputedStyle(n).outlineColor, style: getComputedStyle(n).outlineStyle, width: parseFloat(getComputedStyle(n).outlineWidth) }));
      assert.notEqual(ring.style, 'none'); assert.ok(ring.width >= 2); assert.ok(contrast(ring.color, 'rgb(255, 255, 255)') >= 3);
      report.colors.push({ route, samples: pairs.length, minimum: Math.min(...pairs.map(p => contrast(p.foreground, p.background))), pairs, ring });
    }
  } finally { await page.close(); }
});

// Forced-color overrides must retain visible operable controls; reduced-motion must remove smooth scrolling.
test('integrated controls retain focus and state in forced colors and reduced motion', { timeout: 60000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 568, height: 320 }, forcedColors: 'active', reducedMotion: 'reduce' });
  try {
    for (const family of families) {
      await page.goto(new URL(`examples/${family}/`, base).href);
      const code = page.getByRole('button', { name: 'Code', exact: true }); await code.focus(); await code.press('Enter');
      assert.equal(await code.getAttribute('aria-pressed'), 'true');
      const style = await code.evaluate(n => ({ outline: getComputedStyle(n).outlineStyle, foreground: getComputedStyle(n).color, background: getComputedStyle(n).backgroundColor, scroll: getComputedStyle(document.documentElement).scrollBehavior }));
      assert.notEqual(style.outline, 'none'); assert.notEqual(style.foreground, style.background); assert.equal(style.scroll, 'auto');
      await page.getByRole('button', { name: 'Preview', exact: true }).press('Enter'); assert.equal(await page.locator('iframe').isVisible(), true);
      report.media.push({ family, ...style });
    }
  } finally { await page.close(); }
});
