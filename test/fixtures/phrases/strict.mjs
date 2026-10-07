/**
 * Literal source and complete memberships authored from the strict contract.
 * Expected IDs and successful-branch lexical queries are stated by hand, not
 * derived from either oracle or production runtime. No companion code reused.
 */
export const PHRASE_SCHEMA = {
  text: { title: { boost: 2 }, body: {}, notes: { boost: 0.5 } },
  metadata: { kind: { type: 'string', nullable: true } },
};

export const phrase = (value, fields) => ({ kind: 'phrase', text: value, ...(fields ? { fields } : {}) });
export const text = (value, fields, operator) => ({ kind: 'text', text: value, ...(fields ? { fields } : {}), ...(operator ? { operator } : {}) });
export const exact = (value, weight = 1) => ({ text: value, match: 'exact', weight });
export const prefix = (value, weight = 1) => ({ text: value, match: 'prefix', weight });
export const group = (variants, fields) => ({ kind: 'group', variants, ...(fields ? { fields } : {}) });
export const and = (...children) => ({ kind: 'and', children });
export const or = (...children) => ({ kind: 'or', children });
export const not = (child) => ({ kind: 'not', child });
export const eq = (field, value) => ({ kind: 'eq', field, value });
const all = { kind: 'all' };

export const LONG_PHRASE_TERMS = Array.from({ length: 32 }, (_, index) => `t${String(index).padStart(2, '0')}`);
export const LONG_PHRASE = LONG_PHRASE_TERMS.join(' ');

export const phraseRecords = [
  { id: 'ordered', text: { title: 'red blue', body: 'other' }, metadata: { kind: 'guide' } },
  { id: 'punctuation', text: { title: 'RED—blue', body: '' } },
  { id: 'gapped', text: { title: 'red green blue', body: 'other' }, metadata: { kind: 'article' } },
  { id: 'reversed', text: { title: 'blue red', body: '' } },
  { id: 'value-boundary', text: { title: ['red', 'blue'], body: 'other' } },
  { id: 'field-boundary', text: { title: 'red', body: 'blue' } },
  { id: 'body-only', text: { title: 'blue', body: 'red blue' }, metadata: { kind: 'guide' } },
  { id: 'multiple-values', text: { title: ['red green', '', 'red_blue'], notes: 'other' } },
  { id: 'partial-value', text: { title: ['', 'red green', 'blue'], body: 'other' } },
  { id: 'one-red', text: { title: 'red', notes: 'other' } },
  { id: 'prefix-only', text: { title: 'reddish bluish' } },
  { id: 'repeat-3', text: { title: 'echo echo echo' } },
  { id: 'repeat-2', text: { title: 'echo, echo' } },
  { id: 'repeat-gap', text: { title: 'echo x echo' } },
  { id: 'normalization', text: { title: 'cafe\u0301 ﬁle', body: 'ＦＯＯ—ＢＡＲ' } },
  { id: 'normalized-plain', text: { title: 'CAFÉ FILE', body: 'foo bar' } },
  { id: 'accent-different', text: { title: 'cafe file', body: 'foo baz' } },
  { id: 'fraction-compat', text: { title: '½ file' } },
  { id: 'fraction-literal', text: { title: '1/2 ﬁle' } },
  { id: 'compat-spaces', text: { title: '\uFDFA file' } },
  { id: 'word-spaces', text: { title: 'صلى الله عليه وسلم file' } },
  { id: 'non-bmp', text: { title: '𐐀𐐁 ﬁle' } },
  { id: 'long-32', text: { title: LONG_PHRASE } },
  { id: 'long-gap', text: { title: [...LONG_PHRASE_TERMS.slice(0, 16), 'gap', ...LONG_PHRASE_TERMS.slice(16)].join(' ') } },
  { id: 'empty', text: { title: '', body: [] } },
  { id: 'tokenless', text: { title: '😀!\u0301', notes: '' } },
  { id: 'missing', text: {} },
  { id: '__proto__', text: { title: 'red blue' }, metadata: { kind: 'guide' } },
];

