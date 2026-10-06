import test from 'node:test';
import assert from 'node:assert/strict';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { DirectoryBuilder, bucketOf, directoryEntries, directoryGet } from '../../dist/core/index/directory.js';
import { inspectIndex } from '../../dist/core/index/invariants.js';
import { exactIds } from '../../dist/core/retrieval/exact.js';

const schema = { text: { title: { boost: 2 }, body: {} }, metadata: { tags: { type: 'string', multi: true, nullable: true }, year: { type: 'number', nullable: true } } };
const drain = (iterator) => {
  let workUnits = 0, steps = 0;
  while (true) {
    const step = iterator.next();
    if (step.done) return { value: step.value, workUnits, steps };
    assert.ok(Number.isSafeInteger(step.value.workUnits) && step.value.workUnits > 0);
    workUnits += step.value.workUnits; steps++;
  }
};
function build(records, limits) {
  const construction = new IndexConstruction({ schema, ...(limits ? { limits } : {}) });
  for (let i = 0; i < records.length; i += 256) drain(construction.append(records.slice(i, i + 256)));
  return drain(construction.finish()).value;
}
const fail = (fn, code) => assert.throws(fn, (error) => error.code === code && error.message === `Raveldex: ${code}`);
const records = [
  { id: '__proto__', text: { title: ['Red red', '', 'car'], body: 'car' }, metadata: { tags: ['A', 'A', null], year: -0 } },
  { id: 'b', text: { title: 'red car', body: ['blue', 'red'] }, metadata: { year: null } },
  { id: 'c', text: { title: 'blue', body: '!!!' } },
  { id: 'none', text: {} },
];

test('field-local frequency, positive-length populations and reverse records are exact and frozen', () => {
  const root = build(records);
  drain(inspectIndex(root));
  assert.equal(root.revision, 0);
  assert.deepEqual(root.counts, { documents: 4, textCodeUnits: 34, tokens: 9, dictionaryEntries: 6, postingEntries: 8 });
  assert.equal(root.fields.title.documents, 3);
  assert.equal(root.fields.title.length, 6);
  assert.equal(root.fields.body.documents, 2);
  assert.equal(root.fields.body.length, 3);
  const red = directoryGet(root.fields.title.terms, 'red');
  assert.equal(red.df, 2); assert.equal(red.frequency, 3);
  assert.equal(red.postings.size, 2);
  assert.equal(directoryGet(red.postings, '__proto__'), 2);
  const doc = directoryGet(root.documents, '__proto__');
  assert.equal(doc.fields.title.length, 3);
  assert.deepEqual({ ...doc.fields.title.terms }, { red: 2, car: 1 });
  assert.deepEqual(doc.metadata.tags, ['A', null]);
  assert.equal(Object.is(doc.metadata.year, -0), false);
  assert.ok(!Object.hasOwn(directoryGet(root.documents, 'c').fields, 'body'));
  assert.equal(Object.keys(directoryGet(root.documents, 'none').fields).length, 0);
  function frozen(value) {
    if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) frozen(child); }
  }
  frozen(root);
  fail(() => new IndexConstruction({ schema, addons: [{}] }), 'MISSING_CAPABILITY');
});

test('empty index has all declared empty field indexes and empty complete exact membership', () => {
  const root = build([]);
  drain(inspectIndex(root));
  assert.equal(root.documents.size, 0);
  assert.deepEqual(root.counts, { documents: 0, textCodeUnits: 0, tokens: 0, dictionaryEntries: 0, postingEntries: 0 });
  assert.deepEqual(drain(exactIds(root, 'red')).value, []);
  assert.deepEqual(drain(exactIds(root, '')).value, []);
});

test('exact term lookup unions selected fields and values once per ID; returns complete owned membership', () => {
  const root = build(records);
  const all = drain(exactIds(root, 'red')).value;
  assert.deepEqual([...all].sort(), ['__proto__', 'b']);
  assert.deepEqual([...drain(exactIds(root, 'car', ['body'])).value], ['__proto__']);
  assert.deepEqual([...drain(exactIds(root, 'blue', ['body'])).value], ['b']);
  assert.deepEqual([...drain(exactIds(root, 'blue', ['title'])).value], ['c']);
  assert.deepEqual(drain(exactIds(root, 'Red')).value, [], 'primitive takes a normalized dictionary key, not raw query text');
  assert.ok(Object.isFrozen(all));
  const selected = ['title']; const lookup = exactIds(root, 'blue', selected); selected[0] = 'body';
  assert.deepEqual(drain(lookup).value, ['c']);
  for (const fields of [[], ['title', 'title'], ['missing'], 'title', ['title', undefined]]) fail(() => exactIds(root, 'red', fields), 'INVALID_QUERY');
  fail(() => exactIds(root, 1), 'INVALID_QUERY');
  fail(() => drain(exactIds(root, '\ud800')), 'INVALID_QUERY');
  fail(() => exactIds(root, 'a'.repeat(257)), 'LIMIT_EXCEEDED');
});

