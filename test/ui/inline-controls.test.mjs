import assert from 'node:assert/strict';
import { test, before, beforeEach, afterEach, after } from 'node:test';
import { createServer } from 'node:http';
import { copyFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { platform, release, arch } from 'node:os';
import { gzipSync } from 'node:zlib';
import { build, version as esbuildVersion } from 'esbuild';
import { chromium } from 'playwright-core';
import { prepareConsumer, command, digest, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

let consumer, browser, server, origin, context, page, errors;
const defaults = { facets: [{ field: 'category', label: 'Category' }], snippetFields: ['body'] };
const expected = Array.from({ length: 12 }, (_, i) => `item-${String(i).padStart(2, '0')}`);
const report = { kind: 'raveldex-inline-controls-browser-v1', startedAt: new Date().toISOString(), observations: [], screenshots: [],
  environment: { node: process.version, os: { platform: platform(), release: release(), arch: arch() }, esbuild: esbuildVersion },
  limits: { assistiveTechnology: 'Not run; automated DOM and axe observations only.', physicalIME: 'Not run; synthetic composition regression remains in the foundation suite.',
    zoomAndTouch: 'Actual browser zoom, physical touch and on-screen keyboard not run.', memory: 'Not measured. Bundle bytes and DOM counts are not retained/peak memory.' } };
const root = () => page.locator('#controls-root');
const part = name => root().locator(`.raveldex-inline__${name}`);
const ids = () => part('result').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-raveldex-inline-result')));
const observation = (name, evidence) => report.observations.push({ name, status: 'Pass', evidence });
async function open(options = {}, setup = {}) {
  await page.evaluate(async ({ options, setup, defaults }) => { await window.controlsHarness?.cleanup(); await window.createControlsFixture({ ...defaults, ...options }, setup); }, { options, setup, defaults });
}
async function search(value = 'source prov') { await page.evaluate(text => window.controlsHarness.handle.search(text), value); }
async function settled() { await page.waitForFunction(() => document.querySelector('#controls-root .raveldex-inline')?.getAttribute('aria-busy') === 'false'); }
async function activate(name) { await root().getByRole('button', { name, exact: true }).click(); await settled(); }
async function snippets() {
  return part('result').evaluateAll(nodes => nodes.map(item => ({ id: item.getAttribute('data-raveldex-inline-result'),
    snippets: [...item.querySelectorAll('.raveldex-inline__snippet')].map(node => ({
      text: [...node.childNodes].filter(child => !(child instanceof Element && child.getAttribute('aria-hidden') === 'true')).map(child => child.textContent).join(''),
      marks: [...node.querySelectorAll('mark')].map(mark => mark.textContent),
    })), omissions: item.querySelector('.raveldex-inline__snippet-omissions')?.textContent ?? '' })));
}
async function selectCategory(label) {
  const value = await part('facet').locator('option').evaluateAll((nodes, label) => nodes.find(node => node.textContent.startsWith(label + ' ('))?.value, label);
  assert.notEqual(value, undefined, `category option ${label}`); await part('facet').selectOption(value); await settled();
}
async function save() {
  if (!process.env.RAVELDEX_INLINE_CONTROLS_REPORT) return;
  const path = resolve(process.env.RAVELDEX_INLINE_CONTROLS_REPORT); await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2) + '\n');
}
async function screenshot(name) {
  if (!process.env.RAVELDEX_INLINE_CONTROLS_REPORT) return;
  const path = resolve(process.env.RAVELDEX_INLINE_CONTROLS_REPORT.replace(/\.json$/, '') + `-${name}.png`);
  await mkdir(dirname(path), { recursive: true }); await page.screenshot({ path, fullPage: true });
  report.screenshots.push({ name, path, viewport: page.viewportSize() });
}

