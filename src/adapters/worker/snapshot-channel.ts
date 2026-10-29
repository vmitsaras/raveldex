import type { AnalyzerDescriptor, MutationOptions } from '../../core/contracts/types.js';
import type { WorkerRaveldex } from './types.js';
export type SnapshotOperation = 'snapshotExportSource' | 'snapshotRestore';
export interface SnapshotChannel {
  readonly analyzer: AnalyzerDescriptor;
  invoke(operation: SnapshotOperation, input: unknown, options: MutationOptions | undefined, validate: (value: unknown) => unknown): Promise<unknown> & { readonly operationId?: string };
  reconcile(operationId: string, validate: (value: unknown) => unknown): Promise<unknown>;
}
/** Private branded channel; no codecs, host initialization, or data retention. */
const channels = new WeakMap<object, SnapshotChannel>();
export function bindSnapshotChannel(engine: WorkerRaveldex, channel: SnapshotChannel): void { channels.set(engine, channel); }
export function getSnapshotChannel(engine: WorkerRaveldex): SnapshotChannel | undefined { return channels.get(engine); }
