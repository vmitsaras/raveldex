import { createRaveldex } from '@vmitsaras/raveldex';
import { createFilters } from '@vmitsaras/raveldex/addons/filters';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { createDirectory, connectDirectoryURL } from '@vmitsaras/raveldex/addons/ui/directory';
import { mountRaveldexDirectory } from '@vmitsaras/raveldex/addons/ui/directory/view';
import { schema, groups, records } from './directory-data.mjs';
const root = document.getElementById('directory');
const original = root.firstChild;
const engine = createRaveldex({ schema, addons: [createFilters({ fields: ['kind', 'tags'] }), createFacets({ fields: ['kind', 'tags'] })] });
await engine.addMany(records);
const labels = [{ field: 'kind', label: 'Type', values: [{ value: 'guide', label: 'Guide' }, { value: 'manual', label: 'Manual' }] }, { field: 'tags', label: 'Tags' }];
const documents = records.map(r => ({ id: r.id, title: r.text.title || 'Resource ' + r.id, url: '/resource/' + r.id + '/' }));
let controller, view, url, held, release, holdNext = false, disposed = 0;
const calls = [], snapshots = [];
const borrowed = { ...engine, dispose() { disposed++; return engine.dispose(); }, search: async (query, options) => {
  calls.push({ query, offset: options.offset, limit: options.limit });
  if (holdNext) { holdNext = false; const { signal, ...rest } = options; const found = await engine.search(query, rest); window.directoryHeld = true; await held; return found; }
  return engine.search(query, options);
} };
async function remount(options = {}) {
  url?.destroy(); view?.destroy(); controller?.destroy();
  controller = createDirectory({ engine: options.missing ? { ...borrowed, search: (q, o) => missing.search(q, o) } : borrowed,
    groups: (options.groups ?? groups).map(g => ({ ...g, ...(options.limit !== undefined ? { limit: options.limit } : {}) })), pageSize: 2 });
  controller.subscribe(snapshot => snapshots.push({ status: snapshot.status, state: snapshot.state }));
  view = mountRaveldexDirectory({ root, controller, documents, groups: labels, debounceMs: 15, ...options.view });
  if (options.url) {
    url = connectDirectoryURL({ controller, host: window, parameters: { query: 'q', page: 'page', filters: { kind: 'kind', tags: 'tag' } }, history: 'push' });
    await url.read();
  } else await controller.refresh();
}
const missing = createRaveldex({ schema }); await missing.addMany(records);
window.directoryView = {
  engine, root, original, documents, labels, calls, snapshots, mountRaveldexDirectory, createDirectory,
  controller: () => controller, view: () => view, url: () => url,
  remount, disposed: () => disposed,
  hold() { holdNext = true; window.directoryHeld = false; held = new Promise(resolve => { release = resolve; }); }, release() { release?.(); },
  mutate() { return engine.replace({ ...records[0], text: { title: 'shared revised trail', body: 'shared trail' } }); },
  async cleanup() { release?.(); url?.destroy(); view?.destroy(); controller?.destroy(); await missing.dispose(); await engine.dispose(); },
};
await remount();
window.directoryReady = true;
