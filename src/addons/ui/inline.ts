import type { Query, Raveldex, SearchResult } from '../../core/contracts/types.js';
import { ERROR_CODES } from '../../core/errors/error.js';
import { captureOptions, displayName, fail, record } from './options.js';
import { queryFromText } from './query.js';
import { assertResult, unavailable, snippetDocuments } from './render.js';
import type { FacetControl } from './render.js';
import { inlineResults, inlineFacets, resetInlineFacets, message } from './inline-render.js';
import { mounted } from './mounts.js';
import type { UIDocument, UIFacet } from './types.js';
import type { PageSections } from '../sections/types.js';
import { captureInlineSections, isSectionRefusal, sectionDocument } from './inline-sections.js';
import type { InlineSectionContext } from './inline-sections.js';
import { inlineHost } from './inline-lifecycle.js';
import { queryPreview } from './search-feedback.js';

export type { UIDocument, UIFacet } from './types.js';

/** Plain text. Empty templates support {query}; summaries {total}/{count}; append {added}/{start}/{end}; error {code}. */
export interface InlineUIMessages {
  readonly label: string;
  readonly placeholder: string;
  readonly submit: string;
  readonly clear: string;
  readonly idle: string;
  readonly searching: string;
  readonly noResults: string;
  readonly noResultsFiltered?: string;
  readonly resultsLabel: string;
  readonly resultsOne: string;
  readonly resultsMany: string;
  readonly error: string;
  readonly retry: string;
  readonly composing?: string;
  readonly loadMore?: string;
  readonly newResults?: string;
  readonly resultsAdded?: string;
  /** @deprecated Accepted for older message bundles; no replacement pages are rendered. */
  readonly previous?: string;
  /** @deprecated Accepted for older message bundles; no replacement pages are rendered. */
  readonly next?: string;
  readonly paginationLabel?: string;
  readonly pageSummary?: string;
  /** @deprecated Accepted for older message bundles; loaded results are not windowed. */
  readonly windowLimit?: string;
  readonly revisionChanged?: string;
  readonly all?: string;
  readonly emptyValue?: string;
  readonly nullValue?: string;
  readonly missingValue?: string;
  readonly unlistedValue?: string;
  readonly facetSummary?: string;
  readonly snippetOmissions?: string;
  readonly snippetLimits?: string;
  readonly sectionCaption?: string;
  readonly sectionOmissions?: string;
  readonly sectionUnavailable?: string;
  readonly sectionStale?: string;
}
export interface InlineUIOptions {
  readonly root: HTMLElement;
  /** Borrowed; the application disposes its engine after destroying the UI. */
  readonly engine: Raveldex;
  readonly documents: readonly UIDocument[];
  readonly pageSize?: number;
  readonly debounceMs?: number;
  readonly facets?: readonly UIFacet[];
  readonly snippetFields?: readonly string[];
  /** Original-source maps bound to this borrowed engine's display revision. */
  readonly pageSections?: PageSections;
  /** Default 3; integers 1..3, only valid with pageSections. */
  readonly maxSectionPreviews?: number;
  /** @deprecated Validated for compatibility (pageSize..1000), but does not limit accumulation. */
  readonly maxRenderedResults?: number;
  /** Final-word prefix by default; the legacy UI retains its exact default. */
  readonly mode?: 'text' | 'prefix';
  readonly messages?: Partial<InlineUIMessages>;
}
export interface InlineUIHandle {
  /** Set optional raw input and flush debounce. Native failures are presented. */
  readonly search: (text?: string) => Promise<void>;
  /** Cancel pending work and restore idle, preserving the currently focused control. */
  readonly clear: () => void;
  /** Release this UI and restore original nodes; never disposes the engine. */
  readonly destroy: () => void;
}

