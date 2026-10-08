import type { ErrorCode } from '../../core/errors/error.js';

export const MIGRATION_ERROR_CODES = Object.freeze([
  'INVALID_BYTES', 'INVALID_SNAPSHOT', 'INCOMPATIBLE_SNAPSHOT',
  'NONCANONICAL_SNAPSHOT', 'CHECKSUM_MISMATCH', 'NATIVE_INCOMPATIBLE',
  'CAPABILITY_REQUIRED',
] as const);
export type MigrationErrorCode = typeof MIGRATION_ERROR_CODES[number];
export type MigrationReason = 'shape' | 'keys' | 'type' | 'value' | 'limit'
  | 'duplicate' | 'unsupported' | 'canonical' | 'checksum' | 'native';
export interface MigrationErrorDetails {
  readonly reason: MigrationReason;
  readonly nativeCode?: ErrorCode;
}

/** Fixed diagnostics never include source values, IDs, host messages or causes. */
export class MigrationError extends Error {
  readonly code: MigrationErrorCode;
  readonly details: Readonly<MigrationErrorDetails>;
  constructor(code: MigrationErrorCode, reason: MigrationReason = 'value', nativeCode?: ErrorCode) {
    super(`Raveldex migration: ${code}`);
    this.name = 'MigrationError';
    this.code = code;
    this.details = Object.freeze({ reason, ...(nativeCode === undefined ? {} : { nativeCode }) });
  }
}

export function fail(code: MigrationErrorCode, reason: MigrationReason): never {
  throw new MigrationError(code, reason);
}
