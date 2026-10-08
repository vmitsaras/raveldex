// Static identity audit; does not rerun browser or memory measurements.
import assert from 'node:assert/strict';
import { readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = async path => JSON.parse(await readFile(resolve(path), 'utf8'));
const [primaryPath, finalPath, browserPath, memoryPath, outputPath] = process.argv.slice(2);
assert.ok(outputPath, 'primary, final, browser, memory reports and output required');
const primary = await read(primaryPath), final = await read(finalPath);
const browser = await read(browserPath), memory = await read(memoryPath);
const browserSources = [];
for (const source of browser.sourceReports) {
  const bytes = await readFile(resolve(source.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, source.path);
  const report = JSON.parse(bytes);
  assert.equal(report.package.installedDirectory, source.installedDirectory);
  assert.equal(report.package.package.sha256, source.packageSha256);
  browserSources.push(source);
}
const consumerRoles = { primary: primary.consumer, final: final.consumer, memory: memory.consumer,
  browsers: browserSources.map(source => ({ report: source.path, directory: source.installedDirectory })) };
const consumers = [...new Set([primary.consumer, final.consumer, memory.consumer, ...browserSources.map(source => source.installedDirectory)])];
const installed = consumers.map(directory => join(directory, 'node_modules/@vmitsaras/raveldex'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
for (const path of installed) assert.equal(await realpath(path), path, 'actual installed directory');
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await files(directory, path));
    else { assert.ok(entry.isFile()); result.push(path); }
  }
  return result.sort();
}
const current = join(root, 'dist'), paths = await files(current), identities = [];
for (const path of installed) assert.deepEqual(await files(join(path, 'dist')), paths);
for (const path of paths) {
  const bytes = await readFile(join(current, path));
  for (const consumer of installed) assert.deepEqual(await readFile(join(consumer, 'dist', path)), bytes, path);
  identities.push({ path: 'dist/' + path, bytes: bytes.length, sha256: digest(bytes) });
}
assert.deepEqual(memory.productionFiles, identities.map(({ path, sha256 }) => ({ path, sha256 })).sort((a, b) => a.path.localeCompare(b.path)));
const metadata = await read(join(root, 'package.json'));
const finalInstalled = join(final.consumer, 'node_modules/@vmitsaras/raveldex');
assert.deepEqual(await read(join(finalInstalled, 'package.json')), metadata);
for (const path of installed) {
  const selected = await read(join(path, 'package.json'));
  for (const key of ['name', 'version', 'private', 'exports', 'types', 'sideEffects', 'files', 'engines', 'devDependencies'])
    assert.deepEqual(selected[key], metadata[key], key);
  assert.deepEqual(selected.dependencies ?? {}, {});
}
for (const path of ['README.md', 'LICENSE']) assert.deepEqual(await readFile(join(finalInstalled, path)), await readFile(join(root, path)));
assert.equal(final.core.sha256, primary.core.sha256);
assert.equal(final.core.gzipSha256, primary.core.gzipSha256);
assert.deepEqual(final.startup.reads, []);
const baseline = '2309e16';
assert.equal(execFileSync('git', ['diff', baseline, '--', 'src', 'package-lock.json'], { cwd: root, encoding: 'utf8' }), '');
const report = { kind: 'rx4002-public-runtime-identity-v1', recordedAt: new Date().toISOString(), baseline,
  consumerRoles, consumers, distinctInstalledDirectories: consumers.length,
  tarballs: { primary: primary.package.sha256, final: final.package.sha256, browsers: browserSources.map(source => ({ report: source.path, sha256: source.packageSha256 })) },
  matchedProductionFiles: identities.length, productionFiles: identities,
  publicContractsDependenciesRuntimeAndLockUnchanged: true, finalREADMEAndMetadataMatch: true,
  fixedCore: { sha256: final.core.sha256, gzipSha256: final.core.gzipSha256, gzipBytes: final.core.gzipBytes, targetMet: final.core.targetMet },
  guardedStartup: final.startup,
  limits: 'Static runtime identity connects separately identified measured installs to the final package. It is not a fresh memory/browser run, assistive-technology observation, physical device test or publication.' };
await writeFile(resolve(outputPath), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ matchedProductionFiles: identities.length, output: resolve(outputPath) }));
