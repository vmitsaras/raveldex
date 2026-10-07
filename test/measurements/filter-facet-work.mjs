import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureConfiguration } from '../../dist/core/contracts/schema.js';
import { initializeParticipants } from '../../dist/core/capabilities/participants.js';
import { emptyRoot } from '../../dist/core/execution/engine.js';
import { MutationOwner } from '../../dist/core/mutations/owner.js';
import { executeSearch } from '../../dist/core/query/search.js';
import { createFilters } from '../../dist/addons/filters/index.js';
import { createFacets } from '../../dist/addons/facets/index.js';
import { inspectIndex } from '../../dist/core/index/invariants.js';
import { drain } from '../addons/phrases/helpers.mjs';
import { scanFacets } from '../addons/facets/helpers.mjs';

export function measureFilterFacetWork() {
  const schema = { text: { body: {} }, metadata: { price: { type: 'number', multi: true, nullable: true }, tags: { type: 'string', multi: true, nullable: true } } };
  const rows = [], payload = { fields: [{ field: 'tags', limit: 3, missing: true }] };
  for (const count of [100, 1000, 10000]) {
    const records = Array.from({ length: count }, (_, i) => ({ id: `r${String(i).padStart(5, '0')}`, text: { body: 'red blue' }, metadata: {
      price: [i % 100, null], ...(i % 10 === 0 ? {} : { tags: [`v${i % 25}`, 'shared', `v${i % 25}`, ...(i % 7 === 0 ? [null] : [])] }),
    } }));
    const selected = records.filter(record => record.metadata.price.some(value => typeof value === 'number' && value >= 10 && value < 20));
    for (const [representation, addons] of Object.entries({ core: [], filters: [createFilters({ fields: ['price', 'tags'] })], facets: [createFacets({ fields: ['tags'] })], combined: [createFilters({ fields: ['price', 'tags'] }), createFacets({ fields: ['tags'] })] })) {
      const configuration = captureConfiguration({ schema, addons }), installed = initializeParticipants(configuration);
      const owner = new MutationOwner(emptyRoot(configuration, installed.states), installed.participants);
      let buildWorkUnits = 0;
      for (let i = 0; i < count; i += 256) buildWorkUnits += drain(owner.mutate('addMany', records.slice(i, i + 256))).workUnits;
      drain(inspectIndex(owner.root)); assert.deepEqual(Object.keys(owner.root.participants), []);
      const filtered = representation === 'filters' || representation === 'combined', faceted = representation === 'facets' || representation === 'combined';
      const query = filtered ? { kind: 'extension', capability: 'numeric-range', version: 1, payload: { field: 'price', gte: 10, lt: 20 } } : { kind: 'all' };
      const expectedRecords = filtered ? selected : records, searches = [];
      for (const limit of [0, 3, 100]) {
        const operation = drain(executeSearch(owner.root, query, { limit, ...(faceted ? { extensions: { facets: payload } } : {}) }));
        assert.equal(operation.value.total, expectedRecords.length);
        assert.deepEqual(operation.value.hits, expectedRecords.slice(0, limit).map(({ id }) => ({ id, score: 0 })));
        if (faceted) assert.deepEqual(JSON.parse(JSON.stringify(operation.value.extensions.facets)), scanFacets(expectedRecords, payload));
        searches.push({ limit, workUnits: operation.workUnits, total: operation.value.total, buckets: faceted ? operation.value.extensions.facets : undefined });
      }
      const replacement = drain(owner.mutate('replace', { ...records[0], metadata: { price: [15], tags: ['changed'] } }));
      const after = drain(executeSearch(owner.root, query, { limit: 0, ...(faceted ? { extensions: { facets: payload } } : {}) }));
      assert.equal(after.value.total, expectedRecords.length + (filtered ? 1 : 0));
      const clear = drain(owner.mutate('clear'));
      const empty = drain(executeSearch(owner.root, query, { limit: 0, ...(faceted ? { extensions: { facets: payload } } : {}) }));
      assert.equal(empty.value.total, 0);
      rows.push({ documents: count, representation, buildWorkUnits, searches, replacementWorkUnits: replacement.workUnits, postReplacementSearchWorkUnits: after.workUnits, clearWorkUnits: clear.workUnits, emptySearchWorkUnits: empty.workUnits, retainedOptionalRoots: Object.keys(owner.root.participants) });
    }
  }
  return { environment: { node: process.version, platform: process.platform, arch: process.arch }, policy: 'work-v1', method: 'Complete real mutation/search cursors on identical admitted records; independent typed source selection and complete facet scan before projection.', limitations: 'Work units and logical absence of side roots; no heap/peak bytes, latency, throughput or capacity guarantees. Filtered configurations qualify 10% and unfiltered configurations qualify all documents, so these are not speedup comparisons.', rows };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = measureFilterFacetWork(); if (process.argv[2]) await writeFile(resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ rows: report.rows.length, optionalRoots: report.rows.every(row => !row.retainedOptionalRoots.length), policy: report.policy }));
}
