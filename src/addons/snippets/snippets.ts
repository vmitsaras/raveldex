import type { AddonRegistration, EvidenceContext } from '../../core/capabilities/types.js';
import { Admission, has, keysOnly, ownObject, scanUnicode } from '../../core/contracts/data.js';
import { bound, invalid } from '../../core/errors/error.js';
import { directoryGet } from '../../core/index/directory.js';
import type { WorkStep } from '../../core/index/directory.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import { buildMatchEvidence } from '../evidence/builder.js';
import type { EvidencePresentation, PreparedPresentation } from '../evidence/builder.js';
import type { MatchDocument, MatchEvidenceOptions, MatchRange } from '../evidence/types.js';
import { requireSourceRoot } from '../phrases/store.js';
import type { SourceRoot } from '../phrases/store.js';
import type { Snippet, SnippetHighlight, SnippetOmissions, SnippetOptions } from './types.js';

const charge = (workUnits = 1): WorkStep => ({ workUnits });
interface Caps { readonly windows: number; readonly codeUnits: number; readonly highlights: number }
interface ExpandedRange {
  readonly range: MatchRange;
  readonly start: number;
  readonly end: number;
  readonly unavailable: 'match-too-long' | 'grapheme-too-long' | null;
  shown: boolean;
}
interface ValueProjection {
  readonly field: string;
  readonly valueIndex: number;
  readonly source: string;
  readonly boundaries: readonly number[];
  readonly ranges: readonly ExpandedRange[];
}
interface Window {
  readonly value: ValueProjection;
  readonly start: number;
  readonly end: number;
  readonly highlights: readonly SnippetHighlight[];
}

function cap(input: unknown, maximum: number, path: string): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 1) invalid('INVALID_OPTIONS', path);
  bound(input, maximum, path);
  return input;
}

/** Host access is deferred until requested preparation, including empty requests. */
function segmenter(): Intl.Segmenter {
  try {
    if (typeof Intl !== 'object' || Intl === null || typeof Intl.Segmenter !== 'function') invalid('UNSUPPORTED_ENVIRONMENT', 'snippets.segmenter');
    const result = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    if (typeof result.segment !== 'function' || result.resolvedOptions().granularity !== 'grapheme') invalid('UNSUPPORTED_ENVIRONMENT', 'snippets.segmenter');
    return result;
  } catch {
    invalid('UNSUPPORTED_ENVIRONMENT', 'snippets.segmenter');
  }
}

/** Segmenter is a bounded native primitive, followed by charged resumable steps. */
function* boundaries(source: string, host: Intl.Segmenter): Generator<WorkStep, readonly number[]> {
  yield* scanUnicode(source, 'INCOMPATIBLE_CAPABILITY', 'snippets.source.text');
  yield charge(source.length + 1);
  let iterator: Iterator<Intl.SegmentData>, next: Iterator<Intl.SegmentData>['next'], close: Iterator<Intl.SegmentData>['return'];
  try {
    iterator = host.segment(source)[Symbol.iterator]();
    next = iterator.next;
    close = iterator.return;
  }
  catch { invalid('UNSUPPORTED_ENVIRONMENT', 'snippets.segmenter'); }
  if (!iterator || typeof next !== 'function' || close !== undefined && typeof close !== 'function') invalid('UNSUPPORTED_ENVIRONMENT', 'snippets.segmenter');
  const result = [0];
  let previous = 0;
  try {
    while (true) {
      let done: boolean | undefined, index: number, segment: string;
      try {
        const step = next.call(iterator);
        if (!step || typeof step !== 'object') invalid('UNSUPPORTED_ENVIRONMENT', 'snippets.segmenter');
        done = step.done;
        if (done !== undefined && typeof done !== 'boolean') invalid('UNSUPPORTED_ENVIRONMENT', 'snippets.segmenter');
        if (done) break;
        const part = step.value;
        if (!part || typeof part !== 'object') invalid('UNSUPPORTED_ENVIRONMENT', 'snippets.segmenter');
        index = part.index; segment = part.segment;
      }
      catch { invalid('UNSUPPORTED_ENVIRONMENT', 'snippets.segmenter'); }
      if (!Number.isSafeInteger(index) || index !== previous ||
          typeof segment !== 'string' || segment.length === 0 || previous + segment.length > source.length) {
        invalid('UNSUPPORTED_ENVIRONMENT', 'snippets.segmenter');
      }
      yield charge(segment.length + 1);
      if (source.slice(previous, previous + segment.length) !== segment) invalid('UNSUPPORTED_ENVIRONMENT', 'snippets.segmenter');
      previous += segment.length;
      result.push(previous);
    }
  } finally {
    // A cancelled cursor must release an iterator supplied by the host.
    // Cleanup cannot replace an operation's cancellation/deadline error.
    try { close?.call(iterator); } catch { /* The host owns its iterator resource. */ }
  }
  if (previous !== source.length) invalid('UNSUPPORTED_ENVIRONMENT', 'snippets.segmenter');
  return result;
}