test('admitted input is owned before execution and core retains only frequency/equality structures', () => {
  const config = { schema: structuredClone(schema) };
  const construction = new IndexConstruction(config);
  config.schema.text.title.boost = 9;
  const input = [{ id: 'owned', text: { title: ['Original private source'] }, metadata: { tags: ['Tag'] } }];
  const work = construction.append(input);
  input[0].id = 'changed'; input[0].text.title[0] = 'new'; input[0].metadata.tags.push('later'); input.push({ id: 'extra', text: {} });
  drain(work);
  const root = drain(construction.finish()).value;
  assert.equal(root.configuration.schema.text.title.boost, 2);
  assert.deepEqual(drain(exactIds(root, 'original')).value, ['owned']);
  assert.deepEqual(directoryGet(root.documents, 'owned').metadata.tags, ['Tag']);
  const allowedRoot = ['configuration', 'counts', 'documents', 'fields', 'participants', 'revision'];
  assert.deepEqual(Object.keys(root).sort(), allowedRoot);
  assert.deepEqual(Object.keys(root.participants), []);
  assert.ok(Object.isFrozen(root.participants));
  for (const [, doc] of directoryEntries(root.documents)) {
    assert.deepEqual(Object.keys(doc).sort(), ['fields', 'id', 'metadata', 'textCodeUnits']);
    for (const field of Object.values(doc.fields)) assert.deepEqual(Object.keys(field).sort(), ['length', 'terms']);
  }
  assert.ok(!JSON.stringify(root).includes('Original private source'));
  for (const field of Object.values(root.fields)) {
    for (const [, term] of directoryEntries(field.terms)) {
      assert.deepEqual(Object.keys(term).sort(), ['df', 'frequency', 'postings']);
      for (const [, tf] of directoryEntries(term.postings)) assert.equal(typeof tf, 'number');
    }
  }
});

test('duplicate batches, existing IDs and malformed late records never expose partially constructed roots', () => {
  for (const [invalidRecords, code] of [
    [[{ id: 'x', text: {} }, { id: 'x', text: {} }], 'INVALID_RECORD'],
    [[{ id: 'x', text: {} }, { id: 'bad', text: { title: null } }], 'INVALID_RECORD'],
    [[{ id: 'x', text: { title: 'red' } }, { id: 'bad', text: { title: 'a\ud800' } }], 'INVALID_RECORD'],
    [[{ id: 'x', text: { title: 'red' } }, { id: '\ud800', text: {} }], 'INVALID_RECORD'],
    [[{ id: 'x', text: {} }, { id: 'bad', text: {}, metadata: { tags: ['\ud800'] } }], 'INVALID_RECORD'],
  ]) {
    const construction = new IndexConstruction({ schema });
    fail(() => drain(construction.append(invalidRecords)), code);
    fail(() => construction.finish(), 'INTERNAL_ERROR');
  }
  const existing = new IndexConstruction({ schema }); drain(existing.append([{ id: 'x', text: {} }]));
  fail(() => drain(existing.append([{ id: 'new', text: { title: 'red' } }, { id: 'x', text: {} }])), 'ID_EXISTS');
  fail(() => existing.finish(), 'INTERNAL_ERROR');
});

test('construction cursors must be exhausted; abandonment is terminal before/after first step', () => {
  for (const start of [false, true]) {
    const construction = new IndexConstruction({ schema });
    const iterator = construction.append([{ id: 'x', text: { title: 'red' } }]);
    fail(() => construction.finish(), 'INTERNAL_ERROR');
    fail(() => construction.append([]), 'INTERNAL_ERROR');
    if (start) iterator.next();
    iterator.return();
    fail(() => construction.finish(), 'INTERNAL_ERROR');
  }
  for (const start of [false, true]) {
    const construction = new IndexConstruction({ schema }); drain(construction.append(records));
    const iterator = construction.finish();
    if (start) iterator.next();
    iterator.return();
    fail(() => construction.finish(), 'INTERNAL_ERROR');
  }
  const construction = new IndexConstruction({ schema }); drain(construction.append([])); drain(construction.finish());
  fail(() => construction.append([]), 'INTERNAL_ERROR');
});

