import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { executeSearch } from '../../dist/core/query/search.js';
import { FactCollector } from '../../dist/core/trace/facts.js';
import { DirectoryBuilder, directoryEntries, directoryGet } from '../../dist/core/index/directory.js';

const drain = (iterator) => {
  let units = 0, steps = 0;
  for (;;) {
    const step = iterator.next();
    if (step.done) return { value: step.value, units, steps };
    assert.ok(Number.isSafeInteger(step.value.workUnits) && step.value.workUnits > 0);
    units += step.value.workUnits; steps++;
  }
};
const schema = { text: { title: {}, body: { boost: 2 } }, metadata: { tags: { type: 'string', multi: true, nullable: true }, year: { type: 'number', nullable: true }, active: { type: 'boolean' } } };
function build(records, limits, selectedSchema = schema) {
  const construction = new IndexConstruction({ schema: selectedSchema, ...(limits ? { limits } : {}) });
  for (let i = 0; i < records.length; i += 256) drain(construction.append(records.slice(i, i + 256)));
  return drain(construction.finish()).value;
}
const text = (value, fields) => ({ kind: 'text', text: value, ...(fields ? { fields } : {}) });
const group = (variants, fields) => ({ kind: 'group', variants, ...(fields ? { fields } : {}) });
const exact = (value, weight = 1) => ({ text: value, match: 'exact', weight });
const prefix = (value, weight = 1) => ({ text: value, match: 'prefix', weight });
const and = (...children) => ({ kind: 'and', children });
const or = (...children) => ({ kind: 'or', children });
const not = (child) => ({ kind: 'not', child });
const eq = (field, value) => ({ kind: 'eq', field, value });
const fail = (fn, code, path) => assert.throws(fn, (error) => error.code === code && error.message === `Raveldex: ${code}` && (!path || error.details.path === path));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-12, Math.abs(expected) * 1e-12), `${actual} != ${expected}`);
const search = (root, query, options, trace) => drain(executeSearch(root, query, options, trace)).value;
const ids = (value) => value.hits.map((hit) => hit.id);
const records = [
  { id: 'a', text: { title: 'red red car', body: ['red', 'blue'] }, metadata: { tags: ['A', null, 'A'], year: -0, active: true } },
  { id: 'b', text: { title: 'red car', body: 'car' }, metadata: { tags: [], year: null, active: false } },
  { id: 'c', text: { title: 'blue' }, metadata: { tags: ['a'] } },
  { id: 'empty', text: { title: ['!!!', ''] } },
];

function replay(result) {
  const fields = result.trace.facts.filter((fact) => fact.kind === 'field');
  for (const f of fields) {
    close(f.avgLength, f.totalLength / f.N);
    close(f.idf, Math.log(1 + (f.N - f.df + 0.5) / (f.df + 0.5)));
    close(f.normalizer, 1.2 * (1 - 0.75 + 0.75 * f.length / f.avgLength));
    close(f.tfPart, (f.tf * (1.2 + 1)) / (f.tf + f.normalizer));
    close(f.base, f.boost * f.idf * f.tfPart);
    close(f.selected, f.weight * f.base);
  }
  for (const fact of result.trace.facts.filter((fact) => fact.kind === 'group')) {
    close(fact.score, fields.filter((f) => f.id === fact.id && f.group === fact.group).sort((a, b) => a.field < b.field ? -1 : 1).reduce((sum, f) => sum + f.selected, 0));
  }
  for (const fact of result.trace.facts.filter((fact) => fact.kind === 'document')) {
    const groups = result.trace.facts.filter((f) => f.kind === 'group' && f.id === fact.id).sort((a, b) => a.group < b.group ? -1 : 1);
    close(fact.score, groups.reduce((sum, f) => sum + f.score, 0));
    const hit = result.hits.find((hit) => hit.id === fact.id);
    if (hit) assert.equal(fact.score, hit.score);
  }
}

