import { createAnalysis } from '../../core/analyzer/selected.js';
import type { AnalysisRunner } from '../../core/analyzer/selected.js';
import { scanUnicode } from '../../core/contracts/data.js';
import { captureRecord } from '../../core/contracts/record.js';
import { initializeParticipants } from '../../core/capabilities/participants.js';
import type { OwnedConfiguration } from '../../core/contracts/types.js';
import { bucketOf, directoryEntries, directoryGet } from '../../core/index/directory.js';
import type { Directory, WorkStep } from '../../core/index/directory.js';
import { inspectIndex } from '../../core/index/invariants.js';
import type { DocumentEntry, FieldIndex, IndexRoot, TermEntry } from '../../core/index/state.js';
import type { SourceRoot } from '../../addons/phrases/store.js';
import { taggedPositionTokens } from '../../addons/positions/tagged.js';
import type { TaggedPositionToken } from '../../addons/positions/tagged.js';
import type { PositionRoot, PositionValue } from '../../addons/positions/store.js';
import { WorkBudget } from '../../core/limits/work.js';
import { fail } from './error.js';
import { count, equalData, object } from './json.js';

function map(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input) || Object.getPrototypeOf(input) !== null || !Object.isFrozen(input)) fail('INVALID_NATIVE_STATE');
  const result = input as Record<string, unknown>;
  for (const key of Reflect.ownKeys(result)) {
    const descriptor = Object.getOwnPropertyDescriptor(result, key);
    if (typeof key !== 'string' || !descriptor || !('value' in descriptor) || !descriptor.enumerable) fail('INVALID_NATIVE_STATE');
  }
  return result;
}
function fieldsEqual(input: unknown, expected: readonly string[]): boolean { return Array.isArray(input) && input.length === expected.length && input.every((value, index) => value === expected[index]); }
function* unicode(value: unknown, maximum: number, nonempty = false): Generator<WorkStep, string> {
  if (typeof value !== 'string' || value.length > maximum || nonempty && !value.length) fail('INVALID_NATIVE_STATE');
  yield* scanUnicode(value, 'INCOMPATIBLE_CAPABILITY', 'snapshot.native.string'); return value;
}
function* canonicalTerm(value: unknown, maximum: number): Generator<WorkStep, string> {
  const term = yield* unicode(value, maximum, true);
  yield { workUnits: term.length + 1 };
  if (term.toLowerCase() !== term) fail('INVALID_NATIVE_STATE'); return term;
}
function* directory<T>(input: unknown, maximum: number, keyMaximum: number): Generator<WorkStep, Directory<T>> {
  const data = object(input, ['size', 'buckets'], 'INVALID_NATIVE_STATE'), expectedSize = count(data.size, maximum), buckets = map(data.buckets);
  let size = 0;
  for (const [slot, raw] of Object.entries(buckets)) {
    yield { workUnits: 1 };
    if (!/^(0|[1-9][0-9]*)$/.test(slot) || Number(slot) > 255) fail('INVALID_NATIVE_STATE');
    const bucket = map(raw); if (!Object.keys(bucket).length) fail('INVALID_NATIVE_STATE');
    for (const key of Object.keys(bucket)) {
      yield* unicode(key, keyMaximum, true); yield { workUnits: key.length + 1 };
      if (bucketOf(key) !== slot || ++size > maximum) fail('INVALID_NATIVE_STATE');
    }
  }
  if (size !== expectedSize) fail('INVALID_NATIVE_STATE'); return input as Directory<T>;
}

/** Reject any state participant without one of this adapter's explicit codecs.
 * Neither unknown state nor its implementation is silently dropped. */
export function requireCodecs(configuration: OwnedConfiguration): void {
  for (const registration of configuration.capabilities?.ordered ?? []) if (registration.participant) {
    const codec = registration.manifest.codec;
    if (!codec || codec.version !== 1 || !['raveldex-source-v1', 'raveldex-positions-v1'].includes(codec.id)) fail('UNSUPPORTED_CODEC', 'snapshot.participants');
    const identity = registration.manifest.execution.workerRegistration;
    const family = codec.id === 'raveldex-source-v1' ? 'source' : 'positions';
    if (!identity?.startsWith(`raveldex:${family}:1:`)) fail('UNSUPPORTED_CODEC', 'snapshot.participants');
  }
}

