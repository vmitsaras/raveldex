// RX-8010 development-only injected adapters. Never imported by native runtime.
import assert from 'node:assert/strict';
import { referenceTokens } from './workloads.mjs';

const unsupported = reason => ({ status: 'Not comparable', reason });
const fieldsAlign = (node, fields) => !node.fields || (node.fields.length > 0 && node.fields.every(field => fields.includes(field)));
export function otherQuery(engine, definition, fields = ['body']) {
  const raw = definition.query ?? definition;
  const query = typeof raw === 'string' ? { kind: 'text', text: raw } : raw;
  if (definition.expectedError) return unsupported('Native expansion/work refusal is not a foreign engine capability or equivalent capacity contract.');
  if (!fieldsAlign(query, fields)) return unsupported('A requested field is outside the declared isolated schema.');
  if (engine === 'fuse' && query.fields && (query.fields.length !== fields.length || fields.some(field => !query.fields.includes(field)))) return unsupported('Fuse fixed indexed fields cannot silently stand in for query-selected fields.');
  if (engine === 'fuse') return query.kind === 'text'
    ? { term: query.text, track: 'fuzzy' }
    : unsupported('Fuse Bitap fuzzy string matching is a separate track; native operators are not translated.');
  if (engine !== 'orama') throw new TypeError(`Unknown other engine: ${engine}`);
  if (query.kind === 'text' && referenceTokens(query.text).length === 1) return { term: query.text, exact: true, ...(query.fields ? { fields: query.fields } : {}) };
  if (query.kind === 'group' && query.variants.length === 1) {
    const variant = query.variants[0];
    if (variant.match === 'prefix' && (variant.weight ?? 1) === 1 && referenceTokens(variant.text).length === 1)
      return { term: variant.text, exact: false, ...(query.fields ? { fields: query.fields } : {}) };
  }
    return unsupported('No translation for arbitrary Boolean/negative/filter/phrase, weighted alternatives, empty or multi-token AND queries. No application-side emulation.');
}

export async function createOtherAdapter(engine, module, records, options = {}) {
  const fields = options.fields ?? ['body'];
  assert.ok(fields.length > 0 && new Set(fields).size === fields.length && fields.every(field => typeof field === 'string'), 'unique declared fields required');
  assert.ok(Array.isArray(records) && records.length > 0, 'nonempty records required');
  assert.equal(new Set(records.map(record => record.id)).size, records.length, 'unique source IDs required');
  let destroyed = false;
  const documents = records.map(record => {
    assert.equal(typeof record.id, 'string');
    const projected = { id: record.id };
    for (const field of fields) {
      const value = record.text[field];
      const values = value === undefined ? [] : Array.isArray(value) ? [...value] : [value];
      assert.ok(values.every(value => typeof value === 'string'), 'original field values must be strings');
      projected[field] = engine === 'orama' ? values.join('\n') : values;
    }
    return projected;
  });
  let execute;
  let metadata;
  if (engine === 'orama') {
    assert.equal(typeof module.create, 'function'); assert.equal(typeof module.insert, 'function'); assert.equal(typeof module.search, 'function');
    let db = await module.create({ schema: Object.fromEntries(fields.map(field => [field, 'string'])), components: { tokenizer: {
      language: 'english', stemming: false, stopWords: false, normalizationCache: new Map(), tokenize: referenceTokens,
    } } });
    for (const document of documents) await module.insert(db, document);
    execute = async translated => {
      const result = await module.search(db, { ...translated, properties: translated.fields ?? fields, boost: options.boosts ?? Object.fromEntries(fields.map(field => [field, field === 'title' ? 2 : 1])), tolerance: 0, limit: records.length, offset: 0 });
      assert.equal(result.count, result.hits.length, 'complete foreign retrieval required');
      return { ids: result.hits.map(hit => hit.id), total: result.count };
    };
    metadata = { track: 'lexical-membership', analyzer: 'Injected independent referenceTokens: original Unicode token spans, NFKC then lowercase; no stemming/stop words.',
      fields, arrays: 'Original values joined with newline within each field because upstream exact filter ignores string[]; lexical membership only, no phrase/value-boundary equivalence.',
      matching: 'Single-token exact/prefix only; tolerance0. Orama3.1.18 exact adds case-sensitive original-string word filter; every row requires complete membership validation, Unicode/case differences are Not comparable.',
      ranking: 'Foreign native relevance/order, not Raveldex BM25/score/tie equivalence.',
      output: 'Complete foreign hits include retained source documents/scores; adapter maps IDs and checks count. No equivalent output-cost claim.',
      retainedSource: 'Orama document store retains original selected field values with newline-joined array values; no cross-value phrase contract.', updates: 'Not comparable: no atomic native revision/sidecar/cancellation contract.' };
    const release = () => { db = null; };
    return Object.freeze({ metadata, async search(definition) {
      if (destroyed) throw new Error('comparison adapter destroyed');
      const translated = otherQuery(engine, definition, fields); return translated.status ? translated : execute(translated);
    }, destroy() { if (!destroyed) { destroyed = true; release(); } } });
  }
  if (engine === 'fuse') {
    const Fuse = module.default ?? module;
    assert.equal(typeof Fuse, 'function');
    let fuse = new Fuse(documents, { keys: fields.map(field => ({ name: field, weight: options.boosts?.[field] ?? (field === 'title' ? 2 : 1) })), threshold: 0.3, ignoreLocation: true, includeScore: true,
      includeMatches: false, isCaseSensitive: false, ignoreDiacritics: false, useExtendedSearch: false, shouldSort: true });
    metadata = { track: 'fuzzy', comparability: 'Not comparable', fields,
      matching: 'Fuse native Bitap fuzzy string/substring matching; threshold0.3, ignoreLocation true. Not token edit distance or native exact/prefix.',
      ranking: 'Fuse native fuzzy/key/field normalization score/order; not Raveldex BM25.',
      output: 'Complete fuzzy hits include retained item/score; mapped IDs/count, not lexical-total equivalence.',
      retainedSource: 'Original selected field values retained as string arrays by Fuse.', updates: 'Not comparable: no native transactional revisions/cancellation.' };
    return Object.freeze({ metadata, async search(definition) {
      if (destroyed) throw new Error('comparison adapter destroyed');
      const translated = otherQuery(engine, definition, fields); if (translated.status) return translated;
      const hits = fuse.search(translated.term);
      return { ids: hits.map(hit => hit.item.id), total: hits.length, track: 'fuzzy', comparability: 'Not comparable',
        reason: metadata.matching, scores: hits.map(hit => hit.score) };
    }, destroy() { if (!destroyed) { destroyed = true; fuse = null; } } });
  }
  throw new TypeError(`Unknown other engine: ${engine}`);
}
