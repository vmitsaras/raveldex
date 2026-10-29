import type { AnalysisStep, Token } from './basic.js';
import type { AnalysisMode } from './selected.js';
import type { AnalyzerImplementation } from '../capabilities/types.js';
import type { ErrorCode } from '../errors/error.js';
import { bound, invalid } from '../errors/error.js';
import { scanUnicode } from '../contracts/data.js';
import type { Limits } from '../limits/limits.js';
import type { WorkBudget } from '../limits/work.js';

/** Validate the limited original/component protocol without implementing code
 * splitting inside core. Every value/provider shares the operation module budget. */
export function* runIdentifierAnalysis(handle: Extract<AnalyzerImplementation, {kind: 'identifier-tokenizer'}>, budget: WorkBudget,
  value: string, valueIndex: number, limits: Limits, code: ErrorCode, mode: AnalysisMode, check?: () => void): Generator<AnalysisStep> {
  bound(value.length, limits.maxTextCodeUnitsPerValue, 'analysis.value');
  const charge = (workUnits: number): AnalysisStep => { check?.(); budget.charge(workUnits); return { workUnits }; };
  // A trusted tokenizer still cannot bypass malformed non-token input.
  for (const step of scanUnicode(value, code, 'analysis.value')) yield charge(step.workUnits);
  const cursor = handle.analyze(value, valueIndex, limits, code, mode);
  let original: Token | undefined, position = 0, previousEnd = 0, componentEnd = 0, occurrences = 0;
  const terms = new Set<string>();
  // Capture data descriptors before reading values. Frozen objects can still
  // carry getters; downstream indexing must receive owned primitive snapshots.
  const data = (input: unknown, keys: readonly string[]): Record<string, unknown> => {
    if (typeof input !== 'object' || input === null || Array.isArray(input) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(input))) invalid('INCOMPATIBLE_CAPABILITY', 'analysis.token');
    const names = Reflect.ownKeys(input);
    if (names.length > keys.length) invalid('INCOMPATIBLE_CAPABILITY', 'analysis.token');
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of names) {
      if (typeof key !== 'string' || !keys.includes(key)) invalid('INCOMPATIBLE_CAPABILITY', 'analysis.token');
      const property = Object.getOwnPropertyDescriptor(input, key);
      if (!property || !('value' in property)) invalid('INCOMPATIBLE_CAPABILITY', 'analysis.token');
      result[key] = property.value;
    }
    return result;
  };
  const boundary = (offset: number): boolean => Number.isSafeInteger(offset) && offset >= 0 && offset <= value.length &&
    !(offset > 0 && offset < value.length && value.charCodeAt(offset) >= 0xdc00 && value.charCodeAt(offset) <= 0xdfff);
  try {
    for (;;) {
      const next = cursor.next(); check?.();
      if (next.done) break;
      const step = data(next.value, ['workUnits','token']);
      if (!Number.isSafeInteger(step.workUnits) || (step.workUnits as number) < 1) invalid('INCOMPATIBLE_CAPABILITY', 'analysis.work');
      yield charge(step.workUnits as number);
      if (!Object.hasOwn(step, 'token')) continue;
      const owned = data(step.token, ['term','valueIndex','position','start','end','kind','original']);
      if (Object.hasOwn(owned, 'original')) owned.original = Object.freeze(data(owned.original, ['term','start','end']));
      const token = Object.freeze(owned) as unknown as Token;
      if (token.valueIndex !== valueIndex || !boundary(token.start) || !boundary(token.end) || token.end <= token.start ||
          (token.kind !== 'original' && token.kind !== 'component') || typeof token.term !== 'string' || !token.term.length) invalid('INCOMPATIBLE_CAPABILITY', 'analysis.token');
      bound(token.end - token.start, limits.maxRawTokenCodeUnits, 'analysis.rawToken');
      bound(token.term.length, limits.maxTermCodeUnits, 'analysis.term');
      bound(++occurrences, limits.maxTokensPerRecord, 'analysis.tokens');
      for (const scan of scanUnicode(token.term, 'INCOMPATIBLE_CAPABILITY', 'analysis.term')) yield charge(scan.workUnits);
      yield charge(token.end - token.start + token.term.length + 1);
      if (value.slice(token.start, token.end).normalize('NFKC').toLowerCase() !== token.term) invalid('INCOMPATIBLE_CAPABILITY', 'analysis.term');
      if (token.kind === 'original') {
        if (token.original !== undefined || token.position !== position++ || token.start < previousEnd) invalid('INCOMPATIBLE_CAPABILITY', 'analysis.original');
        previousEnd = token.end; componentEnd = token.start; original = token; terms.clear(); terms.add(token.term);
      } else {
        const origin = token.original;
        if (mode !== 'index' || !original || !origin || !Object.isFrozen(origin) ||
            Object.keys(origin).length !== 3 || !Object.keys(origin).every(key => ['term','start','end'].includes(key)) ||
            origin.term !== original.term || origin.start !== original.start || origin.end !== original.end ||
            token.position !== original.position || token.start < componentEnd || token.end > original.end || terms.has(token.term)) invalid('INCOMPATIBLE_CAPABILITY', 'analysis.component');
        componentEnd = token.end; terms.add(token.term);
      }
      yield charge(1);
      yield { workUnits: 1, token };
    }
  } finally { try { cursor.return(undefined); } catch { /* Preserve operation failure/stop. */ } }
}
