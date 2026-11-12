import assert from 'node:assert/strict';
import { readFile, writeFile, open, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { platform, release, arch } from 'node:os';
import { chromium, webkit } from 'playwright-core';
import { prepareBrowserQualification } from './browser-serve.mjs';
import { command, digest, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

// This observes one native select route. It does not repeat the broader UI,
// engine, storage or resource matrix, and it never selects an option in script.
const args = process.argv.slice(2);
const selected = (args.find(arg => arg.startsWith('--browser='))?.slice('--browser='.length) ?? 'webkit,chrome').split(',');
assert.ok(selected.length > 0 && new Set(selected).size === selected.length);
assert.ok(selected.every(name => ['webkit', 'chrome'].includes(name)), 'only WebKit and the Chrome control are in this bounded observation');
const clearMethod = args.find(arg => arg.startsWith('--clear-method='))?.slice('--clear-method='.length) ?? 'arrowup';
assert.ok(['arrowup', 'idle-typeahead'].includes(clearMethod), 'only the two explicitly bounded native routes are supported');
const clearKey = clearMethod === 'idle-typeahead' ? 'a' : 'ArrowUp';
const reportArg = args.find(arg => arg.startsWith('--report='));
assert.ok(reportArg, 'an explicit new --report=path.json is required');
const target = resolve(reportArg.slice('--report='.length));
await mkdir(dirname(target), { recursive: true });
const exclusive = await open(target, 'wx'); await exclusive.close();

const preserved = ['docs/evidence/RX-4002-browsers-ui.json', 'docs/evidence/RX-4002-browsers-accepted.json'];
const preservedBefore = await Promise.all(preserved.map(async path => ({ path, sha256: digest(await readFile(join(REPO_ROOT, path))) })));
const report = {
  kind: 'raveldex-rx4002-native-facet-keyboard-v1', startedAt: new Date().toISOString(),
  execution: { runnerPath: 'test/qualification/browser-facet-keyboard.mjs', runnerSha256: digest(await readFile(new URL(import.meta.url))),
    serverPath: 'test/qualification/browser-serve.mjs', serverSha256: digest(await readFile(new URL('./browser-serve.mjs', import.meta.url))),
    arguments: args, clearMethod, clearKey, method: `Native focused select g then ${clearMethod === 'idle-typeahead' ? '2,000 ms idle and a' : 'ArrowUp'}; all selection events must be trusted. No selectOption, synthetic selection event or script value assignment is used.` },
  environment: { node: process.version, os: { platform: platform(), release: release(), arch: arch() },
    playwright: JSON.parse(await readFile(join(REPO_ROOT, 'node_modules/playwright-core/package.json'))).version },
  preservedBefore, browsers: [], records: [],
  expectations: {
    source: 'Finite literal fixture membership specified before execution. Rendered order must match the actual completed main hits, and clearing must reproduce the earlier same-query/same-revision page. This slice does not qualify a scorer or analyzer.',
    redMembership: ['alpha', 'delta', 'epsilon', 'gamma', 'long', 'quoted', 'unsafe'],
    guideMembership: ['alpha', 'epsilon', 'gamma', 'quoted', 'unsafe'],
    revision: 1, pageSize: 3,
    baseQuery: { kind: 'text', text: 'red' },
    guideQuery: { kind: 'and', children: [{ kind: 'text', text: 'red' }, { kind: 'eq', field: 'category', value: 'Guide' }] },
  },
  limitations: 'This is a focused automated native select observation in exact launched versions. It does not replace the historical broad UI report, installed Safari, operating-system IME, assistive technology, physical input or popup presentation observations. A missing native change is Blocked; a changed select with incorrect query/rendering is Fail.',
};
if (platform() === 'darwin') report.environment.os.product = (await command('/usr/bin/sw_vers', [])).stdout.trim();
const save = () => writeFile(target, JSON.stringify(report, null, 2) + '\n');
await save();
let fixture;

async function snapshot(page) {
  return page.evaluate(() => {
    const facet = document.querySelector('[data-raveldex-facet="category"]');
    const focus = node => node ? { tag: node.tagName, id: node.id, text: node.tagName === 'SELECT' ? node.selectedOptions[0]?.textContent : node.textContent?.slice(0, 120),
      raveldexFacet: node.getAttribute('data-raveldex-facet'), raveldexNext: node.hasAttribute('data-raveldex-next') } : null;
    const calls = window.harness.calls().map((call, index) => ({ call, index })).filter(({ call }) => call.options.extensions?.facets)
      .map(({ call, index }) => ({ originalCallIndex: index, query: call.query, options: call.options, completed: call.completed, aborted: call.aborted,
        result: call.result && { revision: call.result.revision, completeness: call.result.completeness, model: call.result.model,
          total: call.result.total, hits: call.result.hits.map(hit => ({ id: hit.id, score: hit.score })), facets: call.result.extensions?.facets } }));
    return { observedAt: new Date().toISOString(), performanceNow: performance.now(), mainCalls: calls,
      totalHarnessCalls: window.harness.calls().length, busy: document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy'),
      status: document.querySelector('[data-raveldex-status]')?.textContent, page: document.querySelector('[data-raveldex-page]')?.textContent,
      renderedIDs: [...document.querySelectorAll('[data-raveldex-result]')].map(node => node.dataset.raveldexResult),
      facet: { value: facet.value, index: facet.selectedIndex, label: facet.selectedOptions[0]?.textContent,
        focused: document.activeElement === facet, options: [...facet.options].map(option => ({ value: option.value, text: option.textContent })) },
      activeElement: focus(document.activeElement), events: window.rx4002FacetEvents ?? [] };
  });
}

async function completedAfter(page, beforeCount) {
  await page.waitForFunction(count => {
    const calls = window.harness.calls().filter(call => call.options.extensions?.facets);
    return calls.length > count && calls.slice(count).every(call => call.completed)
      && document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') === 'false';
  }, beforeCount, { timeout: 10_000 });
  const after = await snapshot(page);
  assert.equal(after.mainCalls.length, beforeCount + 1, 'one new main query; snippets calls do not count');
  return after;
}

function checkMain(observed, { query, total, offset, membership, guide = false }) {
  const latest = observed.mainCalls.at(-1);
  assert.equal(latest.completed, true); assert.equal(latest.aborted, false);
  assert.deepEqual(latest.query, query);
  assert.equal(latest.options.offset, offset);
  assert.equal(latest.options.limit, Math.min(3, total - offset));
  assert.equal(latest.result.revision, 1);
  assert.equal(latest.result.completeness, 'complete');
  assert.equal(latest.result.model, 'raveldex-bm25-v1');
  assert.equal(latest.result.total, total);
  const ids = latest.result.hits.map(hit => hit.id);
  assert.equal(ids.length, Math.min(3, total - offset));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => membership.includes(id)), 'every result is an independently expected fixture member');
  assert.deepEqual(observed.renderedIDs, ids);
  assert.equal(observed.status, `${total} ${total === 1 ? 'result' : 'results'}. Showing ${offset + 1}–${offset + ids.length}.`);
  assert.equal(observed.page, `Page ${Math.floor(offset / 3) + 1} of ${Math.ceil(total / 3)}.`);
  assert.equal(observed.busy, 'false');
  assert.deepEqual(observed.facet.options, guide ? [{ value: '', text: 'All' }, { value: '0', text: 'Guide (5)' }]
    : [{ value: '', text: 'All' }, { value: '0', text: 'Guide (5)' }, { value: '1', text: 'Reference (2)' }]);
}

