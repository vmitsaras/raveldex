// RX-8010 Pagefind static-site track. Genuine generated WASM/browser search,
// deliberately distinct from installed Node lexical-engine measurements.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve, relative, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright-core';
import { digest } from './workloads.mjs';

export function pagefindQuery(definition) {
  const query = definition.query ?? definition;
  if (query.fields && (query.fields.length !== 1 || query.fields[0] !== 'body')) return { status: 'Not comparable', reason: 'Pagefind track indexes body content only; requested fields cannot be silently dropped.' };
  if (query.kind === 'text' && (!query.fields || query.fields.every(field => field === 'body'))) return { term: query.text };
  if (query.kind === 'group' && query.variants.length === 1 && query.variants[0].match === 'prefix' && (query.variants[0].weight ?? 1) === 1)
    return { term: query.variants[0].text };
  return { status: 'Not comparable', reason: 'Static Pagefind language/stemming/prefix model and generated index differ; native operators/phrases/transactions not emulated.' };
}
export async function runPagefindTrack({ consumer, output, workload, samples = 10, warmups = 2, channel = 'chrome' }) {
  assert.ok(Number.isSafeInteger(samples) && samples > 0 && Number.isSafeInteger(warmups) && warmups >= 0);
  const root = resolve(output); await mkdir(root, { recursive: true });
  const packageRoot = join(resolve(consumer), 'node_modules', 'pagefind');
  const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  const entry = resolve(packageRoot, packageJson.main);
  assert.ok(entry.startsWith(`${packageRoot}${sep}`), 'installed package entry escapes its root');
  const pagefind = await import(pathToFileURL(entry));
  const report = { version: 'rx8010-pagefind-static-v1', track: 'static-site', comparability: 'Not comparable', workload: workload.identity,
    method: { content: 'Each frozen body value concatenated with newline into one custom static page per source ID; no phrase-boundary equivalence.',
      fields: ['body'], language: 'en', matching: 'Unmodified Pagefind language analysis/stemming/prefix search; not native NFKC token/exact semantics.',
      output: 'Timed search returns generated result handles/count. Complete untimed data() hydration captures original source IDs/URLs; not native ranked ID+score output cost.',
      build: 'Node native Pagefind indexing plus writeFiles; excludes browser launch/HTTP host.', queries: 'Single text and one prefix raw string only; unsupported operators retained explicitly.',
      quantiles: 'Nearest rank; p95 only if at least100 samples. Same-context warm repetitions; no population or heap/CPU claim.', samples, warmups },
    package: { name: packageJson.name, version: packageJson.version, entry }, build: {}, queries: [], errors: [], requests: [] };
  let index, server, browser;
  const start = performance.now();
  try {
    const created = await pagefind.createIndex({ forceLanguage: 'en' });
    assert.deepEqual(created.errors ?? [], []); index = created.index; assert.ok(index);
    for (const record of workload.records) {
      const content = (Array.isArray(record.text.body) ? record.text.body : [record.text.body]).join('\n');
      const result = await index.addCustomRecord({ url: `/records/${encodeURIComponent(record.id)}/`, content, language: 'en', meta: { source_id: record.id } });
      assert.deepEqual(result.errors ?? [], []);
    }
    const generated = await index.writeFiles({ outputPath: join(root, 'pagefind') });
    assert.deepEqual(generated.errors ?? [], []);
    report.build = { status: 'Pass', wallMs: performance.now() - start, records: workload.records.length };
    await index.deleteIndex(); index = null;
    await pagefind.close();
    async function inventory(path) {
      const files = [];
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const next = join(path, entry.name);
        if (entry.isDirectory()) files.push(...await inventory(next));
        else { const bytes = await readFile(next); files.push({ path: relative(root, next).split(sep).join('/'), bytes: bytes.length, sha256: digest(bytes) }); }
      }
      return files.sort((a, b) => a.path.localeCompare(b.path));
    }
    report.files = await inventory(join(root, 'pagefind'));
    await writeFile(join(root, 'index.html'), '<!doctype html><html lang="en"><title>RX-8010 static search</title><body>Static benchmark host</body></html>');
    server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
        if (!file.startsWith(`${root}${sep}`)) { response.writeHead(403).end(); return; }
        const bytes = await readFile(file);
        const mime = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' }[extname(file)] ?? 'application/octet-stream';
        response.writeHead(200, { 'content-type': mime }); response.end(bytes);
      } catch { response.writeHead(404).end(); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ channel, headless: true });
    report.environment = { browser: browser.version(), channel, headless: true, node: process.version, platform: process.platform, arch: process.arch };
    const page = await browser.newPage();
    page.on('pageerror', error => report.errors.push(String(error)));
    page.on('request', request => report.requests.push(request.url()));
    await page.goto(origin);
    await page.evaluate(async () => { globalThis.pagefind = await import('/pagefind/pagefind.js'); await globalThis.pagefind.init(); });
    for (const definition of workload.queries) {
      const translated = pagefindQuery(definition);
      if (translated.status) { report.queries.push({ id: definition.id, ...translated }); continue; }
      const captured = await page.evaluate(async ({ term, samples, warmups }) => {
        const warmupWallMs = [], wallMs = [];
        for (let i = 0; i < warmups; i++) { const t = performance.now(); await globalThis.pagefind.search(term); warmupWallMs.push(performance.now() - t); }
        let result;
        for (let i = 0; i < samples; i++) { const t = performance.now(); result = await globalThis.pagefind.search(term); wallMs.push(performance.now() - t); }
        const hydrated = [];
        for (const hit of result.results) { const data = await hit.data(); hydrated.push({ pagefindId: hit.id, sourceId: data.meta.source_id, url: data.url }); }
        return { warmupWallMs, wallMs, total: result.results.length, hydrated };
      }, { term: translated.term, samples, warmups });
      assert.equal(captured.total, captured.hydrated.length);
      assert.equal(new Set(captured.hydrated.map(hit => hit.sourceId)).size, captured.total);
      assert.ok(captured.hydrated.every(hit => workload.records.some(record => record.id === hit.sourceId)), 'Pagefind returned unknown source');
      const sorted = [...captured.wallMs].sort((a,b) => a-b);
      report.queries.push({ id: definition.id, status: 'Collected', comparability: 'Not comparable', term: translated.term, ...captured,
        p50WallMs: sorted[Math.ceil(sorted.length * .5) - 1], p95WallMs: sorted.length >= 100 ? sorted[Math.ceil(sorted.length * .95) - 1] : null,
        nativeMembershipEqual: JSON.stringify(captured.hydrated.map(hit => hit.sourceId).sort()) === JSON.stringify([...definition.expectedIds].sort()) });
    }
    assert.deepEqual(report.errors, []);
    assert.ok(report.requests.every(url => url.startsWith(`${origin}/`)), 'unexpected external request');
    report.status = 'Collected';
  } catch (error) {
    report.status = 'Failed'; report.failure = { name: error.name, message: String(error.message ?? error), stack: error.stack };
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    if (index) await index.deleteIndex();
    await pagefind.close();
    await writeFile(join(root, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  await writeFile(join(root, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
