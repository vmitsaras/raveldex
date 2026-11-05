// Staged beside an actual installed package. Normal package bytes are untouched.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';
import { createBulkVerifier } from './n9-bulk-verify.mjs';
const [workloadURL, instrumentURL, configPath, output] = process.argv.slice(2);
const config = JSON.parse(await readFile(configPath, 'utf8'));
assert.deepEqual(Object.keys(config).sort(), ['profile','family','size','deadline','deadlineOptions','role','owner','mode','samples','warmups','contractSha256','artifactManifestSha256','harnessSha256','artifactSha256','artifactSource','packageInventorySha256','configurationSha256'].sort(), 'child configuration keys');
const { family, size: rawSize, role: variant, mode, owner: rawOwner, samples: rawSamples, warmups: warmupCount, deadlineOptions } = config;
assert.ok(['default30s', 'explicit60s'].includes(config.deadline));
assert.deepEqual(deadlineOptions, config.deadline === 'default30s' ? {} : { deadlineMs: 60000 });
const { workloadFor, verifyFrozen, schema } = await import(workloadURL), { collectDiagnostics } = await import(instrumentURL);
const workload = verifyFrozen(workloadFor(family, Number(rawSize))), samples = Number(rawSamples), tail = warmupCount > 0;
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const errorData = error => ({ name: error.name, code: error.code ?? null, reason: error.reason ?? null, details: error.details ?? null, message: error.message });
const classify = error => !error ? 'Pass' : /UNKNOWN/.test(error.code ?? '') ? 'Unknown' : error.code === 'CANCELLED' ? 'Cancelled' : ['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(error.code) ? 'Refused' : 'Rejected';
const row = { kind: 'rx9001-node-child-v1', ...config, requestedSamples: samples, requestedWarmups: warmupCount, pid: process.pid, family, size: workload.size, variant, mode, owner: Number(rawOwner), identity: workload.identity, samples: [], observations: [], warmups: [], results: {}, resultCaptures: {}, queryTransitions: [],
  runtime: { node: process.version, versions: process.versions, execArgv: process.execArgv }, scope: 'Actual installed Node direct source+source phrases, default limits; recorded deadline cohort. Query timing includes exact totals/top20. Semantic full-page verification is a separate explicitly controlled-host lane.' };
const make = () => createRaveldex({ schema, addons: [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })] });
async function observe(operation, call, extra = {}) {
  const cpu = process.cpuUsage(), start = performance.now(); let result, error, counters;
  if (mode === 'diagnostic') ({ result, error, counters } = await collectDiagnostics(call)); else try { result = await call(); } catch (caught) { error = caught; }
  const wallMs = performance.now() - start, usage = process.cpuUsage(cpu), item = { operation, ...extra, outcome: classify(error), wallMs, cpuUserMs: usage.user / 1000, cpuSystemMs: usage.system / 1000, ...(error ? { error: errorData(error) } : {}), ...(counters ? { counters } : {}) };
  (mode === 'normal' ? row.samples : row.observations).push(item); return { result, error, item };
}
function verify(found, query) {
  const capture = found.error ? { error: errorData(found.error) } : { result: found.result };
  if (found.result) {
    assert.equal(query.expectedError, undefined); const expected = new Set(query.expectedIds), value = found.result;
    assert.equal(value.completeness, 'complete'); assert.equal(value.model, 'raveldex-bm25-v1'); assert.equal(value.revision, Math.ceil(workload.size / 256)); assert.equal(value.total, expected.size);
    assert.equal(value.hits.length, Math.min(20, expected.size)); assert.equal(new Set(value.hits.map(hit => hit.id)).size, value.hits.length);
    for (const hit of value.hits) { assert.ok(expected.has(hit.id)); assert.ok(Number.isFinite(hit.score)); }
  } else if (query.expectedError) { assert.equal(found.error.code, query.expectedError.code); assert.equal(found.error.details?.path, query.expectedError.path); }
  else assert.ok(['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED'].includes(found.error.code), 'unexpected query rejection');
  const key = digest(capture); row.resultCaptures[key] = capture;
  if (row.results[query.id] && digest(row.results[query.id]) !== key) {
    const previous = row.results[query.id];
    assert.ok([previous.error, capture.error].some(error => ['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED'].includes(error?.code)), 'same-owner semantic/error drift');
    row.queryTransitions.push({ query: query.id, previous, observed: capture });
  } else row.results[query.id] ??= capture;
  if (capture.result) {
    if (row.successfulResults?.[query.id]) assert.deepEqual(capture, row.successfulResults[query.id], 'same-owner successful result drift');
    else (row.successfulResults ??= {})[query.id] = capture;
    row.results[query.id] = capture;
  }
  if (found.item) found.item.resultSha256 = key;
}
const engine = make();
try {
  const build = await observe('build', async () => { let receipt; for (let offset = 0; offset < workload.size; offset += 256) receipt = await engine.addMany(workload.records.slice(offset, offset + 256), { ...deadlineOptions }); return receipt; });
  if (build.error) throw build.error; build.item.result = build.result;
  for (const query of workload.queries) {
    if (mode === 'normal' && tail) for (let repetition = 0; repetition < warmupCount; repetition++) {
      let result, error; try { result = await engine.search(query.query, { limit: 20, ...deadlineOptions }); } catch (caught) { error = caught; }
      verify({ result, error }, query); row.warmups.push({ operation: 'query:' + query.id, repetition, outcome: classify(error) });
    }
    for (let repetition = 0; repetition < (mode === 'diagnostic' ? 1 : samples); repetition++) {
      const found = await observe('query:' + query.id, () => engine.search(query.query, { limit: 20, ...deadlineOptions }), { repetition, phase: mode === 'diagnostic' ? 'diagnostic-first-call' : tail ? 'after-two-warmups' : repetition ? 'repeat-same-owner' : 'first-call-for-query' }); verify(found, query);
    }
  }
  const exported = await observe('exportSource', () => createSnapshots(engine).exportSource({ ...deadlineOptions }));
  if (exported.error) {
    assert.equal(exported.item.outcome, 'Refused'); row.recoveryNotRun = 'Actual source export refused';
    (mode === 'normal' ? row.samples : row.observations).push({ operation: 'restoreSource', outcome: 'Not run', reason: row.recoveryNotRun });
  } else {
    const encoded = exported.result, verifier = createBulkVerifier(); verifier.sourceSnapshot(encoded);
    exported.item.result = { encodedBytes: Buffer.byteLength(encoded), encodedSha256: digest(encoded), header: JSON.parse(encoded).body.header };
    const snapshotPath = output.replace(/\.json$/, '.source.json'); await writeFile(snapshotPath, encoded); exported.item.snapshotArtifact = snapshotPath.split('/').at(-1);
    const receiver = make();
    try {
      await receiver.add({ id: 'prior-state', text: { body: 'n9oldstate' }, metadata: { group: 'prior' } }, { ...deadlineOptions });
      const before = await receiver.search({ kind: 'all' }, { ...deadlineOptions }), oldSource = await createSnapshots(receiver).exportSource({ ...deadlineOptions });
      const restored = await observe('restoreSource', () => createSnapshots(receiver).restore(encoded, { ...deadlineOptions }));
      if (restored.error) {
        assert.equal(restored.item.outcome, 'Refused'); assert.deepEqual(await receiver.search({ kind: 'all' }, { ...deadlineOptions }), before); assert.equal(await createSnapshots(receiver).exportSource({ ...deadlineOptions }), oldSource); restored.item.oldStatePreserved = true;
      } else {
        assert.equal(restored.result.revision, 2); assert.equal(restored.result.originRevision, Math.ceil(workload.size / 256)); assert.equal(restored.result.reindexed, true);
        restored.item.result = restored.result; const all = await receiver.search({ kind: 'all' }, { ...deadlineOptions }); assert.equal(all.total, workload.size); assert.equal(all.revision, 2); assert.equal((await receiver.search('n9oldstate', { ...deadlineOptions })).total, 0);
        restored.item.completeSource = verifier.compareSourceSnapshots(encoded, await createSnapshots(receiver).exportSource({ ...deadlineOptions }));
      }
    } finally { await receiver.dispose(); }
  }
  row.outcome = 'Collected';
} catch (error) { row.outcome = 'Fail'; row.failure = errorData(error); throw error; }
finally { await engine.dispose(); row.packageMetadataSha256 = digest(await readFile(new URL('./node_modules/@vmitsaras/raveldex/package.json', import.meta.url), 'utf8')); await writeFile(output, JSON.stringify(row, null, 2) + '\n'); }
