import assert from 'node:assert/strict';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { initializeParticipants } from '../../../dist/core/capabilities/participants.js';
import { emptyRoot, ExecutionOwner } from '../../../dist/core/execution/engine.js';
import { createFacets } from '../../../dist/addons/facets/index.js';
import { FakeHost } from '../../fixtures/execution/host.mjs';

export const plain = value => JSON.parse(JSON.stringify(value));
export const request = (...fields) => ({ fields: fields.map(field => typeof field === 'string' ? { field } : field) });
export const options = (payload, extra = {}) => ({ ...extra, extensions: { facets: payload } });
export function setup(schema, configurationOptions = {}) {
  const host = new FakeHost();
  const configuration = captureConfiguration({ schema, addons: [createFacets({ fields: Object.keys(schema.metadata).filter(field => schema.metadata[field].type === 'string') })], ...configurationOptions });
  const installed = initializeParticipants(configuration);
  const engine = new ExecutionOwner(emptyRoot(configuration, installed.states), host, installed.participants);
  return { engine, host, async call(method, ...args) { const promise = engine[method](...args); host.runReady(); return promise; } };
}
export function drain(cursor) {
  let workUnits = 0, steps = 0;
  for (;;) {
    const next = cursor.next(); if (next.done) return { value: next.value, workUnits, steps };
    assert.ok(Number.isSafeInteger(next.value.workUnits) && next.value.workUnits > 0);
    workUnits += next.value.workUnits; steps++;
  }
}

/** Independent complete record scan. Native JS sorting is acceptable here:
 * this reference is outside runtime/budgets and shares no facet implementation. */
export function scanFacets(records, payload, maximum = 100) {
  const missing = Symbol('missing');
  return { fields: payload.fields.map(selection => {
    const counts = new Map();
    for (const record of records) {
      const metadata = record.metadata ?? {};
      if (!Object.hasOwn(metadata, selection.field)) {
        if (selection.missing) counts.set(missing, (counts.get(missing) ?? 0) + 1);
        continue;
      }
      const input = metadata[selection.field], values = Array.isArray(input) ? input : [input];
      for (const value of new Set(values)) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const sorted = [...counts].sort(([a, ac], [b, bc]) => {
      if (ac !== bc) return bc - ac;
      if (a === missing || b === missing) return a === b ? 0 : a === missing ? 1 : -1;
      if (a === null || b === null) return a === b ? 0 : a === null ? -1 : 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    const buckets = sorted.slice(0, selection.limit ?? Math.min(20, maximum)).map(([value, count]) => value === missing ? { kind: 'missing', count } : { kind: 'value', value, count });
    return { field: selection.field, buckets, distinctValueTotal: counts.size, omittedBucketCount: counts.size - buckets.length };
  }) };
}

export function qualifies(record, query) {
  const metadata = record.metadata ?? {};
  if (query.kind === 'all') return true;
  if (query.kind === 'none') return false;
  if (query.kind === 'eq') {
    if (!Object.hasOwn(metadata, query.field)) return false;
    const value = metadata[query.field]; return (Array.isArray(value) ? value : [value]).includes(query.value);
  }
  if (query.kind === 'not') return !qualifies(record, query.child);
  if (query.kind === 'and') return query.children.every(child => qualifies(record, child));
  if (query.kind === 'or') return query.children.some(child => qualifies(record, child));
  throw new Error(`Unexpected independent scan query ${query.kind}`);
}
