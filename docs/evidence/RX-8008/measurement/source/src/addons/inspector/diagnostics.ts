import { Admission, has, keysOnly, ownObject } from '../../core/contracts/data.js';
import type { DataObject } from '../../core/contracts/data.js';
import { bound, invalid } from '../../core/errors/error.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import { MAX_INSPECTOR_TEXT_CODE_UNITS, ownInspectorOutput } from './output.js';
import type { DiagnosticExport, DiagnosticOptions, InspectorData } from './types.js';

function fail(): never { return invalid('INVALID_OPTIONS', 'inspector.diagnostics.data'); }
function object(value: unknown, required: readonly string[], optional: readonly string[] = []): DataObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail();
  const data = value as DataObject;
  keysOnly(data, [...required, ...optional], 'INVALID_OPTIONS', 'inspector.diagnostics.data');
  for (const key of required) if (!has(data, key)) fail();
  return data;
}
const text = (value: unknown): value is string => typeof value === 'string';
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const texts = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every(text);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
function unavailable(value: unknown, reason: string): void {
  const data = object(value, ['status', 'reason']); if (data.status !== 'unavailable' || data.reason !== reason) fail();
}
/** Validate the diagnostic envelope after safe plain-data ownership, before JSON. */
function validateData(value: unknown): InspectorData {
  const root = object(value, ['kind', 'revision', 'model', 'configuration', 'query', 'trace', 'documents', 'result', 'resources', 'numericalTolerance']);
  if (root.kind !== 'raveldex-inspector-v1' || root.model !== 'raveldex-bm25-v1' || !integer(root.revision)) fail();
  const configuration = object(root.configuration, ['schema', 'limits', 'analyzer', 'capabilities']);
  const schema = object(configuration.schema, ['text', 'metadata']);
  for (const group of ['text', 'metadata'] as const) {
    const fields = schema[group]; if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) fail();
    for (const [name, raw] of Object.entries(fields)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) || name === 'constructor' || name === 'prototype') fail();
      if (group === 'text') {
        const field = object(raw, ['boost']); if (!finite(field.boost) || field.boost <= 0 || field.boost > 16) fail();
      } else {
        const field = object(raw, ['type', 'multi', 'nullable']);
        if (!['string', 'number', 'boolean'].includes(field.type as string) || typeof field.multi !== 'boolean' || typeof field.nullable !== 'boolean') fail();
      }
    }
  }
  const limits = object(configuration.limits, Object.keys(DEFAULT_LIMITS));
  for (const item of Object.values(limits)) if (!integer(item)) fail();
  const analyzer = object(configuration.analyzer, ['id', 'environmentProfile']); if (!text(analyzer.id) || !text(analyzer.environmentProfile)) fail();
  if (!Array.isArray(configuration.capabilities)) fail();
  for (const raw of configuration.capabilities) {
    const capability = object(raw, ['id', 'version', 'contractVersion', 'roles', 'provides', 'requires']);
    if (!text(capability.id) || !text(capability.version) || capability.contractVersion !== 1 || !texts(capability.roles)) fail();
    for (const key of ['provides', 'requires']) {
      const references = capability[key]; if (!Array.isArray(references)) fail();
      for (const item of references) { const ref = object(item, ['id', 'contractVersion']); if (!text(ref.id) || ref.contractVersion !== 1) fail(); }
    }
  }
  const query = object(root.query, ['traceScope', 'alternativeScope', 'fullAlternatives']);
  if (query.traceScope !== 'selected-documents' || query.alternativeScope !== 'selected-best-per-group-and-field') fail();
  unavailable(query.fullAlternatives, 'not-collected');
  const trace = object(root.trace, ['revision', 'model', 'analyzer', 'query', 'tieBreaker', 'facts']);
  if (trace.revision !== root.revision || trace.model !== root.model || !text(trace.query) || trace.tieBreaker !== 'utf16-id-ascending' || !Array.isArray(trace.facts)) fail();
  const traceAnalyzer = object(trace.analyzer, ['id', 'environmentProfile']);
  if (traceAnalyzer.id !== analyzer.id || traceAnalyzer.environmentProfile !== analyzer.environmentProfile) fail();
  for (const raw of trace.facts) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) fail();
    const fact = raw as DataObject;
    if (fact.kind === 'field') {
      object(fact, ['kind', 'id', 'group', 'field', 'term', 'variant', 'weight', 'boost', 'tf', 'df', 'N', 'length', 'totalLength', 'avgLength', 'k1', 'b', 'idf', 'normalizer', 'tfPart', 'base', 'selected']);
      for (const key of ['id', 'group', 'field', 'term', 'variant']) if (!text(fact[key])) fail();
      for (const key of ['weight', 'boost', 'tf', 'df', 'N', 'length', 'totalLength', 'avgLength', 'k1', 'b', 'idf', 'normalizer', 'tfPart', 'base', 'selected']) if (!finite(fact[key])) fail();
    } else if (fact.kind === 'group') {
      object(fact, ['kind', 'id', 'group', 'score']); if (!text(fact.id) || !text(fact.group) || !finite(fact.score)) fail();
    } else if (fact.kind === 'node') {
      object(fact, ['kind', 'id', 'path', 'node', 'matched', 'groups'], ['capability', 'field']);
      if (!text(fact.id) || !text(fact.path) || !text(fact.node) || typeof fact.matched !== 'boolean' || !texts(fact.groups)) fail();
      if (has(fact, 'capability') && !text(fact.capability) || has(fact, 'field') && !text(fact.field)) fail();
    } else if (fact.kind === 'document') {
      object(fact, ['kind', 'id', 'exists', 'matched', 'groups', 'score']);
      if (!text(fact.id) || typeof fact.exists !== 'boolean' || typeof fact.matched !== 'boolean' || !texts(fact.groups) || !finite(fact.score)) fail();
    } else fail();
  }
  if (!Array.isArray(root.documents)) fail();
  for (const raw of root.documents) {
    const doc = object(raw, ['id', 'exists', 'eligibility', 'score', 'groups', 'page', 'absoluteRank', 'source']);
    if (!text(doc.id) || typeof doc.exists !== 'boolean' || !['matched', 'excluded', 'absent'].includes(doc.eligibility as string) || doc.score !== null && !finite(doc.score) || !texts(doc.groups)) fail();
    const page = object(doc.page, ['placement', 'index']);
    if (!['returned', 'outside-page', 'excluded', 'absent'].includes(page.placement as string) || page.index !== null && !integer(page.index)) fail();
    unavailable(doc.absoluteRank, 'not-collected');
    const source = doc.source;
    if (typeof source !== 'object' || source === null || Array.isArray(source)) fail();
    const data = source as DataObject;
    if (data.status === 'not-requested') object(data, ['status']);
    else if (data.status === 'unavailable') unavailable(data, 'record-absent');
    else if (data.status === 'available') {
      object(data, ['status', 'fields']);
      if (typeof data.fields !== 'object' || data.fields === null || Array.isArray(data.fields)) fail();
      for (const field of Object.values(data.fields)) {
        if (typeof field !== 'object' || field === null) fail();
        const rawField = field as DataObject;
        if (rawField.status === 'absent') object(field, ['status']);
        else { const available = object(field, ['status', 'values']); if (available.status !== 'available' || !texts(available.values)) fail(); }
      }
    } else fail();
  }
  const result = object(root.result, ['total', 'returned']); if (!integer(result.total) || !integer(result.returned) || result.returned > result.total) fail();
  const resources = object(root.resources, ['outcome', 'unit', 'searchWorkUnits', 'maxSearchWorkUnits', 'scope', 'counts', 'heapBytes']);
  if (resources.outcome !== 'complete' || resources.unit !== 'work-v1' || resources.scope !== 'before-evidence-projection' || !integer(resources.searchWorkUnits) || !integer(resources.maxSearchWorkUnits) || resources.searchWorkUnits > resources.maxSearchWorkUnits) fail();
  const counts = object(resources.counts, ['documents', 'textCodeUnits', 'tokens', 'dictionaryEntries', 'postingEntries']);
  for (const count of Object.values(counts)) if (!integer(count)) fail();
  unavailable(resources.heapBytes, 'not-measured');
  const tolerance = object(root.numericalTolerance, ['absolute', 'relative']); if (tolerance.absolute !== 1e-12 || tolerance.relative !== 1e-12) fail();
  return root as unknown as InspectorData;
}

