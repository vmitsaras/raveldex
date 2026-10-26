// An observer worker pauses the main isolate. No same-thread breakpoint session.
import assert from 'node:assert/strict';
import { Session } from 'node:inspector/promises';
import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';

const session = new Session(); session.connectToMainThread();
let captures = 0, failed = false;
session.on('Debugger.paused', async ({ params }) => {
  try {
    const frames = params.callFrames.filter(frame => frame.functionName === 'consume');
    assert.equal(frames.length, 1, 'Exactly one actual consume frame required');
    const frame = frames[0];
    const { scriptSource } = await session.post('Debugger.getScriptSource', { scriptId: frame.location.scriptId });
    assert.equal(createHash('sha256').update(scriptSource).digest('hex'), workerData.consumeSha256, 'Compiled native mutation source must match');
    assert.match(scriptSource.split('\n')[frame.location.lineNumber], /boundary\('precommit'\)/, 'Pause must be at native precommit');
    const response = await session.post('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId, returnByValue: true,
      expression: `(() => {
        if (phase !== 'precommit' || request.kind !== 'replace' || changes.length !== 1 ||
            old === root || root.revision !== old.revision + 1 || !Object.isFrozen(old) || !Object.isFrozen(root) ||
            context.previous !== old || context.core !== core || context.changes !== changes || context.records !== request.records ||
            core.documents !== root.documents || core.fields !== root.fields || core.counts !== root.counts ||
            core.participants !== old.participants || root.participants === old.participants || root.configuration !== old.configuration ||
            request.records[0].id !== 'item:00000' || changes[0].previous.id !== 'item:00000' || changes[0].next.id !== 'item:00000') throw Error('Wrong native staging frame');
        if (Object.hasOwn(globalThis, '__raveldexMutationMarkers')) throw Error('Stale observer marker');
        globalThis.__raveldexMutationMarkers = { old, candidate: root, core, context, changes, request };
        return { previousRevision: old.revision, candidateRevision: root.revision, nativePhase: phase, kind: request.kind,
          changedId: changes[0].next.id, sourceIdentityChecked: true, structuralAliasesChecked: true };
      })()` });
    assert.equal(response.exceptionDetails, undefined, 'Unavailable or wrong lexical values refuse capture');
    assert.ok(response.result.value?.structuralAliasesChecked);
    captures++;
    parentPort.postMessage({ type: 'capture', ordinal: captures, ...response.result.value, scriptLocation: frame.location,
      compiledConsumeSha256: workerData.consumeSha256 });
  } catch (error) {
    failed = true; parentPort.postMessage({ type: 'failure', name: error.name, message: error.message });
  } finally { await session.post('Debugger.resume'); }
});
parentPort.on('message', async message => {
  if (message === 'close') {
    await session.post('Debugger.disable'); session.disconnect();
    parentPort.postMessage({ type: 'closed', captures, failed }); parentPort.close();
  }
});
await session.post('Debugger.enable');
parentPort.postMessage({ type: 'ready' });