test('hand-derived single-field BM25 and alternative term ties match unrounded arithmetic', () => {
  const root = build(records.map(({ id, text: source }) => ({ id, text: { title: source.title } })), undefined, { text: { title: {} } });
  const result = search(root, 'red car', undefined, { ids: ['a', 'b'] });
  assert.deepEqual(ids(result), ['a', 'b']);
  close(result.hits[0].score, 0.956771409650921);
  close(result.hits[1].score, 0.940007258491471);
  const alternatives = search(root, group([exact('red'), exact('car')]), undefined, { ids: ['a', 'b'] });
  close(alternatives.hits[0].score, 0.566579717446914);
  close(alternatives.hits[1].score, 0.470003629245736);
  assert.equal(alternatives.trace.facts.find((f) => f.kind === 'field' && f.id === 'b').term, 'car');
  const a = result.trace.facts.find((f) => f.kind === 'field' && f.id === 'a' && f.term === 'red');
  assert.deepEqual([a.tf, a.df, a.N, a.length, a.totalLength, a.avgLength, a.k1, a.b], [2, 2, 3, 3, 6, 2, 1.2, 0.75]);
  close(a.normalizer, 1.65); close(a.tfPart, 1.205479452054795);
  replay(result); replay(alternatives);
});

test('field populations, boosts and best weighted term differ by field; filters preserve full-corpus IDF', () => {
  const root = build(records);
  const result = search(root, group([exact('red', .5), exact('car')]), undefined, { ids: ['a', 'b', 'c'] });
  const a = result.trace.facts.filter((f) => f.kind === 'field' && f.id === 'a');
  assert.deepEqual(a.map((f) => [f.field, f.term, f.N, f.totalLength, f.boost]), [['body', 'red', 2, 3, 2], ['title', 'car', 3, 6, 1]]);
  const red = search(root, 'red');
  const filtered = search(root, and(text('red'), eq('active', true)));
  assert.deepEqual(filtered.hits, red.hits.filter((hit) => hit.id === 'a'));
  replay(result);
});

test('positive groups only participate in successful branches; double NOT remains unscored', () => {
  const root = build(records);
  const blue = search(root, text('blue'));
  const failedBranch = search(root, or(and(text('red'), text('absent')), text('blue')), undefined, { ids: ['a', 'c'] });
  assert.deepEqual(failedBranch.hits, blue.hits);
  replay(failedBranch);
  assert.ok(failedBranch.trace.facts.some((f) => f.kind === 'node' && f.node === 'and' && !f.matched && f.groups.length === 0));
  for (const query of [not(text('red')), not(not(text('red'))), eq('tags', 'A'), { kind: 'all' }]) assert.ok(search(root, query).hits.every((hit) => hit.score === 0));
  assert.deepEqual(search(root, and(text('red'), text('RED'), text('red red'))).hits, search(root, 'red').hits);
  assert.deepEqual(search(root, and(text('red'), or(text('red'), text('car')))).hits, search(root, 'red car').hits);
  const allOrRed = search(root, or({ kind: 'all' }, text('red')));
  assert.equal(allOrRed.total, 4);
  assert.deepEqual(allOrRed.hits.filter((hit) => hit.score > 0), search(root, 'red').hits);
});

test('empty analysis, strict equality, missing/null and value/field group boundaries are preserved', () => {
  const root = build(records);
  for (const query of ['', '!!!', text('  ', ['title']), { kind: 'text', text: '😀', operator: 'or' }, { kind: 'none' }]) assert.equal(search(root, query).total, 0);
  assert.deepEqual(ids(search(root, eq('year', null))), ['b']);
  assert.deepEqual(ids(search(root, eq('year', 0))), ['a']);
  assert.deepEqual(ids(search(root, eq('tags', 'a'))), ['c']);
  assert.deepEqual(ids(search(root, eq('tags', null))), ['a']);
  assert.deepEqual(ids(search(root, not(eq('year', null)))), ['a', 'c', 'empty']);
  for (const query of [eq('year', '0'), eq('active', 1), eq('tags', false)]) fail(() => executeSearch(root, query), 'INVALID_QUERY');
  const cross = build([{ id: 'cross', text: { title: ['red'], body: ['car'] } }]);
  assert.equal(search(cross, 'red car').total, 1);
  assert.equal(search(cross, text('red car', ['title'])).total, 0);
  assert.equal(search(cross, group([exact('red'), exact('car')], ['body'])).total, 1);
  const boundaries = build([{ id: 'x', text: { title: ['ab', 'cd'] } }]);
  assert.equal(search(boundaries, 'abcd').total, 0);
});