/** Synchronous, bounded, side-effect-free plain JSON export; no toJSON hooks. */
export function exportDiagnostics(input: InspectorData, options: DiagnosticOptions = {}): DiagnosticExport {
  const admission = new Admission(DEFAULT_LIMITS.maxAdmissionEntries);
  const request = ownObject(options, 'INVALID_OPTIONS', 'inspector.diagnostics.options', admission);
  keysOnly(request, ['maxCodeUnits', 'includeFacts', 'includeSource'], 'INVALID_OPTIONS', 'inspector.diagnostics.options');
  const maximum = has(request, 'maxCodeUnits') ? request.maxCodeUnits : MAX_INSPECTOR_TEXT_CODE_UNITS;
  if (typeof maximum !== 'number' || !Number.isSafeInteger(maximum) || maximum < 1) invalid('INVALID_OPTIONS', 'inspector.diagnostics.maxCodeUnits');
  bound(maximum, MAX_INSPECTOR_TEXT_CODE_UNITS, 'inspector.diagnostics.maxCodeUnits');
  const flag = (key: string): boolean => {
    const value = has(request, key) ? request[key] : false;
    if (typeof value !== 'boolean') invalid('INVALID_OPTIONS', `inspector.diagnostics.${key}`); return value;
  };
  const includeFacts = flag('includeFacts'), includeSource = flag('includeSource');
  const cursor = ownInspectorOutput(input, DEFAULT_LIMITS.maxAdmissionEntries, 'INVALID_OPTIONS');
  let owned: unknown;
  try { for (;;) { const step = cursor.next(); if (step.done) { owned = step.value.value; break; } } }
  finally { cursor.return({ value: undefined, entries: 0 }); }
  const data = validateData(owned);
  const metadata = { kind: data.kind, revision: data.revision, model: data.model, configuration: data.configuration,
    result: data.result, resources: data.resources, numericalTolerance: data.numericalTolerance };
  const body: Record<string, unknown> = { ...metadata }, omitted: ('facts' | 'source')[] = [];
  const serialize = (candidate: Record<string, unknown>, skipped: readonly ('facts' | 'source')[]): string => JSON.stringify({ ...candidate,
    diagnostic: { complete: skipped.length === 0, omitted: skipped } });
  const additions: Record<'facts' | 'source', Record<string, unknown>> = { facts: {}, source: {} };
  if (includeFacts) additions.facts = { query: data.query, trace: data.trace, documents: data.documents.map(({ source: _source, ...document }) => document) };
  if (includeSource) additions.source = { sources: data.documents.map(document => ({ id: document.id, source: document.source })) };
  // Reserve truthful omission metadata for every selected section before adding
  // content. The final cap covers escaped JSON UTF-16, including its envelope.
  const selected: ('facts' | 'source')[] = [...(includeFacts ? ['facts' as const] : []), ...(includeSource ? ['source' as const] : [])];
  const completeBody = { ...body };
  for (const section of selected) Object.assign(completeBody, additions[section]);
  let json = serialize(completeBody, []);
  if (json.length <= maximum) return Object.freeze({ json, complete: true, omitted: Object.freeze([]) });
  bound(serialize(body, selected).length, maximum, 'inspector.diagnostics.metadata');
  for (let index = 0; index < selected.length; index++) {
    const section = selected[index]!;
    const addition = additions[section];
    const candidate = { ...body, ...addition };
    if (serialize(candidate, selected.slice(index + 1).concat(omitted)).length <= maximum) Object.assign(body, addition);
    else omitted.push(section);
  }
  json = serialize(body, omitted);
  bound(json.length, maximum, 'inspector.diagnostics.output');
  return Object.freeze({ json, complete: omitted.length === 0, omitted: Object.freeze(omitted) });
}
