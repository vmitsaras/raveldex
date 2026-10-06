import { codePointWidth } from '../contracts/data.js';
import { bound } from '../errors/error.js';
import type { ErrorCode } from '../errors/error.js';
import { DEFAULT_LIMITS } from '../limits/limits.js';
import type { Limits } from '../limits/limits.js';

export const BASIC_ANALYZER = Object.freeze({ id: 'basic-v1', environmentProfile: 'unqualified' } as const);
export interface Token {
  readonly term: string;
  readonly valueIndex: number;
  readonly position: number;
  readonly start: number;
  readonly end: number;
}
export interface AnalysisStep { readonly workUnits: number; readonly token?: Token }
const START = /[\p{L}\p{N}]/u;
const CONTINUE = /[\p{L}\p{N}\p{M}]/u;

/** One implementation for every raw indexing/querying boundary. No side index. */
export function* analyzeValue(value: string, valueIndex = 0, limits: Limits = DEFAULT_LIMITS, code: ErrorCode = 'INVALID_RECORD'): Generator<AnalysisStep> {
  bound(value.length, limits.maxTextCodeUnitsPerValue, 'analysis.value');
  let start = -1;
  let position = 0;
  function emit(end: number): AnalysisStep {
    const raw = value.slice(start, end);
    const term = raw.normalize('NFKC').toLowerCase();
    bound(term.length, limits.maxTermCodeUnits, 'analysis.term');
    const token = Object.freeze({ term, valueIndex, position: position++, start, end });
    start = -1;
    // Original scan is charged per point; normalization is a bounded primitive.
    return { workUnits: raw.length + term.length, token };
  }
  for (let i = 0; i < value.length;) {
    const width = codePointWidth(value, i, code, 'analysis.value');
    const point = value.slice(i, i + width);
    if (start >= 0 && !CONTINUE.test(point)) yield emit(i);
    if (start < 0 && START.test(point)) start = i;
    i += width;
    if (start >= 0) bound(i - start, limits.maxRawTokenCodeUnits, 'analysis.rawToken');
    yield { workUnits: 1 };
  }
  if (start >= 0) yield emit(value.length);
}
