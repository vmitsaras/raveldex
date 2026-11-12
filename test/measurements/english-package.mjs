import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, version } from 'esbuild';
import { prepareConsumer, bundleConsumer, command, digest, checkStartup, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';
import { packEnglish } from '../../scripts/pack-english.mjs';

const schema = { text: { title: {}, body: {} } };
const records = [
  { id: 'a', text: { title: 'Documents indexing', body: 'Sources revise' } },
  { id: 'b', text: { title: 'Document indexed', body: 'source' } },
  { id: 'c', text: { title: 'Atomic writes' } },
  { id: 'd', text: { title: ['document','indexing'], body: 'split values' } },
  { id: 'e', text: { title: 'café source' } },
  { id: 'f', text: { title: 'indexes' } },
];
// Hand-literal stemmed records and Boolean outcomes, independent of production
// transformation. A basic analyzer over these supplies native numeric parity.
const stemmedRecords = [
  { id: 'a', text: { title: 'document index', body: 'sourc revis' } },
  { id: 'b', text: { title: 'document index', body: 'sourc' } },
  { id: 'c', text: { title: 'atom write' } },
  { id: 'd', text: { title: ['document','index'], body: 'split valu' } },
  { id: 'e', text: { title: 'café sourc' } },
  { id: 'f', text: { title: 'index' } },
];
const phrase = text => ({ kind:'extension', capability:'phrases', version:1, payload:{text,fields:['title']} });
const text = value => ({kind:'text',text:value});
const cases = [
  ['documents','document',['a','b','d']], ['indexing','index',['a','b','d','f']],
  ['documents indexes','document index',['a','b','d']], ['atomic writing','atom write',['c']],
  ['source','sourc',['a','b','e']], ['cafe','cafe',[]], ['café','café',['e']],
  ['unmatchedword','unmatchedword',[]], ['!!!','!!!',[]],
].map(([query,expected,expectedIds])=>({query,expected,expectedIds}));
cases.push({query:{kind:'not',child:text('documents')},expected:{kind:'not',child:text('document')},expectedIds:['c','e','f']});

async function graph(directory, name, entry, packageName = '@vmitsaras/raveldex') {
  await writeFile(join(directory, `${name}.mjs`), entry);
  const settings = {bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,treeShaking:true,legalComments:'none',charset:'ascii',sourcemap:false,metafile:true,write:false};
  const result=await build({...settings,absWorkingDir:directory,entryPoints:[`${name}.mjs`],outfile:`${name}-bundle.mjs`,logLevel:'silent'});
  const bytes=result.outputFiles[0].contents,gzip={level:9,windowBits:15,memLevel:8,strategy:0};
  const compressed=gzipSync(bytes,gzip),inputs=Object.entries(result.metafile.inputs).map(([path,value])=>({path,bytes:value.bytes,imports:value.imports}));
  for(const input of inputs){assert.ok(input.path===`${name}.mjs`||input.path.startsWith(`node_modules/${packageName}/dist/`));assert.ok(input.imports.every(item=>!item.external));}
  assert.deepEqual(Object.values(result.metafile.outputs)[0].imports,[]);await writeFile(join(directory,`${name}-bundle.mjs`),bytes);
  return {esbuild:version,settings,gzip:{...gzip,mtime:0},minifiedBytes:bytes.length,gzipBytes:compressed.length,sha256:digest(bytes),gzipSha256:digest(compressed),inputs,metafile:result.metafile};
}
async function freshImport(directory,specifier,exports){
  const script=`import assert from 'node:assert/strict';const reads=[];for(const name of ['process','window','document','navigator','fetch','XMLHttpRequest','WebSocket','Worker','SharedWorker','indexedDB','localStorage','sessionStorage','performance','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','queueMicrotask'])Object.defineProperty(globalThis,name,{configurable:true,get(){reads.push(name);throw Error(name)}});const mod=await import(${JSON.stringify(specifier)});assert.deepEqual(Object.keys(mod).sort(),${JSON.stringify([...exports].sort())});assert.deepEqual(reads,[]);console.log(JSON.stringify({specifier:${JSON.stringify(specifier)},reads,exports:Object.keys(mod).sort()}));`;
  return JSON.parse((await command(process.execPath,['--input-type=module','--eval',script],directory)).stdout);
}

const runner=`
  import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
  import {createRaveldex,RaveldexError} from '@vmitsaras/raveldex';
  import {createEnglishAnalyzer,ENGLISH_ANALYZER} from '@vmitsaras/raveldex/integrations/languages/english';
  const fixture=JSON.parse(await readFile('english-fixture.json','utf8'));
  assert.deepEqual(ENGLISH_ANALYZER,{id:'english-porter1980-v1',environmentProfile:'unqualified'});assert.ok(Object.isFrozen(ENGLISH_ANALYZER));
  assert.throws(()=>createRaveldex({schema:fixture.schema,analyzer:ENGLISH_ANALYZER}),{code:'MISSING_CAPABILITY'});
  assert.throws(()=>createRaveldex({schema:fixture.schema,analyzer:{...ENGLISH_ANALYZER,id:'english-porter1980-v2'},addons:[createEnglishAnalyzer()]}),{code:'MISSING_CAPABILITY'});
  const engine=createRaveldex({schema:fixture.schema,analyzer:ENGLISH_ANALYZER,addons:[createEnglishAnalyzer()]}),baseline=createRaveldex({schema:fixture.schema}),unused=createRaveldex({schema:fixture.schema,addons:[createEnglishAnalyzer()]});
  const compare=(a,b)=>{assert.equal(a.revision,b.revision);assert.equal(a.completeness,'complete');assert.equal(a.total,b.total);assert.deepEqual(a.hits.map(h=>h.id),b.hits.map(h=>h.id));for(let i=0;i<a.hits.length;i++)assert.ok(Math.abs(a.hits[i].score-b.hits[i].score)<=Math.max(1e-12,Math.abs(b.hits[i].score)*1e-12));};
  try{
    await engine.addMany(fixture.records);await baseline.addMany(fixture.stemmedRecords);await unused.addMany(fixture.records);const rows=[];
    for(const entry of fixture.cases){assert.deepEqual((await engine.search(entry.query,{limit:100})).hits.map(h=>h.id).sort(),entry.expectedIds);for(const page of [{limit:100},{limit:0},{offset:1,limit:1}]){const result=await engine.search(entry.query,page);compare(result,await baseline.search(entry.expected,page));rows.push({query:entry.query,page,result});}}
    assert.equal((await unused.search('documents')).total,1);assert.equal((await unused.search('indexing')).total,2);assert.equal((await unused.search('indexed')).total,1);
    const replaced=await engine.replace({id:'a',text:{title:'Archived sources'}});assert.equal(replaced.revision,2);assert.deepEqual((await engine.search('document')).hits.map(h=>h.id).sort(),['b','d']);
    const removed=await engine.remove('b');assert.equal(removed.revision,3);assert.deepEqual((await engine.search('documents')).hits.map(h=>h.id),['d']);
    const cleared=await engine.clear();assert.equal(cleared.revision,4);assert.equal((await engine.search('indexes')).total,0);
    await engine.dispose();await assert.rejects(engine.search('document'),error=>error instanceof RaveldexError&&error.code==='DISPOSED');
    console.log(JSON.stringify({rows,replaced,removed,cleared,unusedAnalyzer:'Pass: registration alone preserves basic-v1'}));
  }finally{await engine.dispose();await baseline.dispose();await unused.dispose();}
`;

const integrationImports=`
  import {createRaveldex,RaveldexError} from '@vmitsaras/raveldex';
  import {createEnglishAnalyzer,ENGLISH_ANALYZER} from '@vmitsaras/raveldex/integrations/languages/english';
  import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';
  import {createPositionProvider} from '@vmitsaras/raveldex/addons/positions';
  import {createPositionPhrases} from '@vmitsaras/raveldex/addons/phrases/positions';
  import {createMatchEvidence} from '@vmitsaras/raveldex/addons/evidence';
  import {createSnapshots,createSnapshotRaveldex,currentNodeSnapshotEnvironment,SnapshotAdapterError} from '@vmitsaras/raveldex/adapters/snapshots';
`;
const integrationRunner=`
  import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
  ${integrationImports}
  const fixture=JSON.parse(await readFile('english-fixture.json','utf8')),fields=['title','body'];
  const qualification={profileId:'rx-a040-packed-local-node-v1',scope:'exact-node-runtime',environment:currentNodeSnapshotEnvironment(),evidence:['test/measurements/english-package.mjs: finite local English roundtrip fixtures only; no all-Unicode or cross-host qualification']};
  const phrase=text=>({kind:'extension',capability:'phrases',version:1,payload:{text,fields:['title']}});
  function addons(kind,alter=false){const pack=createEnglishAnalyzer(),selected=alter?{...pack,manifest:{...pack.manifest,version:'0.1.1'}}:pack;return[selected,createSourceProvider({fields}),...(kind==='source'?[createSourcePhrases({fields})]:[createPositionProvider({fields,offsets:fields}),createPositionPhrases({fields})]),createMatchEvidence({fields:{title:kind==='source'?'source':'offsets',body:kind==='source'?'source':'offsets'}})];}
  function normalize(value){if(Array.isArray(value))return value.map(normalize);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='revision'?0:normalize(item)]));return value;}
  const options={extensions:{'match-evidence':{ids:['a','b','d','e'],fields:['title']}}};
  const rows=[];let comparisons=0,mismatchRefusals=0;
  for(const kind of ['source','positions']){
    const config={schema:fixture.schema,analyzer:ENGLISH_ANALYZER,addons:addons(kind)},donor=createSnapshotRaveldex(config,{nativeQualification:qualification}),target=createSnapshotRaveldex(config,{nativeQualification:qualification});
    try{
      await donor.addMany(fixture.records);const requests=[...fixture.cases.map(entry=>[entry.query,undefined]),[phrase('document indexed'),undefined],['documents',options]],before=[];
      for(const [query,opts] of requests)before.push(normalize(await donor.search(query,opts)));
      assert.deepEqual(before.at(-2).hits.map(h=>h.id).sort(),['a','b']);
      const a=before.at(-1).extensions['match-evidence'].documents.find(doc=>doc.id==='a');assert.deepEqual(a.ranges.map(({start,end,term})=>({start,end,term})),[{start:0,end:9,term:'document'}]);assert.equal(fixture.records[0].text.title.slice(a.ranges[0].start,a.ranges[0].end),'Documents');
      for(const format of ['Source','Native']){
        const encoded=await createSnapshots(donor)['export'+format](),receipt=await createSnapshots(target).restore(encoded),after=[];
        assert.equal(receipt.receivingAnalyzer.id,ENGLISH_ANALYZER.id);assert.equal(receipt.receivingAnalyzer.environmentProfile,qualification.profileId);assert.equal(receipt.reindexed,format==='Source');
        for(const [query,opts] of requests){after.push(normalize(await target.search(query,opts)));comparisons++;}assert.deepEqual(after,before);
        const basic=createSnapshotRaveldex({schema:fixture.schema,addons:addons(kind)},{nativeQualification:qualification});
        const incompatible=createSnapshotRaveldex({...config,addons:addons(kind,true)},{nativeQualification:qualification});
        try{await assert.rejects(createSnapshots(basic).restore(encoded),e=>e instanceof SnapshotAdapterError&&e.reason==='ANALYZER_MISMATCH');mismatchRefusals++;await assert.rejects(createSnapshots(incompatible).restore(encoded),e=>e instanceof SnapshotAdapterError&&e.reason==='CAPABILITY_MISMATCH');mismatchRefusals++;}finally{await basic.dispose();await incompatible.dispose();}
        await target.replace({id:'a',text:{title:'unrelated'}});assert.deepEqual((await target.search('documents')).hits.map(h=>h.id).sort(),['b','d']);
        rows.push({representation:kind,format,receipt,results:after,encodedBytes:new TextEncoder().encode(encoded).length});
      }
    }finally{await donor.dispose();await target.dispose();}
  }
  const sourceRows=rows.filter(row=>row.representation==='source'),positionRows=rows.filter(row=>row.representation==='positions');for(let i=0;i<sourceRows.length;i++)assert.deepEqual(positionRows[i].results,sourceRows[i].results);
  console.log(JSON.stringify({status:'Pass',comparisons,mismatchRefusals,rows,qualificationScope:'Finite local exact-Node source/native English roundtrips and original spans; no all-Unicode or cross-host claim'}));
`;

async function workerProbe(directory){
  const addonSource=`
    import {createEnglishAnalyzer,ENGLISH_ANALYZER} from '@vmitsaras/raveldex/integrations/languages/english';
    import {createSourceProvider} from '@vmitsaras/raveldex/addons/phrases/source';
    import {createPositionProvider} from '@vmitsaras/raveldex/addons/positions';
    import {createPositionPhrases} from '@vmitsaras/raveldex/addons/phrases/positions';
    import {createMatchEvidence} from '@vmitsaras/raveldex/addons/evidence';
    function addons(mode){let pack=createEnglishAnalyzer();if(mode==='version')pack={...pack,manifest:{...pack.manifest,version:'0.1.1'}};if(mode==='budget')pack={...pack,manifest:{...pack.manifest,limits:{...pack.manifest.limits,maxWorkUnits:pack.manifest.limits.maxWorkUnits-1}}};if(mode==='identity')pack={...pack,manifest:{...pack.manifest,execution:{...pack.manifest.execution,workerRegistration:pack.manifest.execution.workerRegistration+':foreign'}}};return[...(mode==='missing'?[]:[pack]),createSourceProvider({fields:['title','body']}),createPositionProvider({fields:['title','body'],offsets:['title','body']}),createPositionPhrases({fields:['title','body']}),createMatchEvidence({fields:{title:'offsets',body:'offsets'}})];}
  `;
  await writeFile(join(directory,'english-worker.mjs'),`
    import {parentPort,workerData} from 'node:worker_threads';import {serveSnapshotRaveldexWorker} from '@vmitsaras/raveldex/adapters/worker/snapshots/host';${addonSource}
    const listeners=new Map();serveSnapshotRaveldexWorker({postMessage:message=>parentPort.postMessage(message),addEventListener(type,listener){let byType=listeners.get(type);if(!byType){byType=new Map();listeners.set(type,byType)}const wrapped=value=>listener(type==='message'?{data:value}:value);byType.set(listener,wrapped);parentPort.on(type,wrapped)},removeEventListener(type,listener){const byType=listeners.get(type),wrapped=byType?.get(listener);if(wrapped)parentPort.off(type,wrapped);byType?.delete(listener)}},{addons:addons(workerData.mode)});
  `);
  await writeFile(join(directory,'english-worker-probe.mjs'),`
    import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {Worker} from 'node:worker_threads';import {createRaveldex} from '@vmitsaras/raveldex';import {createWorkerRaveldex,WorkerAdapterError} from '@vmitsaras/raveldex/adapters/worker';import {createWorkerSnapshots} from '@vmitsaras/raveldex/adapters/worker/snapshots';${addonSource}
    const fixture=JSON.parse(await readFile('english-fixture.json','utf8')),config={schema:fixture.schema,analyzer:ENGLISH_ANALYZER,addons:addons()};
    function endpoint(worker,tamper){const listeners=new Map();return{postMessage:message=>worker.postMessage(message),addEventListener(type,listener){let byType=listeners.get(type);if(!byType){byType=new Map();listeners.set(type,byType)}const wrapped=value=>{if(type==='message'&&tamper?.mode==='restore'&&value.operation==='snapshotRestore'&&value.kind==='result')value={...value,value:{...value.value,receivingAnalyzer:{id:'basic-v1',environmentProfile:'unqualified'}}};if(type==='message'&&tamper?.mode==='receipt'&&value.operation==='snapshotReconcile'&&value.value?.status==='committed')value={...value,value:{...value.value,result:{...value.value.result,receivingAnalyzer:{id:'basic-v1',environmentProfile:'unqualified'}}}};listener(type==='message'?{data:value}:value)};byType.set(listener,wrapped);worker.on(type,wrapped)},removeEventListener(type,listener){const byType=listeners.get(type),wrapped=byType?.get(listener);if(wrapped)worker.off(type,wrapped);byType?.delete(listener)},terminate(){void worker.terminate()}}}
    const wire=value=>JSON.parse(JSON.stringify(value)),compare=(a,b)=>assert.deepEqual(wire(a),wire(b));const direct=createRaveldex(config),worker=new Worker(new URL('./english-worker.mjs',import.meta.url),{workerData:{mode:'valid'}}),tamper={};let remote,comparisons=0;const mismatchRefusals=[];let snapshot,restoreReceipt,tamperedReceipt,tamperedRestore;
    try{
      remote=await createWorkerRaveldex({worker:endpoint(worker,tamper),configuration:config,ownership:'owned',sameHost:true,responseTimeoutMs:10000});await remote.addMany(fixture.records);await direct.addMany(fixture.records);
      const requests=[...fixture.cases.map(entry=>[entry.query,undefined]),[${JSON.stringify(phrase('documents indexed'))},undefined],['documents',{extensions:{'match-evidence':{ids:['a','b','d'],fields:['title']}}}]];
      for(const [query,options] of requests){compare(await remote.search(query,options),await direct.search(query,options));comparisons++;}
      for(const [method,input] of [['replace',{id:'a',text:{title:'documents archived'}}],['remove','b']]){await remote[method](input);await direct[method](input);compare(await remote.search('documents'),await direct.search('documents'));comparisons++;}
      const snapshots=createWorkerSnapshots(remote);snapshot=await snapshots.exportSource();const before=await remote.search('documents');await remote.clear();const restore=snapshots.restore(snapshot);const restored=await restore;assert.deepEqual(wire(restored.receivingAnalyzer),ENGLISH_ANALYZER);restoreReceipt=await snapshots.reconcile(restore.operationId);assert.equal(restoreReceipt.status,'committed');assert.deepEqual(wire(restoreReceipt.result.receivingAnalyzer),ENGLISH_ANALYZER);const after=await remote.search('documents');assert.deepEqual(after.hits,before.hits);comparisons++;
      for(const mode of ['missing','version','budget','identity']){const changed=new Worker(new URL('./english-worker.mjs',import.meta.url),{workerData:{mode}});try{await assert.rejects(createWorkerRaveldex({worker:endpoint(changed),configuration:config,ownership:'owned',sameHost:true,responseTimeoutMs:10000}),error=>{assert.ok(['INCOMPATIBLE_WORKER','MISSING_CAPABILITY'].includes(error.code));mismatchRefusals.push({mode,code:error.code});return true;});}finally{await changed.terminate();}}
      tamper.mode='receipt';await assert.rejects(snapshots.reconcile(restore.operationId),error=>{assert.equal(error.code,'INVALID_TRANSPORT');tamperedReceipt=error.code;return true;});
      const rogue=new Worker(new URL('./english-worker.mjs',import.meta.url),{workerData:{mode:'valid'}});let foreign;try{foreign=await createWorkerRaveldex({worker:endpoint(rogue,{mode:'restore'}),configuration:config,ownership:'owned',sameHost:true,responseTimeoutMs:10000});await assert.rejects(createWorkerSnapshots(foreign).restore(snapshot),error=>{assert.equal(error.code,'OUTCOME_UNKNOWN');tamperedRestore=error.code;return true;});}finally{if(foreign)await foreign.destroy();await rogue.terminate();}
      console.log(JSON.stringify({status:'Pass',transport:'Actual Node worker_threads with structural browser endpoint',comparisons,mismatchRefusals,restoreReceipt,foreignAnalyzerReceipt:tamperedReceipt,foreignAnalyzerRestore:tamperedRestore,unknownOutcome:'Rejected foreign analyzer response is not accepted and does not prove rollback',scope:'Same-host Node protocol/clone/source-restore observations, not browser or cross-host native qualification'}));
    }finally{if(remote)await remote.destroy();await worker.terminate();await direct.dispose();}
  `);
  return JSON.parse((await command(process.execPath,['english-worker-probe.mjs'],directory)).stdout);
}

/** Install the actual second tarball beside the already installed core. Peer
 * resolution is offline against that exact existing core, never a registry. */
async function standaloneProbe(consumer, packedExpected) {
  const prepared = await packEnglish({ output: join(consumer.directory, 'english-standalone') });
  await command('npm', ['install', prepared.tarball, '--offline', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', '--package-lock=false', '--cache', join(consumer.directory, '.npm-cache')], consumer.directory);
  const installed = join(consumer.directory, 'node_modules/@vmitsaras/raveldex-english');
  const metadata = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.equal(metadata.private, false); assert.equal(metadata.version, '1.0.0');
  assert.deepEqual(metadata.peerDependencies, { '@vmitsaras/raveldex': '1.0.0' });
  assert.deepEqual(metadata.dependencies ?? {}, {});
  const tree = JSON.parse((await command('npm', ['ls', '--omit=dev', '--all', '--json'], consumer.directory)).stdout);
  assert.deepEqual(Object.keys(tree.dependencies).sort(), ['@vmitsaras/raveldex', '@vmitsaras/raveldex-english']);
  assert.deepEqual(Object.keys(tree.dependencies['@vmitsaras/raveldex-english'].dependencies ?? {}), ['@vmitsaras/raveldex']);
  const declaration = await readFile(join(installed, 'dist/index.d.ts'), 'utf8');
  assert.match(declaration, /import type \{ AddonRegistration \} from '@vmitsaras\/raveldex';/);
  assert.doesNotMatch(declaration, /\.\.\//);

  const originalTypes = await readFile(join(consumer.directory, 'english-types.ts'), 'utf8');
  await writeFile(join(consumer.directory, 'english-standalone-types.ts'), originalTypes
    .replace("from '@vmitsaras/raveldex/integrations/languages/english'", "from '@vmitsaras/raveldex-english'")
    .replace("from '@vmitsaras/raveldex/integrations/languages/english/stem'", "from '@vmitsaras/raveldex-english/stem'"));
  const configuration = JSON.parse(await readFile(join(consumer.directory, 'english-tsconfig.json'), 'utf8'));
  configuration.include = ['english-standalone-types.ts'];
  await writeFile(join(consumer.directory, 'english-standalone-tsconfig.json'), JSON.stringify(configuration));
  await command(join(REPO_ROOT, 'node_modules/.bin/tsc'), ['-p', join(consumer.directory, 'english-standalone-tsconfig.json')], consumer.directory);
  const marker = "console.log(JSON.stringify({rows,replaced,removed,cleared,unusedAnalyzer:'Pass: registration alone preserves basic-v1'}));";
  assert.ok(runner.includes(marker), 'standalone typed-failure checks attach before the actual consumer result');
  const failureChecks = `
    const failureRows=[],constrained=createRaveldex({schema:fixture.schema,analyzer:ENGLISH_ANALYZER,addons:[createEnglishAnalyzer()],limits:{maxRawTokenCodeUnits:4}});
    const typed=(name,code)=>error=>{assert.ok(error instanceof RaveldexError,name+': remains the public core error type');assert.equal(error.code,code);failureRows.push({name,code:error.code,publicCoreError:true});return true;};
    try{
      await assert.rejects(constrained.add({id:'long',text:{title:'tokens'}}),typed('narrowed raw record token limit','LIMIT_EXCEEDED'));
      await assert.rejects(constrained.search('tokens'),typed('narrowed raw query token limit','LIMIT_EXCEEDED'));
      const controller=new AbortController();controller.abort();
      await assert.rejects(constrained.add({id:'cancelled',text:{title:'cats'}},{signal:controller.signal}),typed('preaborted valid record','CANCELLED'));
      await assert.rejects(constrained.search('cats',{signal:controller.signal}),typed('preaborted valid query','CANCELLED'));
      const empty=await constrained.search({kind:'all'});assert.equal(empty.revision,0);assert.equal(empty.total,0);
    }finally{await constrained.dispose();}
    const typedFailures={status:'Pass',count:failureRows.length,rows:failureRows,revisionAfterRefusal:0};
    console.log(JSON.stringify({rows,replaced,removed,cleared,unusedAnalyzer:'Pass: registration alone preserves basic-v1',typedFailures}));
  `;
  const standaloneRunner = runner.replace("from '@vmitsaras/raveldex/integrations/languages/english'", "from '@vmitsaras/raveldex-english'").replace(marker, failureChecks);
  await writeFile(join(consumer.directory, 'standalone-english.mjs'), standaloneRunner);
  const actual = JSON.parse((await command(process.execPath, ['standalone-english.mjs'], consumer.directory)).stdout);
  const { typedFailures, ...same } = actual;
  assert.deepEqual(same, packedExpected);
  assert.equal(typedFailures.status, 'Pass'); assert.equal(typedFailures.count, 4);
  await command(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import {createEnglishAnalyzer,ENGLISH_ANALYZER} from '@vmitsaras/raveldex-english';
    import {createEnglishAnalyzer as fromCore,ENGLISH_ANALYZER as coreDescriptor} from '@vmitsaras/raveldex/integrations/languages/english';
    assert.deepEqual(ENGLISH_ANALYZER,coreDescriptor);assert.deepEqual(createEnglishAnalyzer().manifest,fromCore().manifest);
    for(const path of ['@vmitsaras/raveldex-english/stem','@vmitsaras/raveldex-english/dist/index.js'])await assert.rejects(import(path),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
  `], consumer.directory);
  const startup = await freshImport(consumer.directory, '@vmitsaras/raveldex-english', ['ENGLISH_ANALYZER', 'createEnglishAnalyzer']);
  const installedFiles = [];
  for (const file of prepared.report.package.files) {
    const bytes = await readFile(join(installed, file.path));
    assert.equal(digest(bytes), file.sha256, 'installed standalone file matches its actual packed input');
    installedFiles.push({ path: file.path, bytes: bytes.length, sha256: digest(bytes) });
  }
  const standaloneGraph = await graph(consumer.directory, 'english-standalone-only', "export {createEnglishAnalyzer,ENGLISH_ANALYZER} from '@vmitsaras/raveldex-english';\n", '@vmitsaras/raveldex-english');
  assert.ok(standaloneGraph.inputs.every(({ path }) => path === 'english-standalone-only.mjs' || path === 'node_modules/@vmitsaras/raveldex-english/dist/index.js'));
  assert.deepEqual(prepared.report.graph.runtimeImports, []);
  return { status: 'Pass', preparation: prepared.report, installedFiles, graph: standaloneGraph, startup, typedFailures,
    declarations: 'Pass: compiler-emitted public-peer declaration, isolated ES2022 readonly types, no DOM/Node ambient types, private exports refused',
    fullPageComparisons: actual.rows.length, factoryParity: 'Pass: descriptor and complete canonical factory manifest equal the core convenience entry',
    installation: 'Actual separate tarball installed offline beside the exact existing core peer; no runtime imports, dependencies or registry lookup',
    outcome: actual };
}

export async function measurePackedEnglish(){
  const consumer=await prepareConsumer({schema,records},[]);
  try{
    await writeFile(join(consumer.directory,'english-fixture.json'),JSON.stringify({schema,records,stemmedRecords,cases}));
    await writeFile(join(consumer.directory,'english-types.ts'),`
      import {createRaveldex,type AddonRegistration,type AnalyzerDescriptor} from '@vmitsaras/raveldex';import {createEnglishAnalyzer,ENGLISH_ANALYZER} from '@vmitsaras/raveldex/integrations/languages/english';
      const addon:AddonRegistration=createEnglishAnalyzer(),descriptor:AnalyzerDescriptor=ENGLISH_ANALYZER;
      void createRaveldex({schema:{text:{title:{}}},analyzer:descriptor,addons:[addon]});
      const name:'english-porter1980-v1'=ENGLISH_ANALYZER.id;void name;
      // @ts-expect-error Analyzer identity is immutable.
      ENGLISH_ANALYZER.id='other';
      // @ts-expect-error Descriptor profiles remain readonly.
      descriptor.environmentProfile='foreign';
      // @ts-expect-error No hidden options or arbitrary morphology callbacks.
      createEnglishAnalyzer({stem:()=>''});
      // @ts-expect-error The private stemmer is not a public deep export.
      import {stemEnglish} from '@vmitsaras/raveldex/integrations/languages/english/stem';
    `);
    const typeConfig=JSON.parse(await readFile(join(consumer.directory,'tsconfig.json'),'utf8'));typeConfig.include=['english-types.ts'];await writeFile(join(consumer.directory,'english-tsconfig.json'),JSON.stringify(typeConfig));await command(join(REPO_ROOT,'node_modules/.bin/tsc'),['-p',join(consumer.directory,'english-tsconfig.json')],consumer.directory);
    const core=await bundleConsumer(consumer.directory),englishOnly=await graph(consumer.directory,'english-only',"export {createEnglishAnalyzer,ENGLISH_ANALYZER} from '@vmitsaras/raveldex/integrations/languages/english';\n"),combined=await graph(consumer.directory,'english-combined',"export {createRaveldex,RaveldexError,ERROR_CODES} from '@vmitsaras/raveldex';export {createEnglishAnalyzer,ENGLISH_ANALYZER} from '@vmitsaras/raveldex/integrations/languages/english';\n");
    assert.ok(core.inputs.every(({path})=>!path.includes('/integrations/languages/')));assert.ok(englishOnly.inputs.some(({path})=>path.endsWith('/english/stem.js')));assert.ok(englishOnly.inputs.every(({path})=>!path.includes('/execution/engine.js')));
    const startup=[await checkStartup(consumer.directory,'@vmitsaras/raveldex'),await checkStartup(consumer.directory,'./core-bundle.mjs'),await freshImport(consumer.directory,'@vmitsaras/raveldex/integrations/languages/english',['ENGLISH_ANALYZER','createEnglishAnalyzer']),await freshImport(consumer.directory,'./english-only-bundle.mjs',['ENGLISH_ANALYZER','createEnglishAnalyzer']),await freshImport(consumer.directory,'./english-combined-bundle.mjs',['ERROR_CODES','RaveldexError','createRaveldex','ENGLISH_ANALYZER','createEnglishAnalyzer'])];
    await command(process.execPath,['--input-type=module','--eval',`import assert from 'node:assert/strict';for(const path of ['@vmitsaras/raveldex/integrations/languages/english/stem','@vmitsaras/raveldex/dist/integrations/languages/english/stem.js'])await assert.rejects(import(path),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});`],consumer.directory);
    await writeFile(join(consumer.directory,'packed-english.mjs'),runner);const packed=JSON.parse((await command(process.execPath,['packed-english.mjs'],consumer.directory)).stdout);
    const bundledRunner=runner.replace("import {createRaveldex,RaveldexError} from '@vmitsaras/raveldex';",'').replace("import {createEnglishAnalyzer,ENGLISH_ANALYZER} from '@vmitsaras/raveldex/integrations/languages/english';","import {createRaveldex,RaveldexError,createEnglishAnalyzer,ENGLISH_ANALYZER} from './english-combined-bundle.mjs';");
    await writeFile(join(consumer.directory,'bundled-english.mjs'),bundledRunner);const bundled=JSON.parse((await command(process.execPath,['bundled-english.mjs'],consumer.directory)).stdout);assert.deepEqual(bundled,packed);
    const standalone = await standaloneProbe(consumer, packed);
    const integrationExports=integrationImports.replaceAll('import {','export {'),integration=await graph(consumer.directory,'english-integration',integrationExports);
    await writeFile(join(consumer.directory,'packed-english-integration.mjs'),integrationRunner);const snapshots=JSON.parse((await command(process.execPath,['packed-english-integration.mjs'],consumer.directory)).stdout);
    const bundledIntegration=integrationRunner.replace(integrationImports,"import {createRaveldex,RaveldexError,createEnglishAnalyzer,ENGLISH_ANALYZER,createSourceProvider,createSourcePhrases,createPositionProvider,createPositionPhrases,createMatchEvidence,createSnapshots,createSnapshotRaveldex,currentNodeSnapshotEnvironment,SnapshotAdapterError} from './english-integration-bundle.mjs';");
    await writeFile(join(consumer.directory,'bundled-english-integration.mjs'),bundledIntegration);const minifiedSnapshots=JSON.parse((await command(process.execPath,['bundled-english-integration.mjs'],consumer.directory)).stdout);assert.deepEqual(minifiedSnapshots,snapshots);
    const worker=await workerProbe(consumer.directory);
    const doc=await readFile(join(consumer.installed,'docs/api/ENGLISH.md'),'utf8'),example=/```js\n([\s\S]*?)\n```/.exec(doc)?.[1];assert.ok(example,'exact installed English documentation example');await writeFile(join(consumer.directory,'documented-english.mjs'),example);const documented=await command(process.execPath,['documented-english.mjs'],consumer.directory);assert.match(documented.stdout,/english-porter1980-v1/);
    return{kind:'raveldex-english-package-cost-v1',environment:{node:process.version,platform:process.platform,arch:process.arch},package:consumer.package,declarations:'Pass, isolated installed readonly ES2022 types with no DOM/Node ambient types',core,englishOnly,combined,integration,startup,worker,snapshots,standalone,documentation:{status:'Pass',source:'docs/api/ENGLISH.md',exampleSha256:digest(example),stdout:documented.stdout},correctness:{status:'Pass',authoredQueries:cases.length,fullPageComparisonsPerRun:packed.rows.length,unselectedPack:'Pass',bundledParity:'Pass',snapshotComparisonsPerRun:snapshots.comparisons,snapshotMismatchRefusalsPerRun:snapshots.mismatchRefusals,separatelyInstalledPack:'Pass'},logicalState:{extraRetainedIndexEntries:0,retainedRepresentation:'Constant suffix algorithm tables and registration identity only; no corpus vocabulary/cache. Separate source/positions test configurations deliberately retain their declared data.',basis:'Logical representation/import graph observation; not heap/allocation-byte or physical-copy peaks'},packed};
  }finally{await rm(consumer.directory,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const report=await measurePackedEnglish();if(process.argv[2])await writeFile(resolve(process.argv[2]),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({correctness:report.correctness,packageBytes:report.package.tarballBytes,coreGzip:report.core.gzipBytes,coreTargetMet:report.core.targetMet,englishOnlyGzip:report.englishOnly.gzipBytes,combinedGzip:report.combined.gzipBytes,worker:report.worker}));}
