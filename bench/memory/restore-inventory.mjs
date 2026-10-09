import assert from 'node:assert/strict';
import { fstatSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { assertUnprotectedOutput } from './retainer-output.mjs';

// An explicit new capture file is mutable only when both actual stdio handles
// name that regular empty file. All other preexisting evidence stays immutable.
export async function restoreEvidenceInventory(paths, { output, captureLog, protectedPaths = paths, stdoutFd = 1, stderrFd = 2 }) {
  if (captureLog === undefined) return { immutablePaths: [...paths], ownedLiveCapture: null };
  const requested = resolve(captureLog), capture = join(await realpath(dirname(requested)), basename(requested)),
    expected = join(await realpath(dirname(resolve(output))), basename(output).replace(/\.json$/, '.log'));
  assert.equal(capture, expected, 'Explicit capture must use the new report stem and .log extension');
  assert.equal(await realpath(capture), capture, 'Owned capture cannot be a symlink alias');
  await assertUnprotectedOutput(capture, protectedPaths.filter(path => resolve(path) !== requested));
  const info = await stat(capture), stdout = fstatSync(stdoutFd), stderr = fstatSync(stderrFd);
  assert.ok(info.isFile() && info.size === 0, 'Owned capture must be a newly opened empty regular file');
  for (const stream of [stdout, stderr]) assert.ok(stream.isFile() && stream.dev === info.dev && stream.ino === info.ino, 'Owned capture must match both actual stdout/stderr handles');
  return { immutablePaths: paths.filter(path => resolve(path) !== requested), ownedLiveCapture: { path: capture, dev: info.dev, ino: info.ino,
    initialBytes: info.size, boundary: 'Explicit new report-stem capture; both current stdout/stderr file handles. Growth belongs to this invocation, not prior immutable evidence.' } };
}
