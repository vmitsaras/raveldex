import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, release, arch } from 'node:os';
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createPositionPhrases } from '@vmitsaras/raveldex/addons/phrases/positions';
import { createSnapshotRaveldex, createSnapshots, currentNodeSnapshotEnvironment } from '@vmitsaras/raveldex/adapters/snapshots';
import { METHOD, recordsFor, QUERY_ROWS, updatedRecord, schema, checkPage, summarizeRows, observe, notApplicable, features } from './cost-common.mjs';

const output = process.argv[2], installed = new URL('./node_modules/@vmitsaras/raveldex/', import.meta.url);
const qualification = { profileId: 'raveldex-rx4001-cost-local-node-v1', scope: 'exact-node-runtime', environment: currentNodeSnapshotEnvironment(),
  evidence: ['docs/evidence/RX-3002.md', 'test/adapters/snapshots/', 'docs/evaluation/RX-4001-cost-method.md'] };
const digest = value => createHash('sha256').update(value).digest('hex');
function configuration(mode) {
  const addons = mode === 'core-only' ? [] : mode === 'source-phrase' ?
    [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })] :
    [createPositionProvider({ fields: ['body'], offsets: ['body'] }), createPositionPhrases({ fields: ['body'] })];
  return { schema, addons };
}
const create = mode => mode === 'core-only' ? createRaveldex(configuration(mode)) : createSnapshotRaveldex(configuration(mode), { nativeQualification: qualification });
const observations = [], diagnostics = [];
const configurations = [
  { id: 'core-only', ...features, source: false, positions: false, offsets: false, phrases: false, ui: false, worker: false, storage: false,
    snapshot: 'Not Applicable: adapter omitted', profile: 'unqualified' },
  { id: 'source-phrase', ...features, source: ['body'], positions: false, offsets: false, phrases: 'strict source verification', ui: false, worker: false, storage: false,
    snapshot: ['source', 'native exact-local-qualified'], profile: qualification },
  { id: 'positions-offsets', ...features, source: false, positions: ['body'], offsets: ['body'], phrases: 'strict selected positions', ui: false, worker: false, storage: false,
    snapshot: ['native exact-local-qualified'], sourceExport: 'Not Applicable: original source omitted', profile: qualification },
];
const selectedModes = (process.env.RAVELDEX_COST_CONFIGURATIONS ?? configurations.map(row => row.id).join(',')).split(',');
const selectedSizes = (process.env.RAVELDEX_COST_SIZES ?? METHOD.sizes.join(',')).split(',').map(Number);
assert.ok(selectedModes.length > 0 && selectedModes.every(mode => configurations.some(row => row.id === mode)));
assert.ok(selectedSizes.length > 0 && selectedSizes.every(size => METHOD.sizes.includes(size)));
async function populate(engine, records) { for (let offset = 0; offset < records.length; offset += METHOD.batchSize) await engine.addMany(records.slice(offset, offset + METHOD.batchSize), { deadlineMs: METHOD.deadlineMs }); }
async function checkedQueries(engine, records, mode, samples) {
  for (const row of QUERY_ROWS) {
    if (mode === 'core-only' && row.requires === 'phrases') { samples.push({ operation: row.name, ...notApplicable('phrases capability omitted') }); continue; }
    // First owner-query observation precedes warmups. No lookup cache is assumed.
    const cold = await observe(samples, row.name, () => engine.search(row.query, { ...METHOD.requestedPage, deadlineMs: METHOD.deadlineMs }), { phase: 'fresh-index-first-call' });
    if (cold.error) continue; cold.sample.result = checkPage(cold.result, records, row);
    for (let warmup = 0; warmup < METHOD.queryWarmups; warmup++) checkPage(await engine.search(row.query, { ...METHOD.requestedPage, deadlineMs: METHOD.deadlineMs }), records, row);
    for (let repetition = 0; repetition < METHOD.queryRepetitions; repetition++) {
      const measured = await observe(samples, row.name, () => engine.search(row.query, { ...METHOD.requestedPage, deadlineMs: METHOD.deadlineMs }), { phase: 'warm-query', repetition });
      if (measured.result) measured.sample.result = checkPage(measured.result, records, row);
    }
  }
}
for (const { id: mode } of configurations.filter(row => selectedModes.includes(row.id))) for (const size of selectedSizes) for (let repetition = 0; repetition < METHOD.owners; repetition++) {
  const records = recordsFor(size), row = { configuration: mode, size, repetition, corpusSha256: digest(JSON.stringify(records)), samples: [] };
  observations.push(row); let engine;
  try {
    const made = await observe(row.samples, 'create-owner', () => create(mode)); if (made.error) continue; engine = made.result;
    const built = await observe(row.samples, 'build-admitted-batches', () => populate(engine, records)); if (built.error) continue;
    await checkedQueries(engine, records, mode, row.samples);
    const changed = await observe(row.samples, 'replace-one-record', () => engine.replace(updatedRecord, { deadlineMs: METHOD.deadlineMs }));
    if (changed.error) continue; row.samples.at(-1).result = changed.result;
    const changedRecords = [updatedRecord, ...records.slice(1)];
    row.updateVerification = checkPage(await engine.search('value7', METHOD.requestedPage), changedRecords, QUERY_ROWS[1]);
    if (mode === 'core-only') {
      row.samples.push({ operation: 'export', ...notApplicable('root-only owner excludes snapshots adapter') }, { operation: 'restore', ...notApplicable('root-only owner excludes snapshots adapter') });
    } else {
      const snapshots = createSnapshots(engine);
      for (const format of mode === 'source-phrase' ? ['Native', 'Source'] : ['Native']) {
        const exported = await observe(row.samples, `export${format}`, () => snapshots[`export${format}`]({ deadlineMs: METHOD.deadlineMs }));
        if (exported.error) { row.samples.push({ operation: `restore${format}`, outcome: 'Not run', reason: 'export rejected' }); continue; }
        exported.sample.encodedBytes = Buffer.byteLength(exported.result, 'utf8'); exported.sample.encodedCodeUnits = exported.result.length;
        const receiver = create(mode);
        try {
          await receiver.add({ id: 'prior', text: { body: 'prior state' } });
          const before = await receiver.search({ kind: 'all' }, { limit: 20 });
          const restored = await observe(row.samples, `restore${format}`, () => createSnapshots(receiver).restore(exported.result, { deadlineMs: METHOD.deadlineMs }));
          if (restored.result) {
            restored.sample.result = restored.result;
            row[`restored${format}Verification`] = [];
            for (const query of QUERY_ROWS) row[`restored${format}Verification`].push({ query: query.name,
              ...checkPage(await receiver.search(query.query, METHOD.requestedPage), changedRecords, query) });
          } else {
            const after = await receiver.search({ kind: 'all' }, { limit: 20 }); assert.deepEqual(after, before); restored.sample.oldStatePreserved = true;
          }
        } finally { await receiver.dispose(); }
      }
      if (mode === 'positions-offsets') row.samples.push({ operation: 'exportSource', ...notApplicable('source provider deliberately omitted') });
    }
  } finally { if (engine) await engine.dispose(); }
  console.log(JSON.stringify({ configuration: mode, size, repetition, rejected: row.samples.filter(sample => sample.outcome === 'Rejected').map(sample => ({ operation: sample.operation, error: sample.error })) }));
}

