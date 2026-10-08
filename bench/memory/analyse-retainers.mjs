// Separate sequential offline analysis of byte-frozen measurements; no runtime
// operations, heap collection, dependency installs or original artifact writes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRetainerCuts, RETAINER_POLICIES } from './retainer-cuts.mjs';
import { assertUnprotectedOutput } from './retainer-output.mjs';

const input = process.argv[2] ?? 'docs/evidence/RX-4002-memory.json';
const output = process.argv[3] ?? 'docs/evidence/RX-4002-memory-retainers.json';
assert.notEqual(input, output, 'Never overwrite primary observations');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const inputBytes = await readFile(input), raw = JSON.parse(inputBytes);
assert.equal(raw.graphObservations.length, 6, 'Six original graph processes expected');
const sources = ['bench/memory/retainer-cuts.mjs', 'bench/memory/retainer-cuts.test.mjs', 'bench/memory/analyse-retainers.mjs', 'bench/memory/retainer-output.mjs'];
const sourceBindings = await Promise.all(sources.map(async path => ({ path, sha256: digest(await readFile(fileURLToPath(new URL(path.slice('bench/memory/'.length), import.meta.url)))) })));
const originalPaths = (await readdir('docs/evidence')).filter(name =>
  (name.startsWith('RX-4002-memory') && !['RX-4002-memory-retainers.json', 'RX-4002-memory-retainers.log'].includes(name)) || /^RX-4002-review-probe\.(json|mjs)$/.test(name)).map(name => join('docs/evidence', name));
