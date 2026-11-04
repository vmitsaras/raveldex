import test from 'node:test';
import assert from 'node:assert/strict';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { MutationOwner } from '../../dist/core/mutations/owner.js';
import { executeSearch } from '../../dist/core/query/search.js';
import { createSourceProvider } from '../../dist/addons/phrases/source.js';
import { createQualifiedSnapshotEngine } from '../../dist/adapters/snapshots/snapshots.js';
import { createSnapshots, currentNodeSnapshotEnvironment } from '../../dist/adapters/snapshots/index.js';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';
import { group, prefix, exact, and, or, eq } from '../fixtures/ranking/query.mjs';
import { FakeHost } from '../fixtures/execution/host.mjs';

const schema = { text: { title: { boost: 2 }, body: {} }, metadata: { label: { type: 'string' } } };
const oneField = { text: { body: {} } };
const selected = (value, fields = ['body']) => group([prefix(value)], fields);
const term = index => `pre${String(index).padStart(3, '0')}`;
const ids = result => result.hits.map(hit => hit.id);
function drain(cursor) {
  for (;;) {
    const next = cursor.next();
    if (next.done) return next.value;
    assert.ok(Number.isSafeInteger(next.value.workUnits) && next.value.workUnits > 0);
  }
}
function construct(records, selectedSchema = schema, limits = {}) {
  const builder = new IndexConstruction({ schema: selectedSchema, limits });
  for (let start = 0; start < records.length; start += 256) drain(builder.append(records.slice(start, start + 256)));
  return drain(builder.finish());
}
const search = (root, query, options, trace) => drain(executeSearch(root, query, options, trace));
function compare(actual, records, query, selectedSchema = schema, options = { limit: 100 }) {
  // This reference scans original source and owns its tokenizer and scorer.
  // Neither expected membership nor expected arithmetic reads the native index.
  const expected = sourceQueryResult(scanSourceCorpus(records, selectedSchema), query, options);
  assert.equal(actual.total, expected.total);
  assert.equal(actual.completeness, 'complete'); assert.equal(actual.model, 'raveldex-bm25-v1');
  assert.deepEqual(ids(actual), ids(expected));
  actual.hits.forEach((hit, index) => assert.ok(Math.abs(hit.score - expected.hits[index].score) <= Math.max(1e-12, Math.abs(expected.hits[index].score) * 1e-12)));
}
function expansionError(run, path, limit, actual) {
  assert.throws(run, error => {
    assert.equal(error.name, 'RaveldexError'); assert.equal(error.code, 'LIMIT_EXCEEDED');
    assert.equal(error.message, 'Raveldex: LIMIT_EXCEEDED');
    assert.deepEqual(error.details, { path, limit, actual });
    return true;
  });
}

test('prefix membership, selected fields, overlapping alternatives and metadata retain independent source scores', () => {
  const records = [
    { id: 'a', text: { title: 'car cart', body: 'carbon carpet' }, metadata: { label: 'keep' } },
    { id: 'b', text: { title: 'carbon', body: ['car', 'car cart'] }, metadata: { label: 'omit' } },
    { id: 'c', text: { title: 'ordinary', body: 'scar can' }, metadata: { label: 'keep' } },
    { id: 'exact-prefix', text: { title: 'ca', body: 'ca cab' }, metadata: { label: 'keep' } },
    { id: 'empty', text: {} },
  ];
  const cases = [
    [selected('ca', ['title']), ['a', 'b', 'exact-prefix']],
    [selected('ca'), ['a', 'b', 'c', 'exact-prefix']],
    [selected('car'), ['a', 'b']],
    [selected('cas'), []],
    [and(selected('ca'), eq('label', 'keep')), ['a', 'c', 'exact-prefix']],
    [group([prefix('ca', .25), prefix('CAR', .5), exact('cart'), exact('CART', .1)], ['body', 'title']), ['a', 'b', 'c', 'exact-prefix']],
  ];
  const roots = [construct(records), construct([...records].reverse())];
  for (const [query, literal] of cases) {
    assert.deepEqual(ids(sourceQueryResult(scanSourceCorpus(records, schema), query, { limit: 100 })).sort(), [...literal].sort());
    for (const options of [{ limit: 100 }, { limit: 0 }, { offset: 1, limit: 2 }]) {
      const outputs = roots.map(root => search(root, query, options));
      for (const output of outputs) compare(output, records, query, schema, options);
      assert.deepEqual(outputs[0], outputs[1]);
    }
  }
  const base = search(roots[0], selected('ca', ['title', 'body']));
  assert.deepEqual(search(roots[0], group([prefix('CA'), exact('ca'), prefix('ca'), exact('car')], ['body', 'title'])), base);
});

