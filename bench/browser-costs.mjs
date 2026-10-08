// Real browser measurement against an existing installed package; no build/pack.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { cpus, platform, release, arch } from 'node:os';
import { resolve, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build, version as esbuildVersion } from 'esbuild';
import { chromium } from 'playwright-core';
import { METHOD, recordsFor, summarizeRows, features } from './cost-common.mjs';
import { digest, stage } from './costs.mjs';

const consumer = resolve(process.argv[2] ?? ''), output = resolve(process.argv[3] ?? '/tmp/raveldex-rx4001-browser-costs.json');
assert.ok(process.argv[2], 'Pass an isolated installed consumer directory');
await stage(consumer, ['cost-common.mjs', 'browser-cost-entry.mjs', 'worker-cost-entry.mjs']);
const compression = { level: 9, windowBits: 15, memLevel: 8, strategy: 0 }, graphs = {};
for (const [entry, outfile] of [['browser-cost-entry.mjs', 'cost-browser.mjs'], ['worker-cost-entry.mjs', 'cost-worker.mjs']]) {
  const result = await build({ entryPoints: [entry], outfile, absWorkingDir: consumer, bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
    minify: true, treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false, metafile: true, logLevel: 'silent' });
  const bytes = await readFile(join(consumer, outfile)), compressed = gzipSync(bytes, compression), inputs = [];
  for (const [path, input] of Object.entries(result.metafile.inputs)) {
    assert.ok(['browser-cost-entry.mjs', 'worker-cost-entry.mjs', 'cost-common.mjs'].includes(path) || path.startsWith('node_modules/@vmitsaras/raveldex/dist/'));
    assert.ok(input.imports.every(value => !value.external)); inputs.push({ path, ...input, sha256: digest(await readFile(join(consumer, path))) });
  }
  assert.ok(Object.values(result.metafile.outputs).every(value => value.imports.length === 0));
  graphs[outfile] = { entry, minifiedBytes: bytes.length, gzipBytes: compressed.length, sha256: digest(bytes), inputs, metafile: result.metafile,
    purpose: 'Actual measurement application graph including its harness; standalone library graph bytes are separately recorded in the Node cost report.' };
}
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  try {
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'");
    if (path === '/') { response.setHeader('content-type', 'text/html'); response.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Raveldex cost measurements</title><script type="module" src="/cost-browser.mjs"></script><body>Cost measurements</body></html>'); }
    else if (path === '/cost-browser.mjs' || path === '/cost-worker.mjs') { response.setHeader('content-type', 'text/javascript'); response.end(await readFile(join(consumer, path.slice(1)))); }
    else { response.writeHead(404); response.end(); }
  } catch { response.writeHead(500); response.end(); }
});
let browser;
const report = { kind: 'rx4001-chrome-worker-storage-cost-v1', generatedAt: new Date().toISOString(), installedDirectory: consumer,
  package: JSON.parse(await readFile(join(consumer, 'node_modules/@vmitsaras/raveldex/package.json'), 'utf8')),
  environment: { nodeHarness: process.version, os: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, logicalCPUs: cpus().length },
    playwright: JSON.parse(await readFile(new URL('../node_modules/playwright-core/package.json', import.meta.url), 'utf8')).version },
  method: { ...METHOD, timing: 'Page performance.now on complete public promise including same-host worker capture/transport/result and cooperative native work. Whole-ms ceil-rounded samples. Fresh worker/engine owner per repeat; browser process and page modules warm. First query before two discarded warmups/five measured calls. Save/load include snapshot serialization/restoration plus real strict-hint IndexedDB transaction. Those combined measures are not subtraction-derived isolated I/O cost.',
    work: 'Worker/storage execution counters are not exposed by the public browser facade. Actual native loop counts exist only in separate untimed Node observer diagnostics. No transport/storage work count is inferred from them.' },
  configuration: { id: 'chrome-worker-source-phrase-indexeddb', ...features, source: ['body'], positions: false, offsets: false, phrases: 'strict source verification',
    ui: false, worker: 'one same-host module worker complete native owner', storage: 'explicit source snapshot IndexedDB adapter, separate caller namespace per size/repeat', nativeSnapshots: 'Not Applicable: source-only worker bridge and unqualified browser profile' },
  graphs: { method: { esbuild: esbuildVersion, target: 'es2022', platform: 'browser', format: 'esm', minify: true, treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false,
    gzip: { ...compression, mtime: 0 } }, measurements: graphs }, observations: [],
  limitations: ['Node direct and Chrome worker timings have different runtime/realm/environment and cannot isolate worker overhead.', 'Three fresh owner samples per build/update/export/restore/save/load; fifteen warm query samples per size. Maximum is observed only, not population percentile.',
    'One synthetic ASCII fixture, one headless Chrome/macOS host. No cross-browser/native-portability or admitted-corpus universal capacity claim.', 'Observed IndexedDB completion/store rows are not power-loss durability, eviction retention, quota/device or memory qualification.', 'No UI rendering, physical paint, heap, assistive-technology or physical latency measurement.'] };
try {
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
  const channel = process.env.RAVELDEX_COST_BROWSER ?? 'chrome'; assert.ok(['chrome', 'chromium'].includes(channel));
  browser = await chromium.launch({ ...(channel === 'chrome' ? { channel: 'chrome' } : {}), headless: true });
  report.environment.browser = { channel, version: browser.version(), headless: true };
  const context = await browser.newContext(), page = await context.newPage();
  page.on('console', message => { if (message.text().startsWith('cost-stage ')) console.log(message.text()); });
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => !!window.costHarness);
    report.environment.userAgent = await page.evaluate(() => navigator.userAgent);
    report.environment.hardwareConcurrency = await page.evaluate(() => navigator.hardwareConcurrency);
    for (const size of METHOD.sizes) for (let repetition = 0; repetition < METHOD.owners; repetition++) {
      const corpusSha256 = digest(JSON.stringify(recordsFor(size)));
      const row = await page.evaluate(({ size, repetition, corpusSha256 }) => window.costHarness.run(size, repetition, corpusSha256), { size, repetition, corpusSha256 });
      report.observations.push(row); report.summaries = summarizeRows(report.observations);
      await writeFile(output, JSON.stringify(report, null, 2) + '\n');
      console.log(JSON.stringify({ configuration: row.configuration, size, repetition, rejected: row.samples.filter(sample => sample.outcome === 'Rejected').map(sample => ({ operation: sample.operation, error: sample.error })) }));
    }
  } finally { await context.close(); }
  report.finishedAt = new Date().toISOString(); await writeFile(output, JSON.stringify(report, null, 2) + '\n');
} finally { await browser?.close(); await new Promise((yes, no) => server.listening ? server.close(error => error ? no(error) : yes()) : yes()); }
console.log(JSON.stringify({ output, rows: report.observations.length }));
