// Deterministic operation counts. This does not measure heap bytes or latency.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { platform, release, arch } from 'node:os';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { executeSearch } from '../../dist/core/query/search.js';
import { EXACT_SCHEMA, EXACT_CORPUS_SEEDS, generatedExactCorpus } from '../fixtures/corpora/exact.mjs';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';

function drain(iterator) {
  let workUnits = 0, steps = 0, largestStep = 0;
  for (;;) {
    const step = iterator.next();
    if (step.done) return { value: step.value, workUnits, steps, largestStep };
    workUnits += step.value.workUnits; steps++; largestStep = Math.max(largestStep, step.value.workUnits);
  }
}
const queries = [
  { name: 'common-top20', query: 'common', options: { limit: 20 } },
  { name: 'prefix-top1', query: { kind: 'group', fields: ['body'], variants: [{ text: 'com', match: 'prefix' }] }, options: { limit: 1 } },
  { name: 'negative-only-zero-hits', query: { kind: 'not', child: { kind: 'text', text: 'absent' } }, options: { limit: 0 } },
  { name: 'all-last-page', query: { kind: 'all' }, options: null },
];
const rows = [];
for (const size of [100, 1000, 10000]) {
  const records = generatedExactCorpus(size, EXACT_CORPUS_SEEDS[0]);
  const construction = new IndexConstruction({ schema: EXACT_SCHEMA });
  for (let i = 0; i < size; i += 256) drain(construction.append(records.slice(i, i + 256)));
  const root = drain(construction.finish()).value;
  const source = scanSourceCorpus(records, EXACT_SCHEMA);
  for (const specification of queries) {
    const options = specification.options ?? { offset: Math.max(0, size - 20), limit: 20 };
    const actual = drain(executeSearch(root, specification.query, options));
    const expected = sourceQueryResult(source, specification.query, options);
    assert.equal(actual.value.total, expected.total);
    assert.deepEqual(actual.value.hits.map(({ id }) => id), expected.hits.map(({ id }) => id));
    for (let i = 0; i < expected.hits.length; i++) assert.ok(Math.abs(actual.value.hits[i].score - expected.hits[i].score) <= Math.max(1e-12, Math.abs(expected.hits[i].score) * 1e-12));
    const traced = drain(executeSearch(root, specification.query, options, { ids: [records[0].id, records.at(-1).id] }));
    assert.deepEqual(traced.value.hits, actual.value.hits);
    assert.equal(traced.value.total, actual.value.total);
    rows.push({ records: size, corpusSha256: createHash('sha256').update(JSON.stringify(records)).digest('hex'), name: specification.name, query: specification.query, options, exactTotal: actual.value.total, returnedHits: actual.value.hits.length, workUnits: actual.workUnits, steps: actual.steps, largestStep: actual.largestStep, tracedWorkUnits: traced.workUnits, traceFactsIncludingHeader: traced.value.trace.facts.length + 1 });
  }
}
process.stdout.write(JSON.stringify({ task: 'RX-1003', policy: 'work-v1', seed: `0x${EXACT_CORPUS_SEEDS[0].toString(16)}`, configuration: 'EXACT_SCHEMA; basic-v1/unqualified; frequency-only; one root revision 0', environment: { node: process.version, v8: process.versions.v8, icu: process.versions.icu, unicode: process.versions.unicode, platform: platform(), osRelease: release(), arch: arch() }, notes: ['Each query uses one budget across all execution phases. Corpus construction is excluded from query counts.', 'Full result membership, exact totals, ID order and numeric scores are checked independently from source; trace on/off hits and totals are identical.', 'Heap retains at most offset + limit candidates; this is an implementation bound, not an isolated heap-byte measurement.', 'Largest yielded work charge does not measure interruption time. Host yielding, deadlines and cancellation await RX-1005.', 'No latency, peak/retained memory, package size or cross-host qualification is claimed.'], rows }, null, 2) + '\n');