test('prefix alternatives retain canonical winning-term traces and UTF-16 document ties', () => {
  const records = ['a', 'A', '𐐀', '\uE000', '😀'].map(id => ({ id, text: { body: 'car cart' } }));
  for (const order of [records, [...records].reverse()]) {
    const root = construct(order, oneField);
    const query = selected('ca');
    const result = search(root, query, { limit: 100 }, { ids: records.map(record => record.id) });
    compare(result, records, query, oneField);
    assert.deepEqual(ids(result), records.map(record => record.id).sort());
    const facts = result.trace.facts.filter(fact => fact.kind === 'field');
    assert.equal(facts.length, records.length); assert.ok(facts.every(fact => fact.term === 'car'));
    const weighted = search(root, group([prefix('ca', .25), exact('cart')], ['body']), { limit: 100 }, { ids: [records[0].id] });
    assert.equal(weighted.trace.facts.find(fact => fact.kind === 'field').term, 'cart');
  }
});

test('default 256/257 expansion boundary counts live field/term pairs and eagerly rejects failed branches', () => {
  const records = count => [{ id: 'all', text: { body: Array.from({ length: count }, (_, index) => term(index)).join(' ') } }];
  const accepted = construct(records(256), oneField);
  const query = group([prefix('pre'), prefix('PRE'), exact(term(0))], ['body']);
  assert.equal(search(accepted, query).total, 1);
  const over = construct(records(257), oneField);
  for (const branch of [query, and({ kind: 'none' }, query), or({ kind: 'all' }, query)]) {
    expansionError(() => search(over, branch), 'expansions.group', 256, 257);
  }
  const twoFields = count => [{ id: 'all', text: {
    title: Array.from({ length: 128 }, (_, index) => term(index)).join(' '),
    body: Array.from({ length: count }, (_, index) => term(index)).join(' '),
  } }];
  assert.equal(search(construct(twoFields(128)), selected('pre', ['title', 'body'])).total, 1);
  expansionError(() => search(construct(twoFields(129)), selected('pre', ['body', 'title'])), 'expansions.group', 256, 257);
  // A field restriction cannot accidentally admit another field's 129 pairs.
  assert.equal(search(construct(twoFields(129)), selected('pre', ['title'])).total, 1);
});

test('query expansion boundary 1024/1025 deduplicates repeated pairs across distinct canonical groups', () => {
  const families = ['aa', 'bb', 'cc', 'dd'];
  const words = families.flatMap(family => Array.from({ length: 256 }, (_, index) => `${family}${String(index).padStart(3, '0')}`));
  const root = construct([{ id: 'all', text: { body: [...words, 'extra'].join(' ') } }], oneField);
  const groups = families.map(family => selected(family));
  const accepted = or(...groups, group([exact('aa000', .5)], ['body']));
  assert.equal(search(root, accepted).total, 1);
  expansionError(() => search(root, or(accepted, group([exact('extra')], ['body']))), 'expansions.query', 1024, 1025);
  const reduced = construct([{ id: 'one', text: { body: 'pre prefix' } }], oneField, { maxQueryExpansions: 2 });
  assert.equal(search(reduced, or(selected('pre'), group([exact('pre', .5)], ['body']))).total, 1);
});

test('overlapping earlier query pairs preserve legacy group-versus-query expansion error precedence', () => {
  const selectedSchema = { text: { a: {}, z: {} } };
  const first = group([exact('prey'), exact('prez'), exact('x')], ['a', 'z']);
  const second = group([prefix('pre')], ['a']);
  // The first canonical group establishes {prey, prez, x}. The legacy hash
  // traversal of the second group is prey, prea, prez, preb. Its fourth term
  // reaches both bounds together, so the group limit takes precedence. A naive
  // sorted enumeration instead sees prea/preb first and wrongly raises query5.
  for (const source of ['prea preb prey prez x', 'x prez prey preb prea']) {
    const root = construct([{ id: 'all', text: { a: source } }], selectedSchema, { maxExpansionsPerGroup: 3, maxQueryExpansions: 4 });
    expansionError(() => search(root, or(first, second)), 'expansions.group', 3, 4);
  }
});

