// Reconstruct this finite Apple system-malloc control from immutable text exports.
// No process attachment, source execution, extraction or product-peak inference.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const [input, output] = process.argv.slice(2);
assert.ok(input && output, 'Supply archive and a NEW audit output path');
const hash = value => createHash('sha256').update(value).digest('hex');
const compressed = await readFile(input);
const raw = gunzipSync(compressed);
const archive = JSON.parse(raw);
assert.equal(archive.kind, 'raveldex-native-allocator-event-control-archive-v1');
const files = new Map();
for (const member of archive.members) {
  assert.ok(!files.has(member.name), 'Duplicate member');
  assert.ok(/^(approved|sandbox)\/[a-z0-9.-]+$/.test(member.name), 'Unexpected member path');
  assert.equal(Buffer.byteLength(member.text), member.bytes);
  assert.equal(hash(member.text), member.sha256);
  files.set(member.name, member.text);
}
const text = name => { assert.ok(files.has(name), 'Missing ' + name); return files.get(name); };
const approved = JSON.parse(text('approved/report.json'));
const sandbox = JSON.parse(text('sandbox/report.json'));
assert.deepEqual(approved.childExit, { code: 0, signal: null });
assert.deepEqual(sandbox.childExit, { code: 0, signal: null });
assert.deepEqual(approved.errors, []);
assert.deepEqual(sandbox.errors, []);
for (const [prefix, report] of [['approved', approved], ['sandbox', sandbox]]) {
  assert.equal(hash(text(prefix + '/control.c')), report['control.cSha256']);
  assert.equal(hash(text(prefix + '/probe.mjs')), report['probe.mjsSha256']);
  assert.equal(hash(text(prefix + '/control.stderr')), report.controlStderrSha256);
  assert.equal(report.commands.length, 4);
  for (const command of report.commands) {
    assert.equal(command.timedOut, false);
    assert.equal(command.exceeded, false);
    assert.equal(command.signal, null);
    for (const stream of ['stdout', 'stderr']) {
      const data = text(`${prefix}/${command.name}.${stream}`);
      assert.equal(Buffer.byteLength(data), command[stream + 'Bytes']);
      assert.equal(hash(data), command[stream + 'Sha256']);
    }
    if (command.binary === '/usr/bin/malloc_history') {
      assert.equal(command.args[0], String(report.pid), 'Only exact owned child PID');
      assert.equal(command.code, prefix === 'approved' ? 0 : 255);
      if (prefix === 'sandbox') assert.match(text(`${prefix}/${command.name}.stderr`), /mach port for process 0 not valid/);
    } else {
      assert.equal(command.binary, '/usr/bin/clang');
      assert.equal(command.code, 0);
    }
  }
}
assert.equal(approved['control.cSha256'], sandbox['control.cSha256']);
assert.equal(approved['probe.mjsSha256'], sandbox['probe.mjsSha256']);
assert.deepEqual(approved.controlRows.map(row => row.phase), ['allocated', 'observing', 'released', 'finished']);
const [allocated, observing] = approved.controlRows;
assert.equal(allocated.pid, approved.pid);
const targets = [
  { role: 'held', address: allocated.held, bytes: allocated.heldUsable },
  { role: 'transient', address: allocated.transient, bytes: allocated.transientUsable },
  { role: 'resized-before', address: allocated.resizedBefore, bytes: allocated.resizedBeforeUsable },
  { role: 'resized-after', address: observing.resizedAfter, bytes: observing.resizedAfterUsable }
];
assert.equal(new Set(targets.map(target => target.address)).size, 4, 'This control has no selected-address reuse');
assert.deepEqual(targets.map(target => target.bytes), [1048576, 3145728, 2097152, 4194304]);

