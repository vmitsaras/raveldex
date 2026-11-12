import type { DirectorySnapshot, DirectoryState } from './directory-types.js';
import type { DirectoryViewHandle } from './directory-view-types.js';
import type { UIDocument } from './types.js';
import type { CapturedDirectoryView } from './directory-view-options.js';
import { directoryMessage as message } from './directory-view-options.js';
import { failDirectory, queryText, stateKey } from './directory-state.js';
import { mounted } from './mounts.js';
import { queryPreview } from './search-feedback.js';
/** Private presentation seam; public entries admit their own fixed data contracts. */
export interface DirectoryViewExtension {
  readonly kind: 'directory-cards';
  readonly initialize: (shell: HTMLElement, live: () => boolean) => void;
  readonly render: (item: HTMLLIElement, link: HTMLAnchorElement, display: UIDocument) => void;
  readonly clear: () => void;
  readonly destroy: () => void;
  readonly extend: (handle: DirectoryViewHandle) => DirectoryViewHandle;
}

/** Stable native controls over an explicitly supplied, borrowed directory. */
export function mountDirectoryView(captured: CapturedDirectoryView, extension?: DirectoryViewExtension): DirectoryViewHandle {
  const { root, controller, config, messages } = captured;
  const existing = mounted.get(root);
  if (existing) { if (existing.kind !== (extension?.kind ?? 'directory')) failDirectory('view.root'); return existing.handle as DirectoryViewHandle; }
  const doc = root.ownerDocument, win = doc.defaultView!;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, name?: string, content?: string): HTMLElementTagNameMap[K] => {
    const element = doc.createElement(tag);
    if (name) { element.className = `raveldex-directory__${name}`; element.setAttribute(`data-raveldex-directory-${name}`, ''); }
    if (content !== undefined) element.textContent = content;
    return element;
  };
  const button = (name: string, label: string): HTMLButtonElement => { const b = node('button', name, label); b.type = 'button'; return b; };
  const shell = node('div'); shell.className = 'raveldex-directory';
  const form = node('form', 'form'); form.setAttribute('role', 'search'); form.setAttribute('aria-label', messages.label);
  const inputLabel = node('label', 'search-label', messages.label), input = node('input', 'input');
  input.type = 'search'; input.maxLength = 2_048; input.placeholder = messages.placeholder; inputLabel.append(input);
  const submit = button('submit', messages.submit); submit.type = 'submit';
  const clear = button('clear', messages.clear); form.append(inputLabel, submit, clear);
  const details = node('details', 'filters'), summary = node('summary', 'filters-summary', messages.filters);
  details.open = captured.filtersOpen; details.append(summary, node('p', 'hint', messages.countHint));
  const grid = node('div', 'filter-groups'); details.append(grid);
  const checks = captured.groups.map(group => {
    const fieldset = node('fieldset', 'group'); fieldset.append(node('legend', 'legend', group.label));
    const choices = group.values.map(value => {
      const label = node('label', 'choice'), input = node('input', 'checkbox'), name = node('span', 'choice-label', value.label), count = node('span', 'count');
      input.type = 'checkbox'; input.value = value.value; input.setAttribute('data-field', group.field); label.append(input, name, count); fieldset.append(label);
      return { ...value, input, count };
    });
    const omitted = node('p', 'omitted'); omitted.hidden = true; fieldset.append(omitted); grid.append(fieldset);
    return { ...group, choices, omitted };
  });
  const closeFilters = button('close-filters', messages.closeFilters); details.append(closeFilters); details.hidden = !checks.length;
  const chips = node('ul', 'chips'); chips.setAttribute('aria-label', messages.selectedFilters);
  const status = node('p', 'status'); status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  const retry = button('retry', messages.retry); retry.hidden = true;
  const region = node('section', 'results-region'); region.setAttribute('aria-label', messages.resultsLabel);
  const heading = node('h2', 'heading', messages.resultsLabel), results = node('ol', 'results');
  const navigation = node('nav', 'navigation'); navigation.setAttribute('aria-label', messages.resultsLabel);
  navigation.hidden = true;
  const previous = button('previous', messages.previous), pageSummary = node('p', 'page'), next = button('next', messages.next);
  navigation.append(previous, pageSummary, next); region.append(heading, results, navigation); shell.append(form, details, chips, status, retry, region);
  const original = Array.from(root.childNodes), removers: (() => void)[] = [], chipNodes = new Map<string, { li: HTMLLIElement; button: HTMLButtonElement }>();
  const chipDetails = new WeakMap<HTMLButtonElement, { field: string; value: string }>();
  let chipOrder: string[] = [];
  let ended = false, local = false, dirty = false, composing = false, discardComposition = false, serial = 0;
  let activatedChip: string | undefined;
  let navigationAvailable = false, retryAvailable = false;
  let timer: number | undefined, observed = controller.getSnapshot(), unsubscribe = (): void => {};
  const activeElement = (): Element | null => {
    const scope = root.getRootNode() as Document | ShadowRoot;
    return scope.activeElement ?? doc.activeElement;
  };
  const live = (): boolean => !ended && mounted.get(root)?.handle === handle && root.ownerDocument === doc && shell.parentNode === root;
  const listen = (target: EventTarget, type: string, callback: EventListener): void => { target.addEventListener(type, callback); removers.push(() => target.removeEventListener(type, callback)); };
  const unavailable = (element: HTMLButtonElement, value: boolean): void => { element.setAttribute('aria-disabled', String(value)); };
  const announce = (text: string): void => { if (status.textContent !== text) status.textContent = text; };
  const updateRecovery = (): void => {
    if (!live()) return;
    const active = activeElement();
    retry.hidden = !retryAvailable && active !== retry;
    navigation.hidden = !navigationAvailable && !navigation.contains(active);
  };
  const cancelTimer = (): void => { if (timer !== undefined) { win.clearTimeout(timer); timer = undefined; } };
  const recoverResults = (ticket: number): boolean => {
    if (results.contains(activeElement())) input.focus({ preventScroll: true });
    return live() && serial === ticket;
  };
  function render(value: DirectorySnapshot): void {
    if (!live()) return;
    const ticket = ++serial;
    if (!recoverResults(ticket) || controller.getSnapshot() !== value) return;
    const pending = dirty || composing, found = !pending && value.status === 'ready' ? value.result : undefined;
    if (!pending) input.value = value.state.text;
    const desired = checks.flatMap(group => group.choices.filter(choice => value.state.filters[group.field]!.includes(choice.value)).map(choice => ({
      key: JSON.stringify([group.field, choice.value]), group, choice,
    })));
    const desiredKeys = new Set(desired.map(item => item.key)), oldKeys = chipOrder, activated = activatedChip;
    activatedChip = undefined;
    // Pointer activation does not focus buttons in every native browser policy.
    const removed = oldKeys.find(key => !desiredKeys.has(key) && (chipNodes.get(key)?.button === activeElement() || key === activated));
    if (removed !== undefined) {
      const index = oldKeys.indexOf(removed), target = oldKeys.slice(index + 1).find(key => desiredKeys.has(key)) ?? oldKeys.slice(0, index).reverse().find(key => desiredKeys.has(key));
      (target ? chipNodes.get(target)!.button : input).focus({ preventScroll: true });
      if (!live() || serial !== ticket || controller.getSnapshot() !== value) return;
    }
    for (const [key, item] of chipNodes) if (!desiredKeys.has(key)) { item.li.remove(); chipNodes.delete(key); }
    let anchor: ChildNode | null = chips.firstChild;
    for (const item of desired) {
      let chip = chipNodes.get(item.key);
      if (!chip) {
        const li = node('li', 'chip'), b = button('remove', message(messages.remove, { group: item.group.label, value: item.choice.label })); li.append(b);
        chip = { li, button: b }; chipNodes.set(item.key, chip);
        chipDetails.set(b, { field: item.group.field, value: item.choice.value });
      }
      if (chip.li !== anchor) chips.insertBefore(chip.li, anchor); else anchor = anchor.nextSibling;
    }
    chipOrder = desired.map(item => item.key);
    chips.hidden = !desired.length;
    for (const group of checks) {
      const facet = found?.facets.find(f => f.field === group.field);
      for (const choice of group.choices) {
        if (!pending) choice.input.checked = value.state.filters[group.field]!.includes(choice.value);
        const bucket = facet?.buckets.find(b => b.kind === 'value' && b.value === choice.value);
        const count = bucket?.count ?? (facet && !facet.omittedBucketCount ? 0 : null);
        choice.count.textContent = ` (${count === null ? messages.unknownCount : count})`;
      }
      group.omitted.hidden = !facet?.omittedBucketCount;
      if (facet?.omittedBucketCount) group.omitted.textContent = message(messages.omittedCounts, { shown: facet.buckets.length, total: facet.distinctValueTotal });
    }
    extension?.clear();
    // Keep a focused action visible through asynchronous loading/refusal.
    // Once native focus leaves, obsolete controls can retire without a jump.
    results.replaceChildren(); results.hidden = true; pageSummary.textContent = ''; heading.hidden = true;
    navigationAvailable = false; retryAvailable = false;
    unavailable(previous, true); unavailable(next, true); unavailable(retry, true); unavailable(clear, !input.value && !desired.length);
    updateRecovery();
    region.setAttribute('aria-busy', String(pending || value.status === 'loading'));
    shell.dataset.state = pending ? composing ? 'composing' : 'waiting' : value.status;
    if (pending) { announce(composing ? messages.composing : messages.waiting); return; }
    if (found) {
      if (found.total > captured.documents.size || found.hits.some(hit => !captured.documents.has(hit.id))) {
        shell.dataset.state = 'error'; announce(message(messages.error, { code: 'INCOMPATIBLE_CAPABILITY' })); retryAvailable = true; unavailable(retry, false); updateRecovery(); return;
      }
      const offset = (value.state.page - 1) * config.pageSize, pages = Math.max(1, Math.ceil(found.total / config.pageSize));
      const fragment = doc.createDocumentFragment();
      for (const hit of found.hits) {
        const display = captured.documents.get(hit.id)!, li = node('li', 'result'), link = node('a', 'result-link', display.title); link.href = display.url;
        li.setAttribute('data-raveldex-directory-result', hit.id); li.append(link); extension?.render(li, link, display); fragment.append(li);
      }
      results.start = offset + 1; results.append(fragment); heading.hidden = !found.total; results.hidden = !found.total; navigationAvailable = found.total > 0;
      unavailable(previous, value.state.page === 1); unavailable(next, value.state.page >= pages);
      pageSummary.textContent = found.total ? message(messages.page, { page: value.state.page, pages }) : '';
      const empty = desired.length ? messages.noResultsFiltered : value.state.text.trim() ? messages.noResults : messages.noResultsBrowse;
      announce(found.total ? message(found.total === 1 ? messages.resultOne : messages.results, { total: found.total, start: offset + 1, end: offset + found.hits.length }) : message(empty, { query: queryPreview(value.state.text) }));
      if (!found.total && !desired.length && !value.state.text.trim()) { retryAvailable = true; unavailable(retry, false); }
    } else if (value.status === 'error' || value.status === 'stale') {
      announce(value.status === 'stale' ? messages.stale : message(messages.error, { code: value.error ?? 'INTERNAL_ERROR' })); retryAvailable = true; unavailable(retry, false);
    } else announce(value.status === 'loading' ? messages.searching : messages.idle);
    updateRecovery();
  }
  function cancelDraft(): void {
    cancelTimer(); serial++; dirty = false; activatedChip = undefined;
    if (composing) discardComposition = true;
    composing = false;
  }
  function request(patch: { text: string; filters: DirectoryState['filters'] }): Promise<void> {
    if (!live()) return Promise.resolve();
    cancelTimer(); dirty = false; local = true;
    try {
      const work = controller.update(patch); render(controller.getSnapshot()); return work;
    } catch {
      render(controller.getSnapshot());
      if (live()) { shell.dataset.state = 'invalid'; announce(messages.invalid); }
      return Promise.resolve();
    } finally { local = false; activatedChip = undefined; }
  }
  function execute(): Promise<void> {
    if (!live()) return Promise.resolve();
    cancelTimer();
    if (composing || discardComposition) return Promise.resolve();
    const filters: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
    for (const group of checks) filters[group.field] = group.choices.filter(c => c.input.checked).map(c => c.value);
    return request({ text: input.value, filters });
  }
  function schedule(): void {
    if (!live()) return;
    if (discardComposition) { input.value = controller.getSnapshot().state.text; return; }
    cancelTimer(); dirty = true; render(controller.getSnapshot());
    if (!live() || composing) return;
    timer = win.setTimeout(() => { timer = undefined; void execute(); }, captured.debounceMs);
  }
  function closeDisclosure(): void {
    if (!live() || !details.open) return;
    summary.focus({ preventScroll: true });
    if (live()) details.open = false;
  }
  const baseHandle: DirectoryViewHandle = Object.freeze({
    search: (raw?: string): Promise<void> => {
      if (!live()) return Promise.resolve();
      if (raw !== undefined) { const value = queryText(raw); cancelDraft(); input.value = value; return request({ text: value, filters: controller.getSnapshot().state.filters }); }
      return execute();
    },
    clear: (): Promise<void> => { if (!live()) return Promise.resolve(); cancelDraft(); return request({ text: '', filters: {} }); },
    destroy: (): void => {
      if (ended) return;
      ended = true; serial++; cancelTimer(); unsubscribe();
      extension?.destroy();
      for (const remove of removers) remove(); chipNodes.clear(); chipOrder = [];
      if (mounted.get(root)?.handle !== handle) return;
      mounted.delete(root);
      if (shell.parentNode === root) root.replaceChildren(...original);
    },
  });
  const handle = extension ? extension.extend(baseHandle) : baseHandle;
  extension?.initialize(shell, live);
  for (const element of [retry, navigation]) listen(element, 'focusout', () => { void Promise.resolve().then(updateRecovery); });
  listen(form, 'submit', event => { event.preventDefault(); void execute(); });
  listen(input, 'input', schedule);
  listen(input, 'compositionstart', () => { if (!live()) return; discardComposition = false; composing = true; schedule(); });
  listen(input, 'compositionend', () => {
    if (!live()) return;
    if (discardComposition) { discardComposition = false; composing = false; dirty = false; input.value = controller.getSnapshot().state.text; render(controller.getSnapshot()); return; }
    composing = false; schedule();
  });
  listen(clear, 'click', () => { if (clear.getAttribute('aria-disabled') !== 'true') void handle.clear(); });
  listen(chips, 'click', event => {
    if (!live()) return;
    const target = event.target;
    if (!target || (target as Node).nodeType !== 1) return;
    const element = (target as Element).closest('button'), selected = element ? chipDetails.get(element as HTMLButtonElement) : undefined;
    if (!selected) return;
    cancelDraft();
    activatedChip = JSON.stringify([selected.field, selected.value]);
    const state = controller.getSnapshot().state, filters = { ...state.filters, [selected.field]: state.filters[selected.field]!.filter(v => v !== selected.value) };
    void request({ text: state.text, filters });
  });
  for (const group of checks) for (const choice of group.choices) listen(choice.input, 'change', () => { if (composing) schedule(); else void execute(); });
  listen(previous, 'click', () => { if (live() && previous.getAttribute('aria-disabled') !== 'true') { cancelDraft(); void controller.setPage(controller.getSnapshot().state.page - 1); } });
  listen(next, 'click', () => { if (live() && next.getAttribute('aria-disabled') !== 'true') { cancelDraft(); void controller.setPage(controller.getSnapshot().state.page + 1); } });
  listen(retry, 'click', () => { if (live() && retry.getAttribute('aria-disabled') !== 'true') { cancelDraft(); void controller.refresh(); } });
  listen(closeFilters, 'click', closeDisclosure);
  listen(details, 'keydown', event => { const key = event as KeyboardEvent; if (key.key === 'Escape' && details.open && !key.isComposing) { key.preventDefault(); closeDisclosure(); } });
  listen(details, 'toggle', () => { if (live() && !details.open && details.contains(activeElement()) && activeElement() !== summary) summary.focus({ preventScroll: true }); });
  mounted.set(root, { kind: extension?.kind ?? 'directory', handle });
  try {
    unsubscribe = controller.subscribe(value => {
      if (ended) return;
      if (value.status === 'destroyed') { handle.destroy(); return; }
      if (!local && value.change !== 'recovery' && (stateKey(value.state) !== stateKey(observed.state) || value.status === 'loading' && (value.change === 'refresh' || value.change === 'restore'))) cancelDraft();
      observed = value; render(value);
    });
    root.replaceChildren(shell);
    if (live()) render(controller.getSnapshot());
  } catch (reason) { handle.destroy(); throw reason; }
  return handle;
}
