import type { Query } from '../../core/contracts/types.js';
import { fail } from './lexer.js';
import type { ParseBudget, SyntaxToken } from './lexer.js';
import type { CapturedSyntaxOptions } from './options.js';

/** Recursive syntax only; eligibility and ranking remain native operations. */
export function parseTokens(tokens: readonly SyntaxToken[], options: CapturedSyntaxOptions, budget: ParseBudget): Query {
  let cursor = 0;
  const peek = (): SyntaxToken => tokens[cursor]!;
  function take(): SyntaxToken { const token = peek(); budget.charge(1, token.start, token.end); cursor++; return token; }
  function node(value: Query, token: SyntaxToken): Query { budget.charge(1, token.start, token.end); return Object.freeze(value); }
  function nested(depth: number, token: SyntaxToken): number {
    if (depth + 1 > options.maxDepth) fail('LIMIT_EXCEEDED', token.start, token.end, options.maxDepth, depth + 1);
    return depth + 1;
  }
  function fields(scope: string | undefined): { readonly fields?: readonly string[] } {
    return scope === undefined ? {} : { fields: Object.freeze([scope]) };
  }
  function primary(scope: string | undefined, depth: number): Query {
    const token = peek();
    if (token.kind !== 'quoted' && token.text.length > 0 && tokens[cursor + 1]?.kind === ':') {
      take(); take();
      if (token.escaped || !Object.hasOwn(options.configuration.schema.text, token.text)) fail('UNKNOWN_FIELD', token.start, token.end);
      return primary(token.text, nested(depth, token));
    }
    if (token.kind === 'unsupported' || token.kind === '*') fail('UNSUPPORTED_OPERATOR', token.start, token.end);
    if (token.kind === '(') {
      take(); const result = or(scope, nested(depth, token));
      const closing = peek();
      if (closing.kind === 'eof') fail('UNTERMINATED_GROUP', token.start, closing.end);
      if (closing.kind !== ')') unexpected(closing);
      take();
      if (peek().kind === '*') fail('UNSUPPORTED_OPERATOR', peek().start, peek().end);
      return result;
    }
    if (token.kind === 'quoted') {
      take();
      if (peek().kind === '*') fail('UNSUPPORTED_OPERATOR', peek().start, peek().end);
      return node({ kind: 'extension', capability: 'phrases', version: 1, payload: Object.freeze({ text: token.text, ...fields(scope) }) }, token);
    }
    if (token.kind !== 'word') fail('EXPECTED_OPERAND', token.start, token.end);
    take();
    if (peek().kind === '*') {
      const star = take(), next = peek();
      if (next.kind === '*' || next.kind === 'quoted' || next.kind === '(' || next.start === star.end && next.kind === 'word') fail('UNSUPPORTED_OPERATOR', next.kind === '*' ? next.start : star.start, next.kind === '*' ? next.end : star.end);
      return node({ kind: 'group', variants: Object.freeze([Object.freeze({ text: token.text, match: 'prefix', weight: 1 })]), ...fields(scope) }, token);
    }
    return node({ kind: 'text', text: token.text, ...fields(scope) }, token);
  }
  function unary(scope: string | undefined, depth: number): Query {
    const token = peek();
    if (token.kind === 'NOT' && tokens[cursor + 1]?.kind !== ':') { take(); return node({ kind: 'not', child: unary(scope, nested(depth, token)) }, token); }
    return primary(scope, depth);
  }
  function and(scope: string | undefined, depth: number): Query {
    const first = peek(), children = [unary(scope, depth)];
    while (peek().kind === 'AND' && tokens[cursor + 1]?.kind !== ':') { take(); children.push(unary(scope, depth)); }
    return children.length === 1 ? children[0]! : node({ kind: 'and', children: Object.freeze(children) }, first);
  }
  function or(scope: string | undefined, depth: number): Query {
    const first = peek(), children = [and(scope, depth)];
    while (peek().kind === 'OR' && tokens[cursor + 1]?.kind !== ':') { take(); children.push(and(scope, depth)); }
    return children.length === 1 ? children[0]! : node({ kind: 'or', children: Object.freeze(children) }, first);
  }
  function unexpected(token: SyntaxToken): never {
    if (token.kind === 'unsupported' || token.kind === '*') fail('UNSUPPORTED_OPERATOR', token.start, token.end);
    if (token.kind === ')' || token.kind === ':') fail('UNEXPECTED_TOKEN', token.start, token.end);
    return fail('EXPECTED_OPERATOR', token.start, token.end);
  }
  if (peek().kind === 'eof') return node({ kind: 'none' }, peek());
  const result = or(undefined, 0);
  if (peek().kind !== 'eof') unexpected(peek());
  return result;
}
