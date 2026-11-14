import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { STARTERS } from '../../site/starters.mjs';

let server, exited, browser, base;
const families = ['inline', 'modal', 'dropdown', 'directory', 'cards'];
const names = ['Inline search', 'Documentation modal', 'Header dropdown', 'Filtered directory', 'Rich results'];
const anchors = ['choose-a-search-solution', 'data-and-capabilities', 'keyboard-and-cleanup', 'complete-projects-and-smaller-examples'];
before(async () => {
  server = spawn(process.execPath, ['scripts/preview-pages.mjs', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  exited = once(server, 'exit'); let log = '';
  server.stdout.on('data', bytes => { log += bytes; }); server.stderr.on('data', bytes => { log += bytes; });
  const deadline = Date.now() + 20000;
  while (!/Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.test(log)) {
    assert.equal(server.exitCode, null, log); assert.ok(Date.now() < deadline, log);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  base = /Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.exec(log)[1];
  browser = await chromium.launch({ channel: process.env.RAVELDEX_CANDIDATE_BROWSER === 'chromium' ? undefined : 'chrome', headless: true });
  console.log(`Docs gallery: ${browser.version()} / ${process.version} / ${process.platform} ${process.arch}`);
});
after(async () => { await browser?.close(); server?.kill('SIGTERM'); await exited; });

// Catches missing/reordered choices, fabricated platforms, broken images and incorrect starter destinations.
test('gallery exposes five truthful interface choices', async () => {
  const page = await browser.newPage(); page.setDefaultTimeout(5000);
  try {
    await page.goto(new URL('examples/', base).href);
    assert.equal(await page.locator('main h1').innerText(), 'Choose a search interface');
    const cards = page.locator('[data-solution-gallery] > li:not(.examples-gallery__live)');
    assert.equal(await cards.count(), 5);
    const mappings = [];
    for (let i = 0; i < families.length; i++) {
      const card = cards.nth(i), family = families[i];
      assert.equal(await card.getByRole('heading', { level: 2 }).innerText(), names[i]);
      assert.ok((await card.locator('[data-solution-use-case]').innerText()).length > 20);
      const img = card.locator('img'); assert.equal(await img.count(), 1);
      assert.equal(await img.getAttribute('alt'), '', 'Text already explains these decorative interface snapshots');
      await img.evaluate(img => img.decode());
      assert.ok(await img.evaluate(img => img.naturalWidth > 200));
      const demo = card.locator('[data-solution-demo]');
      assert.equal(await demo.getAttribute('href'), `/raveldex/examples/${family}/`);
      assert.equal((await fetch(new URL(await demo.getAttribute('href'), base))).status, 200);
      const ids = STARTERS.filter(starter => starter.family === family).map(starter => starter.id);
      const platforms = card.locator('[data-solution-platforms] a');
      assert.deepEqual(await platforms.evaluateAll(nodes => nodes.map(n => n.getAttribute('href'))), ids.map(id => `/raveldex/examples/${id}/`));
      assert.deepEqual(await platforms.allTextContents(), ids.map(id => id.endsWith('-astro') ? 'Astro' : 'Browser'));
      mappings.push(...ids);
    }
    assert.deepEqual(mappings, ['inline-browser', 'inline-astro', 'modal-browser', 'modal-astro', 'dropdown-browser', 'directory-browser', 'directory-astro', 'cards-browser']);
    for (const id of mappings) {
      assert.equal(await page.locator(`main a[href="/raveldex/example-files/${id}.tar.gz"]`).count(), 1);
      assert.equal((await fetch(new URL(`example-files/${id}.tar.gz`, base))).status, 200);
    }
  } finally { await page.close(); }
});

// Catches lost legacy/source aliases and gallery-owned engines, frames or remote thumbnail requests.
test('gallery preserves comparison anchors and keeps its example cards static', async () => {
  const page = await browser.newPage(); page.setDefaultTimeout(5000);
  const requests = [], errors = [];
  page.on('request', request => { if (request.frame() === page.mainFrame()) requests.push({ url: request.url(), type: request.resourceType() }); });
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await page.goto(new URL('examples/', base).href, { waitUntil: 'networkidle' });
    for (const id of anchors) assert.equal(await page.locator(`main #${id}`).count(), 1);
    assert.equal(await page.getByRole('table').count(), 1);
    assert.equal(await page.getByRole('table').getByRole('row').count(), 6);
    assert.ok(await page.getByRole('table').getByRole('columnheader').count() >= 3);
    for (const destination of ['examples/core/', 'examples/browser/', 'examples/astro/', 'examples/migration/', 'examples/api/', 'demo/', 'guide/overview/', 'reference/hosts/#starter-adoption-and-local-checks'])
      assert.ok(await page.locator(`main a[href="/raveldex/${destination}"]`).count(), destination);
    assert.equal(await page.locator('main input, main button').count(), 0);
    assert.equal(await page.locator('iframe').count(), 0);
    const local = requests.filter(r => new URL(r.url).pathname.startsWith('/raveldex/'));
    assert.equal(requests.length, local.length, 'Only local assets');
    assert.equal(local.filter(r => /\.json(?:\?|$)|-preview\/|\/demo\/|worker/i.test(new URL(r.url).pathname)).length, 0, JSON.stringify(requests));
    const scripts = [...new Set(local.filter(r => r.type === 'script').map(r => new URL(r.url).pathname))];
    assert.deepEqual(scripts.sort(), ['/raveldex/site-assets/search/main.mjs', '/raveldex/site-assets/shell.mjs']);
    assert.deepEqual(errors, []);
    if (process.env.RAVELDEX_GALLERY_REPORT) await writeFile(process.env.RAVELDEX_GALLERY_REPORT, JSON.stringify({ browser: browser.version(), requests, scripts, errors }, null, 2) + '\n');
  } finally { await page.close(); }
});

// Catches a gallery usable only with JS, duplicate/misordered tab stops, clipped labels and table overflow.
test('gallery supports no-JS keyboard navigation and narrow comparison', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 800 } });
  const page = await context.newPage(); page.setDefaultTimeout(5000);
  try {
    await page.goto(new URL('examples/', base).href);
    const gallery = page.locator('[data-solution-gallery]');
    assert.equal(await gallery.isVisible(), true);
    const links = gallery.getByRole('link');
    await links.first().focus();
    for (let i = 0; i < await links.count(); i++) {
      const active = links.nth(i);
      assert.equal(await active.evaluate(node => node === document.activeElement), true);
      assert.notEqual(await active.evaluate(node => getComputedStyle(node, node.matches('.solution-card__demo') ? '::after' : null).outlineStyle), 'none');
      if (i + 1 < await links.count()) await active.press('Tab');
    }
    await gallery.locator('[data-solution-demo]').first().press('Enter');
    assert.equal(new URL(page.url()).pathname, '/raveldex/examples/inline/');
    for (const id of anchors) {
      await page.goto(new URL(`examples/#${id}`, base).href);
      assert.equal(await page.locator(`#${id}`).isVisible(), true);
    }
    const table = page.getByRole('table');
    await table.focus(); await table.press('ArrowRight');
    assert.equal(await table.evaluate(node => node === document.activeElement), true, await page.evaluate(()=>({url:location.href,active:document.activeElement.outerHTML.slice(0,500)})));
    for (const width of [320, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px page overflow`);
    }
  } finally { await context.close(); }
});

test('gallery keeps focus and semantics in forced colors and reduced motion', async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } }); page.setDefaultTimeout(5000);
  try {
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await page.goto(new URL('examples/', base).href);
    const link = page.locator('[data-solution-demo]').first();
    await link.focus(); assert.notEqual(await link.evaluate(n => getComputedStyle(n, '::after').outlineStyle), 'none');
    await page.emulateMedia({ forcedColors: 'none' });
    await page.addScriptTag({ content: await readFile(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8') });
    const violations = await page.evaluate(async () => (await axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map(n => ({ id: n.id, targets: n.nodes.map(item => item.target) })));
    assert.deepEqual(violations, []);
  } finally { await page.close(); }
});

test('gallery comparison keeps readable columns accessible by keyboard at 320px', async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
  try {
    await page.goto(new URL('examples/#choose-a-search-solution', base).href);
    const table = page.getByRole('table');
    const widths = await table.locator('tbody tr').first().locator('td').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().width));
    assert.ok(widths.every(width => width >= 160), `Readable data columns, not single-word fragments: ${widths}`);
    await table.focus(); await table.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('table').scrollLeft > 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  } finally { await page.close(); }
});

test('gallery archive labels include their complete visible wording', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(new URL('examples/', base).href);
    const links = page.locator('main a[download]'); assert.equal(await links.count(), 8);
    const names = [];
    for (const link of await links.all()) {
      const visible = (await link.innerText()).replace(/\s+/g, ' ').trim();
      const name = await link.getAttribute('aria-label');
      assert.ok(name?.includes(visible), `Accessible name '${name}' includes '${visible}'`);
      names.push(name);
    }
    assert.equal(new Set(names).size, 8, 'Every download still identifies its exact project');
  } finally { await page.close(); }
});

test('gallery feature and recovery links reach the precise retained instructions', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(new URL('examples/', base).href);
    assert.equal(await page.getByRole('table').getByRole('link', { name: 'Page excerpts and topic filters', exact: true }).getAttribute('href'), '/raveldex/reference/hosts/#inline-result-pages-filters-and-snippets');
    const destinations = [];
    for (const [name, destination] of [
      ['Inline', 'examples/inline-browser/#loading-retry-and-disposal'],
      ['Modal', 'examples/modal-browser/#first-open-loading-retry-and-disposal'],
      ['Dropdown', 'examples/dropdown-browser/#loading-retry-and-cleanup'],
      ['Directory', 'examples/directory-browser/#keyboard-mobile-filters-and-recovery'],
      ['rich results', 'examples/cards-browser/#query-navigation-and-ownership'],
    ]) {
      const href = await page.locator('main').getByRole('link', { name, exact: true }).getAttribute('href');
      assert.equal(href, '/raveldex/' + destination); destinations.push(destination);
    }
    destinations.push('reference/hosts/#inline-result-pages-filters-and-snippets');
    for (const destination of destinations) {
      await page.goto(new URL(destination, base).href);
      assert.equal(await page.locator(`[id="${new URL(page.url()).hash.slice(1)}"]`).isVisible(), true);
    }
  } finally { await page.close(); }
});

// The taller live example must not stretch the static cards into empty columns.
test('home gallery keeps five compact choices alongside one working search', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(base);
    assert.equal(await page.locator('main h1').innerText(), 'Choose a search interface');
    assert.equal(await page.locator('iframe').count(), 0);
    await page.locator('.examples-gallery__live > img').evaluate(n => n.decode());
    assert.equal(await page.locator('.examples-gallery__live .solution-card__demo').getAttribute('href'), '/raveldex/examples/inline-preview/');
    const cards = page.locator('[data-solution-gallery] > li:not(.examples-gallery__live)');
    assert.equal(await cards.count(), 5);
    for (const width of [772, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const boxes = await page.locator('[data-solution-gallery] > li').evaluateAll(nodes => nodes.map(n => {
        const box = n.getBoundingClientRect(), link = n.querySelector('.solution-card__demo').getBoundingClientRect();
        return { top: box.top, height: box.height, linkBottom: link.bottom };
      }));
      for (let i = 0; i < boxes.length; i += 2) {
        assert.ok(Math.abs(boxes[i].top - boxes[i + 1].top) < 1);
        assert.ok(Math.abs(boxes[i].height - boxes[i + 1].height) < 1, `Row ${i / 2} heights differ at ${width}px`);
        assert.ok(Math.abs(boxes[i].linkBottom - boxes[i + 1].linkBottom) < 1, `Row links differ at ${width}px`);
      }
    }
    await page.setViewportSize({ width: 320, height: 800 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  } finally { await page.close(); }
});

// The stretched native link must cover cards without swallowing their separate setup links.
test('gallery cards open from their image and retain named keyboard and platform links', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.setDefaultTimeout(5000);
  try {
    for (const route of ['', 'examples/']) {
      await page.goto(new URL(route, base).href);
      const cards = page.locator('[data-solution-gallery] > li');
      for (let i = 0; i < 6; i++) {
        const card = cards.nth(i), link = card.locator('.solution-card__demo');
        const target = await link.getAttribute('href');
        await card.locator('img').scrollIntoViewIfNeeded();
        const image = await card.locator('img').boundingBox();
        await page.mouse.click(image.x + image.width / 2, image.y + image.height / 2);
        await page.waitForURL(url => url.pathname === target);
        await page.goBack();
        const current = cards.nth(i).locator('.solution-card__demo');
        assert.equal(await current.evaluate(n => n.firstChild.textContent), 'Open');
        const hidden = current.locator('.solution-card__destination');
        assert.ok((await hidden.textContent()).trim().length > 0);
        assert.ok((await hidden.boundingBox()).width <= 1);
        await current.focus(); await current.press('Enter');
        await page.waitForURL(url => url.pathname === target); await page.goBack();
      }
      const platform = cards.first().getByRole('link', { name: 'Astro', exact: true });
      await platform.click(); await page.waitForURL('**/examples/inline-astro/');
    }
  } finally { await page.close(); }
});
