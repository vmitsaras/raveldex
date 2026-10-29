import { loadStaticSearch } from '@vmitsaras/raveldex-astro/client';
import { RaveldexError } from '@vmitsaras/raveldex';
import { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';
import '@vmitsaras/raveldex/addons/ui/styles.css';
import { configuration } from '../configuration.mjs';
import './style.css';

const root = document.querySelector('#search-root'), status = document.querySelector('#fixture-status');
const load = document.querySelector('#load-search'), open = document.querySelector('#open-search');
const close = document.querySelector('#close-search'), unload = document.querySelector('#unload-search');
const inject = document.querySelector('#inject-error');
const manifestUrl = new URL(import.meta.env.BASE_URL + 'raveldex/manifest.json', location.origin).href;
const expectedBuildId = document.body.dataset.buildId;
const authoredFallback = root.querySelector('[data-authored-fallback]');
let owned, ui, failNext = false, generation = 0, pendingOpens = 0, ended = false;
function say(text, state) { status.textContent = text; document.body.dataset.searchState = state; }
load.addEventListener('click', async () => {
  if (owned) return;
  const ticket = ++generation;
  load.disabled = true; say('Loading search data.', 'loading');
  try {
    const candidate = await loadStaticSearch({ manifestUrl, expectedBuildId, configuration: configuration() });
    if (ended || ticket !== generation) { await candidate.dispose(); return; }
    owned = candidate; open.disabled = false; unload.disabled = false; say('Search data is ready.', 'ready');
  } catch (error) { if (ended || ticket !== generation) return; load.disabled = false; say(`Search data could not load (${error.code ?? 'UNKNOWN'}). Retry is available.`, 'failed'); }
});
open.addEventListener('click', async () => {
  if (!owned || ui) return;
  const ticket = ++generation, selected = owned;
  open.disabled = true; pendingOpens++;
  try {
    const documents = await selected.loadDocuments();
    if (ended || ticket !== generation || owned !== selected) return;
    const engine = Object.freeze({ ...selected.engine, search(query, options) {
      if (failNext) { failNext = false; return Promise.reject(new RaveldexError('WORK_LIMIT_EXCEEDED')); }
      return selected.engine.search(query, options);
    } });
    ui = mountRaveldexUI({ root, engine, documents, pageSize: 3, debounceMs: 0, label: 'Search documentation' });
    close.disabled = false; inject.disabled = false; say('Search is open.', 'open');
  } catch (error) { if (ended || ticket !== generation || owned !== selected) return; open.disabled = false; say(`Search controls could not open (${error.code ?? 'UNKNOWN'}). Retry is available.`, 'failed'); }
  finally { pendingOpens--; }
});
function closeSearch() {
  generation++; ui?.destroy(); ui = undefined; close.disabled = true; inject.disabled = true;
  open.disabled = !owned; say('Search is closed; documentation links remain available.', owned ? 'ready' : 'unloaded');
}
close.addEventListener('click', closeSearch);
unload.addEventListener('click', async () => {
  closeSearch(); const previous = owned; owned = undefined;
  unload.disabled = true; open.disabled = true; load.disabled = false; say('Search data was unloaded.', 'unloaded');
  await previous?.dispose();
});
inject.addEventListener('click', () => { failNext = true; say('The next search will report a typed test error.', 'open'); });
window.addEventListener('pagehide', () => { ended = true; generation++; ui?.destroy(); void owned?.dispose(); });
// Bounded fixture observations call the actual loaded public APIs. They are not
// application behavior, speech/physical input evidence, or hard-coded results.
window.raveldexAstroFixture = Object.freeze({
  pendingOpen: () => pendingOpens,
  fallbackRestored: () => root.querySelector('[data-authored-fallback]') === authoredFallback,
  search: (query, options) => owned.engine.search(query, options),
  native: async () => {
    let candidate;
    try {
      candidate = await loadStaticSearch({ manifestUrl, expectedBuildId, configuration: configuration(), format: 'native',
        nativeQualification: JSON.parse(document.body.dataset.nativeQualification) });
      return { unexpectedlyLoaded: true };
    } catch (error) { return { code: error.code, reason: error.reason, name: error.name }; }
    finally { await candidate?.dispose(); }
  },
});
say('Search data has not been loaded.', 'idle');