const defaults: Required<InlineUIMessages> = Object.freeze({
  label: 'Search this site', placeholder: 'Search', submit: 'Search', clear: 'Clear search',
  idle: 'Enter a search term.', searching: 'Searching…', noResults: 'No results for “{query}”. Try a different search.',
  noResultsFiltered: 'No results with the selected filters. Change a filter or clear search and filters.',
  resultsLabel: 'Search results', resultsOne: '{total} result. Showing {count}.',
  resultsMany: '{total} results. Showing {count}.',
  error: 'Search could not complete. Retry search or change your search.', retry: 'Retry search',
  composing: 'Finish entering text to search.', loadMore: 'Load more', previous: 'Previous results', next: 'Next results',
  newResults: 'Go to new results', resultsAdded: 'Results added: {added}. Showing {start}–{end} of {total}.',
  paginationLabel: 'Search result actions', pageSummary: 'Showing {start}–{end} of {total}.',
  windowLimit: 'This window shows {count} results; {remaining} remain. Use Next results to continue.',
  revisionChanged: 'Search results changed. Retry search to see the latest results.',
  all: 'All', emptyValue: '(empty string)', nullValue: 'Null', missingValue: 'Missing',
  unlistedValue: '{value} (not in displayed values)',
  facetSummary: 'Filter choices: {total}. Not shown: {omitted}. Counts reflect the current filters.',
  snippetOmissions: 'Matches not highlighted: {count}. Open the page to read more.',
  snippetLimits: 'These excerpts show only part of the matching text. Open the page to read more.',
  sectionCaption: 'Matching text in this page', sectionOmissions: 'More matching context is not shown.',
  sectionUnavailable: 'Matching context is unavailable. Search again to retry.',
  sectionStale: 'Matching context is unavailable because the page map is out of date. Reload with fresh page maps.',
});
let mountNumber = 0;

