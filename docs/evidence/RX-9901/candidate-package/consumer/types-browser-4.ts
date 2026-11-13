import type { Raveldex } from '@vmitsaras/raveldex';
import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';
import type { InlineUIOptions, InlineUIHandle, InlineUIMessages, UIDocument, UIFacet } from '@vmitsaras/raveldex/addons/ui/inline';

declare const root: HTMLElement;
declare const engine: Raveldex;
const documents: readonly UIDocument[] = [{ id: 'guide', title: 'A guide', url: '/guides/a/' }];
const messages: Partial<InlineUIMessages> = { label: 'Find a guide', noResults: 'No matching guides.' };
// A complete original RX-6001 bundle remains valid after optional messages grow.
const originalBundle: InlineUIMessages = { label: 'Find', placeholder: 'Search', submit: 'Go', clear: 'Clear', idle: 'Enter text.',
  searching: 'Searching.', noResults: 'No matches.', resultsLabel: 'Matches', resultsOne: '{total} match; {count} shown.',
  resultsMany: '{total} matches; {count} shown.', error: 'Failed ({code}).', retry: 'Try again' };
mountRaveldexInline({ root, engine, documents, messages: originalBundle });
const options: InlineUIOptions = { root, engine, documents, pageSize: 5, debounceMs: 150, mode: 'prefix', messages };
const handle: InlineUIHandle = mountRaveldexInline(options);
const current: Promise<void> = handle.search();
const supplied: Promise<void> = handle.search('source prov');
const cleared: void = handle.clear();
const destroyed: void = handle.destroy();
mountRaveldexInline({ root, engine, documents, mode: 'text' });
const facets: readonly UIFacet[] = [{ field: 'category', label: 'Category' }];
mountRaveldexInline({ root, engine, documents, facets, snippetFields: ['body'], maxRenderedResults: 100,
  messages: { loadMore: 'More results', pageSummary: '{start}–{end} of {total}', composing: 'Finish entering text.' } });
void current; void supplied; void cleared; void destroyed;
// @ts-expect-error Inline search accepts text, not an arbitrary query object.
handle.search({ kind: 'all' });
// @ts-expect-error Handles are readonly.
handle.clear = () => {};
// @ts-expect-error A real DOM root is required.
mountRaveldexInline({ root: {}, engine, documents });
// @ts-expect-error Phrase behavior is outside the foundation preset.
mountRaveldexInline({ root, engine, documents, mode: 'phrase' });
// @ts-expect-error Facets need both an explicit field and accessible label.
mountRaveldexInline({ root, engine, documents, facets: [{ field: 'category' }] });
// @ts-expect-error Message overrides are strings, never callbacks.
mountRaveldexInline({ root, engine, documents, messages: { noResults: () => 'No matches' } });
// @ts-expect-error Undocumented message keys are rejected.
mountRaveldexInline({ root, engine, documents, messages: { foreign: 'Unsupported' } });
// @ts-expect-error The optional DOM preset is not exported from core.
import { mountRaveldexInline as coreInline } from '@vmitsaras/raveldex';
void coreInline;
