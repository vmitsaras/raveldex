import type { CapturedPayload, PayloadContext } from './types.js';
import type { Admission } from '../contracts/data.js';
import type { Limits } from '../limits/limits.js';
import { bound, invalid } from '../errors/error.js';

/** Enforce trusted bounded-capture accounting without importing optional parsers. */
export function captureExtension(capture: (input: unknown, context: PayloadContext) => CapturedPayload, input: unknown, admission: Admission, limits: Limits, maximum: number): CapturedPayload {
  const maxCodeUnits = Math.min(maximum, limits.maxQueryCodeUnits);
  const captured = capture(input, Object.freeze({ admission, limits, maxCodeUnits }));
  if (!captured || !Number.isSafeInteger(captured.codeUnits) || captured.codeUnits < 0 || captured.value !== null && typeof captured.value === 'object' && !Object.isFrozen(captured.value)) invalid('INCOMPATIBLE_CAPABILITY', 'extensions.capture');
  bound(captured.codeUnits, maxCodeUnits, 'extensions.payload');
  return captured;
}
