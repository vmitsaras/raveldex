// Serial browser observations in an existing installed consumer. No build/pack,
// remote access, production patch, full heap dump or owner-browser interaction.
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, open, readFile, readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { platform, release, arch } from 'node:os';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright-core';
import { build, version as esbuildVersion } from 'esbuild';
import { digest, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';
import { BROWSER_MEMORY_METHOD as METHOD, nestedSession, heapReading, maximaByRealm, samplingTotals } from './browser-cdp.mjs';
import { recordsFor } from '../cost-common.mjs';

assert.ok(process.argv[2] && process.argv[3], 'Supply isolated installed consumer and NEW output JSON path');
const consumer = await realpath(process.argv[2]), output = resolve(process.argv[3]), smoke = process.argv.includes('--smoke');
// Exclusive creation rejects existing reports, symlinks and hardlink aliases.
const file = await open(output, 'wx');
const report = { kind: METHOD.version, startedAt: new Date().toISOString(), invocation: { consumer, output, argv: process.argv.slice(2) },
  environment: { nodeHarness: process.version, os: { platform: platform(), release: release(), arch: arch() }, esbuild: esbuildVersion,
    playwright: JSON.parse(await readFile(join(REPO_ROOT, 'node_modules/playwright-core/package.json'))).version },
  method: { ...METHOD, sizes: smoke ? [1000] : METHOD.sizes, repetitions: smoke ? 1 : METHOD.repetitions, smoke,
    scope: 'Fresh headless Chrome process, page and dedicated module worker per repetition; one source-phrase owner, unchanged limits. External ownership permits post-disposal worker-isolate readings before explicit termination.',
    readings: 'Runtime.getHeapUsage in two verified distinct isolates. Raw byte fields overlap and are never added. Sequential request/response timestamps; paired readings are not simultaneous. Ten-ms delay after each completed serial pair prevents a poll backlog. Observed field maxima are lower bounds, not physical peaks or process RSS.',
    allocation: 'Raw HeapProfiler statistical profiles, collected-object flags requested explicitly. Profiling starts before public operations and stops before independent semantic checks or forced GC. Bundle frames include production and observer code; no exclusive component attribution.',
    settling: 'Three collectGarbage/25ms settling cycles per isolate at each labelled steady stage; intrusive and not normal GC. Modules, harness, transport-shape records, bounded host receipts and inspector overhead remain in readings.',
    transport: 'Actual caller postMessage argument counts and receiving message shapes/lengths. No payload retained by observation records. Source bridge carries strings; no transport buffer count, copy count or internal clone-memory measurement follows from lengths.',
    release: 'Caller input/encoding bindings and public handles are explicitly released. No claim that strings, every descendant, renderer allocations or all native buffers are collected.' },
  sourceBindings: [], productionFiles: [], bundles: {}, preservedEvidence: [], observations: [], outcome: 'Running' };
let server;
async function save() { const bytes = JSON.stringify(report, null, 2) + '\n'; await file.write(bytes, 0, 'utf8'); await file.truncate(Buffer.byteLength(bytes)); }
async function walkProduction(directory, relative = 'dist') {
  for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
    const path = join(relative, entry.name);
    if (entry.isDirectory()) await walkProduction(directory, path);
    else {
      assert.ok(entry.isFile(), 'No linked installed production input');
      const sha256 = digest(await readFile(join(directory, path)));
      assert.equal(sha256, digest(await readFile(join(REPO_ROOT, path))), `Installed production mismatch ${path}`);
      report.productionFiles.push({ path, sha256 });
    }
  }
}
async function bounded(promise, name, timeoutMs = 180000) {
  let timeout;
  try { return await Promise.race([promise, new Promise((_, no) => { timeout = setTimeout(() => no(Error(`Owned browser operation timeout: ${name}`)), timeoutMs); })]); }
  finally { clearTimeout(timeout); }
}
async function observe(origin, size, repetition) {
  const row = { size, repetition, corpusSha256: digest(JSON.stringify(recordsFor(size))), stages: [], operations: [], outcome: 'Running' };
  report.observations.push(row);
  let browser, context, page, main, worker;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    row.browser = await (await browser.newBrowserCDPSession()).send('Browser.getVersion');
    context = await browser.newContext(); page = await context.newPage(); main = await context.newCDPSession(page);
    await page.goto(origin); await page.waitForFunction(() => !!window.memoryHarness);
    const workerAttached = new Promise((yes, no) => {
      main.once('Target.attachedToTarget', event => {
        (async () => {
          assert.equal(event.targetInfo.type, 'worker'); assert.equal(event.targetInfo.url, `${origin}/memory-worker.mjs`);
          assert.equal(event.waitingForDebugger, true);
          worker = nestedSession(main, event.sessionId);
          row.workerTarget = event;
          await worker.send('Runtime.enable'); await worker.send('HeapProfiler.enable');
          await worker.send('Runtime.runIfWaitingForDebugger'); yes();
        })().catch(no);
      });
    });
    await main.send('Runtime.enable'); await main.send('HeapProfiler.enable');
    await main.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: false, filter: [{ type: 'worker' }, { exclude: true }] });
    await bounded(Promise.all([page.evaluate(() => window.memoryHarness.start()), workerAttached]), 'worker setup');
    row.mainTarget = await main.send('Target.getTargetInfo');
    row.isolates = { main: await main.send('Runtime.getIsolateId'), worker: await worker.send('Runtime.getIsolateId') };
    assert.notEqual(row.isolates.main.id, row.isolates.worker.id, 'Separate isolate scope required');
    row.userAgent = await page.evaluate(() => navigator.userAgent);
    const sessions = { main, worker };
    async function pair(stage, readings) {
      for (const [realm, session] of Object.entries(sessions)) readings.push(await heapReading(session, realm, stage));
    }
    async function settle(stage) {
      const readings = [];
      for (let cycle = 0; cycle < METHOD.gcCycles; cycle++) {
        for (const session of Object.values(sessions)) await session.send('HeapProfiler.collectGarbage');
        await delay(METHOD.settleMs); await pair(`${stage}:${cycle}`, readings);
      }
      row.stages.push({ stage, readings }); await save();
    }
    async function operation(name, action) {
      const observation = { name, outcome: 'Running', requestedSampling: METHOD.sampling, readings: [], profiles: {} }; row.operations.push(observation);
      for (const [realm, session] of Object.entries(sessions)) {
        observation.profiles[realm] = { startedAtMs: performance.now() };
        await session.send('HeapProfiler.startSampling', METHOD.sampling);
        observation.profiles[realm].startAcknowledgedAtMs = performance.now();
      }
      await pair('before-call', observation.readings);
      let finished = false;
      // Attach a rejection handler now, while the public operation may still be
      // pending. A lost target must not become an unhandled rejection.
      const poll = (async () => { while (!finished) { await delay(METHOD.pollDelayMs); if (!finished) await pair('in-operation-poll', observation.readings); } })().then(() => null, error => error);
      try { observation.callStartedMs = performance.now(); observation.result = await bounded(action(), name); observation.callSettledMs = performance.now(); observation.outcome = observation.result?.outcome ?? 'Pass'; }
      catch (error) { observation.outcome = 'Fail'; observation.failure = { name: error.name, message: error.message }; throw error; }
      finally {
        finished = true; const pollingError = await poll; await pair('after-call', observation.readings);
        for (const [realm, session] of Object.entries(sessions)) {
          const target = observation.profiles[realm]; target.stopRequestedAtMs = performance.now();
          target.raw = (await session.send('HeapProfiler.stopSampling')).profile; target.stoppedAtMs = performance.now();
          target.summary = samplingTotals(target.raw);
        }
        observation.observedMaxima = maximaByRealm(observation.readings); await save();
        if (pollingError) { observation.outcome = 'Fail'; observation.pollingFailure = { message: pollingError.message }; throw pollingError; }
      }
      return observation.result;
    }
    const call = (method, argument) => page.evaluate(({ method, argument }) => window.memoryHarness[method](argument), { method, argument });
    await settle('empty-owner');
    await call('makeInput', size); await settle('caller-input-held');
    const builtRevision = Math.ceil(size / 256), exportedRevision = builtRevision + 1, priorRevision = exportedRevision + 2;
    const revisions = (rows, expected) => { assert.ok(rows.every(item => item.revision === expected), `Expected revision ${expected}`); };
    await operation('build', () => call('build')); row.builtVerification = await call('verify'); revisions(row.builtVerification, builtRevision); await settle('built-caller-input-released');
    await operation('replace', () => call('replace')); row.replacedVerification = await call('verify'); revisions(row.replacedVerification, exportedRevision); await settle('replaced');
    await operation('exportSource', () => call('exportSource')); await settle('caller-encoding-held');
    await call('priorReceiver'); row.priorVerification = await call('verify', true); revisions(row.priorVerification, priorRevision); await settle('encoding-and-prior-receiver-held');
    const restore = await operation('restoreSource', () => call('restoreSource'));
    row.receivingVerification = await call('verify', restore.outcome !== 'Pass');
    if (restore.outcome !== 'Pass') {
      assert.deepEqual(row.receivingVerification, row.priorVerification, 'Rejected restore preserves exact prior page/revision');
      assert.ok(['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(restore.error.code), 'Unexpected restore error');
    } else {
      assert.equal(restore.result.format, 'raveldex-source'); assert.equal(restore.result.reindexed, true);
      assert.equal(restore.result.originRevision, exportedRevision); assert.equal(restore.result.revision, priorRevision + 1);
      revisions(row.receivingVerification, priorRevision + 1);
    }
    await settle('after-restore-encoding-held'); await call('releaseEncoding'); await settle('caller-encoding-released');
    await call('dispose'); await settle('disposed-owner-handles-released-worker-alive'); row.transport = await call('transport');
    row.outcome = restore.outcome === 'Pass' ? 'Pass' : 'ObservedWithRejectedRestore';
  } catch (error) { row.outcome = 'Fail'; row.failure = { name: error.name, message: error.message, stack: error.stack }; }
  finally {
    worker?.close(); row.cleanupFailures = [];
    try { await context?.close(); } catch (error) { row.cleanupFailures.push({ scope: 'context', message: error.message }); }
    try { await browser?.close(); row.ownedBrowserClosed = !!browser; }
    catch (error) { row.cleanupFailures.push({ scope: 'browser', message: error.message }); row.ownedBrowserClosed = false; }
    if (row.cleanupFailures.length) row.outcome = 'Fail';
    // Preserve full returned profiles losslessly, separately from the readable
    // report. Exclusive creation protects every earlier profile artifact.
    const profiles = row.operations.map(operation => ({ name: operation.name, profiles: Object.fromEntries(Object.entries(operation.profiles).map(([realm, profile]) => [realm, profile.raw ?? null])) }));
    const raw = Buffer.from(JSON.stringify(profiles)), compressed = gzipSync(raw, { level: 9 });
    const path = output.replace(/\.json$/, '') + `-profiles-${size}-${repetition}.json.gz`;
    const profileFile = await open(path, 'wx'); try { await profileFile.writeFile(compressed); } finally { await profileFile.close(); }
    row.rawProfiles = { path, encoding: 'gzip of UTF-8 JSON', bytes: compressed.length, sha256: digest(compressed), decompressedBytes: raw.length, decompressedSha256: digest(raw) };
    for (const operation of row.operations) for (const profile of Object.values(operation.profiles)) delete profile.raw;
    await save();
  }
  console.log(JSON.stringify({ size, repetition, outcome: row.outcome, operations: row.operations.map(item => ({ name: item.name, outcome: item.outcome })) }));
}
try {
  const installed = await realpath(join(consumer, 'node_modules/@vmitsaras/raveldex'));
  assert.equal(installed, join(consumer, 'node_modules/@vmitsaras/raveldex'), 'Real installed consumer required');
  report.package = JSON.parse(await readFile(join(installed, 'package.json'))); assert.equal(report.package.name, '@vmitsaras/raveldex');
  report.packageMetadataSha256 = digest(await readFile(join(installed, 'package.json')));
  const tarball = join(consumer, 'vmitsaras-raveldex-0.0.0.tgz'); report.tarball = { path: tarball, sha256: digest(await readFile(tarball)) };
  await walkProduction(installed); report.productionFiles.sort((a, b) => a.path.localeCompare(b.path));
  for (const path of ['RX-4002-memory.json', 'RX-4002-memory-graphs.json', 'RX-4002-memory-retainers.json', 'RX-4002-memory-restore.json']) {
    const full = join(REPO_ROOT, 'docs/evidence', path); report.preservedEvidence.push({ path: `docs/evidence/${path}`, sha256: digest(await readFile(full)) });
  }
  const directory = await mkdtemp(join(consumer, 'memory-browser-')); report.stagedDirectory = directory;
  for (const [source, staged] of [['bench/memory/browser-fixture.mjs', 'browser-fixture.mjs'], ['bench/memory/browser-worker.mjs', 'browser-worker.mjs'], ['bench/cost-common.mjs', 'cost-fixture.mjs']]) {
    await copyFile(join(REPO_ROOT, source), join(directory, staged));
    report.sourceBindings.push({ path: source, staged: join(directory, staged), sha256: digest(await readFile(join(directory, staged))) });
  }
  for (const path of ['bench/memory/browser-run.mjs', 'bench/memory/browser-cdp.mjs', 'bench/memory/browser-cdp.test.mjs', 'scripts/lib/packed-consumer.mjs']) report.sourceBindings.push({ path, sha256: digest(await readFile(join(REPO_ROOT, path))) });
  for (const [entry, outfile] of [['browser-fixture.mjs', 'memory-fixture.mjs'], ['browser-worker.mjs', 'memory-worker.mjs']]) {
    const built = await build({ absWorkingDir: directory, entryPoints: [entry], outfile, bundle: true, platform: 'browser', target: 'es2022', format: 'esm', minify: false, sourcemap: false, metafile: true, logLevel: 'silent' });
    const inputs = [];
    for (const [path, input] of Object.entries(built.metafile.inputs)) {
      assert.ok(['browser-fixture.mjs', 'browser-worker.mjs', 'cost-fixture.mjs'].includes(path) || path.includes('node_modules/@vmitsaras/raveldex/dist/'), `Unexpected input ${path}`);
      assert.ok(input.imports.every(item => !item.external)); inputs.push({ path, sha256: digest(await readFile(join(directory, path))) });
    }
    assert.ok(Object.values(built.metafile.outputs).every(item => item.imports.length === 0));
    report.bundles[outfile] = { sha256: digest(await readFile(join(directory, outfile))), inputs, metafile: built.metafile };
  }
  server = createServer(async (request, response) => {
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'");
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
    if (path === '/') { response.setHeader('content-type', 'text/html'); response.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Browser memory</title><script type="module" src="/memory-fixture.mjs"></script><body>Scoped memory observation</body></html>'); }
    else if (['/memory-fixture.mjs', '/memory-worker.mjs'].includes(path)) {
      response.setHeader('content-type', 'text/javascript'); response.end(await readFile(join(directory, path.slice(1))));
    } else { response.writeHead(404); response.end(); }
  });
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
  report.origin = `http://127.0.0.1:${server.address().port}`;
  for (const size of report.method.sizes) for (let repetition = 0; repetition < report.method.repetitions; repetition++) await observe(report.origin, size, repetition);
  for (const binding of [...report.sourceBindings, ...report.preservedEvidence]) assert.equal(digest(await readFile(join(REPO_ROOT, binding.path))), binding.sha256, `Preserved source/evidence changed ${binding.path}`);
  for (const binding of report.productionFiles) assert.equal(digest(await readFile(join(installed, binding.path))), binding.sha256);
  report.preservation = 'Pass'; report.outcome = report.observations.some(row => row.outcome === 'Fail') ? 'Fail' : 'ObservedWithLimitations';
} catch (error) { report.outcome = 'Fail'; report.failure = { name: error.name, message: error.message, stack: error.stack }; }
finally { if (server?.listening) await new Promise(yes => server.close(yes)); report.finishedAt = new Date().toISOString(); await save(); await file.close(); }
console.log(JSON.stringify({ output, outcome: report.outcome, repetitions: report.observations.length }));
if (report.outcome === 'Fail') process.exitCode = 1;
