import { Admission, ownArray, ownObject, scanUnicode } from '../../core/contracts/data.js';
import type { ErrorCode } from '../../core/errors/error.js';
import { bound, invalid } from '../../core/errors/error.js';
import type { WorkStep } from '../../core/index/directory.js';
import type { CapturedPayload, PayloadContext, AggregationOutput } from '../../core/capabilities/types.js';
import type { Limits } from '../../core/limits/limits.js';

/** Optional plain JSON ownership; shared admission counts keys/array entries,
 * and keys plus scalar strings count against aggregate UTF-16 payload bounds. */
function copyPayload(input: unknown, admission: Admission, code: ErrorCode, maximum: number): CapturedPayload {
  let codeUnits = 0;
  const path = 'extensions.payload', ancestors = new Set<object>();
  const text = (value: string): string => { codeUnits += value.length; bound(codeUnits, maximum, path); return value; };
  function copy(value: unknown, depth: number): unknown {
    bound(depth, 16, path);
    if (typeof value === 'string') return text(value);
    if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || value === null || ancestors.has(value)) invalid(code, path);
    ancestors.add(value);
    let owned: unknown;
    if (Array.isArray(value)) owned = Object.freeze(ownArray(value, admission.maximum, code, path, admission).map(item => copy(item, depth + 1)));
    else {
      const data = ownObject(value, code, path, admission);
      for (const key of Object.keys(data)) { text(key); data[key] = copy(data[key], depth + 1); }
      owned = Object.freeze(data);
    }
    ancestors.delete(value); return owned;
  }
  return Object.freeze({ value: copy(input, 1), codeUnits });
}

export function captureMetadataPayload(input: unknown, context: PayloadContext, code: 'INVALID_QUERY' | 'INVALID_OPTIONS'): CapturedPayload {
  return copyPayload(input, context.admission, code, context.maxCodeUnits);
}

/** Deferred content checks are charged to the role's operation budget. */
export function* validatePayload(value: unknown, code: ErrorCode): Generator<WorkStep> {
  yield { workUnits: 1 };
  if (typeof value === 'string') yield* scanUnicode(value, code, 'extensions.payload');
  else if (Array.isArray(value)) for (const item of value) yield* validatePayload(item, code);
  else if (value !== null && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    yield* scanUnicode(key, code, 'extensions.payload'); yield* validatePayload(item, code);
  }
}

/** First-party output proves deep ownership and reports actual structural entries.
 * Core enforces the installed output cap; work joins the same role budget. */
export function* captureMetadataOutput(input: unknown, limits: Limits): Generator<WorkStep, AggregationOutput> {
  const admission = new Admission(limits.maxAdmissionEntries);
  const captured = copyPayload(input, admission, 'INCOMPATIBLE_CAPABILITY', limits.maxAdmissionEntries * limits.maxMetadataStringCodeUnits);
  yield { workUnits: admission.count + captured.codeUnits };
  yield* validatePayload(captured.value, 'INCOMPATIBLE_CAPABILITY');
  return Object.freeze({ value: captured.value, entries: admission.count });
}