before(async () => {
  consumer = await prepareConsumer([], []);
  for (const [from, to] of [['inline-controls-fixture.mjs', 'controls-entry.mjs'], ['inline-controls-worker.mjs', 'inline-controls-worker.mjs']])
    await copyFile(join(REPO_ROOT, 'test/ui', from), join(consumer.directory, to));
  const settings = { absWorkingDir: consumer.directory, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true,
    treeShaking: true, legalComments: 'none', metafile: true, logLevel: 'silent' };
  const product = await build({ ...settings, entryPoints: ['controls-entry.mjs'], outfile: join(consumer.directory, 'fixture.mjs') });
  await build({ ...settings, entryPoints: ['inline-controls-worker.mjs'], outfile: join(consumer.directory, 'controls-worker.mjs') });
  for (const path of Object.keys(product.metafile.inputs)) assert.ok(['controls-entry.mjs', 'inline-controls-worker.mjs'].includes(path)
    || path.startsWith('node_modules/@vmitsaras/raveldex/dist/'), `foreign fixture source ${path}`);
  await writeFile(join(consumer.directory, 'inline-entry.mjs'), "export { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';\n");
  const inline = await build({ ...settings, entryPoints: ['inline-entry.mjs'], outfile: join(consumer.directory, 'inline.mjs') });
  const graph = Object.keys(inline.metafile.inputs);
  assert.ok(graph.every(path => path === 'inline-entry.mjs' || path.includes('/addons/ui/') || path.endsWith('/addons/sections/validation.js') || path.endsWith('/core/contracts/data.js') || path.endsWith('/core/errors/error.js')),
    'inline stays isolated from engine/provider implementations');
  const bytes = await readFile(join(consumer.directory, 'inline.mjs'));
  const css = await readFile(join(consumer.installed, 'dist/addons/ui/inline.css')); await writeFile(join(consumer.directory, 'inline.css'), css);
  await copyFile(join(REPO_ROOT, 'test/consumer/inline-types.ts'), join(consumer.directory, 'inline-types.ts'));
  await writeFile(join(consumer.directory, 'inline-tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM'], types: [], strict: true,
    noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, verbatimModuleSyntax: true, skipLibCheck: false, noEmit: true,
  }, include: ['inline-types.ts'] }));
  await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', join(consumer.directory, 'inline-tsconfig.json')], consumer.directory);
  report.package = consumer.package;
  report.graph = { inputs: graph, minifiedBytes: bytes.length, gzipBytes: gzipSync(bytes).length, sha256: digest(bytes), cssBytes: css.length,
    cssSha256: digest(css), publicTypes: 'Pass' };
  await writeFile(join(consumer.directory, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inline controls verification</title><link rel="stylesheet" href="/inline.css"></head><body><main><h1>Inline search controls</h1><div id="controls-root"><p id="authored">Browse the guides</p></div></main><script type="module" src="/fixture.mjs"></script></body></html>');
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const file = { '/': 'index.html', '/fixture.mjs': 'fixture.mjs', '/controls-worker.mjs': 'controls-worker.mjs', '/inline.css': 'inline.css' }[path];
    if (!file) { response.writeHead(404); response.end(); return; }
    try { response.setHeader('content-type', file.endsWith('.css') ? 'text/css' : file.endsWith('.mjs') ? 'text/javascript' : 'text/html');
      response.setHeader('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self'; img-src 'none'");
      response.end(await readFile(join(consumer.directory, file)));
    } catch { response.writeHead(500); response.end(); }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); }); origin = `http://127.0.0.1:${server.address().port}`;
  const channel = process.env.RAVELDEX_UI_BROWSER ?? 'chrome'; assert.ok(['chrome', 'chromium'].includes(channel));
  browser = await chromium.launch({ ...(channel === 'chrome' ? { channel: 'chrome' } : {}), headless: true });
  report.environment.browser = { channel, version: browser.version(), headless: true };
  console.log(JSON.stringify({ kind: report.kind, graph: report.graph, browser: report.environment.browser }));
}, { timeout: 120_000 });
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 1100, height: 850 }, reducedMotion: 'reduce' });
  page = await context.newPage(); errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin); await page.waitForFunction(() => typeof window.createControlsFixture === 'function'); await open();
});
afterEach(async () => { try { await page.evaluate(() => window.controlsHarness?.cleanup()); assert.deepEqual(errors, []); }
  finally { await context?.close(); await save(); } });
after(async () => { try { await browser?.close(); } finally {
  if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  report.finishedAt = new Date().toISOString(); await save();
} });