/** First boundary >= coordinate. At most log2(65537) charged comparisons. */
function* lower(points: readonly number[], coordinate: number): Generator<WorkStep, number> {
  let low = 0, high = points.length;
  while (low < high) {
    yield charge();
    const middle = low + Math.floor((high - low) / 2);
    if (points[middle]! < coordinate) low = middle + 1;
    else high = middle;
  }
  return low;
}
function* floor(points: readonly number[], coordinate: number): Generator<WorkStep, number> {
  const index = yield* lower(points, coordinate);
  return points[index] === coordinate ? index : index - 1;
}

function* sourceValue(context: EvidenceContext, root: SourceRoot, id: string, field: string, valueIndex: number): Generator<WorkStep, string> {
  yield charge(id.length + field.length + 1);
  const record = directoryGet(root.records, id);
  if (!record) invalid('MISSING_CAPABILITY', 'snippets.source.record');
  if (!Object.isFrozen(record)) invalid('INCOMPATIBLE_CAPABILITY', 'snippets.source.record');
  const data = ownObject(record, 'INCOMPATIBLE_CAPABILITY', 'snippets.source.record', new Admission(3));
  yield charge(Object.keys(data).length + 1);
  keysOnly(data, ['text', 'retainedEntries', 'textCodeUnits'], 'INCOMPATIBLE_CAPABILITY', 'snippets.source.record');
  if (typeof data.text !== 'object' || data.text === null || !Object.isFrozen(data.text)) invalid('INCOMPATIBLE_CAPABILITY', 'snippets.source.record');
  const text = ownObject(data.text, 'INCOMPATIBLE_CAPABILITY', 'snippets.source.text', new Admission(context.limits.maxTextFields));
  yield charge(Object.keys(text).length + 1);
  if (!has(text, field)) invalid('MISSING_CAPABILITY', 'snippets.source.field');
  const values = text[field];
  if (!Array.isArray(values) || !Object.isFrozen(values) || values.length > context.limits.maxTextValuesPerField) invalid('INCOMPATIBLE_CAPABILITY', 'snippets.source.values');
  for (let index = 0; index < values.length; index++) {
    yield charge();
    const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
    if (!descriptor || !('value' in descriptor)) invalid('INCOMPATIBLE_CAPABILITY', 'snippets.source.values');
    const value: unknown = descriptor.value;
    if (typeof value !== 'string' || value.length > context.limits.maxTextCodeUnitsPerValue) invalid('INCOMPATIBLE_CAPABILITY', 'snippets.source.values');
  }
  if (!Number.isSafeInteger(valueIndex) || valueIndex < 0 || valueIndex >= values.length) invalid('INCOMPATIBLE_CAPABILITY', 'snippets.source.valueIndex');
  return Object.getOwnPropertyDescriptor(values, String(valueIndex))!.value as string;
}

