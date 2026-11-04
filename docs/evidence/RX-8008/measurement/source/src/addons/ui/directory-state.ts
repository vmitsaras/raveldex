import { Admission, ownArray, ownObject, keysOnly, codePointWidth } from '../../core/contracts/data.js';
import type { Query } from '../../core/contracts/types.js';
import { RaveldexError } from '../../core/errors/error.js';
import type { ErrorCode } from '../../core/errors/error.js';
import type { DirectoryHandle, DirectoryOptions, DirectoryState, DirectoryPage } from './directory-types.js';
import type { FacetFieldResult, FacetBucket } from '../facets/options.js';
import { queryFromText } from './query.js';

export interface CapturedDirectory {
  readonly groups: readonly { readonly field: string; readonly values: readonly string[]; readonly limit: number }[];
  readonly pageSize: number;
  readonly maxPage: number;
  readonly mode: 'text' | 'prefix';
}
export const directoryConfigurations = new WeakMap<DirectoryHandle, CapturedDirectory>();
export const order = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export function failDirectory(path: string, code: ErrorCode = 'INVALID_OPTIONS'): never {
  throw new RaveldexError(code, { path: `ui.directory.${path}` });
}
export const admission = (): Admission => new Admission(16_384);
export function object(input: unknown, allowed: readonly string[], path: string, budget = admission()): Record<string, unknown> {
  const result = ownObject(input, 'INVALID_OPTIONS', `ui.directory.${path}`, budget);
  keysOnly(result, allowed, 'INVALID_OPTIONS', `ui.directory.${path}`); return result;
}
export function text(input: unknown, maximum: number, path: string): string {
  if (typeof input !== 'string' || input.length > maximum) failDirectory(path);
  for (let i = 0; i < input.length;) i += codePointWidth(input, i, 'INVALID_OPTIONS', `ui.directory.${path}`);
  return input;
}
export function queryText(input: unknown): string {
  const value = text(input, 2_048, 'text');
  if (/[\r\n]/.test(value)) failDirectory('text');
  return value;
}
export function integer(input: unknown, minimum: number, maximum: number, path: string): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < minimum || input > maximum) failDirectory(path);
  return input;
}
export function captureDirectory(input: DirectoryOptions): { config: CapturedDirectory; search: DirectoryOptions['engine']['search'] } {
  const budget = admission(), o = object(input, ['engine', 'groups', 'pageSize', 'mode'], 'options', budget);
  const engine = o.engine as DirectoryOptions['engine'];
  if (!engine || typeof engine.search !== 'function') failDirectory('engine');
  const pageSize = integer(o.pageSize === undefined ? 20 : o.pageSize, 1, 100, 'pageSize');
  const mode = o.mode === undefined ? 'prefix' : o.mode;
  if (mode !== 'prefix' && mode !== 'text') failDirectory('mode');
  const fields = new Set<string>(); let units = 0;
  const groups = ownArray(o.groups === undefined ? [] : o.groups, 8, 'INVALID_OPTIONS', 'ui.directory.groups', budget).map(raw => {
    const item = object(raw, ['field', 'values', 'limit'], 'group', budget), field = text(item.field, 64, 'field');
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field) || ['constructor', 'prototype'].includes(field) || fields.has(field)) failDirectory('field');
    fields.add(field); units += field.length;
    if (units > 65_536) failDirectory('configuration', 'LIMIT_EXCEEDED');
    const seen = new Set<string>(), values = ownArray(item.values, 128, 'INVALID_OPTIONS', 'ui.directory.values', budget).map(rawValue => {
      const value = text(rawValue, 1_024, 'value');
      if (seen.has(value)) failDirectory('values');
      seen.add(value); units += value.length;
      if (units > 65_536) failDirectory('configuration', 'LIMIT_EXCEEDED');
      return value;
    }).sort(order);
    return Object.freeze({ field, values: Object.freeze(values), limit: integer(item.limit === undefined ? 20 : item.limit, 0, 100, 'limit') });
  });
  return { config: Object.freeze({ groups: Object.freeze(groups), pageSize, maxPage: Math.ceil(10_000 / pageSize), mode }), search: engine.search.bind(engine) };
}
export function captureState(config: CapturedDirectory, input: unknown): DirectoryState {
  const budget = admission(), o = object(input, ['text', 'filters', 'page'], 'state', budget);
  const raw = queryText(o.text), page = integer(o.page, 1, config.maxPage, 'page');
  const fields = config.groups.map(g => g.field), selected = object(o.filters, fields, 'filters', budget);
  const filters: Record<string, readonly string[]> = Object.create(null) as Record<string, readonly string[]>;
  let units = 0;
  for (const group of config.groups) {
    const seen = new Set<string>();
    filters[group.field] = Object.freeze(ownArray(Object.hasOwn(selected, group.field) ? selected[group.field] : [], 16, 'INVALID_OPTIONS', 'ui.directory.selected', budget).map(rawValue => {
      const value = text(rawValue, 1_024, 'selected');
      if (seen.has(value) || !group.values.includes(value)) failDirectory('selected');
      seen.add(value); units += value.length;
      if (units > 8_192) failDirectory('selected', 'LIMIT_EXCEEDED');
      return value;
    }).sort(order));
  }
  return Object.freeze({ text: raw, filters: Object.freeze(filters), page });
}
export const queryKey = (state: DirectoryState): string => JSON.stringify([state.text, state.filters]);
export const stateKey = (state: DirectoryState): string => JSON.stringify([state.text, state.filters, state.page]);
export function directoryQuery(config: CapturedDirectory, state: DirectoryState): Query {
  const children: Query[] = [state.text.trim().length ? queryFromText(state.text, config.mode) : { kind: 'all' }];
  for (const group of config.groups) {
    const values = state.filters[group.field]!;
    if (values.length) children.push({ kind: 'extension', capability: 'set-membership', version: 1, payload: { field: group.field, values } });
  }
  return children.length === 1 ? children[0]! : { kind: 'and', children };
}
function capturePageValue(config: CapturedDirectory, state: DirectoryState, input: unknown, limit: number, offset: number): DirectoryPage {
  const budget = admission(), o = object(input, ['revision', 'total', 'hits', 'extensions', 'model', 'completeness'], 'result', budget);
  if (o.model !== 'raveldex-bm25-v1' || o.completeness !== 'complete') failDirectory('result');
  const revision = integer(o.revision, 0, Number.MAX_SAFE_INTEGER, 'revision'), total = integer(o.total, 0, 10_000, 'total');
  const ids = new Set<string>();
  const hits = ownArray(o.hits, limit, 'INVALID_OPTIONS', 'ui.directory.hits', budget).map(raw => {
    const hit = object(raw, ['id', 'score'], 'hit', budget), id = text(hit.id, 256, 'hit.id');
    if (ids.has(id) || typeof hit.score !== 'number' || !Number.isFinite(hit.score)) failDirectory('hit');
    ids.add(id); return Object.freeze({ id, score: hit.score });
  });
  if (hits.length !== Math.min(limit, Math.max(0, total - offset))) failDirectory('hits');
  const facets: FacetFieldResult[] = [], selected: Record<string, readonly { readonly value: string; readonly count: number | null }[]> = Object.create(null) as Record<string, readonly { readonly value: string; readonly count: number | null }[]>;
  if (config.groups.length) {
    const extensions = ownObject(o.extensions, 'INVALID_OPTIONS', 'ui.directory.extensions', budget);
    const facet = object(extensions.facets, ['fields'], 'facets', budget);
    const fields = ownArray(facet.fields, config.groups.length, 'INVALID_OPTIONS', 'ui.directory.facets', budget);
    if (fields.length !== config.groups.length) failDirectory('facets');
    for (let index = 0; index < fields.length; index++) {
      const group = config.groups[index]!, f = object(fields[index], ['field', 'buckets', 'distinctValueTotal', 'omittedBucketCount'], 'facet', budget);
      if (f.field !== group.field) failDirectory('facet.field');
      const seen = new Set<string>();
      const buckets: FacetBucket[] = ownArray(f.buckets, group.limit, 'INVALID_OPTIONS', 'ui.directory.buckets', budget).map(raw => {
        const b = object(raw, ['kind', 'value', 'count'], 'bucket', budget), count = integer(b.count, 0, total, 'bucket.count');
        if (b.kind === 'missing') {
          if (Object.hasOwn(b, 'value') || seen.has('missing')) failDirectory('bucket');
          seen.add('missing'); return Object.freeze({ kind: 'missing' as const, count });
        }
        if (b.kind !== 'value') failDirectory('bucket');
        const value = b.value === null ? null : text(b.value, 1_024, 'bucket.value'), key = value === null ? 'null' : 'string:' + value;
        if (seen.has(key)) failDirectory('bucket');
        seen.add(key); return Object.freeze({ kind: 'value' as const, value, count });
      });
      const distinctValueTotal = integer(f.distinctValueTotal, buckets.length, 10_000, 'facet.total');
      const omittedBucketCount = integer(f.omittedBucketCount, 0, 10_000, 'facet.omitted');
      if (omittedBucketCount !== distinctValueTotal - buckets.length) failDirectory('facet.omitted');
      facets.push(Object.freeze({ field: group.field, buckets: Object.freeze(buckets), distinctValueTotal, omittedBucketCount }));
      selected[group.field] = Object.freeze(state.filters[group.field]!.map(value => {
        const bucket = buckets.find(b => b.kind === 'value' && b.value === value);
        return Object.freeze({ value, count: bucket ? bucket.count : omittedBucketCount ? null : 0 });
      }));
    }
  }
  return Object.freeze({ revision, total, hits: Object.freeze(hits), facets: Object.freeze(facets), selected: Object.freeze(selected) });
}
export function capturePage(config: CapturedDirectory, state: DirectoryState, input: unknown, limit: number, offset: number): DirectoryPage {
  try { return capturePageValue(config, state, input, limit, offset); }
  catch { return failDirectory('result', 'INCOMPATIBLE_CAPABILITY'); }
}
