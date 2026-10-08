// Stages measurement entrypoints in an already installed consumer. Never builds,
// packs, installs a dependency or opens a network connection.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, version as esbuildVersion } from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const graphSelections = {
  core: ['@vmitsaras/raveldex'],
  sourcePhrase: ['@vmitsaras/raveldex', '@vmitsaras/raveldex/addons/phrases'],
  positionsOffsets: ['@vmitsaras/raveldex', '@vmitsaras/raveldex/addons/positions', '@vmitsaras/raveldex/addons/phrases/positions'],
  sourceSnapshots: ['@vmitsaras/raveldex', '@vmitsaras/raveldex/addons/phrases', '@vmitsaras/raveldex/adapters/snapshots'],
  positionSnapshots: ['@vmitsaras/raveldex', '@vmitsaras/raveldex/addons/positions', '@vmitsaras/raveldex/addons/phrases/positions', '@vmitsaras/raveldex/adapters/snapshots'],
  ui: ['@vmitsaras/raveldex/addons/ui'],
  workerClient: ['@vmitsaras/raveldex/adapters/worker'],
  workerHost: ['@vmitsaras/raveldex/adapters/worker/host'],
  storage: ['@vmitsaras/raveldex/adapters/indexeddb'],
  workerStorageClient: ['@vmitsaras/raveldex/adapters/worker', '@vmitsaras/raveldex/adapters/worker/snapshots', '@vmitsaras/raveldex/adapters/indexeddb', '@vmitsaras/raveldex/addons/phrases'],
  workerStorageHost: ['@vmitsaras/raveldex/adapters/worker/snapshots/host', '@vmitsaras/raveldex/addons/phrases'],
};
export async function measureGraphs(consumer) {
  const graphs = {}, compression = { level: 9, windowBits: 15, memLevel: 8, strategy: 0 };
  for (const [name, selections] of Object.entries(graphSelections)) {
    const source = name === 'core' ? "export { createRaveldex, RaveldexError, ERROR_CODES } from '@vmitsaras/raveldex';\n" :
      selections.map((specifier, index) => `import * as module${index} from ${JSON.stringify(specifier)}; export { module${index} };`).join('\n');
    const result = await build({ stdin: { contents: source, resolveDir: consumer, sourcefile: `cost-graph-${name}.mjs`, loader: 'js' }, absWorkingDir: consumer,
      bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, treeShaking: true, legalComments: 'none', charset: 'ascii',
      sourcemap: false, metafile: true, write: false, logLevel: 'silent' });
    const bytes = result.outputFiles[0].contents, compressed = gzipSync(bytes, compression), inputs = [];
    for (const [path, input] of Object.entries(result.metafile.inputs)) {
      assert.ok(path.startsWith('node_modules/@vmitsaras/raveldex/dist/') || path === `cost-graph-${name}.mjs`, `unexpected measured input ${path}`);
      assert.ok(input.imports.every(entry => !entry.external));
      inputs.push({ path, ...input, sha256: path === `cost-graph-${name}.mjs` ? digest(source) : digest(await readFile(join(consumer, path))) });
    }
    assert.ok(Object.values(result.metafile.outputs).every(output => output.imports.length === 0));
    graphs[name] = { selectedPublicImports: selections, purpose: name === 'core' ? 'Fixed core consumer entry retains all three root runtime exports; identical export entry to the adopted 15KiB target method.' :
      'All selected module public runtime exports remain observable; complete selected-module graph rather than hand-pruned symbols.',
      minifiedBytes: bytes.length, gzipBytes: compressed.length, sha256: digest(bytes), gzipSha256: digest(compressed), inputs, metafile: result.metafile };
  }
  const css = await readFile(join(consumer, 'node_modules/@vmitsaras/raveldex/dist/addons/ui/styles.css'));
  graphs.uiCSS = { selectedPublicImport: '@vmitsaras/raveldex/addons/ui/styles.css', rawBytes: css.length, gzipBytes: gzipSync(css, compression).length, sha256: digest(css), method: 'Actual shipped CSS; no CSS minification.' };
  return { method: { esbuild: esbuildVersion, target: 'es2022', platform: 'browser', format: 'esm', minify: true, treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false,
    gzip: { ...compression, mtime: 0 }, limit: 'Complete namespace export graphs overlap; bytes must not be added as disjoint runtime costs. Snapshot module graph includes explicit native/source codec exports. Standalone adapter runtime excludes application-owned engine unless core is also selected. UI runtime/CSS bytes are not render-time or heap observations.' }, graphs };
}
export async function stage(consumer, files) { for (const file of files) await copyFile(join(root, 'bench', file), join(consumer, file)); }
async function main() {
  const consumer = resolve(process.argv[2] ?? ''), output = resolve(process.argv[3] ?? '/tmp/raveldex-rx4001-costs.json');
  assert.ok(process.argv[2], 'Pass an existing isolated installed consumer directory');
  const packageJson = JSON.parse(await readFile(join(consumer, 'node_modules/@vmitsaras/raveldex/package.json'), 'utf8'));
  assert.equal(packageJson.name, '@vmitsaras/raveldex');
  await stage(consumer, ['cost-common.mjs', 'cost-node-entry.mjs']);
  const harness = await Promise.all(['cost-common.mjs', 'cost-node-entry.mjs', 'costs.mjs'].map(async path => ({ path: `bench/${path}`,
    sha256: digest(await readFile(path === 'costs.mjs' ? join(root, 'bench', path) : join(consumer, path))),
    source: path === 'costs.mjs' ? 'repository wrapper at measurement start' : 'actual staged executed file' })));
  const bundleGraphs = await measureGraphs(consumer);
  await new Promise((yes, no) => {
    const child = spawn(process.execPath, [join(consumer, 'cost-node-entry.mjs'), output], { cwd: consumer, stdio: 'inherit' });
    child.once('error', no); child.once('close', code => code === 0 ? yes() : no(Error(`cost measurement failed: ${code}`)));
  });
  const report = JSON.parse(await readFile(output, 'utf8'));
  report.installedDirectory = consumer; report.bundleGraphs = bundleGraphs;
  report.harness = harness;
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, summaries: report.summaries.length, graphs: Object.keys(bundleGraphs.graphs).length }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