function* metadata(entry: DocumentEntry, configuration: OwnedConfiguration): Generator<WorkStep, void> {
  const owned = captureRecord({ id: entry.id, text: {}, metadata: entry.metadata }, configuration.schema, configuration.limits);
  for (const [field, raw] of Object.entries(owned.metadata)) {
    yield { workUnits: field.length + 1 };
    if (Array.isArray(raw) && new Set(raw).size !== raw.length) fail('INVALID_NATIVE_STATE');
    const original = entry.metadata[field];
    if (Array.isArray(raw) ? !Array.isArray(original) || raw.some((item, index) => !Object.is(item, original[index])) : !Object.is(raw, original)) fail('INVALID_NATIVE_STATE');
    for (const item of Array.isArray(raw) ? raw : [raw]) if (typeof item === 'string') yield* unicode(item, configuration.limits.maxMetadataStringCodeUnits);
  }
}

/** Validate actual reverse/dictionary/postings/statistical structures. Canonical
 * normalized terms are never passed back through the raw-text analyzer. */
export function* validateNative(payload: unknown, configuration: OwnedConfiguration, revision: number, check?: () => void): Generator<WorkStep, IndexRoot> {
  requireCodecs(configuration);
  const analyze = createAnalysis(configuration, check);
  const data = object(payload, ['documents', 'fields', 'counts', 'participants'], 'INVALID_NATIVE_STATE'), limits = configuration.limits;
  const documents = yield* directory<DocumentEntry>(data.documents, limits.maxDocuments, limits.maxIdCodeUnits);
  const fieldData = map(data.fields), fieldNames = Object.keys(configuration.schema.text);
  if (Object.keys(fieldData).length !== fieldNames.length || fieldNames.some(name => !Object.hasOwn(fieldData, name))) fail('INVALID_NATIVE_STATE');
  const counts = object(data.counts, ['documents', 'textCodeUnits', 'tokens', 'dictionaryEntries', 'postingEntries'], 'INVALID_NATIVE_STATE');
  for (const [name, maximum] of [['documents', limits.maxDocuments], ['textCodeUnits', limits.maxCorpusTextCodeUnits], ['tokens', limits.maxCorpusTokens], ['dictionaryEntries', limits.maxDictionaryEntries], ['postingEntries', limits.maxPostingEntries]] as const) count(counts[name], maximum);
  for (const [id, entry] of directoryEntries(documents)) {
    object(entry, ['id', 'textCodeUnits', 'metadata', 'fields'], 'INVALID_NATIVE_STATE');
    yield* unicode(entry.id, limits.maxIdCodeUnits, true);
    if (entry.id !== id) fail('INVALID_NATIVE_STATE');
    count(entry.textCodeUnits, limits.maxTextCodeUnitsPerRecord);
    yield* metadata(entry, configuration);
    const fields = map(entry.fields); let tokens = 0;
    for (const [name, raw] of Object.entries(fields)) {
      if (!Object.hasOwn(configuration.schema.text, name)) fail('INVALID_NATIVE_STATE');
      const reverse = object(raw, ['length', 'terms'], 'INVALID_NATIVE_STATE'), terms = map(reverse.terms);
      tokens += count(reverse.length, limits.maxTokensPerRecord, 1);
      if (!Object.keys(terms).length || tokens > limits.maxTokensPerRecord) fail('INVALID_NATIVE_STATE');
      for (const [term, frequency] of Object.entries(terms)) { yield* canonicalTerm(term, limits.maxTermCodeUnits); count(frequency, limits.maxTokensPerRecord, 1); }
    }
    if (tokens > entry.textCodeUnits * (configuration.analyzer.id === 'code-identifiers-v1' ? 2 : 1)) fail('INVALID_NATIVE_STATE');
  }
  for (const name of fieldNames) {
    const field = object(fieldData[name], ['documents', 'length', 'terms'], 'INVALID_NATIVE_STATE');
    count(field.documents, limits.maxDocuments); count(field.length, limits.maxCorpusTokens);
    const terms = yield* directory<TermEntry>(field.terms, limits.maxDictionaryEntries, limits.maxTermCodeUnits);
    for (const [, entry] of directoryEntries(terms)) {
      object(entry, ['df', 'frequency', 'postings'], 'INVALID_NATIVE_STATE');
      count(entry.df, limits.maxDocuments, 1); count(entry.frequency, limits.maxCorpusTokens, 1);
      const postings = yield* directory<number>(entry.postings, limits.maxDocuments, limits.maxIdCodeUnits);
      for (const [, frequency] of directoryEntries(postings)) { yield { workUnits: 1 }; count(frequency, limits.maxTokensPerRecord, 1); }
    }
  }
  const participants = map(data.participants);
  const expected = initializeParticipants(configuration).states;
  if (Object.keys(participants).length !== Object.keys(expected).length || Object.keys(expected).some(id => !Object.hasOwn(participants, id))) fail('INVALID_NATIVE_STATE');
  const root: IndexRoot = Object.freeze({ revision, configuration, documents, fields: fieldData as unknown as Readonly<Record<string, FieldIndex>>, counts: counts as unknown as IndexRoot['counts'], participants });
  yield* inspectIndex(root);
  for (const registration of configuration.capabilities?.ordered ?? []) {
    if (!registration.participant) continue;
    const id = registration.manifest.id;
    const budget = new WorkBudget(Math.min(registration.manifest.limits.maxWorkUnits, limits.maxMutationWorkUnits));
    const cursor = registration.manifest.codec!.id === 'raveldex-source-v1' ? source(participants[id], expected[id] as SourceRoot, root, analyze) : positions(participants[id], expected[id] as PositionRoot, root, analyze);
    let finished = false;
    try { for (;;) { const step = cursor.next(); if (step.done) { finished = true; break; } budget.charge(step.value.workUnits); yield step.value; } }
    finally { if (!finished) { try { cursor.return(undefined); } catch { /* Preserve validation failure. */ } } }
  }
  const completeSource = fieldNames.every(field => !!configuration.capabilities?.providers[`source:${field}`]?.participant);
  if (completeSource) for (const [id, document] of directoryEntries(root.documents)) {
    let units = 0;
    for (const field of fieldNames) {
      const provider = configuration.capabilities!.providers[`source:${field}`]!, values = directoryGet((root.participants[provider.manifest.id] as SourceRoot).records, id)!.text[field];
      for (const value of values ?? []) { yield { workUnits: value.length + 1 }; units += value.length; }
    }
    if (units !== document.textCodeUnits) fail('INVALID_NATIVE_STATE');
  }
  return root;
}

