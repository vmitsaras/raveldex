import { analyzeValue } from '../../core/analyzer/basic.js';
import { Admission, has, keysOnly, ownArray, ownObject, stringValue } from '../../core/contracts/data.js';
import { bound, invalid } from '../../core/errors/error.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';

export interface SynonymMapping { readonly from: string; readonly to: string }
export interface SynonymsOptions {
  readonly fields: readonly string[];
  readonly vocabularyVersion: string;
  readonly mappings: readonly SynonymMapping[];
  readonly id?: string;
  readonly maxAlternatives?: number;
  readonly maxWorkUnits?: number;
}
export interface CapturedSynonymsOptions {
  readonly fields: readonly string[]; readonly vocabularyVersion: string;
  readonly mappings: readonly SynonymMapping[]; readonly id: string;
  readonly maxAlternatives: number; readonly maxWorkUnits: number;
}

/** Finite synchronous configuration capture; no application data/index is read. */
export function captureSynonymsOptions(input: unknown): CapturedSynonymsOptions {
  const admission = new Admission(DEFAULT_LIMITS.maxAdmissionEntries);
  const options = ownObject(input, 'INVALID_OPTIONS', 'synonyms.options', admission);
  keysOnly(options, ['fields', 'vocabularyVersion', 'mappings', 'id', 'maxAlternatives', 'maxWorkUnits'], 'INVALID_OPTIONS', 'synonyms.options');
  const inputs = ownArray(options.fields, DEFAULT_LIMITS.maxTextFields, 'INVALID_OPTIONS', 'synonyms.fields', admission);
  if (!inputs.length) invalid('INVALID_OPTIONS', 'synonyms.fields');
  const seen = new Set<string>();
  const fields = Object.freeze(inputs.map(value => {
    const field = stringValue(value, DEFAULT_LIMITS.maxFieldNameCodeUnits, 'INVALID_OPTIONS', 'synonyms.fields');
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field) || field === 'constructor' || field === 'prototype' || seen.has(field)) invalid('INVALID_OPTIONS', 'synonyms.fields');
    seen.add(field); return field;
  }).sort());
  const id = has(options, 'id') ? stringValue(options.id, 64, 'INVALID_OPTIONS', 'synonyms.id') : 'synonyms';
  if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(id)) invalid('INVALID_OPTIONS', 'synonyms.id');
  const vocabularyVersion = stringValue(options.vocabularyVersion, 32, 'INVALID_OPTIONS', 'synonyms.vocabularyVersion');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(vocabularyVersion)) invalid('INVALID_OPTIONS', 'synonyms.vocabularyVersion');
  const integer = (name: 'maxAlternatives' | 'maxWorkUnits', fallback: number): number => {
    const value = has(options, name) ? options[name] : fallback;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) invalid('INVALID_OPTIONS', `synonyms.${name}`);
    bound(value, fallback, `synonyms.${name}`); return value;
  };
  const maxAlternatives = integer('maxAlternatives', DEFAULT_LIMITS.maxVariantsPerGroup - 1);
  const maxWorkUnits = integer('maxWorkUnits', DEFAULT_LIMITS.maxSearchWorkUnits);
  let rawCodeUnits = 0;
  const token = (value: unknown): string => {
    const raw = stringValue(value, DEFAULT_LIMITS.maxRawTokenCodeUnits, 'INVALID_OPTIONS', 'synonyms.mapping');
    rawCodeUnits += raw.length; bound(rawCodeUnits, 4096, 'synonyms.mappings.codeUnits');
    const terms: string[] = [];
    for (const step of analyzeValue(raw, 0, DEFAULT_LIMITS, 'INVALID_OPTIONS')) if (step.token) terms.push(step.token.term);
    if (terms.length !== 1) invalid('INVALID_OPTIONS', 'synonyms.mapping.token');
    return terms[0]!;
  };
  const edges = new Map<string, SynonymMapping>(), targets = new Map<string, Set<string>>();
  for (const input of ownArray(options.mappings, 128, 'INVALID_OPTIONS', 'synonyms.mappings', admission)) {
    const mapping = ownObject(input, 'INVALID_OPTIONS', 'synonyms.mapping', admission);
    keysOnly(mapping, ['from', 'to'], 'INVALID_OPTIONS', 'synonyms.mapping');
    const from = token(mapping.from), to = token(mapping.to);
    if (from === to) continue;
    let selected = targets.get(from);
    if (!selected) { selected = new Set(); targets.set(from, selected); }
    selected.add(to); bound(selected.size, maxAlternatives, 'synonyms.mappings.alternatives');
    edges.set(JSON.stringify([from, to]), Object.freeze({ from, to }));
  }
  const mappings = Object.freeze([...edges.values()].sort((a, b) => a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
  return Object.freeze({ fields, vocabularyVersion, mappings, id, maxAlternatives, maxWorkUnits });
}
