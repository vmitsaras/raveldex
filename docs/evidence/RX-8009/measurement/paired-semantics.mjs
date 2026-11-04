// RX-8009 separate semantic lane: actual installed runtime with a controlled
// queued zero-clock host. This is not timing, deadline or host-fairness evidence.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createPairedVerifier } from './paired-verify.mjs';
import { createBulkVerifier } from './bulk-verify.mjs';
import { workloadFor, verifyFrozen, FAMILIES, SIZES, schema } from './workloads.mjs';
import { inventory } from './run.mjs';
import { PAIRS } from './paired-node.mjs';
import { schema as fixtureSchema, records as fixtureRecords, queries as fixtureQueries, phraseCases, titleRanges, replacement, addition, phrase } from '../../test/fixtures/snapshots/records.mjs';
const verifier = createPairedVerifier(), bulk = createBulkVerifier();
const digest = text => createHash('sha256').update(text).digest('hex');
const data = value => JSON.parse(JSON.stringify(value));
class ControlledHost {
  sequence = 0; ready = new Map(); timers = new Map(); resumes = 0;
  now() { return 0; }
  schedule(callback, delayMs) { const id = ++this.sequence, map = delayMs === 0 ? this.ready : this.timers; map.set(id, callback); return () => map.delete(id); }
  continuation(callback) { return this.schedule(callback, 0); }
  drain() { let count = 0; while (this.ready.size) { assert.ok(++count <= 2_000_000, 'controlled host did not settle under the bounded callback guard'); const [id, callback] = this.ready.entries().next().value; this.ready.delete(id); this.resumes++; callback(); } }
  dispose() { this.ready.clear(); this.timers.clear(); }
  get pending() { return this.ready.size + this.timers.size; }
}
async function installed(consumer) {
  const root = join(await realpath(consumer), 'node_modules/@vmitsaras/raveldex'); assert.equal(await realpath(root), root, 'real installed package required');
  const load = path => import(pathToFileURL(join(root, 'dist', path)).href);
  const [execution, contracts, source, positions, positionPhrases, mixed, facets, inspector, filters, evidence, snippets, snapshots] = await Promise.all([
    load('core/execution/engine.js'), load('core/contracts/schema.js'), load('addons/phrases/index.js'), load('addons/positions/index.js'), load('addons/positions/phrases.js'), load('addons/phrases/mixed.js'),
    load('addons/facets/index.js'), load('addons/inspector/index.js'), load('addons/filters/index.js'), load('addons/evidence/index.js'), load('addons/snippets/index.js'), load('adapters/snapshots/index.js'),
  ]);
  return { root, ...execution, ...contracts, ...source, ...positions, ...positionPhrases, ...mixed, ...facets, ...inspector, ...filters, ...evidence, ...snippets, ...snapshots };
}
function controlled(api, configuration) {
  const host = new ControlledHost(), engine = api.createOwnedRaveldex(api.captureConfiguration(configuration), host);
  const call = async (method, ...args) => { const pending = engine[method](...args); host.drain(); try { return await pending; } finally { assert.equal(host.pending, 0, 'host callbacks released after settlement'); } };
  const snapshot = async (method, ...args) => { const pending = api.createSnapshots(engine)[method](...args); host.drain(); try { return await pending; } finally { assert.equal(host.pending, 0, 'snapshot callbacks released'); } };
  return { engine, host, call, snapshot, owner: api.getExecutionOwner(engine), facade: { search: (...args) => call('search', ...args) }, async close() { await engine.dispose(); assert.equal(host.pending, 0); } };
}
async function build(owner, records) { let receipt; for (let offset = 0; offset < records.length; offset += 256) receipt = await owner.call('addMany', records.slice(offset, offset + 256), { deadlineMs: 60000 }); return receipt; }
function coreCapture(owner, normalizeRevision = false) {
  const captured = verifier.canonicalCore(owner.owner.root, { normalizeRevision });
  return { sha256: digest(captured.canonical), encounterSha256: digest(captured.encounterCanonical), revision: captured.revision, summary: captured.summary, derivedOrder: captured.derivedOrder, canonical: captured.canonical };
}
function fixtureAddons(api, kind) {
  const fields = ['title', 'body'], source = api.createSourceProvider({ fields }); let selected;
  if (kind === 'source') selected = [source, api.createSourcePhrases({ fields })];
  else if (kind === 'positions' || kind === 'offsets') selected = [source, api.createPositionProvider({ fields, offsets: kind === 'offsets' ? fields : [] }), api.createPositionPhrases({ fields })];
  else selected = [source, api.createPositionProvider({ fields: ['body'], offsets: ['body'] }), api.createPhrases({ fields: { title: 'source', body: 'positions' } })];
  selected.push(api.createFilters({ fields: ['tags', 'price', 'active'] }), api.createFacets({ fields: ['tags'] }), api.createInspector({ sourceFields: fields }));
  if (kind !== 'positions') {
    const providers = kind === 'source' ? { title: 'source', body: 'source' } : kind === 'offsets' ? { title: 'offsets', body: 'offsets' } : { title: 'source', body: 'offsets' };
    selected.push(api.createMatchEvidence({ fields: providers }), api.createSnippetEvidence({ fields: providers }));
  }
  return selected;
}
async function fixtures(api) {
  const output = [];
  for (const kind of ['source', 'positions', 'offsets', 'mixed']) {
    const configuration = () => ({ schema: fixtureSchema, addons: fixtureAddons(api, kind) });
    const owner = controlled(api, configuration()), receiver = controlled(api, configuration());
    try {
      await build(owner, fixtureRecords); const observations = [];
      for (const query of [...fixtureQueries, ...phraseCases.map((item, index) => ({ ...item, name: 'phrase-' + index }))]) {
        const captured = await verifier.capturePages(owner.facade, query.query, { expectedIds: query.ids, revision: 1 }); assert.equal(captured.complete, true); if (query.query?.kind === 'all' || query.query?.kind === 'eq') assert.ok(captured.hits.every(hit => hit.score === 0), 'nonlexical fixture score must be zero'); observations.push({ id: query.name, captured });
      }
      const range = { kind: 'extension', capability: 'numeric-range', version: 1, payload: { field: 'price', gte: 10, lte: 20 } };
      const facetOptions = { extensions: { facets: { fields: [{ field: 'tags', missing: true }] }, inspector: { ids: fixtureRecords.map(record => record.id), sourceFields: ['title', 'body'] } } };
      const facet = await owner.call('search', range, facetOptions);
      assert.deepEqual(facet.hits.map(hit => hit.id), ['a', 'b']);
      assert.deepEqual(data(facet.extensions.facets.fields[0]), { field: 'tags', buckets: [{ kind: 'value', value: null, count: 1 }, { kind: 'value', value: 'x', count: 1 }, { kind: 'value', value: 'y', count: 1 }], distinctValueTotal: 3, omittedBucketCount: 0 });
      const arithmetic = verifier.replayInspector(facet); observations.push({ id: 'literal-facets-inspector', result: facet, arithmetic });
      if (kind !== 'positions') {
        for (const [query, ranges] of Object.entries(titleRanges)) {
          const result = await owner.call('search', query, { extensions: { 'match-evidence': { ids: ['a', 'missing'], fields: ['title'] } } });
          assert.deepEqual(data(result.extensions['match-evidence'].documents[0].ranges), ranges); observations.push({ id: 'literal-offsets:' + query, result });
        }
        const result = await owner.call('search', 'file', { extensions: { snippets: { ids: ['a'], fields: ['title'] } } });
        assert.equal(result.extensions.snippets.documents[0].snippets[0].text, 'cafe\u0301 ﬁle ½'); assert.deepEqual(data(result.extensions.snippets.documents[0].snippets[0].highlights), [{ start: 6, end: 9 }]); observations.push({ id: 'literal-snippet', result });
      }
      const initialCore = coreCapture(owner, true), encoded = await owner.snapshot('exportSource');
      let recovery;
      {
        await receiver.call('add', { id: 'prior', text: { title: 'old state' } }); const receipt = await receiver.snapshot('restore', encoded);
        assert.equal(receipt.revision, 2); const restored = coreCapture(receiver, true); assert.equal(restored.sha256, initialCore.sha256);
        recovery = { receipt, completeSource: bulk.compareSourceSnapshots(encoded, await receiver.snapshot('exportSource')), root: { sha256: restored.sha256, encounterSha256: restored.encounterSha256 } };
      }
      const writes = [], initialIds = fixtureRecords.map(record => record.id);
      for (const [method, input, expectedIds, expectedPhraseIds] of [
        ['replace', replacement, initialIds, []], ['remove', 'b', initialIds.filter(id => id !== 'b'), []], ['add', addition, [...initialIds.filter(id => id !== 'b'), 'new'], ['new']],
      ]) {
        const receipt = await receiver.call(method, input), membership = await verifier.capturePages(receiver.facade, { kind: 'all' }, { expectedIds, revision: receipt.revision });
        const phrases = await verifier.capturePages(receiver.facade, phrase('red blue'), { expectedIds: expectedPhraseIds, revision: receipt.revision }); assert.equal(membership.complete, true); assert.ok(membership.hits.every(hit => hit.score === 0), 'all-query score must be zero'); assert.equal(phrases.complete, true);
        const core = coreCapture(receiver); writes.push({ method, receipt, membership, phrases, core });
      }
      output.push({ kind, observations, initialCore, recovery, writes, outcome: 'Pass' });
    } finally { await owner.close(); await receiver.close(); }
  }
  return output;
}
async function collectCase(consumer, variant, family, size, output) {
  const api = await installed(consumer), workload = verifyFrozen(workloadFor(family, size));
  const owner = controlled(api, { schema, addons: [api.createSourceProvider({ fields: ['body'] }), api.createSourcePhrases({ fields: ['body'] }), api.createInspector({ sourceFields: ['body'] }), api.createFacets({ fields: ['group'] })] });
  const report = { kind: 'rx8009-controlled-semantic-case-v1', variant, family, size, pid: process.pid, identity: workload.identity, runtime: { node: process.version, versions: process.versions },
    method: 'Same installed production engine, captured normal configuration/default limits and public facade operations. Private queued zero-clock host drains non-deadline tasks. No real wall/CPU/deadline/fairness claim.', queries: [], outcome: 'Running' };
  try {
    const receipt = await build(owner, workload.records); report.receipt = receipt;
    for (const query of workload.queries) {
      const captured = await verifier.capturePages(owner.facade, query.query, { expectedIds: query.expectedIds, revision: receipt.revision, expectedError: query.expectedError });
      report.queries.push({ id: query.id, expectedError: query.expectedError ?? null, capture: captured });
      if (!query.expectedError && !captured.complete) assert.equal(captured.outcome, 'Refused', 'unexpected non-resource semantic failure');
      if (captured.complete && query.id === 'negative-only') assert.ok(captured.hits.every(hit => hit.score === 0), 'negative-only ranking has no positive contribution');
    }
    report.selected = [];
    const recordsById = new Map(workload.records.map(record => [record.id, record]));
    for (const query of workload.queries) {
      const eligible = new Set(query.expectedIds), nonmatch = workload.records.find(record => !eligible.has(record.id));
      const ids = [...new Set([query.expectedIds[0], query.expectedIds.at(-1), nonmatch?.id, 'n9missing'].filter(id => id !== undefined))];
      // Fill any remaining bounded slots with literal existing IDs, retaining
      // first/last matches, a nonmatch and an absent ID whenever available.
      for (const record of workload.records) { if (ids.length === 4) break; if (!ids.includes(record.id)) ids.push(record.id); }
      assert.ok(ids.length <= 4);
      try {
        const result = await owner.call('search', query.query, { limit: 20, deadlineMs: 60000, extensions: { inspector: { ids, maxFacts: 512, sourceFields: ['body'] }, facets: { fields: [{ field: 'group', missing: true }] } } });
        assert.equal(query.expectedError, undefined, 'declared broad expansion refusal unexpectedly succeeded');
        assert.equal(result.revision, receipt.revision); assert.equal(result.model, 'raveldex-bm25-v1'); assert.equal(result.completeness, 'complete');
        assert.equal(result.total, query.expectedIds.length); assert.equal(result.hits.length, Math.min(20, query.expectedIds.length));
        assert.equal(new Set(result.hits.map(hit => hit.id)).size, result.hits.length); assert.ok(result.hits.every(hit => eligible.has(hit.id) && Number.isFinite(hit.score)));
        const expectedBuckets = Array.from({ length: 5 }, (_, index) => ({ kind: 'value', value: 'g' + index, count: query.expectedIds.filter(id => recordsById.get(id).metadata.group === 'g' + index).length })).filter(bucket => bucket.count > 0).sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
        const field = result.extensions.facets.fields[0]; assert.deepEqual(data(field.buckets), expectedBuckets); assert.equal(field.distinctValueTotal, expectedBuckets.length); assert.equal(field.omittedBucketCount, 0);
        assert.deepEqual(result.extensions.inspector.documents.map(document => document.id), ids);
        for (const document of result.extensions.inspector.documents) {
          const record = recordsById.get(document.id); assert.equal(document.exists, !!record); assert.equal(document.eligibility, !record ? 'absent' : eligible.has(document.id) ? 'matched' : 'excluded');
          if (record) {
            assert.equal(document.source.status, 'available'); assert.equal(document.source.fields.body.status, 'available');
            assert.deepEqual(data(document.source.fields.body.values), Array.isArray(record.text.body) ? record.text.body : [record.text.body]);
          } else assert.deepEqual(data(document.source), { status: 'unavailable', reason: 'record-absent' });
        }
        if (query.id === 'negative-only') assert.ok(result.hits.every(hit => hit.score === 0), 'negative-only selected score must be zero');
        report.selected.push({ id: query.id, ids, outcome: 'Pass', result, arithmetic: verifier.replayInspector(result) });
      } catch (error) {
        const typed = verifier.errorData(error);
        if (query.expectedError) { assert.equal(typed.code, query.expectedError.code); assert.equal(typed.details?.path, query.expectedError.path); }
        else if (verifier.classify(typed) !== 'Refused') throw error;
        report.selected.push({ id: query.id, ids, outcome: verifier.classify(typed), error: typed });
      }
    }
    const core = coreCapture(owner); const file = output.replace(/\.json$/, '.core.json'); await writeFile(file, core.canonical); delete core.canonical; report.core = { ...core, canonicalFile: file.split('/').at(-1) };
    if (family === 'adversarial' && size === 100) report.fixtures = await fixtures(api);
    report.host = { resumes: owner.host.resumes, pending: owner.host.pending, clock: 0 }; report.outcome = 'Collected';
  } catch (error) { report.outcome = 'Fail'; report.failure = verifier.errorData(error); throw error; }
  finally { await owner.close(); await writeFile(output, JSON.stringify(report, null, 2) + '\n'); }
}
function compareFixture(a, b) {
  assert.equal(a.kind, b.kind); assert.equal(a.observations.length, b.observations.length);
  const findings = [];
  for (let i = 0; i < a.observations.length; i++) {
    const x = a.observations[i], y = b.observations[i]; assert.equal(x.id, y.id);
    const comparison = x.captured ? verifier.compareCaptures(x.captured, y.captured, { allowInspectorWorkChange: true, allowCapacityTransition: true }) : verifier.compareResults(x.result, y.result, { allowInspectorWorkChange: true });
    findings.push({ id: x.id, comparison });
  }
  assert.equal(a.initialCore.sha256, b.initialCore.sha256); assert.deepEqual(a.recovery, b.recovery);
  assert.equal(a.writes.length, b.writes.length);
  for (let i = 0; i < a.writes.length; i++) { const x = a.writes[i], y = b.writes[i]; assert.equal(x.method, y.method); assert.deepEqual(x.receipt, y.receipt); assert.equal(x.core.sha256, y.core.sha256); assert.equal(x.core.encounterSha256, y.core.encounterSha256); verifier.compareCaptures(x.membership, y.membership); verifier.compareCaptures(x.phrases, y.phrases); }
  return { kind: a.kind, observations: findings, stateParity: 'Pass', laterWrites: 3 };
}
export function compareSemanticRows(rows) {
  const comparisons = [];
  assert.equal(new Set(rows.map(row => row.pid)).size, rows.length, 'fresh semantic child process per case');
  for (const row of rows) { assert.equal(row.outcome, 'Collected'); assert.equal(row.host.pending, 0); const queryIds = verifyFrozen(workloadFor(row.family, row.size)).queries.map(query => query.id); assert.deepEqual(row.queries.map(query => query.id), queryIds); assert.deepEqual(row.selected.map(query => query.id), queryIds); }
  for (const family of FAMILIES) for (const size of SIZES) for (const [intervention, before, after] of PAIRS) {
    if (family !== 'adversarial' && intervention !== 'combined') continue;
    const a = rows.find(row => row.variant === before && row.family === family && row.size === size), b = rows.find(row => row.variant === after && row.family === family && row.size === size); assert.ok(a && b, 'missing semantic pair');
    assert.equal(a.core.sha256, b.core.sha256, 'full core/source/sidecar state differs'); assert.equal(a.core.encounterSha256, b.core.encounterSha256, 'native encounter order differs'); assert.deepEqual(a.receipt, b.receipt);
    const queries = a.queries.map((query, index) => { assert.equal(query.id, b.queries[index].id); return { id: query.id, comparison: verifier.compareCaptures(query.capture, b.queries[index].capture, { allowInspectorWorkChange: true, allowCapacityTransition: true }) }; });
    const selected = a.selected.map((query, index) => { const other = b.selected[index]; assert.equal(query.id, other.id); assert.deepEqual(query.ids, other.ids); return { id: query.id, comparison: verifier.compareOutcomes(query, other, { allowInspectorWorkChange: true, allowCapacityTransition: true }) }; });
    const fixtures = a.fixtures ? a.fixtures.map((fixture, index) => compareFixture(fixture, b.fixtures[index])) : [];
    comparisons.push({ intervention, family, size, queries, selected, fixtures, core: 'Pass', encounterOrder: 'Pass' });
  }
  return comparisons;
}
async function main() {
  assert.equal(process.argv.length, 4, 'usage: node bench/n9/paired-semantics.mjs MANIFEST FRESH_OUTPUT');
  const manifest = JSON.parse(await readFile(process.argv[2], 'utf8')), requested = resolve(process.argv[3]); assert.deepEqual(Object.keys(manifest.variants).sort(), ['baseline', 'combined', 'planning', 'prefix', 'ranking', 'scheduling']); await mkdir(requested); const output = await realpath(requested), repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const harnessPaths = ['bench/n9/paired-semantics.mjs', 'bench/n9/paired-verify.mjs', 'bench/n9/bulk-verify.mjs', 'bench/n9/paired-node.mjs', 'bench/n9/workloads.mjs', 'bench/n9/run.mjs', 'test/fixtures/snapshots/records.mjs', 'test/fixtures/n9/freeze.json', 'test/fixtures/relevance/corpus.json'];
  const harness = await Promise.all(harnessPaths.map(async path => ({ path, sha256: digest(await readFile(join(repo, path))) }))), packages = {};
  for (const [variant, item] of Object.entries(manifest.variants)) { const root = join(await realpath(item.consumer), 'node_modules/@vmitsaras/raveldex'); packages[variant] = { root, inventory: await inventory(root), artifact: item.artifact }; }
  const report = { kind: 'rx8009-controlled-semantic-v1', manifest, startedAt: new Date().toISOString(), harness, packages, runs: [], method: 'Separate exact semantic verification on same installed package through private controlled queued host with clock0. Normal limits retained; deadlines do not expire. Not ordinary timing/CPU/fairness evidence.', outcome: 'Running' }, rows = [];
  const sizes = process.env.RAVELDEX_N9_SEMANTIC_SIZES?.split(',').map(Number) ?? SIZES, families = process.env.RAVELDEX_N9_SEMANTIC_FAMILIES?.split(',') ?? FAMILIES;
  assert.ok(sizes.length && families.length && new Set(sizes).size === sizes.length && new Set(families).size === families.length && sizes.every(size => SIZES.includes(size)) && families.every(family => FAMILIES.includes(family)));
  try {
    for (const family of families) for (const size of sizes) for (const [variant, item] of Object.entries(manifest.variants)) {
      if (family !== 'adversarial' && !['baseline', 'combined'].includes(variant)) continue;
      const name = [family, size, variant].join('-'), file = join(output, name + '.json'), args = [fileURLToPath(import.meta.url), '--child', item.consumer, variant, family, String(size), file]; let log = '';
      const code = await new Promise((yes, no) => { const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] }); child.stdout.on('data', chunk => log += chunk); child.stderr.on('data', chunk => log += chunk); child.on('error', no); child.on('close', yes); });
      await writeFile(join(output, name + '.txt'), log); report.runs.push({ variant, family, size, output: name + '.json', command: [process.execPath, ...args], exitCode: code }); await writeFile(join(output, 'progress.json'), JSON.stringify(report, null, 2) + '\n'); assert.equal(code, 0, name + ' failed'); rows.push(JSON.parse(await readFile(file, 'utf8'))); console.log(JSON.stringify({ name, outcome: 'Collected' }));
    }
    if (sizes.length === 3 && families.length === 3) { assert.equal(rows.length, 30); report.comparisons = compareSemanticRows(rows); }
    report.outcome = 'Collected';
  } catch (error) { report.outcome = 'Fail'; report.failure = verifier.errorData(error); throw error; }
  finally {
    try { for (const entry of Object.values(packages)) { assert.deepEqual(await inventory(entry.root), entry.inventory, 'installed package drift'); entry.unchanged = true; } for (const pin of harness) assert.equal(digest(await readFile(join(repo, pin.path))), pin.sha256, 'semantic harness drift'); }
    catch (error) { report.outcome = 'Fail'; report.guardFailure = verifier.errorData(error); throw error; }
    finally { report.finishedAt = new Date().toISOString(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
  }
}
if (process.argv[2] === '--child') await collectCase(process.argv[3], process.argv[4], process.argv[5], Number(process.argv[6]), process.argv[7]);
else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
