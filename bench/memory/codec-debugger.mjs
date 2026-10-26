// Instrumentation worker only: pause/dump the main isolate, never parse heaps.
import assert from 'node:assert/strict';
import { Session } from 'node:inspector/promises';
import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { openSync, writeSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const session = new Session(); session.connectToMainThread();
const hash = b => createHash('sha256').update(b).digest('hex'), sourceBindings = [];
const source = {};
for (const name of ['json', 'snapshots']) {
  const path = join(workerData.installed, `dist/adapters/snapshots/${name}.js`), bytes = await readFile(path);
  source[name] = { path, url: pathToFileURL(path).href, text: bytes.toString(), sha256: hash(bytes) };
  sourceBindings.push({ path, sha256: source[name].sha256 });
}
const definitions = workerData.role === 'producer' ? [
  { stage: 'encode-prejoin', script: 'json', fn: 'encodeJson', line: "    return chunks.join('');" },
  { stage: 'encode-envelope', script: 'snapshots', fn: 'encoded', line: '    yield* utf8Bytes(result, maximum);' },
] : [
  { stage: 'decode-envelope', script: 'snapshots', fn: 'restoreCursor', line: "    check('snapshot.integrity');" },
  { stage: 'restore-precommit', script: 'snapshots', fn: 'restoreCursor', line: "    check('snapshot.precommit');" },
];
const oldData = 'oldDocuments: root.documents, oldFields: root.fields, oldParticipants: root.participants';
let captures = 0, failed = false, activeDump;
function onChunk({ params }) {
  if (!activeDump) return;
  const bytes = Buffer.from(params.chunk); activeDump.bytes += bytes.length; activeDump.chunks++;
  if (activeDump.bytes > 512 * 1024 * 1024) { activeDump.error = 'Dump exceeds512MiB'; return; }
  try { for (let at = 0; at < bytes.length;) { const n = writeSync(activeDump.fd, bytes, at); assert.ok(n > 0); at += n; } }
  catch (error) { activeDump.error = error.message; }
}
async function evaluate(frame, expression) {
  const r = await session.post('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId, expression, returnByValue: true });
  assert.equal(r.exceptionDetails, undefined, 'Unavailable or invalid lexical data refuses capture'); return r.result.value;
}
async function checkedFrame(frames, fn, script) {
  const matches = frames.filter(f => f.functionName === fn); assert.equal(matches.length, 1, `Exactly one ${fn} frame required`);
  const frame = matches[0], { scriptSource } = await session.post('Debugger.getScriptSource', { scriptId: frame.location.scriptId });
  assert.equal(hash(scriptSource), source[script].sha256, 'Actual compiled source must match installed source'); return frame;
}
session.on('Debugger.paused', async ({ params }) => {
  let definition;
  try {
    definition = definitions[captures]; assert.ok(definition, 'Unexpected extra pause');
    assert.deepEqual(params.hitBreakpoints, [definition.breakpointId], 'Ordered exact breakpoint required');
    const frame = await checkedFrame(params.callFrames, definition.fn, definition.script);
    assert.equal(frame.location.lineNumber, definition.lineNumber, 'Breakpoint relocated to another line');
    let before;
    if (definition.stage === 'encode-prejoin') {
      const caller = await checkedFrame(params.callFrames, 'encoded', 'snapshots');
      await evaluate(caller, `(() => { if(format!=='raveldex-native')throw Error('Wrong format');
        globalThis.__raveldexCodecRoot = root; return true; })()`);
      before = await evaluate(frame, `(() => { const root=globalThis.__raveldexCodecRoot;
        if(!Array.isArray(chunks)||!chunks.length||active.size!==0||!Object.isFrozen(value)||value.payload.documents!==root.documents||value.payload.fields!==root.fields||value.payload.counts!==root.counts||value.payload.participants!==root.participants)throw Error('Wrong prejoin data');
        return globalThis.__raveldexCodecBefore('${definition.stage}', {${oldData}, value, chunks}, {root},
          {chunkCount:chunks.length, bodyEncodedUtf8Bytes:bytes, maximum, originRevision:root.revision, nativeAliasesChecked:true}); })()`);
    } else if (definition.stage === 'encode-envelope') {
      before = await evaluate(frame, `(() => { if(format!=='raveldex-native'||typeof body!=='string'||typeof result!=='string'||body.length>=result.length||payload.documents!==root.documents||payload.fields!==root.fields||payload.counts!==root.counts||payload.participants!==root.participants)throw Error('Wrong envelope data');
        return globalThis.__raveldexCodecBefore('${definition.stage}', {${oldData},payload,bodyText:body,envelopeText:result},{root},
          {bodyCodeUnits:body.length,envelopeCodeUnits:result.length,originRevision:root.revision,nativeAliasesChecked:true}); })()`);
    } else if (definition.stage === 'decode-envelope') {
      before = await evaluate(frame, `(() => { if(envelope!==decoded.value||envelope.format!=='raveldex-native'||typeof encoded!=='string'||typeof decoded.bodyText!=='string'||!Object.isFrozen(decoded.value)||decoded.value.body.payload.documents.size!==${workerData.size})throw Error('Wrong decoded data');
        return globalThis.__raveldexCodecBefore('${definition.stage}', {${oldData},encodedText:encoded,bodyText:decoded.bodyText,decodedValue:decoded.value},{root,decoded},
          {inputCodeUnits:encoded.length,bodyCodeUnits:decoded.bodyText.length,priorRevision:root.revision,envelopeValidatedOnly:true}); })()`);
    } else {
      before = await evaluate(frame, `(() => { const payload=body.payload;
        if(format!=='raveldex-native'||prepared.documents!==payload.documents||prepared.fields!==payload.fields||prepared.counts!==payload.counts||prepared.participants!==payload.participants||prepared.configuration!==root.configuration||next.documents!==prepared.documents||next.fields!==prepared.fields||next.counts!==prepared.counts||next.participants===prepared.participants||next.revision!==root.revision+1)throw Error('Wrong receiving aliases');
        for(const id of Object.keys(prepared.participants))if(next.participants[id].records!==prepared.participants[id].records||next.participants[id].revision!==next.revision)throw Error('Wrong participant reuse');
        return globalThis.__raveldexCodecBefore('${definition.stage}', {${oldData},candidateDocuments:next.documents,candidateFields:next.fields,candidateParticipants:next.participants,encodedText:encoded,bodyText:decoded.bodyText,decodedValue:decoded.value},{root,decoded,prepared,candidate:next},
          {priorRevision:root.revision,originRevision:origin.originRevision,candidateRevision:next.revision,decodedDataReused:true,participantRecordsReused:true}); })()`);
    }
    const path = join(workerData.directory, `${workerData.size}-${definition.stage}.heapsnapshot`);
    activeDump = { fd: openSync(path, 'wx'), bytes: 0, chunks: 0 };
    session.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
    try { await session.post('HeapProfiler.takeHeapSnapshot'); assert.equal(activeDump.error, undefined); }
    finally { session.off('HeapProfiler.addHeapSnapshotChunk', onChunk); closeSync(activeDump.fd); }
    const dump = { path, bytes: activeDump.bytes, chunks: activeDump.chunks }; activeDump = undefined;
    const after = await evaluate(frame, 'globalThis.__raveldexCodecAfter()');
    captures++;
    parentPort.postMessage({ type: 'capture', stage: definition.stage, before, after, dump, location: frame.location, sourceBindings });
  } catch (error) { failed = true; parentPort.postMessage({ type: 'failure', stage: definition?.stage, name: error.name, message: error.message }); }
  finally {
    try { await session.post('Runtime.evaluate', { expression: 'delete globalThis.__raveldexCodecMarkers; delete globalThis.__raveldexCodecRoot; true', returnByValue: true }); } catch {}
    await session.post('Debugger.resume');
  }
});
parentPort.on('message', async message => {
  if (message === 'close') {
    await session.post('Debugger.disable'); session.disconnect();
    parentPort.postMessage({ type: 'closed', captures, failed }); parentPort.close();
  }
});
await session.post('Debugger.enable');
for (const d of definitions) {
  const lines = source[d.script].text.split('\n'), matches = lines.flatMap((line, i) => line === d.line ? [i] : []); assert.equal(matches.length, 1);
  d.lineNumber = matches[0];
  const result = await session.post('Debugger.setBreakpointByUrl', { url: source[d.script].url, lineNumber: d.lineNumber });
  assert.equal(result.locations.length, 1); assert.equal(result.locations[0].lineNumber, d.lineNumber); d.breakpointId = result.breakpointId;
}
parentPort.postMessage({ type: 'ready', definitions, sourceBindings });
