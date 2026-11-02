import { RaveldexError } from '@vmitsaras/raveldex';
import type { RecordInput } from '@vmitsaras/raveldex';
import type { PageSection, PageSectionPage, PageSections } from '@vmitsaras/raveldex/addons/sections';
import { bytes, cloneOwned, ENTRY_LIMIT, HASH, object, parse, safePath, string } from './common.js';
import type { OwnershipBudget } from './common.js';
import { fail, StaticSearchError } from './error.js';
import type { StaticAsset, StaticManifest } from './types.js';

export const SECTIONS_LIMIT = 4 * 1024 * 1024;
type InvalidCode = 'INVALID_INPUT' | 'INVALID_ARTIFACT';
const order = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const sectionOrder = (a: PageSection, b: PageSection): number => order(a.field, b.field) || a.valueIndex - b.valueIndex || a.start - b.start || a.end - b.end || order(a.anchor, b.anchor);
const integer = (value: unknown, minimum: number, maximum: number, code: InvalidCode): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code);
  return value;
};
/** Separate package-local capture: no private core path or new runtime export is
 * needed by installed Astro consumers. All metadata is owned before any await. */
export function captureSectionPages(input: unknown, ids: ReadonlySet<string> | undefined, budget: OwnershipBudget, code: InvalidCode): readonly PageSectionPage[] {
  let owned: unknown;
  try { owned = cloneOwned(input, budget); }
  catch (error) { if (error instanceof StaticSearchError && error.code === 'INVALID_INPUT') fail(code); throw error; }
  if (!Array.isArray(owned)) fail(code);
  if (owned.length > ENTRY_LIMIT) fail('ASSET_LIMIT');
  const seen = new Set<string>(), pages: PageSectionPage[] = []; let total = 0;
  for (const raw of owned) {
    const page = object(raw, ['pageId', 'sections'], code), pageId = string(page.pageId, 256, code);
    if (seen.has(pageId) || ids && !ids.has(pageId) || !Array.isArray(page.sections)) fail(code);
    if (page.sections.length > 64 || (total += page.sections.length) > 16_384) fail('ASSET_LIMIT');
    seen.add(pageId); const sections: PageSection[] = [], anchors = new Set<string>();
    for (const rawSection of page.sections) {
      const data = object(rawSection, ['anchor', 'heading', 'headingLevel', 'field', 'valueIndex', 'start', 'end'], code);
      const anchor = string(data.anchor, 256, code), heading = string(data.heading, 512, code), field = string(data.field, 64, code);
      if (!heading.trim() || /[\p{Cc}\x09-\x0d\x20]/u.test(anchor) || anchor.includes(':~:') || anchors.has(anchor) || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field) || field === 'constructor' || field === 'prototype') fail(code);
      anchors.add(anchor);
      const headingLevel = integer(data.headingLevel, 1, 6, code), valueIndex = integer(data.valueIndex, 0, Number.MAX_SAFE_INTEGER, code), start = integer(data.start, 0, Number.MAX_SAFE_INTEGER, code), end = integer(data.end, 1, Number.MAX_SAFE_INTEGER, code);
      if (start >= end) fail(code);
      sections.push(Object.freeze({ anchor, heading, headingLevel, field, valueIndex, start, end }));
    }
    sections.sort(sectionOrder);
    for (let index = 1; index < sections.length; index++) {
      const a = sections[index - 1]!, b = sections[index]!;
      if (a.field === b.field && a.valueIndex === b.valueIndex && a.end > b.start) fail(code);
    }
    pages.push(Object.freeze({ pageId, sections: Object.freeze(sections) }));
  }
  pages.sort((a, b) => order(a.pageId, b.pageId));
  bytes(JSON.stringify(pages), SECTIONS_LIMIT);
  return Object.freeze(pages);
}

