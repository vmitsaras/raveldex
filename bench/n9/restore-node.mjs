// RX-8007 diagnosis only: no production edits, build, install or network work.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile, realpath, copyFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { cpus, release, totalmem } from 'node:os';
import { instrumentRestorePackage } from './restore-instrument.mjs';
import { RESTORE_VARIANTS, RESTORE_OPERATIONS, restoreOutcome } from './restore-case.mjs';
import { SIZES, workloadFor, verifyFrozen } from './workloads.mjs';
import { inventory, digest } from './run.mjs';
export const RESTORE_METHOD = Object.freeze({ normalOwners: 2, diagnosticOwners: 1, sizes: Object.freeze([1000, 10000]) });
export function requireRestoreCase(row) {
  assert.equal(row.outcome, 'Collected', 'child did not collect complete case'); assert.equal(row.exercise?.outcome, 'Collected');
  assert.ok(RESTORE_VARIANTS.includes(row.variant)); assert.ok(['normal', 'diagnostic'].includes(row.mode));
  const exercise = row.exercise, observations = row.mode === 'normal' ? exercise.samples : exercise.observations;
  assert.equal(row.mode === 'normal' ? exercise.observations.length : exercise.samples.length, 0, 'mixed normal/diagnostic observations');
  assert.deepEqual(observations.map(item => item.operation), RESTORE_OPERATIONS, 'missing/duplicate/reordered operation');
  assert.equal(observations[0].outcome, 'Pass', 'admitted donor build required'); assert.equal(observations[0].result?.revision, Math.ceil(row.size / 256), 'donor admission revision drift');
  assert.equal(exercise.priorRecords, Math.min(1000, row.size)); assert.equal(exercise.size, row.size);
  for (const item of observations) {
    assert.ok(['Pass', 'Refused', 'Cancelled', 'Unknown', 'Not run'].includes(item.outcome), 'unexpected/hidden rejection');
    if (item.outcome === 'Not run') { assert.ok(item.operation.endsWith('Restore') || item.operation === 'restoreSource'); assert.equal(item.reason, 'Source export did not produce an admitted snapshot'); for (const key of ['error', 'result', 'wallMs', 'cpuUserMs', 'cpuSystemMs', 'counters']) assert.equal(item[key], undefined, 'Not run contains actual observation: ' + key); continue; }
    assert.ok(Number.isFinite(item.wallMs) && item.wallMs >= 0, 'invalid wall sample');
    if (item.cpuUserMs !== undefined) assert.ok([item.cpuUserMs, item.cpuSystemMs].every(value => Number.isFinite(value) && value >= 0), 'invalid CPU sample');
    assert.equal(Boolean(item.counters), row.mode === 'diagnostic', 'diagnostic scope mismatch');
    if (item.counters) {
      for (const name of ['emittedSteps', 'emittedWorkUnits', 'hostYields']) assert.ok(Number.isSafeInteger(item.counters[name]) && item.counters[name] >= 0, 'missing actual diagnostic counter: ' + name);
      const detail = item.counters.restore; assert.ok(detail && detail.phaseWork && detail.detailWork && Array.isArray(detail.snapshots), 'restore detail missing');
      assert.equal(detail.authoritativeUnchangedDuringStaging, true, 'authoritative root changed during private staging');
      if (item.operation === 'restoreSource' && item.outcome !== 'Unknown') {
        assert.ok(detail.oldRoot, 'normal restore did not observe old authoritative root');
        assert.equal(detail.finalAuthoritativeSame, item.outcome !== 'Pass', 'restore authoritative identity contradicts outcome');
      }
    }
    if (item.outcome === 'Pass') { assert.ok(item.result, 'success without actual result'); if (item.operation.endsWith('Restore') || item.operation === 'restoreSource') {
      assert.equal(item.oldRemoved, true);
      assert.equal(item.completeSource?.outcome, 'Pass', 'complete public receiving source required'); assert.equal(item.completeSource.records, row.size);
      assert.equal(item.completeMembership?.outcome, 'Pass', 'complete public receiving membership required'); assert.equal(item.completeMembership.records, row.size);
      if (row.mode === 'diagnostic') { assert.equal(item.completeState?.outcome, 'Pass', 'complete diagnostic core/sidecar equality required'); assert.match(item.completeState.donor?.sha256 ?? '', /^[a-f0-9]{64}$/); assert.equal(item.completeState.receiver?.sha256, item.completeState.donor.sha256); }
    } }
    else {
      assert.ok(item.error?.code && typeof item.error.message === 'string', 'typed error missing'); assert.equal(restoreOutcome(item.error), item.outcome, 'typed error reclassified');
      if (item.outcome === 'Unknown') { assert.ok(item.stateClaim || item.donorQueriesPreserved); if (item.operation !== 'exportSource') { assert.notEqual(item.oldQueriesPreserved, true); assert.notEqual(item.oldSourceBytesPreserved, true); assert.notEqual(item.oldRemoved, true); } continue; }
      if (item.operation === 'exportSource') assert.equal(item.donorQueriesPreserved, true);
      else { assert.equal(item.oldQueriesPreserved, true); assert.equal(item.oldSourceBytesPreserved, true); }
    }
  }
  const exportRow = observations[1];
  for (const item of observations.slice(2)) assert.equal(item.outcome === 'Not run', exportRow.outcome !== 'Pass', 'restore availability mismatch');
  if (exportRow.outcome === 'Pass') { assert.ok(Number.isSafeInteger(exportRow.result.encodedBytes) && exportRow.result.encodedBytes > 0); assert.match(exportRow.result.encodedSha256, /^[a-f0-9]{64}$/); }
  return observations;
}
export function validateRestoreRows(rows, sizes, variants = RESTORE_VARIANTS, method = RESTORE_METHOD) {
  assert.equal(rows.length, sizes.length * variants.length * (method.normalOwners + method.diagnosticOwners), 'missing/extra cases');
  assert.equal(new Set(rows.map(row => row.pid)).size, rows.length, 'fresh child process required');
  for (const size of sizes) for (const variant of variants) {
    const selected = rows.filter(row => row.size === size && row.variant === variant);
    assert.equal(selected.filter(row => row.mode === 'normal').length, method.normalOwners); assert.equal(selected.filter(row => row.mode === 'diagnostic').length, method.diagnosticOwners);
    selected.forEach(requireRestoreCase);
    const canonical = selected[0]; for (const row of selected) assert.deepEqual(row.exercise.donorResults, canonical.exercise.donorResults, 'donor query semantics drift');
    const exports = selected.map(row => requireRestoreCase(row)[1]).filter(item => item.outcome === 'Pass');
    if (exports.length) for (const item of exports) for (const key of ['encodedBytes', 'encodedCodeUnits', 'encodedSha256', 'header']) assert.deepEqual(item.result[key], exports[0].result[key], 'encoded snapshot identity drift: ' + key);
  }
  return rows.map(row => ({ size: row.size, variant: row.variant, mode: row.mode, owner: row.owner, operations: requireRestoreCase(row).map(item => ({ operation: item.operation, outcome: item.outcome, error: item.error ?? null })) }));
}
export function summarizeRestores(rows) {
  const groups = new Map();
  for (const row of rows.filter(row => row.mode === 'normal')) for (const sample of requireRestoreCase(row)) {
    assert.equal(sample.counters, undefined, 'intrusive counters in normal timing');
    const key = JSON.stringify([row.size, row.variant, sample.operation]);
    if (!groups.has(key)) groups.set(key, { size: row.size, variant: row.variant, operation: sample.operation, samples: [] }); groups.get(key).samples.push(sample);
  }
  return [...groups.values()].map(({ samples, ...key }) => ({ ...key, attempts: samples.length, outcomes: Object.fromEntries([...new Set(samples.map(item => item.outcome))].map(outcome => [outcome, samples.filter(item => item.outcome === outcome).length])),
    timingByOutcome: [...new Set(samples.map(item => item.outcome))].map(outcome => { const selected = samples.filter(item => item.outcome === outcome), median = values => { values.sort((a, b) => a - b); return values.length ? values.length % 2 ? values[(values.length - 1) / 2] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2 : null; };
      return { outcome, count: selected.length, medianWallMs: median(selected.map(item => item.wallMs).filter(Number.isFinite)), medianCpuUserMs: median(selected.map(item => item.cpuUserMs).filter(Number.isFinite)), medianCpuSystemMs: median(selected.map(item => item.cpuSystemMs).filter(Number.isFinite)), samples: selected.map(({ wallMs, cpuUserMs, cpuSystemMs, error }) => ({ wallMs, cpuUserMs, cpuSystemMs, error })) }; }),
    limits: 'Two normal fresh-owner observations per cell and separately intrusive diagnostics. Descriptive medians only; refusals/cancellation/unknown/Not run stay separate. No p95, population/device, retained/peak heap or performance comparison claim.' }));
}
async function main() {
  assert.equal(process.argv.length, 4, 'usage: node bench/n9/restore-node.mjs INSTALLED_CONSUMER FRESH_OUTPUT');
  const consumer = await realpath(resolve(process.argv[2])), requested = resolve(process.argv[3]); await mkdir(requested); const output = await realpath(requested), repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const root = join(consumer, 'node_modules/@vmitsaras/raveldex'); assert.equal(await realpath(root), root, 'workspace symlink refused'); const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); assert.equal(metadata.name, '@vmitsaras/raveldex'); assert.equal(metadata.private, true); assert.deepEqual(metadata.dependencies ?? {}, {});
  const before = await inventory(root), diagnostic = join(output, 'diagnostic'); await mkdir(join(diagnostic, 'node_modules/@vmitsaras'), { recursive: true });
  const copied = join(diagnostic, 'node_modules/@vmitsaras/raveldex'); await cp(root, copied, { recursive: true }); await writeFile(join(diagnostic, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  const instrumentation = await instrumentRestorePackage(copied), diagnosticBefore = await inventory(copied);
  for (const directory of [consumer, diagnostic]) { await copyFile(join(repo, 'bench/n9/restore-child.mjs'), join(directory, 'n9-restore-child.mjs')); await copyFile(join(repo, 'bench/n9/restore-case.mjs'), join(directory, 'n9-restore-case.mjs')); await copyFile(join(repo, 'bench/n9/bulk-verify.mjs'), join(directory, 'bulk-verify.mjs')); }
  const sizes = process.env.RAVELDEX_N9_RESTORE_SIZES?.split(',').map(Number) ?? RESTORE_METHOD.sizes, variants = process.env.RAVELDEX_N9_RESTORE_VARIANTS?.split(',') ?? RESTORE_VARIANTS;
  assert.ok(sizes.length && new Set(sizes).size === sizes.length && sizes.every(size => SIZES.includes(size))); assert.ok(variants.length && new Set(variants).size === variants.length && variants.every(variant => RESTORE_VARIANTS.includes(variant)));
  const paths = ['bench/n9/restore-node.mjs', 'bench/n9/restore-child.mjs', 'bench/n9/restore-case.mjs', 'bench/n9/bulk-verify.mjs', 'bench/n9/restore-instrument.mjs', 'bench/n9/instrument.mjs', 'bench/n9/run.mjs', 'bench/n9/workloads.mjs', 'test/fixtures/n9/freeze.json', 'test/fixtures/relevance/corpus.json'];
  const harness = await Promise.all(paths.map(async path => ({ path, sha256: digest(await readFile(join(repo, path))) })));
  const report = { kind: 'rx8007-node-restore-diagnosis-v1', startedAt: new Date().toISOString(), sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), harness,
    package: { root, metadata, inventory: before, inventorySha256: digest(JSON.stringify(before)), diagnostic: copied, diagnosticInventory: diagnosticBefore, diagnosticInventorySha256: digest(JSON.stringify(diagnosticBefore)), instrumentation },
    environment: { node: process.version, versions: process.versions, platform: process.platform, arch: process.arch, release: release(), cpu: cpus()[0]?.model, logicalCPUs: cpus().length, systemBytes: totalmem() },
    method: { ...RESTORE_METHOD, sizes, variants, deadlineMs: 60000, deadlineProbeMs: 1, batch: 256, priorDocuments: 'min(1000, incoming records)', normalMemory: 'Not measured', diagnosticMemory: 'Unforced native process samples before/after operations and bounded phase/record checkpoints; includes harness/inputs/donor/receiver. Not retained/peak/exclusive heap.', refusal: 'Collected is method coverage, not restored capacity. Every actual Refused/Cancelled/Unknown/Not run remains explicit; no cap increase or synthetic input.' },
    workloads: sizes.map(size => verifyFrozen(workloadFor('adversarial', size)).identity), runs: [], outcome: 'Running' };
  await writeFile(join(output, 'start.json'), JSON.stringify(report, null, 2) + '\n');
  try {
    for (let owner = 0; owner < 3; owner++) for (const size of owner % 2 ? [...sizes].reverse() : sizes) for (const variant of owner % 2 ? [...variants].reverse() : variants) {
      const mode = owner === 1 ? 'diagnostic' : 'normal', directory = mode === 'normal' ? consumer : diagnostic, name = `${variant}-${size}-${owner}-${mode}`, file = join(output, name + '.json');
      const args = [join(directory, 'n9-restore-child.mjs'), pathToFileURL(join(repo, 'bench/n9/workloads.mjs')).href, pathToFileURL(join(repo, 'bench/n9/restore-instrument.mjs')).href, String(size), variant, mode, file, String(owner)];
      let stdout = '', stderr = ''; const startedAt = new Date().toISOString(), exitCode = await new Promise((yes, no) => { const child = spawn(process.execPath, args, { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] }); child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk); child.on('error', no); child.on('close', yes); });
      await writeFile(join(output, name + '.txt'), stdout + stderr); report.runs.push({ size, variant, mode, owner, startedAt, output: name + '.json', log: name + '.txt', exitCode, command: [process.execPath, ...args] }); await writeFile(join(output, 'progress.json'), JSON.stringify(report, null, 2) + '\n'); assert.equal(exitCode, 0, name + ' failed; inspect raw log'); console.log(JSON.stringify({ name, exitCode }));
    }
    const rows = await Promise.all(report.runs.map(run => readFile(join(output, run.output), 'utf8').then(JSON.parse))); report.coverage = validateRestoreRows(rows, sizes, variants); report.summaries = summarizeRestores(rows); report.outcome = 'Collected';
    report.acceptanceBoundary = 'Complete pinned observations, including refusal/stop/uncertainty outcomes. Parent independently diagnoses phase/work/root coexistence. No capacity improvement is inferred.';
  } catch (error) { report.outcome = 'Fail'; report.failure = { name: error.name, message: error.message }; throw error; }
  finally {
    try {
      assert.deepEqual(await inventory(root), before, 'normal package drift'); report.normalPackageUnchanged = true; assert.deepEqual(await inventory(copied), diagnosticBefore, 'diagnostic package drift'); report.diagnosticPackageUnchanged = true;
      for (const directory of [consumer, diagnostic]) for (const [source, staged] of [['bench/n9/restore-child.mjs', 'n9-restore-child.mjs'], ['bench/n9/restore-case.mjs', 'n9-restore-case.mjs'], ['bench/n9/bulk-verify.mjs', 'bulk-verify.mjs']]) assert.equal(digest(await readFile(join(directory, staged))), harness.find(file => file.path === source).sha256, 'staged source drift');
      for (const file of harness) assert.equal(digest(await readFile(join(repo, file.path))), file.sha256, 'harness drift');
    } catch (error) { report.outcome = 'Fail'; report.guardFailure = { name: error.name, message: error.message }; throw error; }
    finally { report.finishedAt = new Date().toISOString(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
  }
}
if (process.argv[1] && await realpath(process.argv[1]).catch(() => undefined) === fileURLToPath(import.meta.url)) await main();
