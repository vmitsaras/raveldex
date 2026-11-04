import { workerIdentity } from '../../core/capabilities/worker-identity.js';
import { registerBulkParticipant } from '../../core/capabilities/bulk-participant.js';
import type { BulkParticipant } from '../../core/capabilities/bulk-participant.js';
import type { AddonRegistration, ParticipantContext } from '../../core/capabilities/types.js';
import { has } from '../../core/contracts/data.js';
import type { AnalyzerDescriptor, OwnedConfiguration, OwnedRecord } from '../../core/contracts/types.js';
import { bound, invalid } from '../../core/errors/error.js';
import type { Directory, WorkStep } from '../../core/index/directory.js';
import { DirectoryStage, emptyDirectory } from '../../core/index/staging.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import { capturePhraseOptions, sourceEntryCeiling } from './options.js';
import type { SourceProviderOptions } from './options.js';

export type { SourceProviderOptions } from './options.js';

export interface SourceRecord {
  readonly text: Readonly<Record<string, readonly string[]>>;
  readonly retainedEntries: number;
  readonly textCodeUnits: number;
}
/** Private source protocol v1. No metadata, token arrays, or core-root handle. */
export interface SourceRoot {
  readonly kind: 'raveldex-source-v1';
  readonly revision: number;
  readonly analyzer: AnalyzerDescriptor;
  readonly fields: readonly string[];
  readonly records: Directory<SourceRecord>;
  readonly retainedEntries: number;
  readonly textCodeUnits: number;
  readonly maxRetainedEntries: number;
  readonly maxTextCodeUnits: number;
}

const rawCharge = (workUnits: number): WorkStep => ({ workUnits });

/** Validate the source header before searching, even for an empty candidate set. */
export function requireSourceRoot(input: unknown, field: string, revision: number, analyzer: AnalyzerDescriptor): SourceRoot {
  if (input === undefined || input === null) invalid('MISSING_CAPABILITY', 'phrases.source');
  if (typeof input !== 'object' || !Object.isFrozen(input)) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.source');
  const root = input as SourceRoot;
  if (root.kind !== 'raveldex-source-v1' || !Array.isArray(root.fields) || !Object.isFrozen(root.fields) ||
      root.fields.length === 0 || root.fields.length > DEFAULT_LIMITS.maxTextFields ||
      typeof root.analyzer !== 'object' || root.analyzer === null || !Object.isFrozen(root.analyzer) ||
      typeof root.records !== 'object' || root.records === null || !Object.isFrozen(root.records) ||
      !Number.isSafeInteger(root.records.size) || root.records.size < 0 || root.records.size > DEFAULT_LIMITS.maxDocuments ||
      typeof root.records.buckets !== 'object' || root.records.buckets === null || !Object.isFrozen(root.records.buckets) ||
      !Number.isSafeInteger(root.revision) || root.revision < 0 ||
      !Number.isSafeInteger(root.retainedEntries) || root.retainedEntries < 0 ||
      !Number.isSafeInteger(root.textCodeUnits) || root.textCodeUnits < 0 ||
      !Number.isSafeInteger(root.maxRetainedEntries) || root.maxRetainedEntries < root.retainedEntries ||
      !Number.isSafeInteger(root.maxTextCodeUnits) || root.maxTextCodeUnits < root.textCodeUnits) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.source');
  if (!root.fields.includes(field)) invalid('MISSING_CAPABILITY', 'phrases.source.field');
  if (root.revision !== revision) invalid('REVISION_MISMATCH', 'phrases.source.revision');
  if (root.analyzer.id !== analyzer.id || root.analyzer.environmentProfile !== analyzer.environmentProfile) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.source.analyzer');
  return root;
}

