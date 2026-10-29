/** Explicit application allowlist; independent expected IDs are not discovered
 * from emitted pages, adapter manifests, or production query output. */
export const schema = {
  text: { title: { boost: 2 }, body: {} },
  metadata: { category: { type: 'string', nullable: true } },
};
export const entries = [
  { record: { id: 'alpha', text: { title: 'Atomic mutations', body: 'Atomic commits keep one coherent revision. red blue.' }, metadata: { category: 'guide' } }, title: 'Atomic mutations', path: '/guide/atomic/' },
  { record: { id: 'beta', text: { title: 'Source snapshots', body: 'Source snapshots rebuild native search under the receiving analyzer.' }, metadata: { category: 'reference' } }, title: 'Source snapshots', path: '/reference/source/' },
  { record: { id: 'gamma', text: { title: ['red', 'blue'], body: 'red apple red' }, metadata: { category: null } }, title: 'Original values', path: '/guide/values/' },
  { record: { id: 'empty', text: { title: [], body: ['', '!!!'] } }, title: 'Empty originals', path: '/guide/empty/' },
  { record: { id: 'unicode', text: { title: 'cafe\u0301 ﬁle ½', body: 'Greek δοκιμή' }, metadata: { category: 'guide' } }, title: 'Unicode source', path: '/guide/unicode/' },
];
export const excluded = { record: { id: 'draft', text: { title: 'Draft only', body: 'shouldneverindexdraftnonce' } }, title: 'Excluded draft', path: '/draft/' };
export const queries = [
  'red', 'red blue', 'atomic', 'native', 'café', 'file', '½', 'δοκιμή', 'absent',
  { kind: 'all' }, { kind: 'none' },
  { kind: 'group', variants: [{ text: 'sou', match: 'prefix' }] },
  { kind: 'not', child: { kind: 'text', text: 'red' } },
  { kind: 'or', children: [{ kind: 'text', text: 'red' }, { kind: 'text', text: 'source' }] },
  { kind: 'eq', field: 'category', value: null },
  { kind: 'phrase', text: 'red blue', fields: ['title', 'body'] },
  { kind: 'phrase', text: 'red blue', fields: ['title'] },
  { kind: 'phrase', text: 'receiving analyzer', fields: ['body'] },
];
export function nativeQuery(query) {
  if (typeof query === 'string') return query;
  if (query.kind === 'phrase') { const { kind, ...payload } = query; return { kind: 'extension', capability: 'phrases', version: 1, payload }; }
  if (query.kind === 'and' || query.kind === 'or') return { ...query, children: query.children.map(nativeQuery) };
  if (query.kind === 'not') return { ...query, child: nativeQuery(query.child) };
  return query;
}
export const pages = [{ limit: 100 }, { limit: 0 }, { offset: 1, limit: 2 }];
