import type { Raveldex } from '../../core/contracts/types.js';
import { ERROR_CODES } from '../../core/errors/error.js';
import { captureOptions, displayName, fail, record } from './options.js';
import { assertResult } from './render.js';
import { queryFromText } from './query.js';
import { mounted } from './mounts.js';
import { registerModalShortcut } from './modal-shortcuts.js';
import type { UIDocument } from './types.js';

export type { UIDocument } from './types.js';

/** Plain text. Result messages accept {total}/{count}; error accepts {code}. */
export interface DropdownUIMessages {
  readonly label: string;
  readonly placeholder: string;
  readonly submit: string;
  readonly clear: string;
  readonly idle: string;
  readonly composing: string;
  readonly searching: string;
  readonly noResults: string;
  readonly resultsLabel: string;
  readonly resultsOne: string;
  readonly resultsMany: string;
  readonly error: string;
  readonly retry: string;
  readonly fullResults: string;
  readonly closed: string;
  readonly noSpace: string;
}
export interface DropdownUIOptions {
  readonly root: HTMLElement;
  /** Borrowed. The application retains disposal and content ownership. */
  readonly engine: Raveldex;
  readonly documents: readonly UIDocument[];
  readonly fullResults: { readonly url: string; readonly queryParameter?: string };
  /** Default 5; integer 1..20. There is no hidden accumulated result window. */
  readonly maxResults?: number;
  readonly debounceMs?: number;
  readonly mode?: 'text' | 'prefix';
  readonly shortcut?: boolean;
  readonly messages?: Partial<DropdownUIMessages>;
}
export interface DropdownUIHandle {
  readonly search: (text?: string) => Promise<void>;
  readonly open: () => void;
  readonly close: () => void;
  readonly clear: () => void;
  readonly destroy: () => void;
}

const defaults: DropdownUIMessages = Object.freeze({
  label: 'Search this site', placeholder: 'Search', submit: 'Search', clear: 'Clear',
  idle: 'Enter a search term.', composing: 'Finish composing to search.', searching: 'Searching…',
  noResults: 'No results.', resultsLabel: 'Search results', resultsOne: '{total} result. Showing {count}.',
  resultsMany: '{total} results. Showing {count}.', error: 'Search could not complete ({code}). Try again.',
  retry: 'Retry search', fullResults: 'See all results', closed: 'Search dismissed. Edit the query or use Search to reopen.',
  noSpace: 'Not enough space for this result list. Open the full-results page.',
});
interface OpenDropdown { readonly close: () => void }
const opened = new WeakMap<Document, OpenDropdown>();
let mountNumber = 0;
type Direction = 'first' | 'last';
interface Row { readonly cell: HTMLDivElement; readonly link: HTMLAnchorElement }
interface Flight { readonly ticket: number; readonly raw: string; readonly promise: Promise<void>; intent: Direction | undefined }
const format = (text: string, values: Readonly<Record<string, string | number>>): string =>
  text.replace(/\{([A-Za-z]+)\}/g, (token, name: string) => Object.hasOwn(values, name) ? String(values[name]) : token);

