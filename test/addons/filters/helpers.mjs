import assert from 'node:assert/strict';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { initializeParticipants } from '../../../dist/core/capabilities/participants.js';
import { emptyRoot, ExecutionOwner } from '../../../dist/core/execution/engine.js';
import { createFilters } from '../../../dist/addons/filters/index.js';
import { FakeHost } from '../../fixtures/execution/host.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../../oracle/phrases.mjs';

export const schema = {
  text: { title: { boost: 2 }, body: {} },
  metadata: {
    price: { type: 'number', multi: true, nullable: true },
    quality: { type: 'number' },
    tags: { type: 'string', multi: true, nullable: true },
    status: { type: 'string' },
    active: { type: 'boolean', multi: true, nullable: true },
    disabled: { type: 'string' },
  },
};
export const fields = ['price', 'quality', 'tags', 'status', 'active'];
export const range = payload => ({ kind: 'range', ...payload });
export const set = payload => ({ kind: 'set', ...payload });
export const records = [
  { id: 'a', text: { title: 'alpha beta', body: 'beta alpha' }, metadata: { price: [5, 25], quality: 0, tags: ['red', 'red', null], status: '', active: [false, null] } },
  { id: 'b', text: { title: 'alpha', body: ['alpha beta', 'gamma'] }, metadata: { price: [10, 20], quality: 10, tags: ['blue', 'red'], status: 'open', active: [true] } },
  { id: 'c', text: { title: 'beta', body: 'alpha alpha gamma' }, metadata: { price: [15, null], quality: 20, tags: [null], status: 'closed', active: [false] } },
  { id: 'd', text: { title: 'gamma', body: ['alpha', 'beta'] }, metadata: { price: [], tags: [], active: [] } },
  { id: 'e', text: { title: 'beta alpha beta', body: '' }, metadata: { price: [null], tags: [null], active: [null] } },
  { id: 'f', text: { title: 'alpha beta beta', body: 'gamma' } },
  { id: 'g', text: {}, metadata: { price: [-1, 0], quality: -0, tags: ['10', 'é', '😀'], status: '10', active: [false, true] } },
  { id: 'h', text: { title: 'alpha alpha', body: 'beta' }, metadata: { price: [10.5], quality: 1.5, tags: ['Red'], status: 'open', active: [true] } },
];

export function nativeQuery(query) {
  if (typeof query === 'string') return { kind: 'text', text: query };
  if (query.kind === 'range' || query.kind === 'set') {
    const { kind, ...payload } = query;
    return { kind: 'extension', capability: kind === 'range' ? 'numeric-range' : 'set-membership', version: 1, payload };
  }
  if (query.kind === 'phrase') {
    const { kind, ...payload } = query;
    return { kind: 'extension', capability: 'phrases', version: 1, payload };
  }
  if (query.kind === 'and' || query.kind === 'or') return { ...query, children: query.children.map(nativeQuery) };
  if (query.kind === 'not') return { ...query, child: nativeQuery(query.child) };
  return query;
}

export function setup(options = {}) {
  const host = new FakeHost();
  const configuration = captureConfiguration({ schema, addons: [createFilters({ fields })], ...options });
  const installed = initializeParticipants(configuration);
  const engine = new ExecutionOwner(emptyRoot(configuration, installed.states), host, installed.participants);
  return { engine, host, configuration, async call(method, ...args) { const promise = engine[method](...args); host.runReady(); return promise; } };
}

/** Independent source scan: filtering never imports production predicates,
 * analyzer, compiler, or scorer; full-corpus BM25 statistics remain intact. */
function scanFilter(metadata, query) {
  if (!Object.hasOwn(metadata, query.field)) return false;
  const stored = metadata[query.field];
  const values = Array.isArray(stored) ? stored : [stored];
  if (query.kind === 'set') return values.some(value => query.values.some(wanted => value === wanted));
  return values.some(value => typeof value === 'number'
    && (!Object.hasOwn(query, 'gt') || value > query.gt)
    && (!Object.hasOwn(query, 'gte') || value >= query.gte)
    && (!Object.hasOwn(query, 'lt') || value < query.lt)
    && (!Object.hasOwn(query, 'lte') || value <= query.lte));
}
function lowerFilters(query, metadata) {
  if (typeof query === 'string') return query;
  if (query.kind === 'range' || query.kind === 'set') return { kind: scanFilter(metadata, query) ? 'all' : 'none' };
  if (query.kind === 'and' || query.kind === 'or') return { ...query, children: query.children.map(child => lowerFilters(child, metadata)) };
  if (query.kind === 'not') return { ...query, child: lowerFilters(query.child, metadata) };
  return query;
}
export function scanFilterResult(inputs, query, options = {}, selectedSchema = schema) {
  const corpus = scanPhraseSourceCorpus(inputs, selectedSchema), hits = [];
  for (const document of corpus.documents) {
    const lowered = lowerFilters(query, document.metadata);
    const result = sourcePhraseQueryResult({ ...corpus, documents: [document] }, lowered, { limit: 1 });
    if (result.total) hits.push(result.hits[0]);
  }
  hits.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const offset = options.offset ?? 0, limit = options.limit ?? 20;
  return { total: hits.length, hits: hits.slice(offset, offset + limit) };
}
export function compare(actual, expected, revision) {
  assert.equal(actual.revision, revision);
  assert.equal(actual.completeness, 'complete'); assert.equal(actual.model, 'raveldex-bm25-v1');
  assert.equal(actual.total, expected.total);
  assert.deepEqual(actual.hits.map(({ id }) => id), expected.hits.map(({ id }) => id));
  for (let index = 0; index < actual.hits.length; index++) {
    assert.ok(Math.abs(actual.hits[index].score - expected.hits[index].score) <= Math.max(1e-12, Math.abs(expected.hits[index].score) * 1e-12));
  }
}
