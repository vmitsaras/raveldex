import { Admission, scanUnicode } from '../contracts/data.js';
import { captureOptions } from '../contracts/options.js';
import { captureQuery } from '../contracts/query.js';
import type { OwnedQuery } from '../contracts/query.js';
import type { OwnedConfiguration, OwnedSearchOptions, SearchResult } from '../contracts/types.js';
import { invalid } from '../errors/error.js';
import { directoryEntries, directoryGet } from '../index/directory.js';
import type { WorkStep } from '../index/directory.js';
import type { IndexRoot } from '../index/state.js';
import { WorkBudget } from '../limits/work.js';
import { scoreDocument } from '../ranking/bm25.js';
import { PageSelection } from '../ranking/page.js';
import { expandGroups } from '../retrieval/expand.js';
import { captureTrace, FactCollector } from '../trace/facts.js';
import type { OwnedTraceRequest, ScoreTrace } from '../trace/facts.js';
import { compileQuery } from './compile.js';
import { evaluate } from './evaluate.js';
import { sortedStrings } from './work.js';

export interface SearchEvaluation extends SearchResult { readonly trace?: ScoreTrace }

export interface OwnedSearch { readonly query: OwnedQuery; readonly options: OwnedSearchOptions; readonly trace?: OwnedTraceRequest }
export type SearchPhase = 'start' | 'analysis' | 'expansion' | 'dictionary' | 'postings' | 'evaluation' | 'scoring' | 'selection' | 'result';
export interface SearchControl {
  readonly checkpoint?: (phase: SearchPhase) => void;
  readonly checkStop?: (phase: SearchPhase) => void;
}

/** Admission is independent of execution-start revision selection. */
export function captureSearch(configuration: OwnedConfiguration, input: unknown, options?: unknown, trace?: unknown): OwnedSearch {
  const { schema, limits } = configuration;
  const admission = new Admission(limits.maxAdmissionEntries);
  const page = captureOptions(options, limits, true, admission);
  if (page.signal?.aborted) invalid('CANCELLED', 'options.signal');
  const query = captureQuery(input, schema, limits, admission);
  const request = trace === undefined ? undefined : captureTrace(trace, limits, admission);
  return Object.freeze({ query, options: page, ...(request ? { trace: request } : {}) });
}

export function executeSearch(root: IndexRoot, input: unknown, options?: unknown, trace?: unknown): Generator<WorkStep, SearchEvaluation> {
  return executeOwnedSearch(root, captureSearch(root.configuration, input, options, trace));
}

export function* executeOwnedSearch(root: IndexRoot, request: OwnedSearch, control: SearchControl = {}): Generator<WorkStep, SearchEvaluation> {
  const { query, options, trace } = request;
  const budget = new WorkBudget(root.configuration.limits.maxSearchWorkUnits);
  let phase: SearchPhase = 'start';
  const check = (): void => {
    control.checkpoint?.(phase);
    if (control.checkStop) control.checkStop(phase);
    else if (options.signal?.aborted) invalid('CANCELLED', 'options.signal');
  };
  const boundary = (next: SearchPhase): void => { phase = next; check(); };
  const charge = (workUnits: number): WorkStep => { check(); budget.charge(workUnits); return { workUnits }; };
  check();
  if (trace?.expectedRevision !== undefined && trace.expectedRevision !== root.revision) invalid('REVISION_MISMATCH', 'trace.expectedRevision');
  const selected = new Set<string>();
  if (trace) for (const id of trace.ids) {
    for (const step of scanUnicode(id, 'INVALID_OPTIONS', 'trace.ids')) yield charge(step.workUnits);
    yield charge(id.length + 1); selected.add(id);
  }
  const collector = trace ? new FactCollector(trace.maxFacts) : undefined;
  boundary('analysis');
  const compiled = yield* compileQuery(query, root.configuration, charge);
  boundary('expansion');
  const expansions = yield* expandGroups(root, compiled.groups, charge, boundary);
  const page = new PageSelection(options.limit ? options.offset + options.limit : 0, charge);
  let total = 0;
  for (const [id, doc] of directoryEntries(root.documents)) {
    boundary('evaluation');
    yield charge(id.length + 1);
    if (doc.id !== id) invalid('INTERNAL_ERROR', 'index.documents');
    const facts = selected.has(id) ? collector : undefined;
    const qualified = yield* evaluate(compiled.node, doc, expansions, charge, facts);
    boundary('scoring');
    const score = qualified.matched ? yield* scoreDocument(root, doc, qualified.groups, expansions, charge, facts) : 0;
    if (qualified.matched) {
      total++;
      boundary('selection');
      yield* page.add({ id, score });
    }
    if (facts) {
      const groups = Object.freeze(yield* sortedStrings(qualified.groups, charge));
      yield charge(1); facts.record({ kind: 'document', id, exists: true, matched: qualified.matched, groups, score });
    }
  }
  if (collector) for (const id of selected) {
    yield charge(id.length + 1);
    if (!directoryGet(root.documents, id)) collector.record({ kind: 'document', id, exists: false, matched: false, groups: Object.freeze([]), score: 0 });
  }
  boundary('selection');
  const hits = yield* page.finish(options.offset, options.limit);
  boundary('result');
  yield charge(1);
  const result = Object.freeze({ revision: root.revision, model: 'raveldex-bm25-v1', completeness: 'complete', total, hits,
    ...(collector ? { trace: collector.finish(root.revision, root.configuration.analyzer, compiled.key) } : {}) });
  check(); return result;
}
