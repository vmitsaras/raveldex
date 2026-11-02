import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createSnippetEvidence } from '@vmitsaras/raveldex/addons/snippets';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';

// Reconstruct the same explicit capabilities for the build and browser restore.
export function configuration() {
  return {
    schema: { text: { title: { boost: 2 }, body: {} }, metadata: { category: { type: 'string' } } },
    // Static source snapshots need every declared text field for reconstruction.
    addons: [createSourceProvider({ fields: ['title', 'body'] }),
      createSnippetEvidence({ fields: { body: 'source' }, maxSnippets: 1, maxCodeUnits: 180 }),
      createFacets({ fields: ['category'] })],
  };
}
