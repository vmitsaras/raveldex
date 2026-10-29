import { ERROR_CODES } from '../../core/errors/error.js';
import type { QuerySyntaxErrorCode, QuerySyntaxErrorDetails } from './types.js';

export const QUERY_SYNTAX_ERROR_CODES = Object.freeze([
  'INVALID_INPUT', 'INVALID_UNICODE', 'UNEXPECTED_TOKEN', 'EXPECTED_OPERAND',
  'EXPECTED_OPERATOR', 'UNKNOWN_FIELD', 'UNSUPPORTED_OPERATOR',
  'UNTERMINATED_QUOTE', 'UNTERMINATED_GROUP', 'INVALID_ESCAPE',
  'LIMIT_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'NATIVE_QUERY_ERROR',
] as const);

/** Fixed messages and bounded locations/counts, with no input or exception cause. */
export class QuerySyntaxError extends Error {
  readonly code: QuerySyntaxErrorCode;
  readonly details: Readonly<QuerySyntaxErrorDetails>;
  constructor(code: QuerySyntaxErrorCode, details: QuerySyntaxErrorDetails) {
    const selected = QUERY_SYNTAX_ERROR_CODES.includes(code) ? code : 'INVALID_INPUT';
    super(`Raveldex query syntax: ${selected}`);
    this.name = 'QuerySyntaxError'; this.code = selected;
    const start = Number.isSafeInteger(details.span.start) && details.span.start >= 0 ? details.span.start : 0;
    const end = Number.isSafeInteger(details.span.end) && details.span.end >= start ? details.span.end : start;
    this.details = Object.freeze({ span: Object.freeze({ start, end }),
      ...(details.nativeCode !== undefined && ERROR_CODES.includes(details.nativeCode) ? { nativeCode: details.nativeCode } : {}),
      ...(Number.isSafeInteger(details.limit) && details.limit! >= 0 ? { limit: details.limit! } : {}),
      ...(Number.isSafeInteger(details.actual) && details.actual! >= 0 ? { actual: details.actual! } : {}),
    });
  }
}
