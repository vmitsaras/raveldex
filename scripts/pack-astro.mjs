import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { mkdir, readFile, lstat, realpath, readdir, copyFile, writeFile } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { command, digest, REPO_ROOT } from './lib/packed-consumer.mjs';

/** Package stable compiler output only. No build, registry lookup or publishing. */
export async function packAstro({ output } = {}) {
  assert.ok(typeof output === 'string' && output.length, 'output must name a new directory');
  const requested = resolve(output), parent = await realpath(dirname(requested)), destination = join(parent, basename(requested));
  try { await lstat(destination); throw Error('Astro artifact output must not exist'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const source = join(REPO_ROOT, 'integrations/astro'), metadata = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  assert.equal(metadata.name, '@vmitsaras/raveldex-astro'); assert.equal(metadata.version, '0.1.0-rc.0'); assert.equal(metadata.private, true);
  assert.deepEqual(metadata.dependencies ?? {}, {}); assert.deepEqual(metadata.optionalDependencies ?? {}, {});
  assert.deepEqual(metadata.peerDependencies, { '@vmitsaras/raveldex': '0.1.0-rc.0', astro: '7.3.2' });
  assert.deepEqual(metadata.peerDependenciesMeta, { astro: { optional: true } }); assert.equal(metadata.sideEffects, false);
  assert.deepEqual(metadata.exports, Object.fromEntries(['.', './build', './client'].map(path => { const name = path === '.' ? 'index' : path.slice(2); return [path, { types: `./dist/${name}.d.ts`, import: `./dist/${name}.js` }]; })));
  const emitted = (await readdir(join(source, 'dist'), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  assert.ok(emitted.length >= 10); for (const item of emitted) assert.ok(item.isFile() && /^[a-z-]+\.(?:js|d\.ts)$/.test(item.name), 'only regular flat compiler files');
  for (const item of emitted) if (item.name.endsWith('.d.ts')) {
    const text = await readFile(join(source, 'dist', item.name), 'utf8');
    assert.doesNotMatch(text, /(?:from|import\s*\()\s*['"](?:\.\.\/|\/)/, 'no private external declaration paths');
  }
  await mkdir(destination); const directory = join(destination, 'package'); await mkdir(directory); await mkdir(join(directory, 'dist'));
  const files = [];
  for (const item of emitted) { await copyFile(join(source, 'dist', item.name), join(directory, 'dist', item.name), constants.COPYFILE_EXCL); files.push(`dist/${item.name}`); }
  await copyFile(join(source, 'README.md'), join(directory, 'README.md'), constants.COPYFILE_EXCL);
  await copyFile(join(REPO_ROOT, 'LICENSE'), join(directory, 'LICENSE'), constants.COPYFILE_EXCL);
  await writeFile(join(directory, 'package.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' }); files.push('README.md', 'LICENSE', 'package.json');
  const args = ['pack', '--offline', '--json', '--ignore-scripts', '--pack-destination', destination, '--cache', join(destination, '.npm-cache')];
  const execution = await command('npm', args, directory), raw = JSON.parse(execution.stdout), packed = (Array.isArray(raw) ? raw : Object.values(raw))[0];
  assert.equal(packed.name, metadata.name); assert.deepEqual(packed.files.map(row => row.path).sort(), files.sort());
  const tarball = join(destination, packed.filename), bytes = await readFile(tarball), identities = [];
  for (const path of files) { const data = await readFile(join(directory, path)); identities.push({ path, bytes: data.length, sha256: digest(data) }); }
  const report = { kind: 'raveldex-astro-package-v1', status: 'Pass', package: { name: metadata.name, version: metadata.version, private: true, tarball, sha256: digest(bytes), tarballBytes: bytes.length, unpackedBytes: packed.unpackedSize, files: identities, peerDependencies: metadata.peerDependencies, optionalPeers: ['astro'], runtimeDependencies: [] }, scope: 'Separate private local pack from stable compiler output; public core peer only. No build, registry lookup, credentials, publication, remote write, tag or release.' };
  const reportPath = join(destination, 'astro-package.json'), logPath = join(destination, 'verification.log');
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); await writeFile(logPath, JSON.stringify({ command: ['npm', ...args], cwd: directory, exitCode: 0 }) + '\n' + execution.stdout + execution.stderr, { flag: 'wx' });
  return { output: destination, packageDirectory: directory, tarball, reportPath, logPath, report };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); assert.ok(args.length === 2 && args[0] === '--output' && args[1], 'usage: npm run astro:pack -- --output NEW_DIRECTORY');
  const result = await packAstro({ output: args[1] }); console.log(JSON.stringify({ status: result.report.status, tarball: result.tarball, report: result.reportPath }));
}
