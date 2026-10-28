import { createWorkerRaveldex } from '@vmitsaras/raveldex/adapters/worker';
import { createWorkerSnapshots } from '@vmitsaras/raveldex/adapters/worker/snapshots';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { recordsFor, schema } from './cost-fixture.mjs';
import { observeMessages } from './message-observer.mjs';
const worker = new Worker('/message-worker.mjs', { type: 'module' });
const observation = observeMessages(worker, 'main');
let engine, snapshots, encoded, size = 0;
const deadlineMs = 60000;
const ready = (async () => {
  engine = await createWorkerRaveldex({ worker: observation.endpoint, ownership: 'external', sameHost: true,
    responseTimeoutMs: 120000, configuration: { schema,
      addons: [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })] } });
  snapshots = createWorkerSnapshots(engine);
})();
window.messageControl = {
  ready: () => ready,
  async build(count) {
    await ready;
    if (![4, 1000, 10000].includes(count) || size) throw Error('Unsupported build state');
    const records = recordsFor(count);
    for (let i = 0; i < count; i += 256) await engine.addMany(records.slice(i, i + 256), { deadlineMs });
    size = count;
    return { size, revision: Math.ceil(count / 256) };
  },
  async run(kind) {
    await ready;
    if (kind === 'empty') return engine.addMany([], { deadlineMs });
    if (kind === 'search') {
      const result = await engine.search('red', { limit: 20, deadlineMs });
      if (result.total !== size || result.completeness !== 'complete' ||
          result.hits.length !== Math.min(20, size) || result.hits.some(hit => !Number.isFinite(hit.score)))
        throw Error('Literal query verification failed');
      return result;
    }
    if (kind === 'export') {
      encoded = await snapshots.exportSource({ deadlineMs });
      return { codeUnits: encoded.length, encodedLengthIsNotMemory: true };
    }
    if (kind === 'prior') {
      await engine.clear({ deadlineMs });
      await engine.add({ id: 'prior', text: { body: 'prior state' }, metadata: { group: 'prior' } }, { deadlineMs });
      return engine.search({ kind: 'all' }, { deadlineMs });
    }
    if (kind === 'restore') {
      if (typeof encoded !== 'string') throw Error('Export must precede restore');
      return snapshots.restore(encoded, { deadlineMs });
    }
    if (kind === 'dispose') { await engine.dispose(); engine = snapshots = encoded = undefined; return { disposed: true }; }
    throw Error('Unknown operation');
  },
  observation: () => observation.snapshot(),
  release() { encoded = undefined; return { encodedReleased: true }; },
  terminate() { worker.terminate(); return { terminated: true }; },
};
