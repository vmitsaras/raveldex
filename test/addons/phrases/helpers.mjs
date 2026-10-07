import assert from 'node:assert/strict';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { initializeParticipants } from '../../../dist/core/capabilities/participants.js';
import { emptyRoot, ExecutionOwner } from '../../../dist/core/execution/engine.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { FakeHost } from '../../fixtures/execution/host.mjs';

export const extension = (text, fields) => ({ kind: 'extension', capability: 'phrases', version: 1, payload: { text, ...(fields ? { fields } : {}) } });
export function nativeQuery(query) {
  if (typeof query === 'string') return query;
  if (query.kind === 'phrase') return extension(query.text, query.fields);
  if (query.kind === 'and' || query.kind === 'or') return { ...query, children: query.children.map(nativeQuery) };
  if (query.kind === 'not') return { ...query, child: nativeQuery(query.child) };
  return query;
}
export function setup(schema, options = {}) {
  const fields = Object.keys(schema.text), host = new FakeHost();
  const configuration = captureConfiguration({ schema, addons: [createSourceProvider({ fields }), createSourcePhrases({ fields })], ...options });
  const installed = initializeParticipants(configuration);
  const engine = new ExecutionOwner(emptyRoot(configuration, installed.states), host, installed.participants);
  return { engine, host, async call(method, ...args) { const promise = engine[method](...args); host.runReady(); return promise; } };
}
export function compare(actual, expected, revision) {
  assert.equal(actual.revision, revision); assert.equal(actual.completeness, 'complete'); assert.equal(actual.model, 'raveldex-bm25-v1');
  assert.equal(actual.total, expected.total);
  assert.deepEqual(actual.hits.map(({ id }) => id), expected.hits.map(({ id }) => id));
  for (let i = 0; i < actual.hits.length; i++) assert.ok(Math.abs(actual.hits[i].score - expected.hits[i].score) <= Math.max(1e-12, Math.abs(expected.hits[i].score) * 1e-12), `${actual.hits[i].id}: ${actual.hits[i].score} vs ${expected.hits[i].score}`);
}
export function drain(cursor) { let workUnits = 0, steps = 0; for (;;) { const step = cursor.next(); if (step.done) return { value: step.value, workUnits, steps }; assert.ok(step.value.workUnits > 0); workUnits += step.value.workUnits; steps++; } }
