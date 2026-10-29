import assert from 'node:assert/strict';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {build,version} from 'esbuild';
import {prepareConsumer,bundleConsumer,command,digest,checkStartup,REPO_ROOT} from '../../scripts/lib/packed-consumer.mjs';

const schema={text:{title:{boost:2},body:{}}};
const records=[
  {id:'a',text:{title:'red apple red. fooBar/alpha'}},
  {id:'b',text:{title:'red blue',body:'red'}},
  {id:'c',text:{title:['red','blue'],body:'split'}},
  {id:'d',text:{title:'red—blue'}},
  {id:'e',text:{title:'😀 ababa café'}},
  {id:'f',text:{title:'cafe\u0301 ﬃ Ａpi'}},
  {id:'g',text:{title:'WORK_LIMIT_EXCEEDED'}},
  {id:'h',text:{title:'__proto__'}},
  {id:'i',text:{title:'unrelated'}},
  {id:'j',text:{title:'redblue'}},
];
// Independently authored exhaustive title frequencies under basic-v1. Literal
// needles never use these tokens; only mixed lexical-score expectations do.
const frequencies={a:['red','apple','red','foobar','alpha'],b:['red','blue'],c:['red','blue'],d:['red','blue'],e:['ababa','café'],f:['café','ffi','api'],g:['work','limit','exceeded'],h:['proto'],i:['unrelated'],j:['redblue']};
const literal=(text,fields)=>({kind:'extension',capability:'literal',version:1,payload:{text,...(fields?{fields}:{})}});
const lexical=text=>({kind:'text',text,fields:['title']});
const rawCases=[
  ['red',['a','b','c','d','j']],['edb',['j']],['red blue',['b']],['red—blue',['d']],
  ['/al',['a']],['_',['g','h']],['WORK_LIMIT',['g']],['work_limit',[]],['aba',['e']],
  ['😀',['e']],['café',['e']],['cafe\u0301',['f']],['ffi',[]],['Api',[]],['proto',['h']],
  ['redblue',['j']],['split',['c']],
].map(([needle,ids])=>({query:literal(needle),ids,groups:[],raw:true}));
const cases=[...rawCases,
  {query:literal('split',['title']),ids:[],groups:[],raw:true},
  {query:{kind:'and',children:[lexical('red'),literal('fooBar/')]},ids:['a'],groups:[['red']]},
  {query:{kind:'or',children:[lexical('red'),literal('proto')]},ids:['a','b','c','d','h'],groups:[['red']]},
  {query:{kind:'not',child:literal('red')},ids:['e','f','g','h','i'],groups:[]},
  {query:{kind:'and',children:[literal('red'),{kind:'not',child:literal('red blue')}]},ids:['a','c','d','j'],groups:[]},
  {query:{kind:'or',children:[literal('redblue'),literal('WORK_LIMIT')]},ids:['g','j'],groups:[]},
  {query:{kind:'and',children:[lexical('red'),{kind:'not',child:literal('fooBar')}]},ids:['b','c','d'],groups:[['red']]},
  {query:{kind:'and',children:[literal('missing'),lexical('red')]},ids:[],groups:[['red']]},
];
const fixture={schema,records,frequencies,cases};
const rootImport="import {createRaveldex,RaveldexError} from '@vmitsaras/raveldex';";
const literalImport="import {createLiteral,LITERAL_POLICY} from '@vmitsaras/raveldex/addons/literal';";
const sourceImport="import {createSourceProvider} from '@vmitsaras/raveldex/addons/phrases/source';";
const integrationImports=`
  ${rootImport}
  ${literalImport}
  ${sourceImport}
  import {createSnapshots,createSnapshotRaveldex,currentNodeSnapshotEnvironment,SnapshotAdapterError} from '@vmitsaras/raveldex/adapters/snapshots';
  import {createEnglishAnalyzer,ENGLISH_ANALYZER} from '@vmitsaras/raveldex/integrations/languages/english';
  import {createIdentifierAnalyzer,IDENTIFIER_ANALYZER} from '@vmitsaras/raveldex/addons/identifiers';
`;

