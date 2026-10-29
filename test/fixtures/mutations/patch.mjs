/** Handwritten patch/full-record pairs. Expected records are not produced by a
 * merge helper or production patch output. They deliberately spell every field. */
export const PATCH_SCHEMA = {
  text: { title: { boost: 2 }, body: {}, notes: { boost: 0.5 } },
  metadata: {
    kind: { type: 'string', nullable: true },
    tags: { type: 'string', multi: true, nullable: true },
    year: { type: 'number', nullable: true },
    enabled: { type: 'boolean' },
  },
};

export const patchRecords = [
  { id: 'a', text: { title: 'red red car', body: ['red blue', 'green'], notes: 'ﬁle café' }, metadata: { kind: 'Guide', tags: ['red', 'red', null], year: -0, enabled: true } },
  { id: 'b', text: { title: 'red car', body: ['red', 'blue'], notes: [] }, metadata: { kind: 'guide', tags: ['blue'], year: 10, enabled: false } },
  { id: 'c', text: { title: 'blue', body: '' }, metadata: { kind: null, tags: [], year: null } },
  { id: 'empty', text: {}, metadata: {} },
];

export const patchPairs = [
  {
    name: 'one scalar field preserves every untouched original and canonical metadata',
    request: { id: 'a', set: { text: { title: 'blue car' } } },
    replacement: { id: 'a', text: { title: 'blue car', body: ['red blue', 'green'], notes: 'ﬁle café' }, metadata: { kind: 'Guide', tags: ['red', null], year: 0, enabled: true } },
  },
  {
    name: 'array assignment replaces all values and changes phrase adjacency',
    request: { id: 'a', set: { text: { body: ['red', 'blue'] } } },
    replacement: { id: 'a', text: { title: 'blue car', body: ['red', 'blue'], notes: 'ﬁle café' }, metadata: { kind: 'Guide', tags: ['red', null], year: 0, enabled: true } },
  },
  {
    name: 'unset removes entire original fields',
    request: { id: 'a', unset: { text: ['title', 'notes'] } },
    replacement: { id: 'a', text: { body: ['red', 'blue'] }, metadata: { kind: 'Guide', tags: ['red', null], year: 0, enabled: true } },
  },
  {
    name: 'null is a value and metadata arrays are native set-like values',
    request: { id: 'a', set: { metadata: { kind: null, tags: ['green', 'green', null], year: -0, enabled: false } } },
    replacement: { id: 'a', text: { body: ['red', 'blue'] }, metadata: { kind: null, tags: ['green', null], year: 0, enabled: false } },
  },
  {
    name: 'metadata unset differs from null and false',
    request: { id: 'a', unset: { metadata: ['kind', 'year'] } },
    replacement: { id: 'a', text: { body: ['red', 'blue'] }, metadata: { tags: ['green', null], enabled: false } },
  },
  {
    name: 'tokenless empty values stay present rather than becoming omissions',
    request: { id: 'a', set: { text: { title: [], body: '', notes: ['', '😀!\u0301'] } } },
    replacement: { id: 'a', text: { title: [], body: '', notes: ['', '😀!\u0301'] }, metadata: { tags: ['green', null], enabled: false } },
  },
  {
    name: 'unset one empty value removes presence',
    request: { id: 'a', unset: { text: ['body'] } },
    replacement: { id: 'a', text: { title: [], notes: ['', '😀!\u0301'] }, metadata: { tags: ['green', null], enabled: false } },
  },
  {
    name: 'unsetting an absent declared field still executes a replacement',
    request: { id: 'a', unset: { text: ['body'] } },
    replacement: { id: 'a', text: { title: [], notes: ['', '😀!\u0301'] }, metadata: { tags: ['green', null], enabled: false } },
  },
  {
    name: 'one patch restores lexical state and replaces metadata arrays',
    request: { id: 'a', set: { text: { title: 'red red red', notes: ['red blue', 'ﬁle café'] }, metadata: { tags: [], year: 4 } } },
    replacement: { id: 'a', text: { title: 'red red red', notes: ['red blue', 'ﬁle café'] }, metadata: { tags: [], year: 4, enabled: false } },
  },
  {
    name: 'another target keeps all other documents untouched',
    request: { id: 'b', set: { text: { body: ['red blue'] }, metadata: { tags: ['red'] } } },
    replacement: { id: 'b', text: { title: 'red car', body: ['red blue'], notes: [] }, metadata: { kind: 'guide', tags: ['red'], year: 10, enabled: false } },
  },
  {
    name: 'missing fields accept present empty arrays and nullable values',
    request: { id: 'empty', set: { text: { body: [] }, metadata: { kind: null, tags: [null] } } },
    replacement: { id: 'empty', text: { body: [] }, metadata: { kind: null, tags: [null] } },
  },
  {
    name: 'all fields can be removed without deleting the record',
    request: { id: 'a', unset: { text: ['title', 'body', 'notes'], metadata: ['kind', 'tags', 'year', 'enabled'] } },
    replacement: { id: 'a', text: {}, metadata: {} },
  },
];

