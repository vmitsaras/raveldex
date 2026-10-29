import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaveldex} from '../../../dist/index.js';
import {createProximity} from '../../../dist/addons/proximity/index.js';
import {createPositionProvider} from '../../../dist/addons/positions/index.js';
import {createMatchEvidence} from '../../../dist/addons/evidence/index.js';
import {directoryGet} from '../../../dist/core/index/directory.js';
import {DirectoryStage} from '../../../dist/core/index/staging.js';
import {setup as base,search,drain} from '../typo/helpers.mjs';
import {FakeSignal} from '../../fixtures/execution/host.mjs';

const fields=['title','body'],schema={text:{title:{},body:{}}};
const proximity=(groups=[['red'],['blue']],maxGap=1,selected=fields)=>({kind:'extension',capability:'proximity',version:1,payload:{groups,maxGap,fields:selected}});
const addons=()=>[createPositionProvider({fields}),createProximity({fields})];
const setup=(overrides={})=>base({schema,addons:addons(),...overrides});
const cap=(addon,maxWorkUnits)=>({...addon,manifest:{...addon.manifest,limits:{...addon.manifest.limits,maxWorkUnits}}});
const released=(fixture,signal)=>{assert.equal(fixture.host.pending,0);if(signal)assert.equal(signal.listenerCount,0);};

test('ordered query groups, alternatives, fields and queued records stay owned at the FIFO revision',async()=>{
  const f=setup({limits:{checkpointWorkUnits:1}});await f.call('add',{id:'a',text:{body:'red gap blue'}});
  const old=f.engine.root,oldResult=search(old,proximity()).value;
  const replacement={id:'a',text:{body:['red blue','green red']}},replace=f.engine.replace(replacement),query=proximity([['red'],['blue','green']],0,['body']),options={limit:10},pending=f.engine.search(query,options);
  replacement.text.body[0]='lost';query.payload.groups[0][0]='lost';query.payload.groups[1].push('lost');query.payload.fields[0]='title';query.payload.maxGap=32;options.limit=0;f.host.runReady();await replace;
  const result=await pending;assert.equal(result.revision,2);assert.equal(result.total,1);assert.deepEqual(result.hits.map(hit=>hit.id),['a']);
  assert.deepEqual(search(old,proximity()).value,oldResult);
  await f.call('remove','a');assert.equal((await f.call('search',proximity())).total,0);await f.call('add',{id:'b',text:{body:'red gap blue'}});await f.call('clear');assert.equal((await f.call('search',proximity())).total,0);
  assert.deepEqual(Object.keys(f.engine.root.participants),['positions']);await f.call('dispose');released(f);
});

test('one proximity module budget spans every prepare/test and repeated leaf without partial success',async()=>{
  const native=createProximity({fields});let units=0;
  function* measured(cursor){try{for(;;){const step=cursor.next();if(step.done)return step.value;units+=step.value.workUnits;yield step.value;}}finally{cursor.return(undefined);}}
  const addon={...native,refinement:{...native.refinement,*prepare(context){const prepared=yield* measured(native.refinement.prepare(context));return{*test(id){return yield* measured(prepared.test(id));}};}}};
  const f=setup({addons:[createPositionProvider({fields}),addon]});await f.call('add',{id:'a',text:{body:'red gap blue'}});units=0;const expected=await f.call('search',proximity(),{limit:0}),one=units;assert.ok(one>10);await f.call('dispose');
  const narrow=setup({addons:[createPositionProvider({fields}),cap(native,one)]});await narrow.call('add',{id:'a',text:{body:'red gap blue'}});const root=narrow.engine.root;assert.deepEqual(await narrow.call('search',proximity(),{limit:0}),expected);
  await assert.rejects(narrow.call('search',{kind:'or',children:[proximity(),proximity()]},{limit:0}),{code:'WORK_LIMIT_EXCEEDED'});assert.equal(narrow.engine.root,root);assert.equal((await narrow.call('search',proximity())).total,1);await narrow.call('dispose');released(narrow);
  const shared=setup({limits:{maxSearchWorkUnits:200,checkpointWorkUnits:1}});await shared.call('add',{id:'a',text:{body:'red gap blue'}});const sharedRoot=shared.engine.root;await assert.rejects(shared.call('search',proximity()),{code:'WORK_LIMIT_EXCEEDED'});assert.equal(shared.engine.root,sharedRoot);await shared.call('dispose');released(shared);
});

test('every observed search and replacement suspension cancels cleanly, preserving authoritative roots',async t=>{
  const records=Array.from({length:4},(_,i)=>({id:String(i),text:{body:'red gap '.repeat(8)+'blue'}})),rows=[];
  for(const method of ['search','replace']){const argument=method==='search'?proximity():{id:'0',text:{body:'red blue'}},baseline=setup({limits:{checkpointWorkUnits:128}});await baseline.call('addMany',records);const before=baseline.host.executed;await baseline.call(method,argument);const count=baseline.host.executed-before;assert.ok(count>1);await baseline.call('dispose');
    for(let stop=0;stop<count;stop++){const f=setup({limits:{checkpointWorkUnits:128}});await f.call('addMany',records);const stable=f.engine.root,signal=new FakeSignal(),pending=f.engine[method](argument,{signal});for(let step=0;step<stop;step++)assert.equal(f.host.runNext(),true);signal.stop(false);f.host.runReady();await assert.rejects(pending,{code:'CANCELLED'});assert.equal(f.engine.root,stable);released(f,signal);assert.equal((await f.call('search',proximity())).total,4);await f.call('dispose');released(f);}
    rows.push({method,suspensions:count});}
  const f=setup({limits:{checkpointWorkUnits:128}});await f.call('addMany',records);const deadline=f.engine.search(proximity(),{deadlineMs:1});f.host.advance(1);f.host.runReady();await assert.rejects(deadline,{code:'DEADLINE_EXCEEDED'});released(f);
  const pending=f.engine.search(proximity());await f.call('dispose');await assert.rejects(pending,{code:'DISPOSED'});assert.equal(f.engine.root,undefined);released(f);t.diagnostic(JSON.stringify({rows,scope:'Deterministic host callbacks, not physical-input or timing evidence'}));
});

