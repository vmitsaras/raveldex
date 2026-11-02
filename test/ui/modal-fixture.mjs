import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
import { createWorkerRaveldex } from '@vmitsaras/raveldex/adapters/worker';
import { mountRaveldexModal } from '@vmitsaras/raveldex/addons/ui/modal';
import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';
import { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';
import { modalAddons } from './modal-configuration.mjs';
import corpus from './corpus.json';
import projection from './projection.json';

window.modalInstances = [];
window.createModalFixture = async (options = {}, setup = {}) => {
  const root = document.getElementById(setup.root ?? 'modal-root');
  const trigger = document.getElementById(setup.trigger ?? 'modal-trigger');
  const originalNodes = [...root.childNodes];
  const originalAttributes = Object.fromEntries([...trigger.attributes].map(a => [a.name, a.value]));
  const strategy = setup.strategy ?? 'source', feature = setup.feature ?? 'sections';
  const configuration = { schema: { ...corpus.schema, metadata: { category: { type: 'string' } } },
    addons: modalAddons(strategy, feature, !!setup.facets) };
  let owner, worker;
  if (setup.host === 'worker') {
    const url = new URL('./modal-worker.mjs', import.meta.url);
    for (const [key, value] of Object.entries({ strategy, feature, facets: !!setup.facets })) url.searchParams.set(key, String(value));
    worker = new Worker(url, { type: 'module' });
    owner = await createWorkerRaveldex({ worker, configuration, ownership: 'owned', sameHost: true });
  } else owner = createRaveldex(configuration);
  const rows = corpus.records.map((row, index) => ({ ...row, metadata: { category: index < 2 ? 'Guide' : 'Reference' } }));
  const mutation = await owner.addMany(rows);
  const maps = structuredClone({ kind: 'raveldex-page-sections', version: 1, revision: mutation.revision, pages: projection.pages });
  const documents = corpus.documents.map(d => ({ ...d, url: (setup.base ?? '/help/') + 'guide/' + d.id.slice(-1) + '/' }));
  const state = { calls: [], pending: [], holdMain: false, holdContext: false, badReply: null, failNext: false,
    literalQueryId: null, disposals: 0, onAbort: null, onHeld: null, workerErrors: [] };
  worker?.addEventListener('error', event => { state.workerErrors.push(event.message); event.preventDefault(); });
  const borrowed = Object.freeze({ ...owner, async search(input, request = {}) {
    const query = state.literalQueryId ? corpus.queries.find(q => q.id === state.literalQueryId).query : input;
    const context = !!request.extensions?.['section-evidence'];
    const call = { query, request: { ...request, signal: undefined }, context, aborted: false, complete: false };
    state.calls.push(call);
    request.signal?.addEventListener('abort', () => { call.aborted = true; state.onAbort?.(); }, { once: true });
    if (state.failNext) { state.failNext = false; throw new RaveldexError('WORK_LIMIT_EXCEEDED'); }
    const held = context ? state.holdContext : state.holdMain;
    if (context) state.holdContext = false; else state.holdMain = false;
    const { signal, ...withoutSignal } = request;
    let result = await owner.search(query, held ? withoutSignal : request);
    call.result = result;
    if (held) await new Promise(done => { state.pending.push(done); state.onHeld?.(); });
    if (state.badReply === 'main' && !context) { state.badReply = null; result = { ...result, total: -1 }; }
    if (state.badReply === 'context' && context) { state.badReply = null; result = structuredClone(result); result.extensions['section-evidence'].complete = false; }
    call.complete = true; return result;
  }, async dispose() { state.disposals++; return owner.dispose(); } });
  const uiOptions = { root, trigger, engine: borrowed, documents, debounceMs: 0, pageSize: 2, maxRenderedResults: 4,
    ...(feature === 'sections' ? { pageSections: maps } : {}), ...(setup.facets ? { facets: [{ field: 'category', label: 'Category' }] } : {}), ...options };
  let handle = mountRaveldexModal(uiOptions);
  const h = { root, trigger, owner, worker, borrowed, rows, maps, documents, state, originalNodes, originalAttributes, uiOptions,
    get handle() { return handle; },
    release() { for (const done of state.pending.splice(0)) done(); },
    remount(extra = {}) { handle.destroy(); handle = mountRaveldexModal({ ...uiOptions, ...extra }); return handle; },
    mount(extra = {}) { return mountRaveldexModal({ ...uiOptions, ...extra }); },
    async literal(id = 'cross-section') { state.literalQueryId = id; await handle.search('active'); },
    async cleanup() { handle.destroy(); state.onAbort = null; this.release(); await owner.dispose(); },
    restored() { return root.childNodes.length === originalNodes.length && originalNodes.every((n, i) => root.childNodes[i] === n); },
  };
  window.modalInstances.push(h); window.modalHarness = h; return true;
};
window.modalFactories = { mountRaveldexModal, mountRaveldexInline, mountRaveldexUI };
window.cleanupModalFixtures = async () => {
  for (const h of window.modalInstances.splice(0)) await h.cleanup();
};
