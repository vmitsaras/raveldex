import { ERROR_CODES, RaveldexError } from '../../core/errors/error.js';
import type { MutationResult, SearchResult } from '../../core/contracts/types.js';
import { WorkerAdapterError, WORKER_ERROR_CODES } from './error.js';
import type { MutationReceipt, WireError } from './types.js';

export const PROTOCOL = 1;
export const IMPLEMENTATION = 'raveldex-native-v1';
export const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
export const MAX_PENDING = 64;
export const RECEIPT_WINDOW = 256;
const MAX_NODES = 131_072, MAX_DEPTH = 64, MAX_ARRAY = 65_536;
export const OPERATIONS = Object.freeze(['init', 'search', 'add', 'addMany', 'replace', 'remove', 'clear', 'reconcile', 'dispose'] as const);
export type Operation = typeof OPERATIONS[number];
export const mutation = (operation: string): boolean => ['add', 'addMany', 'replace', 'remove', 'clear'].includes(operation);
/** Same-host comparable monotonic epoch; wall-clock adjustments are irrelevant. */
export function monotonicEpoch(): number {
  const origin = performance.timeOrigin, now = performance.now();
  if (!Number.isFinite(origin) || !Number.isFinite(now)) throw new WorkerAdapterError('STARTUP_FAILED', { path: 'worker.clock' });
  return origin + now;
}
export type Data = Readonly<Record<string, unknown>>;
export function fail(path = 'transport'): never { throw new WorkerAdapterError('INVALID_TRANSPORT', { path }); }
export function object(value: unknown, allowed?: readonly string[]): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const data = value as Data;
  if (allowed && Object.keys(data).some(key => !allowed.includes(key))) fail();
  return data;
}
export function integer(value: unknown, maximum = Number.MAX_SAFE_INTEGER, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) fail();
  return value;
}
export function cap(value: unknown = MAX_MESSAGE_BYTES): number { return integer(value, MAX_MESSAGE_BYTES, 1024); }
export function sessionValue(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) fail('transport.session');
  return value;
}

/** Exact UTF-8 byte count of the JSON representation, including escaping.
 * No executable values, accessor reads, sparse arrays, cycles or prototypes. */
export function captureMessage(input: unknown, maximum: number): unknown {
  let bytes = 0, nodes = 0;
  const active = new Set<object>();
  const charge = (amount: number): void => {
    bytes += amount;
    if (bytes > maximum) throw new WorkerAdapterError('TRANSPORT_LIMIT', { path: 'transport.bytes', limit: maximum, actual: bytes });
  };
  function string(value: string): void {
    charge(2);
    // Charge each character before scanning the next: oversized strings never
    // require a full encoded temporary allocation.
    for (let i = 0; i < value.length; i++) {
      const point = value.charCodeAt(i);
      if (point === 34 || point === 92 || point === 8 || point === 9 || point === 10 || point === 12 || point === 13) charge(2);
      else if (point < 32) charge(6);
      else if (point < 128) charge(1);
      else if (point < 2048) charge(2);
      else if (point >= 0xd800 && point <= 0xdbff && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { charge(4); i++; }
      else charge(point >= 0xd800 && point <= 0xdfff ? 6 : 3);
    }
  }
  function visit(value: unknown, depth: number): unknown {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) throw new WorkerAdapterError('TRANSPORT_LIMIT', { path: 'transport.structure', limit: depth > MAX_DEPTH ? MAX_DEPTH : MAX_NODES, actual: depth > MAX_DEPTH ? depth : nodes });
    if (value === null) { charge(4); return null; }
    if (typeof value === 'boolean') { charge(value ? 4 : 5); return value; }
    if (typeof value === 'string') { string(value); return value; }
    if (typeof value === 'number' && Number.isFinite(value)) { charge(String(value).length); return value; }
    if (!value || typeof value !== 'object' || active.has(value)) fail('transport.data');
    const array = Array.isArray(value), prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== (array ? Array.prototype : Object.prototype)) fail('transport.prototype');
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_NODES - nodes) throw new WorkerAdapterError('TRANSPORT_LIMIT', { path: 'transport.structure', limit: MAX_NODES, actual: keys.length + nodes });
    active.add(value); charge(2);
    if (array) {
      if (value.length > MAX_ARRAY) throw new WorkerAdapterError('TRANSPORT_LIMIT', { path: 'transport.array', limit: MAX_ARRAY, actual: value.length });
      if (keys.length !== value.length + 1 || keys.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))) fail('transport.array');
      const result: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || !('value' in descriptor)) fail('transport.accessor');
        if (i) charge(1); result.push(visit(descriptor.value, depth + 1));
      }
      active.delete(value); return Object.freeze(result);
    }
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    let index = 0;
    for (const key of keys) {
      if (typeof key !== 'string' || key.length > 256) fail('transport.key');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) fail('transport.accessor');
      if (index++) charge(1); string(key); charge(1);
      result[key] = visit(descriptor.value, depth + 1);
    }
    active.delete(value); return Object.freeze(result);
  }
  return visit(input, 0);
}

