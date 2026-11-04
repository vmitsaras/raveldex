import { scanUnicode } from '../../core/contracts/data.js';
import type { WorkStep } from '../../core/index/directory.js';

export interface LiteralMatchStep extends WorkStep { readonly match?: { readonly start: number; readonly end: number } }
/** One immutable needle prefix table per prepared leaf. No analyzer/normalization. */
export function* literalTable(text: string): Generator<WorkStep, readonly number[]> {
  yield* scanUnicode(text,'INVALID_QUERY','literal.text');
  const table: number[] = [0]; yield {workUnits:1};
  for (let index=1;index<text.length;index++) {
    let prefix=table[index-1]!;
    for (;;) {
      yield {workUnits:1};
      if (text.charCodeAt(index)===text.charCodeAt(prefix)) {prefix++;break;}
      if (!prefix) break; prefix=table[prefix-1]!;
    }
    table.push(prefix); yield {workUnits:1};
  }
  return Object.freeze(table);
}
/** KMP compares original code units and enumerates every overlapping occurrence.
 * Well-formed needle/source ensure matches cannot bisect a surrogate pair. */
export function* literalMatches(source: string, text: string, table: readonly number[]): Generator<LiteralMatchStep> {
  yield* scanUnicode(source,'INCOMPATIBLE_CAPABILITY','literal.source');
  let matched=0;
  for (let index=0;index<source.length;index++) {
    for (;;) {
      yield {workUnits:1};
      if (source.charCodeAt(index)===text.charCodeAt(matched)) {matched++;break;}
      if (!matched) break; matched=table[matched-1]!;
    }
    if (matched===text.length) {
      yield {workUnits:1,match:Object.freeze({start:index-text.length+1,end:index+1})};
      matched=table[matched-1]!;
    }
  }
}
