import assert from 'node:assert/strict';
import { mkdtemp, open, writeFile, symlink, link, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { restoreEvidenceInventory } from './restore-inventory.mjs';

test('only explicit empty capture matching both stdio handles is mutable; other logs remain immutable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rx4002-capture-'));
  try {
    const output = join(directory, 'RX-4002-memory-restore-new.json'), captureLog = output.replace(/\.json$/, '.log'), oldLog = join(directory, 'prior.log');
    await writeFile(captureLog, ''); await writeFile(oldLog, 'immutable'); const capture = await open(captureLog, 'a'), other = await open(oldLog, 'r');
    try {
      const paths = [oldLog, captureLog], options = { output, captureLog, stdoutFd: capture.fd, stderrFd: capture.fd };
      assert.deepEqual((await restoreEvidenceInventory(paths, { output })).immutablePaths, paths);
      const inventory = await restoreEvidenceInventory(paths, options); assert.deepEqual(inventory.immutablePaths, [oldLog]); assert.equal(inventory.ownedLiveCapture.initialBytes, 0);
      await assert.rejects(restoreEvidenceInventory(paths, { ...options, stderrFd: other.fd }), /stdout\/stderr/);
      await assert.rejects(restoreEvidenceInventory(paths, { ...options, captureLog: oldLog }), /report stem/);
      await capture.write('current invocation output'); await assert.rejects(restoreEvidenceInventory(paths, options), /empty regular file/);
    } finally { await capture.close(); await other.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('capture aliases cannot exclude an existing protected artifact through symlinks or hardlinks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rx4002-capture-alias-'));
  try {
    const old = join(directory, 'preserved.json'); await writeFile(old, '');
    for (const [name, make] of [['symlink', symlink], ['hardlink', link]]) {
      const output = join(directory, `RX-4002-memory-restore-${name}.json`), captureLog = output.replace(/\.json$/, '.log');
      await make(old, captureLog); const capture = await open(captureLog, 'a');
      try { await assert.rejects(restoreEvidenceInventory([old, captureLog], { output, captureLog, stdoutFd: capture.fd, stderrFd: capture.fd })); }
      finally { await capture.close(); }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
