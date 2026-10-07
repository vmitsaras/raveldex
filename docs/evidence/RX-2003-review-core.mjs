import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const repo = resolve(process.argv[2] ?? process.cwd());
const imp = path => import(pathToFileURL(resolve(repo, path)));
const [{ captureConfiguration }, { initializeParticipants }, { emptyRoot, ExecutionOwner }, { createFilters }, { createFacets }, { createSourceProvider }, { createSourcePhrases }, { FakeHost }] = await Promise.all([
  imp('dist/core/contracts/schema.js'), imp('dist/core/capabilities/participants.js'), imp('dist/core/execution/engine.js'), imp('dist/addons/filters/index.js'), imp('dist/addons/facets/index.js'), imp('dist/addons/phrases/source.js'), imp('dist/addons/phrases/index.js'), imp('test/fixtures/execution/host.mjs')
]);
const schema = { text: { title: { boost: 2 }, body: { boost: 1.3 } }, metadata: { amount: { type: 'number', multi: true, nullable: true }, category: { type: 'string', multi: true, nullable: true }, status: { type: 'string', nullable: true }, active: { type: 'boolean', nullable: true } } };
let seed = 941711;
const rnd = n => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % n);
const words = ['alpha', 'beta', 'gamma', 'delta'];
const text = () => Array.from({ length: rnd(5) }, () => words[rnd(4)]).join(' ');
const records = Array.from({ length: 67 }, (_, i) => {
  const metadata = {};
  if (i % 6) metadata.amount = Array.from({ length: rnd(4) }, () => rnd(5) === 0 ? null : rnd(31) - 10);
  if (i % 5) metadata.category = Array.from({ length: rnd(4) }, () => ['', 'x', 'X', 'z', '😀', '\uE000', null][rnd(7)]);
  if (i % 4) metadata.status = ['', 'open', 'closed', null][rnd(4)];
  if (i % 3) metadata.active = [true, false, null][rnd(3)];
  return { id: `d${String(i).padStart(3, '0')}`, text: { title: i % 3 ? text() : [text(), text()], body: text() }, metadata };
});
records.push({ id: 'split', text: { title: ['alpha', 'beta'], body: 'gamma' }, metadata: { amount: [5, 25], category: ['__missing__', null, ''], status: null } });
records.push({ id: 'same', text: { title: 'alpha beta alpha beta', body: 'alpha' }, metadata: { amount: [10, 20], category: ['x', 'x', null], active: false } });
const clone = v => JSON.parse(JSON.stringify(v));
const tokenize = str => str === '' ? [] : str.split(' ');
const scanned = records.map(record => ({ ...record, tokens: Object.fromEntries(Object.entries(record.text).map(([field, input]) => [field, (Array.isArray(input) ? input : [input]).map(tokenize)])) }));
const stats = Object.fromEntries(Object.keys(schema.text).map(field => {
  const counts = scanned.map(record => record.tokens[field].flat());
  return [field, { N: counts.filter(values => values.length).length, total: counts.reduce((n, values) => n + values.length, 0), df: Object.fromEntries(words.map(term => [term, counts.filter(values => values.includes(term)).length])) }];
}));
const group = term => ({ kind: 'text', text: term });
const phrase = text => ({ kind: 'phrase', text, fields: ['title', 'body'] });
const range = payload => ({ kind: 'range', ...payload });
const set = payload => ({ kind: 'set', ...payload });
const native = query => {
  if (['range', 'set', 'phrase'].includes(query.kind)) { const { kind, ...payload } = query; return { kind: 'extension', capability: { range: 'numeric-range', set: 'set-membership', phrase: 'phrases' }[kind], version: 1, payload }; }
  if (query.children) return { ...query, children: query.children.map(native) };
  if (query.child) return { ...query, child: native(query.child) };
  return query;
};
function qualify(record, query) {
  const none = { matched: false, groups: new Set() };
  if (query.kind === 'all') return { matched: true, groups: new Set() };
  if (query.kind === 'none') return none;
  if (query.kind === 'text') {
    const terms = tokenize(query.text), matched = terms.length > 0 && terms.every(term => Object.values(record.tokens).some(values => values.some(tokens => tokens.includes(term))));
    return { matched, groups: matched ? new Set(terms) : new Set() };
  }
  if (query.kind === 'phrase') {
    const terms = tokenize(query.text), matched = terms.length > 0 && query.fields.some(field => record.tokens[field].some(tokens => tokens.some((_, i) => terms.every((term, j) => tokens[i + j] === term))));
    return { matched, groups: matched ? new Set(terms) : new Set() };
  }
  if (query.kind === 'range' || query.kind === 'set' || query.kind === 'eq') {
    if (!Object.hasOwn(record.metadata, query.field)) return none;
    const input = record.metadata[query.field], values = Array.isArray(input) ? input : [input];
    const matched = query.kind === 'set' ? values.some(v => query.values.includes(v)) : query.kind === 'eq' ? values.includes(query.value) : values.some(v => typeof v === 'number' && (!Object.hasOwn(query, 'gt') || v > query.gt) && (!Object.hasOwn(query, 'gte') || v >= query.gte) && (!Object.hasOwn(query, 'lt') || v < query.lt) && (!Object.hasOwn(query, 'lte') || v <= query.lte));
    return { matched, groups: new Set() };
  }
  if (query.kind === 'not') return { matched: !qualify(record, query.child).matched, groups: new Set() };
  const children = query.children.map(child => qualify(record, child));
  const matched = query.kind === 'and' ? children.every(c => c.matched) : children.some(c => c.matched);
  return { matched, groups: matched ? new Set(children.filter(c => c.matched).flatMap(c => [...c.groups])) : new Set() };
}
function score(record, groups) {
  let result = 0;
  for (const term of [...groups].sort()) for (const field of Object.keys(schema.text).sort()) {
    const tokens = record.tokens[field].flat(), tf = tokens.filter(t => t === term).length;
    if (!tf) continue;
    const { N, total, df } = stats[field], length = tokens.length, avg = total / N;
    result += schema.text[field].boost * Math.log(1 + (N - df[term] + 0.5) / (df[term] + 0.5)) * (tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * length / avg)));
  }
  return result;
}
function facets(qualifying, request) {
  return { fields: request.fields.map(({ field, limit = 20, missing = false }) => {
    const map = new Map(), missingKey = Symbol('missing');
    for (const { record } of qualifying) {
      if (!Object.hasOwn(record.metadata, field)) { if (missing) map.set(missingKey, (map.get(missingKey) ?? 0) + 1); continue; }
      const values = record.metadata[field];
      for (const value of new Set(Array.isArray(values) ? values : [values])) map.set(value, (map.get(value) ?? 0) + 1);
    }
    const buckets = [...map].map(([value, count]) => value === missingKey ? { kind: 'missing', count } : { kind: 'value', value, count });
    buckets.sort((a, b) => b.count - a.count || (a.kind !== b.kind ? a.kind === 'missing' ? 1 : -1 : a.kind === 'missing' ? 0 : a.value === b.value ? 0 : a.value === null ? -1 : b.value === null ? 1 : a.value < b.value ? -1 : 1));
    return { field, buckets: buckets.slice(0, limit), distinctValueTotal: buckets.length, omittedBucketCount: Math.max(0, buckets.length - limit) };
  }) };
}
const basic = [{ kind: 'all' }, { kind: 'none' }, group('alpha'), phrase('alpha beta'), phrase('alpha alpha'), range({ field: 'amount', gte: 10, lte: 20 }), range({ field: 'amount', gt: 0, lt: 0 }), set({ field: 'category', values: [null, '', 'x'] }), set({ field: 'status', values: [null] }), set({ field: 'active', values: [false] })];
const queries = [...basic];
for (let i = 0; i < 70; i++) {
  const a = basic[rnd(basic.length)], b = basic[rnd(basic.length)], c = basic[rnd(basic.length)];
  queries.push({ kind: i % 2 ? 'and' : 'or', children: [a, { kind: 'not', child: b }, c] });
}
const requests = [{ fields: [{ field: 'category', missing: true }, { field: 'status', limit: 4, missing: true }] }, { fields: [{ field: 'category', limit: 0, missing: true }] }, { fields: [{ field: 'category', limit: 2 }, { field: 'status', missing: false, limit: 1 }] }];
const pages = [{ offset: 0, limit: 0 }, { offset: 0, limit: 1 }, { offset: 2, limit: 7 }, { offset: 0, limit: 100 }];
const configuration = captureConfiguration({ schema, addons: [createFilters({ fields: Object.keys(schema.metadata) }), createFacets({ fields: ['category', 'status'] }), createSourceProvider({ fields: ['title', 'body'] }), createSourcePhrases({ fields: ['title', 'body'] })] });
const installed = initializeParticipants(configuration), host = new FakeHost();
const engine = new ExecutionOwner(emptyRoot(configuration, installed.states), host, installed.participants);
const call = async (method, ...args) => { const p = engine[method](...args); host.runReady(); return p; };
await call('addMany', records);
let comparisons = 0, scoreAssertions = 0;
for (const query of queries) {
  const qualifying = scanned.map(record => ({ record, ...qualify(record, query) })).filter(entry => entry.matched);
  const hits = qualifying.map(({ record, groups }) => ({ id: record.id, score: score(record, groups) })).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const request of requests) for (const page of pages) {
    const actual = await call('search', native(query), { ...page, extensions: { facets: request } });
    assert.equal(actual.revision, 1); assert.equal(actual.total, hits.length); assert.equal(actual.completeness, 'complete');
    const expected = page.limit ? hits.slice(page.offset, page.offset + page.limit) : [];
    assert.deepEqual(actual.hits.map(hit => hit.id), expected.map(hit => hit.id));
    actual.hits.forEach((hit, i) => { assert.ok(Math.abs(hit.score - expected[i].score) <= 1e-12 * Math.max(1, expected[i].score), `${query.kind} ${hit.id}: ${hit.score} != ${expected[i].score}`); scoreAssertions++; });
    assert.deepEqual(clone(actual.extensions.facets), facets(qualifying, request));
    assert.ok(Object.isFrozen(actual.extensions) && Object.isFrozen(actual.extensions.facets) && Object.isFrozen(actual.extensions.facets.fields));
    for (const field of actual.extensions.facets.fields) { assert.ok(Object.isFrozen(field) && Object.isFrozen(field.buckets)); for (const bucket of field.buckets) assert.ok(Object.isFrozen(bucket)); }
    comparisons++;
  }
}
await engine.dispose();
const output = { repo, comparisons, scoreAssertions, records: records.length, queryCases: queries.length, facetRequests: requests.length, pages: pages.length, optionalSourcePhraseCombinations: true, oracleImportsProductionTokenizerOrScorer: false };
writeFileSync(resolve(process.argv[1]).replace(/\.mjs$/, '.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output));
