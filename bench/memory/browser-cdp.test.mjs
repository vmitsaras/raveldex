import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { nestedSession, validateHeapUsage, maximaByRealm, samplingTotals } from './browser-cdp.mjs';

function parent() {
  const emitter = new EventEmitter(); emitter.sent = [];
  emitter.send = async (method, params) => { emitter.sent.push({ method, ...params }); };
  return emitter;
}
test('worker CDP demultiplexes out-of-order replies, excludes foreign sessions and rejects protocol errors', async () => {
  const channel = parent(), session = nestedSession(channel, 'owned');
  const first = session.send('Runtime.getHeapUsage'), second = session.send('Runtime.getIsolateId');
  channel.emit('Target.receivedMessageFromTarget', { sessionId: 'other', message: '{"id":1,"result":{"wrong":true}}' });
  channel.emit('Target.receivedMessageFromTarget', { sessionId: 'owned', message: '{"id":2,"result":{"id":"worker"}}' });
  channel.emit('Target.receivedMessageFromTarget', { sessionId: 'owned', message: '{"id":1,"result":{"usedSize":12}}' });
  assert.deepEqual(await first, { usedSize: 12 }); assert.deepEqual(await second, { id: 'worker' });
  assert.equal(JSON.parse(channel.sent[0].message).method, 'Runtime.getHeapUsage');
  const failing = session.send('Unknown'); channel.emit('Target.receivedMessageFromTarget', { sessionId: 'owned', message: '{"id":3,"error":{"code":-1}}' });
  await assert.rejects(failing, /-1/); session.close(); assert.equal(channel.listenerCount('Target.receivedMessageFromTarget'), 0);
});
test('worker CDP detach, transport failure and timeout settle pending commands and clean up listeners', async () => {
  const channel = parent(), session = nestedSession(channel, 'owned', 10);
  const pending = session.send('Runtime.enable'); channel.emit('Target.detachedFromTarget', { sessionId: 'owned' });
  await assert.rejects(pending, /closed/); await assert.rejects(session.send('Runtime.enable'), /closed/);
  assert.equal(channel.listenerCount('Target.detachedFromTarget'), 0);
  const timeout = nestedSession(channel, 'new', 10); await assert.rejects(timeout.send('never'), /timeout/); timeout.close();
  channel.send = async () => { throw Error('transport gone'); };
  const failed = nestedSession(channel, 'failed'); await assert.rejects(failed.send('command'), /transport gone/); failed.close();
});
test('heap fields reject missing/nonfinite data and maxima remain separate per isolate', () => {
  const bytes = { usedSize: 5, totalSize: 10, embedderHeapUsedSize: 0, backingStorageSize: 2 };
  assert.deepEqual(validateHeapUsage(bytes), bytes);
  assert.throws(() => validateHeapUsage({ ...bytes, backingStorageSize: NaN })); assert.throws(() => validateHeapUsage({ usedSize: 0 }));
  const rows = [{ realm: 'main', bytes }, { realm: 'main', bytes: { ...bytes, usedSize: 3, backingStorageSize: 4 } }, { realm: 'worker', bytes: { ...bytes, usedSize: 80 } }];
  const maxima = maximaByRealm(rows); assert.equal(maxima[0].maximaBytes.usedSize, 5); assert.equal(maxima[0].maximaBytes.backingStorageSize, 4);
  assert.equal(maxima[1].maximaBytes.usedSize, 80); assert.throws(() => maximaByRealm(rows.slice(0, 2)));
});
test('statistical profile keeps unresolved allocating nodes explicit instead of dropping or attributing them', () => {
  const profile = { head: { id: 0, selfSize: 1, callFrame: { url: '' }, children: [{ id: 1, selfSize: 5, callFrame: { url: 'worker' } }] },
    samples: [{ nodeId: 1, ordinal: 1, size: 5 }, { nodeId: 3, ordinal: 2, size: 7 }] };
  const result = samplingTotals(profile);
  assert.equal(result.reportedNodeSelfSizeSumBytes, 6); assert.equal(result.reportedSampleSizeSumBytes, 12);
  assert.equal(result.unresolvedSampleSizeSumBytes, 7); assert.deepEqual(result.unresolvedSamples, [profile.samples[1]]);
  assert.throws(() => samplingTotals({ ...profile, samples: [...profile.samples, profile.samples[0]] }));
  assert.throws(() => samplingTotals({ ...profile, samples: [{ nodeId: 1, ordinal: 1, size: Infinity }] }));
});
