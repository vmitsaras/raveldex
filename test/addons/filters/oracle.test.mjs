import assert from 'node:assert/strict';
import test from 'node:test';
import { createFilters } from '../../../dist/addons/filters/index.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { compare, fields, nativeQuery, range, records, scanFilterResult, set, setup } from './helpers.mjs';

const pages = [{ limit: 0 }, { limit: 1 }, { limit: 100 }, { offset: 2, limit: 3 }];
const and = (...children) => ({ kind: 'and', children });
const or = (...children) => ({ kind: 'or', children });
const not = child => ({ kind: 'not', child });

test('nested typed filters qualify the whole set before pages and preserve native Boolean scores', async () => {
  const state = setup(); await state.call('addMany', records);
  const numeric = range({ field: 'price', gte: 10, lte: 20 });
  const red = set({ field: 'tags', values: ['red'] });
  const nullTags = set({ field: 'tags', values: [null] });
  const active = set({ field: 'active', values: [true] });
  const queries = [
    numeric, red, nullTags, not(nullTags), and(numeric, red), or(numeric, red),
    and('alpha', numeric), or('alpha', numeric), not(and('alpha', numeric)),
    and(or('alpha', red), not(numeric)), or(and('alpha', red), and('beta', numeric)),
    and(or(red, nullTags), active), or(and(red, active), not(or(numeric, nullTags))),
    and({ kind: 'all' }, red, red), or({ kind: 'none' }, not(red)),
    and({ kind: 'eq', field: 'status', value: 'open' }, numeric),
    or({ kind: 'group', variants: [{ text: 'al', match: 'prefix', weight: 0.25 }, { text: 'beta', match: 'exact', weight: 0.75 }] }, and(numeric, red)),
    and({ kind: 'text', text: 'alpha beta', operator: 'or', fields: ['title'] }, or(red, numeric)),
    and(not({ kind: 'text', text: 'gamma', fields: ['body'] }), range({ field: 'quality', gt: -1, lt: 20 })),
    and(range({ field: 'quality', gte: 0 }), nullTags),
  ];
  let comparisons = 0;
  for (const query of queries) for (const page of pages) {
    const actual = await state.call('search', nativeQuery(query), page);
    compare(actual, scanFilterResult(records, query, page), 1); comparisons++;
  }
  assert.equal(comparisons, 80);
  const lexical = await state.call('search', 'alpha', { limit: 100 });
  const filtered = await state.call('search', nativeQuery(and('alpha', numeric)), { limit: 100 });
  for (const hit of filtered.hits) assert.equal(hit.score, lexical.hits.find(candidate => candidate.id === hit.id).score);
  const filterOnlyBranch = await state.call('search', nativeQuery(or({ kind: 'text', text: 'unseen' }, numeric)), { limit: 100 });
  assert.ok(filterOnlyBranch.hits.every(hit => hit.score === 0));
  await state.call('dispose');
});

function randomGenerator(seed) {
  let state = seed >>> 0;
  return maximum => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % maximum; };
}
const vocabulary = ['alpha', 'beta', 'gamma', 'delta'];
const tags = ['red', 'blue', '', '10', 'é', null];
function generatedCorpus(seed) {
  const random = randomGenerator(seed), inputs = [];
  for (let index = 0; index < 32; index++) {
    const metadata = {};
    if (random(5)) metadata.price = Array.from({ length: random(5) }, () => random(5) ? random(31) - 10 : null);
    if (random(5)) metadata.quality = (random(25) - 10) / 2;
    if (random(5)) metadata.tags = Array.from({ length: random(5) }, () => tags[random(tags.length)]);
    if (random(5)) metadata.status = ['', 'open', 'closed', '10'][random(4)];
    if (random(5)) metadata.active = Array.from({ length: random(4) }, () => [false, true, null][random(3)]);
    const text = {};
    if (random(5)) text.title = Array.from({ length: random(6) }, () => vocabulary[random(4)]).join(' ');
    if (random(5)) text.body = Array.from({ length: random(3) }, () => Array.from({ length: random(6) }, () => vocabulary[random(4)]).join(' '));
    inputs.push({ id: `${seed}-${String(index).padStart(2, '0')}`, text, metadata });
  }
  return inputs;
}
function generatedQuery(random, depth = 0) {
  const kind = random(depth < 3 ? 10 : 6);
  if (kind === 0) {
    const lower = random(20) - 10;
    return range({ field: random(2) ? 'price' : 'quality', [random(2) ? 'gt' : 'gte']: lower, [random(2) ? 'lt' : 'lte']: lower + random(20) });
  }
  if (kind === 1) return set({ field: 'tags', values: Array.from({ length: 1 + random(3) }, () => tags[random(tags.length)]) });
  if (kind === 2) return set({ field: 'active', values: Array.from({ length: 1 + random(3) }, () => [false, true, null][random(3)]) });
  if (kind === 3) return { kind: 'text', text: `${vocabulary[random(4)]} ${vocabulary[random(4)]}`, operator: random(2) ? 'and' : 'or', fields: random(2) ? ['title'] : ['body', 'title'] };
  if (kind === 4) return { kind: 'group', variants: [{ text: 'al', match: 'prefix', weight: 0.5 }, { text: vocabulary[random(4)], match: 'exact', weight: 0.9 }] };
  if (kind === 5) return { kind: random(2) ? 'all' : 'none' };
  if (kind === 6) return not(generatedQuery(random, depth + 1));
  return { kind: kind === 7 ? 'and' : 'or', children: Array.from({ length: 2 + random(2) }, () => generatedQuery(random, depth + 1)) };
}

test('fixed-seed generated nested queries compare complete membership, totals, stable pages and hand BM25 reference', async () => {
  let comparisons = 0;
  for (const seed of [11, 97, 429]) {
    const state = setup(), inputs = generatedCorpus(seed), random = randomGenerator(seed + 12345);
    await state.call('addMany', inputs);
    for (let index = 0; index < 96; index++) {
      const query = generatedQuery(random);
      for (const page of pages) {
        compare(await state.call('search', nativeQuery(query), page), scanFilterResult(inputs, query, page), 1);
        comparisons++;
      }
    }
    await state.call('dispose');
  }
  assert.equal(comparisons, 1152);
});

test('simultaneous source phrases and typed filters share complete membership without changing lexical scores', async () => {
  const state = setup({ addons: [createFilters({ fields }), createSourceProvider({ fields: ['title', 'body'] }), createSourcePhrases({ fields: ['title', 'body'] })] });
  await state.call('addMany', records);
  const phrase = { kind: 'phrase', text: 'alpha beta', fields: ['title', 'body'] };
  const numeric = range({ field: 'price', gte: 10, lte: 20 });
  const red = set({ field: 'tags', values: ['red'] });
  const queries = [and(phrase, numeric), or(phrase, red), and(not(phrase), not(red)), or(and(phrase, red), and('gamma', numeric)), and(or(phrase, not(numeric)), set({ field: 'active', values: [false, null] }))];
  let comparisons = 0;
  for (const query of queries) for (const page of pages) {
    compare(await state.call('search', nativeQuery(query), page), scanFilterResult(records, query, page), 1); comparisons++;
  }
  assert.equal(comparisons, 20);
  await state.call('dispose');
});
