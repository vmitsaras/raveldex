// Reviewer-only transient probe. Run from the Raveldex checkout after npm run build.
import assert from 'node:assert/strict';
const base = new URL(`file://${process.cwd()}/`);
const { IndexConstruction } = await import(new URL('./dist/core/index/construction.js', base));
const { directoryEntries, directoryGet, bucketOf } = await import(new URL('./dist/core/index/directory.js', base));
const { inspectIndex } = await import(new URL('./dist/core/index/invariants.js', base));
const { exactIds } = await import(new URL('./dist/core/retrieval/exact.js', base));
const drain = (it) => { let units = 0, steps = 0; for (;;) { const n = it.next(); if (n.done) return { value: n.value, units, steps }; units += n.value.workUnits; steps++; } };
const build = (schema, records, limits) => { const c = new IndexConstruction({ schema, ...(limits ? { limits } : {}) }); for (let i = 0; i < records.length; i += 256) drain(c.append(records.slice(i, i + 256))); const f = drain(c.finish()); return { root: f.value, work: c.workUnits }; };
const schema = { text: { title: {}, body: {}, toString: {} }, metadata: { m: { type: 'string', multi: true, nullable: true } } };
const vocab = ['A', 'a\u0301', '½', 'ﬃ', 'İ', 'ΟΣ', '𐐀', '東京', 'constructor', 'toString', '９', '\uFDFA', '!!!'];
let state = 0x783e4917;
const rnd = n => { state = (Math.imul(state, 1103515245) + 12345) >>> 0; return (state >>> 16) % n; };
let corpora = 0, lookups = 0;
for (let trial = 0; trial < 80; trial++) {
  const records = Array.from({ length: rnd(20) }, (_, i) => ({ id: `id${trial}:${i}`, text: Object.fromEntries(['title', 'body', 'toString'].filter(() => rnd(3)).map(f => [f, Array.from({ length: rnd(5) }, () => Array.from({ length: rnd(8) }, () => vocab[rnd(vocab.length)]).join(' ! '))])), metadata: { m: ['x', 'x', null] } }));
  const { root } = build(schema, records); drain(inspectIndex(root));
  let tokens = 0, dict = 0, postings = 0, textCodeUnits = 0;
  const expected = new Map(Object.keys(schema.text).map(f => [f, new Map()]));
  for (const r of records) for (const [f, values] of Object.entries(r.text)) {
    const local = new Map();
    for (const value of values) { textCodeUnits += value.length; for (const [raw] of value.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)) { const t = raw.normalize('NFKC').toLowerCase(); local.set(t, (local.get(t) || 0) + 1); tokens++; } }
    const rev = directoryGet(root.documents, r.id).fields[f];
    if (!local.size) assert.equal(rev, undefined); else { assert.equal(rev.length, [...local.values()].reduce((a, b) => a + b, 0)); assert.deepEqual({ ...rev.terms }, Object.fromEntries(local)); }
    for (const [t, tf] of local) { const byId = expected.get(f).get(t) || new Map(); byId.set(r.id, tf); expected.get(f).set(t, byId); }
  }
  for (const [f, terms] of expected) {
    const field = root.fields[f]; dict += terms.size; const populated = new Set(); let len = 0;
    for (const [t, byId] of terms) {
      postings += byId.size; const entry = directoryGet(field.terms, t);
      assert.equal(entry.df, byId.size); assert.equal(entry.frequency, [...byId.values()].reduce((a, b) => a + b, 0)); assert.deepEqual(new Map(directoryEntries(entry.postings)), byId);
      for (const [id, tf] of byId) { populated.add(id); len += tf; }
      assert.deepEqual(new Set(drain(exactIds(root, t, [f])).value), new Set(byId.keys())); lookups++;
    }
    assert.equal(field.documents, populated.size); assert.equal(field.length, len);
  }
  assert.deepEqual(root.counts, { documents: records.length, textCodeUnits, tokens, dictionaryEntries: dict, postingEntries: postings }); corpora++;
}
const sample = [{ id: 'a', text: { title: 'red red blue', body: ['half ½', '𐐀'] }, metadata: { m: ['x', 'x', null] } }, { id: 'b', text: { toString: 'red' } }];
const c0 = new IndexConstruction({ schema }); const steps = drain(c0.append(sample)).steps; const finishSteps = drain(c0.finish()).steps;
let abandoned = 0;
for (const phase of ['append', 'finish']) for (let stop = 0; stop <= (phase === 'append' ? steps : finishSteps); stop++) {
  const c = new IndexConstruction({ schema }); if (phase === 'finish') drain(c.append(sample)); const it = phase === 'append' ? c.append(sample) : c.finish();
  for (let i = 0; i < stop; i++) assert.equal(it.next().done, false);
  it.return(); assert.throws(() => c.finish(), e => e.code === 'INTERNAL_ERROR'); assert.throws(() => c.append([]), e => e.code === 'INTERNAL_ERROR'); abandoned++;
}
const sameBucket = []; for (let i = 0; sameBucket.length < 1000; i++) { const id = `collision:${i}`; if (bucketOf(id) === '13') sameBucket.push(id); }
const collisionRoot = build(schema, sameBucket.map(id => ({ id, text: { title: 'common common' } }))).root; drain(inspectIndex(collisionRoot)); assert.deepEqual(new Set(drain(exactIds(collisionRoot, 'common')).value), new Set(sameBucket));
const flagsSchema = { text: { t: {} }, metadata: { flags: { type: 'boolean', multi: true } } };
const costs = [1, 128].map(size => { const c = new IndexConstruction({ schema: flagsSchema }); const append = drain(c.append([{ id: 'a', text: {}, metadata: { flags: Array(size).fill(false) } }])); const finish = drain(c.finish()); return { inputEntries: size, appendWork: append.units, finalizationWork: finish.units, totalWork: c.workUnits }; });
assert.equal(costs[1].appendWork - costs[0].appendWork, 127);
console.log(JSON.stringify({ corpora, fieldExactLookups: lookups, abandonmentCheckpoints: abandoned, collisionDocuments: sameBucket.length, collisionBucket: Object.keys(collisionRoot.documents.buckets['13']).length, metadataCosts: costs }));
