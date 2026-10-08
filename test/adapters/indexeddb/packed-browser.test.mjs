import assert from 'node:assert/strict';
import { test, before, after, beforeEach, afterEach } from 'node:test';
import { createServer } from 'node:http';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { platform, release, arch } from 'node:os';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright-core';
import { build, version as esbuildVersion } from 'esbuild';
import { prepareConsumer, REPO_ROOT, digest, command, checkStartup, bundleConsumer } from '../../../scripts/lib/packed-consumer.mjs';
import { buildCorpus } from '../../../examples/core-docs/corpus.mjs';
import { DOCS_JUDGMENTS } from '../../fixtures/docs/judgments.mjs';
import { compareQuery } from '../../consumer/verify.mjs';

let consumer, browser, context, page, server, origin;
const reportPath = resolve(process.env.RAVELDEX_INDEXEDDB_REPORT ?? '/tmp/raveldex-rx3003-indexeddb.json');
const report = { kind: 'raveldex-packed-indexeddb-v1', startedAt: new Date().toISOString(),
  environment: { node: process.version, os: { platform: platform(), release: release(), arch: arch() }, esbuild: esbuildVersion },
  method: { storage: 'Actual same-origin browser IndexedDB open/transactions/object stores; failures injected around genuine APIs are individually labeled.',
    qualification: 'Source snapshots explicitly reindex on this local browser. Native browser snapshots are unqualified and rejected.',
    notMeasured: ['Physical quota exhaustion', 'cross-browser or cross-host qualification', 'assistive technology', 'browser retained or peak heap', 'physical durability after OS crash'] },
  records: [], stages: [], cleanup: [] };
