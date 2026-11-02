import { fail } from './error.js';
import type { StaticSearchErrorCode } from './error.js';
import type { StaticAsset, StaticManifest } from './types.js';

export const MANIFEST_LIMIT = 256 * 1024;
export const DOCUMENTS_LIMIT = 4 * 1024 * 1024;
export const SNAPSHOT_LIMIT = 64 * 1024 * 1024;
export const ENTRY_LIMIT = 10_000;
export const HASH = /^[a-f0-9]{64}$/;
export type Data = Record<string, unknown>;
export function object(input: unknown, allowed?: readonly string[], code: StaticSearchErrorCode = 'INVALID_INPUT'): Data {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) fail(code);
  const proto = Object.getPrototypeOf(input);
  if (proto !== null && proto !== Object.prototype) fail(code);
  const out: Data = Object.create(null) as Data;
  const keys = Reflect.ownKeys(input);
  if (keys.length > 64) fail('ASSET_LIMIT');
  for (const key of keys) {
    if (typeof key !== 'string' || allowed && !allowed.includes(key)) fail(code);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) fail(code);
    out[key] = descriptor.value;
  }
  return out;
}
export interface OwnershipBudget { count: number; maximum: number; functions?: boolean }
/** Bounded plain-data ownership; configuration functions remain trusted handles,
 * bound to their original object before a later native capture can rebind them. */
export function cloneOwned(input: unknown, budget: OwnershipBudget = { count: 0, maximum: 1_000_000 }, depth = 0, owner?: object): unknown {
  if (++budget.count > budget.maximum || depth > 16) fail('ASSET_LIMIT');
  if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
  if (typeof input === 'number') { if (!Number.isFinite(input)) fail('INVALID_INPUT'); return input; }
  if (typeof input === 'function' && budget.functions) return owner ? Function.prototype.bind.call(input, owner) : input;
  if (typeof input !== 'object' || input === null) fail('INVALID_INPUT');
  const proto = Object.getPrototypeOf(input), array = Array.isArray(input);
  if (proto !== null && proto !== (array ? Array.prototype : Object.prototype)) fail('INVALID_INPUT');
  const keys = Reflect.ownKeys(input);
  budget.count += keys.length;
  if (budget.count > budget.maximum) fail('ASSET_LIMIT');
  if (array) {
    const length = Object.getOwnPropertyDescriptor(input, 'length')?.value as unknown;
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1) fail('INVALID_INPUT');
    for (const key of keys) if (key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length)) fail('INVALID_INPUT');
    const out: unknown[] = [];
    for (let i = 0; i < length; i++) {
      const d = Object.getOwnPropertyDescriptor(input, String(i));
      if (!d || !('value' in d)) fail('INVALID_INPUT');
      out.push(cloneOwned(d.value, budget, depth + 1, input));
    }
    return Object.freeze(out);
  }
  const out: Data = Object.create(null) as Data;
  for (const key of keys) {
    if (typeof key !== 'string') fail('INVALID_INPUT');
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (!d || !('value' in d)) fail('INVALID_INPUT');
    out[key] = cloneOwned(d.value, budget, depth + 1, input);
  }
  return Object.freeze(out);
}
export function string(input: unknown, maximum: number, code: StaticSearchErrorCode = 'INVALID_INPUT'): string {
  if (typeof input !== 'string' || !input.length || input.length > maximum) fail(code);
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = input.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) fail(code);
    } else if (c >= 0xdc00 && c <= 0xdfff) fail(code);
  }
  return input;
}
export function buildId(input: unknown, code: StaticSearchErrorCode = 'INVALID_INPUT'): string {
  const value = string(input, 64, code);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) fail(code);
  return value;
}
export function safePath(input: unknown, code: StaticSearchErrorCode = 'INVALID_INPUT'): string {
  const path = string(input, 512, code);
  if (path === '/') return path;
  if (!path.startsWith('/') || !path.endsWith('/')) fail(code);
  const segments = path.slice(1, -1).split('/');
  if (!segments.length || segments.some(segment => !/^[A-Za-z0-9._~-]+$/.test(segment) || segment === '.' || segment === '..')) fail(code);
  return path;
}
export function sourceUrl(base: string, path: string): string { return base === '/' ? path : base + path.slice(1); }
export function bytes(text: string, maximum: number): Uint8Array<ArrayBuffer> {
  // UTF-16 length is a lower bound on well-formed JSON UTF-8 size.
  if (text.length > maximum) fail('ASSET_LIMIT');
  const encoded = new TextEncoder().encode(text);
  if (encoded.byteLength > maximum) fail('ASSET_LIMIT'); return encoded;
}
export async function digest(data: Uint8Array<ArrayBuffer>): Promise<string> {
  try {
    const hashed = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashed), value => value.toString(16).padStart(2, '0')).join('');
  } catch { return fail('INCOMPATIBLE_ARTIFACT'); }
}
export async function hashText(text: string, maximum: number): Promise<string> { return digest(bytes(text, maximum)); }
export function parse(text: string): unknown { try { return JSON.parse(text) as unknown; } catch { return fail('INVALID_ARTIFACT'); } }
function canonical(input: unknown, budget: OwnershipBudget, depth = 0): unknown {
  if (++budget.count > budget.maximum || depth > 16) fail('ASSET_LIMIT');
  if (input === null || typeof input === 'boolean' || typeof input === 'string' || typeof input === 'number' && Number.isFinite(input)) return input;
  if (Array.isArray(input)) return input.map(value => canonical(value, budget, depth + 1));
  const data = object(input, undefined, 'INVALID_ARTIFACT'), out: Data = Object.create(null) as Data;
  for (const key of Object.keys(data).sort()) out[key] = canonical(data[key], budget, depth + 1);
  return out;
}
/** Public snapshot headers supply normalized actual configuration; no private
 * engine import or caller-supplied identity substitutes for this fingerprint. */
