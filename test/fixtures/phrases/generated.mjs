/** Fixed-seed sources/queries; expected behavior comes from the source oracle. */
import { PHRASE_SCHEMA, phrase, text, group, exact, prefix, and, or, not, eq } from './strict.mjs';

export { PHRASE_SCHEMA };
export const PHRASE_CORPUS_SEEDS = [0x5eed2001, 0xc0ffee21, 0x00002001];
export const GENERATED_PHRASE_QUERY_COUNT = 96;

const spellings = ['red', 'RED', 'blue', 'green', 'echo', 'ﬁle', 'FILE', 'CAFÉ', 'cafe\u0301', 'cafe', '½', '1/2', '\uFDFA', 'صلى', 'الله', 'عليه', 'وسلم', '𐐀𐐁', 'x'];
const singleTokenSpellings = ['red', 'echo', 'ﬁle', 'CAFÉ', 'cafe\u0301', '½', '\uFDFA', '𐐀𐐁'];
const phraseSpellings = ['red blue', 'blue red', 'echo echo', 'echo echo echo', 'CAFÉ ﬁle', '½ file', '1/2 file', '\uFDFA file', 'red green blue', 'صلى الله عليه وسلم', '𐐀𐐁 file', '', '😀!\u0301'];
const selections = [undefined, ['title'], ['body'], ['notes'], ['body', 'title'], ['notes', 'body', 'title']];

function random(seed) {
  let state = seed;
  return (bound) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return (state >>> 16) % bound;
  };
}

export function generatedPhraseCorpus(seed, size = 48) {
  const next = random(seed);
  const source = () => {
    if (next(3) === 0) return phraseSpellings[next(phraseSpellings.length)];
    return Array.from({ length: 1 + next(8) }, () => spellings[next(spellings.length)])
      .join([' ', '—', '_', ',\n'][next(4)]);
  };
  const specialIds = ['__proto__', 'constructor', 'A', 'a', ' a ', '01', '1', '😀', '\uE000', '𐐀'];
  return Array.from({ length: size }, (_, index) => {
    const fields = {};
    for (const field of ['title', 'body', 'notes']) {
      switch (next(7)) {
        case 0: break;
        case 1: fields[field] = ''; break;
        case 2: fields[field] = '😀!\u0301'; break;
        case 3: fields[field] = []; break;
        case 4: fields[field] = source(); break;
        case 5: fields[field] = ['', source(), '', source()]; break;
        case 6: fields[field] = ['red', 'blue', source()]; break;
      }
    }
    const metadata = {};
    if (next(4)) metadata.kind = [null, 'guide', 'Guide', 'article'][next(4)];
    return { id: specialIds[index] ?? `p:${seed.toString(16)}:${index}`, text: fields, metadata };
  });
}

export function generatedPhraseQueries(seed, count = GENERATED_PHRASE_QUERY_COUNT) {
  const next = random(seed ^ 0x1234_2001);
  const phraseLeaf = () => phrase(phraseSpellings[next(phraseSpellings.length)], selections[next(selections.length)]);
  const leaf = () => {
    switch (next(6)) {
      case 0: case 1: return phraseLeaf();
      case 2: return text(spellings[next(spellings.length)], selections[next(selections.length)]);
      case 3: return group([exact(singleTokenSpellings[next(singleTokenSpellings.length)]), prefix(['re', 'bl', 'fi', 'ca'][next(4)], 0.5)], selections[next(selections.length)]);
      case 4: return eq('kind', [null, 'guide', 'Guide', 'article'][next(4)]);
      case 5: return next(2) ? { kind: 'all' } : { kind: 'none' };
    }
  };
  const node = (depth) => {
    if (depth === 0 || next(4) === 0) return leaf();
    switch (next(4)) {
      case 0: return not(node(depth - 1));
      case 1: return not(not(node(depth - 1)));
      case 2: return and(node(depth - 1), node(depth - 1));
      case 3: return or(node(depth - 1), node(depth - 1));
    }
  };
  // Each generated query contains a phrase leaf, including deeply nested and
  // negative cases. At most 20 original tokens are analyzed in any one tree.
  return Array.from({ length: count }, (_, index) => index % 4 === 0 ? phraseLeaf()
    : index % 4 === 1 ? or(phraseLeaf(), node(2))
      : index % 4 === 2 ? and(phraseLeaf(), node(2))
        : not(or(phraseLeaf(), node(2))));
}
