import assert from 'node:assert/strict';
import { createRaveldex } from '../../../dist/index.js';
import { createInspector } from '../../../dist/addons/inspector/index.js';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { initializeParticipants } from '../../../dist/core/capabilities/participants.js';
import { emptyRoot, ExecutionOwner } from '../../../dist/core/execution/engine.js';
import { FakeHost } from '../../fixtures/execution/host.mjs';

export const schema = { text: { title: {}, body: { boost: 2 } }, metadata: { price: { type: 'number' }, active: { type: 'boolean' } } };
export const records = [
  { id: 'a', text: { title: 'red red car', body: ['red', 'blue'] }, metadata: { price: 5, active: true } },
  { id: 'b', text: { title: 'red car', body: 'car' }, metadata: { price: 15, active: false } },
  { id: 'c', text: { title: 'blue' }, metadata: { price: 25 } },
  { id: 'empty', text: { title: ['!!!', ''] } },
];
export const request = (ids = ['a', 'b', 'c', 'empty', 'missing'], extra = {}) => ({ extensions: { inspector: { ids, ...extra } } });
export const data = result => result.extensions.inspector;
export const plain = value => JSON.parse(JSON.stringify(value));
export function publicEngine(options = {}) { return createRaveldex({ schema, addons: [createInspector()], ...options }); }
export function setup(options = {}) {
  const host = new FakeHost();
  const configuration = captureConfiguration({ schema, addons: [createInspector()], ...options });
  const installed = initializeParticipants(configuration);
  const engine = new ExecutionOwner(emptyRoot(configuration, installed.states), host, installed.participants);
  return { engine, host, configuration, async call(method, ...args) { const promise = engine[method](...args); host.runReady(); return promise; } };
}
export const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-12, Math.abs(expected) * 1e-12), `${actual} != ${expected}`);
export function coreResult(result) { const { extensions, ...core } = result; return { ...core, ...(extensions && Object.keys(extensions).some(key => key !== 'inspector') ? { extensions: Object.fromEntries(Object.entries(extensions).filter(([key]) => key !== 'inspector')) } : {}) }; }
export function frozen(value) { if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) frozen(child); } }
export function released(host, ...signals) { assert.equal(host.pending, 0); for (const signal of signals) assert.equal(signal.listenerCount, 0); }
export const observe = promise => promise.then(value => ({ value }), error => ({ error }));
export function replay(inspector, result) {
  const fields = inspector.trace.facts.filter(fact => fact.kind === 'field');
  let arithmeticAssertions = 0;
  for (const f of fields) {
    assert.equal(f.k1, 1.2); assert.equal(f.b, .75); arithmeticAssertions += 2;
    close(f.avgLength, f.totalLength / f.N);
    close(f.idf, Math.log(1 + (f.N - f.df + .5) / (f.df + .5)));
    close(f.normalizer, 1.2 * (.25 + .75 * f.length / f.avgLength));
    close(f.tfPart, f.tf * 2.2 / (f.tf + f.normalizer));
    close(f.base, f.boost * f.idf * f.tfPart);
    close(f.selected, f.weight * f.base); arithmeticAssertions += 6;
  }
  for (const f of inspector.trace.facts.filter(fact => fact.kind === 'group')) {
    close(f.score, fields.filter(field => field.id === f.id && field.group === f.group).sort((a, b) => a.field < b.field ? -1 : 1).reduce((sum, field) => sum + field.selected, 0)); arithmeticAssertions++;
  }
  for (const f of inspector.trace.facts.filter(fact => fact.kind === 'document')) {
    close(f.score, inspector.trace.facts.filter(group => group.kind === 'group' && group.id === f.id).sort((a, b) => a.group < b.group ? -1 : 1).reduce((sum, group) => sum + group.score, 0)); arithmeticAssertions++;
    const hit = result.hits.find(hit => hit.id === f.id); if (hit) { assert.equal(f.score, hit.score); arithmeticAssertions++; }
  }
  return arithmeticAssertions;
}
