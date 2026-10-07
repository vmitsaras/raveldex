import assert from 'node:assert/strict';
import { test, before, after, beforeEach, afterEach } from 'node:test';
import { createServer } from 'node:http';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { resolve, join, extname, dirname } from 'node:path';
import { platform, release, arch } from 'node:os';
import { chromium } from 'playwright-core';
import { build, version as esbuildVersion } from 'esbuild';
import { prepareConsumer, REPO_ROOT, digest, command } from '../../scripts/lib/packed-consumer.mjs';
import { prepareUIPilot } from '../../scripts/lib/ui-consumer.mjs';
import { DOCS_JUDGMENTS } from '../fixtures/docs/judgments.mjs';

let consumer, pilotConsumer, browser, context, page, server, origin;
const records = [];
const report = { kind: 'raveldex-packed-ui-browser-v1', startedAt: new Date().toISOString(),
  verification: { syntheticComposition: 'Executed browser CompositionEvent protocol; real OS IME not run.',
    assistiveTechnology: 'Not run; axe and browser role/name lookups are supporting automated evidence.',
    physicalPaintLatency: 'Not measured.', crossBrowser: 'Only the recorded installed Chrome channel.' },
  environment: { node: process.version, os: { platform: platform(), release: release(), arch: arch() }, esbuild: esbuildVersion }, records };
const diagnostics = { kind: 'raveldex-ui-harness-stages-v1', pid: process.pid, startedAt: report.startedAt, stages: [] };
const diagnosticsPath = process.env.RAVELDEX_UI_DIAGNOSTICS ?? (process.env.RAVELDEX_UI_REPORT ? `${process.env.RAVELDEX_UI_REPORT}.stages.json` : undefined);
async function checkpoint(stage, details = {}) {
  if (!diagnosticsPath) return;
  diagnostics.stages.push({ stage, time: new Date().toISOString(), elapsedMs: Date.now() - Date.parse(diagnostics.startedAt),
    resourcesKeepingEventLoopAlive: process.getActiveResourcesInfo().sort(), ...details });
  const target = resolve(diagnosticsPath); await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(diagnostics, null, 2) + '\n');
}
async function saveReport() {
  if (!process.env.RAVELDEX_UI_REPORT) return;
  const target = resolve(process.env.RAVELDEX_UI_REPORT); await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(report, null, 2) + '\n');
}
const hooks = name => `[data-raveldex-${name}]`;
const status = () => page.locator(hooks('status'));
const input = () => page.locator(hooks('input'));
const results = () => page.locator(hooks('result'));
const row = id => page.locator(`[data-raveldex-result="${id}"]`);
const record = (name, evidence) => records.push({ name, status: 'Pass', evidence });
async function settled() {
  await page.waitForFunction(() => document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') !== 'true');
  await page.waitForFunction(() => /results|failed/i.test(document.querySelector('[data-raveldex-status]')?.textContent ?? '') || !document.querySelector('[data-raveldex-error]')?.hidden);
}
async function search(value) {
  await input().fill(value);
  await input().press('Enter');
  await settled();
}
async function calls() { return page.evaluate(() => window.harness.calls()); }
async function axe(name) {
  if (!await page.evaluate(() => typeof window.axe?.run === 'function')) {
    await page.addScriptTag({ path: join(REPO_ROOT, 'node_modules/axe-core/axe.min.js') });
  }
  const result = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }));
  const compact = issue => ({ id: issue.id, impact: issue.impact, help: issue.help,
    nodes: issue.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })) });
  records.push({ name: `axe: ${name}`, status: result.violations.length ? 'Fail' : 'Pass',
    violations: result.violations.map(compact), incomplete: result.incomplete.map(compact), passes: result.passes.length,
    inapplicable: result.inapplicable.length, tool: result.testEngine });
  assert.deepEqual(result.violations.map(compact), [], `axe violations in ${name}`);
}

