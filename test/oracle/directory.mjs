import { scanSourceCorpus, sourceQueryResult } from './query.mjs';
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
/** Full independent metadata scan; lexical BM25 statistics remain corpus-wide. */
export function directoryExpected(records, schema, query, filters, groups, pageSize, page = 1) {
  const lexical = sourceQueryResult(scanSourceCorpus(records, schema), query, { limit: 100 });
  const source = new Map(records.map(record => [record.id, record]));
  const hits = lexical.hits.filter(hit => Object.entries(filters).every(([field, selected]) => {
    if (!selected.length) return true;
    const raw = source.get(hit.id).metadata?.[field], values = Array.isArray(raw) ? raw : [raw];
    return selected.some(value => values.includes(value));
  }));
  const matching = hits.map(hit => source.get(hit.id));
  const missing = Symbol('missing');
  const facets = groups.map(group => {
    const counts = new Map();
    for (const record of matching) {
      if (!Object.hasOwn(record.metadata ?? {}, group.field)) { counts.set(missing, (counts.get(missing) ?? 0) + 1); continue; }
      const raw = record.metadata[group.field];
      for (const value of new Set(Array.isArray(raw) ? raw : [raw])) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const entries = [...counts].sort(([a, ac], [b, bc]) => bc - ac || (a === missing ? 1 : b === missing ? -1 : a === null ? -1 : b === null ? 1 : order(a, b)));
    const buckets = entries.slice(0, group.limit ?? 20).map(([value, count]) => value === missing ? { kind: 'missing', count } : { kind: 'value', value, count });
    return { field: group.field, buckets, distinctValueTotal: entries.length, omittedBucketCount: entries.length - buckets.length };
  });
  return { total: hits.length, hits: hits.slice((page - 1) * pageSize, page * pageSize), facets, allIDs: hits.map(h => h.id) };
}
