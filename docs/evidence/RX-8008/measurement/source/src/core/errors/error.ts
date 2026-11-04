export const ERROR_CODES = Object.freeze([
  'INVALID_SCHEMA', 'INVALID_RECORD', 'INVALID_QUERY', 'INVALID_OPTIONS',
  'ID_EXISTS', 'ID_NOT_FOUND', 'LIMIT_EXCEEDED', 'QUEUE_FULL',
  'WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED', 'CANCELLED', 'DISPOSED',
  'MISSING_CAPABILITY', 'INCOMPATIBLE_CAPABILITY', 'REVISION_MISMATCH',
  'REVISION_EXHAUSTED', 'RESOURCE_EXHAUSTED', 'UNSUPPORTED_ENVIRONMENT', 'INTERNAL_ERROR',
] as const);
export type ErrorCode = typeof ERROR_CODES[number];
export interface ErrorDetails {
  readonly path?: string;
  readonly limit?: number;
  readonly actual?: number;
}

/** Messages are fixed by code; details contain locations/counts, never input values. */
export class RaveldexError extends Error {
  readonly code: ErrorCode;
  readonly details: Readonly<ErrorDetails>;
  constructor(code: ErrorCode, details: ErrorDetails = {}) {
    super(`Raveldex: ${code}`);
    this.name = 'RaveldexError';
    this.code = code;
    this.details = Object.freeze({
      ...(details.path === undefined ? {} : { path: details.path.slice(0, 256) }),
      ...(details.limit === undefined ? {} : { limit: details.limit }),
      ...(details.actual === undefined ? {} : { actual: details.actual }),
    });
  }
}

export function invalid(code: ErrorCode, path: string): never {
  throw new RaveldexError(code, { path });
}

export function bound(actual: number, limit: number, path: string): void {
  if (!Number.isSafeInteger(actual) || actual > limit) {
    throw new RaveldexError('LIMIT_EXCEEDED', { path, limit, actual });
  }
}
