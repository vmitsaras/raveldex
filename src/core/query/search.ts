import { Admission, scanUnicode } from '../contracts/data.js';
import { captureOptions } from '../contracts/options.js';
import { captureQuery } from '../contracts/query.js';
import type { OwnedQuery } from '../contracts/query.js';
import type { OwnedSearchOptions, SearchResult } from '../contracts/types.js';
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

/** Internal cursor. RX-1005 owns promise scheduling, clock and cancellation. */
export function executeSearch(root: IndexRoot, input: unknown, options?: unknown, trace?: unknown): Generator<WorkStep, SearchEvaluation> {
  const { schema, limits } = root.configuration;
  const admission = new Admission(limits.maxAdmissionEntries);
  const query = captureQuery(input, schema, limits, admission);
  const page = captureOptions(options, limits, true, admission);
  const request = trace === undefined ? undefined : captureTrace(trace, limits, admission);
  return search(root, query, page, request);
}

function* search(root: IndexRoot, query: OwnedQuery, options: OwnedSearchOptions, trace?: OwnedTraceRequest): Generator<WorkStep, SearchEvaluation> {
  const budget = new WorkBudget(root.configuration.limits.maxSearchWorkUnits);
  const charge = (workUnits: number): WorkStep => { budget.charge(workUnits); return { workUnits }; };
  if (trace?.expectedRevision !== undefined && trace.expectedRevision !== root.revision) invalid('REVISION_MISMATCH', 'trace.expectedRevision');
  const selected = new Set<string>();
  if (trace) for (const id of trace.ids) {
    for (const step of scanUnicode(id, 'INVALID_OPTIONS', 'trace.ids')) yield charge(step.workUnits);
    yield charge(id.length + 1); selected.add(id);
  }
  const collector = trace ? new FactCollector(trace.maxFacts) : undefined;
  const compiled = yield* compileQuery(query, root.configuration, charge);
  const expansions = yield* expandGroups(root, compiled.groups, charge);
  const page = new PageSelection(options.limit ? options.offset + options.limit : 0, charge);
  let total = 0;
  for (const [id, doc] of directoryEntries(root.documents)) {
    yield charge(id.length + 1);
    if (doc.id !== id) invalid('INTERNAL_ERROR', 'index.documents');
    const facts = selected.has(id) ? collector : undefined;
    const qualified = yield* evaluate(compiled.node, doc, expansions, charge, facts);
    const score = qualified.matched ? yield* scoreDocument(root, doc, qualified.groups, expansions, charge, facts) : 0;
    if (qualified.matched) {
      total++;
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
  const hits = yield* page.finish(options.offset, options.limit);
  yield charge(1);
  return Object.freeze({ revision: root.revision, model: 'raveldex-bm25-v1', completeness: 'complete', total, hits,
    ...(collector ? { trace: collector.finish(root.revision, root.configuration.analyzer, compiled.key) } : {}) });
}
