// RX-8005 separate installed snapshot-cost probe. No build/install/network work.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile, realpath, copyFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { cpus, release, totalmem } from 'node:os';
import { createHash } from 'node:crypto';

const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const errorData = error => ({ name: error.name, code: error.code ?? null, reason: error.reason ?? null, details: error.details ?? null, message: error.message });
const resources = new Set(['DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED']);
const classify = error => !error ? 'Pass' : /UNKNOWN/.test(error.code ?? '') ? 'Unknown' : resources.has(error.code) ? 'Refused' : 'Rejected';
const formats = ['Source', 'Native'];
const expectedOperations = formats.flatMap(format => ['export' + format, 'restore' + format]);

async function child() {
  const [workloadURL, instrumentURL, variant, mode, output, rawOwner] = process.argv.slice(3);
  assert.ok(['baseline', 'candidate'].includes(variant)); assert.ok(['normal', 'diagnostic'].includes(mode));
  const { workloadFor, verifyFrozen, schema } = await import(workloadURL), { collectDiagnostics } = await import(instrumentURL);
  const { createSourceProvider, createSourcePhrases } = await import('@vmitsaras/raveldex/addons/phrases');
  const { createSnapshotRaveldex, createSnapshots, currentNodeSnapshotEnvironment } = await import('@vmitsaras/raveldex/adapters/snapshots');
  const workload = verifyFrozen(workloadFor('adversarial', 1000));
  const qualification = { profileId: 'rx8005-benchmark-declared-exact-node', scope: 'exact-node-runtime', environment: currentNodeSnapshotEnvironment(), evidence: ['bench/n9/prefix-recovery.mjs: matching benchmark attestation contract only; not new Unicode qualification evidence'] };
  const make = () => createSnapshotRaveldex({ schema, addons: [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })] }, { nativeQualification: qualification });
  const report = { kind: 'rx8005-recovery-child-v1', variant, mode, owner: Number(rawOwner), pid: process.pid, size: 1000, identity: workload.identity, qualification,
    runtime: { node: process.version, versions: process.versions, execArgv: process.execArgv }, samples: [], observations: [],
    scope: 'Fresh installed Node source/source-phrase snapshot owner. Benchmark-declared matching exact-Node attestation enables native contract exercise; it is not independent Unicode/profile qualification.' };
  async function observe(operation, call) {
    const cpu = process.cpuUsage(), start = performance.now(); let result, error, counters;
    if (mode === 'diagnostic') ({ result, error, counters } = await collectDiagnostics(call)); else try { result = await call(); } catch (caught) { error = caught; }
    const wallMs = performance.now() - start, usage = process.cpuUsage(cpu), row = { operation, outcome: classify(error), wallMs, cpuUserMs: usage.user / 1000, cpuSystemMs: usage.system / 1000,
      ...(error ? { error: errorData(error) } : {}), ...(counters ? { counters } : {}) };
    (mode === 'normal' ? report.samples : report.observations).push(row); return { result, error, row };
  }
  const donor = make();
  try {
    for (let offset = 0; offset < workload.size; offset += 256) await donor.addMany(workload.records.slice(offset, offset + 256), { deadlineMs: 60000 });
    const queries = [{ id: 'all', query: { kind: 'all' }, expectedIds: workload.records.map(record => record.id) }, ...['common', 'rare', 'narrow-prefix', 'source-phrase'].map(id => workload.queries.find(query => query.id === id))];
    const inspect = async (engine, expectedRevision) => {
      const results = [];
      for (const query of queries) {
        const result = await engine.search(query.query, { limit: 20, deadlineMs: 60000 }), expected = new Set(query.expectedIds);
        assert.equal(result.total, expected.size); assert.equal(result.revision, expectedRevision); assert.equal(result.completeness, 'complete'); assert.equal(result.model, 'raveldex-bm25-v1');
        assert.equal(result.hits.length, Math.min(20, expected.size)); assert.equal(new Set(result.hits.map(hit => hit.id)).size, result.hits.length);
        for (const hit of result.hits) { assert.ok(expected.has(hit.id)); assert.ok(Number.isFinite(hit.score)); }
        results.push({ id: query.id, result });
      }
      return results;
    };
    const donorResults = await inspect(donor, Math.ceil(workload.size / 256)); report.donorResults = donorResults;
    for (const format of formats) {
      const exported = await observe('export' + format, () => createSnapshots(donor)['export' + format]({ deadlineMs: 60000 }));
      if (exported.error) {
        assert.ok(resources.has(exported.error.code), 'unexpected export error');
        assert.deepEqual(await inspect(donor, Math.ceil(workload.size / 256)), donorResults); exported.row.donorPreserved = true;
        (mode === 'normal' ? report.samples : report.observations).push({ operation: 'restore' + format, outcome: 'Not run', reason: 'Export refused; no snapshot available' }); continue;
      }
      const envelope = JSON.parse(exported.result); assert.equal(envelope.format, 'raveldex-' + format.toLowerCase());
      exported.row.result = { encodedBytes: Buffer.byteLength(exported.result), encodedSha256: digest(exported.result), format: envelope.format, header: envelope.body.header };
      const receiver = make();
      try {
        await receiver.add({ id: 'prior', text: { body: 'n9priorstate' }, metadata: { group: 'prior' } }, { deadlineMs: 60000 });
        const before = { all: await receiver.search({ kind: 'all' }), old: await receiver.search('n9priorstate') };
        const priorSource = await createSnapshots(receiver).exportSource({ deadlineMs: 60000 });
        assert.equal(before.all.total, 1); assert.equal(before.old.total, 1); assert.equal(before.all.revision, 1);
        const restored = await observe('restore' + format, () => createSnapshots(receiver).restore(exported.result, { deadlineMs: 60000 }));
        if (restored.error) {
          assert.ok(resources.has(restored.error.code), 'unexpected restore error');
          assert.deepEqual(await receiver.search({ kind: 'all' }), before.all); assert.deepEqual(await receiver.search('n9priorstate'), before.old);
          assert.equal(await createSnapshots(receiver).exportSource({ deadlineMs: 60000 }), priorSource, 'refused restore changed retained source, metadata or revision');
          restored.row.oldStatePreserved = true; restored.row.oldSourceBytesPreserved = true; restored.row.priorSourceSha256 = digest(priorSource); restored.row.postcondition = before;
        } else {
          assert.equal(restored.result.revision, 2); assert.equal(restored.result.originRevision, Math.ceil(workload.size / 256)); assert.equal(restored.result.format, 'raveldex-' + format.toLowerCase());
          restored.row.result = restored.result; restored.row.postcondition = await inspect(receiver, 2);
          assert.deepEqual(restored.row.postcondition.map(({ id, result }) => ({ id, result: { ...result, revision: 0 } })), donorResults.map(({ id, result }) => ({ id, result: { ...result, revision: 0 } })));
          const old = await receiver.search('n9priorstate', { deadlineMs: 60000 }); assert.equal(old.total, 0); assert.equal(old.revision, 2); restored.row.oldRemoved = true;
        }
      } finally { await receiver.dispose(); }
    }
    report.outcome = 'Collected';
  } catch (error) { report.outcome = 'Fail'; report.failure = errorData(error); throw error; }
  finally { await donor.dispose(); await writeFile(output, JSON.stringify(report, null, 2) + '\n'); }
}

