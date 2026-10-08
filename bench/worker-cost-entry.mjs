import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { serveSnapshotRaveldexWorker } from '@vmitsaras/raveldex/adapters/worker/snapshots/host';
serveSnapshotRaveldexWorker(self, { addons: [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })] });
