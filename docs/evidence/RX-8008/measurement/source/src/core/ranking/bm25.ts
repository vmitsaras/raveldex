import { invalid } from '../errors/error.js';
import { directoryGet } from '../index/directory.js';
import type { WorkStep } from '../index/directory.js';
import type { DocumentEntry, IndexRoot, TermEntry } from '../index/state.js';
import type { ExpandedGroup } from '../retrieval/expand.js';
import { sortedStrings } from '../query/work.js';
import type { Charge } from '../query/work.js';
import type { FactCollector, FieldFact } from '../trace/facts.js';

const positiveInteger = (value: number): boolean => Number.isSafeInteger(value) && value > 0;

interface FieldStatistics {
  readonly N: number; readonly totalLength: number; readonly boost: number; readonly avgLength: number;
  readonly terms: Map<TermEntry, { readonly df: number; readonly idf: number }>;
}
/** A search owns this cache; no entry survives its selected immutable root. */
export interface RankingContext { readonly root: IndexRoot; readonly fields: Map<string, FieldStatistics> }
export function rankingContext(root: IndexRoot): RankingContext { return { root, fields: new Map() }; }

/** Native model v1. The optional facts path captures these actual intermediates. */
export function* scoreDocument(root: IndexRoot, doc: DocumentEntry, participating: ReadonlySet<string>, expansions: ReadonlyMap<string, ExpandedGroup>, charge: Charge, facts?: FactCollector, context: RankingContext = rankingContext(root)): Generator<WorkStep, number> {
  if (context.root !== root) invalid('INTERNAL_ERROR', 'ranking.root');
  let score = 0;
  for (const key of yield* sortedStrings(participating, charge)) {
    const expanded = expansions.get(key)!;
    let groupScore = 0;
    for (const field of expanded.group.fields) {
      let best = 0;
      let found = false;
      let selected: FieldFact | undefined;
      let prepared = context.fields.get(field);
      for (const alternative of expanded.fields.get(field)!) {
        yield charge(doc.id.length + field.length + alternative.term.length + 3);
        const tf = directoryGet(alternative.entry.postings, doc.id);
        if (tf === undefined) continue;
        yield charge(1);
        // Keep preparation lazy: unused or nonmatching fields never acquire
        // new validation failures. The existing coarse scoring step above
        // covers cache access and remaining document-dependent arithmetic.
        if (!prepared) {
          const statistics = root.fields[field]!;
          const N = statistics.documents, totalLength = statistics.length;
          const boost = root.configuration.schema.text[field]!.boost;
          if (!positiveInteger(N) || !positiveInteger(totalLength) || N > root.documents.size || totalLength < N || !Number.isFinite(boost) || boost <= 0 || boost > 16) invalid('INTERNAL_ERROR', 'ranking.statistics');
          const avgLength = totalLength / N;
          prepared = { N, totalLength, boost, avgLength, terms: new Map() };
          context.fields.set(field, prepared);
        }
        const { N, totalLength, boost, avgLength } = prepared;
        const length = doc.fields[field]?.length ?? 0;
        if (!positiveInteger(tf) || !positiveInteger(length) || tf > length || length > totalLength) invalid('INTERNAL_ERROR', 'ranking.statistics');
        let term = prepared.terms.get(alternative.entry);
        if (!term) {
          const df = alternative.entry.df;
          if (!positiveInteger(df) || df > N) invalid('INTERNAL_ERROR', 'ranking.statistics');
          const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
          term = { df, idf }; prepared.terms.set(alternative.entry, term);
        }
        const { df, idf } = term;
        const normalizer = 1.2 * (1 - 0.75 + 0.75 * length / avgLength);
        const tfPart = (tf * (1.2 + 1)) / (tf + normalizer);
        const base = boost * idf * tfPart;
        const weighted = alternative.weight * base;
        if (!Number.isFinite(weighted) || weighted < 0) invalid('INTERNAL_ERROR', 'ranking.score');
        // Alternatives are sorted by term; same-term expansion retained highest
        // weight and the smaller canonical variant key before this phase.
        if (!found || weighted > best) {
          found = true;
          best = weighted;
          if (facts) selected = { kind: 'field', id: doc.id, group: key, field, term: alternative.term, variant: alternative.variantKey, weight: alternative.weight, boost, tf, df, N, length, totalLength, avgLength, k1: 1.2, b: 0.75, idf, normalizer, tfPart, base, selected: weighted };
        }
      }
      groupScore += best;
      if (facts && selected) { yield charge(1); facts.record(selected); }
    }
    score += groupScore;
    if (facts) { yield charge(1); facts.record({ kind: 'group', id: doc.id, group: key, score: groupScore }); }
  }
  if (!Number.isFinite(score) || score < 0) invalid('INTERNAL_ERROR', 'ranking.score');
  return score;
}
