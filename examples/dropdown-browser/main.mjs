import '@vmitsaras/raveldex/addons/ui/dropdown.css';
import '@vmitsaras/raveldex/addons/ui/inline.css';
// Included explicitly for the documented opt-in modal demonstration.
import '@vmitsaras/raveldex/addons/ui/modal.css';
import './theme.css';
import { configuration, readInitialQuery } from './configuration.mjs';
import { createHeaderSearch } from './controller.mjs';
import { loadGuides } from './load.mjs';

const base = new URL('../', import.meta.url);
const root = document.querySelector('[data-search-root]');
const fullRoot = document.querySelector('[data-full-results-root]');
let search, epoch = 0, stopped = Promise.resolve();
function initialize() {
  const initial = fullRoot ? readInitialQuery(location.search) : { query: undefined, refused: false };
  search = createHeaderSearch({ root, fullRoot,
    status: document.querySelector('[data-search-status]'), retry: document.querySelector('[data-search-retry]'),
    modalRoot: document.querySelector('[data-search-modal-root]'), modalTrigger: document.querySelector('[data-search-modal-trigger]'),
    modalHandoff: configuration.modalHandoff,
    fullResultsURL: new URL('search/?from=header#results', base).href,
    initialQuery: initial.query, queryRefused: initial.refused,
    load: signal => loadGuides(new URL('content.json', base), signal) });
  void search.start();
}
initialize();
window.addEventListener('pagehide', () => {
  epoch++;
  const previous = search; search = undefined;
  stopped = Promise.all([stopped, previous?.destroy()]);
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  const ticket = ++epoch;
  void stopped.then(() => { if (ticket === epoch) initialize(); });
});