function* source(input: unknown, expected: SourceRoot, core: IndexRoot, analyze: AnalysisRunner): Generator<WorkStep, void> {
  const data = object(input, ['kind', 'revision', 'analyzer', 'fields', 'records', 'retainedEntries', 'textCodeUnits', 'maxRetainedEntries', 'maxTextCodeUnits'], 'INVALID_NATIVE_STATE');
  if (data.kind !== expected.kind || data.revision !== core.revision || !equalData(data.analyzer, core.configuration.analyzer) || !fieldsEqual(data.fields, expected.fields) || data.maxRetainedEntries !== expected.maxRetainedEntries || data.maxTextCodeUnits !== expected.maxTextCodeUnits) fail('INVALID_NATIVE_STATE');
  const records = yield* directory<SourceRoot['records'] extends Directory<infer T> ? T : never>(data.records, core.documents.size, core.configuration.limits.maxIdCodeUnits);
  if (records.size !== core.documents.size) fail('INVALID_NATIVE_STATE');
  let retainedEntries = 0, textCodeUnits = 0;
  for (const [id, entry] of directoryEntries(records)) {
    object(entry, ['text', 'retainedEntries', 'textCodeUnits'], 'INVALID_NATIVE_STATE');
    const document = directoryGet(core.documents, id); if (!document) fail('INVALID_NATIVE_STATE');
    const text = map(entry.text); let entries = 1, units = 0;
    for (const field of Object.keys(text)) {
      if (!expected.fields.includes(field)) fail('INVALID_NATIVE_STATE');
      const values = text[field];
      if (!Array.isArray(values) || values.length > core.configuration.limits.maxTextValuesPerField) fail('INVALID_NATIVE_STATE');
      entries += 1 + values.length;
      const terms: Record<string, number> = Object.create(null) as typeof terms;
      for (const value of values) {
        yield* unicode(value, core.configuration.limits.maxTextCodeUnitsPerValue); units += (value as string).length;
        for (const step of analyze(value as string, 0, core.configuration.limits)) { yield { workUnits: step.workUnits }; if (step.token) terms[step.token.term] = (terms[step.token.term] ?? 0) + 1; }
      }
      const reverse = document.fields[field];
      if (Object.keys(terms).length !== Object.keys(reverse?.terms ?? {}).length) fail('INVALID_NATIVE_STATE');
      for (const term of Object.keys(terms)) { yield { workUnits: term.length + 1 }; if (terms[term] !== reverse?.terms[term]) fail('INVALID_NATIVE_STATE'); }
    }
    // A missing selected original field must not hide an indexed nonempty field.
    for (const field of expected.fields) if (!Object.hasOwn(text, field) && document.fields[field]) fail('INVALID_NATIVE_STATE');
    if (entries !== entry.retainedEntries || units !== entry.textCodeUnits || units > document.textCodeUnits) fail('INVALID_NATIVE_STATE');
    retainedEntries += entries; textCodeUnits += units;
  }
  if (data.retainedEntries !== retainedEntries || data.textCodeUnits !== textCodeUnits || retainedEntries > expected.maxRetainedEntries || textCodeUnits > expected.maxTextCodeUnits) fail('INVALID_NATIVE_STATE');
}

