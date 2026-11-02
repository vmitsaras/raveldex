import { createRaveldex } from '@vmitsaras/raveldex';
import { createWorkerRaveldex } from '@vmitsaras/raveldex/adapters/worker';
import { makeAddons } from './configuration.mjs';
import { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';

// The application owns source navigation and the corpus. The installed package
// owns retrieval and presentation; no production code path imports this example.
const root = document.querySelector('[data-pilot-search]');
const representation = document.querySelector('[data-pilot-representation]');
const mode = document.querySelector('[data-pilot-mode]');
const execution = document.querySelector('[data-pilot-execution]');
const initialize = document.querySelector('[data-pilot-initialize]');
const destroy = document.querySelector('[data-pilot-destroy]');
const status = document.querySelector('[data-pilot-status]');
const identity = document.querySelector('[data-pilot-identity]');
const retry = document.querySelector('[data-pilot-retry]');
const queryButtons = [...document.querySelectorAll('[data-pilot-query]')];
const listeners = new AbortController();
const corpusAbort = new AbortController();

let generation = 0;
let active;
let mutationAbort;
let transitions = Promise.resolve();
let rememberedQuery = root.dataset.pilotInitialQuery ?? '';
let closing = false;
let corpus;
let corpusPromise;

function announce(message) {
  status.textContent = message;
}

function stopCurrentInterface() {
  const input = root.querySelector('[data-raveldex-input]');
  if (input) rememberedQuery = input.value;
  active?.ui?.destroy();
  if (active) active.ui = undefined;
  mutationAbort?.abort();
  mutationAbort = undefined;
}

async function releaseOwner() {
  const previous = active;
  active = undefined;
  if (previous) {
    previous.ui?.destroy();
    await previous.engine.dispose();
  }
}

async function readCorpus() {
  if (corpus) return corpus;
  corpusPromise ??= (async () => {
    const response = await fetch(new URL('./corpus.json', import.meta.url), { signal: corpusAbort.signal });
    if (!response.ok) throw new Error('Documentation corpus could not be loaded.');
    const loaded = await response.json();
    if (!['raveldex-doc-sections-v1', 'raveldex-usage-guides-v1'].includes(loaded.algorithmVersion)
      || !Array.isArray(loaded.records) || !Array.isArray(loaded.sections)
      || loaded.records.length !== loaded.sections.length
      || !Array.isArray(loaded.sources) || loaded.sources.length !== 5
      || loaded.hashAlgorithm !== 'sha256' || typeof loaded.hash !== 'string') {
      throw new Error('Documentation corpus has an unsupported shape.');
    }
    corpus = loaded;
    identity.textContent = `Searches ${loaded.records.length} sections from ${loaded.sources.length} guides.`;
    return loaded;
  })().catch((error) => {
    corpusPromise = undefined;
    throw error;
  });
  return corpusPromise;
}

async function makeOwner(loaded, strategy, host) {
  // The homepage uses the snippet provider's existing bounds for a short preview.
  // Full demo/qualification and worker configurations retain their defaults.
  const snippetOptions = host === 'direct' && root.dataset.pilotCompact === 'true'
    ? { maxSnippets: 1, maxCodeUnits: 160 } : undefined;
  const configuration = { schema: loaded.schema, addons: makeAddons(strategy, snippetOptions) };
  if (host === 'direct') return createRaveldex(configuration);
  const url = new URL('./engine-worker.mjs', import.meta.url);
  url.searchParams.set('representation', strategy);
  const worker = new Worker(url, { type: 'module' });
  return createWorkerRaveldex({ worker, configuration, ownership: 'owned', sameHost: true });
}

function initializeInterface() {
  if (closing) return;
  const requested = ++generation;
  const strategy = representation?.value ?? 'source';
  const queryMode = mode?.value ?? 'prefix';
  const host = execution?.value ?? 'direct';
  for (const button of queryButtons) button.disabled = true;
  if (retry) retry.hidden = true;
  stopCurrentInterface();
  announce('Loading documentation and preparing the search interface…');
  root.dataset.pilotState = 'loading';
  transitions = transitions.then(async () => {
    await releaseOwner();
    if (closing || requested !== generation) return;
    const loaded = await readCorpus();
    if (closing || requested !== generation) return;
    const engine = await makeOwner(loaded, strategy, host);
    if (closing || requested !== generation) { await engine.dispose(); return; }
    active = { engine, ui: undefined };
    mutationAbort = new AbortController();
    await engine.addMany(loaded.records, { signal: mutationAbort.signal });
    mutationAbort = undefined;
    if (closing || requested !== generation) {
      await releaseOwner();
      return;
    }
    const ui = mountRaveldexUI({
      root, engine,
      documents: loaded.sections.map((section) => ({ id: section.id, title: section.title, url: section.sourceUrl })),
      facets: [{ field: 'category', label: 'Document category' }],
      snippetFields: ['body'], pageSize: Number(root.dataset.pilotPageSize ?? 5), mode: queryMode,
      label: 'Search Raveldex documentation',
    });
    active.ui = ui;
    if (rememberedQuery) {
      root.querySelector('[data-raveldex-input]').value = rememberedQuery;
      await ui.search();
    }
    if (closing || requested !== generation) return;
    root.dataset.pilotState = 'ready';
    for (const button of queryButtons) button.disabled = false;
    announce(`${loaded.records.length} sections indexed. ${host === 'worker' ? 'One module worker' : 'Direct execution'} selected. ${strategy === 'offsets' ? 'Stored positions and original offsets' : 'Source reanalysis'} selected. ${queryMode === 'phrase' ? 'Strict phrase' : queryMode === 'prefix' ? 'Final-word prefix' : 'All exact terms'} search is ready.`);
  }).catch(async (error) => {
    await releaseOwner();
    if (closing || requested !== generation) return;
    root.dataset.pilotState = 'error';
    const reason = typeof error?.code === 'string' ? error.code : 'CORPUS_OR_INITIALIZATION_ERROR';
    if (retry) retry.hidden = false;
    announce(`The interface could not start (${reason}). Use ${retry ? 'Retry loading guides' : 'Reinitialize search'} to retry.`);
  });
}

function destroyInterface() {
  if (closing) return;
  const requested = ++generation;
  stopCurrentInterface();
  root.dataset.pilotState = 'stopped';
  for (const button of queryButtons) button.disabled = true;
  if (retry) retry.hidden = true;
  announce('Search interface destroyed. Reinitialize search to load it again.');
  transitions = transitions.then(releaseOwner).catch(() => {
    if (!closing && requested === generation) announce('Search interface stopped. Its owner could not finish disposal.');
  });
}

representation?.addEventListener('change', initializeInterface, { signal: listeners.signal });
execution?.addEventListener('change', initializeInterface, { signal: listeners.signal });
mode?.addEventListener('change', initializeInterface, { signal: listeners.signal });
initialize?.addEventListener('click', initializeInterface, { signal: listeners.signal });
destroy?.addEventListener('click', destroyInterface, { signal: listeners.signal });
retry?.addEventListener('click', initializeInterface, { signal: listeners.signal });
for (const button of queryButtons) button.addEventListener('click', () => {
  if (closing || !active?.ui || root.dataset.pilotState !== 'ready') return;
  const input = root.querySelector('[data-raveldex-input]');
  input.value = button.dataset.pilotQuery;
  rememberedQuery = input.value;
  void active.ui.search();
}, { signal: listeners.signal });
window.addEventListener('pagehide', () => {
  closing = true;
  generation += 1;
  listeners.abort();
  corpusAbort.abort();
  stopCurrentInterface();
  void releaseOwner();
}, { once: true });

initializeInterface();
