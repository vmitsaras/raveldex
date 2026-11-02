import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { chromium } from 'playwright-core';
import { prepareUIPilot } from '../../scripts/lib/ui-consumer.mjs';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../oracle/phrases.mjs';

let pilot, browser, page, server, origin;
const observations = [];
before(async () => {
  pilot = await prepareUIPilot();
  const files = { '/': ['index.html', 'text/html'], '/main.mjs': ['main.mjs', 'text/javascript'],
    '/engine-worker.mjs': ['engine-worker.mjs', 'text/javascript'], '/ui.css': ['ui.css', 'text/css'], '/pilot.css': ['pilot.css', 'text/css'], '/corpus.json': ['corpus.json', 'application/json'] };
  server = createServer(async (request, response) => {
    const file = files[new URL(request.url, 'http://localhost').pathname];
    if (!file) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', file[1]); response.end(await readFile(join(pilot.directory, file[0])));
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(process.env.RAVELDEX_UI_BROWSER === 'chromium' ? {} : { channel: 'chrome' }), headless: true });
  page = await browser.newPage({ viewport: { width: 1080, height: 900 }, reducedMotion: 'reduce' });
}, { timeout: 120_000 });
after(async () => {
  await browser?.close();
  if (server) await new Promise(accept => server.close(accept));
  if (process.env.RAVELDEX_UI_PILOT_REPORT && pilot) {
    const target = resolve(process.env.RAVELDEX_UI_PILOT_REPORT); await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify({ ...pilot.report, browser: { version: browser.version(),
      channel: process.env.RAVELDEX_UI_BROWSER ?? 'chrome', headless: true }, observations,
      unrun: ['screen-reader observations', 'real OS IME', 'cross-browser qualification', 'physical latency/heap'] }, null, 2) + '\n');
  }
});
async function settled() {
  await page.waitForFunction(() => document.querySelector('[data-pilot-search]')?.dataset.pilotState === 'ready');
  await page.waitForFunction(() => document.querySelector('[data-raveldex-ui]')?.getAttribute('aria-busy') === 'false'
    && /results|failed/i.test(document.querySelector('[data-raveldex-status]')?.textContent ?? ''));
}
async function submit(text) {
  const input = page.locator('[data-raveldex-input]'); await input.fill(text); await input.press('Enter'); await settled();
}
async function observed() {
  return { status: await page.locator('[data-raveldex-status]').innerText(),
    hits: await page.locator('[data-raveldex-result]').evaluateAll(nodes => nodes.map(node => ({
      id: node.dataset.raveldexResult, score: Number(node.querySelector('[data-raveldex-score]').textContent.slice(6)),
      title: node.querySelector('a').textContent, url: node.querySelector('a').href,
    }))) };
}
function compare(actual, expected) {
  assert.equal(actual.status, expected.total === 0 ? 'No results.' : `${expected.total} results. Showing 1–${expected.hits.length}.`);
  assert.deepEqual(actual.hits.map(hit => hit.id), expected.hits.map(hit => hit.id));
  for (let i = 0; i < actual.hits.length; i++) {
    assert.ok(Math.abs(actual.hits[i].score - expected.hits[i].score) <= Math.max(1e-12, Math.abs(expected.hits[i].score) * 1e-12));
    const section = pilot.corpus.sections.find(item => item.id === actual.hits[i].id);
    assert.equal(actual.hits[i].title, section.title); assert.equal(actual.hits[i].url, section.sourceUrl);
  }
}