function* retainRecord(record: OwnedRecord, fields: readonly string[]): Generator<WorkStep, SourceRecord> {
  const text: Record<string, readonly string[]> = Object.create(null) as typeof text;
  let retainedEntries = 1, textCodeUnits = 0;
  for (const field of fields) {
    yield rawCharge(field.length + 1);
    if (!has(record.text, field)) continue;
    const values = record.text[field]!;
    // Captured inputs own frozen arrays. Retain only selected arrays of immutable
    // strings, never the entire input record or its metadata.
    if (!Object.isFrozen(values)) invalid('INTERNAL_ERROR', 'source.record.values');
    retainedEntries += 1 + values.length;
    for (const value of values) { yield rawCharge(1); textCodeUnits += value.length; }
    text[field] = values;
  }
  return Object.freeze({ text: Object.freeze(text), retainedEntries, textCodeUnits });
}

function initialRoot(configuration: OwnedConfiguration, fields: readonly string[], requestedEntries: number): SourceRoot {
  for (const field of fields) if (!has(configuration.schema.text, field)) invalid('MISSING_CAPABILITY', 'source.fields');
  const maxRetainedEntries = Math.min(requestedEntries, sourceEntryCeiling(configuration.limits.maxDocuments, fields.length, configuration.limits.maxTextValuesPerField));
  return Object.freeze({
    kind: 'raveldex-source-v1', revision: 0,
    analyzer: Object.freeze({ id: configuration.analyzer.id, environmentProfile: configuration.analyzer.environmentProfile }),
    fields, records: emptyDirectory<SourceRecord>(), retainedEntries: 0, textCodeUnits: 0,
    maxRetainedEntries, maxTextCodeUnits: configuration.limits.maxCorpusTextCodeUnits,
  });
}

function* prepareSource(previous: unknown, context: ParticipantContext, fields: readonly string[]): Generator<WorkStep, SourceRoot> {
  const old = requireSourceRoot(previous, fields[0]!, context.previousRevision, context.analyzer);
  if (context.revision !== context.previousRevision + 1 || !Number.isSafeInteger(context.revision)) invalid('REVISION_MISMATCH', 'source.revision');
  // The core coordinator handles no-ops and calls participants only for a commit.
  if (context.kind === 'clear') {
    yield rawCharge(1);
    return Object.freeze({ ...old, revision: context.revision, records: emptyDirectory<SourceRecord>(), retainedEntries: 0, textCodeUnits: 0 });
  }
  const stage = new DirectoryStage(old.records, rawCharge);
  let retainedEntries = old.retainedEntries, textCodeUnits = old.textCodeUnits;
  for (const id of context.removedIds) {
    yield rawCharge(id.length + 1);
    const retained = stage.get(id);
    if (!retained) invalid('MISSING_CAPABILITY', 'source.record');
    retainedEntries -= retained.retainedEntries; textCodeUnits -= retained.textCodeUnits;
    yield* stage.delete(id);
  }
  for (const record of context.records) {
    yield rawCharge(record.id.length + 1);
    const retained = stage.get(record.id);
    if (context.kind === 'replace' && !retained) invalid('MISSING_CAPABILITY', 'source.record');
    if (context.kind !== 'replace' && retained) invalid('INCOMPATIBLE_CAPABILITY', 'source.record');
    if (retained) { retainedEntries -= retained.retainedEntries; textCodeUnits -= retained.textCodeUnits; }
    const next = yield* retainRecord(record, fields);
    retainedEntries += next.retainedEntries; textCodeUnits += next.textCodeUnits;
    bound(retainedEntries, old.maxRetainedEntries, 'source.retainedEntries');
    bound(textCodeUnits, old.maxTextCodeUnits, 'source.textCodeUnits');
    yield* stage.set(record.id, next);
  }
  if (retainedEntries < 0 || textCodeUnits < 0) invalid('INCOMPATIBLE_CAPABILITY', 'source.counts');
  const records = yield* stage.finish();
  return Object.freeze({ ...old, revision: context.revision, records, retainedEntries, textCodeUnits });
}