async function graph(directory,name,entry){
  await writeFile(join(directory,`${name}.mjs`),entry);
  const settings={bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,treeShaking:true,legalComments:'none',charset:'ascii',sourcemap:false,metafile:true,write:false};
  const result=await build({...settings,absWorkingDir:directory,entryPoints:[`${name}.mjs`],outfile:`${name}-bundle.mjs`,logLevel:'silent'});
  assert.equal(result.outputFiles.length,1);const bytes=result.outputFiles[0].contents,gzip={level:9,windowBits:15,memLevel:8,strategy:0},compressed=gzipSync(bytes,gzip);
  const inputs=Object.entries(result.metafile.inputs).map(([path,input])=>({path,bytes:input.bytes,imports:input.imports}));
  for(const input of inputs){assert.ok(input.path===`${name}.mjs`||input.path.startsWith('node_modules/@vmitsaras/raveldex/dist/'));assert.ok(input.imports.every(item=>!item.external));}
  assert.deepEqual(Object.values(result.metafile.outputs)[0].imports,[]);await writeFile(join(directory,`${name}-bundle.mjs`),bytes);
  return{esbuild:version,settings,gzip:{...gzip,mtime:0},minifiedBytes:bytes.length,gzipBytes:compressed.length,sha256:digest(bytes),gzipSha256:digest(compressed),inputs,metafile:result.metafile};
}
async function freshImport(directory,specifier,exports){
  const source=`import assert from 'node:assert/strict';const reads=[];for(const name of ['process','window','document','navigator','fetch','XMLHttpRequest','WebSocket','Worker','SharedWorker','indexedDB','localStorage','sessionStorage','performance','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','queueMicrotask'])Object.defineProperty(globalThis,name,{configurable:true,get(){reads.push(name);throw Error(name)}});const module=await import(${JSON.stringify(specifier)});assert.deepEqual(Object.keys(module).sort(),${JSON.stringify([...exports].sort())});if(module.createLiteral)assert.equal(module.createLiteral({fields:['title']}).manifest.indexEffect,'none');assert.deepEqual(reads,[]);console.log(JSON.stringify({specifier:${JSON.stringify(specifier)},reads,exports:Object.keys(module).sort()}));`;
  return JSON.parse((await command(process.execPath,['--input-type=module','--eval',source],directory)).stdout);
}

