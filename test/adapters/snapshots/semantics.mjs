import assert from 'node:assert/strict';
import { createSourceProvider } from '../../../dist/addons/phrases/source.js';
import { createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { createPositionPhrases } from '../../../dist/addons/positions/phrases.js';
import { createPhrases } from '../../../dist/addons/phrases/mixed.js';
import { createFilters } from '../../../dist/addons/filters/index.js';
import { createFacets } from '../../../dist/addons/facets/index.js';
import { createInspector } from '../../../dist/addons/inspector/index.js';
import { createMatchEvidence } from '../../../dist/addons/evidence/index.js';
import { createSnippetEvidence } from '../../../dist/addons/snippets/index.js';
import { queries, phraseCases, titleRanges, records } from '../../fixtures/snapshots/records.mjs';

export const plain = value => JSON.parse(JSON.stringify(value));
export function withoutRevision(value) {
  if (Array.isArray(value)) return value.map(withoutRevision);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'revision').map(([key, child]) => [key, withoutRevision(child)]));
}
export function addonsFor(kind, completeSource = false) {
  const fields = ['title', 'body'];
  if (kind === 'core') return [];
  let selected;
  if (kind === 'source') selected = [createSourceProvider({ fields }), createSourcePhrases({ fields })];
  if (kind === 'positions' || kind === 'offsets') selected = [
    ...(completeSource ? [createSourceProvider({ fields })] : []),
    createPositionProvider({ fields, offsets: kind === 'offsets' ? fields : [] }),
    createPositionPhrases({ fields }),
  ];
  if (kind === 'mixed') selected = [
    createSourceProvider({ fields: completeSource ? fields : ['title'] }),
    createPositionProvider({ fields: ['body'], offsets: ['body'] }),
    createPhrases({ fields: { title: 'source', body: 'positions' } }),
  ];
  if (!selected) throw new Error(`Unknown snapshot test configuration ${kind}`);
  selected.push(createFilters({ fields: ['tags', 'price', 'active'] }), createFacets({ fields: ['tags'] }), createInspector());
  if (kind !== 'positions') {
    const providers = kind === 'source' ? { title: 'source', body: 'source' } : kind === 'offsets' ? { title: 'offsets', body: 'offsets' } : { title: 'source', body: 'offsets' };
    selected.push(createMatchEvidence({ fields: providers }));
    if (kind === 'source' || completeSource) selected.push(createSnippetEvidence({ fields: providers }));
  }
  return selected;
}

export async function inspectSemantics(engine, kind, hasCompleteSource = false, literal = true) {
  const observations = [];
  for (const fixture of queries) {
    const actual = await engine.search(fixture.query, { limit: 100 });
    if (literal) { assert.equal(actual.total, fixture.ids.length, fixture.name); assert.deepEqual(actual.hits.map(hit => hit.id).sort(), [...fixture.ids].sort(), fixture.name); }
    observations.push({ query: fixture.query, actual });
  }
  if (kind === 'core') return observations;
  for (const fixture of phraseCases) {
    const actual = await engine.search(fixture.query, { limit: 100 });
    if (literal) { assert.equal(actual.total, fixture.ids.length); assert.deepEqual(actual.hits.map(hit => hit.id).sort(), [...fixture.ids].sort()); }
    observations.push({ query: fixture.query, actual });
  }
  const range = { kind: 'extension', capability: 'numeric-range', version: 1, payload: { field: 'price', gte: 10, lte: 20 } };
  const filtered = await engine.search(range, { extensions: { facets: { fields: [{ field: 'tags', missing: true }] }, inspector: { ids: records.map(record => record.id) } } });
  if (literal) {
    assert.deepEqual(filtered.hits.map(hit => hit.id), ['a', 'b']);
    assert.deepEqual(plain(filtered.extensions.facets.fields[0]), { field: 'tags', buckets: [{ kind: 'value', value: null, count: 1 }, { kind: 'value', value: 'x', count: 1 }, { kind: 'value', value: 'y', count: 1 }], distinctValueTotal: 3, omittedBucketCount: 0 });
  }
  observations.push({ query: range, actual: filtered });
  if (kind !== 'positions') {
    for (const query of Object.keys(titleRanges)) {
      const actual = await engine.search(query, { extensions: { 'match-evidence': { ids: ['a', 'missing'], fields: ['title'] } } });
      if (literal) assert.deepEqual(plain(actual.extensions['match-evidence'].documents[0].ranges), titleRanges[query]);
      observations.push({ query, actual });
    }
    if (kind === 'source' || hasCompleteSource) {
      const actual = await engine.search('file', { extensions: { snippets: { ids: ['a'], fields: ['title'] } } });
      if (literal) {
        const snippet = actual.extensions.snippets.documents[0].snippets[0];
        assert.equal(snippet.text, 'cafe\u0301 ﬁle ½');
        assert.deepEqual(plain(snippet.highlights), [{ start: 6, end: 9 }]);
      }
      observations.push({ query: 'file', actual });
    }
  }
  return observations;
}

export function close(actual, expected) { assert.ok(Math.abs(actual - expected) <= Math.max(1e-12, Math.abs(expected) * 1e-12), `${actual} != ${expected}`); }
