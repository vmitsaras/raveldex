// Literal expectations are authored independently of the production scanner.
// The spans below always refer to the original JavaScript UTF-16 string.
export const basicV1Fixtures = [
  {
    name: 'underscores delimit identifiers', input: 'Hello_world',
    tokens: [
      { term: 'hello', valueIndex: 0, position: 0, start: 0, end: 5 },
      { term: 'world', valueIndex: 0, position: 1, start: 6, end: 11 },
    ],
  },
  {
    name: 'apostrophes delimit contractions', input: "can't",
    tokens: [
      { term: 'can', valueIndex: 0, position: 0, start: 0, end: 3 },
      { term: 't', valueIndex: 0, position: 1, start: 4, end: 5 },
    ],
  },
  {
    name: 'em dash delimits words', input: 'red—blue',
    tokens: [
      { term: 'red', valueIndex: 0, position: 0, start: 0, end: 3 },
      { term: 'blue', valueIndex: 0, position: 1, start: 4, end: 8 },
    ],
  },
  {
    name: 'accents remain significant', input: 'café cafe',
    tokens: [
      { term: 'café', valueIndex: 0, position: 0, start: 0, end: 4 },
      { term: 'cafe', valueIndex: 0, position: 1, start: 5, end: 9 },
    ],
  },
  {
    name: 'combining acute composes without moving source offsets', input: 'a\u0301',
    tokens: [{ term: 'á', valueIndex: 0, position: 0, start: 0, end: 2 }],
  },
  {
    name: 'ligature expansion preserves the original length', input: 'ﬁle',
    tokens: [{ term: 'file', valueIndex: 0, position: 0, start: 0, end: 3 }],
  },
  {
    name: 'lowercasing does not fold sharp s', input: 'Straße STRASSE',
    tokens: [
      { term: 'straße', valueIndex: 0, position: 0, start: 0, end: 6 },
      { term: 'strasse', valueIndex: 0, position: 1, start: 7, end: 14 },
    ],
  },
  {
    name: 'fraction normalization stays one term', input: '½ 1/2',
    tokens: [
      { term: '1⁄2', valueIndex: 0, position: 0, start: 0, end: 1 },
      { term: '1', valueIndex: 0, position: 1, start: 2, end: 3 },
      { term: '2', valueIndex: 0, position: 2, start: 4, end: 5 },
    ],
  },
  {
    name: 'Japanese letters form one contiguous token', input: '東京都',
    tokens: [{ term: '東京都', valueIndex: 0, position: 0, start: 0, end: 3 }],
  },
  { name: 'empty value has no terms', input: '', tokens: [] },
  { name: 'whitespace has no terms', input: ' \t\r\n', tokens: [] },
  { name: 'emoji has no terms', input: '😀', tokens: [] },
  {
    name: 'leading marks are delimiters and later marks remain attached', input: '\u0301a\u0301 \u0301b',
    tokens: [
      { term: 'á', valueIndex: 0, position: 0, start: 1, end: 3 },
      { term: 'b', valueIndex: 0, position: 1, start: 5, end: 6 },
    ],
  },
  {
    name: 'contextual lowercase uses complete original tokens', input: 'ΟΣ ΟΣΑ',
    tokens: [
      { term: 'ος', valueIndex: 0, position: 0, start: 0, end: 2 },
      { term: 'οσα', valueIndex: 0, position: 1, start: 3, end: 6 },
    ],
  },
  {
    name: 'default lowercase is locale independent', input: 'İ I i ı',
    tokens: [
      { term: 'i\u0307', valueIndex: 0, position: 0, start: 0, end: 1 },
      { term: 'i', valueIndex: 0, position: 1, start: 2, end: 3 },
      { term: 'i', valueIndex: 0, position: 2, start: 4, end: 5 },
      { term: 'ı', valueIndex: 0, position: 3, start: 6, end: 7 },
    ],
  },
  {
    name: 'supplementary letters and emoji retain UTF-16 coordinates', input: '😀𐐀x𐐨',
    tokens: [{ term: '𐐨x𐐨', valueIndex: 0, position: 0, start: 2, end: 7 }],
  },
  {
    name: 'emoji sequence and joiner delimit words', input: 'a👩‍👧b',
    tokens: [
      { term: 'a', valueIndex: 0, position: 0, start: 0, end: 1 },
      { term: 'b', valueIndex: 0, position: 1, start: 6, end: 7 },
    ],
  },
  {
    name: 'multiple combining marks preserve the full original span', input: 'a\u0301\u0308',
    tokens: [{ term: 'á\u0308', valueIndex: 0, position: 0, start: 0, end: 3 }],
  },
  {
    name: 'Unicode numbers are recognized without digit transliteration', input: '١٢٣',
    tokens: [{ term: '١٢٣', valueIndex: 0, position: 0, start: 0, end: 3 }],
  },
  {
    name: 'NFKC punctuation stays in a single normalized term', input: 'Ⅳ ⑴ Ŀ',
    tokens: [
      { term: 'iv', valueIndex: 0, position: 0, start: 0, end: 1 },
      { term: '(1)', valueIndex: 0, position: 1, start: 2, end: 3 },
      { term: 'l·', valueIndex: 0, position: 2, start: 4, end: 5 },
    ],
  },
  {
    name: 'NFKC spaces do not create new tokens', input: 'ﷺ',
    tokens: [{ term: 'صلى الله عليه وسلم', valueIndex: 0, position: 0, start: 0, end: 1 }],
  },
  {
    name: 'compatibility normalization precedes lowercasing', input: '𝔸 Ａ',
    tokens: [
      { term: 'a', valueIndex: 0, position: 0, start: 0, end: 2 },
      { term: 'a', valueIndex: 0, position: 1, start: 3, end: 4 },
    ],
  },
  {
    name: 'repeated tokens preserve every occurrence', input: 'Echo, ECHO echo',
    tokens: [
      { term: 'echo', valueIndex: 0, position: 0, start: 0, end: 4 },
      { term: 'echo', valueIndex: 0, position: 1, start: 6, end: 10 },
      { term: 'echo', valueIndex: 0, position: 2, start: 11, end: 15 },
    ],
  },
];

export const malformedUtf16Fixtures = [
  ['lone leading high surrogate', '\uD800 valid'],
  ['lone leading low surrogate', '\uDC00 valid'],
  ['high surrogate inside a token', 'a\uD800b'],
  ['low surrogate inside a token', 'a\uDC00b'],
  ['high surrogate after delimiter', 'valid, \uD800'],
  ['low surrogate after delimiter', 'valid, \uDC00'],
  ['high surrogate followed by high surrogate', '\uD800\uD800\uDC00'],
  ['low surrogate followed by high surrogate', '\uDC00\uD800'],
  ['high surrogate followed by a regular delimiter', '\uD800 '],
  ['high surrogate after supplementary letter', '𐐀\uD800'],
];
