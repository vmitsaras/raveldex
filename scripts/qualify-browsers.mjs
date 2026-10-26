import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, realpath } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { platform, release, arch } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright-core';
import { prepareBrowserQualification } from '../test/qualification/browser-serve.mjs';
import { command, digest, REPO_ROOT } from './lib/packed-consumer.mjs';

const args = process.argv.slice(2), serve = args.includes('--serve'), resources = args.includes('--resources');
const browserArg = args.find(value => value.startsWith('--browsers='));
const scenarioFilter = args.find(value => value.startsWith('--scenario='))?.split('=')[1];
if (scenarioFilter !== undefined) assert.equal(scenarioFilter, 'ui', 'only the bounded ui selection is supported');
const selected = browserArg ? browserArg.split('=')[1].split(',') : ['chrome', 'firefox', 'webkit'];
const target = resolve(process.env.RAVELDEX_QUALIFICATION_BROWSER_REPORT ?? (serve ? 'docs/evidence/RX-4002-browsers-manual-package.json' : 'docs/evidence/RX-4002-browsers.json'));
const report = { kind: 'raveldex-rx4002-browser-qualification-v1', startedAt: new Date().toISOString(),
  execution: { runnerPath: 'scripts/qualify-browsers.mjs', runnerSha256: digest(await readFile(fileURLToPath(import.meta.url))),
    serverPath: 'test/qualification/browser-serve.mjs', serverSha256: digest(await readFile(join(REPO_ROOT, 'test/qualification/browser-serve.mjs'))), arguments: args },
  environment: { node: process.version, os: { platform: platform(), release: release(), arch: arch() },
    playwright: JSON.parse(await readFile(join(REPO_ROOT, 'node_modules/playwright-core/package.json'))).version,
    axe: JSON.parse(await readFile(join(REPO_ROOT, 'node_modules/axe-core/package.json'))).version },
  limitations: { assistiveTechnology: 'Blocked: no screen-reader announcement observation made by this automated runner.',
    physicalPresentation: 'Blocked: no display/physical input observation made by this automated runner.',
    realOSIME: 'Blocked: synthetic CompositionEvent protocol does not exercise real operating-system IME.',
    browserPortability: 'Finite literal cases and same-host worker pairing. Default basic-v1 remains unqualified; browser native snapshots are unsupported.',
    webkitIdentity: 'Playwright automated WebKit is separate from installed Safari and is never labeled Safari.' },
  records: [], browsers: [] };
