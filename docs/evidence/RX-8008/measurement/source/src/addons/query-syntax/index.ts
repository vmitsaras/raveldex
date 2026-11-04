import { createAnalysis } from '../../core/analyzer/selected.js';
import { analyzeQuery, captureQuery } from '../../core/contracts/query.js';
import type { Query } from '../../core/contracts/types.js';
import { ERROR_CODES } from '../../core/errors/error.js';
import type { ErrorCode } from '../../core/errors/error.js';
import { QuerySyntaxError } from './errors.js';
import { fail, lex } from './lexer.js';
import { captureSyntaxOptions } from './options.js';
import { parseTokens } from './parser.js';
import type { QuerySyntaxOptions, QuerySyntaxParser } from './types.js';

export { QUERY_SYNTAX_ERROR_CODES, QuerySyntaxError } from './errors.js';
export type { QuerySyntaxOptions, QuerySyntaxParser, QuerySyntaxErrorCode, QuerySyntaxSpan, QuerySyntaxErrorDetails } from './types.js';
export const QUERY_SYNTAX_POLICY = 'explicit-boolean-fields-v1' as const;

/** Explicit caller-side native Query compiler. It creates no owner or side state. */
export function createQuerySyntax(options: QuerySyntaxOptions): QuerySyntaxParser {
  const captured = captureSyntaxOptions(options), configuration = captured.configuration;
  return Object.freeze({ parse(input: string): Query {
    if (typeof input !== 'string') fail('INVALID_INPUT', 0, 0);
    if (input.length > captured.maxInputCodeUnits) fail('LIMIT_EXCEEDED', 0, input.length, captured.maxInputCodeUnits, input.length);
    let used = 0;
    let budgetFailure: QuerySyntaxError | undefined;
    const budget = { charge(units: number, start: number, end: number): void {
      if (!Number.isSafeInteger(units) || units < 0) {
        budgetFailure = new QuerySyntaxError('NATIVE_QUERY_ERROR', { span: { start: 0, end: input.length } }); throw budgetFailure;
      }
      used += units;
      if (!Number.isSafeInteger(used) || used > captured.maxWorkUnits) {
        budgetFailure = new QuerySyntaxError('WORK_LIMIT_EXCEEDED', { span: { start, end }, limit: captured.maxWorkUnits, actual: used }); throw budgetFailure;
      }
    } };
    const query = parseTokens(lex(input, captured, budget), captured, budget);
    try {
      const owned = captureQuery(query, configuration.schema, configuration.limits, undefined, configuration.capabilities);
      const cursor = analyzeQuery(owned, configuration.schema, configuration.limits, configuration.capabilities, createAnalysis(configuration));
      try {
        for (;;) {
          // Every cooperative advance costs work, including zero-unit handlers
          // and the final completion. Declared work remains independently valid.
          budget.charge(1, 0, input.length);
          const step = cursor.next();
          if (step.done) break;
          budget.charge(step.value.workUnits, 0, input.length);
        }
      } finally { try { cursor.return(undefined); } catch { /* Preserve the parse/analysis failure. */ } }
    } catch (error) {
      if (budgetFailure !== undefined && error === budgetFailure) throw budgetFailure;
      let nativeCode: ErrorCode | undefined;
      // A trusted analyzer may throw any object, including accessors/proxies.
      // Inspect only an own data value; never preserve its message/path/cause.
      try {
        if (typeof error === 'object' && error !== null) {
          const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
          if (descriptor && 'value' in descriptor && ERROR_CODES.includes(descriptor.value as ErrorCode)) nativeCode = descriptor.value as ErrorCode;
        }
      } catch { /* A hostile diagnostic object cannot replace a safe error. */ }
      throw new QuerySyntaxError('NATIVE_QUERY_ERROR', { span: { start: 0, end: input.length },
        ...(nativeCode === undefined ? {} : { nativeCode }),
      });
    }
    return query;
  } });
}
