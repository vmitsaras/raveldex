export const NUMERIC_SCHEMA = { text: { title: {} } };
export const numericRecords = [
  { id: 'a', text: { title: 'red red car' } },
  { id: 'b', text: { title: 'red car' } },
  { id: 'c', text: { title: 'blue' } },
];

// Readable decimal constants from RANKING's hand arithmetic: ln(8/5),
// tfPart(red/a)=88/73 and tfPart(car/a)=44/53; b's TF part is 1.
// Neither the implementation nor the source oracle supplies these values.
export const handScores = {
  red: { a: 0.566579717446914, b: 0.470003629245736 },
  car: { a: 0.390191692204007, b: 0.470003629245736 },
  and: { a: 0.956771409650921, b: 0.940007258491471 },
  alternatives: { a: 0.566579717446914, b: 0.470003629245736 },
};

export const QUERY_SCHEMA = {
  text: { title: { boost: 2 }, body: {}, notes: { boost: 0.5 } },
  metadata: {
    kind: { type: 'string', nullable: true },
    tags: { type: 'string', multi: true, nullable: true },
    year: { type: 'number', nullable: true },
    enabled: { type: 'boolean' },
    numbers: { type: 'number', multi: true, nullable: true },
  },
};

export const queryRecords = [
  { id: 'a', text: { title: 'red red car', body: 'blue car' }, metadata: { kind: 'Guide', tags: ['red', 'red', null], year: null, enabled: true, numbers: [-0, 2, null] } },
  { id: 'b', text: { title: 'red car', body: ['red', 'red'] }, metadata: { kind: 'guide', tags: ['red', 'green'], year: -0, enabled: false, numbers: [] } },
  { id: 'c', text: { title: 'blue', body: 'carpet' }, metadata: { kind: ' guide ', tags: [], year: 2, enabled: true, numbers: [2, 3] } },
  { id: 'd', text: { title: 'red blue', body: 'scarlet' }, metadata: { kind: null, tags: [null], numbers: [null] } },
  { id: 'e', text: { title: 'red', body: '' } },
  { id: 'f', text: { title: 'car', body: 'red' }, metadata: { kind: 'Guide', tags: ['Red'], year: 0, enabled: true, numbers: [0] } },
  { id: 'g', text: { title: 'cars carbon', body: 'RED' }, metadata: { kind: 'guide', tags: ['red', 'blue'], year: 3, enabled: false } },
  { id: '__proto__', text: { title: 'blue', body: 'red car' }, metadata: { kind: 'Guide', tags: ['red'] } },
  { id: 'constructor', text: { title: 'red', body: '' }, metadata: { kind: 'red', tags: ['red'] } },
  { id: ' A ', text: { title: ['', '\u0301 😀 !'], body: [], notes: '' }, metadata: { kind: 'guide', tags: [] } },
  { id: 'missing', text: {} },
  { id: 'fraction', text: { title: '½', body: '1/2' } },
  { id: 'unicode-space', text: { title: '\uFDFA', body: 'صلى الله عليه وسلم' } },
  { id: 'unicode-file', text: { title: 'ﬁle', body: 'FILE' } },
  ...['tie:A', 'tie:a', 'tie:😀', 'tie:\uE000', 'tie:𐐀'].map((id) => ({ id, text: { title: 'same' } })),
];

export const text = (value, fields, operator) => ({ kind: 'text', text: value, ...(fields ? { fields } : {}), ...(operator ? { operator } : {}) });
export const group = (variants, fields) => ({ kind: 'group', variants, ...(fields ? { fields } : {}) });
export const exact = (value, weight = 1) => ({ text: value, match: 'exact', weight });
export const prefix = (value, weight = 1) => ({ text: value, match: 'prefix', weight });
export const and = (...children) => ({ kind: 'and', children });
export const or = (...children) => ({ kind: 'or', children });
export const not = (child) => ({ kind: 'not', child });
export const eq = (field, value) => ({ kind: 'eq', field, value });
const all = { kind: 'all' };
const none = { kind: 'none' };
const red = ['a', 'b', 'd', 'e', 'f', 'g', '__proto__', 'constructor'];
const blue = ['a', 'c', 'd', '__proto__'];
const car = ['a', 'b', 'f', '__proto__'];
const allIds = queryRecords.map(({ id }) => id);

