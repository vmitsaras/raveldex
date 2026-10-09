import assert from 'node:assert/strict';
import { test, before, beforeEach, afterEach, after } from 'node:test';
import { chromium } from 'playwright-core';
import { prepareBrowserQualification } from '../qualification/browser-serve.mjs';

let fixture, browser, context, page, errors, expectedPageError;
const hook = name => `[data-raveldex-${name}]`;
const snapshot = () => page.evaluate(() => window.announcementProbe.snapshot());
async function open(mode, busyScope = 'shell') {
  await page.evaluate(() => window.harness?.cleanup());
  await page.goto(`${fixture.origin}/ui-announcements?mode=${encodeURIComponent(mode)}&busy=${encodeURIComponent(busyScope)}`);
  await page.waitForFunction(() => window.announcementProbe && document.querySelector('[data-raveldex-status]')?.textContent === '9 results. Showing 1–3.'
    && window.announcementProbe.snapshot().current.requestedBusy === 'false');
  if (mode !== 'original') await page.waitForFunction(() => window.announcementProbe.snapshot().publishedCount === 1);
}
async function search(text, expected) {
  const before = await snapshot();
  await page.locator(hook('input')).fill(text); await page.locator(hook('input')).press('Enter');
  await page.waitForFunction(({ count, expected }) => {
    const actual = window.announcementProbe.snapshot();
    return actual.publishedCount > count && actual.lastPublication?.text === expected;
  }, { count: before.publishedCount, expected });
  return snapshot();
}
before(async () => {
  fixture = await prepareBrowserQualification();
  browser = await chromium.launch({ channel: 'chrome', headless: true, timeout: 30_000 });
  assert.ok(fixture.report.graphs['browser-announcements.mjs'].inputs.some(input => input.path.includes('dist/addons/ui/')));
  console.log(JSON.stringify({ qualification: 'Announcement policy DOM regression; no speech/AT observation.',
    installedDirectory: fixture.directory, browser: browser.version(), headless: true,
    bundleSha256: fixture.report.graphs['browser-announcements.mjs'].sha256 }));
}, { timeout: 120_000 });
beforeEach(async () => {
  context = await browser.newContext(); page = await context.newPage(); errors = []; expectedPageError = false;
  await page.addInitScript(() => {
    window.shellBusyMutations = [];
    new MutationObserver(changes => {
      for (const change of changes) {
        if (change.type === 'attributes' && change.target.hasAttribute('data-raveldex-ui'))
          window.shellBusyMutations.push({ old: change.oldValue, current: change.target.getAttribute('aria-busy') });
        for (const node of change.addedNodes) {
          if (!(node instanceof Element)) continue;
          const shell = node.matches('[data-raveldex-ui]') ? node : node.querySelector('[data-raveldex-ui]');
          if (shell?.hasAttribute('aria-busy')) window.shellBusyMutations.push({ inserted: shell.getAttribute('aria-busy') });
        }
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['aria-busy'] });
  });
  page.on('pageerror', error => errors.push(error.message));
});
afterEach(async () => {
  try {
    if (expectedPageError) assert.deepEqual(errors, [expectedPageError]);
    else assert.deepEqual(errors, []);
    await page.evaluate(() => window.harness?.cleanup());
  } finally { await context?.close(); }
});
after(async () => { try { await browser?.close(); } finally { await fixture?.close(); } });

test('fixed original, settled polite and settled assertive policies preserve the installed result presentation', async () => {
  for (const busyScope of ['shell', 'off', 'results']) {
  for (const mode of ['original', 'settled-polite', 'settled-assertive']) {
    await open(mode, busyScope);
    const state = await snapshot(), output = page.locator('#announcement-output'), status = page.locator(hook('status'));
    assert.equal(state.mode, mode);
    assert.equal(state.busyScope, busyScope);
    assert.equal(state.current.busy, busyScope === 'shell' ? 'false' : null);
    assert.equal(state.current.resultsBusy, busyScope === 'results' ? 'false' : null);
    assert.equal(await output.evaluate(node => !document.getElementById('fixture-root').contains(node)), true);
    assert.equal(await status.getAttribute('role'), 'status');
    assert.equal(await status.getAttribute('aria-atomic'), 'true');
    assert.equal(await status.getAttribute('aria-live'), mode === 'original' ? null : 'off');
    assert.equal(await output.getAttribute('aria-live'), mode === 'original' ? null : mode === 'settled-polite' ? 'polite' : 'assertive');
    assert.equal(await output.getAttribute('role'), mode === 'original' ? null : 'status');
    assert.equal(await output.innerText(), mode === 'original' ? '' : '9 results. Showing 1–3.');
    assert.equal(state.publishedCount, mode === 'original' ? 0 : 1);
    if (mode !== 'original') {
      const publication = state.rows.findLast(row => row.kind === 'publish');
      assert.equal(publication.requestedBusy, 'false');
      assert.equal(publication.main.completed, true); assert.equal(publication.snippets.completed, true);
      assert.equal(publication.main.revision, publication.snippets.revision);
    }
  }
  }
});

for (const busyScope of ['off', 'results']) test(`${busyScope} intercepts busy before mount, preserves settled gates and isolates unrelated/Inspector writes`, async () => {
  for (const mode of ['original', 'settled-polite', 'settled-assertive']) {
    await open(mode, busyScope);
    await page.evaluate(() => { window.harness.state.holdNext = true; });
    await page.locator(hook('input')).fill('red'); await page.locator(hook('input')).press('Enter');
    await page.waitForFunction(() => window.harness.state.pending.length === 1);
    const held = await snapshot();
    assert.equal(held.current.busy, null);
    assert.equal(held.current.requestedBusy, 'true');
    assert.equal(held.current.resultsBusy, busyScope === 'results' ? 'true' : null);
    assert.equal(held.publishedCount, mode === 'original' ? 0 : 1);
    assert.equal(await page.locator(hook('status')).evaluate(node => node.closest('[aria-busy]') === null), true);
    assert.equal(await page.locator(hook('input')).evaluate(node => node.closest('[aria-busy]') === null && node === document.activeElement), true);
    await page.evaluate(() => window.harness.release());
    await page.waitForFunction(() => window.announcementProbe.snapshot().current.requestedBusy === 'false'
      && document.querySelector('[data-raveldex-status]').textContent === '7 results. Showing 1–3.');
    const completed = await snapshot();
    assert.equal(completed.publishedCount, mode === 'original' ? 0 : 2);
    if (mode !== 'original') assert.equal(completed.lastPublication.text, '7 results. Showing 1–3.');
    assert.deepEqual(await page.evaluate(() => {
      const unrelated = document.createElement('section'); unrelated.setAttribute('data-raveldex-ui', '');
      unrelated.setAttribute('aria-busy', 'true');
      const dialog = document.querySelector('[data-raveldex-inspector]'); dialog.setAttribute('aria-busy', 'true');
      const values = [unrelated.getAttribute('aria-busy'), dialog.getAttribute('aria-busy')];
      dialog.setAttribute('aria-busy', 'false'); return values;
    }), ['true', 'true']);
    await page.locator('#destroy-ui').click(); await page.locator('#remount-ui').click();
    await page.waitForFunction(() => window.announcementProbe.snapshot().current.requestedBusy === 'false'
      && document.querySelector('[data-raveldex-status]').textContent === '9 results. Showing 1–3.');
    assert.equal((await snapshot()).current.busy, null);
    assert.deepEqual(await page.evaluate(() => window.shellBusyMutations), []);
    await page.locator('#inject-error').click();
    await page.locator(hook('input')).fill('blue'); await page.locator(hook('input')).press('Enter');
    await page.waitForFunction(() => window.announcementProbe.snapshot().current.requestedBusy === 'false'
      && document.querySelector('[data-raveldex-status]').textContent === 'Search failed. Retry is available.');
    if (mode !== 'original') assert.equal((await snapshot()).lastPublication.kind, 'error');
    await page.locator(hook('retry')).click();
    await page.waitForFunction(() => window.announcementProbe.snapshot().current.requestedBusy === 'false'
      && document.querySelector('[data-raveldex-status]').textContent === '1 results. Showing 1–1.');
    if (mode !== 'original') assert.equal((await snapshot()).lastPublication.text, '1 results. Showing 1–1.');
    assert.deepEqual(await page.evaluate(() => window.shellBusyMutations), []);
  }
});

test('settled polite skips waiting, stale replies and composing work, republishes repeated submissions and bounds its trace', async () => {
  await open('settled-polite');
  await page.evaluate(() => { window.harness.state.holdNext = true; });
  await page.locator(hook('input')).fill('red'); await page.locator(hook('input')).press('Enter');
  await page.waitForFunction(() => window.harness.state.pending.length === 1);
  assert.equal((await snapshot()).publishedCount, 1);
  assert.equal(await page.locator(hook('status')).innerText(), 'Searching…');
  const blue = await search('blue', '1 results. Showing 1–1.');
  assert.equal(blue.publishedCount, 2);
  assert.equal(await page.locator(hook('input')).evaluate(node => node === document.activeElement), true);
  await page.evaluate(() => window.harness.release());
  await page.waitForFunction(() => window.harness.state.calls.find(call => call.query.text === 'red')?.completed);
  assert.equal((await snapshot()).publishedCount, 2);
  const beforeCalls = await page.evaluate(() => window.harness.state.calls.length);
  await page.evaluate(() => {
    const input = document.querySelector('[data-raveldex-input]');
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.value = 're'; input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    input.form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
  });
  assert.equal(await page.evaluate(() => window.harness.state.calls.length), beforeCalls);
  assert.equal((await snapshot()).publishedCount, 2);
  await page.evaluate(() => {
    const input = document.querySelector('[data-raveldex-input]'); input.value = 'red';
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: false }));
  });
  await page.waitForFunction(() => window.announcementProbe.snapshot().publishedCount === 3);
  assert.equal((await snapshot()).lastPublication.text, '7 results. Showing 1–3.');
  await page.locator(hook('input')).press('Enter');
  await page.waitForFunction(() => window.announcementProbe.snapshot().publishedCount === 4);
  const repeated = await snapshot();
  const publications = repeated.rows.filter(row => row.kind === 'publish');
  assert.notEqual(publications.at(-1).generation, publications.at(-2).generation);
  assert.equal(publications.at(-1).publication.text, publications.at(-2).publication.text);
  assert.equal(publications.some(row => row.publication.text === 'Searching…' || row.publication.text === 'Waiting to search…'), false);
  await page.evaluate(() => {
    const input = document.querySelector('[data-raveldex-input]');
    for (let i = 0; i < 220; i++) { input.value = `pending${i}`; input.dispatchEvent(new Event('input', { bubbles: true })); }
    input.value = 'blue'; input.form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => window.announcementProbe.snapshot().publishedCount === 5);
  const bounded = await snapshot();
  assert.equal(bounded.rows.length, 200); assert.ok(bounded.droppedRows > 0);
  assert.equal(bounded.lastPublication.text, '1 results. Showing 1–1.');
});