const text = (value, fields) => ({ kind: 'text', text: value, ...(fields ? { fields } : {}) });
export const patchQueries = [
  { kind: 'all' }, { kind: 'none' }, '', 'red', 'blue', 'red car',
  text('red', ['title']), text('file', ['notes']),
  { kind: 'eq', field: 'kind', value: null },
  { kind: 'eq', field: 'tags', value: 'red' },
  { kind: 'eq', field: 'year', value: 0 },
  { kind: 'eq', field: 'enabled', value: false },
  { kind: 'phrase', text: 'red blue' },
  { kind: 'phrase', text: 'red blue', fields: ['body'] },
  { kind: 'or', children: [{ kind: 'phrase', text: 'red blue' }, text('file')] },
  { kind: 'and', children: [text('red'), { kind: 'eq', field: 'tags', value: 'blue' }] },
  { kind: 'not', child: text('red') },
  { kind: 'group', variants: [{ text: 'ca', match: 'prefix', weight: 1 }], fields: ['title', 'notes'] },
];

export const invalidPatchCases = [
  { name: 'text null', request: { id: 'a', set: { text: { title: null } } }, code: 'INVALID_RECORD' },
  { name: 'metadata scalar for multivalue field', request: { id: 'a', set: { metadata: { tags: 'red' } } }, code: 'INVALID_RECORD' },
  { name: 'metadata array for scalar field', request: { id: 'a', set: { metadata: { year: [1] } } }, code: 'INVALID_RECORD' },
  { name: 'nonnullable null', request: { id: 'a', set: { metadata: { enabled: null } } }, code: 'INVALID_RECORD' },
  { name: 'nonfinite number', request: { id: 'a', set: { metadata: { year: Infinity } } }, code: 'INVALID_RECORD' },
  { name: 'undefined does not unset', request: { id: 'a', set: { metadata: { kind: undefined } } }, code: 'INVALID_RECORD' },
  { name: 'dotted paths are not schema fields', request: { id: 'a', set: { text: { 'title.0': 'blue' } } }, code: 'INVALID_RECORD' },
  { name: 'unknown unset', request: { id: 'a', unset: { text: ['unknown'] } }, code: 'INVALID_RECORD' },
  { name: 'set and unset conflict', request: { id: 'a', set: { text: { title: 'blue' } }, unset: { text: ['title'] } }, code: 'INVALID_RECORD' },
  { name: 'empty action', request: { id: 'a', set: { text: {} } }, code: 'INVALID_RECORD' },
  { name: 'malformed UTF16 content', request: { id: 'a', set: { text: { title: '\ud800' } } }, code: 'INVALID_RECORD' },
  { name: 'malformed UTF16 metadata', request: { id: 'a', set: { metadata: { kind: '\udfff' } } }, code: 'INVALID_RECORD' },
];
