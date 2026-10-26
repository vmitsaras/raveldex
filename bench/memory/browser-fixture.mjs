// Measurement application. Uses installed public APIs; never retains envelopes.
import { createWorkerRaveldex } from '@vmitsaras/raveldex/adapters/worker';
import { createWorkerSnapshots } from '@vmitsaras/raveldex/adapters/worker/snapshots';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { recordsFor, updatedRecord, schema, QUERY_ROWS, checkPage } from './cost-fixture.mjs';

const deadlineMs = 60000;
let worker, engine, snapshots, records, encoded, size, replaced = false;
const transport = [];
function shape(message, direction, argumentCount) {
  transport.push({ direction, argumentCount, operation: message?.operation ?? null, kind: message?.kind ?? null,
    inputStringCodeUnits: typeof message?.payload?.input === 'string' ? message.payload.input.length : null,
    valueStringCodeUnits: typeof message?.value === 'string' ? message.value.length : null });
}
window.memoryHarness = {
  async start() {
    worker = new Worker(new URL('./memory-worker.mjs', import.meta.url), { type: 'module' });
    worker.addEventListener('message', event => shape(event.data, 'worker-to-main', null));
    const endpoint = {
      postMessage(...args) { shape(args[0], 'main-to-worker', args.length); worker.postMessage(...args); },
      addEventListener: worker.addEventListener.bind(worker), removeEventListener: worker.removeEventListener.bind(worker), terminate: worker.terminate.bind(worker),
    };
    // External ownership keeps the disposed worker alive for its final reading.
    engine = await createWorkerRaveldex({ worker: endpoint, configuration: { schema, addons: [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })] },
      ownership: 'external', sameHost: true, responseTimeoutMs: 120000 });
    snapshots = createWorkerSnapshots(engine);
  },
  makeInput(count) { size = count; records = recordsFor(size); },
  async build() {
    for (let offset = 0; offset < size; offset += 256) await engine.addMany(records.slice(offset, offset + 256), { deadlineMs });
    records = undefined;
  },
  async replace() { await engine.replace(updatedRecord, { deadlineMs }); replaced = true; },
  async exportSource() { encoded = await snapshots.exportSource({ deadlineMs }); return { codeUnits: encoded.length }; },
  async priorReceiver() { await engine.clear({ deadlineMs }); await engine.add({ id: 'prior', text: { body: 'prior state' } }, { deadlineMs }); },
  async restoreSource() {
    try { return { outcome: 'Pass', result: await snapshots.restore(encoded, { deadlineMs }) }; }
    catch (error) { return { outcome: 'Rejected', error: { name: error.name, code: error.code ?? null, reason: error.reason ?? null } }; }
  },
  async verify(prior = false) {
    if (prior) {
      const found = await engine.search({ kind: 'all' }, { limit: 20, deadlineMs });
      if (found.total !== 1 || found.hits.length !== 1 || found.hits[0].id !== 'prior' || found.completeness !== 'complete') throw Error('Prior receiver not preserved');
      return [{ total: 1, ids: ['prior'], revision: found.revision }];
    }
    const expected = recordsFor(size); if (replaced) expected[0] = updatedRecord;
    const rows = [];
    for (const query of QUERY_ROWS) rows.push(checkPage(await engine.search(query.query, { limit: 20, deadlineMs }), expected, query));
    if (new Set(rows.map(row => row.revision)).size !== 1) throw Error('Incoherent verification revision');
    return rows;
  },
  releaseEncoding() { encoded = undefined; },
  transport() { return transport; },
  async dispose() { await engine.dispose(); engine = snapshots = records = encoded = undefined; },
  terminate() { worker?.terminate(); worker = undefined; },
};
