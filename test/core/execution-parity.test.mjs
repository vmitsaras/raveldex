import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutionOwner, createRaveldex } from '../../dist/core/execution/engine.js';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { captureSearch, executeOwnedSearch, executeSearch } from '../../dist/core/query/search.js';
import { MutationOwner } from '../../dist/core/mutations/owner.js';
import { EXACT_SCHEMA, generatedExactCorpus, EXACT_CORPUS_SEEDS } from '../fixtures/corpora/exact.mjs';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';
import { sourceMutation, reconstructSourceState } from '../oracle/mutations.mjs';

const sorted = entries => [...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
const entries = directory => sorted(Object.values(directory.buckets).flatMap(Object.entries));
function observedIndexState(root) {
  return { revision: root.revision, counts: root.counts,
    documents: entries(root.documents).map(([id, doc]) => [id, { id: doc.id, textCodeUnits: doc.textCodeUnits, metadata: sorted(Object.entries(doc.metadata)),
      fields: sorted(Object.entries(doc.fields)).map(([name, field]) => [name, { length: field.length, terms: sorted(Object.entries(field.terms)) }]) }]),
    fields: sorted(Object.entries(root.fields)).map(([name, field]) => [name, { documents: field.documents, length: field.length,
      terms: entries(field.terms).map(([term, entry]) => [term, { df: entry.df, frequency: entry.frequency, postings: entries(entry.postings) }]) }]) };
}

function drain(cursor) { for (;;) { const next = cursor.next(); if (next.done) return next.value; } }
function construct(records, quantum = 2048) {
  const build = new IndexConstruction({ schema: EXACT_SCHEMA, limits: { checkpointWorkUnits: quantum } });
  for (let i = 0; i < records.length; i += 256) drain(build.append(records.slice(i, i + 256)));
  return drain(build.finish());
}
// A task queue with a constant monotonic clock; deadlines are not silently advanced by yields.
class Host {
  jobs = new Map(); serial = 0; tasks = 0;
  now() { return 0; }
  schedule(callback, delayMs) { const id = ++this.serial; this.jobs.set(id, { callback, delayMs }); return () => this.jobs.delete(id); }
  run() { const job = [...this.jobs].find(([, job]) => job.delayMs === 0); if (!job) return false; this.jobs.delete(job[0]); this.tasks++; job[1].callback(); return true; }
  flush() { while (this.run()); }
}
function compare(actual, expected) {
  assert.equal(actual.total, expected.total);
  assert.deepEqual(actual.hits.map(hit => hit.id), expected.hits.map(hit => hit.id));
  actual.hits.forEach((hit, i) => assert.ok(Math.abs(hit.score - expected.hits[i].score) <= Math.max(1e-12, Math.abs(expected.hits[i].score) * 1e-12)));
}
const queries = ['common', { kind: 'group', fields: ['body'], variants: [{ text: 'com', match: 'prefix' }] },
  { kind: 'not', child: { kind: 'text', text: 'absent' } }, { kind: 'all' }, { kind: 'none' },
  { kind: 'or', children: [{ kind: 'text', text: 'red' }, { kind: 'eq', field: 'label', value: 'guide' }] }];

test('four task yield quanta preserve full source-oracle membership, pages, order and BM25 after queued mutations', async () => {
  const original = generatedExactCorpus(80, EXACT_CORPUS_SEEDS[0]);
  for (const quantum of [1, 7, 97, 2048]) {
    const host = new Host(), engine = new ExecutionOwner(construct(original, quantum), host);
    let source = original, revision = 0;
    const operations = [
      { kind: 'addMany', input: [{ id: 'new-a', text: { title: 'common red', body: 'common blue blue' } }, { id: 'new-b', text: {} }] },
      { kind: 'replace', input: { id: original[0].id, text: { body: 'common common replacement red' } } },
      { kind: 'remove', input: [original[1].id, 'missing'] },
      { kind: 'clear' },
      { kind: 'add', input: { id: '__proto__', text: { title: 'common', body: 'red red blue' } } },
    ];
    // Calls are submitted together; query expectations use each preceding committed source state.
    for (const operation of operations) {
      const promises = [];
      const expectedMutation = sourceMutation(source, revision, operation);
      source = expectedMutation.records; revision = expectedMutation.result.revision;
      const mutation = operation.kind === 'clear' ? engine.clear() : engine[operation.kind](operation.input);
      promises.push(mutation.then(actual => assert.deepEqual(actual, expectedMutation.result)));
      const corpus = scanSourceCorpus(source, EXACT_SCHEMA);
      for (const query of queries) for (const options of [{ limit: 100 }, { offset: 1, limit: 3 }, { limit: 0 }]) {
        const expected = sourceQueryResult(corpus, query, options), selectedRevision = revision;
        promises.push(engine.search(query, options).then(actual => { compare(actual, expected); assert.equal(actual.revision, selectedRevision); }));
      }
      host.flush(); await Promise.all(promises);
      assert.deepEqual(observedIndexState(engine.root), reconstructSourceState(source, EXACT_SCHEMA, revision));
    }
    assert.ok(host.tasks > 0);
    assert.equal(host.jobs.size, 0);
    await engine.dispose(); assert.equal(engine.root, undefined);
  }
});

test('query stop checks run inside dictionary, postings, analysis, evaluation, scoring, selection and final result', () => {
  const root = construct(generatedExactCorpus(20, EXACT_CORPUS_SEEDS[0]));
  const query = { kind: 'group', fields: ['body'], variants: [{ text: 'com', match: 'prefix' }] };
  for (const target of ['analysis', 'expansion', 'dictionary', 'postings', 'evaluation', 'scoring', 'selection', 'result']) {
    let observed = 0;
    const cursor = executeOwnedSearch(root, captureSearch(root.configuration, query, { limit: 5 }), { checkpoint(phase) {
      if (phase === target && ++observed === 2) throw new Error(target);
    } });
    assert.throws(() => drain(cursor), error => error.message === target);
    assert.equal(observed, 2);
    assert.equal(drain(executeSearch(root, query, { limit: 5 })).total, 20);
  }
});

test('every search and replacement yield can abort and recover with identical published state', async (t) => {
  const root = construct([{ id: 'a', text: { title: 'common red red', body: 'common blue' } }], 1);
  const cases = [
    { start: (engine, signal) => engine.search('common', { signal, limit: 1 }), cursor: () => executeSearch(root, 'common', { limit: 1 }) },
    { start: (engine, signal) => engine.replace({ id: 'a', text: { body: 'new blue blue' } }, { signal }), cursor: () => new MutationOwner(root).mutate('replace', { id: 'a', text: { body: 'new blue blue' } }) },
  ];
  for (const specification of cases) {
    let positions = 0; for (const step of specification.cursor()) { assert.ok(step.workUnits > 0); positions++; }
    t.diagnostic(`Exhaustive cancellation positions: ${positions}`);
    for (let position = 0; position < positions; position++) {
      const host = new Host(), engine = new ExecutionOwner(root, host), controller = new AbortController();
      const promise = specification.start(engine, controller.signal);
      const rejection = assert.rejects(promise, { code: 'CANCELLED' });
      for (let i = 0; i < position; i++) assert.equal(host.run(), true);
      controller.abort(); await rejection;
      assert.equal(engine.root, root); assert.equal(host.jobs.size, 0);
      const recovery = engine.search({ kind: 'all' }); host.flush(); assert.equal((await recovery).total, 1);
      await engine.dispose(); assert.equal(host.jobs.size, 0);
    }
  }
});

test('actual direct factory yields to host timers during complete common-term search and atomic staging', async () => {
  const engine = createRaveldex({ schema: EXACT_SCHEMA, limits: { checkpointWorkUnits: 64 } });
  const records = generatedExactCorpus(200, EXACT_CORPUS_SEEDS[0]);
  let writeSettled = false, searchSettled = false;
  const timerDuringWrite = new Promise(resolve => setTimeout(() => resolve(!writeSettled), 0));
  const write = engine.addMany(records).then(value => { writeSettled = true; return value; });
  assert.equal(await timerDuringWrite, true); assert.equal((await write).revision, 1);
  const timerDuringSearch = new Promise(resolve => setTimeout(() => resolve(!searchSettled), 0));
  const search = engine.search('common', { limit: 100 }).then(value => { searchSettled = true; return value; });
  assert.equal(await timerDuringSearch, true);
  compare(await search, sourceQueryResult(scanSourceCorpus(records, EXACT_SCHEMA), 'common', { limit: 100 }));
  await engine.dispose();
});
