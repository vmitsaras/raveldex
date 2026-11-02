import { loadStaticSearch } from '@vmitsaras/raveldex-astro/client';
import { mountRaveldexModal } from '@vmitsaras/raveldex/addons/ui/modal';
import { configuration } from '../configuration.mjs';

/** Application-owned initialization, separate from the modal's borrowed engine.
 * A custom load must transfer a fresh LoadedStaticSearch handle on every call.
 * destroy waits for even an abort-ignoring loader's late handle to be disposed. */
export function createDocumentationSearch({ root, trigger, loadingDialog, status, retry,
  manifestUrl, buildId, resetOnClose = false, load = loadStaticSearch }) {
  const document = root.ownerDocument;
  const closeButton = loadingDialog.querySelector('[data-loading-close]');
  const original = { hidden: trigger.hidden, retryHidden: retry.hidden, status: [...status.childNodes] };
  const attempts = new Set();
  let current, owned, ui, loadingOpener, destroyed = false, disposal;
  const connected = () => root.isConnected && trigger.isConnected && loadingDialog.isConnected
    && root.ownerDocument === document && trigger.ownerDocument === document && loadingDialog.ownerDocument === document;
  function restoreFocus(opener, hadFocus) {
    if (hadFocus && opener?.isConnected && opener.ownerDocument === document
      && (document.activeElement === document.body || document.activeElement === opener || loadingDialog.contains(document.activeElement))
      && !document.querySelector('dialog:modal')) opener.focus({ preventScroll: true });
  }
  function hideLoading(opener) {
    const hadFocus = loadingDialog.contains(document.activeElement);
    if (loadingDialog.open) loadingDialog.close();
    restoreFocus(opener, hadFocus);
  }
  function close() {
    if (destroyed) return;
    const attempt = current;
    // Invalidate before abort/native close: both can invoke authored callbacks.
    current = undefined;
    attempt?.abort.abort();
    if (current || destroyed) return;
    if (ui) ui.close();
    else hideLoading(attempt?.opener ?? loadingOpener);
  }
  function open(fromTrigger = false) {
    if (destroyed || !connected()) return Promise.resolve();
    if (ui) { ui.open(); return Promise.resolve(); }
    if (current && loadingDialog.open) return current.promise;
    // A raw native close may precede its queued close event.
    if (current) close();
    if (current) return current.promise;
    if (destroyed || !connected() || document.querySelector('dialog:modal')) return Promise.resolve();
    const focused = document.activeElement;
    const attempt = { abort: new AbortController(), opener: fromTrigger ? trigger
      : loadingDialog.contains(focused) ? loadingOpener ?? trigger
        : focused && focused !== document.body ? focused : trigger };
    current = attempt; loadingOpener = attempt.opener;
    const live = () => !destroyed && current === attempt && !attempt.abort.signal.aborted && connected();
    // Publish the promise before load can run or reenter the controller.
    attempt.promise = Promise.resolve().then(async () => {
      let candidate, mounted, failed = false;
      try {
        if (!live() || !loadingDialog.open) return;
        candidate = await load({ manifestUrl, expectedBuildId: buildId,
          configuration: configuration(), signal: attempt.abort.signal });
        if (!live() || !loadingDialog.open) return;
        const documents = await candidate.loadDocuments({ signal: attempt.abort.signal });
        if (!live() || !loadingDialog.open) return;
        // Explicit source-only companion; it validates this receiving owner's
        // revision against the exact source/display/build identities.
        if (typeof candidate.loadSections !== 'function') throw new Error('Section companion required');
        const pageSections = await candidate.loadSections({ signal: attempt.abort.signal });
        if (!live() || !loadingDialog.open) return;
        mounted = mountRaveldexModal({ root, trigger, engine: candidate.engine, documents, pageSections,
          pageSize: 3, maxRenderedResults: 6, resetOnClose, shortcut: false,
          facets: [{ field: 'category', label: 'Topic' }],
          messages: { label: 'Search the workshop guide', placeholder: 'Try bobbin or booking', clear: 'Clear search' },
          modalMessages: { title: 'Search the workshop guide' } });
        if (!live() || !loadingDialog.open) return;
        hideLoading(attempt.opener);
        if (!live()) return;
        ui = mounted; mounted = undefined;
        owned = candidate; candidate = undefined;
        current = undefined;
        ui.open();
      } catch { failed = true;
      } finally {
        mounted?.destroy();
        await candidate?.dispose();
        if (current === attempt) {
          current = undefined;
          if (failed && !destroyed && connected() && loadingDialog.open) {
            status.textContent = 'Search could not load. Retry, or close this window and browse the guide.';
            if (!destroyed && !current && connected() && loadingDialog.open) retry.hidden = false;
          } else if (!ui) hideLoading(attempt.opener);
        }
      }
    });
    attempts.add(attempt.promise);
    // The settled attempt cannot erase a newer rapid-reopen attempt.
    void attempt.promise.finally(() => attempts.delete(attempt.promise)).catch(() => {});
    retry.hidden = true;
    if (!live()) return attempt.promise;
    status.textContent = 'Loading search. You can browse the guide after closing this window.';
    if (!live()) return attempt.promise;
    try { loadingDialog.showModal(); if (live() && loadingDialog.open) closeButton.focus({ preventScroll: true }); }
    catch { if (current === attempt) current = undefined; attempt.abort.abort(); }
    return attempt.promise;
  }
  function onTrigger() { if (!ui) void open(true).catch(() => {}); }
  function onCancel(event) { event.preventDefault(); close(); }
  function onNativeClose() { if (!loadingDialog.open && !ui) close(); }
  function onRetry() { hideLoading(loadingOpener); void open().catch(() => {}); }
  function destroy() {
    if (disposal) return disposal;
    let resolve, reject;
    disposal = new Promise((yes, no) => { resolve = yes; reject = no; });
    destroyed = true;
    trigger.removeEventListener('click', onTrigger);
    closeButton.removeEventListener('click', close);
    retry.removeEventListener('click', onRetry);
    loadingDialog.removeEventListener('cancel', onCancel);
    loadingDialog.removeEventListener('close', onNativeClose);
    const attempt = current, mounted = ui, previous = owned;
    current = undefined; ui = undefined; owned = undefined;
    attempt?.abort.abort();
    mounted?.destroy();
    hideLoading(attempt?.opener);
    trigger.hidden = original.hidden;
    retry.hidden = original.retryHidden;
    status.replaceChildren(...original.status);
    Promise.all([...attempts, previous?.dispose()]).then(resolve, reject);
    return disposal;
  }
  trigger.addEventListener('click', onTrigger);
  closeButton.addEventListener('click', close);
  retry.addEventListener('click', onRetry);
  loadingDialog.addEventListener('cancel', onCancel);
  loadingDialog.addEventListener('close', onNativeClose);
  trigger.hidden = false;
  return Object.freeze({ open, close, destroy });
}