function unavailable(): never { throw new RaveldexError('UNSUPPORTED_ENVIRONMENT', { path: 'sections.segmenter' }); }
function segmenter(): Intl.Segmenter {
  try {
    if (typeof Intl !== 'object' || Intl === null || typeof Intl.Segmenter !== 'function') return unavailable();
    const host = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    if (host.resolvedOptions().granularity !== 'grapheme' || typeof host.segment !== 'function') return unavailable();
    return host;
  } catch { return unavailable(); }
}
function boundaries(source: string, host: Intl.Segmenter): ReadonlySet<number> {
  let iterator: Iterator<Intl.SegmentData> | undefined;
  try {
    iterator = host.segment(source)[Symbol.iterator]();
    if (!iterator || typeof iterator.next !== 'function' || iterator.return !== undefined && typeof iterator.return !== 'function') return unavailable();
    const result = new Set([0]); let previous = 0, visits = 0;
    for (;;) {
      if (++visits > source.length + 1) return unavailable();
      const row = iterator.next();
      if (!row || typeof row !== 'object' || row.done !== undefined && typeof row.done !== 'boolean') return unavailable();
      if (row.done) break;
      const part = row.value;
      if (!part || typeof part !== 'object' || part.index !== previous || typeof part.segment !== 'string' || part.segment.length < 1 || previous + part.segment.length > source.length || source.slice(previous, previous + part.segment.length) !== part.segment) return unavailable();
      previous += part.segment.length; result.add(previous);
    }
    if (previous !== source.length) return unavailable();
    return result;
  } catch { return unavailable(); }
  finally { try { iterator?.return?.(); } catch { /* Preserve the validation outcome. */ } }
}
/** Validates referenced originals exactly; each referenced value is segmented
 * once per page, never concatenated across original arrays or schema fields. */
export function validateSectionSources(pages: readonly PageSectionPage[], records: readonly RecordInput[], fields: ReadonlySet<string>, code: InvalidCode, urls?: ReadonlyMap<string, string>): void {
  const originals = new Map(records.map(record => [record.id, record]));
  let host: Intl.Segmenter | undefined;
  for (const page of pages) {
    const record = originals.get(page.pageId); if (!record) fail(code);
    const cache = new Map<string, Map<number, ReadonlySet<number>>>();
    for (const section of page.sections) {
      if (!fields.has(section.field)) fail(code);
      const raw = record.text[section.field], values = typeof raw === 'string' ? [raw] : raw;
      const value = values?.[section.valueIndex];
      if (typeof value !== 'string' || value.length > 65_536 || section.end > value.length) fail(code);
      let byValue = cache.get(section.field); if (!byValue) { byValue = new Map(); cache.set(section.field, byValue); }
      let points = byValue.get(section.valueIndex);
      if (!points) { points = boundaries(value, host ??= segmenter()); byValue.set(section.valueIndex, points); }
      if (!points.has(section.start) || !points.has(section.end)) fail(code);
      const parent = urls?.get(page.pageId);
      if (urls && (parent === undefined || parent.includes('#') || (parent + '#' + encodeURIComponent(section.anchor)).length > 2048)) fail(code);
    }
  }
}

