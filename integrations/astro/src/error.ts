export const STATIC_SEARCH_ERROR_CODES = Object.freeze([
  'INVALID_INPUT', 'INVALID_ARTIFACT', 'STALE_BUILD', 'INCOMPATIBLE_ARTIFACT',
  'MISSING_ARTIFACT', 'INTEGRITY_MISMATCH', 'ASSET_LIMIT', 'FETCH_FAILED',
  'CANCELLED', 'DISPOSED',
] as const);
export type StaticSearchErrorCode = typeof STATIC_SEARCH_ERROR_CODES[number];
export class StaticSearchError extends Error {
  readonly code: StaticSearchErrorCode;
  constructor(code: StaticSearchErrorCode) {
    super(`Raveldex static search: ${code}`); this.name = 'StaticSearchError'; this.code = code;
  }
}
export function fail(code: StaticSearchErrorCode): never { throw new StaticSearchError(code); }
