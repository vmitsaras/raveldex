// Explicit installed-package controller for task-owned native observation.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { nestedSession } from './browser-cdp.mjs';

assert.ok(process.argv[2] && process.argv[3], 'Supply installed consumer and NEW output directory');
const consumer = await realpath(process.argv[2]), directory = resolve(process.argv[3]);
await mkdir(directory);
const executable = '/Users/vasilis/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fileHash(path) {
  const h = createHash('sha256');
  for await (const bytes of createReadStream(path)) h.update(bytes);
  return h.digest('hex');
}
assert.equal(await fileHash(executable), 'a0bfe7b4da4787b66058477d696cd1d09065d25f06a548947722b9af77ee8282');
const report = { schema: 'raveldex-native-message-control-v1', directory, consumer, executable,
  binarySha256: await fileHash(executable), started: new Date().toISOString(), commands: [],
  productionFiles: [], sources: [], bundles: {}, outcome: 'Running', commandFailures: 0,
  scope: 'Actual installed public source-worker messages; primitive unchanged protocol identity rows. This controller alone supplies no allocation, lifetime, copy or physical peak evidence.' };
let http, server, browser, context, page, worker, cdp, main, remote, closed = false, input, watchdog;
async function save() { await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
async function observations() {
  const main = await page.evaluate(() => window.messageControl.observation());
  const remote = await worker.evaluate(() => globalThis.messageObservation());
  assert.equal(main.dropped, 0); assert.equal(remote.dropped, 0);
  return { main, worker: remote };
}
async function close() {
  if (closed) return;
  closed = true; clearTimeout(watchdog); input?.close(); process.stdin.pause();
  remote?.close();
  report.cleanupErrors = [];
  for (const operation of [() => context?.close(), () => browser?.close(), () => server?.close(),
    () => http?.listening ? new Promise(yes => http.close(yes)) : undefined]) {
    try { await operation(); } catch (error) { report.cleanupErrors.push(error.message); }
  }
  report.ownedBrowserClosed = report.cleanupErrors.length === 0;
  report.finished = new Date().toISOString(); await save();
}
watchdog = setTimeout(async () => {
  report.outcome = 'Owned controller timeout'; await close(); process.exitCode = 1;
}, 20 * 60 * 1000);
try {
  const installed = await realpath(join(consumer, 'node_modules/@vmitsaras/raveldex'));
  assert.equal(installed, join(consumer, 'node_modules/@vmitsaras/raveldex'));
  report.tarballSha256 = await fileHash(join(consumer, 'vmitsaras-raveldex-0.0.0.tgz'));
  assert.equal(report.tarballSha256, '6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437');
  async function walk(path = 'dist') {
    for (const entry of await readdir(join(installed, path), { withFileTypes: true })) {
      const name = join(path, entry.name);
      if (entry.isDirectory()) await walk(name);
      else {
        assert.ok(entry.isFile()); const digest = await fileHash(join(installed, name));
        assert.equal(digest, await fileHash(name)); report.productionFiles.push({ path: name, sha256: digest });
      }
    }
  }
  await walk(); assert.equal(report.productionFiles.length, 208);
  report.stagedDirectory = await mkdtemp(join(consumer, 'native-message-'));
  for (const [source, name] of [['bench/memory/message-fixture.mjs', 'message-fixture.mjs'],
    ['bench/memory/message-worker.mjs', 'message-worker.mjs'], ['bench/memory/message-observer.mjs', 'message-observer.mjs'],
    ['bench/cost-common.mjs', 'cost-fixture.mjs']]) {
    const target = join(report.stagedDirectory, name); await copyFile(source, target);
    report.sources.push({ source, target, sha256: await fileHash(target) });
  }
  report.sources.push({ source: 'bench/memory/browser-message-control.mjs', sha256: await fileHash('bench/memory/browser-message-control.mjs') });
  report.sources.push({ source: 'bench/memory/browser-cdp.mjs', sha256: await fileHash('bench/memory/browser-cdp.mjs') });
  for (const entry of ['message-fixture', 'message-worker']) {
    const outfile = entry + '-bundle.mjs';
    const built = await build({ absWorkingDir: report.stagedDirectory, entryPoints: [entry + '.mjs'],
      outfile, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: false, metafile: true, logLevel: 'silent' });
    const inputs = [];
    for (const [path, value] of Object.entries(built.metafile.inputs)) {
      assert.ok(['message-fixture.mjs', 'message-worker.mjs', 'message-observer.mjs', 'cost-fixture.mjs'].includes(path) || path.includes('node_modules/@vmitsaras/raveldex/dist/'));
      assert.ok(value.imports.every(i => !i.external));
      inputs.push({ path, sha256: await fileHash(join(report.stagedDirectory, path)) });
    }
    assert.ok(Object.values(built.metafile.outputs).every(o => o.imports.length === 0));
    report.bundles[outfile] = { inputs, metafile: built.metafile, sha256: await fileHash(join(report.stagedDirectory, outfile)) };
  }
  const bundles = Object.fromEntries(await Promise.all(['message-fixture', 'message-worker'].map(async name =>
    ['/' + name + '.mjs', await readFile(join(report.stagedDirectory, name + '-bundle.mjs'))])));
  http = createServer((request, response) => {
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'");
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    if (request.method !== 'GET') { response.writeHead(405); response.end(); }
    else if (path === '/') {
      response.setHeader('content-type', 'text/html');
      response.end('<!doctype html><html lang="en"><script type="module" src="/message-fixture.mjs"></script><body>Owned Raveldex protocol observation</body></html>');
    } else if (Object.hasOwn(bundles, path)) { response.setHeader('content-type', 'text/javascript'); response.end(bundles[path]); }
    else { response.writeHead(404); response.end(); }
  });
  await new Promise((yes, no) => { http.once('error', no); http.listen(0, '127.0.0.1', yes); });
  report.origin = 'http://127.0.0.1:' + http.address().port;
  server = await chromium.launchServer({ executablePath: executable, headless: true, host: '127.0.0.1' });
  report.browserPid = server.process().pid; report.browserArguments = server.process().spawnargs;
  browser = await chromium.connect(server.wsEndpoint()); context = await browser.newContext();
  page = await context.newPage(); page.setDefaultTimeout(150000);
  main = await context.newCDPSession(page);
  const attached = new Promise((yes, no) => main.once('Target.attachedToTarget', event => {
    try {
      assert.equal(event.targetInfo.type, 'worker');
      assert.equal(event.targetInfo.url, report.origin + '/message-worker.mjs');
      remote = nestedSession(main, event.sessionId); report.workerTarget = event; yes();
    } catch (error) { no(error); }
  }));
  await main.send('Runtime.enable');
  await main.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false,
    flatten: false, filter: [{ type: 'worker' }, { exclude: true }] });
  cdp = await browser.newBrowserCDPSession(); report.version = await cdp.send('Browser.getVersion');
  assert.match(report.version.product, /153\.0\.8010\.12/);
  await page.goto(report.origin); await page.waitForFunction(() => !!window.messageControl);
  await page.evaluate(() => window.messageControl.ready());
  await attached; await remote.send('Runtime.enable');
  report.isolates = { main: await main.send('Runtime.getIsolateId'), worker: await remote.send('Runtime.getIsolateId') };
  assert.notEqual(report.isolates.main.id, report.isolates.worker.id);
  assert.equal(page.workers().length, 1); worker = page.workers()[0];
  assert.equal(worker.url(), report.origin + '/message-worker.mjs'); report.workerUrl = worker.url();
  const label = 'rx-message-owned-renderer-' + report.browserPid;
  await cdp.send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: {
    recordMode: 'recordUntilFull', includedCategories: ['blink.user_timing'] } });
  await page.evaluate(label => performance.mark(label + ':main'), label);
  await worker.evaluate(label => performance.mark(label + ':worker'), label);
  const completion = new Promise(yes => cdp.once('Tracing.tracingComplete', yes));
  await cdp.send('Tracing.end'); const ended = await completion; assert.equal(ended.dataLossOccurred, false);
  const pieces = []; let length = 0;
  try {
    for (;;) {
      const part = await cdp.send('IO.read', { handle: ended.stream, size: 65536 });
      const bytes = Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8');
      length += bytes.length; assert.ok(length <= 4 * 1024 * 1024); pieces.push(bytes); if (part.eof) break;
    }
  } finally { await cdp.send('IO.close', { handle: ended.stream }); }
  const raw = Buffer.concat(pieces), marks = JSON.parse(raw).traceEvents.filter(e => e.name === label + ':main' || e.name === label + ':worker');
  await writeFile(join(directory, 'pid-proof-trace.json'), raw, { flag: 'wx' });
  assert.equal(marks.length, 2);
  assert.equal(marks.filter(event => event.name === label + ':main').length, 1);
  assert.equal(marks.filter(event => event.name === label + ':worker').length, 1);
  assert.ok(marks.every(event => Number.isSafeInteger(event.pid) && event.pid > 0 && Number.isSafeInteger(event.tid) && event.tid > 0));
  assert.notEqual(marks[0].tid, marks[1].tid);
  const pids = [...new Set(marks.map(event => event.pid))]; assert.equal(pids.length, 1);
  report.rendererPid = pids[0]; report.pidProof = { label, marks, sha256: hash(raw) };
  report.processInfo = (await cdp.send('SystemInfo.getProcessInfo')).processInfo;
  assert.ok(report.processInfo.some(row => row.id === report.rendererPid && row.type === 'renderer'));
  report.initialObservation = await observations(); await save();
  console.log(JSON.stringify({ ready: true, directory, browserPid: report.browserPid, rendererPid: report.rendererPid, pidProof: report.pidProof, origin: report.origin }));
  input = createInterface({ input: process.stdin, terminal: false });
  for await (const line of input) {
    if (!line.trim()) continue;
    const command = JSON.parse(line), row = { command, started: new Date().toISOString() }; report.commands.push(row);
    try {
      if (command.cmd === 'build') {
        assert.ok([4, 1000, 10000].includes(command.size)); row.result = await page.evaluate(size => window.messageControl.build(size), command.size);
      } else if (command.cmd === 'case') {
        assert.ok(['empty', 'search', 'export', 'prior', 'restore', 'dispose'].includes(command.kind));
        row.result = await page.evaluate(kind => window.messageControl.run(kind), command.kind);
      } else if (command.cmd === 'observation') row.result = await observations();
      else if (command.cmd === 'release') row.result = await page.evaluate(() => window.messageControl.release());
      else if (command.cmd === 'terminate') row.result = await page.evaluate(() => window.messageControl.terminate());
      else if (command.cmd === 'gc') {
        await main.send('HeapProfiler.collectGarbage'); await remote.send('HeapProfiler.collectGarbage');
        await main.send('HeapProfiler.collectGarbage'); row.result = { forcedCollection: true, scope: 'Explicit debugger collection, not ordinary automatic deletion timing' };
      }
      else if (command.cmd === 'close') { row.result = { closing: true }; report.outcome = report.commandFailures ? 'Observed with command failure' : 'Observed actual messages'; break; }
      else throw Error('Unknown command');
      if (command.cmd !== 'terminate') row.observations = await observations();
    } catch (error) { row.error = { name: error.name, message: error.message }; report.commandFailures++; report.outcome = 'Observed with command failure'; }
    row.finished = new Date().toISOString(); await save(); console.log(JSON.stringify({ command, result: row.result, error: row.error, observationRows: row.observations ? { main: row.observations.main.rows.length, worker: row.observations.worker.rows.length } : null }));
  }
  for (const row of report.productionFiles) assert.equal(row.sha256, await fileHash(join(installed, row.path)));
  for (const row of report.sources) { assert.equal(row.sha256, await fileHash(row.source)); if (row.target) assert.equal(row.sha256, await fileHash(row.target)); }
  report.preservation = 'Pass'; await close();
} catch (error) {
  report.outcome = 'Fail'; report.failure = { name: error.name, message: error.message, stack: error.stack };
  await close(); throw error;
}