/** Add-only private reconstruction; one owned directory is sealed at the end. */
function bulkSource(initial: unknown, fields: readonly string[]): BulkParticipant {
  const old = requireSourceRoot(initial, fields[0]!, 0, (initial as SourceRoot)?.analyzer);
  if (old.records.size !== 0 || old.retainedEntries !== 0 || old.textCodeUnits !== 0) invalid('INCOMPATIBLE_CAPABILITY', 'source.bulk.initial');
  const stage = new DirectoryStage(old.records, rawCharge);
  let revision = 0, retainedEntries = 0, textCodeUnits = 0, sealed = false;
  return Object.freeze({
    *add(context: ParticipantContext): Generator<WorkStep, void> {
      if (sealed) invalid('INTERNAL_ERROR', 'source.bulk.sealed');
      if (context.kind !== 'add' || context.records.length !== 1 || context.removedIds.length !== 0) invalid('INCOMPATIBLE_CAPABILITY', 'source.bulk.add');
      if (context.previousRevision !== revision || context.revision !== revision + 1 || !Number.isSafeInteger(context.revision)) invalid('REVISION_MISMATCH', 'source.revision');
      if (context.analyzer.id !== old.analyzer.id || context.analyzer.environmentProfile !== old.analyzer.environmentProfile) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.source.analyzer');
      const record = context.records[0]!;
      yield rawCharge(record.id.length + 1);
      if (stage.get(record.id)) invalid('INCOMPATIBLE_CAPABILITY', 'source.record');
      const next = yield* retainRecord(record, fields);
      retainedEntries += next.retainedEntries; textCodeUnits += next.textCodeUnits;
      bound(retainedEntries, old.maxRetainedEntries, 'source.retainedEntries');
      bound(textCodeUnits, old.maxTextCodeUnits, 'source.textCodeUnits');
      yield* stage.set(record.id, next);
      revision = context.revision;
    },
    *finish(finalRevision: number): Generator<WorkStep, SourceRoot> {
      if (sealed) invalid('INTERNAL_ERROR', 'source.bulk.sealed');
      if (finalRevision !== revision || !Number.isSafeInteger(finalRevision)) invalid('REVISION_MISMATCH', 'source.revision');
      sealed = true;
      const records = yield* stage.finish();
      return Object.freeze({ ...old, revision, records, retainedEntries, textCodeUnits });
    },
  });
}

/** Optional selected-field originals, committed with the native frequency root. */
export function createSourceProvider(options: SourceProviderOptions): AddonRegistration {
  const captured = capturePhraseOptions(options, true);
  const registration: AddonRegistration = Object.freeze({
    manifest: Object.freeze({
      id: captured.id, version: '0.0.0', contractVersion: 1,
      roles: Object.freeze(['transaction-participant'] as const),
      provides: Object.freeze(captured.fields.map(field => Object.freeze({ id: `source:${field}`, contractVersion: 1 }))),
      requires: Object.freeze([]),
      dataRequirements: Object.freeze({ fields: captured.fields, source: true, positions: false, offsets: false, metadata: false }),
      indexEffect: 'transactional', rebuildPolicy: 'new-index',
      execution: Object.freeze({ direct: true, worker: true, workerRegistration: workerIdentity('source', captured) }),
      limits: Object.freeze({ maxPayloadCodeUnits: DEFAULT_LIMITS.maxQueryCodeUnits, maxWorkUnits: captured.maxWorkUnits, maxRetainedEntries: captured.maxRetainedEntries, maxOutputEntries: 0 }),
      costs: Object.freeze({ importedCode: 'Selected-source capture and copy-on-write directory staging; no phrase verifier.', retainedRepresentation: 'One entry per record, present selected field and original value; selected original UTF-16 strings only.', transientWork: 'Changed selected-field values and touched source-directory buckets; shared mutation budget.', externalResources: 'none' }),
      codec: Object.freeze({ id: 'raveldex-source-v1', version: 1 }),
    }),
    participant: Object.freeze({
      initialize: (configuration: OwnedConfiguration): SourceRoot => initialRoot(configuration, captured.fields, captured.maxRetainedEntries),
      prepare: (previous: unknown, context: ParticipantContext): Generator<WorkStep, SourceRoot> => prepareSource(previous, context, captured.fields),
    }),
  });
  return registerBulkParticipant(registration, initial => bulkSource(initial, captured.fields));
}