async function nativeChoice(page, facet, key, expectedValue) {
  const before = await snapshot(page), eventStart = before.events.length;
  assert.equal(before.facet.focused, true);
  await facet.press(key);
  let unavailable;
  try {
    await page.waitForFunction(({ start, value }) => window.rx4002FacetEvents.slice(start)
      .some(event => event.type === 'change' && event.isTrusted && event.value === value),
    { start: eventStart, value: expectedValue }, { timeout: 2_000 });
  } catch (error) { unavailable = String(error); }
  const changed = await snapshot(page), events = changed.events.slice(eventStart);
  assert.ok(events.some(event => event.type === 'keydown' && event.key === key && event.isTrusted), 'native trusted keydown was observed');
  if (unavailable) {
    const genuineChange = events.some(event => event.type === 'change' && event.isTrusted);
    if (genuineChange || changed.mainCalls.length > before.mainCalls.length) {
      assert.fail(`native ${key} changed selection or admitted a main query without the expected value ${JSON.stringify(expectedValue)}`);
    }
    return { status: 'Blocked', reason: 'The trusted keydown produced no trusted native select change in the bounded observation window.',
      nativeWaitTimeout: unavailable, before, after: changed, events };
  }
  const after = await completedAfter(page, before.mainCalls.length);
  assert.equal(after.facet.value, expectedValue);
  assert.equal(after.facet.focused, true, 'native select retains focus after the completed query/render');
  assert.ok(events.find(event => event.type === 'change' && event.isTrusted && event.value === expectedValue)?.focused,
    'select retained focus when native change was observed');
  return { status: 'Pass', before, after, events: after.events.slice(eventStart) };
}

