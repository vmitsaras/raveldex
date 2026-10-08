// Authored expectations. No runtime analyzer/scorer determines membership.
export const companionOptions = { schema: {
  title: { type: 'text', boost: 2 }, body: { type: 'text[]' },
  category: { type: 'keyword' }, price: { type: 'number' }, active: { type: 'boolean' },
}, returnFields: ['title', 'category'] };
export const companionRecords = [
  { id: 'a', title: 'Red red car', body: ['red blue', 'café manual'], category: 'Guide', price: -0, active: true },
  { id: 'b', title: 'red car', body: ['car red', 'red', 'blue'], category: 'Reference', price: 5, active: false },
  { id: 'c', title: 'blue', body: [], category: 'Guide', price: 10 },
  { id: 'd', title: '', body: ['red', 'car'], category: '', active: false },
  { id: 'empty' },
  { id: 'unicode', title: 'ＣＡＲ ﬁle', body: ['cafe\u0301 🙂 𐐀'], category: 'Unicode', price: 15, active: true },
];
export const expectedRecords = [
  { id: 'a', text: { title: ['Red red car'], body: ['red blue', 'café manual'] }, metadata: { category: 'Guide', price: 0, active: true } },
  { id: 'b', text: { title: ['red car'], body: ['car red', 'red', 'blue'] }, metadata: { category: 'Reference', price: 5, active: false } },
  { id: 'c', text: { title: ['blue'], body: [] }, metadata: { category: 'Guide', price: 10 } },
  { id: 'd', text: { title: [''], body: ['red', 'car'] }, metadata: { category: '', active: false } },
  { id: 'empty', text: {}, metadata: {} },
  { id: 'unicode', text: { title: ['ＣＡＲ ﬁle'], body: ['cafe\u0301 🙂 𐐀'] }, metadata: { category: 'Unicode', price: 15, active: true } },
];
export const phrase = (text, fields = ['title', 'body']) => ({ kind: 'extension', capability: 'phrases', version: 1, payload: { text, fields } });
export const sharedQueries = [
  { label: 'exact', legacy: { kind: 'text', value: 'red' }, native: { kind: 'text', text: 'red' }, ids: ['a', 'b', 'd'] },
  { label: 'all terms', legacy: { kind: 'text', value: 'red blue', combine: 'all' }, native: { kind: 'text', text: 'red blue', operator: 'and' }, ids: ['a', 'b'] },
  { label: 'any terms', legacy: { kind: 'text', value: 'red blue', combine: 'any' }, native: { kind: 'text', text: 'red blue', operator: 'or' }, ids: ['a', 'b', 'c', 'd'] },
  { label: 'browse', legacy: { kind: 'all' }, native: { kind: 'all' }, ids: ['a', 'b', 'c', 'd', 'empty', 'unicode'] },
  { label: 'keyword equality', legacy: { kind: 'all', where: { category: { eq: 'Guide' } } }, native: { kind: 'eq', field: 'category', value: 'Guide' }, ids: ['a', 'c'] },
  { label: 'number equality', legacy: { kind: 'all', where: { price: { eq: 0 } } }, native: { kind: 'eq', field: 'price', value: 0 }, ids: ['a'] },
  { label: 'boolean equality', legacy: { kind: 'text', value: 'red', where: { active: { eq: false } } }, native: { kind: 'and', children: [{ kind: 'text', text: 'red' }, { kind: 'eq', field: 'active', value: false }] }, ids: ['b', 'd'] },
  { label: 'phrase', legacy: { kind: 'text', value: 'red car', mode: 'phrase' }, native: phrase('red car'), ids: ['a', 'b'] },
  { label: 'no array boundary phrase', legacy: { kind: 'text', value: 'red car', mode: 'phrase', fields: ['body'] }, native: phrase('red car', ['body']), ids: [] },
  { label: 'NFC shared', legacy: { kind: 'text', value: 'café' }, native: { kind: 'text', text: 'café' }, ids: ['a', 'unicode'] },
  { label: 'field restriction', legacy: { kind: 'text', value: 'blue', fields: ['title'] }, native: { kind: 'text', text: 'blue', fields: ['title'] }, ids: ['c'] },
  { label: 'absent term', legacy: { kind: 'text', value: 'missing' }, native: { kind: 'text', text: 'missing' }, ids: [] },
];
export const rankOptions = { schema: { title: { type: 'text' }, body: { type: 'text' } } };
export const rankRecords = [
  { id: 'one', title: 'red red red red red', body: 'red' },
  { id: 'two', title: 'red', body: 'red red red red red red red' },
  { id: 'three', title: 'red red blue green brown', body: 'blue' },
  { id: 'four', title: 'car boat train', body: 'red red car' },
];
