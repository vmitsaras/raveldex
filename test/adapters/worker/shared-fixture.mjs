import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createPositionPhrases } from '@vmitsaras/raveldex/addons/phrases/positions';
import { createPhrases } from '@vmitsaras/raveldex/addons/phrases/mixed';
import { createFilters } from '@vmitsaras/raveldex/addons/filters';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { createInspector } from '@vmitsaras/raveldex/addons/inspector';
import { createMatchEvidence } from '@vmitsaras/raveldex/addons/evidence';
import { createSnippetEvidence } from '@vmitsaras/raveldex/addons/snippets';

export const schema = { text: { title: {}, body: { boost: 2 } }, metadata: {
  category: { type: 'string', multi: true, nullable: true }, price: { type: 'number' }, active: { type: 'boolean' },
} };
export const records = [
  { id: 'a', text: { title: 'red red car', body: ['RED—blue red', 'ﬁle cafe\u0301'] }, metadata: { category: ['Guide', 'Guide'], price: 5, active: true } },
  { id: 'b', text: { title: 'red car', body: 'car' }, metadata: { category: ['Reference'], price: 15, active: false } },
  { id: 'c', text: { title: 'blue' }, metadata: { category: [null], price: 25 } },
  { id: 'd', text: { title: ['red', 'car'], body: 'red car' }, metadata: { category: ['Guide'], price: 35, active: true } },
  { id: 'empty', text: { title: ['!!!', ''] } },
];
export function addonsFor(strategy = 'source') {
  if (strategy === 'core') return [];
  const strategies = { title: strategy === 'source' || strategy === 'mixed' ? 'source' : 'offsets', body: strategy === 'source' ? 'source' : 'offsets' };
  const positionFields = Object.keys(strategies).filter(field => strategies[field] === 'offsets');
  return [createSourceProvider({ fields: ['title', 'body'] }),
    ...(positionFields.length ? [createPositionProvider({ fields: positionFields, offsets: positionFields })] : []),
    strategy === 'source' ? createSourcePhrases({ fields: ['title', 'body'] })
      : strategy === 'offsets' ? createPositionPhrases({ fields: ['title', 'body'] })
      : createPhrases({ fields: { title: 'source', body: 'positions' } }),
    createFilters({ fields: ['price', 'category'] }), createFacets({ fields: ['category'] }),
    createInspector({ sourceFields: ['title', 'body'] }),
    createMatchEvidence({ fields: strategies }), createSnippetEvidence({ fields: strategies, maxCodeUnits: 80 }),
  ];
}
export const configuration = (strategy = 'source', extras = {}) => ({ schema, addons: addonsFor(strategy), ...extras });
export const text = value => ({ kind: 'text', text: value });
export const phrase = (value, fields = ['title', 'body']) => ({ kind: 'extension', capability: 'phrases', version: 1, payload: { text: value, fields } });
export const range = bounds => ({ kind: 'extension', capability: 'numeric-range', version: 1, payload: { field: 'price', ...bounds } });
export const queries = [
  ['file café', ['a']],
  [{ kind: 'text', text: 'ＣＡＲ', fields: ['title'] }, ['a', 'b', 'd']],
  ['red', ['a', 'd', 'b']],
  [{ kind: 'text', text: 'red car', fields: ['title'] }, ['a', 'b', 'd']],
  [phrase('red car', ['title']), ['a', 'b']],
  [phrase('red car'), ['a', 'b', 'd']],
  [phrase('car red'), []],
  [{ kind: 'and', children: [text('red'), range({ lt: 10 })] }, ['a']],
  [{ kind: 'extension', capability: 'set-membership', version: 1, payload: { field: 'category', values: ['Guide'] } }, ['a', 'd']],
  [{ kind: 'not', child: text('red') }, ['c', 'empty']],
  [{ kind: 'not', child: { kind: 'not', child: text('red') } }, ['a', 'b', 'd']],
  [{ kind: 'or', children: [{ kind: 'and', children: [text('red'), text('missing')] }, text('blue')] }, ['a', 'c']],
  [{ kind: 'group', variants: [{ text: 're', match: 'prefix' }, { text: 'blue', match: 'exact', weight: .5 }] }, ['a', 'b', 'c', 'd']],
  [{ kind: 'all' }, ['a', 'b', 'c', 'd', 'empty']],
  [{ kind: 'none' }, []],
];
export const evidenceRequests = [
  { facets: { fields: [{ field: 'category', limit: 10, missing: true }] } },
  { inspector: { ids: ['a', 'b', 'c', 'd', 'empty', 'missing'], sourceFields: ['title', 'body'] } },
  { 'match-evidence': { ids: ['a', 'b', 'c', 'd', 'empty', 'missing'] } },
  { snippets: { ids: ['a', 'b', 'c', 'd', 'empty', 'missing'] } },
];
export function mismatchedAddonVariants() {
  const fields = { title: 'source', body: 'source' };
  return [
    ['facet bucket option', 'facets', createFacets({ fields: ['category'], maxBucketsPerField: 1 })],
    ['facet distinct option', 'facets', createFacets({ fields: ['category'], maxDistinctValuesPerField: 2 })],
    ['Inspector fact option', 'inspector', createInspector({ sourceFields: ['title', 'body'], maxFacts: 16 })],
    ['match fact option', 'match-evidence', createMatchEvidence({ fields, maxFacts: 16 })],
    ['match range option', 'match-evidence', createMatchEvidence({ fields, maxRanges: 16 })],
    ['snippet window option', 'snippets', createSnippetEvidence({ fields, maxCodeUnits: 80, maxSnippets: 1 })],
    ['snippet code unit option', 'snippets', createSnippetEvidence({ fields, maxCodeUnits: 20 })],
    ['snippet highlight option', 'snippets', createSnippetEvidence({ fields, maxCodeUnits: 80, maxHighlights: 1 })],
  ].map(([name, id, changed]) => ({ name, addons: addonsFor('source').map(addon => addon.manifest.id === id ? changed : addon) }));
}
