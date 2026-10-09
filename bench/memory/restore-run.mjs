// New receiving-only observations. Never rebuild/rewrite earlier measurements.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESTORE_METHOD, aggregateRestoreOutcome } from './restore-common.mjs';
import { assertUnprotectedOutput } from './retainer-output.mjs';
import { runBoundedChild } from './restore-child.mjs';
import { restoreEvidenceInventory } from './restore-inventory.mjs';

assert.ok(process.argv[2], 'Supply one fresh isolated installed consumer');
const consumer = await realpath(process.argv[2]), output = resolve(process.argv[3] ?? 'docs/evidence/RX-4002-memory-restore.json');
const evidence = await realpath('docs/evidence');
assert.equal(await realpath(dirname(output)), evidence, 'New restore report must stay in docs/evidence');
assert.match(basename(output), /^RX-4002-memory-restore.*\.json$/, 'Use a new restore evidence filename');
const sourceDirectory = dirname(fileURLToPath(import.meta.url)), digest = bytes => createHash('sha256').update(bytes).digest('hex');
const protectedPaths = (await readdir(evidence)).map(name => join(evidence, name));
protectedPaths.push(...(await readdir(sourceDirectory)).filter(name => name.endsWith('.mjs')).map(name => join(sourceDirectory, name)));
const protection = await assertUnprotectedOutput(output, protectedPaths);
assert.equal(dirname(protection.canonicalOutput), evidence, 'Output symlink must not escape evidence scope');
const packageDirectory = join(consumer, 'node_modules/@vmitsaras/raveldex'), productionFiles = [];
async function inspect(relative) {
  for (const entry of await readdir(join(packageDirectory, relative), { withFileTypes: true })) {
    const path = join(relative, entry.name);
    if (entry.isDirectory()) await inspect(path);
    else { const sha256 = digest(await readFile(join(packageDirectory, path))); assert.equal(sha256, digest(await readFile(path)), `Installed production differs: ${path}`); productionFiles.push({ path, sha256 }); }
  }
}
await inspect('dist'); productionFiles.sort((a, b) => a.path.localeCompare(b.path));
const packageBytes = await readFile(join(packageDirectory, 'package.json')), packageInfo = JSON.parse(packageBytes);
assert.equal(packageInfo.name, '@vmitsaras/raveldex');
const taskDirectory = await mkdtemp(join(consumer, 'memory-restore-'));
const stagedNames = ['restore-common.mjs', 'restore-producer.mjs', 'restore-entry.mjs'], sourceBindings = [];
for (const name of stagedNames) {
  const path = join(sourceDirectory, name), staged = join(taskDirectory, name); await copyFile(path, staged);
  const sha256 = digest(await readFile(path)); assert.equal(digest(await readFile(staged)), sha256); sourceBindings.push({ path: `bench/memory/${name}`, staged, sha256 });
}
await copyFile('bench/cost-common.mjs', join(taskDirectory, 'restore-fixture.mjs'));
sourceBindings.push({ path: 'bench/cost-common.mjs', staged: join(taskDirectory, 'restore-fixture.mjs'), sha256: digest(await readFile('bench/cost-common.mjs')) });
for (const name of ['restore-run.mjs', 'restore-child.mjs', 'restore-common.test.mjs', 'restore-inventory.mjs', 'restore-inventory.test.mjs', 'retainer-output.mjs']) sourceBindings.push({ path: `bench/memory/${name}`, sha256: digest(await readFile(join(sourceDirectory, name))) });
const previousEvidence = (await readdir(evidence)).filter(name => /^RX-4002-memory/.test(name)).map(name => join(evidence, name));
const inventory = await restoreEvidenceInventory(previousEvidence, { output, captureLog: process.argv[4], protectedPaths });
const preserved = await Promise.all(inventory.immutablePaths.map(async path => ({ path, sha256: digest(await readFile(path)) })));
const report = { kind: RESTORE_METHOD.version, generatedAt: new Date().toISOString(), invocation: { argv: [...process.argv], consumer, output, protection },
  method: { ...RESTORE_METHOD, mode: 'source-phrase', format: 'native exact-local Node', producer: 'One separate public preparation process per size; excluded from receiving samples.',
    receiver: 'Three serial fresh Node main-isolate processes per size. Imports, observer and positive control precede baseline; encoded input and prior receiver state have separate GC baselines.',
    allocation: 'In-process inspector statistical allocation sampling covers only public restore plus observer/runtime work within its interval; stopped before independent semantic checks. Includes requested major/minor collected-object options; raw requested parameters and actual returned profile are recorded.',
    polling: 'Before/after public call and 5ms event-loop polls. Blocking work and intervals can hide higher transient use; maxima are observed full-process/isolate readings, never exact or component peaks.',
    privateObservation: 'Installed getExecutionOwner read only to create WeakRef witnesses. No owner, scheduler, generator, limits or production instrumentation is modified.',
    childEnvironment: 'Only PATH, TMPDIR, LANG, LC_ALL inherited. No full heap or unrelated process inputs collected.',
    childWallLimit: '180 seconds per owned producer/receiver process, then SIGTERM and after one second SIGKILL if still open. Timeout/signal/missing reports are retained as failures; the native operation deadline stays 60 seconds.' },
  package: packageInfo, packageMetadataSha256: digest(packageBytes), productionFiles, sourceBindings, preservedExistingMemoryEvidence: preserved, ownedLiveCapture: inventory.ownedLiveCapture,
  preparations: [], observations: [], outcome: 'Running', limitations: [
    'Sampling quantities are statistical profiler outputs, not exact allocations, exclusive retained components or simultaneous peak bytes.',
    'Whole receiving-process readings include the held encoding string, prior/current state, garbage, observer, inspector and runtime. Fields overlap; do not sum external/ArrayBuffer/RSS.',
    'WeakRef witnesses establish only observed collection of listed object roots under this explicit GC policy. Strings, every descendant, normal unforced GC and general leak freedom remain unqualified.',
    'Source-reindex restore, mutation/encoder exact peak, browser/worker/transport buffers and conditional collector-accurate component retention remain outside this native receiving slice.',
    'No native portability, new capacity limit, physical-device, AT, browser or publication claim is made.' ] };