for (const host of ['direct', 'worker']) for (const strategy of ['source', 'offsets']) {
  test(`${host}/${strategy}: native full-batch IDs, exact counts, snippets and filters agree with hand fixtures`, async () => {
    await open({}, { host, strategy }); await search();
    assert.deepEqual(await ids(), expected.slice(0, 5));
    assert.match(await part('status').textContent(), /12/);
    for (const row of await snippets()) assert.deepEqual(row.snippets, [{ text: 'source provider', marks: ['source', 'provider'] }]);
    await activate('Load more'); assert.deepEqual(await ids(), expected.slice(0, 10));
    assert.equal(await part('load-more').evaluate(node => node === document.activeElement), true);
    await activate('Load more'); assert.deepEqual(await ids(), expected);
    assert.equal(await part('load-more').getAttribute('aria-disabled'), 'true');
    const optionLabels = await part('facet').locator('option').allTextContents();
    assert.ok(optionLabels.includes('Guide (7)')); assert.ok(optionLabels.includes('Reference (5)'));
    await selectCategory('Reference'); assert.deepEqual(await ids(), expected.slice(7));
    assert.match(await part('status').textContent(), /5/);
    const calls = await page.evaluate(() => window.controlsHarness.calls());
    const nativeResults = calls.filter(call => !call.evidence && call.result).map(call => ({ total: call.result.total, offset: call.options.offset, revision: call.result.revision }));
    assert.deepEqual(nativeResults.map(row => row.total), [12, 12, 12, 5]);
    assert.deepEqual(nativeResults.map(row => row.offset), [0, 5, 10, 0]);
    observation(`${host}/${strategy} complete ordered native pages and source snippets`, { expectedIDs: expected, filteredIDs: expected.slice(7), nativeResults });
  });
}

test('a nonmultiple DOM cap has lossless Next/Previous windows and exact range summaries', async () => {
  await open({ maxRenderedResults: 7 }); await search(); await activate('Load more');
  const first = await ids(); assert.deepEqual(first, expected.slice(0, 7));
  assert.equal(await part('load-more').getAttribute('aria-disabled'), 'true');
  assert.match(await part('page-summary').textContent(), /1.*7.*12/);
  await activate('Next results'); const second = await ids(); assert.deepEqual(second, expected.slice(7));
  assert.equal(await part('next').evaluate(node => node === document.activeElement), true);
  assert.equal(await part('next').getAttribute('aria-disabled'), 'true');
  assert.deepEqual([...first, ...second], expected); assert.equal(new Set([...first, ...second]).size, 12);
  await activate('Previous results'); assert.deepEqual(await ids(), expected.slice(0, 5));
  assert.equal(await part('previous').evaluate(node => node === document.activeElement), true);
  observation('bounded DOM / lossless continuation', { cap: 7, first, second, exactTotal: 12, maximumObservedItems: 7 });
});

test('filter-only browsing, zero projected selections and clear retain coherent state/focus', async () => {
  assert.equal(await page.evaluate(() => window.controlsHarness.calls().length), 0);
  // Initial idle facets need a real query before their native buckets exist.
  await search(); await part('facet').focus(); await selectCategory('Guide');
  assert.equal(await part('facet').evaluate(node => node === document.activeElement), true);
  await activate('Load more'); assert.deepEqual(await ids(), expected.slice(0, 7));
  await page.evaluate(() => window.controlsHarness.recategorize()); await search();
  assert.deepEqual(await ids(), []);
  const selected = await part('facet').evaluate(node => node.selectedOptions[0].textContent);
  assert.match(selected, /Guide/); assert.match(selected, /not in displayed/);
  await root().getByRole('button', { name: 'Clear', exact: true }).click();
  assert.equal(await part('clear').evaluate(node => node === document.activeElement), true);
  assert.equal(await part('facet').inputValue(), ''); assert.equal(await part('input').inputValue(), '');
  assert.equal(await part('status').textContent(), 'Enter a search term.');
  await search(); await selectCategory('Reference');
  await part('input').fill(''); await part('input').press('Enter'); await settled();
  assert.deepEqual(await ids(), expected.slice(0, 5)); assert.match(await part('status').textContent(), /12/);
  observation('selected missing bucket / clear / filter-only query', { retained: selected, clearedToIdle: true, filterOnlyTotal: 12 });
});

test('native facet projection exposes omitted buckets without changing exact result counts', async () => {
  await open({}, { corpus: 'projection' }); await search();
  assert.equal(await part('facet').locator('option').count(), 101);
  assert.match(await part('facet-summary').textContent(), /101/); assert.match(await part('facet-summary').textContent(), /1/);
  const main = await page.evaluate(() => window.controlsHarness.calls().find(call => !call.evidence).result);
  const field = main.extensions.facets.fields[0];
  assert.deepEqual([main.total, field.distinctValueTotal, field.omittedBucketCount, field.buckets.length], [101, 101, 1, 100]);
  observation('native 100-bucket projection remains explicit', { total: 101, distinct: 101, omitted: 1, renderedBuckets: 100 });
});

