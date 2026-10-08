import assert from 'node:assert/strict';
import { lstat, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

// Compare filesystem identities without touching any protected file. This guard
// is called before reading dumps and again immediately before writing output.
export async function assertUnprotectedOutput(output, protectedPaths) {
  assert.ok(typeof output === 'string' && output.length, 'Output path required');
  let canonicalOutput, outputStat;
  try {
    canonicalOutput = await realpath(output); outputStat = await stat(output);
    assert.ok(outputStat.isFile(), 'Output must be a regular file');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try {
      assert.ok(!(await lstat(output)).isSymbolicLink(), 'Dangling output symlink is ambiguous');
    } catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
    // The writer does not create directories. Resolve the actual existing
    // parent, including symlink/.. semantics, for a not-yet-created output.
    canonicalOutput = join(await realpath(dirname(output)), basename(output));
  }
  for (const path of protectedPaths) {
    const canonicalProtected = await realpath(path), protectedStat = await stat(path);
    assert.notEqual(canonicalOutput, canonicalProtected, `Output aliases protected file: ${path}`);
    if (outputStat) assert.ok(outputStat.dev !== protectedStat.dev || outputStat.ino !== protectedStat.ino, `Output hardlinks protected file: ${path}`);
  }
  return { requestedOutput: output, canonicalOutput, protectedFilesChecked: protectedPaths.length };
}
