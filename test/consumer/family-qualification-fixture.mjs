import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
import { createFilters } from '@vmitsaras/raveldex/addons/filters';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';
import { mountRaveldexModal } from '@vmitsaras/raveldex/addons/ui/modal';
import { mountRaveldexDropdown } from '@vmitsaras/raveldex/addons/ui/dropdown';
import { createDirectory } from '@vmitsaras/raveldex/addons/ui/directory';
import { mountRaveldexDirectory } from '@vmitsaras/raveldex/addons/ui/directory/view';
import { mountRaveldexDirectoryCards } from '@vmitsaras/raveldex/addons/ui/directory/cards';

// Hand-derived corpus: a..g have equal two-word bodies and equal shared-term
// frequency/length, so shared/sha* match seven tied IDs in ascending ID order.
// Display titles are not indexed. "quiet" matches only other, café only unicode.
const rows = [
  ['a', 'Alpha guide', 'shared alpha'], ['b', 'Bravo guide', 'shared bravo'],
  ['c', 'Charlie guide', 'shared charlie'], ['d', 'Delta guide', 'shared delta'],
  ['e', 'Echo guide', 'shared echo'], ['f', 'Foxtrot guide', 'shared foxtrot'],
  ['g', 'Golf guide', 'shared golf'], ['other', 'Other route', 'quiet route'],
  ['unicode', 'Café guide', 'source café'], ['plain', 'Plain words', 'other words'],
];
const requested = location.pathname.split('/')[1], surface = requested === 'full' ? 'inline' : requested;
const isDirectory = surface === 'directory' || surface === 'cards';
const configuration = { schema: { text: { body: {} }, metadata: { kind: { type: 'string' } } },
  ...(isDirectory ? { addons: [createFilters({ fields: ['kind'] }), createFacets({ fields: ['kind'] })] } : {}) };
const records = rows.map(([id, , body], index) => ({ id, text: { body }, metadata: { kind: index % 2 ? 'manual' : 'guide' } }));
const engine = createRaveldex(configuration); await engine.addMany(records);
const root = document.getElementById('family-root'), original = [...root.childNodes], trigger = document.getElementById('family-trigger');
const documents = rows.map(([id, title]) => ({ id, title, url: `/resource/${id}/` }));
const state = { calls: [], pending: [], holdNext: false, failNext: false, borrowedDisposals: 0, ownerDisposals: 0 };
const borrowed = { ...engine,
  async search(query, request = {}) {
    const call = { query, offset: request.offset ?? 0, limit: request.limit, complete: false, aborted: false };
    state.calls.push(call); request.signal?.addEventListener('abort', () => { call.aborted = true; }, { once: true });
    if (state.failNext) { state.failNext = false; call.failure = 'WORK_LIMIT_EXCEEDED'; throw new RaveldexError('WORK_LIMIT_EXCEEDED'); }
    const held = state.holdNext; state.holdNext = false;
    const { signal, ...withoutSignal } = request; void signal;
    // All successful replies come from the native engine. Holding an actual
    // completed reply deliberately ignores abort to exercise presentation freshness.
    const result = await engine.search(query, held ? withoutSignal : request);
    call.result = { total: result.total, revision: result.revision, ids: result.hits.map(hit => hit.id) };
    if (held) await new Promise(resolve => state.pending.push(resolve));
    call.complete = true; return result;
  },
  async dispose() { state.borrowedDisposals++; return engine.dispose(); },
};
let handle, controller, ended = false;
async function mount() {
  const common = { root, engine: borrowed, documents, pageSize: 2, maxRenderedResults: 4, debounceMs: 15, mode: 'prefix' };
  if (surface === 'inline') handle = mountRaveldexInline(common);
  else if (surface === 'modal') {
    handle = mountRaveldexModal({ ...common, trigger }); trigger.focus(); handle.open();
  } else if (surface === 'dropdown') handle = mountRaveldexDropdown({ root, engine: borrowed, documents, maxResults: 2, debounceMs: 15, mode: 'prefix', fullResults: { url: '/full/?lang=en#results', queryParameter: 'q' } });
  else if (isDirectory) {
    controller = createDirectory({ engine: borrowed, groups: [{ field: 'kind', values: ['guide', 'manual', 'none'] }], mode: 'prefix', pageSize: 2 });
    const options = { root, controller, documents, groups: [{ field: 'kind', label: 'Kind' }], debounceMs: 15 };
    handle = surface === 'directory' ? mountRaveldexDirectory(options) : mountRaveldexDirectoryCards({ ...options,
      documents: documents.map(record => ({ ...record, excerpt: `Original description for ${record.id}`, fields: [{ name: 'Kind', value: record.id }] })), presentation: { layout: 'grid', images: false } });
    await controller.refresh();
  } else throw Error('Unknown family fixture');
}
const release = () => { for (const resolve of state.pending.splice(0)) resolve(); };
window.family = {
  surface, root, state, rows, documents, engine,
  handle: () => handle, snapshot: () => controller?.getSnapshot(),
  hold() { state.holdNext = true; }, fail() { state.failNext = true; }, release,
  restored() { return original.length === root.childNodes.length && original.every((node, index) => root.childNodes[index] === node); },
  async remount() { handle.destroy(); controller?.destroy(); await new Promise(resolve => setTimeout(resolve, 0)); await mount(); },
  mutate() { return engine.replace({ id: 'other', text: { body: 'shared other' }, metadata: { kind: 'guide' } }); },
  async cleanup() { if (ended) return; ended = true; handle.destroy(); controller?.destroy(); release(); state.ownerDisposals++; await engine.dispose(); },
};
await mount();
if (requested === 'full') { const raw = new URL(location.href).searchParams.get('q') ?? ''; document.getElementById('query-echo').textContent = raw; await handle.search(raw); }
window.familyReady = true;
window.addEventListener('pagehide', () => { void window.family.cleanup(); }, { once: true });
