// Public build/disposal in fresh children; heap parsing is only in this separate
// observer process. Full synthetic-corpus dumps stay in the owned temp folder.
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, open, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { COLLECTION_ROLES, COLLECTION_BRANCHES, collectionGraph, compareCollectionCohort } from './collection-graph.mjs';
import { runBoundedChild } from './restore-child.mjs';

assert.ok(process.argv[2] && process.argv[3], 'Supply existing isolated consumer and NEW report path');
const consumer = await realpath(process.argv[2]), output = resolve(process.argv[3]), smoke = process.argv.includes('--smoke');
const reportFile = await open(output, 'wx'), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { kind: 'rx4002-observer-held-component-release-v2', startedAt: new Date().toISOString(), invocation: { argv: process.argv.slice(2), consumer, output },
  method: { sizes: smoke ? [1000] : [1000, 10000], branches: smoke ? ['side'] : COLLECTION_BRANCHES, smoke, configuration: 'source-phrase only',
    roles: COLLECTION_ROLES, process: 'One fresh Node main-isolate child per size/branch; serial. Each branch has baseline/no-op/final snapshots after public build/verification/disposal. No live-engine root mutation.',
    collection: 'Three setImmediate/explicit-GC/25ms settling cycles per stage. Full heap dumping is intrusive. Only explicit component holders remain; owner/facade/root collection is separately witnessed.',
    cohort: 'Selected property/element/backing/string-parent edges identify a node-ID cohort. ID-presence arithmetic is quarantined from object survival/collection and byte attribution; actual v1 data showed incompatible identities under the same ID. Matching descriptors cannot establish identity. Direct WeakRef root release is separate.',
    controls: 'Same-holder no-op interval and independent final noop branch; strong positive, released negative, shared object with external alias; same-ID recorded size differences reported separately. Snapshot IDs are checked across controls and held roots.',
    boundaries: 'Node main isolate, source-phrase configuration only. No mutation/serialization peak, native allocator/RSS attribution, positions qualification, browser/worker/transport or AT claim. Raw dumps never enter the measured child as parsed objects.',
    childEnvironment: 'PATH/TMPDIR/LANG/LC_ALL only; 180-second owned-child watchdog. No credentials or unrelated browser/application data collected.' },
  sourceBindings: [], productionFiles: [], preservedEvidence: [], observations: [], outcome: 'Running' };
