import { Admission, has, keysOnly, ownArray, ownObject, stringValue } from '../../core/contracts/data.js';
import { bound, invalid } from '../../core/errors/error.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';

export interface FilterOptions {
  readonly fields: readonly string[];
  readonly id?: string;
  readonly maxWorkUnits?: number;
}
export interface CapturedFilterOptions {
  readonly fields: readonly string[];
  readonly id: string;
  readonly maxWorkUnits: number;
}

export function captureFilterOptions(input: unknown): CapturedFilterOptions {
  const admission = new Admission(DEFAULT_LIMITS.maxAdmissionEntries);
  const options = ownObject(input, 'INVALID_OPTIONS', 'filters.options', admission);
  keysOnly(options, ['fields', 'id', 'maxWorkUnits'], 'INVALID_OPTIONS', 'filters.options');
  const inputs = ownArray(options.fields, DEFAULT_LIMITS.maxMetadataFields, 'INVALID_OPTIONS', 'filters.fields', admission);
  if (inputs.length === 0) invalid('INVALID_OPTIONS', 'filters.fields');
  const seen = new Set<string>();
  const fields = Object.freeze(inputs.map(inputField => {
    const field = stringValue(inputField, DEFAULT_LIMITS.maxFieldNameCodeUnits, 'INVALID_OPTIONS', 'filters.fields');
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field) || field === 'constructor' || field === 'prototype' || seen.has(field)) invalid('INVALID_OPTIONS', 'filters.fields');
    seen.add(field);
    return field;
  }));
  const id = has(options, 'id') ? stringValue(options.id, 64, 'INVALID_OPTIONS', 'filters.id') : 'filters';
  if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(id)) invalid('INVALID_OPTIONS', 'filters.id');
  const maxWorkUnits = has(options, 'maxWorkUnits') ? options.maxWorkUnits : DEFAULT_LIMITS.maxSearchWorkUnits;
  if (typeof maxWorkUnits !== 'number' || !Number.isSafeInteger(maxWorkUnits) || maxWorkUnits < 1) invalid('INVALID_OPTIONS', 'filters.maxWorkUnits');
  bound(maxWorkUnits, DEFAULT_LIMITS.maxSearchWorkUnits, 'filters.maxWorkUnits');
  return Object.freeze({ fields, id, maxWorkUnits });
}
