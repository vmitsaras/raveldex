import type { MatchDocument, MatchEvidenceData, MatchEvidenceOptions, MatchEvidenceRequest } from '../evidence/types.js';

export interface SnippetOptions extends MatchEvidenceOptions {
  /** Per document, at most three windows. */
  readonly maxSnippets?: number;
  /** Original UTF-16 units per window, at most 240. */
  readonly maxCodeUnits?: number;
  /** Merged grapheme-safe highlights per window, at most 32. */
  readonly maxHighlights?: number;
}
export type SnippetEvidenceRequest = MatchEvidenceRequest;
export interface SnippetHighlight {
  /** Half-open offsets relative to the exact returned text. */
  readonly start: number;
  readonly end: number;
}
export interface Snippet {
  readonly field: string;
  readonly valueIndex: number;
  /** Half-open original UTF-16 value coordinates, at grapheme boundaries. */
  readonly start: number;
  readonly end: number;
  /** Exact original slice. It is ordinary text, never trusted HTML. */
  readonly text: string;
  /** Grapheme-expanded unions. Exact token occurrences remain in ranges. */
  readonly highlights: readonly SnippetHighlight[];
  readonly omittedBefore: boolean;
  readonly omittedAfter: boolean;
}
export interface SnippetOmissions {
  /** Canonical original ranges not fully represented by any returned mark. */
  readonly unshownMatches: number;
  /** An additional window would be needed after reaching the window cap. */
  readonly windowLimit: boolean;
  /** A returned window contains a match omitted by its highlight cap. */
  readonly highlightLimit: boolean;
  /** Original token spans individually exceed the window cap. */
  readonly matchTooLong: number;
  /** Other enclosing grapheme spans exceed the window cap. */
  readonly graphemeTooLong: number;
}
export interface SnippetDocument extends MatchDocument {
  readonly snippets: readonly Snippet[];
  readonly snippetOmissions: SnippetOmissions;
}
export interface SnippetEvidenceData extends MatchEvidenceData {
  readonly documents: readonly SnippetDocument[];
}