async function save() { const bytes = JSON.stringify(report, null, 2) + '\n'; await reportFile.write(bytes, 0, 'utf8'); await reportFile.truncate(Buffer.byteLength(bytes)); }
try {
  const installed = await realpath(join(consumer, 'node_modules/@vmitsaras/raveldex'));
  assert.equal(installed, join(consumer, 'node_modules/@vmitsaras/raveldex'));
  report.package = JSON.parse(await readFile(join(installed, 'package.json'))); assert.equal(report.package.name, '@vmitsaras/raveldex');
  report.packageMetadataSha256 = hash(await readFile(join(installed, 'package.json')));
  report.tarballSha256 = hash(await readFile(join(consumer, 'vmitsaras-raveldex-0.0.0.tgz')));
  async function walk(relative = 'dist') {
    for (const entry of await readdir(join(installed, relative), { withFileTypes: true })) {
      const path = join(relative, entry.name);
      if (entry.isDirectory()) await walk(path);
      else {
        assert.ok(entry.isFile()); const sha256 = hash(await readFile(join(installed, path)));
        assert.equal(sha256, hash(await readFile(path)), `Installed production mismatch ${path}`); report.productionFiles.push({ path, sha256 });
      }
    }
  }
  await walk(); report.productionFiles.sort((a, b) => a.path.localeCompare(b.path));
  for (const name of ['RX-4002-memory.json', 'RX-4002-memory-graphs.json', 'RX-4002-memory-retainers.json', 'RX-4002-memory-restore.json', 'RX-4002-memory-browser.json.gz']) {
    const path = `docs/evidence/${name}`; report.preservedEvidence.push({ path, sha256: hash(await readFile(path)) });
  }
  const directory = await mkdtemp(join(consumer, 'memory-collection-')); report.temporaryDirectory = directory;
  for (const [path, name] of [['bench/memory/collection-child.mjs', 'collection-child.mjs'], ['bench/cost-common.mjs', 'collection-fixture.mjs']]) {
    const staged = join(directory, name); await copyFile(path, staged); report.sourceBindings.push({ path, staged, sha256: hash(await readFile(staged)) });
  }
  for (const path of ['bench/memory/collection-graph.mjs', 'bench/memory/collection-graph.test.mjs', 'bench/memory/collection-run.mjs', 'bench/memory/restore-child.mjs']) report.sourceBindings.push({ path, sha256: hash(await readFile(path)) });
  for (const size of report.method.sizes) for (const branch of report.method.branches) {
    const path = join(directory, `${size}-${branch}-child.json`);
    const env = Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'LC_ALL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
    const execution = await runBoundedChild(process.execPath, ['--expose-gc', join(directory, 'collection-child.mjs'), String(size), branch, directory, path], { cwd: consumer, env });
    const row = { size, branch, execution, outcome: 'Running' }; report.observations.push(row);
    try {
      const bytes = await readFile(path); row.childReport = { path, sha256: hash(bytes) }; row.child = JSON.parse(bytes);
      assert.equal(row.child.pid, execution.childPid);
      assert.equal(execution.childExitCode, 0); assert.equal(execution.childSignal, null); assert.equal(execution.childTimedOut, false);
      assert.equal(row.child.outcome, 'Observed', 'Uncollected baseline/released witnesses require retainer investigation');
      assert.equal(row.child.snapshots.length, 3);
      const graphs = [];
      row.dumps = [];
      for (const snapshot of row.child.snapshots) {
        const info = await stat(snapshot.path); assert.ok(info.isFile() && info.size <= 512 * 1024 * 1024, 'Heap dump exceeds parser bound');
        const bytes = await readFile(snapshot.path); row.dumps.push({ label: snapshot.label, path: snapshot.path, bytes: bytes.length, sha256: hash(bytes) });
        graphs.push(collectionGraph(JSON.parse(bytes)));
      }
      const [baseline, noop, final] = graphs; row.roots = graphs.map(graph => graph.roots); row.controls = graphs.map(graph => ({ ...graph.controls, externalId: graph.externalId }));
      assert.deepEqual(Object.keys(baseline.roots).sort(), [...COLLECTION_ROLES].sort(), 'Exact baseline roles required');
      assert.deepEqual(baseline.roots, noop.roots); assert.equal(new Set(Object.values(baseline.roots)).size, 3);
      for (const graph of graphs) {
        assert.equal(graph.controls.positive, baseline.controls.positive);
        assert.equal(graph.externalId, baseline.controls.sharedRight);
      }
      assert.equal(baseline.controls.sharedLeft, baseline.controls.sharedRight); assert.deepEqual(baseline.controls, noop.controls);
      assert.equal(final.controls.sharedLeft, undefined); assert.equal(final.controls.sharedRight, undefined);
      assert.ok(final.byId.has(baseline.controls.sharedRight), 'External alias must preserve the shared control after both selected holders are released');
      assert.equal(final.controls.negative, undefined); assert.equal(final.byId.has(baseline.controls.negative), false);
      for (const role of COLLECTION_ROLES) {
        const released = row.child.releasedRoles.includes(role);
        if (released) assert.equal(final.roots[role], undefined);
        else assert.equal(final.roots[role], baseline.roots[role]);
      }
      const cohort = compareCollectionCohort(baseline, noop, final); row.summary = cohort.summary;
      const cohortPath = output.replace(/\.json$/, '') + `-cohort-${size}-${branch}.json.gz`;
      const raw = Buffer.from(JSON.stringify({ roleBits: COLLECTION_ROLES, stageBits: ['baseline', 'noop', 'final'], columns: cohort.columns, rows: cohort.rows })), compressed = gzipSync(raw, { level: 9 });
      await writeFile(cohortPath, compressed, { flag: 'wx' }); row.cohort = { path: cohortPath, sha256: hash(compressed), bytes: compressed.length, decompressedSha256: hash(raw), decompressedBytes: raw.length };
      row.outcome = 'ObservedRoots_AttributionBlocked';
    } catch (error) { row.outcome = 'Fail'; row.failure = { name: error.name, message: error.message, stack: error.stack }; }
    await save(); console.log(JSON.stringify({ size, branch, outcome: row.outcome }));
  }
  for (const binding of [...report.sourceBindings, ...report.productionFiles, ...report.preservedEvidence]) {
    assert.equal(hash(await readFile(binding.path)), binding.sha256, `Preserved input changed ${binding.path}`);
    if (binding.staged) assert.equal(hash(await readFile(binding.staged)), binding.sha256, `Staged input changed ${binding.staged}`);
  }
  for (const binding of report.productionFiles) assert.equal(hash(await readFile(join(installed, binding.path))), binding.sha256, `Installed input changed ${binding.path}`);
  report.preservation = 'Pass'; report.outcome = report.observations.every(row => row.outcome === 'ObservedRoots_AttributionBlocked') ? 'ObservedRoots_AttributionBlocked' : 'Fail';
} catch (error) { report.outcome = 'Fail'; report.failure = { name: error.name, message: error.message, stack: error.stack }; }
finally { report.finishedAt = new Date().toISOString(); await save(); await reportFile.close(); }
console.log(JSON.stringify({ output, outcome: report.outcome, processes: report.observations.length }));
if (report.outcome === 'Fail') process.exitCode = 1;
