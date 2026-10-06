export const EXACT_SCHEMA = {
  text: { title: { boost: 2 }, body: {}, notes: {} },
  metadata: { label: { type: 'string' } },
};

// Expectations are hand-authored from the normative rules, not generated
// by either the production analyzer or the independent source reference.
export const criticalTokenCases = [
  { name: 'punctuation boundaries', input: "Hello_world can't red—blue", terms: ['hello', 'world', 'can', 't', 'red', 'blue'] },
  { name: 'combining composition and leading marks', input: '\u0301A a\u0301 \u0301b\u0301', terms: ['a', 'á', 'b\u0301'] },
  { name: 'accent significance', input: 'CAFÉ cafe', terms: ['café', 'cafe'] },
  { name: 'compatibility ligature', input: 'ﬁle ﬃ', terms: ['file', 'ffi'] },
  { name: 'compatibility width and numbers', input: 'ＡＢＣ １２３ ①', terms: ['abc', '123', '1'] },
  { name: 'fraction is not retokenized', input: '½ 1/2', terms: ['1⁄2', '1', '2'] },
  { name: 'compatibility spaces remain one term', input: '\uFDFA', terms: ['صلى الله عليه وسلم'] },
  { name: 'default dotted I lowercase', input: 'İ I i', terms: ['i\u0307', 'i', 'i'] },
  { name: 'lowercase is not case folding', input: 'Straße STRASSE', terms: ['straße', 'strasse'] },
  { name: 'contextual Greek lowercase', input: 'ΟΣ ΟΣΑ Σ', terms: ['ος', 'οσα', 'σ'] },
  { name: 'supplementary letters and delimiters', input: '😀𐐀𐐁🚀𐐀', terms: ['𐐨𐐩', '𐐨'] },
  { name: 'contiguous ideographs', input: '東京都', terms: ['東京都'] },
  { name: 'zero width joiner separates original spans', input: 'A\u200DB', terms: ['a', 'b'] },
  { name: 'Hangul composition', input: '\u1100\u1161', terms: ['가'] },
  { name: 'empty value', input: '', terms: [] },
  { name: 'marks emoji whitespace without token', input: '\u0301\u0308 😀 \t! ', terms: [] },
];

export const exactFixtureRecords = [
  { id: '__proto__', text: { title: 'Alpha alpha', body: ['', 'Beta'] } },
  { id: 'constructor', text: { body: 'ALPHA' } },
  { id: ' A ', text: { notes: ['alpha', 'ALPHA'] } },
  { id: 'a', text: { title: 'alpha' } },
  { id: 'A', text: { title: 'ALPHA' } },
  { id: '😀', text: { notes: 'alpha' } },
  { id: '01', text: { title: 'ALPHA' } },
  { id: '1', text: { title: 'Alpha' } },
  { id: 'empty-values', text: { title: '', body: [], notes: ['', ''] } },
  { id: 'missing-fields', text: {} },
  { id: 'no-tokens', text: { title: ' 😀!!! \u0301', notes: '\u0301\u0308' }, metadata: { label: 'alpha' } },
  { id: 'field-only', text: { body: 'delta', notes: 'beta' } },
  { id: 'split-values', text: { title: ['red', 'blue'], body: ['al', 'pha'] } },
  { id: 'repeated', text: { title: ['ECHO echo', 'echo'], body: 'echo', notes: 'ECHO' } },
  { id: 'unicode-accent', text: { title: 'a\u0301 CAFÉ', body: 'cafe' } },
  { id: 'unicode-compat', text: { title: 'ﬁle ½ ＡＬＰＨＡ', body: '1/2' } },
  { id: 'unicode-space', text: { title: '\uFDFA', body: 'صلى الله عليه وسلم' } },
  { id: 'unicode-case', text: { title: 'İ Straße ΟΣ', body: 'i STRASSE ΟΣΑ' } },
  { id: 'unicode-supplementary', text: { title: '😀𐐀𐐁', notes: '東京都' } },
];

