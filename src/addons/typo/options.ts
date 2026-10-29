import { Admission, has, keysOnly, ownArray, ownObject, stringValue } from '../../core/contracts/data.js';
import { bound, invalid } from '../../core/errors/error.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';

export interface TypoOptions {
  readonly fields: readonly string[];
  readonly id?: string;
  readonly maxAlternatives?: number;
  readonly maxWorkUnits?: number;
}
export interface CapturedTypoOptions {
  readonly fields: readonly string[]; readonly id: string;
  readonly maxAlternatives: number; readonly maxWorkUnits: number;
}
export function captureTypoOptions(input: unknown): CapturedTypoOptions {
  const admission = new Admission(DEFAULT_LIMITS.maxAdmissionEntries);
  const options = ownObject(input, 'INVALID_OPTIONS', 'typo.options', admission);
  keysOnly(options, ['fields', 'id', 'maxAlternatives', 'maxWorkUnits'], 'INVALID_OPTIONS', 'typo.options');
  const inputs = ownArray(options.fields, DEFAULT_LIMITS.maxTextFields, 'INVALID_OPTIONS', 'typo.fields', admission);
  if (!inputs.length) invalid('INVALID_OPTIONS', 'typo.fields');
  const seen = new Set<string>();
  const fields = Object.freeze(inputs.map(value => {
    const field = stringValue(value, DEFAULT_LIMITS.maxFieldNameCodeUnits, 'INVALID_OPTIONS', 'typo.fields');
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field) || field === 'constructor' || field === 'prototype' || seen.has(field)) invalid('INVALID_OPTIONS', 'typo.fields');
    seen.add(field); return field;
  }).sort());
  const id = has(options, 'id') ? stringValue(options.id, 64, 'INVALID_OPTIONS', 'typo.id') : 'typo';
  if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(id)) invalid('INVALID_OPTIONS', 'typo.id');
  const integer = (name: 'maxAlternatives' | 'maxWorkUnits', fallback: number, maximum: number): number => {
    const value = has(options, name) ? options[name] : fallback;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) invalid('INVALID_OPTIONS', `typo.${name}`);
    bound(value, maximum, `typo.${name}`); return value;
  };
  const maximumAlternatives = DEFAULT_LIMITS.maxVariantsPerGroup - 1;
  return Object.freeze({ fields, id, maxAlternatives: integer('maxAlternatives', maximumAlternatives, maximumAlternatives),
    maxWorkUnits: integer('maxWorkUnits', DEFAULT_LIMITS.maxSearchWorkUnits, DEFAULT_LIMITS.maxSearchWorkUnits) });
}
