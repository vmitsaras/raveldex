import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { initializeParticipants } from '../../../dist/core/capabilities/participants.js';
import { emptyRoot,ExecutionOwner } from '../../../dist/core/execution/engine.js';
import { MutationOwner } from '../../../dist/core/mutations/owner.js';
import { executeSearch } from '../../../dist/core/query/search.js';
import { bucketOf,directoryGet } from '../../../dist/core/index/directory.js';
import { createSourceProvider } from '../../../dist/addons/phrases/source.js';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { createMatchEvidence } from '../../../dist/addons/evidence/index.js';
import { createSnippetEvidence } from '../../../dist/addons/snippets/index.js';
import { createRaveldex } from '../../../dist/index.js';
const drain=cursor=>{let units=0;for(;;){const s=cursor.next();if(s.done)return {value:s.value,units};units+=s.value.workUnits;}};
const observe=promise=>promise.then(value=>({value}),error=>({error}));
const freeze=value=>{if(value&&typeof value==='object'){for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)))if('value' in descriptor)freeze(descriptor.value);Object.freeze(value);}return value;};
const plain=value=>JSON.parse(JSON.stringify(value));
const schema={text:{title:{}}},rows=[];
const request=(capability='snippets',extra={})=>({limit:0,extensions:{[capability]:{ids:['a'],...extra}}});
const addons=(mode='snippets',options={})=>[createSourceProvider({fields:['title']}),createPositionProvider({fields:['title'],offsets:['title']}),mode==='snippets'?createSnippetEvidence({fields:{title:'offsets'},...options}):createMatchEvidence({fields:{title:mode},...options})];
function direct(mode='snippets',options={}){
  const configuration=captureConfiguration({schema,addons:addons(mode,options)}),installed=initializeParticipants(configuration),owner=new MutationOwner(emptyRoot(configuration,installed.states),installed.participants);
  drain(owner.execute(owner.capture('add',{id:'a',text:{title:'red blue red'}})));
  return owner.root;
}
function changeRecord(root,participant,edit){
  const old=root.participants[participant],slot=bucketOf('a'),record=directoryGet(old.records,'a');
  const next=edit(record),bucket=freeze(Object.assign(Object.create(null),old.records.buckets[slot],{a:next}));
  const buckets=freeze(Object.assign(Object.create(null),old.records.buckets,{[slot]:bucket}));
  return freeze({...root,participants:{...root.participants,[participant]:{...old,records:{...old.records,buckets}}}});
}
const positionsWith=(record,value)=>Object.assign(Object.create(null),record.positions,{title:[value]});
function codeOf(run){try {const result=run();return {code:'SUCCESS',result};}catch(error){return {code:error.code??error.name,path:error.details?.path};}}
let root=direct();
const sourceTests=[
  ['source-malformed-UTF16',record=>({...record,text:{title:['\ud800 blue red']}})],
  ['source-wrong-same-length-token',record=>({...record,text:{title:['bad blue bad']}})],
];
for(const [name,edit] of sourceTests){const outcome=codeOf(()=>drain(executeSearch(changeRecord(root,'source',edit),'red',request())).value);rows.push({name,...outcome});}
let getters=0;
const accessorRecord={retainedEntries:3,textCodeUnits:12};Object.defineProperty(accessorRecord,'text',{enumerable:true,get(){getters++;return freeze({title:['red blue red']});}});Object.freeze(accessorRecord);
const accessorOutcome=codeOf(()=>drain(executeSearch(changeRecord(root,'source',()=>accessorRecord),'red',request())).value);rows.push({name:'offset-snippet-source-accessor',gettersExecuted:getters,...accessorOutcome});
for(const [name,edit] of [
  ['offset-duplicate-position',record=>({...record,positions:positionsWith(record,{...record.positions.title[0],terms:Object.assign(Object.create(null),record.positions.title[0].terms,{blue:[{position:0,positionLength:1,start:4,end:8}]})})})],
  ['offset-missing-end',record=>({...record,positions:positionsWith(record,{...record.positions.title[0],terms:Object.assign(Object.create(null),record.positions.title[0].terms,{red:[{position:0,positionLength:1,start:0},{position:2,positionLength:1,start:9,end:12}]})})})],
  ['offset-reversed-span',record=>({...record,positions:positionsWith(record,{...record.positions.title[0],terms:Object.assign(Object.create(null),record.positions.title[0].terms,{red:[{position:0,positionLength:1,start:1,end:0},{position:2,positionLength:1,start:9,end:12}]})})})],
  ['offset-wrong-same-length-term',record=>({...record,positions:positionsWith(record,{...record.positions.title[0],terms:Object.assign(Object.create(null),{bad:record.positions.title[0].terms.red,blue:record.positions.title[0].terms.blue})})})],
]){const outcome=codeOf(()=>drain(executeSearch(changeRecord(root,'positions',edit),'red',request())).value);rows.push({name,...outcome});}
// A stored offset that bisects a supplementary-letter token must never produce
// source text/highlights over half a surrogate pair.
{
  const configuration=captureConfiguration({schema,addons:addons()}),installed=initializeParticipants(configuration),owner=new MutationOwner(emptyRoot(configuration,installed.states),installed.participants);
  drain(owner.execute(owner.capture('add',{id:'a',text:{title:'𐐀 red'}})));
  const malformed=changeRecord(owner.root,'positions',record=>({...record,positions:positionsWith(record,{...record.positions.title[0],terms:Object.assign(Object.create(null),record.positions.title[0].terms,{'𐐨':[{position:0,positionLength:1,start:0,end:1}]})})}));
  const outcome=codeOf(()=>drain(executeSearch(malformed,'𐐀',request())).value);rows.push({name:'offset-splits-surrogate',...outcome});
}
const NativeSegmenter=Intl.Segmenter;
for(const [name,host] of [
  ['absent',undefined],['throws',class {constructor(){throw new Error('host');}}],
  ['bad-granularity',class {resolvedOptions(){return {granularity:'word'};}segment(){return [];}}],
  ['missing-tail',class {resolvedOptions(){return {granularity:'grapheme'};}segment(){return [{index:0,segment:'r'}];}}],
  ['wrong-source',class {resolvedOptions(){return {granularity:'grapheme'};}segment(){return [{index:0,segment:'fake'}];}}],
  ['nonboolean-done',class {resolvedOptions(){return {granularity:'grapheme'};}segment(){return {[Symbol.iterator](){return {next(){return {done:'false',value:{index:0,segment:'red'}};}};}};}}],
]) {
  Intl.Segmenter=host;
  const outcome=codeOf(()=>drain(executeSearch(root,'red',request())).value);assert.equal(outcome.code,'UNSUPPORTED_ENVIRONMENT',name);rows.push({name:`segmenter-${name}`,...outcome});
  // Range-only and ordinary requests do not require segmentation.
  assert.equal(drain(executeSearch(root,'red')).value.total,1);
  const rangeRoot=direct('offsets');assert.equal(drain(executeSearch(rangeRoot,'red',request('match-evidence'))).value.total,1);
}
Intl.Segmenter=NativeSegmenter;
for(const [name,registrations] of [
  ['missing-source-provider',[createMatchEvidence({fields:{title:'source'}})]],
  ['missing-original-offset-provider',[createPositionProvider({fields:['title']}),createMatchEvidence({fields:{title:'offsets'}})]],
  ['missing-snippet-display-source',[createPositionProvider({fields:['title'],offsets:['title']}),createSnippetEvidence({fields:{title:'offsets'}})]],
]){const outcome=codeOf(()=>createRaveldex({schema,addons:registrations}));assert.equal(outcome.code,'MISSING_CAPABILITY');rows.push({name,...outcome});}
for(const [name,participant,value,expected] of [
  ['missing-source-root','source',undefined,'MISSING_CAPABILITY'],
  ['stale-source-root','source',freeze({...root.participants.source,revision:0}),'REVISION_MISMATCH'],
  ['missing-offset-field','positions',freeze({...root.participants.positions,offsetFields:[],maxRetainedEntries:1000}), 'MISSING_CAPABILITY'],
]){
  const changed=freeze({...root,participants:{...root.participants,[participant]:value}});
  const outcome=codeOf(()=>drain(executeSearch(changed,{kind:'none'},{extensions:{snippets:{ids:[]}}})).value);
  assert.equal(outcome.code,expected,name);rows.push({name,...outcome});
}

