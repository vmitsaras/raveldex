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
const report = { kind: 'raveldex-inline-foundation-browser-v1', startedAt: new Date().toISOString(),
  environment: { node: process.version, os: { platform: platform(), release: release(), arch: arch() }, esbuild: esbuildVersion },
  limits: { scope: 'Installed headless browser behavior and synthetic composition only.',
    assistiveTechnology: 'Not run; DOM roles/names and axe are automated supporting evidence.',
    physicalIME: 'Not run.', actualZoomOrTouch: 'Not run.', memory: 'Not measured; graph bytes are not retained/peak memory.' },
  observations: [] };
const root = () => page.locator('#inline-root');
const input = () => root().locator('.raveldex-inline__input');
const status = () => root().locator('.raveldex-inline__status');
const ids = () => root().locator('.raveldex-inline__result').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-raveldex-inline-result')));
const record = (name, evidence) => report.observations.push({ name, status: 'Pass', evidence });
async function findIds(expected) {
  await page.waitForFunction(wanted => {
    const actual = [...document.querySelectorAll('#inline-root .raveldex-inline__result')].map(node => node.getAttribute('data-raveldex-inline-result'));
    return JSON.stringify(actual) === JSON.stringify(wanted)
      && !document.querySelector('#inline-root [aria-busy="true"]');
  }, expected);
}
async function search(text) { await page.evaluate(value => window.inlineHarness.handle.search(value), text); }
async function saveReport() {
  if (!process.env.RAVELDEX_INLINE_REPORT) return;
  const path = resolve(process.env.RAVELDEX_INLINE_REPORT); await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2) + '\n');
}
async function screenshot(name) {
  if (!process.env.RAVELDEX_INLINE_REPORT) return;
  const path = resolve(process.env.RAVELDEX_INLINE_REPORT.replace(/\.json$/, '') + `-${name}.png`);
  await mkdir(dirname(path), { recursive: true }); await page.screenshot({ path, fullPage: true });
  (report.screenshots ??= []).push({ name, path, viewport: page.viewportSize() });
}