// Memberships are stated by hand, independently of either evaluator.
export const handQueryCases = [
  { name: 'plain text original groups AND', query: 'red car', ids: car },
  { name: 'text OR', query: text('red car', undefined, 'or'), ids: red },
  { name: 'AND groups may match different fields', query: 'red blue', ids: ['a', 'd', '__proto__'] },
  { name: 'title selected', query: text('red car', ['title']), ids: ['a', 'b'] },
  { name: 'separate selected fields', query: and(text('red', ['title']), text('car', ['body'])), ids: ['a'] },
  { name: 'alternative terms remain one group', query: group([exact('car'), exact('blue')]), ids: ['a', 'b', 'c', 'd', 'f', '__proto__'] },
  { name: 'weighted prefix car family', query: group([prefix('ca', 0.4)]), ids: ['a', 'b', 'c', 'f', 'g', '__proto__'] },
  { name: 'prefix overlap different weights', query: group([prefix('ca', 0.4), prefix('car', 0.8), exact('CAR')]), ids: ['a', 'b', 'c', 'f', 'g', '__proto__'] },
  { name: 'duplicate alternatives', query: group([exact('red'), exact('RED'), exact('red', 0.5)]), ids: red },
  { name: 'normalized duplicate groups', query: and(text('red'), text('RED'), text('red red')), ids: red },
  { name: 'alternative and original group conjunction', query: and(text('red'), group([exact('car'), exact('blue')])), ids: ['a', 'b', 'd', 'f', '__proto__'] },
  { name: 'failed AND inside OR supplies no score', query: or(and(text('red'), text('absent')), text('blue')), ids: blue },
  { name: 'failed OR inside AND disqualifies', query: and(text('red'), or(text('absent'), none)), ids: [] },
  { name: 'successful overlapping OR branches', query: or(and(text('red'), text('car')), text('blue')), ids: ['a', 'b', 'c', 'd', 'f', '__proto__'] },
  { name: 'duplicate group across successful branches', query: and(text('red'), or(text('RED'), text('car'))), ids: red },
  { name: 'negative only', query: not(text('red')), ids: allIds.filter((id) => !red.includes(id)), zero: true },
  { name: 'double NOT preserves zero contribution', query: not(not(text('red'))), ids: red, zero: true },
  { name: 'NOT empty analysis explicitly complements none', query: not(text(' 😀!\u0301 ')), ids: allIds, zero: true },
  { name: 'negative branch plus successful positive OR', query: or(not(text('red')), text('car')), ids: allIds.filter((id) => !red.includes(id) || car.includes(id)) },
  { name: 'explicit all', query: all, ids: allIds, zero: true },
  { name: 'all plus positive branch', query: or(all, text('red')), ids: allIds },
  { name: 'explicit none', query: none, ids: [] },
  { name: 'empty primitive', query: '', ids: [] },
  { name: 'tokenless AND text', query: text(' 😀!\u0301 '), ids: [] },
  { name: 'tokenless OR text', query: text(' 😀!\u0301 ', undefined, 'or'), ids: [] },
  { name: 'missing term', query: 'absent', ids: [] },
  { name: 'no implicit final prefix', query: 'ca', ids: [] },
  { name: 'missing or tokenless selected field', query: text('red', ['notes']), ids: [] },
  { name: 'strict metadata case', query: eq('kind', 'Guide'), ids: ['a', 'f', '__proto__'], zero: true },
  { name: 'strict metadata spacing', query: eq('kind', ' guide '), ids: ['c'], zero: true },
  { name: 'strict metadata null', query: eq('kind', null), ids: ['d'], zero: true },
  { name: 'explicit numeric null excludes missing', query: eq('year', null), ids: ['a'], zero: true },
  { name: 'NOT equality includes missing', query: not(eq('year', null)), ids: allIds.filter((id) => id !== 'a'), zero: true },
  { name: 'negative zero equality', query: eq('year', -0), ids: ['b', 'f'], zero: true },
  { name: 'multi strings exact case and deduplication', query: eq('tags', 'red'), ids: ['a', 'b', 'g', '__proto__', 'constructor'], zero: true },
  { name: 'multi strings do not lowercase', query: eq('tags', 'Red'), ids: ['f'], zero: true },
  { name: 'multi explicit null excludes empty or missing', query: eq('tags', null), ids: ['a', 'd'], zero: true },
  { name: 'multi numeric negative zero', query: eq('numbers', -0), ids: ['a', 'f'], zero: true },
  { name: 'multi numeric null', query: eq('numbers', null), ids: ['a', 'd'], zero: true },
  { name: 'strict boolean', query: eq('enabled', false), ids: ['b', 'g'], zero: true },
  { name: 'equality filter preserves lexical population', query: and(text('red'), eq('kind', 'Guide')), ids: ['a', 'f', '__proto__'] },
  { name: 'fraction original span is one normalized token', query: '½', ids: ['fraction'] },
  { name: 'fraction prefix uses the complete normalized original span', query: group([prefix('½')], ['title']), ids: ['fraction'] },
  { name: 'fraction normalization never retokenizes title', query: text('1/2', ['title']), ids: [] },
  { name: 'literal fraction is two original groups in body', query: text('1/2', ['body']), ids: ['fraction'] },
  { name: 'compatibility-created spaces stay one title term', query: text('\uFDFA', ['title']), ids: ['unicode-space'] },
  { name: 'compatibility space term is not four title terms', query: text('صلى الله عليه وسلم', ['title']), ids: [] },
  { name: 'original body words qualify independently', query: text('صلى الله عليه وسلم', ['body']), ids: ['unicode-space'] },
  { name: 'compatibility ligature exact normalization', query: 'ﬁle', ids: ['unicode-file'] },
  { name: 'compatibility ligature prefix', query: group([prefix('fi')]), ids: ['unicode-file'] },
  { name: 'exact numerical ID tie', query: 'same', ids: ['tie:A', 'tie:a', 'tie:😀', 'tie:\uE000', 'tie:𐐀'], orderedIds: ['tie:A', 'tie:a', 'tie:𐐀', 'tie:😀', 'tie:\uE000'] },
];

