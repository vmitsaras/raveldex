export const INDEXEDDB_ERROR_CODES = Object.freeze([
  'INVALID_OPTIONS', 'UNAVAILABLE', 'QUOTA_EXCEEDED', 'INCOMPATIBLE_DATABASE', 'BLOCKED', 'VERSION_CHANGED',
  'GENERATION_CONFLICT', 'CORRUPT_DATA', 'INCOMPATIBLE_SNAPSHOT', 'TRANSACTION_FAILED', 'CANCELLED',
  'TIMEOUT', 'DISPOSED', 'OUTCOME_UNKNOWN', 'QUEUE_FULL',
] as const);
export type IndexedDBErrorCode = typeof INDEXEDDB_ERROR_CODES[number];
export interface IndexedDBErrorDetails {
  readonly phase?: 'admission' | 'open' | 'serialization' | 'read' | 'write' | 'erase' | 'restore';
  readonly expectedGeneration?: string | null; readonly actualGeneration?: string | null;
  readonly operationId?: string; readonly snapshotReason?: string; readonly selectedGeneration?: string;
}
export class IndexedDBAdapterError extends Error {
  readonly code: IndexedDBErrorCode; readonly details: Readonly<IndexedDBErrorDetails>;
  constructor(code: IndexedDBErrorCode, details: IndexedDBErrorDetails = {}) {
    super(`Raveldex IndexedDB: ${code}`); this.name = 'IndexedDBAdapterError'; this.code = code; this.details = Object.freeze({ ...details });
  }
}