test('live corpus limits count tokens, field/term dictionary pairs and distinct postings before publication', () => {
  const cases = [
    [{ maxDocuments: 1 }, [{ id: 'a', text: {} }], { id: 'b', text: {} }],
    [{ maxCorpusTextCodeUnits: 3 }, [{ id: 'a', text: { title: 'abc' } }], { id: 'b', text: { title: '!' } }],
    [{ maxCorpusTokens: 2 }, [{ id: 'a', text: { title: 'a a' } }], { id: 'b', text: { title: 'a' } }],
    [{ maxDictionaryEntries: 2 }, [{ id: 'a', text: { title: 'a', body: 'a' } }], { id: 'b', text: { title: 'b' } }],
    [{ maxPostingEntries: 2 }, [{ id: 'a', text: { title: 'a a', body: 'a' } }], { id: 'b', text: { title: 'a' } }],
  ];
  for (const [limits, accepted, rejected] of cases) {
    drain(inspectIndex(build(accepted, limits)));
    const construction = new IndexConstruction({ schema, limits }); drain(construction.append(accepted));
    fail(() => drain(construction.append([rejected])), 'LIMIT_EXCEEDED');
    fail(() => construction.finish(), 'INTERNAL_ERROR');
  }
  const construction = new IndexConstruction({ schema, limits: { maxMutationBatch: 1 } });
  fail(() => construction.append([{ id: 'a', text: {} }, { id: 'b', text: {} }]), 'LIMIT_EXCEEDED');
  fail(() => construction.finish(), 'INTERNAL_ERROR');
});

test('construction and exact traversal work guards reject complete results rather than returning a subset', () => {
  const limited = new IndexConstruction({ schema, limits: { maxMutationWorkUnits: 1, checkpointWorkUnits: 1 } });
  fail(() => drain(limited.append([{ id: 'a', text: { title: 'red' } }])), 'WORK_LIMIT_EXCEEDED');
  fail(() => limited.finish(), 'INTERNAL_ERROR');
  const finalization = new IndexConstruction({ schema, limits: { maxMutationWorkUnits: 5, checkpointWorkUnits: 1 } });
  for (const id of ['a', 'b', 'c']) drain(finalization.append([{ id, text: {} }]));
  fail(() => drain(finalization.finish()), 'WORK_LIMIT_EXCEEDED');
  fail(() => finalization.finish(), 'INTERNAL_ERROR');
  const root = build(records, { maxSearchWorkUnits: 1, checkpointWorkUnits: 1 });
  fail(() => drain(exactIds(root, 'red')), 'WORK_LIMIT_EXCEEDED');
  const large = Array.from({ length: 101 }, (_, i) => ({ id: `d${i}`, text: { title: 'common' } }));
  assert.equal(drain(exactIds(build(large), 'common')).value.length, 101, 'membership is not maxHits limited');
});

test('opaque keys and adversarial same-bucket collisions preserve every posting and reverse record', () => {
  const collisions = [];
  for (let i = 0; collisions.length < 60; i++) { const id = `collision${i}`; if (bucketOf(id) === '7') collisions.push(id); }
  const ids = ['__proto__', 'constructor', 'prototype', ' A ', 'a', 'A', '😀', ...collisions];
  const root = build(ids.map((id) => ({ id, text: { title: '__proto__ constructor prototype red red' } })));
  drain(inspectIndex(root));
  assert.deepEqual([...drain(exactIds(root, 'red')).value].sort(), [...ids].sort());
  assert.equal(Object.keys(root.documents.buckets['7']).length, 60);
  assert.equal(directoryGet(root.fields.title.terms, 'constructor').df, ids.length);
  assert.equal(directoryGet(root.fields.title.terms, 'prototype').df, ids.length);
  const termRoot = build([{ id: 'term-collision', text: { title: collisions.join(' ') } }]);
  drain(inspectIndex(termRoot));
  assert.equal(Object.keys(termRoot.fields.title.terms.buckets['7']).length, 60);
  for (const term of collisions) assert.deepEqual(drain(exactIds(termRoot, term)).value, ['term-collision']);
});

