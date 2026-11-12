import { createRaveldex } from '@vmitsaras/raveldex';
import { createWorkerRaveldex } from '@vmitsaras/raveldex/adapters/worker';
import { makeAddons } from './configuration.mjs';
import { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';
import { mountReadableResults } from './readable-results.mjs';

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
const diagnostics = document.querySelector('[data-pilot-diagnostics]');
const diagnosticCode = document.querySelector('[data-pilot-error]');
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
let retryAvailable = false;

function announce(message) {
  status.textContent = message;
}

const workerFailures = new Set(['DISPOSED', 'TERMINATED', 'STARTUP_FAILED', 'TIMEOUT', 'INCOMPATIBLE_WORKER', 'INVALID_TRANSPORT', 'TRANSPORT_LIMIT']);
// TERMINATED can also describe a refused postMessage for one read. DISPOSED
// confirms an unusable client; a plain read refusal may be retried explicitly.
const lostWorker = new Set(['DISPOSED', 'STARTUP_FAILED', 'INCOMPATIBLE_WORKER']);
function updateRetry() {
  if (!retry) return;
  retry.setAttribute('aria-disabled', String(!retryAvailable));
  retry.hidden = !retryAvailable && retry.getRootNode().activeElement !== retry;
}
function failureCode(error) {
  const code = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'code') : undefined;
  return code && 'value' in code && typeof code.value === 'string' && /^[A-Z_]{1,64}$/.test(code.value)
    ? code.value : 'CORPUS_OR_INITIALIZATION_ERROR';
}
function resetFailure() {
  if (diagnostics) { diagnostics.hidden = true; diagnostics.open = false; }
  if (diagnosticCode) diagnosticCode.textContent = '';
}
function showFailure(code, message, stopped = true) {
  root.dataset.pilotState = stopped ? 'error' : 'ready';
  for (const button of queryButtons) button.disabled = stopped;
  retryAvailable = stopped; updateRetry();
  if (diagnosticCode) diagnosticCode.textContent = code;
  if (diagnostics) diagnostics.hidden = false;
  announce(message);
}

function stopCurrentInterface() {
  const input = root.querySelector('[data-raveldex-input]');
  if (input) rememberedQuery = input.value;
  active?.presentation?.destroy();
  active?.ui?.destroy();
  if (active) active.ui = undefined;
  mutationAbort?.abort();
  mutationAbort = undefined;
}

async function releaseOwner() {
  const previous = active;
  active = undefined;
  if (previous) {
    previous.presentation?.destroy();
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
  retryAvailable = false; updateRetry();
  resetFailure();
  stopCurrentInterface();
  announce('Loading guides…');
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
    let ownerFailed = false, readRefused = false;
    const currentRead = args => !closing && requested === generation && active?.engine === engine && !args[1]?.signal?.aborted;
    const borrowed = { ...engine, async search(...args) {
      try {
        const found = await engine.search(...args);
        if (readRefused && currentRead(args)) {
          readRefused = false; resetFailure(); announce('Search is ready. Choose an example or type your own query.');
        }
        return found;
      }
      catch (error) {
        const code = failureCode(error);
        if (currentRead(args) && host === 'worker' && workerFailures.has(code)) {
          if (lostWorker.has(code)) {
            ownerFailed = true;
            showFailure(code, 'Background search stopped. Use Retry loading guides, or choose This page in Advanced demo settings.');
          } else {
            readRefused = true;
            showFailure(code, 'Background search could not complete this request. Try Search again or shorten the query. If it keeps failing, restart search in Advanced demo settings.', false);
          }
        }
        throw error;
      }
    } };
    const ui = mountRaveldexUI({
      root, engine: borrowed,
      documents: loaded.sections.map((section) => ({ id: section.id, title: section.title, url: section.sourceUrl })),
      facets: [{ field: 'category', label: 'Document category' }],
      snippetFields: ['body'], pageSize: Number(root.dataset.pilotPageSize ?? 5), mode: queryMode,
      label: 'Search Raveldex documentation',
    });
    active.ui = ui;
    active.presentation = mountReadableResults(root, loaded.sections);
    if (rememberedQuery) {
      root.querySelector('[data-raveldex-input]').value = rememberedQuery;
      await ui.search();
    }
    if (closing || requested !== generation || ownerFailed || readRefused) return;
    root.dataset.pilotState = 'ready';
    for (const button of queryButtons) button.disabled = false;
    announce('Search is ready. Choose an example or type your own query.');
  }).catch(async (error) => {
    await releaseOwner();
    if (closing || requested !== generation) return;
    const reason = failureCode(error);
    showFailure(reason, host === 'worker'
      ? 'Background search could not start. Use Retry loading guides, or choose This page in Advanced demo settings.'
      : 'The guides could not be loaded. Use Retry loading guides or browse the guides.');
  });
}

function destroyInterface() {
  if (closing) return;
  const requested = ++generation;
  stopCurrentInterface();
  root.dataset.pilotState = 'stopped';
  for (const button of queryButtons) button.disabled = true;
  retryAvailable = false; updateRetry();
  resetFailure();
  announce('Search stopped. Restart search to keep your query and return to the first page without a category filter.');
  transitions = transitions.then(releaseOwner).catch(() => {
    if (!closing && requested === generation) announce('Search interface stopped. Its owner could not finish disposal.');
  });
}

representation?.addEventListener('change', initializeInterface, { signal: listeners.signal });
execution?.addEventListener('change', initializeInterface, { signal: listeners.signal });
mode?.addEventListener('change', initializeInterface, { signal: listeners.signal });
initialize?.addEventListener('click', initializeInterface, { signal: listeners.signal });
destroy?.addEventListener('click', destroyInterface, { signal: listeners.signal });
retry?.addEventListener('click', () => { if (retryAvailable) initializeInterface(); }, { signal: listeners.signal });
retry?.addEventListener('focusout', () => { void Promise.resolve().then(() => { if (!closing) updateRetry(); }); }, { signal: listeners.signal });
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
