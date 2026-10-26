// No pack/install/network. Serial fresh children; only this parent parses heaps.
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, open, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { analyzeMutationGraph } from './mutation-graph.mjs';
import { runBoundedChild } from './restore-child.mjs';

assert.ok(process.argv[2] && process.argv[3], 'Supply existing consumer and NEW report path');
const consumer = await realpath(process.argv[2]), output = resolve(process.argv[3]), smoke = process.argv.includes('--smoke');
const file = await open(output, 'wx'), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { kind: 'rx4002-mutation-staging-memory-v1', startedAt: new Date().toISOString(), consumer, output,
  method: { sizes: smoke ? [1000] : [1000, 10000], modes: smoke ? ['source-phrase'] : ['core-only', 'source-phrase', 'positions-offsets'],
    repetitions: 1, operations: ['commit', 'cancel'], batchSize: 256, deadlineMs: 60000,
    main: 'One fresh serial Node process per size/configuration. Installed public build/replace/search/dispose, unchanged limits; private admit observation only.',
    observer: 'Separate worker inspector connectToMainThread; exact compiled consume source SHA and native precommit line, lexical structural aliases checked before capture. Observer exits before cleanup collection. Its heap is outside main-isolate dumps, but process RSS includes it.',
    graphs: 'One intrusive precommit main-isolate dump for each commit/cancel. Same-snapshot selected property/element/backing/frozen-array numeric/string-parent graph; no prototype/map/code/weak/hidden edge traversal. Six old/candidate data seeds plus separate admitted request and changes. No cross-snapshot ID comparisons.',
    collection: 'Three setImmediate/explicit-GC/25ms cycles after caller AbortController release and debugger exit. Direct root/document WeakRefs and strong/released literal controls. No descendant-collection claim.',
    peaks: 'Precommit coexistence sizes are not allocation peak or exclusive retention. Process/heap readings around dumps include instrumentation. Earlier separate repeated sampled operations stay frozen and are not rerun or promoted.',
    isolation: 'No browser, transport, codec or worker-engine measurement. Observer worker is instrumentation only. Main-isolate dump is not process RSS.',
    environment: 'Child inherits PATH/TMPDIR/LANG/LC_ALL only, 180-second owned-process watchdog; full heaps stay in task-owned temp.' },
  sourceBindings: [], productionFiles: [], preservedEvidence: [], observations: [], outcome: 'Running' };
