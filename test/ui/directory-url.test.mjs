import assert from 'node:assert/strict';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import { createServer } from 'node:http';
import { copyFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { build } from 'esbuild';
import { prepareConsumer, REPO_ROOT, digest } from '../../scripts/lib/packed-consumer.mjs';
import { schema, groups, records } from '../fixtures/directory.mjs';
import { directoryExpected } from '../oracle/directory.mjs';

let consumer, browser, server, origin, context, page, errors;
const engine = process.env.RAVELDEX_DIRECTORY_BROWSER ?? process.env.RAVELDEX_UI_BROWSER ?? 'chrome';
const report = { kind: 'raveldex-installed-directory-url-v1', observations: [], environment: {
  node: process.version, platform: process.platform, arch: process.arch, selectedEngine: engine },
  scope: 'Fresh installed public API, actual native same-document history and real core/filter/facet execution. Test-only buttons/output are not RX-7004 controls. No human AT, physical input, actual zoom or release qualification.' };
async function save() {
  if (!process.env.RAVELDEX_DIRECTORY_REPORT) return;
  const target = resolve(process.env.RAVELDEX_DIRECTORY_REPORT); await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(report, null, 2) + '\n');
}
const observe = (name, evidence) => report.observations.push({ name, status: 'Pass', evidence });
const current = () => page.evaluate(() => window.directoryFixture.directory.getSnapshot());
async function ready(text, selectedPage = 1) {
  await page.waitForFunction(({ text, selectedPage }) => {
    const value = window.directoryFixture.directory.getSnapshot();
    return value.status === 'ready' && value.state.text === text && value.state.page === selectedPage;
  }, { text, selectedPage });
}
before(async () => {
  assert.ok(['chrome', 'chromium', 'webkit'].includes(engine));
  consumer = await prepareConsumer([], []);
  await copyFile(join(REPO_ROOT, 'test/ui/directory-fixture.mjs'), join(consumer.directory, 'fixture-entry.mjs'));
  await copyFile(join(REPO_ROOT, 'test/fixtures/directory.mjs'), join(consumer.directory, 'directory-data.mjs'));
  const bundled = await build({ absWorkingDir: consumer.directory, entryPoints: ['fixture-entry.mjs'], outfile: 'fixture.mjs', bundle: true,
    platform: 'browser', format: 'esm', target: 'es2022', minify: true, metafile: true, logLevel: 'silent' });
  const inputs = Object.keys(bundled.metafile.inputs);
  assert.ok(inputs.every(path => ['fixture-entry.mjs', 'directory-data.mjs'].includes(path) || path.startsWith('node_modules/@vmitsaras/raveldex/dist/')));
  assert.ok(inputs.some(path => path.endsWith('/addons/ui/directory-url.js')));
  assert.ok(inputs.every(path => !/\/addons\/(?:phrases|positions|evidence|snippets|sections|inspector)\//.test(path) && !/\/adapters\//.test(path)));
  report.package = consumer.package; report.consumer = { directory: consumer.directory, installed: consumer.installed };
  report.graph = { inputs, bytes: (await readFile(join(consumer.directory, 'fixture.mjs'))).length };
  report.sourceSHA256 = Object.fromEntries(await Promise.all(['test/ui/directory-url.test.mjs', 'test/ui/directory-fixture.mjs', 'test/fixtures/directory.mjs',
    ...['directory.ts', 'directory-types.ts', 'directory-state.ts', 'directory-controller.ts', 'directory-url.ts'].map(name => 'src/addons/ui/' + name)]
    .map(async path => [path, digest(await readFile(join(REPO_ROOT, path)))])));
  server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/fixture.mjs') { response.setHeader('content-type', 'text/javascript'); response.end(await readFile(join(consumer.directory, 'fixture.mjs'))); return; }
    response.setHeader('content-type', 'text/html'); response.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Directory state fixture</title><main><h1>Directory state fixture</h1><button id="interact">Activate document</button><pre id="state"></pre></main><script type="module" src="/fixture.mjs"></script></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ ...(engine === 'chrome' ? { channel: 'chrome' } : {}), headless: true });
  report.environment.browser = browser.version();
}, { timeout: 120_000 });
beforeEach(async () => {
  context = await browser.newContext(); page = await context.newPage(); page.setDefaultTimeout(12_000); errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/resources/?tracked=a%20b&raw=%2f#anchor%20raw');
  await page.waitForFunction(() => !!window.directoryFixture); await page.getByRole('button', { name: 'Activate document' }).click();
});
afterEach(async () => {
  try { await page.evaluate(() => window.directoryFixture.cleanup()); assert.deepEqual(errors, []); }
  finally { await context.close(); await save(); }
});
after(async () => {
  await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await save();
});

