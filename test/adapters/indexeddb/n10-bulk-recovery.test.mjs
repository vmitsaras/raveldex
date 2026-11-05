import assert from 'node:assert/strict';
import { test, before, after, beforeEach, afterEach } from 'node:test';
import { createServer } from 'node:http';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { prepareConsumer, REPO_ROOT, digest } from '../../../scripts/lib/packed-consumer.mjs';
import { inventory } from '../../../bench/n9/run.mjs';

// Observation-only hooks in an isolated installed package prove actual branch
// selection. They do not wrap the registration identities being investigated.
const probes = String.raw`
const n10Trace = [];
globalThis.__rx9002BulkTrace = event => n10Trace.push(clone(event));
function n10Proof(trace, eligible) {
  const starts = trace.filter(e => e.event === 'participants');
  check(starts.length === 1, 'one actual reconstruction');
  const chosen = starts[0].participants.filter(p => p.bulk).map(p => p.id).sort();
  equal(chosen.length, eligible ? 2 : 0, 'actual exact source/positions eligibility');
  for (const id of chosen) {
    equal(trace.filter(e => e.event === 'add' && e.id === id && e.bulk).length, records.length, 'bulk add actually executes per record');
    equal(trace.filter(e => e.event === 'finish' && e.id === id).length, 1, 'bulk finish actually executes once');
  }
  if (!eligible) check(trace.some(e => e.event === 'add' && !e.bulk), 'generic callbacks actually execute');
  return { chosen, starts: starts.length, trace: clone(trace) };
}
function n10Intercept(remote, trace, drop) {
  remote.worker.onReply = message => {
    if (message.__rx9002Bulk) { trace.push(message.__rx9002Bulk); return false; }
    return !drop?.(message);
  };
}
window.indexedDBHarness.n10Identity = async () => {
  const donor = await populated(), encoded = await createSnapshots(donor).exportSource();
  const observations = [];
  for (const copied of [false, true]) {
    const cfg = configuration();
    if (copied) cfg.addons = cfg.addons.map(addon => addon.participant ? { ...addon } : addon);
    const target = createRaveldex(cfg); handles.add(target);
    await target.add({ id: 'prior', text: { title: 'old', body: 'old red' } });
    n10Trace.length = 0;
    const receipt = await createSnapshots(target).restore(encoded);
    equal(receipt.revision, 2, 'one restored replacement of nonempty root');
    const path = n10Proof(n10Trace, !copied);
    const comparisons = await completeComparisons(target, donor);
    equal(JSON.parse(await createSnapshots(target).exportSource()).body.payload.records, JSON.parse(encoded).body.payload.records, 'complete source restored');
    observations.push({ copiedRegistration: copied, path, receipt, comparisons });
  }
  return { observations, scope: 'Diagnostic copy; exact first-party vs spread identities, same public data semantics' };
};
window.indexedDBHarness.n10Lost = async afterCommit => {
  const donor = await populated(), durable = createIndexedDBPersistence(createSnapshots(donor), { databaseName: dbName, namespace: 'worker' });
  persistenceHandles.add(durable); const saved = await durable.save({ expectedGeneration: null });
  const remote = await workerEngine(), trace = [];
  n10Intercept(remote, trace, message => afterCommit && message.operation === 'snapshotRestore' && message.kind === 'result');
  let dispatched = 0;
  remote.worker.onSend = message => { if (message.operation === 'snapshotRestore') { dispatched++; return afterCommit; } };
  await remote.engine.add({ id: 'prior', text: { title: 'old', body: 'old red' } });
  const options = { extensions: { 'match-evidence': { ids: ['prior'], fields: ['body'] } } };
  const before = await remote.engine.search('red', options), beforeSource = await remote.snapshots.exportSource();
  const failed = await outcome(remote.persistence.load());
  equal(failed.error?.code, 'OUTCOME_UNKNOWN', 'undelivered dispatched restore outcome stays unknown');
  const restoreResultsDropped = remote.worker.dropped.filter(message => message.operation === 'snapshotRestore' && message.kind === 'result').length;
  equal(restoreResultsDropped, afterCommit ? 1 : 0, 'actual restore-result loss is separate from diagnostic messages');
  const operationId = failed.error.details?.operationId; check(typeof operationId === 'string' && operationId.length, 'snapshot operation identity retained');
  const receipt = await remote.snapshots.reconcile(operationId);
  equal(dispatched, 1, 'no blind second restore');
  if (afterCommit) {
    equal([receipt.status, receipt.result?.revision], ['committed', 2], 'authoritative receipt proves one publication');
    const path = n10Proof(trace, true), comparisons = await completeComparisons(remote.engine, donor);
    equal(JSON.parse(await remote.snapshots.exportSource()).body.payload.records, JSON.parse(await createSnapshots(donor).exportSource()).body.payload.records, 'all committed source values');
    await remote.engine.replace({ id: 'a', text: { title: 'green', body: 'green' } });
    equal((await remote.engine.search('green')).hits.map(hit => hit.id), ['a'], 'later mutation remains usable');
    equal(dispatched, 1, 'reconciliation and later writes do not repeat restore');
    return { afterCommit, saved, failed, receipt, dispatched, restoreResultsDropped, path, comparisons, transport: remote.worker.stats() };
  }
  equal(receipt.status, 'expired', 'host has no receipt for the withheld request');
  equal(trace.length, 0, 'withheld request never enters bulk reconstruction');
  equal(await remote.engine.search('red', options), before, 'exact old query/revision/offset observations retained');
  equal(await remote.snapshots.exportSource(), beforeSource, 'exact old source retained');
  // An expired receipt is not an authoritative rollback result. Recovery is an
  // explicit new owner; the ambiguous request is never blindly resent.
  await remote.engine.dispose();
  equal([remote.worker.count(), remote.worker.terminated], [0, 1], 'old transport ownership released');
  const replacement = await workerEngine(), recoveredTrace = []; n10Intercept(replacement, recoveredTrace);
  const loaded = await replacement.persistence.load(); equal(loaded.generation, saved.generation, 'new owner loads known durable generation');
  const comparisons = await completeComparisons(replacement.engine, donor), path = n10Proof(recoveredTrace, true);
  return { afterCommit, saved, failed, receipt, dispatched, restoreResultsDropped, oldObservation: before, oldSourcePreserved: true,
    replacementLoaded: loaded, path, comparisons, oldTransport: remote.worker.stats(), recoveryPolicy: 'Explicit new owner; no inference of rollback from expired receipt' };
};
window.indexedDBHarness.n10Conflict = async () => {
  const donor = await populated(), writer = storage(donor), saved = await writer.save({ expectedGeneration: null });
  const target = direct(); await target.add({ id: 'prior', text: { title: 'old', body: 'old red' } });
  const receiver = storage(target); n10Trace.length = 0; const loaded = await receiver.load();
  equal(loaded.restore.revision, 2, 'bulk load replaces one nonempty root');
  const path = n10Proof(n10Trace, true), comparisons = await completeComparisons(target, donor);
  const oldSource = await createSnapshots(target).exportSource(), oldQueries = await target.search('red', { extensions: evidenceRequests[2] });
  await donor.add({ id: 'winner', text: { title: 'winner', body: 'fresh' } });
  const winner = await writer.save({ expectedGeneration: saved.generation }), beforeDurable = await databaseRows();
  const failed = await outcome(receiver.save({ expectedGeneration: saved.generation }));
  equal(failed.error?.code, 'GENERATION_CONFLICT', 'stale loaded generation cannot overwrite winner');
  equal(await databaseRows(), beforeDurable, 'all durable stores and encoded winner preserved');
  equal(await createSnapshots(target).exportSource(), oldSource, 'conflict preserves exact old in-memory source');
  equal(await target.search('red', { extensions: evidenceRequests[2] }), oldQueries, 'conflict preserves exact old root/sidecar result');
  equal(n10Trace.filter(e => e.event === 'participants').length, 1, 'stale save does not reconstruct or publish memory');
  const fresh = direct(), recovered = await storage(fresh).load(); equal(recovered.generation, winner.generation, 'fresh receiver selects durable winner');
  equal((await fresh.search({ kind: 'all' }, { limit: 100 })).hits.map(h => h.id).sort(), [...records.map(r => r.id), 'winner'].sort(), 'complete winner membership');
  equal(JSON.parse(await createSnapshots(fresh).exportSource()).body.payload.records, JSON.parse(await createSnapshots(donor).exportSource()).body.payload.records, 'winner full source');
  const ranked = await fresh.search({ kind: 'text', text: 'red', fields: ['title'] });
  const expected = { a: handBM25(2, 3, 9 / 5, 5, 3), b: handBM25(1, 2, 9 / 5, 5, 3), d: handBM25(1, 2, 9 / 5, 5, 3) };
  for (const hit of ranked.hits) check(Math.abs(hit.score - expected[hit.id]) < 1e-12, 'independent new-generation BM25');
  return { saved, loaded, path, comparisons, failed, winner, recovered, oldStatePreserved: true, durableWinnerPreserved: true, ranked };
};
`;