export async function configurationIdentity(source: string): Promise<string> {
  const envelope = object(parse(source), undefined, 'INVALID_ARTIFACT');
  if (envelope.format !== 'raveldex-source' || envelope.formatVersion !== 1) fail('INVALID_ARTIFACT');
  const body = object(envelope.body, undefined, 'INVALID_ARTIFACT'), header = object(body.header, undefined, 'INVALID_ARTIFACT');
  const analyzer = object(header.analyzer, undefined, 'INVALID_ARTIFACT');
  const subset = { schemaVersion: header.schemaVersion, schema: header.schema, analyzer: { id: analyzer.id }, ranking: header.ranking, capabilities: header.capabilities, indexDetail: header.indexDetail, limits: header.limits };
  const serialized = JSON.stringify(canonical(subset, { count: 0, maximum: 16_384 }));
  return hashText(serialized, MANIFEST_LIMIT);
}
export function batchSize(source: string): number {
  const envelope = object(parse(source), undefined, 'INVALID_ARTIFACT');
  const body = object(envelope.body, undefined, 'INVALID_ARTIFACT'), header = object(body.header, undefined, 'INVALID_ARTIFACT'), limits = object(header.limits, undefined, 'INVALID_ARTIFACT');
  const size = limits.maxMutationBatch;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1 || size > ENTRY_LIMIT) fail('INVALID_ARTIFACT');
  return size;
}
export async function idIdentity(ids: readonly string[]): Promise<string> { return hashText(JSON.stringify([...ids].sort()), DOCUMENTS_LIMIT); }
export async function asset(prefix: 'source' | 'native' | 'documents' | 'sections', text: string): Promise<StaticAsset> {
  const encoded = bytes(text, prefix === 'documents' || prefix === 'sections' ? DOCUMENTS_LIMIT : SNAPSHOT_LIMIT), sha256 = await digest(encoded);
  return Object.freeze({ file: `${prefix}-${sha256}.json`, bytes: encoded.length, sha256 });
}
export function captureManifest(raw: unknown): StaticManifest {
  const data = object(raw, ['kind', 'version', 'buildId', 'base', 'recordCount', 'configurationSha256', 'documentIdsSha256', 'assets'], 'INVALID_ARTIFACT');
  if (data.kind !== 'raveldex-static-search' || data.version !== 1 || typeof data.recordCount !== 'number' || !Number.isSafeInteger(data.recordCount) || data.recordCount < 0 || data.recordCount > ENTRY_LIMIT) fail('INVALID_ARTIFACT');
  const configurationSha256 = string(data.configurationSha256, 64, 'INVALID_ARTIFACT'), documentIdsSha256 = string(data.documentIdsSha256, 64, 'INVALID_ARTIFACT');
  if (!HASH.test(configurationSha256) || !HASH.test(documentIdsSha256)) fail('INVALID_ARTIFACT');
  const sourceAssets = object(data.assets, ['source', 'native', 'documents'], 'INVALID_ARTIFACT');
  function descriptor(prefix: 'source' | 'native' | 'documents'): StaticAsset {
    const a = object(sourceAssets[prefix], ['file', 'bytes', 'sha256'], 'INVALID_ARTIFACT');
    const sha256 = string(a.sha256, 64, 'INVALID_ARTIFACT');
    if (!HASH.test(sha256) || a.file !== `${prefix}-${sha256}.json` || typeof a.bytes !== 'number' || !Number.isSafeInteger(a.bytes) || a.bytes < 1) fail('INVALID_ARTIFACT');
    if (a.bytes > (prefix === 'documents' ? DOCUMENTS_LIMIT : SNAPSHOT_LIMIT)) fail('ASSET_LIMIT');
    return Object.freeze({ file: a.file, bytes: a.bytes, sha256 });
  }
  const assets = Object.freeze({ source: descriptor('source'), documents: descriptor('documents'), ...(Object.hasOwn(sourceAssets, 'native') ? { native: descriptor('native') } : {}) });
  return Object.freeze({ kind: 'raveldex-static-search', version: 1, buildId: buildId(data.buildId, 'INVALID_ARTIFACT'), base: safePath(data.base, 'INVALID_ARTIFACT'), recordCount: data.recordCount, configurationSha256, documentIdsSha256, assets });
}
