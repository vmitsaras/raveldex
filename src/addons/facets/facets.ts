import type { AddonRegistration, AggregationOutput, MetadataContext, PayloadContext, PreparedAggregation } from '../../core/capabilities/types.js';
import { Admission, has, keysOnly, ownArray, ownObject, stringValue } from '../../core/contracts/data.js';
import type { OwnedRecord } from '../../core/contracts/types.js';
import { bound, invalid } from '../../core/errors/error.js';
import type { WorkStep } from '../../core/index/directory.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import { captureMetadataOutput, captureMetadataPayload, validatePayload } from '../metadata/payload.js';
import { captureFacetOptions } from './options.js';
import type { CapturedFacetOptions, FacetBucket, FacetOptions, FacetFieldResult } from './options.js';

interface CountedBucket { readonly value?: string | null; readonly missing: boolean; count: number }
interface Counter {
  readonly field: string; readonly limit: number; readonly missing: boolean; readonly cap: number;
  readonly values: Map<string | null, CountedBucket>; missingBucket?: CountedBucket;
}
const charge = (workUnits = 1): WorkStep => ({ workUnits });

/** Negative means a precedes b in the specified output order. String compares
 * are resumable and use original UTF-16 code units without normalization. */
function* compare(a: CountedBucket, b: CountedBucket): Generator<WorkStep, number> {
  yield charge();
  if (a.count !== b.count) return b.count - a.count;
  if (a.missing !== b.missing) return a.missing ? 1 : -1;
  if (a.missing) return 0;
  if (a.value === null || b.value === null) return a.value === b.value ? 0 : a.value === null ? -1 : 1;
  const left = a.value!, right = b.value!;
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    yield charge();
    const delta = left.charCodeAt(index) - right.charCodeAt(index);
    if (delta) return delta;
  }
  yield charge(); return left.length - right.length;
}

/** Retain only requested output capacity. Root is the worst retained bucket. */
function* select(heap: CountedBucket[], bucket: CountedBucket, maximum: number): Generator<WorkStep> {
  yield charge();
  if (!maximum) return;
  if (heap.length < maximum) {
    let index = heap.length; heap.push(bucket);
    while (index) {
      const parent = Math.floor((index - 1) / 2);
      if ((yield* compare(heap[index]!, heap[parent]!)) <= 0) break;
      yield charge(); [heap[index], heap[parent]] = [heap[parent]!, heap[index]!]; index = parent;
    }
    return;
  }
  if ((yield* compare(bucket, heap[0]!)) >= 0) return;
  heap[0] = bucket; yield charge();
  for (let index = 0;;) {
    const left = index * 2 + 1; if (left >= heap.length) break;
    const right = left + 1;
    const worst = right < heap.length && (yield* compare(heap[right]!, heap[left]!)) > 0 ? right : left;
    if ((yield* compare(heap[index]!, heap[worst]!)) >= 0) break;
    yield charge(); [heap[index], heap[worst]] = [heap[worst]!, heap[index]!]; index = worst;
  }
}

