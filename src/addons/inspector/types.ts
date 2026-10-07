import type { CapabilityManifest } from '../../core/capabilities/types.js';
import type { AnalyzerDescriptor, OwnedSchema } from '../../core/contracts/types.js';
import type { Limits, StateCounts } from '../../core/limits/limits.js';
import type { ScoreTrace } from '../../core/trace/facts.js';

export interface InspectorOptions {
  readonly id?: string;
  /** Enables provider requirements; each request still selects source explicitly. */
  readonly sourceFields?: readonly string[];
  readonly maxFacts?: number;
  readonly maxWorkUnits?: number;
  readonly maxOutputEntries?: number;
}
export interface InspectorRequest {
  readonly ids: readonly string[];
  readonly maxFacts?: number;
  readonly expectedRevision?: number;
  readonly sourceFields?: readonly string[];
}
export type InspectorSource =
  | { readonly status: 'not-requested' }
  | { readonly status: 'unavailable'; readonly reason: 'record-absent' }
  | { readonly status: 'available'; readonly fields: Readonly<Record<string,
      { readonly status: 'available'; readonly values: readonly string[] } | { readonly status: 'absent' }>> };
export interface InspectorDocument {
  readonly id: string;
  readonly exists: boolean;
  readonly eligibility: 'matched' | 'excluded' | 'absent';
  readonly score: number | null;
  readonly groups: readonly string[];
  readonly page: { readonly placement: 'returned' | 'outside-page' | 'excluded' | 'absent'; readonly index: number | null };
  /** Only selected records are traced; full-ranking positions are not collected. */
  readonly absoluteRank: { readonly status: 'unavailable'; readonly reason: 'not-collected' };
  readonly source: InspectorSource;
}
export interface InspectorConfiguration {
  readonly schema: OwnedSchema;
  readonly limits: Limits;
  readonly analyzer: AnalyzerDescriptor;
  readonly capabilities: readonly Pick<CapabilityManifest, 'id' | 'version' | 'contractVersion' | 'roles' | 'provides' | 'requires'>[];
}
export interface InspectorResources {
  readonly outcome: 'complete';
  readonly unit: 'work-v1';
  /** Includes search, fact collection and evidence preparation; excludes output projection. */
  readonly searchWorkUnits: number;
  readonly maxSearchWorkUnits: number;
  readonly scope: 'before-evidence-projection';
  readonly counts: StateCounts;
  readonly heapBytes: { readonly status: 'unavailable'; readonly reason: 'not-measured' };
}
export interface InspectorData {
  readonly kind: 'raveldex-inspector-v1';
  readonly revision: number;
  readonly model: 'raveldex-bm25-v1';
  readonly configuration: InspectorConfiguration;
  readonly query: {
    readonly traceScope: 'selected-documents';
    readonly alternativeScope: 'selected-best-per-group-and-field';
    readonly fullAlternatives: { readonly status: 'unavailable'; readonly reason: 'not-collected' };
  };
  readonly trace: ScoreTrace;
  readonly documents: readonly InspectorDocument[];
  readonly result: { readonly total: number; readonly returned: number };
  readonly resources: InspectorResources;
  readonly numericalTolerance: { readonly absolute: 1e-12; readonly relative: 1e-12 };
}
export interface DiagnosticOptions {
  readonly maxCodeUnits?: number;
  /** Includes IDs, canonical query and the complete selected facts. */
  readonly includeFacts?: boolean;
  /** Includes only source already explicitly selected in the explain request. */
  readonly includeSource?: boolean;
}
export interface DiagnosticExport {
  readonly json: string;
  readonly complete: boolean;
  readonly omitted: readonly ('facts' | 'source')[];
}
