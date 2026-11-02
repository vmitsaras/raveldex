import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createSectionEvidence } from '@vmitsaras/raveldex/addons/sections';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { preparePages } from './content.mjs';

export async function loadGuides(contentUrl, expectedSHA256, signal) {
  const response = await fetch(contentUrl, { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error('Guide data is unavailable');
  const bytes = await response.arrayBuffer(); signal.throwIfAborted();
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
  if (digest !== expectedSHA256) throw new Error('Guide data belongs to a different build');
  const pages = preparePages(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  signal.throwIfAborted();
  const engine = createRaveldex({
    schema: { text: { title: { boost: 2 }, body: {} }, metadata: { category: { type: 'string' } } },
    addons: [createSourceProvider({ fields: ['body'] }), createSectionEvidence({ fields: { body: 'source' } }),
      createFacets({ fields: ['category'] })],
  });
  try {
    let mutation;
    for (let offset = 0; offset < pages.length; offset += 100) {
      mutation = await engine.addMany(pages.slice(offset, offset + 100).map(page => ({ id: page.id,
        text: { title: page.title, body: page.body }, metadata: { category: page.category } })), { signal });
    }
    signal.throwIfAborted();
    const base = new URL('./', contentUrl);
    return { engine, documents: pages.map(page => ({ id: page.id, title: page.title, url: new URL(page.path.slice(1), base).href })),
      pageSections: { kind: 'raveldex-page-sections', version: 1, revision: mutation.revision,
        pages: pages.map(page => ({ pageId: page.id, sections: page.maps })) }, dispose: () => engine.dispose() };
  } catch (error) { await engine.dispose(); throw error; }
}
