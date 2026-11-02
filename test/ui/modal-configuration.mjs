import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createSectionEvidence } from '@vmitsaras/raveldex/addons/sections';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';

// Application fixture configuration reconstructed in both execution hosts.
export function modalAddons(strategy = 'source', feature = 'sections', facets = false) {
  return [
    ...(feature === 'sections' ? [createSourceProvider({ fields: ['title', 'body'] }),
      ...(strategy === 'offsets' ? [createPositionProvider({ fields: ['title', 'body'], offsets: ['title', 'body'] })] : []),
      createSectionEvidence({ fields: { title: strategy, body: strategy } })] : []),
    ...(facets ? [createFacets({ fields: ['category'] })] : []),
  ];
}
