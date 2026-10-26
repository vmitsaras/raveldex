import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';
import {serveSnapshotRaveldexWorker} from '@vmitsaras/raveldex/adapters/worker/snapshots/host';
import {observeTransport} from './transport-observer.mjs';
const observation=observeTransport(self,'worker');
self.transportObservation=()=>observation.snapshot();
serveSnapshotRaveldexWorker(observation.endpoint,{addons:[createSourceProvider({fields:['body']}),createSourcePhrases({fields:['body']})]});