// These sets are literal observations of the source above, in source order.
const redBlue = ['ordered', 'punctuation', 'body-only', 'multiple-values', '__proto__'];
const titleRedBlue = ['ordered', 'punctuation', 'multiple-values', '__proto__'];
const red = ['ordered', 'punctuation', 'gapped', 'reversed', 'value-boundary', 'field-boundary', 'body-only', 'multiple-values', 'partial-value', 'one-red', '__proto__'];
const other = ['ordered', 'gapped', 'value-boundary', 'multiple-values', 'partial-value', 'one-red'];
const allIds = phraseRecords.map(({ id }) => id);

// lexicalQuery states the ordinary score expression for a single successful
// phrase. Native groups may score from every selected field, even when strict
// adjacency was established in only one of those fields.
export const handPhraseCases = [
  { name: 'strict ordering across all fields', query: phrase('red blue'), ids: redBlue, lexicalQuery: text('red blue') },
  { name: 'punctuation is token adjacency', query: phrase('RED,\n_blue'), ids: redBlue, lexicalQuery: text('RED,\n_blue') },
  { name: 'selected title includes later complete value', query: phrase('red blue', ['title']), ids: titleRedBlue, lexicalQuery: text('red blue', ['title']) },
  { name: 'selected body excludes title matches', query: phrase('red blue', ['body']), ids: ['body-only'], lexicalQuery: text('red blue', ['body']) },
  { name: 'selected missing and empty notes are nonmatching', query: phrase('red blue', ['notes']), ids: [], lexicalQuery: text('red blue', ['notes']) },
  { name: 'reversal remains significant', query: phrase('blue red'), ids: ['reversed'], lexicalQuery: text('blue red') },
  { name: 'two repeats require two adjacent occurrences', query: phrase('echo echo'), ids: ['repeat-3', 'repeat-2'], lexicalQuery: text('echo') },
  { name: 'three repeats require three adjacent occurrences', query: phrase('echo echo echo'), ids: ['repeat-3'], lexicalQuery: text('echo') },
  { name: 'four repeats cannot reuse occurrences', query: phrase('echo echo echo echo'), ids: [], lexicalQuery: text('echo') },
  { name: 'a deliberate repeated-word gap can be requested', query: phrase('echo x echo'), ids: ['repeat-gap'], lexicalQuery: text('echo x') },
  { name: 'one token is exact ordinary membership', query: phrase('RED'), ids: red, lexicalQuery: text('red') },
  { name: 'one token is never an implicit prefix', query: phrase('re'), ids: [], lexicalQuery: text('re') },
  { name: 'combining marks and compatibility ligature normalize', query: phrase('CAFÉ ﬁle'), ids: ['normalization', 'normalized-plain'], lexicalQuery: text('CAFÉ ﬁle') },
  { name: 'accents remain significant', query: phrase('cafe file'), ids: ['accent-different'], lexicalQuery: text('cafe file') },
  { name: 'fullwidth letters and punctuation normalize independently', query: phrase('foo bar'), ids: ['normalization', 'normalized-plain'], lexicalQuery: text('foo bar') },
  { name: 'NFKC fraction stays one original token', query: phrase('½ file'), ids: ['fraction-compat'], lexicalQuery: text('½ file') },
  { name: 'literal slash input remains three tokens', query: phrase('1/2 file'), ids: ['fraction-literal'], lexicalQuery: text('1/2 file') },
  { name: 'NFKC-created spaces stay inside one original token', query: phrase('\uFDFA file'), ids: ['compat-spaces'], lexicalQuery: text('\uFDFA file') },
  { name: 'literal words cannot retokenize compatibility output', query: phrase('صلى الله عليه وسلم file'), ids: ['word-spaces'], lexicalQuery: text('صلى الله عليه وسلم file') },
  { name: 'supplementary-letter normalization preserves ordering', query: phrase('𐐨𐐩 FILE'), ids: ['non-bmp'], lexicalQuery: text('𐐨𐐩 FILE') },
  { name: 'empty input is a nonmatching leaf', query: phrase(''), ids: [] },
  { name: 'tokenless input is a nonmatching leaf', query: phrase(' 😀!\u0301 '), ids: [] },
  { name: '32 distinct tokens require strict adjacency', query: phrase(LONG_PHRASE), ids: ['long-32'], lexicalQuery: text(LONG_PHRASE) },
  { name: 'OR preserves the independent nonphrase branch', query: or(phrase('red blue'), text('other')), ids: ['ordered', 'punctuation', 'gapped', 'value-boundary', 'body-only', 'multiple-values', 'partial-value', 'one-red', '__proto__'] },
  { name: 'AND requires phrase and independent group', query: and(phrase('red blue'), text('other')), ids: ['ordered', 'multiple-values'] },
  { name: 'OR preserves the independent equality branch', query: or(phrase('red blue'), eq('kind', 'article')), ids: ['ordered', 'punctuation', 'gapped', 'body-only', 'multiple-values', '__proto__'] },
  { name: 'NOT complements refined phrase membership', query: not(phrase('red blue')), ids: allIds.filter((id) => !redBlue.includes(id)), zero: true },
  { name: 'double NOT adds no lexical contribution', query: not(not(phrase('red blue'))), ids: redBlue, zero: true },
  { name: 'phrase excluded middle preserves exact universe', query: or(phrase('red blue'), not(phrase('red blue'))), ids: allIds },
  { name: 'different field selection remains a separate leaf', query: and(phrase('red blue'), not(phrase('red blue', ['title']))), ids: ['body-only'], lexicalQuery: text('red blue') },
  { name: 'failed phrase AND branch supplies no score in OR', query: or(and(phrase('red blue'), text('absent')), text('other')), ids: other, lexicalQuery: text('other') },
  { name: 'nested AND retains only successful phrase OR branch', query: and(text('red'), or(phrase('red blue'), text('absent'))), ids: redBlue, lexicalQuery: text('red blue') },
  { name: 'NOT complements OR after phrase refinement', query: not(or(phrase('red blue'), text('echo'))), ids: allIds.filter((id) => !redBlue.includes(id) && !['repeat-3', 'repeat-2', 'repeat-gap'].includes(id)), zero: true },
  { name: 'empty phrase OR does not prune ordinary branch', query: or(phrase(''), text('red')), ids: red, lexicalQuery: text('red') },
  { name: 'NOT empty phrase is the universe with zero score', query: not(phrase('😀!')), ids: allIds, zero: true },
  { name: 'successful repeats deduplicate against ordinary group', query: and(phrase('echo echo'), text('ECHO')), ids: ['repeat-3', 'repeat-2'], lexicalQuery: text('echo') },
  { name: 'two distinct repeated-word phrase branches', query: or(phrase('echo echo'), phrase('echo x echo')), ids: ['repeat-3', 'repeat-2', 'repeat-gap'] },
  { name: 'AND keeps an alternative group separate from phrase groups', query: and(phrase('red blue'), group([exact('blue'), exact('other')])), ids: redBlue, lexicalQuery: and(text('red blue'), group([exact('blue'), exact('other')])) },
  { name: 'OR keeps exact and weighted prefix alternatives', query: or(phrase('red blue'), group([exact('green'), prefix('redd', 0.5)])), ids: ['ordered', 'punctuation', 'gapped', 'body-only', 'multiple-values', 'partial-value', 'prefix-only', '__proto__'] },
  { name: 'all OR phrase keeps universe and scores successful phrase only', query: or(all, phrase('red blue')), ids: allIds },
];

