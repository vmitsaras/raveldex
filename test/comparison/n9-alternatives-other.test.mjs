import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createOtherAdapter, otherQuery } from '../../bench/n9/alternatives-other.mjs';
import { pagefindQuery } from '../../bench/n9/alternatives-pagefind.mjs';
import { workloadFor } from '../../bench/n9/workloads.mjs';

const workload = workloadFor('adversarial', 100);
test('Orama translation keeps only supported lexical leaves and explicit native refusal', () => {
  assert.deepEqual(otherQuery('orama', workload.queries[0]), { term: 'n9common', exact: true, fields: ['body'] });
  assert.deepEqual(otherQuery('orama', workload.queries[5]), { term: 'n9key00000', exact: false, fields: ['body'] });
  for (const index of [2,3,4,6,7]) assert.equal(otherQuery('orama', workload.queries[index]).status, 'Not comparable');
});
test('Orama refuses weighted alternatives, unknown fields, multi-token AND and empty text', () => {
  for (const query of [ { kind: 'text', text: 'red blue' }, { kind: 'text', text: '' }, { kind: 'text', text: 'red', fields: ['unknown'] },
    { kind: 'group', variants: [{ text: 'red', match: 'prefix', weight: 2 }] } ]) assert.equal(otherQuery('orama', query).status, 'Not comparable');
});
test('Fuse stays fuzzy and rejects native boolean and selected-field emulation', () => {
  assert.equal(otherQuery('fuse', workload.queries[0]).track, 'fuzzy');
  assert.equal(otherQuery('fuse', workload.queries[2]).status, 'Not comparable');
  assert.equal(otherQuery('fuse', { kind: 'text', text: 'word', fields: ['title'] }, ['title','body']).status, 'Not comparable');
});
test('Pagefind static query mapping never promotes raw static search to native operator equivalence', () => {
  assert.deepEqual(pagefindQuery(workload.queries[0]), { term: 'n9common' });
  assert.deepEqual(pagefindQuery(workload.queries[5]), { term: 'n9key00000' });
  assert.equal(pagefindQuery({ kind: 'group', fields: ['title'], variants: [{ text: 'red', match: 'prefix' }] }).status, 'Not comparable');
  for (const index of [2,3,4,7]) assert.equal(pagefindQuery(workload.queries[index]).status, 'Not comparable');
});
test('injected adapters reject duplicate IDs before using foreign module', async () => {
  await assert.rejects(createOtherAdapter('orama', {}, [workload.records[0],workload.records[0]]), /unique source IDs/);
});
const consumer = process.env.RAVELDEX_RX8010_CONSUMER;
async function moduleFor(name) {
  const expected = { '@orama/orama': '3.1.18', 'fuse.js': '7.5.0' };
  const manifest = JSON.parse(await readFile(join(consumer, 'node_modules', name, 'package.json'), 'utf8'));
  assert.equal(manifest.version, expected[name], 'isolated engine version changed');
  const require = createRequire(join(consumer, 'package.json')); return import(pathToFileURL(require.resolve(name)));
}
test('actual pinned Orama captures frozen lexical membership and disclosed real-doc exact mismatch', { skip: !consumer && 'separate isolated-engine verification requires RAVELDEX_RX8010_CONSUMER' }, async () => {
  const module = await moduleFor('@orama/orama');
  for (const family of ['real-docs','high-cardinality','adversarial']) {
    const data = workloadFor(family, 100), adapter = await createOtherAdapter('orama', module, data.records);
    for (const definition of data.queries) {
      const result = await adapter.search(definition); if (result.status) continue;
      if (family === 'real-docs' && definition.id === 'common') {
        assert.equal(result.total, 82); assert.equal(definition.expectedIds.length, 97);
        assert.match(adapter.metadata.matching, /case-sensitive/);
      } else {
        assert.equal(result.total, definition.expectedIds.length);
        assert.deepEqual([...result.ids].sort(), [...definition.expectedIds].sort());
      }
    }
    adapter.destroy(); adapter.destroy(); await assert.rejects(adapter.search(data.queries[0]), /destroyed/);
  }
});
test('actual Orama case-sensitive exact source filter remains disclosed instead of manufactured normalization parity', { skip: !consumer && 'separate isolated-engine verification requires RAVELDEX_RX8010_CONSUMER' }, async () => {
  const adapter = await createOtherAdapter('orama', await moduleFor('@orama/orama'), [{ id: 'uppercase', text: { body: 'CAT' } }]);
  assert.equal((await adapter.search({ kind: 'text', text: 'cat' })).total, 0);
  assert.match(adapter.metadata.matching, /case-sensitive/);
  assert.equal((await adapter.search({ kind: 'group', variants: [{ text: 'ca', match: 'prefix' }] })).total, 1);
  adapter.destroy();
});
test('actual Orama preserves query-selected field boundaries', { skip: !consumer && 'separate isolated-engine verification requires RAVELDEX_RX8010_CONSUMER' }, async () => {
  const adapter = await createOtherAdapter('orama', await moduleFor('@orama/orama'), [{ id: 'title', text: { title: 'alpha', body: 'beta' } }, { id: 'body', text: { title: 'beta', body: 'alpha' } }], { fields: ['title','body'] });
  assert.deepEqual((await adapter.search({ kind: 'text', text: 'alpha', fields: ['title'] })).ids, ['title']);
  assert.deepEqual((await adapter.search({ kind: 'text', text: 'alpha', fields: ['body'] })).ids, ['body']);
  adapter.destroy();
});
test('actual Fuse fuzzy captures remain separate even when fixture IDs happen to coincide', { skip: !consumer && 'separate isolated-engine verification requires RAVELDEX_RX8010_CONSUMER' }, async () => {
  const adapter = await createOtherAdapter('fuse', await moduleFor('fuse.js'), workload.records);
  const result = await adapter.search(workload.queries[1]);
  assert.equal(result.comparability, 'Not comparable'); assert.equal(result.track, 'fuzzy');
  assert.equal(result.total, result.ids.length); assert.ok(result.ids.includes('adversarial:00007'));
  assert.equal((await adapter.search(workload.queries[7])).status, 'Not comparable');
  adapter.destroy(); await assert.rejects(adapter.search(workload.queries[0]), /destroyed/);
});