test('reentrant proximity stops close cursors and outrank later work failures including done results',async()=>{
  const native=createProximity({fields});
  for(const when of ['prepare','test-step','test-return']){const signal=new FakeSignal();let closed=0;
    const addon={...native,refinement:{...native.refinement,*prepare(){try{if(when==='prepare'){signal.stop(false);yield{workUnits:2};}return{*test(){try{signal.stop(false);if(when==='test-step')yield{workUnits:2};return true;}finally{closed++;}}};}finally{if(when==='prepare')closed++;}}}};
    const f=setup({addons:[createPositionProvider({fields}),cap(addon,1)]});await f.call('add',{id:'a',text:{body:'red blue'}});await assert.rejects(f.call('search',proximity(),{signal}),{code:'CANCELLED'});assert.equal(closed,1);assert.equal(f.engine.root.revision,1);released(f,signal);await f.call('dispose');
  }
});

test('position headers and every selected matching value are authoritative, including empty lexical candidates',async()=>{
  assert.throws(()=>createRaveldex({schema,addons:[createProximity({fields})]}),{code:'MISSING_CAPABILITY'});
  const f=setup();await f.call('add',{id:'a',text:{title:['red blue','red blue']}});const root=f.engine.root,positions=root.participants.positions;
  for(const [changed,code] of [[Object.freeze({...positions,revision:0}),'REVISION_MISMATCH'],[Object.freeze({...positions,analyzer:Object.freeze({...positions.analyzer,id:'foreign'})}),'INCOMPATIBLE_CAPABILITY'],[undefined,'MISSING_CAPABILITY']]){
    const corrupt=Object.freeze({...root,participants:Object.freeze({positions:changed})});assert.throws(()=>search(corrupt,proximity([['missing'],['missing']],0)),{code});}
  const record=directoryGet(positions.records,'a'),value=record.positions.title[1],terms=Object.freeze(Object.assign(Object.create(null),value.terms,{red:Object.freeze([Object.freeze({...value.terms.red[0],positionLength:2})])})),values=Object.freeze([record.positions.title[0],Object.freeze({...value,terms})]),replacement=Object.freeze({...record,positions:Object.freeze(Object.assign(Object.create(null),record.positions,{title:values}))}),stage=new DirectoryStage(positions.records,workUnits=>({workUnits}));drain(stage.set('a',replacement));const records=drain(stage.finish()).value,corrupt=Object.freeze({...root,participants:Object.freeze({positions:Object.freeze({...positions,records})})});assert.throws(()=>search(corrupt,proximity([['red'],['blue']],0,['title'])),{code:'INCOMPATIBLE_CAPABILITY'});assert.equal((await f.call('search',proximity())).total,1);await f.call('dispose');released(f);
});

test('ordered leaves fail closed for unimplemented token match evidence even in failed or negative branches',async()=>{
  const f=setup({addons:[createPositionProvider({fields,offsets:fields}),createProximity({fields}),createMatchEvidence({fields:{title:'offsets',body:'offsets'}})]});await f.call('add',{id:'a',text:{body:'red blue'}});
  for(const query of [proximity(),{kind:'not',child:proximity()},{kind:'and',children:[{kind:'none'},proximity()]}])await assert.rejects(f.call('search',query,{extensions:{'match-evidence':{ids:[]}}}),{code:'MISSING_CAPABILITY'});await f.call('dispose');released(f);
});

test('100/1000/10000 record proximity costs expose charged work and provider entries without a proximity side index',async t=>{
  const rows=[];for(const size of [100,1000,10000]){const f=setup();for(let start=0;start<size;start+=256)await f.call('addMany',Array.from({length:Math.min(256,size-start)},(_,i)=>({id:String(start+i),text:{body:i%2?'red gap blue':'blue gap red'}})));
    const measured=search(f.engine.root,proximity()),positions=f.engine.root.participants.positions;assert.equal(measured.value.total,size/2);assert.deepEqual(Object.keys(f.engine.root.participants),['positions']);rows.push({records:size,total:measured.value.total,queryWorkUnits:measured.units,yieldedSteps:measured.steps,coreTokens:f.engine.root.counts.tokens,positionOccurrences:positions.occurrenceCount,positionLogicalEntries:positions.retainedEntries,proximityCorpusEntries:0});await f.call('dispose');}
  t.diagnostic(JSON.stringify({rows,scope:'Charged logical work/cardinalities. Not heap/allocation bytes, physical transport copies or default-host latency.'}));
});
