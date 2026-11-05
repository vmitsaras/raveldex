// RX-9001: reuse the unchanged N9 semantic child in a distinct bounded lane.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { inventory, digest } from '../../../bench/n9/run.mjs';
import { createPairedVerifier } from '../../../bench/n9/paired-verify.mjs';
import { workloadFor, verifyFrozen } from '../../../bench/n9/workloads.mjs';
import { validateRows } from '../../../bench/n10/run.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const [manifestPath, timedDirectory, outputPath] = process.argv.slice(2);
assert.equal(process.argv.length, 5, 'usage: node pilot-semantic.mjs ARTIFACTS TIMED_PILOT FRESH_OUTPUT');
const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes);
const timed = JSON.parse(await readFile(join(timedDirectory, 'report.json')));
assert.equal(timed.profile, 'pilot');
assert.equal(timed.outcome, 'Collected'); assert.equal(timed.guards, 'Pass');
assert.equal(timed.acceptedPerformanceEvidence, false);
assert.equal(timed.intendedPerformanceCollection, false);
assert.equal(timed.artifactManifestSha256, digest(manifestBytes));
const output = resolve(outputPath); await mkdir(output);
const roles = ['preN9', 'acceptedN9', 'current'];
const verifier = createPairedVerifier(), workload = verifyFrozen(workloadFor('adversarial', 100));
const pins = [
  'docs/evidence/RX-9001/pilot-semantic.mjs', 'docs/evaluation/RX-9001-method.json', 'docs/evaluation/RX-9001-method.md',
  'bench/n9/paired-semantics.mjs', 'bench/n9/paired-verify.mjs', 'bench/n9/bulk-verify.mjs',
  'bench/n9/workloads.mjs', 'bench/n9/paired-node.mjs', 'bench/n9/run.mjs',
  'bench/n10/run.mjs', 'bench/n10/contract.mjs', 'bench/n10/child.mjs',
  'test/fixtures/snapshots/records.mjs', 'test/fixtures/n9/freeze.json', 'test/fixtures/relevance/corpus.json',
];
const harness = await Promise.all(pins.map(async path => ({ path, sha256: digest(await readFile(join(ROOT, path))) })));
const report = { kind: 'rx9001-semantic-pilot-v1', startedAt: new Date().toISOString(),
  artifactManifestSha256: digest(manifestBytes), harness, identity: workload.identity, runs: [], comparisons: [],
  outcome: 'Running', acceptedPerformanceEvidence: false,
  scope: 'Separate unchanged N9 semantic child: private zero-clock controlled host, explicit 60000ms untimed verification. Full pages, Inspector arithmetic and fixtures; no real-host deadline or latency claim.' };
