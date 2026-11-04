import { Admission, has, keysOnly, ownArray, ownObject, stringValue } from '../contracts/data.js';
import type { AnalyzerDescriptor } from '../contracts/types.js';
import { bound, invalid } from '../errors/error.js';
import type { Limits } from '../limits/limits.js';

/** Private Inspector integration seam; it does not change public search options. */
export interface TraceRequest { readonly ids: readonly string[]; readonly maxFacts?: number; readonly expectedRevision?: number }
export interface OwnedTraceRequest { readonly ids: readonly string[]; readonly maxFacts: number; readonly expectedRevision?: number }
export interface FieldFact {
  readonly kind: 'field'; readonly id: string; readonly group: string; readonly field: string;
  readonly term: string; readonly variant: string; readonly weight: number; readonly boost: number;
  readonly tf: number; readonly df: number; readonly N: number; readonly length: number;
  readonly totalLength: number; readonly avgLength: number; readonly k1: 1.2; readonly b: 0.75;
  readonly idf: number; readonly normalizer: number; readonly tfPart: number; readonly base: number; readonly selected: number;
}
export type Fact = FieldFact
  | { readonly kind: 'node'; readonly id: string; readonly path: string; readonly node: string; readonly matched: boolean; readonly groups: readonly string[]; readonly capability?: string; readonly field?: string }
  | { readonly kind: 'group'; readonly id: string; readonly group: string; readonly score: number }
  | { readonly kind: 'document'; readonly id: string; readonly exists: boolean; readonly matched: boolean; readonly groups: readonly string[]; readonly score: number };
export interface ScoreTrace {
  readonly revision: number; readonly model: 'raveldex-bm25-v1'; readonly analyzer: AnalyzerDescriptor;
  readonly query: string; readonly tieBreaker: 'utf16-id-ascending'; readonly facts: readonly Fact[];
}

export function captureTrace(input: unknown, limits: Limits, admission: Admission): OwnedTraceRequest {
  const data = ownObject(input, 'INVALID_OPTIONS', 'trace', admission);
  keysOnly(data, ['ids', 'maxFacts', 'expectedRevision'], 'INVALID_OPTIONS', 'trace');
  const ids = ownArray(data.ids, limits.maxDocuments, 'INVALID_OPTIONS', 'trace.ids', admission).map((id) => {
    const value = stringValue(id, limits.maxIdCodeUnits, 'INVALID_OPTIONS', 'trace.ids');
    if (!value.length) invalid('INVALID_OPTIONS', 'trace.ids');
    return value;
  });
  if (new Set(ids).size !== ids.length) invalid('INVALID_OPTIONS', 'trace.ids');
  const maxFacts = has(data, 'maxFacts') ? data.maxFacts : 4096;
  if (typeof maxFacts !== 'number' || !Number.isSafeInteger(maxFacts) || maxFacts < 1) invalid('INVALID_OPTIONS', 'trace.maxFacts');
  bound(maxFacts, 4096, 'trace.maxFacts');
  const revision = data.expectedRevision;
  if (has(data, 'expectedRevision') && (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0)) invalid('INVALID_OPTIONS', 'trace.expectedRevision');
  return Object.freeze({ ids: Object.freeze(ids), maxFacts, ...(typeof revision === 'number' ? { expectedRevision: revision } : {}) });
}

/** Allocated only for an explicit trace request. No process-global instrumentation. */
export class FactCollector {
  private readonly facts: Fact[] = [];
  constructor(private readonly maximum: number) { bound(1, maximum, 'trace.facts'); }
  record(fact: Fact): void {
    // Header plus selected facts; a complete request cannot silently truncate.
    bound(this.facts.length + 2, this.maximum, 'trace.facts');
    this.facts.push(Object.freeze(fact));
  }
  finish(revision: number, analyzer: AnalyzerDescriptor, query: string): ScoreTrace {
    return Object.freeze({ revision, model: 'raveldex-bm25-v1', analyzer, query, tieBreaker: 'utf16-id-ascending', facts: Object.freeze(this.facts) });
  }
}
