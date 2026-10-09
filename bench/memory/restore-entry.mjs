// Public restore, in-process inspector sampling, read-only private WeakRef seam.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { Session } from 'node:inspector/promises';
import { fileURLToPath } from 'node:url';
import { RESTORE_METHOD, sourceRuntime, witnessRoot, witnessReading, collectorControl, summarizeAllocationProfile, observedMaximum, classifyRestoreError } from './restore-common.mjs';
import { schema } from './restore-fixture.mjs';

const [rawSize, rawRepetition, encodedPath, expectedHash, rawOriginRevision, reportPath] = process.argv.slice(2);
const size = Number(rawSize), repetition = Number(rawRepetition), originRevision = Number(rawOriginRevision);
assert.ok(RESTORE_METHOD.sizes.includes(size) && Number.isInteger(repetition) && repetition >= 0 && repetition < RESTORE_METHOD.repetitions);
assert.equal(typeof global.gc, 'function', 'Fresh receiving child requires --expose-gc');
const report = { kind: RESTORE_METHOD.version, size, repetition, pid: process.pid, node: process.version, versions: process.versions, argv: [...process.argv],
  samples: [], witnessStages: [], outcome: 'Not Run', limitations: [] };
const session = new Session(), control = collectorControl(), start = performance.now();
let engine, owner, encoded, operation = 'setup', interval, sampling = false, connected = false;
let initialWitnesses = [], priorWitnesses = [], restoredWitnesses = [];
const sample = label => report.samples.push({ sequence: report.samples.length, atMs: performance.now() - start, operation, label, bytes: process.memoryUsage() });
async function settle(label) {
  operation = label;
  for (let cycle = 0; cycle < RESTORE_METHOD.gcCycles; cycle++) {
    await new Promise(resolve => setImmediate(resolve)); global.gc();
    await new Promise(resolve => setTimeout(resolve, RESTORE_METHOD.settleMs)); sample(`settled-gc-${cycle}`);
  }
}
function witnesses(stage) {
  const positiveStrongControlHeld = control.isHeld(); assert.ok(positiveStrongControlHeld, 'Known strong control must survive GC');
  report.witnessStages.push({ stage, positiveStrongControlHeld, readings: witnessReading([...initialWitnesses, ...priorWitnesses, ...restoredWitnesses]) });
}
try {
  session.connect(); connected = true;
  const runtime = await sourceRuntime(schema); engine = runtime.engine; report.qualification = runtime.qualification;
  const { getExecutionOwner } = await import(new URL('../node_modules/@vmitsaras/raveldex/dist/core/execution/engine.js', import.meta.url));
  owner = getExecutionOwner(engine); assert.ok(owner);
  initialWitnesses = witnessRoot(owner.root, 'initial-revision-zero');
  await settle('empty-receiver-imported-harness-baseline');
  const info = await stat(encodedPath); assert.ok(info.isFile() && info.size <= 64 * 1024 * 1024, 'Bounded prepared native input required');
  encoded = await readFile(encodedPath, 'utf8'); assert.equal(createHash('sha256').update(encoded, 'utf8').digest('hex'), expectedHash, 'Prepared bytes unchanged');
  report.encodedInput = { sha256: expectedHash, utf8Bytes: info.size, codeUnits: encoded.length, meaning: 'Input file/string length, never heap attribution.' };
  await settle('encoded-input-held-empty-receiver');
  await engine.add({ id: 'prior', text: { body: 'prior state' } }, { deadlineMs: RESTORE_METHOD.deadlineMs });
  const before = await engine.search({ kind: 'all' }, { limit: 20, deadlineMs: RESTORE_METHOD.deadlineMs });
  assert.equal(before.total, 1); assert.equal(before.revision, 1); priorWitnesses = witnessRoot(owner.root, 'preexisting-receiver');
  await settle('encoded-input-and-prior-receiver-held'); witnesses('before-restore');
  const requestedParameters = { samplingInterval: RESTORE_METHOD.samplingIntervalBytes, stackDepth: RESTORE_METHOD.stackDepth,
    includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true };
  report.allocationSampling = { outcome: 'Not Run', requestedParameters, intervalMeaning: 'Poisson average sampling interval, not complete allocation tracking.', scope: 'This receiving Node main isolate only; observer/runtime allocations during the operation are included.' };
  try { await session.post('HeapProfiler.startSampling', requestedParameters); sampling = true; }
  catch (error) { report.allocationSampling = { ...report.allocationSampling, outcome: 'Unavailable', error: { name: error.name, code: error.code ?? null, message: error.message } }; }
  operation = 'public-native-restore'; sample('before-public-call');
  interval = setInterval(() => sample('event-loop-poll'), RESTORE_METHOD.pollIntervalMs);
  let restored;
  try { restored = await runtime.snapshots.restore(encoded, { deadlineMs: RESTORE_METHOD.deadlineMs }); report.restoreOperation = { outcome: 'Pass', result: restored }; }
  catch (error) {
    report.restoreOperation = { outcome: classifyRestoreError(error),
      error: { name: error.name, code: error.code ?? null, reason: error.reason ?? null, message: error.message } };
  } finally {
    clearInterval(interval); interval = undefined; sample('after-public-call');
    if (sampling) {
      const { profile } = await session.post('HeapProfiler.stopSampling'); sampling = false;
      report.allocationSampling = { ...report.allocationSampling, outcome: 'Observed', rawProfile: profile,
        summary: summarizeAllocationProfile(profile, new URL('../node_modules/@vmitsaras/raveldex/', import.meta.url).href, new URL('./', import.meta.url).href) };
    }
  }
  session.disconnect(); connected = false; report.observedOperationMaxima = observedMaximum(report.samples, 'public-native-restore');
  // Semantic assertions are outside the stopped allocation-profile interval.
  if (restored) {
    assert.deepEqual([restored.format, restored.reindexed, restored.originRevision, restored.revision], ['raveldex-native', false, originRevision, 2]);
    restoredWitnesses = witnessRoot(owner.root, 'restored-receiver');
    const all = await engine.search({ kind: 'all' }, { limit: 20, deadlineMs: RESTORE_METHOD.deadlineMs });
    const selected = await engine.search('value7', { limit: 20, deadlineMs: RESTORE_METHOD.deadlineMs });
    const phrase = await engine.search({ kind: 'extension', capability: 'phrases', version: 1, payload: { text: 'red blue', fields: ['body'] } }, { limit: 20, deadlineMs: RESTORE_METHOD.deadlineMs });
    const old = await engine.search('prior', { limit: 20, deadlineMs: RESTORE_METHOD.deadlineMs });
    assert.deepEqual([all.total, selected.total, phrase.total, old.total], [size, Math.floor((size - 1 - 7) / 37) + 1, Math.floor((size - 1) / 3) + 1, 0]);
    for (const result of [all, selected, phrase, old]) { assert.equal(result.revision, 2); assert.equal(result.completeness, 'complete'); }
    for (const hit of selected.hits) { assert.equal(Number(hit.id.slice(5)) % 37, 7); assert.ok(Number.isFinite(hit.score)); }
    report.semanticVerification = { outcome: 'Pass', receivingRevision: all.revision, allTotal: all.total, selectedTotal: selected.total, phraseTotal: phrase.total, replacedPriorTotal: old.total };
  } else {
    assert.deepEqual(await engine.search({ kind: 'all' }, { limit: 20, deadlineMs: RESTORE_METHOD.deadlineMs }), before);
    assert.equal(priorWitnesses[0].reference.deref(), owner.root); report.semanticVerification = { outcome: 'Pass', rejectedRestorePreservedPriorRootAndResult: true };
  }
  await settle('restore-completed-encoded-input-held'); witnesses('after-restore-input-held');
  encoded = undefined; await settle('encoded-input-released'); witnesses('after-input-release');
  await engine.dispose(); assert.equal(owner.root, undefined); engine = undefined; owner = undefined;
  await settle('receiver-disposed'); witnesses('after-public-dispose-and-gc');
  const finalReadings = report.witnessStages.at(-1).readings;
  report.collectionObservation = { outcome: finalReadings.every(row => row.collected) ? 'Observed' : 'NotObserved',
    meaning: 'Actual listed object witnesses after public disposal and documented GC/settling, not proof every descendant/string or every future workload is collectible.', readings: finalReadings };
  control.release(); await settle('positive-control-released');
  report.positiveControl = { heldSurvived: true, releasedCollected: control.weak.deref() === undefined };
  report.outcome = report.restoreOperation.outcome;
  if (report.outcome === 'Pass' && (report.allocationSampling.outcome !== 'Observed' || report.collectionObservation.outcome !== 'Observed' || !report.positiveControl.releasedCollected)) report.outcome = 'ObservedWithLimitations';
} catch (error) {
  report.outcome = 'Fail'; report.failure = { name: error.name, code: error.code ?? null, message: error.message }; process.exitCode = 1;
} finally {
  if (interval !== undefined) clearInterval(interval);
  if (sampling) { try { await session.post('HeapProfiler.stopSampling'); } catch {} }
  if (connected) session.disconnect();
  if (engine) { try { await engine.dispose(); } catch (error) { report.finalDisposalError = { name: error.name, code: error.code ?? null }; } }
  encoded = undefined;
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ stage: 'receiving-restore', size, repetition, outcome: report.outcome, sampling: report.allocationSampling?.outcome,
  collection: report.collectionObservation?.outcome, operationReadings: report.observedOperationMaxima?.readings, script: fileURLToPath(import.meta.url) }));
