// Expectations are literals and hand-derived arithmetic, never a runtime tokenizer/scorer.
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
export const text = value => ({ kind: 'text', text: value });
export const phrase = (value, fields = ['title', 'body']) => ({ kind: 'extension', capability: 'phrases', version: 1, payload: { text: value, fields } });
export const queries = [
  ['file café', ['a']],
  [{ kind: 'text', text: 'ＣＡＲ', fields: ['title'] }, ['a', 'b', 'd']],
  ['red', ['a', 'd', 'b']],
  [phrase('red car', ['title']), ['a', 'b']],
  [phrase('red car'), ['a', 'b', 'd']],
  [phrase('car red'), []],
  [{ kind: 'extension', capability: 'numeric-range', version: 1, payload: { field: 'price', lt: 10 } }, ['a']],
  [{ kind: 'extension', capability: 'set-membership', version: 1, payload: { field: 'category', values: ['Guide'] } }, ['a', 'd']],
  [{ kind: 'not', child: text('red') }, ['c', 'empty']],
  [{ kind: 'or', children: [{ kind: 'and', children: [text('red'), text('missing')] }, text('blue')] }, ['a', 'c']],
  [{ kind: 'all' }, ['a', 'b', 'c', 'd', 'empty']],
  [{ kind: 'none' }, []],
];
export const evidenceRequests = [
  { facets: { fields: [{ field: 'category', limit: 10, missing: true }] } },
  { inspector: { ids: ['a', 'b', 'c', 'd', 'empty'], sourceFields: ['title', 'body'] } },
  { 'match-evidence': { ids: ['a', 'b', 'c', 'd', 'empty'] } },
  { snippets: { ids: ['a', 'b', 'c', 'd', 'empty'] } },
];
export function handBM25(tf, length, average, documents, frequency, boost = 1) {
  return boost * Math.log(1 + (documents - frequency + .5) / (frequency + .5)) * (tf * 2.2) / (tf + 1.2 * (.25 + .75 * length / average));
}