before(async () => {
  await checkpoint('before:start');
  if (platform() === 'darwin') {
    const { stdout } = await command('/usr/bin/sw_vers', []);
    report.environment.os.product = Object.fromEntries(stdout.trim().split('\n').map(line => {
      const colon = line.indexOf(':'); return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
    }));
  }
  await checkpoint('before:prepare-consumer:start');
  consumer = await prepareConsumer([], []);
  await checkpoint('before:prepare-consumer:done', { directory: consumer.directory });
  await copyFile(join(REPO_ROOT, 'test/ui/fixture-entry.mjs'), join(consumer.directory, 'fixture-entry.mjs'));
  await checkpoint('before:bundle:start');
  const bundled = await build({ absWorkingDir: consumer.directory, entryPoints: ['fixture-entry.mjs'], bundle: true,
    platform: 'browser', format: 'esm', target: 'es2022', minify: true, treeShaking: true, legalComments: 'none',
    sourcemap: false, metafile: true, outfile: join(consumer.directory, 'fixture.mjs'), logLevel: 'silent' });
  await checkpoint('before:bundle:done');
  for (const path of Object.keys(bundled.metafile.inputs)) assert.ok(path === 'fixture-entry.mjs' || path.startsWith('node_modules/@vmitsaras/raveldex/dist/'), `foreign runtime source: ${path}`);
  assert.ok(Object.keys(bundled.metafile.inputs).some(path => path.includes('/addons/ui/')));
  const css = await readFile(join(consumer.installed, 'dist/addons/ui/styles.css'));
  await writeFile(join(consumer.directory, 'styles.css'), css);
  const fixtureTypes = join(REPO_ROOT, 'test/consumer/ui-types.ts');
  await copyFile(fixtureTypes, join(consumer.directory, 'ui-types.ts'));
  await writeFile(join(consumer.directory, 'ui-tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM'], types: [], strict: true,
    noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, verbatimModuleSyntax: true, skipLibCheck: false, noEmit: true,
  }, include: ['ui-types.ts'] }));
  await checkpoint('before:public-typecheck:start');
  await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', join(consumer.directory, 'ui-tsconfig.json')], consumer.directory);
  await checkpoint('before:public-typecheck:done');
  report.package = consumer.package;
  report.bundle = { sha256: digest(await readFile(join(consumer.directory, 'fixture.mjs'))), inputs: bundled.metafile.inputs,
    cssSha256: digest(css), publicTypecheck: 'Pass' };
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Raveldex packed UI verification</title><link rel="stylesheet" href="/styles.css"></head><body><main><h1>Documentation search fixture</h1><div id="fixture-root"><p id="authored">Authored fallback <a href="/authored">documentation</a></p></div></main><script type="module" src="/fixture.mjs"></script></body></html>';
  await writeFile(join(consumer.directory, 'index.html'), html);
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const pilotPath = path.startsWith('/pilot/');
    const known = pilotPath ? { '/pilot/index.html': 'index.html', '/pilot/main.mjs': 'main.mjs', '/pilot/pilot.css': 'pilot.css',
      '/pilot/ui.css': 'ui.css', '/pilot/corpus.json': 'corpus.json' }[path]
      : { '/': 'index.html', '/fixture.mjs': 'fixture.mjs', '/styles.css': 'styles.css' }[path];
    if (!known) { response.writeHead(404); response.end(); return; }
    try { const bytes = await readFile(join(pilotPath ? pilotConsumer.directory : consumer.directory, known));
      response.setHeader('content-type', { '.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[extname(known)]);
      response.setHeader('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'none'; connect-src 'self'");
      response.end(bytes);
    } catch (error) { response.writeHead(500); response.end(String(error)); }
  });
  await checkpoint('before:http-listen:start');
  await new Promise((resolveServer, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveServer); });
  await checkpoint('before:http-listen:done');
  origin = `http://127.0.0.1:${server.address().port}`;
  const browserChannel = process.env.RAVELDEX_UI_BROWSER ?? 'chrome';
  assert.ok(['chrome', 'chromium'].includes(browserChannel), 'RAVELDEX_UI_BROWSER must be chrome or chromium');
  await checkpoint('before:browser-launch:start', { channel: browserChannel });
  browser = await chromium.launch({ ...(browserChannel === 'chrome' ? { channel: 'chrome' } : {}), headless: true });
  await checkpoint('before:browser-launch:done');
  report.environment.browser = { channel: browserChannel, version: browser.version(), headless: true };
  report.environment.playwright = JSON.parse(await readFile(join(REPO_ROOT, 'node_modules/playwright-core/package.json'))).version;
  report.environment.axe = JSON.parse(await readFile(join(REPO_ROOT, 'node_modules/axe-core/package.json'))).version;
  await checkpoint('before:done');
}, { timeout: 120_000 });

