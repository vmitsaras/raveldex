import type { SearchResult } from '../../core/contracts/types.js';
import type { PageSections, PageSection, SectionDocument } from '../sections/types.js';
import type { MatchRange } from '../evidence/types.js';
import type { Snippet, SnippetOmissions } from '../snippets/types.js';
import { capturePageSections } from '../sections/validation.js';
import { RaveldexError } from '../../core/errors/error.js';
import { fail } from './options.js';
import type { UIDocument } from './types.js';

export interface InlineSectionPage { readonly sections: readonly PageSection[]; readonly urls: readonly string[] }
export interface InlineSections { readonly revision: number; readonly pages: ReadonlyMap<string, InlineSectionPage> }
export interface InlineSectionContext {
  readonly state: 'no-map' | 'empty-map' | 'stale-map' | 'unavailable' | 'no-positive-evidence' | 'no-matching-section' | 'previews';
  readonly page?: InlineSectionPage;
  readonly evidence?: SectionDocument;
}
export function captureInlineSections(value: unknown, documents: ReadonlyMap<string, UIDocument>): InlineSections {
  const captured: PageSections = capturePageSections(value, new Set(documents.keys()));
  const pages = new Map<string, InlineSectionPage>();
  for (const page of captured.pages) {
    const parent = documents.get(page.pageId)!.url;
    // Empty mapped pages still have an explicit section-enabled parent URL.
    if (parent.includes('#') || parent.length > 2048) fail('INVALID_OPTIONS', 'inline.pageSections.url');
    const urls = Object.freeze(page.sections.map(section => sectionUrl(parent, section.anchor)));
    pages.set(page.pageId, Object.freeze({ sections: page.sections, urls }));
  }
  return Object.freeze({ revision: captured.revision, pages });
}
function sectionUrl(parent: string, anchor: string): string {
  if (parent.includes('#')) fail('INVALID_OPTIONS', 'inline.pageSections.url');
  const base = new URL(parent), joined = new URL(parent + '#' + encodeURIComponent(anchor));
  if (joined.href.length > 2048 || joined.origin !== base.origin || joined.pathname !== base.pathname || joined.search !== base.search ||
    joined.username || joined.password || decodeURIComponent(joined.hash.slice(1)) !== anchor) fail('INVALID_OPTIONS', 'inline.pageSections.url');
  return joined.href;
}
function wellFormed(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) { const d = value.charCodeAt(++i); if (!(d >= 0xdc00 && d <= 0xdfff)) return false; }
    else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}
const contextCodes = new Set(['MISSING_CAPABILITY', 'INCOMPATIBLE_CAPABILITY', 'INVALID_OPTIONS', 'LIMIT_EXCEEDED',
  'WORK_LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED', 'DEADLINE_EXCEEDED', 'UNSUPPORTED_ENVIRONMENT']);
/** Only a typed refusal of the native context call is eligible for page-only recovery.
 * Consumers call this inside the narrow search catch, never around reply validation. */
export function isSectionRefusal(reason: unknown): boolean {
  return reason instanceof RaveldexError && contextCodes.has(reason.code);
}
const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
const field = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value) && value !== 'constructor' && value !== 'prototype';
function bad(): never { return fail('INCOMPATIBLE_CAPABILITY', 'inline.sections.reply'); }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad();
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== keys.length || keys.some(key => !Object.hasOwn(object, key))) bad();
  return object;
}
/** Own bounded plain response data before inspecting fields; hostile accessors,
 * symbols, sparse arrays and unsupported prototypes cannot enter rendering. */
