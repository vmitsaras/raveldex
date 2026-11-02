import '@vmitsaras/raveldex/addons/ui/modal.css';
import './theme.css';
import { createDocumentationSearch } from './controller.mjs';
import { loadGuides } from './load.mjs';

const root = document.querySelector('[data-search-root]'), trigger = document.querySelector('[data-search-trigger]');
let search, navigationEpoch = 0, stopped = Promise.resolve();
function initialize() {
  search = createDocumentationSearch({ root, trigger, loadingDialog: document.querySelector('[data-search-loading]'),
    status: document.querySelector('[data-search-status]'), retry: document.querySelector('[data-search-retry]'),
    load: signal => loadGuides(new URL('../content.json', import.meta.url), RAVELDEX_CONTENT_SHA256, signal) });
  trigger.hidden = false;
}
initialize();
window.addEventListener('pagehide', () => {
  navigationEpoch++; trigger.hidden = true;
  if (search) { stopped = search.destroy(); search = undefined; }
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  const epoch = ++navigationEpoch;
  void stopped.then(() => { if (epoch === navigationEpoch) initialize(); });
});
