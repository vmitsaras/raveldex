import assert from 'node:assert/strict';
import {readFile,writeFile,stat,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {createRaveldex} from '../../dist/index.js';
import {createLiteral} from '../../dist/addons/literal/index.js';
import {literalTable,literalMatches} from '../../dist/addons/literal/scanner.js';
import {createSourceProvider} from '../../dist/addons/phrases/source.js';
import {createPositionProvider} from '../../dist/addons/positions/index.js';
import {createEnglishAnalyzer,ENGLISH_ANALYZER} from '../../dist/integrations/languages/english/index.js';
import {createIdentifierAnalyzer,IDENTIFIER_ANALYZER} from '../../dist/addons/identifiers/index.js';
import {createSnapshots,createSnapshotRaveldex,currentNodeSnapshotEnvironment} from '../../dist/adapters/snapshots/index.js';
import {createWorkerRaveldex} from '../../dist/adapters/worker/index.js';
import {createWorkerSnapshots} from '../../dist/adapters/worker/snapshots.js';
import {setup as fake,drain} from '../../test/addons/typo/helpers.mjs';
import {executeSearch} from '../../dist/core/query/search.js';
import {DirectoryStage,emptyDirectory} from '../../dist/core/index/staging.js';
import {FakeSignal} from '../../test/fixtures/execution/host.mjs';

const root=new URL('../../',import.meta.url),schema={text:{title:{boost:2},body:{}}},fields=['body','title'];
const q=(text,selected)=>({kind:'extension',capability:'literal',version:1,payload:{text,...(selected?{fields:selected}:{})}}),plain=value=>JSON.parse(JSON.stringify(value));
const ids=result=>result.hits.map(hit=>hit.id),request=selected=>({limit:100,extensions:{literal:{ids:selected}}});
const rows=[];
async function probe(name,run){try{rows.push({name,status:'Pass',...await run()});}catch(error){rows.push({name,status:'Fail',code:error.code??null,message:error.message,stack:error.stack});}}
function configs(mode='basic',literal=createLiteral({fields})){return{schema,...(mode==='english'?{analyzer:ENGLISH_ANALYZER}:mode==='identifiers'?{analyzer:IDENTIFIER_ANALYZER}:{}),addons:[...(mode==='english'?[createEnglishAnalyzer()]:mode==='identifiers'?[createIdentifierAnalyzer()]:[]),createSourceProvider({fields}),literal]};}
const records=[{id:'a',text:{title:'x::abababa😀😀'}},{id:'b',text:{title:'X::ABA',body:['red','blue']}},{id:'c',text:{title:'red',body:'blue'}},{id:'d',text:{title:'red blue'}},{id:'empty',text:{}}];

await probe('Seeded private KMP cursor independently agrees with complete built-in raw overlapping search',async()=>{
 let state=0x0a060123,comparisons=0;const points=['a','b','A','_','/','😀','💡','é','e','\u0301','\u0000','İ','ß','ﬁ','\n'],witness=[];const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
 for(let count=0;count<2000;count++){const values=Array.from({length:next()%60},()=>points[next()%points.length]),value=values.join('');let text;
  if(count%3===0&&values.length){const from=next()%values.length;text=values.slice(from,Math.min(values.length,from+1+next()%8)).join('');}else text=Array.from({length:1+next()%10},()=>points[next()%points.length]).join('');
  const expected=[];let from=0;for(;;){const start=value.indexOf(text,from);if(start<0)break;expected.push({start,end:start+text.length});from=start+1;}
  const table=drain(literalTable(text)).value,actual=[];for(const step of literalMatches(value,text,table)){assert.ok(Number.isSafeInteger(step.workUnits)&&step.workUnits>0);if(step.match)actual.push(plain(step.match));}assert.deepEqual(actual,expected);comparisons++;if(witness.length<5)witness.push({source:value,needle:text,matches:actual});
 }
 return{comparisons,initialSeed:'0x0a060123',finalState:state,reference:'Built-in exact indexOf incrementing one source code unit after every match; no production or own evaluation oracle for expected truth.',witness};
});

await probe('Literal-only qualification has no token candidates and exact overlap/code-point ranges across all analyzers',async()=>{
 let comparisons=0;
 for(const mode of ['basic','english','identifiers']){const engine=createRaveldex(configs(mode));try{await engine.addMany(records);for(const[text,expected]of[['::',['a','b']],['ABA',['b']],['aba',['a']],['😀😀',['a']],['red blue',['d']],['redblue',[]],['x::ab',['a']]]){const result=await engine.search(q(text),request(['a','b','c','d','empty','absent']));assert.deepEqual(ids(result),expected);assert.equal(result.total,expected.length);assert.ok(result.hits.every(hit=>hit.score===0));comparisons++;}
 const overlap=await engine.search(q('aba'),request(['a']));assert.deepEqual(plain(overlap.extensions.literal.documents[0].ranges),[3,5,7].map(start=>({leaf:'query',field:'title',valueIndex:0,start,end:start+3})));
 const emoji=await engine.search(q('😀😀'),request(['a']));assert.deepEqual(plain(emoji.extensions.literal.documents[0].ranges),[{leaf:'query',field:'title',valueIndex:0,start:10,end:14}]);}
 finally{await engine.dispose();}}
 return{comparisons,overlapRanges:9,scope:'Independent hand-literal expected IDs/ranges; no own evaluation oracle imported.'};
});

await probe('Literal is zero-score and failed/negative Boolean paths supply no evidence',async()=>{
 const engine=createRaveldex(configs());try{await engine.addMany(records);const lexical=await engine.search('red',{limit:100}),combined=await engine.search({kind:'or',children:[q('::'),{kind:'text',text:'red'}]},{limit:100});assert.deepEqual(combined.hits.filter(hit=>hit.score>0),lexical.hits);assert.deepEqual(combined.hits.filter(hit=>hit.score===0).map(hit=>hit.id),['a']);
 const query={kind:'or',children:[{kind:'and',children:[q('aba'),{kind:'text',text:'unmatchedword'}]},{kind:'not',child:q('::')},q('ABA')]};const result=await engine.search(query,request(['a','b','c','d','empty','absent']));assert.deepEqual(ids(result),['b','c','d','empty']);assert.deepEqual(result.extensions.literal.leaves.map(leaf=>leaf.path),['query.children[0].children[0]','query.children[1].child','query.children[2]']);assert.deepEqual(plain(result.extensions.literal.documents.find(doc=>doc.id==='b').ranges),[{leaf:'query.children[2]',field:'title',valueIndex:0,start:3,end:6}]);for(const doc of result.extensions.literal.documents.filter(doc=>doc.id!=='b'))assert.deepEqual(doc.ranges,[]);
 return{lexicalNativeScoresUnchanged:true,zeroScoreIds:['a'],positiveRangeCount:1,descriptorsIncludeNegativeAndFailed:true};}finally{await engine.dispose();}
});

await probe('Own data accessors/symbols refuse without execution and queued payloads remain owned',async()=>{
 let reads=0,refusals=0;const invalid=()=>{reads++;return 'aba';};
 const option={};Object.defineProperty(option,'fields',{enumerable:true,get:invalid});assert.throws(()=>createLiteral(option),{code:'INVALID_OPTIONS'});refusals++;
 const engine=createRaveldex(configs());try{await engine.addMany(records);
  for(const key of ['text','fields']){const payload={text:'aba'};Object.defineProperty(payload,key,{enumerable:true,get:invalid});await assert.rejects(engine.search({kind:'extension',capability:'literal',version:1,payload}),{code:'INVALID_QUERY'});refusals++;}
  const input={text:'aba',fields:['title']};input[Symbol('extra')]=true;await assert.rejects(engine.search({kind:'extension',capability:'literal',version:1,payload:input}),{code:'INVALID_QUERY'});refusals++;
  const evidence={ids:['a']};Object.defineProperty(evidence,'maxRanges',{enumerable:true,get:invalid});await assert.rejects(engine.search(q('aba'),{extensions:{literal:evidence}}),{code:'INVALID_OPTIONS'});refusals++;
 }finally{await engine.dispose();}
 const f=fake(configs());await f.call('addMany',records);const query=q('aba',['title']),options=request(['a']),pending=f.engine.search(query,options);query.payload.text='ABA';query.payload.fields[0]='body';options.extensions.literal.ids[0]='b';f.host.runReady();const result=await pending;assert.deepEqual(ids(result),['a']);assert.equal(result.extensions.literal.documents[0].id,'a');assert.equal(reads,0);await f.call('dispose');
 return{refusals,getterReads:reads,queuedOwnership:'Pass'};
});

await probe('Missing/stale source and malformed provider records fail before returning partial membership',async()=>{
 assert.throws(()=>createRaveldex({schema,addons:[createLiteral({fields})]}),{code:'MISSING_CAPABILITY'});const f=fake(configs());await f.call('addMany',records);const current=f.engine.root,source=current.participants.source;
 const withSource=value=>Object.freeze({...current,participants:Object.freeze({...current.participants,source:value})});
 for(const query of[q('absent'),{kind:'and',children:[{kind:'none'},q('aba')]},{kind:'not',child:q('aba')}])assert.throws(()=>drain(executeSearch(withSource(Object.freeze({...source,revision:0})),query)),{code:'REVISION_MISMATCH'});
 assert.throws(()=>drain(executeSearch(withSource(Object.freeze({...source,records:emptyDirectory()})),q('aba'))),{code:'MISSING_CAPABILITY'});
 let reads=0;const record={retainedEntries:1,textCodeUnits:0};Object.defineProperty(record,'text',{enumerable:true,get(){reads++;return{title:['aba']}}});Object.freeze(record);const stage=new DirectoryStage(source.records,workUnits=>({workUnits}));drain(stage.set('a',record));const changed=drain(stage.finish()).value;assert.throws(()=>drain(executeSearch(withSource(Object.freeze({...source,records:changed})),q('aba'))),{code:'INCOMPATIBLE_CAPABILITY'});assert.equal(reads,0);assert.equal(f.engine.root,current);await f.call('dispose');
 return{configurationRefusal:1,staleHeaderRefusals:3,missingRecordRefusal:1,malformedDataRefusal:1,getterReads:reads,priorRootPreserved:true};
});

await probe('Malformed Unicode, empty literals and range/output caps reject whole operations',async()=>{
 const engine=createRaveldex(configs('basic',createLiteral({fields,maxRanges:1})));let refusals=0;try{await engine.addMany(records);for(const text of['','\ud800','\udc00']){await assert.rejects(engine.search(q(text)),{code:'INVALID_QUERY'});refusals++;}await assert.rejects(engine.search(q('aba'),request(['a'])),{code:'LIMIT_EXCEEDED'});refusals++;assert.equal((await engine.search(q('aba'))).total,1);
 const and={kind:'and',children:[{kind:'none'},q('\ud800')]};await assert.rejects(engine.search(and),{code:'INVALID_QUERY'});refusals++;return{refusals,ordinaryMembershipStillComplete:true};}finally{await engine.dispose();}
});

await probe('Source predicate role capture restricts readers to declared source fields and rejects malformed handles/results',async()=>{
 const native=createLiteral({fields:['title']}),providers=[createSourceProvider({fields}),createPositionProvider({fields:['title']})];let reads=0,refusals=0;
 for(const extra of['positions:title','source:body']){const addon={...native,manifest:{...native.manifest,requires:[...native.manifest.requires,{id:extra,contractVersion:1}]}};assert.throws(()=>createRaveldex({schema,addons:[...providers,addon]}),{code:'INCOMPATIBLE_CAPABILITY'});refusals++;}
 const handle={kind:'source-substring',prepare:native.sourcePredicate.prepare};Object.defineProperty(handle,'capture',{enumerable:true,get(){reads++;return native.sourcePredicate.capture}});
 assert.throws(()=>createRaveldex({schema,addons:[...providers,{...native,sourcePredicate:handle}]}),{code:'INCOMPATIBLE_CAPABILITY'});refusals++;
 const invalid={...native,sourcePredicate:{...native.sourcePredicate,*prepare(){return{*test(){return 'yes'}};}}},engine=createRaveldex({schema,addons:[...providers,invalid]});try{await engine.add({id:'a',text:{title:'needle'}});await assert.rejects(engine.search(q('needle')),{code:'INCOMPATIBLE_CAPABILITY'});refusals++;}finally{await engine.dispose();}
 assert.equal(reads,0);return{refusals,getterReads:reads,nonSourceAndUndeclaredFieldStateRefusedAtCapture:true,nonbooleanResultRefused:true};
});

await probe('One registration work budget covers duplicate leaves and selected evidence',async()=>{
 let used=0;function* meter(cursor){try{for(;;){const next=cursor.next();if(next.done)return next.value;used+=next.value.workUnits;yield next.value;}}finally{try{cursor.return(undefined)}catch{}}}
 const base=createLiteral({fields});
 const instrumented={...base,sourcePredicate:{...base.sourcePredicate,*prepare(context){
  const prepared=yield* meter(base.sourcePredicate.prepare(context));
  return{*test(id){return yield* meter(prepared.test(id));}};
 }}};
 const engine=createRaveldex(configs('basic',instrumented));try{await engine.add({id:'a',text:{title:'prefix needle suffix'}});used=0;assert.equal((await engine.search(q('needle'))).total,1);}finally{await engine.dispose();}
 const singleWork=used,limited=createLiteral({fields,maxWorkUnits:singleWork}),target=createRaveldex(configs('basic',limited));try{await target.add({id:'a',text:{title:'prefix needle suffix'}});assert.equal((await target.search(q('needle'))).total,1);await assert.rejects(target.search({kind:'and',children:[q('needle'),q('needle')]}),{code:'WORK_LIMIT_EXCEEDED'});await assert.rejects(target.search(q('needle'),request(['a'])),{code:'WORK_LIMIT_EXCEEDED'});return{singleLeafModuleWork:singleWork,exactSingleBudgetPass:true,multipleLeavesRefusal:true,sharedEvidenceRefusal:true,completeOperationFailure:true};}finally{await target.dispose();}
});

await probe('Reentrant cancellation precedes module overflow/nonboolean output and closes provider cursors',async()=>{
 const observed=[];for(const phase of['prepare','test-yield','test-return','evidence-prepare','evidence-finish']){const signal=new FakeSignal(),native=createLiteral({fields});let closed=0;const cap={...native.manifest,limits:{...native.manifest.limits,maxWorkUnits:1}};
 const changed={...native,manifest:cap,sourcePredicate:{...native.sourcePredicate,*prepare(){try{if(phase==='prepare'){signal.stop(false);yield{workUnits:2};}return{*test(){try{if(phase==='test-yield'||phase==='test-return'){signal.stop(false);if(phase==='test-yield')yield{workUnits:2};return 'bad';}return true;}finally{if(phase.startsWith('test'))closed++;}}};}finally{if(phase==='prepare')closed++;}}},evidence:{...native.evidence,*prepare(){try{if(phase==='evidence-prepare'){signal.stop(false);yield{workUnits:2};}return{*finish(){try{signal.stop(false);yield{workUnits:2};return null;}finally{if(phase==='evidence-finish')closed++;}}};}finally{if(phase==='evidence-prepare')closed++;}}}};
 const f=fake(configs('basic',changed));await f.call('add',{id:'a',text:{title:'needle'}});const before=f.engine.root;await assert.rejects(f.call('search',q('needle'),{signal,...(phase.startsWith('evidence')?{extensions:{literal:{ids:['a']}}}:{})}),{code:'CANCELLED'});assert.equal(f.engine.root,before);assert.equal(signal.listenerCount,0);assert.equal(f.host.pending,0);assert.equal(closed,1);observed.push({phase,error:'CANCELLED',closed,rootPreserved:true});await f.call('dispose');}
 return{cases:observed};
});

await probe('Source and qualified native snapshots preserve raw literals under basic/English/identifier policies',async()=>{
 let comparisons=0,refusals=0;const qualification={profileId:'rx-a060-independent-current-node',scope:'exact-node-runtime',environment:currentNodeSnapshotEnvironment(),evidence:['Independent finite raw literal round trips in this probe, not cross-host Unicode qualification']};
 for(const mode of['basic','english','identifiers']){const config=configs(mode),donor=createSnapshotRaveldex(config,{nativeQualification:qualification}),receiver=createSnapshotRaveldex(config,{nativeQualification:qualification});try{await donor.addMany(records);for(const format of['Source','Native']){const encoded=await createSnapshots(donor)['export'+format]();await createSnapshots(receiver).restore(encoded);for(const[text,expected]of[['::',['a','b']],['aba',['a']],['😀😀',['a']],['red blue',['d']]]){const result=await receiver.search(q(text),request(['a','b','c','d']));assert.deepEqual(ids(result),expected);assert.ok(result.hits.every(hit=>hit.score===0));comparisons++;}const changedLiteral=createLiteral({fields,maxRanges:7}),changed=createSnapshotRaveldex(configs(mode,changedLiteral),{nativeQualification:qualification});try{await assert.rejects(createSnapshots(changed).restore(encoded),error=>error.reason==='CAPABILITY_MISMATCH');refusals++;}finally{await changed.dispose();}}}finally{await donor.dispose();await receiver.dispose();}}
 return{comparisons,identityRefusals:refusals,qualificationScope:'Actual current Node attestation and fixture only, not cross-host or browser native qualification'};
});

await probe('Actual Node worker messages preserve raw predicates/evidence, source restore and exact policy identity',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'raveldex-a060-independent-worker-')),module=url=>new URL(url,root).href;
 const source=`import{parentPort,workerData}from'node:worker_threads';import{serveSnapshotRaveldexWorker}from ${JSON.stringify(module('dist/adapters/worker/snapshots-host.js'))};import{createLiteral}from ${JSON.stringify(module('dist/addons/literal/index.js'))};import{createSourceProvider}from ${JSON.stringify(module('dist/addons/phrases/source.js'))};const fields=['body','title'];const callbacks=new Map();let literal=createLiteral({fields});if(workerData.mode==='policy')literal={...literal,manifest:{...literal.manifest,execution:{...literal.manifest.execution,workerRegistration:literal.manifest.execution.workerRegistration+':changed'}}};serveSnapshotRaveldexWorker({postMessage:value=>parentPort.postMessage(value),addEventListener(type,listener){const wrap=value=>listener(type==='message'?{data:value}:value);callbacks.set(listener,wrap);parentPort.on(type,wrap);},removeEventListener(type,listener){parentPort.off(type,callbacks.get(listener));callbacks.delete(listener);}},{addons:[createSourceProvider({fields}),...(workerData.mode==='missing'?[]:[literal])]});`;
 const path=join(directory,'worker.mjs');await writeFile(path,source);
 function endpoint(worker){const callbacks=new Map();return{postMessage:value=>worker.postMessage(value),addEventListener(type,listener){const wrap=value=>listener(type==='message'?{data:value}:value);callbacks.set(listener,wrap);worker.on(type,wrap)},removeEventListener(type,listener){const wrap=callbacks.get(listener);if(wrap)worker.off(type,wrap);callbacks.delete(listener)},terminate(){void worker.terminate()}};}
 const worker=new Worker(path,{workerData:{mode:'valid'}});let remote;let comparisons=0;const refusals=[];
 try{remote=await createWorkerRaveldex({worker:endpoint(worker),configuration:configs(),ownership:'owned',sameHost:true,responseTimeoutMs:10000});await remote.addMany(records);for(const[text,expected]of[['::',['a','b']],['aba',['a']],['😀😀',['a']],['red blue',['d']]]){const result=await remote.search(q(text),request(['a','b','c','d']));assert.deepEqual(ids(result),expected);assert.ok(result.hits.every(hit=>hit.score===0));comparisons++;}const overlap=await remote.search(q('aba'),request(['a']));assert.equal(overlap.extensions.literal.documents[0].ranges.length,3);comparisons++;
 const snapshots=createWorkerSnapshots(remote),encoded=await snapshots.exportSource();await remote.clear();const restoring=snapshots.restore(encoded),receipt=await restoring;assert.equal(receipt.receivingAnalyzer.id,'basic-v1');const reconciled=await snapshots.reconcile(restoring.operationId);assert.equal(reconciled.status,'committed');assert.deepEqual(ids(await remote.search(q('aba'))),['a']);comparisons++;
 for(const mode of['missing','policy']){const changed=new Worker(path,{workerData:{mode}});try{await assert.rejects(createWorkerRaveldex({worker:endpoint(changed),configuration:configs(),ownership:'owned',sameHost:true,responseTimeoutMs:10000}),error=>{refusals.push({mode,code:error.code});return['INCOMPATIBLE_WORKER','MISSING_CAPABILITY'].includes(error.code)});}finally{await changed.terminate();}}
 return{comparisons,identityRefusals:refusals,sourceRestoreReceipt:plain(reconciled),scope:'Actual Node worker_threads with structural endpoint, not browser execution or native worker snapshot qualification'};
 }finally{if(remote)await remote.destroy();await worker.terminate();await rm(directory,{recursive:true,force:true});}
});