before(async () => {
  consumer = await prepareConsumer([], []);
  const common = { absWorkingDir: consumer.directory, bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
    minify: true, treeShaking: true, legalComments: 'none', metafile: true, logLevel: 'silent' };
  await copyFile(join(REPO_ROOT, 'test/ui/inline-fixture-entry.mjs'), join(consumer.directory, 'fixture-entry.mjs'));
  const fixture = await build({ ...common, entryPoints: ['fixture-entry.mjs'], outfile: join(consumer.directory, 'fixture.mjs') });
  for (const path of Object.keys(fixture.metafile.inputs)) assert.ok(path === 'fixture-entry.mjs'
    || path.startsWith('node_modules/@vmitsaras/raveldex/dist/'), `foreign source ${path}`);
  await writeFile(join(consumer.directory, 'inline-entry.mjs'), "export { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';\n");
  const inline = await build({ ...common, entryPoints: ['inline-entry.mjs'], outfile: join(consumer.directory, 'inline.mjs') });
  const graph = Object.keys(inline.metafile.inputs);
  assert.ok(graph.some(path => path.includes('/addons/ui/')));
  assert.ok(graph.every(path => path === 'inline-entry.mjs' || path.includes('/addons/ui/') || path.endsWith('/addons/sections/validation.js') || path.endsWith('/core/contracts/data.js') || path.endsWith('/core/errors/error.js')),
    'inline-only graph imports no core engine or optional search implementation');
  for (const entry of Object.values(inline.metafile.inputs)) assert.ok(entry.imports.every(item => !item.external));
  const bytes = await readFile(join(consumer.directory, 'inline.mjs'));
  const css = await readFile(join(consumer.installed, 'dist/addons/ui/inline.css'));
  await writeFile(join(consumer.directory, 'inline.css'), css);
  await copyFile(join(REPO_ROOT, 'test/consumer/inline-types.ts'), join(consumer.directory, 'inline-types.ts'));
  await writeFile(join(consumer.directory, 'inline-tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM'], types: [], strict: true,
    noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, verbatimModuleSyntax: true, skipLibCheck: false, noEmit: true,
  }, include: ['inline-types.ts'] }));
  await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', join(consumer.directory, 'inline-tsconfig.json')], consumer.directory);
  const startup = JSON.parse((await command(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    const reads = [];
    for (const name of ['window','document','navigator','fetch','XMLHttpRequest','WebSocket','Worker','SharedWorker','localStorage','sessionStorage','indexedDB','performance','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame'])
      Object.defineProperty(globalThis,name,{configurable:true,get(){reads.push(name);throw Error(name)}});
    const core = await import('@vmitsaras/raveldex');
    assert.equal('mountRaveldexInline' in core,false);
    for (const path of ['@vmitsaras/raveldex/addons/ui/inline','./inline.mjs'])
      assert.deepEqual(Object.keys(await import(path)),['mountRaveldexInline']);
    assert.deepEqual(Object.keys(await import('@vmitsaras/raveldex/addons/ui')),['mountRaveldexUI']);
    assert.deepEqual(reads,[]);console.log(JSON.stringify({reads}));
  `], consumer.directory)).stdout);
  report.package = consumer.package;
  report.graph = { inputs: graph, minifiedBytes: bytes.length, gzipBytes: gzipSync(bytes).length,
    sha256: digest(bytes), cssBytes: css.length, cssSha256: digest(css), startup, publicTypes: 'Pass' };
  await writeFile(join(consumer.directory, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inline foundation verification</title><link rel="stylesheet" href="/inline.css"></head><body><main><h1>Inline search fixture</h1><div id="inline-root"><p id="authored">Authored <a href="/guides/">browse guides</a></p></div></main><script type="module" src="/fixture.mjs"></script></body></html>');
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const file = { '/': 'index.html', '/fixture.mjs': 'fixture.mjs', '/inline.css': 'inline.css' }[path];
    if (!file) { response.writeHead(404); response.end(); return; }
    try {
      response.setHeader('content-type', file.endsWith('.css') ? 'text/css' : file.endsWith('.mjs') ? 'text/javascript' : 'text/html');
      response.setHeader('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'none'; connect-src 'self'");
      response.end(await readFile(join(consumer.directory, file)));
    } catch { response.writeHead(500); response.end(); }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  origin = `http://127.0.0.1:${server.address().port}`;
  const channel = process.env.RAVELDEX_UI_BROWSER ?? 'chrome';
  assert.ok(['chrome', 'chromium'].includes(channel));
  browser = await chromium.launch({ ...(channel === 'chrome' ? { channel: 'chrome' } : {}), headless: true });
  report.environment.browser = { channel, version: browser.version(), headless: true };
  console.log(JSON.stringify({ kind: report.kind, packageSha256: consumer.package.sha256, graph: report.graph, browser: report.environment.browser }));
}, { timeout: 120_000 });

beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 1100, height: 800 }, reducedMotion: 'reduce' });
  page = await context.newPage(); errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin); await page.waitForFunction(() => typeof window.createInlineFixture === 'function');
  assert.deepEqual(await page.evaluate(() => window.createInlineFixture()), { frozen: true });
});
afterEach(async () => {
  try { await page.evaluate(() => window.inlineHarness?.cleanup()); assert.deepEqual(errors, []); }
  finally { await context?.close(); await saveReport(); }
});
after(async () => {
  try { await browser?.close(); }
  finally {
    if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    report.finishedAt = new Date().toISOString(); await saveReport();
  }
});

test('installed core-only inline preset stays idle, labels native controls and submits deterministic prefix results', async () => {
  assert.equal(await page.getByRole('search', { name: 'Search this site', exact: true }).count(), 1);
  assert.equal(await page.getByRole('searchbox', { name: 'Search this site', exact: true }).count(), 1);
  assert.equal(await input().getAttribute('type'), 'search');
  assert.equal(await input().getAttribute('role'), null);
  assert.equal(await status().textContent(), 'Enter a search term.');
  assert.deepEqual(await page.evaluate(() => window.inlineHarness.calls()), []);
  assert.equal(await root().locator('dialog, .raveldex-ui__score, [data-raveldex-inspect]').count(), 0);
  await input().fill('source prov'); await input().press('Enter'); await findIds(['alpha', 'beta', 'gamma']);
  assert.equal(await input().evaluate(node => node === document.activeElement), true);
  assert.match(await status().textContent(), /3/);
  const calls = await page.evaluate(() => window.inlineHarness.calls());
  assert.equal(calls.at(-1).result.total, 3);
  assert.equal(calls.at(-1).options.limit, 5);
  assert.equal(calls.at(-1).options.extensions, undefined);
  await screenshot('desktop');
  record('core-only idle / explicit submit / deterministic equal-score IDs', { ids: await ids(), total: 3, idleCalls: 0 });
});