const save = async () => { await mkdir(dirname(reportPath), { recursive: true }); await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n'); };
const stage = async name => { report.stages.push({ name, time: new Date().toISOString() }); await save(); };

async function bundle(entry, outfile, minify = true) {
  const settings = { absWorkingDir: consumer.directory, entryPoints: [entry], bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
    minify, treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false, metafile: true, outfile: join(consumer.directory, outfile), logLevel: 'silent' };
  const built = await build(settings), bytes = await readFile(join(consumer.directory, outfile)), inputs = [];
  for (const [path, input] of Object.entries(built.metafile.inputs)) {
    assert.ok(['fixture-entry.mjs', 'engine-worker.mjs', 'configuration.mjs', 'records.mjs'].includes(path) || path.startsWith('node_modules/@vmitsaras/raveldex/dist/'), `unexpected input: ${path}`);
    assert.ok(input.imports.every(item => !item.external), `external input: ${path}`);
    assert.doesNotMatch(path, /(?:test\/oracle|node_modules\/(?:minisearch|fuse|flexsearch|orama|playwright))/);
    inputs.push({ path, ...input, sha256: digest(await readFile(join(consumer.directory, path))) });
  }
  assert.deepEqual(Object.values(built.metafile.outputs)[0].imports, []);
  const gzip = { level: 9, windowBits: 15, memLevel: 8, strategy: 0 }, compressed = gzipSync(bytes, gzip);
  return { entry, outfile, sha256: digest(bytes), minifiedBytes: bytes.length, gzipBytes: compressed.length, gzipSha256: digest(compressed),
    method: { esbuild: esbuildVersion, target: 'es2022', format: 'esm', platform: 'browser', minify, treeShaking: true, charset: 'ascii', legalComments: 'none', sourcemap: false, gzip: { ...gzip, mtime: 0 } },
    inputs, metafile: built.metafile };
}

before(async () => {
  await stage('before:start');
  if (platform() === 'darwin') report.environment.os.product = (await command('/usr/bin/sw_vers', [])).stdout.trim();
  const corpus = buildCorpus(REPO_ROOT);
  consumer = await prepareConsumer(corpus, DOCS_JUDGMENTS); report.package = consumer.package; report.installedDirectory = consumer.directory;
  report.corpus = { hash: corpus.hash, records: corpus.records.length, sources: corpus.sources, sections: corpus.sections };
  await stage('before:installed-tarball');
  for (const file of ['fixture-entry.mjs', 'engine-worker.mjs', 'configuration.mjs']) await copyFile(join(REPO_ROOT, 'test/adapters/indexeddb', file), join(consumer.directory, file));
  await copyFile(join(REPO_ROOT, 'test/fixtures/indexeddb/records.mjs'), join(consumer.directory, 'records.mjs'));
  report.bundles = { packed: await bundle('fixture-entry.mjs', 'fixture-packed.mjs', false), minified: await bundle('fixture-entry.mjs', 'fixture.mjs'),
    worker: await bundle('engine-worker.mjs', 'worker-bundle.mjs'), packedWorker: await bundle('engine-worker.mjs', 'worker-packed.mjs', false) };
  report.core = await bundleConsumer(consumer.directory);
  for (const input of report.core.inputs) input.sha256 = digest(await readFile(join(consumer.directory, input.path)));
  assert.ok(report.bundles.minified.inputs.some(input => input.path.includes('/adapters/indexeddb/')));
  assert.ok(report.bundles.worker.inputs.some(input => input.path.includes('/adapters/worker/')));
  for (const typeFixture of ['public-types.ts', 'worker-host-types.ts']) {
    await copyFile(join(REPO_ROOT, 'test/adapters/indexeddb', typeFixture), join(consumer.directory, typeFixture));
    const libraries = ['ES2022', typeFixture.startsWith('worker') ? 'WebWorker' : 'DOM'];
    const configFile = typeFixture + '.json';
    await writeFile(join(consumer.directory, configFile), JSON.stringify({ compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: libraries, types: [], strict: true,
      noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, verbatimModuleSyntax: true, skipLibCheck: false, noEmit: true,
    }, include: [typeFixture] }));
    await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', configFile], consumer.directory);
  }
  report.publicDeclarations = { status: 'Pass', direct: ['ES2022', 'DOM'], workerHost: ['ES2022', 'WebWorker'], ambientNode: 'Excluded' };
  report.startup = [await checkStartup(consumer.directory, '@vmitsaras/raveldex')];
  const startup = await command(process.execPath, ['--input-type=module', '--eval', `
    const reads=[];
    for(const name of ['window','document','navigator','Worker','SharedWorker','fetch','indexedDB','IDBFactory','IDBDatabase','localStorage','setTimeout','setInterval','performance','crypto'])
      Object.defineProperty(globalThis,name,{configurable:true,get(){reads.push(name);throw Error(name)}});
    const outputs=[];
    for(const specifier of ['@vmitsaras/raveldex/adapters/indexeddb','@vmitsaras/raveldex/adapters/worker/snapshots','@vmitsaras/raveldex/adapters/worker/snapshots/host']){
      const module=await import(specifier);outputs.push({specifier,exports:Object.keys(module).sort()});
    }
    if(reads.length)throw Error('import-time host access');
    for(const specifier of ['@vmitsaras/raveldex/adapters/indexeddb/storage','@vmitsaras/raveldex/dist/adapters/indexeddb/index.js']){
      try{await import(specifier);throw Error('private import allowed')}catch(error){if(error.code!=='ERR_PACKAGE_PATH_NOT_EXPORTED')throw error}
    }
    console.log(JSON.stringify({reads,outputs,privatePaths:'Excluded'}));
  `], consumer.directory);
  report.startup.push(JSON.parse(startup.stdout));
  await stage('before:graphs-types-startup');
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const files = { '/fixture.mjs': 'fixture.mjs', '/fixture-packed.mjs': 'fixture-packed.mjs', '/engine-worker.mjs': 'worker-bundle.mjs', '/engine-worker-packed.mjs': 'worker-packed.mjs', '/corpus.json': 'corpus.json', '/judgments.json': 'judgments.json' };
    try {
      response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'");
      if (path === '/' || path === '/packed') { response.setHeader('content-type', 'text/html'); response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Installed IndexedDB verification</title></head><body><h1>IndexedDB verification</h1><script type="module" src="${path === '/packed' ? '/fixture-packed.mjs' : '/fixture.mjs'}"></script></body></html>`); }
      else if (files[path]) { response.setHeader('content-type', path.endsWith('.json') ? 'application/json' : 'text/javascript'); response.end(await readFile(join(consumer.directory, files[path]))); }
      else { response.writeHead(404); response.end(); }
    } catch { response.writeHead(500); response.end(); }
  });
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); }); origin = `http://127.0.0.1:${server.address().port}`;
  const channel = process.env.RAVELDEX_INDEXEDDB_BROWSER ?? process.env.RAVELDEX_WORKER_BROWSER ?? process.env.RAVELDEX_UI_BROWSER ?? 'chrome'; assert.ok(['chrome', 'chromium'].includes(channel));
  browser = await chromium.launch({ ...(channel === 'chrome' ? { channel: 'chrome' } : {}), headless: true });
  report.environment.browser = { channel, version: browser.version(), headless: true };
  report.environment.playwright = JSON.parse(await readFile(join(REPO_ROOT, 'node_modules/playwright-core/package.json'))).version;
  await stage('before:done');
}, { timeout: 120_000 });

beforeEach(async () => { context = await browser.newContext(); page = await context.newPage(); await page.goto(origin); await page.waitForFunction(() => !!window.indexedDBHarness); });
afterEach(async t => {
  let cleanup;
  try { if (page) cleanup = await page.evaluate(() => window.indexedDBHarness?.cleanup()); }
  finally { await context?.close(); context = undefined; page = undefined; }
  report.cleanup.push({ name: t.name, outcomes: cleanup });
  if (cleanup?.some(row => row.error)) { const recorded = report.records.find(row => row.name === t.name); if (recorded) { recorded.status = 'Fail'; recorded.cleanupFailure = cleanup; } }
  if (!report.records.some(row => row.name === t.name)) report.records.push({ name: t.name, status: 'Fail', evidence: 'No successful scenario observations; inspect raw terminal output.' });
  await save();
  assert.ok(!cleanup?.some(row => row.error), 'all retained test handles dispose');
});
after(async () => {
  await browser?.close(); await new Promise((yes, no) => server?.listening ? server.close(error => error ? no(error) : yes()) : yes());
  report.finishedAt = new Date().toISOString(); report.summary = { passed: report.records.filter(row => row.status === 'Pass').length,
    failed: report.records.filter(row => row.status === 'Fail').length,
    fullComparisons: report.records.reduce((sum, row) => sum + (row.evidence?.fullComparisons ?? 0), 0) };
  await save();
});

const scenarios = [
  ['explicit actions preserve complete direct/add-on source recovery and later mutations', 'parity'],
  ['unminified installed consumer preserves complete source recovery', 'parity', 'packed'],
  ['mutation, serialization and durable generations remain separately observable', 'mutationSave'],
  ['simultaneous clients require CAS and stale erased tokens cannot overwrite recreated state', 'conflicts'],
  ['namespace erasure deletes every owned store and isolates other namespaces', 'eraseIsolation'],
  ['unavailable storage preserves usable borrowed in-memory engine', 'unavailable'],
  ['injected genuine quota and transaction failures preserve previous durable generation', 'writeFailures'],
  ['observed strict transaction commit remains successful across same-event late cancellation', 'durableCommitAbort'],
  ['lost real durable completion delivery has unknown outcome and explicit load recovery', 'lostDurableCompletion'],
  ['corrupt, malformed and incompatible durable snapshots cannot partially restore', 'corruptLoad'],
  ['orphaned durable snapshot has explicit complete erasure and recreate recovery', 'orphanRecovery'],
  ['future versions and unknown database stores fail with explicit recovery', 'schemaRecovery'],
  ['real blocked upgrade is bounded and stopped late upgrade is aborted', 'blocked'],
  ['delayed genuine opened connection closes after finite open timeout', 'lateOpen'],
  ['actual external versionchange closes owned connection and preserves memory state', 'versionchange'],
  ['pre-abort and deadline failure perform no storage work and release listeners', 'earlyStops'],
  ['bounded pending FIFO settles queued stops and disposal before held snapshot delivery', 'queuedLifecycle'],
  ['save cancellation during real serialization preserves durable and in-memory states', 'cancelSave'],
  ['load cancellation preserves complete previous core and add-on states', 'cancelLoad'],
  ['disposal settles pending action and leaves borrowed engine usable', 'disposal'],
  ['real one-owner module worker recovers exact source/add-on semantics', 'workerParity'],
  ['lost actual worker restore reply exposes unknown outcome and conclusive receipt', 'workerLostRestore'],
  ['observed committed restore survives same-event late cancellation before Promise delivery', 'workerCommittedAbort'],
  ['negotiated worker snapshot transport bound refuses partial persisted data', 'workerWireLimit'],
  ['real worker termination settles pending load and explicit new worker recovers durable data', 'workerDeath'],
];
for (const [name, method, mode] of scenarios) test(name, async () => {
  try {
    if (mode === 'packed') { await page.goto(origin + '/packed'); await page.waitForFunction(() => !!window.indexedDBHarness); }
    const evidence = await page.evaluate(async method => window.indexedDBHarness[method](), method);
    report.records.push({ name, status: 'Pass', evidence }); await save();
  } catch (error) { report.records.push({ name, status: 'Fail', error: String(error).slice(0, 8192) }); await save(); throw error; }
}, { timeout: 90_000 });

test('actual page reload and current documentation recover through installed public storage', async t => {
  try {
    const saved = await page.evaluate(() => window.indexedDBHarness.prepareReload());
    await page.reload(); await page.waitForFunction(() => !!window.indexedDBHarness);
    const evidence = await page.evaluate(() => window.indexedDBHarness.completeReload());
    assert.equal(evidence.receipt.generation, saved.generation);
    assert.equal(evidence.corpusHash, report.corpus.hash);
    for (const row of evidence.queries) compareQuery(row.result, evidence.records, evidence.schema, row.query, row.result.revision);
    evidence.fullComparisons = evidence.queries.length;
    delete evidence.records;
    report.records.push({ name: t.name, status: 'Pass', evidence: { saved, ...evidence } }); await save();
  } catch (error) { report.records.push({ name: t.name, status: 'Fail', error: String(error).slice(0, 8192) }); await save(); throw error; }
}, { timeout: 90_000 });
