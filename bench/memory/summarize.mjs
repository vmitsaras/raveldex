import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const input = process.argv[2] ?? 'docs/evidence/RX-4002-memory.json';
const output = process.argv[3] ?? 'docs/evidence/RX-4002-memory-summary.json';
const graphsInput = process.argv[4] ?? 'docs/evidence/RX-4002-memory-graphs.json';
const raw = await readFile(input), report = JSON.parse(raw);
const graphBytes = await readFile(graphsInput), acceptedGraphs = JSON.parse(graphBytes);
assert.equal(acceptedGraphs.rawSource.sha256, createHash('sha256').update(raw).digest('hex'), 'Corrected graphs must identify the same byte-frozen measured report');
const median = values => {
  assert.ok(values.every(value => Number.isSafeInteger(value) && value >= 0));
  const sorted = [...values].sort((a,b) => a-b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
function summary(values) { return { samples: values, minimumBytes: Math.min(...values), medianBytes: median(values), maximumBytes: Math.max(...values) }; }
const groups = [];
for (const mode of report.method.selectedModes) for (const size of report.method.selectedSizes) {
  const rows = report.observations.filter(row => row.mode === mode && row.size === size);
  assert.equal(rows.length, report.method.repetitions);
  const stages = [...new Set(rows.flatMap(row => row.samples.filter(sample => sample.phase === 'settled-after-explicit-gc').map(sample => sample.operation)))];
  const steady = stages.map(stage => {
    const reads = rows.map(row => row.samples.filter(sample => sample.operation === stage && sample.phase === 'settled-after-explicit-gc').at(-1));
    assert.ok(reads.every(Boolean));
    return { stage, reading: 'Last of three explicit-GC/settling cycles per fresh process; all three cycles remain in raw report.',
      heapUsed: summary(reads.map(sample => sample.bytes.heapUsed)), rss: summary(reads.map(sample => sample.bytes.rss)) };
  });
  const operations = [...new Set(rows.flatMap(row => row.operations.filter(operation => operation.outcome === 'Pass').map(operation => operation.operation)))];
  const observedOperationMaxima = operations.map(operation => ({ operation,
    outcome: 'Observed sample maximum only; not true component/operation allocation peak.',
    heapUsed: summary(rows.map(row => Math.max(...row.samples.filter(sample => sample.operation === operation).map(sample => sample.bytes.heapUsed)))),
    rss: summary(rows.map(row => Math.max(...row.samples.filter(sample => sample.operation === operation).map(sample => sample.bytes.rss)))) }));
  assert.ok(rows.every(row => row.kernelLifetimeMaximumResidentSetSizeBytes !== null));
  groups.push({ mode, size, repetitions: rows.length, steady, observedOperationMaxima,
    kernelLifetimeMaximumRSS: summary(rows.map(row => row.kernelLifetimeMaximumResidentSetSizeBytes)),
    cleanupChecksPassed: rows.filter(row => row.cleanup?.disposedOwnerRootReleased && row.cleanup?.priorMutationRootCollected && row.cleanup?.allHarnessGraphMarkersDeleted).length,
    actualStateVerifications: rows.flatMap(row => row.verifications), operationOutcomes: rows.map(row => row.operations) });
}
const result = { kind: 'rx4002-memory-derived-summary-v1', raw: { path: input, sha256: createHash('sha256').update(raw).digest('hex') },
  calculationSource: { path: 'bench/memory/summarize.mjs', sha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex') },
  graphAnalysisRevision: { path: graphsInput, sha256: createHash('sha256').update(graphBytes).digest('hex'), acceptedParser: acceptedGraphs.acceptedParser, originalParser: acceptedGraphs.originalParser },
  summaryMethod: 'Whole bytes. Median/minimum/maximum across three independent fresh-process last-cycle readings or each process observed maxima. No subtraction, component assignment, percentile or timing claim.',
  groups, graphObservations: acceptedGraphs.graphObservations.map(row => ({ mode: row.mode, size: row.size,
    kernelLifetimeMaximumResidentSetSizeBytes: row.kernelLifetimeMaximumResidentSetSizeBytes,
    note: 'Separate intrusive graph-process maximum includes V8 snapshot machinery. One graph process per configuration/size, not repeated component retained-size qualification.',
    graphs: row.graphs.map(graph => ({ phase: graph.phase, snapshotSha256: graph.sha256, components: graph.components,
      unionSelectedDataSelfSizeBytes: graph.unionSelectedDataSelfSizeBytes, sharedSelectedDataSelfSizeBytes: graph.sharedSelectedDataSelfSizeBytes,
      indexRootShapeCandidates: graph.indexRootShapeCandidates })) })) };
await writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, groups: groups.length, graphProcesses: result.graphObservations.length }));
