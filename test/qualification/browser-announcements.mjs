// Test-only comparison of DOM announcement policies, never evidence of speech.
const root = document.getElementById('fixture-root');
const output = document.getElementById('announcement-output');
const description = document.getElementById('announcement-mode');
const trace = document.getElementById('announcement-trace');
if (!root || !output || !description || !trace || root.contains(output)) throw new Error('Announcement comparison shell is unavailable.');

const mode = new URL(location.href).searchParams.get('mode') ?? 'original';
if (!['original', 'settled-polite', 'settled-assertive'].includes(mode)) {
  description.textContent = `Announcement comparison failed: unknown mode ${mode}.`;
  trace.textContent = JSON.stringify({ mode, error: 'Unknown announcement mode.', speech: 'Not observed by this harness.' });
  throw new Error('Unknown announcement comparison mode.');
}
const busyScope = new URL(location.href).searchParams.get('busy') ?? 'shell';
if (!['shell', 'off', 'results'].includes(busyScope)) {
  description.textContent = `Announcement comparison failed: unknown busy scope ${busyScope}.`;
  trace.textContent = JSON.stringify({ mode, busyScope, error: 'Unknown busy scope.', speech: 'Not observed by this harness.' });
  throw new Error('Unknown announcement busy scope.');
}
// Test-page-only interception, installed before the package creates its UI.
// Removing attributes later in an observer would still expose transient busy
// changes. Keep requested state separately so publication never relies on a
// removed attribute. All non-shell writes, including Inspector, stay native.
const requestedBusy = new WeakMap();
const ownedShells = new WeakSet();
let mounting = false;
if (busyScope !== 'shell') {
  const nativeSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    if (name === 'aria-busy' && this.ownerDocument === document && this.hasAttribute('data-raveldex-ui')
      && (ownedShells.has(this) || mounting && (!this.isConnected || root.contains(this)))) {
      ownedShells.add(this);
      requestedBusy.set(this, String(value));
      if (busyScope === 'results') {
        const results = this.querySelector('[data-raveldex-results]');
        if (!results) throw new Error('Results busy target is unavailable.');
        nativeSetAttribute.call(results, name, value);
      }
      return;
    }
    return nativeSetAttribute.call(this, name, value);
  };
}
const isolated = mode !== 'original';
if (isolated) {
  output.setAttribute('role', 'status');
  output.setAttribute('aria-atomic', 'true');
  output.setAttribute('aria-live', mode === 'settled-polite' ? 'polite' : 'assertive');
}
description.textContent = mode === 'original'
  ? 'Original installed package status policy. External announcement output is inactive. Trace records DOM behavior, not speech.'
  : `${mode}: settled output outside the busy UI; visible package progress remains. Comparison with original changes live chatter and status location; with whole UI busy it also changes busy ancestry, so these causes are not isolated. Trace records DOM behavior, not speech.`;
description.textContent += ` Busy scope: ${busyScope === 'shell' ? 'unchanged whole UI' : busyScope === 'off' ? 'removed from the search UI shell; Inspector unchanged' : 'results list only; input and status outside busy'}. Compare the same announcement mode across busy scopes to isolate this variable.`;

