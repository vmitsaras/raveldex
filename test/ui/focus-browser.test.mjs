import assert from 'node:assert/strict';
import { test, before, beforeEach, afterEach, after } from 'node:test';
import { chromium } from 'playwright-core';
import { prepareBrowserQualification } from '../qualification/browser-serve.mjs';

let fixture, browser, context, page, errors, expectedError;
const snapshot = () => page.evaluate(() => window.focusProbe.snapshot());
const hook = name => `[data-raveldex-${name}]`;
const settled = text => page.waitForFunction(expected => document.querySelector('[data-raveldex-status]')?.textContent === expected
  && document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') === 'false', text);
before(async () => {
  fixture = await prepareBrowserQualification();
  const browserChannel = process.env.RAVELDEX_UI_BROWSER ?? 'chrome';
  assert.ok(['chrome', 'chromium'].includes(browserChannel), 'RAVELDEX_UI_BROWSER must be chrome or chromium');
  browser = await chromium.launch({ ...(browserChannel === 'chrome' ? { channel: 'chrome' } : {}), headless: true, timeout: 30_000 });
  const original = fixture.report.graphs['browser-ui-driver.mjs'].inputs;
  const observed = fixture.report.graphs['browser-focus.mjs'].inputs;
  for (const row of original) assert.equal(observed.find(input => input.path === row.path)?.sha256, row.sha256);
  console.log(JSON.stringify({ scope: 'DOM focus observer regression only; no VoiceOver, speech or physical-input observation.',
    browser: browser.version(), packageSha256: fixture.package.sha256,
    bundleSha256: fixture.report.graphs['browser-focus.mjs'].sha256 }));
}, { timeout: 120_000 });
beforeEach(async () => {
  context = await browser.newContext(); page = await context.newPage(); errors = []; expectedError = undefined;
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(fixture.origin + '/ui-focus'); await page.waitForFunction(() => !!window.focusProbe);
  await settled('9 results. Showing 1–3.');
});
afterEach(async () => {
  try { assert.deepEqual(errors, expectedError ? [expectedError] : []); await page.evaluate(() => window.harness?.cleanup()); }
  finally { await context?.close(); }
});
after(async () => { try { await browser?.close(); } finally { await fixture?.close(); } });

test('opt-in observer keeps original UI policy and ordinary page untouched, with no competing live output', async () => {
  await page.locator(hook('input')).fill('red'); await settled('7 results. Showing 1–3.');
  assert.deepEqual((await snapshot()).rows, []);
  assert.equal(await page.locator(hook('status')).getAttribute('role'), 'status');
  assert.equal(await page.locator(hook('status')).getAttribute('aria-live'), null);
  assert.equal(await page.locator(hook('ui')).getAttribute('aria-busy'), 'false');
  for (const id of ['focus-recording-state', 'focus-trace']) {
    assert.equal(await page.locator(`#${id}`).getAttribute('role'), null);
    assert.equal(await page.locator(`#${id}`).getAttribute('aria-live'), null);
  }
  assert.equal((await snapshot()).session.packageSha256, fixture.package.sha256);
  await page.goto(fixture.origin + '/ui'); await page.waitForFunction(() => !!window.harness);
  assert.equal(await page.evaluate(() => typeof window.focusProbe), 'undefined');
  assert.equal(await page.locator('#focus-start').count(), 0);
});

test('trusted automated activation and Tab capture separate pre-default focus from a later task without adding heading stops', async () => {
  await page.locator('#focus-start').click();
  await page.locator(hook('input')).fill('red'); await settled('7 results. Showing 1–3.');
  await page.locator(hook('input')).focus(); await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.focusProbe.snapshot().rows.some(row => row.kind === 'after-event-task'
    && row.key === 'Tab' && row.current.focus.hooks.includes('data-raveldex-submit')));
  const beforeModalTabs = (await snapshot()).rows.filter(row => row.key === 'Tab' && row.kind === 'after-event-task').length;
  await page.locator(hook('inspect')).click();
  await page.waitForFunction(() => window.focusProbe.snapshot().rows.some(row => row.kind === 'after-event-task'
    && row.target?.hooks.includes('data-raveldex-inspect')));
  let state = await snapshot();
  assert.ok(state.rows.some(row => row.event === 'click' && row.isTrusted && row.kind === 'event-capture'
    && row.target.hooks.includes('data-raveldex-inspect') && !row.current.dialogOpen));
  assert.ok(state.rows.some(row => row.event === 'click' && row.kind === 'after-event-task'
    && row.current.dialogOpen && row.current.focus.hooks.includes('data-raveldex-inspector-close')));
  const heading = page.locator('dialog h2'); assert.equal(await heading.getAttribute('tabindex'), null);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  await page.waitForFunction(count => window.focusProbe.snapshot().rows.filter(row => row.event === 'keydown'
    && row.key === 'Tab' && row.kind === 'after-event-task').length === count + 3, beforeModalTabs);
  state = await snapshot();
  assert.equal(state.rows.filter(row => row.event === 'keydown' && row.key === 'Tab' && row.kind === 'event-capture').length, beforeModalTabs + 3);
  assert.equal(state.rows.some(row => row.event === 'focusin' && row.target?.tag === 'h2'), false);
  assert.deepEqual(state.rows.filter(row => row.key === 'Tab' && row.kind === 'after-event-task').at(-1).current.focus, state.current.focus);
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('dialog').open);
  assert.equal((await snapshot()).current.focus.hooks.includes('data-raveldex-inspect'), true);
  await page.locator('#focus-stop').click();
  const saved = JSON.parse(await page.locator('#focus-trace').inputValue());
  assert.equal(saved.recording, false); assert.equal(saved.current.focus.id, 'focus-stop');
  const count = saved.rows.length;
  await page.locator(hook('input')).fill('atomic'); await settled('1 result. Showing 1–1.');
  assert.equal((await snapshot()).rows.length, count);
  assert.equal(await page.locator('#focus-trace').inputValue(), JSON.stringify(saved, null, 2));
});

