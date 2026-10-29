/** Independent runtime probes for other agents' RX-A050 implementation.
 * This script intentionally imports neither identifiers oracle nor evaluation. */
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
const root=new URL('../../',import.meta.url),load=path=>import(new URL('dist/'+path,root));
const {createRaveldex}=await load('index.js');
const {getExecutionOwner}=await load('core/execution/engine.js');
const {captureConfiguration}=await load('core/contracts/schema.js');
const {createAnalysis}=await load('core/analyzer/selected.js');
const {createIdentifierAnalyzer,IDENTIFIER_ANALYZER}=await load('addons/identifiers/index.js');
const {createEnglishAnalyzer,ENGLISH_ANALYZER}=await load('integrations/languages/english/index.js');
const {createSourceProvider,createSourcePhrases}=await load('addons/phrases/index.js');
const {createPositionProvider}=await load('addons/positions/index.js');
const {createPositionPhrases}=await load('addons/positions/phrases.js');
const {createPhrases}=await load('addons/phrases/mixed.js');
const {createMatchEvidence}=await load('addons/evidence/index.js');
const {createSnapshots,createSnapshotRaveldex,currentNodeSnapshotEnvironment}=await load('adapters/snapshots/index.js');
const {createWorkerRaveldex}=await load('adapters/worker/index.js');
const {createWorkerSnapshots}=await load('adapters/worker/snapshots.js');
const rows=[];
async function probe(name,run){try{rows.push({name,status:'Pass',...(await run())});}catch(error){rows.push({name,status:'Fail',error:error.message,code:error.code,stack:error.stack});}}
const schema={text:{code:{}}},plain=value=>JSON.parse(JSON.stringify(value));
const phase=text=>({kind:'extension',capability:'phrases',version:1,payload:{text,fields:['code']}});
const ids=result=>result.hits.map(hit=>hit.id).sort();
const tagged=()=>createIdentifierAnalyzer();
const capped=(addon,units)=>({...addon,manifest:{...addon.manifest,limits:{...addon.manifest.limits,maxWorkUnits:units}}});
const configuration=(addons=[])=>({schema,analyzer:IDENTIFIER_ANALYZER,addons:[tagged(),...addons]});
const env=currentNodeSnapshotEnvironment(),qualification={profileId:'rx-a050-independent-runtime-review',scope:'exact-node-runtime',environment:env,evidence:['Independent current-runtime fixture only, no all-Unicode/browser qualification']};
const owner=engine=>getExecutionOwner(engine);
const withoutRevision=value=>{const result=plain(value);delete result.revision;if(result.extensions)for(const data of Object.values(result.extensions))delete data.revision;return result;};
function altered(encoded,mutate){const data=JSON.parse(encoded);mutate(data);let hash=2166136261;for(const unit of JSON.stringify(data.body).split('')){hash^=unit.charCodeAt(0);hash=Math.imul(hash,16777619)>>>0;}data.integrity.value=hash.toString(16).padStart(8,'0');return JSON.stringify(data);}
const byId=(directory,id)=>Object.values(directory.buckets).map(bucket=>bucket[id]).find(Boolean);

