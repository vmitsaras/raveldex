import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, version } from 'esbuild';
import { prepareConsumer, bundleConsumer, command, digest, checkStartup, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

const rootImport = "import {createRaveldex,RaveldexError,ERROR_CODES} from '@vmitsaras/raveldex';";
const patchImport = "import {createPatch} from '@vmitsaras/raveldex/addons/patch';";
const sourceImport = "import {createSourceProvider} from '@vmitsaras/raveldex/addons/phrases/source';";
const schema = { text: { title: {}, body: {} }, metadata: { tag: { type: 'string', nullable: true }, tags: { type: 'string', multi: true } } };
const records = [{ id: 'a', text: { title: 'red apple', body: ['old content', 'kept words'] }, metadata: { tag: 'old', tags: ['x', 'y'] } }, { id: 'b', text: { title: 'blue apple', body: 'stable content' }, metadata: { tag: null } }];

async function graph(directory, name, entry) {
  await writeFile(join(directory, `${name}.mjs`), entry);
  const settings = { bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false, metafile: true, write: false };
  const result = await build({ ...settings, absWorkingDir: directory, entryPoints: [`${name}.mjs`], outfile: `${name}-bundle.mjs`, logLevel: 'silent' });
  const bytes = result.outputFiles[0].contents, gzip = { level: 9, windowBits: 15, memLevel: 8, strategy: 0 }, compressed = gzipSync(bytes, gzip);
  const inputs = Object.entries(result.metafile.inputs).map(([path, input]) => ({ path, bytes: input.bytes, imports: input.imports }));
  for (const input of inputs) { assert.ok(input.path === `${name}.mjs` || input.path.startsWith('node_modules/@vmitsaras/raveldex/dist/')); assert.ok(input.imports.every(item => !item.external)); }
  assert.deepEqual(Object.values(result.metafile.outputs)[0].imports, []);
  await writeFile(join(directory, `${name}-bundle.mjs`), bytes);
  return { esbuild: version, settings, gzip: { ...gzip, mtime: 0 }, minifiedBytes: bytes.length, gzipBytes: compressed.length, sha256: digest(bytes), gzipSha256: digest(compressed), inputs };
}

const runner = `
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';${rootImport}${patchImport}${sourceImport}
const fixture=JSON.parse(await readFile('patch-fixture.json','utf8')),configuration={schema:fixture.schema,addons:[createSourceProvider({fields:['title','body']})]},engine=createRaveldex(configuration),full=createRaveldex(configuration),patches=createPatch(engine),rows=[],failures=[];
assert.ok(Object.isFrozen(patches));assert.deepEqual(Object.keys(patches),['patch']);assert.deepEqual(Object.keys(engine).sort(),['add','addMany','clear','dispose','remove','replace','search']);
const replacements=[
 {patch:{set:{text:{body:['blue fruit']},metadata:{tag:null,tags:['z','z']}}},record:{id:'a',text:{title:'red apple',body:['blue fruit']},metadata:{tag:null,tags:['z','z']}}},
 {patch:{unset:{text:['body'],metadata:['tag']}},record:{id:'a',text:{title:'red apple'},metadata:{tags:['z']}}},
 {patch:{set:{text:{title:[],body:['']},metadata:{tags:[]}}},record:{id:'a',text:{title:[],body:['']},metadata:{tags:[]}}},
 {patch:{unset:{text:['title']},set:{text:{body:'green fresh'}}},record:{id:'a',text:{body:'green fresh'},metadata:{tags:[]}}},
 {patch:{unset:{text:['title']}},record:{id:'a',text:{body:'green fresh'},metadata:{tags:[]}}},
];
let revision=1,comparisons=0;
try{await engine.addMany(fixture.records);await full.addMany(fixture.records);
for(const item of replacements){const result=await patches.patch({id:'a',expectedRevision:revision,...item.patch}),expected=await full.replace(item.record);assert.deepEqual(result,expected);assert.equal(result.revision,++revision);assert.equal(result.replaced,1);for(const query of ['red','blue','green','old','stable','apple',{kind:'all'},{kind:'eq',field:'tag',value:null}])for(const page of [{limit:100},{offset:1,limit:1},{limit:0}]){assert.deepEqual(await engine.search(query,page),await full.search(query,page));comparisons++;}rows.push({revision,result});}
await assert.rejects(patches.patch({id:'a',expectedRevision:1,set:{text:{body:'stale'}}}),error=>{assert.ok(error instanceof RaveldexError);failures.push(error.code);return error.code==='REVISION_MISMATCH';});
await assert.rejects(patches.patch({id:'a',expectedRevision:revision,set:{metadata:{tag:undefined}}}),error=>{failures.push(error.code);return error.code==='INVALID_RECORD';});
assert.throws(()=>createPatch({...engine}),error=>{assert.ok(error instanceof RaveldexError);failures.push(error.code);return error.code==='MISSING_CAPABILITY';});
const sourceFree=createRaveldex({schema:fixture.schema});try{await sourceFree.addMany(fixture.records);await assert.rejects(createPatch(sourceFree).patch({id:'a',expectedRevision:1,set:{text:{body:'new'}}}),error=>{failures.push(error.code);return error.code==='MISSING_CAPABILITY';});assert.equal((await sourceFree.search('old')).total,1);}finally{await sourceFree.dispose();}
console.log(JSON.stringify({status:'Pass',replacements:replacements.length,completeComparisons:comparisons,failures,rows,scope:'Actual installed full replacement equivalence with explicit complete records and exact pages/totals/scores. Independent source/arithmetic oracle is tested separately.'}));
}finally{await engine.dispose();await full.dispose();}
`;

const restoreRunner = `
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';${rootImport}${patchImport}${sourceImport}import {createSnapshots} from '@vmitsaras/raveldex/adapters/snapshots';
const fixture=JSON.parse(await readFile('patch-fixture.json','utf8')),configuration={schema:fixture.schema,addons:[createSourceProvider({fields:['title','body']})]},donor=createRaveldex(configuration),receiver=createRaveldex(configuration);
try{await donor.addMany(fixture.records);const encoded=await createSnapshots(donor).exportSource(),restored=await createSnapshots(receiver).restore(encoded);assert.equal(restored.revision,1);const patches=createPatch(receiver),result=await patches.patch({id:'a',expectedRevision:restored.revision,set:{text:{body:'restored revised'}}});assert.equal(result.revision,2);const state=JSON.parse(await createSnapshots(receiver).exportSource()).body.payload.records;assert.deepEqual(state.find(row=>row.id==='a'),{id:'a',text:{title:['red apple'],body:['restored revised']},metadata:{tag:'old',tags:['x','y']}});assert.equal((await receiver.search('revised')).total,1);await assert.rejects(patches.patch({id:'a',expectedRevision:1,unset:{text:['body']}}),{code:'REVISION_MISMATCH'});console.log(JSON.stringify({status:'Pass',format:'source',restoredRevision:restored.revision,patchRevision:result.revision,unchangedSourceCodec:true,scope:'Finite local Node source restore followed by direct-owner patch; not native/browser/cross-host qualification'}));}finally{await donor.dispose();await receiver.dispose();}
`;

async function workerRefusal(directory) {
  await writeFile(join(directory, 'patch-worker-host.mjs'), `import {parentPort} from 'node:worker_threads';import {serveRaveldexWorker} from '@vmitsaras/raveldex/adapters/worker/host';${sourceImport}const listeners=new Map();serveRaveldexWorker({postMessage:value=>parentPort.postMessage(value),addEventListener(type,listener){let group=listeners.get(type);if(!group){group=new Map();listeners.set(type,group)}const wrapped=value=>listener(type==='message'?{data:value}:value);group.set(listener,wrapped);parentPort.on(type,wrapped)},removeEventListener(type,listener){const group=listeners.get(type),wrapped=group?.get(listener);if(wrapped)parentPort.off(type,wrapped);group?.delete(listener)}},{addons:[createSourceProvider({fields:['title','body']})]});`);
  await writeFile(join(directory, 'patch-worker-probe.mjs'), `import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';import {readFile} from 'node:fs/promises';${patchImport}${sourceImport}import {createWorkerRaveldex} from '@vmitsaras/raveldex/adapters/worker';const fixture=JSON.parse(await readFile('patch-fixture.json','utf8')),worker=new Worker(new URL('./patch-worker-host.mjs',import.meta.url)),listeners=new Map(),endpoint={postMessage:value=>worker.postMessage(value),addEventListener(type,listener){let group=listeners.get(type);if(!group){group=new Map();listeners.set(type,group)}const wrapped=value=>listener(type==='message'?{data:value}:value);group.set(listener,wrapped);worker.on(type,wrapped)},removeEventListener(type,listener){const group=listeners.get(type),wrapped=group?.get(listener);if(wrapped)worker.off(type,wrapped);group?.delete(listener)},terminate(){void worker.terminate()}};let remote;try{remote=await createWorkerRaveldex({worker:endpoint,configuration:{schema:fixture.schema,addons:[createSourceProvider({fields:['title','body']})]},ownership:'owned',sameHost:true,responseTimeoutMs:10000});assert.throws(()=>createPatch(remote),{code:'MISSING_CAPABILITY'});assert.equal('patch'in remote,false);await remote.addMany(fixture.records);const replaced=await remote.replace({id:'a',text:{title:'red apple',body:'worker full replacement'},metadata:{tag:'old',tags:['x','y']}});assert.equal(replaced.revision,2);assert.equal((await remote.search('worker')).total,1);console.log(JSON.stringify({status:'Pass',code:'MISSING_CAPABILITY',ordinaryWorkerReplacement:'Pass',transport:'Actual Node worker_threads existing mutation protocol',scope:'Direct-only patch boundary; no new patch messages or worker feature'}));}finally{if(remote)await remote.destroy();await worker.terminate();}`);
  return JSON.parse((await command(process.execPath, ['patch-worker-probe.mjs'], directory)).stdout);
}

async function inert(directory, specifier, factory = false) {
  const script = `import assert from 'node:assert/strict';${factory ? rootImport + "const engine=createRaveldex({schema:{text:{body:{}}}});" : ''}const reads=[];for(const name of ['window','document','navigator','fetch','XMLHttpRequest','WebSocket','Worker','SharedWorker','indexedDB','localStorage','sessionStorage','performance','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','queueMicrotask'])Object.defineProperty(globalThis,name,{configurable:true,get(){reads.push(name);throw Error(name)}});const module=await import(${JSON.stringify(specifier)});assert.deepEqual(Object.keys(module),['createPatch']);${factory ? "assert.deepEqual(Object.keys(module.createPatch(engine)),['patch']);await engine.dispose();" : ''}assert.deepEqual(reads,[]);console.log(JSON.stringify({specifier:${JSON.stringify(specifier)},factory:${factory},reads,exports:Object.keys(module)}));`;
  return JSON.parse((await command(process.execPath, ['--input-type=module', '--eval', script], directory)).stdout);
}

export async function measurePackedPatch() {
  const consumer = await prepareConsumer({ schema, records }, []);
  try {
    await writeFile(join(consumer.directory, 'patch-fixture.json'), JSON.stringify({ schema, records }));
    await writeFile(join(consumer.directory, 'patch-types.ts'), `import {createRaveldex,type MutationResult} from '@vmitsaras/raveldex';import {createPatch,type RecordPatch,type RecordPatchSet,type RecordPatchUnset,type Patches} from '@vmitsaras/raveldex/addons/patch';
const engine=createRaveldex({schema:{text:{body:{}}}}),handle:Patches=createPatch(engine),set:RecordPatchSet={text:{body:['new']}},unset:RecordPatchUnset={metadata:['category']},patch:RecordPatch={id:'a',expectedRevision:1,set,unset},result:Promise<MutationResult>=handle.patch(patch);void result;
// @ts-expect-error Required explicit collection revision.
handle.patch({id:'a',set});
// @ts-expect-error Patch input is readonly.
patch.expectedRevision=2;
// @ts-expect-error Whole text assignment map is readonly.
set.text!.body='changed';
// @ts-expect-error Unset arrays are readonly.
unset.metadata!.push('x');
// @ts-expect-error Borrowed handle does not expose ordinary disposal.
handle.dispose();
// @ts-expect-error Private implementation is not public.
import * as hidden from '@vmitsaras/raveldex/addons/patch/capture';
`);
    const tsconfig = JSON.parse(await readFile(join(consumer.directory, 'tsconfig.json'), 'utf8')); tsconfig.include = ['patch-types.ts'];
    await writeFile(join(consumer.directory, 'patch-tsconfig.json'), JSON.stringify(tsconfig));
    await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', join(consumer.directory, 'patch-tsconfig.json')], consumer.directory);
    const core = await bundleConsumer(consumer.directory), patchOnly = await graph(consumer.directory, 'patch-only', "export {createPatch} from '@vmitsaras/raveldex/addons/patch';"), combined = await graph(consumer.directory, 'patch-combined', rootImport.replace('import', 'export') + patchImport.replace('import', 'export') + sourceImport.replace('import', 'export'));
    assert.ok(core.inputs.every(({ path }) => !path.includes('/addons/patch/'))); assert.ok(patchOnly.inputs.some(({ path }) => path.includes('/addons/patch/')));
    assert.ok(patchOnly.inputs.every(({ path }) => !path.includes('/adapters/')));
    const previous = JSON.parse(await readFile(join(REPO_ROOT, 'docs/evidence/RX-A080-package.json'), 'utf8')).core;
    const coreDelta = { baseline: 'docs/evidence/RX-A080-package.json', minifiedBytes: core.minifiedBytes - previous.minifiedBytes, gzipBytes: core.gzipBytes - previous.gzipBytes, scope: 'Measured private owner seam cost. No unchanged-core or performance improvement claim.' };
    const startup = [await checkStartup(consumer.directory, '@vmitsaras/raveldex'), await inert(consumer.directory, '@vmitsaras/raveldex/addons/patch', true), await inert(consumer.directory, './patch-only-bundle.mjs')];
    await command(process.execPath, ['--input-type=module', '--eval', "import assert from 'node:assert/strict';for(const path of ['@vmitsaras/raveldex/addons/patch/capture','@vmitsaras/raveldex/dist/addons/patch/index.js'])await assert.rejects(import(path),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});"], consumer.directory);
    await writeFile(join(consumer.directory, 'packed-patch.mjs'), runner);
    const packed = JSON.parse((await command(process.execPath, ['packed-patch.mjs'], consumer.directory)).stdout);
    await writeFile(join(consumer.directory, 'bundled-patch.mjs'), runner.replace(rootImport, '').replace(sourceImport, '').replace(patchImport, "import {createRaveldex,RaveldexError,ERROR_CODES,createPatch,createSourceProvider} from './patch-combined-bundle.mjs';"));
    const bundled = JSON.parse((await command(process.execPath, ['bundled-patch.mjs'], consumer.directory)).stdout); assert.deepEqual(bundled, packed);
    await writeFile(join(consumer.directory, 'restored-patch.mjs'), restoreRunner);
    const snapshots = JSON.parse((await command(process.execPath, ['restored-patch.mjs'], consumer.directory)).stdout), worker = await workerRefusal(consumer.directory);
    const document = await readFile(join(consumer.installed, 'docs/api/RECORD_PATCH.md'), 'utf8'), example = /```js\n([\s\S]*?)\n```/.exec(document)?.[1]; assert.ok(example);
    await writeFile(join(consumer.directory, 'documented-patch.mjs'), example);
    const documented = await command(process.execPath, ['documented-patch.mjs'], consumer.directory); assert.equal(documented.stdout, '2 1 guide\n');
    return { kind: 'raveldex-patch-package-v1', environment: { node: process.version, platform: process.platform, arch: process.arch }, package: consumer.package, declarations: 'Pass: public readonly ES2022 types without DOM/Node ambient libraries; private imports refused', core, patchOnly, combined, coreDelta, startup, correctness: { status: 'Pass', fullReplacementCasesPerRun: packed.replacements, completeComparisonsPerRun: packed.completeComparisons, minifiedParity: 'Pass', typedRefusalsPerRun: packed.failures.length }, snapshots, worker, documentation: { status: 'Pass', source: 'docs/api/RECORD_PATCH.md', exampleSha256: digest(example), stdout: documented.stdout, scope: 'Exact first installed JavaScript fence executed unchanged' }, state: { patchParticipants: 0, patchCodec: false, hiddenSourceRetention: false, scope: 'Source/code protocol inspection and import graphs; not heap/allocation/copy peaks' }, packed };
  } finally { await rm(consumer.directory, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const report = await measurePackedPatch(); if (process.argv[2]) await writeFile(resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ correctness: report.correctness, packageBytes: report.package.tarballBytes, coreGzip: report.core.gzipBytes, patchOnlyGzip: report.patchOnly.gzipBytes, combinedGzip: report.combined.gzipBytes })); }
