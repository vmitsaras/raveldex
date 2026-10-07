import assert from 'node:assert/strict';
import { createRaveldex } from '../../../dist/index.js';
import { createMatchEvidence } from '../../../dist/addons/evidence/index.js';
import { createSnippetEvidence } from '../../../dist/addons/snippets/index.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { createPositionPhrases } from '../../../dist/addons/positions/phrases.js';
import { createPhrases } from '../../../dist/addons/phrases/mixed.js';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { initializeParticipants } from '../../../dist/core/capabilities/participants.js';
import { emptyRoot, ExecutionOwner } from '../../../dist/core/execution/engine.js';
import { FakeHost } from '../../fixtures/execution/host.mjs';
import { schema } from '../../fixtures/evidence/original.mjs';

export { schema, FakeHost };
export const plain = value => JSON.parse(JSON.stringify(value));
export const request = (ids, extra = {}, capability = 'match-evidence') => ({ extensions: { [capability]: { ids, ...extra } } });
export const data = (result, capability = 'match-evidence') => result.extensions[capability];
export const observe = promise => promise.then(value => ({ value }), error => ({ error }));
export const coreResult = result => { const { extensions, ...rest } = result; return { ...rest, ...(extensions && Object.keys(extensions).some(key => key !== 'match-evidence' && key !== 'snippets') ? { extensions: Object.fromEntries(Object.entries(extensions).filter(([key]) => key !== 'match-evidence' && key !== 'snippets')) } : {}) }; };
export function frozen(value) { if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) frozen(child); } }
export function released(host, ...signals) { assert.equal(host.pending, 0); for (const signal of signals) assert.equal(signal.listenerCount, 0); }
export function fieldsFor(strategy, fields = ['title', 'body']) { return Object.fromEntries(fields.map((field, index) => [field, strategy === 'source' || strategy === 'mixed' && index === 0 ? 'source' : 'offsets'])); }
export function addonsFor(strategy = 'source', { fields = fieldsFor(strategy), snippets = false, factory = {}, evidence } = {}) {
  const source = Object.keys(fields).filter(field => fields[field] === 'source'), offsets = Object.keys(fields).filter(field => fields[field] === 'offsets');
  return [
    ...(source.length || snippets ? [createSourceProvider({ fields: snippets ? Object.keys(fields) : source })] : []),
    ...(offsets.length ? [createPositionProvider({ fields: offsets, offsets })] : []),
    ...(source.length && !offsets.length ? [createSourcePhrases({ fields: source })] : []),
    ...(offsets.length && !source.length ? [createPositionPhrases({ fields: offsets })] : []),
    ...(offsets.length && source.length ? [createPhrases({ fields: Object.fromEntries(Object.entries(fields).map(([field, provider]) => [field, provider === 'offsets' ? 'positions' : provider])) })] : []),
    evidence ?? (snippets ? createSnippetEvidence({ fields, ...factory }) : createMatchEvidence({ fields, ...factory })),
  ];
}
export function publicEngine(strategy = 'source', options = {}, setupOptions = {}) { return createRaveldex({ schema, addons: addonsFor(strategy, setupOptions), ...options }); }
export function setup(strategy = 'source', options = {}, setupOptions = {}) {
  const host = new FakeHost();
  const configuration = captureConfiguration({ schema, addons: addonsFor(strategy, setupOptions), ...options });
  const installed = initializeParticipants(configuration);
  const engine = new ExecutionOwner(emptyRoot(configuration, installed.states), host, installed.participants);
  return { engine, host, configuration, async call(method, ...args) { const promise = engine[method](...args); host.runReady(); return promise; } };
}
export function entries(value) { return value && typeof value === 'object' ? Reflect.ownKeys(value).length + Object.values(value).reduce((sum, child) => sum + entries(child), 0) : 0; }
export function drain(cursor) { let work = 0; for (;;) { const step = cursor.next(); if (step.done) return { result: step.value, work }; work += step.value.workUnits; } }
