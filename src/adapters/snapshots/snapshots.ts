import { Admission, has, keysOnly, ownObject } from '../../core/contracts/data.js';
import { captureConfiguration } from '../../core/contracts/schema.js';
import { captureOptions } from '../../core/contracts/options.js';
import type { Configuration, MutationOptions, OwnedConfiguration, Raveldex } from '../../core/contracts/types.js';
import { initializeParticipants } from '../../core/capabilities/participants.js';
import { createOwnedRaveldex, emptyRoot, getExecutionOwner } from '../../core/execution/engine.js';
import type { AdapterControl, ExecutionMetrics } from '../../core/execution/engine.js';
import type { ExecutionHost } from '../../core/execution/host.js';
import { MutationOwner } from '../../core/mutations/owner.js';
import { invalid, RaveldexError } from '../../core/errors/error.js';
import type { IndexRoot } from '../../core/index/state.js';
import type { WorkStep } from '../../core/index/directory.js';
import { WorkBudget } from '../../core/limits/work.js';
import { captureQualification } from './qualification.js';
import { checksum, count, decodeJson, encodeJson, equalData, isChecksum, MAX_ENCODED_BYTES, object, utf8Bytes } from './json.js';
import { fail, SnapshotAdapterError } from './error.js';
import { rebaseNative, requireCodecs, validateNative } from './native.js';
import { requireCompleteSource, sourceRecords } from './source.js';
import type { NativeSnapshotQualification, SnapshotEngineOptions, SnapshotFormat, SnapshotOptions, SnapshotRestoreResult, Snapshots } from './types.js';

const CODEC = Object.freeze({ id: 'raveldex-json-v1', version: 1 });
const INDEX_DETAIL = Object.freeze({ id: 'frequency-directory-256-v1', version: 1 });
const RANKING = Object.freeze({ model: 'raveldex-bm25-v1', implementationVersion: 1 });
const bindings = new WeakMap<object, NativeSnapshotQualification>();

/** Explicit optional construction with an actual qualified descriptor from
 * revision zero. An attestation cannot relabel an already indexed default. */
export function createSnapshotRaveldex(configuration: Configuration, options: SnapshotEngineOptions): Raveldex {
  try {
    const data = ownObject(options, 'INVALID_OPTIONS', 'snapshot.engineOptions', new Admission(256));
    keysOnly(data, ['nativeQualification'], 'INVALID_OPTIONS', 'snapshot.engineOptions');
    return createQualifiedSnapshotEngine(configuration, data.nativeQualification);
  } catch (error) { throw error instanceof RaveldexError ? error : new RaveldexError('INTERNAL_ERROR'); }
}

/** Private deterministic qualification/host fixture seam; not a public export.
 * It builds a qualified empty owner, never promotes an existing facade/root. */
export function createQualifiedSnapshotEngine(configuration: Configuration, input: unknown, host?: ExecutionHost, metrics?: ExecutionMetrics): Raveldex {
  const qualification = captureQualification(input), captured = captureConfiguration(configuration);
  const qualified: OwnedConfiguration = Object.freeze({ ...captured, analyzer: Object.freeze({ id: captured.analyzer.id, environmentProfile: qualification.profileId }) });
  const engine = createOwnedRaveldex(qualified, host, metrics); bindings.set(engine, qualification); return engine;
}

function* metered<T>(cursor: Generator<WorkStep, T>, maximum: number, check: (phase?: string) => void): Generator<WorkStep, T> {
  const budget = new WorkBudget(maximum); let finished = false;
  try {
    for (;;) {
      check('snapshot'); const step = cursor.next();
      if (step.done) { finished = true; return step.value; }
      check('snapshot'); budget.charge(step.value.workUnits); yield step.value;
    }
  } finally { if (!finished) { try { cursor.return(undefined as never); } catch { /* Preserve first outcome. */ } } }
}