function validate(row) {
  assert.equal(row.outcome, 'Collected'); const observations = row.mode === 'normal' ? row.samples : row.observations;
  assert.equal(row.mode === 'normal' ? row.observations.length : row.samples.length, 0, 'mixed timing/diagnostics');
  assert.deepEqual(observations.map(item => item.operation), expectedOperations, 'missing/duplicate operations');
  for (const item of observations) {
    if (item.outcome === 'Not run') { assert.ok(item.operation.startsWith('restore')); assert.equal(item.reason, 'Export refused; no snapshot available'); continue; }
    assert.ok([item.wallMs, item.cpuUserMs, item.cpuSystemMs].every(value => Number.isFinite(value) && value >= 0));
    assert.equal(Boolean(item.counters), row.mode === 'diagnostic'); assert.ok(['Pass', 'Refused'].includes(item.outcome));
    if (item.outcome === 'Pass') { assert.ok(item.result); if (item.operation.startsWith('restore')) assert.equal(item.oldRemoved, true); }
    else { assert.ok(resources.has(item.error?.code)); assert.equal(item.operation.startsWith('restore') ? item.oldStatePreserved : item.donorPreserved, true); if (item.operation.startsWith('restore')) { assert.equal(item.oldSourceBytesPreserved, true); assert.match(item.priorSourceSha256, /^[a-f0-9]{64}$/); } }
  }
  for (const format of formats) { const exported = observations.find(item => item.operation === 'export' + format), restored = observations.find(item => item.operation === 'restore' + format); assert.equal(restored.outcome === 'Not run', exported.outcome === 'Refused'); }
}
function relation(a, b) {
  if (a.outcome === 'Not run' && b.outcome === 'Not run') { assert.equal(a.reason, b.reason); return 'equal-not-run'; }
  if (a.outcome !== b.outcome) return 'outcome-transition';
  if (a.outcome === 'Pass') { assert.deepEqual(b.result, a.result); if (a.operation.startsWith('restore')) assert.deepEqual(b.postcondition, a.postcondition); return 'equal-result'; }
  try { assert.deepEqual(b.error, a.error); return 'equal-error'; } catch { return 'typed-error-transition'; }
}
function summarize(rows) {
  const groups = new Map();
  for (const row of rows.filter(row => row.mode === 'normal')) for (const sample of row.samples) { const key = JSON.stringify([row.variant, sample.operation]); if (!groups.has(key)) groups.set(key, { variant: row.variant, operation: sample.operation, observations: [] }); groups.get(key).observations.push(sample); }
  const median = values => { values.sort((a, b) => a - b); const i = Math.floor(values.length / 2); return values.length ? values.length % 2 ? values[i] : (values[i - 1] + values[i]) / 2 : null; };
  return [...groups.values()].map(({ observations, ...key }) => ({ ...key, attempts: observations.length, outcomes: Object.fromEntries([...new Set(observations.map(item => item.outcome))].map(outcome => [outcome, observations.filter(item => item.outcome === outcome).length])),
    timingByOutcome: [...new Set(observations.map(item => item.outcome))].map(outcome => { const selected = observations.filter(item => item.outcome === outcome); return { outcome, count: selected.length, medianWallMs: median(selected.map(item => item.wallMs).filter(Number.isFinite)), medianCpuUserMs: median(selected.map(item => item.cpuUserMs).filter(Number.isFinite)), medianCpuSystemMs: median(selected.map(item => item.cpuSystemMs).filter(Number.isFinite)), samples: selected.map(({ wallMs, cpuUserMs, cpuSystemMs }) => ({ wallMs: wallMs ?? null, cpuUserMs: cpuUserMs ?? null, cpuSystemMs: cpuSystemMs ?? null })) }; }), limits: 'Three fresh-owner samples per variant/operation; descriptive medians only, no p95. Refused and Not run outcomes remain separate.' }));
}
async function main() {
  assert.equal(process.argv.length, 5, 'Pass baseline consumer, candidate consumer and fresh output directory');
  const { inventory } = await import('./run.mjs'), { instrumentPackage } = await import('./instrument.mjs'), { workloadFor, verifyFrozen } = await import('./workloads.mjs');
  const consumers = { baseline: await realpath(resolve(process.argv[2])), candidate: await realpath(resolve(process.argv[3])) }; assert.notEqual(consumers.baseline, consumers.candidate);
  const requested = resolve(process.argv[4]); await mkdir(requested); const output = await realpath(requested), repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), packages = {};
  for (const variant of ['baseline', 'candidate']) {
    const root = join(consumers[variant], 'node_modules/@vmitsaras/raveldex'); assert.equal(await realpath(root), root, 'workspace symlink refused');
    const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); assert.equal(metadata.name, '@vmitsaras/raveldex'); assert.equal(metadata.private, true); assert.deepEqual(metadata.dependencies ?? {}, {});
    const before = await inventory(root), diagnostic = join(output, variant + '-diagnostic'); await mkdir(join(diagnostic, 'node_modules/@vmitsaras'), { recursive: true }); const copied = join(diagnostic, 'node_modules/@vmitsaras/raveldex'); await cp(root, copied, { recursive: true }); await writeFile(join(diagnostic, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    const instrumentation = await instrumentPackage(copied), diagnosticInventory = await inventory(copied);
    for (const directory of [consumers[variant], diagnostic]) await copyFile(fileURLToPath(import.meta.url), join(directory, 'n9-prefix-recovery.mjs'));
    packages[variant] = { root, metadata, inventory: before, inventorySha256: digest(before), diagnostic, instrumentation, diagnosticInventory, diagnosticInventorySha256: digest(diagnosticInventory) };
  }
  const harness = [];
  for (const path of ['bench/n9/prefix-recovery.mjs', 'bench/n9/instrument.mjs', 'bench/n9/run.mjs', 'bench/n9/workloads.mjs', 'test/fixtures/n9/freeze.json', 'test/fixtures/relevance/corpus.json']) harness.push({ path, sha256: digest(await readFile(join(repo, path))) });
  const report = { kind: 'rx8005-paired-recovery-costs-v1', startedAt: new Date().toISOString(), sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), sourceDiffSha256: digest(execFileSync('git', ['diff', '--binary'], { cwd: repo, maxBuffer: 20 * 1024 * 1024 })), harness, packages,
    environment: { node: process.version, versions: process.versions, platform: process.platform, arch: process.arch, release: release(), cpu: cpus()[0]?.model, logicalCPUs: cpus().length, systemBytes: totalmem() }, workload: verifyFrozen(workloadFor('adversarial', 1000)).identity,
    method: { size: 1000, normalOwners: 3, diagnosticOwners: 1, batch: 256, deadlineMs: 60000,
      timing: 'Fresh sequential child processes; separate source/native export and restore wall/CPU windows, no warmups. Donor construction and semantic checking are outside windows. Each restore target begins with one real old record. No subtractive overhead estimate.',
      diagnostics: 'Only disposable copied packages instrumented. Actual emitted work and snapshot phase checks retained separately from normal timings. Phase counters are not CPU/wall durations.',
      qualification: 'Matching declared exact-Node benchmark attestation contract, explicitly not new independent Unicode/profile qualification.',
      outcomes: 'Resource refusals verify donor/old-target preservation. Export refusal produces explicit Not run restore. Outcome/typed-error transitions are retained and labeled; Collected means complete observations, not acceptance or performance parity.',
      limits: 'Node1000 source/source-phrase snapshot configuration only. Three-owner medians, no p95/heap/capacity/browser/worker/publication claim. This probe is separate from prefix-query acceptance.' }, runs: [], outcome: 'Running' };
  await writeFile(join(output, 'start.json'), JSON.stringify(report, null, 2) + '\n');
  try {
    for (let owner = 0; owner < 4; owner++) for (const variant of owner % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
      const mode = owner === 1 ? 'diagnostic' : 'normal', directory = mode === 'normal' ? consumers[variant] : packages[variant].diagnostic, name = `${variant}-${owner}-${mode}`, file = join(output, name + '.json');
      const args = [join(directory, 'n9-prefix-recovery.mjs'), '--child', pathToFileURL(join(repo, 'bench/n9/workloads.mjs')).href, pathToFileURL(join(repo, 'bench/n9/instrument.mjs')).href, variant, mode, file, String(owner)];
      let stdout = '', stderr = ''; const startedAt = new Date().toISOString(), code = await new Promise((yes, no) => { const running = spawn(process.execPath, args, { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] }); running.stdout.on('data', chunk => stdout += chunk); running.stderr.on('data', chunk => stderr += chunk); running.on('error', no); running.on('close', yes); });
      await writeFile(join(output, name + '.txt'), stdout + stderr); report.runs.push({ variant, mode, owner, startedAt, output: name + '.json', log: name + '.txt', exitCode: code, command: [process.execPath, ...args] }); await writeFile(join(output, 'progress.json'), JSON.stringify(report, null, 2) + '\n'); assert.equal(code, 0, name + ' failed; inspect raw log'); console.log(JSON.stringify({ name, exitCode: code }));
    }
    const rows = await Promise.all(report.runs.map(row => readFile(join(output, row.output), 'utf8').then(JSON.parse))); assert.equal(rows.length, 8); assert.equal(new Set(rows.map(row => row.pid)).size, rows.length);
    for (const variant of ['baseline', 'candidate']) { const selected = rows.filter(row => row.variant === variant); assert.equal(selected.filter(row => row.mode === 'normal').length, 3); assert.equal(selected.filter(row => row.mode === 'diagnostic').length, 1); }
    rows.forEach(validate); const canonical = rows.find(row => row.variant === 'baseline' && row.mode === 'normal'); report.parity = []; report.transitions = [];
    for (const row of rows) {
      assert.deepEqual(row.donorResults, canonical.donorResults, 'donor semantics drift');
      for (const sample of [...row.samples, ...row.observations]) { const reference = canonical.samples.find(item => item.operation === sample.operation), compared = relation(reference, sample), entry = { variant: row.variant, mode: row.mode, owner: row.owner, operation: sample.operation, relation: compared };
        report.parity.push(entry); if (compared.endsWith('transition')) report.transitions.push({ ...entry, baselineOutcome: reference.outcome, observedOutcome: sample.outcome, baselineError: reference.error ?? null, observedError: sample.error ?? null }); }
    }
    report.summaries = summarize(rows); report.diagnostics = rows.filter(row => row.mode === 'diagnostic').map(row => ({ variant: row.variant, observations: row.observations })); report.outcome = 'Collected'; report.comparisonStatus = report.transitions.length ? 'Outcome transitions retained; parent adjudication required' : 'Exact result/error parity';
  } catch (error) { report.outcome = 'Fail'; report.failure = { name: error.name, message: error.message }; throw error; }
  finally {
    try {
      for (const variant of ['baseline', 'candidate']) { assert.deepEqual(await inventory(packages[variant].root), packages[variant].inventory); packages[variant].normalPackageUnchanged = true; assert.deepEqual(await inventory(join(packages[variant].diagnostic, 'node_modules/@vmitsaras/raveldex')), packages[variant].diagnosticInventory); packages[variant].diagnosticPackageUnchanged = true; for (const directory of [consumers[variant], packages[variant].diagnostic]) assert.equal(digest(await readFile(join(directory, 'n9-prefix-recovery.mjs'))), harness[0].sha256, 'staged child drift'); }
      for (const file of harness) assert.equal(digest(await readFile(join(repo, file.path))), file.sha256, 'harness drift');
    } catch (error) { report.outcome = 'Fail'; report.guardFailure = { name: error.name, message: error.message }; throw error; }
    finally { report.finishedAt = new Date().toISOString(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
  }
}
if (process.argv[1] && await realpath(process.argv[1]).catch(() => undefined) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--child') await child(); else await main();
}