let consumer, browser, server, origin, context, page, beforeInventory, observedInventory;
const output = resolve(process.env.RAVELDEX_RX9002_BULK_REPORT ?? '/tmp/raveldex-rx9002-bulk.json');
const report = { kind: 'rx9002-bulk-browser-v1', startedAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, arch: process.arch },
  scope: 'Finite diagnostic installed-package checks in actual Chromium/IndexedDB/module workers; no timing, heap, device or uninstrumented performance claim.', cases: [], cleanup: [] };
const save = async () => { await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n'); };
const normalize = rows => [...rows].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
function replaceOnce(source, from, to) { assert.equal(source.split(from).length, 2, 'observer anchor must occur exactly once'); return source.replace(from, to); }

before(async () => {
  consumer = await prepareConsumer({ kind: 'rx9002-bounded-fixture' }, []); report.package = consumer.package; report.consumerDirectory = consumer.directory;
  report.harness = await Promise.all(['test/adapters/indexeddb/n10-bulk-recovery.test.mjs', 'test/adapters/indexeddb/fixture-entry.mjs', 'test/adapters/indexeddb/configuration.mjs', 'test/adapters/indexeddb/engine-worker.mjs', 'test/fixtures/indexeddb/records.mjs'].map(async path => ({ path, sha256: digest(await readFile(join(REPO_ROOT, path))) })));
  beforeInventory = normalize(await inventory(consumer.installed));
  const path = join(consumer.installed, 'dist/adapters/snapshots/bulk.js'), original = await readFile(path, 'utf8');
  let changed = replaceOnce(original, '    const old = emptyRoot(configuration, Object.freeze(states));',
    "    globalThis.__rx9002BulkTrace?.({event:'participants',records:records.length,participants:participants.map(p=>({id:p.id,bulk:!!p.bulk}))});\n    const old = emptyRoot(configuration, Object.freeze(states));");
  changed = replaceOnce(changed, '            const cursor = participant.bulk ? participant.bulk.add(context) : participant.handle.prepare(currentStates[participant.id], context);',
    "            globalThis.__rx9002BulkTrace?.({event:'add',id:participant.id,bulk:!!participant.bulk});\n            const cursor = participant.bulk ? participant.bulk.add(context) : participant.handle.prepare(currentStates[participant.id], context);");
  changed = replaceOnce(changed, '        const cursor = participant.bulk.finish(revision);',
    "        globalThis.__rx9002BulkTrace?.({event:'finish',id:participant.id});\n        const cursor = participant.bulk.finish(revision);");
  await writeFile(path, changed); observedInventory = normalize(await inventory(consumer.installed));
  assert.deepEqual(beforeInventory.filter(p => p.path !== 'dist/adapters/snapshots/bulk.js'), observedInventory.filter(p => p.path !== 'dist/adapters/snapshots/bulk.js'));
  report.packageInventories = { original: beforeInventory, observed: observedInventory };
  report.observer = { path: 'dist/adapters/snapshots/bulk.js', before: digest(original), after: digest(changed), registrationIdentity: 'Unchanged; observed return and actual dispatch only', source: changed };
  for (const file of ['fixture-entry.mjs', 'engine-worker.mjs', 'configuration.mjs']) await copyFile(join(REPO_ROOT, 'test/adapters/indexeddb', file), join(consumer.directory, file));
  await copyFile(join(REPO_ROOT, 'test/fixtures/indexeddb/records.mjs'), join(consumer.directory, 'records.mjs'));
  await writeFile(join(consumer.directory, 'fixture-entry.mjs'), (await readFile(join(consumer.directory, 'fixture-entry.mjs'), 'utf8')) + probes);
  await writeFile(join(consumer.directory, 'engine-worker.mjs'), (await readFile(join(consumer.directory, 'engine-worker.mjs'), 'utf8')) + '\nglobalThis.__rx9002BulkTrace = event => self.postMessage({__rx9002Bulk:event});\n');
  report.bundles = [];
  for (const [entry, outfile] of [['fixture-entry.mjs', 'fixture.mjs'], ['engine-worker.mjs', 'worker.mjs']]) {
    const result = await build({ absWorkingDir: consumer.directory, entryPoints: [entry], outfile: join(consumer.directory, outfile), bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: false, metafile: true, logLevel: 'silent' });
    // Existing fixture resolves engine-worker.mjs relative to its bundled URL.
    if (entry === 'engine-worker.mjs') await copyFile(join(consumer.directory, outfile), join(consumer.directory, 'engine-worker-bundle.mjs'));
    report.bundles.push({ entry, outfile, sha256: digest(await readFile(join(consumer.directory, outfile))), inputs: await Promise.all(Object.keys(result.metafile.inputs).map(async path => ({ path, sha256: digest(await readFile(join(consumer.directory, path))) }))), metafile: result.metafile });
  }
  await writeFile(join(consumer.directory, 'index.html'), '<!doctype html><script type="module" src="/fixture.mjs"></script>');
  report.servedFiles = await Promise.all([['/', 'index.html'], ['/fixture.mjs', 'fixture.mjs'], ['/engine-worker.mjs', 'engine-worker-bundle.mjs']].map(async ([route, file]) => ({ route, file, sha256: digest(await readFile(join(consumer.directory, file))) })));
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    try {
      if (pathname === '/') { response.setHeader('content-type', 'text/html'); response.end(await readFile(join(consumer.directory, 'index.html'))); }
      else if (['/fixture.mjs', '/engine-worker.mjs'].includes(pathname)) { response.setHeader('content-type', 'text/javascript'); response.end(await readFile(join(consumer.directory, pathname === '/fixture.mjs' ? 'fixture.mjs' : 'engine-worker-bundle.mjs'))); }
      else { response.writeHead(404); response.end(); }
    } catch { response.writeHead(500); response.end(); }
  });
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); }); origin = `http://127.0.0.1:${server.address().port}`;
  const channel = process.env.RAVELDEX_INDEXEDDB_BROWSER ?? 'chromium'; assert.ok(['chrome', 'chromium'].includes(channel));
  browser = await chromium.launch({ headless: true, ...(channel === 'chrome' ? { channel: 'chrome' } : {}) }); report.environment.browser = { channel, version: browser.version() };
  await save();
}, { timeout: 120000 });

