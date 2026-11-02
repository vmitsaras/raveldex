import assert from 'node:assert/strict';
import { test, before, beforeEach, afterEach, after } from 'node:test';
import { createServer } from 'node:http';
import { copyFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { platform, release, arch } from 'node:os';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { prepareConsumer, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';
const corpus = JSON.parse(await readFile(new URL('../fixtures/page-sections/corpus.json', import.meta.url)));
const projection = JSON.parse(await readFile(new URL('../fixtures/page-sections/projection.json', import.meta.url)));
let consumer, browser, server, origin, context, page, errors;
const report = { kind: 'raveldex-inline-sections-browser-v1', startedAt: new Date().toISOString(), observations: [],
  environment: { node: process.version, platform: platform(), release: release(), arch: arch() },
  limitations: 'Automated Chromium DOM/axe/navigation evidence; no human AT, physical input, zoom, broad platform, retained/peak memory or physical paint claim.' };
const part = name => page.locator(`#section-root .raveldex-inline__${name}`);
const ids = () => part('result').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-raveldex-inline-result')));
async function open(options = {}, setup = {}) { await page.evaluate(async args => { await window.sectionHarness?.cleanup(); await window.createSectionFixture(...args); }, [options, setup]); }
async function search(query = 'cross-section') { await page.evaluate(query => window.sectionHarness.search(query), query); }
async function settle() { await page.waitForFunction(() => document.querySelector('#section-root .raveldex-inline')?.getAttribute('aria-busy') === 'false'); }
async function click(name) { await part(name).click(); await settle(); }
async function rows() {
  return part('result').evaluateAll(nodes => nodes.map(node => ({ id: node.getAttribute('data-raveldex-inline-result'), state: node.getAttribute('data-raveldex-inline-section-state'),
    sections: [...node.querySelectorAll('.raveldex-inline__section')].map(s => ({ anchor: s.getAttribute('data-raveldex-inline-section'),
      heading: s.querySelector('a').textContent, href: s.querySelector('a').href,
      text: [...s.querySelector('.raveldex-inline__snippet')?.childNodes ?? []].filter(n => !(n instanceof Element && n.getAttribute('aria-hidden') === 'true')).map(n => n.textContent).join(''),
      marks: [...s.querySelectorAll('mark')].map(n => n.textContent) })), omitted: !!node.querySelector('.raveldex-inline__section-omissions') })));
}
function observe(name, data) { report.observations.push({ name, status: 'Pass', data }); }
async function save() { if (!process.env.RAVELDEX_INLINE_SECTIONS_REPORT) return; const path = resolve(process.env.RAVELDEX_INLINE_SECTIONS_REPORT); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(report, null, 2) + '\n'); }
before(async () => {
  consumer = await prepareConsumer([], []);
  for (const [from, to] of [['inline-sections-fixture.mjs', 'entry.mjs'], ['inline-sections-worker.mjs', 'inline-sections-worker.mjs']]) await copyFile(join(REPO_ROOT, 'test/ui', from), join(consumer.directory, to));
  for (const file of ['corpus.json', 'projection.json']) await copyFile(join(REPO_ROOT, 'test/fixtures/page-sections', file), join(consumer.directory, file));
  const settings = { absWorkingDir: consumer.directory, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, legalComments: 'none', logLevel: 'silent' };
  await build({ ...settings, entryPoints: ['entry.mjs'], outfile: join(consumer.directory, 'fixture.mjs') });
  await build({ ...settings, entryPoints: ['inline-sections-worker.mjs'], outfile: join(consumer.directory, 'section-worker.mjs') });
  await copyFile(join(consumer.installed, 'dist/addons/ui/inline.css'), join(consumer.directory, 'inline.css'));
  await copyFile(join(REPO_ROOT, 'node_modules/axe-core/axe.min.js'), join(consumer.directory, 'axe.js'));
  await writeFile(join(consumer.directory, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Section preview verification</title><link rel="stylesheet" href="/inline.css"></head><body><main><h1>Documentation search</h1><div id="section-root"><p id="authored">Browse the guides</p></div></main><script type="module" src="/fixture.mjs"></script></body></html>');
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const file = { '/': 'index.html', '/fixture.mjs': 'fixture.mjs', '/section-worker.mjs': 'section-worker.mjs', '/inline.css': 'inline.css', '/axe.js': 'axe.js' }[path];
    if (!file) {
      if (/^\/(help\/)?guide\/[a-d]\/$/.test(path)) {
        const anchors = ['details', 'details-2', 'next-steps', '%#café', 'covered', 'title', 'later-value', 'early-value'];
        response.setHeader('content-type', 'text/html; charset=utf-8'); response.end('<!doctype html><html lang="en"><title>Anchored destination</title><main><h1>Guide</h1>' + anchors.map(id => '<h2 id="' + id + '">' + id + '</h2>').join('') + '</main></html>'); return;
      }
      response.writeHead(404); response.end(); return;
    }
    response.setHeader('content-type', file.endsWith('.css') ? 'text/css' : file.endsWith('.mjs') || file.endsWith('.js') ? 'text/javascript' : 'text/html');
    response.end(await readFile(join(consumer.directory, file)));
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); }); origin = `http://127.0.0.1:${server.address().port}`;
  const channel = process.env.RAVELDEX_UI_BROWSER ?? 'chrome'; browser = await chromium.launch({ ...(channel === 'chrome' ? { channel } : {}), headless: true });
  report.environment.browser = browser.version(); report.package = consumer.package;
}, { timeout: 120000 });
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 1100, height: 850 }, reducedMotion: 'reduce' }); page = await context.newPage(); errors = [];
  page.on('pageerror', e => errors.push(e.message)); await page.goto(origin); await page.waitForFunction(() => typeof window.createSectionFixture === 'function'); await open();
});
afterEach(async () => { try { await page.evaluate(() => window.sectionHarness?.cleanup()); assert.deepEqual(errors, []); } finally { await context?.close(); await save(); } });
after(async () => { await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); } report.finishedAt = new Date().toISOString(); await save(); });