await probe('R1 reserved raw protocol fails at capture for custom ID and transform impersonation',async()=>{
 const native=tagged(),custom='my-identifiers-v1',raw={...native,manifest:{...native.manifest,provides:[{id:'analyzer:'+custom,contractVersion:1}]},analyzer:{...native.analyzer,id:custom}};
 for(const positions of [false,true])assert.throws(()=>createRaveldex({schema,analyzer:{id:custom,environmentProfile:'unqualified'},addons:[raw,...positions?[createPositionProvider({fields:['code']})]:[]]}),{code:'INCOMPATIBLE_CAPABILITY'});
 const fake={...native,analyzer:{kind:'single-token-transform',id:IDENTIFIER_ANALYZER.id,*transform(term){return term}}};
 assert.throws(()=>createRaveldex({schema,analyzer:IDENTIFIER_ANALYZER,addons:[fake]}),{code:'INCOMPATIBLE_CAPABILITY'});
 return{refusals:3,resolves:'R1'};
});
await probe('R2 raw token/step/provenance getters and symbol properties reject without execution or commit',async()=>{
 const good={term:'foobar',valueIndex:0,position:0,start:0,end:6,kind:'original'};let rejected=0;
 for(const mode of ['term','valueIndex','position','start','end','kind','original','step-work','step-token','nested-origin','symbol']){
  let reads=0;const token={...good},step={workUnits:1,token},origin={term:'foobar',start:0,end:6};
  if(mode.startsWith('step-'))Object.defineProperty(step,mode==='step-work'?'workUnits':'token',{enumerable:true,get(){reads++;return mode==='step-work'?1:token}});
  else if(mode==='nested-origin'){token.kind='component';token.term='foo';token.end=3;Object.defineProperty(origin,'term',{enumerable:true,get(){reads++;return'foobar'}});token.original=Object.freeze(origin);}
  else if(mode==='symbol')token[Symbol('hidden')]=true;
  else Object.defineProperty(token,mode,{enumerable:true,get(){reads++;return mode==='term'?'foobar':good[mode]}});
  Object.freeze(token);const native=tagged(),addon={...native,analyzer:{...native.analyzer,*analyze(){yield step}}};
  const engine=createRaveldex({schema,analyzer:IDENTIFIER_ANALYZER,addons:[addon]});const previous=owner(engine).root;
  try{await assert.rejects(engine.add({id:'a',text:{code:'fooBar'}}),{code:'INCOMPATIBLE_CAPABILITY'});assert.equal(reads,0);assert.equal(owner(engine).root,previous);rejected++;}finally{await engine.dispose();}
 }
 return{rejected,getterReads:0,resolves:'R2'};
});
await probe('raw output is owned across later module suspension',async()=>{
 const native=tagged(),token={term:'foobar',valueIndex:0,position:0,start:0,end:6,kind:'original'};
 const addon={...native,analyzer:{...native.analyzer,*analyze(){yield{workUnits:1,token}}}};
 const c=captureConfiguration({schema,analyzer:IDENTIFIER_ANALYZER,addons:[addon]}),cursor=createAnalysis(c)('fooBar',0,c.limits);let actual;
 for(;;){const step=cursor.next();if(step.done)break;if(step.value.workUnits===1&&Object.hasOwn(step.value,'token')){actual=step.value.token;break;}}
 assert.ok(actual);token.term='forged';token.start=1;assert.equal(actual.term,'foobar');assert.equal(actual.start,0);assert.ok(Object.isFrozen(actual));assert.notEqual(actual,token);cursor.return();
 return{ownedTerm:actual.term,frozen:true};
});
await probe('ordinary components and original-only source/offset/mixed phrases keep complete literal membership',async()=>{
 const records=[{id:'one',text:{code:'fooBar next'}},{id:'two',text:{code:'foo bar next'}},{id:'three',text:{code:['foo','bar']}},{id:'four',text:{code:'fooBar fooBar'}}];
 const definitions=[['source',[createSourceProvider({fields:['code']}),createSourcePhrases({fields:['code']})]],['positions',[createPositionProvider({fields:['code']}),createPositionPhrases({fields:['code']})]],['offsets',[createPositionProvider({fields:['code'],offsets:['code']}),createPositionPhrases({fields:['code']})]],['mixed',[createSourceProvider({fields:['code']}),createPhrases({fields:{code:'source'}})]]];
 let comparisons=0;for(const [strategy,addons]of definitions){const engine=createRaveldex(configuration(addons));try{await engine.addMany(records);for(const [query,expected]of [['foo bar',['four','one','three','two']],['fooBar',['four','one']],[phase('foo bar'),['two']],[phase('fooBar next'),['one']],[phase('fooBar fooBar'),['four']],[phase('foo'),['three','two']],[phase('bar next'),['two']],[phase('fooBar bar'),[]]]){const result=await engine.search(query,{limit:100});assert.deepEqual(ids(result),expected,strategy+JSON.stringify(query));assert.equal(result.total,expected.length);comparisons++;}}finally{await engine.dispose();}}
 return{comparisons,strategies:definitions.map(([name])=>name),scope:'Hand-literal membership, no oracle import'};
});
await probe('component evidence exposes original UTF16 provenance and does not mark a sibling component',async()=>{
 const source='😀 caféParser_HTTP2 next';let reference;const results=[];
 for(const strategy of ['source','offsets']){
  const provider=strategy==='source'?createSourceProvider({fields:['code']}):createPositionProvider({fields:['code'],offsets:['code']});
  const engine=createRaveldex(configuration([provider,createMatchEvidence({fields:{code:strategy}})]));
  try{await engine.add({id:'a',text:{code:source}});const actual=await engine.search('parser',{extensions:{'match-evidence':{ids:['a'],fields:['code']}}});
   const ranges=plain(actual.extensions['match-evidence'].documents[0].ranges);
   assert.deepEqual(ranges,[{field:'code',valueIndex:0,position:0,start:7,end:13,term:'parser',kind:'component',original:{term:'caféparser_http2',start:3,end:19}}]);
   assert.equal(source.slice(ranges[0].start,ranges[0].end),'Parser');if(reference)assert.deepEqual(ranges,reference);else reference=ranges;results.push({strategy,ranges});
  }finally{await engine.dispose();}
 }
 return{results};
});
await probe('tagged source/native round trips bind exact analyzer and refuse malformed positions atomically',async()=>{
 const config=()=>configuration([createSourceProvider({fields:['code']}),createPositionProvider({fields:['code'],offsets:['code']}),createPositionPhrases({fields:['code']}),createMatchEvidence({fields:{code:'offsets'}})]);
 const donor=createSnapshotRaveldex(config(),{nativeQualification:qualification}),receiver=createSnapshotRaveldex(config(),{nativeQualification:qualification});let comparisons=0,refusals=0;
 try{
  await donor.addMany([{id:'a',text:{code:'fooBar next'}},{id:'b',text:{code:'aB'}}]);const native=await createSnapshots(donor).exportNative();assert.equal(JSON.parse(native).body.payload.participants.positions.kind,'raveldex-positions-v2');
  for(const method of ['exportSource','exportNative']){await createSnapshots(receiver).restore(await createSnapshots(donor)[method]());for(const query of ['a','aB','foo','fooBar',phase('foo bar'),phase('fooBar next')]){const options={extensions:{'match-evidence':{ids:['a','b'],fields:['code']}}};assert.deepEqual(withoutRevision(await receiver.search(query,options)),withoutRevision(await donor.search(query,options)));comparisons++;}}
  const previous=owner(receiver).root;
  for(const mutate of [e=>{e.body.payload.participants.positions.kind='raveldex-positions-v1'},e=>{byId(e.body.payload.participants.positions.records,'a').positions.code[0].terms.foo[0].kind='original'},e=>{byId(e.body.payload.participants.positions.records,'a').positions.code[0].terms.foo[0].end=9},e=>{e.body.header.analyzer.id='code-identifiers-v2'}]){
   await assert.rejects(createSnapshots(receiver).restore(altered(native,mutate)),error=>['INVALID_NATIVE_STATE','ANALYZER_MISMATCH'].includes(error.reason));assert.equal(owner(receiver).root,previous);refusals++;
  }
 }finally{await donor.dispose();await receiver.dispose();}
 return{comparisons,refusals,qualificationScope:'Exact current Node identity declared by this fixture, not cross-host evidence'};
});
await probe('source-free core and tagged position native round trips admit short originals with derived terms',async()=>{
 let comparisons=0;const results=[];
 for(const mode of ['core','positions','offsets']){
  const addons=mode==='core'?[]:[createPositionProvider({fields:['code'],...(mode==='offsets'?{offsets:['code']}: {})}),createPositionPhrases({fields:['code']})];
  const config=configuration(addons),donor=createSnapshotRaveldex(config,{nativeQualification:qualification}),receiver=createSnapshotRaveldex(config,{nativeQualification:qualification});
  try{await donor.addMany([{id:'short',text:{code:'aB'}},{id:'name',text:{code:'fooBar next'}}]);const encoded=await createSnapshots(donor).exportNative();
   assert.equal(owner(donor).root.counts.tokens,7);assert.equal(byId(owner(donor).root.documents,'short').textCodeUnits,2);
   await createSnapshots(receiver).restore(encoded);
   for(const query of ['a','b','aB','foo','fooBar',...mode==='core'?[]:[phase('foo bar'),phase('fooBar next')]]){assert.deepEqual(withoutRevision(await receiver.search(query)),withoutRevision(await donor.search(query)));comparisons++;}
   results.push({mode,containsSource:Object.keys(owner(receiver).root.participants).includes('source'),positionKind:owner(receiver).root.participants.positions?.kind??null});
  }finally{await donor.dispose();await receiver.dispose();}
 }
 return{comparisons,results,limitation:'Without source, native validation establishes structural tag/ordinal/frequency/span bounds, not authentic token provenance or original Unicode boundaries.'};
});
await probe('reentrant raw tokenizer cancellation precedes module overflow in mutation/query/native export and source/native restore',async()=>{
 let controller,armed=false,closed=0;const standard=tagged(),maximum=100000;
 const addon=capped({...standard,analyzer:{...standard.analyzer,*analyze(...args){try{if(armed){controller.abort();yield{workUnits:maximum+1};return;}yield* standard.analyzer.analyze(...args);}finally{closed++;}}}},maximum);
 const config={schema,analyzer:IDENTIFIER_ANALYZER,addons:[addon,createSourceProvider({fields:['code']})]};const rows=[];
 const donor=createSnapshotRaveldex(config,{nativeQualification:qualification});
 try{
  await donor.add({id:'a',text:{code:'fooBar'}});const source=await createSnapshots(donor).exportSource(),native=await createSnapshots(donor).exportNative();
  for(const operation of ['add','search','exportNative','restoreSource','restoreNative']){
   const engine=createSnapshotRaveldex(config,{nativeQualification:qualification});await engine.add({id:'old',text:{code:'oldState'}});const previous=owner(engine).root;controller=new AbortController();const before=closed;armed=true;
   try{const options={signal:controller.signal};const promise=operation==='add'?engine.add({id:'new',text:{code:'fooBar'}},options):operation==='search'?engine.search('foo',options):operation==='exportNative'?createSnapshots(engine).exportNative(options):createSnapshots(engine).restore(operation==='restoreSource'?source:native,options);
    await assert.rejects(promise,{code:'CANCELLED'});assert.equal(owner(engine).root,previous);assert.equal(closed-before,1);rows.push({operation,error:'CANCELLED',cursorClosed:true,revisionUnchanged:true});
   }finally{armed=false;await engine.dispose();}
  }
 }finally{armed=false;await donor.dispose();}
 return{rows};
});
await probe('one raw module budget spans two separately admitted records during source/native validation',async()=>{
 const standard=tagged(),configuration0=captureConfiguration(configuration()),cursor=createAnalysis(configuration0)('fooBar',0,configuration0.limits);let units=0;
 for(const step of cursor)units+=step.workUnits;
 const addon=capped(standard,units),config={schema,analyzer:IDENTIFIER_ANALYZER,addons:[addon,createSourceProvider({fields:['code']})]},donor=createSnapshotRaveldex(config,{nativeQualification:qualification}),receiver=createSnapshotRaveldex(config,{nativeQualification:qualification});
 const generous=createSnapshotRaveldex(configuration([createSourceProvider({fields:['code']})]),{nativeQualification:qualification});
 try{await donor.add({id:'a',text:{code:'fooBar'}});await donor.add({id:'b',text:{code:'fooBar'}});const previous=owner(receiver).root;
  await assert.rejects(createSnapshots(donor).exportSource(),{code:'WORK_LIMIT_EXCEEDED'});
  await assert.rejects(createSnapshots(donor).exportNative(),{code:'WORK_LIMIT_EXCEEDED'});
  await generous.addMany([{id:'a',text:{code:'fooBar'}},{id:'b',text:{code:'fooBar'}}]);
  const source=altered(await createSnapshots(generous).exportSource(),envelope=>{envelope.body.header.capabilities.find(row=>row.id==='identifier-analyzer').limits.maxWorkUnits=units;});
  await assert.rejects(createSnapshots(receiver).restore(source),{code:'WORK_LIMIT_EXCEEDED'});assert.equal(owner(receiver).root,previous);
  const native=altered(await createSnapshots(generous).exportNative(),envelope=>{envelope.body.header.capabilities.find(row=>row.id==='identifier-analyzer').limits.maxWorkUnits=units;});
  await assert.rejects(createSnapshots(receiver).restore(native),{code:'WORK_LIMIT_EXCEEDED'});assert.equal(owner(receiver).root,previous);
 }finally{await donor.dispose();await receiver.dispose();await generous.dispose();}
 return{singleAnalysisTotalWorkUnits:units,maxModuleWorkUnits:units,sharedSourceExport:'WORK_LIMIT_EXCEEDED',sharedSourceRestore:'WORK_LIMIT_EXCEEDED',sharedNativeExport:'WORK_LIMIT_EXCEEDED',sharedNativeRestore:'WORK_LIMIT_EXCEEDED',scope:'Restore probes independently change only matching receiver module budget/header checksum; retained content remains actual generous-donor output.'};
});
await probe('unselected basic and selected English preserve their distinct morphology/positions behavior',async()=>{
 const definitions=[['basic',{schema,addons:[tagged(),createPositionProvider({fields:['code'],offsets:['code']})]}],['english',{schema,analyzer:ENGLISH_ANALYZER,addons:[tagged(),createEnglishAnalyzer(),createPositionProvider({fields:['code'],offsets:['code']})]}]];
 const results=[];for(const [name,config]of definitions){const engine=createRaveldex(config);try{await engine.add({id:'a',text:{code:'running fooBar'}});assert.equal((await engine.search('foo')).total,0);assert.equal((await engine.search('run')).total,name==='english'?1:0);const state=owner(engine).root.participants.positions;assert.equal(state.kind,'raveldex-positions-v1');assert.equal(state.records.size,1);results.push({name,positions:state.kind,runMatches:(await engine.search('run')).total});}finally{await engine.dispose();}}
 return{results};
});
await probe('actual Node worker clones identifier evidence and binds matching source-restore identity',async()=>{
 const workerSource=`import {parentPort,workerData} from 'node:worker_threads';
 const root=workerData.root,load=path=>import(new URL('dist/'+path,root));
 const {serveSnapshotRaveldexWorker}=await load('adapters/worker/snapshots-host.js');
 const {createIdentifierAnalyzer}=await load('addons/identifiers/index.js');
 const {createSourceProvider}=await load('addons/phrases/index.js');
 const {createPositionProvider}=await load('addons/positions/index.js');
 const {createPositionPhrases}=await load('addons/positions/phrases.js');
 const {createMatchEvidence}=await load('addons/evidence/index.js');
 let addon=createIdentifierAnalyzer();if(workerData.mode==='identity')addon={...addon,manifest:{...addon.manifest,execution:{...addon.manifest.execution,workerRegistration:addon.manifest.execution.workerRegistration+':foreign'}}};
 const addons=[...(workerData.mode==='missing'?[]:[addon]),createSourceProvider({fields:['code']}),createPositionProvider({fields:['code'],offsets:['code']}),createPositionPhrases({fields:['code']}),createMatchEvidence({fields:{code:'offsets'}})];
 const listeners=new Map();serveSnapshotRaveldexWorker({postMessage:value=>parentPort.postMessage(value),addEventListener(type,listener){const wrapped=value=>listener(type==='message'?{data:value}:value);let entries=listeners.get(type);if(!entries){entries=new Map();listeners.set(type,entries)}entries.set(listener,wrapped);parentPort.on(type,wrapped)},removeEventListener(type,listener){const wrapped=listeners.get(type)?.get(listener);if(wrapped)parentPort.off(type,wrapped);listeners.get(type)?.delete(listener)}},{addons});`;
 const spawn=mode=>new Worker(new URL('data:text/javascript,'+encodeURIComponent(workerSource)),{workerData:{root:root.href,mode}});
 const endpoint=worker=>{const listeners=new Map();return{postMessage:value=>worker.postMessage(value),addEventListener(type,listener){const wrapped=value=>listener(type==='message'?{data:value}:value);let entries=listeners.get(type);if(!entries){entries=new Map();listeners.set(type,entries)}entries.set(listener,wrapped);worker.on(type,wrapped)},removeEventListener(type,listener){const wrapped=listeners.get(type)?.get(listener);if(wrapped)worker.off(type,wrapped);listeners.get(type)?.delete(listener)},terminate(){void worker.terminate()}}};
 const config=configuration([createSourceProvider({fields:['code']}),createPositionProvider({fields:['code'],offsets:['code']}),createPositionPhrases({fields:['code']}),createMatchEvidence({fields:{code:'offsets'}})]);
 const worker=spawn('matching');let remote,comparisons=0;const refusals=[];
 try{
  remote=await createWorkerRaveldex({worker:endpoint(worker),configuration:config,ownership:'owned',sameHost:true,responseTimeoutMs:10000});
  await remote.addMany([{id:'short',text:{code:'aB'}},{id:'path',text:{code:'src/FooBar.ts next'}},{id:'plain',text:{code:'foo bar'}}]);
  for(const [query,expected]of [['a',['short']],['aB',['short']],['foo',['path','plain']],['fooBar',['path']],[phase('foo bar'),['plain']],[phase('fooBar ts next'),['path']]]){assert.deepEqual(ids(await remote.search(query,{limit:100})),expected);comparisons++;}
  const options={extensions:{'match-evidence':{ids:['path'],fields:['code']}}},ranges=(await remote.search('bar',options)).extensions['match-evidence'].documents[0].ranges;
  assert.deepEqual(plain(ranges),[{field:'code',valueIndex:0,position:1,start:7,end:10,term:'bar',kind:'component',original:{term:'foobar',start:4,end:10}}]);comparisons++;
  const snapshots=createWorkerSnapshots(remote),encoded=await snapshots.exportSource();await remote.clear();const pending=snapshots.restore(encoded),restored=await pending,receipt=await snapshots.reconcile(pending.operationId);
  assert.equal(restored.receivingAnalyzer.id,'code-identifiers-v1');assert.equal(receipt.status,'committed');assert.equal(receipt.result.receivingAnalyzer.id,'code-identifiers-v1');assert.deepEqual(ids(await remote.search('a b')),['short']);comparisons++;
  for(const mode of ['missing','identity']){const changed=spawn(mode);try{await assert.rejects(createWorkerRaveldex({worker:endpoint(changed),configuration:config,ownership:'owned',sameHost:true,responseTimeoutMs:10000}),error=>{refusals.push({mode,code:error.code});return['INCOMPATIBLE_WORKER','MISSING_CAPABILITY'].includes(error.code)});}finally{await changed.terminate();}}
  return{comparisons,refusals,sourceRestoreReceipt:plain(receipt),scope:'Actual Node worker_threads with structural endpoint; direct built runtime, not an installed package/browser qualification.'};
 }finally{if(remote)await remote.destroy();await worker.terminate();}
});