export const MULTIFIELD_SCHEMA = { text: { title: { boost: 2 }, body: {} } };
export const multiFieldRecords = [
  { id: 'a', text: { title: 'red red car', body: 'blue car' } },
  { id: 'b', text: { title: 'red car', body: ['red', 'red'] } },
  { id: 'c', text: { title: 'blue', body: [] } },
  { id: 'tokenless', text: { title: '😀!\u0301', body: '' } },
  { id: 'missing', text: {} },
];

// title N=3,L=6,avg=2; body N=2,L=4,avg=2. Body df=1,
// so IDF=ln(2), with red/b TF part=11/8. Title contributions
// are twice the independently stated one-field constants above.
export const multiFieldHandScores = {
  red: { a: 1.133159434893828, b: 1.893084631761397 },
  car: { a: 1.473530564967959, b: 0.940007258491472 },
  and: { a: 2.606689999861787, b: 2.833091890252869 },
  alternatives: { a: 1.826306615453773, b: 1.893084631761397 },
};

export const QUERY_CORPUS_SEEDS = [0x5eed1003, 0xc0ffee03, 0x00001003];
export const GENERATED_QUERY_COUNT = 96;
const spellings = ['Red', 'red', 'car', 'cars', 'carbon', 'carpet', 'BLUE', 'green', '½', 'ﬁle', 'a\u0301', 'CAFÉ', 'cafe', 'İ', 'Straße', '𐐀𐐁', '東京都'];
const prefixes = ['re', 'ca', 'bl', 'fi', '½', 'café', '𐐀𐐁'];

