import { serveRaveldexWorker } from '@vmitsaras/raveldex/adapters/worker/host';
import type { WorkerScope, WorkerHostOptions, WorkerHostHandle } from '@vmitsaras/raveldex/adapters/worker/host';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
const scope: WorkerScope = self;
const options = { addons: [createSourceProvider({ fields: ['title'] }), createSourcePhrases({ fields: ['title'] })] } as const satisfies WorkerHostOptions;
const host: WorkerHostHandle = serveRaveldexWorker(scope, options);
const disposal: Promise<void> = host.dispose();
void disposal;
// @ts-expect-error A worker scope must implement its messaging/listener contract.
serveRaveldexWorker({});
// @ts-expect-error This host consumer has only WebWorker types, with no browser document.
const documentAccess: Document = document;
void documentAccess;
