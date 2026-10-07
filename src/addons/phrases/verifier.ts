import { analyzeValue } from '../../core/analyzer/basic.js';
import type { WorkStep } from '../../core/index/directory.js';
import type { Limits } from '../../core/limits/limits.js';
import { compareStrings } from '../../core/query/work.js';

const rawCharge = (workUnits: number): WorkStep => ({ workUnits });

/** The core already analyzed the query once. Keep repeats and order intact. */
export function* phraseFailureTable(terms: readonly string[]): Generator<WorkStep, readonly number[]> {
  const failure: number[] = [];
  if (terms.length) { yield rawCharge(1); failure.push(0); }
  for (let i = 1; i < terms.length; i++) {
    let matched = failure[i - 1]!;
    for (;;) {
      if ((yield* compareStrings(terms[i]!, terms[matched]!, rawCharge)) === 0) { matched++; break; }
      if (matched === 0) break;
      yield rawCharge(1); matched = failure[matched - 1]!;
    }
    yield rawCharge(1); failure.push(matched);
  }
  return Object.freeze(failure);
}

/** Streaming KMP keeps at most the phrase-length prefix table, never source tokens.
 * Each original value resets the matched prefix, preserving value boundaries. */
export function* sourceValueMatches(value: string, valueIndex: number, terms: readonly string[], failure: readonly number[], limits: Limits): Generator<WorkStep, boolean> {
  if (terms.length === 0) return false;
  let matched = 0;
  for (const step of analyzeValue(value, valueIndex, limits)) {
    yield rawCharge(step.workUnits);
    if (!step.token) continue;
    for (;;) {
      if ((yield* compareStrings(step.token.term, terms[matched]!, rawCharge)) === 0) {
        matched++;
        if (matched === terms.length) return true;
        break;
      }
      if (matched === 0) break;
      yield rawCharge(1); matched = failure[matched - 1]!;
    }
  }
  return false;
}
