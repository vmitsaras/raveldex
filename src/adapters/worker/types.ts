import type { AddonRegistration } from '../../core/capabilities/types.js';
import type { Configuration, MutationOptions, MutationResult, Raveldex, RecordInput } from '../../core/contracts/types.js';
import type { ErrorCode, ErrorDetails } from '../../core/errors/error.js';
import type { WorkerErrorCode, WorkerErrorDetails } from './error.js';

/** Structural browser worker endpoint; construction remains caller-owned. */
export interface WorkerEndpoint {
  postMessage(message: unknown): void;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  terminate(): void;
}
export interface WorkerScope {
  postMessage(message: unknown): void;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}
export interface WorkerOptions {
  readonly worker: WorkerEndpoint;
  readonly configuration: Configuration;
  readonly ownership: 'owned' | 'external';
  /** Explicitly pair a browser main thread with its own same-host worker.
   * The adopted basic-v1 unqualified profile does not support cross-host claims. */
  readonly sameHost: true;
  readonly maxMessageBytes?: number;
  readonly responseTimeoutMs?: number;
}
export interface WorkerHostOptions { readonly addons?: readonly AddonRegistration[]; readonly maxMessageBytes?: number }
export interface MutationPromise extends Promise<MutationResult> { readonly operationId: string }
export type WireError =
  | { readonly name: 'RaveldexError'; readonly code: ErrorCode; readonly details: Readonly<ErrorDetails> }
  | { readonly name: 'WorkerAdapterError'; readonly code: WorkerErrorCode; readonly details: Readonly<WorkerErrorDetails> };
export type MutationReceipt =
  | { readonly operationId: string; readonly status: 'pending' | 'expired' }
  | { readonly operationId: string; readonly status: 'committed'; readonly result: MutationResult }
  | { readonly operationId: string; readonly status: 'rejected'; readonly error: WireError };
export interface WorkerRaveldex extends Raveldex {
  add(record: RecordInput, options?: MutationOptions): MutationPromise;
  addMany(records: readonly RecordInput[], options?: MutationOptions): MutationPromise;
  replace(record: RecordInput, options?: MutationOptions): MutationPromise;
  remove(ids: string | readonly string[], options?: MutationOptions): MutationPromise;
  clear(options?: MutationOptions): MutationPromise;
  reconcile(operationId: string): Promise<MutationReceipt>;
  destroy(): Promise<void>;
}
