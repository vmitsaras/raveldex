/** Development-only translation and independent foreign eligibility reference. */
export function companionQuery(raw, limit = 100) {
  const node = typeof raw === 'string' ? { kind: 'text', text: raw } : raw;
  if (node.kind === 'text' || node.kind === 'phrase') {
    if (!foreignTerms(node.text).length) return null; // Companion rejects; native returns complete empty.
    return { kind: 'text', value: node.text,
    ...(node.fields ? { fields: node.fields } : {}), combine: node.operator === 'or' ? 'any' : 'all',
    mode: node.kind === 'phrase' ? 'phrase' : 'tokens', limit };
  }
  if (node.kind === 'all') return { kind: 'all', limit };
  if (node.kind === 'eq' && node.value !== null) return { kind: 'all', where: { [node.field]: { eq: node.value } }, limit };
  if (node.kind === 'group' && node.variants.length === 1 && node.variants[0].match === 'prefix' && (node.variants[0].weight ?? 1) === 1) return {
    kind: 'text', value: node.variants[0].text, ...(node.fields ? { fields: node.fields } : {}), prefixLast: true, limit,
  };
  if (node.kind === 'and') {
    const equality = node.children.filter(child => child.kind === 'eq' && child.value !== null);
    const lexical = node.children.filter(child => ['text', 'phrase'].includes(child.kind));
    if (equality.length + lexical.length !== node.children.length || lexical.length > 1) return null;
    // Do not overwrite repeated contradictory predicates during translation.
    if (new Set(equality.map(child => child.field)).size !== equality.length) return null;
    const translated = lexical.length ? companionQuery(lexical[0], limit) : { kind: 'all', limit };
    if (translated === null) return null;
    return { ...translated, where: Object.fromEntries(equality.map(child => [child.field, { eq: child.value }])) };
  }
  return null;
}

// Independent declared historical tokenizer, never imported from companion.
const foreignTerms = text => [...text.matchAll(/[\p{L}\p{M}\p{N}]+/gu)]
  .filter(match => /[\p{L}\p{N}]/u.test(match[0])).map(match => match[0].normalize('NFC').toLowerCase().normalize('NFC'));
const values = raw => raw === undefined ? [] : typeof raw === 'string' ? [raw] : raw;
export function foreignMembership(records, fields, query) {
  const requested = query.kind === 'text' ? [...new Set(foreignTerms(query.value))] : [];
  const selected = query.fields ?? fields;
  return records.filter(record => {
    if (Object.entries(query.where ?? {}).some(([field, predicate]) => record.metadata?.[field] !== predicate.eq)) return false;
    if (query.kind === 'all') return true;
    if (!requested.length) return false;
    const match = (term, index) => selected.some(field => values(record.text[field]).some(value => foreignTerms(value)
      .some(token => query.prefixLast && index === requested.length - 1 ? token.startsWith(term) : token === term)));
    if (!(query.combine === 'any' ? requested.some(match) : requested.every(match))) return false;
    if (query.mode !== 'phrase') return true;
    // Original repetitions are preserved for phrase eligibility.
    const phrase = foreignTerms(query.value);
    return selected.some(field => values(record.text[field]).some(value => {
      const terms = foreignTerms(value);
      return terms.some((_, start) => phrase.every((term, index) => terms[start + index] === term));
    }));
  }).map(record => record.id).sort();
}

export const EQUIVALENCE = Object.freeze({
  native: 'raveldex-bm25-v1; basic-v1 NFKC then lowercase; frozen title boost2/body boost1',
  foreign: 'MiniSearch7.2.0 companion-v1; basic-v1 NFC then lowercase then NFC; same declared boosts',
  queries: 'Explicit typed translation only for simple exact AND/OR text, strict source phrase, scalar equality conjunction/browse and one prefix variant. Arbitrary Boolean trees, null equality and native alternative weighting are not comparable.',
  filters: 'Scalar sourcePath/category equality only where requested. Extended predicates and facet outputs not selected.',
  phrases: 'Strict normalized original token sequence in one original field value, complete candidates before exact totals; no cross-value/field adjacency.',
  counts: 'Exact complete totals and complete limit100 results for34 section corpus. Cutoff100 exceeds entire corpus.',
  retainedSource: 'Native explicitly retains title/body originals; companion always retains full source and metadata.',
  execution: 'Direct Node same process sequential calls; UI=false,worker=false,storage=false.',
  output: 'Native returns IDs/scores/total only; companion additionally computes mandatory original evidence/snippets even with returnFields empty. Output cost is not identical.',
  ranking: 'Different model scores are observed, never required equal or used as correctness oracle. Prefix discount/aggregation/statistics differ.',
  unsupported: ['native arbitrary Boolean scoring/negation', 'native null metadata equality', 'native weighted alternative groups', 'native successful tokenless empty result (companion rejects)', 'native cooperative upstream interruption', 'foreign numerical score decomposition'],
});
