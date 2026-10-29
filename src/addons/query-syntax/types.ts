import type { Configuration, Query } from '../../core/contracts/types.js';
import type { ErrorCode } from '../../core/errors/error.js';

export interface QuerySyntaxOptions {
  readonly configuration: Configuration;
  readonly maxInputCodeUnits?: number;
  readonly maxTokens?: number;
  readonly maxDepth?: number;
  readonly maxWorkUnits?: number;
}
export interface QuerySyntaxParser { readonly parse: (input: string) => Query }
export interface QuerySyntaxSpan { readonly start: number; readonly end: number }
export type QuerySyntaxErrorCode =
  | 'INVALID_INPUT' | 'INVALID_UNICODE' | 'UNEXPECTED_TOKEN'
  | 'EXPECTED_OPERAND' | 'EXPECTED_OPERATOR' | 'UNKNOWN_FIELD'
  | 'UNSUPPORTED_OPERATOR' | 'UNTERMINATED_QUOTE' | 'UNTERMINATED_GROUP'
  | 'INVALID_ESCAPE' | 'LIMIT_EXCEEDED' | 'WORK_LIMIT_EXCEEDED' | 'NATIVE_QUERY_ERROR';
export interface QuerySyntaxErrorDetails {
  readonly span: QuerySyntaxSpan;
  readonly nativeCode?: ErrorCode;
  readonly limit?: number;
  readonly actual?: number;
}
