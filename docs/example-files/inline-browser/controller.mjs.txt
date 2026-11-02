import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';

// Application lifecycle, separate from the UI's borrowed-engine contract.
// `load` transfers one newly created owner to this controller. Never return an
// application-owned/borrowed engine: this controller will dispose its owner.
export function createInlineSearch({ root, status, retry, load }) {
  let owner, ui, pending, abort, ended = false;
  function say(text) { status.textContent = text; }
  function start() {
    if (ended || owner) return Promise.resolve();
    if (pending) return pending;
    abort = new AbortController();
    // Publish the work before authored DOM callbacks can start or destroy it.
    pending = Promise.resolve().then(async () => {
      let candidate, mounted, failed = false;
      try {
        if (ended) return;
        retry.hidden = true;
        say('Loading search. You can browse the guides while it loads.');
        if (ended) return;
        candidate = await load(abort.signal);
        if (ended) return;
        mounted = mountRaveldexInline({ root, engine: candidate.engine, documents: candidate.documents,
          pageSize: 3, maxRenderedResults: 6,
          facets: [{ field: 'category', label: 'Type of guide' }], snippetFields: ['body'],
          messages: { label: 'Search walking guides', placeholder: 'Try weather or map',
            idle: 'Enter a word, then choose a type of guide to narrow the matches.' } });
        // Replacing authored custom elements can synchronously destroy the view.
        if (ended) return;
        owner = candidate; candidate = undefined;
        ui = mounted; mounted = undefined;
        say('Search is ready.');
      } catch { failed = true;
      } finally {
        mounted?.destroy();
        if (candidate) await candidate.dispose();
        pending = undefined;
        if (failed && !ended) {
          say('Search could not load. Browse the guides below or try loading again.');
          if (!ended) retry.hidden = false;
        }
      }
    });
    return pending;
  }
  function onRetry() { void start(); }
  retry.addEventListener('click', onRetry);
  let disposal;
  function destroy() {
    if (ended) return disposal;
    ended = true;
    // Publish the one disposal promise before abort/DOM callbacks can reenter.
    let resolveDisposal, rejectDisposal;
    disposal = new Promise((resolve, reject) => { resolveDisposal = resolve; rejectDisposal = reject; });
    const previous = owner, previousUI = ui, work = pending;
    owner = undefined; ui = undefined;
    abort?.abort(); retry.removeEventListener('click', onRetry);
    previousUI?.destroy(); retry.hidden = true;
    say('Search is closed. Browse the guides below.');
    // Late owners are disposed in start() before pending settles.
    Promise.all([work, Promise.resolve().then(() => previous?.dispose())]).then(() => resolveDisposal(), rejectDisposal);
    return disposal;
  }
  return Object.freeze({ start, destroy });
}