for (const host of ['direct', 'worker']) for (const strategy of ['source', 'offsets']) test(`${host}/${strategy}: literal pages, source-order anchors, source slices and complete paging`, async () => {
  await open({}, { host, strategy });
  for (const fixture of projection.cases.filter(c => !c.mapOverride)) {
    await search(fixture.queryId); assert.deepEqual(await ids(), corpus.expectedPages.ids.slice(0, 2)); await click('load-more');
    const actual = await rows(); assert.deepEqual(actual.map(r => r.id), corpus.expectedPages.ids);
    for (const expected of fixture.expected) {
      const row = actual.find(r => r.id === expected.pageId); assert.equal(row.state, expected.state);
      assert.deepEqual(row.sections.map(s => s.anchor), expected.selectedAnchors);
      for (let i = 0; i < expected.excerpts.length; i++) {
        const excerpt = expected.excerpts[i], source = corpus.sourceSlices[excerpt.sourceSliceIndex], section = row.sections[i];
        assert.equal(section.text, source.text);
        assert.deepEqual(section.marks, excerpt.highlights.map(([start, end]) => source.text.slice(start, end)));
        assert.equal(decodeURIComponent(new URL(section.href).hash.slice(1)), section.anchor);
      }
    }
    const native = await page.evaluate(query => window.sectionHarness.owner.search(query, { limit: 4 }), corpus.queries.find(q => q.id === fixture.queryId).query);
    assert.equal(native.total, 4); assert.deepEqual(native.hits.map(h => h.id), corpus.expectedPages.ids);
    for (const hit of native.hits) assert.ok(Math.abs(hit.score - corpus.queries.find(q => q.id === fixture.queryId).expectedScore) < 1e-14);
    const calls = await page.evaluate(() => window.sectionHarness.state.calls);
    const batch = calls.filter(c => !c.evidence).slice(-2);
    for (const call of calls.filter(c => c.evidence).slice(-3)) assert.ok(batch.some(main => JSON.stringify(main.result.hits) === JSON.stringify(call.result.hits) && main.result.total === call.result.total));
    assert.equal(await page.evaluate(() => window.sectionHarness.state.maxRunning), 1);
  }
  observe(`${host}/${strategy} literal query matrix`, { queries: 7, expectedPages: corpus.expectedPages.ids, sourceSlices: corpus.sourceSlices.length, maxConcurrentRequests: 1 });
});

