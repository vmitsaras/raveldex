import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, version } from 'esbuild';
import { prepareConsumer, bundleConsumer, command, digest, checkStartup } from '../../scripts/lib/packed-consumer.mjs';
import { buildCorpus } from '../../examples/core-docs/corpus.mjs';
import { DOCS_JUDGMENTS } from '../fixtures/docs/judgments.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../oracle/phrases.mjs';

const queries = [
  { kind: 'phrase', text: 'commit point' }, { kind: 'phrase', text: 'red blue' },
  { kind: 'phrase', text: 'source provider', fields: ['body'] }, { kind: 'phrase', text: 'native TypeScript' },
  { kind: 'or', children: [{ kind: 'phrase', text: 'red blue' }, { kind: 'text', text: 'revision' }] },
  { kind: 'not', child: { kind: 'phrase', text: 'commit point' } }, { kind: 'not', child: { kind: 'phrase', text: '' } },
];
const native = query => query.kind === 'phrase' ? { kind: 'extension', capability: 'phrases', version: 1, payload: { text: query.text, ...(query.fields ? { fields: query.fields } : {}) } } : query.kind === 'not' ? { ...query, child: native(query.child) } : query.children ? { ...query, children: query.children.map(native) } : query;
function compare(actual, expected) {
  assert.equal(actual.total, expected.total); assert.equal(actual.completeness, 'complete');
  assert.deepEqual(actual.hits.map(({ id }) => id), expected.hits.map(({ id }) => id));
  for (let i = 0; i < actual.hits.length; i++) assert.ok(Math.abs(actual.hits[i].score - expected.hits[i].score) <= Math.max(1e-12, Math.abs(expected.hits[i].score) * 1e-12));
}
async function graph(directory, name, entry) {
  await writeFile(join(directory, `${name}.mjs`), entry);
  const settings = { bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false, metafile: true, write: false };
  const result = await build({ ...settings, absWorkingDir: directory, entryPoints: [`${name}.mjs`], outfile: `${name}-bundle.mjs`, logLevel: 'silent' });
  const bytes = result.outputFiles[0].contents, gzip = gzipSync(bytes, { level: 9, windowBits: 15, memLevel: 8, strategy: 0 });
  const inputs = Object.entries(result.metafile.inputs).map(([path, input]) => ({ path, bytes: input.bytes, imports: input.imports }));
  for (const input of inputs) { assert.ok(input.path === `${name}.mjs` || input.path.startsWith('node_modules/@vmitsaras/raveldex/dist/')); assert.ok(input.imports.every(i => !i.external)); }
  assert.deepEqual(Object.values(result.metafile.outputs)[0].imports, []);
  await writeFile(join(directory, `${name}-bundle.mjs`), bytes);
  return { esbuild: version, settings, gzip: { level: 9, windowBits: 15, memLevel: 8, strategy: 0, mtime: 0 }, minifiedBytes: bytes.length, gzipBytes: gzip.length, sha256: digest(bytes), gzipSha256: digest(gzip), inputs, metafile: result.metafile };
}
export async function measurePackedPhrases() {
  const corpus = await buildCorpus(), consumer = await prepareConsumer(corpus, DOCS_JUDGMENTS);
  try {
    const core = await bundleConsumer(consumer.directory), startup = [await checkStartup(consumer.directory, '@vmitsaras/raveldex'), await checkStartup(consumer.directory, './core-bundle.mjs')];
    const source = await graph(consumer.directory, 'source', "export { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';\n");
    const combined = await graph(consumer.directory, 'phrases', "export { createRaveldex, RaveldexError, ERROR_CODES } from '@vmitsaras/raveldex'; export { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';\n");
    assert.ok(source.inputs.every(({ path }) => !/verifier|phrases\/index/.test(path)));
    assert.ok(combined.inputs.some(({ path }) => path.endsWith('/phrases/verifier.js')));
    const importProbe = `
      import assert from 'node:assert/strict';
      const denied=['window','document','navigator','fetch','Worker','indexedDB','localStorage','performance','setTimeout','clearTimeout','queueMicrotask'];
      for(const name of denied) Object.defineProperty(globalThis,name,{configurable:true,get(){throw Error(name)}});
      assert.deepEqual(Object.keys(await import('@vmitsaras/raveldex/addons/phrases/source')),['createSourceProvider']);
      assert.deepEqual(Object.keys(await import('@vmitsaras/raveldex/addons/phrases')).sort(),['createSourcePhrases','createSourceProvider']);
      for(const name of ['@vmitsaras/raveldex/addons/phrases/store','@vmitsaras/raveldex/dist/addons/phrases/store.js']) await assert.rejects(import(name), {code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
    `;
    await command(process.execPath, ['--input-type=module', '--eval', importProbe], consumer.directory);
    const runner = `
      import assert from 'node:assert/strict'; import {readFile} from 'node:fs/promises';
      import {createRaveldex,RaveldexError} from '@vmitsaras/raveldex';
      import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';
      const corpus=JSON.parse(await readFile('corpus.json','utf8')), queries=JSON.parse(process.argv[2]);
      const engine=createRaveldex({schema:corpus.schema,addons:[createSourcePhrases({fields:['title','body']}),createSourceProvider({fields:['title','body']})]});
      await engine.addMany(corpus.records); const rows=[];
      for(const query of queries) for(const page of [{limit:100},{limit:0},{offset:1,limit:3}]) rows.push({query,page,result:await engine.search(query,page)});
      const original=corpus.records[0]; const changed={...original,text:{...original.text,title:'source phrase source phrase'}};
      const update=await engine.replace(changed), updated=await engine.search({kind:'extension',capability:'phrases',version:1,payload:{text:'source phrase source',fields:['title']}},{limit:100});
      const clear=await engine.clear(), empty=await engine.search({kind:'extension',capability:'phrases',version:1,payload:{text:'commit point'}},{limit:0});
      await engine.dispose(); await assert.rejects(engine.search('source'),error=>error instanceof RaveldexError&&error.code==='DISPOSED');
      console.log(JSON.stringify({rows,update,updated,clear,empty}));
    `;
    await writeFile(join(consumer.directory, 'packed-phrases.mjs'), runner);
    const args = JSON.stringify(queries.map(native));
    const packed = JSON.parse((await command(process.execPath, ['packed-phrases.mjs', args], consumer.directory)).stdout);
    const expectedCorpus = scanPhraseSourceCorpus(corpus.records, corpus.schema);
    for (const row of packed.rows) {
      const raw = queries[packed.rows.indexOf(row) / 3 | 0]; compare(row.result, sourcePhraseQueryResult(expectedCorpus, raw, row.page)); assert.equal(row.result.revision, 1);
    }
    const changedRecords = corpus.records.map((record, i) => i ? record : { ...record, text: { ...record.text, title: 'source phrase source phrase' } });
    compare(packed.updated, sourcePhraseQueryResult(scanPhraseSourceCorpus(changedRecords, corpus.schema), { kind: 'phrase', text: 'source phrase source', fields: ['title'] }, { limit: 100 }));
    assert.equal(packed.updated.revision, 2); assert.equal(packed.empty.revision, 3); assert.equal(packed.empty.total, 0);
    const bundledRunner = runner.replace("import {createRaveldex,RaveldexError} from '@vmitsaras/raveldex';", '').replace("import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';", "import {createRaveldex,RaveldexError,createSourceProvider,createSourcePhrases} from './phrases-bundle.mjs';");
    await writeFile(join(consumer.directory, 'bundled-phrases.mjs'), bundledRunner);
    const bundled = JSON.parse((await command(process.execPath, ['bundled-phrases.mjs', args], consumer.directory)).stdout); assert.deepEqual(bundled, packed);
    return { package: consumer.package, environment: { node: process.version, platform: process.platform, arch: process.arch }, corpus: { records: corpus.records.length, hash: corpus.hash, sources: corpus.sources }, core, source, combined, startup,
      correctness: { status: 'Pass', completeComparisonsPerRun: packed.rows.length + 2, bundledParity: 'Pass' }, packed };
  } finally { await rm(consumer.directory, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await measurePackedPhrases();
  if (process.argv[2]) await writeFile(resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ correctness: report.correctness, packageBytes: report.package.tarballBytes, coreGzip: report.core.gzipBytes, coreTargetMet: report.core.targetMet, sourceGzip: report.source.gzipBytes, combinedGzip: report.combined.gzipBytes, records: report.corpus.records }));
}