function* valuesFor(context: EvidenceContext, roots: ReadonlyMap<string, SourceRoot>, fields: readonly string[], id: string, ranges: readonly MatchRange[], host: Intl.Segmenter, caps: Caps): Generator<WorkStep, readonly ValueProjection[]> {
  const groups = new Map<string, Map<number, MatchRange[]>>();
  for (const range of ranges) {
    yield charge(range.field.length + 1);
    if (!roots.has(range.field) || !Number.isSafeInteger(range.valueIndex) || range.valueIndex < 0 || range.valueIndex >= context.limits.maxTextValuesPerField ||
        !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end <= range.start ||
        !Number.isSafeInteger(range.position) || range.position < 0) invalid('INCOMPATIBLE_CAPABILITY', 'snippets.range');
    let values = groups.get(range.field);
    if (!values) { values = new Map<number, MatchRange[]>(); groups.set(range.field, values); }
    let value = values.get(range.valueIndex);
    if (!value) { value = []; values.set(range.valueIndex, value); }
    value.push(range);
  }
  const result: ValueProjection[] = [];
  for (const field of fields) {
    yield charge(field.length + 1);
    const values = groups.get(field);
    if (!values) continue;
    // Admission bounds values to 32 and canonical ranges to the evidence cap.
    yield charge(values.size + 1);
    const indexes = [...values.keys()].sort((a, b) => a - b);
    for (const valueIndex of indexes) {
      const original = yield* sourceValue(context, roots.get(field)!, id, field, valueIndex);
      const points = yield* boundaries(original, host);
      const expanded: ExpandedRange[] = [];
      let priorStart = -1, priorEnd = -1;
      for (const range of values.get(valueIndex)!) {
        yield charge();
        if (range.end > original.length || range.start < priorStart || range.start === priorStart && range.end < priorEnd) invalid('INCOMPATIBLE_CAPABILITY', 'snippets.range');
        // Verify display source against the authoritative original occurrence,
        // even when the range was supplied by a separate offset provider.
        const raw = original.slice(range.start, range.end);
        yield* scanUnicode(raw, 'INCOMPATIBLE_CAPABILITY', 'snippets.range.source');
        yield charge(raw.length + range.term.length + 1);
        if (raw.normalize('NFKC').toLowerCase() !== range.term) invalid('INCOMPATIBLE_CAPABILITY', 'snippets.range.source');
        priorStart = range.start; priorEnd = range.end;
        const start = points[yield* floor(points, range.start)]!;
        const end = points[yield* lower(points, range.end)]!;
        const unavailable = range.end - range.start > caps.codeUnits ? 'match-too-long' : end - start > caps.codeUnits ? 'grapheme-too-long' : null;
        expanded.push({ range, start, end, unavailable, shown: false });
      }
      result.push({ field, valueIndex, source: original, boundaries: points, ranges: expanded });
    }
  }
  return result;
}

function* windowFor(value: ValueProjection, anchor: ExpandedRange, caps: Caps): Generator<WorkStep, Window> {
  const width = anchor.end - anchor.start;
  const preferredStart = Math.max(0, anchor.start - Math.floor((caps.codeUnits - width) / 2));
  let start = value.boundaries[yield* lower(value.boundaries, preferredStart)]!;
  const end = value.boundaries[yield* floor(value.boundaries, Math.min(value.source.length, start + caps.codeUnits))]!;
  // Fill remaining context toward the left when a large cluster/right edge stops it.
  start = value.boundaries[yield* lower(value.boundaries, Math.max(0, end - caps.codeUnits))]!;
  if (start > anchor.start || end < anchor.end || end - start > caps.codeUnits) invalid('INTERNAL_ERROR', 'snippets.window');
  const unions: { start: number; end: number }[] = [];
  for (const candidate of value.ranges) {
    yield charge();
    if (candidate.unavailable || candidate.start < start || candidate.end > end) continue;
    const previous = unions[unions.length - 1];
    if (previous && candidate.start <= previous.end) previous.end = Math.max(previous.end, candidate.end);
    else unions.push({ start: candidate.start, end: candidate.end });
  }
  // Always include the anchor. Earlier windows may already have used up their
  // highlight slots; repeating their first marks would hide an available match.
  let anchorIndex = -1;
  for (let index = 0; index < unions.length; index++) {
    yield charge();
    const union = unions[index]!;
    if (union.start <= anchor.start && union.end >= anchor.end) { anchorIndex = index; break; }
  }
  if (anchorIndex < 0) invalid('INTERNAL_ERROR', 'snippets.anchor');
  const highlights: SnippetHighlight[] = [];
  const first = Math.max(0, anchorIndex - caps.highlights + 1);
  for (let index = first; index < Math.min(unions.length, first + caps.highlights); index++) {
    yield charge(); highlights.push(unions[index]!);
  }
  for (const candidate of value.ranges) {
    yield charge();
    if (candidate.unavailable) continue;
    for (const highlight of highlights) {
      yield charge();
      if (highlight.start <= candidate.start && highlight.end >= candidate.end) { candidate.shown = true; break; }
    }
  }
  return { value, start, end, highlights };
}

