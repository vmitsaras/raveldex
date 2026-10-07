import type { AddonRegistration, AggregationOutput, EvidenceContext, EvidenceResultContext, PayloadContext, PreparedEvidence } from '../../core/capabilities/types.js';
import { has } from '../../core/contracts/data.js';
import { invalid } from '../../core/errors/error.js';
import { directoryGet } from '../../core/index/directory.js';
import type { WorkStep } from '../../core/index/directory.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import type { Limits } from '../../core/limits/limits.js';
import type { Fact, TraceRequest } from '../../core/trace/facts.js';
import { validatePayload } from '../metadata/payload.js';
import { requireSourceRoot } from '../phrases/store.js';
import type { SourceRoot } from '../phrases/store.js';
import { captureInspectorOptions, captureInspectorRequest, parseInspectorRequest } from './options.js';
import type { CapturedInspectorOptions, OwnedInspectorRequest } from './options.js';
import { ownInspectorOutput } from './output.js';
import type { InspectorData, InspectorDocument, InspectorOptions, InspectorSource } from './types.js';

const charge = (workUnits = 1): WorkStep => ({ workUnits });
type DocumentFact = Extract<Fact, { readonly kind: 'document' }>;

function* sourceFor(id: string, exists: boolean, request: OwnedInspectorRequest, roots: ReadonlyMap<string, SourceRoot>, limits: Limits): Generator<WorkStep, InspectorSource> {
  if (!request.sourceFields.length) return { status: 'not-requested' };
  if (!exists) return { status: 'unavailable', reason: 'record-absent' };
  const fields: Record<string, { readonly status: 'available'; readonly values: readonly string[] } | { readonly status: 'absent' }> = Object.create(null) as typeof fields;
  for (const field of request.sourceFields) {
    yield charge(id.length + field.length + 1);
    const record = directoryGet(roots.get(field)!.records, id);
    if (!record) invalid('MISSING_CAPABILITY', 'inspector.source.record');
    if (!Object.isFrozen(record) || !record.text || !Object.isFrozen(record.text)) invalid('INCOMPATIBLE_CAPABILITY', 'inspector.source.record');
    if (!has(record.text, field)) fields[field] = { status: 'absent' };
    else {
      const values = record.text[field]!;
      if (!Array.isArray(values) || !Object.isFrozen(values) || values.length > limits.maxTextValuesPerField) invalid('INCOMPATIBLE_CAPABILITY', 'inspector.source.values');
      for (const value of values) {
        yield charge();
        if (typeof value !== 'string' || value.length > limits.maxTextCodeUnitsPerValue) invalid('INCOMPATIBLE_CAPABILITY', 'inspector.source.values');
      }
      fields[field] = { status: 'available', values };
    }
  }
  return { status: 'available', fields };
}
function* project(context: EvidenceContext, finished: EvidenceResultContext, request: OwnedInspectorRequest, roots: ReadonlyMap<string, SourceRoot>, options: CapturedInspectorOptions): Generator<WorkStep, AggregationOutput> {
  const { trace, result } = finished;
  if (trace.revision !== context.revision || result.revision !== context.revision || trace.model !== result.model) invalid('REVISION_MISMATCH', 'inspector.revision');
  const facts = new Map<string, DocumentFact>(), page = new Map<string, number>();
  for (const fact of trace.facts) {
    yield charge(1);
    if (fact.kind === 'document') {
      if (facts.has(fact.id)) invalid('INCOMPATIBLE_CAPABILITY', 'inspector.trace');
      facts.set(fact.id, fact);
    }
  }
  for (let index = 0; index < result.hits.length; index++) {
    const hit = result.hits[index]!; yield charge(hit.id.length + 1); page.set(hit.id, index);
  }
  const documents: InspectorDocument[] = [];
  for (const id of request.ids) {
    yield charge(id.length + 1);
    const fact = facts.get(id); if (!fact) invalid('INCOMPATIBLE_CAPABILITY', 'inspector.trace');
    const index = page.get(id), eligibility = !fact.exists ? 'absent' : fact.matched ? 'matched' : 'excluded';
    documents.push({ id, exists: fact.exists, eligibility, score: fact.exists ? fact.score : null, groups: fact.groups,
      page: { placement: !fact.exists ? 'absent' : !fact.matched ? 'excluded' : index === undefined ? 'outside-page' : 'returned', index: index ?? null },
      absoluteRank: { status: 'unavailable', reason: 'not-collected' },
      source: yield* sourceFor(id, fact.exists, request, roots, context.limits),
    });
  }
  const data: InspectorData = {
    kind: 'raveldex-inspector-v1', revision: context.revision, model: 'raveldex-bm25-v1',
    configuration: { schema: context.schema, limits: context.limits, analyzer: context.analyzer,
      capabilities: finished.capabilities.map(manifest => ({ id: manifest.id, version: manifest.version, contractVersion: manifest.contractVersion,
        roles: manifest.roles, provides: manifest.provides, requires: manifest.requires })) },
    query: { traceScope: 'selected-documents', alternativeScope: 'selected-best-per-group-and-field', fullAlternatives: { status: 'unavailable', reason: 'not-collected' } },
    trace, documents, result: { total: result.total, returned: result.hits.length },
    resources: { outcome: 'complete', unit: 'work-v1', searchWorkUnits: finished.searchWorkUnits,
      maxSearchWorkUnits: finished.maxSearchWorkUnits, scope: 'before-evidence-projection', counts: finished.counts,
      heapBytes: { status: 'unavailable', reason: 'not-measured' } },
    numericalTolerance: { absolute: 1e-12, relative: 1e-12 },
  };
  return yield* ownInspectorOutput(data, Math.min(options.maxOutputEntries, context.limits.maxAdmissionEntries));
}
function* prepare(context: EvidenceContext, options: CapturedInspectorOptions): Generator<WorkStep, PreparedEvidence> {
  yield* validatePayload(context.payload, 'INVALID_OPTIONS');
  const request = parseInspectorRequest(context.payload, context.limits, options), roots = new Map<string, SourceRoot>();
  for (const field of request.sourceFields) {
    yield charge(field.length + 1);
    if (!has(context.schema.text, field)) invalid('INVALID_OPTIONS', 'inspector.sourceFields');
    roots.set(field, requireSourceRoot(context.state(`source:${field}`), field, context.revision, context.analyzer));
  }
  return Object.freeze({ finish: (finished: EvidenceResultContext): Generator<WorkStep, AggregationOutput> => project(context, finished, request, roots, options) });
}
/** Opt-in factual data over actual native decisions. Installs no representation. */
export function createInspector(options: InspectorOptions = {}): AddonRegistration {
  const captured = captureInspectorOptions(options);
  return Object.freeze({
    manifest: Object.freeze({ id: captured.id, version: '0.0.0', contractVersion: 1,
      roles: Object.freeze(['evidence'] as const), provides: Object.freeze([Object.freeze({ id: 'inspector', contractVersion: 1 })]),
      requires: Object.freeze(captured.sourceFields.map(field => Object.freeze({ id: `source:${field}`, contractVersion: 1 }))),
      dataRequirements: Object.freeze({ fields: captured.sourceFields, source: captured.sourceFields.length > 0, positions: false, offsets: false, metadata: false }),
      indexEffect: 'none', rebuildPolicy: 'new-index', execution: Object.freeze({ direct: true, worker: false }),
      limits: Object.freeze({ maxPayloadCodeUnits: DEFAULT_LIMITS.maxQueryCodeUnits, maxWorkUnits: captured.maxWorkUnits, maxRetainedEntries: 0, maxOutputEntries: captured.maxOutputEntries }),
      costs: Object.freeze({ importedCode: 'Factual native Inspector projection, explicit source lookup and bounded JSON diagnostics; no DOM or phrase verifier.',
        retainedRepresentation: 'No side root, record metadata copy, full corpus trace or original source retention.',
        transientWork: 'Only explicitly selected IDs, at most 4096 header-inclusive facts, bounded output entries and 262144 aggregate original UTF-16 key/string units.', externalResources: 'none' }),
    }),
    evidence: Object.freeze({
      capture: (input: unknown, context: PayloadContext) => captureInspectorRequest(input, context, captured),
      select: (payload: unknown): TraceRequest => {
        const request = payload as OwnedInspectorRequest;
        return Object.freeze({ ids: request.ids, maxFacts: request.maxFacts, ...(request.expectedRevision === undefined ? {} : { expectedRevision: request.expectedRevision }) });
      },
      prepare: (context: EvidenceContext): Generator<WorkStep, PreparedEvidence> => prepare(context, captured),
    }),
  });
}