async function save() { await assertUnprotectedOutput(output, protectedPaths); await writeFile(output, JSON.stringify(report, null, 2) + '\n'); }
async function child(name, args, childReport) {
  const env = Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'LC_ALL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const execution = await runBoundedChild(process.execPath, ['--expose-gc', join(taskDirectory, name), ...args, childReport],
    { cwd: consumer, env }, { onStderr: bytes => process.stderr.write(bytes) });
  try {
    const bytes = await readFile(childReport), result = { ...JSON.parse(bytes), ...execution, childReport: { path: childReport, sha256: digest(bytes) } };
    assert.equal(result.pid, execution.childPid, 'Child self-reported PID must match owned process');
    if (execution.childTimedOut || execution.spawnFailure || execution.childSignal || (execution.childExitCode !== 0 && !['RejectedOutcome', 'Fail'].includes(result.outcome))) {
      result.reportedOutcome = result.outcome;
      result.outcome = 'Fail';
      result.processFailure = { category: execution.childTimedOut ? 'Owned child wall-clock timeout' : 'Child process did not exit successfully' };
    }
    return result;
  } catch (error) {
    return { outcome: 'Fail', ...execution, childReport: { path: childReport, available: false },
      failure: { category: 'Child report unavailable or malformed', name: error.name, code: error.code ?? null, message: error.message } };
  }
}
try {
  for (const size of RESTORE_METHOD.sizes) {
    const encodedPath = join(taskDirectory, `${size}-native.json`), producerReport = join(taskDirectory, `${size}-producer.json`);
    const preparation = { size, ...await child('restore-producer.mjs', [String(size), encodedPath], producerReport) }; report.preparations.push(preparation); await save();
    if (preparation.outcome !== 'Pass') {
      for (let repetition = 0; repetition < RESTORE_METHOD.repetitions; repetition++) report.observations.push({ size, repetition, outcome: 'Not Run', reason: 'Native input preparation did not succeed.' });
      continue;
    }
    for (let repetition = 0; repetition < RESTORE_METHOD.repetitions; repetition++) {
      const childReport = join(taskDirectory, `${size}-${repetition}-receiver.json`);
      const observation = { size, repetition, ...await child('restore-entry.mjs', [String(size), String(repetition), encodedPath, preparation.encodedFileSha256, String(preparation.originRevision)], childReport) };
      report.observations.push(observation); await save();
    }
  }
  for (const binding of sourceBindings) {
    assert.equal(digest(await readFile(binding.path)), binding.sha256, `Source changed: ${binding.path}`);
    if (binding.staged) assert.equal(digest(await readFile(binding.staged)), binding.sha256, `Staged source changed: ${binding.staged}`);
  }
  for (const original of preserved) assert.equal(digest(await readFile(original.path)), original.sha256, `Earlier evidence changed: ${original.path}`);
  report.existingEvidencePreservation = 'Pass';
  report.outcome = aggregateRestoreOutcome(report.preparations, report.observations);
} catch (error) { report.outcome = 'Fail'; report.failure = { name: error.name, message: error.message }; process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); await save(); }
console.log(JSON.stringify({ output, outcome: report.outcome, observationRows: report.observations.length,
  receivingProcesses: report.observations.filter(row => Number.isInteger(row.childPid)).length, preparations: report.preparations.length, taskDirectory }));
if (report.outcome === 'Fail') process.exitCode = 1;
