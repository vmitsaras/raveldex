import { Admission, has, keysOnly, ownArray, ownObject, stringValue } from '../../core/contracts/data.js';
import { bound, invalid } from '../../core/errors/error.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';

export interface FacetOptions {
  readonly fields: readonly string[];
  readonly id?: string;
  readonly maxWorkUnits?: number;
  readonly maxDistinctValuesPerField?: number;
  readonly maxBucketsPerField?: number;
}
export interface FacetRequest {
  readonly fields: readonly { readonly field: string; readonly limit?: number; readonly missing?: boolean }[];
}
export type FacetBucket =
  | { readonly kind: 'value'; readonly value: string | null; readonly count: number }
  | { readonly kind: 'missing'; readonly count: number };
export interface FacetFieldResult {
  readonly field: string;
  readonly buckets: readonly FacetBucket[];
  readonly distinctValueTotal: number;
  readonly omittedBucketCount: number;
}
export interface FacetResult { readonly fields: readonly FacetFieldResult[] }
export interface CapturedFacetOptions {
  readonly fields: readonly string[];
  readonly id: string;
  readonly maxWorkUnits: number;
  readonly maxDistinctValuesPerField: number;
  readonly maxBucketsPerField: number;
}

export function captureFacetOptions(input: unknown): CapturedFacetOptions {
  const admission = new Admission(DEFAULT_LIMITS.maxAdmissionEntries);
  const options = ownObject(input, 'INVALID_OPTIONS', 'facets.options', admission);
  keysOnly(options, ['fields', 'id', 'maxWorkUnits', 'maxDistinctValuesPerField', 'maxBucketsPerField'], 'INVALID_OPTIONS', 'facets.options');
  const seen = new Set<string>();
  const fields = Object.freeze(ownArray(options.fields, DEFAULT_LIMITS.maxMetadataFields, 'INVALID_OPTIONS', 'facets.fields', admission).map(value => {
    const field = stringValue(value, DEFAULT_LIMITS.maxFieldNameCodeUnits, 'INVALID_OPTIONS', 'facets.fields');
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field) || field === 'constructor' || field === 'prototype' || seen.has(field)) invalid('INVALID_OPTIONS', 'facets.fields');
    seen.add(field); return field;
  }));
  if (!fields.length) invalid('INVALID_OPTIONS', 'facets.fields');
  const id = has(options, 'id') ? stringValue(options.id, 64, 'INVALID_OPTIONS', 'facets.id') : 'facets';
  if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(id)) invalid('INVALID_OPTIONS', 'facets.id');
  const integer = (key: string, fallback: number, maximum: number, minimum: number): number => {
    const value = has(options, key) ? options[key] : fallback;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) invalid('INVALID_OPTIONS', `facets.${key}`);
    bound(value, maximum, `facets.${key}`); return value;
  };
  return Object.freeze({ fields, id,
    maxWorkUnits: integer('maxWorkUnits', DEFAULT_LIMITS.maxSearchWorkUnits, DEFAULT_LIMITS.maxSearchWorkUnits, 1),
    maxDistinctValuesPerField: integer('maxDistinctValuesPerField', 10_000, 10_000, 1),
    maxBucketsPerField: integer('maxBucketsPerField', 100, 100, 0),
  });
}
