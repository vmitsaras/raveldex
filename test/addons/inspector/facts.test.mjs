import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createInspector } from '../../../dist/addons/inspector/index.js';
import { createSourceProvider } from '../../../dist/addons/phrases/source.js';
import { createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createFilters } from '../../../dist/addons/filters/index.js';
import { FactCollector } from '../../../dist/core/trace/facts.js';
import { close, coreResult, data, frozen, publicEngine, records, replay, request, schema, plain } from './helpers.mjs';

const text = value => ({ kind: 'text', text: value });
const and = (...children) => ({ kind: 'and', children });
const or = (...children) => ({ kind: 'or', children });
const not = child => ({ kind: 'not', child });
const eq = (field, value) => ({ kind: 'eq', field, value });
const alternative = (text, weight = 1, match = 'exact') => ({ text, weight, match });
const group = (...variants) => ({ kind: 'group', variants });
const range = bounds => ({ kind: 'extension', capability: 'numeric-range', version: 1, payload: { field: 'price', ...bounds } });
const phrase = value => ({ kind: 'extension', capability: 'phrases', version: 1, payload: { text: value, fields: ['title'] } });

/** Literal fixtures below carry independent lengths/tfs/dfs; no production
 * tokenizer, compiler, evaluator, or scorer supplies expected arithmetic. */
test('public selected contributions reconstruct hand BM25, per-field winners and full-corpus filter statistics', async t => {
  const engine = publicEngine({ schema: { text: { title: {} } } });
  await engine.addMany(records.map(record => ({ id: record.id, text: { title: record.text.title ?? '' } })));
  let assertions = 0;
  const full = await engine.search('red car', request(['a', 'b', 'c', 'missing']));
  close(full.hits[0].score, .956771409650921); close(full.hits[1].score, .940007258491471); assertions += 2;
  assert.deepEqual(full.hits.map(hit => hit.id), ['a', 'b']);
  for (const fact of data(full).trace.facts.filter(fact => fact.kind === 'field')) {
    const tf = fact.id === 'a' && fact.term === 'red' ? 2 : 1;
    const length = fact.id === 'a' ? 3 : 2;
    assert.deepEqual([fact.tf, fact.df, fact.N, fact.length, fact.totalLength, fact.avgLength, fact.boost], [tf, 2, 3, length, 6, 2, 1]);
    const normalizer = fact.id === 'a' ? 1.65 : 1.2;
    const expected = Math.log(1.6) * tf * 2.2 / (tf + normalizer);
    close(fact.normalizer, normalizer); close(fact.base, expected); assertions += 2;
  }
  assertions += replay(data(full), full);
  const selected = await engine.search(group(alternative('red'), alternative('car')), request(['a', 'b']));
  assert.deepEqual(data(selected).trace.facts.filter(fact => fact.kind === 'field').map(fact => [fact.id, fact.term]), [['a', 'red'], ['b', 'car']]);
  close(selected.hits[0].score, .566579717446914); close(selected.hits[1].score, .470003629245736); assertions += 2 + replay(data(selected), selected);
  await engine.dispose();
  const multiple = publicEngine({ addons: [createInspector(), createFilters({ fields: ['price'] })] });
  await multiple.addMany(records);
  const weighted = await multiple.search(group(alternative('red', .5), alternative('car')), request(['a', 'b']));
  const winners = data(weighted).trace.facts.filter(fact => fact.kind === 'field' && fact.id === 'a');
  assert.deepEqual(winners.map(f => [f.field, f.term, f.N, f.totalLength, f.boost]), [['body', 'red', 2, 3, 2], ['title', 'car', 3, 6, 1]]);
  assertions += replay(data(weighted), weighted);
  const red = await multiple.search('red', request(['a']));
  const filtered = await multiple.search(and(text('red'), range({ lt: 10 })), request(['a']));
  assert.deepEqual(filtered.hits, red.hits.filter(hit => hit.id === 'a'));
  assert.deepEqual(data(filtered).trace.facts.filter(f => f.kind === 'field'), data(red).trace.facts.filter(f => f.kind === 'field'));
  assertions += replay(data(filtered), filtered);
  assert.deepEqual(plain(data(filtered).numericalTolerance), { absolute: 1e-12, relative: 1e-12 });
  t.diagnostic(JSON.stringify({ handNumericAssertions: assertions }));
  await multiple.dispose();
});