if (platform() === 'darwin') report.environment.os.product = (await command('/usr/bin/sw_vers', [])).stdout.trim();
async function save() { await mkdir(dirname(target), { recursive: true }); await writeFile(target, JSON.stringify(report, null, 2) + '\n'); }
const fixture = await prepareBrowserQualification(); report.package = fixture.report; report.fixtureOrigin = fixture.origin; await save();
if (serve) {
  console.log(JSON.stringify({ origin: fixture.origin, ui: `${fixture.origin}/ui`, input: `${fixture.origin}/ui-input`, worker: `${fixture.origin}/worker`, installedDirectory: fixture.directory, packageSha256: fixture.package.sha256, report: target }));
  const stop = async () => { await fixture.close(); process.exit(0); }; process.on('SIGINT', stop); process.on('SIGTERM', stop);
  await new Promise(() => {});
}
const hooks = name => `[data-raveldex-${name}]`;
async function settled(page) {
  await page.waitForFunction(() => document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') !== 'true');
  await page.waitForFunction(() => /results|failed/i.test(document.querySelector('[data-raveldex-status]')?.textContent ?? '') || !document.querySelector('[data-raveldex-error]')?.hidden);
}
async function search(page, value) { await page.locator(hooks('input')).fill(value); await page.locator(hooks('input')).press('Enter'); await settled(page); }
async function axe(page, label) {
  if (!await page.evaluate(() => !!window.axe)) await page.addScriptTag({ path: join(REPO_ROOT, 'node_modules/axe-core/axe.min.js') });
  const observed = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }));
  const compact = issue => ({ id: issue.id, impact: issue.impact, nodes: issue.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })) });
  const result = { label, tool: observed.testEngine, violations: observed.violations.map(compact), incomplete: observed.incomplete.map(compact), passes: observed.passes.length };
  assert.deepEqual(result.violations, [], `axe ${label}`); return result;
}
async function uiScenario(page) {
  await page.goto(fixture.origin + '/ui'); await page.waitForFunction(() => !!window.harness); await settled(page);
  const input = page.locator(hooks('input')), status = page.locator(hooks('status')), next = page.locator(hooks('next'));
  assert.equal(await page.getByRole('searchbox', { name: 'Search documentation', exact: true }).count(), 1);
  await input.focus(); await page.keyboard.type('red'); await input.press('Enter'); await settled(page);
  assert.match(await status.innerText(), /7 results.*1.*3/); assert.equal(await input.evaluate(node => document.activeElement === node), true);
  const visibleFocus = await input.evaluate(node => { const style = getComputedStyle(node); return { focusVisible: node.matches(':focus-visible'), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor, outlineOffset: style.outlineOffset }; });
  assert.equal(visibleFocus.focusVisible, true); assert.equal(visibleFocus.outlineStyle, 'solid'); assert.ok(parseFloat(visibleFocus.outlineWidth) >= 3);
  const first = await page.locator(hooks('result')).evaluateAll(nodes => nodes.map(node => node.dataset.raveldexResult));
  await next.focus(); await next.press('Enter'); await settled(page); assert.match(await status.innerText(), /7 results.*4.*6/);
  assert.equal(await next.evaluate(node => document.activeElement === node), true);
  const facet = page.locator('[data-raveldex-facet="category"]'), options = await facet.locator('option').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, value: node.value })));
  await facet.evaluate(node => { window.facetKeyboardTrace = []; for (const type of ['keydown', 'change']) node.addEventListener(type, event => { window.facetKeyboardTrace.push({ type, key: event.key, value: node.value, selectedIndex: node.selectedIndex, isTrusted: event.isTrusted }); }); });
  assert.ok(options.some(option => /Guide.*5/.test(option.text))); assert.ok(options.some(option => /Reference.*2/.test(option.text)));
  const guideValue = options.find(option => /Guide.*5/.test(option.text)).value;
  await facet.focus(); await facet.press('g'); await settled(page);
  const nativeFacetKeyboard = { selection: await facet.inputValue() === guideValue ? 'Pass' : 'Blocked', selectionMethod: 'Native focused select typeahead g',
    requiredObservation: 'An exact browser/display input path that performs native select choice, including popup interaction where required.' };
  if (nativeFacetKeyboard.selection === 'Blocked') { await facet.selectOption(guideValue); await settled(page); }
  assert.equal(await facet.inputValue(), guideValue); await facet.press('Tab');
  await page.keyboard.press('Shift+Tab'); assert.equal(await facet.evaluate(node => document.activeElement === node), true);
  assert.match(await status.innerText(), /5 results.*1.*3/); assert.equal(await facet.evaluate(node => document.activeElement === node), true); await facet.press('a'); await settled(page);
  nativeFacetKeyboard.clear = await facet.inputValue() === '' ? 'Pass' : 'Blocked';
  if (nativeFacetKeyboard.clear === 'Blocked') { await facet.selectOption(''); await settled(page); }
  nativeFacetKeyboard.status = nativeFacetKeyboard.selection === 'Pass' && nativeFacetKeyboard.clear === 'Pass' ? 'Pass' : 'Blocked';
  await search(page, 'blue'); const inspect = page.locator(hooks('inspect')); await inspect.focus(); await inspect.press('Enter');
  const dialog = page.locator(hooks('inspector')); await dialog.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('[data-raveldex-inspector-data]')?.textContent.includes('raveldex-bm25-v1'));
  assert.equal(await dialog.evaluate(node => node.open && node.contains(document.activeElement)), true);
  const facts = await page.evaluate(() => window.harness.calls().filter(call => call.options.extensions?.inspector).at(-1).result.extensions.inspector.trace.facts.length);
  assert.ok(facts > 0); const axeInspector = await axe(page, 'Inspector'); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  assert.equal(await inspect.evaluate(node => document.activeElement === node), true);
  await search(page, 'missing_token_qx'); assert.equal(await status.innerText(), 'No results.');
  await page.evaluate(() => { window.harness.state.failNext = true; }); await search(page, 'blue');
  assert.match(await page.locator(hooks('error')).innerText(), /WORK_LIMIT_EXCEEDED/);
  const axeError = await axe(page, 'recoverable error'); await page.locator(hooks('retry')).focus(); await page.locator(hooks('retry')).press('Enter'); await settled(page);
  assert.match(await status.innerText(), /1 results/);
  const before = await page.evaluate(() => window.harness.calls().length);
  await page.evaluate(() => { const node = document.querySelector('[data-raveldex-input]'); node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); node.value = 'r'; node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true })); });
  await page.waitForTimeout(80); assert.equal(await page.evaluate(() => window.harness.calls().length), before);
  await page.evaluate(() => { const node = document.querySelector('[data-raveldex-input]'); node.value = 'red'; node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'red' })); node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: false })); });
  await page.waitForFunction(() => /7 results/.test(document.querySelector('[data-raveldex-status]')?.textContent));
  await page.setViewportSize({ width: 375, height: 800 }); await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const reflow = await page.evaluate(() => { const root = document.querySelector('[data-raveldex-ui]'); return { method: '375 CSS-pixel viewport with root font-size 200%; not browser zoom or physical device.', viewportCSSPixels: innerWidth,
    rootFontPixels: getComputedStyle(document.documentElement).fontSize, UIClientWidth: root.clientWidth, UIScrollWidth: root.scrollWidth, inputClientWidth: document.querySelector('[data-raveldex-input]').clientWidth }; });
  assert.ok(reflow.UIScrollWidth <= reflow.UIClientWidth + 1, 'UI reflows without horizontal overflow at CSS text scaling');
  const reducedMotion = await page.evaluate(() => ({ mediaMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    controls: [...document.querySelectorAll('[data-raveldex-ui] input,[data-raveldex-ui] select,[data-raveldex-ui] button')].map(node => { const style = getComputedStyle(node); return { animationName: style.animationName, transitionDuration: style.transitionDuration, scrollBehavior: style.scrollBehavior }; }) }));
  assert.equal(reducedMotion.mediaMatches, true); assert.ok(reducedMotion.controls.every(control => control.animationName === 'none' && control.transitionDuration === '0s' && control.scrollBehavior === 'auto'));
  let forcedColors, forcedColorsEmulated = false;
  try { await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' }); forcedColorsEmulated = true; }
  catch (error) { forcedColors = { outcome: 'Blocked', toolLimitation: String(error), requiredObservation: 'Exact named browser with forced-colors media emulation or physical high-contrast settings.' }; }
  if (forcedColorsEmulated) { await input.focus(); await input.press('Tab'); await page.keyboard.press('Shift+Tab');
    forcedColors = await input.evaluate(node => { const style = getComputedStyle(node); return { outcome: 'Observed', method: 'Browser media emulation; no physical high-contrast device observation.', mediaMatches: matchMedia('(forced-colors: active)').matches,
      focusVisible: node.matches(':focus-visible'), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor }; });
    assert.equal(forcedColors.mediaMatches, true); assert.equal(forcedColors.focusVisible, true); assert.ok(parseFloat(forcedColors.outlineWidth) >= 3);
  }
  await page.evaluate(() => window.harness.destroy()); assert.equal(await page.locator('#authored').count(), 1);
  assert.equal(await page.evaluate(() => window.harness.originalNodes.every((node, index) => window.harness.root.childNodes[index] === node)), true);
  await page.evaluate(() => window.harness.remount()); await settled(page); await page.evaluate(() => window.harness.cleanup());
  return { configurationOutcome: nativeFacetKeyboard.status, resultTotal: 7, firstPage: first, facetOptions: options,
    nativeFacetKeyboard, functionalFacetSelection: nativeFacetKeyboard.status === 'Pass' ? 'Actual keyboard selection' : 'Automation selectOption verified filter separately after blocked native keyboard choice.',
    guideTotal: 5, InspectorFacts: facts, EscapeRestoredFocus: true,
    visibleFocus, reflow, reducedMotion, forcedColors, nativeFacetEvents: await page.evaluate(() => window.facetKeyboardTrace),
    errorInjection: 'Deliberately injected typed UI fixture error; not resource refusal.', retryTotal: 1, emptyTotal: 0,
    syntheticComposition: 'Interim suppressed; final value searched. Real OS IME remains Blocked.', authoredNodesRestored: true, remount: 'Pass', automatedAxe: [axeInspector, axeError] };
}
async function workerUIScenario(page) {
  await page.goto(fixture.origin + '/worker'); await settled(page); await search(page, 'red');
  assert.match(await page.locator(hooks('status')).innerText(), /2 results/);
  await page.getByRole('button', { name: 'Terminate worker', exact: true }).click(); await search(page, 'blue');
  const error = await page.locator(hooks('error')).innerText(); assert.match(error, /INTERNAL_ERROR/);
  const actualWorkerError = await page.evaluate(() => window.qualification.visibleSearchErrors.at(-1));
  assert.equal(actualWorkerError.name, 'WorkerAdapterError'); assert.ok(['TIMEOUT', 'TERMINATED'].includes(actualWorkerError.code));
  await page.getByRole('button', { name: 'Recover from authoritative source', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('fixture-status')?.textContent.includes('Recovered a new worker')); await settled(page);
  await search(page, 'blue'); assert.match(await page.locator(hooks('status')).innerText(), /1 results/);
  const recovered = await page.locator(hooks('result')).evaluateAll(nodes => nodes.map(node => node.dataset.raveldexResult)); assert.deepEqual(recovered, ['beta']);
  const priorWorkerDisposals = await page.evaluate(() => window.qualification.visibleRecoveryDisposals);
  assert.equal(priorWorkerDisposals.length, 1); assert.ok(['TIMEOUT', 'TERMINATED'].includes(priorWorkerDisposals[0].error?.code), 'dead worker disposal cannot pretend acknowledgement');
  const automatedAxe = await axe(page, 'worker recovery'); await page.evaluate(() => window.qualification.cleanup());
  return { terminatedActualModuleWorker: true, testOnlyResponseTimeoutMs: 2500, renderedError: error, actualWorkerError, priorWorkerDisposals, recovery: 'Explicit fresh owner rebuilt from authoritative fixture originals; old dead-worker disposal timeout retained.', recovered, automatedAxe,
    presentationLimitation: 'UI accepts core error categories and renders this separate transport TIMEOUT as generic INTERNAL_ERROR. The actual transport error is preserved independently.',
    ATObservation: 'Blocked: automated DOM outcomes only.' };
}
try {
  for (const name of selected) {
    assert.ok(['chrome', 'chromium', 'firefox', 'webkit'].includes(name), 'explicit browser name');
    const type = name === 'chrome' || name === 'chromium' ? chromium : name === 'firefox' ? firefox : webkit;
    const selectedExecutable = name === 'firefox' ? process.env.RAVELDEX_QUALIFICATION_FIREFOX_EXECUTABLE : undefined;
    const profileDirectory = name === 'firefox' && args.includes('--firefox-real-profile') ? await realpath(await mkdtemp('/private/tmp/raveldex-rx4002-firefox-')) : undefined;
    let browser;
    try {
      const options = { ...(name === 'chrome' ? { channel: 'chrome' } : {}), ...(selectedExecutable ? { executablePath: selectedExecutable } : {}), headless: true, timeout: 30_000 };
      browser = profileDirectory ? (await type.launchPersistentContext(profileDirectory, options)).browser() : await type.launch(options);
      assert.ok(browser, 'launched browser identity');
    }
    catch (error) { report.browsers.push({ name, status: 'Blocked', executable: selectedExecutable ?? type.executablePath(), profileDirectory, launchMode: profileDirectory ? 'Persistent task-owned realpath profile' : 'Temporary Playwright profile', launchTimeoutMs: 30_000, launchError: String(error), requiredObservation: `Launch the named ${name} executable and exercise the installed package matrix.` }); await save(); continue; }
    const configuration = { name, version: browser.version(), executable: selectedExecutable ?? (name === 'chrome' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : type.executablePath()),
      profileDirectory, launchMode: profileDirectory ? 'Persistent task-owned realpath profile; each scenario uses a fresh BrowserContext' : 'Temporary Playwright profile', launchTimeoutMs: 30_000, headless: true,
      identity: name === 'webkit' ? 'Automated Playwright WebKit, not installed Safari' : name };
    report.browsers.push({ ...configuration, status: 'Launched' }); await save();
    console.log(`Qualification started: ${name} ${configuration.version}`);
    const scenarios = [['independent Unicode / Boolean / BM25 and complete direct-worker parity', async page => { await page.goto(fixture.origin); await page.waitForFunction(() => !!window.qualification); return page.evaluate(() => window.qualification.semantics()); }],
      ['native UI keyboard / facets / Inspector / errors / synthetic composition / teardown', uiScenario],
      ['actual module-worker failure and visible explicit UI recovery', workerUIScenario],
      ['IndexedDB source recovery / same-host worker-direct parity / namespace erasure', async page => { await page.goto(fixture.origin); await page.waitForFunction(() => !!window.qualification); return page.evaluate(() => window.qualification.persistence()); }],
      ...(resources ? [1000, 10000].flatMap(size => ['direct-core', 'worker-source'].map(kind => [`${size} admitted records ${kind}`, async page => { await page.goto(fixture.origin); await page.waitForFunction(() => !!window.qualification); return page.evaluate(({ size, kind }) => window.qualification.resource(size, kind), { size, kind }); }])) : [])];
    for (const [scenario, execute] of scenarios.filter(([name]) => scenarioFilter !== 'ui' || name.includes('UI'))) {
      const context = await browser.newContext({ viewport: { width: 1080, height: 900 }, reducedMotion: 'reduce' }), page = await context.newPage(), pageErrors = [];
      page.on('pageerror', error => pageErrors.push(String(error))); page.setDefaultTimeout(30_000);
      try {
        const evidence = await execute(page); assert.deepEqual(pageErrors, [], 'uncaught browser runtime errors');
        const status = evidence.configurationOutcome ?? 'Pass';
        report.records.push({ browser: name, name: scenario, status, evidence, pageErrors }); console.log(`${status} ${name}: ${scenario}`);
      } catch (error) {
        let diagnostics; try { diagnostics = await page.evaluate(() => ({ nativeFacetEvents: window.facetKeyboardTrace, visibleWorkerErrors: window.qualification?.visibleSearchErrors,
          status: document.querySelector('[data-raveldex-status]')?.textContent, facetValue: document.querySelector('[data-raveldex-facet="category"]')?.value })); } catch {}
        report.records.push({ browser: name, name: scenario, status: 'Fail', error: String(error), pageErrors, diagnostics }); console.log(`Fail ${name}: ${scenario}: ${String(error)}`);
      }
      finally {
        const row = report.records.at(-1);
        try {
          if (await page.evaluate(() => !!window.qualification)) {
            row.cleanup = await page.evaluate(() => window.qualification.cleanup());
            if (row.cleanup.some(outcome => outcome.error)) { row.status = 'Fail'; row.cleanupFailure = 'One or more public disposal operations rejected.'; }
          } else if (await page.evaluate(() => !!window.harness)) await page.evaluate(() => window.harness.cleanup());
        } catch (error) { row.status = 'Fail'; row.cleanupFailure = String(error); }
        await context.close(); await save();
      }
    }
    await browser.close(); report.browsers.find(row => row.name === name).status = 'Executed'; await save();
  }
} finally { await fixture.close(); report.finishedAt = new Date().toISOString(); report.summary = { passed: report.records.filter(row => row.status === 'Pass').length, failed: report.records.filter(row => row.status === 'Fail').length,
  blockedScenarios: report.records.filter(row => row.status === 'Blocked').length, rejectedConfigurations: report.records.filter(row => row.status === 'RejectedOutcome').length, blockedBrowsers: report.browsers.filter(row => row.status === 'Blocked').length, resourcesRequested: resources }; await save(); }
console.log(JSON.stringify(report.summary)); if (report.summary.failed || report.summary.blockedBrowsers || report.summary.rejectedConfigurations || report.summary.blockedScenarios) process.exitCode = 1;