test('one/two/three preview caps, empty map and boundary-only ranges remain scoped', async () => {
  for (const cap of [1, 2, 3]) {
    await open({ maxSectionPreviews: cap }); await search(); const first = (await rows())[0];
    assert.equal(first.sections.length, cap); assert.equal(first.omitted, cap < 4);
    const payload = await page.evaluate(() => window.sectionHarness.state.calls.find(c => c.evidence).request.extensions['section-evidence']);
    assert.equal(payload.maxPreviews, cap); assert.equal(payload.sections.length, 4); assert.equal(JSON.stringify(payload).includes('heading'), false); assert.equal(JSON.stringify(payload).includes('anchor'), false);
  }
  for (const fixture of projection.cases.filter(c => c.mapOverride)) {
    await open({}, { mapOverride: fixture.mapOverride }); await search(fixture.queryId); await click('load-more');
    const actual = (await rows()).find(r => r.id === fixture.mapOverride.pageId), expected = fixture.expected[0];
    assert.equal(actual.state, expected.state); assert.deepEqual(actual.sections.map(s => s.anchor), expected.selectedAnchors);
    if (!fixture.mapOverride.sections.length) assert.equal(await page.evaluate(() => window.sectionHarness.state.calls.filter(c => c.evidence && c.request.extensions['section-evidence'].ids[0] === 'page:c').length), 0);
  }
  observe('preview caps / whole token containment / empty map', { caps: [1, 2, 3], cases: 2 });
});

test('null excerpts retain the first headings and lowered highlight caps keep truthful omissions', async () => {
  await open({}, { settings: { maxCodeUnits: 4 } }); await search();
  const first = (await rows())[0]; assert.deepEqual(first.sections.map(s => s.anchor), ['details', 'details-2', 'next-steps']);
  assert.ok(first.sections.every(s => s.text === '' && s.marks.length === 0)); assert.equal(first.omitted, true);
  await open({}, { settings: { maxHighlights: 1 } }); await search('two-groups'); await click('load-more');
  const later = (await rows()).find(r => r.id === 'page:d'); assert.deepEqual(later.sections.find(s => s.anchor === 'later-value').marks, ['alpha']); assert.equal(later.omitted, true);
  await open({ pageSections: undefined }); await search(); assert.deepEqual(await ids(), ['page:a', 'page:b']);
  assert.equal(await page.evaluate(() => window.sectionHarness.state.calls.filter(c => c.evidence).length), 0);
  assert.equal((await rows())[0].state, null);
  await open(); await page.evaluate(async () => { const original = Intl.Segmenter; Intl.Segmenter = undefined; try { await window.sectionHarness.search(); } finally { Intl.Segmenter = original; } });
  assert.equal((await rows())[0].state, 'unavailable'); assert.deepEqual(await ids(), ['page:a', 'page:b']);
  observe('null excerpts / configured highlight cap / absent feature / missing Segmenter', { firstHeadingRetained: true, highlightCap: 1, absentMapNoEvidence: true, missingSegmenterPageOnly: true });
});

test('map capture rejects malformed metadata before DOM and owns caller copies', async () => {
  const outcomes = await page.evaluate(() => window.sectionHarness.invalidOptions());
  for (const result of outcomes) { assert.equal(result.code, 'INVALID_OPTIONS', result.name); assert.equal(result.preserved, true, result.name); }
  await page.evaluate(() => { const h = window.sectionHarness; h.maps.pages[0].sections[0].heading = '<script>changed</script>'; h.maps.pages[0].sections[0].end = 1; h.documents[0].url = '/wrong/'; });
  await search(); const first = (await rows())[0]; assert.equal(first.sections[0].heading, 'Details'); assert.equal(first.sections[0].href, origin + '/help/guide/a/#details');
  assert.equal(await part('result').locator('script').count(), 0);
  observe('synchronous validation and capture ownership', { invalidCases: outcomes.length, preservedDOM: true, callerMutationIgnored: true });
});

