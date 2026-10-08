/** Literal source fixtures. Expected membership and coordinates are stated
 * independently of the production analyzer, index, scorer and codecs. */
export const schema = {
  text: { title: { boost: 2 }, body: {} },
  metadata: {
    tags: { type: 'string', multi: true, nullable: true },
    price: { type: 'number', multi: true, nullable: true },
    active: { type: 'boolean', nullable: true },
  },
};

export const records = [
  { id: 'a', text: { title: ['red red blue', 'cafe\u0301 ﬁle ½'], body: ['green', 'red blue'] }, metadata: { tags: ['x', 'x', null], price: [10, 30], active: true } },
  { id: 'b', text: { title: 'red', body: 'blue red' }, metadata: { tags: ['y'], price: [20], active: false } },
  { id: 'c', text: { title: ['red', 'blue'], body: 'unrelated' }, metadata: { tags: [], price: [], active: null } },
  { id: 'empty', text: { title: ['', '!!!'], body: [] }, metadata: { tags: [null] } },
  { id: 'half', text: { title: '½' } },
  { id: 'missing', text: {} },
];

export const queries = [
  { name: 'all including tokenless', query: { kind: 'all' }, ids: ['a', 'b', 'c', 'empty', 'half', 'missing'] },
  { name: 'normalized single term with internal separator', query: '½', ids: ['a', 'half'] },
  { name: 'combining canonical form', query: 'café', ids: ['a'] },
  { name: 'compatibility ligature', query: 'file', ids: ['a'] },
  { name: 'literal lexical membership', query: 'red', ids: ['a', 'b', 'c'] },
  { name: 'metadata missing differs from explicit null', query: { kind: 'eq', field: 'tags', value: null }, ids: ['a', 'empty'] },
  { name: 'case-sensitive metadata', query: { kind: 'eq', field: 'tags', value: 'X' }, ids: [] },
  { name: 'empty result', query: 'absent', ids: [] },
];

export const phrase = (text, fields = ['title', 'body']) => ({ kind: 'extension', capability: 'phrases', version: 1, payload: { text, fields } });
export const phraseCases = [
  { query: phrase('red blue'), ids: ['a'] },
  { query: phrase('red red'), ids: ['a'] },
  { query: phrase('blue red'), ids: ['b'] },
  { query: phrase('green red', ['body']), ids: [] },
  { query: phrase('red blue', ['title']), ids: ['a'] },
  { query: phrase('½', ['title']), ids: ['a', 'half'] },
];

export const titleRanges = {
  red: [
    { field: 'title', valueIndex: 0, position: 0, start: 0, end: 3, term: 'red' },
    { field: 'title', valueIndex: 0, position: 1, start: 4, end: 7, term: 'red' },
  ],
  'café': [{ field: 'title', valueIndex: 1, position: 0, start: 0, end: 5, term: 'café' }],
  file: [{ field: 'title', valueIndex: 1, position: 1, start: 6, end: 9, term: 'file' }],
  '½': [{ field: 'title', valueIndex: 1, position: 2, start: 10, end: 11, term: '1⁄2' }],
};

export const replacement = { id: 'a', text: { title: 'yellow blue', body: ['red', 'blue'] }, metadata: { tags: ['changed'], price: [5], active: false } };
export const addition = { id: 'new', text: { title: 'red blue', body: 'updated' }, metadata: { tags: ['x'], price: [15], active: true } };
