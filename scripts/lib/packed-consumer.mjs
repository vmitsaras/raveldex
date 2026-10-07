import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, copyFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync, constants } from 'node:zlib';
import { build, version } from 'esbuild';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function command(file, args, cwd = REPO_ROOT) {
  const { stdout, stderr } = await promisify(execFile)(file, args, { cwd, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  return { stdout, stderr };
}
export async function prepareConsumer(corpus, judgments) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'raveldex-core-consumer-')));
  const packed = JSON.parse((await command('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', directory, '--cache', join(directory, '.npm-cache')])).stdout)[0];
  const tarball = join(directory, packed.filename);
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'raveldex-isolated-pilot', private: true, type: 'module' }));
  await command('npm', ['install', tarball, '--offline', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', '--cache', join(directory, '.npm-cache')], directory);
  const installed = join(directory, 'node_modules/@vmitsaras/raveldex');
  assert.equal(await realpath(installed), installed, 'consumer has a real installed tarball, not a workspace symlink');
  const metadata = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.deepEqual(metadata.dependencies ?? {}, {}, 'no runtime dependencies');
  const tree = JSON.parse((await command('npm', ['ls', '--omit=dev', '--all', '--json'], directory)).stdout);
  assert.deepEqual(Object.keys(tree.dependencies), ['@vmitsaras/raveldex']);
  assert.deepEqual(tree.dependencies['@vmitsaras/raveldex'].dependencies ?? {}, {});
  for (const path of ['examples/core-docs/run.mjs', 'test/consumer/public-types.ts', 'test/consumer/arithmetic.mjs']) {
    await copyFile(join(REPO_ROOT, path), join(directory, path.split('/').at(-1)));
  }
  await writeFile(join(directory, 'corpus.json'), JSON.stringify(corpus, null, 2) + '\n');
  await writeFile(join(directory, 'judgments.json'), JSON.stringify(judgments, null, 2) + '\n');
  await writeFile(join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022'], types: [],
    strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true,
    verbatimModuleSyntax: true, skipLibCheck: false, noEmit: true,
  }, include: ['public-types.ts'] }));
  await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', join(directory, 'tsconfig.json')], directory);
  return { directory, installed, packed, package: { name: metadata.name, version: metadata.version, private: metadata.private,
    sha256: digest(await readFile(tarball)), npmIntegrity: packed.integrity,
    tarballBytes: packed.size, unpackedBytes: packed.unpackedSize, files: packed.files.map(({ path, size }) => ({ path, size })) } };
}

export async function bundleConsumer(directory) {
  const entry = 'core-entry.mjs';
  await writeFile(join(directory, entry), "export { createRaveldex, RaveldexError, ERROR_CODES } from '@vmitsaras/raveldex';\n");
  const settings = { bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true,
    treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false, metafile: true, write: false };
  const result = await build({ ...settings, absWorkingDir: directory, entryPoints: [entry], outfile: 'core-bundle.mjs', logLevel: 'silent' });
  assert.equal(result.outputFiles.length, 1);
  const bytes = result.outputFiles[0].contents;
  const gzipSettings = { level: 9, windowBits: 15, memLevel: 8, strategy: constants.Z_DEFAULT_STRATEGY };
  const compressed = gzipSync(bytes, gzipSettings);
  const inputs = Object.entries(result.metafile.inputs).map(([path, input]) => ({ path, bytes: input.bytes, imports: input.imports }));
  assert.ok(inputs.some(({ path }) => path.endsWith('/dist/index.js')));
  assert.ok(inputs.some(({ path }) => path.endsWith('/core/execution/engine.js')));
  for (const { path, imports } of inputs) {
    assert.ok(path === entry || path.startsWith('node_modules/@vmitsaras/raveldex/dist/'), `foreign input ${path}`);
    assert.doesNotMatch(path, /(?:addons|adapters|construction|invariants|oracle|esbuild|typescript)/);
    assert.ok(imports.every(({ external }) => !external), `external dependency in ${path}`);
  }
  const output = Object.values(result.metafile.outputs)[0];
  assert.deepEqual(output.imports, []);
  await writeFile(join(directory, 'core-bundle.mjs'), bytes);
  await writeFile(join(directory, 'core-bundle.mjs.gz'), compressed);
  await writeFile(join(directory, 'metafile.json'), JSON.stringify(result.metafile, null, 2));
  const runner = await readFile(join(directory, 'run.mjs'), 'utf8');
  await writeFile(join(directory, 'run-bundle.mjs'), runner.replace("from '@vmitsaras/raveldex'", "from './core-bundle.mjs'"));
  return { method: { esbuild: version, settings, consumerEntry: "export { createRaveldex, RaveldexError, ERROR_CODES } from '@vmitsaras/raveldex'",
    gzip: { ...gzipSettings, mtime: 0 }, mandatoryRuntimeDependencies: [] },
    minifiedBytes: bytes.length, gzipBytes: compressed.length, targetGzipBytes: 15 * 1024,
    targetMet: compressed.length <= 15 * 1024, sha256: digest(bytes), gzipSha256: digest(compressed),
    inputs, bytesByModule: output.inputs };
}

export async function checkStartup(directory, specifier) {
  const script = `
    import assert from 'node:assert/strict';
    const reads = [];
    const denied = ['window','document','navigator','fetch','XMLHttpRequest','WebSocket','Worker','SharedWorker','indexedDB','localStorage','sessionStorage','performance','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','queueMicrotask'];
    for (const name of denied) Object.defineProperty(globalThis, name, { configurable: true, get() { reads.push(name); throw new Error('startup access: ' + name); } });
    const core = await import(process.argv[1]);
    assert.deepEqual(Object.keys(core).sort(), ['ERROR_CODES','RaveldexError','createRaveldex']);
    assert.deepEqual(reads, []);
    console.log(JSON.stringify({ specifier: process.argv[1], reads, exports: Object.keys(core).sort() }));
  `;
  return JSON.parse((await command(process.execPath, ['--input-type=module', '--eval', script, specifier], directory)).stdout);
}
export async function executePilot(directory, runner = 'run.mjs', query) {
  const args = [runner, 'corpus.json', 'judgments.json'];
  if (query !== undefined) args.push(query);
  return JSON.parse((await command(process.execPath, args, directory)).stdout);
}
