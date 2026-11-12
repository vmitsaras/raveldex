import { mountRaveldexDropdown } from '@vmitsaras/raveldex/addons/ui/dropdown';
import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';
import { mountRaveldexModal } from '@vmitsaras/raveldex/addons/ui/modal';
import { configuration, validQuery } from './configuration.mjs';

// load(signal) transfers a NEW owner {engine, documents, dispose}. Presenters
// borrow it; this controller destroys every presenter before disposing it once.
export function createHeaderSearch({ root, status, retry, load, fullResultsURL,
  fullRoot, modalRoot, modalTrigger, initialQuery, queryRefused = false,
  modalHandoff = false }) {
  if (modalHandoff && (!modalRoot || !modalTrigger)) throw new Error('Expanded search needs its root and button');
  const doc = root.ownerDocument;
  let owner, dropdown, inline, modal, pending, abort, disposal;
  let ended = false, generation = 0, handoff = 0, composing = false;
  const jobs = new Set();
  const connected = () => [root, status, retry, ...(fullRoot ? [fullRoot] : []),
    ...(modalHandoff ? [modalRoot, modalTrigger] : [])].every(node => node.isConnected && node.ownerDocument === doc);
  const current = ticket => !ended && generation === ticket && connected();
  const say = text => { status.textContent = text; };
  const initialValid = initialQuery === undefined || validQuery(initialQuery);
  const refused = queryRefused || !initialValid;
  const modalError = 'Expanded search could not open. Use the header or See all results.';
  const handoffError = 'Finish entering a valid single-line query before opening expanded search.';

  function start() {
    if (ended || !connected()) return Promise.resolve();
    if (pending) return pending;
    if (owner) return Promise.resolve();
    const ticket = ++generation, signal = new AbortController();
    abort = signal;
    // Publish before status replacement, loader or authored disconnection callbacks.
    const work = Promise.resolve().then(async () => {
      let candidate, mountedDropdown, mountedInline, failed = false;
      try {
        if (!current(ticket)) return;
        retry.hidden = true;
        if (modalTrigger) modalTrigger.hidden = true;
        const probe = doc.createElement('div');
        const quickSearch = typeof probe.showPopover === 'function' && typeof probe.hidePopover === 'function';
        if (!quickSearch) { const form = root.querySelector('.header-search__fallback'); if (form) form.hidden = false; }
        if (!quickSearch && !fullRoot) {
          say('Quick search is unavailable in this browser. Use the search form or browse the guides.');
          return;
        }
        say('Loading search. You can browse the guides while it loads.');
        if (!current(ticket)) return;
        candidate = await load(signal.signal);
        if (!current(ticket)) return;
        if (quickSearch) mountedDropdown = mountRaveldexDropdown({ root, engine: candidate.engine, documents: candidate.documents,
          mode: configuration.mode, maxResults: configuration.maxResults, shortcut: false,
          fullResults: { url: fullResultsURL, queryParameter: 'q' },
          messages: { label: 'Search walking guides', placeholder: 'Try weather or walking guide' } });
        if (!current(ticket)) return;
        if (fullRoot) {
          mountedInline = mountRaveldexInline({ root: fullRoot, engine: candidate.engine, documents: candidate.documents,
            mode: configuration.mode, pageSize: configuration.pageSize, maxRenderedResults: configuration.maxRenderedResults,
            messages: { label: 'Search all walking guides', placeholder: 'Try weather or walking guide',
              idle: 'Enter a word to search all walking guides.' } });
          if (!current(ticket)) return;
        }
        // Publish owned views before an initial search or status/focus callback.
        owner = candidate; candidate = undefined;
        dropdown = mountedDropdown; mountedDropdown = undefined;
        inline = mountedInline; mountedInline = undefined;
        if (inline && !refused && initialQuery !== undefined) await inline.search(initialQuery);
        if (!current(ticket)) return;
        say(refused ? 'The query link could not be read. Enter a new search below.' : quickSearch ? 'Search is ready.'
          : 'Quick search is unavailable in this browser. Search all guides below or use the browse links.');
        if (current(ticket) && modalHandoff && quickSearch) modalTrigger.hidden = false;
      } catch {
        failed = true;
      } finally {
        try {
          mountedInline?.destroy(); mountedDropdown?.destroy();
          if (candidate) await candidate.dispose();
          if (failed && current(ticket)) {
            // This normally means loading/capture failed before ownership transfer.
            // If a host callback threw later, release that committed owner too.
            const previous = owner, previousDropdown = dropdown, previousInline = inline, previousModal = modal;
            owner = undefined; dropdown = undefined; inline = undefined; modal = undefined;
            previousModal?.destroy(); previousInline?.destroy(); previousDropdown?.destroy();
            if (previous) await previous.dispose();
            if (!current(ticket)) return;
            say('Search could not load. Browse the guides below or try loading again.');
            if (current(ticket)) retry.hidden = false;
          }
        } finally { if (pending === work) pending = undefined; }
      }
    });
    pending = work; jobs.add(work);
    void work.then(() => { jobs.delete(work); }, () => { jobs.delete(work); });
    return work;
  }

  function openModal() {
    // Even a refused newer handoff invalidates an older focus/mount callback.
    const request = ++handoff, ticket = generation;
    if (!modalHandoff || !owner || !dropdown || !current(ticket)) return Promise.resolve();
    const field = root.querySelector('[data-raveldex-dropdown-input]');
    const raw = field?.value ?? '';
    const active = () => current(ticket) && handoff === request && !composing &&
      field?.isConnected && root.contains(field) && field.value === raw;
    if (composing || !validQuery(raw)) {
      say(handoffError);
      return Promise.resolve();
    }
    let view;
    const failed = () => {
      if (!active()) return;
      // A native dialog refusal does not dispose the shared owner or replace
      // the header/full-results route with a pretend fallback.
      view?.close();
      if (active()) say(modalError);
    };
    try {
      dropdown.close();
      if (!active()) return Promise.resolve();
      if (!modal) {
        const mounted = mountRaveldexModal({ root: modalRoot, trigger: modalTrigger,
          engine: owner.engine, documents: owner.documents, mode: configuration.mode,
          pageSize: configuration.pageSize, maxRenderedResults: configuration.maxRenderedResults,
          shortcut: false, keyboardHints: false,
          messages: { label: 'Search walking guides in a dialog', placeholder: 'Try weather or walking guide' },
          modalMessages: { title: 'Search all walking guides' } });
        if (!active()) {
          // A nested handoff can have claimed the same-kind handle.
          if (modal !== mounted) mounted.destroy();
          return Promise.resolve();
        }
        modal = mounted;
      }
      view = modal;
      // This explicit button is the logical opener even where pointer activation
      // natively leaves focus on the field. Respect authored focus reentry.
      modalTrigger.focus({ preventScroll: true });
      if (!active() || modal !== view || doc.activeElement !== modalTrigger) return Promise.resolve();
      view.open();
      if (!active() || modal !== view || !modalRoot.querySelector('dialog[open]')) return Promise.resolve();
      // Clear only this handoff's prior error, retaining an unrelated refused
      // full-results URL notice. Status replacement can itself reenter/close.
      if (status.textContent === modalError || status.textContent === handoffError) say('Search is ready.');
      if (!active() || modal !== view || !modalRoot.querySelector('dialog[open]')) return Promise.resolve();
      const work = view.search(raw).catch(failed);
      jobs.add(work);
      void work.then(() => { jobs.delete(work); }, () => { jobs.delete(work); });
      return work;
    } catch {
      failed();
      return Promise.resolve();
    }
  }
  const onRetry = () => { void start(); };
  const onModal = event => {
    // This application button owns admission/query transfer. The modal preset
    // also registers a trigger listener; do not let it reopen a refused handoff.
    event.stopImmediatePropagation();
    void openModal();
  };
  const onCompositionStart = () => { composing = true; };
  const onCompositionEnd = () => { composing = false; };
  retry.addEventListener('click', onRetry);
  if (modalHandoff) modalTrigger.addEventListener('click', onModal);
  root.addEventListener('compositionstart', onCompositionStart, true);
  root.addEventListener('compositionend', onCompositionEnd, true);
  if (modalTrigger) modalTrigger.hidden = true;

  function destroy() {
    if (ended) return disposal;
    ended = true; generation++; handoff++;
    let resolve, reject;
    // Stable disposal exists before abort/DOM/focus callbacks can reenter.
    disposal = new Promise((done, fail) => { resolve = done; reject = fail; });
    const previous = owner, previousDropdown = dropdown, previousInline = inline, previousModal = modal;
    owner = undefined; dropdown = undefined; inline = undefined; modal = undefined;
    const work = [...jobs];
    abort?.abort();
    retry.removeEventListener('click', onRetry);
    if (modalHandoff) modalTrigger.removeEventListener('click', onModal);
    root.removeEventListener('compositionstart', onCompositionStart, true);
    root.removeEventListener('compositionend', onCompositionEnd, true);
    previousModal?.destroy(); previousInline?.destroy(); previousDropdown?.destroy();
    retry.hidden = true;
    if (modalTrigger) modalTrigger.hidden = true;
    say('Search is closed. Browse the guides below.');
    Promise.all([...work, Promise.resolve().then(() => previous?.dispose())]).then(resolve, reject);
    return disposal;
  }
  return Object.freeze({ start, openModal, destroy });
}
