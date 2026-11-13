import { serveSnapshotRaveldexWorker } from '@vmitsaras/raveldex/adapters/worker/snapshots/host';
import { createIndexedDBPersistence } from '@vmitsaras/raveldex/adapters/indexeddb';
import { createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';
import { createRaveldex } from '@vmitsaras/raveldex';
// @ts-expect-error Private callback host construction is excluded from the public host entry.
import { serveWorkerWithSnapshots } from '@vmitsaras/raveldex/adapters/worker/host';
serveSnapshotRaveldexWorker(self);
// @ts-expect-error The public snapshot host does not accept private owner callbacks.
serveSnapshotRaveldexWorker(self, {}, () => undefined);
const engine = createRaveldex({ schema: { text: { body: {} } } });
await createIndexedDBPersistence(createSnapshots(engine), { databaseName: 'worker-owned-db', namespace: 'worker', indexedDB }).load();
// @ts-expect-error Worker-only declarations do not need browser DOM.
document.querySelector('div');
