import { serveRaveldexWorker } from '@vmitsaras/raveldex/adapters/worker/host';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { createSnippetEvidence } from '@vmitsaras/raveldex/addons/snippets';

// This is application fixture configuration, not a public-library code path.
// Both the browser owner and explicit worker entry reconstruct these handles.
export function controlsAddons(strategy, features, snippets = {}) {
  const withSnippets = features !== 'core' && features !== 'facets-only';
  const withFacets = features !== 'core' && features !== 'snippets-only';
  return [
    ...(withSnippets ? [createSourceProvider({ fields: ['body'] }),
      ...(strategy === 'offsets' ? [createPositionProvider({ fields: ['body'], offsets: ['body'] })] : []),
      createSnippetEvidence({ fields: { body: strategy }, ...snippets })] : []),
    // Equality is native core behavior; this preset needs facets, not the
    // optional structured-filter capability used by other application flows.
    ...(withFacets ? [createFacets({ fields: ['category'] })] : []),
  ];
}

if (typeof document === 'undefined') {
  const params = new URL(self.location.href).searchParams;
  const strategy = params.get('strategy') ?? 'source';
  if (strategy !== 'source' && strategy !== 'offsets') throw new Error('Unsupported fixture strategy');
  serveRaveldexWorker(self, { addons: controlsAddons(strategy, params.get('features') ?? 'all', JSON.parse(params.get('snippets') ?? '{}')) });
}
