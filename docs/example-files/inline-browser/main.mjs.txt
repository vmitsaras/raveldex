import '@vmitsaras/raveldex/addons/ui/inline.css';
import './theme.css';
import { createInlineSearch } from './controller.mjs';
import { loadGuides } from './load.mjs';

const root = document.querySelector('[data-search-root]');
const status = document.querySelector('[data-search-status]');
const retry = document.querySelector('[data-search-retry]');
let search;
function openSearch() {
  search = createInlineSearch({ root, status, retry,
    load: signal => loadGuides(new URL('../content.json', import.meta.url), signal) });
  void search.start();
}
openSearch();
window.addEventListener('pagehide', () => { void search.destroy(); });
// A back/forward-cache restore needs a fresh owned engine after pagehide cleanup.
window.addEventListener('pageshow', event => { if (event.persisted) openSearch(); });
