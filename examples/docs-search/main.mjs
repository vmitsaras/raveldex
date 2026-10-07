import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createPhrases } from '@vmitsaras/raveldex/addons/phrases/mixed';
import { createFilters } from '@vmitsaras/raveldex/addons/filters';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { createInspector } from '@vmitsaras/raveldex/addons/inspector';
import { createSnippetEvidence } from '@vmitsaras/raveldex/addons/snippets';
import { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';

// The application owns source navigation and the corpus. The installed package
// owns retrieval and presentation; no production code path imports this example.
const root = document.querySelector('[data-pilot-search]');
const representation = document.querySelector('[data-pilot-representation]');
const mode = document.querySelector('[data-pilot-mode]');
const initialize = document.querySelector('[data-pilot-initialize]');
const destroy = document.querySelector('[data-pilot-destroy]');
const status = document.querySelector('[data-pilot-status]');
const identity = document.querySelector('[data-pilot-identity]');
const fields = ['title', 'body'];
const listeners = new AbortController();
const corpusAbort = new AbortController();

let generation = 0;
let active;
let mutationAbort;
let transitions = Promise.resolve();
let rememberedQuery = '';
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
    const response = await fetch('./corpus.json', { signal: corpusAbort.signal });
    if (!response.ok) throw new Error('Documentation corpus could not be loaded.');
    const loaded = await response.json();
    if (loaded.algorithmVersion !== 'raveldex-doc-sections-v1'
      || !Array.isArray(loaded.records) || !Array.isArray(loaded.sections)
      || loaded.records.length !== loaded.sections.length
      || !Array.isArray(loaded.sources) || loaded.sources.length !== 5
      || loaded.hashAlgorithm !== 'sha256' || typeof loaded.hash !== 'string') {
      throw new Error('Documentation corpus has an unsupported shape.');
    }
    corpus = loaded;
    identity.textContent = `${loaded.records.length} complete documentation sections from ${loaded.sources.length} allowlisted files. Corpus SHA-256: ${loaded.hash}.`;
    return loaded;
  })().catch((error) => {
    corpusPromise = undefined;
    throw error;
  });
  return corpusPromise;
}

function makeOwner(loaded, strategy) {
  const positions = strategy === 'offsets';
  const phraseFields = Object.fromEntries(fields.map((field) => [field, positions ? 'positions' : 'source']));
  const evidenceFields = Object.fromEntries(fields.map((field) => [field, positions ? 'offsets' : 'source']));
  return createRaveldex({
    schema: loaded.schema,
    addons: [
      createSourceProvider({ fields }),
      ...(positions ? [createPositionProvider({ fields, offsets: fields })] : []),
      createPhrases({ fields: phraseFields }),
      createFilters({ fields: ['category'] }),
      createFacets({ fields: ['category'] }),
      createInspector(),
      createSnippetEvidence({ fields: evidenceFields }),
    ],
  });
}

function initializeInterface() {
  if (closing) return;
  const requested = ++generation;
  const strategy = representation.value;
  const queryMode = mode.value;
  stopCurrentInterface();
  announce('Loading documentation and preparing the search interface…');
  root.dataset.pilotState = 'loading';
  transitions = transitions.then(async () => {
    await releaseOwner();
    if (closing || requested !== generation) return;
    const loaded = await readCorpus();
    if (closing || requested !== generation) return;
    const engine = makeOwner(loaded, strategy);
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
      snippetFields: ['body'], pageSize: 5, mode: queryMode,
      label: 'Search Raveldex documentation',
    });
    active.ui = ui;
    if (rememberedQuery) {
      root.querySelector('[data-raveldex-input]').value = rememberedQuery;
      await ui.search();
    }
    if (closing || requested !== generation) return;
    root.dataset.pilotState = 'ready';
    announce(`${loaded.records.length} sections indexed. ${strategy === 'offsets' ? 'Stored positions and original offsets' : 'Source reanalysis'} selected. ${queryMode === 'phrase' ? 'Strict phrase' : 'All exact terms'} search is ready.`);
  }).catch(async (error) => {
    await releaseOwner();
    if (closing || requested !== generation) return;
    root.dataset.pilotState = 'error';
    const reason = typeof error?.code === 'string' ? error.code : 'CORPUS_OR_INITIALIZATION_ERROR';
    announce(`The interface could not start (${reason}). Use Reinitialize search to retry.`);
  });
}

function destroyInterface() {
  if (closing) return;
  const requested = ++generation;
  stopCurrentInterface();
  root.dataset.pilotState = 'stopped';
  announce('Search interface destroyed. Reinitialize search to load it again.');
  transitions = transitions.then(releaseOwner).catch(() => {
    if (!closing && requested === generation) announce('Search interface stopped. Its owner could not finish disposal.');
  });
}

representation.addEventListener('change', initializeInterface, { signal: listeners.signal });
mode.addEventListener('change', initializeInterface, { signal: listeners.signal });
initialize.addEventListener('click', initializeInterface, { signal: listeners.signal });
destroy.addEventListener('click', destroyInterface, { signal: listeners.signal });
window.addEventListener('pagehide', () => {
  closing = true;
  generation += 1;
  listeners.abort();
  corpusAbort.abort();
  stopCurrentInterface();
  void releaseOwner();
}, { once: true });

initializeInterface();
