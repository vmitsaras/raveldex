import { mountRaveldexModal } from '@vmitsaras/raveldex/addons/ui/modal';

// Application-owned first-open loading. The public UI only borrows an engine.
// load(signal) transfers a NEW owner {engine, documents, pageSections, dispose}.
export function createDocumentationSearch({ root, trigger, loadingDialog, status, retry, load, resetOnClose = false }) {
  const doc = root.ownerDocument, cancel = loadingDialog.querySelector('[data-search-cancel]');
  let owner, ui, current, loadingOpener, ended = false, wanted = false, disposal;
  const jobs = new Set();
  function connected() { return root.isConnected && trigger.isConnected && loadingDialog.isConnected && root.ownerDocument === doc && trigger.ownerDocument === doc && loadingDialog.ownerDocument === doc; }
  function say(text) { status.textContent = text; }
  function hideLoading(opener) {
    const hadFocus = loadingDialog.contains(doc.activeElement);
    if (loadingDialog.open) loadingDialog.close();
    // WebKit may leave focus in the closed loading shell. Restore only our
    // transition; authored callbacks or another modal retain their own focus.
    const active = doc.activeElement;
    if (hadFocus && opener?.isConnected && opener.ownerDocument === doc &&
      (active === doc.body || active === opener || loadingDialog.contains(active)) &&
      !doc.querySelector('dialog:modal')) opener.focus({ preventScroll: true });
  }
  function close() {
    wanted = false;
    const prior = current; current = undefined;
    // Invalidate before abort/focus callbacks can reenter this controller.
    prior?.abort.abort();
    if (current || wanted) return; // An abort listener opened a newer session.
    ui?.close();
    if (!current && !wanted) hideLoading(prior?.opener ?? loadingOpener);
  }
  function open(fromTrigger = false) {
    if (ended || !connected() || trigger.disabled) return Promise.resolve();
    if (ui) { ui.open(); return Promise.resolve(); }
    // Native close() changes modality before its queued close event arrives.
    if (current && !loadingDialog.open) close();
    if (ended || !connected() || trigger.disabled) return Promise.resolve();
    if (current) return current.promise;
    if (doc.querySelector('dialog:modal') && !loadingDialog.open) return Promise.resolve();
    wanted = true;
    const focused = doc.activeElement;
    const attempt = { abort: new AbortController(), opener: fromTrigger ? trigger
      : loadingDialog.contains(focused) ? loadingOpener ?? trigger
        : focused && focused !== doc.body ? focused : trigger };
    loadingOpener = attempt.opener;
    let finish;
    attempt.promise = new Promise(resolve => { finish = resolve; });
    current = attempt; jobs.add(attempt.promise);
    const currentActive = () => !ended && wanted && current === attempt && connected() && !attempt.abort.signal.aborted;
    const active = () => currentActive() && loadingDialog.open;
    const finishEarly = () => { jobs.delete(attempt.promise); finish(); return attempt.promise; };
    retry.hidden = true; say('Loading search. You can cancel and browse the guides.');
    // Replacing authored status children can synchronously close/destroy/reopen.
    if (!currentActive()) return finishEarly();
    try {
      if (!loadingDialog.open) loadingDialog.showModal();
      if (active()) cancel.focus({ preventScroll: true });
    } catch {
      if (current === attempt) {
        current = undefined; wanted = false;
        if (!ended) say('Search could not open. Browse the guides below.');
      }
      return finishEarly();
    }
    void (async () => {
      let candidate, mounted;
      try {
        if (!active()) return;
        candidate = await load(attempt.abort.signal);
        if (!active()) return;
        hideLoading(attempt.opener);
        if (ended || !wanted || current !== attempt || !connected()) return;
        // Native close restores the real pre-loading opener. Respect focus
        // callbacks that abandon the session before mounting its replacement.
        mounted = mountRaveldexModal({ root, trigger, engine: candidate.engine, documents: candidate.documents,
          pageSections: candidate.pageSections, pageSize: 3, maxRenderedResults: 6,
          facets: [{ field: 'category', label: 'Topic' }], resetOnClose,
          messages: { label: 'Search the workshop guide', placeholder: 'Try bobbin or workshop' },
          modalMessages: { title: 'Search workshop documentation' } });
        if (ended || !wanted || current !== attempt || !connected()) return;
        owner = candidate; candidate = undefined; ui = mounted; mounted = undefined;
        current = undefined;
        ui.open();
      } catch {
        if (currentActive()) {
          if (!loadingDialog.open && !doc.querySelector('dialog:modal')) loadingDialog.showModal();
          if (active()) {
            say('Search could not load. Retry or close to browse the guides.');
            if (active()) retry.hidden = false;
          }
        }
      } finally {
        mounted?.destroy();
        try { if (candidate) await candidate.dispose(); }
        finally {
          if (current === attempt) current = undefined;
          jobs.delete(attempt.promise); finish();
        }
      }
    })().catch(() => { /* The owner's cleanup was attempted; no abandoned UI can mount. */ });
    return attempt.promise;
  }
  function onTrigger() { if (!ui) void open(true); }
  function onCancel(event) { event.preventDefault(); close(); }
  function onNativeClose() { if (!loadingDialog.open && !ui) close(); }
  function onRetry() { void open(); }
  trigger.addEventListener('click', onTrigger); cancel.addEventListener('click', close);
  loadingDialog.addEventListener('cancel', onCancel); loadingDialog.addEventListener('close', onNativeClose);
  retry.addEventListener('click', onRetry);
  function destroy() {
    if (ended) return disposal;
    ended = true;
    let resolve, reject;
    disposal = new Promise((done, fail) => { resolve = done; reject = fail; });
    const previous = owner, previousUI = ui; owner = undefined; ui = undefined;
    close();
    trigger.removeEventListener('click', onTrigger); cancel.removeEventListener('click', close);
    loadingDialog.removeEventListener('cancel', onCancel); loadingDialog.removeEventListener('close', onNativeClose);
    retry.removeEventListener('click', onRetry);
    previousUI?.destroy(); retry.hidden = true;
    Promise.all([...jobs, Promise.resolve().then(() => previous?.dispose())]).then(resolve, reject);
    return disposal;
  }
  return Object.freeze({ open, close, destroy });
}
