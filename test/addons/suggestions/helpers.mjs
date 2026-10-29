import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { initializeParticipants } from '../../../dist/core/capabilities/participants.js';
import { emptyRoot, ExecutionOwner } from '../../../dist/core/execution/engine.js';
import { executeSearch } from '../../../dist/core/query/search.js';
import { createSuggestions } from '../../../dist/addons/suggestions/index.js';
import { FakeHost } from '../../fixtures/execution/host.mjs';

export const schema = { text: { title: {}, body: { boost: 2 } }, metadata: { category: { type: 'string' } } };
export const request = (text, extra = {}) => ({ extensions: { suggestions: { text, fields: ['title'], ...extra } } });
export function drain(cursor) {
  let units = 0, steps = 0;
  for (;;) { const next = cursor.next(); if (next.done) return { value: next.value, units, steps }; units += next.value.workUnits; steps++; }
}
export function setup(options = {}) {
  const host = new FakeHost();
  const configuration = captureConfiguration({ schema, addons: [createSuggestions({ fields: ['title', 'body'] })], ...options });
  const installed = initializeParticipants(configuration);
  const engine = new ExecutionOwner(emptyRoot(configuration, installed.states), host, installed.participants);
  return { host, engine, configuration, async call(method, ...args) { const result = engine[method](...args); host.runReady(); return result; } };
}
export const search = (root, query, options, trace) => drain(executeSearch(root, query, options, trace));
