import { QuerySyntaxError } from './errors.js';
import type { QuerySyntaxErrorCode } from './types.js';
import type { CapturedSyntaxOptions } from './options.js';

export type TokenKind = 'word' | 'quoted' | 'AND' | 'OR' | 'NOT' | '(' | ')' | ':' | '*' | 'unsupported' | 'eof';
export interface SyntaxToken { readonly kind: TokenKind; readonly start: number; readonly end: number; readonly text: string; readonly escaped: boolean }
export interface ParseBudget { charge(units: number, start: number, end: number): void }

export function fail(code: QuerySyntaxErrorCode, start: number, end: number, limit?: number, actual?: number): never {
  throw new QuerySyntaxError(code, { span: { start, end }, ...(limit === undefined ? {} : { limit }), ...(actual === undefined ? {} : { actual }) });
}

const whitespace = (text: string): boolean => /\s/u.test(text);
const unsupported = (text: string): boolean => '!&|~^[]{}=<>?'.includes(text);

/** Raw offsets remain original UTF-16 coordinates; escapes quote code points. */
export function lex(input: string, options: CapturedSyntaxOptions, budget: ParseBudget): readonly SyntaxToken[] {
  // Validate the complete input, including punctuation and any later branch.
  for (let index = 0; index < input.length; index++) {
    const unit = input.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = input.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) { budget.charge(1, index, index + 1); fail('INVALID_UNICODE', index, index + 1); }
      budget.charge(2, index, index + 2); index++;
    } else {
      budget.charge(1, index, index + 1);
      if (unit >= 0xdc00 && unit <= 0xdfff) fail('INVALID_UNICODE', index, index + 1);
    }
  }
  const tokens: SyntaxToken[] = [];
  let cursor = 0;
  function take(): string {
    const width = input.codePointAt(cursor)! > 0xffff ? 2 : 1, start = cursor;
    cursor += width; budget.charge(width, start, cursor); return input.slice(start, cursor);
  }
  function push(kind: TokenKind, start: number, text = '', escaped = false): void {
    budget.charge(1, start, cursor);
    if (tokens.length + 1 > options.maxTokens) fail('LIMIT_EXCEEDED', start, cursor, options.maxTokens, tokens.length + 1);
    tokens.push(Object.freeze({ kind, start, end: cursor, text, escaped }));
  }
  while (cursor < input.length) {
    const start = cursor, first = input[cursor]!;
    if (whitespace(first)) { take(); continue; }
    if ('():*'.includes(first)) { take(); push(first as '(' | ')' | ':' | '*', start); continue; }
    if (unsupported(first) || first === '+' || first === '-') { take(); push('unsupported', start); continue; }
    const quoted = first === '"';
    if (quoted) take();
    let text = '', escaped = false, closed = !quoted;
    while (cursor < input.length) {
      const current = input[cursor]!;
      if (quoted && current === '"') { take(); closed = true; break; }
      if (!quoted && (whitespace(current) || '():*"'.includes(current) || unsupported(current))) break;
      if (current === '\\') {
        const slash = cursor; take();
        if (cursor === input.length) fail('INVALID_ESCAPE', slash, cursor);
        text += take(); escaped = true;
      } else text += take();
    }
    if (!closed) fail('UNTERMINATED_QUOTE', start, input.length);
    let kind: TokenKind = quoted ? 'quoted' : 'word';
    if (!quoted && !escaped) {
      if (text === 'AND' || text === 'OR' || text === 'NOT') kind = text;
      else if (text === 'XOR' || text === 'NAND' || text === 'NOR' || text === 'NEAR' || text === 'WITHIN') kind = 'unsupported';
    }
    push(kind, start, text, escaped);
  }
  tokens.push(Object.freeze({ kind: 'eof', start: input.length, end: input.length, text: '', escaped: false }));
  return Object.freeze(tokens);
}
