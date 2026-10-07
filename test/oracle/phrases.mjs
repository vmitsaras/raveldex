/**
 * Independent strict-phrase reference for admitted basic-v1 source fixtures.
 * No production analyzer, query compiler, evaluator, or scorer is imported.
 * Native Boolean participation and BM25 use the existing independent source
 * query reference; phrase adjacency is established separately for each value.
 */
import { originalSourceTokens, scanSourceCorpus, sourceQueryResult } from './query.mjs';

export const SOURCE_PHRASE_MAX_TOKENS = 32;
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function phraseTerms(text) {
  const terms = originalSourceTokens(text).map(({ term }) => term);
  if (terms.length > SOURCE_PHRASE_MAX_TOKENS) {
    throw new RangeError('Reference phrase exceeds 32 original analyzed tokens');
  }
  return terms;
}

/** Empty phrases never match. Repeated terms require separate occurrences. */
export function strictSourceAdjacency(valueTokens, requiredTerms) {
  if (requiredTerms.length === 0) return false;
  for (let start = 0; start + requiredTerms.length <= valueTokens.length; start += 1) {
    let matches = true;
    for (let offset = 0; offset < requiredTerms.length; offset += 1) {
      if (valueTokens[start + offset].term !== requiredTerms[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

/**
 * Scan original values independently, preserving array-value boundaries.
 * The returned corpus extends scanSourceCorpus's frequency/statistics model
 * with a sourceValues Map keyed by document ID, then field name. Each field
 * contains one token array per original value, including empty arrays.
 */
export function scanPhraseSourceCorpus(records, schema) {
  const corpus = scanSourceCorpus(records, schema);
  const sourceValues = new Map();
  for (const record of records) {
    const fields = new Map();
    for (const field of corpus.names) {
      const raw = Object.hasOwn(record.text, field) ? record.text[field] : undefined;
      const values = raw === undefined ? [] : typeof raw === 'string' ? [raw] : raw;
      fields.set(field, values.map(originalSourceTokens));
    }
    sourceValues.set(record.id, fields);
  }
  return { ...corpus, sourceValues };
}

function selectedFields(corpus, fields) {
  const selected = fields ?? corpus.names;
  for (const field of selected) {
    if (!corpus.names.includes(field)) throw new Error('Reference fixture selects an undeclared text field');
  }
  return selected;
}

function phraseMatches(corpus, document, requiredTerms, fields) {
  const source = corpus.sourceValues.get(document.id);
  if (!source) throw new Error('Reference corpus has no source for its document');
  return fields.some((field) => source.get(field).some((tokens) => strictSourceAdjacency(tokens, requiredTerms)));
}

/** Complete adjacency membership in input-document order, without pagination. */
export function sourcePhraseIds(records, schema, text, fields) {
  const corpus = scanPhraseSourceCorpus(records, schema);
  const requiredTerms = phraseTerms(text);
  const selected = selectedFields(corpus, fields);
  return corpus.documents
    .filter((document) => phraseMatches(corpus, document, requiredTerms, selected))
    .map(({ id }) => id);
}

/**
 * Complete lexical candidate superset in input-document order. Each required
 * term may occur in a different selected field or value. Adjacent repetitions
 * are deliberately not established here; that is strict verification's job.
 */
export function sourcePhraseCandidateIds(records, schema, text, fields) {
  const corpus = scanPhraseSourceCorpus(records, schema);
  const requiredTerms = phraseTerms(text);
  const selected = selectedFields(corpus, fields);
  if (requiredTerms.length === 0) return [];
  return corpus.documents.filter((document) => requiredTerms.every((term) => selected.some((field) =>
    document.fields.get(field).frequencies.has(term)))).map(({ id }) => id);
}

function preparePhraseLeaves(rawQuery, corpus) {
  if (typeof rawQuery === 'string') return rawQuery;
  switch (rawQuery.kind) {
    case 'phrase': return {
      kind: 'reference-phrase',
      text: rawQuery.text,
      fields: selectedFields(corpus, rawQuery.fields),
      terms: phraseTerms(rawQuery.text),
    };
    case 'and': case 'or': return {
      kind: rawQuery.kind,
      children: rawQuery.children.map((child) => preparePhraseLeaves(child, corpus)),
    };
    case 'not': return { kind: 'not', child: preparePhraseLeaves(rawQuery.child, corpus) };
    case 'text': case 'group': case 'eq': case 'all': case 'none': return rawQuery;
    default: throw new Error('Reference phrase fixtures contain an unsupported query node');
  }
}

function lowerForDocument(query, document, corpus) {
  if (typeof query === 'string') return query;
  switch (query.kind) {
    case 'reference-phrase': return phraseMatches(corpus, document, query.terms, query.fields)
      ? { kind: 'text', text: query.text, fields: query.fields }
      : { kind: 'none' };
    case 'and': case 'or': return {
      kind: query.kind,
      children: query.children.map((child) => lowerForDocument(child, document, corpus)),
    };
    case 'not': return { kind: 'not', child: lowerForDocument(query.child, document, corpus) };
    default: return query;
  }
}

/**
 * Test-only phrase leaf: { kind: 'phrase', text, fields? }. Other leaves follow
 * the native query fixture shape. Tests map the phrase leaf to their actual
 * public extension envelope, keeping this oracle independent of that API.
 *
 * Returns complete total/participation plus score-sorted paginated hits, like
 * sourceQueryResult. Every successful phrase supplies only its ordinary raw
 * lexical groups. Full-corpus statistics survive per-document leaf lowering.
 */
export function sourcePhraseQueryResult(corpus, rawQuery, options = {}) {
  const query = preparePhraseLeaves(rawQuery, corpus);
  const hits = [];
  const participation = new Map();
  for (const document of corpus.documents) {
    const nativeQuery = lowerForDocument(query, document, corpus);
    const result = sourceQueryResult({ ...corpus, documents: [document] }, nativeQuery, { limit: 1 });
    if (result.total === 0) continue;
    hits.push(result.hits[0]);
    participation.set(document.id, result.participation.get(document.id));
  }
  hits.sort((left, right) => right.score - left.score || compare(left.id, right.id));
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 20;
  return { total: hits.length, hits: hits.slice(offset, offset + limit), participation };
}
