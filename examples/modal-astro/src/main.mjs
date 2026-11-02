import '@vmitsaras/raveldex/addons/ui/modal.css';
import './style.css';
import { createDocumentationSearch } from './search.mjs';

const root = document.querySelector('#search-root');
const options = { root, trigger: document.querySelector('#search-trigger'),
  loadingDialog: document.querySelector('#search-loading'), status: document.querySelector('#search-status'),
  retry: document.querySelector('#search-retry'), buildId: root.dataset.buildId,
  manifestUrl: new URL(import.meta.env.BASE_URL + 'raveldex/manifest.json', location.origin).href };
let search = createDocumentationSearch(options);
let stopped = Promise.resolve(), navigation = 0;
window.addEventListener('pagehide', () => { navigation++; stopped = search.destroy(); });
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    const version = ++navigation;
    void stopped.then(() => { if (version === navigation) search = createDocumentationSearch(options); });
  }
});