test('prefix default keeps earlier terms exact and short final terms exact; exact mode remains explicit', async () => {
  await search('source prov'); assert.deepEqual(await ids(), ['alpha', 'beta', 'gamma']);
  await search('sour prov'); assert.deepEqual(await ids(), []);
  await search('source p'); assert.deepEqual(await ids(), ['epsilon']);
  await search('source CAFE\u0301'); assert.deepEqual(await ids(), ['unicode']);
  await search('!!!'); assert.deepEqual(await ids(), []);
  await page.evaluate(() => { window.inlineHarness.handle.destroy(); window.inlineHarness.remount({ mode: 'text' }); });
  await search('source prov'); assert.deepEqual(await ids(), []);
  await search('source provider'); assert.deepEqual(await ids(), ['alpha']);
  record('hand-stated prefix/exact/Unicode membership', { prefix: ['alpha', 'beta', 'gamma'], earlierPrefix: [], shortFinal: ['epsilon'], exact: ['alpha'] });
});

test('finite first-page presentation reports exact total and clear returns to idle without moving focus', async () => {
  await page.evaluate(() => { window.inlineHarness.handle.destroy(); window.inlineHarness.remount({ pageSize: 2,
    messages: { resultsMany: '{total} matching guides; {count} displayed.' } }); });
  await search('source prov'); assert.deepEqual(await ids(), ['alpha', 'beta']);
  assert.equal(await status().textContent(), '3 matching guides; 2 displayed.');
  const clear = root().getByRole('button', { name: 'Clear search', exact: true });
  await clear.click(); assert.equal(await clear.evaluate(node => node === document.activeElement), true);
  assert.equal(await input().inputValue(), ''); assert.deepEqual(await ids(), []);
  assert.equal(await status().textContent(), 'Enter a search term.');
  const before = await page.evaluate(() => window.inlineHarness.calls().length);
  await page.waitForTimeout(80); assert.equal(await page.evaluate(() => window.inlineHarness.calls().length), before);
  await input().focus(); await page.evaluate(() => window.inlineHarness.handle.clear());
  assert.equal(await input().evaluate(node => node === document.activeElement), true);
  record('finite first-page exact total / idle clear / stable focus', { total: 3, displayed: ['alpha', 'beta'] });
});

test('real held replies that ignore abort never overwrite newer results or clear', async () => {
  await page.evaluate(() => { window.inlineHarness.state.holdNext = true; void window.inlineHarness.handle.search('source prov'); });
  await page.waitForFunction(() => window.inlineHarness.state.pending.length === 1);
  await search('plain yellow'); assert.deepEqual(await ids(), ['plain']);
  await page.evaluate(() => window.inlineHarness.release()); await page.waitForTimeout(60);
  assert.deepEqual(await ids(), ['plain']);
  assert.equal(await page.evaluate(() => window.inlineHarness.calls()[0].aborted), true);
  await page.evaluate(() => { window.inlineHarness.state.holdNext = true; void window.inlineHarness.handle.search('source prov'); });
  await page.waitForFunction(() => window.inlineHarness.state.pending.length === 1);
  await page.evaluate(() => { window.inlineHarness.handle.clear(); window.inlineHarness.release(); });
  await page.waitForTimeout(60); assert.deepEqual(await ids(), []);
  assert.equal(await status().textContent(), 'Enter a search term.');
  record('obsolete real native replies', { latestIDs: ['plain'], clearRemainsIdle: true });
});

