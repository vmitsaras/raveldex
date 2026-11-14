import type { Raveldex } from '@vmitsaras/raveldex';
import { mountRaveldexDropdown } from '@vmitsaras/raveldex/addons/ui/dropdown';
import type { DropdownUIHandle, DropdownUIOptions, DropdownUIMessages, UIDocument } from '@vmitsaras/raveldex/addons/ui/dropdown';

declare const root: HTMLElement;
declare const engine: Raveldex;
const documents: readonly UIDocument[] = [{ id: 'guide', title: 'A guide', url: '/guide/' }];
const messages: Partial<DropdownUIMessages> = { label: 'Find a guide', fullResults: 'Search every guide', closed: 'Search closed.' };
const options: DropdownUIOptions = { root, engine, documents, fullResults: { url: '/search/?mode=prefix#results', queryParameter: 'query' },
  maxResults: 5, debounceMs: 150, mode: 'prefix', shortcut: false, messages };
const handle: DropdownUIHandle = mountRaveldexDropdown(options);
const first: Promise<void> = handle.search();
const supplied: Promise<void> = handle.search('source prov');
const opened: void = handle.open();
const closed: void = handle.close();
const cleared: void = handle.clear();
const destroyed: void = handle.destroy();
mountRaveldexDropdown({ root, engine, documents, fullResults: { url: '/search/?mode=text' }, mode: 'text', shortcut: true });
void first; void supplied; void opened; void closed; void cleared; void destroyed;
// @ts-expect-error The full-results route is explicit and required.
mountRaveldexDropdown({ root, engine, documents });
// @ts-expect-error A real DOM root is required.
mountRaveldexDropdown({ root: {}, engine, documents, fullResults: { url: '/search/' } });
// @ts-expect-error Handoff configuration contains a URL, not a navigation callback.
mountRaveldexDropdown({ root, engine, documents, fullResults: () => '/search/' });
// @ts-expect-error No implicit snippets or facets are installed by this core-only preset.
mountRaveldexDropdown({ root, engine, documents, fullResults: { url: '/search/' }, snippetFields: ['body'] });
// @ts-expect-error The preset has exact-text or final-word-prefix modes.
mountRaveldexDropdown({ root, engine, documents, fullResults: { url: '/search/' }, mode: 'phrase' });
// @ts-expect-error Message overrides are finite plain text, never callbacks.
mountRaveldexDropdown({ root, engine, documents, fullResults: { url: '/search/' }, messages: { label: () => 'Find' } });
// @ts-expect-error Unknown message keys are rejected.
mountRaveldexDropdown({ root, engine, documents, fullResults: { url: '/search/' }, messages: { foreign: 'Other' } });
// @ts-expect-error Search accepts single-line text, not a native query object.
handle.search({ kind: 'all' });
// @ts-expect-error Handles are readonly.
handle.close = () => {};
// @ts-expect-error Full-results configuration is readonly.
options.fullResults.url = '/other/';
// @ts-expect-error The optional DOM preset is not exported from core.
import { mountRaveldexDropdown as coreDropdown } from '@vmitsaras/raveldex';
void coreDropdown;
