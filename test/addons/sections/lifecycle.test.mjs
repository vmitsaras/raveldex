import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaveldex } from '../../../dist/index.js';
import { createSourceProvider } from '../../../dist/addons/phrases/index.js';
import { createSectionEvidence } from '../../../dist/addons/sections/index.js';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { initializeParticipants } from '../../../dist/core/capabilities/participants.js';
import { emptyRoot, ExecutionOwner } from '../../../dist/core/execution/engine.js';
import { MutationOwner } from '../../../dist/core/mutations/owner.js';
import { executeSearch } from '../../../dist/core/query/search.js';
import { FakeHost, FakeSignal } from '../../fixtures/execution/host.mjs';
const records=[{id:'a',text:{title:'red red'}}],fields={title:'source'};
const request=()=>({extensions:{'section-evidence':{ids:['a'],expectedRevision:1,sections:[{sectionIndex:0,field:'title',valueIndex:0,start:0,end:7}]}}});
const drain=cursor=>{let units=0;for(;;){const step=cursor.next();if(step.done)return {value:step.value,units};units+=step.value.workUnits;}};
const observed=promise=>promise.then(value=>({value}),error=>({error}));
function setup(factory={},tracker){
 let addon=createSectionEvidence({fields,...factory});
 if(tracker){const original=addon;addon={...addon,evidence:{...addon.evidence,*prepare(context){const prep=original.evidence.prepare(context);let prepared;try{for(;;){const step=prep.next();if(step.done){prepared=step.value;break;}tracker.units=(tracker.units??0)+step.value.workUnits;yield step.value;}}finally{prep.return();}return {*finish(context){const cursor=prepared.finish(context);try{for(;;){const step=cursor.next();if(step.done)return step.value;tracker.phase='finish';tracker.units=(tracker.units??0)+step.value.workUnits;yield step.value;tracker.phase=undefined;}}finally{cursor.return();tracker.closed++;tracker.phase=undefined;}}};}}};}
 const configuration=captureConfiguration({schema:{text:{title:{}}},limits:{checkpointWorkUnits:32},addons:[createSourceProvider({fields:['title']}),addon]}),installed=initializeParticipants(configuration),host=new FakeHost(),engine=new ExecutionOwner(emptyRoot(configuration,installed.states),host,installed.participants);
 return {configuration,host,engine,async call(method,...args){const result=engine[method](...args);host.runReady();return result;}};
}

test('section projection cancellation closes its cursor at every finish suspension, releases listeners and recovers',async t=>{
 const tracker={phase:undefined,closed:0},baseline=setup({},tracker);await baseline.call('addMany',records);const active=observed(baseline.engine.search('red',request())),stops=[];let step=0;
 while(baseline.host.runNext()){step++;if(tracker.phase==='finish')stops.push(step);}assert.ok((await active).value);await baseline.call('dispose');assert.ok(stops.length>0);
 for(const stop of stops){
  const track={phase:undefined,closed:0},state=setup({},track);await state.call('addMany',records);const root=state.engine.root,signal=new FakeSignal(),active=observed(state.engine.search('red',{...request(),signal}));
  for(let i=0;i<stop;i++)assert.ok(state.host.runNext());assert.equal(track.phase,'finish');signal.stop();assert.equal((await active).error.code,'CANCELLED');assert.equal(track.closed,1);assert.equal(state.host.pending,0);assert.equal(signal.listenerCount,0);assert.equal(state.engine.root,root);
  const recovered=await state.call('search','red',request());assert.equal(recovered.extensions['section-evidence'].documents[0].sectionPreviews[0].snippet.text,'red red');await state.call('dispose');
 }
 t.diagnostic(JSON.stringify({sectionFinishCancellationRecoveries:stops.length,partialSuccessfulResponses:0}));
});

test('deadline/disposal in section output close the active cursor and suppress late callbacks',async()=>{
 for(const cause of ['deadline','dispose']){
  const tracker={phase:undefined,closed:0},state=setup({},tracker);await state.call('addMany',records);const signal=new FakeSignal(),active=observed(state.engine.search('red',{...request(),deadlineMs:5,signal}));
  while(tracker.phase!=='finish')assert.ok(state.host.runNext());const callbacks=state.host.callbacks();
  if(cause==='deadline'){state.host.advance(5);state.host.runReady();assert.equal((await active).error.code,'DEADLINE_EXCEEDED');assert.equal((await state.call('search','red')).total,1);}else{await state.engine.dispose();assert.equal((await active).error.code,'DISPOSED');for(const callback of callbacks)callback();assert.equal(state.engine.root,undefined);}
  assert.equal(tracker.closed,1);assert.equal(signal.listenerCount,0);assert.equal(state.host.pending,0);await state.call('dispose');
 }
});