async function save() { const s = JSON.stringify(report, null, 2) + '\n'; await file.write(s, 0, 'utf8'); await file.truncate(Buffer.byteLength(s)); }
try {
  const installed = await realpath(join(consumer, 'node_modules/@vmitsaras/raveldex'));
  assert.equal(installed, join(consumer, 'node_modules/@vmitsaras/raveldex'));
  report.packageMetadataSha256 = hash(await readFile(join(installed, 'package.json')));
  report.tarballSha256 = hash(await readFile(join(consumer, 'vmitsaras-raveldex-0.0.0.tgz')));
  async function walk(path = 'dist') {
    for (const e of await readdir(join(installed, path), { withFileTypes: true })) {
      const p = join(path, e.name); if (e.isDirectory()) await walk(p);
      else { assert.ok(e.isFile()); const sha256 = hash(await readFile(join(installed, p))); assert.equal(sha256, hash(await readFile(p))); report.productionFiles.push({ path: p, sha256 }); }
    }
  }
  await walk(); report.productionFiles.sort((a, b) => a.path.localeCompare(b.path));
  for (const name of ['RX-4002-memory.json', 'RX-4002-memory-graphs.json', 'RX-4002-memory-retainers.json', 'RX-4002-memory-restore.json', 'RX-4002-memory-browser.json.gz', 'RX-4002-memory-collection.json', 'RX-4002-memory-collection-reconciliation.json']) {
    const path = `docs/evidence/${name}`; report.preservedEvidence.push({ path, sha256: hash(await readFile(path)) });
  }
  const directory = await mkdtemp(join(consumer, 'memory-mutation-')); report.temporaryDirectory = directory;
  for (const [path, name] of [['bench/memory/mutation-child.mjs', 'mutation-child.mjs'], ['bench/memory/mutation-debugger.mjs', 'mutation-debugger.mjs'], ['bench/cost-common.mjs', 'mutation-fixture.mjs']]) {
    const staged = join(directory, name); await copyFile(path, staged); report.sourceBindings.push({ path, staged, sha256: hash(await readFile(staged)) });
  }
  for (const path of ['bench/memory/mutation-run.mjs', 'bench/memory/mutation-graph.mjs', 'bench/memory/mutation-graph.test.mjs', 'bench/memory/restore-child.mjs']) report.sourceBindings.push({ path, sha256: hash(await readFile(path)) });
  for (const mode of report.method.modes) for (const size of report.method.sizes) {
    const path = join(directory, `${mode}-${size}.json`);
    const env = Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'LC_ALL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
    const execution = await runBoundedChild(process.execPath, ['--expose-gc', join(directory, 'mutation-child.mjs'), mode, String(size), directory, path], { cwd: consumer, env });
    const row = { mode, size, execution, outcome: 'Running' }; report.observations.push(row);
    try {
      const bytes = await readFile(path); row.childReport = { path, sha256: hash(bytes) }; row.child = JSON.parse(bytes);
      assert.equal(execution.childExitCode, 0); assert.equal(execution.childSignal, null); assert.equal(execution.childTimedOut, false); assert.equal(row.child.pid, execution.childPid);
      assert.equal(row.child.outcome, 'Observed'); assert.equal(row.child.snapshots.length, 2); row.graphs = [];
      for (const snapshot of row.child.snapshots) {
        const info = await stat(snapshot.path); assert.ok(info.isFile() && info.size <= 512 * 1024 * 1024);
        const bytes = await readFile(snapshot.path), graph = analyzeMutationGraph(JSON.parse(bytes));
        const cohortPath = output.replace(/\.json$/, '') + `-cohort-${mode}-${size}-${snapshot.action}.json.gz`;
        const raw = Buffer.from(JSON.stringify({ roles: graph.roles, columns: graph.columns, rows: graph.rows })), compressed = gzipSync(raw, { level: 9 });
        await writeFile(cohortPath, compressed, { flag: 'wx' });
        row.graphs.push({ action: snapshot.action, dump: { path: snapshot.path, bytes: bytes.length, sha256: hash(bytes) }, summary: graph.summary,
          cohort: { path: cohortPath, bytes: compressed.length, sha256: hash(compressed), decompressedBytes: raw.length, decompressedSha256: hash(raw) } });
      }
      row.outcome = 'Observed';
    } catch (error) { row.outcome = 'Fail'; row.failure = { name: error.name, message: error.message, stack: error.stack }; }
    await save(); console.log(JSON.stringify({ mode, size, outcome: row.outcome }));
  }
  for (const b of [...report.sourceBindings, ...report.productionFiles, ...report.preservedEvidence]) {
    assert.equal(hash(await readFile(b.path)), b.sha256, `Changed input ${b.path}`);
    if (b.staged) assert.equal(hash(await readFile(b.staged)), b.sha256);
  }
  for (const b of report.productionFiles) assert.equal(hash(await readFile(join(installed, b.path))), b.sha256);
  report.preservation = 'Pass'; report.outcome = report.observations.every(row => row.outcome === 'Observed') ? 'ObservedWithLimits' : 'Fail';
} catch (error) { report.outcome = 'Fail'; report.failure = { name: error.name, message: error.message, stack: error.stack }; }
finally { report.finishedAt = new Date().toISOString(); await save(); await file.close(); }
console.log(JSON.stringify({ output, outcome: report.outcome, processes: report.observations.length }));
if (report.outcome === 'Fail') process.exitCode = 1;
