import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { platform, release, arch } from 'node:os';
import { webkit } from 'playwright-core';

const root = resolve(import.meta.dirname, '../..'), baseline = '071614a';
const primaryArgument = process.argv.find(arg => arg.startsWith('--primary='))?.slice('--primary='.length);
assert.ok(primaryArgument, '--primary=path to completed narrow report required');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const primaryBytes = await readFile(resolve(root, primaryArgument)), primary = JSON.parse(primaryBytes);
assert.equal(primary.kind, 'raveldex-rx4002-native-facet-keyboard-v1');
assert.deepEqual(primary.summary, { passed: 2, failed: 0, blockedObservations: 0, blockedBrowsers: 0 });
assert.equal(primary.execution.clearMethod, 'idle-typeahead'); assert.equal(primary.execution.clearKey, 'a');
assert.equal(digest(await readFile(join(root, primary.execution.runnerPath))), primary.execution.runnerSha256);
assert.equal(digest(await readFile(join(root, primary.execution.serverPath))), primary.execution.serverSha256);
const fixturePackage = primary.package;
assert.ok(fixturePackage?.installedDirectory && fixturePackage.graphs?.['browser-ui-driver.mjs'], 'Primary report must bind actual installed UI fixture');
const consumer = fixturePackage.installedDirectory, installed = join(consumer, 'node_modules/@vmitsaras/raveldex');
assert.equal(await realpath(installed), installed);
const outputPath = resolve(root, 'docs/evidence/RX-4002-facets-review-probe.json');
const groups = [], add = (name, detail) => groups.push({ name, status: 'Pass', detail });
const oldPaths = execFileSync('git', ['ls-tree', '-r', '--name-only', baseline, '--', 'docs/evidence'], { cwd: root, encoding: 'utf8' }).trim().split('\n')
  .filter(path => path.endsWith('.json') || /-probe\.mjs$/.test(path));
const oldHashes = [];
for (const path of oldPaths) {
  const bytes = await readFile(join(root, path));
  assert.deepEqual(bytes, execFileSync('git', ['show', `${baseline}:${path}`], { cwd: root, maxBuffer: 24 * 1024 * 1024 }));
  oldHashes.push({ path, sha256: digest(bytes) });
}
assert.equal(execFileSync('git', ['diff', baseline, '--', 'src', 'package-lock.json'], { cwd: root, encoding: 'utf8' }), '');
const meta = JSON.parse(await readFile(join(root, 'package.json')));
const previousMeta = JSON.parse(execFileSync('git', ['show', `${baseline}:package.json`], { cwd: root, encoding: 'utf8' }));
const installedMeta = JSON.parse(await readFile(join(installed, 'package.json')));
for (const key of ['name', 'version', 'private', 'exports', 'types', 'sideEffects', 'files', 'engines', 'devDependencies', 'dependencies']) {
  assert.deepEqual(meta[key], previousMeta[key], key); assert.deepEqual(installedMeta[key], meta[key], key);
}
const planner = JSON.parse(await readFile(join(root, 'docs/planning/roadmap.json')));
const oldPlanner = JSON.parse(execFileSync('git', ['show', `${baseline}:docs/planning/roadmap.json`], { cwd: root, encoding: 'utf8' }));
assert.deepEqual(planner.tasks.filter(row => row.id !== 'RX-4002'), oldPlanner.tasks.filter(row => row.id !== 'RX-4002'));
assert.deepEqual(planner.tasks.find(row => row.id === 'RX-4002').acceptanceCriteria, oldPlanner.tasks.find(row => row.id === 'RX-4002').acceptanceCriteria);
const historical = JSON.parse(await readFile(join(root, 'docs/evidence/RX-4002-browsers-accepted.json')));
const oldBroadRow = historical.records.find(row => row.browser === 'webkit' && row.name === 'native UI keyboard / facets / Inspector / errors / synthetic composition / teardown');
assert.equal(oldBroadRow.status, 'Blocked'); assert.equal(oldBroadRow.evidence.nativeFacetKeyboard.clear, 'Blocked');
add('Immutable previous evidence, criteria and native contracts', { baseline, preservedFiles: oldHashes.length, oldHashes, oldBroadWebKitUI: 'Blocked', rx4002Status: planner.tasks.find(row => row.id === 'RX-4002').status });