beforeEach(async t => {
  await checkpoint('beforeEach:start', { test: t.name });
  context = await browser.newContext({ viewport: { width: 1080, height: 900 }, reducedMotion: 'reduce' });
  page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  page.fixtureErrors = errors;
  await page.goto(origin);
  await page.waitForFunction(() => typeof window.createFixture === 'function');
  assert.deepEqual(await page.evaluate(() => window.createFixture()), { frozen: true });
  await settled();
  await page.addScriptTag({ path: join(REPO_ROOT, 'node_modules/axe-core/axe.min.js') });
  await checkpoint('beforeEach:done', { test: t.name });
});
afterEach(async t => {
  await checkpoint('afterEach:fixture-cleanup:start', { test: t.name, records: records.length });
  try {
    if (page) { assert.deepEqual(page.fixtureErrors, []); await page.evaluate(() => window.harness?.cleanup()); }
    await checkpoint('afterEach:fixture-cleanup:done', { test: t.name });
  } finally {
    await checkpoint('afterEach:context-close:start', { test: t.name });
    await context?.close();
    await checkpoint('afterEach:context-close:done', { test: t.name });
    await saveReport();
  }
});
after(async () => {
  await checkpoint('after:browser-close:start');
  await browser?.close();
  await checkpoint('after:browser-close:done');
  await checkpoint('after:server-close:start');
  if (server) { server.closeAllConnections(); await new Promise(resolveServer => server.close(resolveServer)); }
  await checkpoint('after:server-close:done');
  report.finishedAt = new Date().toISOString();
  report.consumerDirectory = consumer?.directory;
  await saveReport();
  await checkpoint('after:done');
});

test('packaged native controls submit, navigate exact pages, and preserve input focus', async () => {
  assert.equal(await input().getAttribute('type'), 'search');
  assert.equal(await input().getAttribute('aria-label'), null);
  assert.equal(await page.getByRole('searchbox', { name: 'Search documentation', exact: true }).count(), 1);
  assert.match(await status().innerText(), /9 results.*1.*3/);
  await input().fill('red'); await input().press('Enter'); await settled();
  assert.match(await status().innerText(), /7 results.*1.*3/);
  assert.equal(await input().evaluate(node => node === document.activeElement), true);
  const first = await results().evaluateAll(nodes => nodes.map(node => node.dataset.raveldexResult));
  await page.locator(hooks('next')).click(); await settled();
  assert.equal(await page.locator(hooks('next')).evaluate(node => node === document.activeElement), true);
  assert.match(await status().innerText(), /7 results.*4.*6/);
  const second = await results().evaluateAll(nodes => nodes.map(node => node.dataset.raveldexResult));
  assert.equal(first.filter(id => second.includes(id)).length, 0);
  await page.locator(hooks('next')).click(); await settled();
  assert.match(await status().innerText(), /7 results.*7.*7/);
  assert.equal(await page.locator(hooks('next')).isDisabled(), true);
  await page.locator(hooks('previous')).click(); await settled();
  assert.deepEqual(await results().evaluateAll(nodes => nodes.map(node => node.dataset.raveldexResult)), second);
  record('native submit / exact pagination / focus', { total: 7, pages: [3, 3, 1], first, second });
  await axe('search results');
});

test('facet counts follow exact conjunctive membership and selection resets paging', async () => {
  await search('red');
  const facet = page.locator('[data-raveldex-facet="category"]');
  assert.equal(await page.getByLabel('Category').count(), 1);
  const options = await facet.locator('option').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, value: node.value })));
  assert.ok(options.some(option => /Guide.*5/.test(option.text)));
  assert.ok(options.some(option => /Reference.*2/.test(option.text)));
  await page.locator(hooks('next')).click(); await settled();
  const guide = options.find(option => /Guide.*5/.test(option.text));
  await facet.focus();
  await facet.selectOption(guide.value); await settled();
  assert.equal(await facet.evaluate(node => node === document.activeElement), true);
  assert.match(await status().innerText(), /5 results.*1.*3/);
  const main = (await calls()).filter(call => call.options.extensions?.facets).at(-1);
  assert.equal(main.options.offset, 0);
  assert.ok(JSON.stringify(main.query).includes('Guide'));
  await facet.selectOption(''); await settled();
  assert.match(await status().innerText(), /7 results/);
  record('facets', { options, selectedTotal: 5, clearTotal: 7, exactCoreFilter: main.query });
  await axe('facet results');
});