function* prepare(context: MetadataContext, options: CapturedFacetOptions): Generator<WorkStep, PreparedAggregation> {
  yield* validatePayload(context.payload, 'INVALID_OPTIONS');
  const admission = new Admission(context.limits.maxAdmissionEntries);
  const payload = ownObject(context.payload, 'INVALID_OPTIONS', 'facets.payload', admission);
  keysOnly(payload, ['fields'], 'INVALID_OPTIONS', 'facets.payload');
  const requests = ownArray(payload.fields, 8, 'INVALID_OPTIONS', 'facets.fields', admission);
  if (!requests.length) invalid('INVALID_OPTIONS', 'facets.fields');
  const selected = new Set<string>(), counters: Counter[] = [];
  for (const raw of requests) {
    const request = ownObject(raw, 'INVALID_OPTIONS', 'facets.field', admission);
    keysOnly(request, ['field', 'limit', 'missing'], 'INVALID_OPTIONS', 'facets.field');
    const field = stringValue(request.field, context.limits.maxFieldNameCodeUnits, 'INVALID_OPTIONS', 'facets.field');
    yield charge((field.length + 1) * (options.fields.length + 1));
    const declared = context.schema.metadata[field];
    if (!declared || declared.type !== 'string') invalid('INVALID_OPTIONS', 'facets.field');
    if (!options.fields.includes(field)) invalid('MISSING_CAPABILITY', 'facets.field');
    if (selected.has(field)) invalid('INVALID_OPTIONS', 'facets.fields');
    selected.add(field);
    const limit = has(request, 'limit') ? request.limit : Math.min(20, options.maxBucketsPerField);
    if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 0) invalid('INVALID_OPTIONS', 'facets.limit');
    bound(limit, options.maxBucketsPerField, 'facets.limit');
    const missing = has(request, 'missing') ? request.missing : false;
    if (typeof missing !== 'boolean') invalid('INVALID_OPTIONS', 'facets.missing');
    counters.push({ field, limit, missing,
      cap: Math.min(options.maxDistinctValuesPerField, context.limits.maxDocuments * (declared.multi ? context.limits.maxMetadataValuesPerField : 1)),
      values: new Map<string | null, CountedBucket>(),
    });
  }
  return Object.freeze({
    *add(metadata: OwnedRecord['metadata']): Generator<WorkStep, void> {
      for (const counter of counters) {
        yield charge(counter.field.length + 1);
        if (!has(metadata, counter.field)) {
          if (counter.missing) {
            if (!counter.missingBucket) {
              bound(counter.values.size + 1, counter.cap, 'facets.distinctValues');
              counter.missingBucket = { missing: true, count: 0 };
            }
            counter.missingBucket.count++; yield charge();
          }
          continue;
        }
        const input = metadata[counter.field]!, values = Array.isArray(input) ? input : [input];
        const seen = new Set<string | null>();
        for (const raw of values) {
          // Metadata is immutable validated core data. Defend the protocol seam
          // as well; numeric/boolean values are never coerced to strings.
          if (raw !== null && typeof raw !== 'string') invalid('INCOMPATIBLE_CAPABILITY', 'facets.metadata');
          if (raw === null && !context.schema.metadata[counter.field]!.nullable) invalid('INCOMPATIBLE_CAPABILITY', 'facets.metadata');
          const value = raw as string | null;
          yield charge((value?.length ?? 0) + 1); // bounded native hashing and lookup
          if (seen.has(value)) continue;
          seen.add(value); yield charge((value?.length ?? 0) + 1);
          let bucket = counter.values.get(value);
          if (!bucket) {
            bound(counter.values.size + (counter.missingBucket ? 1 : 0) + 1, counter.cap, 'facets.distinctValues');
            bucket = { missing: false, value, count: 0 }; counter.values.set(value, bucket);
          }
          bucket.count++; yield charge();
        }
      }
    },
    *finish(): Generator<WorkStep, AggregationOutput> {
      const fields: FacetFieldResult[] = [];
      for (const counter of counters) {
        const heap: CountedBucket[] = [];
        for (const bucket of counter.values.values()) yield* select(heap, bucket, counter.limit);
        if (counter.missingBucket) yield* select(heap, counter.missingBucket, counter.limit);
        // At most 100 output buckets: insertion sort has explicit comparisons
        // and moves, with a suspension inside every long string comparison.
        for (let index = 1; index < heap.length; index++) {
          const value = heap[index]!; let target = index;
          while (target && (yield* compare(value, heap[target - 1]!)) < 0) {
            heap[target] = heap[target - 1]!; target--; yield charge();
          }
          heap[target] = value; yield charge();
        }
        const buckets: FacetBucket[] = [];
        for (const bucket of heap) {
          yield charge((bucket.value?.length ?? 0) + 4);
          buckets.push(Object.freeze(bucket.missing ? { kind: 'missing' as const, count: bucket.count }
            : { kind: 'value' as const, value: bucket.value!, count: bucket.count }));
        }
        const total = counter.values.size + (counter.missingBucket ? 1 : 0);
        fields.push(Object.freeze({ field: counter.field, buckets: Object.freeze(buckets), distinctValueTotal: total, omittedBucketCount: total - buckets.length }));
        yield charge(4);
      }
      return yield* captureMetadataOutput(Object.freeze({ fields: Object.freeze(fields) }), context.limits);
    },
  });
}

/** Exact aggregation over immutable fully qualifying metadata at one revision. */
export function createFacets(options: FacetOptions): AddonRegistration {
  const captured = captureFacetOptions(options);
  return Object.freeze({
    manifest: Object.freeze({ id: captured.id, version: '0.0.0', contractVersion: 1,
      roles: Object.freeze(['aggregation'] as const), provides: Object.freeze([Object.freeze({ id: 'facets', contractVersion: 1 })]), requires: Object.freeze([]),
      dataRequirements: Object.freeze({ fields: captured.fields, source: false, positions: false, offsets: false, metadata: true }),
      indexEffect: 'none', rebuildPolicy: 'new-index', execution: Object.freeze({ direct: true, worker: false }),
      limits: Object.freeze({ maxPayloadCodeUnits: DEFAULT_LIMITS.maxQueryCodeUnits, maxWorkUnits: captured.maxWorkUnits, maxRetainedEntries: 0, maxOutputEntries: 8_192 }),
      costs: Object.freeze({ importedCode: 'Typed metadata aggregation, per-document distinct counting and bounded output heap.',
        retainedRepresentation: 'No side index or corpus metadata copy; counters exist only during requested aggregation.',
        transientWork: 'Complete qualifying documents counted under distinct/work ceilings; at most eight fields and 100 returned buckets per field; comparisons and output projection are resumable.', externalResources: 'none' }),
    }),
    aggregation: Object.freeze({ fieldType: 'string' as const,
      capture: (input: unknown, context: PayloadContext) => captureMetadataPayload(input, context, 'INVALID_OPTIONS'),
      prepare: (context: MetadataContext): Generator<WorkStep, PreparedAggregation> => prepare(context, captured) }),
  });
}