test('missing/typed context refusals retain exact pages; unknown failures remain whole-request errors', async () => {
  for (const host of ['direct', 'worker']) { await open({}, { host, feature: 'none' }); await search(); assert.deepEqual(await ids(), ['page:a', 'page:b']); assert.equal((await rows())[0].state, 'unavailable'); }
  for (const code of ['MISSING_CAPABILITY', 'INCOMPATIBLE_CAPABILITY', 'INVALID_OPTIONS', 'LIMIT_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED', 'DEADLINE_EXCEEDED', 'UNSUPPORTED_ENVIRONMENT']) {
    await open(); await page.evaluate(code => { window.sectionHarness.state.failure = code; }, code); await search();
    assert.deepEqual(await ids(), ['page:a', 'page:b']); assert.equal((await rows())[0].state, 'unavailable'); assert.match(await part('section-unavailable').textContent(), /unavailable/);
  }
  await open(); await page.evaluate(() => { window.sectionHarness.state.failure = 'MISSING_CAPABILITY'; window.sectionHarness.state.spoof = true; }); await search();
  assert.deepEqual(await ids(), []); assert.match(await part('status').textContent(), /MISSING_CAPABILITY/); assert.equal(await part('retry').isVisible(), true);
  observe('native refusal vs unknown failure', { nativeRefusalCodes: 8, spoofCodeDoesNotFallback: true });
});

test('malformed context responses fail the entire window; revision mismatch has distinct recovery', async () => {
  const cases = ['complete', 'model', 'total', 'hits', 'eligibility', 'index', 'duplicate', 'misorder', 'range', 'ordinal', 'term', 'field', 'span', 'highlight', 'wide-mark', 'grapheme', 'text', 'omissions', 'window-flag', 'highlight-flag', 'getter'];
  for (const badReply of cases) {
    await open(); await page.evaluate(value => { window.sectionHarness.state.badReply = value; }, badReply); await search();
    assert.deepEqual(await ids(), [], badReply); assert.match(await part('status').textContent(), /INCOMPATIBLE_CAPABILITY/, badReply); assert.equal(await part('retry').isVisible(), true);
  }
  for (const badReply of ['null-window-flag', 'null-oversized-count']) {
    await open({}, { settings: { maxCodeUnits: 4 } }); await page.evaluate(value => { window.sectionHarness.state.badReply = value; }, badReply); await search();
    assert.deepEqual(await ids(), [], badReply); assert.match(await part('status').textContent(), /INCOMPATIBLE_CAPABILITY/, badReply);
  }
  await open(); await page.evaluate(() => { window.sectionHarness.state.badReply = 'revision'; }); await search();
  assert.deepEqual(await ids(), []); assert.match(await part('status').textContent(), /index changed/i);
  observe('strict response validation', { malformedCases: cases.length, revisionsSeparate: true });
});

test('native source/grapheme invalidity is unavailable context; changed owner becomes visibly stale without section I/O', async () => {
  const broken = structuredClone(projection.pages[0]); broken.sections[0].end = 7;
  await open({}, { mapOverride: broken }); await search(); assert.equal((await rows())[0].state, 'unavailable'); assert.deepEqual(await ids(), ['page:a', 'page:b']);
  await open(); await page.evaluate(() => { window.sectionHarness.state.mutateBeforeEvidence = true; }); await search();
  assert.deepEqual(await ids(), []); assert.match(await part('status').textContent(), /index changed/i);
  const before = await page.evaluate(() => window.sectionHarness.state.calls.filter(c => c.evidence).length); await click('retry');
  assert.deepEqual(await ids(), ['page:a', 'page:b']); assert.equal((await rows())[0].state, 'stale-map');
  assert.equal(await page.evaluate(() => window.sectionHarness.state.calls.filter(c => c.evidence).length), before);
  observe('provider invalidity / mutation / stale recovery', { invalidGrapheme: true, staleNoEvidenceCall: true });
});

