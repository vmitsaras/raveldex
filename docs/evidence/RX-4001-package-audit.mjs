// Compare measured runtime bytes with a fresh final installed public package.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [primaryPath, finalPath, outputPath] = process.argv.slice(2);
assert.ok(primaryPath && finalPath && outputPath, 'primary report, final report and output path required');
const primary = JSON.parse(await readFile(resolve(primaryPath), 'utf8'));
const final = JSON.parse(await readFile(resolve(finalPath), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await files(directory, path));
    else { assert.ok(entry.isFile()); result.push(path); }
  }
  return result.sort();
}
const measured = join(primary.consumer, 'node_modules/@vmitsaras/raveldex');
const fresh = join(final.consumer, 'node_modules/@vmitsaras/raveldex');
const paths = await files(join(root, 'dist'));
assert.deepEqual(await files(join(measured, 'dist')), paths);
assert.deepEqual(await files(join(fresh, 'dist')), paths);
const identities = [];
for (const path of paths) {
  const current = await readFile(join(root, 'dist', path));
  assert.deepEqual(await readFile(join(measured, 'dist', path)), current, 'measured ' + path);
  assert.deepEqual(await readFile(join(fresh, 'dist', path)), current, 'fresh ' + path);
  identities.push({ path: 'dist/' + path, bytes: current.length, sha256: digest(current) });
}
const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const measuredMetadata = JSON.parse(await readFile(join(measured, 'package.json'), 'utf8'));
const freshMetadata = JSON.parse(await readFile(join(fresh, 'package.json'), 'utf8'));
assert.deepEqual(freshMetadata, metadata);
for (const key of ['name', 'version', 'private', 'exports', 'types', 'sideEffects', 'files', 'engines', 'devDependencies'])
  assert.deepEqual(measuredMetadata[key], freshMetadata[key], key + ' unchanged');
assert.deepEqual(freshMetadata.dependencies ?? {}, {});
for (const path of ['README.md', 'LICENSE']) {
  const current = await readFile(join(root, path));
  assert.deepEqual(await readFile(join(fresh, path)), current);
}
assert.deepEqual(await readFile(join(measured, 'LICENSE')), await readFile(join(fresh, 'LICENSE')));
assert.equal(final.core.sha256, primary.core.sha256);
assert.equal(final.core.gzipSha256, primary.core.gzipSha256);
assert.deepEqual(final.startup.reads, []);
const baseline = '6e714a3';
const runtimeDiff = execFileSync('git', ['diff', baseline, '--', 'src', 'package-lock.json'], { cwd: root, encoding: 'utf8' });
assert.equal(runtimeDiff, '', 'no runtime or lockfile change');
const result = {
  kind: 'rx4001-final-runtime-package-identity-v1', date: new Date().toISOString(), baseline,
  primaryConsumer: primary.consumer, finalConsumer: final.consumer,
  primaryTarballSha256: primary.package.sha256, finalTarballSha256: final.package.sha256,
  runtimeFiles: identities, matchedRuntimeFiles: identities.length,
  currentFinalMetadataMatch: true, runtimeAndLockfileDiffEmpty: true,
  unchangedPublicMapAndDependencies: true, freshREADMEAndLicenseMatch: true,
  fixedCore: { sha256: final.core.sha256, gzipSha256: final.core.gzipSha256,
    minifiedBytes: final.core.minifiedBytes, gzipBytes: final.core.gzipBytes, targetMet: final.core.targetMet },
  guardedCoreImport: final.startup,
  interpretation: 'Primary measured package and fresh final package have byte-identical production JS, declarations, CSS and included notices. Final README/package scripts differ from primary metadata; tarballs are separately identified. This static identity audit connects runtime observations without repeating long timings, and is not a fresh timing or cross-host qualification.',
};
await writeFile(resolve(outputPath), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ matchedRuntimeFiles: identities.length, coreGzip: final.core.gzipBytes, output: resolve(outputPath) }));
