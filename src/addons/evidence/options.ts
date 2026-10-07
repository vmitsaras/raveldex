import { Admission, has, keysOnly, ownArray, ownObject, stringValue } from '../../core/contracts/data.js';
import type { CapturedPayload, PayloadContext } from '../../core/capabilities/types.js';
import { bound, invalid } from '../../core/errors/error.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import type { Limits } from '../../core/limits/limits.js';
import { captureMetadataPayload } from '../metadata/payload.js';
import type { MatchEvidenceOptions } from './types.js';

export interface CapturedMatchOptions {
  readonly id: string;
  readonly fields: readonly string[];
  readonly strategies: Readonly<Record<string, 'source' | 'offsets'>>;
  readonly maxFacts: number;
  readonly maxRanges: number;
  readonly maxWorkUnits: number;
  readonly maxOutputEntries: number;
}
export interface OwnedMatchRequest {
  readonly ids: readonly string[];
  readonly fields: readonly string[];
  readonly expectedRevision?: number;
  readonly maxFacts: number;
  readonly maxRanges: number;
}
function name(input: unknown, path: string): string {
  const value = stringValue(input, DEFAULT_LIMITS.maxFieldNameCodeUnits, 'INVALID_OPTIONS', path);
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value) || value === 'constructor' || value === 'prototype') invalid('INVALID_OPTIONS', path);
  return value;
}
function integer(input: unknown, maximum: number, path: string): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 1) invalid('INVALID_OPTIONS', path);
  bound(input, maximum, path); return input;
}
export function captureMatchOptions(input: MatchEvidenceOptions, defaultId: string): CapturedMatchOptions {
  const admission = new Admission(DEFAULT_LIMITS.maxAdmissionEntries);
  const raw = ownObject(input, 'INVALID_OPTIONS', 'evidence.options', admission);
  keysOnly(raw, ['fields', 'id', 'maxFacts', 'maxRanges', 'maxWorkUnits', 'maxOutputEntries'], 'INVALID_OPTIONS', 'evidence.options');
  const id = has(raw, 'id') ? stringValue(raw.id, 64, 'INVALID_OPTIONS', 'evidence.id') : defaultId;
  if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(id)) invalid('INVALID_OPTIONS', 'evidence.id');
  const fields = ownObject(raw.fields, 'INVALID_OPTIONS', 'evidence.fields', admission), names = Object.keys(fields);
  if (!names.length) invalid('INVALID_OPTIONS', 'evidence.fields');
  bound(names.length, DEFAULT_LIMITS.maxTextFields, 'evidence.fields');
  const strategies: Record<string, 'source' | 'offsets'> = Object.create(null) as typeof strategies;
  for (const field of names) {
    name(field, 'evidence.fields');
    const strategy = fields[field];
    if (strategy !== 'source' && strategy !== 'offsets') invalid('INVALID_OPTIONS', 'evidence.strategy');
    strategies[field] = strategy;
  }
  return Object.freeze({ id, fields: Object.freeze(names.sort()), strategies: Object.freeze(strategies),
    maxFacts: integer(has(raw, 'maxFacts') ? raw.maxFacts : 4096, 4096, 'evidence.maxFacts'),
    maxRanges: integer(has(raw, 'maxRanges') ? raw.maxRanges : 4096, 4096, 'evidence.maxRanges'),
    maxWorkUnits: integer(has(raw, 'maxWorkUnits') ? raw.maxWorkUnits : DEFAULT_LIMITS.maxSearchWorkUnits, DEFAULT_LIMITS.maxSearchWorkUnits, 'evidence.maxWorkUnits'),
    maxOutputEntries: integer(has(raw, 'maxOutputEntries') ? raw.maxOutputEntries : DEFAULT_LIMITS.maxAdmissionEntries, DEFAULT_LIMITS.maxAdmissionEntries, 'evidence.maxOutputEntries'),
  });
}
export function parseMatchRequest(input: unknown, limits: Limits, options: CapturedMatchOptions): OwnedMatchRequest {
  const admission = new Admission(limits.maxAdmissionEntries);
  const raw = ownObject(input, 'INVALID_OPTIONS', 'evidence.request', admission);
  keysOnly(raw, ['ids', 'fields', 'expectedRevision', 'maxFacts', 'maxRanges'], 'INVALID_OPTIONS', 'evidence.request');
  const idsSeen = new Set<string>();
  const ids = Object.freeze(ownArray(raw.ids, Math.min(128, limits.maxDocuments), 'INVALID_OPTIONS', 'evidence.ids', admission).map(input => {
    const value = stringValue(input, limits.maxIdCodeUnits, 'INVALID_OPTIONS', 'evidence.ids');
    if (!value.length || idsSeen.has(value)) invalid('INVALID_OPTIONS', 'evidence.ids');
    idsSeen.add(value); return value;
  }));
  const seen = new Set<string>();
  const fields = has(raw, 'fields') ? Object.freeze(ownArray(raw.fields, limits.maxTextFields, 'INVALID_OPTIONS', 'evidence.fields', admission).map(input => {
    const field = name(input, 'evidence.fields');
    if (seen.has(field)) invalid('INVALID_OPTIONS', 'evidence.fields');
    if (!has(options.strategies, field)) invalid('MISSING_CAPABILITY', 'evidence.fields');
    seen.add(field); return field;
  }).sort()) : options.fields;
  const revision = raw.expectedRevision;
  if (has(raw, 'expectedRevision') && (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0)) invalid('INVALID_OPTIONS', 'evidence.expectedRevision');
  return Object.freeze({ ids, fields,
    ...(typeof revision === 'number' ? { expectedRevision: revision } : {}),
    maxFacts: integer(has(raw, 'maxFacts') ? raw.maxFacts : options.maxFacts, options.maxFacts, 'evidence.maxFacts'),
    maxRanges: integer(has(raw, 'maxRanges') ? raw.maxRanges : options.maxRanges, options.maxRanges, 'evidence.maxRanges'),
  });
}
export function captureMatchRequest(input: unknown, context: PayloadContext, options: CapturedMatchOptions): CapturedPayload {
  const captured = captureMetadataPayload(input, context, 'INVALID_OPTIONS');
  return Object.freeze({ value: parseMatchRequest(captured.value, context.limits, options), codeUnits: captured.codeUnits });
}
