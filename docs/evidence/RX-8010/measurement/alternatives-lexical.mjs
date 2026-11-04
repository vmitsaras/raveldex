// RX-8010 development-only adapters. Modules are injected from an isolated,
// pinned installation; no foreign engine enters the native package graph.
import { referenceTokens } from './workloads.mjs';

const unsupported = reason => ({ status: 'Not comparable', reason });
const fieldsSupported = (node, fields) => node.fields === undefined ||
  (Array.isArray(node.fields) && node.fields.length > 0 && new Set(node.fields).size === node.fields.length && node.fields.every(field => fields.includes(field)));

/** Deliberately small translation, independent of fixture expected IDs. */
export function lexicalPlan(definition, fields = ['body']) {
  if (!definition || typeof definition !== 'object') return unsupported('A typed query definition is required.');
  if (definition.expectedError) return unsupported('Native expansion/resource refusal is not a foreign capacity success.');
  const node = definition.query;
  if (!node || typeof node !== 'object') return unsupported('A typed query is required.');
  if (node.kind === 'text' && fieldsSupported(node, fields) && typeof node.text === 'string' &&
      (node.operator === undefined || node.operator === 'and') && Object.keys(node).every(key => ['kind', 'text', 'fields', 'operator'].includes(key))) {
    const terms = referenceTokens(node.text);
    return terms.length ? { kind: 'and', terms } : unsupported('Tokenless query policy is not compared.');
  }
  if (node.kind === 'or' && Array.isArray(node.children) && node.children.length &&
      Object.keys(node).every(key => ['kind', 'children'].includes(key))) {
    const plans = node.children.map(query => lexicalPlan({ query }, fields));
    const selected = node.children[0].fields ?? fields;
    return plans.every((plan, index) => plan.kind === 'and' && plan.terms.length === 1 &&
      JSON.stringify(node.children[index].fields ?? fields) === JSON.stringify(selected))
      ? { kind: 'or', terms: plans.map(plan => plan.terms[0]) }
      : unsupported('Only OR of single exact terms is compared.');
  }
  if (node.kind === 'group' && fieldsSupported(node, fields) && Array.isArray(node.variants) && node.variants.length === 1 &&
      Object.keys(node).every(key => ['kind', 'fields', 'variants'].includes(key))) {
    const variant = node.variants[0];
    if (variant.match === 'prefix' && (variant.weight === undefined || variant.weight === 1) && typeof variant.text === 'string' &&
        Object.keys(variant).every(key => ['text', 'match', 'weight'].includes(key))) {
      const terms = referenceTokens(variant.text);
      if (terms.length === 1) return { kind: 'prefix', terms };
    }
  }
  if (node.kind === 'not' && Object.keys(node).every(key => ['kind', 'child'].includes(key))) {
    const plan = lexicalPlan({ query: node.child }, fields);
    if (plan.kind === 'and' && plan.terms.length === 1) return { kind: 'not', terms: plan.terms };
  }
  return unsupported('Operator, weighting, metadata filter or strict source phrase has no selected equivalent translation.');
}

function documents(records, fields) {
  if (!Array.isArray(records)) throw new TypeError('records must be an array');
  const seen = new Set();
  return records.map(record => {
    if (!record || typeof record.id !== 'string' || seen.has(record.id)) throw new TypeError('Unique string IDs are required.');
    seen.add(record.id);
    const projected = {};
    for (const field of fields) {
      const value = record.text?.[field], values = value === undefined ? [] : typeof value === 'string' ? [value] : value;
      if (!Array.isArray(values) || !values.every(value => typeof value === 'string')) throw new TypeError('text field must be string or string array');
      projected[field] = values.join('\n');
    }
    // Membership-only lexical tracks flatten original values using a token
    // boundary. This does not make cross-value adjacency/offsets comparable.
    return { id: record.id, ...projected };
  });
}

function result(ids, knownIds) {
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !knownIds.has(id)) || new Set(ids).size !== ids.length)
    throw new Error('Foreign engine returned invalid, duplicate or unknown IDs.');
  return { ids, total: ids.length };
}

export const LEXICAL_CONFIGURATION = Object.freeze({
  fields: ['body'], defaultFieldBoost: 1,
  analyzer: 'Whole-source Unicode letter/number token start, letter/number/mark continuation; per-token NFKC then lowercase; no stemming/stopwords/fuzzy.',
  content: 'Original body string or body values joined by newline; metadata is not indexed. Array boundary/phrase/source/offset semantics are Not comparable.',
  output: 'Full engine-ranked ID list; complete total derived from full list. ID extraction/validation and await overhead included; no application eligibility/ranking or truncation.',
  ranking: 'Each library native ranking and tie order retained. Scores/order are not required equal to Raveldex BM25.',
  lifecycle: 'Read-only built index. Atomic mutation, cancellation, worker, persistence and revision semantics are Not comparable.',
  flexsearch: 'One strict-token Index with custom encoder and cache disabled. Prefix is Not comparable in this exact-token configuration; native Resolver handles simple OR.',
});

