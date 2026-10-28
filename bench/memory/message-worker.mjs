import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { serveSnapshotRaveldexWorker } from '@vmitsaras/raveldex/adapters/worker/snapshots/host';
import { observeMessages } from './message-observer.mjs';
const observation = observeMessages(self, 'worker');
globalThis.messageObservation = () => observation.snapshot();
serveSnapshotRaveldexWorker(observation.endpoint, {
  addons: [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })],
});
