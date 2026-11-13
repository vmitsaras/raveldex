import { createRaveldex } from '@vmitsaras/raveldex';
import type { Raveldex, Configuration } from '@vmitsaras/raveldex';
import { createWorkerRaveldex, WorkerAdapterError } from '@vmitsaras/raveldex/adapters/worker';
import type { WorkerEndpoint, WorkerRaveldex, MutationPromise, MutationReceipt } from '@vmitsaras/raveldex/adapters/worker';
import { serveRaveldexWorker } from '@vmitsaras/raveldex/adapters/worker/host';
import type { WorkerScope } from '@vmitsaras/raveldex/adapters/worker/host';

const worker = new Worker(new URL('./engine-worker.mjs', import.meta.url), { type: 'module' });
const endpoint: WorkerEndpoint = worker;
const config = { schema: { text: { title: {} } } } as const satisfies Configuration;
const owner: WorkerRaveldex = await createWorkerRaveldex({ worker: endpoint, configuration: config, ownership: 'owned', sameHost: true });
const publicEngine: Raveldex = owner;
const mutation: MutationPromise = owner.add({ id: 'one', text: { title: 'red' } });
const operationId: string = mutation.operationId;
const receipt: MutationReceipt = await owner.reconcile(operationId);
if (receipt.status === 'committed') { const revision: number = receipt.result.revision; void revision; }
if (receipt.status === 'rejected') { const code: string = receipt.error.code; void code; }
const disposed: Promise<void> = owner.destroy();
void publicEngine; void receipt; void disposed;
const error = new WorkerAdapterError('OUTCOME_UNKNOWN', { operationId });
const unknownId: string | undefined = error.operationId; void unknownId;
// @ts-expect-error Operation identities are readonly.
mutation.operationId = 'changed';
// @ts-expect-error Explicit worker ownership is required.
createWorkerRaveldex({ worker, configuration: config, sameHost: true });
// @ts-expect-error Unqualified cross-host compatibility is not a supported assertion.
createWorkerRaveldex({ worker, configuration: config, ownership: 'owned', sameHost: false });
// @ts-expect-error Importing core exposes no worker construction helper.
import { createWorkerRaveldex as coreWorker } from '@vmitsaras/raveldex';
void coreWorker;
const direct: Raveldex = createRaveldex(config); void direct;
declare const scope: WorkerScope;
const host: { dispose(): Promise<void> } = serveRaveldexWorker(scope, {});
void host;