test('partial final page respects a stricter real engine document limit in main, snippets, and Inspector', async () => {
  await page.evaluate(async () => { await window.harness.cleanup(); await window.createFixture({ pageSize: 3 }, { maxDocuments: 5 }); });
  await settled();
  assert.match(await status().innerText(), /5 results.*1.*3/);
  await page.locator(hooks('next')).click(); await settled();
  assert.match(await status().innerText(), /5 results.*4.*5/);
  assert.equal(await results().count(), 2);
  const latest = await calls();
  const main = latest.filter(call => call.options.extensions?.facets).at(-1);
  const snippets = latest.filter(call => call.options.extensions?.snippets).at(-1);
  assert.equal(main.options.limit, 2); assert.equal(main.options.offset, 3);
  assert.equal(snippets.options.limit, 2); assert.equal(snippets.options.offset, 3);
  await page.locator(hooks('inspect')).click();
  await page.waitForFunction(() => document.querySelector('[data-raveldex-inspector-data]')?.textContent.includes('raveldex-inspector-v1'));
  const inspector = (await calls()).filter(call => call.options.extensions?.inspector).at(-1);
  assert.equal(inspector.options.limit, 2); assert.equal(inspector.options.offset, 3);
  assert.equal(inspector.result.hits.length, 2); assert.equal(inspector.result.extensions.inspector.documents.length, 2);
  assert.equal(await page.locator(hooks('inspector-error')).isVisible(), false);
  await page.keyboard.press('Escape');
  await page.locator(hooks('previous')).click(); await settled();
  assert.match(await status().innerText(), /5 results.*1.*3/);
  record('stricter actual maxDocuments / bounded last page', { maxDocuments: 5, records: 5, configuredPageSize: 3,
    finalPage: { mainLimit: main.options.limit, snippetLimit: snippets.options.limit, inspectorLimit: inspector.options.limit,
      offset: 3, hits: 2, inspectorDocuments: 2 }, backwardPageHits: 3 });
});

test('debounced rapid typing admits the last value once', async () => {
  const beforeCount = (await calls()).length;
  await input().focus();
  await page.evaluate(() => {
    const node = document.querySelector('[data-raveldex-input]');
    for (const value of ['b', 'bl', 'blu', 'blue']) { node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.waitForFunction(() => /1 results/.test(document.querySelector('[data-raveldex-status]').textContent));
  const admitted = (await calls()).slice(beforeCount);
  assert.equal(admitted.filter(call => call.options.extensions?.facets).length, 1);
  assert.equal(JSON.stringify(admitted[0].query).includes('blue'), true);
  assert.equal(await row('beta').count(), 1);
  assert.equal(await input().evaluate(node => node === document.activeElement), true);
  record('debounce', { inputEvents: 4, admittedMainSearches: 1, calls: admitted.map(call => ({ query: call.query, extensions: Object.keys(call.options.extensions ?? {}) })) });
});

test('synthetic composition suppresses interim searches and admits compositionend once', async () => {
  const beforeCount = (await calls()).length;
  await input().focus();
  await page.evaluate(() => {
    const node = document.querySelector('[data-raveldex-input]');
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    node.value = 'bl'; node.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'bl', isComposing: true }));
    node.form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(80);
  assert.equal((await calls()).length, beforeCount);
  await page.evaluate(() => {
    const node = document.querySelector('[data-raveldex-input]'); node.value = 'blue';
    node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'blue' }));
    node.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'blue', isComposing: false }));
  });
  await page.waitForFunction(() => /1 results/.test(document.querySelector('[data-raveldex-status]').textContent));
  assert.equal((await calls()).slice(beforeCount).filter(call => call.options.extensions?.facets).length, 1);
  record('synthetic IME event protocol', { interimSearches: 0, finalSearches: 1, realOSIME: 'Not run' });
});

