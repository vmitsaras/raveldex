// No build/pack/install/network. Parent supplies an existing installed consumer.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir, cpus, platform, arch, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { analyzeHeapSnapshot } from './heap-graph.mjs';

const directory = dirname(fileURLToPath(import.meta.url)), root = resolve(directory, '../..');
const consumer = resolve(process.argv[2] ?? ''), output = resolve(process.argv[3] ?? join(root, 'docs/evidence/RX-4002-memory.json'));
assert.ok(process.argv[2], 'Pass an existing isolated packed consumer');
const selectedSizes = (process.env.RAVELDEX_MEMORY_SIZES ?? '1000,10000').split(',').map(Number);
const selectedModes = (process.env.RAVELDEX_MEMORY_MODES ?? 'core-only,source-phrase,positions-offsets').split(',');
const repetitions = Number(process.env.RAVELDEX_MEMORY_REPETITIONS ?? 3);
const includeGraphs = process.env.RAVELDEX_MEMORY_GRAPHS !== '0';
assert.ok(selectedSizes.every(size => [1000, 10000].includes(size)) && selectedSizes.length);
assert.ok(selectedModes.every(mode => ['core-only', 'source-phrase', 'positions-offsets'].includes(mode)) && selectedModes.length);
assert.ok(Number.isSafeInteger(repetitions) && repetitions >= 1 && repetitions <= 3);
const localSnapshots = await mkdtemp(join(tmpdir(), 'raveldex-rx4002-heap-'));
await mkdir(dirname(output), { recursive: true });
await copyFile(join(directory, 'node-entry.mjs'), join(consumer, 'memory-node-entry.mjs'));
await copyFile(join(root, 'bench/cost-common.mjs'), join(consumer, 'cost-common.mjs'));
const digest = data => createHash('sha256').update(data).digest('hex');
const packageDirectory = join(consumer, 'node_modules/@vmitsaras/raveldex');
const packageJson = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8')); assert.equal(packageJson.name, '@vmitsaras/raveldex');
const production = [];
async function files(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) await files(full);
    else production.push({ path: full.slice(packageDirectory.length + 1), sha256: digest(await readFile(full)) });
  }
}
await files(join(packageDirectory, 'dist')); production.sort((a,b) => a.path.localeCompare(b.path));
const report = { kind: 'rx4002-node-memory-v1', generatedAt: new Date().toISOString(), consumer, package: packageJson, productionFiles: production,
  environment: { node: process.version, versions: process.versions, platform: platform(), arch: arch(), osRelease: release(), cpu: cpus()[0]?.model, logicalCPUs: cpus().length },
  method: { process: 'One fresh Node main-isolate process for each configuration/size/repetition; never concurrent. Relevant imports and harness precede baseline. Fresh module process, not an uninstrumented latency benchmark.',
    collection: 'Three setImmediate → explicit global.gc() → 25ms settling cycles for every steady stage; all three raw readings retained. Fixtures released before built observations; encoder string then handles separately released.',
    during: 'process.memoryUsage() and V8 readings before/after public operation, first observed native phase per operation and every8192 emitted native generator steps through observation-only installed-private seam. Sample maximum is a lower bound on transient peak, not guaranteed true peak; native synchronous segments and between-sample allocations may escape observation.',
    graphs: 'Separate fresh intrusive processes only, first repetition per configuration/size. V8 synchronous main-isolate heap dumps at built, mutation precommit and export-string held. Dumps not mixed into primary sample pass. Dump hashes/schema and selected-edge reachable self-size component summaries retained; full local dumps remain in temporary directory.',
    attribution: 'Measured whole-process/V8 observations and selected-data graph attribution. No process subtraction is relabeled isolated component retained size; no serialized bytes/object counts are relabeled heap. Strong dominators, hidden/map/code overhead and browser worker/transport memory remain unqualified.',
    fixture: 'Same admitted synthetic ASCII fixture as RX4001; 1000/10000 records, batch256, deadline60000, unchanged defensive/resource limits.', repetitions, selectedSizes, selectedModes, includeGraphs,
    childEnvironment: 'Only PATH, TMPDIR, LANG, LC_ALL inherited; no application credentials or unrelated environment included in heap dumps.',
    kernelHighWater: 'macOS /usr/bin/time -l wraps each fresh child; maximum resident set size is the complete child process lifetime kernel high-water in bytes, including all harness/import/GC/instrumentation and operation stages. Separate graph-process high-water includes intrusive dump allocation. Never assigned to an individual component or operation.' },
  harness: [], observations: [], graphObservations: [], limitations: [
    'These are instrumented Node main-isolate/process observations, not browser memory qualification.',
    'Reachable selected-data self-size excludes prototype/map/code/weak/hidden edges and is not dominant retained size; shared subgraphs are reported once in union and separately rather than added twice.',
    'Sampled maximum cannot identify the true allocation high-water mark or assign isolated staging/serialization/transport bytes.',
    'Worker realms, browser renderers, UI and transport copies require separate browser allocation/retainer observations.',
    'Explicit GC and heap dumping alter execution. RSS may retain allocator pages after object release. No noise threshold is invented as a pass condition.',
    'No native snapshot portability, physical latency/paint, heap capacity promise or workload beyond10000 is inferred.' ] };
