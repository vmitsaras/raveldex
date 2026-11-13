import { mountRaveldexModal } from '@vmitsaras/raveldex/addons/ui/modal';

// This application owns loading and engine disposal; the public modal borrows it.
export function createSiteSearch({ root, trigger, loading, status, retry, cancel, load, base }) {
  const doc = root.ownerDocument;
  const jobs = new Set();
  let ui, owner, pending, loadingOpener, ended = false, stopPresentation, disposal;
  const connected = () => [root, trigger, loading].every(node => node.isConnected && node.ownerDocument === doc);
  function hideLoading(opener) {
    const hadFocus = loading.contains(doc.activeElement);
    if (loading.open) loading.close();
    const active = doc.activeElement;
    if (hadFocus && opener?.isConnected && opener.ownerDocument === doc && !doc.querySelector('dialog:modal') &&
      (active === doc.body || active === opener || loading.contains(active))) opener.focus({ preventScroll: true });
  }
  function close() {
    const previous = pending; pending = undefined;
    previous?.abort.abort();
    ui?.close();
    hideLoading(previous?.opener ?? loadingOpener);
  }
  async function open(fromTrigger = false) {
    if (ended || !connected() || trigger.disabled) return;
    if (ui) { ui.open(); return; }
    if (pending || doc.querySelector('dialog:modal') && !loading.open) return;
    const focused = doc.activeElement;
    const attempt = { abort: new AbortController(), opener: fromTrigger ? trigger
      : loading.contains(focused) ? loadingOpener ?? trigger
        : focused && focused !== doc.body && typeof focused.focus === 'function' ? focused : trigger };
    loadingOpener = attempt.opener;
    pending = attempt;
    const current = () => !ended && pending === attempt && !attempt.abort.signal.aborted && connected() && loading.open;
    retry.hidden = true;
    status.textContent = 'Loading documentation… You can close search and keep browsing.';
    try { if (!loading.open) loading.showModal(); cancel.focus({ preventScroll: true }); }
    catch { pending = undefined; return; }
    let candidate;
    try {
      candidate = await load(attempt.abort.signal);
      if (!current()) return;
      hideLoading(attempt.opener);
      if (ended || pending !== attempt || attempt.abort.signal.aborted || !connected()) return;
      ui = mountRaveldexModal({ root, trigger, engine: candidate.engine, documents: candidate.documents,
        shortcut: true, pageSize: 5,
        messages: { label: 'Search documentation', placeholder: 'Search guides, components, APIs…', clear: 'Clear',
          idle: 'Search setup, search interfaces, workers and more.', resultsOne: '{total} result · Showing {count}', resultsMany: '{total} results · Showing {count}' },
        modalMessages: { title: 'Search documentation', close: 'Close',
          escapeHint: 'Escape closes search; some browsers clear the field first.', shortcutHint: 'Ctrl/Command + K to open search' } });
      owner = candidate; candidate = undefined; pending = undefined;
      stopPresentation = decorate(root, owner.sections, base);
      ui.open();
    } catch {
      if (current()) {
        status.textContent = 'Documentation search could not load. Try again, or browse the guides.';
        retry.hidden = false;
      }
    } finally {
      if (pending === attempt) pending = undefined;
      await candidate?.dispose();
    }
  }
  function start(fromTrigger = false) {
    const job = open(fromTrigger); jobs.add(job);
    void job.catch(() => { /* A failed or abandoned owner was released. */ }).finally(() => jobs.delete(job));
  }
  const click = () => { if (!ui) start(true); }; // Once mounted, the modal owns its trigger.
  const onRetry = () => start();
  const onCancel = event => { event.preventDefault(); close(); };
  const onClose = () => { if (!loading.open && !ui) close(); };
  const onKey = event => {
    if (ui || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.altKey || event.shiftKey ||
      event.ctrlKey === event.metaKey || event.key.toLowerCase() !== 'k' || event.composedPath().some(node =>
        node?.nodeType === 1 && (node.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName))) ||
      doc.querySelector('dialog:modal') || trigger.disabled || ended || !connected()) return;
    event.preventDefault(); start();
  };
  trigger.addEventListener('click', click); cancel.addEventListener('click', close);
  retry.addEventListener('click', onRetry); loading.addEventListener('cancel', onCancel);
  loading.addEventListener('close', onClose); doc.addEventListener('keydown', onKey);
  return Object.freeze({ destroy() {
    if (ended) return disposal;
    ended = true; close();
    trigger.removeEventListener('click', click); cancel.removeEventListener('click', close);
    retry.removeEventListener('click', onRetry); loading.removeEventListener('cancel', onCancel);
    loading.removeEventListener('close', onClose); doc.removeEventListener('keydown', onKey);
    stopPresentation?.(); ui?.destroy(); ui = undefined;
    disposal = Promise.allSettled([...jobs]).then(() => owner?.dispose());
    return disposal;
  } });
}

// Original indexed bodies stay unchanged. Overviews are safe, authored display
// text, not source snippets or highlights; native result IDs/order are untouched.
function decorate(root, sections, base) {
  const doc = root.ownerDocument, byID = new Map(sections.map(section => [section.id, section]));
  const body = root.querySelector('[data-raveldex-modal-body]');
  const start = doc.createElement('section'); start.className = 'site-search__start';
  const title = doc.createElement('h3'); title.textContent = 'Popular guides'; start.append(title);
  for (const [label, path, detail] of [['Getting started', 'guide/overview/', 'Install Raveldex and make your first search'],
    ['Search interfaces', 'reference/hosts/', 'Add inline, modal, dropdown or directory search'],
    ['Astro integration', 'reference/static-astro/', 'Build search for a static Astro site']]) {
    const link = doc.createElement('a'); link.href = base + path;
    const name = doc.createElement('span'), description = doc.createElement('span');
    name.textContent = label; description.textContent = detail; link.append(name, description); start.append(link);
  }
  body.append(start);
  const update = () => {
    start.hidden = root.querySelector('.raveldex-inline')?.dataset.state !== 'idle';
    for (const result of root.querySelectorAll('[data-raveldex-inline-result]')) {
      if (result.querySelector('.site-search__excerpt')) continue;
      const section = byID.get(result.dataset.raveldexInlineResult);
      if (!section) continue;
      const category = doc.createElement('p'), excerpt = doc.createElement('p');
      category.className = 'site-search__category'; category.textContent = section.category;
      excerpt.className = 'site-search__excerpt'; excerpt.textContent = section.overview;
      result.prepend(category); result.append(excerpt);
    }
  };
  const observer = new MutationObserver(update);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
  update();
  return () => { observer.disconnect(); start.remove(); };
}
