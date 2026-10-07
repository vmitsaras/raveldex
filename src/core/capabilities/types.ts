import type { Admission } from '../contracts/data.js';
import type { AnalyzerDescriptor, OwnedConfiguration, OwnedRecord, OwnedSchema } from '../contracts/types.js';
import type { Limits } from '../limits/limits.js';
import type { WorkStep } from '../index/directory.js';

export interface CapabilityReference { readonly id: string; readonly contractVersion: number }
export interface CapabilityManifest {
  readonly id: string; readonly version: string; readonly contractVersion: number;
  readonly roles: readonly ('leaf-refinement' | 'transaction-participant')[];
  readonly provides: readonly CapabilityReference[]; readonly requires: readonly CapabilityReference[];
  readonly dataRequirements: { readonly fields: readonly string[]; readonly source: boolean; readonly positions: boolean; readonly offsets: boolean; readonly metadata: boolean };
  readonly indexEffect: 'none' | 'transactional'; readonly rebuildPolicy: 'new-index';
  readonly execution: { readonly direct: boolean; readonly worker: boolean; readonly workerRegistration?: string };
  readonly limits: { readonly maxPayloadCodeUnits: number; readonly maxWorkUnits: number; readonly maxRetainedEntries: number; readonly maxOutputEntries: number };
  readonly costs: { readonly importedCode: string; readonly retainedRepresentation: string; readonly transientWork: string; readonly externalResources: 'none' };
  readonly codec?: { readonly id: string; readonly version: number };
}
export interface ParticipantContext {
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
export interface AddonRegistration {
  readonly manifest: CapabilityManifest;
  readonly participant?: ParticipantImplementation;
  readonly refinement?: RefinementImplementation;
}
export interface CapturedRegistration extends AddonRegistration { readonly manifest: CapabilityManifest }
export interface CapabilitySet {
  readonly ordered: readonly CapturedRegistration[];
  readonly providers: Readonly<Record<string, CapturedRegistration>>;
}
export interface RegistrationContext { readonly schema: OwnedSchema; readonly limits: Limits; readonly admission: Admission }