test('configured 1000-result DOM ceiling has explicit continuation and exact 1005-record coverage', async () => {
  await open({ pageSize: 100, maxRenderedResults: 1000, facets: [], snippetFields: [] }, { corpus: 'capacity', features: 'core' });
  const all = Array.from({ length: 1005 }, (_, i) => `large-${String(i).padStart(4, '0')}`);
  await search();
  let maximumObservedItems = (await ids()).length;
  for (let i = 0; i < 9; i++) { await activate('Load more'); maximumObservedItems = Math.max(maximumObservedItems, (await ids()).length); }
  const first = await ids(); assert.deepEqual(first, all.slice(0, 1000));
  assert.equal(maximumObservedItems, 1000); assert.equal(await part('load-more').getAttribute('aria-disabled'), 'true');
  await activate('Next results'); const final = await ids(); assert.deepEqual(final, all.slice(1000));
  assert.deepEqual([...first, ...final], all); assert.equal(await part('next').getAttribute('aria-disabled'), 'true');
  observation('actual configured maximum rendered window', { records: 1005, configuredCap: 1000, maximumObservedItems, continuationItems: final.length,
    claim: 'Observed DOM item counts, not a universal latency/capacity or memory guarantee.' });
});

for (const corpus of ['unicode', 'values', 'omissions']) test(`${corpus}: snippets preserve exact original values, highlights and omission facts`, async () => {
  const observations = [];
  for (const strategy of ['source', 'offsets']) {
    await open({}, { strategy, corpus }); await search(corpus === 'omissions' ? 'source prov' : 'café prov');
    const visible = await snippets(); assert.equal(visible.length, 1);
    if (corpus === 'unicode') assert.deepEqual(visible[0].snippets, [{ text: '😀 CAFE\u0301—Provider <script>literal</script>', marks: ['CAFE\u0301', 'Provider'] }]);
    if (corpus === 'values') assert.deepEqual(visible[0].snippets, [
      { text: 'CAFE\u0301 source', marks: ['CAFE\u0301'] }, { text: 'Provider after', marks: ['Provider'] },
    ]);
    const raw = await page.evaluate(() => {
      const h = window.controlsHarness, call = h.calls().find(call => call.evidence && call.result);
      return { original: h.rows[0].text.body, document: call.result.extensions.snippets.documents[0] };
    });
    for (const snippet of raw.document.snippets) {
      const original = Array.isArray(raw.original) ? raw.original[snippet.valueIndex] : raw.original;
      assert.equal(snippet.text, original.slice(snippet.start, snippet.end));
      for (const mark of snippet.highlights) assert.ok(['source', 'provider', 'CAFE\u0301', 'Provider'].includes(snippet.text.slice(mark.start, mark.end)));
    }
    if (corpus === 'omissions') {
      assert.equal(raw.document.snippetOmissions.unshownMatches, 119);
      assert.match(visible[0].omissions, /119/); assert.equal(visible[0].snippets[0].marks.length, 1);
    }
    assert.equal(await root().locator('script, img').count(), 0);
    observations.push({ strategy, visible, raw });
  }
  assert.deepEqual(observations[0].visible, observations[1].visible);
  observation(`${corpus} original source / offsets parity`, observations);
});

test('append and evidence revision races clear stale accumulation and retry starts a coherent first batch', async () => {
  await search(); await activate('Load more'); assert.equal((await ids()).length, 10);
  await page.evaluate(() => window.controlsHarness.replaceFirst()); await activate('Load more');
  assert.deepEqual(await ids(), []);
  assert.equal(await part('status').textContent(), 'The index changed. Search again to refresh the results.');
  await activate('Retry search'); assert.deepEqual(await ids(), expected.slice(0, 5));
  await page.evaluate(() => { window.controlsHarness.state.mutateBeforeEvidence = true; }); await search();
  assert.deepEqual(await ids(), []); assert.equal(await part('status').textContent(), 'The index changed. Search again to refresh the results.');
  await activate('Retry search'); assert.deepEqual(await ids(), expected.slice(0, 5));
  observation('append / main-versus-snippets revision refusal', { resetCounts: true, retryIDs: expected.slice(0, 5) });
});