/** Hand-selected ordinary queries that must supply each record's score/groups. */
export const handPhraseParticipationCases = [
  {
    name: 'successful OR branches supply their own groups',
    query: or(phrase('red blue'), text('other')),
    expected: [
      { id: 'ordered', query: text('red blue other') },
      { id: 'gapped', query: text('other') },
      { id: 'value-boundary', query: text('other') },
      { id: 'multiple-values', query: text('red blue other') },
      { id: 'one-red', query: text('other') },
      { id: 'body-only', query: text('red blue') },
    ],
  },
  {
    name: 'failed phrase branch contributes zero even with lexical candidates',
    query: or(phrase('red blue'), eq('kind', 'article')),
    expected: [{ id: 'gapped', query: all }, { id: 'ordered', query: text('red blue') }],
  },
  {
    name: 'failed conjunction contributes no partial phrase groups',
    query: or(and(phrase('red blue'), text('absent')), text('other')),
    expected: [{ id: 'ordered', query: text('other') }, { id: 'gapped', query: text('other') }],
  },
  {
    name: 'complement branch is non-scoring',
    query: or(phrase('red blue'), not(phrase('red blue'))),
    expected: [{ id: 'gapped', query: all }, { id: 'ordered', query: text('red blue') }],
  },
  {
    name: 'repetition is membership only and groups deduplicate across leaves',
    query: and(phrase('echo echo'), text('echo echo')),
    expected: [{ id: 'repeat-3', query: text('echo') }, { id: 'repeat-2', query: text('echo') }],
  },
  {
    name: 'each repeated-word OR branch preserves its actual lexical groups',
    query: or(phrase('echo echo'), phrase('echo x echo')),
    expected: [{ id: 'repeat-3', query: text('echo') }, { id: 'repeat-gap', query: text('echo x') }],
  },
  {
    name: 'ordinary alternative group retains weighted maximum semantics',
    query: or(phrase('red blue'), group([exact('green'), prefix('redd', 0.5)])),
    expected: [
      { id: 'gapped', query: group([exact('green'), prefix('redd', 0.5)]) },
      { id: 'multiple-values', query: and(text('red blue'), group([exact('green'), prefix('redd', 0.5)])) },
      { id: 'prefix-only', query: group([exact('green'), prefix('redd', 0.5)]) },
    ],
  },
  {
    name: 'match-all supplies no fabricated lexical contribution',
    query: or(all, phrase('red blue')),
    expected: [{ id: 'gapped', query: all }, { id: 'ordered', query: text('red blue') }],
  },
];

