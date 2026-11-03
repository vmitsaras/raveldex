import { Admission, ownArray } from '../../core/contracts/data.js';
import { directoryConfigurations, failDirectory, integer, object, text } from './directory-state.js';
import type { CapturedDirectory } from './directory-state.js';
import type { DirectoryViewMessages, DirectoryViewOptions } from './directory-view-types.js';
import type { UIDocument } from './types.js';

const defaults: DirectoryViewMessages = Object.freeze({
  label: 'Search resources', placeholder: 'Enter a word', submit: 'Search', clear: 'Clear all', filters: 'Filter resources',
  closeFilters: 'Close filters', countHint: 'Counts include every active filter. Choices in one group combine with OR; different groups combine with AND.',
  selectedFilters: 'Selected filters', remove: 'Remove {group}: {value}', unknownCount: 'count unavailable', emptyValue: '(Empty)',
  omittedCounts: 'Counts shown for {shown} of {total} values. Other counts are unavailable.', resultsLabel: 'Results',
  idle: 'Search or browse all resources.', waiting: 'Waiting for your search.', composing: 'Finish entering text to search.', searching: 'Searching.',
  noResults: 'No results. Remove a filter or clear all to browse resources.', resultOne: '1 result. Showing {start}–{end}.', results: '{total} results. Showing {start}–{end}.',
  previous: 'Previous page', next: 'Next page', page: 'Page {page} of {pages}.', error: 'Search is unavailable ({code}). Try again.',
  stale: 'The collection changed. Refresh results to continue.', retry: 'Refresh results', invalid: 'This search or selection exceeds the directory limits. Remove a choice or shorten the search.',
});
export const directoryMessage = (source: string, values: Readonly<Record<string, string | number>>): string =>
  source.replace(/\{([A-Za-z]+)\}/g, (token, key: string) => Object.hasOwn(values, key) ? String(values[key]) : token);
export interface CapturedDirectoryView {
  readonly root: HTMLElement;
  readonly controller: DirectoryViewOptions['controller'];
  readonly config: CapturedDirectory;
  readonly documents: ReadonlyMap<string, UIDocument>;
  readonly groups: readonly { readonly field: string; readonly label: string; readonly values: readonly { readonly value: string; readonly label: string }[] }[];
  readonly debounceMs: number;
  readonly filtersOpen: boolean;
  readonly messages: DirectoryViewMessages;
}
export function captureDirectoryView(input: DirectoryViewOptions): CapturedDirectoryView {
  const budget = new Admission(100_000), o = object(input, ['root', 'controller', 'documents', 'groups', 'debounceMs', 'filtersOpen', 'messages'], 'view', budget);
  const root = o.root as HTMLElement, controller = o.controller as DirectoryViewOptions['controller'];
  const config = directoryConfigurations.get(controller);
  if (!config || !root || root.nodeType !== 1 || root.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !root.ownerDocument?.defaultView || typeof root.replaceChildren !== 'function') failDirectory('view.host');
  const label = (value: unknown, maximum = 512): string => {
    const captured = text(value, maximum, 'view.label'); if (/^[\s\p{C}]*$/u.test(captured)) failDirectory('view.label'); return captured;
  };
  const overrides = object(o.messages === undefined ? {} : o.messages, Object.keys(defaults), 'view.messages', budget);
  const messages = Object.freeze(Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, Object.hasOwn(overrides, key) ? label(overrides[key]) : value]))) as unknown as DirectoryViewMessages;
  let units = 0;
  const documents = new Map<string, UIDocument>();
  for (const raw of ownArray(o.documents, 10_000, 'INVALID_OPTIONS', 'ui.directory.view.documents', budget)) {
    const d = object(raw, ['id', 'title', 'url'], 'view.document', budget), id = text(d.id, 256, 'view.id'), title = label(d.title, 1_024), url = text(d.url, 2_048, 'view.url');
    if (documents.has(id)) failDirectory('view.id');
    let parsed: URL;
    try { parsed = new URL(url, root.ownerDocument.baseURI); } catch { failDirectory('view.url'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) failDirectory('view.url');
    units += id.length + title.length + url.length;
    if (units > 4_000_000) failDirectory('view.documents', 'LIMIT_EXCEEDED');
    documents.set(id, Object.freeze({ id, title, url: parsed.href }));
  }
  const supplied = new Map<string, Record<string, unknown>>();
  for (const raw of ownArray(o.groups, 8, 'INVALID_OPTIONS', 'ui.directory.view.groups', budget)) {
    const group = object(raw, ['field', 'label', 'values'], 'view.group', budget), field = text(group.field, 64, 'view.field');
    if (supplied.has(field) || !config.groups.some(g => g.field === field)) failDirectory('view.field'); supplied.set(field, group);
  }
  if (supplied.size !== config.groups.length) failDirectory('view.groups');
  const groups = config.groups.map(group => {
    const raw = supplied.get(group.field)!, labels = new Map<string, string>();
    for (const item of ownArray(raw.values === undefined ? [] : raw.values, 128, 'INVALID_OPTIONS', 'ui.directory.view.values', budget)) {
      const entry = object(item, ['value', 'label'], 'view.value', budget), value = text(entry.value, 1_024, 'view.value');
      if (labels.has(value) || !group.values.includes(value)) failDirectory('view.value'); labels.set(value, label(entry.label));
    }
    const name = label(raw.label, 256);
    const values = group.values.map(value => {
      if (value && !labels.has(value) && /^[\s\p{C}]*$/u.test(value)) failDirectory('view.value.label');
      return Object.freeze({ value, label: labels.get(value) ?? (value || messages.emptyValue) });
    });
    units += name.length + values.reduce((sum, v) => sum + v.label.length, 0);
    if (units > 4_000_000) failDirectory('view.labels', 'LIMIT_EXCEEDED');
    return Object.freeze({ field: group.field, label: name, values: Object.freeze(values) });
  });
  if (o.filtersOpen !== undefined && typeof o.filtersOpen !== 'boolean') failDirectory('view.filtersOpen');
  if (directoryConfigurations.get(controller) !== config) failDirectory('view.controller');
  return Object.freeze({ root, controller, config, documents, groups: Object.freeze(groups), messages,
    debounceMs: integer(o.debounceMs === undefined ? 150 : o.debounceMs, 0, 2_000, 'view.debounceMs'), filtersOpen: o.filtersOpen === true });
}