async function paths(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await paths(directory, path));
    else { assert.ok(entry.isFile()); result.push(path); }
  }
  return result.sort();
}
const production = JSON.parse(await readFile(join(root, 'docs/evidence/RX-4002-memory.json'))).productionFiles;
assert.equal(production.length, 208);
const arrowupPath = 'docs/evidence/RX-4002-facet-keyboard-arrowup.json';
const arrowupBytes = await readFile(join(root, arrowupPath)), arrowup = JSON.parse(arrowupBytes);
const arrowupSource = 'docs/evidence/RX-4002-facet-keyboard-arrowup-source.mjs';
assert.equal(digest(await readFile(join(root, arrowupSource))), arrowup.execution.runnerSha256);
assert.deepEqual(arrowup.summary, { passed: 0, failed: 0, blockedObservations: 2, blockedBrowsers: 0 });
for (const record of arrowup.records) {
  assert.equal(record.status, 'Blocked'); assert.equal(record.evidence.guideSelection.status, 'Pass');
  assert.equal(record.evidence.clear.status, 'Blocked'); assert.equal(record.evidence.clear.before.mainCalls.length, record.evidence.clear.after.mainCalls.length);
  assert.ok(record.evidence.clear.events.every(event => event.isTrusted && event.focused && event.key === 'ArrowUp'));
  assert.equal(record.evidence.clear.events.filter(event => event.type === 'change').length, 0);
}
for (const directory of [consumer, arrowup.package.installedDirectory]) {
  const installedDirectory = join(directory, 'node_modules/@vmitsaras/raveldex'); assert.equal(await realpath(installedDirectory), installedDirectory);
  assert.deepEqual((await paths(join(installedDirectory, 'dist'))).map(path => `dist/${path}`), production.map(row => row.path).sort());
  for (const file of production) {
    const bytes = await readFile(join(installedDirectory, file.path));
    assert.equal(digest(bytes), file.sha256); assert.deepEqual(bytes, await readFile(join(root, file.path)));
  }
}
for (const input of fixturePackage.graphs['browser-ui-driver.mjs'].inputs)
  assert.equal(digest(await readFile(join(consumer, input.path))), input.sha256, input.path);
for (const source of fixturePackage.sourceFixtures) assert.equal(digest(await readFile(join(root, source.path))), source.sha256);
const uiBytes = await readFile(join(consumer, 'browser-ui-bundle.mjs')), css = await readFile(join(consumer, 'styles.css'));
assert.equal(digest(uiBytes), fixturePackage.graphs['browser-ui-driver.mjs'].sha256);
assert.equal(digest(css), fixturePackage.cssSha256);
const tarball = await readFile(join(consumer, 'vmitsaras-raveldex-0.0.0.tgz'));
assert.equal(digest(tarball), fixturePackage.package.sha256);
add('Executed installed public package and frozen fixture identity', { consumer, arrowupConsumer: arrowup.package.installedDirectory, productionFilesPerDirectory: 208,
  comparedInstalledProductionFiles: 416, arrowupReport: { path: arrowupPath, sha256: digest(arrowupBytes) }, arrowupSource: { path: arrowupSource, sha256: arrowup.execution.runnerSha256 },
  primaryReport: { path: primaryArgument, sha256: digest(primaryBytes) }, tarballSha256: fixturePackage.package.sha256,
  uiBundleSha256: digest(uiBytes), cssSha256: digest(css), sourceFixtures: fixturePackage.sourceFixtures });

