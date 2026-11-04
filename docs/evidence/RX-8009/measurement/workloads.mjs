// Frozen benchmark data and an independent lexical membership oracle. No runtime imports.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const SIZES = Object.freeze([100, 1000, 10000]);
export const FAMILIES = Object.freeze(['real-docs', 'high-cardinality', 'adversarial']);
export const MODEL = Object.freeze({ analyzer: { id: 'basic-v1', environmentProfile: 'unqualified' }, ranking: 'raveldex-bm25-v1', k1: 1.2, b: 0.75, work: 'work-v1' });
export const schema = Object.freeze({ text: { body: {} }, metadata: { group: { type: 'string' } } });
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const sourceBytes = readFileSync(new URL('../../test/fixtures/relevance/corpus.json', import.meta.url));
const SOURCE_SHA256 = 'd750399c6987c9dd6b6d2dd043604dd03bde0b36a71680daec77c8024f9949db';
assert.equal(digest(sourceBytes), SOURCE_SHA256, 'frozen source corpus bytes changed');
const corpus = JSON.parse(sourceBytes);
export const SOURCE = Object.freeze({ path: 'test/fixtures/relevance/corpus.json', sha256: SOURCE_SHA256, logicalHash: corpus.hash, sections: corpus.records.length,
  method: 'Cycle 34 frozen technical-document sections; retain heading plus a whitespace-bounded excerpt at most 512 UTF-16 code units. Repetitions are labeled and are not independent real documents.',
  limits: 'Single English technical self-documentation corpus, repeated excerpts and deterministic synthetic lexical controls; no representative traffic or relevance-quality claim.' });

// This is the specification's token language expressed as a whole-string regex,
// independently of the production generator and scorer. Normalize each raw token,
// never the complete source (normalization may insert token-internal separators).
export function referenceTokens(value) {
  assert.equal(typeof value, 'string');
  return [...value.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)].map(match => match[0].normalize('NFKC').toLowerCase());
}
function excerpt(record) {
  const text = `${record.text.title}\n${record.text.body}`;
  if (text.length <= 512) return text;
  const head = text.slice(0, 512), boundary = head.search(/\s+\S*$/u);
  assert.ok(boundary > 0, 'excerpt has a whitespace boundary');
  return head.slice(0, boundary);
}
const text = value => ({ kind: 'text', text: value, fields: ['body'] });
const prefix = value => ({ kind: 'group', fields: ['body'], variants: [{ text: value, match: 'prefix' }] });
const phrase = value => ({ kind: 'extension', capability: 'phrases', version: 1, payload: { text: value, fields: ['body'] } });
const or = (...children) => ({ kind: 'or', children });
const and = (...children) => ({ kind: 'and', children });
const not = child => ({ kind: 'not', child });
const eq = value => ({ kind: 'eq', field: 'group', value });

function queryDefinitions(family) {
  if (family === 'real-docs') return [
    { id: 'common', kind: 'common', query: text('the'), rule: { term: 'the' } },
    { id: 'rare', kind: 'rare', query: text('unqualified'), rule: { term: 'unqualified' } },
    { id: 'overlapping-or', kind: 'or', query: or(text('revision'), text('source')), rule: { any: ['revision', 'source'] } },
    { id: 'negative-only', kind: 'not', query: not(text('snapshot')), rule: { not: 'snapshot' } },
    { id: 'filtered', kind: 'filter', query: and(text('the'), eq('g0')), rule: { term: 'the', group: 'g0' } },
    { id: 'narrow-prefix', kind: 'prefix', query: prefix('snap'), rule: { prefix: 'snap' } },
    { id: 'broad-prefix', kind: 'prefix', query: prefix('re'), rule: { prefix: 're' } },
    { id: 'source-phrase', kind: 'phrase', requires: 'phrases', query: phrase('source mapping'), rule: { phrase: ['source', 'mapping'] } },
  ];
  return [
    { id: 'common', kind: 'common', query: text('n9common'), rule: { term: 'n9common' } },
    { id: 'rare', kind: 'rare', query: text('n9rare'), rule: { term: 'n9rare' } },
    { id: 'overlapping-or', kind: 'or', query: or(text('n9rare'), text('n9left')), rule: { any: ['n9rare', 'n9left'] } },
    { id: 'negative-only', kind: 'not', query: not(text('n9rare')), rule: { not: 'n9rare' } },
    { id: 'filtered', kind: 'filter', query: and(text('n9common'), eq('g0')), rule: { term: 'n9common', group: 'g0' } },
    { id: 'narrow-prefix', kind: 'prefix', query: prefix('n9key00000'), rule: { prefix: 'n9key00000' } },
    { id: 'broad-prefix-refusal', kind: 'prefix-refusal', query: prefix('n9key'), rule: { prefix: 'n9key' } },
    { id: 'source-phrase', kind: 'phrase', requires: 'phrases', query: phrase('n9red n9blue'), rule: { phrase: ['n9red', 'n9blue'] } },
  ];
}
function matches(record, rule) {
  const values = (Array.isArray(record.text.body) ? record.text.body : [record.text.body]).map(referenceTokens);
  const tokens = values.flat(), terms = new Set(tokens);
  if (rule.group && record.metadata.group !== rule.group) return false;
  if (rule.term) return terms.has(rule.term);
  if (rule.any) return rule.any.some(term => terms.has(term));
  if (rule.not) return !terms.has(rule.not);
  if (rule.prefix) return tokens.some(term => term.startsWith(rule.prefix));
  if (rule.phrase) return values.some(words => words.some((_, index) => rule.phrase.every((term, offset) => words[index + offset] === term)));
  throw Error('unknown fixture judgment rule');
}
function freeze(value) { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }

