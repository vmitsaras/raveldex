import type { MutationOptions } from '../../core/contracts/types.js';
import { SnapshotAdapterError, SNAPSHOT_REASONS } from '../snapshots/error.js';
import type { SnapshotReason } from '../snapshots/error.js';
import type { SnapshotRestoreResult } from '../snapshots/types.js';
import { WorkerAdapterError } from './error.js';
import { getSnapshotChannel } from './snapshot-channel.js';
import { object, integer, fail, validateError } from './protocol.js';
import type { WorkerRaveldex, WireError } from './types.js';
export interface SnapshotRestorePromise extends Promise<SnapshotRestoreResult> { readonly operationId: string }
export type SnapshotRestoreReceipt =
  | { readonly operationId: string; readonly status: 'pending' | 'expired' }
  | { readonly operationId: string; readonly status: 'committed'; readonly result: SnapshotRestoreResult }
  | { readonly operationId: string; readonly status: 'rejected'; readonly error: WireError };
export interface WorkerSnapshots {
  exportSource(options?: MutationOptions): Promise<string>;
  restore(encoded: string, options?: MutationOptions): SnapshotRestorePromise;
  reconcile(operationId: string): Promise<SnapshotRestoreReceipt>;
}
function result(input: unknown): SnapshotRestoreResult {
  const value = object(input, ['format', 'originRevision', 'revision', 'reindexed', 'receivingAnalyzer']);
  if (value.format !== 'raveldex-source' || value.reindexed !== true) fail('snapshot.result');
  integer(value.originRevision); integer(value.revision, Number.MAX_SAFE_INTEGER, 1);
  const analyzer = object(value.receivingAnalyzer, ['id', 'environmentProfile']);
  if (analyzer.id !== 'basic-v1' || analyzer.environmentProfile !== 'unqualified') fail('snapshot.analyzer');
  return value as unknown as SnapshotRestoreResult;
}
function receipt(input: unknown, operationId: string): SnapshotRestoreReceipt {
  const value = object(input, ['operationId', 'status', 'result', 'error']);
  if (value.operationId !== operationId) fail('snapshot.receipt');
  if (value.status === 'pending' || value.status === 'expired') { if (value.result !== undefined || value.error !== undefined) fail('snapshot.receipt'); }
  else if (value.status === 'committed') { if (value.error !== undefined) fail('snapshot.receipt'); result(value.result); }
  else if (value.status === 'rejected') { if (value.result !== undefined) fail('snapshot.receipt'); validateError(value.error); }
  else fail('snapshot.receipt');
  return value as unknown as SnapshotRestoreReceipt;
}
function inflate(error: unknown): never {
  if (error && typeof error === 'object' && 'name' in error && error.name === 'SnapshotAdapterError' && 'reason' in error && (SNAPSHOT_REASONS as readonly unknown[]).includes(error.reason)) {
    const path = 'details' in error && error.details && typeof error.details === 'object' && 'path' in error.details && typeof error.details.path === 'string' ? error.details.path : undefined;
    throw new SnapshotAdapterError(error.reason as SnapshotReason, path);
  }
  throw error;
}
/** Explicit source-only browser worker bridge. Ordinary worker imports exclude codecs. */
export function createWorkerSnapshots(engine: WorkerRaveldex): WorkerSnapshots {
  const channel = getSnapshotChannel(engine); if (!channel) throw new WorkerAdapterError('INCOMPATIBLE_WORKER', { path: 'snapshot.engine' });
  return Object.freeze({
    exportSource(options?: MutationOptions): Promise<string> {
      return channel.invoke('snapshotExportSource', undefined, options, value => { if (typeof value !== 'string') fail('snapshot.encoded'); return value; }).catch(inflate) as Promise<string>;
    },
    restore(encoded: string, options?: MutationOptions): SnapshotRestorePromise {
      const promise = channel.invoke('snapshotRestore', encoded, options, result), mapped = promise.catch(inflate);
      Object.defineProperty(mapped, 'operationId', { value: promise.operationId ?? '', enumerable: true }); return mapped as SnapshotRestorePromise;
    },
    reconcile(operationId: string): Promise<SnapshotRestoreReceipt> { return channel.reconcile(operationId, value => receipt(value, operationId)) as Promise<SnapshotRestoreReceipt>; },
  });
}
