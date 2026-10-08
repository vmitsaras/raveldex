// Browser-safe fixture/method code. No production tokenizer, scorer or oracle import.
export const METHOD = Object.freeze({ version: 'rx4001-cost-v1', seed: 'rx4001-ascii-cycle-37-3-v1', sizes: [100, 1000, 10000], owners: 3,
  batchSize: 256, queryWarmups: 2, queryRepetitions: 5, deadlineMs: 60000, requestedPage: { limit: 20, offset: 0 }, timingResolutionMs: 1 });
export const schema = { text: { body: {} }, metadata: { group: { type: 'string' } } };
export function recordsFor(size) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 10000) throw Error('size outside admitted contract');
  return Array.from({ length: size }, (_, index) => ({ id: `item:${String(index).padStart(5, '0')}`,
    text: { body: `${index % 3 === 0 ? 'red blue' : 'red green blue'} echo echo value${index % 37}` }, metadata: { group: `group${index % 5}` } }));
}
export const QUERY_ROWS = [
  { name: 'common-exact-total-top20', query: 'red', match: record => record.text.body.split(' ').includes('red'), requires: 'core' },
  { name: 'selective-exact-total-top20', query: 'value7', match: record => record.text.body.split(' ').includes('value7'), requires: 'core' },
  { name: 'strict-phrase-total-top20', query: { kind: 'extension', capability: 'phrases', version: 1, payload: { text: 'red blue', fields: ['body'] } },
    match: record => record.text.body.split(' ').some((word, index, words) => word === 'red' && words[index + 1] === 'blue'), requires: 'phrases' },
];
export const updatedRecord = { id: 'item:00000', text: { body: 'red green blue echo echo value7' }, metadata: { group: 'group0' } };
export function checkPage(result, records, row) {
  const expected = records.filter(row.match).map(record => record.id), ids = new Set(expected);
  if (result.completeness !== 'complete' || result.total !== expected.length || result.hits.length !== Math.min(20, expected.length) ||
      new Set(result.hits.map(hit => hit.id)).size !== result.hits.length || result.hits.some(hit => !ids.has(hit.id) || !Number.isFinite(hit.score)))
    throw Error(`invalid measured page for ${row.name}`);
  return { total: result.total, returned: result.hits.length, ids: result.hits.map(hit => hit.id), revision: result.revision };
}
export function summary(samples) {
  const successful = samples.filter(sample => sample.outcome === 'Pass').map(sample => sample.elapsedMs).sort((a, b) => a - b);
  if (successful.some(value => !Number.isSafeInteger(value) || value < 0)) throw Error('invalid elapsed sample');
  const middle = Math.floor(successful.length / 2);
  return { attempts: samples.length, successes: successful.length, rejections: samples.filter(sample => sample.outcome === 'Rejected').length,
    notApplicable: samples.filter(sample => sample.outcome === 'Not Applicable').length, notRun: samples.filter(sample => sample.outcome === 'Not run').length,
    medianMs: successful.length ? Math.ceil(successful.length % 2 ? successful[middle] : (successful[middle - 1] + successful[middle]) / 2) : null,
    observedMaximumMs: successful.length ? successful.at(-1) : null,
    tail: 'Observed sample maximum; no population percentile or device-latency guarantee.' };
}
export function summarizeRows(observations) {
  const groups = new Map();
  for (const observation of observations) for (const sample of observation.samples) {
    const key = JSON.stringify([observation.configuration, observation.size, sample.operation, sample.phase ?? null]);
    if (!groups.has(key)) groups.set(key, { configuration: observation.configuration, size: observation.size, operation: sample.operation, phase: sample.phase ?? null, samples: [] });
    groups.get(key).samples.push(sample);
  }
  return [...groups.values()].map(({ samples, ...identity }) => ({ ...identity, ...summary(samples) }));
}
export async function observe(samples, operation, call, metadata = {}) {
  const start = performance.now();
  try {
    const result = await call();
    samples.push({ operation, ...metadata, outcome: 'Pass', elapsedMs: Math.ceil(performance.now() - start) });
    return { result, sample: samples.at(-1) };
  } catch (error) {
    samples.push({ operation, ...metadata, outcome: 'Rejected', elapsedMs: Math.ceil(performance.now() - start), error: {
      name: error.name, code: error.code ?? null, reason: error.reason ?? null, details: error.details ?? null } });
    return { error, sample: samples.at(-1) };
  }
}
export const notApplicable = reason => ({ outcome: 'Not Applicable', reason });
export const features = Object.freeze({ query: 'Native exact ASCII text AND, exact full total plus deterministic BM25 top20. Strict phrase additionally requires same token sequence in one original field value.',
  filter: 'No filter/facet requested. Core scalar equality is available; extended metadata predicates and facets are uninstalled in these measured configurations.',
  count: 'Exact complete membership count before top20.', evidence: 'No Inspector, range/snippet output or rendering requested.',
  analyzer: 'basic-v1 NFKC then lowercase; this ASCII fixture does not compare Unicode platform behavior.',
  runtimeDependencies: [], limits: 'Unchanged default admission, corpus, search/mutation work and optional participant bounds. Deadline 60000ms; batchSize256.' });