function ownReply(value: unknown): unknown {
  let entries = 0, units = 0;
  const text = (value: string): string => {
    units += value.length; if (units > 262144 || !wellFormed(value)) bad(); return value;
  };
  const copy = (input: unknown, depth: number): unknown => {
    if (++entries > 16384 || depth > 16) bad();
    if (typeof input === 'string') return text(input);
    if (input === null || typeof input === 'boolean' || typeof input === 'number') return input;
    if (typeof input !== 'object') bad();
    const keys = Reflect.ownKeys(input); if (keys.length > 16384 - entries) bad();
    if (Array.isArray(input)) {
      if (Object.getPrototypeOf(input) !== Array.prototype && Object.getPrototypeOf(input) !== null) bad();
      if (keys.length !== input.length + 1 || input.length > 16384 - entries) bad();
      const result: unknown[] = [];
      for (let i = 0; i < input.length; i++) {
        const d = Object.getOwnPropertyDescriptor(input, String(i)); if (!d || !('value' in d)) bad();
        result.push(copy(d.value, depth + 1));
      }
      return result;
    }
    const proto = Object.getPrototypeOf(input); if (proto !== null && proto !== Object.prototype) bad();
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== 'string') bad();
      const d = Object.getOwnPropertyDescriptor(input, key); if (!d || !('value' in d)) bad();
      result[text(key)] = copy(d.value, depth + 1);
    }
    return result;
  };
  const owned = copy(value, 0);
  if (new TextEncoder().encode(JSON.stringify(owned)).byteLength > 262144) bad();
  return owned;
}
function contained(range: MatchRange, section: PageSection): boolean {
  return range.field === section.field && range.valueIndex === section.valueIndex && range.start >= section.start && range.end <= section.end;
}
function intersects(range: MatchRange, section: PageSection): boolean {
  return range.field === section.field && range.valueIndex === section.valueIndex && range.start < section.end && range.end > section.start;
}
function omissions(value: unknown, ranges: number): SnippetOmissions {
  const o = exact(value, ['unshownMatches', 'windowLimit', 'highlightLimit', 'matchTooLong', 'graphemeTooLong']);
  if (!integer(o.unshownMatches, ranges) || !integer(o.matchTooLong, ranges) || !integer(o.graphemeTooLong, ranges) ||
    o.matchTooLong + o.graphemeTooLong > o.unshownMatches || typeof o.windowLimit !== 'boolean' || typeof o.highlightLimit !== 'boolean' ||
    o.windowLimit !== (o.unshownMatches > o.matchTooLong + o.graphemeTooLong) || !o.unshownMatches && o.highlightLimit) bad();
  return o as unknown as SnippetOmissions;
}
function snippet(value: unknown, section: PageSection, ranges: readonly MatchRange[], omitted: SnippetOmissions): Snippet | null {
  if (value === null) {
    // Every selected section has positive contained ranges. A null excerpt
    // means none fits its factory cap, rather than an undisclosed extra window.
    if (omitted.unshownMatches !== ranges.length || omitted.windowLimit || omitted.highlightLimit ||
      omitted.matchTooLong + omitted.graphemeTooLong !== omitted.unshownMatches) bad();
    return null;
  }
  const s = exact(value, ['field', 'valueIndex', 'start', 'end', 'text', 'highlights', 'omittedBefore', 'omittedAfter']);
  if (s.field !== section.field || s.valueIndex !== section.valueIndex || !integer(s.start) || !integer(s.end) || s.start < section.start ||
    s.end > section.end || s.end <= s.start || typeof s.text !== 'string' || !s.text.length || s.text.length > 240 || s.end - s.start !== s.text.length ||
    typeof s.omittedBefore !== 'boolean' || typeof s.omittedAfter !== 'boolean' || s.omittedBefore !== (s.start > section.start) || s.omittedAfter !== (s.end < section.end) ||
    !Array.isArray(s.highlights) || !s.highlights.length || s.highlights.length > 32) bad();
  const boundaries = new Set<number>([0, s.text.length]);
  for (const part of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s.text)) boundaries.add(part.index);
  let previousEnd = -1;
  for (const raw of s.highlights) {
    const h = exact(raw, ['start', 'end']);
    if (!integer(h.start, s.text.length) || !integer(h.end, s.text.length) || h.start <= previousEnd || h.end <= h.start || !boundaries.has(h.start) || !boundaries.has(h.end)) bad();
    // Every mark must represent at least one complete positive range, never
    // a merely intersecting token or text from another field/value.
    if (!ranges.some(r => r.start >= (s.start as number) + (h.start as number) && r.end <= (s.start as number) + (h.end as number))) bad();
    previousEnd = h.end;
  }
  const marks = s.highlights as { start: number; end: number }[];
  const points = [...boundaries].sort((a, b) => a - b), expected: { start: number; end: number }[] = [];
  for (const range of ranges) {
    if (range.start < s.start || range.end > s.end) continue;
    const localStart = range.start - s.start, localEnd = range.end - s.start;
    const expanded = { start: points.filter(p => p <= localStart).at(-1)!, end: points.find(p => p >= localEnd)! };
    const prior = expected.at(-1);
    if (prior && expanded.start <= prior.end) prior.end = Math.max(prior.end, expanded.end); else expected.push(expanded);
  }
  if (marks.length > expected.length || marks.some((mark, i) => mark.start !== expected[i]!.start || mark.end !== expected[i]!.end) ||
    omitted.highlightLimit !== (marks.length < expected.length)) bad();
  const unshown = ranges.filter(r => !marks.some(h => r.start >= (s.start as number) + h.start && r.end <= (s.start as number) + h.end)).length;
  const unshownInsideWindow = ranges.filter(r => r.start >= (s.start as number) && r.end <= (s.end as number) &&
    !marks.some(h => r.start >= (s.start as number) + h.start && r.end <= (s.start as number) + h.end)).length;
  // A fully represented original span expands within this grapheme-bounded
  // window, so it cannot be too long for the same factory's window cap.
  if (unshown !== omitted.unshownMatches || omitted.matchTooLong + omitted.graphemeTooLong > unshown - unshownInsideWindow) bad();
  return s as unknown as Snippet;
}

