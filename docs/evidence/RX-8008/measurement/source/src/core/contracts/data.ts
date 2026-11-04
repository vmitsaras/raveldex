import { bound, invalid } from '../errors/error.js';
import type { ErrorCode } from '../errors/error.js';

export type DataObject = Record<string, unknown>;

/** One shared counter per admitted call, including nested objects/arrays. */
export class Admission {
  private entries = 0;
  constructor(readonly maximum: number) {}
  get count(): number { return this.entries; }
  charge(count: number, path: string): void {
    this.entries += count;
    bound(this.entries, this.maximum, path);
  }
}

export function ownObject(input: unknown, code: ErrorCode, path: string, admission: Admission): DataObject {
  if (typeof input !== 'object' || input === null) invalid(code, path);
  const proto: unknown = Object.getPrototypeOf(input);
  if (proto !== null && proto !== Object.prototype) invalid(code, path);
  const keys = Reflect.ownKeys(input);
  admission.charge(keys.length, path);
  const copy: DataObject = Object.create(null) as DataObject;
  for (const key of keys) {
    if (typeof key !== 'string') invalid(code, path);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) invalid(code, path);
    copy[key] = descriptor.value;
  }
  return copy;
}

export function ownArray(input: unknown, maximum: number, code: ErrorCode, path: string, admission: Admission): unknown[] {
  if (!Array.isArray(input)) invalid(code, path);
  const proto: unknown = Object.getPrototypeOf(input);
  if (proto !== null && proto !== Array.prototype) invalid(code, path);
  bound(input.length, maximum, path);
  const keys = Reflect.ownKeys(input);
  admission.charge(keys.length, path); // includes the own length property
  if (keys.length !== input.length + 1) invalid(code, path);
  for (const key of keys) {
    if (key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= input.length)) {
      invalid(code, path);
    }
  }
  const copy: unknown[] = [];
  for (let i = 0; i < input.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
    if (!descriptor || !('value' in descriptor)) invalid(code, `${path}[${i}]`);
    copy.push(descriptor.value);
  }
  return copy;
}

export function keysOnly(data: DataObject, allowed: readonly string[], code: ErrorCode, path: string): void {
  for (const key of Object.keys(data)) if (!allowed.includes(key)) invalid(code, path);
}

export function has(data: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}

export function stringValue(input: unknown, maximum: number, code: ErrorCode, path: string): string {
  if (typeof input !== 'string') invalid(code, path);
  bound(input.length, maximum, path);
  return input;
}

export interface ScanStep { readonly workUnits: number }

/** UTF-16 content checks are deferred and resumable, including non-token text. */
export function* scanUnicode(value: string, code: ErrorCode, path: string): Generator<ScanStep> {
  for (let i = 0; i < value.length;) {
    const width = codePointWidth(value, i, code, path);
    i += width;
    yield { workUnits: 1 };
  }
}

export function codePointWidth(value: string, index: number, code: ErrorCode, path: string): number {
  const first = value.charCodeAt(index);
  if (first >= 0xd800 && first <= 0xdbff) {
    const second = value.charCodeAt(index + 1);
    if (!(second >= 0xdc00 && second <= 0xdfff)) invalid(code, path);
    return 2;
  }
  if (first >= 0xdc00 && first <= 0xdfff) invalid(code, path);
  return 1;
}