test('prefix/exact overlap has no multiplicity bonus and normalized output is not retokenized', () => {
  const root = build([{ id: 'x', text: { title: 'red reader reading ½ ﷲ ﬁle', body: 'reader' } }, { id: 'y', text: { title: 'read' } }]);
  const base = search(root, group([prefix('re')]));
  const overlap = search(root, group([prefix('re'), prefix('RE'), exact('red'), exact('reader')]), undefined, { ids: ['x', 'y'] });
  assert.deepEqual(overlap.hits, base.hits);
  for (const raw of ['½', 'ﬁle', 'ﷲ']) assert.equal(search(root, raw).total, 1);
  assert.equal(search(root, '1/2').total, 0);
  assert.equal(search(root, group([prefix('ﬁl')])).total, 1);
  fail(() => search(root, group([prefix('r')])), 'INVALID_QUERY', 'query.prefix');
  fail(() => search(root, group([exact('red car')])), 'INVALID_QUERY', 'query.variants');
  fail(() => search(root, group([exact('!!!')])), 'INVALID_QUERY', 'query.variants');
  replay(overlap);
});

test('expansion caps include fields, deduplicate all query pairs and fail even in unevaluated branches', () => {
  const data = [{ id: 'a', text: { title: 'red reader', body: 'red' } }];
  const accepted = build(data, { maxExpansionsPerGroup: 3, maxQueryExpansions: 3 });
  assert.equal(search(accepted, group([prefix('re'), exact('red')])).total, 1);
  fail(() => search(build(data, { maxExpansionsPerGroup: 2 }), group([prefix('re')])), 'LIMIT_EXCEEDED', 'expansions.group');
  fail(() => search(build(data, { maxQueryExpansions: 2 }), or(text('red'), group([prefix('re')]))), 'LIMIT_EXCEEDED', 'expansions.query');
  const cap1 = build([{ id: 'a', text: { title: 'red' } }], { maxQueryExpansions: 1 });
  assert.equal(search(cap1, or(group([exact('red')]), group([exact('red', .5)]))).total, 1, 'same pair in different canonical groups counts once query-wide');
  const empty = build([], { maxExpansionsPerGroup: 1, maxQueryExpansions: 1 });
  assert.equal(search(empty, group([prefix('zz')])).total, 0);
  const overflow = build(data, { maxExpansionsPerGroup: 1 });
  fail(() => search(overflow, or({ kind: 'all' }, and({ kind: 'none' }, group([prefix('re')])))), 'LIMIT_EXCEEDED');
});

test('UTF-16 score ties and pagination are exact over all candidates and insertion orders', () => {
  const names = [' A ', '1', '01', 'a', 'A', '__proto__', 'constructor', '😀', '𐀀', '\uE000', ...Array.from({ length: 131 }, (_, i) => `id:${i}`)];
  const data = names.map((id) => ({ id, text: { title: 'common' } }));
  const root = build(data), reverse = build([...data].reverse());
  const sorted = [...names].sort();
  for (const query of ['common', { kind: 'all' }]) {
    for (const options of [{ limit: 0 }, { limit: 3 }, { offset: 51, limit: 100 }, { offset: names.length - 2, limit: 2 }, { offset: 9999, limit: 1 }, { offset: 10000 }]) {
      const result = search(root, query, options);
      assert.equal(result.total, names.length);
      const limit = options.limit ?? Math.min(20, 100, 10000 - options.offset);
      assert.deepEqual(ids(result), sorted.slice(options.offset ?? 0, (options.offset ?? 0) + limit));
      assert.deepEqual(search(reverse, query, options), result);
      assert.deepEqual(search(root, query, options), result);
    }
  }
  for (const options of [{ limit: 101 }, { offset: -1 }, { offset: 10000, limit: 1 }, { limit: .5 }]) fail(() => executeSearch(root, 'common', options), options.limit === .5 || options.offset === -1 ? 'INVALID_OPTIONS' : 'LIMIT_EXCEEDED');
});

