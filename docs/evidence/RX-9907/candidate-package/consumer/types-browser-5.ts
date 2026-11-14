import type { Raveldex } from '@vmitsaras/raveldex';
import { createSectionEvidence } from '@vmitsaras/raveldex/addons/sections';
import type { PageSections, PageSectionPage, PageSection, SectionEvidenceOptions, SectionEvidenceRequest,
  SectionEvidenceData, SectionDocument, SectionPreview, SectionOmissions } from '@vmitsaras/raveldex/addons/sections';
import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';

const section: PageSection = { anchor: '%#café', heading: 'Details', headingLevel: 2,
  field: 'body', valueIndex: 0, start: 0, end: 12 };
const page: PageSectionPage = { pageId: 'guide', sections: [section] };
const maps: PageSections = { kind: 'raveldex-page-sections', version: 1, revision: 1, pages: [page] };
const options: SectionEvidenceOptions = { fields: { body: 'offsets' }, maxCodeUnits: 240, maxHighlights: 32,
  maxFacts: 4096, maxRanges: 4096, maxWorkUnits: 10000000, maxOutputEntries: 16384 };
createSectionEvidence(options);
const request: SectionEvidenceRequest = { ids: ['guide'], expectedRevision: 1,
  sections: [{ sectionIndex: 0, field: 'body', valueIndex: 0, start: 0, end: 12 }], maxPreviews: 3 };
declare const engine: Raveldex;
declare const root: HTMLElement;
mountRaveldexInline({ root, engine, documents: [{ id: 'guide', title: 'Guide', url: '/guide/' }],
  pageSections: maps, maxSectionPreviews: 2 });
void engine.search('source', { extensions: { 'section-evidence': request } });
declare const data: SectionEvidenceData;
const document: SectionDocument | undefined = data.documents[0];
const preview: SectionPreview | undefined = document?.sectionPreviews[0];
const omissions: SectionOmissions | undefined = document?.sectionOmissions;
void preview; void omissions;
// @ts-expect-error A map revision is required.
const unbound: PageSections = { kind: 'raveldex-page-sections', version: 1, pages: [] };
// @ts-expect-error Explicit expected owner revision is required.
const unstamped: SectionEvidenceRequest = { ids: ['guide'], sections: [] };
// @ts-expect-error Metadata is readonly.
section.anchor = 'changed';
// @ts-expect-error Preview count belongs to requests and UI, not factory options.
createSectionEvidence({ fields: { body: 'source' }, maxPreviews: 1 });
// @ts-expect-error Optional factory is not a core export.
import { createSectionEvidence as coreSections } from '@vmitsaras/raveldex';
void unbound; void unstamped; void coreSections;
