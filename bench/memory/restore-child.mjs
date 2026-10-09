import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

// The watchdog owns only this spawned process; it never signals a process group.
export async function runBoundedChild(command, args, options, { timeoutMs = 180000, killGraceMs = 1000, onStderr = () => {} } = {}) {
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0);
  assert.ok(Number.isSafeInteger(killGraceMs) && killGraceMs > 0);
  const started = performance.now();
  let stderr = '', timedOut = false, spawnFailure = null, terminationAttempted = false, killAttempted = false;
  return new Promise(resolve => {
    const running = spawn(command, args, { ...options, stdio: ['ignore', 'inherit', 'pipe'] });
    let hardKill;
    const timeout = setTimeout(() => {
      timedOut = true; terminationAttempted = running.kill('SIGTERM');
      hardKill = setTimeout(() => { killAttempted = running.kill('SIGKILL'); }, killGraceMs);
    }, timeoutMs);
    running.stderr.on('data', bytes => { stderr += bytes; onStderr(bytes); });
    running.once('error', error => { spawnFailure = { name: error.name, code: error.code ?? null, message: error.message }; });
    running.once('close', (exitCode, signal) => {
      clearTimeout(timeout); clearTimeout(hardKill);
      resolve({ childPid: running.pid ?? null, childExitCode: exitCode, childSignal: signal, childWallMs: performance.now() - started, childWallLimitMs: timeoutMs,
        childTimedOut: timedOut, terminationAttempted, killAttempted, spawnFailure, stderr });
    });
  });
}