const packages = {}, rows = {};
const normalized = rows => [...rows].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
try {
  for (const pin of harness) {
    const shared = timed.harness.find(item => item.path === pin.path);
    if (shared) assert.equal(shared.sha256, pin.sha256, 'timed/semantic harness differs');
  }
  for (const role of roles) {
    const artifact = manifest.artifacts.find(item => item.role === role); assert.ok(artifact);
    assert.equal(digest(await readFile(artifact.archive)), artifact.sha256);
    const root = join(await realpath(artifact.consumer), 'node_modules/@vmitsaras/raveldex');
    const before = normalized(await inventory(root)); packages[role] = { root, before };
    assert.deepEqual(before, normalized(artifact.members), 'installed semantic package differs from pinned archive');
    const file = join(output, role + '.json');
    const args = [join(ROOT, 'bench/n9/paired-semantics.mjs'), '--child', artifact.consumer, role, 'adversarial', '100', file];
    let stdout;
    try { stdout = execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024 }); }
    catch (error) { await writeFile(join(output, role + '.txt'), String(error.stdout ?? '') + String(error.stderr ?? '')); throw error; }
    await writeFile(join(output, role + '.txt'), stdout);
    const row = JSON.parse(await readFile(file)); rows[role] = row;
    assert.equal(row.outcome, 'Collected'); assert.equal(row.host.pending, 0); assert.deepEqual(row.identity, workload.identity);
    assert.equal(digest(await readFile(join(output, row.core.canonicalFile))), row.core.sha256, 'canonical core artifact drift');
    assert.deepEqual(row.queries.map(q => q.id), workload.queries.map(q => q.id));
    assert.deepEqual(row.selected.map(q => q.id), workload.queries.map(q => q.id));
    let assertions = 0;
    for (const item of row.selected) if (item.outcome === 'Pass') assertions += verifier.replayInspector(item.result).arithmeticAssertions;
    assert.ok(assertions > 0, 'no independent arithmetic assertions');
    assert.deepEqual(row.fixtures.map(f => f.kind), ['source', 'positions', 'offsets', 'mixed']);
    assert.ok(row.fixtures.every(f => f.outcome === 'Pass' && f.writes.length === 3));
    report.runs.push({ role, command: [process.execPath, ...args], exitCode: 0, output: role + '.json',
      archiveSha256: artifact.sha256, fullQueryCaptures: row.queries.length, arithmeticAssertions: assertions,
      fixtureKinds: row.fixtures.map(f => f.kind), packageUnchanged: false });
  }
  for (const [before, after] of [['preN9', 'acceptedN9'], ['preN9', 'current'], ['acceptedN9', 'current']]) {
    const a = rows[before], b = rows[after];
    assert.equal(a.core.sha256, b.core.sha256); assert.equal(a.core.encounterSha256, b.core.encounterSha256);
    const queries = a.queries.map((q, i) => ({ id: q.id, comparison: verifier.compareCaptures(q.capture, b.queries[i].capture,
      { allowInspectorWorkChange: true, allowCapacityTransition: true }) }));
    const selected = a.selected.map((q, i) => ({ id: q.id, comparison: verifier.compareOutcomes(q, b.selected[i],
      { allowInspectorWorkChange: true, allowCapacityTransition: true }) }));
    report.comparisons.push({ before, after, core: 'Pass', queries, selected });
  }
  const timedRows = [];
  for (const run of timed.runs) {
    const file = run.output ?? run.file;
    assert.equal(typeof file, 'string', 'timed run output required');
    timedRows.push(JSON.parse(await readFile(join(timedDirectory, file))));
  }
  assert.equal(timedRows.length, 18);
  validateRows(timedRows, { profile: 'pilot', manifest, manifestSha256: report.artifactManifestSha256, harnessSha256: timed.harnessSha256 });
  let linked = 0;
  for (const row of timedRows) {
    assert.equal(row.artifactManifestSha256, report.artifactManifestSha256);
    assert.deepEqual(row.identity, workload.identity);
    const data = row.mode === 'normal' ? row.samples : row.observations;
    for (const sample of data.filter(item => item.operation.startsWith('query:'))) {
      const id = sample.operation.slice(6), semantic = rows[row.role].queries.find(q => q.id === id).capture;
      const capture = row.resultCaptures[sample.resultSha256]; assert.ok(capture);
      if (capture.result) {
        assert.equal(semantic.complete, true); assert.equal(capture.result.total, semantic.total);
        assert.deepEqual(capture.result.hits, semantic.hits.slice(0, 20));
        assert.equal(capture.result.revision, semantic.revision);
      } else { assert.equal(semantic.complete, false); assert.deepEqual(capture.error, semantic.error); }
      linked++;
    }
  }
  assert.equal(linked, 240); report.timedCapturesLinked = linked;
  report.outcome = 'Pass';
} catch (error) {
  report.outcome = 'Fail'; report.failure = { name: error.name, message: error.message, stack: error.stack };
  throw error;
} finally {
  try {
    for (const [role, item] of Object.entries(packages)) {
      assert.deepEqual(normalized(await inventory(item.root)), item.before, 'semantic package drift');
      const run = report.runs.find(r => r.role === role); if (run) run.packageUnchanged = true;
    }
    assert.equal(digest(await readFile(manifestPath)), report.artifactManifestSha256, 'artifact manifest drift');
    for (const pin of harness) assert.equal(digest(await readFile(join(ROOT, pin.path))), pin.sha256, 'semantic harness drift');
  } catch (error) { report.outcome = 'Fail'; report.guardFailure = error.message; throw error; }
  finally { report.finishedAt = new Date().toISOString(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
}
