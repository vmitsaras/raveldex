import { RaveldexError } from '../../core/errors/error.js';
import type { Raveldex } from '../../core/contracts/types.js';
import type { UIDocument, UIFacet, UIOptions } from './types.js';

export function fail(code: 'INVALID_OPTIONS' | 'INCOMPATIBLE_CAPABILITY' | 'REVISION_MISMATCH' | 'UNSUPPORTED_ENVIRONMENT' | 'LIMIT_EXCEEDED', path: string): never {
  throw new RaveldexError(code, { path: `ui.${path}` });
}
export function record(value: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('INVALID_OPTIONS', path);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail('INVALID_OPTIONS', path);
  const owned: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) fail('INVALID_OPTIONS', path);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) fail('INVALID_OPTIONS', path);
    owned[key] = descriptor.value;
  }
  return owned;
}
function array(value: unknown, cap: number, path: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length > cap) fail('INVALID_OPTIONS', path);
  const out: unknown[] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length) fail('INVALID_OPTIONS', path);
  }
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !('value' in descriptor)) fail('INVALID_OPTIONS', path);
    out.push(descriptor.value);
  }
  return out;
}
function string(value: unknown, cap: number, path: string, empty = false): string {
  if (typeof value !== 'string' || value.length > cap || (!empty && !value.length)) fail('INVALID_OPTIONS', path);
  // Reject malformed UTF-16 before it becomes a browser URL or a control label.
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail('INVALID_OPTIONS', path);
    } else if (c >= 0xdc00 && c <= 0xdfff) fail('INVALID_OPTIONS', path);
  }
  return value;
}
function field(value: unknown, path: string): string {
  const name = string(value, 64, path);
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) || name === 'constructor' || name === 'prototype') fail('INVALID_OPTIONS', path);
  return name;
}
export function displayName(value: unknown, cap: number, path: string): string {
  const name = string(value, cap, path);
  if (!name.trim().length) fail('INVALID_OPTIONS', path);
  return name;
}
function integer(value: unknown, fallback: number, minimum: number, maximum: number, path: string): number {
  const n = value === undefined ? fallback : value;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < minimum || n > maximum) fail('INVALID_OPTIONS', path);
  return n;
}
export interface CapturedUIOptions {
  readonly root: HTMLElement;
  readonly engine: Raveldex;
  readonly documents: ReadonlyMap<string, UIDocument>;
  readonly facets: readonly UIFacet[];
  readonly snippetFields: readonly string[];
  readonly pageSize: number;
  readonly debounceMs: number;
  readonly mode: 'text' | 'prefix' | 'phrase';
  readonly label: string;
}
export function captureOptions(input: UIOptions): CapturedUIOptions {
  const o = record(input, ['root', 'engine', 'documents', 'facets', 'snippetFields', 'pageSize', 'debounceMs', 'mode', 'label'], 'options');
  const root = o.root as HTMLElement;
  if (!root || root.nodeType !== 1 || !root.ownerDocument || typeof root.replaceChildren !== 'function') fail('INVALID_OPTIONS', 'root');
  const engine = o.engine as Raveldex;
  if (!engine || typeof engine.search !== 'function') fail('INVALID_OPTIONS', 'engine');
  const documents = new Map<string, UIDocument>();
  let units = 0;
  for (const value of array(o.documents, 10_000, 'documents')) {
    const d = record(value, ['id', 'title', 'url'], 'documents');
    const id = string(d.id, 256, 'documents.id', true), title = displayName(d.title, 1_024, 'documents.title');
    const raw = string(d.url, 2_048, 'documents.url');
    if (documents.has(id)) fail('INVALID_OPTIONS', 'documents.id');
    let parsed: URL;
    try { parsed = new URL(raw, root.ownerDocument.baseURI); } catch { fail('INVALID_OPTIONS', 'documents.url'); }
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) fail('INVALID_OPTIONS', 'documents.url');
    units += id.length + title.length + raw.length;
    if (units > 4_000_000) fail('LIMIT_EXCEEDED', 'documents');
    documents.set(id, Object.freeze({ id, title, url: parsed.href }));
  }
  const facetFields = new Set<string>();
  const facets = array(o.facets ?? [], 8, 'facets').map(value => {
    const f = record(value, ['field', 'label'], 'facets');
    const name = field(f.field, 'facets.field');
    if (facetFields.has(name)) fail('INVALID_OPTIONS', 'facets.field');
    facetFields.add(name);
    return Object.freeze({ field: name, label: displayName(f.label, 256, 'facets.label') });
  });
  const sourceFields = new Set<string>();
  const snippetFields = array(o.snippetFields ?? [], 32, 'snippetFields').map(value => {
    const name = field(value, 'snippetFields');
    if (sourceFields.has(name)) fail('INVALID_OPTIONS', 'snippetFields');
    sourceFields.add(name); return name;
  });
  const mode = o.mode ?? 'text';
  if (mode !== 'text' && mode !== 'prefix' && mode !== 'phrase') fail('INVALID_OPTIONS', 'mode');
  return Object.freeze({ root, engine, documents, facets: Object.freeze(facets), snippetFields: Object.freeze(snippetFields),
    pageSize: integer(o.pageSize, 5, 1, 100, 'pageSize'), debounceMs: integer(o.debounceMs, 150, 0, 2_000, 'debounceMs'),
    mode, label: o.label === undefined ? 'Search documentation' : displayName(o.label, 256, 'label') });
}
