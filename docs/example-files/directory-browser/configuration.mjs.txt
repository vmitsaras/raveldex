import { createFilters } from '@vmitsaras/raveldex/addons/filters';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';

export const settings = { pageSize: 3, debounceMs: 150, mode: 'prefix', urlState: true, history: 'push',
  parameters: { query: 'q', page: 'page', filters: { format: 'format', topics: 'topic' } } };
export const groups = [
  { field: 'format', values: ['guide', 'checklist', 'tool'] },
  { field: 'topics', values: ['planning', 'safety', 'access', 'nature', 'water'] },
];
export const labels = [
  { field: 'format', label: 'Resource type', values: [{value:'guide',label:'Guides'},{value:'checklist',label:'Checklists'},{value:'tool',label:'Tools'}] },
  { field: 'topics', label: 'Topic', values: [{value:'planning',label:'Planning'},{value:'safety',label:'Safety'},{value:'access',label:'Access'},{value:'nature',label:'Nature'},{value:'water',label:'Water routes'}] },
];
export function configuration() {
  return { schema: { text: { title: { boost: 2 }, body: {} }, metadata: { format: { type: 'string' }, topics: { type: 'string', multi: true } } },
    addons: [createFilters({ fields: ['format', 'topics'] }), createFacets({ fields: ['format', 'topics'] })] };
}
