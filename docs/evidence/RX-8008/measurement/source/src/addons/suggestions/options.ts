import { Admission, has, keysOnly, ownArray, ownObject, stringValue } from '../../core/contracts/data.js';
import { bound, invalid } from '../../core/errors/error.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';

export interface SuggestionsOptions {
  readonly fields: readonly string[];
  readonly id?: string;
  readonly maxSuggestions?: number;
  readonly maxCandidates?: number;
  readonly maxWorkUnits?: number;
}
export interface SuggestionRequest { readonly text: string; readonly fields?: readonly string[]; readonly limit?: number }
export interface Suggestion { readonly term: string; readonly fieldDocumentFrequency: number }
export interface SuggestionsResult {
  readonly policy: 'dictionary-prefix-df-v1'; readonly prefix: string; readonly fields: readonly string[];
  readonly total: number; readonly omitted: number; readonly items: readonly Suggestion[];
  readonly dictionaryEntriesVisited: number;
}
export interface CapturedSuggestionsOptions {
  readonly fields: readonly string[]; readonly id: string;
  readonly maxSuggestions: number; readonly maxCandidates: number; readonly maxWorkUnits: number;
}
export function captureSuggestionsOptions(input: unknown): CapturedSuggestionsOptions {
  const admission = new Admission(DEFAULT_LIMITS.maxAdmissionEntries);
  const options = ownObject(input, 'INVALID_OPTIONS', 'suggestions.options', admission);
  keysOnly(options, ['fields', 'id', 'maxSuggestions', 'maxCandidates', 'maxWorkUnits'], 'INVALID_OPTIONS', 'suggestions.options');
  const inputs = ownArray(options.fields, DEFAULT_LIMITS.maxTextFields, 'INVALID_OPTIONS', 'suggestions.fields', admission);
  if (!inputs.length) invalid('INVALID_OPTIONS', 'suggestions.fields');
  const seen = new Set<string>();
  const fields = Object.freeze(inputs.map(value => {
    const field = stringValue(value, DEFAULT_LIMITS.maxFieldNameCodeUnits, 'INVALID_OPTIONS', 'suggestions.fields');
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field) || field === 'constructor' || field === 'prototype' || seen.has(field)) invalid('INVALID_OPTIONS', 'suggestions.fields');
    seen.add(field); return field;
  }).sort());
  const id = has(options, 'id') ? stringValue(options.id, 64, 'INVALID_OPTIONS', 'suggestions.id') : 'suggestions';
  if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(id)) invalid('INVALID_OPTIONS', 'suggestions.id');
  const integer = (name: string, fallback: number, maximum: number): number => {
    const value = has(options, name) ? options[name] : fallback;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) invalid('INVALID_OPTIONS', `suggestions.${name}`);
    bound(value, maximum, `suggestions.${name}`); return value;
  };
  return Object.freeze({ fields, id, maxSuggestions: integer('maxSuggestions', 10, 20), maxCandidates: integer('maxCandidates', 10_000, 10_000),
    maxWorkUnits: integer('maxWorkUnits', DEFAULT_LIMITS.maxSearchWorkUnits, DEFAULT_LIMITS.maxSearchWorkUnits) });
}