/** Public foreign APIs only. Caller records package/source hashes separately. */
export async function createLexicalAdapter(engine, injectedModule, records, options = {}) {
  if (!['minisearch', 'flexsearch', 'lunr'].includes(engine)) throw new TypeError(`Unknown lexical engine: ${engine}`);
  const fields = options.fields ?? ['body'], boosts = options.boosts ?? {};
  if (!Array.isArray(fields) || !fields.length || new Set(fields).size !== fields.length || fields.some(field => !['body', 'title'].includes(field))) throw new TypeError('Selected fields must be unique title/body names.');
  if (Object.entries(boosts).some(([field, value]) => !fields.includes(field) || !Number.isFinite(value) || value <= 0)) throw new TypeError('Selected positive finite field boosts required.');
  const docs = documents(records, fields), ids = new Set(docs.map(doc => doc.id));
  const configuration = { ...LEXICAL_CONFIGURATION, fields: [...fields], boosts: Object.fromEntries(fields.map(field => [field, boosts[field] ?? 1])) };
  const module = injectedModule?.default ?? injectedModule;
  let index;
  if (engine === 'minisearch') {
    if (typeof module !== 'function') throw new TypeError('Injected MiniSearch constructor required.');
    index = new module({ fields, storeFields: [], tokenize: referenceTokens, processTerm: term => term });
    index.addAll(docs);
  } else if (engine === 'lunr') {
    if (typeof module !== 'function' || typeof module.Token !== 'function') throw new TypeError('Injected Lunr public API required.');
    index = module(function () {
      this.ref('id'); for (const field of fields) this.field(field, { boost: boosts[field] ?? 1 }); this.pipeline.reset(); this.searchPipeline.reset();
      this.tokenizer = value => referenceTokens(value).map(term => new module.Token(term));
      for (const doc of docs) this.add(doc);
    });
  } else {
    const Index = injectedModule?.Index ?? module?.Index;
    if (typeof Index !== 'function') throw new TypeError('Injected FlexSearch Index constructor required.');
    index = new Index({ tokenize: 'strict', encode: referenceTokens, cache: false, context: false });
    for (const doc of docs) index.add(doc.id, doc.body ?? '');
  }
  let destroyed = false;
  return {
    configuration,
    async search(definition) {
      if (destroyed) throw new Error('Comparator is destroyed.');
      const plan = lexicalPlan(definition, fields);
      if (plan.status) return plan;
      if (engine === 'flexsearch' && (fields.length !== 1 || fields[0] !== 'body' || (boosts.body ?? 1) !== 1))
        return unsupported('Selected strict FlexSearch Index does not implement weighted separate-field relevance configuration.');
      const selectedFields = (plan.kind === 'or' ? definition.query.children[0].fields : plan.kind === 'not' ? definition.query.child.fields : definition.query.fields) ?? fields;
      let found;
      if (engine === 'minisearch') {
        if (plan.kind === 'not') return unsupported('Negative-only universe semantics are not selected for MiniSearch.');
        // Query expression leaves skip a second tokenization pass; normalization
        // has already happened per source token (NFKC can insert separators).
        const options = { fields: selectedFields, boost: boosts, fuzzy: false, prefix: plan.kind === 'prefix', processTerm: term => term, tokenize: value => [value] };
        found = index.search({ combineWith: plan.kind === 'or' ? 'OR' : 'AND', queries: plan.terms }, options).map(hit => hit.id);
      } else if (engine === 'lunr') {
        found = index.query(query => {
          for (const term of plan.terms) query.term(term, { fields: selectedFields, usePipeline: false,
            presence: plan.kind === 'not' ? module.Query.presence.PROHIBITED : plan.kind === 'or' ? module.Query.presence.OPTIONAL : module.Query.presence.REQUIRED,
            wildcard: plan.kind === 'prefix' ? module.Query.wildcard.TRAILING : module.Query.wildcard.NONE });
        }).map(hit => hit.ref);
      } else {
        if (plan.kind === 'prefix' || plan.kind === 'not') return unsupported('Strict FlexSearch configuration has no selected prefix or negative-universe translation.');
        if (plan.kind === 'or') {
          const raw = index.search(definition.query.children[0].text, { resolve: false, suggest: false, limit: Math.max(1, docs.length) });
          if (!raw || typeof raw.or !== 'function') return unsupported('Installed FlexSearch does not expose the selected native OR Resolver.');
          for (const child of definition.query.children.slice(1)) raw.or({ query: child.text, suggest: false });
          found = await raw.resolve({ limit: Math.max(1, docs.length), offset: 0 });
        } else found = await index.search(definition.query.text, { limit: Math.max(1, docs.length), suggest: false, offset: 0 });
      }
      return result(found, ids);
    },
    destroy() { destroyed = true; index = null; docs.length = 0; ids.clear(); },
  };
}
