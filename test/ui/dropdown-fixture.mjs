import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
import { createWorkerRaveldex } from '@vmitsaras/raveldex/adapters/worker';
import { mountRaveldexDropdown } from '@vmitsaras/raveldex/addons/ui/dropdown';
import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';
import { mountRaveldexModal } from '@vmitsaras/raveldex/addons/ui/modal';
import { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';

// All indexed values have two basic words. The seven "shared" records have
// equal length/frequency, so their tied scores are hand-stated in ID order.
const records = [
  ['a', 'Alpha guide', 'shared alpha'], ['b', 'Bravo guide', 'shared bravo'],
  ['c', 'Charlie guide', 'shared charlie'], ['d', 'Delta guide', 'shared delta'],
  ['e', 'Echo guide', 'shared echo'], ['f', 'Foxtrot guide', 'shared foxtrot'],
  ['g', 'Golf guide', 'shared golf'], ['unicode', 'Café guide', 'singular café'],
  ['unsafe', '<img src=x onerror="window.dropdownInjection=1">', 'safe html'],
  ['other', 'Other guide', 'other words'],
];
const caseRows = setup => setup.stress
  ? Array.from({ length: 40 }, (_, i) => [`item-${String(i).padStart(2, '0')}`, `Result ${i} — ${'Long descriptive title '.repeat(8)}`, 'shared alpha'])
  : records;
const configuration = { schema: { text: { body: {} } } };
window.dropdownInjection = 0;
window.dropdownFixtures = [];
window.dropdownOwnerCreations = 0;

window.createDropdownFixture = async (options = {}, setup = {}) => {
  const root = document.getElementById(setup.root ?? 'dropdown-root');
  const rows = caseRows(setup), originalNodes = [...root.childNodes];
  let owner, worker, ownsOwner = !setup.shared;
  if (setup.shared) owner = window.dropdownHarness.owner;
  else if (setup.host === 'worker') {
    worker = new Worker(new URL('./dropdown-worker.mjs', import.meta.url), { type: 'module' });
    owner = await createWorkerRaveldex({ worker, configuration, ownership: 'owned', sameHost: true, responseTimeoutMs: 2500 });
  } else owner = createRaveldex(configuration);
  if (ownsOwner) {
    window.dropdownOwnerCreations++;
    await owner.addMany(rows.map(([id, , body]) => ({ id, text: { body } })));
  }
  const state = { calls: [], pending: [], holdNext: false, failNext: false, badReply: null, borrowedDisposals: 0,
    onAbort: null, onHeld: null, workerErrors: [] };
  worker?.addEventListener('error', event => { state.workerErrors.push(event.message); event.preventDefault(); });
  const borrowed = Object.freeze({ ...owner, async search(query, request = {}) {
    const call = { query, request: { ...request, signal: undefined }, aborted: false, complete: false };
    state.calls.push(call);
    request.signal?.addEventListener('abort', () => { call.aborted = true; state.onAbort?.(); }, { once: true });
    if (state.failNext) { state.failNext = false; throw new RaveldexError('WORK_LIMIT_EXCEEDED'); }
    const held = state.holdNext; state.holdNext = false;
    const { signal, ...withoutSignal } = request; void signal;
    // Held responses are real native results, intentionally ignoring abort so
    // request freshness is tested independently of cooperative owner behavior.
    let result = await owner.search(query, held ? withoutSignal : request);
    call.result = result;
    if (held) await new Promise(resolve => { state.pending.push(resolve); state.onHeld?.(); });
    if (state.badReply) {
      const kind = state.badReply; state.badReply = null;
      if (kind === 'total') result = { ...result, total: -1 };
      if (kind === 'revision') result = { ...result, revision: NaN };
      if (kind === 'model') result = { ...result, model: 'foreign' };
      if (kind === 'hits') result = { ...result, hits: [{ ...result.hits[0], id: 'not-a-display-record' }] };
    }
    call.complete = true; return result;
  }, async dispose() { state.borrowedDisposals++; return owner.dispose(); } });
  const documents = rows.map(([id, title]) => ({ id, title, url: `/guide/${encodeURIComponent(id)}/#details` }));
  const uiOptions = { root, engine: borrowed, documents, debounceMs: 30,
    fullResults: { url: '/search/?lang=de&mode=prefix&q=old#results', queryParameter: 'q' }, ...options };
  let handle = mountRaveldexDropdown(uiOptions);
  const h = { root, rows, owner, worker, ownsOwner, borrowed, state, documents, originalNodes, uiOptions,
    get handle() { return handle; },
    calls() { return state.calls.map(call => ({ ...call })); },
    release() { for (const resolve of state.pending.splice(0)) resolve(); },
    mount(extra = {}) { return mountRaveldexDropdown({ ...uiOptions, ...extra }); },
    remount(extra = {}) { handle.destroy(); handle = mountRaveldexDropdown({ ...uiOptions, ...extra }); return true; },
    restored() { return root.childNodes.length === originalNodes.length && originalNodes.every((node, i) => node === root.childNodes[i]); },
  };
  window.dropdownFixtures.push(h); window.dropdownHarness = h;
  return true;
};
window.cleanupDropdownFixtures = async () => {
  const fixtures = window.dropdownFixtures.splice(0);
  for (const h of fixtures) { h.state.onAbort = null; h.handle.destroy(); h.release(); }
  for (const h of fixtures) if (h.ownsOwner) await h.owner.dispose();
};
window.dropdownFactories = { mountRaveldexDropdown, mountRaveldexInline, mountRaveldexModal, mountRaveldexUI };

// The real full-results fixture is intentionally separate from dropdown
// rendering and consumes the configured raw URL value with the same mode.
if (location.pathname === '/search/') {
  const raw = new URL(location.href).searchParams.get('q') ?? '';
  const owner = createRaveldex(configuration);
  await owner.addMany(records.map(([id, , body]) => ({ id, text: { body } })));
  document.getElementById('query-echo').textContent = raw;
  const handle = mountRaveldexInline({ root: document.getElementById('full-root'), engine: owner,
    documents: records.map(([id, title]) => ({ id, title, url: `/guide/${encodeURIComponent(id)}/#details` })),
    mode: new URL(location.href).searchParams.get('mode') === 'text' ? 'text' : 'prefix' });
  window.cleanupDestination = async () => { handle.destroy(); await owner.dispose(); };
  await handle.search(raw);
}