/** Explicit, core-only consumer foundation. CSS is a separate optional import. */
export function mountRaveldexInline(options: InlineUIOptions): InlineUIHandle {
  const rootDescriptor = options && typeof options === 'object' ? Object.getOwnPropertyDescriptor(options, 'root') : undefined;
  if (!rootDescriptor || !('value' in rootDescriptor)) fail('INVALID_OPTIONS', 'root');
  const existing = mounted.get(rootDescriptor.value as HTMLElement);
  if (existing) {
    if (existing.kind !== 'inline') fail('INVALID_OPTIONS', 'root');
    return existing.handle as InlineUIHandle;
  }
  const o = record(options, ['root', 'engine', 'documents', 'pageSize', 'debounceMs', 'mode', 'messages', 'facets', 'snippetFields', 'maxRenderedResults', 'pageSections', 'maxSectionPreviews'], 'inline.options');
  const mode = o.mode ?? 'prefix';
  if (mode !== 'text' && mode !== 'prefix') fail('INVALID_OPTIONS', 'inline.mode');
  for (const key of ['facets', 'snippetFields']) {
    if (o[key] !== undefined && !Array.isArray(o[key])) fail('INVALID_OPTIONS', `inline.${key}`);
  }
  const ownedMessages = record(o.messages ?? {}, Object.keys(defaults), 'inline.messages');
  const captured = captureOptions({ root: o.root as HTMLElement, engine: o.engine as Raveldex,
    documents: o.documents as readonly UIDocument[], mode,
    ...(o.pageSize === undefined ? {} : { pageSize: o.pageSize as number }),
    ...(o.debounceMs === undefined ? {} : { debounceMs: o.debounceMs as number }),
    ...(o.facets === undefined ? {} : { facets: o.facets as readonly UIFacet[] }),
    ...(o.snippetFields === undefined ? {} : { snippetFields: o.snippetFields as readonly string[] }) });
  const messages = { ...defaults,
    clear: captured.facets.length ? 'Clear search and filters' : defaults.clear,
    idle: captured.facets.length ? 'Enter a search term to see filter choices.' : defaults.idle,
  };
  for (const key of Object.keys(ownedMessages) as (keyof InlineUIMessages)[]) {
    Object.defineProperty(messages, key, { value: displayName(ownedMessages[key], 512, `inline.messages.${key}`), enumerable: true });
  }
  if (Object.hasOwn(ownedMessages, 'noResults') && !Object.hasOwn(ownedMessages, 'noResultsFiltered')) messages.noResultsFiltered = messages.noResults;
  Object.freeze(messages);
  if (o.pageSections !== undefined && o.snippetFields !== undefined) fail('INVALID_OPTIONS', 'inline.pageSections');
  if (o.pageSections === undefined && o.maxSectionPreviews !== undefined) fail('INVALID_OPTIONS', 'inline.maxSectionPreviews');
  const maxSectionPreviews = o.maxSectionPreviews === undefined ? 3 : o.maxSectionPreviews;
  if (typeof maxSectionPreviews !== 'number' || !Number.isSafeInteger(maxSectionPreviews) || maxSectionPreviews < 1 || maxSectionPreviews > 3) fail('INVALID_OPTIONS', 'inline.maxSectionPreviews');
  let sections = o.pageSections === undefined ? undefined : captureInlineSections(o.pageSections, captured.documents);
  // Preserve validation of older integrations without limiting appended results.
  if (o.maxRenderedResults !== undefined && (typeof o.maxRenderedResults !== 'number' || !Number.isSafeInteger(o.maxRenderedResults) ||
    o.maxRenderedResults < captured.pageSize || o.maxRenderedResults > 1000)) fail('INVALID_OPTIONS', 'inline.maxRenderedResults');
  const doc = captured.root.ownerDocument, win = doc.defaultView;
  if (!win || typeof win.AbortController !== 'function' || typeof win.setTimeout !== 'function') fail('UNSUPPORTED_ENVIRONMENT', 'host');
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, part: string, text?: string): HTMLElementTagNameMap[K] => {
    const value = doc.createElement(tag); value.className = `raveldex-inline__${part}`;
    value.setAttribute(`data-raveldex-inline-${part}`, '');
    if (text !== undefined) value.textContent = text;
    return value;
  };
  const id = `raveldex-inline-${++mountNumber}`;
  const shell = node('section', 'root'); shell.className = 'raveldex-inline'; shell.setAttribute('aria-label', messages.label);
  const form = node('form', 'form'); form.setAttribute('role', 'search'); form.setAttribute('aria-label', messages.label);
  const label = node('label', 'label', messages.label); label.htmlFor = `${id}-query`;
  const field = node('div', 'field'), icon = node('span', 'icon'); icon.setAttribute('aria-hidden', 'true');
  const input = node('input', 'input'); input.id = label.htmlFor; input.type = 'search';
  input.maxLength = 2_048; input.autocomplete = 'off'; input.placeholder = messages.placeholder;
  const submit = node('button', 'submit', messages.submit); submit.type = 'submit';
  const clear = node('button', 'clear', messages.clear); clear.type = 'button';
  field.append(icon, input); form.append(label, field, submit, clear);
  const facetGroup = node('div', 'facets');
  const facets: FacetControl[] = captured.facets.map((facet, index) => {
    const group = node('div', 'facet-group'), name = node('label', 'facet-label', facet.label);
    name.htmlFor = `${id}-facet-${index}`;
    const select = node('select', 'facet'); select.id = name.htmlFor; select.setAttribute('data-raveldex-inline-facet', facet.field);
    const summary = node('p', 'facet-summary'); summary.id = `${id}-facet-summary-${index}`;
    select.setAttribute('aria-describedby', `${summary.id} ${id}-status`);
    group.append(name, select, summary); facetGroup.append(group);
    return { field: facet.field, select, summary, values: new Map<string, string>() };
  });
  resetInlineFacets(doc, facets, messages);
  const status = node('p', 'status', messages.idle); status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  status.id = `${id}-status`;
  const retry = node('button', 'retry', messages.retry); retry.type = 'button'; retry.hidden = true;
  const heading = node('h2', 'results-heading', messages.resultsLabel); heading.id = `${id}-results`; heading.hidden = true;
  const results = node('ol', 'results'); results.setAttribute('aria-labelledby', heading.id); results.hidden = true;
  const navigation = node('nav', 'navigation'); navigation.hidden = true; navigation.setAttribute('aria-label', messages.paginationLabel);
  const loadMore = node('button', 'load-more', messages.loadMore), newResults = node('button', 'new-results', messages.newResults);
  const navigationButtons = [loadMore, newResults];
  for (const button of navigationButtons) { button.type = 'button'; unavailable(button, true); }
  const pageSummary = node('p', 'page-summary'); pageSummary.hidden = true;
  navigation.append(loadMore, newResults);
  shell.append(form, facetGroup, status, retry, heading, results, pageSummary, navigation); shell.dataset.state = 'idle'; shell.setAttribute('aria-busy', 'false');

  const host = inlineHost(captured.root);
  let destroyed = false, composing = false, sequence = 0, suspended = !!host;
  const activePresentation = (): boolean => !destroyed && !suspended && (host?.active() ?? true);
  let timer: number | undefined, controller: AbortController | undefined;
  let appendedTarget: HTMLAnchorElement | undefined;
  interface Snapshot { readonly signature: string; readonly revision: number; readonly total: number; readonly ids: readonly string[] }
  let snapshot: Snapshot | undefined;
  const originalNodes = Array.from(captured.root.childNodes), listeners: (() => void)[] = [];
  const listen = (target: EventTarget, type: string, callback: EventListener): void => {
    target.addEventListener(type, callback); listeners.push(() => target.removeEventListener(type, callback));
  };
  const announce = (text: string): void => { if (status.textContent !== text) status.textContent = text; };
  const cancelTimer = (): void => { if (timer !== undefined) { win.clearTimeout(timer); timer = undefined; } };
  const updateNavigation = (): void => {
    if (destroyed) return;
    const focused = (navigation.getRootNode() as Document | ShadowRoot).activeElement;
    for (const button of navigationButtons) button.hidden = button.getAttribute('aria-disabled') === 'true' && button !== focused;
    navigation.hidden = !activePresentation() || navigationButtons.every(button => button.hidden);
  };
  const updateRetry = (): void => {
    if (destroyed) return;
    // A focused action stays in place while unavailable. Retire it only after
    // native focus has moved, just like pagination actions.
    retry.hidden = !activePresentation() || retry.getAttribute('aria-disabled') === 'true' &&
      (retry.getRootNode() as Document | ShadowRoot).activeElement !== retry;
  };
  const disableNavigation = (): void => {
    appendedTarget = undefined;
    for (const button of navigationButtons) unavailable(button, true);
    updateNavigation();
  };
  // Document focus is retargeted to the host when this surface is in a shadow
  // tree. Inspect only our own tree, including closed/nested authored roots.
  const resultFocused = (): boolean => results.contains((results.getRootNode() as Document | ShadowRoot).activeElement);
  const clearPresentation = (): void => {
    snapshot = undefined;
    if (activePresentation() && resultFocused()) input.focus();
    results.replaceChildren(); results.hidden = true; heading.hidden = true; pageSummary.textContent = ''; pageSummary.hidden = true;
    resetInlineFacets(doc, facets, messages); disableNavigation();
  };
  const invalidate = (preserve = false): number => {
    const ticket = ++sequence; cancelTimer();
    const old = controller; controller = undefined; old?.abort();
    if (destroyed || ticket !== sequence) return ticket;
    if (!preserve) {
      // Focus callbacks may synchronously search or destroy. Do not discard newer work.
      if (activePresentation() && resultFocused()) input.focus();
      if (destroyed || ticket !== sequence) return ticket;
      clearPresentation();
    }
    disableNavigation(); unavailable(retry, true); updateRetry(); shell.setAttribute('aria-busy', 'false');
    return ticket;
  };
  const current = (ticket: number, active: AbortController): boolean => activePresentation() && sequence === ticket && !active.signal.aborted;
  const idle = (): void => { shell.dataset.state = 'idle'; announce(messages.idle); };
  const queryControls = (): { query: Query; active: boolean; text: string; filtered: boolean } => {
    const raw = input.value, text = raw.length > 2048 ? raw : raw.trim();
    const clauses: Query[] = [];
    for (const facet of facets) {
      const value = facet.values.get(facet.select.value);
      if (value !== undefined) clauses.push({ kind: 'eq', field: facet.field, value });
    }
    const query = queryFromText(text, captured.mode);
    return { query: clauses.length ? { kind: 'and', children: [query, ...clauses] } : query, active: !!text || !!clauses.length, text, filtered: !!clauses.length };
  };
  type Action = 'reset' | 'more';
  const execute = async (action: Action = 'reset'): Promise<void> => {
    if (!activePresentation()) return;
    const controls = queryControls(), signature = JSON.stringify(controls.query);
    const prior = snapshot;
    if (!prior || prior.signature !== signature) action = 'reset';
    if (action === 'more' && prior && prior.ids.length >= prior.total) return;
    const append = action === 'more';
    const offset = append && prior ? prior.ids.length : 0;
    const ticket = invalidate(append);
    if (!activePresentation() || ticket !== sequence) return;
    if (composing) { shell.dataset.state = 'composing'; announce(messages.composing); return; }
    if (!controls.active) { idle(); return; }
    const active = new win.AbortController(); controller = active;
    shell.dataset.state = 'searching'; shell.setAttribute('aria-busy', 'true'); announce(messages.searching);
    try {
      const remaining = action === 'reset' || !prior ? captured.documents.size : Math.min(captured.documents.size, prior.total) - offset;
      const limit = Math.max(1, Math.min(captured.pageSize, remaining));
      const extensions = facets.length ? { facets: { fields: facets.map(f => ({ field: f.field, limit: 100, missing: true })) } } : undefined;
      const found = await captured.engine.search(controls.query, { limit, offset, signal: active.signal, ...(extensions ? { extensions } : {}) });
      if (!current(ticket, active)) return;
      assertResult(found, captured);
      if (found.hits.length > limit || found.hits.length !== Math.min(limit, Math.max(0, found.total - offset))) fail('INCOMPATIBLE_CAPABILITY', 'inline.result.hits');
      if (action !== 'reset' && prior) {
        if (found.revision !== prior.revision) fail('REVISION_MISMATCH', 'inline.result.revision');
        if (found.total !== prior.total) fail('INCOMPATIBLE_CAPABILITY', 'inline.result.total');
      }
      let snippets;
      if (captured.snippetFields.length) {
        const detailed = await captured.engine.search(controls.query, { limit, offset, signal: active.signal,
          extensions: { snippets: { ids: found.hits.map(h => h.id), fields: captured.snippetFields, expectedRevision: found.revision } } });
        if (!current(ticket, active)) return;
        snippets = snippetDocuments(detailed, found);
      }
      let contexts: Map<string, InlineSectionContext> | undefined;
      if (sections) {
        contexts = new Map();
        for (const hit of found.hits) {
          if (!current(ticket, active) || !sections) return;
          const page = sections.pages.get(hit.id);
          if (!page) { contexts.set(hit.id, { state: 'no-map' }); continue; }
          if (sections.revision !== found.revision) { contexts.set(hit.id, { state: 'stale-map' }); continue; }
          if (!page.sections.length) { contexts.set(hit.id, { state: 'empty-map' }); continue; }
          let detailed: SearchResult;
          try {
            detailed = await captured.engine.search(controls.query, { limit, offset, signal: active.signal,
              extensions: { 'section-evidence': { ids: [hit.id], expectedRevision: found.revision, maxPreviews: maxSectionPreviews,
                sections: page.sections.map((section, sectionIndex) => ({ sectionIndex, field: section.field, valueIndex: section.valueIndex, start: section.start, end: section.end })) } } });
          } catch (reason) {
            if (!current(ticket, active)) return;
            if (!isSectionRefusal(reason)) throw reason;
            contexts.set(hit.id, { state: 'unavailable' }); continue;
          }
          if (!current(ticket, active)) return;
          // Validation is outside the native-refusal catch: corrupt external
          // replies cannot masquerade as safe missing context.
          const evidence = sectionDocument(detailed, found, hit.id, page, maxSectionPreviews);
          contexts.set(hit.id, { state: evidence.sectionPreviews.length ? 'previews' : evidence.ranges.length ? 'no-matching-section' : 'no-positive-evidence', page, evidence });
        }
      }
      const fragment = inlineResults(doc, node, captured, found, snippets, messages, contexts), updates = inlineFacets(doc, facets, found, messages);
      const addedTarget = append ? fragment.querySelector<HTMLAnchorElement>('[data-raveldex-inline-result-title]') : null;
      const ids = found.hits.map(h => h.id);
      if (append && prior && ids.some(id => prior.ids.includes(id))) fail('INCOMPATIBLE_CAPABILITY', 'inline.result.duplicates');
      if (!current(ticket, active)) return;
      for (const update of updates) update();
      if (append) results.append(fragment); else results.replaceChildren(fragment);
      const allIds = append && prior ? [...prior.ids, ...ids] : ids;
      snapshot = { signature, revision: found.revision, total: found.total, ids: allIds };
      heading.hidden = found.total === 0; results.hidden = found.total === 0;
      appendedTarget = addedTarget ?? undefined;
      shell.dataset.state = found.total ? 'results' : 'empty';
      announce(found.total === 0 ? message(controls.filtered ? messages.noResultsFiltered : messages.noResults, { query: queryPreview(controls.text) }) : append
        ? message(messages.resultsAdded, { added: ids.length, start: 1, end: allIds.length, total: found.total, count: allIds.length })
        : message(found.total === 1 ? messages.resultsOne : messages.resultsMany, { total: found.total, count: allIds.length }));
      const left = Math.max(0, found.total - allIds.length);
      pageSummary.hidden = found.total === 0;
      pageSummary.textContent = found.total ? message(messages.pageSummary, { start: 1, end: allIds.length, total: found.total, count: allIds.length }) : '';
      unavailable(loadMore, !left);
      unavailable(newResults, !appendedTarget); updateNavigation();
    } catch (reason) {
      if (!current(ticket, active)) return;
      const descriptor = typeof reason === 'object' && reason !== null ? Object.getOwnPropertyDescriptor(reason, 'code') : undefined;
      const code = descriptor && 'value' in descriptor && (ERROR_CODES as readonly unknown[]).includes(descriptor.value) ? String(descriptor.value) : 'INTERNAL_ERROR';
      // Recover before clearing focused result content, then recheck synchronous reentry.
      if (activePresentation() && resultFocused()) input.focus();
      if (!current(ticket, active)) return;
      clearPresentation(); shell.dataset.state = 'error';
      announce(code === 'REVISION_MISMATCH' ? messages.revisionChanged : message(messages.error, { code }));
      retry.hidden = false; unavailable(retry, false);
    } finally {
      if (current(ticket, active)) { controller = undefined; shell.setAttribute('aria-busy', 'false'); }
    }
  };
  const schedule = (): void => {
    if (!activePresentation()) return;
    const ticket = invalidate();
    if (!activePresentation() || ticket !== sequence) return;
    if (composing) { shell.dataset.state = 'composing'; announce(messages.composing); return; }
    if (!queryControls().active) { idle(); return; }
    shell.dataset.state = 'waiting'; announce('');
    timer = win.setTimeout(() => { timer = undefined; void execute(); }, captured.debounceMs);
  };
  const clearInput = (): void => {
    if (destroyed) return;
    input.value = ''; for (const facet of facets) facet.select.value = '';
    const ticket = invalidate(); if (!destroyed && ticket === sequence) { if (suspended) announce(''); else idle(); }
  };
  listen(form, 'submit', event => { event.preventDefault(); void execute(); });
  listen(input, 'input', schedule);
  listen(input, 'compositionstart', () => { composing = true; schedule(); });
  listen(input, 'compositionend', () => { composing = false; schedule(); });
  listen(clear, 'click', clearInput);
  for (const facet of facets) listen(facet.select, 'change', () => { void execute(); });
  listen(loadMore, 'click', () => { if (loadMore.getAttribute('aria-disabled') !== 'true') void execute('more'); });
  listen(newResults, 'click', () => {
    if (newResults.getAttribute('aria-disabled') === 'true' || !appendedTarget || !results.contains(appendedTarget)) return;
    appendedTarget.focus();
  });
  // Wait for native focus transfer before retiring an unavailable action.
  // Read current state at that time, so newer requests cannot be overwritten.
  listen(navigation, 'focusout', () => { void Promise.resolve().then(() => { if (activePresentation()) updateNavigation(); }); });
  listen(retry, 'focusout', () => { void Promise.resolve().then(() => { if (activePresentation()) updateRetry(); }); });
  listen(retry, 'click', () => { if (retry.getAttribute('aria-disabled') !== 'true') void execute(); });
  const handle: InlineUIHandle = Object.freeze({
    search: (text?: string): Promise<void> => {
      if (destroyed) return Promise.resolve();
      if (text !== undefined) { if (typeof text !== 'string') fail('INVALID_OPTIONS', 'inline.search'); input.value = text; }
      return execute();
    },
    clear: clearInput,
    destroy: (): void => {
      if (destroyed) return;
      destroyed = true; sequence++; cancelTimer();
      sections = undefined; snapshot = undefined; appendedTarget = undefined; results.replaceChildren();
      const previous = controller; controller = undefined; previous?.abort();
      for (const remove of listeners) remove();
      if (mounted.get(captured.root)?.handle !== handle) return;
      mounted.delete(captured.root); captured.root.replaceChildren(...originalNodes);
    },
  });
  host?.layout({ shell, form, facets: facetGroup, feedback: [status, retry, heading, results, pageSummary, navigation], input });
  host?.connect(Object.freeze({
    suspend: (reset: boolean): void => {
      if (destroyed) return;
      suspended = true; composing = false;
      if (reset) { input.value = ''; for (const facet of facets) facet.select.value = ''; }
      const ticket = invalidate();
      if (destroyed || ticket !== sequence || !suspended) return;
      shell.dataset.state = 'idle'; announce(''); retry.hidden = true; navigation.hidden = true;
    },
    resume: (): void => { if (!destroyed && suspended) { suspended = false; void execute(); } },
    focus: (): void => { if (activePresentation()) input.focus({ preventScroll: true }); },
  }));
  mounted.set(captured.root, { kind: 'inline', handle });
  try { captured.root.replaceChildren(shell); }
  catch (reason) {
    if (mounted.get(captured.root)?.handle === handle) {
      try { handle.destroy(); } catch { /* Preserve the original host mutation failure. */ }
    }
    throw reason;
  }
  return handle;
}