test('late real replies are suppressed even when a borrowed engine ignores cancellation', async () => {
  await page.evaluate(() => { window.harness.state.holdNext = true; });
  await input().fill('red'); await input().press('Enter');
  await page.waitForFunction(() => window.harness.state.pending.length === 1);
  assert.equal(await page.locator(hooks('ui')).getAttribute('aria-busy'), 'true');
  await axe('loading with previous results');
  await search('blue');
  assert.equal(await row('beta').count(), 1);
  const waiting = (await calls()).find(call => !call.completed);
  assert.equal(waiting.aborted, true);
  await page.evaluate(() => window.harness.release()); await page.waitForTimeout(60);
  assert.equal(await row('beta').count(), 1);
  assert.match(await status().innerText(), /1 results/);
  record('stale suppression distinct from cancellation', { discardedActualResultTotal: waiting.result.total, presentedTotal: 1, signalAborted: true,
    wrapper: 'Underlying real result computed without UI signal, then intentionally delayed.' });
});

test('empty results and typed errors announce status and recover by retry', async () => {
  await search('no_such_token_qx');
  assert.equal(await results().count(), 0);
  assert.equal(await status().innerText(), 'No results.');
  assert.equal(await page.locator(hooks('inspect')).isDisabled(), true);
  await axe('empty results');
  await page.evaluate(() => { window.harness.state.failNext = true; });
  await search('blue');
  assert.match(await page.locator(hooks('error')).innerText(), /WORK_LIMIT_EXCEEDED/);
  assert.equal(await page.locator(hooks('retry')).isVisible(), true);
  assert.equal(await page.locator(hooks('ui')).getAttribute('aria-busy'), 'false');
  await axe('recoverable error');
  await page.locator(hooks('retry')).click(); await settled();
  assert.equal(await row('beta').count(), 1);
  assert.equal(await page.locator(hooks('error')).isVisible(), false);
  record('empty / typed failure / retry', { emptyTotal: 0, injectedError: 'WORK_LIMIT_EXCEEDED', recoveredTotal: 1,
    liveRegion: await status().getAttribute('role') });
});

test('intervening real mutation between main results and snippets rejects mixed revisions and retry recovers', async () => {
  await page.evaluate(() => { window.harness.state.mutateBeforeSnippets = true; });
  await search('red');
  assert.match(await page.locator(hooks('error')).innerText(), /REVISION_MISMATCH/);
  const beforeRetry = (await calls()).filter(call => call.options.extensions?.snippets).at(-1);
  assert.equal(beforeRetry.options.extensions.snippets.expectedRevision, 1);
  assert.equal(await page.evaluate(async () => (await window.harness.engine.search('red')).revision), 2);
  await page.locator(hooks('retry')).click(); await settled();
  assert.match(await status().innerText(), /7 results/);
  const recovered = (await calls()).filter(call => call.options.extensions?.snippets).at(-1);
  assert.equal(recovered.options.extensions.snippets.expectedRevision, 2);
  assert.equal(recovered.result.revision, 2);
  record('actual main/projection mutation conflict', { firstResultRevision: 1, mutationRevision: 2,
    conflict: 'REVISION_MISMATCH', recoveredMainAndSnippetRevision: recovered.result.revision });
});

test('snippets and hostile fixture titles remain literal text, and unsafe URL configuration is rejected', async () => {
  await search('red');
  for (let i = 0; i < 3; i++) {
    if (await row('unsafe').count()) break;
    await page.locator(hooks('next')).click(); await settled();
  }
  assert.equal(await row('unsafe').count(), 1);
  const title = row('unsafe').locator(hooks('result-title'));
  assert.equal(await title.innerText(), '<img src=x onerror="window.fixtureInjection=1">');
  assert.equal(await row('unsafe').locator('img,script').count(), 0);
  const href = await title.getAttribute('href'); assert.equal(new URL(href, origin).pathname, '/docs/unsafe');
  const invalidURLs = await page.evaluate(() => window.harness.invalidURLs());
  for (const invalid of invalidURLs) { assert.equal(invalid.code, 'INVALID_OPTIONS'); assert.equal(invalid.authoredNodePreserved, true); }
  const invalidLabels = await page.evaluate(() => window.harness.invalidLabels());
  for (const invalid of invalidLabels.outcomes) { assert.equal(invalid.code, 'INVALID_OPTIONS'); assert.equal(invalid.authoredNodeAndAttributesPreserved, true); }
  assert.equal(invalidLabels.getterExecutions, 0); assert.equal(invalidLabels.admittedSearches, 0);
  assert.match(await row('unsafe').innerText(), /<img src=x onerror=/);
  assert.equal(await page.evaluate(() => window.fixtureInjection), 0);
  const projection = (await calls()).filter(call => call.options.extensions?.snippets).at(-1);
  assert.ok(projection.options.extensions.snippets.expectedRevision >= 1);
  assert.deepEqual(Object.keys(projection.options.extensions), ['snippets']);
  for (const document of projection.result.extensions.snippets.documents) {
    const snippets = await row(document.id).locator(hooks('snippet')).allTextContents();
    for (let index = 0; index < document.snippets.length; index++) {
      const snippet = document.snippets[index];
      assert.ok(snippets[index].includes(snippet.text)); assert.ok(snippet.text.length <= 120);
    }
  }
  record('safe original display / URL refusal', { maliciousHTMLExecuted: false, sourceHref: href, invalidURLs, invalidLabels, oneEvidenceCapability: Object.keys(projection.options.extensions),
    revision: projection.options.extensions.snippets.expectedRevision });
});

