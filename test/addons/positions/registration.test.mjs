import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhrases } from '../../../dist/addons/phrases/mixed.js';
import { createSourceProvider } from '../../../dist/addons/phrases/source.js';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { emptyDirectory } from '../../../dist/core/index/staging.js';
import { executeSearch } from '../../../dist/core/query/search.js';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../../oracle/phrases.mjs';
import { compare, drain, extension, setup } from './helpers.mjs';

const schema = { text: { title: { boost: 2 }, body: {}, notes: {} } };
const strategies = { title: 'source', body: 'positions', notes: 'positions' };
const records = [
  { id: 'title', text: { title: 'red blue', body: 'red gap blue', notes: '' } },
  { id: 'body', text: { title: 'red', body: 'RED—blue', notes: ['red', 'blue'] } },
  { id: 'notes', text: { title: 'blue', body: [], notes: ['other', 'red blue'] } },
  { id: 'boundary', text: { title: 'red', body: 'blue', notes: [] } }, { id: 'missing', text: {} },
];
const providers = () => [createSourceProvider({ fields: ['title'] }), createPositionProvider({ fields: ['body'], id: 'body-positions' }), createPositionProvider({ fields: ['notes'], id: 'notes-positions', offsets: ['notes'] })];

test('mixed strategy options are owned before mutation and reject getters, invalid strategies and unsupported scope', async () => {
  let getterCalls = 0;
  for (const options of [
    {}, { fields: {} }, { fields: [] }, { fields: { title: 'auto' } }, { fields: { title: true } }, { fields: { 'bad-name': 'source' } },
    { fields: { constructor: 'source' } }, { fields: { title: 'source' }, slop: 1 }, { fields: { title: 'source' }, maxWorkUnits: 0 },
    { fields: { get title() { getterCalls++; return 'source'; } } }, { fields: { title: 'source' }, get id() { getterCalls++; return 'mixed'; } },
  ]) assert.throws(() => createPhrases(options), { code: 'INVALID_OPTIONS' });
  assert.equal(getterCalls, 0);
  const fields = { ...strategies }, options = { fields, id: 'owned-mixed', maxWorkUnits: 100_000 }, phrases = createPhrases(options);
  fields.title = 'positions'; fields.body = 'source'; delete fields.notes; fields.extra = 'source'; options.id = 'later'; options.maxWorkUnits = 1;
  const selected = setup(schema, { addons: [...providers(), phrases] }); await selected.call('addMany', records);
  compare(await selected.call('search', extension('red blue'), { limit: 100 }), sourcePhraseQueryResult(scanPhraseSourceCorpus(records, schema), { kind: 'phrase', text: 'red blue' }, { limit: 100 }), 1);
  assert.equal(selected.engine.root.configuration.capabilities.providers.phrases.manifest.id, 'owned-mixed');
  await selected.engine.dispose();
});

test('mixed fields require their declared provider independently of registration order, complete matches or empty candidate sets', async () => {
  const source = createSourceProvider({ fields: ['title'] }), position = createPositionProvider({ fields: ['body'] });
  for (const addons of [
    [createPhrases({ fields: { title: 'source', body: 'positions' } }), source],
    [createPhrases({ fields: { title: 'source', body: 'positions' } }), position],
    [createPhrases({ fields: { title: 'positions' } }), source],
  ]) assert.throws(() => setup(schema, { addons }), { code: 'MISSING_CAPABILITY' });
  const conflict = providers(); conflict.push(createPositionProvider({ fields: ['body'], id: 'conflicting-body' }), createPhrases({ fields: strategies }));
  assert.throws(() => setup(schema, { addons: conflict }), { code: 'INCOMPATIBLE_CAPABILITY' });
  const declared = createPhrases({ fields: strategies }), deficient = { ...declared, manifest: { ...declared.manifest, requires: declared.manifest.requires.filter(ref => ref.id !== 'positions:notes') } };
  assert.throws(() => setup(schema, { addons: [...providers(), deficient] }), { code: 'MISSING_CAPABILITY' });
  const addons = [...providers(), declared], first = setup(schema, { addons }), reversed = setup(schema, { addons: [...addons].reverse() });
  await first.call('addMany', records); await reversed.call('addMany', records);
  for (const text of ['red blue', '', 'absent']) assert.deepEqual(await first.call('search', extension(text), { limit: 100 }), await reversed.call('search', extension(text), { limit: 100 }));
  const root = first.engine.root, state = root.participants['body-positions'];
  for (const text of ['', 'absent']) {
    const corrupt = Object.freeze({ ...root, participants: Object.freeze({ ...root.participants, 'body-positions': undefined }) });
    assert.throws(() => drain(executeSearch(corrupt, extension(text))), { code: 'MISSING_CAPABILITY' });
  }
  // A title source match must not hide a broken authoritative body record.
  const missing = Object.freeze({ ...state, records: emptyDirectory(), retainedEntries: 0, occurrenceCount: 0, offsetCount: 0, termEntries: 0, termCodeUnits: 0 });
  const corrupt = Object.freeze({ ...root, participants: Object.freeze({ ...root.participants, 'body-positions': missing }) });
  assert.throws(() => drain(executeSearch(corrupt, extension('red blue'))), { code: 'MISSING_CAPABILITY' });
  await first.engine.dispose(); await reversed.engine.dispose();
});

test('mixed phrase work cap covers preparation and both representations across every leaf in one operation', async () => {
  const original = createPhrases({ fields: strategies }); let measuredWork = 0;
  const measured = { ...original, refinement: { ...original.refinement, *prepare(context) {
    const cursor = original.refinement.prepare(context); let prepared;
    try { for (;;) { const next = cursor.next(); if (next.done) { prepared = next.value; break; } measuredWork += next.value.workUnits; yield next.value; } }
    finally { cursor.return(undefined); }
    return { *test(id) { const test = prepared.test(id); try { for (;;) { const next = test.next(); if (next.done) return next.value; measuredWork += next.value.workUnits; yield next.value; } } finally { test.return(false); } } };
  } } };
  const baseline = setup(schema, { addons: [...providers(), measured] }); await baseline.call('addMany', records);
  const expected = await baseline.call('search', extension('red blue'), { limit: 0 }); assert.ok(measuredWork > 0); await baseline.engine.dispose();
  const capped = setup(schema, { addons: [...providers(), createPhrases({ fields: strategies, maxWorkUnits: measuredWork })] }); await capped.call('addMany', records);
  assert.deepEqual(await capped.call('search', extension('red blue'), { limit: 0 }), expected);
  const old = capped.engine.root; await assert.rejects(capped.call('search', { kind: 'or', children: [extension('red blue'), extension('red blue')] }, { limit: 0 }), { code: 'WORK_LIMIT_EXCEEDED' });
  assert.equal(capped.engine.root, old); assert.equal(capped.host.pending, 0); await capped.engine.dispose();
});