beforeEach(async () => { context = await browser.newContext(); page = await context.newPage(); await page.goto(origin); await page.waitForFunction(() => !!window.indexedDBHarness?.n10Identity); });
afterEach(async t => {
  try {
    const outcomes = await page.evaluate(() => window.indexedDBHarness.cleanup());
    report.cleanup.push({ name: t.name, outcomes, status: outcomes.every(item => !item.error) ? 'Pass' : 'Fail' });
    assert.ok(outcomes.every(item => !item.error), 'every retained handle disposes');
  } catch (error) {
    const row = report.cases.find(item => item.name === t.name); if (row) { row.status = 'Fail'; row.cleanupError = String(error); }
    throw error;
  } finally { await context?.close(); await save(); }
});
after(async () => {
  try {
    if (consumer) assert.deepEqual(normalize(await inventory(consumer.installed)), observedInventory, 'observed package changed during scenarios');
    for (const pin of report.harness ?? []) assert.equal(digest(await readFile(join(REPO_ROOT, pin.path))), pin.sha256, 'source fixture changed during scenarios');
    for (const pin of report.servedFiles ?? []) assert.equal(digest(await readFile(join(consumer.directory, pin.file))), pin.sha256, 'served browser artifact changed during scenarios');
    report.guards = 'Pass';
  } catch (error) { report.guards = 'Fail'; report.guardError = String(error); throw error; }
  finally {
    await browser?.close(); await new Promise(yes => server?.listening ? server.close(yes) : yes()); report.finishedAt = new Date().toISOString();
    report.outcome = report.guards === 'Pass' && report.cases.length === 4 && report.cases.every(item => item.status === 'Pass') && report.cleanup.length === 4 && report.cleanup.every(item => item.status === 'Pass') ? 'Pass' : 'Fail';
    await save();
  }
});
for (const [name, method, argument] of [
  ['exact source/positions identities enter actual bulk dispatch while spread registrations retain generic callbacks', 'n10Identity'],
  ['nonempty worker restore withheld before host remains Unknown and recovers through an explicit new owner', 'n10Lost', false],
  ['lost post-commit nonempty worker restore reply reconciles one bulk publication without blind retry', 'n10Lost', true],
  ['bulk-loaded source/positions receiver preserves memory and durable winner after generation conflict', 'n10Conflict'],
]) test(name, async () => {
  try { const evidence = await page.evaluate(async ([method, argument]) => window.indexedDBHarness[method](argument), [method, argument]); report.cases.push({ name, status: 'Pass', evidence }); }
  catch (error) { report.cases.push({ name, status: 'Fail', error: String(error), stack: error.stack }); throw error; }
  finally { await save(); }
}, { timeout: 60000 });
