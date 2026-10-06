import {
  QUERY_SCHEMA, generatedQueries, text, group, exact, prefix, and, or, not, eq,
} from '../ranking/query.mjs';

export const MUTATION_SCHEMA = QUERY_SCHEMA;
export const MUTATION_SEEDS = [0x5eed1004, 0xc0ffee04, 0x00001004];
export const GENERATED_MUTATION_COUNT = 160;

export const mutationQueries = [
  { kind: 'all' }, { kind: 'none' }, '', 'red', 'red car', 'blue', 'unique',
  text('red car', ['title'], 'or'), text('red', ['body']), text('file', ['notes']),
  group([prefix('ca', 0.25), exact('CAR')]),
  group([prefix('re'), exact('red', 0.5)], ['title', 'body']),
  and(text('red'), eq('kind', 'Guide')),
  or(and(text('red'), text('absent')), text('blue')),
  or({ kind: 'all' }, text('red car', undefined, 'or')),
  and(text('red'), text('RED')), not(text('red')), not(not(text('red'))),
  eq('kind', null), eq('tags', 'red'), eq('year', -0), eq('numbers', null), eq('enabled', false),
  '½', text('1/2', ['title']), 'ﬁle', group([prefix('½')], ['title']),
];

const initial = [
  { id: 'a', text: { title: 'red red car', body: 'red blue' }, metadata: { kind: 'Guide', tags: ['red', 'red', null], year: -0, numbers: [-0, 0, null] } },
  { id: 'b', text: { title: 'red car', body: ['red', 'red'] }, metadata: { kind: 'guide', enabled: false } },
  { id: 'c', text: { title: 'blue', body: '' }, metadata: { kind: null, tags: [] } },
  { id: '__proto__', text: { title: 'unique', notes: 'ﬁle' }, metadata: { tags: ['red'] } },
  { id: 'constructor', text: { title: ['½', '\uFDFA'], body: '1/2' } },
  { id: 'tokenless', text: { title: ['', '😀!\u0301'], body: [], notes: '' }, metadata: { year: null } },
  { id: 'missing', text: {}, metadata: { kind: 'Guide' } },
  { id: '😀', text: { title: 'red red red' }, metadata: { tags: [null], enabled: true } },
];

export function deterministicMutations() {
  const added = { id: 'later', text: { title: 'red car', body: ['blue', 'green'] }, metadata: { kind: 'Guide', numbers: [null, 1, 1] } };
  const identical = { id: 'a', text: { title: 'red red car', body: 'red blue' }, metadata: { kind: 'Guide', tags: ['red', 'red', null], year: -0, numbers: [-0, 0, null] } };
  return {
    initial: structuredClone(initial),
    operations: [
      { kind: 'addMany', input: [] },
      { kind: 'remove', input: [] },
      { kind: 'remove', input: ['absent', 'never'] },
      { kind: 'add', input: added },
      { kind: 'replace', input: identical },
      { kind: 'add', input: structuredClone(identical), error: 'ID_EXISTS' },
      { kind: 'replace', input: { id: 'absent', text: { title: 'car' } }, error: 'ID_NOT_FOUND' },
      { kind: 'addMany', input: [{ id: 'fresh', text: { title: 'fresh' } }, identical], error: 'ID_EXISTS' },
      { kind: 'addMany', input: [{ id: 'batch', text: { title: 'red' } }, { id: 'batch', text: { title: 'blue' } }], error: 'INVALID_RECORD' },
      { kind: 'remove', input: ['a', 'a'], error: 'INVALID_OPTIONS' },
      { kind: 'replace', input: { id: 'b', text: { title: '', body: [], notes: '😀!' }, metadata: { kind: null, numbers: [-0, 0, null, null] } } },
      { kind: 'replace', input: { id: 'tokenless', text: { body: 'red red red', notes: ['blue', 'ﬁle'] }, metadata: { kind: 'Guide', enabled: false } } },
      { kind: 'replace', input: { id: 'missing', text: {}, metadata: { kind: null, tags: [null, 'red', 'red'] } } },
      { kind: 'remove', input: '__proto__' },
      { kind: 'addMany', input: [
        { id: '__proto__', text: { title: 'carbon cars', body: 'red' } },
        { id: '\uE000', text: { title: 'red', body: ['red', 'red'] } },
        { id: '𐐀', text: { title: 'red', body: 'car' } },
      ] },
      { kind: 'remove', input: ['a', 'c', 'absent', '😀'] },
      { kind: 'replace', input: { id: 'constructor', text: {}, metadata: { tags: [], year: 0 } } },
      { kind: 'remove', input: ['later', 'tokenless', '__proto__', '\uE000', '𐐀'] },
      { kind: 'clear' },
      { kind: 'clear' },
      { kind: 'addMany', input: structuredClone(initial).reverse() },
      { kind: 'clear' },
      { kind: 'add', input: { id: 'new-era', text: { title: 'unique unique', notes: 'red car' }, metadata: { kind: 'Guide' } } },
      { kind: 'replace', input: { id: 'new-era', text: {}, metadata: { kind: null } } },
      { kind: 'remove', input: 'new-era' },
      { kind: 'remove', input: 'new-era' },
      { kind: 'add', input: { id: 'new-era', text: { title: '½', body: 'red red' } } },
    ],
  };
}

