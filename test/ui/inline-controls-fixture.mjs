import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
import { createWorkerRaveldex } from '@vmitsaras/raveldex/adapters/worker';
import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';
import { controlsAddons } from './inline-controls-worker.mjs';

const basicRows = (count = 12) => Array.from({ length: count }, (_, i) => ({ id: `item-${String(i).padStart(2, '0')}`,
  text: { body: 'source provider' }, metadata: { category: i < 7 ? 'Guide' : 'Reference' } }));
const caseRows = name => name === 'unicode' ? [
  { id: 'unicode', text: { body: '😀 CAFE\u0301—Provider <script>literal</script>' }, metadata: { category: 'Guide' } },
] : name === 'values' ? [
  { id: 'values', text: { body: ['CAFE\u0301 source', 'Provider after'] }, metadata: { category: 'Guide' } },
] : name === 'omissions' ? [
  { id: 'omissions', text: { body: 'source provider '.repeat(60) }, metadata: { category: 'Guide' } },
] : name === 'capacity' ? Array.from({ length: 1005 }, (_, i) => ({ id: `large-${String(i).padStart(4, '0')}`,
  text: { body: 'source provider' }, metadata: { category: 'Guide' } }))
  : name === 'projection' ? Array.from({ length: 101 }, (_, i) => ({ id: `bucket-${String(i).padStart(3, '0')}`,
  text: { body: 'source provider' }, metadata: { category: `Category ${String(i).padStart(3, '0')}` } })) : basicRows();

window.createControlsFixture = async (uiOptions = {}, setup = {}) => {
  const root = document.getElementById('controls-root');
  const originalNodes = [...root.childNodes];
  const strategy = setup.strategy ?? 'source', host = setup.host ?? 'direct', features = setup.features ?? 'all';
  const rows = setup.count === undefined ? caseRows(setup.corpus) : basicRows(setup.count);
  const snippets = setup.corpus === 'omissions' ? { maxSnippets: 1, maxCodeUnits: 30, maxHighlights: 1 } : {};
  const configuration = { schema: { text: { body: {} }, metadata: { category: { type: 'string' } } },
    addons: controlsAddons(strategy, features, snippets) };
  let realWorker, owner;
  if (host === 'worker') {
    const url = new URL('./controls-worker.mjs', import.meta.url);
    url.searchParams.set('strategy', strategy); url.searchParams.set('features', features); url.searchParams.set('snippets', JSON.stringify(snippets));
    realWorker = new Worker(url, { type: 'module' });
    owner = await createWorkerRaveldex({ worker: realWorker, configuration, ownership: 'owned', sameHost: true });
  } else owner = createRaveldex(configuration);
  for (let i = 0; i < rows.length; i += 256) await owner.addMany(rows.slice(i, i + 256));
  const state = { calls: [], pending: [], holdMain: false, holdEvidence: false, failNext: false,
    mutateBeforeEvidence: false, mutationNumber: 0, disposals: 0 };
  const borrowed = Object.freeze({ ...owner,
    async search(query, options = {}) {
      const evidence = Boolean(options.extensions?.snippets);
      const call = { query, options: { ...options, signal: undefined }, signal: options.signal, evidence, complete: false };
      state.calls.push(call);
      if (state.failNext) { state.failNext = false; throw new RaveldexError('WORK_LIMIT_EXCEEDED'); }
      if (evidence && state.mutateBeforeEvidence) {
        state.mutateBeforeEvidence = false;
        const first = rows[0]; await owner.replace({ ...first, metadata: { category: `Changed ${++state.mutationNumber}` } });
      }
      const held = evidence ? state.holdEvidence : state.holdMain;
      if (evidence) state.holdEvidence = false; else state.holdMain = false;
      const { signal: ignored, ...withoutSignal } = options; void ignored;
      const result = await owner.search(query, held ? withoutSignal : options);
      call.result = result;
      if (held) await new Promise(resolve => state.pending.push(resolve));
      call.complete = true;
      return result;
    },
    async dispose() { state.disposals++; return owner.dispose(); },
  });
  const documents = rows.map(row => ({ id: row.id, title: `Result ${row.id}`, url: `/guides/${row.id}/` }));
  const options = { root, engine: borrowed, documents, debounceMs: 30, ...uiOptions };
  let handle = mountRaveldexInline(options);
  window.controlsHarness = {
    owner, root, originalNodes, rows, state, borrowed, options,
    get handle() { return handle; },
    release() { for (const done of state.pending.splice(0)) done(); },
    calls() { return state.calls.map(({ query, options, signal, evidence, complete, result }) => ({ query, options,
      aborted: signal?.aborted ?? false, evidence, complete, result })); },
    async recategorize() {
      for (const row of rows.filter(row => row.metadata.category === 'Guide'))
        await owner.replace({ ...row, metadata: { category: 'Reference' } });
    },
    async replaceFirst() { const row = rows[0]; return owner.replace({ ...row, metadata: { category: 'Changed' } }); },
    invalidOptions() {
      const before = state.calls.length;
      const cases = [
        ['null rendered cap', { maxRenderedResults: null }], ['cap below page', { maxRenderedResults: 4 }],
        ['cap above maximum', { maxRenderedResults: 1001 }],
        ['null facets', { facets: null }], ['nonarray facets', { facets: {} }],
        ['missing facet label', { facets: [{ field: 'category' }] }],
        ['null snippet fields', { snippetFields: null }], ['nonarray snippet fields', { snippetFields: 'body' }],
        ['invalid snippet field', { snippetFields: [1] }],
      ];
      const outcomes = cases.map(([name, extra]) => {
        const target = document.createElement('div'), original = document.createTextNode('original fallback');
        target.append(original); document.body.append(target);
        let code, ui;
        try { ui = mountRaveldexInline({ root: target, engine: borrowed, documents, ...extra }); }
        catch (error) { code = error.code; }
        const preserved = target.childNodes.length === 1 && target.firstChild === original;
        ui?.destroy(); target.remove(); return { name, code, preserved };
      });
      return { outcomes, searches: state.calls.length - before };
    },
    remount(extra = {}) { handle.destroy(); handle = mountRaveldexInline({ ...options, ...extra }); },
    async cleanup() { handle.destroy(); this.release(); await owner.dispose(); },
  };
  return { host, strategy, count: rows.length };
};