export interface SectionManifest {
  readonly kind: 'raveldex-static-page-sections'; readonly version: 1;
  readonly buildId: string; readonly base: string; readonly recordCount: number;
  readonly configurationSha256: string; readonly documentIdsSha256: string;
  readonly sourceSha256: string; readonly documentsSha256: string; readonly asset: StaticAsset;
}
export function sectionManifest(manifest: StaticManifest, asset: StaticAsset): SectionManifest {
  return Object.freeze({ kind: 'raveldex-static-page-sections', version: 1, buildId: manifest.buildId, base: manifest.base, recordCount: manifest.recordCount,
    configurationSha256: manifest.configurationSha256, documentIdsSha256: manifest.documentIdsSha256,
    sourceSha256: manifest.assets.source.sha256, documentsSha256: manifest.assets.documents.sha256, asset });
}
export function captureSectionManifest(raw: unknown, manifest: StaticManifest): SectionManifest {
  const data = object(raw, ['kind', 'version', 'buildId', 'base', 'recordCount', 'configurationSha256', 'documentIdsSha256', 'sourceSha256', 'documentsSha256', 'asset'], 'INVALID_ARTIFACT');
  if (data.kind !== 'raveldex-static-page-sections' || data.version !== 1) fail('INVALID_ARTIFACT');
  const build = string(data.buildId, 64, 'INVALID_ARTIFACT');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(build)) fail('INVALID_ARTIFACT');
  if (build !== manifest.buildId) fail('STALE_BUILD');
  integer(data.recordCount, 0, ENTRY_LIMIT, 'INVALID_ARTIFACT');
  for (const key of ['configurationSha256', 'documentIdsSha256', 'sourceSha256', 'documentsSha256'] as const) if (!HASH.test(string(data[key], 64, 'INVALID_ARTIFACT'))) fail('INVALID_ARTIFACT');
  const base = safePath(data.base, 'INVALID_ARTIFACT');
  if (base !== manifest.base || data.recordCount !== manifest.recordCount || data.configurationSha256 !== manifest.configurationSha256 || data.documentIdsSha256 !== manifest.documentIdsSha256 || data.sourceSha256 !== manifest.assets.source.sha256 || data.documentsSha256 !== manifest.assets.documents.sha256) fail('INCOMPATIBLE_ARTIFACT');
  const descriptor = object(data.asset, ['file', 'bytes', 'sha256'], 'INVALID_ARTIFACT'), sha256 = string(descriptor.sha256, 64, 'INVALID_ARTIFACT');
  if (!HASH.test(sha256) || descriptor.file !== `sections-${sha256}.json`) fail('INVALID_ARTIFACT');
  if (typeof descriptor.bytes !== 'number' || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1) fail('INVALID_ARTIFACT');
  if (descriptor.bytes > SECTIONS_LIMIT) fail('ASSET_LIMIT');
  return sectionManifest(manifest, Object.freeze({ file: descriptor.file, bytes: descriptor.bytes, sha256 }));
}

/** Only public source envelope data is inspected. The codec has already checked
 * its integrity; this transient export validates the actual receiving owner. */
export function sourceSectionData(encoded: string, expectedRevision?: number): { records: readonly RecordInput[]; fields: ReadonlySet<string> } {
  const envelope = object(parse(encoded), undefined, 'INVALID_ARTIFACT'), body = object(envelope.body, undefined, 'INVALID_ARTIFACT'), header = object(body.header, undefined, 'INVALID_ARTIFACT'), payload = object(body.payload, undefined, 'INVALID_ARTIFACT');
  if (envelope.format !== 'raveldex-source' || !Array.isArray(payload.records) || payload.records.length > ENTRY_LIMIT) fail('INVALID_ARTIFACT');
  if (expectedRevision !== undefined && header.originRevision !== expectedRevision) fail('INCOMPATIBLE_ARTIFACT');
  const schema = object(header.schema, undefined, 'INVALID_ARTIFACT'), text = object(schema.text, undefined, 'INVALID_ARTIFACT');
  let fields = new Set(Object.keys(text));
  // Without a section factory metadata can still be loaded independently of
  // projection. When selected, its public declared field contract
  // also constrains every map, including sections that happen not to match.
  if (!Array.isArray(header.capabilities)) fail('INVALID_ARTIFACT');
  for (const raw of header.capabilities) {
    const capability = object(raw, undefined, 'INVALID_ARTIFACT');
    if (!Array.isArray(capability.provides)) fail('INVALID_ARTIFACT');
    const selected = capability.provides.some(raw => {
      const provided = object(raw, undefined, 'INVALID_ARTIFACT');
      return provided.id === 'section-evidence' && provided.contractVersion === 1;
    });
    if (!selected) continue;
    const requirements = object(capability.dataRequirements, undefined, 'INVALID_ARTIFACT');
    if (!Array.isArray(requirements.fields) || requirements.fields.some(field => typeof field !== 'string' || !fields.has(field))) fail('INVALID_ARTIFACT');
    fields = new Set(requirements.fields as readonly string[]);
  }
  return { records: payload.records as readonly RecordInput[], fields };
}
export function runtimeSections(pages: readonly PageSectionPage[], revision: number): PageSections {
  return Object.freeze({ kind: 'raveldex-page-sections', version: 1, revision, pages });
}

export function validateReceivingSections(encoded: string, pages: readonly PageSectionPage[], revision: number): void {
  const originals = sourceSectionData(encoded, revision);
  validateSectionSources(pages, originals.records, originals.fields, 'INVALID_ARTIFACT');
}
