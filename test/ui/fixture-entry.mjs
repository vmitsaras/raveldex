import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { createInspector } from '@vmitsaras/raveldex/addons/inspector';
import { createSnippetEvidence } from '@vmitsaras/raveldex/addons/snippets';
import { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';

const fixtures = [
  ['alpha', 'Atomic alpha', '/docs/alpha#commit', 'Guide', 'red apple red. Atomic commits retain a coherent revision.'],
  ['beta', 'Beta banana', 'https://example.test/docs/beta', 'Reference', 'blue banana recovery'],
  ['delta', 'Delta', '/docs/delta', 'Reference', 'red apple transaction'],
  ['epsilon', 'Epsilon', '/docs/epsilon', 'Guide', 'red grapefruit'],
  ['gamma', 'Gamma red', '/docs/gamma', 'Guide', 'red apple source'],
  ['long', 'Long content', '/docs/long', 'Reference', 'before '.repeat(100) + 'red 🍎 café after '.repeat(100)],
  ['plain', 'Plain yellow', '/docs/plain', 'Reference', 'yellow plum'],
  ['quoted', 'Quoted "text" & safe', '/docs/quoted', 'Guide', 'red <script>window.fixtureInjection=1</script> & original text'],
  ['unsafe', '<img src=x onerror="window.fixtureInjection=1">', '/docs/unsafe', 'Guide', 'red <img src=x onerror="window.fixtureInjection=1"> & literal source'],
];

window.fixtureInjection = 0;
window.createFixture = async (options = {}, fixtureOptions = {}) => {
  const root = document.querySelector('#fixture-root');
  const originalNodes = [...root.childNodes];
  const selectedFixtures = fixtures.slice(0, fixtureOptions.maxDocuments ?? fixtures.length);
  const engine = createRaveldex({
    schema: { text: { title: {}, body: {} }, metadata: { category: { type: 'string' } } },
    ...(fixtureOptions.maxDocuments === undefined ? {} : { limits: { maxDocuments: fixtureOptions.maxDocuments } }),
    addons: [createSourceProvider({ fields: ['title', 'body'] }), createSourcePhrases({ fields: ['title', 'body'] }),
      createFacets({ fields: ['category'] }), createInspector(),
      createSnippetEvidence({ fields: { title: 'source', body: 'source' }, maxCodeUnits: 120 })],
  });
  await engine.addMany(selectedFixtures.map(([id, title, , category, body]) => ({ id, text: { title, body }, metadata: { category } })));
  const state = { calls: [], holdNext: false, failNext: false, mutateBeforeSnippets: false, pending: [], disposals: 0 };
  const borrowed = Object.freeze({ ...engine,
    async search(query, searchOptions = {}) {
      const call = { query, options: { ...searchOptions, signal: undefined }, signal: searchOptions.signal, completed: false };
      state.calls.push(call);
      fixtureOptions.observeSearch?.(call, state.calls.length - 1);
      const hold = state.holdNext; state.holdNext = false;
      if (state.failNext) { state.failNext = false; throw new RaveldexError('WORK_LIMIT_EXCEEDED', { path: 'ui.fixture' }); }
      if (state.mutateBeforeSnippets && searchOptions.extensions?.snippets) {
        state.mutateBeforeSnippets = false;
        await engine.replace({ id: 'alpha', text: { title: fixtures[0][1], body: fixtures[0][4] + ' revision two' }, metadata: { category: fixtures[0][3] } });
      }
      // This deliberately ignores the UI signal. The underlying engine still
      // evaluates the real query, and only its completed reply is withheld.
      const { signal: ignoredSignal, ...withoutSignal } = searchOptions;
      const result = await engine.search(query, hold ? withoutSignal : searchOptions);
      void ignoredSignal;
      call.result = result;
      if (hold) await new Promise(resolve => state.pending.push(resolve));
      call.completed = true;
      return result;
    },
    async dispose() { state.disposals++; return engine.dispose(); },
  });
  const mountOptions = { root, engine: borrowed,
    documents: selectedFixtures.map(([id, title, url]) => ({ id, title, url })),
    facets: [{ field: 'category', label: 'Category' }], snippetFields: ['title', 'body'],
    pageSize: 3, debounceMs: 35, ...options };
  let handle = mountRaveldexUI(mountOptions);
  window.harness = {
    engine, borrowed, state, fixtures: selectedFixtures, root, originalNodes,
    get handle() { return handle; },
    duplicate() { return mountRaveldexUI(mountOptions) === handle; },
    invalidURLs() {
      return ['javascript:alert(1)', 'data:text/html,unsafe', 'https://user:secret@example.test/docs'].map(url => {
        const isolated = document.createElement('div'), original = document.createTextNode('original fallback');
        isolated.append(original); document.body.append(isolated);
        let code;
        try { mountRaveldexUI({ root: isolated, engine: borrowed, documents: [{ id: 'alpha', title: 'Alpha', url }] }); }
        catch (error) { code = error.code; }
        const restored = isolated.childNodes.length === 1 && isolated.firstChild === original;
        isolated.remove(); return { url, code, authoredNodePreserved: restored };
      });
    },
    invalidLabels() {
      let getters = 0;
      const titleGetter = { id: 'alpha', url: '/docs/alpha' };
      Object.defineProperty(titleGetter, 'title', { enumerable: true, get() { getters++; throw new Error('fixture getter must not execute'); } });
      const facetGetter = { field: 'category' };
      Object.defineProperty(facetGetter, 'label', { enumerable: true, get() { getters++; throw new Error('fixture getter must not execute'); } });
      const labelGetter = {};
      Object.defineProperty(labelGetter, 'label', { enumerable: true, get() { getters++; throw new Error('fixture getter must not execute'); } });
      const cases = [
        ['whitespace input label', { label: ' \t\n' }],
        ['whitespace result title', { documents: [{ id: 'alpha', title: ' \t\n', url: '/docs/alpha' }] }],
        ['whitespace facet label', { facets: [{ field: 'category', label: ' \t\n' }] }],
        ['accessor result title', { documents: [titleGetter] }],
        ['accessor facet label', { facets: [facetGetter] }],
        ['accessor input label', labelGetter],
      ];
      const beforeCalls = state.calls.length;
      const outcomes = cases.map(([name, extras]) => {
        const isolated = document.createElement('div'), original = document.createTextNode('original fallback');
        isolated.className = 'authored-root'; isolated.setAttribute('data-authored', 'kept');
        isolated.append(original); document.body.append(isolated);
        const candidate = { root: isolated, engine: borrowed, documents: [{ id: 'alpha', title: 'Alpha', url: '/docs/alpha' }] };
        Object.defineProperties(candidate, Object.getOwnPropertyDescriptors(extras));
        let code;
        try { mountRaveldexUI(candidate); } catch (error) { code = error.code; }
        const restored = isolated.childNodes.length === 1 && isolated.firstChild === original
          && isolated.className === 'authored-root' && isolated.getAttribute('data-authored') === 'kept' && isolated.attributes.length === 2;
        isolated.remove(); return { name, code, authoredNodeAndAttributesPreserved: restored };
      });
      return { outcomes, getterExecutions: getters, admittedSearches: state.calls.length - beforeCalls };
    },
    destroy() { handle.destroy(); },
    remount() { handle = mountRaveldexUI(mountOptions); return Object.isFrozen(handle); },
    release() { for (const resolve of state.pending.splice(0)) resolve(); },
    calls() { return state.calls.map(({ query, options: queryOptions, signal, completed, result }) => ({
      query, options: queryOptions, aborted: signal?.aborted ?? false, completed, result,
    })); },
    async cleanup() { handle.destroy(); this.release(); await engine.dispose(); },
  };
  return { frozen: Object.isFrozen(handle) };
};
