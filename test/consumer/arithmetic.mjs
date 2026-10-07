import assert from 'node:assert/strict';
import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
const engine = createRaveldex({ schema: { text: { body: { boost: 2 } } } });
try {
  // Readable hand arithmetic, independent of production and the source oracle.
  await engine.addMany([
    { id: 'a', text: { body: 'red red blue' } },
    { id: 'b', text: { body: 'red' } },
    { id: 'empty', text: { body: '' } },
  ]);
  const result = await engine.search('red');
  const idf = Math.log(1 + 0.5 / 2.5); // N=2, df=2, total length=4, average=2
  const expected = {
    a: 2 * idf * (2 * 2.2) / (2 + 1.2 * (0.25 + 0.75 * 3 / 2)),
    b: 2 * idf * 2.2 / (1 + 1.2 * (0.25 + 0.75 / 2)),
  };
  assert.equal(result.total, 2); assert.equal(result.revision, 1);
  assert.ok(expected.b > expected.a, 'shorter field outweighs the repeated term in this case');
  assert.deepEqual(result.hits.map((hit) => hit.id), ['b', 'a']);
  for (const hit of result.hits) assert.ok(Math.abs(hit.score - expected[hit.id]) <= 1e-12);
  await engine.remove('a');
  const after = await engine.search('red');
  assert.equal(after.total, 1); assert.equal(after.revision, 2);
  assert.equal(after.hits[0].id, 'b');
  assert.ok(Math.abs(after.hits[0].score - 2 * Math.log(1 + 0.5 / 1.5)) <= 1e-12);
  let promise; assert.doesNotThrow(() => { promise = engine.search({ kind: 'unknown' }); });
  await assert.rejects(promise, (error) => error instanceof RaveldexError && error.code === 'INVALID_QUERY');
  assert.throws(() => createRaveldex({ schema: { text: {} } }), (error) => error instanceof RaveldexError && error.code === 'INVALID_SCHEMA');
  assert.equal((await engine.search({ kind: 'all' }, { limit: 0 })).total, 2);
  console.log(JSON.stringify({ arithmetic: 'Pass', scores: expected, postDeleteScore: after.hits[0].score }));
} finally { await engine.dispose(); }
await assert.rejects(engine.search('red'), (error) => error.code === 'DISPOSED');
