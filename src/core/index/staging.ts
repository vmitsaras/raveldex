import { bucketOf } from './directory.js';
import type { Directory, WorkStep } from './directory.js';
import type { Charge } from '../query/work.js';
import { invalid } from '../errors/error.js';

/** Logical allocations/copies, not heap bytes. Optional private diagnostics. */
export interface CopyCounts {
  directories: number; directoryPointers: number; buckets: number;
  bucketEntries: number; writes: number; deletes: number; insertions: number;
}
export function emptyDirectory<T>(): Directory<T> {
  return Object.freeze({ size: 0, buckets: Object.freeze(Object.create(null)) as Directory<T>['buckets'] });
}

/** One transaction owns this cache. Each touched bucket is copied once. */
export class DirectoryStage<T> {
  private pointers?: Record<string, Readonly<Record<string, T>>>;
  private readonly touched = new Map<string, Record<string, T>>();
  private count: number;
  private sealed = false;
  constructor(private readonly original: Directory<T>, private readonly charge: Charge, private readonly counts?: CopyCounts) { this.count = original.size; }
  get size(): number { return this.count; }
  get(key: string): T | undefined { return (this.pointers ?? this.original.buckets)[bucketOf(key)]?.[key]; }
  private *bucket(slot: string): Generator<WorkStep, Record<string, T>> {
    if (this.sealed) invalid('INTERNAL_ERROR', 'staging.sealed');
    if (!this.pointers) {
      const pointers: Record<string, Readonly<Record<string, T>>> = Object.create(null) as typeof pointers;
      if (this.counts) this.counts.directories++;
      for (const slot of Object.keys(this.original.buckets)) {
        yield this.charge(1);
        pointers[slot] = this.original.buckets[slot]!;
        if (this.counts) this.counts.directoryPointers++;
      }
      this.pointers = pointers;
    }
    const cached = this.touched.get(slot);
    if (cached) return cached;
    const bucket: Record<string, T> = Object.create(null) as typeof bucket;
    if (this.counts) this.counts.buckets++;
    const previous = this.original.buckets[slot];
    for (const entry of Object.keys(previous ?? {})) {
      yield this.charge(entry.length + 1);
      bucket[entry] = previous![entry]!;
      if (this.counts) this.counts.bucketEntries++;
    }
    this.touched.set(slot, bucket);
    this.pointers[slot] = bucket;
    return bucket;
  }
  *set(key: string, value: T): Generator<WorkStep, void> {
    yield this.charge(key.length + 1);
    const bucket = yield* this.bucket(bucketOf(key));
    if (!Object.hasOwn(bucket, key)) { this.count++; if (this.counts) this.counts.insertions++; }
    bucket[key] = value;
    if (this.counts) this.counts.writes++;
  }
  *delete(key: string): Generator<WorkStep, void> {
    if (this.sealed) invalid('INTERNAL_ERROR', 'staging.sealed');
    yield this.charge(key.length + 1);
    const slot = bucketOf(key);
    if ((this.pointers ?? this.original.buckets)[slot]?.[key] === undefined) return;
    const bucket = yield* this.bucket(slot);
    delete bucket[key]; this.count--;
    if (this.counts) this.counts.deletes++;
  }
  *finish(): Generator<WorkStep, Directory<T>> {
    if (this.sealed) invalid('INTERNAL_ERROR', 'staging.sealed');
    this.sealed = true;
    if (!this.pointers) return this.original;
    for (const [slot, bucket] of this.touched) {
      const keys = Object.keys(bucket);
      // Native enumeration/freezing is bounded but indivisible; owned loops yield.
      for (const key of keys) yield this.charge(key.length + 1);
      if (keys.length) Object.freeze(bucket);
      else delete this.pointers[slot];
    }
    for (const slot of Object.keys(this.pointers)) { void slot; yield this.charge(1); }
    return Object.freeze({ size: this.count, buckets: Object.freeze(this.pointers) });
  }
}