test('empty, absent, normalized supplementary and long-common-prefix bounds match original source membership', () => {
  const long = 'a'.repeat(120);
  const records = [
    { id: 'exact', text: { body: long } },
    { id: 'left', text: { body: `${long}b` } },
    { id: 'right', text: { body: `${long}z` } },
    { id: 'before', text: { body: `${'a'.repeat(119)}0` } },
    { id: 'after', text: { body: `${'a'.repeat(119)}b` } },
    { id: 'ligature', text: { body: 'ﬁle ﬁlm' } },
    { id: 'supplementary', text: { body: '𐐀𐐁 𐐀𐐁x 𐐀𐐂' } },
    { id: 'empty', text: { body: ['', '!!!'] } },
  ];
  const cases = [[selected(long), ['exact', 'left', 'right']], [selected(`${long}b`), ['left']],
    [selected('ﬁl'), ['ligature']], [selected('𐐀𐐁'), ['supplementary']], [selected('zz'), []], [selected('00'), []]];
  for (const order of [records, [...records].reverse()]) {
    const root = construct(order, oneField);
    for (const [query, literal] of cases) {
      const result = search(root, query, { limit: 100 });
      assert.deepEqual(ids(result).sort(), [...literal].sort()); compare(result, records, query, oneField);
    }
  }
  for (const query of cases.map(([query]) => query)) assert.equal(search(construct([], oneField), query).total, 0);
});

test('prefix sets remain atomic through additions, replacement, partial term deletion, noops, failure and clear', () => {
  let records = Array.from({ length: 48 }, (_, index) => ({ id: `id:${index}`, text: { body: `${term(index)} shared` } }));
  const owner = new MutationOwner(construct(records, oneField));
  const verify = () => {
    for (const query of [selected('pre'), selected('pr'), selected('new'), selected('sh'), selected('zz')]) {
      compare(search(owner.root, query, { limit: 100 }), records, query, oneField);
    }
  };
  verify();
  // Alternating low/high deletions and new keys exercise varied dictionary churn
  // without asserting any particular ordered-index representation or rotations.
  for (const index of [...Array.from({ length: 12 }, (_, i) => i), ...Array.from({ length: 12 }, (_, i) => 47 - i)]) {
    drain(owner.mutate('remove', `id:${index}`)); records = records.filter(record => record.id !== `id:${index}`); verify();
  }
  const previous = owner.root;
  assert.deepEqual(drain(owner.mutate('remove', ['missing', 'also-missing'])), { revision: previous.revision, changed: false, added: 0, replaced: 0, removed: 0 });
  assert.equal(owner.root, previous);
  assert.throws(() => drain(owner.mutate('remove', ['missing', 'missing'])), { code: 'INVALID_OPTIONS', details: { path: 'ids[1]' } });
  assert.throws(() => drain(owner.mutate('addMany', [{ id: 'staged', text: { body: 'newonly' } }, records[0]])), { code: 'ID_EXISTS' });
  assert.equal(owner.root, previous); verify();
  const replacement = { id: records[0].id, text: { body: 'newprefix newword shared' } };
  drain(owner.mutate('replace', replacement)); records = records.map(record => record.id === replacement.id ? replacement : record); verify();
  const additions = [{ id: 'new-a', text: { body: 'newprefix pre' } }, { id: 'new-b', text: { body: 'pre newprefix' } }];
  drain(owner.mutate('addMany', additions)); records.push(...additions); verify();
  drain(owner.mutate('remove', 'new-a')); records = records.filter(record => record.id !== 'new-a'); verify();
  assert.equal(search(owner.root, selected('pre'), { limit: 100 }).hits.some(hit => hit.id === 'new-b'), true);
  // Earlier roots remain usable after later ordered dictionary publications.
  assert.equal(search(previous, selected('new')).total, 0);
  drain(owner.mutate('clear')); records = []; verify();
  const emptyRoot = owner.root; assert.equal(drain(owner.mutate('clear')).changed, false); assert.equal(owner.root, emptyRoot);
  drain(owner.mutate('add', { id: 'reused', text: { body: 'newprefix pre' } })); records = [{ id: 'reused', text: { body: 'newprefix pre' } }]; verify();
});

