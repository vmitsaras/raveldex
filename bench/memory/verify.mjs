// Reproducible forensic checks for this accepted observation set; no workloads.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const path = 'docs/evidence/RX-4002-memory.json', rawBytes = await readFile(path), raw = JSON.parse(rawBytes);
const graphsPath = 'docs/evidence/RX-4002-memory-graphs.json', graphBytes = await readFile(graphsPath), graphs = JSON.parse(graphBytes);
const summary = JSON.parse(await readFile('docs/evidence/RX-4002-memory-summary.json'));
const first = JSON.parse(await readFile('docs/evidence/RX-4002-memory-graph-first.json'));
assert.equal(digest(rawBytes), graphs.rawSource.sha256); assert.equal(digest(rawBytes), first.rawSource.sha256); assert.equal(digest(rawBytes), summary.raw.sha256);
assert.equal(raw.observations.length, 18); assert.equal(raw.graphObservations.length, 6);
assert.ok(raw.observations.every(row => row.outcome === 'Pass' && row.childExitCode === 0 && row.cleanup.disposedOwnerRootReleased &&
  row.cleanup.priorMutationRootCollected && row.cleanup.initialRootCollected && row.cleanup.allHarnessGraphMarkersDeleted && row.kernelObservation.outcome === 'Pass'));
let runtimeFiles = 0;
for (const row of raw.productionFiles) {
  assert.equal(digest(await readFile(join(raw.consumer, 'node_modules/@vmitsaras/raveldex', row.path))), row.sha256);
  assert.equal(digest(await readFile(row.path)), row.sha256); runtimeFiles++;
}
for (const row of raw.harness.filter(row => row.path !== 'bench/memory/heap-graph.mjs')) assert.equal(digest(await readFile(row.path)), row.sha256);
assert.equal(digest(await readFile(join(raw.consumer, 'memory-node-entry.mjs'))), raw.harness.find(row => row.path === 'bench/memory/node-entry.mjs').sha256);
assert.equal(digest(await readFile(graphs.acceptedParser.path)), graphs.acceptedParser.sha256);
assert.equal(digest(await readFile(graphs.offlineAnalyser.path)), graphs.offlineAnalyser.sha256);
assert.equal(digest(await readFile(summary.calculationSource.path)), summary.calculationSource.sha256);
assert.equal(digest(graphBytes), summary.graphAnalysisRevision.sha256);
assert.equal(graphs.originalParser.sha256, raw.harness.find(row => row.path === 'bench/memory/heap-graph.mjs').sha256);
let snapshots = 0;
for (const row of graphs.graphObservations) for (const graph of row.graphs) {
  const initial = raw.graphObservations.find(original => original.mode === row.mode && original.size === row.size).graphs.find(original => original.phase === graph.phase);
  assert.equal(graph.sha256, initial.sha256); snapshots++;
}
assert.equal(snapshots, 16);
const result = { outcome: 'Pass', frozenPrimarySha256: digest(rawBytes), primaryProcesses: 18, graphProcesses: 6,
  snapshotHashMatches: snapshots, runtimeFilesVerifiedAgainstInstalledAndCurrentWorkspace: runtimeFiles,
  executedKernelAndWrapperUnchanged: true, acceptedParserAndOfflineAnalyserAndSummarySourceMatch: true, summaryGraphIdentityMatches: true,
  verifierSource: { path: 'bench/memory/verify.mjs', sha256: digest(await readFile(new URL(import.meta.url))) } };
await writeFile('docs/evidence/RX-4002-memory-integrity.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
