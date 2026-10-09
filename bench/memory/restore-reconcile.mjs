// Offline audit only. Never starts a receiving/producer/runtime workload.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertUnprotectedOutput } from './retainer-output.mjs';

const input = resolve(process.argv[2] ?? 'docs/evidence/RX-4002-memory-restore.json');
const output = resolve(process.argv[3] ?? 'docs/evidence/RX-4002-memory-restore-reconciliation.json');
const evidence = await realpath('docs/evidence'), sourceDirectory = dirname(fileURLToPath(import.meta.url));
assert.equal(await realpath(dirname(output)), evidence); assert.match(basename(output), /^RX-4002-memory-restore.*\.json$/);
const protectedPaths = [...(await readdir(evidence)).map(name => join(evidence, name)), ...(await readdir(sourceDirectory)).filter(name => name.endsWith('.mjs')).map(name => join(sourceDirectory, name))];
const protection = await assertUnprotectedOutput(output, protectedPaths); assert.equal(dirname(protection.canonicalOutput), evidence);
const digest = bytes => createHash('sha256').update(bytes).digest('hex'), raw = await readFile(input), report = JSON.parse(raw);
assert.equal(report.outcome, 'Fail'); assert.equal(report.failure?.name, 'AssertionError');
const capture = input.replace(/\.json$/, '.log'), emptyDigest = digest('');
assert.ok(report.failure.message.startsWith(`Earlier evidence changed: ${capture}\n`), 'Only the known live-capture evaluation failure is reconcilable');
const preservationChecks = [];
for (const original of report.preservedExistingMemoryEvidence) {
  const actualSha256 = digest(await readFile(original.path)), isOwnedCapture = original.path === capture;
  if (isOwnedCapture) assert.equal(original.sha256, emptyDigest, 'Capture was empty at invocation inventory');
  else assert.equal(actualSha256, original.sha256, `True prior evidence changed: ${original.path}`);
  preservationChecks.push({ path: original.path, originalSha256: original.sha256, actualSha256, outcome: isOwnedCapture ? 'Expected live capture growth' : 'Pass' });
}
assert.equal(preservationChecks.filter(row => row.outcome !== 'Pass').length, 1);
const archivedRunner = join(evidence, 'RX-4002-memory-restore-executed-run.mjs'), sourceChecks = [];
for (const binding of report.sourceBindings) {
  const executedPath = binding.path === 'bench/memory/restore-run.mjs' ? archivedRunner : binding.path;
  assert.equal(digest(await readFile(executedPath)), binding.sha256, `Executed source differs: ${executedPath}`);
  if (binding.staged) assert.equal(digest(await readFile(binding.staged)), binding.sha256, `Staged source differs: ${binding.staged}`);
  sourceChecks.push({ ...binding, executedPath, outcome: 'Pass', currentWorkingSourceSha256: digest(await readFile(binding.path)) });
}
const productionChecks = [], packageDirectory = join(report.invocation.consumer, 'node_modules/@vmitsaras/raveldex');
assert.equal(digest(await readFile(join(packageDirectory, 'package.json'))), report.packageMetadataSha256);
for (const binding of report.productionFiles) {
  assert.equal(digest(await readFile(join(packageDirectory, binding.path))), binding.sha256, `Installed production differs: ${binding.path}`);
  assert.equal(digest(await readFile(binding.path)), binding.sha256, `Workspace production differs: ${binding.path}`);
  productionChecks.push({ ...binding, installedAndWorkspaceOutcome: 'Pass' });
}
assert.equal(productionChecks.length, 208);
const keys = ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'], pids = new Set(), childChecks = [], rows = [];
async function verifyChild(row) {
  assert.ok(Number.isSafeInteger(row.pid) && row.pid > 0 && !pids.has(row.pid)); pids.add(row.pid);
  assert.equal(row.pid, row.childPid); assert.equal(row.childExitCode, 0); assert.equal(row.childSignal, null); assert.equal(row.childTimedOut, false);
  assert.equal(row.childWallLimitMs, 180000); assert.ok(row.childWallMs < row.childWallLimitMs); assert.equal(row.outcome, 'Pass');
  const childBytes = await readFile(row.childReport.path); assert.equal(digest(childBytes), row.childReport.sha256);
  const parsed = JSON.parse(childBytes); for (const key of Object.keys(parsed)) assert.deepEqual(row[key], parsed[key], `Child field differs: ${key}`);
  childChecks.push({ size: row.size, repetition: row.repetition ?? null, pid: row.pid, path: row.childReport.path, sha256: row.childReport.sha256, outcome: 'Pass' });
}
assert.equal(report.preparations.length, 2); assert.equal(report.observations.length, 6);
for (const preparation of report.preparations) {
  await verifyChild(preparation); const encodedPath = preparation.argv.at(-2), encoded = await readFile(encodedPath);
  assert.equal(digest(encoded), preparation.encodedFileSha256); assert.equal(encoded.length, preparation.encodedUtf8Bytes);
}
for (const size of [1000, 10000]) for (let repetition = 0; repetition < 3; repetition++) {
  const matches = report.observations.filter(row => row.size === size && row.repetition === repetition); assert.equal(matches.length, 1);
  const row = matches[0], preparation = report.preparations.find(item => item.size === size); await verifyChild(row);
  assert.equal(row.encodedInput.sha256, preparation.encodedFileSha256); assert.equal(row.encodedInput.utf8Bytes, preparation.encodedUtf8Bytes);
  assert.deepEqual([row.restoreOperation.outcome, row.restoreOperation.result.format, row.restoreOperation.result.reindexed, row.restoreOperation.result.originRevision, row.restoreOperation.result.revision], ['Pass', 'raveldex-native', false, preparation.originRevision, 2]);
  assert.deepEqual(row.semanticVerification, { outcome: 'Pass', receivingRevision: 2, allTotal: size, selectedTotal: Math.floor((size - 8) / 37) + 1, phraseTotal: Math.floor((size - 1) / 3) + 1, replacedPriorTotal: 0 });
  assert.deepEqual(row.positiveControl, { heldSurvived: true, releasedCollected: true }); assert.equal(row.collectionObservation.outcome, 'Observed');
  const expectedWitnesses = ['initial-revision-zero', 'preexisting-receiver', 'restored-receiver'].flatMap(label => ['root', 'documents', 'fields', 'participants'].map(component => ({ label, component, collected: true })));
  assert.deepEqual(row.collectionObservation.readings, expectedWitnesses); assert.ok(row.witnessStages.every(stage => stage.positiveStrongControlHeld));
  for (let at = 0; at < row.samples.length; at++) { const sample = row.samples[at]; assert.equal(sample.sequence, at); assert.ok(Number.isFinite(sample.atMs) && sample.atMs >= (row.samples[at - 1]?.atMs ?? 0)); for (const key of keys) assert.ok(Number.isSafeInteger(sample.bytes[key]) && sample.bytes[key] >= 0); }
  const measured = row.samples.filter(sample => sample.operation === 'public-native-restore');
  assert.equal(measured.at(0).label, 'before-public-call'); assert.equal(measured.at(-1).label, 'after-public-call');
  const maximaBytes = Object.fromEntries(keys.map(key => [key, measured.reduce((maximum, sample) => Math.max(maximum, sample.bytes[key]), 0)]));
  assert.deepEqual(row.observedOperationMaxima.maximaBytes, maximaBytes); assert.equal(row.observedOperationMaxima.readings, measured.length);
  assert.equal(row.allocationSampling.outcome, 'Observed'); const profile = row.allocationSampling.rawProfile, nodes = new Map(), stack = [profile.head], frameGroups = {};
  let reportedNodeSelfSizeSumBytes = 0, reportedSampleSizeSumBytes = 0;
  const productionPrefix = pathToFileURL(packageDirectory + '/').href, observerPrefix = new URL('./', pathToFileURL(row.argv[1])).href;
  while (stack.length) {
    const node = stack.pop(); assert.ok(Number.isSafeInteger(node.id) && !nodes.has(node.id)); nodes.set(node.id, node);
    assert.ok(Number.isSafeInteger(node.selfSize) && node.selfSize >= 0); reportedNodeSelfSizeSumBytes += node.selfSize;
    const url = node.callFrame.url, label = url.startsWith(productionPrefix) ? 'installed-production-frame' : url.startsWith(observerPrefix) ? 'observer-frame' : 'runtime-or-unattributed-frame';
    const group = frameGroups[label] ??= { nodes: 0, reportedNodeSelfSizeSumBytes: 0 }; group.nodes++; group.reportedNodeSelfSizeSumBytes += node.selfSize;
    stack.push(...(node.children ?? []));
  }
  const ordinals = new Set(); for (const sample of profile.samples) { assert.ok(nodes.has(sample.nodeId) && Number.isSafeInteger(sample.size) && sample.size >= 0 && Number.isSafeInteger(sample.ordinal) && !ordinals.has(sample.ordinal)); ordinals.add(sample.ordinal); reportedSampleSizeSumBytes += sample.size; }
  const summary = row.allocationSampling.summary;
  assert.deepEqual([summary.nodes, summary.samples, summary.reportedNodeSelfSizeSumBytes, summary.reportedSampleSizeSumBytes], [nodes.size, profile.samples.length, reportedNodeSelfSizeSumBytes, reportedSampleSizeSumBytes]); assert.deepEqual(summary.frameGroups, frameGroups);
  rows.push({ size, repetition, pid: row.pid, outcome: 'Pass', samples: measured.length, observedOperationMaximaBytes: maximaBytes,
    statisticalProfile: { nodes: nodes.size, samples: profile.samples.length, reportedNodeSelfSizeSumBytes, reportedSampleSizeSumBytes, frameGroups },
    semanticVerification: row.semanticVerification, collectionWitnesses: expectedWitnesses.length, survivingWitnesses: [],
    settledStageReadings: row.samples.filter(sample => sample.label === 'settled-gc-2').map(sample => ({ stage: sample.operation, bytes: sample.bytes })) });
}
const toolingBindings = await Promise.all(['restore-run.mjs', 'restore-inventory.mjs', 'restore-inventory.test.mjs', 'restore-reconcile.mjs'].map(async name => ({ path: `bench/memory/${name}`, sha256: digest(await readFile(join(sourceDirectory, name))) })));
const audit = { kind: 'rx4002-receiving-restore-offline-reconciliation-v1', generatedAt: new Date().toISOString(), argv: [...process.argv], input, inputSha256: digest(raw), output, protection,
  outcome: 'Pass for preserved child observations and provenance; frozen wrapper remains Fail', wrapperFailure: report.failure,
  explanation: 'The executed wrapper incorrectly inventoried its own empty redirected stdout/stderr capture as earlier immutable evidence. Its expected growth caused the final Fail. No raw outcome was changed and no resource workload was rerun. The future inventory repair was tested only with scratch files.',
  preservationChecks, sourceChecks, productionChecks, childChecks, rows, toolingBindings,
  limitations: ['Statistical allocation fields and sampled full-process/isolate maxima are not exact allocation/peak/component retained bytes.', 'WeakRef collection covers only the listed object witnesses after this public disposal and forced-GC policy; no string/descendant/unforced-GC/general leak claim.', 'Native source-mode Node receivers only. Browser/worker/transport, source-reindex and full RX-4002 AC03 remain unqualified.'] };
assert.equal(digest(await readFile(input)), audit.inputSha256); await assertUnprotectedOutput(output, protectedPaths);
await writeFile(output, JSON.stringify(audit, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, inputSha256: audit.inputSha256, outcome: audit.outcome, priorArtifacts: preservationChecks.length - 1, executedSources: sourceChecks.length, productionFiles: productionChecks.length, childProcesses: pids.size, observations: rows.length }));
