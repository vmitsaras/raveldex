import { BASIC_ANALYZER } from '../../core/analyzer/basic.js';
import { Admission, has, ownObject } from '../../core/contracts/data.js';
import type { AddonRegistration, AggregationOutput, EvidenceContext, EvidenceResultContext, PayloadContext, PreparedEvidence } from '../../core/capabilities/types.js';
import { bound, invalid } from '../../core/errors/error.js';
import type { WorkStep } from '../../core/index/directory.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import type { Fact, TraceRequest } from '../../core/trace/facts.js';
import { ownInspectorOutput } from '../inspector/output.js';
import { validatePayload } from '../metadata/payload.js';
import { requireSourceRoot } from '../phrases/store.js';
import type { SourceRoot } from '../phrases/store.js';
import { requirePositionRoot } from '../positions/store.js';
import type { PositionRoot } from '../positions/store.js';
import { contributingLeaves, matchingGroup, matchingPhrase, phraseTable } from './occurrences.js';
import type { ContributingLeaf, NodeFact } from './occurrences.js';
import { captureMatchOptions, captureMatchRequest, parseMatchRequest } from './options.js';
import type { CapturedMatchOptions, OwnedMatchRequest } from './options.js';
import { offsetTokens, sourceTokens } from './providers.js';
import type { MatchDocument, MatchEvidenceData, MatchEvidenceOptions, MatchRange } from './types.js';

/** Internal composition seam. Only /addons/snippets supplies presentation. */
export interface EvidencePresentation {
  readonly capability: string;
  prepare(context: EvidenceContext, fields: readonly string[]): Generator<WorkStep, PreparedPresentation>;
}
export interface PreparedPresentation {
  project(id: string, ranges: readonly MatchRange[], eligibility: MatchDocument['eligibility']): Generator<WorkStep, Readonly<Record<string, unknown>>>;
}
const charge = (workUnits = 1): WorkStep => ({ workUnits });
type DocumentFact = Extract<Fact, { readonly kind: 'document' }>;
type Provider = { readonly kind: 'source'; readonly root: SourceRoot } | { readonly kind: 'offsets'; readonly root: PositionRoot };

function* rangesFor(id: string, leaves: readonly ContributingLeaf[], fields: readonly string[], providers: ReadonlyMap<string, Provider>, context: EvidenceContext, maximum: number, counter: { value: number }): Generator<WorkStep, readonly MatchRange[]> {
  const ranges: MatchRange[] = [];
  const tables = new Map<ContributingLeaf, readonly number[]>();
  let tokenCount = 0;
  for (const field of fields) {
    yield charge(field.length + 1);
    const active: ContributingLeaf[] = [];
    for (const leaf of leaves) {
      const names = leaf.kind === 'group' ? leaf.group.fields : leaf.fields;
      yield charge(names.length + 1);
      if (names.includes(field)) active.push(leaf);
    }
    if (!active.length) continue;
    const provider = providers.get(field)!;
    const values = provider.kind === 'source' ? yield* sourceTokens(provider.root, id, field, context.limits) : yield* offsetTokens(provider.root, id, field, context.limits);
    for (let valueIndex = 0; valueIndex < values.length; valueIndex++) {
      const tokens = values[valueIndex]!;
      yield charge(); tokenCount += tokens.length;
      if (tokenCount > context.limits.maxTokensPerRecord) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.record.tokens');
      const selected = new Set<number>();
      const mark = (position: number): void => {
        if (selected.has(position)) return;
        selected.add(position); bound(++counter.value, maximum, 'evidence.ranges');
      };
      for (const leaf of active) {
        yield charge();
        if (leaf.kind === 'group') yield* matchingGroup(tokens, leaf.group, mark);
        else {
          let table = tables.get(leaf);
          if (!table) { table = yield* phraseTable(leaf.terms); tables.set(leaf, table); }
          yield* matchingPhrase(tokens, leaf.terms, table, mark);
        }
      }
      // Stored positions and reanalysis are both complete dense basic-v1 values.
      // Visiting this order avoids a full output sort and deduplicates coordinates.
      for (const token of tokens) {
        yield charge();
        if (selected.has(token.position)) ranges.push(Object.freeze({ field, valueIndex, position: token.position, start: token.start, end: token.end, term: token.term }));
      }
    }
  }
  return Object.freeze(ranges);
}