// Separate untimed observer passes. Installed-private seam is used only to count
// the actual same execution generators, never as a public consumer substitute.
const { getExecutionOwner } = await import(new URL('dist/core/execution/engine.js', installed));
function observer(engine) {
  const owner = getExecutionOwner(engine), admit = owner.admit.bind(owner); let active;
  assert.equal(typeof owner.admit, 'function');
  owner.admit = (capture, control) => admit(() => {
    const request = capture();
    return { ...request, *start(check) {
      const cursor = request.start(check);
      try {
        for (;;) {
          const step = cursor.next(); if (step.done) return step.value;
          if (active) { active.emittedSteps++; active.emittedWorkUnits += step.value.workUnits; active.maxEmittedStepWorkUnits = Math.max(active.maxEmittedStepWorkUnits, step.value.workUnits); }
          yield step.value;
        }
      } finally { cursor.return(undefined); }
    } };
  }, control);
  return async (operation, call) => {
    const previous = owner.root, measured = { operation, emittedSteps: 0, emittedWorkUnits: 0, maxEmittedStepWorkUnits: 0 }; active = measured;
    try { const result = await call(); measured.outcome = 'Pass'; return { result, measured }; }
    catch (error) { measured.outcome = 'Rejected'; measured.error = { name: error.name, code: error.code ?? null, reason: error.reason ?? null }; measured.oldRootPreserved = owner.root === previous; assert.equal(measured.oldRootPreserved, true); return { error, measured }; }
    finally { active = undefined; }
  };
}
for (const { id: mode } of configurations.filter(row => selectedModes.includes(row.id))) for (const size of selectedSizes) {
  const engine = create(mode), records = recordsFor(size), observeWork = observer(engine), row = { configuration: mode, size, operations: [] }; diagnostics.push(row);
  try {
    const built = await observeWork('build-admitted-batches', () => populate(engine, records)); row.operations.push(built.measured); if (built.error) continue;
    const root = getExecutionOwner(engine).root;
    row.retainedLogicalCounts = { ...root.counts, participants: Object.fromEntries(Object.entries(root.participants).map(([id, state]) => [id,
      Object.fromEntries(Object.entries(state).filter(([key, value]) => typeof value === 'number' && /count|entries|units|length|size/i.test(key))) ])) };
    for (const query of QUERY_ROWS.filter(query => mode !== 'core-only' || query.requires === 'core')) {
      const found = await observeWork(query.name, () => engine.search(query.query, { ...METHOD.requestedPage, deadlineMs: METHOD.deadlineMs })); row.operations.push(found.measured);
      if (found.result) checkPage(found.result, records, query);
    }
    const update = await observeWork('replace-one-record', () => engine.replace(updatedRecord, { deadlineMs: METHOD.deadlineMs })); row.operations.push(update.measured);
    if (mode !== 'core-only') for (const format of mode === 'source-phrase' ? ['Native', 'Source'] : ['Native']) {
      const encoded = await observeWork(`export${format}`, () => createSnapshots(engine)[`export${format}`]({ deadlineMs: METHOD.deadlineMs })); row.operations.push(encoded.measured);
      if (!encoded.result) continue;
      const receiver = create(mode), receiverWork = observer(receiver);
      try { await receiver.add({ id: 'prior', text: { body: 'prior state' } }); const restored = await receiverWork(`restore${format}`, () => createSnapshots(receiver).restore(encoded.result, { deadlineMs: METHOD.deadlineMs })); row.operations.push(restored.measured); }
      finally { await receiver.dispose(); }
    }
  } finally { await engine.dispose(); }
  console.log(JSON.stringify({ diagnostic: mode, size }));
}
const report = { kind: METHOD.version, generatedAt: new Date().toISOString(), package: JSON.parse(await readFile(new URL('package.json', installed), 'utf8')),
  environment: { node: process.version, versions: process.versions, os: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, logicalCPUs: cpus().length } },
  method: { ...METHOD, selectedModes, selectedSizes, timing: 'Uninstrumented public installed exports. One process, modules imported once before timing; fresh engine owner each repetition, not process/module cold. Fresh-index first query separately recorded. Two discarded warmups, five measured calls per query per owner. Timings ceil-rounded to whole milliseconds including owned scheduled yields, promises and complete exact-total/page work. No heap or physical latency qualification. Receivers are fresh owners containing a literal prior record before restore.',
    work: 'One separately untimed observer owner per configuration/size. Trusted installed-private ExecutionOwner.admit generator wrapper counts actual emitted work-v1 steps/units/max step, including failed operations until their last emitted step. A failing attempted charge need not be emitted. Timing comparisons exclude this wrapper. Counts/entries are logical diagnostics, not retained or peak heap.' },
  configurations, observations, summaries: summarizeRows(observations), diagnostics,
  limitations: ['Synthetic ASCII cycles are cost fixtures, not relevance data or general capacity qualification.', 'Same-process runs are temporally ordered, not randomized across operating-system states.', 'Sample maximum is a tail observation over 3 owner operations or 15 warm calls, not a population percentile.', 'Native snapshots use exact local Node qualification only; browser native snapshots remain unqualified.', 'Known source restoration work-limit failures remain rejected with preserved old state.', 'No UI rendering, physical paint, heap/GC, device, AT, disk power-loss or cross-browser qualification is claimed.'] };
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, ownerRows: observations.length, diagnosticRows: diagnostics.length }));
