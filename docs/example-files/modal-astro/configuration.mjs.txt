import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createSectionEvidence } from '@vmitsaras/raveldex/addons/sections';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';

// Every source text field is retained for source-artifact reconstruction.
export function configuration() {
  return {
    schema: { text: { title: { boost: 2 }, body: {} }, metadata: { category: { type: 'string' } } },
    addons: [createSourceProvider({ fields: ['title', 'body'] }),
      createSectionEvidence({ fields: { body: 'source' } }), createFacets({ fields: ['category'] })],
  };
}
