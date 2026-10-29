import { bound } from '../../../core/errors/error.js';
import type { WorkStep } from '../../../core/index/directory.js';

/** Native implementation of the original 1980 Porter rules (ABLI, OU).
 * Algorithm: https://snowballstem.org/algorithms/porter/stemmer.html
 * This is not Porter2 or the later BLI/LOGI variant. Only ASCII words are
 * stemmed; normalized non-ASCII/digit-containing terms pass through. */
interface Shape {
  readonly measure: number; readonly hasVowel: boolean;
  readonly doubleConsonant: boolean; readonly cvc: boolean;
}
interface Ending { readonly stem: string; readonly suffix: string }

/** Classify y from the immediately preceding classification, without recursion. */
function* shape(word: string): Generator<WorkStep, Shape> {
  let previous = true, beforePrevious = false, measure = 0, hasVowel = false;
  let cvc = false, doubleConsonant = false;
  for (let i = 0; i < word.length; i++) {
    yield { workUnits: 1 };
    const letter = word[i]!;
    const consonant: boolean = letter === 'y' ? i === 0 || !previous : !'aeiou'.includes(letter);
    if (!consonant) hasVowel = true;
    if (i > 0 && !previous && consonant) measure++;
    cvc = i >= 2 && beforePrevious && !previous && consonant && !'wxy'.includes(letter);
    doubleConsonant = i > 0 && consonant && previous && letter === word[i - 1];
    beforePrevious = previous; previous = consonant;
  }
  return { measure, hasVowel, doubleConsonant, cvc };
}

/** The first longest matching suffix wins even if its later predicate fails. */
function* ending(word: string, choices: readonly string[]): Generator<WorkStep, Ending | undefined> {
  for (const suffix of choices) {
    yield { workUnits: suffix.length + 1 };
    if (word.endsWith(suffix)) {
      yield { workUnits: word.length + 1 };
      return { stem: word.slice(0, -suffix.length), suffix };
    }
  }
  return undefined;
}
function* replace(stem: string, suffix: string): Generator<WorkStep, string> {
  yield { workUnits: stem.length + suffix.length + 1 };
  return stem + suffix;
}
const STEP2: Readonly<Record<string, string>> = Object.freeze({
  ational: 'ate', tional: 'tion', enci: 'ence', anci: 'ance', izer: 'ize',
  abli: 'able', alli: 'al', entli: 'ent', eli: 'e', ousli: 'ous',
  ization: 'ize', ation: 'ate', ator: 'ate', alism: 'al', iveness: 'ive',
  fulness: 'ful', ousness: 'ous', aliti: 'al', iviti: 'ive', biliti: 'ble',
});
const STEP3: Readonly<Record<string, string>> = Object.freeze({
  icate: 'ic', ative: '', alize: 'al', iciti: 'ic', ical: 'ic', ful: '', ness: '',
});
const longest = (values: readonly string[]): readonly string[] => Object.freeze([...values].sort((a, b) => b.length - a.length));
const STEP2_SUFFIXES = longest(Object.keys(STEP2));
const STEP3_SUFFIXES = longest(Object.keys(STEP3));
const STEP4_SUFFIXES = longest(['al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant', 'ement', 'ment', 'ent', 'ion', 'ou', 'ism', 'ate', 'iti', 'ous', 'ive', 'ize']);

/** Every variable scan and bounded comparison/copy yields work before it runs.
 * The caller supplies one already-normalized token and charges these steps in
 * its current operation; no state/cache survives this generator. */
export function* stemEnglish(term: string): Generator<WorkStep, string> {
  bound(term.length, 256, 'english.term');
  for (let i = 0; i < term.length; i++) {
    yield { workUnits: 1 };
    const code = term.charCodeAt(i);
    if (code < 97 || code > 122) return term;
  }
  if (term.length <= 2) return term;
  let word = term;

  // 1a: plurals.
  let match = yield* ending(word, ['sses', 'ies', 'ss', 's']);
  if (match) word = yield* replace(match.stem, match.suffix === 'sses' || match.suffix === 'ss' ? 'ss' : match.suffix === 'ies' ? 'i' : '');

  // 1b: eed has priority over ed; failed longest matches do not fall through.
  match = yield* ending(word, ['eed', 'ing', 'ed']);
  if (match) {
    const before = yield* shape(match.stem);
    if (match.suffix === 'eed') {
      if (before.measure > 0) word = yield* replace(match.stem, 'ee');
    } else if (before.hasVowel) {
      word = match.stem;
      const restore = yield* ending(word, ['at', 'bl', 'iz']);
      if (restore) word = yield* replace(word, 'e');
      else if (before.doubleConsonant && !'lsz'.includes(word[word.length - 1]!)) {
        yield { workUnits: word.length + 1 }; word = word.slice(0, -1);
      } else if (!before.doubleConsonant && before.measure === 1 && before.cvc) word = yield* replace(word, 'e');
    }
  }

  // 1c: vowel-bearing stems turn terminal y into i.
  match = yield* ending(word, ['y']);
  if (match && (yield* shape(match.stem)).hasVowel) word = yield* replace(match.stem, 'i');

  // 2 and 3: derivational suffix replacement, one longest rule per step.
  match = yield* ending(word, STEP2_SUFFIXES);
  if (match && (yield* shape(match.stem)).measure > 0) word = yield* replace(match.stem, STEP2[match.suffix]!);
  match = yield* ending(word, STEP3_SUFFIXES);
  if (match && (yield* shape(match.stem)).measure > 0) word = yield* replace(match.stem, STEP3[match.suffix]!);

  // 4: remove only beyond measure one; ion additionally needs s or t.
  match = yield* ending(word, STEP4_SUFFIXES);
  if (match && (yield* shape(match.stem)).measure > 1 &&
      (match.suffix !== 'ion' || match.stem.endsWith('s') || match.stem.endsWith('t'))) word = yield* replace(match.stem, '');

  // 5: final e and double l.
  match = yield* ending(word, ['e']);
  if (match) {
    const before = yield* shape(match.stem);
    if (before.measure > 1 || before.measure === 1 && !before.cvc) word = yield* replace(match.stem, '');
  }
  const final = yield* shape(word);
  if (word.endsWith('l') && final.doubleConsonant && final.measure > 1) {
    yield { workUnits: word.length + 1 }; word = word.slice(0, -1);
  }
  return word;
}
