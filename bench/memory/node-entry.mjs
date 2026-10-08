// Installed public operations. The private lookup is an observation-only graph
// marker/checkpoint seam; it never constructs or modifies an index root.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { writeHeapSnapshot, getHeapStatistics } from 'node:v8';
import { join } from 'node:path';
import { recordsFor, updatedRecord, schema } from './cost-common.mjs';

const [mode, rawSize, rawRepetition, pass, output, snapshotDirectory] = process.argv.slice(2);
const size = Number(rawSize), repetition = Number(rawRepetition);
assert.ok(['core-only', 'source-phrase', 'positions-offsets'].includes(mode));
assert.ok([1000, 10000].includes(size)); assert.ok(['samples', 'graphs'].includes(pass));
assert.equal(typeof global.gc, 'function', 'Run this fresh child with --expose-gc');
const { createRaveldex } = await import('@vmitsaras/raveldex');
const { getExecutionOwner } = await import('./node_modules/@vmitsaras/raveldex/dist/core/execution/engine.js');
let snapshotsModule, addons = [];
if (mode === 'source-phrase') {
  const { createSourceProvider, createSourcePhrases } = await import('@vmitsaras/raveldex/addons/phrases');
  addons = [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })];
} else if (mode === 'positions-offsets') {
  const { createPositionProvider } = await import('@vmitsaras/raveldex/addons/positions');
  const { createPositionPhrases } = await import('@vmitsaras/raveldex/addons/phrases/positions');
  addons = [createPositionProvider({ fields: ['body'], offsets: ['body'] }), createPositionPhrases({ fields: ['body'] })];
}
if (mode !== 'core-only') snapshotsModule = await import('@vmitsaras/raveldex/adapters/snapshots');
const qualification = snapshotsModule ? { profileId: 'raveldex-rx4002-memory-local-node-v1', scope: 'exact-node-runtime',
  environment: snapshotsModule.currentNodeSnapshotEnvironment(), evidence: ['docs/evaluation/RX-4002-memory-method.md', 'docs/evidence/RX-3002.md'] } : undefined;
const report = { kind: 'rx4002-node-memory-child-v1', mode, size, repetition, pass, pid: process.pid, node: process.version,
  versions: process.versions, execArgv: process.execArgv, samples: [], operations: [], snapshots: [], verifications: [] };
let engine, owner, encoded, previousRootRef, initialRootRef, corpus;
let operation = 'setup', observedPhases = new Set(), activeSampled = false, steps = 0, phaseSnapshotTaken = false;
const start = performance.now();
const sample = (phase, detail = {}) => {
  const memory = process.memoryUsage();
  report.samples.push({ sequence: report.samples.length, atMs: Math.ceil(performance.now() - start), operation, phase, ...detail,
    bytes: memory, v8: { usedHeapSize: getHeapStatistics().used_heap_size, totalPhysicalSize: getHeapStatistics().total_physical_size } });
};
async function settle(label) {
  operation = label;
  for (let cycle = 0; cycle < 3; cycle++) {
    await new Promise(resolve => setImmediate(resolve)); global.gc();
    await new Promise(resolve => setTimeout(resolve, 25)); sample('settled-after-explicit-gc', { cycle });
  }
}
function mark() {
  const root = owner.root;
  assert.ok(root);
  globalThis.__raveldexMemoryMarkers = { reverseDocuments: root.documents, dictionaryPostingsStatistics: root.fields,
    sourceOrPositions: root.participants, indexRoot: root, ...(encoded === undefined ? {} : { exportedString: encoded }) };
}
function snapshot(phase) {
  mark();
  const path = join(snapshotDirectory, `${mode}-${size}-${repetition}-${phase}.heapsnapshot`);
  sample('before-heap-snapshot', { snapshotPhase: phase });
  writeHeapSnapshot(path);
  report.snapshots.push({ phase, path, scope: 'This Node process, main V8 isolate only; synchronous intrusive dump excluded from sampled workload pass.' });
  delete globalThis.__raveldexMemoryMarkers;
  sample('after-heap-snapshot', { snapshotPhase: phase });
}
async function observe(label, call) {
  operation = label; observedPhases = new Set(); steps = 0; activeSampled = true; sample('before');
  try {
    const result = await call(); sample('after');
    report.operations.push({ operation: label, outcome: 'Pass', emittedSteps: steps }); return result;
  } catch (error) {
    sample('rejected'); report.operations.push({ operation: label, outcome: 'Rejected', emittedSteps: steps,
      error: { name: error.name, code: error.code ?? null, reason: error.reason ?? null } }); throw error;
  } finally { activeSampled = false; }
}
async function checkState(changed) {
  const all = await engine.search({ kind: 'all' }, { limit: 20, deadlineMs: 60000 });
  assert.equal(all.total, size); assert.equal(all.completeness, 'complete');
  const selective = await engine.search('value7', { limit: 20, deadlineMs: 60000 });
  const expected = Math.floor((size - 1 - 7) / 37) + 1 + (changed ? 1 : 0);
  assert.equal(selective.total, expected); assert.equal(selective.completeness, 'complete');
  for (const hit of selective.hits) {
    const index = Number(hit.id.slice(5)); assert.ok(index % 37 === 7 || changed && index === 0); assert.ok(Number.isFinite(hit.score));
  }
  const check = { changed, records: all.total, revision: all.revision, selectiveTotal: selective.total, expectedSelectiveTotal: expected };
  if (mode !== 'core-only') {
    const phrase = await engine.search({ kind: 'extension', capability: 'phrases', version: 1, payload: { text: 'red blue', fields: ['body'] } }, { limit: 20, deadlineMs: 60000 });
    assert.equal(phrase.total, Math.floor((size - 1) / 3) + 1 - (changed ? 1 : 0));
    assert.equal(phrase.revision, all.revision); check.phraseTotal = phrase.total;
  }
  report.verifications.push(check);
}

