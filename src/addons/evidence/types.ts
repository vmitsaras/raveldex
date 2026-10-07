/** Providers are explicit per field; offsets do not imply retained display text. */
export interface MatchEvidenceOptions {
  readonly fields: Readonly<Record<string, 'source' | 'offsets'>>;
  readonly id?: string;
  readonly maxFacts?: number;
  readonly maxRanges?: number;
  readonly maxWorkUnits?: number;
  readonly maxOutputEntries?: number;
}
export interface MatchEvidenceRequest {
  readonly ids: readonly string[];
  readonly fields?: readonly string[];
  readonly expectedRevision?: number;
  readonly maxFacts?: number;
  readonly maxRanges?: number;
}
/** Half-open original UTF-16 coordinates, local to the identified original value.
 * term is normalized; it is never used as a substitute for display source. */
export interface MatchRange {
  readonly field: string;
  readonly valueIndex: number;
  readonly position: number;
  readonly start: number;
  readonly end: number;
  readonly term: string;
}
export interface MatchDocument {
  readonly id: string;
  readonly eligibility: 'matched' | 'excluded' | 'absent';
  readonly ranges: readonly MatchRange[];
}
export interface MatchEvidenceData {
  readonly kind: 'raveldex-match-evidence-v1';
  readonly revision: number;
  readonly fields: readonly string[];
  readonly scope: 'successful-positive-token-occurrences';
  readonly complete: true;
  readonly documents: readonly MatchDocument[];
}
