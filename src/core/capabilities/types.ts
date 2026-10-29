import type { Admission } from '../contracts/data.js';
import type { AnalyzerDescriptor, OwnedConfiguration, OwnedRecord, OwnedSchema } from '../contracts/types.js';
import type { Limits } from '../limits/limits.js';
import type { WorkStep } from '../index/directory.js';
import type { StateCounts } from '../limits/limits.js';
import type { ScoreTrace, TraceRequest } from '../trace/facts.js';
import type { SearchResult } from '../contracts/types.js';
import type { CompiledNode } from '../query/compile.js';
import type { AnalysisMode, AnalysisRunner } from '../analyzer/selected.js';
import type { AnalysisStep } from '../analyzer/basic.js';
import type { ErrorCode } from '../errors/error.js';

export interface CapabilityReference { readonly id: string; readonly contractVersion: number }
export interface CapabilityManifest {
  readonly id: string; readonly version: string; readonly contractVersion: number;
  readonly roles: readonly ('leaf-refinement' | 'transaction-participant' | 'aggregation' | 'evidence' | 'term-expansion' | 'dictionary-output' | 'analyzer')[];
  readonly provides: readonly CapabilityReference[]; readonly requires: readonly CapabilityReference[];
  readonly dataRequirements: { readonly fields: readonly string[]; readonly source: boolean; readonly positions: boolean; readonly offsets: boolean; readonly metadata: boolean };
  readonly indexEffect: 'none' | 'transactional' | 'analysis'; readonly rebuildPolicy: 'new-index';
  readonly execution: { readonly direct: boolean; readonly worker: boolean; readonly workerRegistration?: string };
  readonly limits: { readonly maxPayloadCodeUnits: number; readonly maxWorkUnits: number; readonly maxRetainedEntries: number; readonly maxOutputEntries: number };
  readonly costs: { readonly importedCode: string; readonly retainedRepresentation: string; readonly transientWork: string; readonly externalResources: 'none' };
  readonly codec?: { readonly id: string; readonly version: number };
}
export interface ParticipantContext {
  readonly analyze?: AnalysisRunner;
  readonly kind: 'add' | 'addMany' | 'replace' | 'remove' | 'clear';
  readonly previousRevision: number; readonly revision: number;
  readonly analyzer: AnalyzerDescriptor;
  readonly records: readonly OwnedRecord[]; readonly removedIds: readonly string[];
}
export interface ParticipantImplementation {
  initialize(configuration: OwnedConfiguration): unknown;
  prepare(previous: unknown, context: ParticipantContext): Generator<WorkStep, unknown>;
}
export interface RefinementContext {
  readonly analyze?: AnalysisRunner;
  readonly revision: number; readonly analyzer: AnalyzerDescriptor; readonly limits: Limits;
  readonly fields: readonly string[]; readonly terms: readonly string[];
  /** Only declared requirements can be read; no core root or mutable owner. */
  state(capability: string): unknown;
}
export interface PreparedRefinement { test(id: string): Generator<WorkStep, boolean> }
/** Protocol v1's implemented leaf role refines an exact token-sequence superset.
 * Payload is exactly { text, fields? }; core owns and analyzes it once. */
export interface RefinementImplementation {
  readonly kind: 'exact-token-sequence'; readonly maxTokens: number;
  prepare(context: RefinementContext): Generator<WorkStep, PreparedRefinement>;
}
export interface ExpansionAlternative { readonly term: string; readonly weight: number }
export interface DictionaryStep extends WorkStep { readonly term: string }
/** Only live normalized dictionary terms at the selected operation revision. */
export interface ExpansionContext {
  readonly revision: number; readonly analyzer: AnalyzerDescriptor; readonly limits: Limits;
  readonly fields: readonly string[]; readonly term: string; readonly exact: boolean;
  dictionary(): Generator<DictionaryStep, void>;
}
export interface ExpansionImplementation {
  readonly kind: 'weighted-token-alternatives'; readonly maxTokens: number; readonly policy: string;
  expand(context: ExpansionContext): Generator<WorkStep, readonly ExpansionAlternative[]>;
}
/** Metadata roles see only an owned payload, immutable schema and one revision.
 * No source, scorer, mutable owner or core root is exposed. */
