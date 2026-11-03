import { createRaveldex } from '@vmitsaras/raveldex';
import { createFilters } from '@vmitsaras/raveldex/addons/filters';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { createDirectory, connectDirectoryURL } from '@vmitsaras/raveldex/addons/ui/directory';
import { mountRaveldexDirectory } from '@vmitsaras/raveldex/addons/ui/directory/view';
import { mountRaveldexDirectoryCards } from '@vmitsaras/raveldex/addons/ui/directory/cards';
import { schema, groups, records } from './directory-data.mjs';
const root = document.getElementById('directory'), original = root.firstChild;
const engine = createRaveldex({ schema, addons: [createFilters({ fields: ['kind', 'tags'] }), createFacets({ fields: ['kind', 'tags'] })] });
await engine.addMany(records);
const labels = [{ field: 'kind', label: 'Type' }, { field: 'tags', label: 'Tags' }];
const documents = records.map((record, index) => ({ id: record.id, title: record.text.title, url: '/resource/' + record.id + '/',
  ...(index === 2 ? {} : { excerpt: 'Original excerpt ' + record.id, category: 'Walking resources', breadcrumb: ['Library', 'Trails'], date: '2 November 2026', fields: [{ name: 'Distance', value: '7 km' }] }),
  ...(index === 2 ? {} : { image: { src: index === 1 ? '/images/broken.png' : '/images/' + record.id + '.svg', alt: index === 3 ? '' : 'Trail photograph ' + record.id, width: 480, height: 320 } }),
}));
let controller, view, url, disposed = 0;
const calls = [];
const borrowed = { ...engine, search(query, options) { calls.push({ query, offset: options.offset, limit: options.limit }); return engine.search(query, options); }, dispose() { disposed++; return engine.dispose(); } };
async function remount(options = {}) {
  url?.destroy(); view?.destroy(); controller?.destroy();
  controller = createDirectory({ engine: borrowed, groups, pageSize: 2 });
  view = mountRaveldexDirectoryCards({ root, controller, documents, groups: labels, debounceMs: 15, ...options.view });
  if (options.url) {
    url = connectDirectoryURL({ controller, host: window, parameters: { query: 'q', page: 'page', filters: { kind: 'kind', tags: 'tag' } }, history: 'push' });
    await url.read();
  } else await controller.refresh();
}
window.directoryCards = { root, original, engine, documents, labels, calls, mountRaveldexDirectoryCards, mountRaveldexDirectory, createDirectory,
  controller: () => controller, view: () => view, url: () => url, remount, disposed: () => disposed,
  async cleanup() { url?.destroy(); view?.destroy(); controller?.destroy(); await engine.dispose(); },
};
await remount();
window.directoryCardsReady = true;