function random(seed) {
  let state = seed;
  return (bound) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return (state >>> 16) % bound;
  };
}

const spellings = ['red', 'RED', 'red', 'car', 'cars', 'carbon', 'blue', 'green', 'ﬁle', '½', 'a\u0301', '\uFDFA', '𐐀𐐁'];
const ids = ['__proto__', 'constructor', 'prototype', '0', '00', 'A', 'a', ' a ', '😀', '\uE000', '𐐀', ...Array.from({ length: 35 }, (_, i) => `mutation:${i}`)];

/** Original source fixtures and policy cases; no production state feeds generation. */
export function generatedMutationSequence(seed, count = GENERATED_MUTATION_COUNT) {
  const next = random(seed);
  const makeRecord = (id) => {
    const text = {};
    const phrase = () => Array.from({ length: 1 + next(8) }, () => spellings[next(spellings.length)]).join(' — ');
    for (const field of ['title', 'body', 'notes']) {
      switch (next(6)) {
        case 0: break;
        case 1: text[field] = ''; break;
        case 2: text[field] = ' 😀!\u0301 '; break;
        case 3: text[field] = []; break;
        case 4: text[field] = phrase(); break;
        case 5: text[field] = ['', phrase(), '', phrase()]; break;
      }
    }
    const metadata = {};
    if (next(4)) metadata.kind = [null, 'guide', 'Guide', ' guide '][next(4)];
    if (next(4)) metadata.tags = Array.from({ length: next(5) }, () => [null, 'red', 'Red', 'blue', ''][next(5)]);
    if (next(4)) metadata.year = [null, -0, 1, 2, 3][next(5)];
    if (next(4)) metadata.enabled = Boolean(next(2));
    if (next(4)) metadata.numbers = Array.from({ length: next(5) }, () => [null, -0, 1, 2, 3][next(5)]);
    return { id, text, metadata };
  };
  const original = ids.slice(0, 12).map(makeRecord);
  const live = new Map(original.map((record) => [record.id, record]));
  const operations = [
    { kind: 'add', input: structuredClone(original[0]), error: 'ID_EXISTS' },
    { kind: 'replace', input: { id: 'always-absent', text: {} }, error: 'ID_NOT_FOUND' },
    { kind: 'addMany', input: [{ id: 'duplicate-boundary', text: {} }, { id: 'duplicate-boundary', text: {} }], error: 'INVALID_RECORD' },
    { kind: 'remove', input: [original[0].id, original[0].id], error: 'INVALID_OPTIONS' },
    { kind: 'remove', input: [] },
    { kind: 'addMany', input: [] },
  ].slice(0, count);
  for (let index = operations.length; index < count; index++) {
    // Force clear/repopulate epochs without making most states empty.
    if (index > 0 && index % 40 === 0) {
      operations.push({ kind: 'clear' });
      live.clear();
      continue;
    }
    const selected = ids[next(ids.length)];
    const current = [...live.values()];
    switch (next(8)) {
      case 0: case 1: {
        const record = makeRecord(selected);
        const error = live.has(selected) ? 'ID_EXISTS' : undefined;
        operations.push({ kind: 'add', input: record, ...(error ? { error } : {}) });
        if (!error) live.set(selected, record);
        break;
      }
      case 2: case 3: {
        const id = current.length && next(4) ? current[next(current.length)].id : selected;
        const record = next(5) === 0 && live.has(id) ? structuredClone(live.get(id)) : makeRecord(id);
        const error = live.has(id) ? undefined : 'ID_NOT_FOUND';
        operations.push({ kind: 'replace', input: record, ...(error ? { error } : {}) });
        if (!error) live.set(id, record);
        break;
      }
      case 4: {
        const chosen = new Set(Array.from({ length: next(6) }, () => ids[next(ids.length)]));
        if (current.length && next(2)) chosen.add(current[next(current.length)].id);
        const input = [...chosen];
        operations.push({ kind: 'remove', input: input.length === 1 && next(2) ? input[0] : input });
        for (const id of input) live.delete(id);
        break;
      }
      case 5: {
        const batch = Array.from({ length: next(5) }, () => makeRecord(ids[next(ids.length)]));
        const duplicate = new Set(batch.map(({ id }) => id)).size < batch.length;
        const conflict = batch.some(({ id }) => live.has(id));
        const error = duplicate ? 'INVALID_RECORD' : conflict ? 'ID_EXISTS' : undefined;
        operations.push({ kind: 'addMany', input: batch, ...(error ? { error } : {}) });
        if (!error) for (const record of batch) live.set(record.id, record);
        break;
      }
      case 6: operations.push({ kind: 'remove', input: ['always-absent'] }); break;
      case 7: operations.push({ kind: 'addMany', input: [] }); break;
    }
  }
  return { initial: original, operations, queries: generatedQueries(seed, 8) };
}
