import { Admission, has, keysOnly, ownArray, ownObject, stringValue } from '../../core/contracts/data.js';
import { bound, invalid } from '../../core/errors/error.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';

export interface SourceProviderOptions {
  readonly fields: readonly string[];
  readonly id?: string;
  readonly maxRetainedEntries?: number;
  readonly maxWorkUnits?: number;
}
export interface SourcePhraseOptions {
  readonly fields: readonly string[];
  readonly id?: string;
  readonly maxWorkUnits?: number;
}
export interface CapturedPhraseOptions {
  readonly fields: readonly string[];
  readonly id: string;
  readonly maxRetainedEntries: number;
  readonly maxWorkUnits: number;
}

/** A logical entry is a record, a retained field, or one original value. */
export function sourceEntryCeiling(documents: number, fields: number, values: number): number {
  return documents * (1 + fields * (1 + values));
}

export function capturePhraseOptions(input: unknown, source: boolean): CapturedPhraseOptions {
  const admission = new Admission(DEFAULT_LIMITS.maxAdmissionEntries);
  const options = ownObject(input, 'INVALID_OPTIONS', 'addons.options', admission);
  keysOnly(options, source ? ['fields', 'id', 'maxRetainedEntries', 'maxWorkUnits'] : ['fields', 'id', 'maxWorkUnits'], 'INVALID_OPTIONS', 'addons.options');
  const fieldsInput = ownArray(options.fields, DEFAULT_LIMITS.maxTextFields, 'INVALID_OPTIONS', 'addons.fields', admission);
  if (fieldsInput.length === 0) invalid('INVALID_OPTIONS', 'addons.fields');
  const seen = new Set<string>();
  const fields = Object.freeze(fieldsInput.map(value => {
    const field = stringValue(value, DEFAULT_LIMITS.maxFieldNameCodeUnits, 'INVALID_OPTIONS', 'addons.fields');
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field) || field === 'constructor' || field === 'prototype' || seen.has(field)) invalid('INVALID_OPTIONS', 'addons.fields');
    seen.add(field);
    return field;
  }));
  const id = has(options, 'id') ? stringValue(options.id, 64, 'INVALID_OPTIONS', 'addons.id') : source ? 'source' : 'source-phrases';
  if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(id)) invalid('INVALID_OPTIONS', 'addons.id');
  const workCeiling = source ? DEFAULT_LIMITS.maxMutationWorkUnits : DEFAULT_LIMITS.maxSearchWorkUnits;
  const maxWorkUnits = has(options, 'maxWorkUnits') ? options.maxWorkUnits : workCeiling;
  if (typeof maxWorkUnits !== 'number' || !Number.isSafeInteger(maxWorkUnits) || maxWorkUnits < 1) invalid('INVALID_OPTIONS', 'addons.maxWorkUnits');
  bound(maxWorkUnits, workCeiling, 'addons.maxWorkUnits');
  const entryCeiling = sourceEntryCeiling(DEFAULT_LIMITS.maxDocuments, fields.length, DEFAULT_LIMITS.maxTextValuesPerField);
  const maxRetainedEntries = source && has(options, 'maxRetainedEntries') ? options.maxRetainedEntries : source ? entryCeiling : 0;
  if (typeof maxRetainedEntries !== 'number' || !Number.isSafeInteger(maxRetainedEntries) || maxRetainedEntries < 0) invalid('INVALID_OPTIONS', 'addons.maxRetainedEntries');
  bound(maxRetainedEntries, entryCeiling, 'addons.maxRetainedEntries');
  return Object.freeze({ fields, id, maxWorkUnits, maxRetainedEntries });
}
