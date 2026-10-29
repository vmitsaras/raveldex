/** Independent source-scan reference for dictionary-prefix-df-v1.
 * Uses source regex tokenization, field-local document sets and native full sort.
 * No production analyzer, dictionary, selection routine or search scorer is used. */
import { originalSourceTokens } from './query.mjs';

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function sourceSuggestions(records, schema, request, maximum = 10) {
  const fields = [...(request.fields ?? Object.keys(schema.text))].sort(compare);
  if (!fields.length || new Set(fields).size !== fields.length || fields.some(field => !Object.hasOwn(schema.text, field))) throw Error('Invalid source-reference fields');
  const tokens = originalSourceTokens(request.text);
  if (tokens.length > 1) throw Error('Suggestions require one source token');
  const prefix = tokens[0]?.term ?? '';
  const limit = request.limit ?? Math.min(10, maximum);
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > maximum) throw Error('Invalid source-reference limit');
  if ([...prefix].length < 2) return { policy: 'dictionary-prefix-df-v1', prefix, fields, total: 0, omitted: 0, items: [], dictionaryEntriesVisited: 0 };

  const fieldTerms = new Map(fields.map(field => [field, new Map()]));
  for (const record of records) {
    for (const field of fields) {
      const raw = record.text[field];
      const values = raw === undefined ? [] : typeof raw === 'string' ? [raw] : raw;
      const unique = new Set(values.flatMap(value => originalSourceTokens(value).map(token => token.term)));
      const dictionary = fieldTerms.get(field);
      for (const term of unique) dictionary.set(term, (dictionary.get(term) ?? 0) + 1);
    }
  }
  let dictionaryEntriesVisited = 0;
  const candidates = new Map();
  for (const dictionary of fieldTerms.values()) {
    for (const [term, df] of dictionary) {
      dictionaryEntriesVisited++;
      if (term.startsWith(prefix)) candidates.set(term, (candidates.get(term) ?? 0) + df);
    }
  }
  const complete = [...candidates].map(([term, fieldDocumentFrequency]) => ({ term, fieldDocumentFrequency }))
    .sort((a, b) => b.fieldDocumentFrequency - a.fieldDocumentFrequency || compare(a.term, b.term));
  return { policy: 'dictionary-prefix-df-v1', prefix, fields, total: complete.length,
    omitted: complete.length - Math.min(limit, complete.length), items: complete.slice(0, limit), dictionaryEntriesVisited };
}
