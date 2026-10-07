import type { Query, SearchResult } from '../../core/contracts/types.js';
import { ERROR_CODES } from '../../core/errors/error.js';
import type { InspectorData } from '../inspector/types.js';
import { captureOptions, fail } from './options.js';
import { assertResult, button, element, facetUpdates, resultNodes, snippetDocuments, unavailable } from './render.js';
import type { FacetControl } from './render.js';
import type { UIHandle, UIOptions } from './types.js';

// Host-independent bookkeeping only. Nothing reads document/window on import.
const mounted = new WeakMap<HTMLElement, UIHandle>();
let mountNumber = 0;
interface DisplaySnapshot {
  readonly query: Query;
  readonly offset: number;
  readonly limit: number;
  readonly result: SearchResult;
}
function errorCode(error: unknown): string {
  const descriptor = typeof error === 'object' && error !== null ? Object.getOwnPropertyDescriptor(error, 'code') : undefined;
  if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && (ERROR_CODES as readonly string[]).includes(descriptor.value)) return descriptor.value;
  return 'INTERNAL_ERROR';
}

/** Optional, explicit DOM enhancement over a borrowed public engine. */
export function mountRaveldexUI(options: UIOptions): UIHandle {
  const rootDescriptor = options && typeof options === 'object' ? Object.getOwnPropertyDescriptor(options, 'root') : undefined;
  if (!rootDescriptor || !('value' in rootDescriptor)) fail('INVALID_OPTIONS', 'root');
  const existing = mounted.get(rootDescriptor.value as HTMLElement);
  if (existing) return existing;
  const captured = captureOptions(options);
  const doc = captured.root.ownerDocument, win = doc.defaultView;
  if (!win || typeof win.AbortController !== 'function' || typeof win.setTimeout !== 'function') fail('UNSUPPORTED_ENVIRONMENT', 'host');
  const prefix = `raveldex-ui-${++mountNumber}`;
  const shell = element(doc, 'section', 'ui'); shell.className = 'raveldex-ui'; shell.setAttribute('aria-label', captured.label);
  const form = element(doc, 'form', 'form'); form.setAttribute('role', 'search');
  const label = element(doc, 'label', 'label', captured.label); label.htmlFor = `${prefix}-query`;
  const input = element(doc, 'input', 'input'); input.type = 'search'; input.id = label.htmlFor; input.maxLength = 2_048; input.autocomplete = 'off';
  const submit = button(doc, 'submit', 'Search'); submit.type = 'submit';
  form.append(label, input, submit);
  const facetGroup = element(doc, 'div', 'facets');
  const facets: FacetControl[] = captured.facets.map((facet, i) => {
    const group = element(doc, 'div', 'facet-group');
    const name = element(doc, 'label', 'facet-label', facet.label); name.htmlFor = `${prefix}-facet-${i}`;
    const select = element(doc, 'select', 'facet'); select.id = name.htmlFor; select.setAttribute('data-raveldex-facet', facet.field);
    const all = doc.createElement('option'); all.value = ''; all.textContent = 'All'; select.append(all);
    const summary = element(doc, 'p', 'facet-summary'); summary.id = `${prefix}-facet-summary-${i}`; select.setAttribute('aria-describedby', summary.id);
    group.append(name, select, summary); facetGroup.append(group);
    return { field: facet.field, select, summary, values: new Map<string, string>() };
  });
  const status = element(doc, 'p', 'status'); status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  const error = element(doc, 'p', 'error'); error.hidden = true;
  const retry = button(doc, 'retry', 'Retry search'); retry.hidden = true;
  const resultHeading = element(doc, 'h2', 'results-heading', 'Search results'); resultHeading.id = `${prefix}-results`;
  const results = element(doc, 'ol', 'results'); results.setAttribute('aria-labelledby', resultHeading.id);
  const navigation = element(doc, 'nav', 'navigation'); navigation.setAttribute('aria-label', 'Search result pages');
  const previous = button(doc, 'previous', 'Previous page'), next = button(doc, 'next', 'Next page'), page = element(doc, 'p', 'page', 'No page loaded.');
  const inspect = button(doc, 'inspect', 'Inspect results');
  unavailable(previous, true); unavailable(next, true); unavailable(inspect, true);
  navigation.append(previous, page, next); shell.append(form, facetGroup, status, error, retry, resultHeading, results, navigation, inspect);
  const dialog = element(doc, 'dialog', 'inspector');
  const inspectorHeading = element(doc, 'h2', 'inspector-heading', 'Inspector'); inspectorHeading.id = `${prefix}-inspector-heading`; dialog.setAttribute('aria-labelledby', inspectorHeading.id);
  const close = button(doc, 'inspector-close', 'Close Inspector');
  const inspectorStatus = element(doc, 'p', 'inspector-status'); inspectorStatus.setAttribute('role', 'status'); inspectorStatus.setAttribute('aria-atomic', 'true');
  const inspectorError = element(doc, 'p', 'inspector-error'); inspectorError.hidden = true;
  const inspectorData = element(doc, 'pre', 'inspector-data');
  dialog.append(inspectorHeading, close, inspectorStatus, inspectorError, inspectorData); shell.append(dialog);

  let destroyed = false, composing = false, sequence = 0, inspectorSequence = 0;
  let timer: number | undefined, searchController: AbortController | undefined, inspectorController: AbortController | undefined;
  let snapshot: DisplaySnapshot | undefined;
  const listeners: (() => void)[] = [];
  const originalNodes = Array.from(captured.root.childNodes);
  const listen = (target: EventTarget, type: string, callback: EventListener): void => {
    target.addEventListener(type, callback); listeners.push(() => target.removeEventListener(type, callback));
  };
  const cancelTimer = (): void => { if (timer !== undefined) { win.clearTimeout(timer); timer = undefined; } };
  const closeInspector = (restoreFocus: boolean): void => {
    inspectorSequence++; inspectorController?.abort(); inspectorController = undefined;
    inspectorData.textContent = ''; inspectorStatus.textContent = ''; inspectorError.hidden = true; inspectorError.textContent = '';
    dialog.setAttribute('aria-busy', 'false');
    const wasOpen = dialog.open;
    if (wasOpen) dialog.close();
    if (wasOpen && restoreFocus && !destroyed && inspect.isConnected) inspect.focus();
  };
  const invalidate = (): number => {
    sequence++; cancelTimer(); searchController?.abort(); searchController = undefined;
    closeInspector(dialog.contains(doc.activeElement));
    snapshot = undefined; results.replaceChildren(); page.textContent = 'No page loaded.';
    unavailable(previous, true); unavailable(next, true); unavailable(inspect, true);
    shell.setAttribute('aria-busy', 'false'); error.hidden = true; error.textContent = '';
    // Once offered, keep Retry mounted so asynchronous updates never discard its focus.
    unavailable(retry, true);
    return sequence;
  };
  const queryFromControls = (): Query => {
    const text = input.value.trim();
    const base: Query = !text ? { kind: 'all' } : captured.mode === 'phrase'
      ? { kind: 'extension', capability: 'phrases', version: 1, payload: { text } }
      : { kind: 'text', text };
    const selections: Query[] = [];
    for (const facet of facets) {
      const value = facet.values.get(facet.select.value);
      if (value !== undefined) selections.push({ kind: 'eq', field: facet.field, value });
    }
    return selections.length ? { kind: 'and', children: [base, ...selections] } : base;
  };
  const isLatest = (ticket: number, controller: AbortController): boolean => !destroyed && ticket === sequence && !controller.signal.aborted;
  const execute = async (offset = 0): Promise<void> => {
    if (destroyed) return;
    // Narrow the final page before admission: core checks offset + limit against
    // its configured document ceiling, even when fewer results will be returned.
    const knownRemaining = offset > 0 && snapshot ? Math.max(1, snapshot.result.total - offset) : captured.pageSize;
    const limit = Math.min(captured.pageSize, knownRemaining, Math.max(1, captured.documents.size - offset));
    const ticket = invalidate();
    if (composing) { status.textContent = 'Finish composing to search.'; return; }
    const controller = new win.AbortController(); searchController = controller;
    const query = queryFromControls();
    shell.setAttribute('aria-busy', 'true'); status.textContent = 'Searching…';
    try {
      const extensions = facets.length ? { facets: { fields: facets.map(f => ({ field: f.field, limit: 100, missing: true })) } } : undefined;
      const main = await captured.engine.search(query, { limit, offset, signal: controller.signal, ...(extensions ? { extensions } : {}) });
      if (!isLatest(ticket, controller)) return;
      assertResult(main, captured);
      if (main.hits.length > limit) fail('INCOMPATIBLE_CAPABILITY', 'result.hits');
      let snippetRows;
      if (captured.snippetFields.length) {
        const evidence = await captured.engine.search(query, { limit, offset, signal: controller.signal,
          extensions: { snippets: { ids: main.hits.map(hit => hit.id), fields: captured.snippetFields, expectedRevision: main.revision } } });
        if (!isLatest(ticket, controller)) return;
        snippetRows = snippetDocuments(evidence, main);
      }
      const resultFragment = resultNodes(doc, captured, main, snippetRows), updateFacets = facetUpdates(doc, facets, main);
      if (!isLatest(ticket, controller)) return;
      for (const update of updateFacets) update();
      results.replaceChildren(resultFragment);
      snapshot = { query, offset, limit, result: main };
      const first = main.hits.length ? offset + 1 : 0, last = offset + main.hits.length;
      status.textContent = main.total === 0 ? 'No results.' : main.hits.length === 0
        ? `${main.total} results. No results on this page. Use Previous page.`
        : `${main.total} results. Showing ${first}–${last}.`;
      page.textContent = `Page ${Math.floor(offset / captured.pageSize) + 1} of ${Math.max(1, Math.ceil(main.total / captured.pageSize))}.`;
      unavailable(previous, offset === 0); unavailable(next, offset + main.hits.length >= main.total); unavailable(inspect, main.hits.length === 0);
    } catch (reason) {
      if (!isLatest(ticket, controller)) return;
      const code = errorCode(reason); error.textContent = `Search failed (${code}). Try again.`; error.hidden = false;
      status.textContent = 'Search failed. Retry is available.'; retry.hidden = false; unavailable(retry, false);
    } finally {
      if (isLatest(ticket, controller)) { shell.setAttribute('aria-busy', 'false'); searchController = undefined; }
    }
  };
  const schedule = (): void => {
    invalidate();
    if (composing) { status.textContent = 'Finish composing to search.'; return; }
    status.textContent = 'Waiting to search…';
    timer = win.setTimeout(() => { timer = undefined; void execute(); }, captured.debounceMs);
  };
  const openInspector = async (): Promise<void> => {
    const selected = snapshot;
    if (destroyed || !selected || dialog.open) return;
    if (typeof dialog.showModal !== 'function') {
      error.textContent = 'Inspector failed (UNSUPPORTED_ENVIRONMENT).'; error.hidden = false; return;
    }
    closeInspector(false);
    try { dialog.showModal(); close.focus(); }
    catch { error.textContent = 'Inspector failed (UNSUPPORTED_ENVIRONMENT).'; error.hidden = false; return; }
    const ticket = inspectorSequence, mainTicket = sequence, controller = new win.AbortController(); inspectorController = controller;
    dialog.setAttribute('aria-busy', 'true'); inspectorStatus.textContent = 'Loading Inspector…';
    const current = (): boolean => !destroyed && dialog.open && ticket === inspectorSequence && mainTicket === sequence && snapshot === selected && !controller.signal.aborted;
    try {
      const result = await captured.engine.search(selected.query, { limit: selected.limit, offset: selected.offset, signal: controller.signal,
        extensions: { inspector: { ids: selected.result.hits.map(hit => hit.id), expectedRevision: selected.result.revision } } });
      if (!current()) return;
      const data = result.extensions?.inspector as InspectorData | undefined;
      if (!data || data.kind !== 'raveldex-inspector-v1' || !Array.isArray(data.documents) || data.documents.length !== selected.result.hits.length) fail('INCOMPATIBLE_CAPABILITY', 'inspector');
      if (result.revision !== selected.result.revision || data.revision !== selected.result.revision) fail('REVISION_MISMATCH', 'inspector');
      if (result.total !== selected.result.total || result.hits.length !== selected.result.hits.length || result.hits.some((h, i) => h.id !== selected.result.hits[i]?.id || h.score !== selected.result.hits[i]?.score) ||
          data.documents.some((item, i) => item.id !== selected.result.hits[i]?.id)) fail('INCOMPATIBLE_CAPABILITY', 'inspector.result');
      const json = JSON.stringify(data, null, 2);
      if (json.length > 2_000_000) fail('LIMIT_EXCEEDED', 'inspector.display');
      if (!current()) return;
      inspectorData.textContent = json; inspectorStatus.textContent = `Inspector for revision ${data.revision}. ${data.documents.length} selected documents.`;
    } catch (reason) {
      if (!current()) return;
      inspectorError.textContent = `Inspector failed (${errorCode(reason)}). Close and reopen to retry.`; inspectorError.hidden = false;
      inspectorStatus.textContent = 'Inspector failed.';
    } finally {
      if (current()) { dialog.setAttribute('aria-busy', 'false'); inspectorController = undefined; }
    }
  };
  listen(form, 'submit', event => { event.preventDefault(); void execute(); });
  listen(input, 'input', () => schedule());
  listen(input, 'compositionstart', () => { composing = true; invalidate(); status.textContent = 'Finish composing to search.'; });
  listen(input, 'compositionend', () => { composing = false; schedule(); });
  for (const facet of facets) listen(facet.select, 'change', () => { void execute(); });
  listen(retry, 'click', () => { if (retry.getAttribute('aria-disabled') !== 'true') void execute(); });
  listen(previous, 'click', () => { const selected = snapshot; if (selected && previous.getAttribute('aria-disabled') !== 'true') void execute(Math.max(0, selected.offset - captured.pageSize)); });
  listen(next, 'click', () => { const selected = snapshot; if (selected && next.getAttribute('aria-disabled') !== 'true') void execute(selected.offset + selected.result.hits.length); });
  listen(inspect, 'click', () => { if (inspect.getAttribute('aria-disabled') !== 'true') void openInspector(); });
  listen(close, 'click', () => closeInspector(true));
  listen(dialog, 'cancel', event => { event.preventDefault(); closeInspector(true); });
  const handle: UIHandle = Object.freeze({
    search: (): Promise<void> => execute(),
    destroy: (): void => {
      if (destroyed) return;
      destroyed = true; sequence++; cancelTimer(); searchController?.abort(); searchController = undefined;
      closeInspector(false);
      for (const remove of listeners) remove();
      mounted.delete(captured.root);
      captured.root.replaceChildren(...originalNodes);
      snapshot = undefined;
    },
  });
  captured.root.replaceChildren(shell);
  mounted.set(captured.root, handle);
  void execute();
  return handle;
}