function* project(context: EvidenceContext, roots: ReadonlyMap<string, SourceRoot>, fields: readonly string[], id: string, ranges: readonly MatchRange[], eligibility: MatchDocument['eligibility'], host: Intl.Segmenter, caps: Caps): Generator<WorkStep, Readonly<Record<string, unknown>>> {
  const empty: SnippetOmissions = { unshownMatches: 0, windowLimit: false, highlightLimit: false, matchTooLong: 0, graphemeTooLong: 0 };
  if (eligibility !== 'matched' || ranges.length === 0) {
    yield charge();
    if (ranges.length) invalid('INCOMPATIBLE_CAPABILITY', 'snippets.eligibility');
    return { snippets: [], snippetOmissions: empty };
  }
  const values = yield* valuesFor(context, roots, fields, id, ranges, host, caps), windows: Window[] = [];
  for (const value of values) {
    for (const range of value.ranges) {
      yield charge();
      if (!range.shown && !range.unavailable && windows.length < caps.windows) windows.push(yield* windowFor(value, range, caps));
    }
  }
  let unshownMatches = 0, unavailable = 0, matchTooLong = 0, graphemeTooLong = 0, highlightLimit = false;
  for (const value of values) {
    for (const range of value.ranges) {
      yield charge();
      if (range.shown) continue;
      unshownMatches++;
      if (range.unavailable) {
        unavailable++;
        if (range.unavailable === 'match-too-long') matchTooLong++;
        else graphemeTooLong++;
      } else {
        for (const window of windows) {
          yield charge();
          if (window.value === value && range.start >= window.start && range.end <= window.end) { highlightLimit = true; break; }
        }
      }
    }
  }
  const snippets: Snippet[] = [];
  for (const window of windows) {
    yield charge(window.end - window.start + 1);
    const highlights: SnippetHighlight[] = [];
    for (const mark of window.highlights) {
      yield charge();
      highlights.push({ start: mark.start - window.start, end: mark.end - window.start });
    }
    snippets.push({ field: window.value.field, valueIndex: window.value.valueIndex, start: window.start, end: window.end,
      text: window.value.source.slice(window.start, window.end), highlights,
      omittedBefore: window.start > 0, omittedAfter: window.end < window.value.source.length });
  }
  return { snippets, snippetOmissions: { unshownMatches, windowLimit: windows.length === caps.windows && unshownMatches > unavailable,
    highlightLimit, matchTooLong, graphemeTooLong } };
}

function presentation(caps: Caps): EvidencePresentation {
  return Object.freeze({ capability: 'snippets',
    prepare: function* (context: EvidenceContext, fields: readonly string[]): Generator<WorkStep, PreparedPresentation> {
      const roots = new Map<string, SourceRoot>();
      for (const field of fields) {
        yield charge(field.length + 1);
        roots.set(field, requireSourceRoot(context.state(`source:${field}`), field, context.revision, context.analyzer));
      }
      const host = segmenter();
      yield charge();
      return Object.freeze({ project: (id: string, ranges: readonly MatchRange[], eligibility: MatchDocument['eligibility']) => project(context, roots, fields, id, ranges, eligibility, host, caps) });
    },
  });
}

/** Source-backed grapheme-safe windows; installation retains no new side root. */
export function createSnippetEvidence(options: SnippetOptions): AddonRegistration {
  const data = ownObject(options, 'INVALID_OPTIONS', 'snippets.options', new Admission(DEFAULT_LIMITS.maxAdmissionEntries));
  keysOnly(data, ['fields', 'id', 'maxFacts', 'maxRanges', 'maxWorkUnits', 'maxOutputEntries', 'maxSnippets', 'maxCodeUnits', 'maxHighlights'], 'INVALID_OPTIONS', 'snippets.options');
  const caps = Object.freeze({ windows: cap(has(data, 'maxSnippets') ? data.maxSnippets : 3, 3, 'snippets.maxSnippets'),
    codeUnits: cap(has(data, 'maxCodeUnits') ? data.maxCodeUnits : 240, 240, 'snippets.maxCodeUnits'),
    highlights: cap(has(data, 'maxHighlights') ? data.maxHighlights : 32, 32, 'snippets.maxHighlights') });
  const base: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of ['fields', 'id', 'maxFacts', 'maxRanges', 'maxWorkUnits', 'maxOutputEntries']) if (has(data, key)) base[key] = data[key];
  if (!has(base, 'id')) base.id = 'snippets';
  return buildMatchEvidence(base as unknown as MatchEvidenceOptions, presentation(caps));
}
