import { createRaveldex } from '@vmitsaras/raveldex';
import { createFilters } from '@vmitsaras/raveldex/addons/filters';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { createDirectory, connectDirectoryURL } from '@vmitsaras/raveldex/addons/ui/directory';
import { schema, groups, records } from './directory-data.mjs';

window.directoryBoots = (window.directoryBoots ?? 0) + 1;
const nativePush = history.pushState, nativeReplace = history.replaceState;
const calls = [], writes = [], events = [];
history.replaceState({ application: { preserved: ['original', 7] } }, '', location.href);
history.pushState = function(state, unused, url) { writes.push({ kind: 'push', url: String(url) }); return Reflect.apply(nativePush, this, [state, unused, url]); };
history.replaceState = function(state, unused, url) { writes.push({ kind: 'replace', url: String(url) }); return Reflect.apply(nativeReplace, this, [state, unused, url]); };
const engine = createRaveldex({ schema, addons: [createFilters({ fields: ['kind', 'tags'] }), createFacets({ fields: ['kind', 'tags'] })] });
await engine.addMany(records);
let holdNext = false, held, release;
const borrower = { ...engine, search: async (q, options) => {
  calls.push({ query: q, offset: options.offset, limit: options.limit });
  if (holdNext) {
    holdNext = false; const { signal, ...uninterrupted } = options;
    const found = await engine.search(q, uninterrupted);
    window.directoryHeld = true; await held; return found;
  }
  return engine.search(q, options);
} };
const directory = createDirectory({ engine: borrower, groups, pageSize: 2 });
directory.subscribe(snapshot => {
  events.push({ status: snapshot.status, text: snapshot.state.text, page: snapshot.state.page, change: snapshot.change });
  document.getElementById('state').textContent = JSON.stringify(snapshot);
});
let binding, second, secondBinding;
window.directoryFixture = {
  directory, calls, writes, events,
  connect(policy = 'push') {
    binding = connectDirectoryURL({ controller: directory, host: window, parameters: { query: 'q', page: 'p', filters: { kind: 'k', tags: 'tag' } }, history: policy });
    return binding.read();
  },
  binding: () => binding,
  holdNext() { holdNext = true; window.directoryHeld = false; held = new Promise(done => { release = done; }); },
  release() { release?.(); },
  mutate() { return engine.add({ id: 'z', text: { title: 'new guide' }, metadata: { kind: 'guide', tags: ['red'] } }); },
  createSecond(conflict = false) {
    second = createDirectory({ engine: borrower, groups, pageSize: 2 });
    try {
      secondBinding = connectDirectoryURL({ controller: second, host: window, parameters: conflict
        ? { query: 'q', page: 'otherPage', filters: { kind: 'otherKind', tags: 'otherTags' } }
        : { query: 'otherQ', page: 'otherPage', filters: { kind: 'otherKind', tags: 'otherTags' } }, history: 'push' });
      return secondBinding.read();
    } catch (error) { second.destroy(); throw error; }
  },
  second: () => second,
  nativeReplace(url) { return Reflect.apply(nativeReplace, history, [history.state, '', url]); },
  async cleanup() { release?.(); binding?.destroy(); secondBinding?.destroy(); directory.destroy(); second?.destroy(); await engine.dispose(); },
};
