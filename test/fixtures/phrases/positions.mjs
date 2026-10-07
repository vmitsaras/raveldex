/** Original token coordinates authored by hand from basic-v1's contract.
 * No production tokenizer supplies these terms, positions or UTF-16 ranges. */
export const originalPositionCases = [
  { name: 'punctuation adjacency and repeated terms', values: ['RED—blue red'], tokens: [
    { term: 'red', valueIndex: 0, position: 0, start: 0, end: 3 },
    { term: 'blue', valueIndex: 0, position: 1, start: 4, end: 8 },
    { term: 'red', valueIndex: 0, position: 2, start: 9, end: 12 },
  ] },
  { name: 'a leading mark is skipped; a trailing mark belongs to its original token', values: ['\u0301 cafe\u0301 ﬁle'], tokens: [
    { term: 'café', valueIndex: 0, position: 0, start: 2, end: 7 },
    { term: 'file', valueIndex: 0, position: 1, start: 8, end: 11 },
  ] },
  { name: 'fullwidth terms use original coordinates', values: ['ＦＯＯ—ＢＡＲ'], tokens: [
    { term: 'foo', valueIndex: 0, position: 0, start: 0, end: 3 },
    { term: 'bar', valueIndex: 0, position: 1, start: 4, end: 7 },
  ] },
  { name: 'fraction compatibility expansion is one original token', values: ['½ file'], tokens: [
    { term: '1⁄2', valueIndex: 0, position: 0, start: 0, end: 1 },
    { term: 'file', valueIndex: 0, position: 1, start: 2, end: 6 },
  ] },
  { name: 'literal slash spelling remains separate original tokens', values: ['1/2 ﬁle'], tokens: [
    { term: '1', valueIndex: 0, position: 0, start: 0, end: 1 },
    { term: '2', valueIndex: 0, position: 1, start: 2, end: 3 },
    { term: 'file', valueIndex: 0, position: 2, start: 4, end: 7 },
  ] },
  { name: 'compatibility-created spaces never create positional graph holes', values: ['ﷺ file'], tokens: [
    { term: 'صلى الله عليه وسلم', valueIndex: 0, position: 0, start: 0, end: 1 },
    { term: 'file', valueIndex: 0, position: 1, start: 2, end: 6 },
  ] },
  { name: 'supplementary letters count two UTF-16 code units apiece', values: ['𐐀𐐁 ﬁle'], tokens: [
    { term: '𐐨𐐩', valueIndex: 0, position: 0, start: 0, end: 4 },
    { term: 'file', valueIndex: 0, position: 1, start: 5, end: 8 },
  ] },
  { name: 'nonletter surrogate pairs advance original offsets', values: ['😀A 😀 B'], tokens: [
    { term: 'a', valueIndex: 0, position: 0, start: 2, end: 3 },
    { term: 'b', valueIndex: 0, position: 1, start: 7, end: 8 },
  ] },
  { name: 'lowercase expansion and combining composition retain entire originals', values: ['İ A\u030A'], tokens: [
    { term: 'i\u0307', valueIndex: 0, position: 0, start: 0, end: 1 },
    { term: 'å', valueIndex: 0, position: 1, start: 2, end: 4 },
  ] },
  { name: 'positions restart in each value, including empty and tokenless values', values: ['', 'red', '😀!\u0301', 'blue blue', ''], tokens: [
    { term: 'red', valueIndex: 1, position: 0, start: 0, end: 3 },
    { term: 'blue', valueIndex: 3, position: 0, start: 0, end: 4 },
    { term: 'blue', valueIndex: 3, position: 1, start: 5, end: 9 },
  ] },
  { name: 'empty value array', values: [], tokens: [] },
  { name: 'tokenless original is a present value', values: ['😀!\u0301'], tokens: [] },
];