export interface MetadataContext {
  readonly revision: number; readonly schema: OwnedSchema; readonly limits: Limits;
  readonly capability: string; readonly payload: unknown;
}
/** Trusted handlers capture bounded immutable payloads during admission. */
export interface PayloadContext { readonly admission: Admission; readonly limits: Limits; readonly maxCodeUnits: number }
export interface CapturedPayload { readonly value: unknown; readonly codeUnits: number }
export interface AggregationOutput { readonly value: unknown; readonly entries: number }
export interface DictionaryEntryStep extends DictionaryStep {
  readonly field: string; readonly documentFrequency: number;
}
/** Independent output over declared live text dictionaries, never query membership. */
export interface DictionaryContext extends MetadataContext {
  readonly analyzer: AnalyzerDescriptor;
  dictionary(fields: readonly string[]): Generator<DictionaryEntryStep, void>;
}
export interface PreparedDictionaryOutput {
  finish(): Generator<WorkStep, AggregationOutput>;
}
export interface DictionaryImplementation {
  capture(input: unknown, context: PayloadContext): CapturedPayload;
  prepare(context: DictionaryContext): Generator<WorkStep, PreparedDictionaryOutput>;
}
export interface PreparedPredicate { test(metadata: OwnedRecord['metadata']): Generator<WorkStep, boolean> }
export interface PredicateImplementation {
  capture(input: unknown, context: PayloadContext): CapturedPayload;
  prepare(context: MetadataContext): Generator<WorkStep, PreparedPredicate>;
}
/** Source predicates scan declared immutable originals without lexical candidates
 * or score groups. Source access remains explicit and revision-bound. */
export interface SourcePredicateContext extends MetadataContext {
  readonly analyzer: AnalyzerDescriptor;
  state(capability: string): unknown;
}
export interface PreparedSourcePredicate { test(id: string): Generator<WorkStep, boolean> }
export interface SourcePredicateImplementation {
  readonly kind: 'source-substring';
  capture(input: unknown, context: PayloadContext): CapturedPayload;
  prepare(context: SourcePredicateContext): Generator<WorkStep, PreparedSourcePredicate>;
}
export interface PreparedAggregation {
  add(metadata: OwnedRecord['metadata']): Generator<WorkStep, void>;
  finish(): Generator<WorkStep, AggregationOutput>;
}
export interface AggregationImplementation {
  readonly fieldType: 'string';
  capture(input: unknown, context: PayloadContext): CapturedPayload;
  prepare(context: MetadataContext): Generator<WorkStep, PreparedAggregation>;
}
/** Opt-in factual evidence receives actual decisions, never a core root/scorer. */
export interface EvidenceContext extends MetadataContext {
  readonly analyze?: AnalysisRunner;
  readonly analyzer: AnalyzerDescriptor;
  state(capability: string): unknown;
}
export interface EvidenceResultContext {
  /** Immutable analyzed query; actual trace paths establish contributing branches. */
  readonly query: CompiledNode;
  readonly trace: ScoreTrace; readonly result: SearchResult;
  readonly counts: StateCounts; readonly searchWorkUnits: number;
  readonly maxSearchWorkUnits: number; readonly capabilities: readonly CapabilityManifest[];
}
export interface PreparedEvidence {
  finish(context: EvidenceResultContext): Generator<WorkStep, AggregationOutput>;
}
export interface EvidenceImplementation {
  capture(input: unknown, context: PayloadContext): CapturedPayload;
  select(payload: unknown): TraceRequest;
  prepare(context: EvidenceContext): Generator<WorkStep, PreparedEvidence>;
}
export interface AddonRegistration {
  readonly manifest: CapabilityManifest;
  readonly participant?: ParticipantImplementation;
  readonly refinement?: RefinementImplementation;
  readonly expansion?: ExpansionImplementation;
  readonly dictionary?: DictionaryImplementation;
  readonly analyzer?: AnalyzerImplementation;
  readonly predicate?: PredicateImplementation;
  readonly sourcePredicate?: SourcePredicateImplementation;
  readonly aggregation?: AggregationImplementation;
  readonly evidence?: EvidenceImplementation;
}
/** Original/component tokenizer is separate from the v1 language transform.
 * Query/phrase analysis emits originals only; index/evidence can retain components. */
export type AnalyzerImplementation = {
  readonly kind: 'single-token-transform'; readonly id: string;
  transform(term: string): Generator<WorkStep, string>;
} | {
  readonly kind: 'identifier-tokenizer'; readonly id: string;
  analyze(value: string, valueIndex: number, limits: Limits, code: ErrorCode, mode: AnalysisMode): Generator<AnalysisStep>;
};
export interface CapturedRegistration extends AddonRegistration { readonly manifest: CapabilityManifest }
export interface CapabilitySet {
  readonly ordered: readonly CapturedRegistration[];
  readonly providers: Readonly<Record<string, CapturedRegistration>>;
}
export interface RegistrationContext { readonly schema: OwnedSchema; readonly limits: Limits; readonly admission: Admission }