// Fresh portable deterministic host, separate from authored test fixtures.
class Host {time=0;sequence=0;tasks=new Map();now(){return this.time;}schedule(callback,delay){const key=++this.sequence;this.tasks.set(key,{callback,due:this.time+delay});return ()=>this.tasks.delete(key);}next(){const row=[...this.tasks].filter(([,t])=>t.due<=this.time).sort((a,b)=>a[1].due-b[1].due||a[0]-b[0])[0];if(!row)return false;this.tasks.delete(row[0]);row[1].callback();return true;}drain(){let n=0;while(this.next())assert.ok(++n<100000);return n;}}
class Signal {aborted=false;listeners=new Set();addEventListener(_type,fn){this.listeners.add(fn);}removeEventListener(_type,fn){this.listeners.delete(fn);}stop(){this.aborted=true;for(const fn of [...this.listeners])fn();}}
function scheduled(options={}) {
  const host=new Host(),tracker={phase:''},registrations=addons(),original=registrations.at(-1);
  registrations[registrations.length-1]={...original,evidence:{...original.evidence,*prepare(context){tracker.phase='prepare';let prepared;try{prepared=yield* original.evidence.prepare(context);}finally{tracker.phase='';}return {*finish(context){tracker.phase='finish';try{return yield* prepared.finish(context);}finally{tracker.phase='';}}};}}};
  const configuration=captureConfiguration({schema,limits:{checkpointWorkUnits:32,...options},addons:registrations}),installed=initializeParticipants(configuration),owner=new ExecutionOwner(emptyRoot(configuration,installed.states),host,installed.participants);
  return {host,owner,tracker,async call(method,...args){const promise=owner[method](...args);host.drain();return promise;}};
}
let cancellations=0,deadlines=0,disposals=0,recoveries=0,projectionStops=0,iteratorClosures=0;
for(const stop of [0,1,3,10,30,60,100,150]) {
  const state=scheduled();await state.call('add',{id:'a',text:{title:'red 👩🏽‍💻 blue red '.repeat(6)}});const old=state.owner.root,signal=new Signal();
  const active=observe(state.owner.search('red',{...request(),signal}));let ran=0;
  while(ran<stop&&state.host.next())ran++;
  if(state.tracker.phase==='finish')projectionStops++;
  signal.stop();state.host.drain();const outcome=await active;
  if(outcome.error){assert.equal(outcome.error.code,'CANCELLED');cancellations++;}else assert.equal(outcome.value.total,1);
  assert.equal(state.owner.root,old);assert.equal(signal.listeners.size,0);assert.equal(state.host.tasks.size,0);
  const recovered=await state.call('search','red',request());assert.equal(recovered.extensions.snippets.documents[0].ranges.length,12);recoveries++;await state.call('dispose');
}
for(const cause of ['deadline','dispose']) {
  const state=scheduled(),signal=new Signal(),queuedSignal=new Signal();await state.call('add',{id:'a',text:{title:'red 👩🏽‍💻 blue red '.repeat(8)}});
  const active=observe(state.owner.search('red',{...request(),signal,deadlineMs:5}));
  const queued=observe(state.owner.replace({id:'a',text:{title:'blue'}},{signal:queuedSignal}));
  while(state.tracker.phase!=='finish')assert.ok(state.host.next());
  projectionStops++;
  const stale=[...state.host.tasks.values()].map(t=>t.callback);
  if(cause==='deadline'){state.host.time=5;state.host.drain();assert.equal((await active).error.code,'DEADLINE_EXCEEDED');assert.equal((await queued).value.revision,2);assert.equal((await state.call('search','red',request())).total,0);deadlines++;recoveries++;}
  else {await state.owner.dispose();assert.equal((await active).error.code,'DISPOSED');assert.equal((await queued).error.code,'DISPOSED');for(const fn of stale)fn();assert.equal(state.owner.root,undefined);disposals++;}
  assert.equal(state.host.tasks.size,0);assert.equal(signal.listeners.size,0);assert.equal(queuedSignal.listeners.size,0);await state.call('dispose');
}
// Admission-owned request/query and execution-start roots under one FIFO.
const state=scheduled(),added={id:'a',text:{title:'red red'}},query={kind:'text',text:'red'},options=request('snippets',{expectedRevision:2});
const blocker=observe(state.owner.add({id:'block',text:{title:'slow '.repeat(10)}})),inserted=observe(state.owner.add(added)),first=observe(state.owner.search(query,options)),replace=observe(state.owner.replace({id:'a',text:{title:'blue'}})),stale=observe(state.owner.search('red',request('snippets',{expectedRevision:2}))),last=observe(state.owner.search('red',request('snippets',{expectedRevision:3})));
added.text.title='blue';query.text='blue';options.extensions.snippets.ids[0]='block';options.extensions.snippets.expectedRevision=50;
state.host.drain();assert.equal((await blocker).value.revision,1);assert.equal((await inserted).value.revision,2);assert.equal((await first).value.extensions.snippets.documents[0].ranges.length,2);assert.equal((await replace).value.revision,3);assert.equal((await stale).error.code,'REVISION_MISMATCH');assert.equal((await last).value.total,0);await state.call('dispose');
rows.push({name:'FIFO-owned-inputs-and-execution-root',status:'Pass',operations:6});
// A native grapheme iterator wrapped as a qualified usable host is closed when
// cancellation occurs inside segmentation, not just before it starts.
{
  let segmentCalls=0,closed=0;
  Intl.Segmenter=class {constructor(...args){this.native=new NativeSegmenter(...args);}resolvedOptions(){return this.native.resolvedOptions();}segment(source){segmentCalls++;const original=this.native.segment(source)[Symbol.iterator]();return {[Symbol.iterator](){return {next:()=>original.next(),return(){closed++;return {done:true};}};}};}};
  try {
    const state=scheduled(),signal=new Signal();await state.call('add',{id:'a',text:{title:'red 👩🏽‍💻 blue '.repeat(12)}});
    const active=observe(state.owner.search('red',{...request(),signal}));while(segmentCalls===0)assert.ok(state.host.next());
    signal.stop();state.host.drain();assert.equal((await active).error.code,'CANCELLED');assert.equal(closed,1);iteratorClosures++;cancellations++;projectionStops++;
    assert.equal(signal.listeners.size,0);assert.equal(state.host.tasks.size,0);await state.call('dispose');
  }finally{Intl.Segmenter=NativeSegmenter;}
}