test('long content uses bounded original marked windows and safe allowed source links', async () => {
  await search('content');
  assert.equal(await row('long').count(), 1);
  const source = await row('long').locator(hooks('result-title')).getAttribute('href');
  assert.equal(new URL(source, origin).pathname, '/docs/long');
  await search('grapefruit');
  assert.equal(await row('epsilon').locator(hooks('highlight')).innerText(), 'grapefruit');
  const projection = (await calls()).filter(call => call.options.extensions?.snippets).at(-1).result.extensions.snippets;
  assert.equal(projection.documents[0].snippets[0].text, 'red grapefruit');
  record('bounded long original / explicit mark', { longFixtureUTF16Units: await page.evaluate(() => window.harness.fixtures.find(value => value[0] === 'long')[4].length),
    maxWindowUTF16Units: 120, safeSource: source, exactOriginalMarkedText: 'red grapefruit' });
});

test('Inspector uses a separate revision checked actual fact request and native modal keyboard focus', async () => {
  await search('blue');
  const inspect = page.locator(hooks('inspect'));
  await inspect.focus(); await inspect.press('Enter');
  const dialog = page.locator(hooks('inspector'));
  await dialog.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('[data-raveldex-inspector-data]')?.textContent.includes('raveldex-bm25-v1'));
  assert.equal(await dialog.evaluate(node => node.open), true);
  assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true);
  const raw = (await calls()).filter(call => call.options.extensions?.inspector).at(-1);
  assert.deepEqual(Object.keys(raw.options.extensions), ['inspector']);
  assert.equal(raw.options.extensions.inspector.expectedRevision, 1);
  assert.equal(raw.result.extensions.inspector.documents[0].id, 'beta');
  assert.ok(raw.result.extensions.inspector.trace.facts.length > 0);
  assert.match(await page.locator(hooks('inspector-data')).innerText(), /beta/);
  await axe('open Inspector');
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  assert.equal(await inspect.evaluate(node => node === document.activeElement), true);
  await inspect.press('Enter'); await dialog.waitFor({ state: 'visible' });
  await page.locator(hooks('inspector-close')).press('Space'); await dialog.waitFor({ state: 'hidden' });
  assert.equal(await inspect.evaluate(node => node === document.activeElement), true);
  record('Inspector facts / keyboard modal lifecycle', { revision: raw.result.revision, document: 'beta', facts: raw.result.extensions.inspector.trace.facts.length,
    separateSoleExtension: true, EscapeAndNativeCloseRestoreFocus: true });
});

