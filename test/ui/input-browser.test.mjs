import assert from 'node:assert/strict';
import { test, before, beforeEach, afterEach, after } from 'node:test';
import { chromium } from 'playwright-core';
import { prepareBrowserQualification } from '../qualification/browser-serve.mjs';

let fixture, browser, context, page, errors, expectedError;
const input = () => page.locator('[data-raveldex-input]');
const snapshot = () => page.evaluate(() => window.inputProbe.snapshot());
const mainRows = state => state.rows.filter(row => row.kind === 'search-call' && row.phase === 'main');
const settled = text => page.waitForFunction(expected => document.querySelector('[data-raveldex-status]')?.textContent === expected
  && document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') === 'false', text);
before(async () => {
  fixture = await prepareBrowserQualification();
  const browserChannel = process.env.RAVELDEX_UI_BROWSER ?? 'chrome';
  assert.ok(['chrome', 'chromium'].includes(browserChannel), 'RAVELDEX_UI_BROWSER must be chrome or chromium');
  browser = await chromium.launch({ ...(browserChannel === 'chrome' ? { channel: 'chrome' } : {}), headless: true, timeout: 30_000 });
  console.log(JSON.stringify({ scope: 'Input trace instrumentation regression; no physical/OS IME/AT qualification.',
    browser: browser.version(), packageSha256: fixture.package.sha256,
    bundleSha256: fixture.report.graphs['browser-input.mjs'].sha256 }));
}, { timeout: 120_000 });
beforeEach(async () => {
  context = await browser.newContext(); page = await context.newPage(); errors = []; expectedError = undefined;
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(fixture.origin + '/ui-input');
  await page.waitForFunction(() => !!window.inputProbe);
  await settled('9 results. Showing 1–3.');
});
afterEach(async () => {
  try { assert.deepEqual(errors, expectedError ? [expectedError] : []); await page.evaluate(() => window.harness?.cleanup()); }
  finally { await context?.close(); }
});
after(async () => { try { await browser?.close(); } finally { await fixture?.close(); } });

test('opt-in trace leaves original UI policy intact, records automated trusted input honestly and stops without stealing focus', async () => {
  await input().fill('blue'); await input().press('Enter'); await settled('1 results. Showing 1–1.');
  assert.deepEqual((await snapshot()).rows, []);
  await page.locator('#input-source').fill('German (test operator label)');
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await input().fill(''); await input().focus(); await page.keyboard.type('red'); await input().press('Enter');
  await settled('7 results. Showing 1–3.');
  const state = await snapshot();
  assert.equal(state.session.packageSha256, fixture.package.sha256);
  assert.equal(state.session.inputSource.text, 'German (test operator label)');
  assert.ok(state.rows.some(row => row.event === 'beforeinput' && row.isTrusted === true && row.inputType === 'insertText'));
  assert.ok(state.rows.some(row => row.event === 'input' && row.isTrusted === true && row.data?.text === 'd'));
  assert.ok(mainRows(state).some(row => JSON.parse(row.query.text).text === 'red'));
  assert.ok(state.rows.some(row => row.event === 'submit' && row.kind === 'event-bubble-after-ui'
    && row.isTrusted === true && row.defaultPrevented));
  assert.equal(state.current.focus.hooks.includes('data-raveldex-input'), true);
  assert.equal(await page.locator('[data-raveldex-status]').getAttribute('aria-live'), null);
  assert.equal(await page.locator('[data-raveldex-ui]').getAttribute('aria-busy'), 'false');
  await page.getByRole('button', { name: 'Stop and show trace', exact: true }).click();
  const saved = JSON.parse(await page.locator('#input-trace').inputValue());
  assert.equal(saved.recording, false); assert.equal(saved.current.focus.id, 'input-stop');
  const count = saved.rows.length;
  await input().fill('atomic'); await input().press('Enter'); await settled('1 results. Showing 1–1.');
  assert.equal((await snapshot()).rows.length, count);
  assert.equal(await page.locator('#input-trace').inputValue(), JSON.stringify(saved, null, 2));
  await page.goto(fixture.origin + '/ui'); await page.waitForFunction(() => !!window.harness);
  assert.equal(await page.evaluate(() => typeof window.inputProbe), 'undefined');
});

test('synthetic precommit/submit/finalcommit is marked untrusted and correlates actual UI search calls after composition', async () => {
  await page.locator('#input-start').click(); await input().focus();
  await page.evaluate(() => {
    const node = document.querySelector('[data-raveldex-input]');
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    node.value = 'caf';
    node.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: 'caf' }));
    node.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, data: 'caf', isComposing: true, inputType: 'insertCompositionText' }));
    node.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'caf', isComposing: true, inputType: 'insertCompositionText' }));
    node.form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
  });
  // Longer than the unchanged 35ms debounce, while composition is still open.
  await page.waitForTimeout(100);
  const precommit = await snapshot();
  assert.equal(mainRows(precommit).length, 0);
  assert.equal(precommit.current.status.text, 'Finish composing to search.');
  assert.ok(precommit.rows.some(row => row.event === 'input' && row.isComposing && row.isTrusted === false
    && row.data.text === 'caf' && row.inputType === 'insertCompositionText'));
  assert.ok(precommit.rows.some(row => row.event === 'submit' && row.kind === 'event-bubble-after-ui' && row.defaultPrevented));
  await page.evaluate(() => {
    const node = document.querySelector('[data-raveldex-input]'); node.value = 'café';
    node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'é' }));
    node.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'é', isComposing: false, inputType: 'insertText' }));
  });
  await settled('1 results. Showing 1–1.');
  const final = await snapshot(), main = mainRows(final);
  assert.equal(main.length, 1); assert.equal(JSON.parse(main[0].query.text).text, 'café');
  assert.equal(main[0].current.observedComposing, false);
  assert.ok(main[0].sequence > final.rows.find(row => row.event === 'compositionend').sequence);
  assert.equal(final.current.value.text, 'café');
  assert.equal(final.current.focus.hooks.includes('data-raveldex-input'), true);
  assert.deepEqual(await page.locator('[data-raveldex-result]').evaluateAll(nodes => nodes.map(node => node.dataset.raveldexResult)), ['long']);
});