test('metadata work charges original duplicate entries before canonicalization and enforces its budget', () => {
  const schema = { text: { title: {} }, metadata: { flags: { type: 'boolean', multi: true }, labels: { type: 'string', multi: true } } };
  const run = (flags) => {
    const construction = new IndexConstruction({ schema });
    const work = drain(construction.append([{ id: 'a', text: {}, metadata: { flags } }]));
    const root = drain(construction.finish()).value;
    assert.deepEqual(directoryGet(root.documents, 'a').metadata.flags, [false]);
    return work.workUnits;
  };
  assert.equal(run(Array(128).fill(false)) - run([false]), 127);
  const limits = { maxMutationWorkUnits: 10, checkpointWorkUnits: 1 };
  const accepted = new IndexConstruction({ schema, limits });
  drain(accepted.append([{ id: 'a', text: {}, metadata: { flags: [false] } }]));
  drain(accepted.finish());
  const failed = new IndexConstruction({ schema, limits });
  fail(() => drain(failed.append([{ id: 'a', text: {}, metadata: { flags: Array(128).fill(false) } }])), 'WORK_LIMIT_EXCEEDED');
  fail(() => failed.finish(), 'INTERNAL_ERROR');
  const stringWork = (labels) => {
    const construction = new IndexConstruction({ schema });
    const work = drain(construction.append([{ id: 'a', text: {}, metadata: { labels } }]));
    drain(construction.finish()); return work.workUnits;
  };
  // Each extra four-code-unit string is scanned (4), then charged as Set input (5).
  assert.equal(stringWork(['same', 'same']) - stringWork(['same']), 9);
});

function directory(entries) {
  const builder = new DirectoryBuilder(); for (const [key, value] of entries) builder.set(key, value);
  return drain(builder.seal()).value;
}
function changeTerm(root, fn) {
  const terms = directory([...directoryEntries(root.fields.title.terms)].map(([key, value]) => [key, key === 'red' ? fn(value) : value]));
  return { ...root, fields: { ...root.fields, title: { ...root.fields.title, terms } } };
}
function changeDoc(root, fn) {
  return { ...root, documents: directory([...directoryEntries(root.documents)].map(([key, value]) => [key, key === '__proto__' ? fn(value) : value])) };
}

test('invariant inspection detects frequency, reverse, dangling, field/corpus and directory corruption', () => {
  const root = build(records);
  const changedPosting = (entry, id, tf) => ({ ...entry, postings: directory([...directoryEntries(entry.postings)].map(([key, value]) => [key, key === id ? tf : value])) });
  const corrupt = [
    changeTerm(root, (entry) => changedPosting(entry, '__proto__', 1)),
    changeTerm(root, (entry) => changedPosting(entry, '__proto__', 0)),
    changeTerm(root, (entry) => ({ ...entry, df: entry.df + 1 })),
    changeTerm(root, (entry) => ({ ...entry, frequency: entry.frequency + 1 })),
    changeTerm(root, (entry) => ({ ...entry, postings: directory([...directoryEntries(entry.postings), ['dangling', 1]]) })),
    changeTerm(root, (entry) => ({ ...entry, postings: directory([...directoryEntries(entry.postings)].filter(([id]) => id !== '__proto__')) })),
    changeDoc(root, (doc) => ({ ...doc, fields: { ...doc.fields, title: { length: 1, terms: { car: 1 } } } })),
    changeDoc(root, (doc) => ({ ...doc, fields: { ...doc.fields, title: { ...doc.fields.title, length: 4 } } })),
    changeDoc(root, (doc) => ({ ...doc, id: 'wrong' })),
    { ...root, fields: { ...root.fields, title: { ...root.fields.title, length: 7 } } },
    { ...root, fields: { ...root.fields, title: { ...root.fields.title, documents: 4 } } },
    { ...root, fields: { body: root.fields.body } },
    { ...root, documents: { ...root.documents, size: 999 } },
    ...Object.keys(root.counts).map((key) => ({ ...root, counts: { ...root.counts, [key]: root.counts[key] + 1 } })),
  ];
  for (const candidate of corrupt) fail(() => drain(inspectIndex(candidate)), 'INTERNAL_ERROR');
  const term = directoryGet(root.fields.title.terms, 'red');
  const badPostingRoot = changeTerm(root, () => ({ ...term, postings: directory([['dangling', 1]]) }));
  fail(() => drain(exactIds(badPostingRoot, 'red', ['title'])), 'INTERNAL_ERROR');
});
