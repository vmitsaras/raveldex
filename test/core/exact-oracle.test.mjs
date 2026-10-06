import assert from 'node:assert/strict';
import test from 'node:test';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { exactIds } from '../../dist/core/retrieval/exact.js';
import { sourceTerms, sourceExactIds } from '../oracle/exact.mjs';
import {
  EXACT_SCHEMA, criticalTokenCases, exactFixtureRecords, handExactCases,
  EXACT_CORPUS_SEEDS, GENERATED_EXACT_TERMS, generatedExactCorpus,
} from '../fixtures/corpora/exact.mjs';

function drain(iterator) {
  for (;;) {
    const next = iterator.next();
    if (next.done) return next.value;
    assert.equal(Number.isSafeInteger(next.value.workUnits), true);
    assert.equal(next.value.workUnits > 0, true);
  }
}

function construct(records) {
  const construction = new IndexConstruction({ schema: EXACT_SCHEMA });
  for (let start = 0; start < records.length; start += 256) {
    drain(construction.append(records.slice(start, start + 256)));
  }
  return drain(construction.finish());
}

const sorted = (ids) => [...ids].sort();

for (const fixture of criticalTokenCases) {
  test(`independent original-token reference: ${fixture.name}`, () => {
    assert.deepEqual(sourceTerms(fixture.input), fixture.terms);
  });
}

test('native exact memberships follow every hand-authored critical token expectation', () => {
  const records = criticalTokenCases.map((fixture) => ({ id: fixture.name, text: { title: fixture.input } }));
  const root = construct(records);
  const terms = new Set(criticalTokenCases.flatMap(({ terms }) => terms));
  for (const absent of ['neverpresent', 'helloworld', 'stras', 'i\u0307i', 'الله']) terms.add(absent);
  for (const term of terms) {
    const expected = criticalTokenCases.filter((fixture) => fixture.terms.includes(term)).map(({ name }) => name);
    assert.deepEqual(sorted(sourceExactIds(records, EXACT_SCHEMA, term)), sorted(expected), `source ${term}`);
    assert.deepEqual(sorted(drain(exactIds(root, term))), sorted(expected), `native ${term}`);
  }
});

test('empty corpus returns complete empty exact memberships', () => {
  const root = construct([]);
  for (const fields of [undefined, ['title'], ['body', 'notes']]) {
    assert.deepEqual(sourceExactIds([], EXACT_SCHEMA, 'alpha', fields), []);
    assert.deepEqual(drain(exactIds(root, 'alpha', fields)), []);
  }
});

test('hand-authored eligibility checks independent source scan and complete native membership', () => {
  const root = construct(exactFixtureRecords);
  for (const { term, fields, ids } of handExactCases) {
    const description = JSON.stringify({ term, fields });
    assert.deepEqual(sorted(sourceExactIds(exactFixtureRecords, EXACT_SCHEMA, term, fields)), sorted(ids), `source ${description}`);
    assert.deepEqual(sorted(drain(exactIds(root, term, fields))), sorted(ids), `native ${description}`);
  }
});

test('oracle scans only declared text fields and never metadata or undeclared source properties', () => {
  const records = [{ id: 'outside', text: { title: '', extra: 'alpha' }, metadata: { label: 'alpha' } }];
  assert.deepEqual(sourceExactIds(records, EXACT_SCHEMA, 'alpha'), []);
});

test('generated fixture identity is reproducible and seeds change source data', () => {
  const first = generatedExactCorpus(100, EXACT_CORPUS_SEEDS[0]);
  assert.deepEqual(first, generatedExactCorpus(100, EXACT_CORPUS_SEEDS[0]));
  assert.notDeepEqual(first.map(({ text }) => text), generatedExactCorpus(100, EXACT_CORPUS_SEEDS[1]).map(({ text }) => text));
  assert.equal(new Set(first.map(({ id }) => id)).size, 100);
});

for (const seed of EXACT_CORPUS_SEEDS) {
  test(`full exact membership equals source scan across selected fields, seed 0x${seed.toString(16)}`, () => {
    const records = generatedExactCorpus(1_000, seed);
    const root = construct(records);
    const selections = [undefined, ['title'], ['body'], ['notes'], ['title', 'notes'], ['notes', 'body', 'title']];
    for (const term of [...GENERATED_EXACT_TERMS, 'unique999']) {
      for (const fields of selections) {
        const expected = sorted(sourceExactIds(records, EXACT_SCHEMA, term, fields));
        const actual = sorted(drain(exactIds(root, term, fields)));
        assert.deepEqual(actual, expected, JSON.stringify({ seed, term, fields }));
      }
    }
    // This proves comparison extends far beyond a convenient first result/page.
    assert.equal(drain(exactIds(root, 'common')).length, 1_000);
  });
}

test('10,000 admitted records compare complete common, last-record, and absent memberships', () => {
  const records = generatedExactCorpus(10_000, EXACT_CORPUS_SEEDS[0]);
  const root = construct(records);
  for (const term of ['common', 'unique9999', 'absent']) {
    assert.deepEqual(sorted(drain(exactIds(root, term))), sorted(sourceExactIds(records, EXACT_SCHEMA, term)));
  }
  assert.equal(drain(exactIds(root, 'common')).length, 10_000);
});