test('composition never submits intermediate input and settled search retains editing focus', async () => {
  await input().focus();
  await page.evaluate(() => {
    const node = document.querySelector('#inline-root input');
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); node.value = 'source caf';
    node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText' }));
    node.form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(80); assert.equal(await page.evaluate(() => window.inlineHarness.calls().length), 0);
  await page.evaluate(() => {
    const node = document.querySelector('#inline-root input'); node.value = 'source café';
    node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
  await findIds(['unicode']);
  assert.equal(await input().evaluate(node => node === document.activeElement), true);
  assert.equal(await page.evaluate(() => window.inlineHarness.calls().length), 1);
  record('synthetic composition protocol', { precommitSearches: 0, committedIDs: ['unicode'], physicalIME: 'Not run' });
});

test('errors and native expansion refusals remain explicit and retry uses the actual query', async () => {
  await page.evaluate(() => { window.inlineHarness.state.failNext = true; });
  await search('source prov');
  assert.equal(await input().inputValue(), 'source prov');
  assert.equal(await status().isVisible(), true);
  assert.match(await status().textContent(), /WORK_LIMIT_EXCEEDED/);
  await root().getByRole('button', { name: 'Retry search', exact: true }).click(); await findIds(['alpha', 'beta', 'gamma']);
  await page.evaluate(async () => { await window.inlineHarness.cleanup(); await window.createInlineFixture({}, { limits: { maxExpansionsPerGroup: 1 } }); });
  await search('source prov'); assert.deepEqual(await ids(), []);
  assert.match(await status().textContent(), /LIMIT_EXCEEDED/);
  assert.equal(await input().inputValue(), 'source prov');
  record('error / retry / actual native prefix refusal', { retriedIDs: ['alpha', 'beta', 'gamma'], refusal: 'LIMIT_EXCEEDED' });
});

test('display records and message overrides are captured and hostile text is never parsed', async () => {
  await page.evaluate(() => {
    window.inlineHarness.handle.destroy();
    const messages = { label: 'Find a guide', noResults: 'Nothing matched.', resultsOne: '{total} guide; {count} shown.',
      clear: 'Suche leeren', idle: 'Suchbegriff eingeben.' };
    window.inlineHarness.remount({ messages }); messages.noResults = 'Changed outside'; messages.clear = 'Changed outside'; messages.idle = 'Changed outside';
    window.inlineHarness.documents[0].title = 'Changed title'; window.inlineHarness.documents[0].url = '/changed/';
  });
  assert.equal(await page.getByRole('searchbox', { name: 'Find a guide', exact: true }).count(), 1);
  assert.equal(await root().getByRole('button', { name: 'Suche leeren', exact: true }).textContent(), 'Suche leeren');
  assert.equal(await status().textContent(), 'Suchbegriff eingeben.');
  await search('unmatchable'); assert.equal(await status().textContent(), 'Nothing matched.');
  await search('source provider');
  const link = root().locator('.raveldex-inline__result-title').filter({ hasText: 'Provider guide' }).first();
  assert.equal(await link.textContent(), 'Provider guide'); assert.equal(await link.getAttribute('href'), origin + '/guides/provider/#usage');
  await search('safe text'); assert.equal(await status().textContent(), '1 guide; 1 shown.');
  assert.equal(await root().locator('img, script, b').count(), 0);
  assert.equal(await page.evaluate(() => window.inlineInjection), 0);
  assert.match(await root().locator('.raveldex-inline__result-title').textContent(), /^<img src=x/);
  record('owned display/messages / safe title text', { capturedTitle: 'Provider guide', unsafeTitleIsText: true });
});

test('invalid options, message accessors and unsafe display URLs fail before DOM mutation or searching', async () => {
  const outcomes = await page.evaluate(() => window.inlineHarness.invalidCases());
  assert.equal(outcomes.getters, 0); assert.equal(outcomes.searches, 0);
  for (const outcome of outcomes.results) { assert.equal(outcome.code, 'INVALID_OPTIONS', outcome.name); assert.equal(outcome.preserved, true, outcome.name); }
  assert.equal(await page.evaluate(() => {
    try { window.inlineHarness.handle.search(123); return 'no failure'; } catch (error) { return error.code; }
  }), 'INVALID_OPTIONS');
  record('strict admission without getter execution', outcomes);
});

test('duplicate roots and cross-preset collisions preserve ownership; independent roots have unique controls', async () => {
  assert.equal(await page.evaluate(() => window.inlineHarness.duplicate()), true);
  const collisions = await page.evaluate(() => window.inlineHarness.collisions());
  assert.deepEqual(collisions, { legacyOnInline: 'INVALID_OPTIONS', inlineOnLegacy: 'INVALID_OPTIONS', inlineUnchanged: true, legacyUnchanged: true });
  await page.evaluate(() => window.inlineHarness.second());
  assert.equal(await page.getByRole('search', { name: 'Search this site', exact: true }).count(), 1);
  assert.equal(await page.getByRole('search', { name: 'Second search', exact: true }).count(), 1);
  assert.equal(await page.getByRole('searchbox', { name: 'Second search', exact: true }).count(), 1);
  const inputIDs = await page.locator('.raveldex-inline__input').evaluateAll(nodes => nodes.map(node => node.id));
  assert.equal(new Set(inputIDs).size, 2);
  await search('source p'); assert.deepEqual(await ids(), ['epsilon']);
  assert.equal(await page.locator('#second-inline .raveldex-inline__input').inputValue(), '');
  assert.equal(await page.locator('#second-inline .raveldex-inline__status').textContent(), 'Enter a search term.');
  record('mount ownership / independent instances', { collisions, inputIDs });
});

test('destroy aborts pending work, restores original Node identities and leaves the borrowed engine usable', async () => {
  await page.evaluate(() => { window.inlineHarness.state.holdNext = true; void window.inlineHarness.handle.search('source prov'); });
  await page.waitForFunction(() => window.inlineHarness.state.pending.length === 1);
  const destroyed = await page.evaluate(async () => {
    const h = window.inlineHarness; h.handle.destroy(); h.handle.destroy();
    const restored = h.root.childNodes.length === h.originalNodes.length && h.originalNodes.every((node, i) => h.root.childNodes[i] === node);
    h.release(); const result = await h.engine.search({ kind: 'text', text: 'plain yellow' });
    return { restored, disposals: h.state.disposals, ids: result.hits.map(hit => hit.id), aborted: h.calls()[0].aborted };
  });
  assert.deepEqual(destroyed, { restored: true, disposals: 0, ids: ['plain'], aborted: true });
  await page.waitForTimeout(50); assert.equal(await root().locator('.raveldex-inline').count(), 0);
  assert.equal(await page.evaluate(() => window.inlineHarness.remount()), true);
  assert.equal(await status().textContent(), 'Enter a search term.');
  await search('source p'); assert.deepEqual(await ids(), ['epsilon']);
  record('pending teardown / same-node restore / borrowed owner', destroyed);
});

test('authored custom-element disconnection reuses the registered mount instead of admitting a detached second UI', async () => {
  const outcome = await page.evaluate(() => window.inlineHarness.reentrantMount());
  assert.deepEqual(outcome, { sameHandle: true, liveIDs: ['epsilon'], restored: true, reactions: 1, disposals: 0, engineIDs: ['plain'] });
  record('reentrant custom-element mount ownership', outcome);
});

test('focus recovery that synchronously searches again preserves the newer busy state and results', async () => {
  await search('source prov');
  await root().locator('.raveldex-inline__result-title').first().focus();
  await page.evaluate(() => {
    const h = window.inlineHarness;
    h.state.holdNext = true;
    h.root.querySelector('input').addEventListener('focus', () => {
      window.inlineFocusReentrant = h.handle.search('plain yellow');
    }, { once: true });
    window.inlineFocusOuter = h.handle.search('source p');
  });
  await page.waitForFunction(() => window.inlineHarness.state.pending.length === 1);
  assert.equal(await root().locator('.raveldex-inline').getAttribute('aria-busy'), 'true');
  assert.equal(await status().textContent(), 'Searching…');
  assert.equal(await input().inputValue(), 'plain yellow');
  const calls = await page.evaluate(() => window.inlineHarness.calls());
  assert.equal(calls.length, 2, 'the superseded outer search never reaches the engine');
  assert.equal(calls[1].query.children[0].text.trim(), 'plain');
  await page.evaluate(async () => {
    window.inlineHarness.release();
    await Promise.all([window.inlineFocusOuter, window.inlineFocusReentrant]);
  });
  assert.deepEqual(await ids(), ['plain']);
  assert.equal(await root().locator('.raveldex-inline').getAttribute('aria-busy'), 'false');
  assert.equal(await input().evaluate(node => node === document.activeElement), true);
  record('synchronous focus reentry supersedes outer invalidation', { calls: 2, finalIDs: ['plain'], retainedBusyWhilePending: true });
});

test('native controls and CSS stay usable in narrow, forced-color and reduced-motion automated checks', async () => {
  await search('source prov');
  await page.setViewportSize({ width: 320, height: 700 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await screenshot('mobile');
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await input().focus();
  const focus = await input().evaluate(node => ({ outline: getComputedStyle(node).outlineStyle, width: getComputedStyle(node).outlineWidth }));
  assert.notEqual(focus.outline, 'none'); assert.notEqual(focus.width, '0px');
  await page.addScriptTag({ path: join(REPO_ROOT, 'node_modules/axe-core/axe.min.js') });
  const axe = await page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    return { violations: result.violations.map(issue => ({ id: issue.id, impact: issue.impact, targets: issue.nodes.map(node => node.target) })), tool: result.testEngine };
  });
  assert.deepEqual(axe.violations, []);
  record('automated narrow/forced-colors/reduced-motion/axe support', { focus, axe, actualZoomOrAT: 'Not run' });
});
