import { Admission, has, keysOnly, ownObject } from './data.js';
import { bound, invalid } from '../errors/error.js';
import type { Limits } from '../limits/limits.js';
import type { CancellationSignal, OwnedOptions, OwnedSearchOptions } from './types.js';
import type { CapabilitySet } from '../capabilities/types.js';
import { captureExtension } from '../capabilities/capture.js';

function integer(value: unknown, minimum: number, maximum: number, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) invalid('INVALID_OPTIONS', path);
  bound(value, maximum, path);
  return value;
}

export function captureOptions(input: unknown, limits: Limits, search: false, admission?: Admission, capabilities?: CapabilitySet): OwnedOptions;
export function captureOptions(input: unknown, limits: Limits, search: true, admission?: Admission, capabilities?: CapabilitySet): OwnedSearchOptions;
export function captureOptions(input: unknown = {}, limits: Limits, search: boolean, admission = new Admission(limits.maxAdmissionEntries), capabilities?: CapabilitySet): OwnedOptions | OwnedSearchOptions {
  const data = ownObject(input, 'INVALID_OPTIONS', 'options', admission);
  keysOnly(data, search ? ['signal', 'deadlineMs', 'limit', 'offset', 'extensions'] : ['signal', 'deadlineMs'], 'INVALID_OPTIONS', 'options');
  const deadlineMs = has(data, 'deadlineMs') ? integer(data.deadlineMs, 1, limits.maxDeadlineMs, 'options.deadlineMs') : Math.min(30_000, limits.maxDeadlineMs);
  let signal: CancellationSignal | undefined;
  if (has(data, 'signal')) {
    // Signals are explicit live host handles, unlike owned query/record data.
    const candidate = data.signal as Partial<CancellationSignal> | null;
    if (typeof candidate !== 'object' || candidate === null || typeof candidate.aborted !== 'boolean' || typeof candidate.addEventListener !== 'function' || typeof candidate.removeEventListener !== 'function') invalid('INVALID_OPTIONS', 'options.signal');
    signal = candidate as CancellationSignal;
  }
  const base = { deadlineMs, ...(signal ? { signal } : {}) };
  if (!search) return Object.freeze(base);
  const offset = has(data, 'offset') ? integer(data.offset, 0, limits.maxDocuments, 'options.offset') : 0;
  const limit = has(data, 'limit') ? integer(data.limit, 0, limits.maxHits, 'options.limit') : Math.min(20, limits.maxHits, limits.maxDocuments - offset);
  bound(offset + limit, limits.maxDocuments, 'options.page');
  let extensions: Readonly<Record<string, unknown>> | undefined;
  if (has(data, 'extensions')) {
    const captured = ownObject(data.extensions, 'INVALID_OPTIONS', 'options.extensions', admission);
    let units = 0;
    for (const capability of Object.keys(captured)) {
      const registration = capabilities?.providers[capability];
      const handler = registration?.evidence ?? registration?.aggregation;
      if (!registration || !handler) invalid('MISSING_CAPABILITY', 'options.extensions');
      const payload = captureExtension(handler.capture, captured[capability], admission, limits, registration.manifest.limits.maxPayloadCodeUnits);
      units += capability.length + payload.codeUnits; bound(units, limits.maxQueryCodeUnits, 'options.extensions');
      captured[capability] = payload.value;
    }
    if (Object.keys(captured).length) extensions = Object.freeze(captured);
  }
  return Object.freeze({ ...base, offset, limit, ...(extensions ? { extensions } : {}) });
}
