import { workerIdentity } from '../../core/capabilities/worker-identity.js';
import type { AddonRegistration, MetadataContext, PayloadContext, PreparedPredicate } from '../../core/capabilities/types.js';
import { Admission, has, keysOnly, ownArray, ownObject, stringValue } from '../../core/contracts/data.js';
import type { OwnedRecord, Scalar } from '../../core/contracts/types.js';
import { bound, invalid } from '../../core/errors/error.js';
import type { WorkStep } from '../../core/index/directory.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import { captureMetadataPayload, validatePayload } from '../metadata/payload.js';
import { captureFilterOptions } from './options.js';
import type { FilterOptions } from './options.js';

export type { FilterOptions } from './options.js';
export interface NumericRangePayload {
  readonly field: string;
  readonly gt?: number;
  readonly gte?: number;
  readonly lt?: number;
  readonly lte?: number;
}
export interface SetMembershipPayload {
  readonly field: string;
  readonly values: readonly Scalar[];
}

const charge = (workUnits: number): WorkStep => ({ workUnits });
type Metadata = OwnedRecord['metadata'];

function* prepareFilter(context: MetadataContext, enabled: readonly string[]): Generator<WorkStep, PreparedPredicate> {
  yield* validatePayload(context.payload, 'INVALID_QUERY');
  const admission = new Admission(context.limits.maxAdmissionEntries);
  const payload = ownObject(context.payload, 'INVALID_QUERY', 'filters.payload', admission);
  yield charge(admission.count + 1);
  const range = context.capability === 'numeric-range';
  if (!range && context.capability !== 'set-membership') invalid('INCOMPATIBLE_CAPABILITY', 'filters.capability');
  keysOnly(payload, range ? ['field', 'gt', 'gte', 'lt', 'lte'] : ['field', 'values'], 'INVALID_QUERY', 'filters.payload');
  yield charge(Object.keys(payload).length + 1);
  const field = stringValue(payload.field, context.limits.maxFieldNameCodeUnits, 'INVALID_QUERY', 'filters.field');
  yield charge(field.length + 1);
  const descriptor = context.schema.metadata[field];
  if (!descriptor) invalid('INVALID_QUERY', 'filters.field');
  let selected = false;
  for (const allowed of enabled) {
    yield charge(allowed.length + field.length + 1);
    if (allowed === field) { selected = true; break; }
  }
  if (!selected) invalid('MISSING_CAPABILITY', 'filters.field');

  if (range) {
    if (descriptor.type !== 'number') invalid('INVALID_QUERY', 'filters.field.type');
    const lowerName = has(payload, 'gt') ? 'gt' : has(payload, 'gte') ? 'gte' : undefined;
    const upperName = has(payload, 'lt') ? 'lt' : has(payload, 'lte') ? 'lte' : undefined;
    yield charge(6);
    if ((has(payload, 'gt') && has(payload, 'gte')) || (has(payload, 'lt') && has(payload, 'lte')) || (!lowerName && !upperName)) invalid('INVALID_QUERY', 'filters.bounds');
    const lower = lowerName ? payload[lowerName] : undefined;
    const upper = upperName ? payload[upperName] : undefined;
    for (const endpoint of [lower, upper]) {
      yield charge(1);
      if (endpoint !== undefined && (typeof endpoint !== 'number' || !Number.isFinite(endpoint))) invalid('INVALID_QUERY', 'filters.bounds');
    }
    // Presence, rather than undefined-value omission, controls the payload.
    if ((lowerName && lower === undefined) || (upperName && upper === undefined)) invalid('INVALID_QUERY', 'filters.bounds');
    yield charge(1);
    if (typeof lower === 'number' && typeof upper === 'number' && lower > upper) invalid('INVALID_QUERY', 'filters.bounds');
    const lowerBound = lower as number | undefined, upperBound = upper as number | undefined;
    return Object.freeze({
      *test(metadata: Metadata): Generator<WorkStep, boolean> {
        yield charge(field.length + 1);
        if (!has(metadata, field)) return false;
        const value = metadata[field];
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) {
          yield charge(1);
          if (typeof item !== 'number') continue;
          let matches = true;
          if (lowerBound !== undefined) {
            yield charge(1);
            matches = lowerName === 'gt' ? item > lowerBound : item >= lowerBound;
          }
          if (upperBound !== undefined) {
            yield charge(1);
            matches = matches && (upperName === 'lt' ? item < upperBound : item <= upperBound);
          }
          if (matches) return true;
        }
        return false;
      },
    });
  }

  const values = ownArray(payload.values, Math.min(128, context.limits.maxMetadataValuesPerField), 'INVALID_QUERY', 'filters.values', admission);
  yield charge(values.length + 1);
  if (values.length === 0) invalid('INVALID_QUERY', 'filters.values');
  for (const value of values) {
    yield charge(typeof value === 'string' ? value.length + 1 : 1);
    if (value === null) {
      if (!descriptor.nullable) invalid('INVALID_QUERY', 'filters.values');
    } else if (typeof value !== descriptor.type) invalid('INVALID_QUERY', 'filters.values');
    else if (typeof value === 'number' && !Number.isFinite(value)) invalid('INVALID_QUERY', 'filters.values');
    else if (typeof value === 'string') bound(value.length, context.limits.maxMetadataStringCodeUnits, 'filters.values');
  }
  const requested = Object.freeze(values as Scalar[]);
  return Object.freeze({
    *test(metadata: Metadata): Generator<WorkStep, boolean> {
      yield charge(field.length + 1);
      if (!has(metadata, field)) return false;
      const value = metadata[field];
      const actual = Array.isArray(value) ? value : [value];
      for (const item of actual) {
        yield charge(1);
        for (const candidate of requested) {
          yield charge(typeof item === 'string' && typeof candidate === 'string' ? item.length + candidate.length + 1 : 1);
          if (item === candidate) return true;
        }
      }
      return false;
    },
  });
}

/** Typed metadata leaves; complete qualification uses the core's owned metadata. */
export function createFilters(options: FilterOptions): AddonRegistration {
  const captured = captureFilterOptions(options);
  return Object.freeze({
    manifest: Object.freeze({
      id: captured.id, version: '0.0.0', contractVersion: 1,
      roles: Object.freeze(['leaf-refinement'] as const),
      provides: Object.freeze(['numeric-range', 'set-membership'].map(id => Object.freeze({ id, contractVersion: 1 }))),
      requires: Object.freeze([]),
      dataRequirements: Object.freeze({ fields: captured.fields, source: false, positions: false, offsets: false, metadata: true }),
      indexEffect: 'none', rebuildPolicy: 'new-index',
      execution: Object.freeze({ direct: true, worker: true, workerRegistration: workerIdentity('filters', captured) }),
      limits: Object.freeze({ maxPayloadCodeUnits: DEFAULT_LIMITS.maxQueryCodeUnits, maxWorkUnits: captured.maxWorkUnits, maxRetainedEntries: 0, maxOutputEntries: 0 }),
      costs: Object.freeze({ importedCode: 'Typed numeric-range and set-membership metadata predicates.', retainedRepresentation: 'No side index or copied metadata; reads the immutable core revision.', transientWork: 'Bounded owned payload and complete candidate evaluation under the shared search budget.', externalResources: 'none' }),
    }),
    predicate: Object.freeze({
      capture: (input: unknown, context: PayloadContext) => captureMetadataPayload(input, context, 'INVALID_QUERY'),
      prepare: (context: MetadataContext): Generator<WorkStep, PreparedPredicate> => prepareFilter(context, captured.fields),
    }),
  });
}
