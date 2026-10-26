// Installed public operations; observation-only private admit seam and a worker
// debugger identify exact lexical roots. Only the parent parses finished dumps.
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { writeHeapSnapshot, getHeapStatistics } from 'node:v8';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { release, arch } from 'node:os';
import { createRaveldex } from '@vmitsaras/raveldex';
import { getExecutionOwner } from '../node_modules/@vmitsaras/raveldex/dist/core/execution/engine.js';
import { recordsFor, updatedRecord, schema } from './mutation-fixture.mjs';

const [mode, rawSize, directory, output] = process.argv.slice(2), size = Number(rawSize);
assert.ok(['core-only', 'source-phrase', 'positions-offsets'].includes(mode) && [1000, 10000].includes(size));
assert.equal(typeof global.gc, 'function');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { kind: 'rx4002-mutation-staging-child-v1', mode, size, pid: process.pid, node: process.version, versions: process.versions,
  environment: { osRelease: release(), arch: arch() }, startedAt: new Date().toISOString(), snapshots: [], samples: [], operations: [], verifications: [], debugger: [], collections: [], outcome: 'Running' };
let engine, owner, worker, originalAdmit, armed, observed = false, witnesses, controls, corpus;
const started = performance.now();
function sample(stage) { report.samples.push({ stage, atMs: performance.now() - started, bytes: process.memoryUsage(),
  mainIsolateUsedHeapSize: getHeapStatistics().used_heap_size }); }
