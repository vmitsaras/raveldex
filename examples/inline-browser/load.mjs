import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createSnippetEvidence } from '@vmitsaras/raveldex/addons/snippets';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';

export async function loadGuides(contentUrl, signal) {
  const response = await fetch(contentUrl, { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error('Guide data is unavailable');
  const entries = await response.json();
  if (!Array.isArray(entries) || entries.length > 1000) throw new Error('Expected up to 1000 explicit guide records');
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || !['id', 'title', 'body', 'category', 'path'].every(key => typeof entry[key] === 'string')
      || !entry.title.trim() || entry.title.length > 1024 || !entry.title.isWellFormed()
      || !entry.id || seen.has(entry.id) || !/^\/guides\/[a-z0-9-]+\/$/.test(entry.path)) throw new Error('Invalid guide record');
    seen.add(entry.id);
  }
  signal.throwIfAborted();
  const engine = createRaveldex({
    schema: { text: { title: { boost: 2 }, body: {} }, metadata: { category: { type: 'string' } } },
    addons: [createSourceProvider({ fields: ['body'] }),
      createSnippetEvidence({ fields: { body: 'source' }, maxSnippets: 1, maxCodeUnits: 180 }),
      createFacets({ fields: ['category'] })],
  });
  try {
    // addMany is finite. Split larger allowlists into documented bounded batches.
    for (let offset = 0; offset < entries.length; offset += 100) {
      await engine.addMany(entries.slice(offset, offset + 100).map(entry => ({ id: entry.id,
        text: { title: entry.title, body: entry.body }, metadata: { category: entry.category } })), { signal });
    }
    signal.throwIfAborted();
    // content.json lives at the deployment base, beside the search page.
    const base = new URL('./', contentUrl);
    const documents = entries.map(entry => ({ id: entry.id, title: entry.title, url: new URL(entry.path.slice(1), base).href }));
    return { engine, documents, dispose: () => engine.dispose() };
  } catch (error) { await engine.dispose(); throw error; }
}
