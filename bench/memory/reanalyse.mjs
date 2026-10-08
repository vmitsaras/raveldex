// Separate offline analysis revision. Never reruns or relabels measured kernels.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { analyzeHeapSnapshot } from './heap-graph.mjs';

const input = process.argv[2] ?? 'docs/evidence/RX-4002-memory.json';
const output = process.argv[3] ?? 'docs/evidence/RX-4002-memory-graphs.json';
const original = process.argv[4] ?? 'docs/evidence/RX-4002-memory-graph-first.json';
const inputBytes = await readFile(input), report = JSON.parse(inputBytes), digest = raw => createHash('sha256').update(raw).digest('hex');
const parserPath = fileURLToPath(new URL('./heap-graph.mjs', import.meta.url));
const originalParser = report.harness.find(row => row.path === 'bench/memory/heap-graph.mjs'); assert.ok(originalParser);
await writeFile(original, JSON.stringify({ kind: 'rx4002-original-restricted-graph-v1', rawSource: { path: input, sha256: digest(inputBytes) }, originalParser,
  reason: 'Original selected-edge parser omitted numeric internal backing-array content references in this actual V8 frozen-array representation. These restricted values are excluded from accepted component attribution; process/kernel samples remain unchanged.',
  graphObservations: report.graphObservations.map(row => ({ mode: row.mode, size: row.size, graphs: row.graphs })) }, null, 2) + '\n');
const graphObservations = [];
for (const row of report.graphObservations) {
  const revised = [];
  for (const graph of row.graphs) {
    const result = await analyzeHeapSnapshot(graph.path); assert.equal(result.sha256, graph.sha256, 'Same original actual heap dump required');
    revised.push({ phase: graph.phase, ...result });
  }
  graphObservations.push({ mode: row.mode, size: row.size, kernelLifetimeMaximumResidentSetSizeBytes: row.kernelLifetimeMaximumResidentSetSizeBytes, graphs: revised });
}
const analysis = { kind: 'rx4002-numeric-backing-array-analysis-v2', rawSource: { path: input, sha256: digest(inputBytes) }, firstExcludedAnalysis: original, originalParser,
  acceptedParser: { path: 'bench/memory/heap-graph.mjs', sha256: digest(await readFile(parserPath)) },
  offlineAnalyser: { path: 'bench/memory/reanalyse.mjs', sha256: digest(await readFile(new URL(import.meta.url))) },
  method: 'Same original dump hashes; repaired numeric-internal backing-array traversal. Original raw report remains byte-frozen; executed kernel/wrapper and process samples are untouched. The initial report harness parser hash is historical; acceptedParser identifies this distinct offline analysis.', graphObservations };
await writeFile(output, JSON.stringify(analysis, null, 2) + '\n');
assert.equal(digest(await readFile(input)), digest(inputBytes), 'Original measured report must remain byte-identical');
console.log(JSON.stringify({ output, firstExcludedAnalysis: original, revisedGraphs: graphObservations.reduce((sum,row)=>sum+row.graphs.length,0) }));
