import { serveSnapshotRaveldexWorker } from '@vmitsaras/raveldex/adapters/worker/snapshots/host';
import { addonsFor } from './browser-config.mjs';
const strategy = new URL(import.meta.url).searchParams.get('strategy') ?? 'source';
serveSnapshotRaveldexWorker(self, { addons: addonsFor(strategy) });