const runner=`
  import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
  ${rootImport}
  ${literalImport}
  ${sourceImport}
  const fixture=JSON.parse(await readFile('literal-fixture.json','utf8')),fields=['title','body'];
  assert.equal(LITERAL_POLICY,'raw-substring-v1');
  assert.throws(()=>createRaveldex({schema:fixture.schema,addons:[createLiteral({fields})]}),error=>error instanceof RaveldexError&&error.code==='MISSING_CAPABILITY');
  const providers=()=>[createSourceProvider({fields})],selected=createRaveldex({schema:fixture.schema,addons:[...providers(),createLiteral({fields})]}),basic=createRaveldex({schema:fixture.schema,addons:providers()});
  const ids=Object.keys(fixture.frequencies),N=ids.length,totalLength=Object.values(fixture.frequencies).reduce((sum,terms)=>sum+terms.length,0),average=totalLength/N;
  function score(id,term){const words=fixture.frequencies[id],tf=words.filter(word=>word===term).length;if(!tf)return 0;const df=ids.filter(other=>fixture.frequencies[other].includes(term)).length,idf=Math.log(1+(N-df+0.5)/(df+0.5)),normalizer=1.2*(0.25+0.75*words.length/average);return 2*idf*(tf*2.2)/(tf+normalizer);}
  function expected(entry){return entry.ids.map(id=>({id,score:entry.groups.reduce((sum,group)=>sum+Math.max(0,...group.map(term=>score(id,term))),0)})).sort((a,b)=>b.score-a.score||(a.id<b.id?-1:a.id>b.id?1:0));}
  const close=(actual,wanted)=>assert.ok(Math.abs(actual-wanted)<=Math.max(1e-12,Math.abs(wanted)*1e-12),actual+' vs '+wanted),rows=[];
  try{
    await selected.addMany(fixture.records);await basic.addMany(fixture.records);
    for(const entry of fixture.cases){const all=expected(entry);for(const page of [{limit:100},{offset:1,limit:2},{limit:0}]){const actual=await selected.search(entry.query,page),wanted=all.slice(page.offset??0,(page.offset??0)+(page.limit??100));assert.equal(actual.total,all.length);assert.equal(actual.completeness,'complete');assert.deepEqual(actual.hits.map(hit=>hit.id),wanted.map(hit=>hit.id));for(let i=0;i<wanted.length;i++)close(actual.hits[i].score,wanted[i].score);rows.push({query:entry.query,page,result:actual});}}
    const ordinary=['red','foo','fooBar','proto','cafe','café','fooBar/alpha','WORK_LIMIT_EXCEEDED',{kind:'group',fields:['title'],variants:[{text:'re',match:'prefix'}]},{kind:'not',child:{kind:'text',text:'red'}}];
    for(const query of ordinary)assert.deepEqual(await selected.search(query,{limit:100}),await basic.search(query,{limit:100}));
    const typed=[];for(const [query,code] of [[{kind:'extension',capability:'literal',version:1,payload:{text:''}},'INVALID_QUERY'],[{kind:'extension',capability:'literal',version:1,payload:{text:'bad\\ud800'}},'INVALID_QUERY'],[{kind:'extension',capability:'literal',version:1,payload:{text:'x'.repeat(2049)}},'LIMIT_EXCEEDED']])await assert.rejects(selected.search(query),error=>{assert.ok(error instanceof RaveldexError);assert.equal(error.code,code);typed.push(code);return true;});
    const literal=text=>({kind:'extension',capability:'literal',version:1,payload:{text}}),replaced=await selected.replace({id:'a',text:{title:'changed'}});assert.equal(replaced.revision,2);assert.deepEqual((await selected.search(literal('red'),{limit:100})).hits.map(hit=>hit.id),['b','c','d','j']);
    const removed=await selected.remove('b');assert.equal(removed.revision,3);assert.deepEqual((await selected.search(literal('red'),{limit:100})).hits.map(hit=>hit.id),['c','d','j']);
    const cleared=await selected.clear();assert.equal(cleared.revision,4);assert.equal((await selected.search(literal('red'))).total,0);await selected.dispose();await assert.rejects(selected.search(literal('red')),error=>{assert.ok(error instanceof RaveldexError);assert.equal(error.code,'DISPOSED');typed.push(error.code);return true;});
    console.log(JSON.stringify({rows,replaced,removed,cleared,typed,ordinaryQueries:ordinary.length,numerical:'Independent literal memberships and handwritten basic frequencies/native BM25; literal predicates contribute zero groups and no score'}));
  }finally{await selected.dispose();await basic.dispose();}
`;

