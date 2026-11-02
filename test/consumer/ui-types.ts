import type { Raveldex } from '@vmitsaras/raveldex';
import { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';

declare const root: HTMLElement;
declare const engine: Raveldex;
const documents = [{ id: 'a', title: 'A document', url: '/docs/a' }] as const;
const handle = mountRaveldexUI({ root, engine, documents,
  facets: [{ field: 'category', label: 'Category' }] as const,
  snippetFields: ['title', 'body'] as const, pageSize: 5, debounceMs: 150, mode: 'text', label: 'Search documentation' });
const pending: Promise<void> = handle.search();
const stopped: void = handle.destroy();
mountRaveldexUI({ root, engine, documents, mode: 'prefix' });
void pending; void stopped;
// @ts-expect-error Returned methods are readonly.
handle.destroy = () => {};
// @ts-expect-error Mode is an explicit supported choice.
mountRaveldexUI({ root, engine, documents, mode: 'foreign-engine' });
// @ts-expect-error An actual native element is required.
mountRaveldexUI({ root: {}, engine, documents });
// @ts-expect-error DOM mounting is not a core export.
import { mountRaveldexUI as coreUI } from '@vmitsaras/raveldex';
void coreUI;
