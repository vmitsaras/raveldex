import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createPhrases } from '@vmitsaras/raveldex/addons/phrases/mixed';
import { createFilters } from '@vmitsaras/raveldex/addons/filters';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { createInspector } from '@vmitsaras/raveldex/addons/inspector';
import { createMatchEvidence } from '@vmitsaras/raveldex/addons/evidence';
import { createSnippetEvidence } from '@vmitsaras/raveldex/addons/snippets';
import { schema } from './records.mjs';

export function addonsFor() {
  const strategies = { title: 'source', body: 'offsets' };
  return [createSourceProvider({ fields: ['title', 'body'] }), createPositionProvider({ fields: ['body'], offsets: ['body'] }),
    createPhrases({ fields: { title: 'source', body: 'positions' } }), createFilters({ fields: ['price', 'category'] }),
    createFacets({ fields: ['category'] }), createInspector({ sourceFields: ['title', 'body'] }),
    createMatchEvidence({ fields: strategies }), createSnippetEvidence({ fields: strategies, maxCodeUnits: 80 })];
}
export const configuration = (extras = {}) => ({ schema, addons: addonsFor(), ...extras });
