import assert from 'node:assert/strict';
import test from 'node:test';
import { originalCases, ranges, branchCases, branchRecords, titleRanges, bodyRanges, text } from '../../fixtures/evidence/original.mjs';
import { coreResult, data, frozen, plain, publicEngine, request } from './helpers.mjs';

test('original UTF-16 hand fixtures agree through source, stored offsets and mixed providers', async t => {
  let fullComparisons = 0, originalSliceChecks = 0;
  for (const fixture of originalCases) {
    const record = { id: 'a', text: { title: fixture.values, body: ['ignored', ...fixture.values] } };
    const query = { kind: 'text', text: fixture.values.join(' '), operator: 'or', fields: ['title'] };
    let reference;
    for (const strategy of ['source', 'offsets', 'mixed']) {
      const engine = publicEngine(strategy); await engine.add(record);
      for (const page of [{ limit: 100 }, { limit: 0 }, { offset: 1, limit: 1 }]) {
        const ordinary = await engine.search(query, page);
        const actual = await engine.search(query, { ...page, ...request(['a', 'missing']) });
        assert.deepEqual(coreResult(actual), ordinary, fixture.name);
        const projected = data(actual);
        assert.equal(projected.kind, 'raveldex-match-evidence-v1'); assert.equal(projected.revision, 1);
        assert.equal(projected.scope, 'successful-positive-token-occurrences'); assert.equal(projected.complete, true);
        assert.deepEqual(plain(projected.documents), [
          { id: 'a', eligibility: fixture.tokens.length ? 'matched' : 'excluded', ranges: ranges(fixture.tokens) },
          { id: 'missing', eligibility: 'absent', ranges: [] },
        ], fixture.name);
        if (reference) assert.deepEqual(projected, reference); else reference = projected;
        for (const occurrence of projected.documents[0].ranges) {
          const original = record.text[occurrence.field][occurrence.valueIndex];
          assert.ok(occurrence.start >= 0 && occurrence.end <= original.length && occurrence.start < occurrence.end);
          assert.equal(original.slice(occurrence.start, occurrence.end).normalize('NFKC').toLowerCase(), occurrence.term);
          originalSliceChecks++;
        }
        frozen(projected); fullComparisons++;
      }
      await engine.dispose();
    }
  }
  t.diagnostic(JSON.stringify({ literalOriginalFixtures: originalCases.length, completeProviderPageComparisons: fullComparisons, originalSliceChecks }));
});

test('literal successful Boolean paths and actual repeated phrases yield all and only positive occurrences', async t => {
  const engines = ['source', 'offsets', 'mixed'].map(strategy => publicEngine(strategy));
  for (const engine of engines) await engine.addMany(branchRecords);
  const ids = ['missing', ...branchRecords.map(record => record.id)];
  let completeComparisons = 0, projections = 0;
  for (const fixture of branchCases) for (const page of [{ limit: 100 }, { limit: 0 }, { offset: 2, limit: 1 }]) {
    let reference;
    for (const engine of engines) {
      const ordinary = await engine.search(fixture.query, page);
      const actual = await engine.search(fixture.query, { ...page, ...request(ids) });
      assert.deepEqual(coreResult(actual), ordinary, fixture.name);
      assert.equal(actual.total, Object.keys(fixture.expected).length, fixture.name);
      const expected = ids.map(id => ({ id, eligibility: id === 'missing' ? 'absent' : Object.hasOwn(fixture.expected, id) ? 'matched' : 'excluded', ranges: fixture.expected[id] ?? [] }));
      assert.deepEqual(plain(data(actual).documents), expected, fixture.name);
      if (reference) assert.deepEqual(data(actual), reference, fixture.name); else reference = data(actual);
      projections += expected.length; completeComparisons++;
    }
  }
  for (const engine of engines) await engine.dispose();
  t.diagnostic(JSON.stringify({ independentLiteralTrees: branchCases.length, completeProviderPageComparisons: completeComparisons, selectedDocumentProjections: projections }));
});

test('selected fields are sorted explicit projection, preserve original value indices, and never affect membership', async () => {
  for (const strategy of ['source', 'offsets', 'mixed']) {
    const engine = publicEngine(strategy); await engine.addMany(branchRecords);
    const query = { kind: 'text', text: 'red blue', operator: 'or' };
    const ordinary = await engine.search(query);
    const actual = await engine.search(query, request(['a', 'e'], { fields: ['title', 'body'] }));
    assert.deepEqual(coreResult(actual), ordinary);
    assert.deepEqual(plain(data(actual).documents[0].ranges), [...bodyRanges.a, ...titleRanges.a.filter(range => range.term !== 'green')]);
    assert.deepEqual(plain(data(actual).documents[1].ranges), titleRanges.e);
    const title = data(await engine.search(query, request(['a'], { fields: ['title'] })));
    assert.deepEqual(plain(title.documents[0].ranges), titleRanges.a.filter(range => range.term !== 'green'));
    const empty = data(await engine.search(query, request(['a'], { fields: [] })));
    assert.deepEqual(plain(empty.documents[0]), { id: 'a', eligibility: 'matched', ranges: [] });
    await engine.dispose();
  }
});

test('ranges alone need no original source and positions without offsets cannot claim them', async () => {
  const engine = publicEngine('offsets'); await engine.addMany(branchRecords);
  const result = await engine.search(text('red'), request(['a']));
  assert.deepEqual(plain(data(result).documents[0].ranges), titleRanges.a.filter(range => range.term === 'red'));
  assert.equal(JSON.stringify(data(result)).includes('red red blue green'), false);
  await engine.dispose();
});