export const handPhraseCandidateCases = [
  { name: 'complete red blue superset includes all boundary failures', text: 'red blue', ids: ['ordered', 'punctuation', 'gapped', 'reversed', 'value-boundary', 'field-boundary', 'body-only', 'multiple-values', 'partial-value', '__proto__'] },
  { name: 'repeat candidate cannot establish required occurrence count', text: 'echo echo echo', ids: ['repeat-3', 'repeat-2', 'repeat-gap'] },
  { name: '32-token candidates include deliberate source gap', text: LONG_PHRASE, ids: ['long-32', 'long-gap'] },
  { name: 'empty candidate input is nonmatching', text: '', ids: [] },
];

export const phraseLengthSchema = { text: { title: {} } };
export const phraseLengthRecords = [
  { id: 'repeat-32', text: { title: Array(32).fill('echo').join(' ') } },
  { id: 'repeat-31', text: { title: Array(31).fill('echo').join(' ') } },
  { id: 'repeat-32-gap', text: { title: [...Array(16).fill('echo'), 'gap', ...Array(16).fill('echo')].join(' ') } },
];
export const phraseLengthCases = [
  { name: '32 original tokens before deduplication', text: Array(32).fill('echo').join(' '), ids: ['repeat-32'] },
  { name: '33 original tokens exceed the phrase bound even when repeated', text: Array(33).fill('echo').join(' '), error: RangeError },
];
