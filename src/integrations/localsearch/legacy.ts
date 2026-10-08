/** Source admission rules adapted from vmitsaras/LocalSearch
 * src/contracts/{defaults,input,lexical-bounds}.ts at
 * 5f334a8ca4f7d9d95b6b731ac539f4b1dda302cb.
 * Copyright (c) 2026 Vasileios Mitsaras. MIT license: ./LICENSE.LocalSearch.
 * These historical bounds/identities are independent of native basic-v1.
 */
import { fail } from './error.js';

export const DEFAULTS = Object.freeze({ analyzerId: 'basic-v1', boost: 1 } as const);
export const LIMITS = Object.freeze({
  records: 10_000, schemaFields: 32, textFields: 16, schemaNameUnits: 64,
  idUnits: 256, textValueUnits: 50_000, keywordUnits: 2_048,
  textArrayValues: 128, retainedArraySlots: 100_000,
  sourceStringUnits: 10_000_000, indexedTokens: 1_000_000,
});
export type LegacyField = Readonly<{ type: 'text' | 'text[]'; boost: number }>
  | Readonly<{ type: 'keyword' | 'number' | 'boolean' }>;
export type LegacyValue = string | readonly string[] | number | boolean;
export type SearchRecord = Readonly<Record<string, LegacyValue>> & { readonly id: string };
export interface CapturedOptions {
  readonly schema: Readonly<Record<string, LegacyField>>;
  readonly analyzerId: 'basic-v1';
  readonly returnFields: readonly string[];
  readonly textFields: readonly string[];
}
export interface SnapshotRef { readonly sessionId: string; readonly generation: number }
export interface SourceUsage {
  readonly recordCount: number;
  readonly sourceStringUnits: number;
  readonly arraySlots: number;
  readonly indexedTokens: number;
}

function invalid(reason: Parameters<typeof fail>[1]): never { return fail('INVALID_SNAPSHOT', reason); }
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid('shape');
  const data = value as Record<string, unknown>, prototype: unknown = Object.getPrototypeOf(data);
  if (prototype !== null && prototype !== Object.prototype) invalid('shape');
  return data;
}
function array(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value)) invalid('shape');
  if (value.length > maximum) invalid('limit');
  return value;
}
function keys(data: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(data).some(key => !allowed.includes(key))) invalid('keys');
}
function string(value: unknown, maximum: number): string {
  if (typeof value !== 'string') invalid('type');
  if (value.length > maximum) invalid('limit');
  return value;
}

/** Input is private JSON.parse output already checked by the lexical preflight. */
export function captureOptions(input: unknown): CapturedOptions {
  const data = object(input); keys(data, ['schema', 'analyzerId', 'returnFields']);
  const raw = object(data['schema']), names = Object.keys(raw);
  if (names.length > LIMITS.schemaFields) invalid('limit');
  const schema: Record<string, LegacyField> = Object.create(null) as typeof schema;
  const textFields: string[] = [];
  for (const name of names) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || name.length > LIMITS.schemaNameUnits
      || ['id', '__proto__', 'prototype', 'constructor'].includes(name)) invalid('keys');
    const definition = object(raw[name]), type = definition['type'];
    if (type === 'text' || type === 'text[]') {
      keys(definition, ['type', 'boost']);
      const boost = Object.hasOwn(definition, 'boost') ? definition['boost'] : DEFAULTS.boost;
      if (typeof boost !== 'number' || !Number.isFinite(boost) || boost <= 0 || boost > 1000) invalid('value');
      schema[name] = Object.freeze({ type, boost }); textFields.push(name);
    } else {
      keys(definition, ['type']);
      if (type !== 'keyword' && type !== 'number' && type !== 'boolean') invalid('type');
      schema[name] = Object.freeze({ type });
    }
  }
  if (!textFields.length) invalid('value');
  if (textFields.length > LIMITS.textFields) invalid('limit');
  if (data['analyzerId'] !== DEFAULTS.analyzerId) invalid('value');
  const returnFields: string[] = [], seen = new Set<string>();
  for (const field of array(data['returnFields'], LIMITS.schemaFields)) {
    if (typeof field !== 'string' || !Object.hasOwn(schema, field) || seen.has(field)) invalid('value');
    seen.add(field); returnFields.push(field);
  }
  return Object.freeze({ schema: Object.freeze(schema), analyzerId: DEFAULTS.analyzerId,
    returnFields: Object.freeze(returnFields), textFields: Object.freeze(textFields) });
}

export function captureRecords(input: unknown, options: CapturedOptions): Readonly<{
  records: readonly SearchRecord[]; usage: SourceUsage;
}> {
  const inputs = array(input, LIMITS.records), records: SearchRecord[] = [], ids = new Set<string>();
  let sourceStringUnits = 0, arraySlots = 0, indexedTokens = 0;
  const countString = (value: string, indexed: boolean): void => {
    sourceStringUnits += value.length;
    if (sourceStringUnits > LIMITS.sourceStringUnits) invalid('limit');
    if (indexed) {
      // Preserve the companion's original-run count, including leading marks.
      for (const match of value.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
        if (!/[\p{L}\p{N}]/u.test(match[0])) continue;
        if (++indexedTokens > LIMITS.indexedTokens) invalid('limit');
      }
    }
  };
  for (const raw of inputs) {
    const data = object(raw), id = string(data['id'], LIMITS.idUnits);
    if (!id.length || id.trim() !== id) invalid('value');
    if (ids.has(id)) invalid('duplicate');
    ids.add(id); countString(id, false);
    const record: Record<string, LegacyValue> = Object.create(null) as typeof record;
    record['id'] = id;
    for (const name of Object.keys(data)) {
      if (name === 'id') continue;
      if (!Object.hasOwn(options.schema, name)) invalid('keys');
      const definition = options.schema[name]!, value = data[name];
      switch (definition.type) {
        case 'text': case 'keyword': {
          const owned = string(value, definition.type === 'text' ? LIMITS.textValueUnits : LIMITS.keywordUnits);
          countString(owned, definition.type === 'text'); record[name] = owned; break;
        }
        case 'text[]': {
          const values = array(value, LIMITS.textArrayValues), copy: string[] = [];
          arraySlots += values.length;
          if (arraySlots > LIMITS.retainedArraySlots) invalid('limit');
          for (const item of values) { const owned = string(item, LIMITS.textValueUnits); countString(owned, true); copy.push(owned); }
          record[name] = Object.freeze(copy); break;
        }
        case 'number':
          if (typeof value !== 'number' || !Number.isFinite(value)) invalid('type');
          record[name] = value; break;
        case 'boolean':
          if (typeof value !== 'boolean') invalid('type');
          record[name] = value; break;
      }
    }
    records.push(Object.freeze(record) as SearchRecord);
  }
  return Object.freeze({ records: Object.freeze(records), usage: Object.freeze({
    recordCount: records.length, sourceStringUnits, arraySlots, indexedTokens,
  }) });
}
