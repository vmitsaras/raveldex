import type { AnalyzerDescriptor, MutationOptions, Raveldex } from '../../core/contracts/types.js';

export interface NodeSnapshotEnvironment {
  readonly runtime: 'node'; readonly version: string; readonly v8: string;
  readonly icu: string; readonly unicode: string; readonly platform: string; readonly arch: string;
}
/** Trusted application declaration of its qualification evidence. The adapter
 * checks identity against this exact running environment; evidence strings are
 * references, not executable proofs or a universal Unicode-equivalence claim. */
export interface NativeSnapshotQualification {
  readonly profileId: string; readonly scope: 'exact-node-runtime';
  readonly environment: NodeSnapshotEnvironment; readonly evidence: readonly string[];
}
export interface SnapshotEngineOptions { readonly nativeQualification: NativeSnapshotQualification }
export interface SnapshotOptions { readonly maxEncodedBytes?: number }
export type SnapshotFormat = 'raveldex-source' | 'raveldex-native';
export interface SnapshotRestoreResult {
  readonly format: SnapshotFormat; readonly originRevision: number; readonly revision: number;
  readonly reindexed: boolean; readonly receivingAnalyzer: AnalyzerDescriptor;
}
export interface Snapshots {
  exportSource(options?: MutationOptions): Promise<string>;
  exportNative(options?: MutationOptions): Promise<string>;
  restore(encoded: string, options?: MutationOptions): Promise<SnapshotRestoreResult>;
}
export type SnapshotEngine = Raveldex;
