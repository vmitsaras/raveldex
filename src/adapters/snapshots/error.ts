import { RaveldexError } from '../../core/errors/error.js';
export const SNAPSHOT_REASONS = Object.freeze([
  'MALFORMED_SNAPSHOT', 'ENCODED_LIMIT_EXCEEDED', 'INTEGRITY_MISMATCH', 'UNSUPPORTED_FORMAT', 'UNSUPPORTED_CODEC',
  'SCHEMA_MISMATCH', 'ANALYZER_MISMATCH', 'RANKING_MISMATCH', 'CAPABILITY_MISMATCH', 'INDEX_DETAIL_MISMATCH',
  'LIMITS_MISMATCH', 'SOURCE_UNAVAILABLE', 'UNQUALIFIED_PROFILE', 'PROFILE_MISMATCH', 'INVALID_NATIVE_STATE', 'UNSUPPORTED_ENGINE',
] as const);
export type SnapshotReason = typeof SNAPSHOT_REASONS[number];
/** Specific codec reason alongside the unchanged ordinary core error codes. */
export class SnapshotAdapterError extends RaveldexError {
  readonly reason: SnapshotReason;
  constructor(reason: SnapshotReason, path = 'snapshot') {
    super(reason === 'ENCODED_LIMIT_EXCEEDED' ? 'LIMIT_EXCEEDED' : reason === 'SOURCE_UNAVAILABLE' || reason === 'UNSUPPORTED_ENGINE' ? 'MISSING_CAPABILITY' : 'INCOMPATIBLE_CAPABILITY', { path });
    this.name = 'SnapshotAdapterError'; this.reason = reason;
  }
}
export function fail(reason: SnapshotReason, path?: string): never { throw new SnapshotAdapterError(reason, path); }