test('literal Boolean/filter/phrase outcomes and selected paths distinguish excluded, off-page and absent records', async t => {
  const engine = publicEngine({ addons: [createInspector(), createFilters({ fields: ['price'] }), createSourceProvider({ fields: ['title'] }), createSourcePhrases({ fields: ['title'] })] });
  await engine.addMany(records);
  const cases = [
    [or(and(text('red'), text('absent')), text('blue')), ['a', 'c']],
    [not(text('red')), ['c', 'empty']],
    [not(not(text('red'))), ['a', 'b']],
    [eq('active', true), ['a']],
    [range({ gte: 10, lte: 20 }), ['b']],
    [not(range({ gte: 10, lte: 20 })), ['a', 'c', 'empty']],
    [phrase('red car'), ['a', 'b']],
    [phrase('car red'), []],
    [or(phrase('car red'), text('blue')), ['a', 'c']],
    [and(phrase('red car'), range({ lt: 10 })), ['a']],
    [{ kind: 'all' }, ['a', 'b', 'c', 'empty']],
    [{ kind: 'none' }, []],
  ];
  let completeComparisons = 0, arithmeticAssertions = 0;
  for (const [query, eligible] of cases) for (const page of [{ limit: 0 }, { limit: 1 }, { offset: 1, limit: 2 }]) {
    const ordinary = await engine.search(query, page);
    const explained = await engine.search(query, { ...page, ...request() });
    assert.deepEqual(coreResult(explained), ordinary); completeComparisons++;
    assert.equal(explained.total, eligible.length);
    const inspected = data(explained);
    assert.deepEqual(inspected.documents.map(document => document.id), ['a', 'b', 'c', 'empty', 'missing']);
    for (const document of inspected.documents) {
      const exists = document.id !== 'missing', matched = eligible.includes(document.id);
      assert.equal(document.exists, exists);
      assert.equal(document.eligibility, !exists ? 'absent' : matched ? 'matched' : 'excluded');
      const index = explained.hits.findIndex(hit => hit.id === document.id);
      assert.deepEqual(plain(document.page), { placement: !exists ? 'absent' : !matched ? 'excluded' : index === -1 ? 'outside-page' : 'returned', index: index === -1 ? null : index });
      assert.deepEqual(plain(document.absoluteRank), { status: 'unavailable', reason: 'not-collected' });
      assert.deepEqual(plain(document.source), { status: 'not-requested' });
      if (!exists) assert.equal(document.score, null);
      else { const fact = inspected.trace.facts.find(f => f.kind === 'document' && f.id === document.id); assert.equal(document.score, fact.score); assert.deepEqual(document.groups, fact.groups); }
    }
    arithmeticAssertions += replay(inspected, explained);
    assert.equal(inspected.trace.revision, explained.revision); assert.equal(inspected.trace.model, explained.model);
    assert.deepEqual(plain(inspected.query.fullAlternatives), { status: 'unavailable', reason: 'not-collected' });
    assert.deepEqual(plain(inspected.resources.heapBytes), { status: 'unavailable', reason: 'not-measured' });
    assert.equal(inspected.resources.outcome, 'complete'); assert.equal(inspected.resources.unit, 'work-v1');
    assert.ok(inspected.resources.searchWorkUnits > 0); assert.ok(inspected.resources.searchWorkUnits <= inspected.resources.maxSearchWorkUnits);
    frozen(explained);
  }
  const failedBranch = data(await engine.search(cases[0][0], request(['a']))).trace.facts;
  const failedAnd = failedBranch.find(f => f.kind === 'node' && f.path === 'query.children[0]');
  assert.equal(failedAnd.matched, false); assert.deepEqual(failedAnd.groups, []);
  assert.ok(failedBranch.filter(f => f.kind === 'field').every(f => f.term === 'blue'));
  const filtered = data(await engine.search(range({ gte: 10, lte: 20 }), request(['a', 'b']))).trace.facts;
  assert.deepEqual(filtered.filter(f => f.kind === 'node' && f.node === 'predicate').map(f => [f.id, f.capability, f.matched]), [['a', 'numeric-range', false], ['b', 'numeric-range', true]]);
  const phrased = data(await engine.search(phrase('car red'), request(['a']))).trace.facts;
  assert.ok(phrased.some(f => f.kind === 'node' && f.node === 'extension' && f.capability === 'phrases' && f.matched === false));
  const negated = data(await engine.search(not(not(text('red'))), request(['a'])));
  assert.ok(negated.trace.facts.filter(f => f.kind === 'node' && f.node === 'not').every(f => f.groups.length === 0));
  assert.equal(negated.documents[0].score, 0);
  t.diagnostic(JSON.stringify({ literalCompleteResultComparisons: completeComparisons, reconstructedArithmeticAssertions: arithmeticAssertions }));
  await engine.dispose();
});

test('ordinary public searches allocate no full facts while explicit Inspector records actual scored paths', async () => {
  const engine = publicEngine(); await engine.addMany(records);
  const oldRecord = FactCollector.prototype.record, oldFinish = FactCollector.prototype.finish;
  let recordsCalled = 0, finishesCalled = 0;
  FactCollector.prototype.record = function (...args) { recordsCalled++; return oldRecord.apply(this, args); };
  FactCollector.prototype.finish = function (...args) { finishesCalled++; return oldFinish.apply(this, args); };
  try {
    const ordinary = await engine.search(or(text('red car'), text('blue')));
    assert.equal(recordsCalled, 0); assert.equal(finishesCalled, 0); assert.equal(Object.hasOwn(ordinary, 'extensions'), false); assert.equal(Object.hasOwn(ordinary, 'trace'), false);
    const explained = await engine.search(or(text('red car'), text('blue')), request(['a', 'b']));
    assert.ok(recordsCalled > 0); assert.equal(finishesCalled, 1); assert.deepEqual(coreResult(explained), ordinary);
  } finally { FactCollector.prototype.record = oldRecord; FactCollector.prototype.finish = oldFinish; }
  const source = readFileSync(new URL('../../../src/core/query/search.ts', import.meta.url), 'utf8');
  assert.match(source, /const collector = trace \? new FactCollector\(trace.maxFacts\) : undefined/);
  await engine.dispose();
});
