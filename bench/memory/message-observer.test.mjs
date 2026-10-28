import assert from 'node:assert/strict';
import { test } from 'node:test';
import { observeMessages } from './message-observer.mjs';

test('message observer forwards original native arguments/events and binds only primitive protocol metadata', () => {
  const native = new EventTarget(), sent = [];
  native.postMessage = function (...args) { assert.equal(this, native); sent.push(args); };
  const observation = observeMessages(native, 'main'), endpoint = observation.endpoint;
  const payload = { text: 'synthetic private test body' };
  const request = { protocol: 1, session: 's-123', id: 8, operation: 'add', payload };
  const transfer = [];
  endpoint.postMessage(request, transfer);
  assert.equal(sent[0][0], request); assert.equal(sent[0][1], transfer);
  let delivered;
  const listener = function (event) { assert.equal(this, native); delivered = event; };
  endpoint.addEventListener('message', listener);
  const event = new Event('message'); Object.defineProperty(event, 'data', { value: request });
  native.dispatchEvent(event); assert.equal(delivered, event);
  const snapshot = observation.snapshot();
  assert.equal(snapshot.rows.length, 4);
  assert.deepEqual(snapshot.rows.map(row => [row.direction, row.edge, row.protocol, row.session, row.id, row.operation]), [
    ['send', 'begin', 1, 's-123', 8, 'add'], ['send', 'end', 1, 's-123', 8, 'add'],
    ['read', 'begin', 1, 's-123', 8, 'add'], ['read', 'end', 1, 's-123', 8, 'add'],
  ]);
  assert.ok(snapshot.rows.every(row => !Object.values(row).includes(payload)));
  snapshot.rows[0].session = 'changed'; assert.equal(observation.snapshot().rows[0].session, 's-123');
  endpoint.removeEventListener('message', listener); delivered = undefined;
  native.dispatchEvent(event); assert.equal(delivered, undefined);
  assert.equal(observation.snapshot().messageListeners, 0);
  performance.clearMarks();
});

test('refusal and bounded observation loss preserve actual transport behavior', () => {
  const native = new EventTarget(), failure = Error('literal native failure'); let calls = 0;
  native.postMessage = () => { calls++; if (calls === 1) throw failure; };
  const observation = observeMessages(native, 'worker');
  const envelope = { protocol: 1, session: 's-456', id: 1, operation: 'search', kind: 'result' };
  assert.throws(() => observation.endpoint.postMessage(envelope), error => error === failure);
  assert.equal(observation.snapshot().rows.at(-1).edge, 'end');
  for (let i = 0; i < 513; i++) observation.endpoint.postMessage(envelope);
  assert.equal(calls, 514); assert.equal(observation.snapshot().rows.length, 1024);
  assert.equal(observation.snapshot().dropped, 4);
  assert.throws(() => observation.endpoint.addEventListener('message', () => {}, {}), /option-free/);
  assert.throws(() => observeMessages(native, 'wrong'), /Unknown realm/);
  performance.clearMarks();
});
