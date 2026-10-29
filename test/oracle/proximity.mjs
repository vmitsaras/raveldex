/** Independent original-token reference. No production analysis, positions,
 * reachability implementation, compiler, evaluator or scorer is imported. */
import { originalSourceTokens, scanSourceCorpus, sourceQueryResult } from './query.mjs';
import { strictSourceAdjacency } from './phrases.mjs';

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const proximity = (groups, maxGap, fields) => ({ kind: 'proximity', groups, maxGap, ...(fields ? { fields } : {}) });

/** Exhaustive path enumeration intentionally differs from production's sorted
 * reachable-endpoint merge. Small test fixtures keep the reference finite. */
export function orderedSourceMatch(tokens, groups, maxGap) {
  if (!groups.length || groups.some(group => !group.length)) return false;
  if (!Number.isSafeInteger(maxGap) || maxGap < 0 || maxGap > 32) throw new RangeError('Reference gap');
  function visit(groupIndex, after) {
    if (groupIndex === groups.length) return true;
    const first = after + 1;
    const end = after < 0 ? tokens.length : Math.min(tokens.length, after + maxGap + 2);
    for (let position = first; position < end; position++) {
      if (groups[groupIndex].includes(tokens[position].term) && visit(groupIndex + 1, position)) return true;
    }
    return false;
  }
  return visit(0, -1);
}

export function scanProximitySourceCorpus(records, schema) {
  const corpus = scanSourceCorpus(records, schema), sourceValues = new Map();
  for (const record of records) {
    const fields = new Map();
    for (const name of corpus.names) {
      const value = record.text[name], values = value === undefined ? [] : typeof value === 'string' ? [value] : value;
      fields.set(name, values.map(originalSourceTokens));
    }
    sourceValues.set(record.id, fields);
  }
  return { ...corpus, sourceValues };
}

function analyzedGroups(groups) {
  return groups.map(group => group.map(value => {
    const tokens = originalSourceTokens(value);
    if (tokens.length !== 1) throw new RangeError('Reference single-token alternative');
    return tokens[0].term;
  }));
}
function lower(query, document, corpus) {
  if (typeof query === 'string') return query;
  if (query.kind === 'proximity' || query.kind === 'phrase') {
    const fields = query.fields ?? corpus.names;
    const groups = query.kind === 'proximity' ? analyzedGroups(query.groups) : originalSourceTokens(query.text).map(token => [token.term]);
    const matched = fields.some(field => corpus.sourceValues.get(document.id).get(field).some(tokens => query.kind === 'phrase'
      ? strictSourceAdjacency(tokens, groups.map(group => group[0])) : orderedSourceMatch(tokens, groups, query.maxGap)));
    if (!matched) return { kind: 'none' };
    if (query.kind === 'phrase') return { kind: 'text', text: query.text, fields };
    return { kind: 'and', children: query.groups.map(group => ({ kind: 'group', variants: group.map(text => ({ text, match: 'exact', weight: 1 })), fields })) };
  }
  if (query.kind === 'and' || query.kind === 'or') return { ...query, children: query.children.map(child => lower(child, document, corpus)) };
  if (query.kind === 'not') return { ...query, child: lower(query.child, document, corpus) };
  return query;
}

/** Complete source eligibility, successful Boolean/native group participation,
 * exact totals and paginated independent BM25 under full-corpus statistics. */
export function sourceProximityQueryResult(corpus, query, options = {}) {
  const hits = [], participation = new Map();
  for (const document of corpus.documents) {
    const result = sourceQueryResult({ ...corpus, documents: [document] }, lower(query, document, corpus), { limit: 1 });
    if (!result.total) continue;
    hits.push(result.hits[0]); participation.set(document.id, result.participation.get(document.id));
  }
  hits.sort((a, b) => b.score - a.score || compare(a.id, b.id));
  const offset = options.offset ?? 0, limit = options.limit ?? 20;
  return { total: hits.length, hits: hits.slice(offset, offset + limit), participation };
}

export function publicProximityQuery(query) {
  if (typeof query === 'string') return { kind: 'text', text: query };
  if (query.kind === 'proximity') return { kind: 'extension', capability: 'proximity', version: 1, payload: { groups: query.groups, maxGap: query.maxGap, ...(query.fields ? { fields: query.fields } : {}) } };
  if (query.kind === 'phrase') return { kind: 'extension', capability: 'phrases', version: 1, payload: { text: query.text, ...(query.fields ? { fields: query.fields } : {}) } };
  if (query.kind === 'and' || query.kind === 'or') return { ...query, children: query.children.map(publicProximityQuery) };
  if (query.kind === 'not') return { ...query, child: publicProximityQuery(query.child) };
  return query;
}
