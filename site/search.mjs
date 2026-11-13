import { createRaveldex } from '@vmitsaras/raveldex';
import { createSiteSearch } from './search-controller.mjs';

const trigger = document.querySelector('[data-site-search-trigger]');
const root = document.querySelector('[data-site-search-root]');
const loading = document.querySelector('[data-site-search-loading]');
const fallback = document.querySelector('[data-site-search-fallback]');
const base = '/raveldex/';

async function load(signal) {
  const response = await fetch(new URL('./content.json', import.meta.url), { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error('Documentation unavailable');
  const bytes = await response.arrayBuffer(); signal.throwIfAborted();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
  if (hash !== SITE_SEARCH_SHA256) throw new Error('Documentation belongs to another build');
  const content = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  signal.throwIfAborted();
  const engine = createRaveldex({ schema: content.schema });
  try {
    await engine.addMany(content.records, { signal }); signal.throwIfAborted();
    return { engine, sections: content.sections,
      documents: content.sections.map(section => ({ id: section.id, title: section.title, url: section.url })),
      dispose: () => engine.dispose() };
  } catch (error) { await engine.dispose(); throw error; }
}

if (trigger && root && loading && typeof loading.showModal === 'function' && globalThis.crypto?.subtle) {
  const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  document.querySelector('[data-site-search-modifier]').textContent = mac ? '⌘' : 'Ctrl';
  let controller, epoch = 0, stopped = Promise.resolve();
  function initialize() {
    controller = createSiteSearch({ root, trigger, loading, base, load,
      status: document.querySelector('[data-site-search-status]'), retry: document.querySelector('[data-site-search-retry]'),
      cancel: document.querySelector('[data-site-search-cancel]') });
    trigger.hidden = false; fallback.hidden = true;
  }
  initialize();
  window.addEventListener('pagehide', () => {
    epoch++; trigger.hidden = true; fallback.hidden = false;
    if (controller) { stopped = controller.destroy().catch(() => {}); controller = undefined; }
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    const current = ++epoch;
    void stopped.then(() => { if (epoch === current) initialize(); });
  });
}