const rows = [];
let droppedRows = 0, mount = 0, mountedShell, publishedKey, publishedCount = 0, lastPublication;
const focusedHook = () => {
  const active = document.activeElement;
  return active ? { tag: active.tagName.toLowerCase(), id: active.id,
    hooks: active.getAttributeNames().filter(name => name.startsWith('data-raveldex-')) } : null;
};
function view() {
  const calls = window.harness?.state.calls ?? [];
  const mainIndex = calls.findLastIndex(call => call.options.extensions?.facets);
  const main = calls[mainIndex];
  const snippetIndex = calls.findLastIndex((call, index) => index > mainIndex && call.options.extensions?.snippets);
  const snippets = calls[snippetIndex];
  const shell = root.querySelector('[data-raveldex-ui]');
  const status = root.querySelector('[data-raveldex-status]');
  return { generation: `${mount}:${mainIndex + 1}`, query: root.querySelector('[data-raveldex-input]')?.value ?? null,
    status: status?.textContent ?? null, busy: shell?.getAttribute('aria-busy') ?? null,
    requestedBusy: shell ? busyScope === 'shell' ? shell.getAttribute('aria-busy') : requestedBusy.get(shell) ?? null : null,
    resultsBusy: root.querySelector('[data-raveldex-results]')?.getAttribute('aria-busy') ?? null, focus: focusedHook(),
    main: main ? { index: mainIndex, query: main.query, completed: main.completed, aborted: main.signal?.aborted ?? false,
      revision: main.completed ? main.result?.revision ?? null : null, total: main.completed ? main.result?.total ?? null : null } : null,
    snippets: snippets ? { index: snippetIndex, completed: snippets.completed, aborted: snippets.signal?.aborted ?? false,
      expectedRevision: snippets.options.extensions.snippets.expectedRevision,
      revision: snippets.completed ? snippets.result?.revision ?? null : null } : null };
}
function record(kind, details = {}) {
  rows.push({ kind, at: new Date().toISOString(), elapsedMs: performance.now(), ...view(), ...details });
  if (rows.length > 200) { rows.shift(); droppedRows++; }
  trace.textContent = JSON.stringify({ mode, busyScope, speech: 'Not observed by this harness.',
    generations: 'Mount number and latest main-call index; not the private UI generation counter.',
    observations: 'Event snapshots and batched DOM mutation snapshots.', droppedRows, publishedCount, rows }, null, 2);
}
function observePresentation(mutations = []) {
  const shell = root.querySelector('[data-raveldex-ui]');
  if (shell && shell !== mountedShell) { mountedShell = shell; mount++; publishedKey = undefined; }
  const status = root.querySelector('[data-raveldex-status]');
  if (isolated && status) status.setAttribute('aria-live', 'off');
  record('dom', { mutations: mutations.slice(0, 20).map(change => ({ type: change.type, attribute: change.attributeName })) });
  if (!isolated || !shell || !status) return;
  const state = view(), main = window.harness?.state.calls[state.main?.index];
  if (state.requestedBusy !== 'false') return;
  if (!main || state.main.aborted) return;
  const failed = status.textContent === 'Search failed. Retry is available.' && !root.querySelector('[data-raveldex-error]')?.hidden;
  if (!failed) {
    if (!state.main.completed || !state.snippets?.completed || state.snippets.aborted || state.snippets.revision !== state.main.revision) return;
    const offset = main.options.offset ?? 0, first = main.result.hits.length ? offset + 1 : 0;
    const expected = main.result.total === 0 ? 'No results. Try a different search.' : main.result.hits.length === 0
      ? `${main.result.total} ${main.result.total === 1 ? 'result' : 'results'}. No results on this page. Use Previous page.`
      : `${main.result.total} ${main.result.total === 1 ? 'result' : 'results'}. Showing ${first}–${offset + main.result.hits.length}.`;
    if (status.textContent !== expected) return;
    const rendered = [...root.querySelectorAll('[data-raveldex-result]')].map(node => node.getAttribute('data-raveldex-result'));
    if (JSON.stringify(rendered) !== JSON.stringify(main.result.hits.map(hit => hit.id))) return;
  }
  const key = state.generation;
  if (key === publishedKey) return;
  publishedKey = key; publishedCount++;
  output.textContent = status.textContent;
  lastPublication = { generation: key, text: status.textContent, kind: failed ? 'error' : 'result' };
  record('publish', { publication: lastPublication });
}

// Observe the persistent root so destroy/remount never leaves the new status active.
const observer = new MutationObserver(observePresentation);
observer.observe(root, { subtree: true, childList: true, characterData: true,
  attributes: true, attributeFilter: ['aria-busy'] });
for (const type of ['input', 'compositionstart', 'compositionend', 'submit', 'change', 'click']) {
  document.addEventListener(type, event => {
    if (root.contains(event.target) || ['destroy-ui', 'remount-ui', 'inject-error'].includes(event.target.id)) record('event', { event: type });
  }, true);
}
window.announcementProbe = Object.freeze({ mode, busyScope, snapshot: () => ({ mode, busyScope, current: view(), droppedRows, publishedCount,
  lastPublication: lastPublication ? { ...lastPublication } : null, rows: rows.map(row => ({ ...row })) }) });
// Bound interception ownership to this fixture's explicit initial/remount calls,
// including the initial connected shell and any detached construction writes.
await import('./browser-ui-entry.mjs');
const createFixture = window.createFixture;
window.createFixture = async (...args) => {
  mounting = true;
  try { return await createFixture(...args); } finally { mounting = false; }
};
await import('./browser-ui-driver.mjs');
const remount = window.harness.remount;
window.harness.remount = (...args) => {
  mounting = true;
  try { return remount(...args); } finally { mounting = false; }
};
observePresentation();