test('query, page and trace inputs are captured before execution; returned trees are frozen', () => {
  const root = build(records);
  const query = group([exact('red')], ['title']); const options = { limit: 1 }; const trace = { ids: ['a'], maxFacts: 100 };
  const cursor = executeSearch(root, query, options, trace);
  query.fields[0] = 'body'; query.variants[0].text = 'blue'; query.variants.push(exact('car')); options.limit = 0; trace.ids[0] = 'c'; trace.maxFacts = 1;
  const result = drain(cursor).value;
  assert.deepEqual(ids(result), ['a']);
  assert.ok(result.trace.facts.some((f) => f.id === 'a')); assert.ok(!result.trace.facts.some((f) => f.id === 'c'));
  function frozen(value) { if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) frozen(child); } }
  frozen(result); replay(result);
});

test('complete trace reports revision/model/analyzer, off-page predicates and missing documents', () => {
  const root = build(records);
  const query = and(text('red'), eq('active', true));
  const ordinary = search(root, query, { limit: 0 });
  const result = search(root, query, { limit: 0 }, { ids: ['a', 'b', 'empty', 'missing'], expectedRevision: 0 });
  assert.deepEqual({ ...result, trace: undefined }, { ...ordinary, trace: undefined });
  assert.deepEqual([result.trace.revision, result.trace.model, result.trace.analyzer, result.trace.tieBreaker], [0, 'raveldex-bm25-v1', { id: 'basic-v1', environmentProfile: 'unqualified' }, 'utf16-id-ascending']);
  const docs = result.trace.facts.filter((f) => f.kind === 'document');
  assert.deepEqual(docs.map((d) => [d.id, d.exists, d.matched]).sort(), [['a', true, true], ['b', true, false], ['empty', true, false], ['missing', false, false]].sort());
  assert.ok(result.trace.facts.some((f) => f.id === 'b' && f.kind === 'node' && f.node === 'eq' && !f.matched));
  assert.ok(!result.trace.facts.some((f) => f.id === 'b' && f.kind === 'field'));
  replay(result);
  fail(() => search(root, query, undefined, { ids: ['a'], expectedRevision: 1 }), 'REVISION_MISMATCH');
});

test('trace bounds are inclusive and explicit; malformed requests fail without truncation', () => {
  const root = build(records), query = text('red');
  const complete = search(root, query, undefined, { ids: ['a'] });
  const exactBudget = complete.trace.facts.length + 1;
  assert.deepEqual(search(root, query, undefined, { ids: ['a'], maxFacts: exactBudget }), complete);
  fail(() => search(root, query, undefined, { ids: ['a'], maxFacts: exactBudget - 1 }), 'LIMIT_EXCEEDED', 'trace.facts');
  for (const request of [{ ids: ['a', 'a'] }, { ids: [] , maxFacts: 0 }, { ids: ['a'], maxFacts: NaN }, { ids: ['a'], expectedRevision: -1 }, { ids: [''], maxFacts: 1 }, { ids: ['a'], extra: true }]) fail(() => executeSearch(root, query, undefined, request), 'INVALID_OPTIONS');
  fail(() => executeSearch(root, query, undefined, { ids: [], maxFacts: 4097 }), 'LIMIT_EXCEEDED');
  fail(() => search(root, query, undefined, { ids: ['\ud800'] }), 'INVALID_OPTIONS');
  assert.equal(search(root, query).total, 2, 'trace overflow does not change subsequent ordinary search');
  const many = build(Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, text: {} })));
  const largeTree = { kind: 'and', children: Array.from({ length: 127 }, () => ({ kind: 'all' })) };
  assert.equal(search(many, largeTree).total, 40);
  fail(() => search(many, largeTree, { limit: 0 }, { ids: Array.from({ length: 40 }, (_, i) => `d${i}`) }), 'LIMIT_EXCEEDED', 'trace.facts');
});