for (const path of ['node-entry.mjs', 'heap-graph.mjs', 'run.mjs']) report.harness.push({ path: `bench/memory/${path}`, sha256: digest(await readFile(join(directory, path))) });
report.harness.push({ path: 'bench/cost-common.mjs', sha256: digest(await readFile(join(consumer, 'cost-common.mjs'))), source: 'Actual staged executed fixture' });
async function run(mode, size, repetition, pass) {
  const childOutput = join(localSnapshots, `${mode}-${size}-${repetition}-${pass}.json`);
  const args = ['--expose-gc', join(consumer, 'memory-node-entry.mjs'), mode, String(size), String(repetition), pass, childOutput, localSnapshots];
  let timeOutput = '', exitCode;
  await new Promise((yes, no) => {
    const env = Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'LC_ALL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
    const child = spawn('/usr/bin/time', ['-l', process.execPath, ...args], { cwd: consumer, env, stdio: ['ignore', 'inherit', 'pipe'] });
    child.stderr.on('data', data => { timeOutput += data.toString(); process.stderr.write(data); });
    child.once('error', no); child.once('close', code => { exitCode = code; yes(); });
  });
  const raw = JSON.parse(await readFile(childOutput, 'utf8')); raw.childReport = { path: childOutput, sha256: digest(await readFile(childOutput)) };
  const maximumResident = timeOutput.match(/(\d+)\s+maximum resident set size/);
  raw.kernelLifetimeMaximumResidentSetSizeBytes = maximumResident ? Number(maximumResident[1]) : null;
  raw.kernelTimeRaw = timeOutput; raw.childExitCode = exitCode;
  raw.kernelObservation = maximumResident ? { outcome: 'Pass', scope: 'Complete child lifetime RSS high-water in bytes.' } :
    { outcome: 'Blocked', reason: timeOutput.includes('Operation not permitted') ? 'Sandbox denied macOS time -l sysctl/getrusage observation.' : 'No kernel maximum resident set size emitted.' };
  if (pass === 'graphs') {
    raw.graphs = [];
    for (const snapshot of raw.snapshots) raw.graphs.push({ phase: snapshot.phase, ...await analyzeHeapSnapshot(snapshot.path) });
    report.graphObservations.push(raw);
  } else report.observations.push(raw);
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  if (exitCode !== 0 && !raw.operations.some(row => row.outcome === 'Rejected' && ['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(row.error?.code))) {
    throw Error(`Memory child/tool failure recorded at ${output}: ${mode}/${size}/${repetition}/${pass}, exit ${exitCode}`);
  }
}
for (const mode of selectedModes) for (const size of selectedSizes) for (let repetition = 0; repetition < repetitions; repetition++) await run(mode, size, repetition, 'samples');
if (includeGraphs) for (const mode of selectedModes) for (const size of selectedSizes) await run(mode, size, 0, 'graphs');
console.log(JSON.stringify({ output, sampleProcesses: report.observations.length, graphProcesses: report.graphObservations.length, localSnapshots }));
