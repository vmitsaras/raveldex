import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { build, version as esbuildVersion } from 'esbuild';
import { command, digest, REPO_ROOT } from './lib/packed-consumer.mjs';

const NAME = '@vmitsaras/raveldex-english';
const VERSION = '0.1.0-rc.0';
const PRIVATE_IMPORT = '../../../core/capabilities/types.js';
const PUBLIC_IMPORT = '@vmitsaras/raveldex';
const ALLOWED_FILES = ['LICENSE', 'README.md', 'dist/index.d.ts', 'dist/index.js', 'package.json'];

/** Prepare the separately installable private language artifact from one stable
 * built tree. This command never builds core, publishes, reads credentials or
 * resolves registry packages. Declarations come from compiler output. */
export async function packEnglish({ output } = {}) {
  assert.ok(typeof output === 'string' && output.length, 'output must name a new directory with an existing parent');
  const requested = resolve(output), parent = await realpath(dirname(requested));
  assert.ok((await stat(parent)).isDirectory(), 'output parent must already exist');
  const destination = join(parent, basename(requested));
  try {
    await lstat(destination);
    const error = new Error('English artifact output must not exist'); error.code = 'EEXIST'; throw error;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }

  const sourceDirectory = join(REPO_ROOT, 'integrations/languages/english');
  const entry = join(REPO_ROOT, 'dist/integrations/languages/english/index.js');
  const declarationPath = entry.replace(/\.js$/, '.d.ts');
  for (const path of [entry, declarationPath]) assert.ok((await lstat(path)).isFile(), `stable compiled input required: ${relative(REPO_ROOT, path)}`);
  const metadata = JSON.parse(await readFile(join(sourceDirectory, 'package.json'), 'utf8'));
  assert.equal(metadata.name, NAME); assert.equal(metadata.version, VERSION); assert.equal(metadata.private, true);
  assert.equal(metadata.type, 'module'); assert.equal(metadata.license, 'MIT'); assert.equal(metadata.sideEffects, false);
  assert.deepEqual(metadata.exports, { '.': { types: './dist/index.d.ts', import: './dist/index.js' } });
  assert.deepEqual(metadata.peerDependencies, { '@vmitsaras/raveldex': VERSION });
  for (const key of ['dependencies', 'optionalDependencies']) assert.deepEqual(metadata[key] ?? {}, {}, 'language package has no runtime dependencies');
  assert.deepEqual(metadata.files, ['dist/index.js', 'dist/index.d.ts', 'README.md', 'LICENSE']);
  const rootMetadata = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.equal(rootMetadata.name, PUBLIC_IMPORT); assert.equal(rootMetadata.version, VERSION); assert.equal(rootMetadata.private, true);

  const originalDeclaration = await readFile(declarationPath, 'utf8');
  const importLine = `import type { AddonRegistration } from '${PRIVATE_IMPORT}';`;
  assert.equal(originalDeclaration.split(importLine).length - 1, 1, 'exactly one compiler-emitted private registration import is required');
  const declaration = originalDeclaration.replace(importLine, `import type { AddonRegistration } from '${PUBLIC_IMPORT}';`);
  assert.doesNotMatch(declaration, /(?:from|import\s*\()\s*['"]\./, 'standalone declarations cannot reference private compiled paths');

  // mkdir is exclusive too: a race after lstat cannot overwrite another output.
  await mkdir(destination);
  const startedAt = new Date().toISOString(), packageDirectory = join(destination, 'package');
  const logPath = join(destination, 'verification.log'), reportPath = join(destination, 'english-package.json');
  let commandLog = '';
  try {
    await mkdir(packageDirectory); await mkdir(join(packageDirectory, 'dist'));
    const settings = { bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false, metafile: true, write: false };
    const result = await build({ ...settings, absWorkingDir: REPO_ROOT, entryPoints: [entry], outfile: join(packageDirectory, 'dist/index.js'), logLevel: 'silent' });
    assert.equal(result.outputFiles.length, 1);
    const bytes = result.outputFiles[0].contents, inputs = Object.entries(result.metafile.inputs).map(([path, input]) => ({ path, bytes: input.bytes, imports: input.imports }));
    assert.ok(inputs.some(({ path }) => path.endsWith('/english/stem.js')));
    for (const input of inputs) {
      assert.match(input.path, /^dist\/(?:core\/|integrations\/languages\/english\/)/, 'standalone language graph is bounded to language code and shared helpers');
      assert.ok(input.imports.every(item => !item.external), 'no external runtime imports or registry lookup');
      assert.doesNotMatch(input.path, /(?:execution\/engine|adapters\/|addons\/)/, 'no core runtime, adapters or optional addon implementation');
    }
    assert.deepEqual(Object.values(result.metafile.outputs)[0].imports, [], 'standalone bundle has no runtime imports');
    assert.doesNotMatch(new TextDecoder().decode(bytes), /(?:from|import\s*\()\s*['"]@vmitsaras\/raveldex/);
    await writeFile(join(packageDirectory, 'dist/index.js'), bytes, { flag: 'wx' });
    await writeFile(join(packageDirectory, 'dist/index.d.ts'), declaration, { flag: 'wx' });
    await writeFile(join(packageDirectory, 'package.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
    await copyFile(join(sourceDirectory, 'README.md'), join(packageDirectory, 'README.md'), constants.COPYFILE_EXCL);
    await copyFile(join(REPO_ROOT, 'LICENSE'), join(packageDirectory, 'LICENSE'), constants.COPYFILE_EXCL);
    const args = ['pack', '--offline', '--json', '--ignore-scripts', '--pack-destination', destination, '--cache', join(destination, '.npm-cache')];
    const packedCommand = await command('npm', args, packageDirectory); commandLog = JSON.stringify({ command: ['npm', ...args], cwd: packageDirectory, exitCode: 0 }) + '\n' + packedCommand.stdout + packedCommand.stderr;
    const parsed = JSON.parse(packedCommand.stdout), entries = Array.isArray(parsed) ? parsed : Object.values(parsed);
    assert.equal(entries.length, 1); const packed = entries[0];
    assert.equal(packed.name, NAME); assert.equal(packed.version, VERSION); assert.equal(packed.filename, 'vmitsaras-raveldex-english-0.1.0-rc.0.tgz');
    assert.deepEqual(packed.files.map(file => file.path).sort(), ALLOWED_FILES);
    const tarball = join(destination, packed.filename), tarBytes = await readFile(tarball);
    assert.equal(packed.integrity, 'sha512-' + createHash('sha512').update(tarBytes).digest('base64'));
    const gzip = { level: 9, windowBits: 15, memLevel: 8, strategy: 0 }, compressed = gzipSync(bytes, gzip);
    const files = [];
    for (const file of packed.files) {
      const data = await readFile(join(packageDirectory, file.path));
      assert.equal(data.length, file.size); files.push({ path: file.path, bytes: data.length, sha256: digest(data) });
    }
    const report = { kind: 'raveldex-english-standalone-package-v1', status: 'Pass', startedAt, completedAt: new Date().toISOString(),
      package: { name: NAME, version: VERSION, private: true, tarball, sha256: digest(tarBytes), integrity: packed.integrity, tarballBytes: tarBytes.length, unpackedBytes: packed.unpackedSize, peerDependencies: metadata.peerDependencies, runtimeDependencies: [], files },
      source: { entry: relative(REPO_ROOT, entry), sha256: digest(await readFile(entry)) },
      declarations: { source: relative(REPO_ROOT, declarationPath), sourceSha256: digest(originalDeclaration), outputSha256: digest(declaration), rewrittenImports: [{ from: PRIVATE_IMPORT, to: PUBLIC_IMPORT, count: 1 }], method: 'Compiler-emitted declaration with its one private type-only registration import rewritten to the exact public core peer; no handwritten declaration.' },
      graph: { esbuild: esbuildVersion, settings, minifiedBytes: bytes.length, gzipBytes: compressed.length, sha256: digest(bytes), gzipSha256: digest(compressed), gzip: { ...gzip, mtime: 0 }, inputs, runtimeImports: [], metafile: result.metafile },
      publication: 'Not performed. Private local pack only; no publish, registry lookup, release credentials, tag or remote write.' };
    await writeFile(logPath, commandLog, { flag: 'wx' }); await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    return { output: destination, packageDirectory, tarball, reportPath, logPath, report };
  } catch (error) {
    // Retain actual failed preparation without replacing or claiming an artifact.
    await writeFile(logPath, commandLog + (error.stdout ?? '') + (error.stderr ?? '') + String(error.stack ?? error), { flag: 'wx' }).catch(() => {});
    await writeFile(reportPath, JSON.stringify({ kind: 'raveldex-english-standalone-package-v1', status: 'Fail', startedAt, completedAt: new Date().toISOString(), publication: 'Not performed.' }, null, 2) + '\n', { flag: 'wx' }).catch(() => {});
    error.englishOutput = destination; throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 2 && args[0] === '--output' && args[1], 'usage: npm run language:pack -- --output NEW_DIRECTORY');
  const result = await packEnglish({ output: args[1] });
  console.log(JSON.stringify({ status: result.report.status, output: result.output, tarball: result.tarball, report: result.reportPath, sha256: result.report.package.sha256 }));
}
