import { createRaveldex } from '@vmitsaras/raveldex';
import { createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';
import { createIndexedDBPersistence } from '@vmitsaras/raveldex/adapters/indexeddb';
import { createWorkerSnapshots } from '@vmitsaras/raveldex/adapters/worker/snapshots';
import { createWorkerRaveldex } from '@vmitsaras/raveldex/adapters/worker';

const configuration = { schema: { text: { body: {} } } };
const engine = createRaveldex(configuration);
const snapshots = createSnapshots(engine);
const persistence = createIndexedDBPersistence(snapshots, { databaseName: 'declared-db', namespace: 'declared-namespace', indexedDB, format: 'source' });
const saved = await persistence.save({ expectedGeneration: null });
const generation: string = saved.generation;
await persistence.load({ signal: new AbortController().signal, deadlineMs: 100 });
await persistence.erase({ expectedGeneration: generation });
await persistence.dispose();
// @ts-expect-error Writes require an explicit observed generation.
await persistence.save();
// @ts-expect-error Erasure requires an explicit observed generation.
await persistence.erase({});
// @ts-expect-error Durable receipt cannot be mutated.
saved.generation = 'changed';
// @ts-expect-error Core has no automatic save/storage method.
engine.save();
// @ts-expect-error Unsupported format cannot become a native promise.
createIndexedDBPersistence(snapshots, { databaseName: 'db', namespace: 'ns', format: 'foreign' });
const remote = await createWorkerRaveldex({ worker: new Worker('/owner.mjs', { type: 'module' }), configuration, sameHost: true, ownership: 'owned' });
const workerSnapshots = createWorkerSnapshots(remote);
await workerSnapshots.exportSource();
// @ts-expect-error Browser worker qualification does not expose native export.
workerSnapshots.exportNative();
await createIndexedDBPersistence(workerSnapshots, { databaseName: 'db', namespace: 'worker' }).load();
