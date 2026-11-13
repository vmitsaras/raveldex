import type { Raveldex } from '@vmitsaras/raveldex';
import { mountRaveldexModal } from '@vmitsaras/raveldex/addons/ui/modal';
import type { ModalUIOptions, ModalUIHandle, ModalUIMessages } from '@vmitsaras/raveldex/addons/ui/modal';
import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';
import type { PageSections } from '@vmitsaras/raveldex/addons/sections';

declare const root: HTMLElement;
declare const trigger: HTMLButtonElement;
declare const engine: Raveldex;
declare const pageSections: PageSections;
const messages: ModalUIMessages = { title: 'Find documentation', close: 'Close search', escapeHint: 'Esc to close', shortcutHint: 'Ctrl/⌘ K' };
const options: ModalUIOptions = { root, trigger, engine,
  documents: [{ id: 'guide', title: 'Guide', url: '/guide/' }], pageSections, maxSectionPreviews: 2,
  resetOnClose: false, shortcut: true, keyboardHints: true, modalMessages: messages,
  messages: { label: 'Search guides', sectionCaption: 'Matching text' }, pageSize: 5, maxRenderedResults: 100 };
const handle: ModalUIHandle = mountRaveldexModal(options);
const opened: void = handle.open();
const query: Promise<void> = handle.search('source prov');
const closed: void = handle.close();
const clear: void = handle.clear();
const destroy: void = handle.destroy();
mountRaveldexModal({ root, trigger, engine, documents: [], modalMessages: { title: 'Find' }, keyboardHints: false });
void opened; void query; void closed; void clear; void destroy;
// @ts-expect-error Existing accessible native button is required.
mountRaveldexModal({ root, engine, documents: [] });
// @ts-expect-error A generic element is not a native trigger button.
mountRaveldexModal({ root, trigger: root, engine, documents: [] });
// @ts-expect-error Shortcut selection is an explicit boolean, not arbitrary global key wiring.
mountRaveldexModal({ root, trigger, engine, documents: [], shortcut: 'Ctrl+K' });
// @ts-expect-error The modal borrows its engine and does not accept loader callbacks.
mountRaveldexModal({ root, trigger, engine, documents: [], load: async () => engine });
// @ts-expect-error Modal handle is immutable.
handle.close = () => {};
// @ts-expect-error Search takes raw text, not arbitrary native queries.
handle.search({ kind: 'all' });
// @ts-expect-error Trigger is not a public inline option.
mountRaveldexInline({ root, trigger, engine, documents: [] });
// @ts-expect-error Modal UI is not re-exported by core.
import { mountRaveldexModal as coreModal } from '@vmitsaras/raveldex';
void coreModal;