test('ordinary searches bypass fact recording/finalization and the guarded collector allocation', () => {
  const root = build(records);
  const oldRecord = FactCollector.prototype.record, oldFinish = FactCollector.prototype.finish;
  let calls = 0;
  FactCollector.prototype.record = function (...args) { calls++; return oldRecord.apply(this, args); };
  FactCollector.prototype.finish = function (...args) { calls++; return oldFinish.apply(this, args); };
  try {
    const ordinary = search(root, or(text('red car'), text('blue')));
    assert.ok(!Object.hasOwn(ordinary, 'trace')); assert.equal(calls, 0);
    const traced = search(root, or(text('red car'), text('blue')), undefined, { ids: ['a', 'b'] });
    assert.ok(calls > 0); assert.deepEqual(traced.hits, ordinary.hits);
  } finally { FactCollector.prototype.record = oldRecord; FactCollector.prototype.finish = oldFinish; }
  const source = readFileSync(new URL('../../src/core/query/search.ts', import.meta.url), 'utf8');
  assert.match(source, /const collector = trace \? new FactCollector\(trace.maxFacts\) : undefined/);
});

test('underflow weights retain a deterministic selected term fact without altering zero score', () => {
  const root = build([{ id: 'a', text: { title: 'red car' } }]);
  const result = search(root, group([exact('red', Number.MIN_VALUE), exact('car', Number.MIN_VALUE)]), undefined, { ids: ['a'] });
  assert.equal(result.hits[0].score, 0);
  const fact = result.trace.facts.find((f) => f.kind === 'field');
  assert.equal(fact.term, 'car'); assert.equal(fact.selected, 0); replay(result);
});

test('one work budget spans analysis, expansion, evaluation, scoring and selection; failures leave root usable', () => {
  const root = build(records);
  const query = or(text('red car'), group([prefix('bl')]));
  const baseline = drain(executeSearch(root, query));
  const withBudget = (maximum) => ({ ...root, configuration: { ...root.configuration, limits: { ...root.configuration.limits, maxSearchWorkUnits: maximum, checkpointWorkUnits: 1 } } });
  assert.deepEqual(search(withBudget(baseline.units), query), baseline.value);
  fail(() => search(withBudget(baseline.units - 1), query), 'WORK_LIMIT_EXCEEDED');
  fail(() => search(withBudget(1), query, { limit: 0 }), 'WORK_LIMIT_EXCEEDED');
  fail(() => search(root, and({ kind: 'none' }, text('a\ud800'))), 'INVALID_QUERY');
  for (const limits of [{ maxQueryTokens: 1 }, { maxQueryGroups: 1 }]) fail(() => search(build(records, limits), 'red car'), 'LIMIT_EXCEEDED');
  const abandoned = executeSearch(root, query); abandoned.next(); abandoned.return();
  assert.deepEqual(search(root, query), baseline.value);
});

function directory(entries) { const b = new DirectoryBuilder(); for (const [key, value] of entries) b.set(key, value); return drain(b.seal()).value; }
test('invalid ranking statistics and dangling/corrupt postings fail safely rather than clamping', () => {
  const root = build(records);
  const corrupt = [
    ...[0, Infinity, 2.5, 999].map((documents) => ({ ...root, fields: { ...root.fields, title: { ...root.fields.title, documents } } })),
    ...[0, NaN, .5].map((length) => ({ ...root, fields: { ...root.fields, title: { ...root.fields.title, length } } })),
    { ...root, fields: { ...root.fields, title: { ...root.fields.title, terms: directory([...directoryEntries(root.fields.title.terms)].map(([term, entry]) => [term, term === 'red' ? { ...entry, df: 99 } : entry])) } } },
    { ...root, fields: { ...root.fields, title: { ...root.fields.title, terms: directory([...directoryEntries(root.fields.title.terms)].map(([term, entry]) => [term, term === 'red' ? { ...entry, postings: directory([['missing', 1], ['b', 1]]) } : entry])) } } },
    { ...root, documents: directory([...directoryEntries(root.documents)].map(([id, doc]) => [id, id === 'a' ? { ...doc, fields: { ...doc.fields, title: { ...doc.fields.title, length: 1 } } } : doc])) },
  ];
  for (const changed of corrupt) fail(() => search(changed, text('red', ['title'])), 'INTERNAL_ERROR');
  assert.equal(directoryGet(root.fields.title.terms, 'red').df, 2);
  assert.equal(search(root, 'red').total, 2);
});