function* project(context: EvidenceContext, finished: EvidenceResultContext, request: OwnedMatchRequest, options: CapturedMatchOptions, providers: ReadonlyMap<string, Provider>, presentation?: PreparedPresentation): Generator<WorkStep, AggregationOutput> {
  if (finished.trace.revision !== context.revision || finished.result.revision !== context.revision || finished.trace.model !== finished.result.model ||
      finished.trace.analyzer.id !== context.analyzer.id || finished.trace.analyzer.environmentProfile !== context.analyzer.environmentProfile) invalid('REVISION_MISMATCH', 'evidence.revision');
  const documents = new Map<string, DocumentFact>(), nodes = new Map<string, Map<string, NodeFact>>();
  for (const fact of finished.trace.facts) {
    yield charge(fact.id.length + 1);
    if (fact.kind === 'document') {
      if (documents.has(fact.id)) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.trace');
      documents.set(fact.id, fact);
    } else if (fact.kind === 'node') {
      let paths = nodes.get(fact.id);
      if (!paths) { paths = new Map<string, NodeFact>(); nodes.set(fact.id, paths); }
      yield charge(fact.path.length + 1);
      if (paths.has(fact.path)) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.trace');
      paths.set(fact.path, fact);
    }
  }
  const output: MatchDocument[] = [], counter = { value: 0 };
  for (const id of request.ids) {
    yield charge(id.length + 1);
    const fact = documents.get(id);
    if (!fact) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.trace');
    const eligibility = !fact.exists ? 'absent' : fact.matched ? 'matched' : 'excluded';
    const leaves = eligibility === 'matched' ? yield* contributingLeaves(finished.query, nodes.get(id) ?? new Map()) : [];
    const ranges = leaves.length ? yield* rangesFor(id, leaves, request.fields, providers, context, request.maxRanges, counter) : Object.freeze([] as MatchRange[]);
    let extra: Record<string, unknown> = Object.create(null) as typeof extra;
    if (presentation) {
      const value = yield* presentation.project(id, ranges, eligibility);
      extra = ownObject(value, 'INCOMPATIBLE_CAPABILITY', 'evidence.presentation', new Admission(options.maxOutputEntries));
      yield charge(Object.keys(extra).length + 1);
      if (has(extra, 'id') || has(extra, 'eligibility') || has(extra, 'ranges')) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.presentation');
    }
    output.push({ id, eligibility, ranges, ...extra });
  }
  const data: MatchEvidenceData = { kind: 'raveldex-match-evidence-v1', revision: context.revision, fields: request.fields,
    scope: 'successful-positive-token-occurrences', complete: true, documents: output };
  return yield* ownInspectorOutput(data, Math.min(options.maxOutputEntries, context.limits.maxAdmissionEntries));
}

function* prepare(context: EvidenceContext, options: CapturedMatchOptions, presentation?: EvidencePresentation): Generator<WorkStep, PreparedEvidence> {
  yield* validatePayload(context.payload, 'INVALID_OPTIONS');
  if (context.analyzer.id !== BASIC_ANALYZER.id || context.analyzer.environmentProfile !== BASIC_ANALYZER.environmentProfile) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.analyzer');
  const request = parseMatchRequest(context.payload, context.limits, options), providers = new Map<string, Provider>();
  for (const field of request.fields) {
    yield charge(field.length + 1);
    if (!has(context.schema.text, field)) invalid('INVALID_OPTIONS', 'evidence.fields');
    if (options.strategies[field] === 'source') providers.set(field, { kind: 'source', root: requireSourceRoot(context.state(`source:${field}`), field, context.revision, context.analyzer) });
    else {
      const root = requirePositionRoot(context.state(`offsets:${field}`), field, context.revision, context.analyzer);
      yield charge(root.offsetFields.length + 1);
      if (!root.offsetFields.includes(field)) invalid('MISSING_CAPABILITY', 'evidence.offsets.field');
      providers.set(field, { kind: 'offsets', root });
    }
  }
  const prepared = presentation ? yield* presentation.prepare(context, request.fields) : undefined;
  if (prepared && typeof prepared.project !== 'function') invalid('INCOMPATIBLE_CAPABILITY', 'evidence.presentation');
  return Object.freeze({ finish: (finished: EvidenceResultContext): Generator<WorkStep, AggregationOutput> => project(context, finished, request, options, providers, prepared) });
}

/** Internal shared builder, with no presentation or host API import. */
export function buildMatchEvidence(input: MatchEvidenceOptions, presentation?: EvidencePresentation): AddonRegistration {
  const capability = presentation?.capability ?? 'match-evidence', options = captureMatchOptions(input, capability);
  const sourceFields = options.fields.filter(field => options.strategies[field] === 'source' || presentation !== undefined);
  const offsetFields = options.fields.filter(field => options.strategies[field] === 'offsets');
  const requires = [...sourceFields.map(field => `source:${field}`), ...offsetFields.map(field => `offsets:${field}`)];
  return Object.freeze({
    manifest: Object.freeze({ id: options.id, version: '0.0.0', contractVersion: 1,
      roles: Object.freeze(['evidence'] as const), provides: Object.freeze([Object.freeze({ id: capability, contractVersion: 1 })]),
      requires: Object.freeze(requires.map(id => Object.freeze({ id, contractVersion: 1 }))),
      dataRequirements: Object.freeze({ fields: options.fields, source: sourceFields.length > 0, positions: offsetFields.length > 0, offsets: offsetFields.length > 0, metadata: false }),
      indexEffect: 'none', rebuildPolicy: 'new-index', execution: Object.freeze({ direct: true, worker: false }),
      limits: Object.freeze({ maxPayloadCodeUnits: DEFAULT_LIMITS.maxQueryCodeUnits, maxWorkUnits: options.maxWorkUnits, maxRetainedEntries: 0, maxOutputEntries: options.maxOutputEntries }),
      costs: Object.freeze({ importedCode: 'Actual positive-path original-token evidence and optional explicit presentation; no scorer, diagnostics, DOM or network.',
        retainedRepresentation: 'No additional root or source retention; per-field source or original-offset providers are explicit.',
        transientWork: 'Selected source analysis or validated stored occurrences, complete bounded range union, actual native facts and owned output; shared operation budget.', externalResources: 'none' }),
    }),
    evidence: Object.freeze({
      capture: (value: unknown, context: PayloadContext) => captureMatchRequest(value, context, options),
      select: (value: unknown): TraceRequest => {
        const request = value as OwnedMatchRequest;
        return Object.freeze({ ids: request.ids, maxFacts: request.maxFacts, ...(request.expectedRevision === undefined ? {} : { expectedRevision: request.expectedRevision }) });
      },
      prepare: (context: EvidenceContext): Generator<WorkStep, PreparedEvidence> => prepare(context, options, presentation),
    }),
  });
}
