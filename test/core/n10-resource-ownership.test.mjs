import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnedRaveldex, getExecutionOwner } from '../../dist/core/execution/engine.js';
import { captureConfiguration } from '../../dist/core/contracts/schema.js';
import { inspectIndex } from '../../dist/core/index/invariants.js';
import { createSnapshots } from '../../dist/adapters/snapshots/index.js';
import { createSourceProvider } from '../../dist/addons/phrases/index.js';
import { createPositionProvider } from '../../dist/addons/positions/index.js';
import { FakeHost, FakeSignal } from '../fixtures/execution/host.mjs';
import { alter } from '../fixtures/snapshots/integrity.mjs';

class CountedHost extends FakeHost {
  disposals = 0;
  dispose() { this.disposals++; assert.equal(this.pending, 0); }
}
function fixture() {
  const host = new CountedHost(), metrics = { workUnits: 0, steps: 0, hostYields: 0, maxTaskWorkUnits: 0, maxStepWorkUnits: 0, checks: 0, phaseChecks: {} };
  const configuration = captureConfiguration({ schema: { text: { body: {} } },
    addons: [createSourceProvider({ fields: ['body'] }), createPositionProvider({ fields: ['body'], offsets: ['body'] })],
    limits: { checkpointWorkUnits: 1 } });
  const engine = createOwnedRaveldex(configuration, host, metrics);
  return { host, metrics, engine, owner: getExecutionOwner(engine), snapshots: createSnapshots(engine) };
}
const observed = pending => pending.then(value => ({ value }), error => ({ error }));
async function settled(f, pending) { const result = observed(pending); f.host.runReady(); return result; }
function clean(f, signal) {
  assert.equal(f.host.pending, 0, 'no owned continuation/deadline tasks after settlement');
  if (signal) assert.equal(signal.listenerCount, 0, 'no caller signal listener after settlement');
}
function valid(f) {
  const cursor = inspectIndex(f.owner.root); while (!cursor.next().done) {}
  for (const sidecar of Object.values(f.owner.root.participants)) assert.equal(sidecar.revision, f.owner.root.revision);
}
function pauseAt(f, phase, previous) {
  for (let turns = 0; (f.metrics.phaseChecks[phase] ?? 0) <= previous; turns++) {
    assert.ok(turns < 100_000, 'bounded phase probe did not reach its checkpoint');
    assert.equal(f.host.runNext(), true, 'operation ended before requested suspended phase');
  }
  assert.ok(f.host.pendingResumes > 0, 'phase must be suspended before its terminal outcome');
}

test('repeated bulk success/refusal and live-query/bulk cancellation release observable ownership before reuse and disposal', async () => {
  const donor = fixture(), receiver = fixture();
  const records = Array.from({ length: 6 }, (_, i) => ({ id: `doc${i}`, text: { body: `common red blue term${i}` } }));
  try {
    assert.equal((await settled(donor, donor.engine.addMany(records))).error, undefined);
    const exported = await settled(donor, donor.snapshots.exportSource()); assert.equal(exported.error, undefined);
    const encoded = exported.value;
    const malformed = alter(encoded, envelope => envelope.body.payload.records.push(envelope.body.payload.records[0]));
    for (let cycle = 0; cycle < 8; cycle++) {
      const restored = await settled(receiver, receiver.snapshots.restore(encoded)); assert.equal(restored.error, undefined);
      valid(receiver); clean(receiver);
      const root = receiver.owner.root, sidecars = root.participants;
      const bad = await settled(receiver, receiver.snapshots.restore(malformed));
      assert.equal(bad.error?.reason, 'INVALID_NATIVE_STATE');
      assert.equal(receiver.owner.root, root); assert.equal(receiver.owner.root.participants, sidecars); clean(receiver);

      // Selection follows an actually scored document, with its query-local
      // ranking context alive. Abandoning that cursor must release scheduling.
      const querySignal = new FakeSignal(), selected = receiver.metrics.phaseChecks.selection ?? 0;
      const query = observed(receiver.engine.search('common', { signal: querySignal }));
      pauseAt(receiver, 'selection', selected); querySignal.stop();
      assert.equal((await query).error?.code, 'CANCELLED');
      assert.equal(receiver.owner.root, root); clean(receiver, querySignal);

      // Exact first-party source+positions staging is still unpublished when
      // its participant sealing phase yields. Repeat this after late refusal.
      const restoreSignal = new FakeSignal(), sealed = receiver.metrics.phaseChecks['snapshot.source.participant-finalization'] ?? 0;
      const abandoned = observed(receiver.snapshots.restore(encoded, { signal: restoreSignal }));
      pauseAt(receiver, 'snapshot.source.participant-finalization', sealed); restoreSignal.stop();
      assert.equal((await abandoned).error?.code, 'CANCELLED');
      assert.equal(receiver.owner.root, root); assert.equal(receiver.owner.root.participants, sidecars); clean(receiver, restoreSignal);
      const found = await settled(receiver, receiver.engine.search('common'));
      assert.equal(found.error, undefined); assert.equal(found.value.total, records.length); valid(receiver); clean(receiver);
      const source = await settled(receiver, receiver.snapshots.exportSource());
      assert.deepEqual(JSON.parse(source.value).body.payload.records, JSON.parse(encoded).body.payload.records);
      clean(receiver);
    }
    const signal = new FakeSignal(), sealed = receiver.metrics.phaseChecks['snapshot.source.participant-finalization'] ?? 0;
    const abandoned = observed(receiver.snapshots.restore(encoded, { signal }));
    pauseAt(receiver, 'snapshot.source.participant-finalization', sealed);
    const disposal = receiver.engine.dispose(); assert.equal(receiver.engine.dispose(), disposal); await disposal;
    assert.equal((await abandoned).error?.code, 'DISPOSED');
    assert.equal(receiver.owner.root, undefined); clean(receiver, signal); assert.equal(receiver.host.disposals, 1);
  } finally {
    await donor.engine.dispose(); await receiver.engine.dispose();
    assert.equal(donor.owner.root, undefined); assert.equal(receiver.owner.root, undefined);
    clean(donor); clean(receiver); assert.equal(donor.host.disposals, 1); assert.equal(receiver.host.disposals, 1);
  }
});
