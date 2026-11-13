import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { release } from 'node:os';
import { chromium } from 'playwright-core';
import { REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';
import { STARTERS, starterSource, starterArchive } from '../../site/starters.mjs';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';

const families = [
  { family: 'inline', title: 'Inline search starter preview', label: 'Search walking guides',
    recipe: 'Inline search theme properties', query: 'walking guide' },
  { family: 'modal', title: 'Documentation modal starter preview', label: 'Search the workshop guide',
    recipe: 'Documentation modal theme properties', query: 'workshop' },
  { family: 'dropdown', title: 'Dropdown header starter preview', label: 'Search walking guides',
    recipe: 'Dropdown search theme properties', query: 'walking guide' },
  { family: 'directory', title: 'Resource directory starter preview', label: 'Search walking resources',
    recipe: 'Resource directory theme properties', query: 'walking resource' },
  { family: 'cards', title: 'Rich resource results starter preview', label: 'Search walking resources',
    recipe: 'Rich result theme properties', query: 'walking resource' },
];
function prefixQuery(text) {
  const words = text.split(' '), last = words.pop();
  const ending = { kind: 'group', variants: [{ text: last, match: 'prefix' }] };
  return words.length ? { kind: 'and', children: [...words.map(text => ({ kind: 'text', text })), ending] } : ending;
}
async function independentResults(family, query) {
  const entries = JSON.parse(await readFile(join(REPO_ROOT, 'examples', family + '-browser', 'content.json'), 'utf8'));
  // These explicit source records are flattened independently. Neither a native
  // tokenizer/scorer nor the starter's section preparation helper is used.
  const records = entries.map(entry => ({ id: entry.id, text: { title: entry.title,
    body: entry.body ?? entry.sections.map(section => section.heading + '\n' + section.body).join('\n\n') } }));
  const schema = { text: { title: { boost: 2 }, body: {} } };
  return sourceQueryResult(scanSourceCorpus(records, schema), prefixQuery(query), { limit: 100 }).hits.map(hit => hit.id);
}
const ids = (frame, attribute) => frame.locator(`[${attribute}]`).evaluateAll((nodes, name) => nodes.map(node => node.getAttribute(name)), attribute);
async function readyInline(frame, total, shown, added = 0) {
  const status = added ? `Results added: ${added}. Showing 1–${shown} of ${total}.` : `${total} results. Showing ${shown}.`;
  await frame.locator('.raveldex-inline__status').filter({ hasText: status }).waitFor();
}
async function completeInline(frame, expected) {
  let visible = await ids(frame, 'data-raveldex-inline-result');
  assert.deepEqual(visible, expected.slice(0, 3));
  while (visible.length < expected.length) {
    const previous = visible, added = Math.min(3, expected.length - previous.length);
    await frame.getByRole('button', { name: 'Load more', exact: true }).click();
    await readyInline(frame, expected.length, previous.length + added, added);
    visible = await ids(frame, 'data-raveldex-inline-result');
    assert.deepEqual(visible, expected.slice(0, previous.length + added));
    assert.deepEqual(visible.slice(0, previous.length), previous);
  }
  assert.equal(await frame.locator('[data-raveldex-inline-next], [data-raveldex-inline-previous]').count(), 0);
  assert.equal(await frame.locator('[data-raveldex-inline-page-summary]').textContent(), `Showing 1–${expected.length} of ${expected.length}.`);
  return visible;
}
async function nativeSubmitFocus(input, root) {
  await input.focus(); await input.press('Tab');
  const focus = await root.evaluate(node => {
    const active = node.ownerDocument.activeElement, style = getComputedStyle(active);
    return { inside: node.contains(active), text: active.textContent, outline: style.outlineStyle, width: style.outlineWidth };
  });
  assert.equal(focus.inside, true); assert.equal(focus.text, 'Search');
  assert.notEqual(focus.outline, 'none'); assert.ok(parseFloat(focus.width) > 0);
  return focus;
}

test('five-solution chooser, complete starter inventories and published CSS preserve independent native results and focus', { timeout: 90_000 }, async () => {
  const server = spawn(process.execPath, ['scripts/preview-pages.mjs', '--port', '0'], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(server, 'exit'); let log = '', browser;
  server.stdout.on('data', bytes => { log += bytes; }); server.stderr.on('data', bytes => { log += bytes; });
  const observations = [], errors = [];
  try {
    const deadline = Date.now() + 20_000;
    while (!/Open http:\/\/127\.0\.0\.1:\d+\/raveldex\//.test(log)) {
      assert.equal(server.exitCode, null, log); assert.ok(Date.now() < deadline, log); await new Promise(resolve => setTimeout(resolve, 50));
    }
    const base = /Open (http:\/\/127\.0\.0\.1:\d+\/raveldex\/)/.exec(log)[1];
    browser = await chromium.launch({ ...(process.env.RAVELDEX_CANDIDATE_BROWSER === 'chromium' ? {} : { channel: 'chrome' }), headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } }); page.setDefaultTimeout(15_000);
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(new URL('examples/', base).href);
    for (const [name, family] of [['Open inline gallery', 'inline'], ['Open documentation modal gallery', 'modal'], ['Open compact dropdown gallery', 'dropdown'], ['Open directory gallery', 'directory'], ['Open rich-results gallery', 'cards']]) {
      assert.equal(new URL(await page.getByRole('link', { name, exact: true }).getAttribute('href'), base).pathname, `/raveldex/examples/${family}/`);
    }
    await page.getByRole('heading', { name: 'Choose a search solution', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Data and capabilities', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Keyboard and cleanup', exact: true }).waitFor();
    assert.equal(STARTERS.length, 8);
    for (const starter of STARTERS) assert.ok(await page.locator(`a[href="/raveldex/examples/${starter.id}/"]`).count(), `${starter.id} setup is discoverable`);

    for (const entry of families) {
      await page.goto(new URL(`examples/${entry.family}/`, base).href);
      const chooser = page.getByRole('navigation', { name: 'Search solutions', exact: true });
      assert.equal(await chooser.getByRole('link').count(), 5);
      for (const other of families) assert.equal(await chooser.locator(`a[href="/raveldex/examples/${other.family}/"]`).count(), 1);
      assert.equal(await chooser.locator('[aria-current="page"]').getAttribute('href'), `/raveldex/examples/${entry.family}/`);
      const selected = STARTERS.filter(starter => starter.family === entry.family);
      assert.equal(await page.getByRole('link', { name: 'Download the complete starter', exact: true }).count(), selected.length);
      for (const starter of selected) {
        assert.equal(await page.locator(`a[href="/raveldex/${starterArchive(starter.id)}"]`).count(), 1);
        assert.equal((await fetch(new URL(starterArchive(starter.id), base))).status, 200);
        for (const file of starter.files) assert.equal(await page.locator(`a[href="/raveldex/${starterSource(starter.id, file)}"]`).count(), 1, starter.id + '/' + file);
      }
      const preview = page.locator(`iframe[title="${entry.title}"]`); await preview.scrollIntoViewIfNeeded();
      const frame = page.frameLocator(`iframe[title="${entry.title}"]`), expected = await independentResults(entry.family, entry.query);
      assert.ok(expected.length > 3);
      if (entry.family === 'modal') await frame.getByRole('button', { name: 'Search documentation', exact: true }).click();
      const input = frame.getByRole(entry.family === 'dropdown' ? 'combobox' : 'searchbox', { name: entry.label, exact: true });
      await input.fill(entry.query); await input.press('Enter');
      const directory = entry.family === 'directory' || entry.family === 'cards';
      const attribute = directory ? 'data-raveldex-directory-result' : entry.family === 'dropdown' ? 'data-raveldex-dropdown-result' : 'data-raveldex-inline-result';
      if (directory) await frame.getByText(`${expected.length} results. Showing 1–3.`, { exact: true }).waitFor();
      else if (entry.family === 'dropdown') await frame.locator('[data-raveldex-dropdown-status]').filter({ hasText: `${expected.length} results. Showing 3` }).waitFor();
      else await readyInline(frame, expected.length, 3);
      const before = await ids(frame, attribute); assert.deepEqual(before, expected.slice(0, 3));
      const beforeURL = await frame.locator('html').evaluate(() => location.href);
      const recipe = page.getByRole('region', { name: entry.recipe, exact: true });
      assert.equal(await recipe.count(), 1, 'The focusable code recipe has a role that permits its accessible name');
      assert.equal(await recipe.getAttribute('tabindex'), '0');
      const css = await recipe.locator('code').innerText();
      await input.focus(); await frame.locator('head').evaluate((head, text) => { const style = head.ownerDocument.createElement('style'); style.textContent = text; head.append(style); }, css);
      assert.ok(await input.evaluate(node => node === node.ownerDocument.activeElement)); assert.deepEqual(await ids(frame, attribute), before);
      assert.equal(await frame.locator('html').evaluate(() => location.href), beforeURL);
      let styles, focus, complete;
      if (entry.family === 'inline' || entry.family === 'modal') {
        styles = await frame.locator('.raveldex-inline').evaluate(root => ({
          gap: getComputedStyle(root.querySelector('.raveldex-inline__form')).gap,
          accent: getComputedStyle(root.querySelector('.raveldex-inline__result-title')).color,
          radius: getComputedStyle(root.querySelector('.raveldex-inline__submit')).borderRadius,
        }));
        assert.equal(styles.accent, 'rgb(20, 91, 69)'); assert.equal(styles.gap, entry.family === 'inline' ? '20px' : '16px');
        if (entry.family === 'inline') assert.equal(styles.radius, '12px');
        if (entry.family === 'modal') {
          styles.modal = await frame.locator('.raveldex-modal').evaluate(dialog => ({ maxWidth: getComputedStyle(dialog).getPropertyValue('--raveldex-modal-max-width').trim(), radius: getComputedStyle(dialog).borderRadius, width: dialog.getBoundingClientRect().width }));
          assert.equal(styles.modal.maxWidth, '40rem'); assert.equal(styles.modal.radius, '12px'); assert.ok(styles.modal.width <= 640);
        }
        focus = await nativeSubmitFocus(input, frame.locator('.raveldex-inline'));
        await preview.scrollIntoViewIfNeeded(); complete = await completeInline(frame, expected);
      } else if (entry.family === 'dropdown') {
        styles = await frame.locator('.raveldex-dropdown').evaluate(root => ({ accent: getComputedStyle(root).getPropertyValue('--raveldex-dropdown-accent').trim(), gap: getComputedStyle(root).getPropertyValue('--raveldex-dropdown-gap').trim(), radius: getComputedStyle(root.querySelector('input')).borderRadius }));
        assert.deepEqual(styles, { accent: '#145b45', gap: '.75rem', radius: '12px' });
        const full = frame.locator('[data-raveldex-dropdown-full-results]'), destination = new URL(await full.getAttribute('href'), base);
        assert.equal(destination.searchParams.get('q'), entry.query); assert.equal(destination.pathname, '/raveldex/examples/dropdown-preview/search/');
        const inner = page.frames().find(candidate => candidate.parentFrame() === page.mainFrame()); assert.ok(inner);
        await full.focus(); focus = await full.evaluate(node => ({ text: node.textContent, outline: getComputedStyle(node).outlineStyle })); assert.notEqual(focus.outline, 'none');
        await Promise.all([inner.waitForURL(destination.href), full.press('Enter')]); await readyInline(frame, expected.length, 3);
        assert.equal(await frame.locator('[data-raveldex-inline-input]').inputValue(), entry.query);
        assert.deepEqual(await ids(frame, 'data-raveldex-inline-result'), before);
        complete = await completeInline(frame, expected);
      } else {
        styles = await frame.locator('.raveldex-directory').evaluate(root => ({ accent: getComputedStyle(root.querySelector('a')).color, radius: getComputedStyle(root).borderRadius, gap: getComputedStyle(root).getPropertyValue('--raveldex-directory-gap').trim() }));
        assert.equal(styles.accent, 'rgb(20, 91, 69)'); assert.equal(styles.radius, '12px');
        if (entry.family === 'directory') assert.equal(styles.gap, '1.25rem');
        focus = await nativeSubmitFocus(input, frame.locator('.raveldex-directory'));
        if (entry.family === 'cards') {
          assert.equal(await frame.locator('[data-directory-root] img').count(), 0);
          await frame.getByLabel('Layout', { exact: true }).selectOption('grid'); await frame.getByLabel('Density', { exact: true }).selectOption('compact');
          assert.deepEqual(await ids(frame, attribute), before); assert.equal(await frame.locator('html').evaluate(() => location.href), beforeURL);
          styles.card = await frame.locator('[data-raveldex-directory-result]').first().evaluate(node => ({ radius: getComputedStyle(node).borderRadius, layout: getComputedStyle(node.parentElement).display, gap: getComputedStyle(node.parentElement).gap }));
          assert.deepEqual(styles.card, { radius: '16px', layout: 'grid', gap: '20px' });
        }
        complete = [];
        for (let number = 1; number <= 3; number++) {
          assert.deepEqual(await ids(frame, attribute), expected.slice((number - 1) * 3, number * 3)); complete.push(...await ids(frame, attribute));
          if (number < 3) { await frame.getByRole('button', { name: 'Next page', exact: true }).click(); await frame.getByText(`Page ${number + 1} of 3.`, { exact: true }).waitFor(); }
        }
        if (entry.family === 'cards') {
          await input.fill('symbols'); await input.press('Enter'); await frame.getByText('1 result. Showing 1–1.', { exact: true }).waitFor();
          const imageIDs = await ids(frame, attribute); assert.deepEqual(imageIDs, await independentResults('cards', 'symbols'));
          await frame.getByRole('checkbox', { name: 'Show images', exact: true }).check();
          await frame.locator('img').scrollIntoViewIfNeeded(); await frame.locator('img').evaluate(node => node.decode());
          assert.deepEqual(await ids(frame, attribute), imageIDs); assert.equal(await frame.locator('img').getAttribute('alt'), 'A blue route crosses green hills on a simplified walking map.');
          await frame.getByRole('checkbox', { name: 'Show images', exact: true }).uncheck(); assert.equal(await frame.locator('[data-directory-root] img').count(), 0);
          styles.imageOptIn = { nativeIDs: imageIDs, decoded: true, initialImageElements: 0, disabledImageElements: 0 };
        }
      }
      assert.deepEqual(complete, expected);
      observations.push({ family: entry.family, starterIDs: selected.map(starter => starter.id), originalSourceFiles: selected.reduce((sum, starter) => sum + starter.files.length, 0), initialIDs: before, completeIDs: complete, exactTotal: expected.length, styles, focus });
    }
    assert.deepEqual(errors, []);
    if (process.env.RAVELDEX_SOLUTIONS_SITE_REPORT) await writeFile(process.env.RAVELDEX_SOLUTIONS_SITE_REPORT, JSON.stringify({ environment: { node: process.version, browser: browser.version(), platform: process.platform, arch: process.arch, osRelease: release() }, observations, pageErrors: errors,
      scope: 'All five generated galleries and their existing installed previews. Explicit eight-starter source/archive links, independent source oracle for native IDs/order/pages, generated public-output CSS cascade, native keyboard focus, raw-query full-results navigation and explicit image decoding. Fresh installation/root-subdirectory edits, failure/lifecycle and physical/human/actual-zoom qualification are separate checks.' }, null, 2) + '\n');
  } finally { await browser?.close(); if (server.exitCode === null && server.signalCode === null) server.kill('SIGTERM'); await exited; }
});
