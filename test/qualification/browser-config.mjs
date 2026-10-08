import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createPositionPhrases } from '@vmitsaras/raveldex/addons/phrases/positions';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { createInspector } from '@vmitsaras/raveldex/addons/inspector';
import { createSnippetEvidence } from '@vmitsaras/raveldex/addons/snippets';

export const schema = { text: { title: {}, body: {} }, metadata: { category: { type: 'string' } } };
export function addonsFor(strategy = 'source') {
  if (strategy === 'core') return [];
  const fields = ['title', 'body'], positions = strategy === 'offsets';
  return [createSourceProvider({ fields }),
    ...(positions ? [createPositionProvider({ fields, offsets: fields }), createPositionPhrases({ fields })] : [createSourcePhrases({ fields })]),
    createFacets({ fields: ['category'] }), createInspector(),
    createSnippetEvidence({ fields: { title: positions ? 'offsets' : 'source', body: positions ? 'offsets' : 'source' }, maxCodeUnits: 120 })];
}
export const configuration = (strategy = 'source') => ({ schema, addons: addonsFor(strategy) });
export const visibleRecords = [
  { id: 'alpha', text: { title: 'Atomic alpha', body: 'red apple red. Atomic commits preserve a coherent revision.' }, metadata: { category: 'Guide' } },
  { id: 'beta', text: { title: 'Beta banana', body: 'blue banana recovery' }, metadata: { category: 'Reference' } },
  { id: 'gamma', text: { title: 'Gamma red', body: 'red apple source' }, metadata: { category: 'Guide' } },
];
