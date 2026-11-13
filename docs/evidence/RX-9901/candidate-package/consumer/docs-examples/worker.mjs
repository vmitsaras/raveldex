import { createWorkerRaveldex } from '@vmitsaras/raveldex/adapters/worker';
import { createWorkerSnapshots } from '@vmitsaras/raveldex/adapters/worker/snapshots';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';

export async function runWorkerExample(workerURL) {
  const engine = await createWorkerRaveldex({
    worker: new Worker(workerURL, { type: 'module' }), ownership: 'owned', sameHost: true,
    configuration: { schema: { text: { title: {} } }, addons: [createSourceProvider({ fields: ['title'] })] },
  });
  try {
    const pending = engine.add({ id: 'a', text: { title: 'Atomic updates' } });
    const operationId = pending.operationId;
    await pending;
    const receipt = await engine.reconcile(operationId);
    const snapshots = createWorkerSnapshots(engine);
    const encoded = await snapshots.exportSource();
    await engine.clear();
    const restore = snapshots.restore(encoded);
    const restoreOperationId = restore.operationId;
    await restore;
    const restoreReceipt = await snapshots.reconcile(restoreOperationId);
    return { receipt, restoreReceipt, page: await engine.search('atomic') };
  } finally { await engine.destroy(); }
}