test('ignored-abort evidence and pending Load more cannot publish after clear, new query or destroy', async () => {
  await page.evaluate(() => { window.controlsHarness.state.holdEvidence = true; void window.controlsHarness.handle.search('source prov'); });
  await page.waitForFunction(() => window.controlsHarness.state.pending.length === 1);
  await search('missing'); await page.evaluate(() => window.controlsHarness.release()); await page.waitForTimeout(50);
  assert.deepEqual(await ids(), []); assert.equal(await part('status').textContent(), 'No results.');
  await search();
  await page.evaluate(() => { window.controlsHarness.state.holdMain = true; });
  await part('load-more').click(); await page.waitForFunction(() => window.controlsHarness.state.pending.length === 1);
  await page.evaluate(() => { window.controlsHarness.handle.clear(); window.controlsHarness.release(); }); await page.waitForTimeout(50);
  assert.deepEqual(await ids(), []); assert.equal(await part('status').textContent(), 'Enter a search term.');
  await search(); await page.evaluate(() => { window.controlsHarness.state.holdMain = true; });
  await part('load-more').click(); await page.waitForFunction(() => window.controlsHarness.state.pending.length === 1);
  const destroyed = await page.evaluate(async () => {
    const h = window.controlsHarness; h.handle.destroy(); h.release();
    const restored = h.root.childNodes.length === h.originalNodes.length && h.originalNodes.every((node, i) => h.root.childNodes[i] === node);
    const found = await h.owner.search({ kind: 'all' }); return { restored, total: found.total, disposals: h.state.disposals };
  });
  assert.deepEqual(destroyed, { restored: true, total: 12, disposals: 0 });
  observation('stale optional evidence / append / destroyed owner', destroyed);
});

test('requested absent snippets/facets fail explicitly even for zero matching IDs', async () => {
  await open({ facets: [] }, { features: 'facets-only' }); await search('missing');
  assert.deepEqual(await ids(), []); assert.match(await part('status').textContent(), /MISSING_CAPABILITY/);
  await open({ snippetFields: [] }, { features: 'snippets-only' }); await search();
  assert.deepEqual(await ids(), []); assert.match(await part('status').textContent(), /MISSING_CAPABILITY/);
  await open({ facets: [], snippetFields: [] }, { features: 'core' }); await search();
  assert.deepEqual(await ids(), expected.slice(0, 5));
  observation('explicit optional capability boundaries', { snippetsMissingEvenWithZeroHits: true, facetsMissing: true, coreOnlyIDs: expected.slice(0, 5) });
});

test('new option nulls, invalid arrays and display caps fail before replacing authored DOM or searching', async () => {
  const actual = await page.evaluate(() => window.controlsHarness.invalidOptions());
  assert.equal(actual.searches, 0);
  for (const row of actual.outcomes) { assert.equal(row.code, 'INVALID_OPTIONS', row.name); assert.equal(row.preserved, true, row.name); }
  observation('strict new option admission', actual);
});

test('theme overrides, long RTL labels, narrow layout and forced colors retain usable controls and highlights', async () => {
  await search(); await screenshot('desktop');
  await open({ messages: { label: 'ابحث في جميع أدلة الإعداد ومراجع واجهة البحث الطويلة '.repeat(8) } });
  await search();
  await root().evaluate(node => {
    node.dir = 'rtl'; node.style.setProperty('--raveldex-inline-background', '#101820'); node.style.setProperty('--raveldex-inline-color', '#f6f8fa');
    node.style.setProperty('--raveldex-inline-muted', '#c8d3de'); node.style.setProperty('--raveldex-inline-accent', '#d1edff');
    node.style.setProperty('--raveldex-inline-font-size', '18px'); node.style.setProperty('--raveldex-inline-radius', '12px');
  });
  await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const styles = await part('input').evaluate(node => ({ fontSize: getComputedStyle(node).fontSize, radius: getComputedStyle(node).borderRadius }));
  assert.deepEqual(styles, { fontSize: '18px', radius: '12px' });
  await screenshot('mobile-rtl-dark'); await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await part('input').focus();
  assert.notEqual(await part('input').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
  await page.addScriptTag({ path: join(REPO_ROOT, 'node_modules/axe-core/axe.min.js') });
  const axe = await page.evaluate(async () => {
    const found = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    return { violations: found.violations.map(item => ({ id: item.id, impact: item.impact, targets: item.nodes.map(node => node.target) })), tool: found.testEngine };
  });
  assert.deepEqual(axe.violations, []);
  observation('automated theme / RTL / 320px / forced colors', { styles, axe, physicalZoomAndAT: 'Not run' });
});
