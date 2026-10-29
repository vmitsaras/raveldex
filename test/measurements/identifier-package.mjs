import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, version } from 'esbuild';
import { prepareConsumer, bundleConsumer, command, digest, checkStartup, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';

const schema = { text: { title: { boost: 2 } } };
const records = [
  { id: 'a', text: { title: 'fooBar next' } },
  { id: 'b', text: { title: 'foo bar' } },
  { id: 'c', text: { title: 'foo_bar next' } },
  { id: 'd', text: { title: ['foo', 'bar'] } },
  { id: 'e', text: { title: 'unrelated' } },
  { id: 'f', text: { title: 'HTTP2Server' } },
  { id: 'g', text: { title: 'cafe\u0301Parser' } },
  { id: 'h', text: { title: 'fooFoo' } },
  { id: 'i', text: { title: 'src/core/search.ts' } },
];
// Exhaustive emitted-term frequencies authored independently. They feed only
// the hand BM25 check and are not obtained from the implementation's analyzer.
const frequencies = {
  a: ['foobar','foo','bar','next'], b: ['foo','bar'], c: ['foo_bar','foo','bar','next'],
  d: ['foo','bar'], e: ['unrelated'], f: ['http2server','http','2','server'],
  g: ['caféparser','café','parser'], h: ['foofoo','foo'], i: ['src','core','search','ts'],
};
const text = value => ({kind:'text',text:value});
const cases = [
  {query:'foo',groups:[['foo']],ids:['a','b','c','d','h']},
  {query:'foo bar',groups:[['bar'],['foo']],ids:['a','b','c','d']},
  {query:'fooBar',groups:[['foobar']],ids:['a']},
  {query:'foo_bar',groups:[['foo_bar']],ids:['c']},
  {query:'HTTP2Server',groups:[['http2server']],ids:['f']},
  {query:'http server',groups:[['http'],['server']],ids:['f']},
  {query:'café',groups:[['café']],ids:['g']},
  {query:'cafe',groups:[['cafe']],ids:[]},
  {query:{kind:'or',children:[text('foo'),text('server')]},groups:[['foo'],['server']],ids:['a','b','c','d','f','h']},
  {query:{kind:'not',child:text('foo')},groups:[],ids:['e','f','g','i']},
  {query:{kind:'group',variants:[{text:'fo',match:'prefix'}]},groups:[['foo','foo_bar','foobar','foofoo']],ids:['a','b','c','d','h']},
  {query:'src/core/search.ts',groups:[['core'],['search'],['src'],['ts']],ids:['i']},
  {query:'unmatchedword',groups:[['unmatchedword']],ids:[]},
];
const fixture = { schema, records, frequencies, cases };
const rootImport = "import {createRaveldex,RaveldexError} from '@vmitsaras/raveldex';";
const identifierImport = "import {createIdentifierAnalyzer,IDENTIFIER_ANALYZER} from '@vmitsaras/raveldex/addons/identifiers';";
const integrationImports = `
  ${rootImport}
  ${identifierImport}
  import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';
  import {createPositionProvider} from '@vmitsaras/raveldex/addons/positions';
  import {createPositionPhrases} from '@vmitsaras/raveldex/addons/phrases/positions';
  import {createMatchEvidence} from '@vmitsaras/raveldex/addons/evidence';
  import {createSnapshots,createSnapshotRaveldex,currentNodeSnapshotEnvironment,SnapshotAdapterError} from '@vmitsaras/raveldex/adapters/snapshots';
`;

async function graph(directory, name, entry) {
  await writeFile(join(directory, `${name}.mjs`), entry);
  const settings={bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,treeShaking:true,legalComments:'none',charset:'ascii',sourcemap:false,metafile:true,write:false};
  const result=await build({...settings,absWorkingDir:directory,entryPoints:[`${name}.mjs`],outfile:`${name}-bundle.mjs`,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);
  const bytes=result.outputFiles[0].contents,gzip={level:9,windowBits:15,memLevel:8,strategy:0},compressed=gzipSync(bytes,gzip);
  const inputs=Object.entries(result.metafile.inputs).map(([path,input])=>({path,bytes:input.bytes,imports:input.imports}));
  for(const input of inputs){assert.ok(input.path===`${name}.mjs`||input.path.startsWith('node_modules/@vmitsaras/raveldex/dist/'));assert.ok(input.imports.every(item=>!item.external));}
  assert.deepEqual(Object.values(result.metafile.outputs)[0].imports,[]);
  await writeFile(join(directory,`${name}-bundle.mjs`),bytes);
  return {esbuild:version,settings,gzip:{...gzip,mtime:0},minifiedBytes:bytes.length,gzipBytes:compressed.length,sha256:digest(bytes),gzipSha256:digest(compressed),inputs,metafile:result.metafile};
}
async function freshImport(directory,specifier,exports){
  const source=`import assert from 'node:assert/strict';const reads=[];for(const name of ['process','window','document','navigator','fetch','XMLHttpRequest','WebSocket','Worker','SharedWorker','indexedDB','localStorage','sessionStorage','performance','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','queueMicrotask'])Object.defineProperty(globalThis,name,{configurable:true,get(){reads.push(name);throw Error(name)}});const module=await import(${JSON.stringify(specifier)});assert.deepEqual(Object.keys(module).sort(),${JSON.stringify([...exports].sort())});assert.deepEqual(reads,[]);console.log(JSON.stringify({specifier:${JSON.stringify(specifier)},reads,exports:Object.keys(module).sort()}));`;
  return JSON.parse((await command(process.execPath,['--input-type=module','--eval',source],directory)).stdout);
}

const runner = `
  import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
  ${rootImport}
  ${identifierImport}
  const fixture=JSON.parse(await readFile('identifier-fixture.json','utf8'));
  assert.deepEqual(IDENTIFIER_ANALYZER,{id:'code-identifiers-v1',environmentProfile:'unqualified'});assert.ok(Object.isFrozen(IDENTIFIER_ANALYZER));
  assert.throws(()=>createRaveldex({schema:fixture.schema,analyzer:IDENTIFIER_ANALYZER}),{code:'MISSING_CAPABILITY'});
  assert.throws(()=>createRaveldex({schema:fixture.schema,analyzer:{...IDENTIFIER_ANALYZER,id:'code-identifiers-v2'},addons:[createIdentifierAnalyzer()]}),{code:'MISSING_CAPABILITY'});
  const selected=createRaveldex({schema:fixture.schema,analyzer:IDENTIFIER_ANALYZER,addons:[createIdentifierAnalyzer()]}),basic=createRaveldex({schema:fixture.schema}),unused=createRaveldex({schema:fixture.schema,addons:[createIdentifierAnalyzer()]});
  const ids=Object.keys(fixture.frequencies),N=ids.length,L=Object.values(fixture.frequencies).reduce((sum,terms)=>sum+terms.length,0),average=L/N;
  function base(id,term){const words=fixture.frequencies[id],tf=words.filter(word=>word===term).length;if(!tf)return 0;const df=ids.filter(other=>fixture.frequencies[other].includes(term)).length;const idf=Math.log(1+(N-df+0.5)/(df+0.5)),normalizer=1.2*(1-0.75+0.75*words.length/average),tfPart=tf*(1.2+1)/(tf+normalizer);return 2*idf*tfPart;}
  function expected(entry){return entry.ids.map(id=>({id,score:entry.groups.reduce((sum,terms)=>sum+Math.max(0,...terms.map(term=>base(id,term))),0)})).sort((a,b)=>b.score-a.score||(a.id<b.id?-1:a.id>b.id?1:0));}
  const close=(actual,wanted)=>assert.ok(Math.abs(actual-wanted)<=Math.max(1e-12,Math.abs(wanted)*1e-12),actual+' vs '+wanted);
  try{
    for(const engine of [selected,basic,unused])await engine.addMany(fixture.records);
    const rows=[];
    for(const entry of fixture.cases){const all=expected(entry);assert.deepEqual((await selected.search(entry.query,{limit:100})).hits.map(hit=>hit.id).sort(),entry.ids);for(const page of [{limit:100},{offset:1,limit:2},{limit:0}]){const result=await selected.search(entry.query,page);assert.equal(result.total,all.length);assert.equal(result.completeness,'complete');const wanted=all.slice(page.offset??0,(page.offset??0)+(page.limit??100));assert.deepEqual(result.hits.map(hit=>hit.id),wanted.map(hit=>hit.id));for(let i=0;i<wanted.length;i++)close(result.hits[i].score,wanted[i].score);rows.push({query:entry.query,page,result});}assert.deepEqual(await unused.search(entry.query,{limit:100}),await basic.search(entry.query,{limit:100}));}
    const replaced=await selected.replace({id:'a',text:{title:'changedName'}});assert.equal(replaced.revision,2);assert.deepEqual((await selected.search('foo bar',{limit:100})).hits.map(hit=>hit.id).sort(),['b','c','d']);assert.equal((await selected.search('changed')).hits[0].id,'a');
    const removed=await selected.remove('c');assert.equal(removed.revision,3);assert.deepEqual((await selected.search('foo bar',{limit:100})).hits.map(hit=>hit.id).sort(),['b','d']);
    const cleared=await selected.clear();assert.equal(cleared.revision,4);assert.equal((await selected.search('foo')).total,0);
    const typed=[];await assert.rejects(selected.add({id:'invalid',text:{title:'bad\\ud800'}}),error=>{assert.ok(error instanceof RaveldexError);assert.equal(error.code,'INVALID_RECORD');typed.push(error.code);return true;});
    await selected.dispose();await assert.rejects(selected.search('foo'),error=>{assert.ok(error instanceof RaveldexError);assert.equal(error.code,'DISPOSED');typed.push(error.code);return true;});
    console.log(JSON.stringify({rows,replaced,removed,cleared,typed,numerical:'Independent literal frequencies and hand-native-BM25; no production analyzer/scorer used for expected values',unusedAnalyzer:'Pass'}));
  }finally{await selected.dispose();await basic.dispose();await unused.dispose();}
`;

const integrationRunner = `
  import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
  ${integrationImports}
  const fixture=JSON.parse(await readFile('identifier-fixture.json','utf8')),fields=['title'];
  const qualification={profileId:'rx-a050-packed-local-node-v1',scope:'exact-node-runtime',environment:currentNodeSnapshotEnvironment(),evidence:['test/measurements/identifier-package.mjs: finite same-host fixture source/native identifier round trips; no all-Unicode or cross-host qualification']};
  const phrase=text=>({kind:'extension',capability:'phrases',version:1,payload:{text,fields}});
  function addons(kind,changed=false){let pack=createIdentifierAnalyzer();if(changed)pack={...pack,manifest:{...pack.manifest,version:'0.1.1'}};return[pack,createSourceProvider({fields}),...(kind==='source'?[createSourcePhrases({fields})]:[createPositionProvider({fields,offsets:fields}),createPositionPhrases({fields})]),createMatchEvidence({fields:{title:kind==='source'?'source':'offsets'}})];}
  function normalize(value){if(Array.isArray(value))return value.map(normalize);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='revision'?0:normalize(item)]));return value;}
  const requests=[...fixture.cases.map(entry=>[entry.query,undefined]),[phrase('foo bar'),undefined],[phrase('fooBar next'),undefined],[phrase('foo_bar next'),undefined],[phrase('http server'),undefined],['foo',{extensions:{'match-evidence':{ids:['a','b','c','d','h'],fields}}}],['café',{extensions:{'match-evidence':{ids:['g'],fields}}}]];
  const rows=[];let comparisons=0,mismatchRefusals=0;
  for(const kind of ['source','positions']){
    const config={schema:fixture.schema,analyzer:IDENTIFIER_ANALYZER,addons:addons(kind)},donor=createSnapshotRaveldex(config,{nativeQualification:qualification}),receiver=createSnapshotRaveldex(config,{nativeQualification:qualification});
    try{
      await donor.addMany(fixture.records);const before=[];for(const [query,options] of requests)before.push(normalize(await donor.search(query,options)));
      assert.deepEqual(before[fixture.cases.length].hits.map(hit=>hit.id),['b']);assert.deepEqual(before[fixture.cases.length+1].hits.map(hit=>hit.id),['a']);assert.deepEqual(before[fixture.cases.length+2].hits.map(hit=>hit.id),['c']);assert.equal(before[fixture.cases.length+3].total,0);
      const evidence=before.at(-2).extensions['match-evidence'],a=evidence.documents.find(doc=>doc.id==='a'),c=evidence.documents.find(doc=>doc.id==='c');assert.deepEqual(a.ranges.map(range=>[range.term,range.start,range.end]),[['foo',0,3]]);assert.deepEqual(c.ranges.map(range=>[range.term,range.start,range.end]),[['foo',0,3]]);assert.equal(fixture.records[0].text.title.slice(a.ranges[0].start,a.ranges[0].end),'foo');const accent=before.at(-1).extensions['match-evidence'].documents.find(doc=>doc.id==='g');assert.deepEqual(accent.ranges.map(range=>[range.term,range.start,range.end]),[['café',0,5]]);
      for(const format of ['Source','Native']){
        const encoded=await createSnapshots(donor)['export'+format](),receipt=await createSnapshots(receiver).restore(encoded),after=[];assert.equal(receipt.receivingAnalyzer.id,IDENTIFIER_ANALYZER.id);assert.equal(receipt.receivingAnalyzer.environmentProfile,qualification.profileId);assert.equal(receipt.reindexed,format==='Source');
        for(const [query,options] of requests){after.push(normalize(await receiver.search(query,options)));comparisons++;}assert.deepEqual(after,before);
        const basic=createSnapshotRaveldex({schema:fixture.schema,addons:addons(kind)},{nativeQualification:qualification}),changed=createSnapshotRaveldex({...config,addons:addons(kind,true)},{nativeQualification:qualification});
        try{for(const [engine,reason] of [[basic,'ANALYZER_MISMATCH'],[changed,'CAPABILITY_MISMATCH']]){await assert.rejects(createSnapshots(engine).restore(encoded),error=>error instanceof SnapshotAdapterError&&error.reason===reason);mismatchRefusals++;}}finally{await basic.dispose();await changed.dispose();}
        await receiver.replace({id:'a',text:{title:'changedName'}});assert.deepEqual((await receiver.search('foo bar',{limit:100})).hits.map(hit=>hit.id).sort(),['b','c','d']);rows.push({representation:kind,format,receipt,results:after,encodedBytes:new TextEncoder().encode(encoded).length});
      }
    }finally{await donor.dispose();await receiver.dispose();}
  }
  for(let i=0;i<2;i++)assert.deepEqual(rows[i].results,rows[i+2].results);
  console.log(JSON.stringify({status:'Pass',comparisons,mismatchRefusals,rows,qualificationScope:'Finite local exact-Node source/native identifier snapshots and source/offset parity; no all-Unicode or cross-host qualification'}));
`;

async function workerProbe(directory) {
  const addonSource = `
    ${identifierImport}
    import {createSourceProvider} from '@vmitsaras/raveldex/addons/phrases/source';
    import {createPositionProvider} from '@vmitsaras/raveldex/addons/positions';
    import {createPositionPhrases} from '@vmitsaras/raveldex/addons/phrases/positions';
    import {createMatchEvidence} from '@vmitsaras/raveldex/addons/evidence';
    function addons(mode){let pack=createIdentifierAnalyzer();if(mode==='version')pack={...pack,manifest:{...pack.manifest,version:'0.1.1'}};if(mode==='policy')pack={...pack,manifest:{...pack.manifest,execution:{...pack.manifest.execution,workerRegistration:pack.manifest.execution.workerRegistration+':foreign-component-policy'}}};return[...(mode==='missing'?[]:[pack]),createSourceProvider({fields:['title']}),createPositionProvider({fields:['title'],offsets:['title']}),createPositionPhrases({fields:['title']}),createMatchEvidence({fields:{title:'offsets'}})];}
  `;
  await writeFile(join(directory,'identifier-worker.mjs'),`
    import {parentPort,workerData} from 'node:worker_threads';import {serveSnapshotRaveldexWorker} from '@vmitsaras/raveldex/adapters/worker/snapshots/host';${addonSource}
    const listeners=new Map();serveSnapshotRaveldexWorker({postMessage:message=>parentPort.postMessage(message),addEventListener(type,listener){let entries=listeners.get(type);if(!entries){entries=new Map();listeners.set(type,entries)}const wrapped=value=>listener(type==='message'?{data:value}:value);entries.set(listener,wrapped);parentPort.on(type,wrapped)},removeEventListener(type,listener){const entries=listeners.get(type),wrapped=entries?.get(listener);if(wrapped)parentPort.off(type,wrapped);entries?.delete(listener)}},{addons:addons(workerData.mode)});
  `);
  await writeFile(join(directory,'identifier-worker-probe.mjs'),`
    import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {Worker} from 'node:worker_threads';${rootImport}
    import {createWorkerRaveldex} from '@vmitsaras/raveldex/adapters/worker';import {createWorkerSnapshots} from '@vmitsaras/raveldex/adapters/worker/snapshots';${addonSource}
    const fixture=JSON.parse(await readFile('identifier-fixture.json','utf8')),config={schema:fixture.schema,analyzer:IDENTIFIER_ANALYZER,addons:addons()};
    function endpoint(worker,tamper){const listeners=new Map();return{postMessage:message=>worker.postMessage(message),addEventListener(type,listener){let entries=listeners.get(type);if(!entries){entries=new Map();listeners.set(type,entries)}const wrapped=value=>{if(type==='message'&&tamper?.mode==='restore'&&value.operation==='snapshotRestore'&&value.kind==='result')value={...value,value:{...value.value,receivingAnalyzer:{id:'basic-v1',environmentProfile:'unqualified'}}};if(type==='message'&&tamper?.mode==='receipt'&&value.operation==='snapshotReconcile'&&value.value?.status==='committed')value={...value,value:{...value.value,result:{...value.value.result,receivingAnalyzer:{id:'basic-v1',environmentProfile:'unqualified'}}}};listener(type==='message'?{data:value}:value)};entries.set(listener,wrapped);worker.on(type,wrapped)},removeEventListener(type,listener){const entries=listeners.get(type),wrapped=entries?.get(listener);if(wrapped)worker.off(type,wrapped);entries?.delete(listener)},terminate(){void worker.terminate()}}}
    const wire=value=>JSON.parse(JSON.stringify(value)),compare=(actual,expected)=>assert.deepEqual(wire(actual),wire(expected)),phrase=text=>({kind:'extension',capability:'phrases',version:1,payload:{text,fields:['title']}});
    const direct=createRaveldex(config),worker=new Worker(new URL('./identifier-worker.mjs',import.meta.url),{workerData:{mode:'valid'}}),tamper={};let remote,comparisons=0,restoreReceipt,foreignAnalyzerReceipt,foreignAnalyzerRestore;const mismatchRefusals=[];
    try{
      remote=await createWorkerRaveldex({worker:endpoint(worker,tamper),configuration:config,ownership:'owned',sameHost:true,responseTimeoutMs:10000});await remote.addMany(fixture.records);await direct.addMany(fixture.records);
      const requests=[...fixture.cases.map(entry=>[entry.query,undefined]),[phrase('foo bar'),undefined],[phrase('fooBar next'),undefined],[phrase('foo_bar next'),undefined],[phrase('http server'),undefined],['foo',{extensions:{'match-evidence':{ids:['a','b','c','d','h'],fields:['title']}}}],['café',{extensions:{'match-evidence':{ids:['g'],fields:['title']}}}]];
      for(const [query,options] of requests){compare(await remote.search(query,options),await direct.search(query,options));comparisons++;}
      for(const [method,input] of [['replace',{id:'a',text:{title:'changedName'}}],['remove','c']]){await remote[method](input);await direct[method](input);compare(await remote.search('foo bar'),await direct.search('foo bar'));comparisons++;}
      const snapshots=createWorkerSnapshots(remote),encoded=await snapshots.exportSource(),before=await remote.search('foo bar');await remote.clear();const restoring=snapshots.restore(encoded),restored=await restoring;assert.deepEqual(wire(restored.receivingAnalyzer),IDENTIFIER_ANALYZER);restoreReceipt=await snapshots.reconcile(restoring.operationId);assert.equal(restoreReceipt.status,'committed');assert.deepEqual(wire(restoreReceipt.result.receivingAnalyzer),IDENTIFIER_ANALYZER);const after=await remote.search('foo bar');assert.deepEqual(after.hits,before.hits);comparisons++;
      for(const mode of ['missing','version','policy']){const changed=new Worker(new URL('./identifier-worker.mjs',import.meta.url),{workerData:{mode}});try{await assert.rejects(createWorkerRaveldex({worker:endpoint(changed),configuration:config,ownership:'owned',sameHost:true,responseTimeoutMs:10000}),error=>{assert.ok(['INCOMPATIBLE_WORKER','MISSING_CAPABILITY'].includes(error.code));mismatchRefusals.push({mode,code:error.code});return true;});}finally{await changed.terminate();}}
      tamper.mode='receipt';await assert.rejects(snapshots.reconcile(restoring.operationId),error=>{assert.equal(error.code,'INVALID_TRANSPORT');foreignAnalyzerReceipt=error.code;return true;});
      const rogue=new Worker(new URL('./identifier-worker.mjs',import.meta.url),{workerData:{mode:'valid'}});let foreign;try{foreign=await createWorkerRaveldex({worker:endpoint(rogue,{mode:'restore'}),configuration:config,ownership:'owned',sameHost:true,responseTimeoutMs:10000});await assert.rejects(createWorkerSnapshots(foreign).restore(encoded),error=>{assert.equal(error.code,'OUTCOME_UNKNOWN');foreignAnalyzerRestore=error.code;return true;});}finally{if(foreign)await foreign.destroy();await rogue.terminate();}
      console.log(JSON.stringify({status:'Pass',transport:'Actual Node worker_threads with structural browser endpoint',comparisons,mismatchRefusals,restoreReceipt,foreignAnalyzerReceipt,foreignAnalyzerRestore,unknownOutcome:'Foreign analyzer response is rejected; this does not prove rollback',scope:'Finite same-host Node protocol/clone/source-restore observations, not browser or cross-host native qualification'}));
    }finally{if(remote)await remote.destroy();await worker.terminate();await direct.dispose();}
  `);
  return JSON.parse((await command(process.execPath,['identifier-worker-probe.mjs'],directory)).stdout);
}

export async function measurePackedIdentifiers() {
  const consumer=await prepareConsumer({schema,records},[]);
  try{
    await writeFile(join(consumer.directory,'identifier-fixture.json'),JSON.stringify(fixture));
    await writeFile(join(consumer.directory,'identifier-types.ts'),`
      import {createRaveldex,type AddonRegistration,type AnalyzerDescriptor} from '@vmitsaras/raveldex';
      import {createIdentifierAnalyzer,IDENTIFIER_ANALYZER} from '@vmitsaras/raveldex/addons/identifiers';
      const addon:AddonRegistration=createIdentifierAnalyzer(),descriptor:AnalyzerDescriptor=IDENTIFIER_ANALYZER;
      void createRaveldex({schema:{text:{title:{}}},analyzer:descriptor,addons:[addon]});
      const name:'code-identifiers-v1'=IDENTIFIER_ANALYZER.id;void name;
      // @ts-expect-error Analyzer identity remains immutable.
      IDENTIFIER_ANALYZER.id='foreign';
      // @ts-expect-error No arbitrary per-query scanner callback or hidden options.
      createIdentifierAnalyzer({split:()=>[]});
      // @ts-expect-error Private scanner is not a deep public export.
      import {analyzeIdentifiers} from '@vmitsaras/raveldex/addons/identifiers/scanner';
    `);
    const typeConfig=JSON.parse(await readFile(join(consumer.directory,'tsconfig.json'),'utf8'));typeConfig.include=['identifier-types.ts'];await writeFile(join(consumer.directory,'identifier-tsconfig.json'),JSON.stringify(typeConfig));await command(join(REPO_ROOT,'node_modules/.bin/tsc'),['-p',join(consumer.directory,'identifier-tsconfig.json')],consumer.directory);
    const core=await bundleConsumer(consumer.directory),identifierOnly=await graph(consumer.directory,'identifier-only',`export {createIdentifierAnalyzer,IDENTIFIER_ANALYZER} from '@vmitsaras/raveldex/addons/identifiers';\n`),combined=await graph(consumer.directory,'identifier-combined',`export {createRaveldex,RaveldexError,ERROR_CODES} from '@vmitsaras/raveldex';export {createIdentifierAnalyzer,IDENTIFIER_ANALYZER} from '@vmitsaras/raveldex/addons/identifiers';\n`);
    assert.ok(core.inputs.every(({path})=>!path.includes('/addons/identifiers/')));assert.ok(identifierOnly.inputs.some(({path})=>path.endsWith('/identifiers/scanner.js')));assert.ok(identifierOnly.inputs.every(({path})=>!path.includes('/execution/engine.js')));
    const startup=[await checkStartup(consumer.directory,'@vmitsaras/raveldex'),await checkStartup(consumer.directory,'./core-bundle.mjs'),await freshImport(consumer.directory,'@vmitsaras/raveldex/addons/identifiers',['IDENTIFIER_ANALYZER','createIdentifierAnalyzer']),await freshImport(consumer.directory,'./identifier-only-bundle.mjs',['IDENTIFIER_ANALYZER','createIdentifierAnalyzer']),await freshImport(consumer.directory,'./identifier-combined-bundle.mjs',['ERROR_CODES','RaveldexError','createRaveldex','IDENTIFIER_ANALYZER','createIdentifierAnalyzer'])];
    await command(process.execPath,['--input-type=module','--eval',`import assert from 'node:assert/strict';for(const name of ['@vmitsaras/raveldex/addons/identifiers/scanner','@vmitsaras/raveldex/dist/addons/identifiers/scanner.js'])await assert.rejects(import(name),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});`],consumer.directory);
    await writeFile(join(consumer.directory,'packed-identifiers.mjs'),runner);const packed=JSON.parse((await command(process.execPath,['packed-identifiers.mjs'],consumer.directory)).stdout);
    const bundledRunner=runner.replace(rootImport,'').replace(identifierImport,"import {createRaveldex,RaveldexError,createIdentifierAnalyzer,IDENTIFIER_ANALYZER} from './identifier-combined-bundle.mjs';");await writeFile(join(consumer.directory,'bundled-identifiers.mjs'),bundledRunner);const bundled=JSON.parse((await command(process.execPath,['bundled-identifiers.mjs'],consumer.directory)).stdout);assert.deepEqual(bundled,packed);
    const integration=await graph(consumer.directory,'identifier-integration',integrationImports.replaceAll('import {','export {'));
    await writeFile(join(consumer.directory,'packed-identifier-integration.mjs'),integrationRunner);const snapshots=JSON.parse((await command(process.execPath,['packed-identifier-integration.mjs'],consumer.directory)).stdout);
    const bundledIntegration=integrationRunner.replace(integrationImports,"import {createRaveldex,RaveldexError,createIdentifierAnalyzer,IDENTIFIER_ANALYZER,createSourceProvider,createSourcePhrases,createPositionProvider,createPositionPhrases,createMatchEvidence,createSnapshots,createSnapshotRaveldex,currentNodeSnapshotEnvironment,SnapshotAdapterError} from './identifier-integration-bundle.mjs';");await writeFile(join(consumer.directory,'bundled-identifier-integration.mjs'),bundledIntegration);const minifiedSnapshots=JSON.parse((await command(process.execPath,['bundled-identifier-integration.mjs'],consumer.directory)).stdout);assert.deepEqual(minifiedSnapshots,snapshots);
    const worker=await workerProbe(consumer.directory);
    const document=await readFile(join(consumer.installed,'docs/api/IDENTIFIERS.md'),'utf8'),example=/```js\n([\s\S]*?)\n```/.exec(document)?.[1];assert.ok(example,'exact installed identifier documentation example');await writeFile(join(consumer.directory,'documented-identifiers.mjs'),example);const documented=await command(process.execPath,['documented-identifiers.mjs'],consumer.directory);
    return {kind:'raveldex-identifier-package-cost-v1',environment:{node:process.version,platform:process.platform,arch:process.arch},package:consumer.package,
      declarations:'Pass: installed readonly ES2022 public declarations with no DOM/Node ambient types and denied scanner deep paths',core,identifierOnly,combined,integration,startup,worker,snapshots,
      documentation:{status:'Pass',source:'docs/api/IDENTIFIERS.md',exampleSha256:digest(example),stdout:documented.stdout},
      correctness:{status:'Pass',authoredQueries:cases.length,fullPageComparisonsPerRun:packed.rows.length,unselectedPack:'Pass',bundledParity:'Pass',snapshotComparisonsPerRun:snapshots.comparisons,snapshotMismatchRefusalsPerRun:snapshots.mismatchRefusals},
      logicalState:{separateCorpusParticipantEntries:0,selectedFixtureOriginalTokenCount:16,selectedFixtureIndexedOccurrences:Object.values(frequencies).reduce((sum,terms)=>sum+terms.length,0),retainedRepresentation:'No identifier add-on corpus side index/cache. Explicit selection adds component terms/postings/statistics to the core; optional test source/position providers retain their declared representations.',basis:'Logical fixture cardinalities and actual import graphs; not heap/allocation-byte or physical-copy peaks'},packed};
  }finally{await rm(consumer.directory,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=await measurePackedIdentifiers();if(process.argv[2])await writeFile(resolve(process.argv[2]),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({correctness:report.correctness,packageBytes:report.package.tarballBytes,coreGzip:report.core.gzipBytes,coreTargetMet:report.core.targetMet,identifierOnlyGzip:report.identifierOnly.gzipBytes,combinedGzip:report.combined.gzipBytes,worker:report.worker}));
}
