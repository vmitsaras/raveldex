import { Admission, ownArray, ownObject, scanUnicode } from '../../core/contracts/data.js';
import type { AggregationOutput } from '../../core/capabilities/types.js';
import type { ErrorCode } from '../../core/errors/error.js';
import { bound, invalid } from '../../core/errors/error.js';
import type { WorkStep } from '../../core/index/directory.js';

/** Aggregate original UTF-16 keys/strings, separate from JSON serialization size. */
export const MAX_INSPECTOR_TEXT_CODE_UNITS = 262_144;
/** Copy and verify the entire projection, charging every structural/string step. */
export function* ownInspectorOutput(input: unknown, maximumEntries: number, code: ErrorCode = 'INCOMPATIBLE_CAPABILITY'): Generator<WorkStep, AggregationOutput> {
  const admission = new Admission(maximumEntries), ancestors = new Set<object>();
  let codeUnits = 0;
  function* text(value: string): Generator<WorkStep, string> {
    codeUnits += value.length; bound(codeUnits, MAX_INSPECTOR_TEXT_CODE_UNITS, 'inspector.output.text');
    yield* scanUnicode(value, code, 'inspector.output.text'); return value;
  }
  function* copy(value: unknown, depth: number): Generator<WorkStep, unknown> {
    bound(depth, 16, 'inspector.output.depth'); yield { workUnits: 1 };
    if (typeof value === 'string') return yield* text(value);
    if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || value === null || ancestors.has(value)) invalid(code, 'inspector.output');
    ancestors.add(value);
    let owned: unknown;
    if (Array.isArray(value)) {
      const data = ownArray(value, maximumEntries, code, 'inspector.output', admission), result: unknown[] = [];
      yield { workUnits: data.length + 1 };
      for (const item of data) result.push(yield* copy(item, depth + 1));
      owned = Object.freeze(result);
    } else {
      const data = ownObject(value, code, 'inspector.output', admission);
      yield { workUnits: Object.keys(data).length };
      for (const key of Object.keys(data)) { yield* text(key); data[key] = yield* copy(data[key], depth + 1); }
      owned = Object.freeze(data);
    }
    ancestors.delete(value); return owned;
  }
  const value = yield* copy(input, 1);
  return Object.freeze({ value, entries: admission.count });
}
