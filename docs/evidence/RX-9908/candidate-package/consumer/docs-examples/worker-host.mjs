import { serveSnapshotRaveldexWorker } from '@vmitsaras/raveldex/adapters/worker/snapshots/host';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';

// This file is the caller-selected module-worker entry, not an import in core.
serveSnapshotRaveldexWorker(self, { addons: [createSourceProvider({ fields: ['title'] })] });
