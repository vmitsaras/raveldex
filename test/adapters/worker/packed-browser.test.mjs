import assert from 'node:assert/strict';
import { test, before, after, beforeEach, afterEach } from 'node:test';
import { createServer } from 'node:http';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { resolve, join, extname, dirname } from 'node:path';
import { platform, release, arch } from 'node:os';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright-core';
import { build, version as esbuildVersion } from 'esbuild';
import { prepareConsumer, REPO_ROOT, digest, command, checkStartup } from '../../../scripts/lib/packed-consumer.mjs';

let consumer, browser, context, page, server, origin;
const reportPath = resolve(process.env.RAVELDEX_WORKER_REPORT ?? '/tmp/raveldex-rx3001-worker.json');
const report = { kind: 'raveldex-packed-module-worker-v1', startedAt: new Date().toISOString(),
  environment: { node: process.version, os: { platform: platform(), release: release(), arch: arch() }, esbuild: esbuildVersion },
  transportMethod: {
    measured: 'Actual Worker postMessage calls and real response-event counts plus client facade admission/delivery counts are recorded separately; UTF-8 JSON logical envelope bytes include metadata. Fault injections and duplicate physical posts remain visible rather than being mistaken for one adapter call.',
    knownImplementationCopies: 'Caller admission captures plain owned data, JSON measurement encodes a string, browser postMessage structured-clones, host capture validates owned data, and reply delivery crosses structured clone. Counts and encoded bytes do not determine concurrent retained buffers.',
    peakCopies: 'Not measured. Browser internal structured-clone buffers, lifetime overlap and allocation overhead are not observable through this facade.',
    workerHeap: 'Not measured. Encoded transport bytes and gzip/bundle bytes are not retained or peak heap.',
  }, records: [], stages: [] };