test('trace excludes other fields, bounds strings/rows, and reports truncation rather than silently claiming a complete sequence', async () => {
  await page.locator('#input-start').click();
  await page.locator('#input-source').fill('outside-recording-test-text');
  await page.evaluate(() => {
    const node = document.querySelector('[data-raveldex-input]');
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    for (let i = 0; i < 180; i++) node.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: 'a'.repeat(600) }));
  });
  const state = await snapshot();
  assert.equal(state.rows.length, 300); assert.ok(state.droppedRows > 0);
  const update = state.rows.find(row => row.event === 'compositionupdate');
  assert.equal(update.data.codeUnits, 600); assert.equal(update.data.text.length, 256);
  assert.equal(JSON.stringify(state).includes('outside-recording-test-text'), false);
  await page.locator('#input-stop').click();
  assert.ok(JSON.parse(await page.locator('#input-trace').inputValue()).droppedRows > 0);
  await page.locator('#input-start').click();
  const reset = await snapshot();
  assert.equal(reset.droppedRows, 0); assert.equal(reset.rows.length, 1);
  assert.equal(await page.locator('#input-trace').inputValue(), '');
});

test('unavailable package identity fails visibly with recording disabled', async () => {
  await page.evaluate(() => window.harness.cleanup());
  await page.route('**/matrix/session', route => route.fulfill({ status: 503, body: '{}' }));
  expectedError = 'Input observation package identity is unavailable.';
  await page.goto(fixture.origin + '/ui-input');
  await page.getByText('Input observation setup failed. Reload to retry.', { exact: true }).waitFor();
  assert.equal(await page.locator('#input-start').isDisabled(), true);
  assert.equal(await page.locator('#input-stop').isDisabled(), true);
  assert.equal(await page.locator('#input-trace').inputValue(), '');
  assert.equal(await page.evaluate(() => typeof window.inputProbe), 'undefined');
});
