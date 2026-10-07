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

const queries = [{ kind: 'phrase', text: 'commit point' }, { kind: 'phrase', text: 'red blue' },
  { kind: 'phrase', text: 'source provider', fields: ['body'] }, { kind: 'phrase', text: 'native TypeScript' },
  { kind: 'or', children: [{ kind: 'phrase', text: 'red blue' }, { kind: 'text', text: 'revision' }] },
  { kind: 'not', child: { kind: 'phrase', text: 'commit point' } }, { kind: 'not', child: { kind: 'phrase', text: '' } }];
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
  return { entry, esbuild: version, settings, gzip: { level: 9, windowBits: 15, memLevel: 8, strategy: 0, mtime: 0 }, minifiedBytes: bytes.length, gzipBytes: gzip.length, sha256: digest(bytes), gzipSha256: digest(gzip), inputs, metafile: result.metafile };
}
export async function measurePackedPositions() {
  const corpus = buildCorpus(), consumer = await prepareConsumer(corpus, DOCS_JUDGMENTS);
  try {
    const core = await bundleConsumer(consumer.directory), startup = [await checkStartup(consumer.directory, '@vmitsaras/raveldex')];
    const entries = {
      source: "export {createSourceProvider} from '@vmitsaras/raveldex/addons/phrases/source';",
      sourcePhrases: "export {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';",
      positions: "export {createPositionProvider} from '@vmitsaras/raveldex/addons/positions';",
      positionPhrases: "export {createRaveldex,RaveldexError} from '@vmitsaras/raveldex'; export {createPositionProvider} from '@vmitsaras/raveldex/addons/positions'; export {createPositionPhrases} from '@vmitsaras/raveldex/addons/phrases/positions';",
      mixed: "export {createRaveldex,RaveldexError} from '@vmitsaras/raveldex'; export {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases'; export {createPositionProvider} from '@vmitsaras/raveldex/addons/positions'; export {createPositionPhrases} from '@vmitsaras/raveldex/addons/phrases/positions'; export {createPhrases} from '@vmitsaras/raveldex/addons/phrases/mixed';",
    }, graphs = {};
    for (const [name, entry] of Object.entries(entries)) graphs[name] = await graph(consumer.directory, name, entry);
    assert.ok(graphs.source.inputs.every(({ path }) => !/verifier|positions\//.test(path)));
    assert.ok(graphs.sourcePhrases.inputs.every(({ path }) => !/positions\//.test(path)));
    assert.ok(graphs.positions.inputs.every(({ path }) => !/verifier|positions\/phrases|phrases\//.test(path)));
    assert.ok(graphs.positionPhrases.inputs.every(({ path }) => !/phrases\/(store|verifier|index)\.js/.test(path)));
    const publicExports = {
      '@vmitsaras/raveldex/addons/positions': ['createPositionProvider'],
      '@vmitsaras/raveldex/addons/phrases/positions': ['createPositionPhrases'],
      '@vmitsaras/raveldex/addons/phrases/mixed': ['createPhrases'],
    };
    for (const [specifier, expected] of Object.entries(publicExports)) {
      const script = `const reads=[];for(const name of ['window','document','navigator','fetch','Worker','indexedDB','localStorage','performance','setTimeout','queueMicrotask'])Object.defineProperty(globalThis,name,{configurable:true,get(){reads.push(name);throw Error(name)}});const mod=await import(process.argv[1]);console.log(JSON.stringify({specifier:process.argv[1],reads,exports:Object.keys(mod).sort()}));`;
      const row = JSON.parse((await command(process.execPath, ['--input-type=module', '--eval', script, specifier], consumer.directory)).stdout);
      assert.deepEqual(row.reads, []); assert.deepEqual(row.exports, expected); startup.push(row);
    }
    await command(process.execPath, ['--input-type=module', '--eval', `import assert from 'node:assert/strict';for(const name of ['@vmitsaras/raveldex/addons/positions/store','@vmitsaras/raveldex/addons/positions/verifier','@vmitsaras/raveldex/dist/addons/positions/store.js'])await assert.rejects(import(name),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});`], consumer.directory);
    const runner = `
      import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
      import {createRaveldex,RaveldexError} from '@vmitsaras/raveldex';
      import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';
      import {createPositionProvider} from '@vmitsaras/raveldex/addons/positions';
      import {createPositionPhrases} from '@vmitsaras/raveldex/addons/phrases/positions';
      import {createPhrases} from '@vmitsaras/raveldex/addons/phrases/mixed';
      const corpus=JSON.parse(await readFile('corpus.json','utf8')), queries=JSON.parse(process.argv[2]), runs=[];
      for(const representation of ['source','positions','positionsOffsets','mixed']){
        const addons=representation==='source'?[createSourceProvider({fields:['title','body']}),createSourcePhrases({fields:['title','body']})]:representation==='mixed'?[createSourceProvider({fields:['title']}),createPositionProvider({fields:['body'],offsets:['body']}),createPhrases({fields:{title:'source',body:'positions'}})]:[createPositionProvider({fields:['title','body'],offsets:representation==='positionsOffsets'?['title','body']:[]}),createPositionPhrases({fields:['title','body']})];
        const engine=createRaveldex({schema:corpus.schema,addons});await engine.addMany(corpus.records);const rows=[];
        for(const query of queries)for(const page of [{limit:100},{limit:0},{offset:1,limit:3}])rows.push({query,page,result:await engine.search(query,page)});
        const original=corpus.records[0], update=await engine.replace({...original,text:{...original.text,title:'source phrase source phrase'}}),updated=await engine.search({kind:'extension',capability:'phrases',version:1,payload:{text:'source phrase source',fields:['title']}},{limit:100});
        const clear=await engine.clear(),empty=await engine.search({kind:'extension',capability:'phrases',version:1,payload:{text:'commit point'}},{limit:0});await engine.dispose();await assert.rejects(engine.search('source'),error=>error instanceof RaveldexError&&error.code==='DISPOSED');runs.push({representation,rows,update,updated,clear,empty});
      }console.log(JSON.stringify(runs));`;
    await writeFile(join(consumer.directory, 'packed-positions.mjs'), runner);
    const args = JSON.stringify(queries.map(native));
    const packed = JSON.parse((await command(process.execPath, ['packed-positions.mjs', args], consumer.directory)).stdout);
    const expected = scanPhraseSourceCorpus(corpus.records, corpus.schema);
    for (const run of packed) {
      for (const [i, row] of run.rows.entries()) { compare(row.result, sourcePhraseQueryResult(expected, queries[i / 3 | 0], row.page)); assert.equal(row.result.revision, 1); }
      const changed = corpus.records.map((record, i) => i ? record : { ...record, text: { ...record.text, title: 'source phrase source phrase' } });
      compare(run.updated, sourcePhraseQueryResult(scanPhraseSourceCorpus(changed, corpus.schema), { kind: 'phrase', text: 'source phrase source', fields: ['title'] }, { limit: 100 }));
      assert.equal(run.updated.revision, 2); assert.equal(run.empty.total, 0); assert.equal(run.empty.revision, 3);
      assert.deepEqual({ ...run, representation: '' }, { ...packed[0], representation: '' });
    }
    const bundledRunner = runner.replace(/import \{[^\n]+\} from '@vmitsaras\/raveldex[^']*';/g, '')
      .replace("const corpus=", "import {createRaveldex,RaveldexError,createSourceProvider,createSourcePhrases,createPositionProvider,createPositionPhrases,createPhrases} from './mixed-bundle.mjs'; const corpus=");
    await writeFile(join(consumer.directory, 'bundled-positions.mjs'), bundledRunner);
    const bundled = JSON.parse((await command(process.execPath, ['bundled-positions.mjs', args], consumer.directory)).stdout); assert.deepEqual(bundled, packed);
    return { package: consumer.package, environment: { node: process.version, platform: process.platform, arch: process.arch }, corpus: { records: corpus.records.length, hash: corpus.hash, sources: corpus.sources }, core, graphs, startup,
      correctness: { status: 'Pass', representations: packed.length, completeComparisonsPerRepresentation: packed[0].rows.length + 2, bundledParity: 'Pass' }, packed };
  } finally { await rm(consumer.directory, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await measurePackedPositions(); if (process.argv[2]) await writeFile(resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ correctness: report.correctness, packageBytes: report.package.tarballBytes, coreGzip: report.core.gzipBytes, coreTargetMet: report.core.targetMet, graphs: Object.fromEntries(Object.entries(report.graphs).map(([name, graph]) => [name, { minifiedBytes: graph.minifiedBytes, gzipBytes: graph.gzipBytes, inputs: graph.inputs.length }])) }));
}