const save = async () => { await mkdir(dirname(reportPath), { recursive: true }); await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n'); };
const stage = async name => { report.stages.push({ name, time: new Date().toISOString(), activeResources: process.getActiveResourcesInfo().sort() }); await save(); };
async function bundle(entry, outfile) {
  const settings = { absWorkingDir: consumer.directory, entryPoints: [entry], bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
    minify: true, treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false, metafile: true, outfile: join(consumer.directory, outfile), logLevel: 'silent' };
  const result = await build(settings);
  for (const [path, input] of Object.entries(result.metafile.inputs)) {
    assert.ok(['fixture-entry.mjs', 'engine-worker.mjs', 'shared-fixture.mjs'].includes(path) || path.startsWith('node_modules/@vmitsaras/raveldex/dist/'), `unexpected runtime input: ${path}`);
    assert.ok(input.imports.every(item => !item.external), `external input in ${path}`);
    assert.doesNotMatch(path, /(?:test\/fixtures|oracle|invariants|node_modules\/(?:minisearch|fuse|flexsearch|orama|playwright))/);
  }
  assert.deepEqual(Object.values(result.metafile.outputs)[0].imports, []);
  const bytes = await readFile(join(consumer.directory, outfile));
  return { entry, outfile, sha256: digest(bytes), minifiedBytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9, mtime: 0 }).length,
    method: { esbuild: esbuildVersion, target: 'es2022', format: 'esm', platform: 'browser', minify: true, treeShaking: true, charset: 'ascii', legalComments: 'none', sourcemap: false,
      gzip: { level: 9, windowBits: 15, memLevel: 8, strategy: 0, mtime: 0 } }, inputs: result.metafile.inputs, bytesByModule: Object.values(result.metafile.outputs)[0].inputs };
}
before(async () => {
  await stage('before:start');
  if (platform() === 'darwin') report.environment.os.product = (await command('/usr/bin/sw_vers', [])).stdout.trim();
  consumer = await prepareConsumer([], []); report.package = consumer.package; report.installedDirectory = consumer.directory;
  await stage('before:packed-consumer');
  for (const file of ['fixture-entry.mjs', 'engine-worker.mjs', 'shared-fixture.mjs']) await copyFile(join(REPO_ROOT, 'test/adapters/worker', file), join(consumer.directory, file));
  report.bundles = { client: await bundle('fixture-entry.mjs', 'fixture.mjs'), worker: await bundle('engine-worker.mjs', 'worker-bundle.mjs') };
  assert.ok(Object.keys(report.bundles.client.inputs).some(path => path.includes('/adapters/worker/client')));
  assert.ok(Object.keys(report.bundles.worker.inputs).some(path => path.includes('/adapters/worker/host')));
  assert.ok(Object.keys(report.bundles.worker.inputs).some(path => path.includes('/core/execution/engine')));
  await copyFile(join(REPO_ROOT, 'test/consumer/worker-types.ts'), join(consumer.directory, 'worker-types.ts'));
  await writeFile(join(consumer.directory, 'worker-tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM'], types: [], strict: true,
    noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, verbatimModuleSyntax: true, skipLibCheck: false, noEmit: true,
  }, include: ['worker-types.ts'] }));
  await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', join(consumer.directory, 'worker-tsconfig.json')], consumer.directory);
  await copyFile(join(REPO_ROOT, 'test/consumer/worker-host-types.ts'), join(consumer.directory, 'worker-host-types.ts'));
  await writeFile(join(consumer.directory, 'worker-host-tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'WebWorker'], types: [], strict: true,
    noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, verbatimModuleSyntax: true, skipLibCheck: false, noEmit: true,
  }, include: ['worker-host-types.ts'] }));
  await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', join(consumer.directory, 'worker-host-tsconfig.json')], consumer.directory);
  report.hostPublicTypecheck = { status: 'Pass', libraries: ['ES2022', 'WebWorker'], browserDOMTypes: 'Excluded', documentedCall: 'serveRaveldexWorker(self, { addons: [...] })' };
  report.publicTypecheck = 'Pass'; report.coreStartup = await checkStartup(consumer.directory, '@vmitsaras/raveldex');
  const startup = await command(process.execPath, ['--input-type=module', '--eval', `
    const reads=[];
    for(const name of ['document','window','Worker','SharedWorker','fetch','indexedDB','localStorage','setTimeout','setInterval','performance','crypto'])
      Object.defineProperty(globalThis,name,{configurable:true,get(){reads.push(name);throw new Error('unexpected startup '+name);}});
    const client=await import('@vmitsaras/raveldex/adapters/worker');
    const host=await import('@vmitsaras/raveldex/adapters/worker/host');
    if(reads.length)throw new Error('worker import touched hosts');
    console.log(JSON.stringify({reads,clientExports:Object.keys(client).sort(),hostExports:Object.keys(host).sort()}));
  `], consumer.directory);
  report.workerStartup = JSON.parse(startup.stdout);
  await stage('before:bundles-types-startup');
  await writeFile(join(consumer.directory, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Installed module-worker verification</title></head><body><h1>Module-worker verification</h1><script type="module" src="/fixture.mjs"></script></body></html>');
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const file = { '/': 'index.html', '/fixture.mjs': 'fixture.mjs', '/engine-worker.mjs': 'worker-bundle.mjs' }[path];
    if (!file) { response.writeHead(404); response.end(); return; }
    try { response.setHeader('content-type', extname(file) === '.html' ? 'text/html' : 'text/javascript');
      response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'");
      response.end(await readFile(join(consumer.directory, file)));
    } catch { response.writeHead(500); response.end(); }
  });
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); }); origin = `http://127.0.0.1:${server.address().port}`;
  const channel = process.env.RAVELDEX_WORKER_BROWSER ?? process.env.RAVELDEX_UI_BROWSER ?? 'chrome'; assert.ok(['chrome', 'chromium'].includes(channel));
  browser = await chromium.launch({ ...(channel === 'chrome' ? { channel: 'chrome' } : {}), headless: true });
  report.environment.browser = { channel, version: browser.version(), headless: true };
  report.environment.playwright = JSON.parse(await readFile(join(REPO_ROOT, 'node_modules/playwright-core/package.json'))).version;
  await stage('before:done');
}, { timeout: 120_000 });
beforeEach(async () => {
  context = await browser.newContext(); page = await context.newPage(); await page.goto(origin); await page.waitForFunction(() => !!window.workerHarness);
});
afterEach(async t => {
  let cleanup;
  try { if (page) cleanup = await page.evaluate(() => window.workerHarness?.cleanup()); }
  finally { await context?.close(); page = undefined; context = undefined; }
  report.cleanup ??= []; report.cleanup.push({ name: t.name, outcomes: cleanup });
  assert.ok(!cleanup?.some(row => row.error), 'all retained test engines dispose successfully');
  const result = report.records.find(record => record.name === t.name); if (!result) report.records.push({ name: t.name, status: 'Fail', evidence: 'Scenario did not return successful observations; see terminal failure.' });
  await save();
});
after(async () => {
  await stage('after:browser-close:start'); await browser?.close(); await stage('after:browser-close:complete');
  await new Promise((yes, no) => server ? server.close(error => error ? no(error) : yes()) : yes());
  await stage('after:server-close:complete'); report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.records.filter(row => row.status === 'Pass').length, failed: report.records.filter(row => row.status === 'Fail').length,
    semanticCompleteComparisons: report.records.reduce((sum, row) => sum + (row.evidence?.fullComparisons ?? 0), 0) };
  await save();
});
const scenarios = [
  ['reentrant caller signal preserves direct FIFO admission and both mutation outcomes', 'reentrantSignalFIFO'],
  ['one scope and endpoint permit exactly one live or initializing worker owner', 'singleOwners'],
  ['real source worker has complete direct/core/add-on query and atomic mutation parity', 'parity', 'source'],
  ['real stored positions/offsets worker has complete semantic parity', 'parity', 'offsets'],
  ['real mixed phrase worker has complete semantic parity', 'parity', 'mixed'],
  ['direct and actual worker preserve exact caller admission-entry cliffs', 'admissionCliffs'],
  ['whole-worker BM25 agrees with independent hand-derived numerical fixture', 'numeric'],
  ['startup mismatch, module failure and unqualified pairing reject without leaks', 'startup'],
  ['real replies reordered and duplicated retain exact operation identity', 'reordered'],
  ['replayed live mutation ID cannot falsify a committed outcome or execute twice', 'replayLiveMutation'],
  ['actual postcommit host send failure preserves unknown outcome and committed receipt', 'hostPostCommitLoss'],
  ['actual postcommit cancellation reports known commit and conclusive receipt', 'knownCommit'],
  ['lost actual mutation reply gives unknown then reconciles committed state', 'lostMutation'],
  ['bounded 256 mutation receipt window expires old operation IDs', 'receiptExpiry'],
  ['real cooperative precommit cancellation and deadline publish no mutation', 'cancellation'],
  ['admission deadlines include delayed actual message delivery', 'delayedDeadline'],
  ['worker error event distinguishes termination and releases the owned worker', 'failureEvent'],
  ['lost read reply gives timeout and allows subsequent read recovery', 'lostSearch'],
  ['malformed response envelopes and result data cannot become successful facts', 'corruptResponses'],
  ['finite payload cap includes all request/response envelope metadata', 'boundedPayload'],
  ['malformed actual worker requests cannot commit unvalidated writes', 'malformedRequests'],
  ['actual worker death gives honest unknown and explicit new-worker recovery', 'deathAndRecovery'],
  ['bounded pending map rejects overflow and destroy clears timers/signals/listeners', 'boundedPending'],
  ['external worker disposal releases listeners and settles pending requests without termination', 'externalOwnership'],
];
for (const [name, method, argument] of scenarios) test(name, async () => {
  try {
    const evidence = await page.evaluate(async ({ method, argument }) => window.workerHarness[method](argument), { method, argument });
    report.records.push({ name, status: 'Pass', evidence }); await save();
  } catch (error) {
    report.records.push({ name, status: 'Fail', error: String(error).slice(0, 8192) }); await save(); throw error;
  }
}, { timeout: 90_000 });
