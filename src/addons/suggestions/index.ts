import { workerIdentity } from '../../core/capabilities/worker-identity.js';
import type { AddonRegistration, AggregationOutput, DictionaryContext, PayloadContext, PreparedDictionaryOutput } from '../../core/capabilities/types.js';
import { analyzeValue } from '../../core/analyzer/basic.js';
import { Admission, has, keysOnly, ownArray, ownObject, stringValue } from '../../core/contracts/data.js';
import { bound, invalid } from '../../core/errors/error.js';
import type { WorkStep } from '../../core/index/directory.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import { captureMetadataOutput, captureMetadataPayload, validatePayload } from '../metadata/payload.js';
import { captureSuggestionsOptions } from './options.js';
import type { CapturedSuggestionsOptions, Suggestion, SuggestionsOptions } from './options.js';

export type { SuggestionsOptions, SuggestionRequest, Suggestion, SuggestionsResult } from './options.js';
export const SUGGESTIONS_POLICY = 'dictionary-prefix-df-v1' as const;
const charge = (workUnits = 1): WorkStep => ({ workUnits });

function* precedes(a: Suggestion, b: Suggestion): Generator<WorkStep, boolean> {
  yield charge();
  if (a.fieldDocumentFrequency !== b.fieldDocumentFrequency) return a.fieldDocumentFrequency > b.fieldDocumentFrequency;
  for (let index = 0; index < Math.min(a.term.length, b.term.length); index++) {
    yield charge();
    const delta = a.term.charCodeAt(index) - b.term.charCodeAt(index);
    if (delta) return delta < 0;
  }
  return a.term.length < b.term.length;
}

function* prepare(context: DictionaryContext, options: CapturedSuggestionsOptions): Generator<WorkStep, PreparedDictionaryOutput> {
  yield* validatePayload(context.payload, 'INVALID_OPTIONS');
  if (context.analyzer.id !== 'basic-v1') invalid('INCOMPATIBLE_CAPABILITY', 'suggestions.analyzer');
  const admission = new Admission(context.limits.maxAdmissionEntries);
  const payload = ownObject(context.payload, 'INVALID_OPTIONS', 'suggestions.payload', admission);
  keysOnly(payload, ['text', 'fields', 'limit'], 'INVALID_OPTIONS', 'suggestions.payload');
  const text = stringValue(payload.text, context.limits.maxQueryLexicalCodeUnits, 'INVALID_OPTIONS', 'suggestions.text');
  const rawFields = has(payload, 'fields') ? ownArray(payload.fields, context.limits.maxTextFields, 'INVALID_OPTIONS', 'suggestions.fields', admission) : Object.keys(context.schema.text);
  if (!rawFields.length) invalid('INVALID_OPTIONS', 'suggestions.fields');
  const selected = new Set<string>();
  for (const raw of rawFields) {
    const field = stringValue(raw, context.limits.maxFieldNameCodeUnits, 'INVALID_OPTIONS', 'suggestions.fields');
    yield charge((field.length + 1) * (options.fields.length + 1));
    if (!has(context.schema.text, field) || selected.has(field)) invalid('INVALID_OPTIONS', 'suggestions.fields');
    if (!options.fields.includes(field)) invalid('MISSING_CAPABILITY', 'suggestions.fields');
    selected.add(field);
  }
  const fields = Object.freeze([...selected].sort());
  const limit = has(payload, 'limit') ? payload.limit : Math.min(10, options.maxSuggestions);
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 0) invalid('INVALID_OPTIONS', 'suggestions.limit');
  bound(limit, options.maxSuggestions, 'suggestions.limit');
  let prefix = '', tokens = 0, points = 0;
  const analysisLimits = { ...context.limits, maxTextCodeUnitsPerValue: context.limits.maxQueryLexicalCodeUnits };
  for (const step of analyzeValue(text, 0, analysisLimits, 'INVALID_OPTIONS')) {
    yield charge(step.workUnits);
    if (step.token) { if (++tokens > 1) invalid('INVALID_OPTIONS', 'suggestions.text'); prefix = step.token.term; }
  }
  for (const point of prefix) { yield charge(point.length); points++; }
  return Object.freeze({
    *finish(): Generator<WorkStep, AggregationOutput> {
      const candidates = new Map<string, number>();
      let dictionaryEntriesVisited = 0;
      if (points >= 2) for (const step of context.dictionary(fields)) {
        dictionaryEntriesVisited++; yield charge(step.workUnits);
        // Bound native prefix comparison and hash work by their string lengths.
        yield charge(prefix.length + step.term.length + 1);
        if (!step.term.startsWith(prefix)) continue;
        if (!candidates.has(step.term)) bound(candidates.size + 1, options.maxCandidates, 'suggestions.candidates');
        candidates.set(step.term, (candidates.get(step.term) ?? 0) + step.documentFrequency);
      }
      // Complete field-local counts precede selection; retain at most limit rows.
      const items: Suggestion[] = [];
      for (const [term, fieldDocumentFrequency] of candidates) {
        yield charge(term.length + 1);
        if (!limit) continue;
        const candidate = Object.freeze({ term, fieldDocumentFrequency });
        let index = 0;
        while (index < items.length && !(yield* precedes(candidate, items[index]!))) index++;
        if (index < limit) {
          items.splice(index, 0, candidate); if (items.length > limit) items.pop(); yield charge(limit);
        }
      }
      return yield* captureMetadataOutput(Object.freeze({ policy: SUGGESTIONS_POLICY, prefix, fields, total: candidates.size,
        omitted: candidates.size - items.length, items: Object.freeze(items), dictionaryEntriesVisited }), context.limits);
    },
  });
}

/** Explicit completions; no query rewrite, side index, host access or UI state. */
export function createSuggestions(options: SuggestionsOptions): AddonRegistration {
  const captured = captureSuggestionsOptions(options);
  return Object.freeze({
    manifest: Object.freeze({ id: captured.id, version: '0.1.0', contractVersion: 1,
      roles: Object.freeze(['dictionary-output'] as const), provides: Object.freeze([Object.freeze({ id: 'suggestions', contractVersion: 1 })]), requires: Object.freeze([]),
      dataRequirements: Object.freeze({ fields: captured.fields, source: false, positions: false, offsets: false, metadata: false }),
      indexEffect: 'none', rebuildPolicy: 'new-index', execution: Object.freeze({ direct: true, worker: true, workerRegistration: workerIdentity('suggestions', captured) }),
      limits: Object.freeze({ maxPayloadCodeUnits: DEFAULT_LIMITS.maxQueryCodeUnits, maxWorkUnits: captured.maxWorkUnits, maxRetainedEntries: 0,
        maxOutputEntries: 9 + DEFAULT_LIMITS.maxTextFields + 3 * captured.maxSuggestions }),
      costs: Object.freeze({ importedCode: 'Explicit normalized token completion, live dictionary counts and bounded output selection.',
        retainedRepresentation: 'No optional index or cross-operation cache.',
        transientWork: 'Complete selected dictionaries scanned; at most 10000 matching distinct terms counted and 20 results selected under shared/module budgets.', externalResources: 'none' }),
    }),
    dictionary: Object.freeze({ capture: (input: unknown, context: PayloadContext) => captureMetadataPayload(input, context, 'INVALID_OPTIONS'),
      prepare: (context: DictionaryContext): Generator<WorkStep, PreparedDictionaryOutput> => prepare(context, captured) }),
  });
}