function* positions(input: unknown, expected: PositionRoot, core: IndexRoot, analyze: AnalysisRunner): Generator<WorkStep, void> {
  const keys = ['kind', 'revision', 'analyzer', 'fields', 'offsetFields', 'records', 'limits', 'maxRetainedEntries', 'maxOccurrences', 'maxTermCodeUnits', 'retainedEntries', 'occurrenceCount', 'offsetCount', 'termEntries', 'termCodeUnits'];
  const data = object(input, keys, 'INVALID_NATIVE_STATE');
  if (data.kind !== expected.kind || data.revision !== core.revision || !equalData(data.analyzer, core.configuration.analyzer) || !equalData(data.limits, expected.limits) || !fieldsEqual(data.fields, expected.fields) || !fieldsEqual(data.offsetFields, expected.offsetFields) || data.maxRetainedEntries !== expected.maxRetainedEntries || data.maxOccurrences !== expected.maxOccurrences || data.maxTermCodeUnits !== expected.maxTermCodeUnits) fail('INVALID_NATIVE_STATE');
  const records = yield* directory<PositionRoot['records'] extends Directory<infer T> ? T : never>(data.records, core.documents.size, core.configuration.limits.maxIdCodeUnits);
  if (records.size !== core.documents.size) fail('INVALID_NATIVE_STATE');
  const totals = { retainedEntries: 0, occurrenceCount: 0, offsetCount: 0, termEntries: 0, termCodeUnits: 0 };
  for (const [id, entry] of directoryEntries(records)) {
    object(entry, ['positions', ...Object.keys(totals)], 'INVALID_NATIVE_STATE');
    const document = directoryGet(core.documents, id); if (!document) fail('INVALID_NATIVE_STATE');
    const fields = map(entry.positions), counts = { retainedEntries: 1, occurrenceCount: 0, offsetCount: 0, termEntries: 0, termCodeUnits: 0 };
    let minimumCodeUnits = 0;
    for (const [field, rawValues] of Object.entries(fields)) {
      if (!expected.fields.includes(field) || !Array.isArray(rawValues) || rawValues.length > expected.limits.maxTextValuesPerField) fail('INVALID_NATIVE_STATE');
      counts.retainedEntries += 1 + rawValues.length;
      const withOffsets = expected.offsetFields.includes(field), frequencies: Record<string, number> = Object.create(null) as typeof frequencies;
      const sourceProvider = core.configuration.capabilities?.providers[`source:${field}`];
      const sourceRoot = sourceProvider ? core.participants[sourceProvider.manifest.id] as SourceRoot : undefined;
      const sourceValues = sourceRoot ? directoryGet(sourceRoot.records, id)?.text[field] : undefined;
      if (sourceRoot && (!sourceValues || sourceValues.length !== rawValues.length)) fail('INVALID_NATIVE_STATE');
      for (let valueIndex = 0; valueIndex < rawValues.length; valueIndex++) {
        if (expected.kind === 'raveldex-positions-v2') {
          const value = object(rawValues[valueIndex], ['tokenCount', 'originalCount', 'terms'], 'INVALID_NATIVE_STATE');
          let tokens: readonly TaggedPositionToken[];
          try { tokens = yield* taggedPositionTokens(value as unknown as PositionValue, withOffsets, expected.limits); }
          catch { fail('INVALID_NATIVE_STATE'); }
          const terms = map(value.terms), tokenCount = count(value.tokenCount, expected.limits.maxTokensPerRecord);
          for (const [term, occurrences] of Object.entries(terms)) {
            yield { workUnits: term.length + 1 };
            counts.termEntries++; counts.termCodeUnits += term.length; counts.retainedEntries++;
            frequencies[term] = (frequencies[term] ?? 0) + (occurrences as readonly unknown[]).length;
          }
          let lastOriginalEnd = 0;
          for (const token of tokens) {
            yield { workUnits: token.term.length + 1 }; counts.occurrenceCount++; counts.retainedEntries++;
            if (withOffsets) { counts.offsetCount++; counts.retainedEntries += 2; if (token.kind === 'original') lastOriginalEnd = token.end!; }
          }
          minimumCodeUnits += lastOriginalEnd;
          if (counts.occurrenceCount > expected.limits.maxTokensPerRecord) fail('INVALID_NATIVE_STATE');
          if (sourceValues) {
            const seen: Record<string, number> = Object.create(null) as typeof seen; let analyzed = 0;
            for (const step of analyze(sourceValues[valueIndex]!, valueIndex, expected.limits)) {
              yield { workUnits: step.workUnits }; if (!step.token) continue;
              const token = step.token, occurrence = (value as unknown as PositionValue).terms[token.term]?.[seen[token.term] ?? 0];
              if (!occurrence || occurrence.position !== token.position || occurrence.kind !== token.kind || withOffsets && (occurrence.start !== token.start || occurrence.end !== token.end)) fail('INVALID_NATIVE_STATE');
              seen[token.term] = (seen[token.term] ?? 0) + 1; analyzed++;
            }
            if (analyzed !== tokenCount) fail('INVALID_NATIVE_STATE');
          }
          continue;
        }
        const value = object(rawValues[valueIndex], ['tokenCount', 'terms'], 'INVALID_NATIVE_STATE'), tokenCount = count(value.tokenCount, expected.limits.maxTokensPerRecord), terms = map(value.terms);
        const ordinals = new Map<number, { start?: number; end?: number }>();
        for (const [term, rawOccurrences] of Object.entries(terms)) {
          yield* canonicalTerm(term, expected.limits.maxTermCodeUnits);
          if (!Array.isArray(rawOccurrences) || !rawOccurrences.length || rawOccurrences.length > tokenCount) fail('INVALID_NATIVE_STATE');
          counts.termEntries++; counts.termCodeUnits += term.length; counts.retainedEntries++;
          let last = -1;
          for (const rawOccurrence of rawOccurrences) {
            yield { workUnits: term.length + 1 };
            const occurrence = object(rawOccurrence, withOffsets ? ['position', 'positionLength', 'start', 'end'] : ['position', 'positionLength'], 'INVALID_NATIVE_STATE');
            const position = count(occurrence.position, tokenCount - 1);
            if (position <= last || occurrence.positionLength !== 1 || ordinals.has(position)) fail('INVALID_NATIVE_STATE'); last = position;
            let span: { start?: number; end?: number } = {};
            if (withOffsets) {
              const start = count(occurrence.start, expected.limits.maxTextCodeUnitsPerValue), end = count(occurrence.end, expected.limits.maxTextCodeUnitsPerValue, 1);
              if (end <= start || end - start > expected.limits.maxRawTokenCodeUnits) fail('INVALID_NATIVE_STATE');
              span = { start, end }; counts.offsetCount++; counts.retainedEntries += 2;
            }
            ordinals.set(position, span); counts.occurrenceCount++; counts.retainedEntries++;
          }
          frequencies[term] = (frequencies[term] ?? 0) + rawOccurrences.length;
        }
        if (ordinals.size !== tokenCount || counts.occurrenceCount > expected.limits.maxTokensPerRecord) fail('INVALID_NATIVE_STATE');
        let previousEnd = 0;
        for (let position = 0; position < tokenCount; position++) {
          yield { workUnits: 1 }; const span = ordinals.get(position); if (!span) fail('INVALID_NATIVE_STATE');
          if (withOffsets) { if (span.start! < previousEnd) fail('INVALID_NATIVE_STATE'); previousEnd = span.end!; }
        }
        minimumCodeUnits += previousEnd;
        if (sourceValues) {
          const seen: Record<string, number> = Object.create(null) as typeof seen; let analyzed = 0;
          for (const step of analyze(sourceValues[valueIndex]!, valueIndex, expected.limits)) {
            yield { workUnits: step.workUnits };
            if (!step.token) continue;
            const token = step.token, occurrence = (value as unknown as PositionValue).terms[token.term]?.[seen[token.term] ?? 0];
            if (!occurrence || occurrence.position !== token.position || withOffsets && (occurrence.start !== token.start || occurrence.end !== token.end)) fail('INVALID_NATIVE_STATE');
            seen[token.term] = (seen[token.term] ?? 0) + 1; analyzed++;
          }
          if (analyzed !== tokenCount) fail('INVALID_NATIVE_STATE');
        }
      }
      const reverse = document.fields[field]?.terms ?? {};
      if (Object.keys(frequencies).length !== Object.keys(reverse).length || Object.keys(frequencies).some(term => frequencies[term] !== reverse[term])) fail('INVALID_NATIVE_STATE');
    }
    for (const field of expected.fields) {
      if (!Object.hasOwn(fields, field) && document.fields[field]) fail('INVALID_NATIVE_STATE');
      const provider = core.configuration.capabilities?.providers[`source:${field}`], retained = provider ? directoryGet((core.participants[provider.manifest.id] as SourceRoot).records, id)?.text : undefined;
      if (retained && Object.hasOwn(retained, field) !== Object.hasOwn(fields, field)) fail('INVALID_NATIVE_STATE');
    }
    if (minimumCodeUnits > document.textCodeUnits) fail('INVALID_NATIVE_STATE');
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) { if (entry[key] !== counts[key]) fail('INVALID_NATIVE_STATE'); totals[key] += counts[key]; }
  }
  for (const key of Object.keys(totals) as (keyof typeof totals)[]) if (data[key] !== totals[key]) fail('INVALID_NATIVE_STATE');
  if (totals.retainedEntries > expected.maxRetainedEntries || totals.occurrenceCount > expected.maxOccurrences || totals.termCodeUnits > expected.maxTermCodeUnits) fail('INVALID_NATIVE_STATE');
}

/** Rebind only validated header revisions; all content remains owned/frozen. */
export function rebaseNative(root: IndexRoot, revision: number): IndexRoot {
  const participants: Record<string, unknown> = Object.create(null) as typeof participants;
  for (const [id, state] of Object.entries(root.participants)) participants[id] = Object.freeze({ ...(state as Record<string, unknown>), revision });
  return Object.freeze({ ...root, revision, participants: Object.freeze(participants) });
}
