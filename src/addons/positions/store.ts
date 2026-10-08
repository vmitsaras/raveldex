import { workerIdentity } from '../../core/capabilities/worker-identity.js';
import { BASIC_ANALYZER, analyzeValue } from '../../core/analyzer/basic.js';
import type { AddonRegistration, ParticipantContext } from '../../core/capabilities/types.js';
import { has } from '../../core/contracts/data.js';
import type { AnalyzerDescriptor, OwnedConfiguration, OwnedRecord } from '../../core/contracts/types.js';
import { bound, invalid } from '../../core/errors/error.js';
import type { Directory, WorkStep } from '../../core/index/directory.js';
import { DirectoryStage, emptyDirectory } from '../../core/index/staging.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import type { Limits } from '../../core/limits/limits.js';
import { capturePositionOptions, positionEntryCeiling } from './options.js';
import type { PositionProviderOptions } from './options.js';

export interface PositionOccurrence {
  readonly position: number;
  /** Basic-v1 emits one token per position. This is not a synonym graph. */
  readonly positionLength: 1;
  readonly start?: number;
  readonly end?: number;
}
export interface PositionValue {
  readonly tokenCount: number;
  readonly terms: Readonly<Record<string, readonly PositionOccurrence[]>>;
}
export interface PositionCounts {
  readonly retainedEntries: number;
  readonly occurrenceCount: number;
  readonly offsetCount: number;
  readonly termEntries: number;
  readonly termCodeUnits: number;
}
export interface PositionRecord extends PositionCounts {
  readonly positions: Readonly<Record<string, readonly PositionValue[]>>;
}
/** Private protocol v1: immutable selected occurrences, no original text or
 * metadata. Value index is the array coordinate; term maps have null prototypes. */
export interface PositionRoot extends PositionCounts {
  readonly kind: 'raveldex-positions-v1';
  readonly revision: number;
  readonly analyzer: AnalyzerDescriptor;
  readonly fields: readonly string[];
  readonly offsetFields: readonly string[];
  readonly records: Directory<PositionRecord>;
  readonly limits: Limits;
  readonly maxRetainedEntries: number;
  readonly maxOccurrences: number;
  readonly maxTermCodeUnits: number;
}

const rawCharge = (workUnits: number): WorkStep => ({ workUnits });
const finiteCount = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
const fieldNames = (fields: readonly string[]): boolean => fields.every(field => typeof field === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field) && field !== 'constructor' && field !== 'prototype') && new Set(fields).size === fields.length;

/** Header validation always precedes candidate testing, including empty queries. */
export function requirePositionRoot(input: unknown, field: string, revision: number, analyzer: AnalyzerDescriptor): PositionRoot {
  if (input === undefined || input === null) invalid('MISSING_CAPABILITY', 'phrases.positions');
  if (typeof input !== 'object' || !Object.isFrozen(input)) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.positions');
  const root = input as PositionRoot;
  if (root.kind !== 'raveldex-positions-v1' || !Array.isArray(root.fields) || !Object.isFrozen(root.fields) ||
      !root.fields.length || root.fields.length > DEFAULT_LIMITS.maxTextFields ||
      !fieldNames(root.fields) ||
      !Array.isArray(root.offsetFields) || !Object.isFrozen(root.offsetFields) || root.offsetFields.length > root.fields.length ||
      !fieldNames(root.offsetFields) ||
      root.offsetFields.some(name => !root.fields.includes(name)) ||
      typeof root.analyzer !== 'object' || root.analyzer === null || !Object.isFrozen(root.analyzer) ||
      typeof root.limits !== 'object' || root.limits === null || !Object.isFrozen(root.limits) ||
      typeof root.records !== 'object' || root.records === null || !Object.isFrozen(root.records) ||
      !finiteCount(root.records.size) || root.records.size > DEFAULT_LIMITS.maxDocuments ||
      typeof root.records.buckets !== 'object' || root.records.buckets === null || !Object.isFrozen(root.records.buckets) ||
      !finiteCount(root.revision) || !finiteCount(root.retainedEntries) || !finiteCount(root.occurrenceCount) ||
      !finiteCount(root.offsetCount) || root.offsetCount > root.occurrenceCount || !finiteCount(root.termEntries) ||
      root.termEntries > root.occurrenceCount || !finiteCount(root.termCodeUnits) ||
      !finiteCount(root.maxRetainedEntries) || root.maxRetainedEntries < root.retainedEntries ||
      !finiteCount(root.maxOccurrences) || root.maxOccurrences < root.occurrenceCount ||
      !finiteCount(root.maxTermCodeUnits) || root.maxTermCodeUnits < root.termCodeUnits) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.positions');
  // A malformed provider must not make comparisons silently disappear through
  // undefined/NaN bounds. Check every numeric limit used by this side protocol.
  for (const key of ['maxDocuments', 'maxTextValuesPerField', 'maxTextCodeUnitsPerValue', 'maxTokensPerRecord', 'maxCorpusTokens', 'maxTermCodeUnits'] as const) {
    const value = root.limits[key];
    if (!Number.isSafeInteger(value) || value < 1 || value > DEFAULT_LIMITS[key]) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.positions.limits');
  }
  if (root.records.size > root.limits.maxDocuments || root.maxOccurrences > root.limits.maxCorpusTokens ||
      root.maxTermCodeUnits > root.limits.maxCorpusTokens * root.limits.maxTermCodeUnits ||
      root.maxRetainedEntries > positionEntryCeiling(root.limits.maxDocuments, root.fields.length, root.limits.maxTextValuesPerField, root.limits.maxCorpusTokens, root.offsetFields.length > 0)) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.positions.limits');
  if (!root.fields.includes(field)) invalid('MISSING_CAPABILITY', 'phrases.positions.field');
  if (root.revision !== revision) invalid('REVISION_MISMATCH', 'phrases.positions.revision');
  if (root.analyzer.id !== analyzer.id || root.analyzer.environmentProfile !== analyzer.environmentProfile) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.positions.analyzer');
  return root;
}