test('cancellation during ordered dictionary staging preserves prior published prefix results and permits recovery', () => {
  const original = [{ id: 'a', text: { body: Array.from({ length: 24 }, (_, i) => term(i)).join(' ') } }];
  const owner = new MutationOwner(construct(original, oneField)), previous = owner.root;
  const replacement = { id: 'a', text: { body: Array.from({ length: 24 }, (_, i) => `new${String(i).padStart(3, '0')}`).join(' ') } };
  const controller = new AbortController(); let coreChecks = 0;
  const cursor = owner.execute(owner.capture('replace', replacement, { signal: controller.signal }), {
    checkpoint(phase) { if (phase === 'core' && ++coreChecks === 30) controller.abort(); },
  });
  assert.throws(() => drain(cursor), { code: 'CANCELLED' }); assert.equal(coreChecks, 30);
  assert.equal(owner.root, previous); compare(search(owner.root, selected('pre'), { limit: 100 }), original, selected('pre'), oneField);
  assert.equal(search(owner.root, selected('new')).total, 0);
  drain(owner.mutate('replace', replacement));
  compare(search(owner.root, selected('new'), { limit: 100 }), [replacement], selected('new'), oneField);
  assert.equal(search(owner.root, selected('pre')).total, 0);
});

test('source and native snapshots preserve prefix semantics, old native field schema and subsequent dictionary churn', async () => {
  const qualification = {
    profileId: 'rx8005-test-declared-exact-node', scope: 'exact-node-runtime', environment: currentNodeSnapshotEnvironment(),
    evidence: ['test/core/prefix-seek.test.mjs: matching-attestation contract fixture; no cross-host qualification claim'],
  };
  const fixture = () => {
    const host = new FakeHost();
    const engine = createQualifiedSnapshotEngine({ schema, addons: [createSourceProvider({ fields: ['title', 'body'] })] }, qualification, host);
    return { engine, async call(method, ...args) { const pending = engine[method](...args); host.runReady(); return pending; }, async snapshot(method, ...args) { const pending = createSnapshots(engine)[method](...args); host.runReady(); return pending; } };
  };
  const records = [
    { id: 'a', text: { title: 'car carbon', body: 'carpet ca' }, metadata: { label: 'keep' } },
    { id: 'b', text: { title: 'ca', body: 'car cart' }, metadata: { label: 'omit' } },
    { id: 'c', text: { title: 'ordinary', body: 'cab' }, metadata: { label: 'keep' } },
  ];
  for (const format of ['Source', 'Native']) {
    const donor = fixture(), receiver = fixture();
    try {
      await donor.call('addMany', records);
      const encoded = await donor.snapshot(`export${format}`), envelope = JSON.parse(encoded);
      if (format === 'Native') for (const field of Object.values(envelope.body.payload.fields)) assert.deepEqual(Object.keys(field).sort(), ['documents', 'length', 'terms']);
      await receiver.call('add', { id: 'old', text: { body: 'oldprefix' } });
      await receiver.snapshot('restore', encoded);
      for (const query of [selected('ca'), selected('ca', ['title']), group([prefix('ca'), exact('car')]), and(selected('ca'), eq('label', 'keep'))]) {
        compare(await receiver.call('search', query, { limit: 100 }), records, query);
      }
      const replacement = { id: 'a', text: { body: 'newprefix' }, metadata: { label: 'keep' } };
      await receiver.call('replace', replacement); await receiver.call('remove', 'b');
      const retained = [replacement, records[2]];
      for (const query of [selected('ca'), selected('new')]) compare(await receiver.call('search', query, { limit: 100 }), retained, query);
      assert.equal((await receiver.call('search', selected('old'))).total, 0);
      await receiver.call('clear'); await receiver.snapshot('restore', encoded);
      compare(await receiver.call('search', selected('ca'), { limit: 100 }), records, selected('ca'));
    } finally { await donor.engine.dispose(); await receiver.engine.dispose(); }
  }
});
