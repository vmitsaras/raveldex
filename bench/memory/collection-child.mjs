// Fresh installed-consumer process. Never parses its own heap or dereferences
// inspector handles; only explicit holders, WeakRefs and numeric/path records.
import assert from 'node:assert/strict';
import { writeHeapSnapshot } from 'node:v8';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { getExecutionOwner } from '../node_modules/@vmitsaras/raveldex/dist/core/execution/engine.js';
import { recordsFor, schema } from './collection-fixture.mjs';

const [rawSize, branch, directory, output] = process.argv.slice(2), size = Number(rawSize);
assert.ok([1000, 10000].includes(size) && ['noop', 'side', 'reverse', 'fields', 'joint'].includes(branch));
assert.equal(typeof global.gc, 'function');
const report = { kind: 'rx4002-observer-held-component-release-v1', size, branch, pid: process.pid, node: process.version, versions: process.versions, snapshots: [], stages: [], outcome: 'Running' };
const roleNames = ['reverseDocuments', 'dictionaryPostingsStatistics', 'sourceOrPositions'];
let witnesses;
function installControls() {
  const positive = { purpose: 'positive literal', payload: Array.from({ length: 32 }, (_, i) => ({ value: i + 1 })) };
  const negative = { purpose: 'released literal', payload: Array.from({ length: 33 }, (_, i) => ({ value: i + 1 })) };
  const shared = { purpose: 'shared literal with outside alias', payload: ['outside alias survives'] };
  globalThis.__raveldexCollectionHolders.controls = { positive, negative, sharedLeft: shared, sharedRight: shared };
  globalThis.__raveldexCollectionExternal = shared;
  return { positive: new WeakRef(positive), negative: new WeakRef(negative), shared: new WeakRef(shared) };
}
async function buildAndDispose() {
  let addons = [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })];
  let engine = createRaveldex({ schema, addons }), records = recordsFor(size), owner;
  try {
  report.corpusSha256 = createHash('sha256').update(JSON.stringify(records)).digest('hex');
  for (let start = 0; start < size; start += 256) await engine.addMany(records.slice(start, start + 256), { deadlineMs: 60000 });
  records = undefined;
  const expectedRevision = Math.ceil(size / 256);
  for (const [query, total, eligible] of [[{ kind: 'all' }, size, () => true], ['value7', Math.floor((size - 8) / 37) + 1, index => index % 37 === 7],
    [{ kind: 'extension', capability: 'phrases', version: 1, payload: { text: 'red blue', fields: ['body'] } }, Math.ceil(size / 3), index => index % 3 === 0]]) {
    const result = await engine.search(query, { limit: 20, deadlineMs: 60000 });
    assert.equal(result.total, total); assert.equal(result.revision, expectedRevision); assert.equal(result.completeness, 'complete');
    assert.equal(result.hits.length, Math.min(20, total)); assert.ok(result.hits.every(hit => Number.isFinite(hit.score)));
    assert.equal(new Set(result.hits.map(hit => hit.id)).size, result.hits.length);
    for (const hit of result.hits) { assert.match(hit.id, /^item:[0-9]{5}$/); const index = Number(hit.id.slice(5)); assert.ok(index < size && eligible(index), 'Ineligible returned ID'); }
    report.verification ??= []; report.verification.push({ total: result.total, revision: result.revision, returned: result.hits.length, literalHitEligibility: true });
  }
  owner = getExecutionOwner(engine);
  const refs = { owner: new WeakRef(owner), engine: new WeakRef(engine), root: new WeakRef(owner.root) };
  globalThis.__raveldexCollectionHolders = { data: { reverseDocuments: owner.root.documents, dictionaryPostingsStatistics: owner.root.fields, sourceOrPositions: owner.root.participants } };
  for (const name of roleNames) refs[name] = new WeakRef(globalThis.__raveldexCollectionHolders.data[name]);
  await engine.dispose(); assert.equal(owner.root, undefined);
  engine = owner = addons = undefined;
  return refs;
  } finally { await engine?.dispose(); engine = owner = addons = records = undefined; }
}
async function settle(label) {
  for (let cycle = 0; cycle < 3; cycle++) {
    await new Promise(yes => setImmediate(yes)); global.gc(); await new Promise(yes => setTimeout(yes, 25));
    report.stages.push({ label, cycle, bytes: process.memoryUsage() });
  }
}
function reading(refs) { return Object.fromEntries(Object.entries(refs).map(([name, ref]) => [name, ref.deref() === undefined])); }
function snapshot(label, controls) {
  const collected = reading(witnesses), controlCollected = reading(controls);
  const path = join(directory, `${size}-${branch}-${label}.heapsnapshot`); writeHeapSnapshot(path);
  report.snapshots.push({ label, path, collected, controlCollected });
}
try {
  witnesses = await buildAndDispose(); const controls = installControls();
  await settle('observer-held-after-public-dispose'); snapshot('baseline', controls);
  await settle('no-holder-change'); snapshot('noop', controls);
  const data = globalThis.__raveldexCollectionHolders.data;
  const releasedRoles = branch === 'joint' ? roleNames : branch === 'side' ? [roleNames[2]] : branch === 'reverse' ? [roleNames[0]] : branch === 'fields' ? [roleNames[1]] : [];
  for (const name of releasedRoles) delete data[name];
  delete globalThis.__raveldexCollectionHolders.controls.negative;
  delete globalThis.__raveldexCollectionHolders.controls.sharedLeft;
  delete globalThis.__raveldexCollectionHolders.controls.sharedRight;
  await settle('selected-holder-release'); snapshot('final', controls);
  report.releasedRoles = releasedRoles;
  report.baselineOwnersCollected = ['owner', 'engine', 'root'].every(name => report.snapshots[0].collected[name]);
  report.releasedRootsCollected = releasedRoles.every(name => report.snapshots[2].collected[name]);
  const controlReading = report.snapshots[2].controlCollected;
  assert.deepEqual(controlReading, { positive: false, negative: true, shared: false }, 'Literal collector controls must distinguish released and externally held targets');
  report.outcome = report.baselineOwnersCollected && report.releasedRootsCollected ? 'Observed' : 'UncollectedWitness';
} catch (error) { report.outcome = 'Fail'; report.failure = { name: error.name, code: error.code ?? null, message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  delete globalThis.__raveldexCollectionHolders; delete globalThis.__raveldexCollectionExternal;
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ size, branch, outcome: report.outcome }));