const integrationRunner=`
  import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
  ${integrationImports}
  const fixture=JSON.parse(await readFile('literal-fixture.json','utf8')),fields=['title','body'];
  const qualification={profileId:'rx-a060-packed-local-node-v1',scope:'exact-node-runtime',environment:currentNodeSnapshotEnvironment(),evidence:['test/measurements/literal-package.mjs: finite same-host raw literal source/native round trips; no all-Unicode or cross-host qualification']};
  const literal=(text,selected)=>({kind:'extension',capability:'literal',version:1,payload:{text,...(selected?{fields:selected}:{})}}),evidence={extensions:{literal:{ids:['a','b','c','d','e','f','g','h','i','j']}}};
  // Keep both optional analyzers installed in donor and every receiver so the
  // selected-analyzer refusal changes only its descriptor, not capabilities.
  function addons(mode){let addon=createLiteral({fields});if(mode==='version')addon={...addon,manifest:{...addon.manifest,version:'0.1.1'}};return[createSourceProvider({fields}),addon,createEnglishAnalyzer(),createIdentifierAnalyzer()];}
  function normalize(value){if(Array.isArray(value))return value.map(normalize);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='revision'?0:normalize(item)]));return value;}
  const requests=[...fixture.cases.map(entry=>[entry.query,undefined]),[literal('aba'),evidence],[literal('😀'),evidence],[literal('cafe'),evidence],[{kind:'and',children:[literal('red'),{kind:'not',child:literal('red blue')}]},evidence]];
  const donor=createSnapshotRaveldex({schema:fixture.schema,addons:addons()},{nativeQualification:qualification}),receiver=createSnapshotRaveldex({schema:fixture.schema,addons:addons()},{nativeQualification:qualification});const rows=[],mismatchRows=[];let comparisons=0,mismatchRefusals=0,analyzerComparisons=0;
  try{
    await donor.addMany(fixture.records);const before=[];for(const [query,options] of requests)before.push(normalize(await donor.search(query,options)));
    const overlap=before.at(-4).extensions.literal,overlapDoc=overlap.documents.find(doc=>doc.id==='e');assert.equal(overlap.kind,'raveldex-literal-evidence-v1');assert.equal(overlap.complete,true);assert.equal(overlap.scope,'successful-positive-literal-occurrences');assert.deepEqual(overlapDoc.ranges.map(({field,valueIndex,start,end})=>({field,valueIndex,start,end})),[{field:'title',valueIndex:0,start:3,end:6},{field:'title',valueIndex:0,start:5,end:8}]);assert.deepEqual(overlapDoc.ranges.map(range=>range.leaf),['query','query']);assert.deepEqual(overlap.leaves,[{path:'query',text:'aba',fields:[...fields].sort()}]);
    assert.deepEqual(before.at(-3).extensions.literal.documents.find(doc=>doc.id==='e').ranges.map(({start,end})=>[start,end]),[[0,2]]);
    assert.deepEqual(before.at(-2).extensions.literal.documents.find(doc=>doc.id==='f').ranges.map(({start,end})=>[start,end]),[[0,4]],'Exact raw cafe range can end before a combining mark; no grapheme-normalization claim');
    const branch=before.at(-1).extensions.literal;assert.deepEqual(branch.documents.find(doc=>doc.id==='b').ranges,[]);assert.deepEqual(branch.documents.find(doc=>doc.id==='a').ranges.map(range=>range.leaf),['query.children[0]','query.children[0]']);assert.equal(branch.leaves.length,2,'Leaf descriptors include negative/failed branches while ranges use only successful positive paths');
    for(const format of ['Source','Native']){const encoded=await createSnapshots(donor)['export'+format](),receipt=await createSnapshots(receiver).restore(encoded),after=[];assert.equal(receipt.receivingAnalyzer.id,'basic-v1');assert.equal(receipt.receivingAnalyzer.environmentProfile,qualification.profileId);assert.equal(receipt.reindexed,format==='Source');for(const [query,options] of requests){after.push(normalize(await receiver.search(query,options)));comparisons++;}assert.deepEqual(after,before);
      for(const mode of ['version','english']){const selectedAddons=addons(mode);if(mode==='english')assert.deepEqual(selectedAddons.map(addon=>addon.manifest),addons().map(addon=>addon.manifest),'Analyzer-only refusal keeps all capability manifests identical');const config={schema:fixture.schema,addons:selectedAddons,...(mode==='english'?{analyzer:ENGLISH_ANALYZER}:{})},changed=createSnapshotRaveldex(config,{nativeQualification:qualification});try{await assert.rejects(createSnapshots(changed).restore(encoded),error=>{assert.ok(error instanceof SnapshotAdapterError);assert.equal(error.reason,mode==='version'?'CAPABILITY_MISMATCH':'ANALYZER_MISMATCH');mismatchRows.push({format,change:mode==='version'?'literal version only':'selected analyzer only, identical manifests',reason:error.reason});return true;});mismatchRefusals++;}finally{await changed.dispose();}}
      rows.push({format,receipt,results:after,encodedBytes:new TextEncoder().encode(encoded).length});await receiver.replace({id:'a',text:{title:'changed'}});assert.deepEqual((await receiver.search(literal('red'),{limit:100})).hits.map(hit=>hit.id),['b','c','d','j']);}
    for(const mode of ['english','identifiers']){const selected=createRaveldex({schema:fixture.schema,analyzer:mode==='english'?ENGLISH_ANALYZER:IDENTIFIER_ANALYZER,addons:addons(mode)});try{await selected.addMany(fixture.records);for(let i=0;i<fixture.cases.length;i++){if(!fixture.cases[i].raw)continue;assert.deepEqual(normalize(await selected.search(fixture.cases[i].query,{limit:100})),normalize(await donor.search(fixture.cases[i].query,{limit:100})));analyzerComparisons++;}assert.deepEqual(normalize(await selected.search(literal('aba'),evidence)),before.at(-4));analyzerComparisons++;}finally{await selected.dispose();}}
    console.log(JSON.stringify({status:'Pass',comparisons,mismatchRefusals,mismatchRows,analyzerComparisons,rows,qualificationScope:'Finite local exact-Node source/native raw literal snapshots and basic/English/identifier eligibility; no all-Unicode or cross-host qualification'}));
  }finally{await donor.dispose();await receiver.dispose();}
`;

