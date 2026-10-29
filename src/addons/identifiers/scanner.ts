import type { AnalysisStep, Token } from '../../core/analyzer/basic.js';
import { codePointWidth } from '../../core/contracts/data.js';
import { bound } from '../../core/errors/error.js';
import type { ErrorCode } from '../../core/errors/error.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import type { Limits } from '../../core/limits/limits.js';

const START = /[\p{L}\p{N}]/u;
const CONTINUE = /[\p{L}\p{N}\p{M}_]/u;
const MARK = /\p{M}/u;
const UPPER = /[\p{Lu}\p{Lt}]/u;
const LOWER = /\p{Ll}/u;
const NUMBER = /\p{N}/u;
type Category = 'upper' | 'lower' | 'letter' | 'number' | 'separator';
interface Part { readonly start: number; end: number; readonly category: Category }

/** Original spelling determines boundaries before normalization. All Unicode N
 * categories (Nd, Nl and No) are numbers; Lu/Lt are upper, Ll lower. Other
 * letters have no case transition. Combining marks stay with an existing base;
 * orphan marks after an underscore do not start a component. */
function* components(value: string, start: number, end: number, limits: Limits, code: ErrorCode): Generator<AnalysisStep, readonly { readonly start: number; readonly end: number; readonly term: string }[]> {
  const parts: Part[] = [];
  for (let index = start; index < end;) {
    const width = codePointWidth(value, index, code, 'analysis.value');
    const point = value.slice(index, index + width);
    yield { workUnits: 6 + width };
    if (point === '_') parts.push({ start: index, end: index + width, category: 'separator' });
    else if (MARK.test(point)) {
      const previous = parts[parts.length - 1];
      if (previous && previous.category !== 'separator') previous.end = index + width;
    } else parts.push({ start: index, end: index + width,
      category: NUMBER.test(point) ? 'number' : UPPER.test(point) ? 'upper' : LOWER.test(point) ? 'lower' : 'letter' });
    index += width;
  }
  const output: { readonly start: number; readonly end: number; readonly term: string }[] = [];
  let first = -1;
  const flush = (last: number): AnalysisStep => {
    const from = parts[first]!.start, to = parts[last]!.end;
    const raw = value.slice(from, to), term = raw.normalize('NFKC').toLowerCase();
    bound(term.length, limits.maxTermCodeUnits, 'analysis.term');
    output.push(Object.freeze({ start: from, end: to, term }));
    first = -1;
    return { workUnits: raw.length + term.length + 1 };
  };
  for (let index = 0; index < parts.length; index++) {
    const current = parts[index]!, previous = parts[index - 1], next = parts[index + 1];
    yield { workUnits: 4 };
    if (current.category === 'separator') {
      if (first >= 0) yield flush(index - 1);
      continue;
    }
    if (first < 0) first = index;
    else if (previous && ((previous.category === 'lower' && current.category === 'upper') ||
        ((previous.category === 'number') !== (current.category === 'number')) ||
        (previous.category === 'upper' && current.category === 'upper' && next?.category === 'lower'))) {
      yield flush(index - 1);
      first = index;
    }
  }
  if (first >= 0) yield flush(parts.length - 1);
  return output;
}

/** Dense original positions; index-only derived terms share their original's
 * ordinal. Query/phrase cursors emit originals only. There is no fragment
 * adjacency, whole-value normalization, source side index or retained cache. */
export function* analyzeIdentifiers(value: string, valueIndex = 0, limits: Limits = DEFAULT_LIMITS,
    code: ErrorCode = 'INVALID_RECORD', mode: 'index' | 'query' | 'phrase' = 'index'): Generator<AnalysisStep> {
  bound(value.length, limits.maxTextCodeUnitsPerValue, 'analysis.value');
  let start = -1, position = 0;
  function* emit(end: number): Generator<AnalysisStep> {
    const from = start, ordinal = position++, raw = value.slice(from, end);
    const term = raw.normalize('NFKC').toLowerCase();
    bound(term.length, limits.maxTermCodeUnits, 'analysis.term');
    start = -1;
    const original = Object.freeze({ term, start: from, end });
    const token: Token = Object.freeze({ term, valueIndex, position: ordinal, start: from, end, kind: 'original' });
    yield { workUnits: raw.length + term.length + 1, token };
    if (mode !== 'index') return;
    const derived = yield* components(value, from, end, limits, code);
    const seen = new Set([term]);
    for (const part of derived) {
      yield { workUnits: part.term.length + 1 };
      if (seen.has(part.term)) continue;
      seen.add(part.term);
      yield { workUnits: part.term.length + 7, token: Object.freeze({ term: part.term, valueIndex, position: ordinal,
        start: part.start, end: part.end, kind: 'component', original }) };
    }
  }
  for (let index = 0; index < value.length;) {
    const width = codePointWidth(value, index, code, 'analysis.value');
    const point = value.slice(index, index + width);
    if (start >= 0 && !CONTINUE.test(point)) yield* emit(index);
    if (start < 0 && START.test(point)) start = index;
    index += width;
    if (start >= 0) bound(index - start, limits.maxRawTokenCodeUnits, 'analysis.rawToken');
    yield { workUnits: 3 + width };
  }
  if (start >= 0) yield* emit(value.length);
}
