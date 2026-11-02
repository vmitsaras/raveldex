import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createPhrases } from '@vmitsaras/raveldex/addons/phrases/mixed';
import { createFilters } from '@vmitsaras/raveldex/addons/filters';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { createInspector } from '@vmitsaras/raveldex/addons/inspector';
import { createSnippetEvidence } from '@vmitsaras/raveldex/addons/snippets';

// Reconstructed independently in the page and worker; implementation handles
// stay local. The adapter compares their complete captured data manifests.
export function makeAddons(strategy, snippetOptions = {}) {
  const fields = ['title', 'body'];
  const positions = strategy === 'offsets';
  return [
    createSourceProvider({ fields }),
    ...(positions ? [createPositionProvider({ fields, offsets: fields })] : []),
    createPhrases({ fields: Object.fromEntries(fields.map(field => [field, positions ? 'positions' : 'source'])) }),
    createFilters({ fields: ['category'] }), createFacets({ fields: ['category'] }),
    createInspector(),
    createSnippetEvidence({ ...snippetOptions, fields: Object.fromEntries(fields.map(field => [field, positions ? 'offsets' : 'source'])) }),
  ];
}
