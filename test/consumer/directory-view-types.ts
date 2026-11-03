import { mountRaveldexDirectory } from '@vmitsaras/raveldex/addons/ui/directory/view';
import type { DirectoryViewMessages } from '@vmitsaras/raveldex/addons/ui/directory/view';
import type { DirectoryHandle } from '@vmitsaras/raveldex/addons/ui/directory';
declare const controller: DirectoryHandle;
const view = mountRaveldexDirectory({ root: document.body, controller, documents: [], groups: [], filtersOpen: false, messages: { clear: 'Reset' } });
void view.search('word'); void view.search(); void view.clear(); view.destroy();
// @ts-expect-error an explicit DOM root is required
mountRaveldexDirectory({ controller, documents: [], groups: [] });
// @ts-expect-error controls borrow the directory, not the engine
mountRaveldexDirectory({ root: document.body, engine: {}, documents: [], groups: [] });
// @ts-expect-error strings are captured message templates
const wrong: Partial<DirectoryViewMessages> = { next: 4 };
void wrong;
