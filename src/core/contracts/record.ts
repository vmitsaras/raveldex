import { Admission, has, keysOnly, ownArray, ownObject, scanUnicode, stringValue } from './data.js';
import type { ScanStep } from './data.js';
import { bound, invalid } from '../errors/error.js';
import type { Limits } from '../limits/limits.js';
import type { MetadataType, OwnedRecord, OwnedSchema, Scalar, ValidationCode } from './types.js';
import { analyzeValue } from '../analyzer/basic.js';
import type { Token } from '../analyzer/basic.js';

export function captureId(input: unknown, limits: Limits, code: ValidationCode, path: string): string {
  const id = stringValue(input, limits.maxIdCodeUnits, code, path);
  if (!id.length) invalid(code, path);
  return id;
}

export function captureScalar(input: unknown, field: { readonly type: MetadataType; readonly nullable: boolean }, limits: Limits, code: ValidationCode, path: string): Scalar {
  if (input === null && field.nullable) return null;
  if (typeof input !== field.type) invalid(code, path);
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) invalid(code, path);
    return input === 0 ? 0 : input;
  }
  if (typeof input === 'string') return stringValue(input, limits.maxMetadataStringCodeUnits, code, path);
  if (typeof input === 'boolean') return input;
  return invalid(code, path);
}

export function captureRecord(input: unknown, schema: OwnedSchema, limits: Limits, admission = new Admission(limits.maxAdmissionEntries), path = 'record'): OwnedRecord {
  const record = ownObject(input, 'INVALID_RECORD', path, admission);
  keysOnly(record, ['id', 'text', 'metadata'], 'INVALID_RECORD', path);
  const id = captureId(record.id, limits, 'INVALID_RECORD', `${path}.id`);
  const textInput = ownObject(record.text, 'INVALID_RECORD', `${path}.text`, admission);
  const metadataInput = has(record, 'metadata') ? ownObject(record.metadata, 'INVALID_RECORD', `${path}.metadata`, admission) : Object.create(null) as Record<string, unknown>;
  const text: Record<string, readonly string[]> = Object.create(null) as typeof text;
  const metadata: Record<string, Scalar | readonly Scalar[]> = Object.create(null) as typeof metadata;
  let textCodeUnits = 0;
  let metadataCodeUnits = 0;
  for (const name of Object.keys(textInput)) {
    if (!has(schema.text, name)) invalid('INVALID_RECORD', `${path}.text`);
    const fieldPath = `${path}.text.${name}`;
    const raw = textInput[name];
    const values = typeof raw === 'string' ? [raw] : ownArray(raw, limits.maxTextValuesPerField, 'INVALID_RECORD', fieldPath, admission);
    text[name] = Object.freeze(values.map((value, i) => {
      const string = stringValue(value, limits.maxTextCodeUnitsPerValue, 'INVALID_RECORD', `${fieldPath}[${i}]`);
      textCodeUnits += string.length;
      bound(textCodeUnits, limits.maxTextCodeUnitsPerRecord, `${path}.text`);
      return string;
    }));
  }
  for (const name of Object.keys(metadataInput)) {
    const field = schema.metadata[name];
    if (!field) invalid('INVALID_RECORD', `${path}.metadata`);
    const fieldPath = `${path}.metadata.${name}`;
    const value = metadataInput[name];
    const values = field.multi ? ownArray(value, limits.maxMetadataValuesPerField, 'INVALID_RECORD', fieldPath, admission) : [value];
    const owned = values.map((item, i) => {
      const scalar = captureScalar(item, field, limits, 'INVALID_RECORD', `${fieldPath}[${i}]`);
      if (typeof scalar === 'string') metadataCodeUnits += scalar.length;
      bound(metadataCodeUnits, limits.maxMetadataCodeUnitsPerRecord, `${path}.metadata`);
      return scalar;
    });
    metadata[name] = field.multi ? Object.freeze(owned) : owned[0]!;
  }
  return Object.freeze({ id, text: Object.freeze(text), metadata: Object.freeze(metadata), textCodeUnits });
}

export function captureBatch(input: unknown, schema: OwnedSchema, limits: Limits, admission = new Admission(limits.maxAdmissionEntries)): readonly OwnedRecord[] {
  const values = ownArray(input, limits.maxMutationBatch, 'INVALID_RECORD', 'records', admission);
  const ids = new Set<string>();
  return Object.freeze(values.map((value, i) => {
    const record = captureRecord(value, schema, limits, admission, `records[${i}]`);
    if (ids.has(record.id)) invalid('INVALID_RECORD', `records[${i}].id`);
    ids.add(record.id);
    return record;
  }));
}

export function captureRemoveIds(input: unknown, limits: Limits, admission = new Admission(limits.maxAdmissionEntries)): readonly string[] {
  const values = typeof input === 'string' ? [input] : ownArray(input, limits.maxMutationBatch, 'INVALID_OPTIONS', 'ids', admission);
  const ids = new Set<string>();
  return Object.freeze(values.map((value, i) => {
    const id = captureId(value, limits, 'INVALID_OPTIONS', `ids[${i}]`);
    if (ids.has(id)) invalid('INVALID_OPTIONS', `ids[${i}]`);
    ids.add(id);
    return id;
  }));
}

export interface RecordStep extends ScanStep { readonly field?: string; readonly token?: Token }
/** Optional private invocation diagnostics, collected at the actual analyzer. */
export interface RecordAnalysisCounts { records: number; values: number; textCodeUnits: number }
/** Temporary source is owned until processing finishes; no engine retention here. */
export function* analyzeRecord(record: OwnedRecord, limits: Limits, counts?: RecordAnalysisCounts): Generator<RecordStep> {
  if (counts) counts.records++;
  yield* scanUnicode(record.id, 'INVALID_RECORD', 'record.id');
  for (const [field, value] of Object.entries(record.metadata)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === 'string') yield* scanUnicode(item, 'INVALID_RECORD', `record.metadata.${field}`);
    }
  }
  let tokens = 0;
  for (const [field, values] of Object.entries(record.text)) {
    for (let i = 0; i < values.length; i++) {
      if (counts) { counts.values++; counts.textCodeUnits += values[i]!.length; }
      for (const step of analyzeValue(values[i]!, i, limits)) {
        if (step.token) {
          bound(++tokens, limits.maxTokensPerRecord, 'record.tokens');
          yield { ...step, field };
        } else yield step;
      }
    }
  }
}

/** Called after content validation; duplicates have one logical membership. */
export function canonicalMetadata(record: OwnedRecord): OwnedRecord['metadata'] {
  const result: Record<string, Scalar | readonly Scalar[]> = Object.create(null) as typeof result;
  for (const [name, value] of Object.entries(record.metadata)) {
    result[name] = Array.isArray(value) ? Object.freeze([...new Set(value)]) : value;
  }
  return Object.freeze(result);
}