test('installed in-memory directory works without any URL binding or history mutation', async () => {
  assert.equal((await current()).status, 'idle');
  await page.evaluate(() => window.directoryFixture.directory.refresh()); await ready('');
  assert.deepEqual((await current()).result.hits.map(hit => hit.id), ['a', 'b']);
  await page.evaluate(() => window.directoryFixture.directory.update({ text: 'shared', filters: { kind: ['guide', 'manual'], tags: ['red', 'blue'] } }));
  const expected = directoryExpected(records, schema, { kind: 'group', variants: [{ text: 'shared', match: 'prefix' }] }, { kind: ['guide', 'manual'], tags: ['red', 'blue'] }, groups, 2);
  const actual = await current(); assert.equal(actual.result.total, expected.total); assert.deepEqual(actual.result.hits.map(h => h.id), expected.allIDs);
  assert.deepEqual(actual.result.facets, expected.facets); assert.deepEqual(await page.evaluate(() => window.directoryFixture.writes), []);
  assert.equal(page.url(), origin + '/resources/?tracked=a%20b&raw=%2f#anchor%20raw');
  observe('explicitly disabled URL binding', { expectedIDs: expected.allIDs, exactConjunctiveCounts: actual.result.facets, historyWrites: 0 });
});

test('native Back/Forward restores complete page/query/filter state without history loops', async () => {
  await page.evaluate(() => window.directoryFixture.connect()); await ready('');
  const initialLength = await page.evaluate(() => history.length);
  await page.evaluate(() => window.directoryFixture.directory.setPage(2)); await ready('', 2);
  await page.evaluate(() => window.directoryFixture.directory.update({ text: 'shared', filters: { kind: ['guide'] } })); await ready('shared');
  assert.equal(await page.evaluate(() => history.length), initialLength + 2);
  assert.ok(page.url().includes('tracked=a%20b&raw=%2f&q=shared&k=guide#anchor%20raw'));
  await page.goBack(); await ready('', 2); assert.deepEqual((await current()).result.hits.map(h => h.id), ['c', 'd']);
  await page.goBack(); await ready(''); assert.deepEqual((await current()).result.hits.map(h => h.id), ['a', 'b']);
  await page.goForward(); await ready('', 2); await page.goForward(); await ready('shared');
  assert.equal(await page.evaluate(() => window.directoryBoots), 1);
  assert.equal(await page.evaluate(() => window.directoryFixture.writes.length), 2);
  assert.deepEqual(await page.evaluate(() => history.state), { application: { preserved: ['original', 7] } });
  observe('actual native traversal', { back: 2, forward: 2, historyWrites: 2, documentBoots: 1, otherHistoryStatePreserved: true });
});

test('navigation during a held real result suppresses stale publication and makes no new history entries', async () => {
  await page.evaluate(() => window.directoryFixture.connect()); await page.evaluate(() => window.directoryFixture.directory.update({ text: 'shared' }));
  await page.evaluate(() => { window.directoryFixture.holdNext(); window.heldWork = window.directoryFixture.directory.update({ text: 'quiet' }); });
  await page.waitForFunction(() => window.directoryHeld); assert.equal((await current()).status, 'loading');
  const writes = await page.evaluate(() => window.directoryFixture.writes.length);
  await page.goBack(); await ready('shared');
  await page.evaluate(async () => { window.directoryFixture.release(); await window.heldWork; });
  await ready('shared'); assert.equal(await page.evaluate(() => window.directoryFixture.writes.length), writes);
  await page.goForward(); await ready('quiet'); assert.equal((await current()).result.total, 2);
  observe('held actual result/native navigation', { staleSuppressed: true, replayPushes: 0, finalText: 'quiet' });
});