test('new-batch projection is serial and atomic; replacement/clear/destroy suppress late work and preserve owner', async () => {
  await search(); const before = await page.evaluate(() => window.sectionHarness.state.calls.filter(c => c.evidence).length);
  await page.evaluate(() => { window.sectionHarness.state.holdEvidence = true; }); await part('load-more').click();
  await page.waitForFunction(() => window.sectionHarness.state.pending.length === 1);
  assert.deepEqual(await ids(), ['page:a', 'page:b']); assert.equal(await part('load-more').evaluate(n => document.activeElement === n), true);
  await page.evaluate(() => window.sectionHarness.release()); await settle(); assert.deepEqual(await ids(), corpus.expectedPages.ids);
  assert.equal(await page.evaluate(() => window.sectionHarness.state.calls.filter(c => c.evidence).length), before + 2);
  assert.equal(await page.evaluate(() => window.sectionHarness.state.maxRunning), 1);
  for (const action of ['replace', 'clear', 'destroy']) {
    await open(); await page.evaluate(() => { window.sectionHarness.state.holdEvidence = true; window.oldSectionSearch = window.sectionHarness.search(); });
    await page.waitForFunction(() => window.sectionHarness.state.pending.length === 1);
    const data = await page.evaluate(async action => {
      const h = window.sectionHarness, shell = h.root.firstChild;
      if (action === 'replace') { await h.search('unicode'); }
      if (action === 'clear') h.handle.clear();
      if (action === 'destroy') h.handle.destroy();
      h.release(); await window.oldSectionSearch;
      return { aborted: h.state.calls.some(c => c.evidence && c.aborted), resultCount: shell.querySelectorAll('.raveldex-inline__result').length,
        restored: h.root.firstChild === h.originalNodes[0], disposals: h.state.disposals, total: (await h.owner.search({ kind: 'all' })).total };
    }, action);
    assert.equal(data.aborted, true); assert.equal(data.disposals, 0); assert.equal(data.total, 4);
    if (action === 'replace') assert.deepEqual((await rows())[0].sections[0].marks, ['café']);
    else if (action === 'clear') { assert.deepEqual(await ids(), []); assert.equal(await part('status').textContent(), 'Enter a search term.'); }
    else { assert.equal(data.resultCount, 0); assert.equal(data.restored, true); }
  }
  observe('serialized projection / atomic append / cancellation / borrowed owner', { noReprojection: true, actions: ['replace', 'clear', 'destroy'] });
});

test('default 100-parent cap bounds 300 previews with lossless continuation and one context call in flight', async () => {
  await open({ pageSize: 10, maxRenderedResults: 100 }, { capacity: 105 }); await search();
  for (let index = 0; index < 9; index++) await click('load-more');
  assert.equal(await part('result').count(), 100); assert.equal(await part('section').count(), 300);
  assert.equal(await page.evaluate(() => window.sectionHarness.state.calls.filter(c => c.evidence).length), 100);
  assert.equal(await page.evaluate(() => window.sectionHarness.state.maxRunning), 1);
  assert.equal(await part('load-more').getAttribute('aria-disabled'), 'true');
  const first = await ids(); await click('next'); const last = await ids();
  assert.equal(await part('section').count(), 15); assert.equal(new Set([...first, ...last]).size, 105);
  assert.deepEqual([...first, ...last], Array.from({ length: 105 }, (_, i) => 'page:' + String(i).padStart(4, '0')));
  assert.match(await part('status').textContent(), /105/);
  observe('actual default DOM parent/preview bounds and continuation', { parentCap: 100, previewCount: 300, allPages: 105, simultaneousContextRequests: 1 });
});

for (const base of ['/', '/help/']) test(`${base}: encoded anchors navigate to real destination IDs`, async () => {
  await open({}, { base }); await search('prefix'); const href = (await rows())[0].sections.find(s => s.anchor === '%#café').href;
  await page.goto(href); assert.equal(await page.evaluate(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.id), '%#café');
  assert.equal(new URL(page.url()).pathname, base + 'guide/a/'); observe(`${base} real anchored destination`, { href, decodedAnchor: '%#café' });
});

test('semantic links, optional message overrides and narrow RTL/forced-colors layout remain usable', async () => {
  await open({ messages: { sectionCaption: 'Contributing text', sectionOmissions: 'More context exists.' } }); await search();
  assert.equal(await part('section-caption').textContent(), 'Contributing text'); assert.equal(await part('section-omissions').textContent(), 'More context exists.');
  assert.equal(await part('section-title').first().getAttribute('role'), null); assert.equal(await part('status').getAttribute('role'), 'status');
  assert.equal(await page.locator('#section-root [role=status]').count(), 1);
  await page.setViewportSize({ width: 320, height: 700 }); await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
  const sizes = await part('section-title').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().height)); assert.ok(sizes.every(h => h >= 44));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' }); await part('section-title').first().focus();
  assert.equal(await part('section-title').first().evaluate(n => n === document.activeElement), true);
  await page.addScriptTag({ url: origin + '/axe.js' }); const violations = await page.evaluate(async () => (await axe.run(document.querySelector('#section-root'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations);
  assert.deepEqual(violations.map(v => v.id), []);
  observe('semantic/RTL/forced-colors/axe', { viewport: 320, minimumLinkHeight: Math.min(...sizes), liveRegions: 1, axeViolations: [] });
});