/** Check complete page facts and projection ordinals before the batch commits. */
export function sectionDocument(result: SearchResult, main: SearchResult, id: string, page: InlineSectionPage, cap: number): SectionDocument {
  if (!result || result.revision !== main.revision) fail('REVISION_MISMATCH', 'inline.sections.revision');
  if (result.model !== main.model || result.completeness !== main.completeness || result.total !== main.total || !Array.isArray(result.hits) || result.hits.length !== main.hits.length ||
    result.hits.some((hit, i) => !hit || hit.id !== main.hits[i]!.id || hit.score !== main.hits[i]!.score)) bad();
  const extension = result.extensions?.['section-evidence'];
  const data = exact(ownReply(extension), ['kind', 'revision', 'fields', 'scope', 'complete', 'documents']);
  if (data.revision !== main.revision) fail('REVISION_MISMATCH', 'inline.sections.revision');
  if (data.kind !== 'raveldex-match-evidence-v1' || data.complete !== true || data.scope !== 'successful-positive-token-occurrences' || !Array.isArray(data.fields) || !data.fields.length || data.fields.length > 32 ||
    data.fields.some((name: unknown, i: number) => !field(name) || i > 0 && (data.fields as string[])[i - 1]! >= name) || page.sections.some(s => !(data.fields as unknown[]).includes(s.field)) ||
    !Array.isArray(data.documents) || data.documents.length !== 1) bad();
  const d = exact(data.documents[0], ['id', 'eligibility', 'ranges', 'sectionPreviews', 'sectionOmissions']);
  if (d.id !== id || d.eligibility !== 'matched' || !Array.isArray(d.ranges) || d.ranges.length > 4096 || !Array.isArray(d.sectionPreviews) || d.sectionPreviews.length > cap) bad();
  const ranges = d.ranges as MatchRange[];
  let prior: MatchRange | undefined;
  for (const r of ranges) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) bad();
    const keys = ['field', 'valueIndex', 'position', 'start', 'end', 'term', ...(Object.hasOwn(r, 'kind') ? ['kind'] : []), ...(Object.hasOwn(r, 'original') ? ['original'] : [])];
    exact(r, keys);
    if (!(data.fields as unknown[]).includes(r.field) || !integer(r.valueIndex, 63) || !integer(r.position, 32767) || !integer(r.start, 65536) || !integer(r.end, 65536) || r.end <= r.start ||
      typeof r.term !== 'string' || !r.term.length || r.term.length > 256 || r.kind !== undefined && r.kind !== 'original' && r.kind !== 'component') bad();
    if (r.original !== undefined) {
      exact(r.original, ['term', 'start', 'end']);
      if (r.kind !== 'component' || typeof r.original.term !== 'string' || !r.original.term.length || r.original.term.length > 256 || !integer(r.original.start, r.start) || !integer(r.original.end, 65536) || r.original.end < r.end) bad();
    }
    if (prior) {
      const order = prior.field < r.field ? -1 : prior.field > r.field ? 1 : prior.valueIndex - r.valueIndex || prior.start - r.start || prior.end - r.end || prior.position - r.position;
      if (order >= 0) bad();
    }
    prior = r;
  }
  const qualified = page.sections.map((s, i) => ({ section: s, index: i, ranges: ranges.filter(r => contained(r, s)) })).filter(s => s.ranges.length);
  const selected = qualified.slice(0, cap);
  if (d.sectionPreviews.length !== selected.length) bad();
  for (let i = 0; i < selected.length; i++) {
    const p = exact(d.sectionPreviews[i], ['sectionIndex', 'snippet', 'snippetOmissions']), expected = selected[i]!;
    if (p.sectionIndex !== expected.index) bad();
    const omitted = omissions(p.snippetOmissions, expected.ranges.length);
    snippet(p.snippet, expected.section, expected.ranges, omitted);
  }
  const o = exact(d.sectionOmissions, ['omittedSections', 'unmappedRanges', 'boundaryRanges']);
  let boundary = 0, unmapped = 0;
  for (const r of ranges) {
    if (page.sections.some(s => contained(r, s))) continue;
    if (page.sections.some(s => intersects(r, s))) boundary++; else unmapped++;
  }
  if (o.omittedSections !== qualified.length - selected.length || o.unmappedRanges !== unmapped || o.boundaryRanges !== boundary) bad();
  return d as unknown as SectionDocument;
}