test('settled assertive publishes empty/errors/retry and keeps the external node through destroy/remount', async () => {
  await open('settled-assertive');
  await search('unmatched_rx4002_word', 'No results.');
  await page.locator('#inject-error').click();
  const failure = await search('blue', 'Search failed. Retry is available.');
  assert.equal(failure.lastPublication.kind, 'error');
  assert.equal(await page.locator(hook('input')).evaluate(node => node === document.activeElement), true);
  await page.locator(hook('retry')).click();
  await page.waitForFunction(() => window.announcementProbe.snapshot().lastPublication?.text === '1 results. Showing 1–1.');
  const node = await page.locator('#announcement-output').elementHandle();
  await page.evaluate(() => { window.harness.state.holdNext = true; });
  await page.locator(hook('input')).fill('red'); await page.locator(hook('input')).press('Enter');
  await page.waitForFunction(() => window.harness.state.pending.length === 1);
  const before = await snapshot();
  await page.locator('#destroy-ui').click();
  assert.equal(await page.locator('#authored').count(), 1);
  await page.evaluate(() => window.harness.release());
  await page.waitForFunction(() => window.harness.state.calls.findLast(call => call.query.text === 'red')?.completed);
  assert.equal((await snapshot()).publishedCount, before.publishedCount);
  await page.locator('#remount-ui').click();
  await page.waitForFunction(count => window.announcementProbe.snapshot().publishedCount === count + 1, before.publishedCount);
  assert.equal((await snapshot()).lastPublication.text, '9 results. Showing 1–3.');
  assert.equal(await page.locator(hook('status')).getAttribute('aria-live'), 'off');
  assert.equal(await node.evaluate(element => element === document.getElementById('announcement-output')), true);
  assert.equal(await page.locator('#announcement-output').getAttribute('aria-live'), 'assertive');
});

test('unknown policy fails explicitly before mounting the fixture', async () => {
  expectedPageError = 'Unknown announcement comparison mode.';
  await page.goto(`${fixture.origin}/ui-announcements?mode=unknown`);
  await page.waitForFunction(() => document.getElementById('announcement-mode').textContent.includes('unknown mode unknown'));
  assert.equal(await page.locator(hook('ui')).count(), 0);
  assert.equal(await page.locator('#announcement-output').getAttribute('role'), null);
  assert.equal(await page.evaluate(() => typeof window.harness), 'undefined');
});

test('unknown busy scope fails explicitly before mounting the fixture', async () => {
  expectedPageError = 'Unknown announcement busy scope.';
  await page.goto(`${fixture.origin}/ui-announcements?mode=settled-polite&busy=unknown`);
  await page.waitForFunction(() => document.getElementById('announcement-mode').textContent.includes('unknown busy scope unknown'));
  assert.equal(await page.locator(hook('ui')).count(), 0);
  assert.equal(await page.locator('#announcement-output').getAttribute('role'), null);
  assert.equal(await page.evaluate(() => typeof window.harness), 'undefined');
});
