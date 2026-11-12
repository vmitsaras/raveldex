import assert from 'node:assert/strict';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build, version } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { buildCorpus } from '../../examples/core-docs/corpus.mjs';
import { buildUsageCorpus } from '../../examples/docs-search/usage-corpus.mjs';
import { DOCS_JUDGMENTS } from '../../test/fixtures/docs/judgments.mjs';
import { verifyPilot, judgeResults } from '../../test/consumer/verify.mjs';
import { prepareConsumer, bundleConsumer, executePilot, checkStartup, digest, command, REPO_ROOT } from './packed-consumer.mjs';

const settings = { bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true,
  treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false, metafile: true, write: false };
async function graph(directory, entry, output, source) {
  if (source) await writeFile(join(directory, entry), source);
  const built = await build({ ...settings, absWorkingDir: directory, entryPoints: [entry], outfile: output, logLevel: 'silent' });
  const bytes = built.outputFiles[0].contents;
  await writeFile(join(directory, output), bytes);
  const gzip = { level: 9, windowBits: 15, memLevel: 8, strategy: 0 };
  const compressed = gzipSync(bytes, gzip);
  const inputs = await Promise.all(Object.entries(built.metafile.inputs).map(async ([path, input]) => ({
    path, ...input, sha256: digest(await readFile(join(directory, path))),
  })));
  assert.ok(inputs.every(input => input.imports.every(item => !item.external)), 'no external runtime dependency');
  return { esbuild: version, settings, gzip: { ...gzip, mtime: 0 }, minifiedBytes: bytes.length,
    gzipBytes: compressed.length, sha256: digest(bytes), inputs, metafile: built.metafile };
}

/** Ordinary developer demo; qualification continues to use prepareUIPilot. */
export async function prepareUsageDemo() {
  const corpus = buildUsageCorpus(REPO_ROOT);
  const consumer = await prepareConsumer(corpus, []);
  const { directory, installed } = consumer;
  for (const name of ['index.html', 'pilot.css', 'main.mjs', 'readable-results.mjs', 'configuration.mjs', 'engine-worker.mjs']) {
    await copyFile(join(REPO_ROOT, 'examples/docs-search', name), join(directory, name === 'main.mjs' ? 'pilot-entry.mjs' : name));
  }
  await copyFile(join(installed, 'dist/addons/ui/styles.css'), join(directory, 'ui.css'));
  const product = await graph(directory, 'pilot-entry.mjs', 'main.mjs');
  const worker = await graph(directory, 'engine-worker.mjs', 'engine-worker-bundle.mjs');
  await copyFile(join(directory, 'engine-worker-bundle.mjs'), join(directory, 'engine-worker.mjs'));
  const report = { package: consumer.package, corpus: { hash: corpus.hash, records: corpus.records.length,
    sources: corpus.sources }, product, worker };
  await writeFile(join(directory, 'demo-build.json'), JSON.stringify(report, null, 2) + '\n');
  return { ...consumer, corpus, report };
}

/** Real tarball installation; the workspace is used only for application assets. */
export async function prepareUIPilot() {
  const corpus = buildCorpus(REPO_ROOT);
  const consumer = await prepareConsumer(corpus, DOCS_JUDGMENTS);
  const { directory, installed } = consumer;
  for (const file of ['index.html', 'pilot.css', 'main.mjs', 'readable-results.mjs', 'configuration.mjs', 'engine-worker.mjs']) {
    await copyFile(join(REPO_ROOT, 'examples/docs-search', file), join(directory, file === 'main.mjs' ? 'pilot-entry.mjs' : file));
  }
  // Qualification retains its exact-word baseline; ordinary demos use prefixes.
  const pilotHTML = await readFile(join(directory, 'index.html'), 'utf8');
  await writeFile(join(directory, 'index.html'), pilotHTML.replace('<option value="text">', '<option value="text" selected>'));
  await copyFile(join(installed, 'dist/addons/ui/styles.css'), join(directory, 'ui.css'));
  const ui = await graph(directory, 'ui-entry.mjs', 'ui-bundle.mjs', "export { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';\n");
  assert.ok(ui.inputs.every(input => input.path === 'ui-entry.mjs' || input.path.includes('/addons/ui/')
    || input.path.endsWith('/core/errors/error.js')), 'UI imports no engine/evidence implementation');
  const product = await graph(directory, 'pilot-entry.mjs', 'main.mjs');
  const worker = await graph(directory, 'engine-worker.mjs', 'engine-worker-bundle.mjs');
  await copyFile(join(directory, 'engine-worker-bundle.mjs'), join(directory, 'engine-worker.mjs'));
  const workerClient = await graph(directory, 'worker-client-entry.mjs', 'worker-client.mjs', "export { createWorkerRaveldex, WorkerAdapterError } from '@vmitsaras/raveldex/adapters/worker';\n");
  const core = await bundleConsumer(directory);
  const startup = [];
  for (const specifier of ['@vmitsaras/raveldex', './core-bundle.mjs']) startup.push(await checkStartup(directory, specifier));
  const optionalStartup = JSON.parse((await command(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    const reads=[];
    for(const name of ['window','document','navigator','fetch','Worker','localStorage','indexedDB','performance','setTimeout','clearTimeout','requestAnimationFrame'])
      Object.defineProperty(globalThis,name,{configurable:true,get(){reads.push(name);throw Error(name)}});
    for(const specifier of ['@vmitsaras/raveldex/addons/ui','./ui-bundle.mjs']){
      const module=await import(specifier);assert.deepEqual(Object.keys(module),['mountRaveldexUI']);
    }
    assert.deepEqual(reads,[]);console.log(JSON.stringify({exports:['mountRaveldexUI'],reads}));
  `], directory)).stdout);
  const pilot = await executePilot(directory);
  const correctness = verifyPilot(corpus, DOCS_JUDGMENTS, pilot);
  const relevance = judgeResults(DOCS_JUDGMENTS, pilot);
  const report = { environment: { node: process.version, platform: process.platform, arch: process.arch },
    package: consumer.package, corpus: { hash: corpus.hash, records: corpus.records.length, sources: corpus.sources,
      sections: corpus.sections }, core, ui, product, worker, workerClient, css: { bytes: (await readFile(join(directory, 'ui.css'))).length,
      sha256: digest(await readFile(join(directory, 'ui.css'))) }, startup, optionalStartup, correctness, relevance };
  await writeFile(join(directory, 'RX-2006-package.json'), JSON.stringify(report, null, 2) + '\n');
  return { ...consumer, corpus, report };
}
