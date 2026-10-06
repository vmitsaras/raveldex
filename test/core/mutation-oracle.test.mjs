import assert from 'node:assert/strict';
import test from 'node:test';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { MutationOwner } from '../../dist/core/mutations/owner.js';
import { executeSearch } from '../../dist/core/query/search.js';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';
import { reconstructSourceState, sourceMutation } from '../oracle/mutations.mjs';
import {
  MUTATION_SCHEMA, MUTATION_SEEDS, GENERATED_MUTATION_COUNT,
  mutationQueries, deterministicMutations, generatedMutationSequence,
} from '../fixtures/mutations/sequences.mjs';

const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sorted = (entries) => [...entries].sort(([left], [right]) => compare(left, right));

function drain(iterator) {
  for (;;) {
    const step = iterator.next();
    if (step.done) return step.value;
    assert.ok(Number.isSafeInteger(step.value.workUnits) && step.value.workUnits > 0);
  }
}

function build(records, schema = MUTATION_SCHEMA) {
  const construction = new IndexConstruction({ schema });
  for (let start = 0; start < records.length; start += 256) drain(construction.append(records.slice(start, start + 256)));
  return drain(construction.finish());
}

/** Inspection adapter only: expected entries never come from native state. */
function entries(directory) {
  const flattened = Object.values(directory.buckets).flatMap(Object.entries);
  assert.equal(flattened.length, directory.size, 'directory size is its complete entry count');
  assert.ok(Object.isFrozen(directory));
  assert.ok(Object.isFrozen(directory.buckets));
  assert.equal(Object.getPrototypeOf(directory.buckets), null);
  for (const bucket of Object.values(directory.buckets)) {
    assert.ok(Object.isFrozen(bucket));
    assert.equal(Object.getPrototypeOf(bucket), null);
    assert.ok(Object.keys(bucket).length > 0, 'empty buckets are removed');
  }
  return sorted(flattened);
}

function observedState(root) {
  assert.ok(Object.isFrozen(root));
  assert.ok(Object.isFrozen(root.counts));
  assert.ok(Object.isFrozen(root.fields));
  const documents = entries(root.documents).map(([id, document]) => {
    assert.ok(Object.isFrozen(document));
    assert.ok(Object.isFrozen(document.fields));
    assert.ok(Object.isFrozen(document.metadata));
    for (const value of Object.values(document.metadata)) if (Array.isArray(value)) assert.ok(Object.isFrozen(value));
    assert.deepEqual(Object.keys(document).sort(), ['fields', 'id', 'metadata', 'textCodeUnits'], 'frequency core retains no original source');
    const fields = sorted(Object.entries(document.fields)).map(([name, field]) => {
      assert.ok(Object.isFrozen(field));
      assert.ok(Object.isFrozen(field.terms));
      return [name, { length: field.length, terms: sorted(Object.entries(field.terms)) }];
    });
    return [id, { id: document.id, textCodeUnits: document.textCodeUnits, metadata: sorted(Object.entries(document.metadata)), fields }];
  });
  const fields = sorted(Object.entries(root.fields)).map(([name, field]) => {
    assert.ok(Object.isFrozen(field));
    return [name, {
      documents: field.documents, length: field.length,
      terms: entries(field.terms).map(([term, entry]) => {
        assert.ok(Object.isFrozen(entry));
        return [term, { df: entry.df, frequency: entry.frequency, postings: entries(entry.postings) }];
      }),
    }];
  });
  return { revision: root.revision, counts: root.counts, documents, fields };
}

function compareQuery(root, corpus, query, options, description) {
  const expected = sourceQueryResult(corpus, query, options);
  const actual = drain(executeSearch(root, query, options));
  assert.equal(actual.revision, root.revision, description);
  assert.equal(actual.model, 'raveldex-bm25-v1', description);
  assert.equal(actual.completeness, 'complete', description);
  assert.equal(actual.total, expected.total, description);
  assert.deepEqual(actual.hits.map(({ id }) => id), expected.hits.map(({ id }) => id), description);
  for (let i = 0; i < actual.hits.length; i++) {
    const score = expected.hits[i].score;
    assert.ok(Number.isFinite(actual.hits[i].score), description);
    assert.ok(Math.abs(actual.hits[i].score - score) <= Math.max(1e-12, Math.abs(score) * 1e-12),
      `${description}/${actual.hits[i].id}: native=${actual.hits[i].score}, independent=${score}`);
  }
}

