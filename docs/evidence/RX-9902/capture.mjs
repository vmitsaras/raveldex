// RX-9902 local evidence only. Run against the strict Pages preview, never a docs-wide server.
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { release } from 'node:os';
const [base, phase = 'baseline'] = process.argv.slice(2);
if (!base || !['baseline', 'final'].includes(phase)) throw new Error('Usage: node capture.mjs BASE baseline|final');
const directory = new URL(`./${phase}/`, import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await readFile('docs/_pages-manifest.json', 'utf8'));
const report = { phase, environment: { node: process.version, browser: browser.version(), platform: process.platform, arch: process.arch, osRelease: release() }, manifest, captures: [] };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 680 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(15000);
  if (phase === 'baseline') {
    for (const family of ['inline', 'modal', 'dropdown', 'directory', 'cards']) {
      await page.goto(new URL(`examples/${family}-preview/`, base).href);
      if (family === 'modal') await page.getByRole('button', { name: 'Search documentation', exact: true }).click();
      if (family === 'cards') {
        await page.locator('[data-raveldex-directory-result]').first().waitFor();
        await page.getByLabel('Layout', { exact: true }).selectOption('grid');
      }
      const label = family === 'modal' ? 'Search the workshop guide' : ['directory', 'cards'].includes(family) ? 'Search walking resources' : 'Search walking guides';
      const input = page.getByRole(family === 'dropdown' ? 'combobox' : 'searchbox', { name: label, exact: true });
      await input.fill(family === 'modal' ? 'workshop' : ['directory', 'cards'].includes(family) ? 'walking resource' : 'walking guide');
      await input.press('Enter');
      const results = page.locator(family === 'dropdown' ? '[data-raveldex-dropdown-result]' : ['directory', 'cards'].includes(family) ? '[data-raveldex-directory-result]' : '[data-raveldex-inline-result]');
      await results.first().waitFor();
      if (family !== 'dropdown') await input.blur();
      if (['directory', 'cards'].includes(family)) await page.evaluate(() => scrollTo(0, document.querySelector('[data-directory-root]').getBoundingClientRect().top + scrollY - 20));
      const image = await page.screenshot({ path: new URL(`${family}.png`, directory).pathname });
      report.captures.push({ family, route: new URL(page.url()).pathname, viewport: { width: 960, height: 680 }, file: `${family}.png`, sha256: hash(image), query: await input.inputValue(), resultIDs: await results.evaluateAll(nodes => nodes.map(n => n.dataset.raveldexInlineResult ?? n.dataset.raveldexDropdownResult ?? n.dataset.raveldexDirectoryResult)) });
    }
  }
  const anchors = [];
  for (const width of phase === 'baseline' ? [1440, 320] : [1440, 1280, 768, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(new URL('examples/', base).href);
    await page.evaluate(() => document.fonts.ready);
    for (const img of await page.locator('img').all()) {
      await img.scrollIntoViewIfNeeded(); await img.evaluate(img => img.decode());
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: new URL(`examples-${width}.png`, directory).pathname, fullPage: true });
    anchors.push(...await page.locator('main [id]').evaluateAll(nodes => nodes.map(n => n.id)));
    report.captures.push({ route: '/raveldex/examples/', width, height: 1000, file: `examples-${width}.png`, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1) });
  }
  report.anchors = [...new Set(anchors)];
  await writeFile(new URL('inventory.json', directory), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ phase, environment: report.environment, captures: report.captures, anchors: report.anchors }));
} finally { await browser.close(); }
