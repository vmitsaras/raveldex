// Same-dump, fail-closed identity reconciliation. No native workload or GC rerun.
import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { collectionGraph, auditCollectionIdentity, COLLECTION_ROLES } from './collection-graph.mjs';

const [input, output] = process.argv.slice(2); assert.ok(input && output, 'Supply frozen v1 report and NEW reconciliation output');
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), bytes = await readFile(input), report = JSON.parse(bytes);
assert.equal(report.kind, 'rx4002-observer-held-component-release-v1'); assert.equal(report.observations.length, 10); assert.ok(report.finishedAt);
const archivePath = 'docs/evidence/RX-4002-memory-collection-v1-sources.json.gz', archiveBytes = await readFile(archivePath), archive = JSON.parse(gunzipSync(archiveBytes));
assert.equal(archive.reportSha256, hash(bytes));
assert.equal(archive.sources.length, report.sourceBindings.length);
for (const binding of report.sourceBindings) {
  const archived = archive.sources.find(source => source.path === binding.path);
  assert.equal(hash(Buffer.from(archived.source)), binding.sha256, 'Executed v1 source must be preserved, not rebound to current code');
  if (binding.staged) assert.equal(hash(await readFile(binding.staged)), binding.sha256);
}
const result = { kind: 'rx4002-collection-identity-reconciliation-v2', generatedAt: new Date().toISOString(), input: { path: input, sha256: hash(bytes) },
  frozenExecutedSources: { path: archivePath, sha256: hash(archiveBytes) }, analysisSources: [], observations: [],
  rootRelease: 'Pass', descendantObjectIdentity: 'Blocked', descendantByteAttribution: 'Blocked',
  interpretation: 'Only direct WeakRef owner/component-root release and literal controls are accepted. V1 numeric cohort tables are preserved as node-ID arithmetic, not accepted collection/survival or retained/freed-byte evidence. Zero descriptor conflicts cannot rule out same-type/name reuse.' };
for (const path of ['bench/memory/collection-reconcile.mjs', 'bench/memory/collection-graph.mjs', 'bench/memory/collection-graph.test.mjs']) result.analysisSources.push({ path, sha256: hash(await readFile(path)) });
for (const row of report.observations) {
  assert.equal(row.child.outcome, 'Observed'); assert.equal(row.child.baselineOwnersCollected, true); assert.equal(row.child.releasedRootsCollected, true);
  assert.equal(row.child.snapshots.length, 3); assert.equal(row.dumps.length, 3);
  const graphs = [];
  for (const dump of row.dumps) {
    const info = await stat(dump.path); assert.ok(info.isFile() && info.size <= 512 * 1024 * 1024);
    const raw = await readFile(dump.path); assert.equal(hash(raw), dump.sha256); graphs.push(collectionGraph(JSON.parse(raw)));
  }
  const [baseline, noop, final] = graphs, identity = auditCollectionIdentity(baseline, noop, final);
  assert.deepEqual(Object.keys(baseline.roots).sort(), [...COLLECTION_ROLES].sort()); assert.deepEqual(noop.roots, baseline.roots);
  for (const [role, ref] of Object.entries(row.child.snapshots[2].collected)) {
    if (COLLECTION_ROLES.includes(role)) assert.equal(ref, row.child.releasedRoles.includes(role));
    else assert.equal(ref, true, 'Owner/facade/full-root witnesses must be collected');
  }
  for (const graph of graphs) { assert.equal(graph.controls.positive, baseline.controls.positive); assert.equal(graph.externalId, baseline.controls.sharedRight); }
  assert.equal(final.controls.negative, undefined); assert.equal(final.controls.sharedLeft, undefined); assert.equal(final.controls.sharedRight, undefined);
  assert.deepEqual(row.child.snapshots[2].controlCollected, { positive: false, negative: true, shared: false });
  assert.equal(hash(await readFile(row.cohort.path)), row.cohort.sha256, 'Preserve v1 numeric artifact unchanged');
  result.observations.push({ size: row.size, branch: row.branch, rootWeakRefRelease: 'Pass', descriptorIdentity: identity,
    attribution: 'Blocked', dumpHashes: row.dumps.map(dump => dump.sha256), frozenCohortSha256: row.cohort.sha256 });
}
for (const binding of [...report.preservedEvidence, ...report.productionFiles, ...result.analysisSources]) assert.equal(hash(await readFile(binding.path)), binding.sha256);
assert.equal(hash(await readFile(input)), result.input.sha256);
result.conflictCount = result.observations.reduce((sum, row) => sum + row.descriptorIdentity.observedDescriptorConflicts.length, 0);
result.outcome = 'ObservedRootRelease_DescendantAttributionBlocked'; result.preservation = 'Pass';
await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, outcome: result.outcome, conflicts: result.conflictCount, rows: result.observations.length }));
