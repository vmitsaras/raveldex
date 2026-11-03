// Paired query-cost collection only. No builds, installs, network or public runtime edits.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile, realpath, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { cpus, release, totalmem } from 'node:os';
import { instrumentPackage } from './instrument.mjs';
import { SIZES, workloadFor, verifyFrozen } from './workloads.mjs';
import { inventory, digest } from './run.mjs';

const resourceCodes = new Set(['DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED']);
export function requireCandidateCoverage(row, queryIds) {
  assert.ok(['normal', 'diagnostic'].includes(row.mode));
  const operations = [...row.samples, ...row.observations], repetitions = row.mode === 'normal' ? 2 : 1;
  assert.equal(row.mode === 'normal' ? row.observations.length : row.samples.length, 0, 'timing/diagnostic scopes mixed');
  assert.equal(operations.filter(sample => sample.operation === 'build').length, 1);
  assert.equal(operations.find(sample => sample.operation === 'build').outcome, 'Pass', 'admitted build required');
  assert.equal(operations.length, 1 + queryIds.length * repetitions, 'missing/extra query work');
  for (const id of queryIds) {
    const selected = operations.filter(sample => sample.operation === 'query:' + id);
    assert.equal(selected.length, repetitions, 'missing/duplicate query');
    assert.deepEqual(selected.map(sample => sample.phase).sort(), (row.mode === 'normal' ? ['first-call-for-query', 'repeat-same-owner'] : ['first-call-for-query']).sort());
  }
}
export function compareCandidateSamples(reference, sample) {
  if (reference.result && sample.result) { assert.deepEqual(sample.result, reference.result); return 'equal-result'; }
  if (reference.error && sample.error) {
    try { assert.deepEqual(sample.error, reference.error); return 'equal-error'; }
    catch (error) {
      if (!resourceCodes.has(reference.error.code) || !resourceCodes.has(sample.error.code)) throw error;
      return 'resource-outcome-change';
    }
  }
  const error = reference.error ?? sample.error;
  assert.ok(error && resourceCodes.has(error.code), 'unexpected result/error transition');
  assert.ok(reference.result || sample.result, 'missing result/error');
  return 'resource-outcome-change';
}
export function candidateSummaries(rows) {
  const groups = new Map();
  for (const row of rows.filter(row => row.mode === 'normal')) for (const sample of row.samples) {
    assert.ok(!sample.counters, 'normal timing contains diagnostic counters');
    const key = JSON.stringify([row.variant, row.size, sample.operation, sample.phase ?? null]);
    if (!groups.has(key)) groups.set(key, { variant: row.variant, size: row.size, operation: sample.operation, phase: sample.phase ?? null, samples: [] });
    groups.get(key).samples.push(sample);
  }
  return [...groups.values()].map(({ samples, ...key }) => {
    const pass = samples.filter(row => row.outcome === 'Pass');
    assert.ok(pass.every(row => [row.wallMs, row.cpuUserMs, row.cpuSystemMs].every(value => Number.isFinite(value) && value >= 0)), 'invalid timing');
    const values = pass.map(row => row.wallMs).sort((a, b) => a - b), middle = Math.floor(values.length / 2);
    return { ...key, attempts: samples.length, successes: pass.length,
      outcomes: Object.fromEntries([...new Set(samples.map(row => row.outcome))].map(outcome => [outcome, samples.filter(row => row.outcome === outcome).length])),
      medianWallMs: values.length ? values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2 : null,
      observedMaximumWallMs: values.at(-1) ?? null,
      cpuSamples: pass.map(({ cpuUserMs, cpuSystemMs }) => ({ cpuUserMs, cpuSystemMs })),
      tail: 'Observed maximum only; two normal owners do not support p95 or statistical significance.' };
  });
}
export function timingComparisons(summaries) {
  return summaries.filter(row => row.variant === 'baseline').map(baseline => {
    const candidate = summaries.find(row => row.variant === 'candidate' && row.size === baseline.size && row.operation === baseline.operation && row.phase === baseline.phase);
    assert.ok(candidate, 'missing matched timing summary');
    return { size: baseline.size, operation: baseline.operation, phase: baseline.phase,
      baselineMedianWallMs: baseline.medianWallMs, candidateMedianWallMs: candidate.medianWallMs,
      baselineAttempts: baseline.attempts, candidateAttempts: candidate.attempts,
      candidateOverBaseline: baseline.medianWallMs > 0 && candidate.medianWallMs !== null ? candidate.medianWallMs / baseline.medianWallMs : null,
      deltaPercent: baseline.medianWallMs > 0 && candidate.medianWallMs !== null ? (candidate.medianWallMs / baseline.medianWallMs - 1) * 100 : null,
      baselineOutcomes: baseline.outcomes, candidateOutcomes: candidate.outcomes };
  });
}
async function runChild(directory, args, log) {
  let stdout = '', stderr = '';
  const code = await new Promise((yes, no) => {
    const child = spawn(process.execPath, [join(directory, 'n9-candidate-child.mjs'), ...args], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    child.on('error', no); child.on('close', yes);
  });
  await writeFile(log, stdout + stderr); return code;
}
async function main() {
  assert.equal(process.argv.length, 5, 'Pass baseline consumer, candidate consumer and fresh output directory');
  const consumers = { baseline: await realpath(resolve(process.argv[2])), candidate: await realpath(resolve(process.argv[3])) };
  assert.notEqual(consumers.baseline, consumers.candidate, 'baseline and candidate must be separate installed consumers');
  const output = resolve(process.argv[4]); await mkdir(output);
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), packages = {};
  for (const variant of ['baseline', 'candidate']) {
    const root = join(consumers[variant], 'node_modules/@vmitsaras/raveldex');
    assert.equal(await realpath(root), root, 'installed package must not be a workspace symlink');
    const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    assert.equal(metadata.name, '@vmitsaras/raveldex'); assert.equal(metadata.private, true); assert.deepEqual(metadata.dependencies ?? {}, {});
    const before = await inventory(root), diagnostic = join(output, variant + '-diagnostic');
    await mkdir(join(diagnostic, 'node_modules/@vmitsaras'), { recursive: true });
    const copied = join(diagnostic, 'node_modules/@vmitsaras/raveldex'); await cp(root, copied, { recursive: true });
    await writeFile(join(diagnostic, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    const instrumentation = await instrumentPackage(copied);
    for (const directory of [consumers[variant], diagnostic]) await copyFile(join(repo, 'bench/n9/candidate-child.mjs'), join(directory, 'n9-candidate-child.mjs'));
    packages[variant] = { root, metadata, inventory: before, inventorySha256: digest(JSON.stringify(before)), diagnostic, instrumentation };
  }
  const sizes = process.env.RAVELDEX_N9_CANDIDATE_SIZES?.split(',').map(Number) ?? SIZES;
  assert.ok(sizes.length && new Set(sizes).size === sizes.length && sizes.every(size => SIZES.includes(size)), 'invalid/repeated sizes');
  const harness = [];
  for (const path of ['bench/n9/candidate-costs.mjs', 'bench/n9/candidate-child.mjs', 'bench/n9/run.mjs', 'bench/n9/instrument.mjs', 'bench/n9/workloads.mjs', 'test/fixtures/n9/freeze.json', 'test/fixtures/relevance/corpus.json']) harness.push({ path, sha256: digest(await readFile(join(repo, path))) });
  const report = { kind: 'rx8003-paired-candidate-costs-v1', startedAt: new Date().toISOString(),
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    sourceDiffSha256: digest(execFileSync('git', ['diff', '--binary'], { cwd: repo, maxBuffer: 20 * 1024 * 1024 })), harness, packages,
    environment: { node: process.version, versions: process.versions, platform: process.platform, arch: process.arch, release: release(), cpu: cpus()[0]?.model, logicalCPUs: cpus().length, systemBytes: totalmem() },
    method: { family: 'adversarial', sizes, variants: ['baseline', 'candidate'], normalOwnersPerVariantSize: 2, diagnosticOwnersPerVariantSize: 1,
      batchSize: 256, deadlineMs: 60000, requestedPage: { offset: 0, limit: 20 },
      rotation: 'Three rounds; size order reverses on odd rounds and baseline/candidate order alternates across round/size. Diagnostic placement cyclically rotates with size; all child processes run sequentially.',
      timing: 'Fresh process and source+source-phrase owner per row. Build spans separate admitted addMany calls, each with its own deadline. Each normal query has first and repeated call in a fixed sequence; imports, fixture generation, owner construction and result checking are outside windows. Wall and CPU user/system are distinct.',
      diagnostics: 'Separate copied packages only; intrusive wall/CPU retained under observations, excluded from normal summaries. No inferred overhead subtraction.',
      matching: 'Frozen independent complete memberships supply exact totals and top20 eligibility. Exact successful native result objects and typed errors compared across owners/variants. Budget-to-success or success-to-budget changes remain explicit and are not exact-success parity.',
      limits: 'Node direct source/phrase only. Descriptive medians/maxima; no p95, heap, physical latency, browser/worker/UI, export/restore, competitor or complete N9 optimization claim.' },
    workloadIdentities: sizes.map(size => verifyFrozen(workloadFor('adversarial', size)).identity), runs: [], outcome: 'Running' };
  await writeFile(join(output, 'start.json'), JSON.stringify(report, null, 2) + '\n');
  try {
    for (let round = 0; round < 3; round++) for (const size of round % 2 ? [...sizes].reverse() : sizes) {
      const index = sizes.indexOf(size), mode = (round + index) % 3 === 1 ? 'diagnostic' : 'normal';
      const variants = (round + index) % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
      for (const variant of variants) {
        const directory = mode === 'normal' ? consumers[variant] : packages[variant].diagnostic;
        const name = `${variant}-${size}-${round}-${mode}`, file = join(output, name + '.json');
        const args = [pathToFileURL(join(repo, 'bench/n9/workloads.mjs')).href, pathToFileURL(join(repo, 'bench/n9/instrument.mjs')).href, String(size), variant, mode, file, String(round)];
        const startedAt = new Date().toISOString(), code = await runChild(directory, args, join(output, name + '.txt'));
        report.runs.push({ variant, size, round, mode, startedAt, exitCode: code, output: name + '.json', log: name + '.txt', command: [process.execPath, join(directory, 'n9-candidate-child.mjs'), ...args] });
        await writeFile(join(output, 'progress.json'), JSON.stringify(report, null, 2) + '\n');
        assert.equal(code, 0, name + ' failed; inspect its log'); console.log(JSON.stringify({ name, exitCode: code }));
      }
    }
    const rows = await Promise.all(report.runs.map(row => readFile(join(output, row.output), 'utf8').then(JSON.parse)));
    assert.equal(new Set(rows.map(row => row.pid)).size, rows.length, 'each observation requires a fresh child process');
    report.parity = [];
    for (const size of sizes) {
      const selected = rows.filter(row => row.size === size), queryIds = workloadFor('adversarial', size).queries.map(query => query.id);
      assert.equal(selected.length, 6);
      for (const variant of ['baseline', 'candidate']) {
        const owners = selected.filter(row => row.variant === variant); assert.equal(owners.filter(row => row.mode === 'normal').length, 2); assert.equal(owners.filter(row => row.mode === 'diagnostic').length, 1);
      }
      for (const row of selected) requireCandidateCoverage(row, queryIds);
      const canonical = selected.find(row => row.variant === 'baseline' && row.mode === 'normal');
      const counts = { equalResults: 0, equalErrors: 0, resourceOutcomeChanges: [] };
      for (const row of selected) for (const sample of [...row.samples, ...row.observations].filter(sample => sample.operation.startsWith('query:'))) {
        const reference = canonical.samples.find(reference => reference.operation === sample.operation);
        const relation = compareCandidateSamples(reference, sample);
        if (relation === 'equal-result') counts.equalResults++;
        else if (relation === 'equal-error') counts.equalErrors++;
        else counts.resourceOutcomeChanges.push({ variant: row.variant, mode: row.mode, round: row.rotation, operation: sample.operation, phase: sample.phase, baselineOutcome: reference.outcome, observedOutcome: sample.outcome, baselineError: reference.error ?? null, observedError: sample.error ?? null });
      }
      report.parity.push({ size, owners: selected.length, ...counts });
    }
    report.summaries = candidateSummaries(rows); report.timingComparisons = timingComparisons(report.summaries);
    report.diagnosticComparisons = sizes.flatMap(size => {
      const baseline = rows.find(row => row.size === size && row.variant === 'baseline' && row.mode === 'diagnostic');
      const candidate = rows.find(row => row.size === size && row.variant === 'candidate' && row.mode === 'diagnostic');
      return baseline.observations.filter(sample => sample.operation.startsWith('query:')).map(sample => ({ size, operation: sample.operation, baselineOutcome: sample.outcome, baseline: sample.counters,
        candidateOutcome: candidate.observations.find(row => row.operation === sample.operation).outcome, candidate: candidate.observations.find(row => row.operation === sample.operation).counters }));
    });
    const rare = report.diagnosticComparisons.find(row => row.size === Math.max(...sizes) && row.operation === 'query:rare');
    assert.equal(rare.baselineOutcome, 'Pass'); assert.equal(rare.candidateOutcome, 'Pass');
    assert.ok(rare.candidate.candidates < rare.baseline.candidates && rare.candidate.documentsEvaluated < rare.baseline.documentsEvaluated && rare.candidate.emittedWorkUnits < rare.baseline.emittedWorkUnits, 'selective diagnostic improvement required');
    report.outcome = 'Pass';
  } catch (error) { report.outcome = 'Fail'; report.failure = { name: error.name, message: error.message }; throw error; }
  finally {
    try {
      for (const variant of ['baseline', 'candidate']) { const after = await inventory(packages[variant].root); assert.deepEqual(after, packages[variant].inventory, variant + ' package drift'); packages[variant].normalPackageUnchanged = true; }
      for (const file of harness) assert.equal(digest(await readFile(join(repo, file.path))), file.sha256, 'harness drift');
    } catch (error) { report.outcome = 'Fail'; report.guardFailure = { name: error.name, message: error.message }; throw error; }
    finally { report.finishedAt = new Date().toISOString(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