function initialRoot(configuration: OwnedConfiguration, fields: readonly string[], offsetFields: readonly string[], requestedEntries: number): PositionRoot {
  // The optional snapshot factory may qualify this same basic-v1 algorithm for
  // one explicitly evidenced runtime. Ordinary capture still owns the default.
  if (configuration.analyzer.id !== BASIC_ANALYZER.id) invalid('INCOMPATIBLE_CAPABILITY', 'positions.analyzer');
  for (const field of fields) if (!has(configuration.schema.text, field)) invalid('MISSING_CAPABILITY', 'positions.fields');
  const limits = configuration.limits;
  return Object.freeze({
    kind: 'raveldex-positions-v1', revision: 0,
    analyzer: Object.freeze({ id: configuration.analyzer.id, environmentProfile: configuration.analyzer.environmentProfile }),
    fields, offsetFields, limits, records: emptyDirectory<PositionRecord>(),
    retainedEntries: 0, occurrenceCount: 0, offsetCount: 0, termEntries: 0, termCodeUnits: 0,
    maxRetainedEntries: Math.min(requestedEntries, positionEntryCeiling(limits.maxDocuments, fields.length, limits.maxTextValuesPerField, limits.maxCorpusTokens, offsetFields.length > 0)),
    maxOccurrences: limits.maxCorpusTokens, maxTermCodeUnits: limits.maxCorpusTokens * limits.maxTermCodeUnits,
  });
}

function* retainRecord(record: OwnedRecord, root: PositionRoot): Generator<WorkStep, PositionRecord> {
  const positions: Record<string, readonly PositionValue[]> = Object.create(null) as typeof positions;
  let retainedEntries = 1, occurrenceCount = 0, offsetCount = 0, termEntries = 0, termCodeUnits = 0;
  for (const field of root.fields) {
    yield rawCharge(field.length + root.offsetFields.length + 1);
    if (!has(record.text, field)) continue;
    const withOffsets = root.offsetFields.includes(field), values: PositionValue[] = [];
    retainedEntries += 1;
    for (let valueIndex = 0; valueIndex < record.text[field]!.length; valueIndex++) {
      yield rawCharge(1); retainedEntries++;
      const terms: Record<string, PositionOccurrence[]> = Object.create(null) as typeof terms;
      let tokenCount = 0;
      for (const step of analyzeValue(record.text[field]![valueIndex]!, valueIndex, root.limits)) {
        yield rawCharge(step.workUnits);
        if (!step.token) continue;
        const token = step.token;
        yield rawCharge(token.term.length + (withOffsets ? 4 : 2));
        if (token.position !== tokenCount++) invalid('INTERNAL_ERROR', 'positions.order');
        const occurrence: PositionOccurrence = Object.freeze({ position: token.position, positionLength: 1,
          ...(withOffsets ? { start: token.start, end: token.end } : {}) });
        if (!has(terms, token.term)) { terms[token.term] = []; termEntries++; termCodeUnits += token.term.length; retainedEntries++; }
        terms[token.term]!.push(occurrence); occurrenceCount++; retainedEntries++;
        if (withOffsets) { offsetCount++; retainedEntries += 2; }
        bound(occurrenceCount, root.limits.maxTokensPerRecord, 'positions.record.tokens');
        bound(retainedEntries, root.maxRetainedEntries, 'positions.retainedEntries');
      }
      for (const term of Object.keys(terms)) {
        yield rawCharge(term.length + terms[term]!.length + 1);
        Object.freeze(terms[term]);
      }
      values.push(Object.freeze({ tokenCount, terms: Object.freeze(terms) }));
    }
    positions[field] = Object.freeze(values);
  }
  return Object.freeze({ positions: Object.freeze(positions), retainedEntries, occurrenceCount, offsetCount, termEntries, termCodeUnits });
}