function header(root: IndexRoot, qualification: NativeSnapshotQualification | undefined): Readonly<Record<string, unknown>> {
  return Object.freeze({ schemaVersion: 1, schema: root.configuration.schema, analyzer: root.configuration.analyzer,
    ranking: RANKING, capabilities: Object.freeze((root.configuration.capabilities?.ordered ?? []).map(entry => entry.manifest)), indexDetail: INDEX_DETAIL,
    limits: root.configuration.limits, originRevision: root.revision, nativeQualification: qualification ?? null });
}
function nativeQualification(engine: Raveldex, root: IndexRoot): NativeSnapshotQualification {
  const qualification = bindings.get(engine);
  if (!qualification || root.configuration.analyzer.environmentProfile === 'unqualified') fail('UNQUALIFIED_PROFILE');
  const current = captureQualification(qualification);
  if (current.profileId !== root.configuration.analyzer.environmentProfile) fail('PROFILE_MISMATCH'); return current;
}

function* encoded(root: IndexRoot, format: SnapshotFormat, qualification: NativeSnapshotQualification | undefined, maximum: number): Generator<WorkStep, string> {
  requireCodecs(root.configuration);
  if (format === 'raveldex-source') requireCompleteSource(root);
  const native = Object.freeze({ documents: root.documents, fields: root.fields, counts: root.counts, participants: root.participants });
  // Export cannot silently omit or bless a trusted registration whose claimed
  // codec fails this complete state protocol. Both formats validate first.
  try { yield* validateNative(native, root.configuration, root.revision); }
  catch (error) {
    if (error instanceof SnapshotAdapterError || error instanceof RaveldexError && ['CANCELLED', 'DISPOSED', 'DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(error.code)) throw error;
    fail('INVALID_NATIVE_STATE');
  }
  const payload = format === 'raveldex-source' ? Object.freeze({ records: yield* sourceRecords(root) }) : native;
  const body = yield* encodeJson(Object.freeze({ header: header(root, qualification), payload }), maximum);
  const integrity = yield* checksum(body);
  const result = `{"format":${JSON.stringify(format)},"formatVersion":1,"codec":{"id":"${CODEC.id}","version":1},"body":${body},"integrity":{"algorithm":"fnv1a32-utf16","value":"${integrity}"}}`;
  yield* utf8Bytes(result, maximum); return result;
}

function checkedHeader(raw: unknown, root: IndexRoot, format: SnapshotFormat, qualification: NativeSnapshotQualification | undefined): Record<string, unknown> {
  const value = object(raw, ['schemaVersion', 'schema', 'analyzer', 'ranking', 'capabilities', 'indexDetail', 'limits', 'originRevision', 'nativeQualification']);
  if (value.schemaVersion !== 1 || !equalData(value.schema, root.configuration.schema)) fail('SCHEMA_MISMATCH');
  if (!equalData(value.ranking, RANKING)) fail('RANKING_MISMATCH');
  if (!equalData(value.indexDetail, INDEX_DETAIL)) fail('INDEX_DETAIL_MISMATCH');
  if (!equalData(value.limits, root.configuration.limits)) fail('LIMITS_MISMATCH');
  if (!equalData(value.capabilities, (root.configuration.capabilities?.ordered ?? []).map(entry => entry.manifest))) fail('CAPABILITY_MISMATCH');
  const analyzer = object(value.analyzer, ['id', 'environmentProfile']);
  if (analyzer.id !== root.configuration.analyzer.id || typeof analyzer.environmentProfile !== 'string' || !analyzer.environmentProfile.length || analyzer.environmentProfile.length > 128) fail('ANALYZER_MISMATCH');
  if (format === 'raveldex-native') {
    if (analyzer.environmentProfile === 'unqualified' || value.nativeQualification === null) fail('UNQUALIFIED_PROFILE');
    if (!equalData(value.analyzer, root.configuration.analyzer) || !equalData(value.nativeQualification, qualification)) fail('PROFILE_MISMATCH');
  } else {
    // Origins are recorded, while source rebuild deliberately uses the receiver.
    if (value.nativeQualification !== null) {
      let declared: NativeSnapshotQualification;
      try { declared = captureQualification(value.nativeQualification, false); }
      catch { fail('PROFILE_MISMATCH'); }
      if (declared.profileId !== analyzer.environmentProfile) fail('PROFILE_MISMATCH');
    } else if (analyzer.environmentProfile !== 'unqualified') fail('PROFILE_MISMATCH');
  }
  count(value.originRevision, Number.MAX_SAFE_INTEGER); return value;
}

function* preparedSource(payload: unknown, configuration: OwnedConfiguration): Generator<WorkStep, IndexRoot> {
  const data = object(payload, ['records']);
  if (!Array.isArray(data.records) || data.records.length > configuration.limits.maxDocuments) fail('MALFORMED_SNAPSHOT');
  const installed = initializeParticipants(configuration);
  const participants = installed.participants.map(participant => {
    const budget = new WorkBudget(participant.maxWorkUnits ?? configuration.limits.maxMutationWorkUnits);
    return Object.freeze({ id: participant.id, ...(participant.maxWorkUnits !== undefined ? { maxWorkUnits: participant.maxWorkUnits } : {}), *prepare(previous: unknown, context: Parameters<typeof participant.prepare>[1]): Generator<WorkStep, unknown> {
      const cursor = participant.prepare(previous, context); let finished = false;
      try {
        for (;;) { const step = cursor.next(); if (step.done) { finished = true; return step.value; } budget.charge(step.value.workUnits); yield step.value; }
      } finally { if (!finished) { try { cursor.return(undefined); } catch { /* Preserve first failure. */ } } }
    } });
  });
  const owner = new MutationOwner(emptyRoot(configuration, installed.states), participants);
  for (const record of data.records) {
    // Capturing one admitted record retains the original live admission bounds;
    // all batches' yielded work also joins the one outer restore budget.
    yield { workUnits: 1 };
    const request = owner.capture('add', record);
    yield* owner.execute(request);
  }
  return owner.root;
}

function* restoreCursor(engine: Raveldex, root: IndexRoot, encoded: string, maximum: number, publish: (root: IndexRoot) => void, check: (phase?: string) => void): Generator<WorkStep, SnapshotRestoreResult> {
  check('snapshot.decode');
  let decoded: ReturnType<typeof decodeJson> extends Generator<WorkStep, infer T> ? T : never;
  try { decoded = yield* decodeJson(encoded, maximum); }
  catch (error) {
    if (error instanceof SnapshotAdapterError || error instanceof RaveldexError && ['CANCELLED', 'DISPOSED', 'DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(error.code)) throw error;
    fail('MALFORMED_SNAPSHOT');
  }
  const envelope = object(decoded.value, ['format', 'formatVersion', 'codec', 'body', 'integrity']);
  if ((envelope.format !== 'raveldex-source' && envelope.format !== 'raveldex-native') || envelope.formatVersion !== 1) fail('UNSUPPORTED_FORMAT');
  if (!equalData(envelope.codec, CODEC)) fail('UNSUPPORTED_CODEC');
  const integrity = object(envelope.integrity, ['algorithm', 'value']);
  if (integrity.algorithm !== 'fnv1a32-utf16' || !isChecksum(integrity.value)) fail('UNSUPPORTED_CODEC');
  check('snapshot.integrity');
  if ((yield* checksum(decoded.bodyText)) !== integrity.value) fail('INTEGRITY_MISMATCH');
  const format = envelope.format, body = object(envelope.body, ['header', 'payload']);
  const qualification = format === 'raveldex-native' ? nativeQualification(engine, root) : undefined;
  check('snapshot.compatibility');
  const origin = checkedHeader(body.header, root, format, qualification);
  requireCodecs(root.configuration);
  if (root.revision === Number.MAX_SAFE_INTEGER) invalid('REVISION_EXHAUSTED', 'revision');
  let prepared: IndexRoot;
  check(format === 'raveldex-native' ? 'snapshot.validation' : 'snapshot.staging');
  try {
    prepared = format === 'raveldex-native' ? yield* validateNative(body.payload, root.configuration, origin.originRevision as number) : yield* preparedSource(body.payload, root.configuration);
  } catch (error) {
    if (error instanceof SnapshotAdapterError || error instanceof RaveldexError && ['CANCELLED', 'DISPOSED', 'DEADLINE_EXCEEDED', 'WORK_LIMIT_EXCEEDED', 'REVISION_EXHAUSTED', 'RESOURCE_EXHAUSTED'].includes(error.code)) throw error;
    fail('INVALID_NATIVE_STATE');
  }
  const next = rebaseNative(prepared, root.revision + 1);
  const result = Object.freeze({ format, originRevision: origin.originRevision as number, revision: next.revision,
    reindexed: format === 'raveldex-source', receivingAnalyzer: root.configuration.analyzer });
  yield { workUnits: 1 }; check('snapshot.precommit');
  publish(next);
  // There must be no stop check or yield after publication.
  return result;
}

/** Optional codecs borrow one direct native owner. They add no engine methods,
 * background persistence, worker proxy, network access or automatic import. */
export function createSnapshots(engine: Raveldex, options: SnapshotOptions = {}): Snapshots {
  return controlledSnapshots(engine, options);
}

/** Private selected-worker bridge. Transport controls attach after admission. */
export function controlledSnapshots(engine: Raveldex, options: SnapshotOptions = {}, control?: AdapterControl): Snapshots {
  const owner = getExecutionOwner(engine); if (!owner) fail('UNSUPPORTED_ENGINE');
  const data = ownObject(options, 'INVALID_OPTIONS', 'snapshot.options', new Admission(32));
  keysOnly(data, ['maxEncodedBytes'], 'INVALID_OPTIONS', 'snapshot.options');
  const maximum = has(data, 'maxEncodedBytes') ? data.maxEncodedBytes : MAX_ENCODED_BYTES;
  if (typeof maximum !== 'number' || !Number.isSafeInteger(maximum) || maximum < 1024 || maximum > MAX_ENCODED_BYTES) invalid('INVALID_OPTIONS', 'snapshot.maxEncodedBytes');
  function exportFormat(format: SnapshotFormat, options?: MutationOptions): Promise<string> {
    return owner!.adapterOperation(configuration => ({ options: captureOptions(options, configuration.limits, false), *start(root, check) {
      const qualification = format === 'raveldex-native' ? nativeQualification(engine, root) : bindings.get(engine);
      return yield* metered(encoded(root, format, qualification, maximum as number), configuration.limits.maxMutationWorkUnits, check);
    } }), control);
  }
  return Object.freeze({
    exportSource: (options?: MutationOptions) => exportFormat('raveldex-source', options),
    exportNative: (options?: MutationOptions) => exportFormat('raveldex-native', options),
    restore(encoded: string, options?: MutationOptions): Promise<SnapshotRestoreResult> {
      return owner.adapterOperation(configuration => {
        const capturedOptions = captureOptions(options, configuration.limits, false);
        if (capturedOptions.signal?.aborted) invalid('CANCELLED', 'options.signal');
        if (typeof encoded !== 'string') fail('MALFORMED_SNAPSHOT');
        // Strings are immutable owned primitives. A UTF-16 lower bound rejects
        // impossible envelopes before queueing; exact UTF-8 work is scheduled.
        if (encoded.length > (maximum as number)) fail('ENCODED_LIMIT_EXCEEDED');
        return { options: capturedOptions, *start(root, check, publish) {
          return yield* metered(restoreCursor(engine, root, encoded, maximum as number, publish, check), configuration.limits.maxMutationWorkUnits, check);
        } };
      }, control);
    },
  });
}
