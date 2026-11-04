import { Admission, has, keysOnly, ownArray, ownObject, stringValue } from '../../core/contracts/data.js';
import { bound, invalid } from '../../core/errors/error.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import type { ProximityOptions } from './types.js';

export interface CapturedOptions { readonly fields: readonly string[]; readonly id: string; readonly maxWorkUnits: number }

export function captureOptions(input: ProximityOptions): CapturedOptions {
  const admission = new Admission(DEFAULT_LIMITS.maxAdmissionEntries), raw = ownObject(input, 'INVALID_OPTIONS', 'proximity.options', admission);
  keysOnly(raw, ['fields', 'id', 'maxWorkUnits'], 'INVALID_OPTIONS', 'proximity.options');
  const seen = new Set<string>();
  const fields = ownArray(raw.fields, DEFAULT_LIMITS.maxTextFields, 'INVALID_OPTIONS', 'proximity.fields', admission).map(value => {
    const field = stringValue(value, DEFAULT_LIMITS.maxFieldNameCodeUnits, 'INVALID_OPTIONS', 'proximity.fields');
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field) || field === 'constructor' || field === 'prototype' || seen.has(field)) invalid('INVALID_OPTIONS', 'proximity.fields');
    seen.add(field); return field;
  });
  if (!fields.length) invalid('INVALID_OPTIONS', 'proximity.fields');
  const id = has(raw, 'id') ? stringValue(raw.id, 64, 'INVALID_OPTIONS', 'proximity.id') : 'proximity';
  if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(id)) invalid('INVALID_OPTIONS', 'proximity.id');
  const maxWorkUnits = has(raw, 'maxWorkUnits') ? raw.maxWorkUnits : DEFAULT_LIMITS.maxSearchWorkUnits;
  if (typeof maxWorkUnits !== 'number' || !Number.isSafeInteger(maxWorkUnits) || maxWorkUnits < 1) invalid('INVALID_OPTIONS', 'proximity.maxWorkUnits');
  bound(maxWorkUnits, DEFAULT_LIMITS.maxSearchWorkUnits, 'proximity.maxWorkUnits');
  return Object.freeze({ fields: Object.freeze(fields.sort()), id, maxWorkUnits });
}
