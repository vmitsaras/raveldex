import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
import { createFilters } from '@vmitsaras/raveldex/addons/filters';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';
import { mountRaveldexModal } from '@vmitsaras/raveldex/addons/ui/modal';
import { mountRaveldexDropdown } from '@vmitsaras/raveldex/addons/ui/dropdown';
import { createDirectory } from '@vmitsaras/raveldex/addons/ui/directory';
import { mountRaveldexDirectory } from '@vmitsaras/raveldex/addons/ui/directory/view';
import { mountRaveldexDirectoryCards } from '@vmitsaras/raveldex/addons/ui/directory/cards';
import { german } from './messages.mjs';

const surface = location.pathname.split('/')[1], isDirectory = ['directory', 'cards'].includes(surface);
const root = document.getElementById('root'), trigger = document.getElementById('trigger'), original = [...root.childNodes];
const rows = [
  { id: 'a', text: { body: 'gemeinsam alpha' }, metadata: { kind: 'guide' } },
  { id: 'b', text: { body: 'gemeinsam beta' }, metadata: { kind: 'manual' } },
  { id: 'c', text: { body: 'einzeln gamma' }, metadata: { kind: 'guide' } },
];
const engine = createRaveldex({ schema: { text: { body: {} }, metadata: { kind: { type: 'string' } } },
  addons: [createFilters({ fields: ['kind'] }), createFacets({ fields: ['kind'] })] });
await engine.addMany(rows);
const state = { calls: [], borrowedDisposals: 0, failNext: false, holdNext: false, releases: [] };
const borrowed = { ...engine, async search(query, options) {
  const call = { query, complete: false }; state.calls.push(call);
  if (state.failNext) { state.failNext = false; throw new RaveldexError('WORK_LIMIT_EXCEEDED'); }
  const held = state.holdNext; state.holdNext = false;
  const { signal, ...rest } = options;
  const result = await engine.search(query, held ? rest : options); void signal;
  call.total = result.total;
  if (held) await new Promise(resolve => state.releases.push(resolve));
  call.complete = true; return result;
}, dispose() { state.borrowedDisposals++; return engine.dispose(); } };
const controller = isDirectory ? createDirectory({ engine: borrowed, groups: [{ field: 'kind', values: ['guide', 'manual', 'absent'] }], pageSize: 2 }) : undefined;
const rtlText = 'إرشادات البحث واختيار النتائج والعودة إلى عناصر التحكم بأمان. '.repeat(3).trim();
function bundle(locale) {
  const copy = structuredClone(german);
  if (locale === 'ar') {
    // Deliberately long RTL stress strings, not a reviewed Arabic translation.
    for (const name of ['inline', 'inlineWithFilters', 'modal', 'dropdown', 'directory'])
      for (const key of Object.keys(copy[name])) copy[name][key] = rtlText + ' ' + (copy[name][key].match(/\{[A-Za-z]+\}/g) ?? []).join(' ');
    copy.imageUnavailable = rtlText;
  }
  return copy;
}
let view, current, options;
const input = () => root.querySelector('input[type=search],input[role=combobox]');
function mount(locale = 'de', patch = {}) {
  if (surface === 'modal') view?.close(); view?.destroy();
  current = bundle(locale); document.documentElement.lang = locale; document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  root.lang = locale; trigger.textContent = locale === 'ar' ? rtlText : 'Dokumentation durchsuchen';
  const documents = rows.map(row => ({ id: row.id, title: locale === 'ar' ? 'دليل ' + row.id : 'Ressource ' + row.id, url: '/resource/' + row.id + '/' }));
  const labels = [{ field: 'kind', label: locale === 'ar' ? 'النوع' : 'Typ', values: [{ value: 'guide', label: locale === 'ar' ? 'دليل' : 'Leitfaden' }, { value: 'manual', label: locale === 'ar' ? 'كتيب' : 'Handbuch' }, { value: 'absent', label: locale === 'ar' ? 'غير متاح' : 'Nicht vorhanden' }] }];
  const common = { root, engine: borrowed, documents, pageSize: 2, maxRenderedResults: 4, debounceMs: 0,
    facets: [{ field: 'kind', label: labels[0].label }], messages: current.inlineWithFilters };
  if (surface === 'inline' || surface === 'modal') {
    options = { ...common, ...(surface === 'modal' ? { trigger, modalMessages: current.modal, shortcut: true } : {}), ...patch };
    view = surface === 'inline' ? mountRaveldexInline(options) : mountRaveldexModal(options);
    if (surface === 'modal') { trigger.focus(); view.open(); }
  } else if (surface === 'dropdown') {
    options = { root, engine: borrowed, documents, debounceMs: 0, maxResults: 2, fullResults: { url: '/full/' }, messages: current.dropdown, ...patch };
    view = mountRaveldexDropdown(options);
  } else {
    options = { root, controller, documents, groups: labels, filtersOpen: true, messages: current.directory, ...patch };
    if (surface === 'cards') options = { ...options, documents: documents.map(d => ({ ...d, excerpt: locale === 'ar' ? 'وصف المورد' : 'Beschreibung', date: '7. November 2026', image: { src: '/broken.png', alt: locale === 'ar' ? 'صورة المورد' : 'Bild der Ressource', width: 480, height: 320 } })), imageUnavailable: current.imageUnavailable };
    view = surface === 'directory' ? mountRaveldexDirectory(options) : mountRaveldexDirectoryCards(options);
  }
}
const release = () => { for (const resolve of state.releases.splice(0)) resolve(); };
window.localized = {
  surface, root, trigger, state, controller, engine, input, messages: () => current, view: () => view,
  remount(locale, patch = {}) { mount(locale, patch); },
  // The application chooses this focus handoff; the library has no language setter.
  switchWithFocus(locale) { mount(locale); input().focus({ preventScroll: true }); },
  duplicate(messages) {
    const constructors = { inline: mountRaveldexInline, modal: mountRaveldexModal, dropdown: mountRaveldexDropdown, directory: mountRaveldexDirectory, cards: mountRaveldexDirectoryCards };
    return constructors[surface]({ ...options, messages }) === view;
  },
  mutateMessages() { for (const name of ['inline', 'inlineWithFilters', 'modal', 'dropdown', 'directory']) for (const key of Object.keys(current[name])) current[name][key] = 'MUTATED'; },
  hold() { state.holdNext = true; }, fail() { state.failNext = true; }, release,
  async cleanup() { view.destroy(); controller?.destroy(); release(); const restored = original.length === root.childNodes.length && original.every((node, index) => root.childNodes[index] === node); await engine.dispose(); return { restored, borrowedDisposals: state.borrowedDisposals }; },
};
mount(); window.localizedReady = true;