// Both registration and operation budgets reject the whole requested output.
for(const [name,options] of [['registration-work',{maxWorkUnits:40}],['output-entries',{maxOutputEntries:40}],['complete-range',{maxRanges:1}],['complete-facts',{maxFacts:1}]]) {
  const engine=createRaveldex({schema,addons:addons('snippets',options)});await engine.add({id:'a',text:{title:'red red'}});
  const outcome=await observe(engine.search('red',request()));assert.ok(outcome.error,name);assert.ok(['LIMIT_EXCEEDED','WORK_LIMIT_EXCEEDED'].includes(outcome.error.code),name);assert.equal((await engine.search('red')).total,1);await engine.dispose();rows.push({name,code:outcome.error.code,recovery:'Pass'});recoveries++;
}
for(const name of ['source-malformed-UTF16','source-wrong-same-length-token','offset-snippet-source-accessor','offset-duplicate-position','offset-missing-end','offset-reversed-span','offset-splits-surrogate'])assert.equal(rows.find(row=>row.name===name).code,'INCOMPATIBLE_CAPABILITY',name);
assert.equal(rows.find(row=>row.name==='offset-snippet-source-accessor').gettersExecuted,0);
const report={status:'Pass',node:process.version,platform:process.platform,arch:process.arch,malformedRootScope:'Private synthetic replacements of otherwise first-party roots. These do not establish supported arbitrary external-provider behavior.',unsupportedProviderLimitation:'An arbitrarily forged term-map with a coherent claimed header can erase actual occurrences. First-party transactional roots own authoritative complete occurrences; full validation of arbitrary external producers is outside RX-2005.',rows,lifecycle:{cancellations,deadlineFailures:deadlines,disposals,recoveries,projectionStops,iteratorClosures,FIFOOperations:6}};
writeFileSync(new URL('./faults-and-lifecycle.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({rootAndHostCases:rows.length,lifecycle:report.lifecycle,observedLimitations:rows.filter(row=>row.code==='SUCCESS').map(({name,gettersExecuted})=>({name,gettersExecuted}))}));