async function workerProbe(directory){
  const addonSource=`${literalImport}\n${sourceImport}\nfunction addons(mode){let addon=createLiteral({fields:['title','body']});if(mode==='version')addon={...addon,manifest:{...addon.manifest,version:'0.1.1'}};if(mode==='policy')addon={...addon,manifest:{...addon.manifest,execution:{...addon.manifest.execution,workerRegistration:addon.manifest.execution.workerRegistration+':foreign-raw-policy'}}};return[createSourceProvider({fields:['title','body']}),...(mode==='missing'?[]:[addon])];}`;
  await writeFile(join(directory,'literal-worker.mjs'),`import {parentPort,workerData} from 'node:worker_threads';import {serveSnapshotRaveldexWorker} from '@vmitsaras/raveldex/adapters/worker/snapshots/host';${addonSource}\nconst listeners=new Map();serveSnapshotRaveldexWorker({postMessage:message=>parentPort.postMessage(message),addEventListener(type,listener){let entries=listeners.get(type);if(!entries){entries=new Map();listeners.set(type,entries)}const wrapped=value=>listener(type==='message'?{data:value}:value);entries.set(listener,wrapped);parentPort.on(type,wrapped)},removeEventListener(type,listener){const entries=listeners.get(type),wrapped=entries?.get(listener);if(wrapped)parentPort.off(type,wrapped);entries?.delete(listener)}},{addons:addons(workerData.mode)});`);
  await writeFile(join(directory,'literal-worker-probe.mjs'),`
    import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {Worker} from 'node:worker_threads';${rootImport}
    import {createWorkerRaveldex} from '@vmitsaras/raveldex/adapters/worker';import {createWorkerSnapshots} from '@vmitsaras/raveldex/adapters/worker/snapshots';${addonSource}
    const fixture=JSON.parse(await readFile('literal-fixture.json','utf8')),config={schema:fixture.schema,addons:addons()},literal=text=>({kind:'extension',capability:'literal',version:1,payload:{text}});
    function endpoint(worker,tamper){const listeners=new Map();return{postMessage:message=>worker.postMessage(message),addEventListener(type,listener){let entries=listeners.get(type);if(!entries){entries=new Map();listeners.set(type,entries)}const wrapped=value=>{if(type==='message'&&tamper?.mode==='restore'&&value.operation==='snapshotRestore'&&value.kind==='result')value={...value,value:{...value.value,receivingAnalyzer:{id:'foreign-v1',environmentProfile:'unqualified'}}};if(type==='message'&&tamper?.mode==='receipt'&&value.operation==='snapshotReconcile'&&value.value?.status==='committed')value={...value,value:{...value.value,result:{...value.value.result,receivingAnalyzer:{id:'foreign-v1',environmentProfile:'unqualified'}}}};listener(type==='message'?{data:value}:value)};entries.set(listener,wrapped);worker.on(type,wrapped)},removeEventListener(type,listener){const entries=listeners.get(type),wrapped=entries?.get(listener);if(wrapped)worker.off(type,wrapped);entries?.delete(listener)},terminate(){void worker.terminate()}}}
    const wire=value=>JSON.parse(JSON.stringify(value)),compare=(actual,expected)=>assert.deepEqual(wire(actual),wire(expected)),direct=createRaveldex(config),worker=new Worker(new URL('./literal-worker.mjs',import.meta.url),{workerData:{mode:'valid'}}),tamper={};let remote,comparisons=0,restoreReceipt,foreignAnalyzerReceipt,foreignAnalyzerRestore;const mismatchRefusals=[];
    try{remote=await createWorkerRaveldex({worker:endpoint(worker,tamper),configuration:config,ownership:'owned',sameHost:true,responseTimeoutMs:10000});await remote.addMany(fixture.records);await direct.addMany(fixture.records);
      const requests=[...fixture.cases.map(entry=>[entry.query,undefined]),[literal('aba'),{extensions:{literal:{ids:['a','b','e','f','h']}}}],[literal('😀'),{extensions:{literal:{ids:['e']}}}]];for(const [query,options] of requests){compare(await remote.search(query,options),await direct.search(query,options));comparisons++;}
      for(const [method,input] of [['replace',{id:'a',text:{title:'changed'}}],['remove','b']]){await remote[method](input);await direct[method](input);compare(await remote.search(literal('red')),await direct.search(literal('red')));comparisons++;}
      const snapshots=createWorkerSnapshots(remote),encoded=await snapshots.exportSource(),before=await remote.search(literal('aba'));await remote.clear();const restoring=snapshots.restore(encoded),restored=await restoring;assert.deepEqual(wire(restored.receivingAnalyzer),{id:'basic-v1',environmentProfile:'unqualified'});restoreReceipt=await snapshots.reconcile(restoring.operationId);assert.equal(restoreReceipt.status,'committed');assert.deepEqual(wire(restoreReceipt.result.receivingAnalyzer),wire(restored.receivingAnalyzer));const after=await remote.search(literal('aba'));assert.deepEqual(after.hits,before.hits);comparisons++;
      for(const mode of ['missing','version','policy']){const changed=new Worker(new URL('./literal-worker.mjs',import.meta.url),{workerData:{mode}});try{await assert.rejects(createWorkerRaveldex({worker:endpoint(changed),configuration:config,ownership:'owned',sameHost:true,responseTimeoutMs:10000}),error=>{assert.ok(['INCOMPATIBLE_WORKER','MISSING_CAPABILITY'].includes(error.code));mismatchRefusals.push({mode,code:error.code});return true;});}finally{await changed.terminate();}}
      tamper.mode='receipt';await assert.rejects(snapshots.reconcile(restoring.operationId),error=>{assert.equal(error.code,'INVALID_TRANSPORT');foreignAnalyzerReceipt=error.code;return true;});
      const rogue=new Worker(new URL('./literal-worker.mjs',import.meta.url),{workerData:{mode:'valid'}});let foreign;try{foreign=await createWorkerRaveldex({worker:endpoint(rogue,{mode:'restore'}),configuration:config,ownership:'owned',sameHost:true,responseTimeoutMs:10000});await assert.rejects(createWorkerSnapshots(foreign).restore(encoded),error=>{assert.equal(error.code,'OUTCOME_UNKNOWN');foreignAnalyzerRestore=error.code;return true;});}finally{if(foreign)await foreign.destroy();await rogue.terminate();}
      console.log(JSON.stringify({status:'Pass',transport:'Actual Node worker_threads with structural browser endpoint',comparisons,mismatchRefusals,restoreReceipt,foreignAnalyzerReceipt,foreignAnalyzerRestore,unknownOutcome:'Foreign receiving-analyzer response rejected; no rollback inference',scope:'Finite same-host Node protocol/clone/source-restore observations, not browser or cross-host native qualification'}));
    }finally{if(remote)await remote.destroy();await worker.terminate();await direct.dispose();}
  `);
  return JSON.parse((await command(process.execPath,['literal-worker-probe.mjs'],directory)).stdout);
}

