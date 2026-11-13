import { loadStaticSearch } from '@vmitsaras/raveldex-astro/client';
import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';
import { configuration } from '../configuration.mjs';

/** This application wrapper owns only the handle returned by its loader.
 * Calling destroy waits for late initialization and disposes that owned handle.
 * It never accepts or disposes an application's borrowed engine. */
export function createInlineSearch({ root, status, button, manifestUrl, buildId, load = loadStaticSearch }) {
  const lifetime = new AbortController();
  let owned, ui, pending, destroyed = false, disposal;
  const say = text => { status.textContent = text; };
  function start() {
    if (destroyed || ui) return Promise.resolve();
    if (pending) return pending;
    let failed = false;
    // Publish the work before authored DOM callbacks can start or destroy it.
    pending = Promise.resolve().then(async () => {
      let candidate, mounted;
      try {
        if (destroyed) return;
        button.disabled = true;
        say('Loading search. You can keep using the guide links below.');
        if (destroyed) return;
        candidate = await load({ manifestUrl, expectedBuildId: buildId,
          configuration: configuration(), signal: lifetime.signal });
        if (destroyed) return;
        const documents = await candidate.loadDocuments({ signal: lifetime.signal });
        if (destroyed) return;
        mounted = mountRaveldexInline({ root, engine: candidate.engine, documents,
          pageSize: 3, snippetFields: ['body'],
          facets: [{ field: 'category', label: 'Topic' }],
          messages: { label: 'Search the workshop guide', placeholder: 'Try booking or tools', clear: 'Clear search and filters',
            idle: 'Search the workshop guide, then choose a topic to narrow the results.',
            facetSummary: 'Topics: {total} · Not shown: {omitted}' } });
        if (destroyed) return;
        ui = mounted; mounted = undefined;
        owned = candidate; candidate = undefined;
        button.hidden = true;
        say('Search is ready. Enter a word, then narrow results by topic.');
      } catch {
        failed = true;
      } finally {
        mounted?.destroy();
        await candidate?.dispose();
      }
    }).finally(() => {
      pending = undefined;
      if (failed && !destroyed) {
        button.disabled = false;
        button.textContent = 'Retry search';
        if (!destroyed) say('Search could not load. Retry, or use the guide links below.');
      }
    });
    return pending;
  }
  function destroy() {
    if (disposal) return disposal;
    let finish, fail;
    disposal = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    destroyed = true;
    const mounted = ui, previous = owned, inFlight = pending;
    ui = undefined; owned = undefined;
    lifetime.abort();
    button.removeEventListener('click', start);
    mounted?.destroy();
    // Await a loader even when its host ignores abort; its late handle is owned
    // locally and the pending initializer's finally block releases it.
    Promise.all([inFlight, previous?.dispose()]).then(() => finish(), fail);
    button.hidden = true;
    say('Search is closed. Use the guide links below.');
    return disposal;
  }
  button.addEventListener('click', start);
  button.hidden = false; button.disabled = false; button.textContent = 'Enable search';
  say('Search is optional. Enable it, or browse the guide below.');
  return Object.freeze({ start, destroy });
}