function validText(text: string): boolean {
  if (text.length > 2048 || /[\r\n]/.test(text)) return false;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

/** Explicit borrowed-engine combobox. Native popovers and CSS stay optional to core. */
export function mountRaveldexDropdown(options: DropdownUIOptions): DropdownUIHandle {
  const descriptor = options && typeof options === 'object' ? Object.getOwnPropertyDescriptor(options, 'root') : undefined;
  if (!descriptor || !('value' in descriptor)) fail('INVALID_OPTIONS', 'root');
  const existing = mounted.get(descriptor.value as HTMLElement);
  if (existing) {
    if (existing.kind !== 'dropdown') fail('INVALID_OPTIONS', 'root');
    return existing.handle as DropdownUIHandle;
  }
  const o = record(options, ['root', 'engine', 'documents', 'fullResults', 'maxResults', 'debounceMs', 'mode', 'shortcut', 'messages'], 'dropdown.options');
  const maximum = o.maxResults === undefined ? 5 : o.maxResults;
  if (typeof maximum !== 'number' || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > 20) fail('INVALID_OPTIONS', 'dropdown.maxResults');
  const mode = o.mode === undefined ? 'prefix' : o.mode;
  if (mode !== 'prefix' && mode !== 'text') fail('INVALID_OPTIONS', 'dropdown.mode');
  const shortcut = o.shortcut === undefined ? false : o.shortcut;
  if (typeof shortcut !== 'boolean') fail('INVALID_OPTIONS', 'dropdown.shortcut');
  const captured = captureOptions({ root: o.root as HTMLElement, engine: o.engine as Raveldex,
    documents: o.documents as readonly UIDocument[], pageSize: maximum, mode,
    ...(o.debounceMs === undefined ? {} : { debounceMs: o.debounceMs as number }) });
  const route = record(o.fullResults, ['url', 'queryParameter'], 'dropdown.fullResults');
  const rawURL = displayName(route.url, 2048, 'dropdown.fullResults.url');
  const queryParameter = route.queryParameter === undefined ? 'q' : displayName(route.queryParameter, 64, 'dropdown.fullResults.queryParameter');
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(queryParameter)) fail('INVALID_OPTIONS', 'dropdown.fullResults.queryParameter');
  let destination: URL;
  try { destination = new URL(rawURL, captured.root.ownerDocument.baseURI); }
  catch { fail('INVALID_OPTIONS', 'dropdown.fullResults.url'); }
  if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password) fail('INVALID_OPTIONS', 'dropdown.fullResults.url');
  const overrides = record(o.messages ?? {}, Object.keys(defaults), 'dropdown.messages');
  const messages = { ...defaults };
  for (const key of Object.keys(overrides) as (keyof DropdownUIMessages)[]) {
    Object.defineProperty(messages, key, { value: displayName(overrides[key], 512, `dropdown.messages.${key}`), enumerable: true });
  }
  Object.freeze(messages);
  const doc = captured.root.ownerDocument, win = doc.defaultView;
  if (!win || typeof win.AbortController !== 'function' || typeof win.setTimeout !== 'function') fail('UNSUPPORTED_ENVIRONMENT', 'host');
  const popup = doc.createElement('div');
  if (typeof popup.showPopover !== 'function' || typeof popup.hidePopover !== 'function') fail('UNSUPPORTED_ENVIRONMENT', 'dropdown.popover');
  const knownRoots: ShadowRoot[] = [];
  let tree: Node = captured.root.getRootNode();
  while (tree instanceof win.ShadowRoot) { knownRoots.push(tree); tree = tree.host.getRootNode(); }
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, part: string, text?: string): HTMLElementTagNameMap[K] => {
    const value = doc.createElement(tag); value.className = `raveldex-dropdown__${part}`; value.setAttribute(`data-raveldex-dropdown-${part}`, '');
    if (text !== undefined) value.textContent = text;
    return value;
  };
  const id = `raveldex-dropdown-${++mountNumber}`;
  const indices = new Map([...captured.documents.keys()].map((key, index) => [key, index]));
  const shell = node('div', 'root'); shell.className = 'raveldex-dropdown'; shell.dataset.state = 'idle'; shell.setAttribute('aria-busy', 'false');
  const form = node('form', 'form'); form.setAttribute('role', 'search'); form.setAttribute('aria-label', messages.label);
  const label = node('label', 'label', messages.label); label.htmlFor = `${id}-query`;
  const input = node('input', 'input'); input.id = label.htmlFor; input.type = 'text'; input.maxLength = 2048;
  input.autocomplete = 'off'; input.placeholder = messages.placeholder; input.setAttribute('role', 'combobox');
  input.setAttribute('aria-haspopup', 'grid'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
  const submit = node('button', 'submit', messages.submit); submit.type = 'submit';
  const clear = node('button', 'clear', messages.clear); clear.type = 'button';
  form.append(label, input, submit, clear);
  const status = node('p', 'status', messages.idle); status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  const retry = node('button', 'retry', messages.retry); retry.type = 'button'; retry.hidden = true;
  const full = node('a', 'full-results', messages.fullResults); full.hidden = true;
  popup.className = 'raveldex-dropdown__popup'; popup.setAttribute('data-raveldex-dropdown-popup', ''); popup.id = `${id}-popup`;
  popup.setAttribute('popover', 'manual'); popup.setAttribute('role', 'grid'); popup.setAttribute('aria-label', messages.resultsLabel);
  input.setAttribute('aria-controls', popup.id);
  if (shortcut) input.setAttribute('aria-keyshortcuts', 'Control+K Meta+K');
  form.append(full); shell.append(form, status, retry, popup);
  const originalNodes = [...captured.root.childNodes], listeners: (() => void)[] = [];
  let destroyed = false, wanted = false, composing = false, suppressedComposition = false, imeSubmit = false;
  let compositionValue: string | undefined, timer: number | undefined, sequence = 0, controller: AbortController | undefined;
  let flight: Flight | undefined, rows: Row[] = [], activeIndex = -1, presented: number | undefined, snapshotRaw: string | undefined;
  let nativeTotal: number | undefined, geometryFailure: 'space' | 'anchor' | undefined, nativeClosing = false;
  const listen = (target: EventTarget, type: string, callback: EventListener, capture = false): void => {
    target.addEventListener(type, callback, capture); listeners.push(() => target.removeEventListener(type, callback, capture));
  };
  const focused = (): Element | null => {
    let element = doc.activeElement;
    while (element) {
      const shadow = element.shadowRoot ?? knownRoots.find(root => root.host === element);
      if (!shadow?.activeElement) break;
      element = shadow.activeElement;
    }
    return element;
  };
  const ancestor = (outer: Element, inner: Element): boolean => {
    let element: Element | null = inner;
    while (element) { if (element === outer) return true; element = element.parentElement ?? (element.getRootNode() as ShadowRoot).host ?? null; }
    return false;
  };
  const foreignModal = (): boolean => {
    if ([...doc.querySelectorAll('dialog:modal')].some(dialog => !ancestor(dialog, captured.root))) return true;
    let element = focused();
    if (element && !element.shadowRoot && !knownRoots.some(root => root.host === element) &&
      (element.localName.includes('-') || ['article', 'aside', 'blockquote', 'div', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'header', 'main', 'nav', 'p', 'section', 'span'].includes(element.localName))) return true;
    while (element) {
      if (element.matches('dialog:modal') && !ancestor(element, captured.root)) return true;
      element = element.parentElement ?? (element.getRootNode() as ShadowRoot).host ?? null;
    }
    return false;
  };
  const usable = (): boolean => !destroyed && mounted.get(captured.root)?.handle === handle && captured.root.ownerDocument === doc &&
    captured.root.isConnected && shell.parentNode === captured.root && input.isConnected && !input.matches(':disabled');
  const live = (ticket: number): boolean => usable() && sequence === ticket && !foreignModal();
  const visible = (): boolean => popup.isConnected && popup.matches(':popover-open');
  const announce = (text: string): void => { if (status.textContent !== text) status.textContent = text; };
  const clearActive = (resetIntent = true): void => {
    input.removeAttribute('aria-activedescendant'); activeIndex = -1;
    if (resetIntent && flight) flight.intent = undefined;
    for (const row of rows) { row.cell.setAttribute('aria-selected', 'false'); row.cell.classList.remove('is-active'); }
  };
  const cancelTimer = (): void => { if (timer !== undefined) { win.clearTimeout(timer); timer = undefined; } };
  const invalidate = (): number => {
    const ticket = ++sequence; cancelTimer();
    const old = controller; controller = undefined; flight = undefined;
    clearActive(); rows = []; snapshotRaw = undefined; presented = undefined; nativeTotal = undefined;
    try {
      popup.replaceChildren();
      if (sequence !== ticket || destroyed) return ticket;
      if (visible() && !nativeClosing) popup.hidePopover();
      if (sequence !== ticket || destroyed) return ticket;
      input.setAttribute('aria-expanded', 'false'); shell.setAttribute('aria-busy', 'false'); retry.hidden = true;
      if (opened.get(doc) === registration) opened.delete(doc);
    } finally { old?.abort(); }
    return ticket;
  };
  const handoff = (): void => {
    const raw = input.value;
    full.hidden = composing || suppressedComposition || !raw.trim().length || !validText(raw);
    if (!full.hidden) { const url = new URL(destination.href); url.searchParams.set(queryParameter, raw); full.href = url.href; }
    else full.removeAttribute('href');
  };
  const close = (): void => {
    if (destroyed) return;
    wanted = false;
    if (composing) suppressedComposition = true;
    composing = false; compositionValue = undefined;
    const ticket = invalidate();
    // Foreign modality can dismiss our presentation. Its focus ownership does
    // not prevent clearing obsolete feedback on this still-owned mount.
    if (!usable() || sequence !== ticket) return;
    handoff(); shell.dataset.state = 'closed'; announce(messages.closed);
  };
  const registration: OpenDropdown = { close };
  const reconcile = (): void => { if (presented === sequence && !visible()) close(); };
  const canNavigate = (): boolean => wanted && !composing && presented === sequence && visible() && snapshotRaw === input.value && live(sequence);
  const revealActive = (): void => {
    const row = rows[activeIndex]; if (!row || !visible()) return;
    const bounds = popup.getBoundingClientRect(), cell = row.cell.getBoundingClientRect();
    const top = bounds.top + popup.clientTop, bottom = top + popup.clientHeight;
    if (cell.top < top || cell.height > popup.clientHeight) popup.scrollTop -= top - cell.top;
    else if (cell.bottom > bottom) popup.scrollTop += cell.bottom - bottom;
  };
  const setActive = (index: number): void => {
    if (!canNavigate() || !rows.length) return;
    clearActive(false); activeIndex = Math.max(0, Math.min(index, rows.length - 1));
    const row = rows[activeIndex]!;
    row.cell.setAttribute('aria-selected', 'true'); row.cell.classList.add('is-active'); input.setAttribute('aria-activedescendant', row.cell.id);
    revealActive();
  };
  const position = (): boolean => {
    geometryFailure = undefined;
    if (!usable()) { geometryFailure = 'anchor'; return false; }
    const view = win.visualViewport, leftEdge = view?.offsetLeft ?? 0, topEdge = view?.offsetTop ?? 0;
    const width = view?.width ?? win.innerWidth, height = view?.height ?? win.innerHeight;
    const anchor = input.getBoundingClientRect(), panel = shell.getBoundingClientRect(), gutter = 8;
    if (width <= gutter * 2 || height <= gutter * 2 || !anchor.width || !anchor.height ||
      anchor.bottom <= topEdge || anchor.top >= topEdge + height || anchor.right <= leftEdge || anchor.left >= leftEdge + width) { geometryFailure = 'anchor'; return false; }
    const availableBelow = Math.max(0, topEdge + height - gutter - panel.bottom), availableAbove = Math.max(0, panel.top - topEdge - gutter);
    const need = Math.min(popup.scrollHeight || 160, 160), above = availableBelow < need && availableAbove > availableBelow;
    const available = above ? availableAbove : availableBelow;
    const style = win.getComputedStyle(popup), borders = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    if (available < 44 + borders) { geometryFailure = 'space'; return false; }
    const inlineSize = Math.min(anchor.width, width - gutter * 2), left = Math.max(leftEdge + gutter, Math.min(anchor.left, leftEdge + width - gutter - inlineSize));
    popup.style.setProperty('--_left', `${left}px`); popup.style.setProperty('--_width', `${inlineSize}px`);
    popup.style.setProperty('--_max-height', `${available}px`);
    // While closed, assign a provisional top; after opening, use its constrained height.
    const blockSize = visible() ? popup.getBoundingClientRect().height : Math.min(available, popup.scrollHeight || 160);
    popup.style.setProperty('--_top', `${above ? Math.max(topEdge + gutter, panel.top - blockSize) : panel.bottom}px`);
    return true;
  };
  const collapseForSpace = (ticket: number, total: number): void => {
    if (!live(ticket)) return;
    wanted = false; clearActive(); rows = []; snapshotRaw = undefined; presented = undefined;
    if (visible()) popup.hidePopover();
    if (!live(ticket)) return;
    input.setAttribute('aria-expanded', 'false'); popup.replaceChildren();
    if (!live(ticket)) return;
    if (opened.get(doc) === registration) opened.delete(doc);
    shell.dataset.state = 'results'; shell.setAttribute('aria-busy', 'false');
    handoff(); announce(format(total === 1 ? messages.resultsOne : messages.resultsMany, { total, count: 0 }) + ' ' + messages.noSpace);
  };
  const show = (ticket: number): boolean => {
    if (!live(ticket) || !wanted || !rows.length || !position()) return false;
    const previous = opened.get(doc); opened.set(doc, registration);
    if (previous && previous !== registration) previous.close();
    if (!live(ticket) || !wanted || opened.get(doc) !== registration) return false;
    if (!visible()) popup.showPopover();
    if (!live(ticket) || !wanted || opened.get(doc) !== registration || !visible()) {
      // An opening callback can close/destroy before the native show completes.
      if (visible() && presented !== sequence) popup.hidePopover();
      return false;
    }
    if (!position()) return false;
    presented = ticket; input.setAttribute('aria-expanded', 'true'); return true;
  };
  const setComposing = (): void => {
    const ticket = invalidate();
    if (!live(ticket)) return;
    wanted = true;
    handoff(); shell.dataset.state = 'composing'; announce(messages.composing);
  };
  const execute = (intent?: Direction): Promise<void> => {
    if (!usable() || foreignModal()) return Promise.resolve();
    reconcile();
    if (!usable() || foreignModal()) return Promise.resolve();
    if (composing) { setComposing(); return Promise.resolve(); }
    const raw = input.value;
    if (flight?.raw === raw && live(flight.ticket)) { if (intent) flight.intent = intent; return flight.promise; }
    const ticket = invalidate();
    if (!live(ticket)) return Promise.resolve();
    wanted = true; handoff();
    if (raw.length <= 2048 && !raw.trim().length) { shell.dataset.state = 'idle'; announce(messages.idle); return Promise.resolve(); }
    const active = new win.AbortController(); controller = active;
    let finish!: () => void;
    const promise = new Promise<void>(resolve => { finish = resolve; });
    const job: Flight = { ticket, raw, promise, intent }; flight = job;
    const current = (): boolean => wanted && live(ticket) && controller === active && !active.signal.aborted &&
      (presented === undefined || visible());
    shell.dataset.state = 'loading'; shell.setAttribute('aria-busy', 'true'); announce(messages.searching);
    void Promise.resolve().then(async () => {
      try {
        if (!current()) return;
        const found = await captured.engine.search(queryFromText(raw, captured.mode), { limit: maximum, offset: 0, signal: active.signal });
        if (!current()) return;
        assertResult(found, captured);
        if (found.hits.length !== Math.min(maximum, found.total)) fail('INCOMPATIBLE_CAPABILITY', 'dropdown.result.hits');
        const fragment = doc.createDocumentFragment(), nextRows: Row[] = [];
        for (const hit of found.hits) {
          const display = captured.documents.get(hit.id)!;
          const row = node('div', 'row'); row.setAttribute('role', 'row');
          const cell = node('div', 'cell'); cell.setAttribute('role', 'gridcell'); cell.id = `${id}-result-${indices.get(hit.id)!}`;
          cell.setAttribute('aria-selected', 'false'); cell.setAttribute('data-raveldex-dropdown-result', hit.id);
          const link = node('a', 'link', display.title); link.href = display.url; link.tabIndex = -1;
          cell.append(link); row.append(cell); fragment.append(row); nextRows.push({ cell, link });
        }
        if (!current()) return;
        clearActive(false); popup.replaceChildren(fragment);
        if (!current()) return;
        rows = nextRows; snapshotRaw = raw; nativeTotal = found.total;
        if (rows.length && !show(ticket)) {
          if (live(ticket)) { if (geometryFailure === 'space') collapseForSpace(ticket, found.total); else close(); }
          return;
        }
        if (!current()) return;
        shell.dataset.state = found.total ? 'results' : 'empty';
        announce(found.total ? format(found.total === 1 ? messages.resultsOne : messages.resultsMany, { total: found.total, count: rows.length }) : messages.noResults);
        if (!current()) return;
        if (rows.length && !position()) { if (geometryFailure === 'space') collapseForSpace(ticket, found.total); else close(); return; }
        if (job.intent && rows.length) setActive(job.intent === 'first' ? 0 : rows.length - 1);
      } catch (reason) {
        if (!current()) return;
        const value = typeof reason === 'object' && reason !== null ? Object.getOwnPropertyDescriptor(reason, 'code') : undefined;
        const code = value && 'value' in value && (ERROR_CODES as readonly unknown[]).includes(value.value) ? String(value.value) : 'INTERNAL_ERROR';
        clearActive(); rows = []; snapshotRaw = undefined; presented = undefined; popup.replaceChildren();
        if (!current()) return;
        if (visible()) popup.hidePopover();
        if (!current()) return;
        input.setAttribute('aria-expanded', 'false'); shell.dataset.state = 'error'; announce(format(messages.error, { code }));
        if (current()) { retry.hidden = false; wanted = false; if (opened.get(doc) === registration) opened.delete(doc); }
      } finally {
        if (controller === active) { controller = undefined; if (flight === job) flight = undefined; }
        if (live(ticket)) shell.setAttribute('aria-busy', 'false');
        finish();
      }
    });
    return promise;
  };
  const schedule = (): void => {
    if (!usable() || foreignModal()) return;
    if (composing) { setComposing(); return; }
    const ticket = invalidate();
    if (!live(ticket)) return;
    wanted = true; handoff();
    if (input.value.length <= 2048 && !input.value.trim().length) { shell.dataset.state = 'idle'; announce(messages.idle); return; }
    shell.dataset.state = 'waiting'; announce('');
    if (live(ticket)) timer = win.setTimeout(() => { timer = undefined; void execute(); }, captured.debounceMs);
  };
  const focusAndSearch = (): void => {
    if (!usable() || foreignModal()) return;
    const ticket = sequence; input.focus();
    if (live(ticket) && focused() === input) void execute();
  };
  const clearInput = (): void => {
    if (!usable()) return;
    const before = sequence, active = focused();
    if (active === retry || active === full || active && popup.contains(active)) {
      // Clear removes these owned controls. Recover only their current focus;
      // an authored focus callback can cancel or replace this operation.
      input.focus();
      if (!usable() || sequence !== before || focused() !== input) return;
    }
    input.value = ''; suppressedComposition = composing || suppressedComposition; composing = false; compositionValue = undefined; wanted = false;
    const ticket = invalidate();
    if (usable() && sequence === ticket) { handoff(); shell.dataset.state = 'idle'; announce(messages.idle); }
  };
  const handle: DropdownUIHandle = Object.freeze({
    search: (text?: string): Promise<void> => {
      if (!usable()) return Promise.resolve();
      if (text !== undefined) {
        if (typeof text !== 'string' || /[\r\n]/.test(text)) fail('INVALID_OPTIONS', 'dropdown.search');
        input.value = text;
      }
      return execute();
    },
    open: focusAndSearch, close, clear: clearInput,
    destroy: (): void => {
      if (destroyed) return;
      destroyed = true; wanted = false; sequence++; cancelTimer(); clearActive(); rows = []; presented = undefined; snapshotRaw = undefined;
      for (const remove of listeners) remove();
      const old = controller; controller = undefined; flight = undefined; old?.abort();
      if (visible()) popup.hidePopover();
      if (opened.get(doc) === registration) opened.delete(doc);
      if (mounted.get(captured.root)?.handle !== handle) return;
      mounted.delete(captured.root); captured.root.replaceChildren(...originalNodes);
    },
  });
  listen(form, 'submit', event => { event.preventDefault(); if (!imeSubmit) void execute(); });
  listen(input, 'input', event => {
    if (suppressedComposition) return;
    if ((event as InputEvent).isComposing) composing = true;
    if (!composing && compositionValue === input.value) { compositionValue = undefined; return; }
    compositionValue = undefined; schedule();
  });
  listen(input, 'compositionstart', () => { composing = true; suppressedComposition = false; compositionValue = undefined; setComposing(); });
  listen(input, 'compositionend', () => {
    if (suppressedComposition) {
      suppressedComposition = false; composing = false; compositionValue = input.value;
      if (usable()) handoff();
      return;
    }
    if (!composing) return;
    composing = false; compositionValue = input.value; schedule();
  });
  listen(input, 'keydown', event => {
    const key = event as KeyboardEvent;
    if (key.defaultPrevented) return;
    if (key.key === 'Tab' && !key.altKey && !key.ctrlKey && !key.metaKey) {
      if (visible() || ['waiting', 'loading', 'composing'].includes(shell.dataset.state ?? '')) close();
      return;
    }
    if (composing || key.isComposing || key.keyCode === 229) {
      clearActive(); imeSubmit = true; void Promise.resolve().then(() => { imeSubmit = false; }); return;
    }
    reconcile();
    const modified = key.altKey || key.ctrlKey || key.metaKey || key.shiftKey;
    if (!modified && (key.key === 'ArrowDown' || key.key === 'ArrowUp')) {
      key.preventDefault();
      if (canNavigate() && rows.length) setActive(activeIndex < 0 ? key.key === 'ArrowDown' ? 0 : rows.length - 1 : activeIndex + (key.key === 'ArrowDown' ? 1 : -1));
      else void execute(key.key === 'ArrowDown' ? 'first' : 'last');
    } else if (!modified && key.key === 'Enter' && canNavigate() && activeIndex >= 0) {
      key.preventDefault(); rows[activeIndex]!.link.click();
    } else if (!modified && key.key === 'Escape' && (wanted || timer !== undefined || controller !== undefined || visible())) {
      key.preventDefault(); close();
    } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Backspace', 'Delete'].includes(key.key) || key.key.length === 1 || modified) clearActive();
  });
  listen(input, 'blur', event => {
    // Native blur precedes the next control receiving DOM focus. Its related
    // target is already authoritative; transient BODY must not erase a link
    // before the pointer can release and perform its native activation.
    const next = (event as FocusEvent).relatedTarget;
    if (next instanceof win.Node && captured.root.contains(next)) return;
    const ticket = sequence;
    void Promise.resolve().then(() => { const active = focused(); if (wanted && sequence === ticket && (!active || !captured.root.contains(active))) close(); });
  });
  listen(clear, 'click', clearInput); listen(retry, 'click', focusAndSearch);
  listen(popup, 'beforetoggle', event => {
    const state = (event as ToggleEvent).newState;
    if (state === 'open') {
      if (!wanted || !rows.length || !live(sequence)) event.preventDefault();
    } else if (state === 'closed' && presented === sequence) {
      // Native visibility changes before its queued toggle event. Invalidate
      // semantics and work synchronously without recursively hiding this popover.
      nativeClosing = true;
      void Promise.resolve().then(() => { nativeClosing = false; });
      close();
    }
  });
  listen(popup, 'toggle', () => {
    if (destroyed) return;
    if (presented === sequence && !visible()) close();
    else if (visible() && (presented !== sequence || !wanted)) popup.hidePopover();
  });
  const resolvedInside = new WeakMap<Event, boolean>();
  const outside = (event: Event): void => {
    if (!wanted || destroyed) return;
    const path = event.composedPath();
    if (path.includes(captured.root) || path.includes(shell) || path.includes(popup)) { resolvedInside.set(event, true); return; }
    if (knownRoots.some(root => path.includes(root.host))) {
      const ticket = sequence;
      void Promise.resolve().then(() => { if (wanted && sequence === ticket && !resolvedInside.get(event)) close(); });
    } else { resolvedInside.set(event, false); close(); }
  };
  for (const target of [doc, ...knownRoots]) { listen(target, 'pointerdown', outside, true); listen(target, 'focusin', outside, true); }
  const reposition = (event: Event): void => {
    if (!visible()) return;
    if (event.target instanceof win.Node && popup.contains(event.target)) return;
    if (!position()) { if (geometryFailure === 'space' && nativeTotal !== undefined) collapseForSpace(sequence, nativeTotal); else close(); }
    else revealActive();
  };
  listen(win, 'resize', reposition); listen(win, 'scroll', reposition, true);
  if (win.visualViewport) { listen(win.visualViewport, 'resize', reposition); listen(win.visualViewport, 'scroll', reposition); }
  listen(win, 'blur', () => { if (wanted) close(); });
  if (shortcut) listeners.push(registerModalShortcut(doc, {
    eligible: () => { const active = focused() as HTMLElement | null; return usable() && !foreignModal() &&
      !(active && (active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName))); },
    isOpen: visible,
    open: () => { focusAndSearch(); return focused() === input; },
  }));
  mounted.set(captured.root, { kind: 'dropdown', handle });
  try { captured.root.replaceChildren(shell); }
  catch (reason) { if (mounted.get(captured.root)?.handle === handle) { try { handle.destroy(); } catch { /* Preserve the original mutation failure. */ } } throw reason; }
  return handle;
}
