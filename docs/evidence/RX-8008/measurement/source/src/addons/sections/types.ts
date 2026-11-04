import type { MatchDocument, MatchEvidenceData, MatchEvidenceOptions, MatchEvidenceRequest } from '../evidence/types.js';
import type { Snippet, SnippetOmissions } from '../snippets/types.js';

export interface PageSection {
  readonly anchor: string;
  readonly heading: string;
  readonly headingLevel: number;
  readonly field: string;
  readonly valueIndex: number;
  readonly start: number;
  readonly end: number;
}
export interface PageSectionPage { readonly pageId: string; readonly sections: readonly PageSection[] }
export interface PageSections {
  readonly kind: 'raveldex-page-sections'; readonly version: 1;
  readonly revision: number; readonly pages: readonly PageSectionPage[];
}
export interface SectionEvidenceOptions extends MatchEvidenceOptions {
  readonly maxCodeUnits?: number;
  readonly maxHighlights?: number;
}
export interface SectionEvidenceRequest extends MatchEvidenceRequest {
  readonly expectedRevision: number;
  readonly sections: readonly { readonly sectionIndex: number; readonly field: string; readonly valueIndex: number; readonly start: number; readonly end: number }[];
  readonly maxPreviews?: number;
}
export interface SectionPreview {
  readonly sectionIndex: number;
  readonly snippet: Snippet | null;
  readonly snippetOmissions: SnippetOmissions;
}
export interface SectionOmissions { readonly omittedSections: number; readonly unmappedRanges: number; readonly boundaryRanges: number }
export interface SectionDocument extends MatchDocument {
  readonly sectionPreviews: readonly SectionPreview[];
  readonly sectionOmissions: SectionOmissions;
}
export interface SectionEvidenceData extends MatchEvidenceData { readonly documents: readonly SectionDocument[] }