const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Raveldex RX-4002 installed package qualification</title><link rel="stylesheet" href="/styles.css"></head><body><main><h1>Raveldex installed package qualification</h1><p>Test-only controls affect this installed fixture.</p><p><button id="inject-error" type="button">Inject next search error</button> <button id="destroy-ui" type="button">Destroy UI</button> <button id="remount-ui" type="button">Remount UI</button></p><p id="fixture-status" role="status">Starting fixture UI.</p><div id="fixture-root"><p id="authored">Authored fallback <a href="/authored">documentation</a></p></div><script type="module" src="/browser-ui-bundle.mjs"></script></main></body></html>';
const server = createServer((request, response) => {
  response.setHeader('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'");
  const route = new URL(request.url, 'http://localhost').pathname;
  const item = route === '/ui' ? ['text/html; charset=utf-8', html] : route === '/browser-ui-bundle.mjs'
    ? ['text/javascript', uiBytes] : route === '/styles.css' ? ['text/css', css] : undefined;
  if (!item) { response.writeHead(404); response.end(); return; }
  response.setHeader('content-type', item[0]); response.end(item[1]);
});
let browser, context;
const report = { kind: 'rx4002-facets-independent-review-probe-v1', baseline, startedAt: new Date().toISOString(), outcome: 'Pending',
  execution: { argv: [...process.argv], probeSha256: digest(await readFile(import.meta.filename)), primaryReport: { path: primaryArgument, sha256: digest(primaryBytes) },
    htmlSha256: digest(html), consumer, method: 'New local server over the exact executed UI bundle/CSS; no pack, install, build, resource, AT, Safari or device run.' },
  environment: { node: process.version, platform: platform(), release: release(), arch: arch(), playwright: JSON.parse(await readFile(join(root, 'node_modules/playwright-core/package.json'))).version },
  groups, limitations: 'Automated headless WebKit native select default action and DOM/query observations only. No Safari/AT/human/physical-input, whole UI, resource or collector qualification.' };
try {
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
  report.origin = `http://127.0.0.1:${server.address().port}`;
  browser = await webkit.launch({ headless: true, timeout: 30000 });
  const actualVersion = browser.version();
  const primaryBrowser = primary.browsers?.find(row => row.name === 'webkit');
  assert.ok(primaryBrowser?.version, 'Primary browser must have an actual launched version'); assert.equal(actualVersion, primaryBrowser.version);
  report.browser = { name: 'webkit', version: actualVersion, executable: webkit.executablePath(), headless: true,
    identity: 'Automated Playwright WebKit, not installed Safari', primaryVersionMatched: true };
  context = await browser.newContext({ viewport: { width: 1080, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(String(error))); page.setDefaultTimeout(15000);
  await page.goto(report.origin + '/ui'); await page.waitForFunction(() => !!window.harness);
  const input = page.locator('[data-raveldex-input]'), select = page.locator('[data-raveldex-facet="category"]');
  async function callCount() { return page.evaluate(() => window.harness.calls().length); }
  async function newMain(before) {
    await page.waitForFunction(before => {
      const calls = window.harness.calls(), shell = document.querySelector('[data-raveldex-ui]');
      return calls.slice(before).some(call => call.completed && call.options.extensions?.facets)
        && shell?.getAttribute('aria-busy') === 'false' && !!document.querySelector('[data-raveldex-result]');
    }, before);
    return page.evaluate(before => {
      const main = window.harness.calls().map((call, index) => ({ ...call, index })).filter(call => call.index >= before && call.options.extensions?.facets).at(-1);
      return { main, callCount: window.harness.calls().length, status: document.querySelector('[data-raveldex-status]').textContent,
        page: document.querySelector('[data-raveldex-page]').textContent, selectedValue: document.querySelector('[data-raveldex-facet="category"]').value,
        selectedIndex: document.querySelector('[data-raveldex-facet="category"]').selectedIndex,
        optionLabels: [...document.querySelector('[data-raveldex-facet="category"]').options].map(option => ({ label: option.textContent, value: option.value })),
        focused: document.activeElement === document.querySelector('[data-raveldex-facet="category"]'),
        ids: [...document.querySelectorAll('[data-raveldex-result]')].map(node => node.dataset.raveldexResult) };
    }, before);
  }
  await page.waitForFunction(() => window.harness.calls().every(call => call.completed)
    && document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') === 'false');
  let before = await callCount(); await input.fill('red'); await input.press('Enter'); const red = await newMain(before);
  assert.deepEqual(red.main.query, { kind: 'text', text: 'red' }); assert.equal(red.main.result.total, 7);
  before = await callCount(); await page.locator('[data-raveldex-next]').press('Enter'); const paged = await newMain(before);
  assert.equal(paged.main.options.offset, 3);
  const referenceChoiceValue = paged.optionLabels.find(option => option.label === 'Reference (2)').value;
  await select.evaluate(node => {
    window.reviewNativeSelectEvents = [];
    for (const type of ['keydown', 'change']) node.addEventListener(type, event => window.reviewNativeSelectEvents.push({
      type, key: event.key, isTrusted: event.isTrusted, value: node.value, selectedIndex: node.selectedIndex,
      label: node.selectedOptions[0]?.textContent, focused: document.activeElement === node, callCount: window.harness.calls().length }));
  });
  await select.focus(); assert.equal(await select.evaluate(node => document.activeElement === node), true);
  before = await callCount(); await select.press('r'); const reference = await newMain(before);
  assert.deepEqual(reference.main.query, { kind: 'and', children: [{ kind: 'text', text: 'red' }, { kind: 'eq', field: 'category', value: 'Reference' }] });
  assert.equal(reference.main.completed, true); assert.equal(reference.main.options.offset, 0); assert.equal(reference.main.result.total, 2);
  assert.deepEqual(reference.main.result.hits.map(hit => hit.id).sort(), ['delta', 'long']);
  assert.deepEqual(reference.ids, reference.main.result.hits.map(hit => hit.id)); assert.equal(reference.focused, true);
  assert.equal(reference.selectedIndex, 1); assert.match(reference.optionLabels.find(option => option.value === reference.selectedValue).label, /^Reference \(2\)$/);
  assert.match(reference.status, /^2 results\. Showing 1–2\.$/);
  await select.press('Tab'); assert.equal(await select.evaluate(node => document.activeElement === node), false);
  await page.keyboard.press('Shift+Tab'); assert.equal(await select.evaluate(node => document.activeElement === node), true);
  const idleBefore = await page.evaluate(() => ({ now: performance.now(), callCount: window.harness.calls().length,
    value: document.querySelector('[data-raveldex-facet="category"]').value, focused: document.activeElement === document.querySelector('[data-raveldex-facet="category"]') }));
  await page.waitForTimeout(2000);
  const idleAfter = await page.evaluate(() => ({ now: performance.now(), callCount: window.harness.calls().length,
    value: document.querySelector('[data-raveldex-facet="category"]').value, focused: document.activeElement === document.querySelector('[data-raveldex-facet="category"]') }));
  assert.ok(idleAfter.now - idleBefore.now >= 2000); assert.equal(idleAfter.callCount, idleBefore.callCount);
  assert.equal(idleAfter.value, reference.selectedValue); assert.equal(idleBefore.focused && idleAfter.focused, true);
  before = await callCount(); await select.press('a'); const cleared = await newMain(before);
  assert.deepEqual(cleared.main.query, { kind: 'text', text: 'red' }); assert.equal(cleared.main.completed, true);
  assert.equal(cleared.main.options.offset, 0); assert.equal(cleared.main.result.total, 7); assert.equal(cleared.selectedValue, '');
  assert.equal(cleared.selectedIndex, 0); assert.equal(cleared.focused, true); assert.match(cleared.status, /^7 results\. Showing 1–3\.$/);
  assert.deepEqual(cleared.ids, cleared.main.result.hits.map(hit => hit.id));
  assert.deepEqual(cleared.main.result.extensions.facets.fields[0].buckets, [{ kind: 'value', value: 'Guide', count: 5 }, { kind: 'value', value: 'Reference', count: 2 }]);
  const all = await page.evaluate(() => window.harness.engine.search('red', { limit: 9 }));
  assert.deepEqual(all.hits.map(hit => hit.id).sort(), ['alpha', 'delta', 'epsilon', 'gamma', 'long', 'quoted', 'unsafe']);
  const events = await page.evaluate(() => window.reviewNativeSelectEvents);
  assert.equal(events.filter(event => event.type === 'change').length, 2);
  assert.ok(events.every(event => event.isTrusted && event.focused));
  assert.ok(events.filter(event => event.type === 'keydown').some(event => event.key === 'r'));
  assert.ok(events.filter(event => event.type === 'keydown').some(event => event.key === 'a'));
  assert.deepEqual(events.filter(event => event.type === 'change').map(event => event.value), [referenceChoiceValue, '']);
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.harness.cleanup());
  report.observation = { input: 'red', independentReferenceIDs: ['delta', 'long'],
    independentAllIDs: ['alpha', 'delta', 'epsilon', 'gamma', 'long', 'quoted', 'unsafe'],
    red, paged, reference, idle: { requestedMilliseconds: 2000, measuredMilliseconds: idleAfter.now - idleBefore.now, before: idleBefore, after: idleAfter },
    cleared, all, events, pageErrors: errors,
    probeSelectionMethodsExcluded: ['selectOption', 'select.value assignment', 'dispatchEvent for select'] };
  add('Independent native Reference→idle2000ms→a→All choice on fresh focused WebKit context', { literalReferenceTotal: 2, clearedTotal: 7,
    freshCompletedCalls: [reference.main.index, cleared.main.index], trustedChangeEvents: 2, focusPreserved: true, selectionResetPaging: true, clearOffset: 0 });
  for (const old of oldHashes) assert.equal(digest(await readFile(join(root, old.path))), old.sha256, old.path);
  assert.equal(digest(await readFile(resolve(root, primaryArgument))), digest(primaryBytes), 'Primary report changed during review');
  report.outcome = 'Pass';
} catch (error) {
  report.outcome = error.code === 'EPERM' || /browserType.launch|Executable doesn't exist|Timeout/.test(String(error)) ? 'Blocked' : 'Fail';
  report.error = { name: error.name, code: error.code, message: String(error), stack: error.stack };
  process.exitCode = 1;
} finally {
  const cleanupErrors = [];
  for (const close of [() => context?.close(), () => browser?.close(), async () => {
    if (server.listening) { server.closeAllConnections(); await new Promise(yes => server.close(yes)); }
  }]) try { await close(); } catch (error) { cleanupErrors.push(String(error)); }
  if (cleanupErrors.length) { report.cleanupErrors = cleanupErrors; report.outcome = 'Fail'; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString(); await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ outcome: report.outcome, groups: groups.length, output: outputPath }));
}
