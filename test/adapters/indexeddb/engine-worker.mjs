import { serveSnapshotRaveldexWorker } from '@vmitsaras/raveldex/adapters/worker/snapshots/host';
import { addonsFor } from './configuration.mjs';
serveSnapshotRaveldexWorker(self, { addons: addonsFor() });
