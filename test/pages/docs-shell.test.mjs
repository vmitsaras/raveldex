import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

let server, exited, browser, base;
before(async () => {
  server = spawn(process.execPath, ['scripts/preview-pages.mjs', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  exited = once(server, 'exit');
  let log = '';
  server.stdout.on('data', bytes => { log += bytes; });
  server.stderr.on('data', bytes => { log += bytes; });
  const deadline = Date.now() + 20000;
  while (!/Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.test(log)) {
    assert.equal(server.exitCode, null, log); assert.ok(Date.now() < deadline, log);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  base = /Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.exec(log)[1];
  browser = await chromium.launch({ channel: process.env.RAVELDEX_CANDIDATE_BROWSER === 'chromium' ? undefined : 'chrome', headless: true });
  console.log(`Docs shell: ${browser.version()} / ${process.version} / ${process.platform} ${process.arch}`);
});
after(async () => { await browser?.close(); server?.kill('SIGTERM'); await exited; });

const mainLinks = [
  ['Get started', '/raveldex/guide/overview/'], ['Examples', '/raveldex/examples/'],
  ['Documentation', '/raveldex/guide/'], ['API reference', '/raveldex/reference/'],
];

// A section match must never label its root as the exact current nested page.
test('docs shell marks nested routes correctly', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    for (const [route, section, label, outline] of [
      ['examples/', 'Examples', 'Examples', true],
      ['examples/inline/', 'Examples', 'Inline search', false],
      ['examples/inline-browser/', 'Examples', 'Browser inline starter', true],
      ['guide/overview/', 'Get started', 'Get started', true],
      ['reference/core/', 'API reference', 'Core API', true],
      ['demo/', 'Documentation', 'Developer Workbench', false],
    ]) {
      await page.goto(new URL(route, base).href);
      assert.equal(await page.getByRole('main').count(), 1);
      assert.equal(await page.locator('main h1').count(), 1);
      const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
      assert.deepEqual(await nav.locator('a').evaluateAll(nodes => nodes.map(n => [n.textContent, n.getAttribute('href')])), mainLinks);
      const category = nav.getByRole('link', { name: section, exact: true });
      assert.equal(await category.getAttribute('data-section-current'), 'true');
      assert.equal(await category.getAttribute('aria-current'), new URL(await category.getAttribute('href'), base).href === page.url() ? 'page' : 'location');
      const context = page.locator('[data-site-section] nav');
      assert.equal(await context.count(), 1);
      assert.equal(await context.locator('[aria-current="page"]').count(), 1);
      assert.equal(await context.locator('[aria-current="page"]').getAttribute('href'), new URL(page.url()).pathname);
      const breadcrumbs = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
      assert.equal(await breadcrumbs.locator('[aria-current="page"]').innerText(), label);
      assert.equal(await breadcrumbs.getByRole('link', { name: 'Home', exact: true }).getAttribute('href'), '/raveldex/');
      const names = await page.getByRole('navigation').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')));
      assert.equal(new Set(names).size, names.length, `Unique named navigation landmarks: ${route}`);
      const toc = page.getByRole('navigation', { name: 'On this page', exact: true });
      assert.equal(await toc.count(), Number(outline), route);
      if (outline) {
        for (const href of await toc.locator('a').evaluateAll(nodes => nodes.map(n => n.getAttribute('href'))))
          assert.equal(await page.locator(`main [id="${decodeURIComponent(href.slice(1))}"]`).count(), 1, href);
      }
    }
    await page.goto(new URL('reference/core/', base).href);
    assert.deepEqual(await page.getByRole('navigation', { name: 'Breadcrumb' }).locator('a').evaluateAll(nodes => nodes.map(n => n.getAttribute('href'))), ['/raveldex/', '/raveldex/reference/']);
  } finally { await page.close(); }
});

// The responsive shell must use one navigable disclosure, including on no-JS hosts.
test('section navigation remains usable without JavaScript', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 800 } });
  try {
    const page = await context.newPage(); await page.goto(new URL('reference/core/', base).href);
    const disclosure = page.locator('[data-site-section]');
    assert.equal(await disclosure.count(), 1);
    const summary = disclosure.locator('summary');
    assert.match(await summary.innerText(), /API reference navigation/);
    await summary.focus(); await summary.press('Enter');
    assert.equal(await disclosure.getAttribute('open'), null);
    assert.equal(await disclosure.getByRole('link', { name: 'Core API', exact: true }).isVisible(), false);
    await page.setViewportSize({ width: 1600, height: 1000 });
    assert.equal(await summary.isVisible(), true, 'Closing then resizing without JS retains the native way to reopen navigation');
    assert.equal(await summary.evaluate(n => n === document.activeElement), true);
    await summary.press('Space');
    assert.notEqual(await disclosure.getAttribute('open'), null);
    await page.setViewportSize({ width: 320, height: 800 });
    await disclosure.getByRole('link', { name: 'Hosts and UI', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/raveldex/reference/hosts/');
    for (const [label, href] of mainLinks) {
      await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: label, exact: true }).click();
      assert.equal(new URL(page.url()).pathname, href);
    }
    await page.getByRole('link', { name: 'Developer Workbench', exact: true }).first().click();
    assert.equal(new URL(page.url()).pathname, '/raveldex/demo/');
    assert.equal(await page.locator('[data-site-search-fallback]').isVisible(), true);
    await page.goto(new URL('reference/core/', base).href);
    await page.locator('.skip').focus(); await page.locator('.skip').press('Enter');
    assert.equal(await page.locator('main').evaluate(n => n === document.activeElement), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  } finally { await context.close(); }
});