/** Canonical bounded data identity: object order is immaterial, arrays are not. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Data)[key])}`).join(',')}}`;
}
export function wireError(error: unknown): WireError {
  if (error instanceof RaveldexError) return Object.freeze({ name: 'RaveldexError', code: error.code, details: error.details });
  if (error instanceof WorkerAdapterError) return Object.freeze({ name: 'WorkerAdapterError', code: error.code, details: error.details });
  return Object.freeze({ name: 'RaveldexError', code: 'INTERNAL_ERROR', details: Object.freeze({}) });
}
export function validateError(value: unknown): WireError {
  const data = object(value, ['name', 'code', 'details']), details = object(data.details, ['path', 'limit', 'actual', 'operationId']);
  if (details.path !== undefined && (typeof details.path !== 'string' || details.path.length > 256)) fail('transport.error');
  for (const field of ['limit', 'actual'] as const) if (details[field] !== undefined) integer(details[field]);
  if (data.name === 'RaveldexError') {
    if (!(ERROR_CODES as readonly unknown[]).includes(data.code) || details.operationId !== undefined) fail('transport.error');
  } else if (data.name === 'WorkerAdapterError') {
    if (!(WORKER_ERROR_CODES as readonly unknown[]).includes(data.code) || details.operationId !== undefined && (typeof details.operationId !== 'string' || details.operationId.length > 80)) fail('transport.error');
  } else fail('transport.error');
  return data as unknown as WireError;
}
export function inflateError(value: WireError): Error {
  return value.name === 'RaveldexError' ? new RaveldexError(value.code, value.details) : new WorkerAdapterError(value.code, value.details);
}
export function mutationResult(value: unknown, maxDocuments: number, operation?: string, maximumChanged = maxDocuments): MutationResult {
  const result = object(value, ['revision', 'changed', 'added', 'replaced', 'removed']);
  integer(result.revision);
  const sum = integer(result.added, maxDocuments) + integer(result.replaced, maxDocuments) + integer(result.removed, maxDocuments);
  if (sum > maxDocuments || sum > maximumChanged || typeof result.changed !== 'boolean' || result.changed !== (sum > 0) || result.changed && result.revision === 0) fail('transport.mutation');
  if (operation === 'add' && (result.replaced !== 0 || result.removed !== 0 || result.added !== 1) || operation === 'addMany' && (result.replaced !== 0 || result.removed !== 0) || operation === 'replace' && (result.added !== 0 || result.removed !== 0 || result.replaced !== 1) || (operation === 'remove' || operation === 'clear') && (result.added !== 0 || result.replaced !== 0)) fail('transport.mutation');
  if ((operation === 'add' || operation === 'addMany') && result.added !== maximumChanged) fail('transport.mutation');
  return result as unknown as MutationResult;
}
export function searchResult(value: unknown, maxDocuments: number, offset: number, limit: number, requestedExtensions: readonly string[]): SearchResult {
  const result = object(value, ['revision', 'model', 'completeness', 'total', 'hits', 'extensions']);
  integer(result.revision); const total = integer(result.total, maxDocuments);
  if (result.model !== 'raveldex-bm25-v1' || result.completeness !== 'complete' || !Array.isArray(result.hits) || result.hits.length !== Math.min(limit, Math.max(0, total - offset))) fail('transport.search');
  const ids = new Set<string>();
  let previous: { id: string; score: number } | undefined;
  for (const raw of result.hits) {
    const hit = object(raw, ['id', 'score']);
    if (typeof hit.id !== 'string' || !hit.id.length || hit.id.length > 256 || ids.has(hit.id) || typeof hit.score !== 'number' || !Number.isFinite(hit.score) || hit.score < 0) fail('transport.search');
    for (let i = 0; i < hit.id.length; i++) {
      const point = hit.id.charCodeAt(i);
      if (point >= 0xd800 && point <= 0xdbff) { const next = hit.id.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) fail('transport.search'); }
      else if (point >= 0xdc00 && point <= 0xdfff) fail('transport.search');
    }
    if (previous && (hit.score > previous.score || hit.score === previous.score && hit.id <= previous.id)) fail('transport.search');
    previous = { id: hit.id, score: hit.score };
    ids.add(hit.id);
  }
  if (result.extensions !== undefined) {
    const extensions = object(result.extensions);
    if (Object.keys(extensions).some(key => !requestedExtensions.includes(key))) fail('transport.extensions');
  }
  if (requestedExtensions.length && (result.extensions === undefined || requestedExtensions.some(key => !Object.hasOwn(result.extensions as object, key)))) fail('transport.extensions');
  return result as unknown as SearchResult;
}
export function receipt(value: unknown, operationId: string, maxDocuments: number): MutationReceipt {
  const data = object(value, ['operationId', 'status', 'result', 'error']);
  if (data.operationId !== operationId) fail('transport.receipt');
  if (data.status === 'pending' || data.status === 'expired') {
    if (data.result !== undefined || data.error !== undefined) fail('transport.receipt');
  } else if (data.status === 'committed') { if (data.error !== undefined) fail('transport.receipt'); mutationResult(data.result, maxDocuments); }
  else if (data.status === 'rejected') { if (data.result !== undefined) fail('transport.receipt'); validateError(data.error); }
  else fail('transport.receipt');
  return data as unknown as MutationReceipt;
}