export async function measurePackedLiteral(){
  const consumer=await prepareConsumer({schema,records},[]);
  try{
    await writeFile(join(consumer.directory,'literal-fixture.json'),JSON.stringify(fixture));
    await writeFile(join(consumer.directory,'literal-types.ts'),`
      import {createRaveldex,type AddonRegistration,type Query} from '@vmitsaras/raveldex';
      import {createLiteral,LITERAL_POLICY,type LiteralOptions,type LiteralPayload,type LiteralEvidenceRequest,type LiteralEvidenceData,type LiteralRange,type LiteralLeaf} from '@vmitsaras/raveldex/addons/literal';
      import {createSourceProvider} from '@vmitsaras/raveldex/addons/phrases/source';
      const options:LiteralOptions={fields:['title']},addon:AddonRegistration=createLiteral(options),payload:LiteralPayload={text:'_bar/'};
      const query:Query={kind:'extension',capability:'literal',version:1,payload},request:LiteralEvidenceRequest={ids:['a']};
      void createRaveldex({schema:{text:{title:{}}},addons:[createSourceProvider({fields:['title']}),addon]}).search(query,{extensions:{literal:request}});
      const policy:'raw-substring-v1'=LITERAL_POLICY;void policy;
      declare const range:LiteralRange,leaf:LiteralLeaf,data:LiteralEvidenceData;
      // @ts-expect-error Original ranges remain readonly.
      range.start=0;
      // @ts-expect-error Source selections remain readonly.
      options.fields.push('body');
      // @ts-expect-error Captured literal text remains readonly.
      payload.text='changed';
      // @ts-expect-error Factual result leaves remain readonly.
      leaf.text='changed';
      // @ts-expect-error Evidence document arrays remain readonly.
      data.documents.push({id:'x',eligibility:'absent',ranges:[]});
      // @ts-expect-error No implicit normalization/case-insensitive option.
      createLiteral({fields:['title'],caseInsensitive:true});
      // @ts-expect-error Private scanner is not a supported deep import.
      import * as privateScanner from '@vmitsaras/raveldex/addons/literal/scanner';
    `);
    const types=JSON.parse(await readFile(join(consumer.directory,'tsconfig.json'),'utf8'));types.include=['literal-types.ts'];await writeFile(join(consumer.directory,'literal-tsconfig.json'),JSON.stringify(types));await command(join(REPO_ROOT,'node_modules/.bin/tsc'),['-p',join(consumer.directory,'literal-tsconfig.json')],consumer.directory);
    const core=await bundleConsumer(consumer.directory),literalOnly=await graph(consumer.directory,'literal-only',`export {createLiteral,LITERAL_POLICY} from '@vmitsaras/raveldex/addons/literal';\n`),combined=await graph(consumer.directory,'literal-combined',`export {createRaveldex,RaveldexError,ERROR_CODES} from '@vmitsaras/raveldex';export {createLiteral,LITERAL_POLICY} from '@vmitsaras/raveldex/addons/literal';export {createSourceProvider} from '@vmitsaras/raveldex/addons/phrases/source';\n`);
    assert.ok(core.inputs.every(({path})=>!path.includes('/addons/literal/')));assert.ok(literalOnly.inputs.some(({path})=>path.includes('/addons/literal/')));assert.ok(literalOnly.inputs.every(({path})=>!path.includes('/execution/engine.js')));
    const startup=[await checkStartup(consumer.directory,'@vmitsaras/raveldex'),await checkStartup(consumer.directory,'./core-bundle.mjs'),await freshImport(consumer.directory,'@vmitsaras/raveldex/addons/literal',['createLiteral','LITERAL_POLICY']),await freshImport(consumer.directory,'./literal-only-bundle.mjs',['createLiteral','LITERAL_POLICY']),await freshImport(consumer.directory,'./literal-combined-bundle.mjs',['ERROR_CODES','RaveldexError','createRaveldex','createLiteral','LITERAL_POLICY','createSourceProvider'])];
    await command(process.execPath,['--input-type=module','--eval',`import assert from 'node:assert/strict';for(const name of ['@vmitsaras/raveldex/addons/literal/scanner','@vmitsaras/raveldex/dist/addons/literal/index.js'])await assert.rejects(import(name),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});`],consumer.directory);
    await writeFile(join(consumer.directory,'packed-literal.mjs'),runner);const packed=JSON.parse((await command(process.execPath,['packed-literal.mjs'],consumer.directory)).stdout);
    const bundledRunner=runner.replace(rootImport,'').replace(sourceImport,'').replace(literalImport,"import {createRaveldex,RaveldexError,createLiteral,LITERAL_POLICY,createSourceProvider} from './literal-combined-bundle.mjs';");await writeFile(join(consumer.directory,'bundled-literal.mjs'),bundledRunner);const bundled=JSON.parse((await command(process.execPath,['bundled-literal.mjs'],consumer.directory)).stdout);assert.deepEqual(bundled,packed);
    const integration=await graph(consumer.directory,'literal-integration',integrationImports.replaceAll('import {','export {'));await writeFile(join(consumer.directory,'packed-literal-integration.mjs'),integrationRunner);const snapshots=JSON.parse((await command(process.execPath,['packed-literal-integration.mjs'],consumer.directory)).stdout);
    const bundledIntegration=integrationRunner.replace(integrationImports,"import {createRaveldex,RaveldexError,createLiteral,LITERAL_POLICY,createSourceProvider,createSnapshots,createSnapshotRaveldex,currentNodeSnapshotEnvironment,SnapshotAdapterError,createEnglishAnalyzer,ENGLISH_ANALYZER,createIdentifierAnalyzer,IDENTIFIER_ANALYZER} from './literal-integration-bundle.mjs';");await writeFile(join(consumer.directory,'bundled-literal-integration.mjs'),bundledIntegration);const minifiedSnapshots=JSON.parse((await command(process.execPath,['bundled-literal-integration.mjs'],consumer.directory)).stdout);assert.deepEqual(minifiedSnapshots,snapshots);
    const worker=await workerProbe(consumer.directory),document=await readFile(join(consumer.installed,'docs/api/LITERAL.md'),'utf8'),example=/```js\n([\s\S]*?)\n```/.exec(document)?.[1];assert.ok(example,'Exact installed literal documentation example');await writeFile(join(consumer.directory,'documented-literal.mjs'),example);const documented=await command(process.execPath,['documented-literal.mjs'],consumer.directory);assert.equal(documented.stdout,'1 0\n','Installed example proves one raw infix hit with zero score');
    return{kind:'raveldex-literal-package-cost-v1',environment:{node:process.version,platform:process.platform,arch:process.arch},package:consumer.package,declarations:'Pass: readonly public ES2022 types, no DOM/Node ambient types and denied private paths',core,literalOnly,combined,integration,startup,worker,snapshots,documentation:{status:'Pass',source:'docs/api/LITERAL.md',exampleSha256:digest(example),stdout:documented.stdout},correctness:{status:'Pass',authoredQueries:cases.length,fullPageComparisonsPerRun:packed.rows.length,ordinaryQueries:packed.ordinaryQueries,bundledParity:'Pass',unrequestedCapability:'Pass',snapshotComparisonsPerRun:snapshots.comparisons,snapshotMismatchRefusalsPerRun:snapshots.mismatchRefusals},logicalState:{extraLiteralCorpusParticipantEntries:0,requiredRepresentation:'Explicitly selected existing source provider retains originals; literal adds no corpus side index, ngram accelerator or vocabulary cache.',basis:'Logical representation/import graphs and actual bounded queries, not heap/allocation-byte or physical-copy peaks'},packed};
  }finally{await rm(consumer.directory,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=await measurePackedLiteral();if(process.argv[2])await writeFile(resolve(process.argv[2]),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({correctness:report.correctness,packageBytes:report.package.tarballBytes,coreGzip:report.core.gzipBytes,coreTargetMet:report.core.targetMet,literalOnlyGzip:report.literalOnly.gzipBytes,combinedGzip:report.combined.gzipBytes,worker:report.worker}));
}