test('duplicate mount, destroy, late reply, and remount preserve authored nodes and borrowed engine', async () => {
  assert.equal(await page.evaluate(() => window.harness.duplicate()), true);
  const beforeCount = (await calls()).length;
  await page.evaluate(() => { window.harness.state.holdNext = true; });
  await input().fill('red'); await input().press('Enter');
  await page.waitForFunction(() => window.harness.state.pending.length === 1);
  await page.evaluate(() => { window.detachedInput = document.querySelector('[data-raveldex-input]'); window.detachedForm = document.querySelector('[data-raveldex-form]'); });
  await page.evaluate(() => window.harness.destroy());
  assert.equal(await page.locator(hooks('ui')).count(), 0);
  assert.equal(await page.locator('#authored').count(), 1);
  assert.equal(await page.evaluate(() => window.harness.originalNodes.every((node, index) => window.harness.root.childNodes[index] === node)), true);
  await page.evaluate(() => window.harness.release()); await page.waitForTimeout(60);
  assert.equal(await page.locator(hooks('ui')).count(), 0);
  const callsAfterDestroy = (await calls()).length;
  await page.evaluate(async () => {
    window.detachedInput.value = 'blue'; window.detachedInput.dispatchEvent(new Event('input', { bubbles: true }));
    window.detachedForm.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    await window.harness.handle.search();
  });
  await page.waitForTimeout(60);
  assert.equal((await calls()).length, callsAfterDestroy, 'detached old controls and destroyed handle cannot admit searches');
  assert.equal(await page.evaluate(() => window.harness.state.disposals), 0);
  assert.equal(await page.evaluate(async () => (await window.harness.engine.search('blue')).total), 1);
  assert.equal(await page.evaluate(() => window.harness.remount()), true);
  await settled();
  await search('blue');
  assert.equal(await row('beta').count(), 1);
  const later = (await calls()).slice(beforeCount);
  assert.equal(later.filter(call => call.options.extensions?.facets).length, 3, 'one held, one remount, one submitted main search');
  record('duplicate / authored rollback / late suppression / borrowed lifetime', { duplicateSameHandle: true,
    sameAuthoredNodeIdentities: true, detachedOldControlAndHandleSearches: 0, engineDisposals: 0, borrowedEngineStillSearches: true, mainCallsAfterRemount: 3 });
});

test('closing pending Inspector suppresses a late completed fact reply and restores focus', async () => {
  await search('blue');
  await page.evaluate(() => { window.harness.state.holdNext = true; });
  const inspect = page.locator(hooks('inspect'));
  await inspect.focus(); await inspect.press('Enter');
  const dialog = page.locator(hooks('inspector')); await dialog.waitFor({ state: 'visible' });
  await page.waitForFunction(() => window.harness.state.pending.length === 1);
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  assert.equal(await inspect.evaluate(node => node === document.activeElement), true);
  const waiting = (await calls()).find(call => !call.completed);
  assert.equal(waiting.aborted, true);
  await page.evaluate(() => window.harness.release()); await page.waitForTimeout(50);
  assert.equal(await dialog.isVisible(), false);
  assert.equal(await page.locator(hooks('inspector-data')).innerText(), '');
  assert.equal(await inspect.evaluate(node => node === document.activeElement), true);
  record('Inspector close during completed delayed reply', { signalAborted: true, discardedActualFactCount: waiting.result.extensions.inspector.trace.facts.length,
    staleDataPresented: false, restoredFocus: true });
});

test('narrow viewport, reduced motion, visible keyboard focus, and live status remain usable', async () => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.mouse.click(2, 2);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => { const node = document.activeElement; const style = getComputedStyle(node);
    return { tag: node.tagName, focusVisible: node.matches(':focus-visible'), outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth), outlineColor: style.outlineColor }; });
  assert.equal(focus.focusVisible, true); assert.notEqual(focus.outlineStyle, 'none'); assert.ok(focus.outlineWidth >= 2);
  await search('red');
  const layout = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    animations: [...document.querySelectorAll('[data-raveldex-ui], [data-raveldex-ui] *')].filter(node => {
      const style = getComputedStyle(node); return style.animationDuration !== '0s' || style.transitionDuration !== '0s';
    }).length }));
  assert.ok(layout.width <= layout.viewport); assert.equal(layout.reduced, true); assert.equal(layout.animations, 0);
  assert.equal(await status().getAttribute('role'), 'status');
  assert.match(await status().innerText(), /7 results/);
  await axe('320px reduced-motion results');
  record('narrow / motion / keyboard focus / live status', { ...layout, focus });
  if (process.env.RAVELDEX_UI_SCREENSHOTS) {
    await mkdir(resolve(process.env.RAVELDEX_UI_SCREENSHOTS), { recursive: true });
    await page.screenshot({ path: join(resolve(process.env.RAVELDEX_UI_SCREENSHOTS), 'rx-2006-narrow.png'), fullPage: true });
  }
});

