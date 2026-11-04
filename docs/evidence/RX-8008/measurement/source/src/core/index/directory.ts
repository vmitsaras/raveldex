import { invalid } from '../errors/error.js';

/** Private layout v1: 256 logical slots, allocated only when occupied. */
export const DIRECTORY_SLOTS = 256;
export interface Directory<T> {
  readonly size: number;
  readonly buckets: Readonly<Record<string, Readonly<Record<string, T>>>>;
}
export interface WorkStep { readonly workUnits: number }

/** Bounded primitive for admitted IDs/terms. Callers charge key.length + 1. */
export function bucketOf(key: string): string {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return String((hash >>> 0) % DIRECTORY_SLOTS);
}
export function directoryGet<T>(directory: Directory<T>, key: string): T | undefined {
  return directory.buckets[bucketOf(key)]?.[key];
}
export function* directoryEntries<T>(directory: Directory<T>): Generator<readonly [string, T]> {
  for (const bucket of Object.values(directory.buckets)) {
    for (const key of Object.keys(bucket)) yield [key, bucket[key]!] as const;
  }
}

/** Construction-only mutable owner. Mutations use DirectoryStage. */
export class DirectoryBuilder<T> {
  private buckets: Record<string, Record<string, T>> = Object.create(null) as typeof this.buckets;
  private count = 0;
  private sealed = false;
  get(key: string): T | undefined { return this.buckets[bucketOf(key)]?.[key]; }
  set(key: string, value: T): void {
    if (this.sealed) invalid('INTERNAL_ERROR', 'index.directory.sealed');
    const slot = bucketOf(key);
    const bucket = this.buckets[slot] ??= Object.create(null) as Record<string, T>;
    if (!Object.hasOwn(bucket, key)) this.count++;
    bucket[key] = value;
  }
  *seal(): Generator<WorkStep, Directory<T>> {
    if (this.sealed) invalid('INTERNAL_ERROR', 'index.directory.sealed');
    this.sealed = true;
    for (const bucket of Object.values(this.buckets)) {
      for (const key of Object.keys(bucket)) yield { workUnits: key.length + 1 };
      // Object.keys/freeze are indivisible native operations on a bounded bucket.
      Object.freeze(bucket);
    }
    const result = Object.freeze({ size: this.count, buckets: Object.freeze(this.buckets) });
    this.buckets = Object.create(null) as typeof this.buckets;
    return result;
  }
}