test('invalid URL data recovers by replace while exact Unicode values and unrelated bytes survive', async () => {
  await page.evaluate(() => window.directoryFixture.connect());
  const raw = '  shared   tra  ';
  await page.evaluate(async raw => {
    window.directoryFixture.nativeReplace('/resources/?untouched=a%20b&opaque=%2f&q=' + encodeURIComponent(raw) + '&k=guide#raw%20hash');
    await window.directoryFixture.binding().read();
  }, raw);
  await ready(raw); assert.equal((await current()).result.total, 3); assert.equal(new URL(page.url()).searchParams.get('q'), raw);
  await page.evaluate(async () => {
    window.directoryFixture.nativeReplace('/resources/?untouched=a%20b&opaque=%2f&q=%ED%A0%80&p=bad&k=unknown&tag=&tag=#raw%20hash');
    await window.directoryFixture.binding().read();
  });
  await ready(''); assert.deepEqual((await current()).state.filters.tags, ['']); assert.equal((await current()).result.total, 1);
  assert.ok(page.url().endsWith('?untouched=a%20b&opaque=%2f&tag=#raw%20hash'));
  const status = await page.evaluate(() => window.directoryFixture.binding().getSnapshot()); assert.equal(status.issues.length, 4);
  observe('URL correction and exact raw text', { raw, issues: status.issues, selectedEmptyString: true, unrelatedRawBytesPreserved: true });
});

test('revised collections invalidate mixed page state and replace a stale page before explicit refresh', async () => {
  await page.evaluate(() => window.directoryFixture.connect()); await page.evaluate(() => window.directoryFixture.directory.setPage(2));
  await page.evaluate(() => window.directoryFixture.mutate()); await page.evaluate(() => window.directoryFixture.directory.setPage(3));
  assert.equal((await current()).status, 'stale'); assert.equal((await current()).result, undefined); assert.equal((await current()).state.page, 1);
  assert.equal(new URL(page.url()).searchParams.has('p'), false);
  const writes = await page.evaluate(() => window.directoryFixture.writes); assert.equal(writes.at(-1).kind, 'replace');
  await page.evaluate(() => window.directoryFixture.directory.refresh()); await ready(''); assert.equal((await current()).result.total, 9);
  await page.goBack(); await ready('', 2); assert.equal((await current()).result.revision, 2);
  observe('revision/native URL replay', { staleHitsDiscarded: true, pageReset: 1, nativeRevisionAfterRefresh: 2, total: 9 });
});

test('disjoint browser instances preserve each other and conflicting ownership refuses before writes', async () => {
  await page.evaluate(() => window.directoryFixture.connect());
  const count = await page.evaluate(() => window.directoryFixture.writes.length);
  assert.equal(await page.evaluate(async () => { try { await window.directoryFixture.createSecond(true); return 'unexpected'; } catch (e) { return e.code; } }), 'INVALID_OPTIONS');
  assert.equal(await page.evaluate(() => window.directoryFixture.writes.length), count);
  await page.evaluate(() => window.directoryFixture.createSecond());
  await page.evaluate(() => window.directoryFixture.directory.update({ text: 'shared' }));
  await page.evaluate(() => window.directoryFixture.second().update({ text: 'quiet' }));
  assert.equal(new URL(page.url()).searchParams.get('q'), 'shared'); assert.equal(new URL(page.url()).searchParams.get('otherQ'), 'quiet');
  const queries = await page.evaluate(() => window.directoryFixture.calls.length);
  await page.evaluate(() => window.directoryFixture.binding().destroy()); await page.goBack();
  await page.waitForFunction(() => {
    const value = window.directoryFixture.second().getSnapshot();
    return value.status === 'ready' && value.state.text === '' && value.state.page === 1;
  });
  assert.equal((await current()).state.text, 'shared');
  assert.ok(await page.evaluate(count => window.directoryFixture.calls.length <= count + 1, queries));
  observe('disjoint instances and detach', { conflict: 'INVALID_OPTIONS', separateNamesPreserved: true, destroyedBindingDoesNotReplay: true });
});

test('native history refusal preserves current search and explicit write retries without another query', async () => {
  await page.evaluate(() => window.directoryFixture.connect('replace')); const before = page.url();
  await page.evaluate(() => { window.savedReplace = history.replaceState; history.replaceState = () => { throw new DOMException('blocked', 'SecurityError'); }; });
  await page.evaluate(() => window.directoryFixture.directory.update({ text: 'shared' })); await ready('shared');
  assert.equal(page.url(), before); assert.equal(await page.evaluate(() => window.directoryFixture.binding().getSnapshot().error), 'write-refused');
  const count = await page.evaluate(() => window.directoryFixture.calls.length);
  await page.evaluate(() => { history.replaceState = window.savedReplace; window.directoryFixture.binding().write(); });
  assert.equal(new URL(page.url()).searchParams.get('q'), 'shared'); assert.equal(await page.evaluate(() => window.directoryFixture.calls.length), count);
  assert.equal(await page.evaluate(() => window.directoryFixture.binding().getSnapshot().status), 'connected');
  observe('actual native method refusal/retry', { inMemoryResultsPreserved: true, extraSearchForURLRetry: 0 });
});