test('real documentation pilot supports judged tasks and source/offset phrase presentation parity', async () => {
  await checkpoint('real-pilot:prepare:start');
  pilotConsumer = await prepareUIPilot();
  await checkpoint('real-pilot:prepare:done', { directory: pilotConsumer.directory });
  await page.evaluate(() => window.harness.cleanup());
  const network = [];
  page.on('request', request => network.push(request.url()));
  await page.goto(`${origin}/pilot/index.html`);
  await page.waitForFunction(() => document.querySelector('[data-pilot-search]')?.dataset.pilotState === 'ready');
  await settled();
  assert.match(await page.locator('[data-pilot-identity]').innerText(), /34 complete documentation sections from 5 allowlisted files/);
  const observations = [];
  for (const query of ['term contribution', 'original source', 'atomic batch', 'PostgreSQL replication']) {
    await search(query);
    const all = [];
    for (;;) {
      all.push(...await results().evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.raveldexResult,
        title: node.querySelector('[data-raveldex-result-title]').textContent,
        url: node.querySelector('[data-raveldex-result-title]').href,
        score: node.querySelector('[data-raveldex-score]').textContent }))));
      if (await page.locator(hooks('next')).getAttribute('aria-disabled') === 'true') break;
      await page.locator(hooks('next')).click(); await settled();
    }
    const terms = query.toLowerCase().match(/[a-z]+/g);
    const expected = pilotConsumer.corpus.records.filter(document => {
      const tokens = new Set(Object.values(document.text).flat().flatMap(value => value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu) ?? []));
      return terms.every(term => tokens.has(term));
    }).map(document => document.id).sort();
    assert.deepEqual(all.map(document => document.id).sort(), expected, `complete independent raw-source membership: ${query}`);
    for (const document of all) {
      assert.ok(pilotConsumer.corpus.sections.some(section => section.id === document.id && section.sourceUrl === document.url && section.title === document.title));
      assert.equal(new URL(document.url).hostname, 'github.com');
    }
    const judgment = DOCS_JUDGMENTS.find(value => value.query === query);
    observations.push({ query, total: all.length, hits: all, intendedRank: judgment?.intendedIds.map(id => ({ id, rank: all.findIndex(hit => hit.id === id) + 1 || null })),
      acceptableTop1: all.length ? judgment?.acceptableIds.includes(all[0].id) ?? null : null });
  }
  await search('term contribution');
  await page.locator('[data-pilot-mode]').selectOption('phrase');
  await page.waitForFunction(() => document.querySelector('[data-pilot-search]')?.dataset.pilotState === 'ready');
  await settled();
  const source = await results().evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.raveldexResult,
    score: node.querySelector('[data-raveldex-score]').textContent, snippets: [...node.querySelectorAll('[data-raveldex-snippet]')].map(snippet => snippet.textContent) })));
  assert.ok(source.length > 0);
  await page.locator('[data-pilot-representation]').selectOption('offsets');
  await page.waitForFunction(() => document.querySelector('[data-pilot-status]')?.textContent.includes('Stored positions and original offsets'));
  await settled();
  const offsets = await results().evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.raveldexResult,
    score: node.querySelector('[data-raveldex-score]').textContent, snippets: [...node.querySelectorAll('[data-raveldex-snippet]')].map(snippet => snippet.textContent) })));
  assert.deepEqual(offsets, source);
  assert.equal(await input().inputValue(), 'term contribution');
  await axe('real-document offsets phrase pilot');
  await page.locator('[data-pilot-destroy]').click();
  assert.equal(await page.locator(hooks('ui')).count(), 0);
  await page.locator('[data-pilot-initialize]').click();
  await page.waitForFunction(() => document.querySelector('[data-pilot-search]')?.dataset.pilotState === 'ready');
  await settled();
  assert.equal(await input().inputValue(), 'term contribution');
  assert.ok(network.every(url => new URL(url).origin === origin));
  record('real-document task / representation / lifecycle pilot', { corpusHash: pilotConsumer.corpus.hash,
    corpusSources: pilotConsumer.corpus.sources, observations, sourceOffsetPhraseParity: source,
    sameOriginRequestsOnly: true, destroyReinitializePreservedQuery: true,
    packageSHA256: pilotConsumer.package.sha256 });
}, { timeout: 120_000 });