async function observe(page, evidence) {
  await page.goto(fixture.origin + '/ui');
  await page.waitForFunction(() => !!window.harness && window.harness.calls().filter(call => call.options.extensions?.facets).every(call => call.completed)
    && document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') === 'false');
  const input = page.locator('[data-raveldex-input]'), facet = page.locator('[data-raveldex-facet="category"]'), next = page.locator('[data-raveldex-next]');
  const initial = await snapshot(page);
  await input.focus(); await page.keyboard.type('red'); await input.press('Enter');
  evidence.red = await completedAfter(page, initial.mainCalls.length);
  checkMain(evidence.red, { query: report.expectations.baseQuery, total: 7, offset: 0, membership: report.expectations.redMembership });
  const redCount = evidence.red.mainCalls.length;
  await next.focus(); await next.press('Enter');
  evidence.redSecondPage = await completedAfter(page, redCount);
  checkMain(evidence.redSecondPage, { query: report.expectations.baseQuery, total: 7, offset: 3, membership: report.expectations.redMembership });
  await next.press('Enter');
  evidence.redLastPage = await completedAfter(page, evidence.redSecondPage.mainCalls.length);
  checkMain(evidence.redLastPage, { query: report.expectations.baseQuery, total: 7, offset: 6, membership: report.expectations.redMembership });
  assert.deepEqual([...evidence.red.renderedIDs, ...evidence.redSecondPage.renderedIDs, ...evidence.redLastPage.renderedIDs].sort(), report.expectations.redMembership);

  await facet.evaluate(node => {
    window.rx4002FacetEvents = [];
    for (const type of ['keydown', 'keyup', 'input', 'change', 'focus', 'blur']) node.addEventListener(type, event => {
      window.rx4002FacetEvents.push({ type, key: event.key, isTrusted: event.isTrusted, eventTimeStamp: event.timeStamp,
        observedAt: new Date().toISOString(), performanceNow: performance.now(), value: node.value, selectedIndex: node.selectedIndex,
        selectedLabel: node.selectedOptions[0]?.textContent, focused: document.activeElement === node,
        activeTag: document.activeElement?.tagName, activeId: document.activeElement?.id,
        options: [...node.options].map(option => ({ value: option.value, text: option.textContent })) });
    });
  });
  await facet.focus();
  evidence.guideSelection = await nativeChoice(page, facet, 'g', '0');
  if (evidence.guideSelection.status !== 'Pass') return 'Blocked';
  checkMain(evidence.guideSelection.after, { query: report.expectations.guideQuery, total: 5, offset: 0,
    membership: report.expectations.guideMembership, guide: true });
  assert.equal(evidence.guideSelection.after.facet.index, 1);
  assert.equal(evidence.guideSelection.after.facet.label, 'Guide (5)');

  // Start clearing from the second Guide page, proving that the native change
  // really resets paging rather than accepting the old first-page state.
  await next.focus(); await next.press('Enter');
  evidence.guideSecondPage = await completedAfter(page, evidence.guideSelection.after.mainCalls.length);
  checkMain(evidence.guideSecondPage, { query: report.expectations.guideQuery, total: 5, offset: 3,
    membership: report.expectations.guideMembership, guide: true });
  assert.deepEqual([...evidence.guideSelection.after.renderedIDs, ...evidence.guideSecondPage.renderedIDs].sort(), report.expectations.guideMembership);
  await facet.focus(); await facet.press('Tab');
  evidence.afterTab = await snapshot(page);
  assert.equal(evidence.afterTab.facet.focused, false);
  await page.keyboard.press('Shift+Tab');
  evidence.afterShiftTab = await snapshot(page);
  assert.equal(evidence.afterShiftTab.facet.focused, true);
  assert.equal(evidence.afterShiftTab.facet.index, 1);
  assert.equal(evidence.afterShiftTab.facet.value, '0');

  if (clearMethod === 'idle-typeahead') {
    const before = await snapshot(page);
    await page.waitForTimeout(2_000);
    const after = await snapshot(page);
    evidence.typeaheadIdle = { requestedMilliseconds: 2_000, measuredMilliseconds: after.performanceNow - before.performanceNow,
      before, after, lastTrustedPrintableKey: [...before.events].reverse().find(event => event.type === 'keydown' && event.isTrusted && event.key?.length === 1) };
    assert.ok(evidence.typeaheadIdle.measuredMilliseconds >= 2_000, 'recorded native typeahead idle lasted at least two seconds');
    assert.equal(after.facet.focused, true); assert.equal(after.facet.value, '0');
    assert.equal(after.mainCalls.length, before.mainCalls.length, 'idle admits no query');
  }
  evidence.clear = await nativeChoice(page, facet, clearKey, '');
  if (evidence.clear.status !== 'Pass') return 'Blocked';
  checkMain(evidence.clear.after, { query: report.expectations.baseQuery, total: 7, offset: 0, membership: report.expectations.redMembership });
  assert.deepEqual(evidence.clear.after.renderedIDs, evidence.red.renderedIDs, 'same query and revision return the same ordered first page');
  assert.equal(evidence.clear.after.facet.index, 0);
  assert.equal(evidence.clear.after.facet.label, 'All');
  return 'Pass';
}

try {
  fixture = await prepareBrowserQualification(); report.package = fixture.report;
  report.fixtureOrigin = fixture.origin; report.executedGraph = 'browser-ui-driver.mjs'; await save();
  for (const name of selected) {
    const type = name === 'chrome' ? chromium : webkit;
    const launch = { name, status: 'Not run', headless: true, launchTimeoutMs: 30_000,
      executable: name === 'chrome' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : type.executablePath(),
      configuration: name === 'chrome' ? { channel: 'chrome' } : { engine: 'Playwright WebKit' } };
    report.browsers.push(launch); let browser;
    try { browser = await type.launch({ ...(name === 'chrome' ? { channel: 'chrome' } : {}), headless: true, timeout: 30_000 });
      launch.status = 'Executed'; launch.version = browser.version(); }
    catch (error) { launch.status = 'Blocked'; launch.error = String(error); await save(); continue; }
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(10_000);
    const row = { browser: name, name: `native facet Guide choice and ${clearMethod === 'idle-typeahead' ? 'idle typeahead a' : 'ArrowUp'} clear from page two`, status: 'Not run', evidence: {}, pageErrors: [] };
    report.records.push(row); page.on('pageerror', error => row.pageErrors.push(String(error)));
    try { row.status = await observe(page, row.evidence); assert.deepEqual(row.pageErrors, []); }
    catch (error) { row.status = 'Fail'; row.error = String(error); try { row.failureSnapshot = await snapshot(page); } catch (captureError) { row.captureError = String(captureError); } }
    finally { try { await page.evaluate(() => window.harness?.cleanup()); } catch (error) { row.cleanupError = String(error); row.status = 'Fail'; }
      await page.close(); await browser.close(); await save(); }
    console.log(JSON.stringify({ browser: name, version: launch.version, status: row.status, error: row.error, clear: row.evidence.clear?.status }));
  }
} catch (error) { report.harnessError = String(error); process.exitCode = 1; }
finally {
  if (fixture) await fixture.close();
  report.preservedAfter = await Promise.all(preserved.map(async path => ({ path, sha256: digest(await readFile(join(REPO_ROOT, path))) })));
  assert.deepEqual(report.preservedAfter, report.preservedBefore, 'historical raw and accepted aggregate remain byte-identical');
  report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.records.filter(row => row.status === 'Pass').length, failed: report.records.filter(row => row.status === 'Fail').length,
    blockedObservations: report.records.filter(row => row.status === 'Blocked').length, blockedBrowsers: report.browsers.filter(row => row.status === 'Blocked').length };
  await save(); console.log(JSON.stringify({ report: target, summary: report.summary }));
  if (report.summary.failed || report.summary.blockedObservations || report.summary.blockedBrowsers || report.harnessError) process.exitCode = 1;
}