function runSequence(sequence, label, t) {
  let records = structuredClone(sequence.initial), revision = 0;
  const owner = new MutationOwner(build(records));
  const queries = [...mutationQueries, ...(sequence.queries ?? [])];
  let states = 0, queryComparisons = 0, commits = 0, noops = 0, rejections = 0;
  function verify(description) {
    assert.deepEqual(observedState(owner.root), reconstructSourceState(records, MUTATION_SCHEMA, revision), description);
    const corpus = scanSourceCorpus(records, MUTATION_SCHEMA);
    for (const query of queries) {
      compareQuery(owner.root, corpus, query, { limit: 100 }, `${description}/${JSON.stringify(query)}`);
      queryComparisons++;
    }
    for (const options of [{ limit: 0 }, { limit: 3, offset: 2 }]) {
      compareQuery(owner.root, corpus, { kind: 'or', children: [{ kind: 'all' }, { kind: 'text', text: 'red car', operator: 'or' }] }, options, `${description}/page=${JSON.stringify(options)}`);
      queryComparisons++;
    }
    states++;
  }
  verify(`${label}/initial`);
  for (const [index, operation] of sequence.operations.entries()) {
    const description = `${label}/${index}/${operation.kind}`;
    const expected = sourceMutation(records, revision, operation);
    assert.equal(expected.error, operation.error, `${description}/fixture policy`);
    const prior = owner.root;
    const priorState = observedState(prior);
    if (expected.error) {
      assert.throws(() => drain(owner.mutate(operation.kind, operation.input)), (error) => error.code === expected.error, description);
      assert.equal(owner.root, prior, `${description}/failed operation preserves publication`);
      rejections++;
    } else {
      const actual = drain(owner.mutate(operation.kind, operation.input));
      assert.deepEqual(actual, expected.result, `${description}/mutation counts and revision`);
      assert.ok(Object.isFrozen(actual));
      records = expected.records;
      revision = expected.result.revision;
      if (expected.result.changed) { assert.notEqual(owner.root, prior); commits++; }
      else { assert.equal(owner.root, prior, `${description}/noop preserves root`); noops++; }
    }
    assert.deepEqual(observedState(prior), priorState, `${description}/previous root stays immutable`);
    verify(description);
  }
  t.diagnostic(JSON.stringify({ label, operations: sequence.operations.length, states, queryComparisons, commits, noops, rejections }));
  return { records, revision, states, queryComparisons, commits, noops, rejections };
}

test('independent source reconstruction derives canonical reverse/postings/populations and policy counts', () => {
  const schema = { text: { title: {} }, metadata: { values: { type: 'number', multi: true, nullable: true } } };
  const records = [
    { id: 'a', text: { title: 'red red car' }, metadata: { values: [-0, 0, 2, 2, null] } },
    { id: '__proto__', text: { title: ['', 'red'] } },
    { id: 'blank', text: { title: '😀!' } },
  ];
  const state = reconstructSourceState(records, schema, 7);
  assert.deepEqual(state.counts, { documents: 3, textCodeUnits: 17, tokens: 4, dictionaryEntries: 2, postingEntries: 3 });
  assert.deepEqual(state.fields, [['title', { documents: 2, length: 4, terms: [
    ['car', { df: 1, frequency: 1, postings: [['a', 1]] }],
    ['red', { df: 2, frequency: 3, postings: [['__proto__', 1], ['a', 2]] }],
  ] }]]);
  assert.deepEqual(state.documents.find(([id]) => id === 'a')[1].metadata, [['values', [0, 2, null]]]);
  assert.deepEqual(sourceMutation(records, 7, { kind: 'replace', input: records[0] }).result,
    { revision: 8, changed: true, added: 0, replaced: 1, removed: 0 });
  assert.deepEqual(sourceMutation(records, 7, { kind: 'remove', input: ['missing', 'a'] }).result,
    { revision: 8, changed: true, added: 0, replaced: 0, removed: 1 });
  assert.deepEqual(sourceMutation(records, 7, { kind: 'addMany', input: [] }).result,
    { revision: 7, changed: false, added: 0, replaced: 0, removed: 0 });
});