test('real packaged documentation UI preserves judged tasks, source links, Inspector, representations and cleanup', async () => {
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => { if (!request.url().startsWith(origin)) external.push(request.url()); });
  await page.goto(origin); await settled();
  await page.getByText('Advanced demo settings', { exact: true }).click();
  const scan = scanSourceCorpus(pilot.corpus.records, pilot.corpus.schema);
  for (const query of ['term contribution', 'original source', 'atomic batch', 'How do I stop an operation that is waiting in the queue?']) {
    await submit(query); const actual = await observed();
    compare(actual, sourceQueryResult(scan, { kind: 'text', text: query }, { limit: 5 }));
    observations.push({ query, representation: 'source', mode: 'text', ...actual, statusResult: 'Pass' });
  }
  await submit('term contribution');
  const textSource = await observed();
  await page.locator('[data-raveldex-inspect]').click();
  await page.waitForFunction(() => document.querySelector('[data-raveldex-inspector-data]')?.textContent.includes('raveldex-inspector-v1'));
  const facts = JSON.parse(await page.locator('[data-raveldex-inspector-data]').innerText());
  assert.equal(facts.revision, 1);
  assert.equal(facts.result.total, sourceQueryResult(scan, { kind: 'text', text: 'term contribution' }, { limit: 5 }).total);
  assert.ok(facts.trace.facts.some(fact => fact.kind === 'field'));
  observations.push({ name: 'actual real-document Inspector', revision: facts.revision, total: facts.result.total, facts: facts.trace.facts.length });
  await page.keyboard.press('Escape');
  await page.locator('[data-pilot-representation]').selectOption('offsets'); await settled();
  assert.equal(await page.locator('[data-raveldex-input]').inputValue(), 'term contribution');
  assert.deepEqual(await observed(), textSource);
  observations.push({ name: 'text source / stored offsets complete displayed page parity', ...textSource });
  await page.locator('[data-pilot-mode]').selectOption('phrase'); await settled(); await submit('commit point');
  const phrasePositions = await observed();
  const phraseScan = scanPhraseSourceCorpus(pilot.corpus.records, pilot.corpus.schema);
  compare(phrasePositions, sourcePhraseQueryResult(phraseScan, { kind: 'phrase', text: 'commit point' }, { limit: 5 }));
  await page.locator('[data-pilot-representation]').selectOption('source'); await settled();
  assert.deepEqual(await observed(), phrasePositions);
  observations.push({ query: 'commit point', mode: 'phrase', representation: 'source / positions', ...phrasePositions, statusResult: 'Pass' });
  const link = page.locator('[data-raveldex-result-title]').first();
  const href = await link.getAttribute('href');
  await page.route(href.split('#')[0], route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Intercepted source navigation</title><h1>Source navigation destination</h1>' }));
  await link.click(); await page.waitForURL(href);
  assert.equal(page.url(), href);
  observations.push({ name: 'native source-link navigation', href, remotePageFetched: false,
    boundary: 'Navigation observed; target response intercepted locally, GitHub source rendering unrun.' });
  await page.goto(origin); await settled();
  await page.getByText('Advanced demo settings', { exact: true }).click();
  await page.locator('[data-pilot-destroy]').click();
  await page.waitForFunction(() => document.querySelector('[data-pilot-search]')?.dataset.pilotState === 'stopped');
  assert.equal(await page.locator('[data-raveldex-ui]').count(), 0);
  await page.locator('[data-pilot-initialize]').click(); await settled();
  await page.evaluate(() => { const select = document.querySelector('[data-pilot-representation]');
    for (const value of ['offsets', 'source', 'offsets']) { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); } });
  await settled();
  assert.equal(await page.locator('[data-raveldex-ui]').count(), 1);
  assert.match(await page.locator('[data-pilot-status]').innerText(), /Stored positions/);
  await submit('term contribution'); compare(await observed(), sourceQueryResult(scan, { kind: 'text', text: 'term contribution' }, { limit: 5 }));
  observations.push({ name: 'destroy / reinitialize / rapid representation transitions', interfaces: 1, latestRepresentation: 'offsets' });
  const directPage = await observed();
  await page.locator('[data-pilot-execution]').selectOption('worker'); await settled();
  assert.match(await page.locator('[data-pilot-status]').innerText(), /One module worker/);
  assert.deepEqual(await observed(), directPage);
  await page.locator('[data-raveldex-inspect]').click();
  await page.waitForFunction(() => document.querySelector('[data-raveldex-inspector-data]')?.textContent.includes('raveldex-inspector-v1'));
  const workerFacts = JSON.parse(await page.locator('[data-raveldex-inspector-data]').innerText());
  assert.equal(workerFacts.revision, 1); assert.equal(workerFacts.result.total, sourceQueryResult(scan, { kind: 'text', text: 'term contribution' }, { limit: 5 }).total);
  await page.keyboard.press('Escape');
  await page.locator('[data-pilot-mode]').selectOption('phrase'); await settled(); await submit('commit point');
  compare(await observed(), sourcePhraseQueryResult(phraseScan, { kind: 'phrase', text: 'commit point' }, { limit: 5 }));
  observations.push({ name: 'real-document worker text/phrase/Inspector parity', facts: workerFacts.trace.facts.length, ...await observed() });
  await page.locator('[data-pilot-execution]').selectOption('direct'); await settled();
  assert.match(await page.locator('[data-pilot-status]').innerText(), /Direct execution/);
  assert.equal(await page.locator('[data-raveldex-ui]').count(), 1);

  assert.deepEqual(errors, []);
  // The only external request was the explicitly intercepted native navigation.
  assert.ok(external.every(url => url.split('#')[0] === href.split('#')[0]));
  observations.push({ name: 'network boundary', sourceNavigation: external, otherExternalRequests: 0 });
  if (process.env.RAVELDEX_UI_SCREENSHOTS) {
    await mkdir(resolve(process.env.RAVELDEX_UI_SCREENSHOTS), { recursive: true });
    await page.screenshot({ path: join(resolve(process.env.RAVELDEX_UI_SCREENSHOTS), 'rx-2006-docs-desktop.png'), fullPage: true });
  }
}, { timeout: 90_000 });
