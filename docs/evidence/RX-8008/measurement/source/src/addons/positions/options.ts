import { Admission, has, keysOnly, ownArray, ownObject, stringValue } from '../../core/contracts/data.js';
import { bound, invalid } from '../../core/errors/error.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';

export interface PositionProviderOptions {
  readonly fields: readonly string[];
  readonly offsets?: readonly string[];
  readonly id?: string;
  readonly maxRetainedEntries?: number;
  readonly maxWorkUnits?: number;
}
export interface PositionPhraseOptions {
  readonly fields: readonly string[];
  readonly id?: string;
  readonly maxWorkUnits?: number;
}
export interface CapturedPositionOptions {
  readonly fields: readonly string[];
  readonly offsetFields: readonly string[];
  readonly id: string;
  readonly maxRetainedEntries: number;
  readonly maxWorkUnits: number;
}

/** Record/field/value containers, distinct term entries, occurrences and optional
 * two original span coordinates. These logical counts are not heap bytes. */
export function positionEntryCeiling(documents: number, fields: number, values: number, tokens: number, offsets: boolean): number {
  return documents * (1 + fields * (1 + values)) + tokens * (offsets ? 4 : 2);
}

export function capturePositionOptions(input: unknown, participant: boolean): CapturedPositionOptions {
  const admission = new Admission(DEFAULT_LIMITS.maxAdmissionEntries);
  const options = ownObject(input, 'INVALID_OPTIONS', 'positions.options', admission);
  keysOnly(options, participant ? ['fields', 'offsets', 'id', 'maxRetainedEntries', 'maxWorkUnits'] : ['fields', 'id', 'maxWorkUnits'], 'INVALID_OPTIONS', 'positions.options');
  const captureFields = (input: unknown, path: string): readonly string[] => {
    const seen = new Set<string>();
    return Object.freeze(ownArray(input, DEFAULT_LIMITS.maxTextFields, 'INVALID_OPTIONS', path, admission).map(value => {
      const field = stringValue(value, DEFAULT_LIMITS.maxFieldNameCodeUnits, 'INVALID_OPTIONS', path);
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field) || field === 'constructor' || field === 'prototype' || seen.has(field)) invalid('INVALID_OPTIONS', path);
      seen.add(field); return field;
    }));
  };
  const fields = captureFields(options.fields, 'positions.fields');
  if (!fields.length) invalid('INVALID_OPTIONS', 'positions.fields');
  const offsetFields = participant && has(options, 'offsets') ? captureFields(options.offsets, 'positions.offsets') : Object.freeze([] as string[]);
  if (offsetFields.some(field => !fields.includes(field))) invalid('INVALID_OPTIONS', 'positions.offsets');
  const id = has(options, 'id') ? stringValue(options.id, 64, 'INVALID_OPTIONS', 'positions.id') : participant ? 'positions' : 'position-phrases';
  if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(id)) invalid('INVALID_OPTIONS', 'positions.id');
  const workCeiling = participant ? DEFAULT_LIMITS.maxMutationWorkUnits : DEFAULT_LIMITS.maxSearchWorkUnits;
  const maxWorkUnits = has(options, 'maxWorkUnits') ? options.maxWorkUnits : workCeiling;
  if (typeof maxWorkUnits !== 'number' || !Number.isSafeInteger(maxWorkUnits) || maxWorkUnits < 1) invalid('INVALID_OPTIONS', 'positions.maxWorkUnits');
  bound(maxWorkUnits, workCeiling, 'positions.maxWorkUnits');
  const ceiling = positionEntryCeiling(DEFAULT_LIMITS.maxDocuments, fields.length, DEFAULT_LIMITS.maxTextValuesPerField, DEFAULT_LIMITS.maxCorpusTokens, offsetFields.length > 0);
  const maxRetainedEntries = participant && has(options, 'maxRetainedEntries') ? options.maxRetainedEntries : participant ? ceiling : 0;
  if (typeof maxRetainedEntries !== 'number' || !Number.isSafeInteger(maxRetainedEntries) || maxRetainedEntries < 0) invalid('INVALID_OPTIONS', 'positions.maxRetainedEntries');
  bound(maxRetainedEntries, ceiling, 'positions.maxRetainedEntries');
  return Object.freeze({ fields, offsetFields, id, maxWorkUnits, maxRetainedEntries });
}
