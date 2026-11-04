/** Explicit optional storage. Importing does not access a database or host handles. */
export { createIndexedDBPersistence } from './persistence.js';
export { IndexedDBAdapterError, INDEXEDDB_ERROR_CODES } from './error.js';
export type { IndexedDBErrorCode, IndexedDBErrorDetails } from './error.js';
export type { IndexedDBOptions, IndexedDBPersistence, PersistenceSnapshots, PersistenceOptions, PersistenceWriteOptions, PersistenceSaveResult, PersistenceLoadResult, PersistenceEraseResult } from './types.js';
