// Paired installed Node ranking costs. No builds, installs, network or runtime edits.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile, realpath, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { cpus, release, totalmem } from 'node:os';
import { instrumentPackage } from './instrument.mjs';
import { SIZES, workloadFor, verifyFrozen } from './workloads.mjs';
import { inventory, digest } from './run.mjs';

export const RANKING_METHOD = Object.freeze({ normalOwners: 3, diagnosticOwners: 1, warmups: 2, samples: 6 });
/** Frozen controls retain independent source membership; derived alternatives
 * match the common vocabulary and Inspector exposes actual cached intermediates. */
export function rankingQueries(workload) {
  const frozen = ['common', 'rare', 'overlapping-or', 'filtered', 'source-phrase'].map(id => {
    const query = workload.queries.find(query => query.id === id); assert.ok(query); return query;
  });
  const common = frozen[0];
  return [...frozen,
    { id: 'weighted-alternatives', query: { kind: 'group', fields: ['body'], variants: [
      { text: 'n9common', match: 'exact', weight: .25 }, { text: 'n9comm', match: 'prefix', weight: .5 },
      { text: 'n9echo', match: 'exact', weight: 1.5 }, { text: 'n9ech', match: 'prefix', weight: .75 },
    ] }, expectedIds: common.expectedIds },
    { id: 'inspector-common', query: common.query, options: { extensions: { inspector: {
      ids: [workload.records[0].id, workload.records[1].id, workload.records.at(-1).id, 'n9missing'], maxFacts: 512,
    } } }, expectedIds: common.expectedIds },
  ];
}
function validTiming(row) {
  assert.ok([row.wallMs, row.cpuUserMs, row.cpuSystemMs].every(value => Number.isFinite(value) && value >= 0), 'invalid timing');
}
function outcome(row) {
  assert.ok(['Pass', 'Refused', 'Rejected', 'Unknown'].includes(row.outcome), 'invalid outcome');
  assert.notEqual(Boolean(row.result), Boolean(row.error), 'exactly one result/error required');
  assert.equal(row.outcome === 'Pass', Boolean(row.result), 'result/outcome mismatch');
  if (row.error) assert.ok(row.error.code && typeof row.error.message === 'string', 'typed error required');
}
export function requireRankingCoverage(row, queryIds, method = RANKING_METHOD) {
  assert.ok(['normal', 'diagnostic'].includes(row.mode)); assert.equal(row.outcome, 'Pass', 'incomplete owner');
  const observations = row.mode === 'normal' ? row.samples : row.observations;
  assert.equal(row.mode === 'normal' ? row.observations.length : row.samples.length, 0, 'mixed normal/diagnostic observations');
  assert.equal(observations.length, 1 + queryIds.length * (row.mode === 'normal' ? method.samples : 1), 'missing/extra operations');
  const build = observations.filter(item => item.operation === 'build'); assert.equal(build.length, 1); assert.equal(build[0].outcome, 'Pass', 'admitted build required');
  for (const id of queryIds) {
    const selected = observations.filter(item => item.operation === 'query:' + id);
    assert.equal(selected.length, row.mode === 'normal' ? method.samples : 1, 'query coverage');
    assert.deepEqual(selected.map(item => item.repetition), Array.from({ length: selected.length }, (_, index) => index), 'query repetition coverage');
  }
  for (const item of observations) {
    validTiming(item); outcome(item);
    assert.ok(['Pass', 'Refused'].includes(item.outcome), 'unexpected rejected/unknown operation');
    if (item.outcome === 'Refused') assert.ok(['DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(item.error.code), 'unexpected refusal code');
    assert.equal(Boolean(item.counters), row.mode === 'diagnostic', 'diagnostic scope mismatch');
  }
  assert.equal(row.warmups.length, row.mode === 'normal' ? queryIds.length * method.warmups : 0, 'warmup coverage');
  for (const id of queryIds) {
    const warmups = row.warmups.filter(item => item.operation === 'query:' + id);
    assert.equal(warmups.length, row.mode === 'normal' ? method.warmups : 0);
    assert.deepEqual(warmups.map(item => item.repetition), Array.from({ length: warmups.length }, (_, index) => index));
    for (const item of warmups) { assert.equal(item.wallMs, undefined, 'warmups must not enter timing'); assert.equal(item.counters, undefined); outcome(item); assert.ok(['Pass', 'Refused'].includes(item.outcome), 'unexpected warmup outcome'); }
  }
}
export function compareRankingSamples(reference, sample) {
  outcome(reference); outcome(sample);
  assert.equal(sample.outcome, reference.outcome, 'outcome transition');
  if (reference.result) assert.deepEqual(sample.result, reference.result, 'native result/receipt/trace drift');
  else assert.deepEqual(sample.error, reference.error, 'typed error drift');
  return reference.result ? 'equal-result' : 'equal-error';
}
export function rankingSummaries(rows) {
  const grouped = new Map();
  for (const row of rows.filter(row => row.mode === 'normal')) for (const sample of row.samples) {
    assert.equal(sample.counters, undefined, 'normal timing contains counters'); validTiming(sample); outcome(sample);
    const key = JSON.stringify([row.variant, row.size, sample.operation]);
    if (!grouped.has(key)) grouped.set(key, { variant: row.variant, size: row.size, operation: sample.operation, samples: [] });
    grouped.get(key).samples.push(sample);
  }
  return [...grouped.values()].map(({ samples, ...key }) => {
    const successful = samples.filter(item => item.outcome === 'Pass');
    const median = values => { values.sort((a, b) => a - b); const middle = Math.floor(values.length / 2); return values.length ? values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2 : null; };
    return { ...key, attempts: samples.length, successes: successful.length,
      outcomes: Object.fromEntries([...new Set(samples.map(item => item.outcome))].map(value => [value, samples.filter(item => item.outcome === value).length])),
      medianWallMs: median(successful.map(item => item.wallMs)), observedMaximumWallMs: successful.length ? Math.max(...successful.map(item => item.wallMs)) : null,
      medianCpuUserMs: median(successful.map(item => item.cpuUserMs)), medianCpuSystemMs: median(successful.map(item => item.cpuSystemMs)),
      cpuSamples: successful.map(({ cpuUserMs, cpuSystemMs }) => ({ cpuUserMs, cpuSystemMs })),
      refusedWallMs: samples.filter(item => item.outcome !== 'Pass').map(item => item.wallMs),
      limits: 'Descriptive median and observed maximum only. Query groups contain eighteen correlated calls across three fresh owners; build contains three observations. These do not support p95 or population/device latency claims. Refusals retain their timings separately.' };
  });
}
export function validateRankingRows(rows, sizes, method = RANKING_METHOD) {
  assert.equal(rows.length, sizes.length * 2 * (method.normalOwners + method.diagnosticOwners), 'missing owners');
  assert.equal(new Set(rows.map(row => row.pid)).size, rows.length, 'fresh process required');
  const parity = [];
  for (const size of sizes) {
    const queryIds = rankingQueries(workloadFor('adversarial', size)).map(query => query.id), selected = rows.filter(row => row.size === size);
    assert.equal(selected.length, 2 * (method.normalOwners + method.diagnosticOwners));
    for (const variant of ['baseline', 'candidate']) {
      const owners = selected.filter(row => row.variant === variant); assert.equal(owners.filter(row => row.mode === 'normal').length, method.normalOwners); assert.equal(owners.filter(row => row.mode === 'diagnostic').length, method.diagnosticOwners);
    }
    for (const row of selected) requireRankingCoverage(row, queryIds, method);
    const canonical = selected.find(row => row.variant === 'baseline' && row.mode === 'normal'), counts = { equalResults: 0, equalErrors: 0 };
    for (const row of selected) for (const sample of [...row.samples, ...row.observations, ...row.warmups]) {
      const reference = canonical.samples.find(item => item.operation === sample.operation); assert.ok(reference);
      counts[compareRankingSamples(reference, sample) === 'equal-result' ? 'equalResults' : 'equalErrors']++;
    }
    parity.push({ size, owners: selected.length, ...counts });
  }
  return parity;
}
export function validateRankingDiagnostics(diagnostics, sizes) {
  for (const size of sizes) {
    const expected = ['build', ...rankingQueries(workloadFor('adversarial', size)).map(query => 'query:' + query.id)];
    const selected = diagnostics.filter(row => row.size === size); assert.equal(selected.length, expected.length, 'missing diagnostic operation');
    for (const operation of expected) {
      const rows = selected.filter(row => row.operation === operation); assert.equal(rows.length, 1, 'duplicate/missing diagnostic operation');
      for (const variant of ['baseline', 'candidate']) for (const name of ['idfComputations', 'averageLengthComputations', 'fieldsPrepared']) {
        const value = rows[0][variant]?.[name]; assert.ok(Number.isSafeInteger(value) && value >= 0, name + ' diagnostic counter missing');
      }
      for (const name of ['emittedSteps', 'emittedWorkUnits', 'hostYields', 'continuationsScheduled', 'candidates', 'documentsEvaluated', 'documentsScored', 'exactDictionaryProbes', 'prefixDictionaryVisits', 'postingsVisited', 'maxStepWorkUnits', 'deadlineCallbacks']) {
        for (const variant of ['baseline', 'candidate']) assert.ok(Number.isSafeInteger(rows[0][variant]?.[name]) && rows[0][variant][name] >= 0, name + ' diagnostic counter missing');
        assert.equal(rows[0].candidate[name], rows[0].baseline[name], name + ' must remain unchanged: ' + operation);
      }
    }
  }
  const common = diagnostics.find(row => row.size === Math.max(...sizes) && row.operation === 'query:common');
  assert.equal(common.baselineOutcome, 'Pass'); assert.equal(common.candidateOutcome, 'Pass');
  for (const name of ['idfComputations', 'averageLengthComputations']) {
    assert.ok(common.baseline[name] > 0 && common.candidate[name] > 0, name + ' successful computation required');
    assert.ok(common.candidate[name] < common.baseline[name], name + ' must compute fewer times');
  }
}
async function main() {
  assert.equal(process.argv.length, 5, 'Pass baseline consumer, candidate consumer and fresh output directory');
  const consumers = { baseline: await realpath(resolve(process.argv[2])), candidate: await realpath(resolve(process.argv[3])) };
  assert.notEqual(consumers.baseline, consumers.candidate); const requested = resolve(process.argv[4]); await mkdir(requested); const output = await realpath(requested);
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), packages = {};
  for (const variant of ['baseline', 'candidate']) {
    const root = join(consumers[variant], 'node_modules/@vmitsaras/raveldex'); assert.equal(await realpath(root), root, 'workspace symlink refused');
    const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); assert.equal(metadata.name, '@vmitsaras/raveldex'); assert.equal(metadata.private, true); assert.deepEqual(metadata.dependencies ?? {}, {});
    const before = await inventory(root), diagnostic = join(output, variant + '-diagnostic'); await mkdir(join(diagnostic, 'node_modules/@vmitsaras'), { recursive: true });
    const copied = join(diagnostic, 'node_modules/@vmitsaras/raveldex'); await cp(root, copied, { recursive: true }); await writeFile(join(diagnostic, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    const instrumentation = await instrumentPackage(copied), diagnosticInventory = await inventory(copied);
    for (const directory of [consumers[variant], diagnostic]) await copyFile(join(repo, 'bench/n9/ranking-child.mjs'), join(directory, 'n9-ranking-child.mjs'));
    packages[variant] = { root, metadata, inventory: before, inventorySha256: digest(JSON.stringify(before)), diagnostic, diagnosticInventory, diagnosticInventorySha256: digest(JSON.stringify(diagnosticInventory)), instrumentation };
  }
  const sizes = process.env.RAVELDEX_N9_RANKING_SIZES?.split(',').map(Number) ?? SIZES;
  assert.ok(sizes.length && new Set(sizes).size === sizes.length && sizes.every(size => SIZES.includes(size)), 'invalid sizes');
  const harness = [];
  for (const path of ['bench/n9/ranking-costs.mjs', 'bench/n9/ranking-child.mjs', 'bench/n9/run.mjs', 'bench/n9/instrument.mjs', 'bench/n9/workloads.mjs', 'test/fixtures/n9/freeze.json', 'test/fixtures/relevance/corpus.json']) harness.push({ path, sha256: digest(await readFile(join(repo, path))) });
  const report = { kind: 'rx8006-paired-ranking-costs-v1', startedAt: new Date().toISOString(), sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    sourceDiffSha256: digest(execFileSync('git', ['diff', '--binary'], { cwd: repo, maxBuffer: 20 * 1024 * 1024 })), harness, packages,
    environment: { node: process.version, versions: process.versions, platform: process.platform, arch: process.arch, release: release(), cpu: cpus()[0]?.model, logicalCPUs: cpus().length, systemBytes: totalmem() },
    method: { ...RANKING_METHOD, sizes, batch: 256, deadlineMs: 60000, page: { limit: 20, offset: 0 },
      scope: 'Installed Node direct source+source-phrase+Inspector owners; frozen adversarial records. Browser/worker/UI, retained/peak heap and physical-input timings are Not measured.',
      timing: 'Three fresh ordinary child processes per variant/size; two verified excluded warmups then six measured queries per case. Separate diagnostic child has one observation per query and no warmups. Build is a separate window covering individually admitted batches. Imports, fixture generation, owner creation, verification, result serialization and teardown are outside windows. CPU user/system differ from wall.',
      rotation: 'Four rounds, alternating size and variant order; diagnostic placement rotates by size. All processes run sequentially.',
      matching: 'Complete frozen membership gives exact totals and top20 eligibility; successful native result objects including complete Inspector facts/resource counters, final build receipts and typed errors compare exactly across every owner/variant, including warmups. No resource transition is accepted as exact parity.',
      quantiles: 'Descriptive medians/observed maxima only; no p95 or statistical-significance claim. Refused samples and their elapsed times remain explicit.',
      diagnostics: 'Only disposable installed copies are instrumented. Average-length, IDF and prepared-field counters observe actual computation sites. Candidate/prefix/scored/work/yield counters remain separate and are not inferred from elapsed time; profile/source anchors retained. Normal package inventories and harness hashes checked before/after; no overhead subtraction.' },
    workloads: sizes.map(size => { const workload = verifyFrozen(workloadFor('adversarial', size)); return { identity: workload.identity, derivedQueries: rankingQueries(workload), derivedQueriesSha256: digest(JSON.stringify(rankingQueries(workload))) }; }), runs: [], outcome: 'Running' };
  await writeFile(join(output, 'start.json'), JSON.stringify(report, null, 2) + '\n');
  try {
    for (let round = 0; round < 4; round++) for (const size of round % 2 ? [...sizes].reverse() : sizes) {
      const index = sizes.indexOf(size), mode = (round + index) % 4 === 1 ? 'diagnostic' : 'normal';
      for (const variant of (round + index) % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
        const directory = mode === 'normal' ? consumers[variant] : packages[variant].diagnostic, name = `${variant}-${size}-${round}-${mode}`, file = join(output, name + '.json');
        const args = [join(directory, 'n9-ranking-child.mjs'), pathToFileURL(join(repo, 'bench/n9/workloads.mjs')).href, pathToFileURL(join(repo, 'bench/n9/instrument.mjs')).href, import.meta.url, String(size), variant, mode, file, String(round)];
        let stdout = '', stderr = ''; const startedAt = new Date().toISOString();
        const code = await new Promise((yes, no) => { const child = spawn(process.execPath, args, { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] }); child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk); child.on('error', no); child.on('close', yes); });
        await writeFile(join(output, name + '.txt'), stdout + stderr); report.runs.push({ variant, size, round, mode, startedAt, exitCode: code, output: name + '.json', log: name + '.txt', command: [process.execPath, ...args] });
        await writeFile(join(output, 'progress.json'), JSON.stringify(report, null, 2) + '\n'); assert.equal(code, 0, name + ' failed; inspect log'); console.log(JSON.stringify({ name, exitCode: code }));
      }
    }
    const rows = await Promise.all(report.runs.map(row => readFile(join(output, row.output), 'utf8').then(JSON.parse)));
    report.parity = validateRankingRows(rows, sizes); report.summaries = rankingSummaries(rows);
    report.diagnostics = sizes.flatMap(size => {
      const baseline = rows.find(row => row.size === size && row.variant === 'baseline' && row.mode === 'diagnostic'), candidate = rows.find(row => row.size === size && row.variant === 'candidate' && row.mode === 'diagnostic');
      return baseline.observations.map(a => { const b = candidate.observations.find(row => row.operation === a.operation); return { size, operation: a.operation, baselineOutcome: a.outcome, candidateOutcome: b.outcome, baseline: a.counters, candidate: b.counters }; });
    });
    validateRankingDiagnostics(report.diagnostics, sizes);
    report.outcome = 'Pass'; report.acceptanceBoundary = 'Method/parity/computation-count checks pass. Actual normal wall/CPU impact, including regressions, requires independent parent adjudication; no latency-gain threshold is hidden here.';
  } catch (error) { report.outcome = 'Fail'; report.failure = { name: error.name, message: error.message }; throw error; }
  finally {
    try {
      for (const variant of ['baseline', 'candidate']) {
        assert.deepEqual(await inventory(packages[variant].root), packages[variant].inventory, variant + ' package drift'); packages[variant].normalPackageUnchanged = true;
        assert.deepEqual(await inventory(join(packages[variant].diagnostic, 'node_modules/@vmitsaras/raveldex')), packages[variant].diagnosticInventory, variant + ' diagnostic package drift'); packages[variant].diagnosticPackageUnchanged = true;
        for (const directory of [consumers[variant], packages[variant].diagnostic]) assert.equal(digest(await readFile(join(directory, 'n9-ranking-child.mjs'))), harness.find(file => file.path === 'bench/n9/ranking-child.mjs').sha256, 'staged child drift');
      }
      for (const file of harness) assert.equal(digest(await readFile(join(repo, file.path))), file.sha256, 'harness drift');
    } catch (error) { report.outcome = 'Fail'; report.guardFailure = { name: error.name, message: error.message }; throw error; }
    finally { report.finishedAt = new Date().toISOString(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
  }
}
if (process.argv[1] && await realpath(process.argv[1]).catch(() => undefined) === fileURLToPath(import.meta.url)) await main();
