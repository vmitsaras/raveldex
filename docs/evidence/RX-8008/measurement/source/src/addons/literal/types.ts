export interface LiteralOptions {
  readonly fields: readonly string[];
  readonly id?: string;
  readonly maxWorkUnits?: number;
  readonly maxRanges?: number;
  readonly maxOutputEntries?: number;
}
export interface LiteralPayload { readonly text: string; readonly fields?: readonly string[] }
export interface LiteralEvidenceRequest {
  readonly ids: readonly string[];
  readonly maxRanges?: number;
  readonly expectedRevision?: number;
  readonly maxFacts?: number;
}
export interface LiteralRange { readonly leaf: string; readonly field: string; readonly valueIndex: number; readonly start: number; readonly end: number }
export interface LiteralLeaf { readonly path: string; readonly text: string; readonly fields: readonly string[] }
export interface LiteralDocument { readonly id: string; readonly eligibility: 'matched' | 'excluded' | 'absent'; readonly ranges: readonly LiteralRange[] }
export interface LiteralEvidenceData {
  readonly kind: 'raveldex-literal-evidence-v1'; readonly policy: 'raw-substring-v1'; readonly revision: number;
  readonly scope: 'successful-positive-literal-occurrences'; readonly complete: true;
  readonly leaves: readonly LiteralLeaf[]; readonly documents: readonly LiteralDocument[];
}
