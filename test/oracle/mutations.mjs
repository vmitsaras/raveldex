import { scanSourceCorpus } from './query.mjs';

const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sorted = (entries) => [...entries].sort(([left], [right]) => compare(left, right));

/** Independent policy model over authoritative original fixture records. */
export function sourceMutation(records, revision, operation) {
  const live = new Map(records.map((record) => [record.id, record]));
  const result = { revision, changed: false, added: 0, replaced: 0, removed: 0 };
  const fail = (error) => ({ records, result, error });
  switch (operation.kind) {
    case 'add':
      if (live.has(operation.input.id)) return fail('ID_EXISTS');
      live.set(operation.input.id, operation.input);
      result.added = 1;
      break;
    case 'addMany': {
      const batch = operation.input;
      if (new Set(batch.map(({ id }) => id)).size !== batch.length) return fail('INVALID_RECORD');
      if (batch.some(({ id }) => live.has(id))) return fail('ID_EXISTS');
      for (const record of batch) live.set(record.id, record);
      result.added = batch.length;
      break;
    }
    case 'replace':
      if (!live.has(operation.input.id)) return fail('ID_NOT_FOUND');
      live.set(operation.input.id, operation.input);
      result.replaced = 1;
      break;
    case 'remove': {
      const ids = typeof operation.input === 'string' ? [operation.input] : operation.input;
      if (new Set(ids).size !== ids.length) return fail('INVALID_OPTIONS');
      for (const id of ids) if (live.delete(id)) result.removed++;
      break;
    }
    case 'clear': result.removed = live.size; live.clear(); break;
    default: throw new Error('Unsupported fixture mutation');
  }
  result.changed = result.added + result.replaced + result.removed > 0;
  if (result.changed) result.revision++;
  return { records: [...live.values()], result };
}

function metadataEntries(metadata = {}) {
  return sorted(Object.entries(metadata)).map(([name, value]) => {
    const normalizeNumber = (item) => typeof item === 'number' && item === 0 ? 0 : item;
    return [name, Array.isArray(value) ? [...new Set(value.map(normalizeNumber))] : normalizeNumber(value)];
  });
}

/** Full dictionary/postings/reverse/statistics reconstruction from source only. */
export function reconstructSourceState(records, schema, revision) {
  const corpus = scanSourceCorpus(records, schema);
  const originals = new Map(records.map((record) => [record.id, record]));
  const counts = { documents: records.length, textCodeUnits: 0, tokens: 0, dictionaryEntries: 0, postingEntries: 0 };
  const documents = sorted(corpus.documents.map((document) => {
    const original = originals.get(document.id);
    const textCodeUnits = Object.values(original.text).reduce((sum, value) =>
      sum + (typeof value === 'string' ? value.length : value.reduce((length, item) => length + item.length, 0)), 0);
    counts.textCodeUnits += textCodeUnits;
    const fields = sorted([...document.fields].filter(([, field]) => field.length > 0)).map(([name, field]) => {
      counts.tokens += field.length;
      return [name, { length: field.length, terms: sorted(field.frequencies) }];
    });
    return [document.id, { id: document.id, textCodeUnits, metadata: metadataEntries(original.metadata), fields }];
  }));
  const fields = corpus.names.map((name) => {
    const statistics = corpus.statistics.get(name);
    const terms = sorted(statistics.documentFrequencies).map(([term, df]) => {
      const postings = sorted(corpus.documents.flatMap((document) => {
        const tf = document.fields.get(name).frequencies.get(term);
        return tf ? [[document.id, tf]] : [];
      }));
      counts.dictionaryEntries++;
      counts.postingEntries += postings.length;
      return [term, { df, frequency: postings.reduce((sum, [, tf]) => sum + tf, 0), postings }];
    });
    return [name, { documents: statistics.population, length: statistics.totalLength, terms }];
  });
  return { revision, counts, documents, fields };
}
