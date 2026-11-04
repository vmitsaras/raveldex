import type { CancellationSignal } from '../../core/contracts/types.js';
import type { SnapshotRestoreResult, Snapshots } from '../snapshots/types.js';
export type PersistenceSnapshots = Pick<Snapshots, 'exportSource' | 'restore'> & Partial<Pick<Snapshots, 'exportNative'>>;
export interface IndexedDBOptions {
  /** Dedicated adapter-owned database; never an unrelated application database. */
  readonly databaseName: string; readonly namespace: string;
  /** Explicit live browser handle; omitted means lazy host lookup on actions. */
  readonly indexedDB?: IDBFactory; readonly format?: 'source' | 'native';
  readonly openTimeoutMs?: number; readonly operationTimeoutMs?: number;
}
export interface PersistenceOptions { readonly signal?: CancellationSignal; readonly deadlineMs?: number }
export interface PersistenceWriteOptions extends PersistenceOptions { readonly expectedGeneration: string | null }
/** Durable means observed strict-hint IndexedDB transaction commit, not tested power-loss durability. */
export interface PersistenceSaveResult { readonly generation: string; readonly format: 'raveldex-source' | 'raveldex-native'; readonly encodedBytes: number; readonly durable: true }
/** Generation identifies the readonly snapshot selection, not a lease on the later database head. */
export type PersistenceLoadResult =
  | { readonly status: 'missing'; readonly generation: null }
  | { readonly status: 'restored'; readonly generation: string; readonly restore: SnapshotRestoreResult };
export interface PersistenceEraseResult { readonly erased: boolean; readonly generation: null; readonly durable: true }
export interface IndexedDBPersistence {
  save(options: PersistenceWriteOptions): Promise<PersistenceSaveResult>;
  load(options?: PersistenceOptions): Promise<PersistenceLoadResult>;
  erase(options: PersistenceWriteOptions): Promise<PersistenceEraseResult>;
  /** Release this adapter's connections and requests, without erasing or disposing its borrowed engine. */
  dispose(): Promise<void>;
}