const paths=['src/core/capabilities/registration.ts','src/core/capabilities/types.ts','src/core/capabilities/refinement.ts','src/core/contracts/query.ts','src/core/query/evaluate.ts','src/core/query/search.ts','src/addons/literal/index.ts','src/addons/literal/scanner.ts','src/addons/literal/source.ts','src/addons/literal/options.ts','src/addons/literal/evidence.ts','src/addons/literal/types.ts','src/addons/phrases/store.ts','src/adapters/snapshots/native.ts','src/adapters/snapshots/snapshots.ts','src/adapters/worker/host.ts','src/adapters/worker/client.ts','src/adapters/worker/snapshot-channel.ts'];
const bindings=[];for(const path of paths)for(const name of[path,path.replace(/^src\//,'dist/').replace(/\.ts$/,'.js')]){const bytes=await readFile(new URL(name,root)),metadata=await stat(new URL(name,root));bindings.push({path:name,sha256:createHash('sha256').update(bytes).digest('hex'),modifiedAt:metadata.mtime.toISOString()});}
const failures=rows.filter(row=>row.status==='Fail'),report={kind:'raveldex-rx-a060-independent-runtime-probes-v1',recordedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch},bindings,rows,passCount:rows.length-failures.length,failCount:failures.length,scope:'Independent other-authored runtime inspection and distinct direct/worker/source/stop probes. Excludes own literal oracle, fixture and evaluation tests from independent assessment. No build, Git mutation, network, browser/AT or peak-memory claim.'};
await writeFile(new URL('RX-A060-runtime-review-probes.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passCount:report.passCount,failCount:report.failCount,rows}));if(failures.length)process.exitCode=1;
