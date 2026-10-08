import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createSnapshots, createSnapshotRaveldex, currentNodeSnapshotEnvironment } from '../dist/adapters/snapshots/index.js';
import { createSourceProvider } from '../dist/addons/phrases/source.js';
import { createPositionProvider } from '../dist/addons/positions/index.js';
import { getExecutionOwner } from '../dist/core/execution/engine.js';

const qualification = { profileId: 'raveldex-rx3002-local-node-v1', scope: 'exact-node-runtime', environment: currentNodeSnapshotEnvironment(), evidence: ['docs/evidence/RX-3002.md', 'test/adapters/snapshots/'] };
const modes = ['core', 'source', 'source-offsets'];
const sizes = (process.env.RAVELDEX_SNAPSHOT_SIZES ?? '100,1000,10000').split(',').map(Number);
assert.ok(sizes.every(size => Number.isSafeInteger(size) && size > 0 && size <= 10000));
const observations = [];
const memory = () => ({ ...process.memoryUsage() });
const collected = () => { globalThis.gc?.(); return memory(); };
function installCounter(engine) {
  const owner = getExecutionOwner(engine), original = owner.adapterOperation.bind(owner);
  let active;
  owner.adapterOperation = capture => original(configuration => {
    const request = capture(configuration);
    return { ...request, *start(...args) {
      const cursor = request.start(...args);
      try {
        for (;;) {
          const step = cursor.next();
          if (step.done) return step.value;
          if (active) {
            active.steps++; active.workUnits += step.value.workUnits;
            active.maxStepWorkUnits = Math.max(active.maxStepWorkUnits, step.value.workUnits);
            if (active.steps % 64 === 0) {
              const sample = memory(); active.sampleCount++;
              for (const key of Object.keys(sample)) active.sampledMaximum[key] = Math.max(active.sampledMaximum[key], sample[key]);
            }
          }
          yield step.value;
        }
      } finally { cursor.return(undefined); }
    } };
  });
  return async (name, call) => {
    const before = collected();
    const record = { operation: name, before, steps: 0, workUnits: 0, maxStepWorkUnits: 0, sampleCount: 0, sampledMaximum: { ...before } };
    active = record; let beforeRoot = owner.root; const start = performance.now();
    try {
      const result = await call();
      record.durationMs = Math.round(performance.now() - start);
      record.after = memory(); beforeRoot = undefined; record.afterCollection = collected(); record.outcome = 'Pass';
      return { result, record };
    } catch (error) {
      record.durationMs = Math.round(performance.now() - start); record.outcome = 'Rejected'; record.error = { code: error.code, reason: error.reason }; record.oldRootPreserved = owner.root === beforeRoot; assert.equal(record.oldRootPreserved, true); beforeRoot = undefined; record.after = memory(); record.afterCollection = collected(); if (!['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED', 'LIMIT_EXCEEDED'].includes(error.code)) throw error; return { error, record };
    } finally { active = undefined; }
  };
}
for (const mode of modes) for (const size of sizes) {
  const records = Array.from({ length: size }, (_, i) => ({ id: `item:${i}`, text: { body: `red blue echo echo value${i % 37}` }, metadata: { group: `group${i % 5}` } }));
  const addons = mode === 'core' ? [] : [createSourceProvider({ fields: ['body'] }), ...(mode === 'source-offsets' ? [createPositionProvider({ fields: ['body'], offsets: ['body'] })] : [])];
  const configuration = { schema: { text: { body: {} }, metadata: { group: { type: 'string' } } }, addons };
  const harnessBaseline = collected();
  const engine = createSnapshotRaveldex(configuration, { nativeQualification: qualification });
  const receiver = createSnapshotRaveldex(configuration, { nativeQualification: qualification });
  let native, source;
  try {
    for (let offset = 0; offset < records.length; offset += 256) await engine.addMany(records.slice(offset, offset + 256));
    await receiver.add({ id: 'old', text: { body: 'old state' } });
    const populated = collected(), exporter = createSnapshots(engine), importer = createSnapshots(receiver);
    const countExport = installCounter(engine), countImport = installCounter(receiver);
    const encoding = await countExport('exportNative', () => exporter.exportNative({ deadlineMs: 60000 })); native = encoding.result;
    const restore = typeof native === 'string' ? await countImport('restoreNative', () => importer.restore(native, { deadlineMs: 60000 })) : { record: { outcome: 'Not run', reason: 'Export rejected' } };
    if (restore.record.outcome === 'Pass') assert.equal((await receiver.search('red', { limit: 0 })).total, size);
    const row = { mode, size, corpusSha256: createHash('sha256').update(JSON.stringify(records)).digest('hex'), harnessBaseline, populated, native: { encodedBytes: typeof native === 'string' ? Buffer.byteLength(native) : null, encodedCodeUnits: native?.length ?? null, encoding: encoding.record, restoration: restore.record, result: restore.result } };
    if (mode !== 'core') {
      const encoded = await countExport('exportSource', () => exporter.exportSource({ deadlineMs: 60000 })); source = encoded.result;
      const rebuilt = typeof source === 'string' ? await countImport('restoreSource', () => importer.restore(source, { deadlineMs: 60000 })) : { record: { outcome: 'Not run', reason: 'Export rejected' } };
      if (rebuilt.record.outcome === 'Pass') assert.equal((await receiver.search('red', { limit: 0 })).total, size);
      row.source = { encodedBytes: typeof source === 'string' ? Buffer.byteLength(source) : null, encodedCodeUnits: source?.length ?? null, encoding: encoded.record, restoration: rebuilt.record, result: rebuilt.result };
    }
    observations.push(row);
    console.log(JSON.stringify({ mode, size, nativeBytes: row.native.encodedBytes, sourceBytes: row.source?.encodedBytes, nativeRestoreUnits: row.native.restoration.workUnits, sourceRestoreUnits: row.source?.restoration.workUnits, nativeRestoreOutcome: row.native.restoration.outcome, sourceRestoreOutcome: row.source?.restoration.outcome }));
  } finally { await engine.dispose(); await receiver.dispose(); native = undefined; source = undefined; }
  observations.at(-1).afterDisposalAndCollection = collected();
}
const report = { environment: qualification.environment, qualification, gcAvailable: typeof globalThis.gc === 'function', method: { samplesPerModeSize: 1, work: 'Actual private FIFO adapter generator yields counted; no production source rewrite or alternate codec.', processMemory: 'Node process.memoryUsage before, after, after explicit GC where --expose-gc is provided; sampled every 64 yielded steps. Harness records, two engines, old/staged/new roots and encoded strings share one process. Sampled maxima are observed only at yielded-step samples plus the pre-operation baseline, not continuous peaks or isolated component bytes. Post-operation readings are reported separately. Work counts report emitted yielded steps; a failing attempted charge may not be emitted.', limitations: 'Bounded operational rejections are retained as Rejected with their typed error and exact old-root preservation; they are not successful round trips. One raw sample per case, no latency qualification, browser heap, internal primitive peaks, allocation profiler, percentiles or universal capacity claim. Serialized bytes are UTF-8 JSON size; graph/object counts are not heap bytes.' }, observations };
const output = process.env.RAVELDEX_SNAPSHOT_COST_REPORT ?? '/tmp/raveldex-snapshot-costs.json';
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(`Wrote ${output}`);
