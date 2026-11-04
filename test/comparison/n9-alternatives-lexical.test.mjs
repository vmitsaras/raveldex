import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createLexicalAdapter, lexicalPlan } from '../../bench/n9/alternatives-lexical.mjs';
import { FAMILIES, workloadFor, verifyFrozen } from '../../bench/n9/workloads.mjs';

const query = text => ({ query: { kind: 'text', text, fields: ['body'] } });

test('lexical translation does not derive retrieval from expected membership', () => {
  assert.deepEqual(lexicalPlan({ ...query('CAFÉ ½'), expectedIds: ['invented'] }), { kind: 'and', terms: ['café', '1⁄2'] });
  assert.equal(lexicalPlan({ ...query('n9key'), expectedError: { code: 'LIMIT_EXCEEDED' } }).status, 'Not comparable');
});

test('unknown operators, fields, weights, source phrases and metadata are explicit', () => {
  for (const node of [
    { kind: 'extension', capability: 'phrases', payload: { text: 'red blue' } },
    { kind: 'and', children: [{ kind: 'text', text: 'red' }, { kind: 'eq', field: 'group', value: 'g0' }] },
    { kind: 'text', text: 'red', fields: ['metadata'] },
    { kind: 'text', text: 'red', unknown: true },
    { kind: 'group', variants: [{ text: 'red', match: 'prefix', weight: 2 }] },
    { kind: 'text', text: '!!!' },
  ]) assert.equal(lexicalPlan({ query: node }).status, 'Not comparable');
});

test('OR cannot silently drop conjunction or distinct child field selections', () => {
  assert.equal(lexicalPlan({ query: { kind: 'or', children: [query('two words').query, query('red').query] } }).status, 'Not comparable');
  assert.equal(lexicalPlan({ query: { kind: 'or', children: [
    { kind: 'text', text: 'red', fields: ['title'] }, { kind: 'text', text: 'blue', fields: ['body'] },
  ] } }, ['title', 'body']).status, 'Not comparable');
});

test('lexical factories refuse unknown engine, duplicate IDs and invalid field configuration', async () => {
  await assert.rejects(createLexicalAdapter('foreign', {}, []), /Unknown lexical engine/);
  await assert.rejects(createLexicalAdapter('minisearch', {}, [{ id: 'x', text: { body: '' } }, { id: 'x', text: { body: '' } }]), /Unique string IDs/);
  await assert.rejects(createLexicalAdapter('lunr', {}, [], { fields: ['body', 'body'] }), /unique title\/body/);
  await assert.rejects(createLexicalAdapter('lunr', {}, [], { boosts: { body: 0 } }), /positive finite/);
  await assert.rejects(createLexicalAdapter('flexsearch', {}, []), /Index constructor/);
});

const consumer = process.env.RAVELDEX_RX8010_CONSUMER;
for (const engine of ['minisearch', 'flexsearch', 'lunr']) {
  test(`${engine}: installed complete membership, refusal classification, native order and teardown`, { skip: !consumer && 'requires explicit pinned external comparator consumer' }, async () => {
    const require = createRequire(resolve(consumer, 'package.json'));
    const module = await import(pathToFileURL(require.resolve(engine)));
    for (const family of FAMILIES) {
      // 1000 catches implicit foreign top100 caps and OR pretruncation.
      const workload = verifyFrozen(workloadFor(family, 1000));
      const adapter = await createLexicalAdapter(engine, module, workload.records);
      for (const definition of workload.queries) {
        const actual = await adapter.search(definition);
        if (actual.status === 'Not comparable') {
          assert.ok(actual.reason.length > 10);
          assert.ok(['negative-only', 'filtered', 'narrow-prefix', 'broad-prefix', 'source-phrase', 'broad-prefix-refusal'].includes(definition.id), `${engine}/${definition.id}: unexpected omission`);
          continue;
        }
        assert.equal(actual.total, definition.expectedIds.length, `${engine}/${family}/${definition.id}`);
        assert.deepEqual([...actual.ids].sort(), [...definition.expectedIds].sort());
        assert.deepEqual(await adapter.search(definition), actual, 'native ranked order stable for unchanged index');
      }
      adapter.destroy(); adapter.destroy();
      await assert.rejects(adapter.search(workload.queries[0]), /destroyed/);
    }
    const adapter = await createLexicalAdapter(engine, module, [
      { id: 'a', text: { body: '½ CAFÉ ﬁsh Foo_bar' } },
      { id: 'b', text: { body: '1 2 fish' } },
    ]);
    assert.deepEqual((await adapter.search(query('½'))).ids, ['a'], 'NFKC-inserted separators stay inside original token');
    assert.deepEqual((await adapter.search(query('CAFÉ'))).ids, ['a']);
    assert.deepEqual((await adapter.search(query('Foo_bar'))).ids, ['a']);
    adapter.destroy();
  });
}

test('installed separate-field relevance cannot flatten fields or lose boosts', { skip: !consumer && 'requires explicit pinned external comparator consumer' }, async () => {
  const require = createRequire(resolve(consumer, 'package.json'));
  const records = [{ id: 'a', text: { title: 'red', body: 'blue' } }, { id: 'b', text: { title: 'blue', body: 'red' } }];
  for (const engine of ['minisearch', 'lunr', 'flexsearch']) {
    const module = await import(pathToFileURL(require.resolve(engine)));
    const adapter = await createLexicalAdapter(engine, module, records, { fields: ['title', 'body'], boosts: { title: 2, body: 1 } });
    const actual = await adapter.search({ query: { kind: 'text', text: 'red blue' } });
    if (engine === 'flexsearch') assert.equal(actual.status, 'Not comparable');
    else {
      assert.deepEqual([...actual.ids].sort(), ['a', 'b'], 'exact conjunction may qualify terms across separate fields');
      assert.deepEqual((await adapter.search({ query: { kind: 'text', text: 'red', fields: ['title'] } })).ids, ['a']);
      assert.deepEqual((await adapter.search({ query: { kind: 'text', text: 'red' } })).ids, ['a', 'b'], 'native declared title boost is retained');
    }
    assert.deepEqual(adapter.configuration.boosts, { title: 2, body: 1 });
    adapter.destroy();
  }
});