try {
  await settle('matched-module-harness-baseline');
  corpus = recordsFor(size); report.corpusSha256 = createHash('sha256').update(JSON.stringify(corpus)).digest('hex');
  await settle('application-corpus-held');
  engine = mode === 'core-only' ? createRaveldex({ schema, addons }) : snapshotsModule.createSnapshotRaveldex({ schema, addons }, { nativeQualification: qualification });
  owner = getExecutionOwner(engine); assert.ok(owner); initialRootRef = new WeakRef(owner.root);
  // Instrument the actual installed execution generator without changing its
  // work, phase order, roots, yield quantum, limits, timer policy or results.
  const originalAdmit = owner.admit;
  owner.admit = function(capture, control) {
    return originalAdmit.call(this, () => {
      const request = capture();
      return { ...request, *start(check) {
        const observedCheck = phase => {
          check(phase);
          if (activeSampled && phase !== undefined && !observedPhases.has(phase)) { observedPhases.add(phase); sample('checkpoint', { nativePhase: phase }); }
          if (pass === 'graphs' && operation === 'replace-one-record' && phase === 'precommit' && !phaseSnapshotTaken) {
            phaseSnapshotTaken = true; snapshot('mutation-precommit');
          }
        };
        const cursor = request.start(observedCheck);
        try {
          for (;;) {
            const step = cursor.next(); if (step.done) return step.value;
            if (activeSampled) { steps++; if (steps % 8192 === 0) sample('generator-boundary', { emittedSteps: steps }); }
            yield step.value;
          }
        } finally { cursor.return(undefined); }
      } };
    }, control);
  };
  await settle('empty-owner-with-application-corpus');
  await observe('build-admitted-batches', async () => {
    for (let offset = 0; offset < corpus.length; offset += 256) await engine.addMany(corpus.slice(offset, offset + 256), { deadlineMs: 60000 });
  });
  corpus = undefined; await checkState(false); await settle('built-inputs-released');
  assert.equal(initialRootRef.deref(), undefined, 'revision-zero root must be collectible'); initialRootRef = undefined;
  if (pass === 'graphs') snapshot('built');
  previousRootRef = new WeakRef(owner.root);
  const replacement = await observe('replace-one-record', () => engine.replace(updatedRecord, { deadlineMs: 60000 }));
  assert.equal(replacement.changed, true); await checkState(true); await settle('replacement-cleanup');
  assert.equal(previousRootRef.deref(), undefined, 'old mutation root must be collectible after commit'); previousRootRef = undefined;
  if (snapshotsModule) {
    encoded = await observe('export-native', () => snapshotsModule.createSnapshots(engine).exportNative({ deadlineMs: 60000 }));
    report.encodedDiagnostic = { utf8Bytes: Buffer.byteLength(encoded, 'utf8'), codeUnits: encoded.length, meaning: 'Encoding length only; never heap or transport allocation.' };
    await settle('native-string-held');
    if (pass === 'graphs') snapshot('serialization-string-held');
    encoded = undefined; await settle('native-string-released');
  } else report.operations.push({ operation: 'export-native', outcome: 'Not Applicable', reason: 'Core-only configuration imports no snapshot adapter.' });
  owner.admit = originalAdmit;
  await engine.dispose(); assert.equal(owner.root, undefined); engine = undefined; owner = undefined; addons = undefined;
  await settle('disposed-handles-inputs-released');
  report.cleanup = { disposedOwnerRootReleased: true, initialRootCollected: true, priorMutationRootCollected: true,
    allHarnessGraphMarkersDeleted: !Object.hasOwn(globalThis, '__raveldexMemoryMarkers'), activeResources: process.getActiveResourcesInfo() };
  report.outcome = 'Pass';
} catch (error) {
  report.outcome = 'Fail'; report.failure = { name: error.name, code: error.code ?? null, reason: error.reason ?? null, message: error.message };
  throw error;
} finally {
  delete globalThis.__raveldexMemoryMarkers;
  if (engine) await engine.dispose();
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ mode, size, repetition, pass, outcome: 'Pass', samples: report.samples.length, snapshots: report.snapshots.length }));