const originalArtifacts = await Promise.all(originalPaths.map(async path => ({ path, sha256: digest(await readFile(path)) })));
assert.ok(originalArtifacts.some(row => row.path === input), 'Original primary path must be in preserved set');
const memorySourcePaths = (await readdir('bench/memory')).filter(name => name.endsWith('.mjs')).map(name => join('bench/memory', name));
const protectedPaths = [...new Set([input, ...originalPaths, ...memorySourcePaths, ...raw.graphObservations.flatMap(row => row.graphs.map(graph => graph.path))])];
const outputProtection = await assertUnprotectedOutput(output, protectedPaths);
const graphObservations = []; let analyzed = 0;
for (const row of raw.graphObservations) {
  const graphs = [];
  for (const graph of row.graphs) {
    console.log(JSON.stringify({ stage: 'reading-one-original-dump', mode: row.mode, size: row.size, phase: graph.phase }));
    // Only this dump's byte buffer/JSON graph is held during its analysis.
    // Errors from inaccessible files and changed hashes propagate explicitly.
    const bytes = await readFile(graph.path), sha256 = digest(bytes);
    assert.equal(sha256, graph.sha256, `Original dump hash mismatch: ${graph.path}`);
    assert.equal(bytes.length, graph.fileBytes, `Original dump byte count mismatch: ${graph.path}`);
    const result = analyzeRetainerCuts(JSON.parse(bytes));
    graphs.push({ phase: graph.phase, path: graph.path, fileBytes: bytes.length, sha256, ...result }); analyzed++;
    console.log(JSON.stringify({ stage: 'analyzed', mode: row.mode, size: row.size, phase: graph.phase,
      graphNodes: result.snapshotNodeCount, graphEdges: result.snapshotEdgeCount,
      markedComponentJointCutSelfSizeBytes: result.policies[0].selectedComponentJointCut.graphCutSelfSizeBytes,
      rootShapeCandidates: result.indexRootShapeCandidates.length }));
  }
  graphObservations.push({ mode: row.mode, size: row.size, graphs });
}
assert.equal(analyzed, 16, 'Sixteen original dumps expected');
for (const artifact of originalArtifacts) assert.equal(digest(await readFile(artifact.path)), artifact.sha256, `Original artifact changed: ${artifact.path}`);
for (const source of sourceBindings) assert.equal(digest(await readFile(source.path)), source.sha256, `Analyzer source changed during execution: ${source.path}`);
assert.equal(digest(await readFile(input)), digest(inputBytes), 'Frozen primary report changed');
const report = { kind: 'rx4002-recorded-full-graph-node-cut-v1', outcome: 'Pass', generatedAt: new Date().toISOString(),
  command: 'node bench/memory/analyse-retainers.mjs', invocation: { argv: [...process.argv], nodeExecArgv: [...process.execArgv], input, output, outputProtection },
  analysisEnvironment: { node: process.version, v8: process.versions.v8, platform: process.platform, architecture: process.arch },
  rawSource: { path: input, sha256: digest(inputBytes) }, sourceBindings, preservedOriginalArtifacts: originalArtifacts,
  originalArtifactPreservation: 'Pass: original numeric/graph/summary/integrity/probe files were read and hashed before/after, with no writes.',
  recordedGraphMeaning: 'For each policy, start at recorded synthetic root 0, exclude the exact observation scaffold vertices, then counterfactually remove all aliases to each specified seed/group of seed nodes. graphCutSelfSizeBytes sums self_size of baseline-reachable vertices that become unreachable. Complete outside recorded retainers remain. Node deletion differs from clearing one owner property, releasing an API handle, and actual post-GC collection.',
  componentMeaning: 'reverseDocuments=marked indexRoot.documents; dictionaryPostingsStatistics=marked indexRoot.fields; sourceOrPositions=marked indexRoot.participants; exportedString is the marked encoding string when present. Optional participant containers include their recorded reachable side data. Shared children with outside paths survive cuts. Root-shape candidates have structural identities only, without inferred staging roles.',
  stageMeaning: 'Built, mutation-precommit and serialization-string-held are observed checkpoints, not peak measurements. Precommit component markers identify the still committed root; other root-shaped nodes are candidates only.',
  edgePolicies: RETAINER_POLICIES.map(({ bit, ...policy }) => policy),
  authorityReferences: [
    { url: 'https://chromium.googlesource.com/devtools/devtools-frontend/+/e343bdfafbbee2aac647db0915cb766dcaf04122/front_end/entrypoints/heap_snapshot_worker/HeapSnapshot.ts', use: 'Reference for weak/shortcut/ephemeron edge distinctions. This bounded analyzer does not copy the DevTools dominator or user-object rules.' },
    { url: 'https://v8.dev/features/weak-references', use: 'Ephemeron liveness differs from independent ordinary strong graph edges.' },
    { url: 'https://raw.githubusercontent.com/nodejs/node/v24.21.0/deps/v8/src/profiler/heap-snapshot-generator.cc', use: 'Observed Node/V8 labelled key/table ephemeron pair encoding.' },
  ],
  limitations: ['These are exact self-size cut effects under the declared recorded edge policies, not exact V8 GC retained size or Chrome DevTools retained-size values.',
    'Ephemeron conditional key-and-table liveness is not implemented. Primary and key-only policy differences are sensitivity observations, not bounds on collector-retained memory.',
    'Marker neutralization is a counterfactual change to an instrumented dump, not a measured uninstrumented heap.',
    'No mutation/serialization allocation peak, decode/restore allocation, browser/worker/transport heap, or physical-process RSS attribution is established.',
    'Each component/group cut deletes those vertices from every alias. It is not the effect of a public dispose call or owner-edge release.',
    'Temporary source dumps remain required for independent reproduction and are not committed. Missing/changed files fail; no missing observation becomes zero.'],
  analyzedOriginalSnapshots: analyzed, workloadReruns: 0, graphObservations };
await assertUnprotectedOutput(output, protectedPaths);
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
for (const artifact of originalArtifacts) assert.equal(digest(await readFile(artifact.path)), artifact.sha256, `Original artifact changed after writing: ${artifact.path}`);
console.log(JSON.stringify({ stage: 'complete', output, sha256: digest(await readFile(output)), analyzedOriginalSnapshots: analyzed, preservedOriginalArtifacts: originalArtifacts.length, sourceBindings }));
