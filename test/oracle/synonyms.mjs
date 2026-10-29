/**
 * Independent source-scan directional-one-step-v1 reference.
 * No production analyzer, mapping, dictionary, compiler or scorer is imported.
 * Full source scans and the independent Boolean/BM25 oracle favor clarity.
 */
import { originalSourceTokens, scanSourceCorpus, sourceQueryResult } from './query.mjs';

const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

/** Build an authored one-hop relation, never a transitive closure. */
export function sourceSynonymMappings(mappings) {
  const relation = new Map();
  for (const { from, to } of mappings) {
    const inputs = originalSourceTokens(from), outputs = originalSourceTokens(to);
    if (inputs.length !== 1 || outputs.length !== 1) throw new Error('Reference mappings require one original source token per endpoint');
    const source = inputs[0].term, target = outputs[0].term;
    if (source === target) continue;
    const alternatives = relation.get(source) ?? new Set();
    alternatives.add(target); relation.set(source, alternatives);
  }
  return relation;
}

/** Preserve original spellings for normalized terms that contain separators. */
export function scanSynonymSourceCorpus(records, schema) {
  const corpus = scanSourceCorpus(records, schema), rawSpellings = new Map();
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

/** Only exact original and direct configured targets in selected live fields. */
export function sourceSynonymAlternatives(corpus, relation, term, fields = corpus.names) {
  const dictionary = new Set();
  for (const document of corpus.documents) {
    for (const field of fields) {
      if (!corpus.names.includes(field)) throw new Error('Unknown reference text field');
      for (const word of document.fields.get(field).frequencies.keys()) dictionary.add(word);
    }
  }
  const weighted = new Map();
  if (dictionary.has(term)) weighted.set(term, 1);
  for (const target of relation.get(term) ?? []) if (dictionary.has(target)) weighted.set(target, 0.5);
  return [...weighted].sort(([a], [b]) => compare(a, b)).map(([value, weight]) => ({ term: value, match: 'exact', weight }));
}

/** Each original analyzed token creates one required group; alternatives are OR. */
export function sourceSynonymQuery(corpus, mappings, text, fields = corpus.names) {
  const relation = sourceSynonymMappings(mappings);
  const groups = originalSourceTokens(text).map(token => ({
    term: token.term, rawText: text.slice(token.start, token.end), fields: [...fields],
    alternatives: sourceSynonymAlternatives(corpus, relation, token.term, fields),
  }));
  return { groups, query: groups.length === 0 ? { kind: 'none' } : {
    kind: 'and', children: groups.map(group => ({
      kind: 'group', fields: group.fields,
      variants: [
        // Preserve different original groups even when both map to the same target.
        { text: group.rawText, match: 'exact', weight: 1 },
        ...group.alternatives.map(alternative => ({
          text: corpus.rawSpellings.get(alternative.term), match: 'exact', weight: alternative.weight,
        })),
      ],
    })),
  } };
}

export function sourceSynonymResult(corpus, mappings, text, fields = corpus.names, options = {}) {
  const expanded = sourceSynonymQuery(corpus, mappings, text, fields);
  return { ...sourceQueryResult(corpus, expanded.query, options), groups: expanded.groups };
}
