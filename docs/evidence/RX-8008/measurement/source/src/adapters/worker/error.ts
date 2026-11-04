/** Transport failures are distinct from authoritative native engine errors. */
export const WORKER_ERROR_CODES = Object.freeze([
  'INVALID_TRANSPORT', 'TRANSPORT_LIMIT', 'INCOMPATIBLE_WORKER', 'TIMEOUT',
  'TERMINATED', 'STARTUP_FAILED', 'OUTCOME_UNKNOWN', 'DISPOSED',
] as const);
export type WorkerErrorCode = typeof WORKER_ERROR_CODES[number];
export interface WorkerErrorDetails { readonly path?: string; readonly operationId?: string; readonly limit?: number; readonly actual?: number }
export class WorkerAdapterError extends Error {
  readonly code: WorkerErrorCode;
  readonly details: Readonly<WorkerErrorDetails>;
  readonly operationId: string | undefined;
  constructor(code: WorkerErrorCode, details: WorkerErrorDetails = {}) {
    super(`Raveldex worker: ${code}`);
    this.name = 'WorkerAdapterError'; this.code = code;
    this.operationId = details.operationId;
    this.details = Object.freeze({ ...details });
  }
}