function events(source) {
  const found = [];
  for (const [lineIndex, line] of source.split('\n').entries()) {
    if (!/^(?:ALLOC|FREE|VM_ALLOC|VM_DEALLOC)\s/.test(line)) continue;
    const match = /^(ALLOC|FREE|VM_ALLOC|VM_DEALLOC)\s+(0x[0-9a-f]+)(?:-(0x[0-9a-f]+) \[size=(\d+)\])?:/i.exec(line);
    assert.ok(match, 'Unrecognized event syntax at line ' + (lineIndex + 1));
    const [, kind, address, end, size] = match;
    const bytes = size === undefined ? null : Number(size);
    if (bytes !== null) {
      assert.ok(Number.isSafeInteger(bytes) && bytes > 0);
      assert.equal(BigInt(end) - BigInt(address) + 1n, BigInt(bytes));
    }
    found.push({ ordinal: found.length + 1, line: lineIndex + 1, kind, address, bytes });
  }
  assert.ok(found.length > 0);
  return found;
}
const stages = {};
for (const name of ['held-all-events', 'high-water-events', 'released-all-events']) {
  const source = text(`approved/${name}.stdout`);
  const all = events(source);
  const selected = all.filter(event => ['ALLOC', 'FREE'].includes(event.kind) && targets.some(target => target.address === event.address));
  const live = new Map();
  let selectedLiveBytes = 0, selectedEventHighWaterBytes = 0;
  for (const event of selected) {
    if (event.kind === 'ALLOC') {
      assert.ok(!live.has(event.address), 'Double allocation in selected control');
      const target = targets.find(target => target.address === event.address);
      assert.equal(event.bytes, target.bytes);
      live.set(event.address, event.bytes);
      selectedLiveBytes += event.bytes;
      selectedEventHighWaterBytes = Math.max(selectedEventHighWaterBytes, selectedLiveBytes);
    } else {
      assert.ok(live.has(event.address), 'Free without selected allocation');
      selectedLiveBytes -= live.get(event.address);
      live.delete(event.address);
    }
  }
  stages[name] = {
    exportedEventCount: all.length,
    selectedEvents: selected.map(event => ({ ...event, role: targets.find(target => target.address === event.address).role })),
    selectedLiveBytes, selectedEventHighWaterBytes,
    liveRoles: targets.filter(target => live.has(target.address)).map(target => target.role),
    toolHighWaterText: source.split('\n').find(line => line.startsWith('High water mark of allocated heap + VM memory:')) ?? null
  };
}
assert.deepEqual(stages['held-all-events'].liveRoles, ['held', 'resized-after']);
assert.deepEqual(stages['released-all-events'].liveRoles, []);
assert.deepEqual(stages['high-water-events'].liveRoles, ['held', 'transient', 'resized-before']);
assert.equal(stages['held-all-events'].selectedLiveBytes, 5242880);
assert.equal(stages['released-all-events'].selectedLiveBytes, 0);
for (const stage of Object.values(stages)) assert.equal(stage.selectedEventHighWaterBytes, 6291456);
const heldEvents = stages['held-all-events'].selectedEvents;
assert.equal(heldEvents.filter(event => event.role === 'transient' && event.kind === 'FREE').length, 1);
assert.ok(heldEvents.findIndex(event => event.role === 'resized-before' && event.kind === 'FREE') < heldEvents.findIndex(event => event.role === 'resized-after' && event.kind === 'ALLOC'));
const discovery = JSON.parse(text('approved/tool-discovery.json'));
assert.equal(discovery.commands.find(command => command.binary === '/usr/bin/xcrun').code, 72);
const result = {
  kind: 'raveldex-native-allocator-event-control-audit-v1',
  archive: { path: input, bytes: compressed.length, sha256: hash(compressed), rawBytes: raw.length, rawSha256: hash(raw), members: files.size },
  environment: approved.environment, approvedPid: approved.pid, targets, stages,
  sandboxMachPortFailure: 'Observed; approved execution succeeds without sudo or system changes',
  childCleanup: 'Both controlled children exited 0 with no kill/timeout',
  outcome: 'Pass for selected C system-malloc allocation/free history; product allocation and transport peaks remain Blocked',
  limits: [
    'Selected API-visible ALLOC/FREE replay, not physical live backing or isolated product allocation peak.',
    'VM reservations and malloc payload are separate and never summed here.',
    'Realloc exports FREE old before ALLOC new; internal copy overlap is not established.',
    'Four distinct selected addresses; address-reuse behavior is not calibrated.',
    'No timestamp field in selected text events; no cross-process operation/message clock binding.',
    'No Chrome PartitionAlloc, V8 object, serializer backing or Node product workload was observed.',
    'Instrumented overhead and allocator coverage are not measured or inferred from successful control.'
  ]
};
await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ outcome: result.outcome, archive: result.archive, stages: Object.fromEntries(Object.entries(stages).map(([name, value]) => [name, { events: value.exportedEventCount, selectedHighWater: value.selectedEventHighWaterBytes, selectedLive: value.selectedLiveBytes }])) }));
