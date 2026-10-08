/** Optional explicit client entry. No worker is constructed on import. */
export { createWorkerRaveldex } from './client.js';
export { WorkerAdapterError, WORKER_ERROR_CODES } from './error.js';
export type { WorkerErrorCode, WorkerErrorDetails } from './error.js';
export type { WorkerOptions, WorkerEndpoint, WorkerRaveldex, MutationPromise, MutationReceipt, WireError } from './types.js';
