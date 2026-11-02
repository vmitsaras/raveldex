import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
import { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';
import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';

// Equal-length body-only records make the three distinct prov* words equal in
// document frequency/length, so their expected tie order is hand-derived by ID.
const rows = [
  ['alpha', 'Provider guide', '/guides/provider/#usage', 'source provider'],
  ['beta', 'Provide & <b>literal</b>', '/guides/provide/', 'source provide'],
  ['gamma', 'Providers guide', '/guides/providers/', 'source providers'],
  ['delta', 'Sources', '/guides/sources/', 'sources pear'],
  ['epsilon', 'Single letter', '/guides/letter/', 'source p'],
  ['unicode', 'Café', '/guides/cafe/', 'source café'],
  ['plain', 'Yellow', '/guides/yellow/', 'plain yellow'],
  ['unsafe', '<img src=x onerror="window.inlineInjection=1">', '/guides/unsafe/', 'safe text'],
];

window.inlineInjection = 0;
window.createInlineFixture = async (extraOptions = {}, fixtureOptions = {}) => {
  const root = document.getElementById('inline-root');
  const originalNodes = [...root.childNodes];
  const engine = createRaveldex({ schema: { text: { body: {} } }, ...(fixtureOptions.limits ? { limits: fixtureOptions.limits } : {}) });
  await engine.addMany(rows.map(([id, , , body]) => ({ id, text: { body } })));
  const state = { calls: [], pending: [], holdNext: false, failNext: false, disposals: 0 };
  const borrowed = Object.freeze({ ...engine,
    async search(query, options = {}) {
      const call = { query, options: { ...options, signal: undefined }, signal: options.signal, completed: false };
      state.calls.push(call);
      if (state.failNext) { state.failNext = false; throw new RaveldexError('WORK_LIMIT_EXCEEDED'); }
      const held = state.holdNext; state.holdNext = false;
      const { signal: ignored, ...withoutSignal } = options;
      void ignored;
      // A held reply still comes from the real native engine, deliberately
      // ignoring AbortSignal so presentation freshness is tested independently.
      const result = await engine.search(query, held ? withoutSignal : options);
      call.result = result;
      if (held) await new Promise(resolve => state.pending.push(resolve));
      call.completed = true;
      return result;
    },
    async dispose() { state.disposals++; return engine.dispose(); },
  });
  const documents = rows.map(([id, title, url]) => ({ id, title, url }));
  const mountOptions = { root, engine: borrowed, documents, debounceMs: 30, ...extraOptions };
  let handle = mountRaveldexInline(mountOptions);
  const isolated = [];
  window.inlineHarness = {
    root, originalNodes, engine, borrowed, state, documents, mountOptions,
    get handle() { return handle; },
    duplicate() { return mountRaveldexInline({ root, deliberatelyInvalid: true }) === handle; },
    remount(options = {}) { handle = mountRaveldexInline({ ...mountOptions, ...options }); return Object.isFrozen(handle); },
    release() { for (const finish of state.pending.splice(0)) finish(); },
    calls() { return state.calls.map(({ query, options, signal, completed, result }) => ({ query, options, aborted: signal?.aborted ?? false, completed, result })); },
    invalidCases() {
      let getters = 0;
      const getterMessages = {};
      Object.defineProperty(getterMessages, 'idle', { enumerable: true, get() { getters++; return 'Do not execute'; } });
      const getterDocument = { id: 'alpha', url: '/guides/a/' };
      Object.defineProperty(getterDocument, 'title', { enumerable: true, get() { getters++; return 'Do not execute'; } });
      const cases = [
        ['unknown option', { foreign: true }],
        ['unsupported mode', { mode: 'phrase' }],
        ['zero page', { pageSize: 0 }],
        ['large debounce', { debounceMs: 2001 }],
        ['duplicate IDs', { documents: [{ id: 'a', title: 'A', url: '/a/' }, { id: 'a', title: 'Again', url: '/b/' }] }],
        ['whitespace title', { documents: [{ id: 'a', title: ' \n\t', url: '/a/' }] }],
        ['accessor document', { documents: [getterDocument] }],
        ['empty message', { messages: { idle: ' ' } }],
        ['malformed message', { messages: { idle: '\ud800' } }],
        ['long message', { messages: { idle: 'x'.repeat(513) } }],
        ['callback message', { messages: { idle: () => 'No' } }],
        ['unknown message', { messages: { foreign: 'No' } }],
        ['accessor message', { messages: getterMessages }],
        ...['javascript:alert(1)', 'data:text/html,unsafe', 'https://user:secret@example.test/'].map(url => ['unsafe URL', { documents: [{ id: 'a', title: 'A', url }] }]),
      ];
      const admitted = state.calls.length;
      const results = cases.map(([name, extra]) => {
        const target = document.createElement('div');
        const original = document.createTextNode('authored fallback'); target.append(original); document.body.append(target);
        let code;
        try { mountRaveldexInline({ root: target, engine: borrowed, documents, ...extra }); }
        catch (error) { code = error.code; }
        const preserved = target.childNodes.length === 1 && target.firstChild === original;
        target.remove(); return { name, code, preserved };
      });
      return { results, getters, searches: state.calls.length - admitted };
    },
    collisions() {
      let legacyOnInline;
      const before = root.firstChild;
      try { mountRaveldexUI({ root, engine: borrowed, documents }); } catch (error) { legacyOnInline = error.code; }
      const inlineUnchanged = root.firstChild === before;
      const other = document.createElement('div'); document.body.append(other);
      const legacy = mountRaveldexUI({ root: other, engine: borrowed, documents });
      const legacyNode = other.firstChild;
      let inlineOnLegacy;
      try { mountRaveldexInline({ root: other, engine: borrowed, documents }); } catch (error) { inlineOnLegacy = error.code; }
      const legacyUnchanged = other.firstChild === legacyNode;
      legacy.destroy(); other.remove();
      return { legacyOnInline, inlineOnLegacy, inlineUnchanged, legacyUnchanged };
    },
    second() {
      const other = document.createElement('div'); other.id = 'second-inline'; document.body.append(other);
      const ui = mountRaveldexInline({ root: other, engine: borrowed, documents, messages: { label: 'Second search' } });
      isolated.push({ root: other, handle: ui }); return true;
    },
    async reentrantMount() {
      const target = document.createElement('div'); document.body.append(target);
      let duplicate, reactions = 0, armed = true;
      const options = { root: target, engine: borrowed, documents };
      customElements.define('inline-reentrant-host', class extends HTMLElement {
        disconnectedCallback() {
          reactions++;
          if (!armed) return;
          armed = false;
          duplicate = mountRaveldexInline(options);
        }
      });
      const original = document.createElement('inline-reentrant-host');
      original.append(document.createTextNode('Original custom-element fallback')); target.append(original);
      const outer = mountRaveldexInline(options);
      try {
        await outer.search('source p');
        const liveIDs = [...target.querySelectorAll('.raveldex-inline__result')].map(node => node.getAttribute('data-raveldex-inline-result'));
        const sameHandle = duplicate === outer;
        outer.destroy();
        const restored = target.childNodes.length === 1 && target.firstChild === original;
        const alive = await engine.search({ kind: 'text', text: 'plain yellow' });
        return { sameHandle, liveIDs, restored, reactions, disposals: state.disposals, engineIDs: alive.hits.map(hit => hit.id) };
      } finally {
        // Release both handles even if a broken mount admitted a second owner.
        outer.destroy(); if (duplicate !== outer) duplicate?.destroy(); target.remove();
      }
    },
    async cleanup() { handle.destroy(); for (const item of isolated) { item.handle.destroy(); item.root.remove(); } this.release(); await engine.dispose(); },
  };
  return { frozen: Object.isFrozen(handle) };
};