export function workloadFor(family, size) {
  assert.ok(FAMILIES.includes(family), 'unknown workload family');
  assert.ok(SIZES.includes(size), 'size outside frozen 100/1000/10000 matrix');
  const labels = [], records = [];
  for (let index = 0; index < size; index++) {
    const sourceIndex = index % corpus.records.length, source = corpus.records[sourceIndex], section = corpus.sections[sourceIndex], original = excerpt(source);
    const id = `${family}:${String(index).padStart(5, '0')}`;
    let body = original;
    if (family !== 'real-docs') {
      const key = `n9key${String(index).padStart(6, '0')}`, controls = `n9common ${index % 997 === 7 ? 'n9rare' : ''} ${index % 3 === 0 ? 'n9left' : ''} ${key}a ${key}b ${key}c`;
      const phraseText = index % 3 === 0 ? 'n9red n9blue' : 'n9red n9gap n9blue';
      body = family === 'high-cardinality' ? `${original}\nCatalog ${controls} ${phraseText}` :
        index % 3 === 2 ? [`${controls} n9echo n9echo n9echo n9echo`, 'n9red', 'n9blue'] : `${controls} n9echo n9echo n9echo n9echo ${phraseText}`;
    }
    records.push({ id, text: { body }, metadata: { group: `g${index % 5}` } });
    // Adversarial records contain synthetic text only; a seed-cycle label is not
    // falsely presented as an excerpt actually retained in that record.
    labels.push({ id, sourceId: source.id, sourcePath: source.metadata.sourcePath, sourceUrl: section.sourceUrl,
      repetition: Math.floor(index / corpus.records.length), retainedExcerpt: family !== 'adversarial', excerptSha256: family === 'adversarial' ? null : digest(original) });
  }
  const vocabulary = new Set(records.flatMap(record => (Array.isArray(record.text.body) ? record.text.body : [record.text.body]).flatMap(referenceTokens)));
  const definitions = queryDefinitions(family);
  const queries = definitions.map(({ rule, ...definition }) => {
    const expectedIds = records.filter(record => matches(record, rule)).map(record => record.id);
    const expansions = rule.prefix ? [...vocabulary].filter(term => term.startsWith(rule.prefix)).length : null;
    return { ...definition, expectedIds, ...(expansions !== null ? { expectedExpansions: expansions } : {}),
      ...(expansions > 256 ? { expectedError: { code: 'LIMIT_EXCEEDED', path: 'expansions.group' } } : {}) };
  });
  const identity = { version: 'rx8002-workloads-v1', family, size, model: MODEL, source: SOURCE, schemaSha256: digest(schema),
    corpusSha256: digest(records), labelsSha256: digest(labels), queriesSha256: digest(queries.map(({ expectedIds, expectedError, expectedExpansions, ...query }) => query)),
    judgmentsSha256: digest(queries.map(({ id, expectedIds, expectedError, expectedExpansions }) => ({ id, expectedIds, expectedError: expectedError ?? null, expectedExpansions: expectedExpansions ?? null }))),
    dictionaryTerms: vocabulary.size, judgmentCounts: Object.fromEntries(queries.map(query => [query.id, query.expectedIds.length])) };
  return freeze({ family, size, records, labels, queries, identity });
}

export function verifyFrozen(workload) {
  const frozen = JSON.parse(readFileSync(new URL('../../test/fixtures/n9/freeze.json', import.meta.url)));
  const identity = frozen.workloads.find(row => row.family === workload.family && row.size === workload.size);
  assert.deepEqual(workload.identity, identity, 'frozen corpus/query/judgment identity drift');
  return workload;
}