function random(seed) {
  let state = seed;
  return (bound) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return (state >>> 16) % bound;
  };
}

export function generatedQueryCorpus(seed, size = 48) {
  const next = random(seed);
  const phrase = () => Array.from({ length: 1 + next(7) }, () => spellings[next(spellings.length)]).join(' — ');
  return Array.from({ length: size }, (_, index) => {
    const source = {};
    for (const field of ['title', 'body', 'notes']) {
      switch (next(6)) {
        case 0: break;
        case 1: source[field] = ''; break;
        case 2: source[field] = ' 😀!\u0301 '; break;
        case 3: source[field] = []; break;
        case 4: source[field] = phrase(); break;
        case 5: source[field] = ['', phrase(), '', phrase()]; break;
      }
    }
    const metadata = {};
    if (next(4)) metadata.kind = [null, 'guide', 'Guide', ' guide '][next(4)];
    if (next(4)) metadata.tags = Array.from({ length: next(5) }, () => [null, 'red', 'Red', 'blue', ''][next(5)]);
    if (next(4)) metadata.year = [null, -0, 1, 2, 3][next(5)];
    if (next(4)) metadata.enabled = Boolean(next(2));
    if (next(4)) metadata.numbers = Array.from({ length: next(5) }, () => [null, -0, 1, 2, 3][next(5)]);
    const special = ['__proto__', 'constructor', 'A', 'a', ' a ', '01', '1', '😀', '\uE000', '𐐀'];
    return { id: index < special.length ? special[index] : `q:${seed.toString(16)}:${index}`, text: source, metadata };
  });
}

export function generatedQueries(seed, count = GENERATED_QUERY_COUNT) {
  const next = random(seed ^ 0x1234_abcd);
  const selections = [undefined, ['title'], ['body'], ['notes'], ['body', 'title'], ['notes', 'body', 'title']];
  const leaf = () => {
    switch (next(7)) {
      case 0: return text(Array.from({ length: next(5) }, () => spellings[next(spellings.length)]).join(' '), selections[next(selections.length)], next(2) ? 'and' : 'or');
      case 1: {
        const alternatives = Array.from({ length: 1 + next(4) }, () => next(2)
          ? exact(spellings[next(spellings.length)], [1, 0.75, 0.25][next(3)])
          : prefix(prefixes[next(prefixes.length)], [1, 0.75, 0.25][next(3)]));
        if (next(2)) alternatives.push({ ...alternatives[0] });
        return group(alternatives, selections[next(selections.length)]);
      }
      case 2: return eq('kind', [null, 'guide', 'Guide', ' guide ', 'missing'][next(5)]);
      case 3: return eq('tags', [null, 'red', 'Red', 'blue', ''][next(5)]);
      case 4: return next(2) ? eq('year', [null, -0, 1, 2, 3][next(5)]) : eq('enabled', Boolean(next(2)));
      case 5: return next(2) ? { kind: 'all' } : { kind: 'none' };
      case 6: return text('absent', selections[next(selections.length)]);
    }
  };
  const node = (depth) => {
    if (depth === 0 || next(4) === 0) return leaf();
    switch (next(5)) {
      case 0: return not(node(depth - 1));
      case 1: return not(not(node(depth - 1)));
      case 2: { const child = node(depth - 1); return and(child, structuredClone(child)); }
      case 3: return and(node(depth - 1), node(depth - 1));
      case 4: return or(node(depth - 1), node(depth - 1));
    }
  };
  return Array.from({ length: count }, () => node(3));
}