test('bounded trace reports dropped rows and truncated query, ignores outside typing and cancels pending samples on restart', async () => {
  await page.locator('#focus-start').click();
  await page.evaluate(() => {
    const input = document.querySelector('[data-raveldex-input]'); input.value = 'a'.repeat(600);
    for (let i = 0; i < 350; i++) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    const outside = document.getElementById('focus-trace'); outside.value = 'excluded-outside-test-text';
    outside.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  let state = await snapshot();
  assert.equal(state.rows.length, 300); assert.ok(state.droppedRows > 0);
  assert.ok(state.droppedDeferredSamples > 0);
  assert.equal(state.current.query.codeUnits, 600); assert.equal(state.current.query.text.length, 256);
  assert.equal(JSON.stringify(state).includes('excluded-outside-test-text'), false);
  assert.ok(state.rows.some(row => row.event === 'keydown' && row.isTrusted === false));
  // Start/stop in the same task as new event dispatch: no deferred row may
  // contaminate a restarted session or mutate the serialized stopped trace.
  await page.evaluate(() => {
    document.getElementById('focus-start').click();
    document.querySelector('[data-raveldex-input]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    document.getElementById('focus-stop').click(); document.getElementById('focus-start').click();
  });
  await page.waitForTimeout(30);
  state = await snapshot(); assert.equal(state.droppedRows, 0); assert.equal(state.rows.length, 1);
  assert.equal(state.rows[0].kind, 'start'); assert.equal(await page.locator('#focus-trace').inputValue(), '');
});

test('identity failure disables recording without breaking the original search UI', async () => {
  await page.evaluate(() => window.harness.cleanup());
  await page.route('**/matrix/session', route => route.fulfill({ status: 503, body: '{}' }));
  expectedError = 'Focus observation package identity is unavailable.';
  await page.goto(fixture.origin + '/ui-focus');
  await page.getByText('Focus observation setup failed. Reload to retry.', { exact: true }).waitFor();
  assert.equal(await page.locator('#focus-start').isDisabled(), true);
  assert.equal(await page.locator('#focus-stop').isDisabled(), true);
  assert.equal(await page.evaluate(() => typeof window.focusProbe), 'undefined');
  await page.locator(hook('input')).fill('red'); await settled('7 results. Showing 1–3.');
});