export const handExactCases = [
  { term: 'alpha', ids: ['__proto__', 'constructor', ' A ', 'a', 'A', '😀', '01', '1', 'unicode-compat'] },
  { term: 'alpha', fields: ['title'], ids: ['__proto__', 'a', 'A', '01', '1', 'unicode-compat'] },
  { term: 'alpha', fields: ['body'], ids: ['constructor'] },
  { term: 'alpha', fields: ['notes'], ids: [' A ', '😀'] },
  { term: 'alpha', fields: ['body', 'notes'], ids: ['constructor', ' A ', '😀'] },
  { term: 'beta', ids: ['__proto__', 'field-only'] },
  { term: 'beta', fields: ['title'], ids: [] },
  { term: 'beta', fields: ['notes'], ids: ['field-only'] },
  { term: 'echo', ids: ['repeated'] },
  { term: 'echo', fields: ['title', 'body', 'notes'], ids: ['repeated'] },
  { term: 'red', ids: ['split-values'] },
  { term: 'blue', ids: ['split-values'] },
  { term: 'redblue', ids: [] },
  { term: 'al', ids: ['split-values'] },
  { term: 'pha', ids: ['split-values'] },
  { term: 'alph', ids: [] },
  { term: 'absent', ids: [] },
  { term: 'á', ids: ['unicode-accent'] },
  { term: 'café', ids: ['unicode-accent'] },
  { term: 'cafe', fields: ['title'], ids: [] },
  { term: 'cafe', fields: ['body'], ids: ['unicode-accent'] },
  { term: 'file', ids: ['unicode-compat'] },
  { term: '1⁄2', fields: ['title'], ids: ['unicode-compat'] },
  { term: '1⁄2', fields: ['body'], ids: [] },
  { term: '1', fields: ['body'], ids: ['unicode-compat'] },
  { term: '2', fields: ['body'], ids: ['unicode-compat'] },
  { term: 'صلى الله عليه وسلم', fields: ['title'], ids: ['unicode-space'] },
  { term: 'صلى الله عليه وسلم', fields: ['body'], ids: [] },
  { term: 'الله', fields: ['title'], ids: [] },
  { term: 'الله', fields: ['body'], ids: ['unicode-space'] },
  { term: 'i\u0307', fields: ['title'], ids: ['unicode-case'] },
  { term: 'i', fields: ['title'], ids: [] },
  { term: 'i', fields: ['body'], ids: ['unicode-case'] },
  { term: 'straße', fields: ['title'], ids: ['unicode-case'] },
  { term: 'strasse', fields: ['title'], ids: [] },
  { term: 'strasse', fields: ['body'], ids: ['unicode-case'] },
  { term: 'ος', ids: ['unicode-case'] },
  { term: 'οσα', ids: ['unicode-case'] },
  { term: 'οσ', ids: [] },
  { term: '𐐨𐐩', ids: ['unicode-supplementary'] },
  { term: '𐐨', ids: [] },
  { term: '東京都', fields: ['notes'], ids: ['unicode-supplementary'] },
];

export const EXACT_CORPUS_SEEDS = [0x5eed1002, 0xc0ffee02, 0x00001002];

const generatedSpellings = ['Alpha', 'BETA', 'gamma', 'delta', 'ECHO', 'ﬁle', '½', 'CAFÉ', 'cafe', 'İ', 'Straße', 'STRASSE', '𐐀𐐁', '東京都', 'a\u0301', '1/2'];

// These terms are specified independently of either analyzer implementation.
export const GENERATED_EXACT_TERMS = ['common', 'alpha', 'beta', 'gamma', 'delta', 'echo', 'file', '1⁄2', 'café', 'cafe', 'i\u0307', 'straße', 'strasse', '𐐨𐐩', '東京都', 'á', '1', '2', 'absent'];

/** Deterministic admitted source data for parity and 100/1,000/10,000 diagnostics. */
export function generatedExactCorpus(size, seed = EXACT_CORPUS_SEEDS[0]) {
  if (!Number.isSafeInteger(size) || size < 0 || size > 10_000) throw new RangeError('fixture size');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new RangeError('fixture seed');
  let state = seed;
  const next = (bound) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    // Use high bits so power-of-two choices do not follow the LCG's short
    // low-bit cycle and accidentally exclude repeated/value-shape cases.
    return (state >>> 16) % bound;
  };
  const word = () => generatedSpellings[next(generatedSpellings.length)];
  const phrase = (count) => Array.from({ length: count }, word).join(' — ');
  const records = [];
  for (let index = 0; index < size; index += 1) {
    const text = { body: `${phrase(3)} COMMON ${phrase(2)} unique${index}` };
    switch (next(6)) {
      case 0: break;
      case 1: text.title = ''; break;
      case 2: text.title = []; break;
      case 3: text.title = phrase(5); break;
      case 4: text.title = ['', phrase(2), '', phrase(2)]; break;
      case 5: { const repeated = word(); text.title = [repeated, `${repeated} ${repeated}`]; break; }
    }
    switch (next(4)) {
      case 0: break;
      case 1: text.notes = '😀!!! \u0301'; break;
      case 2: text.notes = phrase(1); break;
      case 3: text.notes = ['', phrase(1), '', phrase(1)]; break;
    }
    const opaqueIds = ['__proto__', 'constructor', 'A', 'a', ' a ', '01', '1', '😀'];
    const id = index < opaqueIds.length ? opaqueIds[index] : `record:${seed.toString(16)}:${index}`;
    records.push({ id, text, metadata: { label: word() } });
  }
  return records;
}