async function settle(stage) {
  for (let cycle = 0; cycle < 3; cycle++) { await new Promise(yes => setImmediate(yes)); global.gc(); await new Promise(yes => setTimeout(yes, 25)); sample(`${stage}:${cycle}`); }
}
function reading(refs) { return Object.fromEntries(Object.entries(refs).map(([label, ref]) => [label, ref.deref() === undefined])); }
function directoryValue(directory, id) {
  // Observation by literal key scan, not the production hash function.
  const buckets = Object.values(directory.buckets).filter(bucket => Object.hasOwn(bucket, id));
  assert.equal(buckets.length, 1); return buckets[0][id];
}
function captureBoundary() {
  // Worker inspector resumes here only after setting validated lexical markers.
  debugger;
  const m = globalThis.__raveldexMutationMarkers;
  assert.ok(m && m.old === owner.root && m.candidate !== owner.root);
  const oldChanged = directoryValue(m.old.documents, 'item:00000'), newChanged = directoryValue(m.candidate.documents, 'item:00000');
  const oldUntouched = directoryValue(m.old.documents, 'item:00001'), newUntouched = directoryValue(m.candidate.documents, 'item:00001');
  assert.notEqual(oldChanged, newChanged); assert.equal(oldUntouched, newUntouched);
  assert.equal(m.changes[0].previous, oldChanged); assert.equal(m.changes[0].next, newChanged);
  assert.equal(m.old.documents.size, size); assert.equal(m.candidate.documents.size, size);
  for (const side of Object.values(m.candidate.participants)) assert.equal(side.revision, m.candidate.revision);
  witnesses = Object.fromEntries(['old', 'candidate', 'core', 'context', 'changes', 'request'].map(key => [key, new WeakRef(m[key])]));
  witnesses.oldChanged = new WeakRef(oldChanged); witnesses.candidateChanged = new WeakRef(newChanged); witnesses.untouched = new WeakRef(oldUntouched);
  const path = join(directory, `${mode}-${size}-${armed}-precommit.heapsnapshot`);
  sample(`${armed}:before-intrusive-dump`); writeHeapSnapshot(path); sample(`${armed}:after-intrusive-dump`);
  assert.equal(m.old, owner.root, 'Dump observation must finish before publication');
  assert.equal(m.candidate.revision, m.old.revision + 1); assert.ok(Object.isFrozen(m.old) && Object.isFrozen(m.candidate));
  report.snapshots.push({ action: armed, path, oldRevision: m.old.revision, candidateRevision: m.candidate.revision,
    oldIsStillCommitted: true, changedDocumentDistinct: true, untouchedDocumentShared: true, participantRevisionsMatch: true });
  delete globalThis.__raveldexMutationMarkers;
}
async function verify(changed) {
  const revision = Math.ceil(size / 256) + (changed ? 1 : 0);
  const queries = [[{ kind: 'all' }, size, () => true], ['value7', Math.floor((size - 8) / 37) + 1 + (changed ? 1 : 0), i => i % 37 === 7 || changed && i === 0]];
  if (mode !== 'core-only') queries.push([{ kind: 'extension', capability: 'phrases', version: 1, payload: { text: 'red blue', fields: ['body'] } }, Math.ceil(size / 3) - (changed ? 1 : 0), i => i % 3 === 0 && (!changed || i !== 0)]);
  for (const [query, expected, eligible] of queries) {
    const result = await engine.search(query, { limit: 20, deadlineMs: 60000 });
    assert.equal(result.completeness, 'complete'); assert.equal(result.total, expected); assert.equal(result.revision, revision);
    assert.equal(result.hits.length, Math.min(20, expected)); assert.equal(new Set(result.hits.map(hit => hit.id)).size, result.hits.length);
    for (const hit of result.hits) { assert.match(hit.id, /^item:[0-9]{5}$/); const i = Number(hit.id.slice(5)); assert.ok(i < size && eligible(i) && Number.isFinite(hit.score)); }
    report.verifications.push({ changed, total: result.total, returned: result.hits.length, revision: result.revision, literalEligibility: true });
  }
}
function startDebugger(sourceSha256) {
  worker = new Worker(new URL('./mutation-debugger.mjs', import.meta.url), { workerData: { consumeSha256: sourceSha256 } });
  return new Promise((yes, no) => {
    worker.on('error', no); worker.on('message', message => { report.debugger.push(message); if (message.type === 'ready') yes(); });
  });
}
async function stopDebugger() {
  if (!worker) return;
  const current = worker;
  const closed = new Promise((yes, no) => { current.once('error', no); current.on('message', m => { if (m.type === 'closed') yes(); }); });
  const exited = new Promise(yes => current.once('exit', yes));
  current.postMessage('close'); await closed; assert.equal(await exited, 0); worker = undefined;
}
async function attempt(action) {
  await startDebugger(report.compiledConsumeSha256);
  armed = action; observed = false;
  let controller = new AbortController();
  globalThis.__raveldexMutationCancel = () => controller.abort();
  const outcome = await engine.replace(action === 'commit' ? updatedRecord : { id: 'item:00000', text: { body: 'red blue echo echo value0' }, metadata: { group: 'group0' } },
    { deadlineMs: 60000, signal: controller.signal }).then(result => ({ outcome: 'Pass', result }), error => ({ outcome: 'Rejected', error: { name: error.name, code: error.code } }));
  assert.equal(observed, true); armed = undefined; delete globalThis.__raveldexMutationCancel; controller = undefined;
  await stopDebugger();
  if (action === 'commit') assert.deepEqual(outcome.result, { revision: Math.ceil(size / 256) + 1, changed: true, added: 0, replaced: 1, removed: 0 });
  else assert.deepEqual(outcome, { outcome: 'Rejected', error: { name: 'RaveldexError', code: 'CANCELLED' } });
  report.operations.push({ action, ...outcome });
  await verify(true); await settle(`${action}:cleanup`);
  const collected = reading(witnesses), controlCollected = reading(controls);
  const expected = { old: action === 'commit', candidate: action === 'cancel', core: true, context: true, changes: true, request: true,
    oldChanged: action === 'commit', candidateChanged: action === 'cancel', untouched: false };
  assert.deepEqual(collected, expected, 'Direct root/document witnesses must reflect actual commit/rollback');
  assert.deepEqual(controlCollected, { held: false, released: true });
  report.collections.push({ action, collected, controlCollected }); witnesses = undefined;
}
try {
  await settle('imports-only-baseline');
  let addons = [];
  if (mode === 'source-phrase') { const p = await import('@vmitsaras/raveldex/addons/phrases'); addons = [p.createSourceProvider({ fields: ['body'] }), p.createSourcePhrases({ fields: ['body'] })]; }
  if (mode === 'positions-offsets') { const p = await import('@vmitsaras/raveldex/addons/positions'), f = await import('@vmitsaras/raveldex/addons/phrases/positions'); addons = [p.createPositionProvider({ fields: ['body'], offsets: ['body'] }), f.createPositionPhrases({ fields: ['body'] })]; }
  engine = createRaveldex({ schema, addons }); addons = undefined; owner = getExecutionOwner(engine);
  corpus = recordsFor(size); report.corpusSha256 = hash(JSON.stringify(corpus));
  for (let at = 0; at < size; at += 256) await engine.addMany(corpus.slice(at, at + 256), { deadlineMs: 60000 });
  corpus = undefined; await verify(false); await settle('built-input-released');
  report.compiledConsumeSha256 = hash(await readFile(new URL('../node_modules/@vmitsaras/raveldex/dist/core/mutations/owner.js', import.meta.url)));
  const held = { literal: 'held positive' }; globalThis.__raveldexMutationPositive = held;
  controls = { held: new WeakRef(held), released: new WeakRef({ literal: 'released negative' }) };
  originalAdmit = owner.admit;
  owner.admit = function(capture, control) { return originalAdmit.call(this, () => { const request = capture(); return { ...request, *start(check) {
    return yield* request.start(phase => {
      check(phase);
      if (armed && phase === 'precommit' && !observed) {
        observed = true; captureBoundary();
        if (armed === 'cancel') globalThis.__raveldexMutationCancel();
      }
    });
  } }; }, control); };
  await attempt('commit'); await attempt('cancel');
  assert.equal(report.debugger.filter(m => m.type === 'capture').length, 2); assert.equal(report.debugger.some(m => m.type === 'failure'), false);
  const finalRoot = new WeakRef(owner.root);
  owner.admit = originalAdmit; originalAdmit = undefined;
  await engine.dispose(); assert.equal(owner.root, undefined); engine = owner = undefined;
  await settle('disposed'); assert.equal(finalRoot.deref(), undefined);
  report.cleanup = { finalRootCollected: true, observerWorkersExited: worker === undefined, markersDeleted: !Object.hasOwn(globalThis, '__raveldexMutationMarkers') };
  report.outcome = 'Observed';
} catch (error) { report.outcome = 'Fail'; report.failure = { name: error.name, message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  delete globalThis.__raveldexMutationMarkers; delete globalThis.__raveldexMutationCancel; delete globalThis.__raveldexMutationPositive;
  if (worker) await worker.terminate(); await engine?.dispose();
  report.finishedAt = new Date().toISOString(); await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ mode, size, outcome: report.outcome }));
