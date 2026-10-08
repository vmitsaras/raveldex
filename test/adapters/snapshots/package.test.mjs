import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build, version } from 'esbuild';
import { prepareConsumer, bundleConsumer, checkStartup, command, digest, REPO_ROOT } from '../../../scripts/lib/packed-consumer.mjs';
import { buildCorpus } from '../../../examples/core-docs/corpus.mjs';
import { DOCS_JUDGMENTS } from '../../fixtures/docs/judgments.mjs';

let consumer, report;
before(async () => {
  consumer = await prepareConsumer(await buildCorpus(), DOCS_JUDGMENTS);
  await copyFile(new URL('./public-types.ts', import.meta.url), join(consumer.directory, 'snapshot-types.ts'));
  await writeFile(join(consumer.directory, 'tsconfig.snapshots.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022'], types: [], strict: true,
    noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, verbatimModuleSyntax: true, skipLibCheck: false, noEmit: true,
  }, include: ['snapshot-types.ts'] }));
  await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.snapshots.json'], consumer.directory);
  const core = await bundleConsumer(consumer.directory);
  for (const input of core.inputs) input.sha256 = digest(await readFile(join(consumer.directory, input.path)));
  const entry = "export {createRaveldex,RaveldexError} from '@vmitsaras/raveldex'; export {createSnapshots,createSnapshotRaveldex,currentNodeSnapshotEnvironment,SnapshotAdapterError,SNAPSHOT_REASONS} from '@vmitsaras/raveldex/adapters/snapshots'; export {createSourceProvider} from '@vmitsaras/raveldex/addons/phrases/source'; export {createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases'; export {createPositionProvider} from '@vmitsaras/raveldex/addons/positions'; export {createPositionPhrases} from '@vmitsaras/raveldex/addons/phrases/positions';";
  await writeFile(join(consumer.directory, 'snapshot-entry.mjs'), entry);
  const settings = { bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false, metafile: true, write: false };
  const bundled = await build({ ...settings, absWorkingDir: consumer.directory, entryPoints: ['snapshot-entry.mjs'], outfile: 'snapshot-bundle.mjs', logLevel: 'silent' });
  const bytes = bundled.outputFiles[0].contents, gzipSettings = { level: 9, windowBits: 15, memLevel: 8, strategy: 0 }, compressed = gzipSync(bytes, gzipSettings);
  await writeFile(join(consumer.directory, 'snapshot-bundle.mjs'), bytes);
  const inputs = [];
  for (const [path, input] of Object.entries(bundled.metafile.inputs)) {
    assert.ok(path === 'snapshot-entry.mjs' || path.startsWith('node_modules/@vmitsaras/raveldex/dist/'));
    assert.ok(input.imports.every(entry => !entry.external));
    inputs.push({ path, bytes: input.bytes, imports: input.imports, sha256: digest(await readFile(join(consumer.directory, path))) });
  }
  assert.deepEqual(Object.values(bundled.metafile.outputs)[0].imports, []);
  const startup = [await checkStartup(consumer.directory, '@vmitsaras/raveldex')];
  const startupScript = `const reads=[];for(const name of ['process','window','document','navigator','fetch','Worker','indexedDB','localStorage','performance','setTimeout','queueMicrotask'])Object.defineProperty(globalThis,name,{configurable:true,get(){reads.push(name);throw Error(name)}});const mod=await import('@vmitsaras/raveldex/adapters/snapshots');console.log(JSON.stringify({reads,exports:Object.keys(mod).sort()}));`;
  const row = JSON.parse((await command(process.execPath, ['--input-type=module', '--eval', startupScript], consumer.directory)).stdout);
  assert.deepEqual(row.reads, []); startup.push(row);
  const runner = `
    import assert from 'node:assert/strict';
    import {readFile} from 'node:fs/promises';
    import {createRaveldex,RaveldexError} from '@vmitsaras/raveldex';
    import {createSnapshots,createSnapshotRaveldex,currentNodeSnapshotEnvironment,SnapshotAdapterError,SNAPSHOT_REASONS} from '@vmitsaras/raveldex/adapters/snapshots';
    import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';
    import {createPositionProvider} from '@vmitsaras/raveldex/addons/positions';
    import {createPositionPhrases} from '@vmitsaras/raveldex/addons/phrases/positions';
    const schema={text:{body:{boost:2}}}, qualification={profileId:'packed-test-declared-exact-node',scope:'exact-node-runtime',environment:currentNodeSnapshotEnvironment(),evidence:['test/adapters/snapshots/package.test.mjs: matching attestation contract only']};
    const rows=[];
    for(const representation of ['source','positions']) {
      const addons=representation==='source'?[createSourceProvider({fields:['body']}),createSourcePhrases({fields:['body']})]:[createPositionProvider({fields:['body'],offsets:['body']}),createPositionPhrases({fields:['body']})];
      const engine=createSnapshotRaveldex({schema,addons},{nativeQualification:qualification}),target=createSnapshotRaveldex({schema,addons},{nativeQualification:qualification});
      try {await engine.addMany([{id:'a',text:{body:['red red blue','½']}},{id:'b',text:{body:'red'}},{id:'c',text:{body:['red','blue']}}]);
        const queries=['red','½',{kind:'extension',capability:'phrases',version:1,payload:{text:'red blue'}}],before=[];
        for(const query of queries)before.push(await engine.search(query));
        for(const format of representation==='source'?['Source','Native']:['Native']) {
          const encoded=await createSnapshots(engine)['export'+format]();await createSnapshots(target).restore(encoded);const results=[];
          for(const query of queries)results.push(await target.search(query));
          assert.deepEqual(results.map(result=>({...result,revision:0})),before.map(result=>({...result,revision:0})));
          assert.deepEqual(results[1].hits.map(hit=>hit.id),['a']);assert.deepEqual(results[2].hits.map(hit=>hit.id),['a']);
          await target.replace({id:'a',text:{body:'green'}});assert.equal((await target.search('½')).total,0);
          await target.remove('b');assert.equal((await target.search('red')).total,1);rows.push({representation,format,results:results.map(result=>({...result,revision:0})),encodedBytes:new TextEncoder().encode(encoded).length});
        }
      }finally{await engine.dispose();await target.dispose();}
    }
    const ordinary=createRaveldex({schema});try{await assert.rejects(createSnapshots(ordinary).exportNative(),error=>error instanceof SnapshotAdapterError&&error.reason==='UNQUALIFIED_PROFILE');}finally{await ordinary.dispose();}
    for(const name of ['@vmitsaras/raveldex/adapters/snapshots/json','@vmitsaras/raveldex/dist/adapters/snapshots/index.js','@vmitsaras/raveldex/dist/core/execution/engine.js'])await assert.rejects(import(name),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
    const corpus=JSON.parse(await readFile('corpus.json','utf8')),judgments=JSON.parse(await readFile('judgments.json','utf8'));
    const docsAddons=[createSourceProvider({fields:['title','body']}),createPositionProvider({fields:['title','body'],offsets:['title','body']}),createPositionPhrases({fields:['title','body']})];
    const docs=createSnapshotRaveldex({schema:corpus.schema,addons:docsAddons},{nativeQualification:qualification}),restoredDocs=createSnapshotRaveldex({schema:corpus.schema,addons:docsAddons},{nativeQualification:qualification});
    const documentRows=[];
    try{await docs.addMany(corpus.records);const queries=[...judgments.map(row=>row.query),{kind:'extension',capability:'phrases',version:1,payload:{text:'commit point'}}],before=[];
      for(const query of queries)before.push(await docs.search(query));
      for(const format of ['Source','Native']){const encoded=await createSnapshots(docs)['export'+format]();const receipt=await createSnapshots(restoredDocs).restore(encoded),results=[];
        for(const query of queries)results.push(await restoredDocs.search(query));assert.deepEqual(results.map(result=>({...result,revision:0})),before.map(result=>({...result,revision:0})));
        const original=corpus.records[0];await restoredDocs.replace({...original,text:{...original.text,title:'uniquepackedsnapshotreplacement'}});assert.equal((await restoredDocs.search('uniquepackedsnapshotreplacement')).total,1);
        await restoredDocs.remove(original.id);assert.equal((await restoredDocs.search('uniquepackedsnapshotreplacement')).total,0);
        documentRows.push({format,originRevision:receipt.originRevision,queries:results.map(result=>({...result,revision:0})),encodedBytes:new TextEncoder().encode(encoded).length,subsequentMutations:'Pass'});
      }
    }finally{await docs.dispose();await restoredDocs.dispose();}
    console.log(JSON.stringify({rows,documentCorpus:{hash:corpus.hash,records:corpus.records.length,sources:corpus.sources,rows:documentRows},hiddenEntries:'Pass',unqualifiedNativeGate:'Pass'}));`;
  await writeFile(join(consumer.directory, 'packed-snapshots.mjs'), runner);
  const packed = JSON.parse((await command(process.execPath, ['packed-snapshots.mjs'], consumer.directory)).stdout);
  const minifiedRunner = runner.replace(/import \{[^\n]+\} from '@vmitsaras\/raveldex[^']*';/g, '')
    .replace("const schema=", "import {createRaveldex,RaveldexError,createSnapshots,createSnapshotRaveldex,currentNodeSnapshotEnvironment,SnapshotAdapterError,SNAPSHOT_REASONS,createSourceProvider,createSourcePhrases,createPositionProvider,createPositionPhrases} from './snapshot-bundle.mjs'; const schema=");
  await writeFile(join(consumer.directory, 'bundled-snapshots.mjs'), minifiedRunner);
  const minified = JSON.parse((await command(process.execPath, ['bundled-snapshots.mjs'], consumer.directory)).stdout);
  assert.deepEqual(minified, packed);
  report = { package: consumer.package, environment: { node: process.version, platform: process.platform, arch: process.arch },
    core, snapshots: { entry, esbuild: version, settings, gzip: { ...gzipSettings, mtime: 0 }, minifiedBytes: bytes.length, gzipBytes: compressed.length, sha256: digest(bytes), gzipSha256: digest(compressed), inputs, metafile: bundled.metafile },
    startup, declarations: 'Pass with ES2022 and no DOM/Node ambient types', correctness: { status: 'Pass', formats: 2, representations: 2, completeQueryComparisons: packed.rows.length * 3, documentQueryComparisons: packed.documentCorpus.rows.reduce((count, row) => count + row.queries.length, 0), bundledParity: 'Pass' }, packed };
  if (process.env.RAVELDEX_SNAPSHOT_PACKAGE_REPORT) await writeFile(process.env.RAVELDEX_SNAPSHOT_PACKAGE_REPORT, JSON.stringify(report, null, 2) + '\n');
});
after(async () => { if (consumer) await rm(consumer.directory, { recursive: true, force: true }); });

test('installed public codec declarations and complete minified native/source consumers preserve actual behavior', () => {
  assert.equal(report.correctness.status, 'Pass'); assert.equal(report.correctness.completeQueryComparisons, 9);
  assert.equal(report.correctness.documentQueryComparisons, 40);
  assert.equal(report.correctness.bundledParity, 'Pass');
  assert.ok(consumer.package.files.some(file => file.path === 'dist/adapters/snapshots/index.d.ts'));
  assert.ok(report.snapshots.inputs.some(input => input.path.includes('/adapters/snapshots/')));
});
test('snapshots stay optional and public imports do not inspect host/storage/startup capabilities', () => {
  assert.ok(report.core.inputs.every(input => !/addons|adapters/.test(input.path)));
  assert.ok(report.startup.every(row => row.reads.length === 0));
  assert.ok(report.snapshots.inputs.every(input => !/indexeddb|worker\/|ui\//.test(input.path)));
});