function* preparePositions(previous: unknown, context: ParticipantContext, fields: readonly string[]): Generator<WorkStep, PositionRoot> {
  const old = requirePositionRoot(previous, fields[0]!, context.previousRevision, context.analyzer);
  if (context.revision !== context.previousRevision + 1 || !Number.isSafeInteger(context.revision)) invalid('REVISION_MISMATCH', 'positions.revision');
  if (context.kind === 'clear') {
    yield rawCharge(1);
    return Object.freeze({ ...old, revision: context.revision, records: emptyDirectory<PositionRecord>(), retainedEntries: 0, occurrenceCount: 0, offsetCount: 0, termEntries: 0, termCodeUnits: 0 });
  }
  const stage = new DirectoryStage(old.records, rawCharge);
  let retainedEntries = old.retainedEntries, occurrenceCount = old.occurrenceCount, offsetCount = old.offsetCount, termEntries = old.termEntries, termCodeUnits = old.termCodeUnits;
  const adjust = (record: PositionRecord, sign: number) => {
    retainedEntries += sign * record.retainedEntries; occurrenceCount += sign * record.occurrenceCount;
    offsetCount += sign * record.offsetCount; termEntries += sign * record.termEntries; termCodeUnits += sign * record.termCodeUnits;
  };
  for (const id of context.removedIds) {
    yield rawCharge(id.length + 1);
    const retained = stage.get(id);
    if (!retained) invalid('MISSING_CAPABILITY', 'positions.record');
    adjust(retained, -1); yield* stage.delete(id);
  }
  for (const record of context.records) {
    yield rawCharge(record.id.length + 1);
    const retained = stage.get(record.id);
    if (context.kind === 'replace' && !retained) invalid('MISSING_CAPABILITY', 'positions.record');
    if (context.kind !== 'replace' && retained) invalid('INCOMPATIBLE_CAPABILITY', 'positions.record');
    if (retained) adjust(retained, -1);
    const next = yield* retainRecord(record, old);
    adjust(next, 1);
    bound(retainedEntries, old.maxRetainedEntries, 'positions.retainedEntries');
    bound(occurrenceCount, old.maxOccurrences, 'positions.occurrences');
    bound(termCodeUnits, old.maxTermCodeUnits, 'positions.termCodeUnits');
    yield* stage.set(record.id, next);
  }
  if ([retainedEntries, occurrenceCount, offsetCount, termEntries, termCodeUnits].some(count => !finiteCount(count))) invalid('INCOMPATIBLE_CAPABILITY', 'positions.counts');
  const records = yield* stage.finish();
  return Object.freeze({ ...old, revision: context.revision, records, retainedEntries, occurrenceCount, offsetCount, termEntries, termCodeUnits });
}

/** Explicit selected-field token occurrences; original spans opt in per field. */
export function createPositionProvider(options: PositionProviderOptions): AddonRegistration {
  const captured = capturePositionOptions(options, true);
  return Object.freeze({
    manifest: Object.freeze({
      id: captured.id, version: '0.0.0', contractVersion: 1,
      roles: Object.freeze(['transaction-participant'] as const),
      provides: Object.freeze([...captured.fields.map(field => Object.freeze({ id: `positions:${field}`, contractVersion: 1 })), ...captured.offsetFields.map(field => Object.freeze({ id: `offsets:${field}`, contractVersion: 1 }))]),
      requires: Object.freeze([]),
      dataRequirements: Object.freeze({ fields: captured.fields, source: false, positions: true, offsets: captured.offsetFields.length > 0, metadata: false }),
      indexEffect: 'transactional', rebuildPolicy: 'new-index', execution: Object.freeze({ direct: true, worker: true, workerRegistration: workerIdentity('positions', captured) }),
      limits: Object.freeze({ maxPayloadCodeUnits: DEFAULT_LIMITS.maxQueryCodeUnits, maxWorkUnits: captured.maxWorkUnits, maxRetainedEntries: captured.maxRetainedEntries, maxOutputEntries: 0 }),
      costs: Object.freeze({ importedCode: 'Native analyzer and selected-position copy-on-write staging; no phrase verifier.', retainedRepresentation: 'Record, selected-field/value and term containers, ordered occurrences with positionLength 1, and two original span coordinates only for selected offset fields; no display source or metadata.', transientWork: 'One native analysis per changed selected value, occurrence construction and touched directory buckets; shared mutation budget.', externalResources: 'none' }),
      codec: Object.freeze({ id: 'raveldex-positions-v1', version: 1 }),
    }),
    participant: Object.freeze({
      initialize: (configuration: OwnedConfiguration): PositionRoot => initialRoot(configuration, captured.fields, captured.offsetFields, captured.maxRetainedEntries),
      prepare: (previous: unknown, context: ParticipantContext): Generator<WorkStep, PositionRoot> => preparePositions(previous, context, captured.fields),
    }),
  });
}