const reviewed=['src/core/analyzer/basic.ts','src/core/analyzer/selected.ts','src/core/analyzer/identifier.ts','src/core/capabilities/registration.ts','src/core/capabilities/types.ts','src/core/contracts/query.ts','src/addons/identifiers/index.ts','src/addons/identifiers/scanner.ts','src/addons/phrases/verifier.ts','src/addons/positions/store.ts','src/addons/positions/tagged.ts','src/addons/positions/verifier.ts','src/addons/evidence/builder.ts','src/addons/evidence/occurrences.ts','src/addons/evidence/providers.ts','src/addons/evidence/types.ts','src/addons/snippets/snippets.ts','src/adapters/snapshots/native.ts','src/adapters/worker/snapshot-channel.ts','src/adapters/worker/client.ts','src/adapters/worker/host.ts','src/adapters/worker/snapshots.ts','src/adapters/worker/snapshots-host.ts'];
const bindings=[];for(const path of reviewed){try{const bytes=await readFile(new URL(path,root)),info=await stat(new URL(path,root));bindings.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),modifiedAt:info.mtime.toISOString()});const built=path.replace(/^src\//,'dist/').replace(/\.ts$/,'.js');if(path.endsWith('.ts')){const bytes=await readFile(new URL(built,root)),info=await stat(new URL(built,root));bindings.push({path:built,sha256:createHash('sha256').update(bytes).digest('hex'),modifiedAt:info.mtime.toISOString()});}}catch(error){bindings.push({path,error:error.code});}}
const failures=rows.filter(row=>row.status==='Fail');const report={kind:'raveldex-rx-a050-independent-runtime-probes-v1',recordedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch},bindings,rows,passCount:rows.length-failures.length,failCount:failures.length,scope:'Independent other-authored runtime inspection and direct probes; excludes independent review of this agent\'s own evaluation/oracle/labels. No build, Git mutation, network, browser/AT or peak-memory claim.'};
await writeFile(new URL('RX-A050-runtime-review-probes.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passCount:report.passCount,failCount:report.failCount,rows}));if(failures.length)process.exitCode=1;