test('deterministic mutation epochs exactly match independent full-source state and complete query scores', (t) => {
  const totals = runSequence(deterministicMutations(), 'deterministic', t);
  assert.equal(totals.records.length, 1);
  assert.equal(totals.records[0].id, 'new-era');
  assert.ok(totals.commits > 0 && totals.noops > 0 && totals.rejections > 0);
});

test('live BM25 statistics after delete/replace/empty transitions match hand-derived arithmetic', () => {
  const schema = { text: { title: {} } };
  const owner = new MutationOwner(build([
    { id: 'a', text: { title: 'red red car' } },
    { id: 'b', text: { title: 'red car' } },
    { id: 'c', text: { title: 'blue' } },
  ], schema));
  function expectedScores(query, values) {
    const result = drain(executeSearch(owner.root, query, { limit: 100 }));
    assert.equal(result.total, Object.keys(values).length);
    for (const { id, score } of result.hits) {
      const expected = values[id];
      assert.ok(Math.abs(score - expected) <= Math.max(1e-12, Math.abs(expected) * 1e-12), `${id}/${query}`);
    }
  }
  drain(owner.mutate('remove', 'c'));
  // N=2,L=5,avg=5/2,df(red)=2,idf=ln(6/5).
  // a: normalizer=69/50, TF part=220/169; b: 51/50, TF part=110/101.
  expectedScores('red', { a: Math.log(6 / 5) * (220 / 169), b: Math.log(6 / 5) * (110 / 101) });
  drain(owner.mutate('replace', { id: 'a', text: { title: 'blue' } }));
  // N=2,L=3,avg=3/2,df(red)=1,idf=ln(2), b normalizer=3/2,TF part=22/25.
  expectedScores('red', { b: Math.log(2) * (22 / 25) });
  drain(owner.mutate('replace', { id: 'a', text: { title: '😀!' } }));
  // A live tokenless ID is excluded from field population: N=1,L=2,avg=2,
  // df(red)=1,idf=ln(4/3),normalizer=6/5,TF part=1.
  expectedScores('red', { b: Math.log(4 / 3) });
  const field = owner.root.fields.title;
  assert.equal(field.documents, 1);
  assert.equal(field.length, 2);
  drain(owner.mutate('remove', 'b'));
  expectedScores('red', {});
  assert.equal(owner.root.documents.size, 1);
  assert.equal(owner.root.fields.title.documents, 0);
  assert.equal(owner.root.fields.title.length, 0);
  assert.equal(owner.root.fields.title.terms.size, 0);
});

test('mutation generators reproduce seeds and exercise all five operations with conflicts/noops', () => {
  for (const seed of MUTATION_SEEDS) {
    const sequence = generatedMutationSequence(seed);
    assert.deepEqual(sequence, generatedMutationSequence(seed));
    assert.equal(sequence.operations.length, GENERATED_MUTATION_COUNT);
    assert.deepEqual([...new Set(sequence.operations.map(({ kind }) => kind))].sort(), ['add', 'addMany', 'clear', 'remove', 'replace']);
    assert.ok(sequence.operations.some(({ error }) => error === 'ID_EXISTS'));
    assert.ok(sequence.operations.some(({ error }) => error === 'ID_NOT_FOUND'));
    assert.ok(sequence.operations.some(({ error }) => error === 'INVALID_RECORD'));
    assert.ok(sequence.operations.some(({ kind, input }) => kind === 'addMany' && input.length === 0));
    assert.ok(sequence.operations.some(({ kind, input }) => kind === 'remove' && Array.isArray(input) && input.length === 0));
  }
  assert.notDeepEqual(generatedMutationSequence(MUTATION_SEEDS[0]), generatedMutationSequence(MUTATION_SEEDS[1]));
});

for (const seed of MUTATION_SEEDS) {
  test(`incremental state equals independent source rebuild after every mutation, seed 0x${seed.toString(16)}`, (t) => {
    const totals = runSequence(generatedMutationSequence(seed), `seed=0x${seed.toString(16)}`, t);
    assert.equal(totals.states, GENERATED_MUTATION_COUNT + 1);
    assert.ok(totals.commits > 0 && totals.noops > 0 && totals.rejections > 0);
  });
}
