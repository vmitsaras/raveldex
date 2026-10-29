/**
 * Independent source-scan reference for unicode-osa1-exact-first-v1.
 * Full O(m*n) distance matrices deliberately trade efficiency for clarity.
 * No production analyzer, matcher, dictionary, compiler or scorer is imported.
 */
import { originalSourceTokens, scanSourceCorpus, sourceQueryResult } from './query.mjs';

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

/** Inputs are already normalized terms; distance counts Unicode code points. */
export function unicodeOsaDistance(left, right) {
  const a = [...left], b = [...right];
  const rows = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

/** Preserve a real original spelling so normalized fractions are not re-tokenized. */
export function scanTypoSourceCorpus(records, schema) {
  const corpus = scanSourceCorpus(records, schema);
  const rawSpellings = new Map();
  for (const record of records) {
    for (const field of corpus.names) {
      const raw = record.text[field];
      const values = raw === undefined ? [] : typeof raw === 'string' ? [raw] : raw;
      for (const value of values) {
        for (const token of originalSourceTokens(value)) {
          if (!rawSpellings.has(token.term)) rawSpellings.set(token.term, value.slice(token.start, token.end));
        }
      }
    }
  }
  return { ...corpus, rawSpellings };
}

/** Full live dictionary enumeration; no truncated candidate selection or production limits. */
export function sourceTypoAlternatives(corpus, term, fields = corpus.names) {
  const selected = [...fields].sort(compare);
  if (selected.some(field => !corpus.names.includes(field))) throw new Error('Unknown reference text field');
  const dictionary = new Set();
  for (const document of corpus.documents) {
    for (const field of selected) {
      for (const value of document.fields.get(field).frequencies.keys()) dictionary.add(value);
    }
  }
  if (dictionary.has(term)) return [{ term, distance: 0, weight: 1 }];
  if ([...term].length < 4) return [];
  return [...dictionary].sort(compare)
    .map(value => ({ term: value, distance: unicodeOsaDistance(term, value), weight: 0.5 }))
    .filter(value => value.distance === 1);
}

/** Original analyzed words stay required AND groups, with alternatives inside each group. */
export function sourceTypoQuery(corpus, text, fields = corpus.names) {
  const tokens = originalSourceTokens(text);
  const groups = tokens.map(token => ({
    term: token.term, rawText: text.slice(token.start, token.end), fields: [...fields],
    alternatives: sourceTypoAlternatives(corpus, token.term, fields),
  }));
  const query = groups.length === 0 ? { kind: 'none' } : {
    kind: 'and',
    children: groups.map(group => ({
      kind: 'group', fields: group.fields,
      // An absent original exact variant still preserves original group identity:
      // two different misspellings must not collapse merely because they share
      // the same correction set. Repeated original words still canonicalize.
      variants: [
        { text: group.rawText, match: 'exact', weight: 1 },
        ...group.alternatives.map(alternative => ({
          text: corpus.rawSpellings.get(alternative.term), match: 'exact', weight: alternative.weight,
        })),
      ],
    })),
  };
  return { query, groups };
}

/** Independent membership, deterministic ordering, pagination and weighted BM25. */
export function sourceTypoResult(corpus, text, fields = corpus.names, options = {}) {
  const expanded = sourceTypoQuery(corpus, text, fields);
  return { ...sourceQueryResult(corpus, expanded.query, options), groups: expanded.groups };
}
