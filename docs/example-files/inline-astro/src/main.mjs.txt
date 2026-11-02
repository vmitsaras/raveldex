import '@vmitsaras/raveldex/addons/ui/inline.css';
import './style.css';
import { createInlineSearch } from './search.mjs';

const root = document.querySelector('#search-root');
const options = { root, status: document.querySelector('#search-status'),
  button: document.querySelector('#enable-search'), buildId: root.dataset.buildId,
  manifestUrl: new URL(import.meta.env.BASE_URL + 'raveldex/manifest.json', location.origin).href };
let search = createInlineSearch(options);
window.addEventListener('pagehide', () => { void search.destroy(); });
// A restored back/forward-cache document needs a new application owner.
window.addEventListener('pageshow', event => { if (event.persisted) search = createInlineSearch(options); });