test('contextual navigation does not duplicate unnamed complementary landmarks', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(new URL('reference/core/', base).href);
    const names = await page.getByRole('complementary').evaluateAll(nodes => nodes.map(n =>
      n.getAttribute('aria-label') ?? n.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.textContent).join(' ') ?? ''));
    assert.equal(new Set(names).size, names.length, 'Complementary landmarks must be distinguishable');
    assert.equal(await page.getByRole('navigation', { name: 'API reference navigation', exact: true }).count(), 1);
    assert.equal(await page.getByRole('navigation', { name: 'On this page', exact: true }).count(), 1);
  } finally { await page.close(); }
});

test('responsive navigation preserves focus, anchors and long labels', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(new URL('reference/core/', base).href);
    const section = page.locator('[data-site-section]');
    const summary = section.locator('summary');
    assert.notEqual(await section.getAttribute('open'), null);
    assert.equal(await page.getByRole('navigation', { name: 'On this page' }).isVisible(), true);
    await page.setViewportSize({ width: 1200, height: 900 });
    assert.equal(await page.getByRole('navigation', { name: 'On this page' }).isVisible(), false);
    assert.notEqual(await section.getAttribute('open'), null, 'Outline hides before the left navigation collapses');
    await page.setViewportSize({ width: 320, height: 800 });
    await page.waitForFunction(() => !document.querySelector('[data-site-section]').open);
    await summary.focus(); await summary.press('Enter');
    assert.notEqual(await section.getAttribute('open'), null);
    const current = section.locator('[aria-current="page"]');
    await current.evaluate(n => { n.textContent = 'Core API configuration and results with an exceptionally long translated navigation label'; });
    await current.focus();
    assert.notEqual(await current.evaluate(n => getComputedStyle(n).outlineStyle), 'none');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.setViewportSize({ width: 320, height: 800 });
    assert.notEqual(await section.getAttribute('open'), null, 'A focused navigation link is never hidden by resize');
    assert.equal(await current.evaluate(n => n === document.activeElement), true);
    await page.locator('.skip').focus(); await page.locator('.skip').press('Enter');
    assert.equal(await page.locator('main').evaluate(n => n === document.activeElement), true);
    await page.goto(new URL('reference/core/#methods-and-results', base).href);
    const target = page.locator('#methods-and-results');
    assert.ok((await target.boundingBox()).y >= 0);
    for (const tag of ['pre', 'table']) {
      const region = page.locator(`main ${tag}[tabindex="0"]`).first();
      await region.focus(); await region.press('ArrowRight');
      await page.waitForFunction(tag => [...document.querySelectorAll(`main ${tag}`)].some(n => n.scrollLeft > 0), tag);
    }
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await summary.focus();
    assert.notEqual(await summary.evaluate(n => getComputedStyle(n).outlineStyle), 'none');
    await page.emulateMedia({ forcedColors: 'none' });
    await page.addScriptTag({ content: await readFile(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8') });
    const violations = await page.evaluate(async () => (await axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map(n => ({ id: n.id, targets: n.nodes.map(item => item.target) })));
    assert.deepEqual(violations, []);
  } finally { await page.close(); }
});

// New site utilities must not reset the real modal or enter standalone documents.
test('site styles preserve installed modal and iframe boundaries', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(new URL('examples/inline/', base).href);
    assert.equal(await page.locator('[data-site-section]').count(), 1);
    const iframe = page.locator('iframe'); await iframe.scrollIntoViewIfNeeded();
    const frame = page.frameLocator('iframe');
    await frame.locator('[data-raveldex-inline-input]').waitFor();
    const urls = await frame.locator('link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(n => n.href));
    assert.ok(urls.length > 0); assert.ok(urls.every(url => !url.includes('/site-assets/')));
    assert.equal(await frame.locator('body').evaluate(n => getComputedStyle(n).getPropertyValue('--site-ink')), '');
    await page.locator('[data-site-search-trigger]').click();
    const modal = page.locator('.site-search .raveldex-modal');
    const input = modal.locator('[data-raveldex-inline-input]'); await input.waitFor();
    await input.fill('source'); await input.press('Enter');
    await page.waitForFunction(() => document.querySelector('.site-search .raveldex-inline')?.getAttribute('aria-busy') === 'false');
    const before = await modal.evaluate(node => {
      const probe = document.createElement('section');
      probe.dataset.styleProbe = ''; probe.innerHTML = '<h3>Heading</h3><ul><li>Item</li></ul><button type="button">Action</button><div class="flex">Unprefixed utility</div>';
      node.append(probe);
      return [...probe.children].map(n => { const s = getComputedStyle(n); return [s.margin, s.fontWeight, s.listStyleType, s.borderStyle, s.display]; });
    });
    const styles = await page.locator('link[rel="stylesheet"]').elementHandles();
    const shellStyles = [];
    for (const style of styles) if (await style.evaluate(n => !/\/(?:search|search\/modal)\.css$/.test(n.href))) {
      shellStyles.push(style); await style.evaluate(n => { n.disabled = true; });
    }
    const after = await modal.locator('[data-style-probe]').evaluate(node => [...node.children].map(n => { const s = getComputedStyle(n); return [s.margin, s.fontWeight, s.listStyleType, s.borderStyle, s.display]; }));
    assert.deepEqual(before, after, 'No site heading/list/button reset or unprefixed utility reaches installed UI');
    for (const style of shellStyles) await style.evaluate(n => { n.disabled = false; });
    await modal.locator('[data-style-probe]').evaluate(n => n.remove());
    assert.ok(await modal.locator('[data-raveldex-inline-result]').count() > 0);
    await modal.locator('[data-raveldex-modal-close]').click();
    assert.equal(await page.locator('[data-site-search-trigger]').evaluate(n => n === document.activeElement), true,
      await page.evaluate(() => ({ active: document.activeElement.outerHTML.slice(0, 500), modal: !!document.querySelector('dialog:modal') })));
  } finally { await page.close(); }
});
