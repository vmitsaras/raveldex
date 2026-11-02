import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
import { createWorkerRaveldex } from '@vmitsaras/raveldex/adapters/worker';
import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';
import { sectionAddons } from './inline-sections-worker.mjs';
import corpus from './corpus.json';
import projection from './projection.json';
window.createSectionFixture = async (options = {}, setup = {}) => {
  const root = document.querySelector('#section-root'), originalNodes = [...root.childNodes];
  const strategy = setup.strategy ?? 'source', feature = setup.feature ?? 'sections';
  const configuration = { schema: corpus.schema, addons: sectionAddons(strategy, feature, setup.settings) };
  let owner;
  if (setup.host === 'worker') {
    const url = new URL('./section-worker.mjs', import.meta.url);
    url.searchParams.set('strategy', strategy); url.searchParams.set('feature', feature); url.searchParams.set('settings', JSON.stringify(setup.settings ?? {}));
    owner = await createWorkerRaveldex({ worker: new Worker(url, { type: 'module' }), configuration, ownership: 'owned', sameHost: true });
  } else owner = createRaveldex(configuration);
  const rows = setup.capacity ? Array.from({ length: setup.capacity }, (_, index) => ({ ...corpus.records[0], id: 'page:' + String(index).padStart(4, '0') })) : corpus.records;
  let mutation; for (let index = 0; index < rows.length; index += 256) mutation = await owner.addMany(rows.slice(index, index + 256));
  const maps = structuredClone({ kind: 'raveldex-page-sections', version: 1, revision: mutation.revision,
    pages: setup.capacity ? rows.map(row => ({ pageId: row.id, sections: projection.pages[0].sections })) : projection.pages });
  if (setup.mapOverride) {
    const index = maps.pages.findIndex(p => p.pageId === setup.mapOverride.pageId);
    if (index >= 0) maps.pages[index] = setup.mapOverride; else maps.pages.push(setup.mapOverride);
  }
  const display = setup.capacity ? rows.map(row => ({ id: row.id, title: row.id })) : corpus.documents;
  const documents = display.map(d => ({ ...d, url: (setup.base ?? '/help/') + 'guide/' + d.id.slice(-1) + '/' }));
  const state = { queryId: 'cross-section', calls: [], pending: [], holdEvidence: false, holdMain: false, badReply: null,
    failure: null, spoof: false, mutateBeforeEvidence: false, running: 0, maxRunning: 0, disposals: 0 };
  const borrowed = Object.freeze({ ...owner, async search(input, request = {}) {
    const query = corpus.queries.find(q => q.id === state.queryId).query;
    const evidence = !!request.extensions?.['section-evidence'];
    const call = { query, request: { ...request, signal: undefined }, evidence, aborted: false };
    request.signal?.addEventListener('abort', () => { call.aborted = true; }, { once: true }); state.calls.push(call);
    state.running++; state.maxRunning = Math.max(state.maxRunning, state.running);
    try {
      if (evidence && state.failure) { const code = state.failure; state.failure = null; if (state.spoof) throw { code }; throw new RaveldexError(code); }
      if (evidence && state.mutateBeforeEvidence) { state.mutateBeforeEvidence = false; await owner.replace({ ...corpus.records[0], text: { ...corpus.records[0].text, title: corpus.records[0].text.title + ' ' } }); }
      const held = evidence ? state.holdEvidence : state.holdMain;
      if (evidence) state.holdEvidence = false; else state.holdMain = false;
      const { signal, ...without } = request;
      let result = await owner.search(query, held ? without : request);
      if (held) await new Promise(done => state.pending.push(done));
      if (evidence && state.badReply) {
        result = structuredClone(result); const data = result.extensions['section-evidence'], d = data.documents[0];
        const bad = state.badReply; state.badReply = null;
        if (bad === 'complete') data.complete = false;
        if (bad === 'model') result.model = 'foreign';
        if (bad === 'total') result.total++;
        if (bad === 'hits') result.hits.reverse();
        if (bad === 'eligibility') d.eligibility = 'excluded';
        if (bad === 'index') d.sectionPreviews[0].sectionIndex = 63;
        if (bad === 'duplicate') d.sectionPreviews[1].sectionIndex = d.sectionPreviews[0].sectionIndex;
        if (bad === 'misorder') d.sectionPreviews.reverse();
        if (bad === 'range') d.ranges[0].valueIndex = 64;
        if (bad === 'ordinal') d.ranges[0].position = -1;
        if (bad === 'term') d.ranges[0].term = '';
        if (bad === 'field') d.sectionPreviews[0].snippet.field = 'title';
        if (bad === 'span') d.sectionPreviews[0].snippet.end++;
        if (bad === 'wide-mark') d.sectionPreviews[0].snippet.highlights = [{ start: 0, end: d.sectionPreviews[0].snippet.text.length }];
        if (bad === 'highlight') d.sectionPreviews[0].snippet.highlights[0].end = 241;
        if (bad === 'grapheme') { d.sectionPreviews[0].snippet.highlights = [{ start: 0, end: 1 }]; }
        if (bad === 'text') d.sectionPreviews[0].snippet.text = '\ud800'.repeat(d.sectionPreviews[0].snippet.text.length);
        if (bad === 'window-flag') d.sectionPreviews[0].snippetOmissions.windowLimit = true;
        if (bad === 'highlight-flag') d.sectionPreviews[0].snippetOmissions.highlightLimit = true;
        if (bad === 'null-window-flag') d.sectionPreviews[0].snippetOmissions.windowLimit = true;
        if (bad === 'null-oversized-count') d.sectionPreviews[0].snippetOmissions.matchTooLong--;
        if (bad === 'omissions') d.sectionOmissions.omittedSections++;
        if (bad === 'revision') data.revision++;
        if (bad === 'getter') Object.defineProperty(d, 'ranges', { get() { throw new Error('reply getter ran'); }, enumerable: true });
      }
      call.result = result; return result;
    } finally { state.running--; }
  }, async dispose() { state.disposals++; return owner.dispose(); } });
  const uiOptions = { root, engine: borrowed, documents, pageSize: 2, maxRenderedResults: 4, pageSections: maps, debounceMs: 0, ...options };
  let handle = mountRaveldexInline(uiOptions);
  window.sectionHarness = { root, owner, borrowed, state, maps, documents, originalNodes, uiOptions,
    get handle() { return handle; }, release() { for (const done of state.pending.splice(0)) done(); },
    async search(queryId = 'cross-section') { state.queryId = queryId; await handle.search('active'); },
    remount(extra = {}) { handle.destroy(); handle = mountRaveldexInline({ ...uiOptions, ...extra }); },
    async cleanup() { handle.destroy(); this.release(); await owner.dispose(); },
    invalidOptions() {
      const valid = structuredClone(maps), first = valid.pages[0].sections[0];
      const modified = alter => { const value = structuredClone(valid); alter(value); return value; };
      const cases = [
        ['cap without map', { pageSections: undefined, maxSectionPreviews: 1 }], ['cap zero', { maxSectionPreviews: 0 }],
        ['cap four', { maxSectionPreviews: 4 }], ['cap null', { maxSectionPreviews: null }], ['snippet conflict', { snippetFields: [] }],
        ['null map', { pageSections: null }], ['unknown page', { pageSections: modified(v => v.pages[0].pageId = 'foreign') }],
        ['duplicate page', { pageSections: modified(v => v.pages.push(v.pages[0])) }],
        ['duplicate anchor', { pageSections: modified(v => v.pages[0].sections[1].anchor = first.anchor) }],
        ['overlap', { pageSections: modified(v => v.pages[0].sections[1].start = 19) }],
        ['empty heading', { pageSections: modified(v => v.pages[0].sections[0].heading = ' ') }],
        ['invalid anchor', { pageSections: modified(v => v.pages[0].sections[0].anchor = 'a b') }],
        ['fragment directive', { pageSections: modified(v => v.pages[0].sections[0].anchor = ':~:text=bad') }],
        ['bad unicode', { pageSections: modified(v => v.pages[0].sections[0].anchor = '\ud800') }],
        ['empty span', { pageSections: modified(v => v.pages[0].sections[0].end = 0) }],
        ['extra key', { pageSections: modified(v => v.pages[0].sections[0].foreign = true) }],
        ['sparse', { pageSections: modified(v => delete v.pages[0].sections[0]) }],
        ['null prototype shape okay', null],
        ['getter', { pageSections: modified(v => Object.defineProperty(v.pages[0].sections[0], 'heading', { get() { throw new Error('map getter ran'); }, enumerable: true })) }],
        ['preexisting empty fragment', { documents: documents.map(d => ({ ...d, url: d.url + '#' })) }],
        ['preexisting fragment', { documents: documents.map(d => ({ ...d, url: d.url + '#prior' })) }],
      ].filter(([, extra]) => extra);
      return cases.map(([name, extra]) => {
        const target = document.createElement('div'), original = document.createTextNode('fallback'); target.append(original); document.body.append(target);
        let code, ui; try { ui = mountRaveldexInline({ ...uiOptions, ...extra, root: target }); } catch (error) { code = error.code; }
        const preserved = target.childNodes.length === 1 && target.firstChild === original; ui?.destroy(); target.remove(); return { name, code, preserved };
      });
    },
  };
};