test('actual shared work and structural output limits are inclusive; unrequested sections add no root or work',async t=>{
 const state=setup(),configuration=state.configuration,installed=initializeParticipants(configuration),owner=new MutationOwner(emptyRoot(configuration,installed.states),installed.participants);drain(owner.execute(owner.capture('addMany',records)));
 const ordinary=drain(executeSearch(owner.root,'red')),section=drain(executeSearch(owner.root,'red',request()));
 const extension=section.value.extensions['section-evidence'];
 const measurement={phase:undefined,closed:0,units:0},measuring=setup({},measurement);await measuring.call('addMany',records);await measuring.call('search','red',request());const roleUnits=measurement.units;await measuring.call('dispose');
 const count=value=>value&&typeof value==='object'?Reflect.ownKeys(value).length+Object.values(value).reduce((n,child)=>n+count(child),0):0,entries=count(extension);
 for(const [factory,passes] of [[{maxWorkUnits:roleUnits},true],[{maxWorkUnits:roleUnits-1},false],[{maxOutputEntries:entries},true],[{maxOutputEntries:entries-1},false]]){
  const bounded=setup(factory);await bounded.call('addMany',records);if(passes)assert.equal((await bounded.call('search','red',request())).total,1);else await assert.rejects(bounded.call('search','red',request()),error=>['LIMIT_EXCEEDED','WORK_LIMIT_EXCEEDED'].includes(error.code));await bounded.call('dispose');
 }
 const baseConfig=captureConfiguration({schema:{text:{title:{}}},limits:{checkpointWorkUnits:32},addons:[createSourceProvider({fields:['title']})]}),baseInstalled=initializeParticipants(baseConfig),base=new MutationOwner(emptyRoot(baseConfig,baseInstalled.states),baseInstalled.participants);
 const build=drain(base.execute(base.capture('addMany',records)));assert.deepEqual(owner.root.participants,base.root.participants);assert.equal(drain(executeSearch(base.root,'red')).units,ordinary.units);
 assert.deepEqual(Object.keys(owner.root.participants),['source']);assert.ok(section.units>ordinary.units);
 t.diagnostic(JSON.stringify({ordinaryWorkUnits:ordinary.units,sectionWorkUnits:section.units,sectionRoleWorkUnits:roleUnits,sectionExtensionEntries:entries,sectionExtensionUtf8Bytes:Buffer.byteLength(JSON.stringify(extension)),retainedOptionalRoots:Object.keys(owner.root.participants),baseBuildWorkUnits:build.units,claim:'Logical work/structure/output only; no memory/latency claim'}));
 await state.call('dispose');
});

test('additional serialized UTF-8 section output ceiling refuses complete output before partial success',async()=>{
 const token='é'.repeat(200),value=Array(251).fill(token).join(' '),engine=createRaveldex({schema:{text:{title:{}}},addons:[createSourceProvider({fields:['title']}),createSectionEvidence({fields:{title:'source'}})]});try{
  await engine.add({id:'a',text:{title:[value,value,value]}});
  const sections=[0,1,2].map((valueIndex,sectionIndex)=>({sectionIndex,field:'title',valueIndex,start:0,end:value.length}));
  await assert.rejects(engine.search(token,{extensions:{'section-evidence':{ids:['a'],expectedRevision:1,sections}}}),error=>error.code==='LIMIT_EXCEEDED'&&error.details.path==='evidence.output.bytes');
  assert.equal((await engine.search(token)).total,1);
 }finally{await engine.dispose();}
});

test('worker registration identity includes every factory option without retaining per-query maps',()=>{
 const base=createSectionEvidence({fields}).manifest.execution.workerRegistration;
 for(const extra of [{id:'other-section'},{maxCodeUnits:239},{maxHighlights:31},{maxFacts:4095},{maxRanges:4095},{maxWorkUnits:9999999},{maxOutputEntries:16383},{fields:{title:'offsets'}}])assert.notDeepEqual(createSectionEvidence({fields,...extra}).manifest.execution.workerRegistration,base);
 assert.deepEqual(createSectionEvidence({fields}).manifest.execution.workerRegistration,base);
});
