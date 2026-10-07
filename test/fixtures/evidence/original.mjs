/** Hand-authored basic-v1 occurrences. Expected positions and UTF-16 coordinates
 * never call the production tokenizer, evaluator, scorer, or range projector. */
export const originalCases = [
  { name: 'punctuation and repetition', values: ['RED—blue red'], tokens: [['red', 0, 0, 0, 3], ['blue', 0, 1, 4, 8], ['red', 0, 2, 9, 12]] },
  { name: 'combining composition and ligature expansion', values: ['\u0301 cafe\u0301 ﬁle'], tokens: [['café', 0, 0, 2, 7], ['file', 0, 1, 8, 11]] },
  { name: 'full width spelling', values: ['ＦＯＯ—ＢＡＲ'], tokens: [['foo', 0, 0, 0, 3], ['bar', 0, 1, 4, 7]] },
  { name: 'fraction expansion stays one original token', values: ['½ file'], tokens: [['1⁄2', 0, 0, 0, 1], ['file', 0, 1, 2, 6]] },
  { name: 'literal slash is an original boundary', values: ['1/2 ﬁle'], tokens: [['1', 0, 0, 0, 1], ['2', 0, 1, 2, 3], ['file', 0, 2, 4, 7]] },
  { name: 'normalization-created spaces stay one term', values: ['ﷺ file'], tokens: [['صلى الله عليه وسلم', 0, 0, 0, 1], ['file', 0, 1, 2, 6]] },
  { name: 'supplementary letters', values: ['𐐀𐐁 ﬁle'], tokens: [['𐐨𐐩', 0, 0, 0, 4], ['file', 0, 1, 5, 8]] },
  { name: 'emoji sequences delimit and advance UTF-16', values: ['👩🏽‍💻 RED 🇬🇷 blue'], tokens: [['red', 0, 0, 8, 11], ['blue', 0, 1, 17, 21]] },
  { name: 'case expansion and combining ring', values: ['İ A\u030A'], tokens: [['i\u0307', 0, 0, 0, 1], ['å', 0, 1, 2, 4]] },
  { name: 'Indic original marks and joining delimiter', values: ['क्‍ष लाल'], tokens: [['क्', 0, 0, 0, 2], ['ष', 0, 1, 3, 4], ['लाल', 0, 2, 5, 8]] },
  { name: 'Chinese and Arabic spelling', values: ['中文—العَرَبِيَّة'], tokens: [['中文', 0, 0, 0, 2], ['العَرَبِيَّة', 0, 1, 3, 15]] },
  { name: 'original value indices and restarted positions', values: ['', 'red', '😀!\u0301', 'blue blue', ''], tokens: [['red', 1, 0, 0, 3], ['blue', 3, 0, 0, 4], ['blue', 3, 1, 5, 9]] },
  { name: 'empty value array', values: [], tokens: [] },
  { name: 'tokenless present value', values: ['😀!\u0301'], tokens: [] },
];
export const ranges = (tuples, field = 'title') => tuples.map(([term, valueIndex, position, start, end]) => ({ field, valueIndex, position, start, end, term }));
export const schema = { text: { title: {}, body: { boost: 2 } }, metadata: { active: { type: 'boolean' } } };
export const branchRecords = [
  { id: 'a', text: { title: 'red red blue green', body: 'red blue' }, metadata: { active: true } },
  { id: 'b', text: { title: 'red green' }, metadata: { active: false } },
  { id: 'c', text: { title: 'blue' } },
  { id: 'd', text: { title: ['red', 'blue'] } },
  { id: 'e', text: { title: ['red blue', 'red—blue red'] } },
  { id: 'overlap', text: { title: 'red red red' } },
  { id: 'empty', text: { title: ['!!!', ''] } },
];
export const titleRanges = {
  a: ranges([['red', 0, 0, 0, 3], ['red', 0, 1, 4, 7], ['blue', 0, 2, 8, 12], ['green', 0, 3, 13, 18]]),
  b: ranges([['red', 0, 0, 0, 3], ['green', 0, 1, 4, 9]]),
  c: ranges([['blue', 0, 0, 0, 4]]),
  d: ranges([['red', 0, 0, 0, 3], ['blue', 1, 0, 0, 4]]),
  e: ranges([['red', 0, 0, 0, 3], ['blue', 0, 1, 4, 8], ['red', 1, 0, 0, 3], ['blue', 1, 1, 4, 8], ['red', 1, 2, 9, 12]]),
  overlap: ranges([['red', 0, 0, 0, 3], ['red', 0, 1, 4, 7], ['red', 0, 2, 8, 11]]),
  empty: [],
};
export const bodyRanges = { a: ranges([['red', 0, 0, 0, 3], ['blue', 0, 1, 4, 8]], 'body') };
export const text = word => ({ kind: 'text', text: word, fields: ['title'] });
export const phrase = word => ({ kind: 'extension', capability: 'phrases', version: 1, payload: { text: word, fields: ['title'] } });
const pick = (id, ...terms) => titleRanges[id].filter(range => terms.includes(range.term));
const red = Object.fromEntries(['a', 'b', 'd', 'e', 'overlap'].map(id => [id, pick(id, 'red')]));
const blue = Object.fromEntries(['a', 'c', 'd', 'e'].map(id => [id, pick(id, 'blue')]));
export const branchCases = [
  { name: 'all matching alternatives rather than only BM25 winner', query: { kind: 'group', fields: ['title'], variants: [{ text: 'red', match: 'exact' }, { text: 'bl', match: 'prefix', weight: .01 }] }, expected: Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'overlap'].map(id => [id, pick(id, 'red', 'blue')])) },
  { name: 'full original prefix token', query: { kind: 'group', fields: ['title'], variants: [{ text: 'bl', match: 'prefix' }] }, expected: blue },
  { name: 'AND lexical groups may qualify across values', query: { kind: 'and', children: [text('red'), text('blue')] }, expected: Object.fromEntries(['a', 'd', 'e'].map(id => [id, pick(id, 'red', 'blue')])) },
  { name: 'phrase keeps only actual adjacent occurrences', query: phrase('red blue'), expected: { a: titleRanges.a.slice(1, 3), e: titleRanges.e.slice(0, 4) } },
  { name: 'repeated and overlapping phrase occurrences deduplicate coordinates', query: phrase('red red'), expected: { a: titleRanges.a.slice(0, 2), overlap: titleRanges.overlap } },
  { name: 'failed AND branch contributes no otherwise successful term', query: { kind: 'or', children: [{ kind: 'and', children: [text('red'), text('missing')] }, text('blue')] }, expected: blue },
  { name: 'shared canonical groups in failed branch do not leak unrelated red', query: { kind: 'or', children: [{ kind: 'and', children: [text('red'), text('blue'), text('missing')] }, text('blue')] }, expected: blue },
  { name: 'successful OR branches deduplicate identical coordinates', query: { kind: 'or', children: [text('red'), text('red'), phrase('red red')] }, expected: red },
  { name: 'negative subtree never contributes display evidence', query: { kind: 'and', children: [text('red'), { kind: 'not', child: text('green') }] }, expected: Object.fromEntries(['d', 'e', 'overlap'].map(id => [id, pick(id, 'red')])) },
  { name: 'double NOT qualifies without positive occurrences', query: { kind: 'not', child: { kind: 'not', child: text('red') } }, expected: Object.fromEntries(['a', 'b', 'd', 'e', 'overlap'].map(id => [id, []])) },
  { name: 'equality produces no fabricated lexical evidence', query: { kind: 'eq', field: 'active', value: true }, expected: { a: [] } },
  { name: 'all produces no fabricated lexical evidence', query: { kind: 'all' }, expected: Object.fromEntries(branchRecords.map(record => [record.id, []])) },
  { name: 'none produces no evidence', query: { kind: 'none' }, expected: {} },
];
