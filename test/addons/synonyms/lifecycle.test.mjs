import test from 'node:test';
import assert from 'node:assert/strict';
import { createSynonyms } from '../../../dist/addons/synonyms/index.js';
import { FakeSignal } from '../../fixtures/execution/host.mjs';
import { setup, synonyms, options, search } from './helpers.mjs';

test('live mutation revisions and admitted queued input cannot retain stale synonym alternatives', async () => {
  const f=setup({limits:{checkpointWorkUnits:1}});
  await f.call('add',{id:'a',text:{title:'snapshot'}});const oldRoot=f.engine.root,old=search(oldRoot,synonyms('backup')).value;
  const replace=f.engine.replace({id:'a',text:{title:'archive'}});
  const query=synonyms('backup'),request=f.engine.search(query);query.payload.text='snapshot';query.payload.fields[0]='body';f.host.runReady();
  await replace;const result=await request;assert.equal(result.revision,2);assert.equal(result.total,0);
  await f.call('addMany',[{id:'b',text:{title:'snapshot'}},{id:'c',text:{title:'snapshot'}}]);
  assert.equal((await f.call('search',synonyms('backup'))).total,2);
  await f.call('remove',['b']);assert.equal((await f.call('search',synonyms('backup'))).total,1);
  await f.call('clear');assert.equal((await f.call('search',synonyms('backup'))).total,0);
  assert.deepEqual(search(oldRoot,synonyms('backup')).value,old);assert.deepEqual(Object.keys(f.engine.root.participants),[]);
});

test('module/core/output/expansion limits reject complete operations and keep later recovery usable', async () => {
  const records=[{id:'a',text:{title:'snapshot archive',body:'snapshot'}}];
  for(const overrides of [{limits:{maxVariantsPerGroup:1}},{limits:{maxExpansionsPerGroup:1}},{limits:{maxQueryExpansions:1}},
    {addons:[createSynonyms({...options,maxWorkUnits:1})]}]){
    const f=setup(overrides);await f.call('addMany',records);const root=f.engine.root;
    for(const limit of [0,10])await assert.rejects(f.call('search',synonyms('backup',['title','body']),{limit}),e=>['LIMIT_EXCEEDED','WORK_LIMIT_EXCEEDED'].includes(e.code));
    assert.equal(f.engine.root,root);assert.equal((await f.call('search',{kind:'text',text:'snapshot',fields:['title']})).total,1);
  }
  const f=setup();await f.call('addMany',records);const measured=search(f.engine.root,synonyms('backup'));
  const moduleWork=measured.value.extensions.synonyms.groups[0].workUnits;
  const module=setup({addons:[createSynonyms({...options,maxWorkUnits:moduleWork})]});await module.call('addMany',records);
  assert.equal((await module.call('search',synonyms('backup'))).total,1);
  await assert.rejects(module.call('search',{kind:'or',children:[synonyms('backup'),synonyms('checkpoint')]}),{code:'WORK_LIMIT_EXCEEDED'});
  const low=setup({limits:{maxSearchWorkUnits:measured.units-1,checkpointWorkUnits:1}});await low.call('addMany',records);
  await assert.rejects(low.call('search',synonyms('backup')),{code:'WORK_LIMIT_EXCEEDED'});
  const addon=createSynonyms(options);
  // One group, one field, one mapped alternative: 3+8+1+4=16 keys.
  for(const maximum of [15,16]){
    const capped=setup({addons:[{...addon,manifest:{...addon.manifest,limits:{...addon.manifest.limits,maxOutputEntries:maximum}}}]});
    await capped.call('add',{id:'a',text:{title:'snapshot'}});
    if(maximum===15)await assert.rejects(capped.call('search',synonyms('backup')),{code:'LIMIT_EXCEEDED'});
    else assert.equal((await capped.call('search',synonyms('backup'))).total,1);
  }
  const fanout=Array.from({length:15},(_,i)=>({from:'alias',to:'target'+i}));
  const maximum=setup({addons:[createSynonyms({...options,mappings:fanout})]});
  await maximum.call('addMany',fanout.map(({to},i)=>({id:String(i),text:{title:to}})));
  assert.equal((await maximum.call('search',synonyms('alias'))).total,15);
  await maximum.call('add',{id:'original',text:{title:'alias'}});assert.equal((await maximum.call('search',synonyms('alias'))).total,16);
});

test('one-step dictionary work closes at every actual host suspension on cancellation, deadline and disposal', async t => {
  let closed=0,steps=0;
  const native=createSynonyms(options);
  const observed={...native,expansion:{...native.expansion,*expand(context){
    const cursor=native.expansion.expand(context);
    try{for(;;){const next=cursor.next();if(next.done)return next.value;steps++;yield next.value;}}
    finally{closed++;cursor.return([]);}
  }}};
  const f=setup({addons:[observed],limits:{checkpointWorkUnits:128}});
  await f.call('addMany',Array.from({length:24},(_,i)=>({id:String(i),text:{title:i===0?'snapshot':'z'+String(i).padStart(5,'0')+'z'}})));
  const root=f.engine.root,before=f.host.executed;await f.call('search',synonyms('backup'));const suspensions=f.host.executed-before;
  assert.ok(suspensions>5&&steps>24);
  for(let stop=0;stop<suspensions;stop++){
    const signal=new FakeSignal(),request=f.engine.search(synonyms('backup'),{signal});
    for(let i=0;i<stop;i++)assert.equal(f.host.runNext(),true);
    signal.stop(false);f.host.runReady();await assert.rejects(request,{code:'CANCELLED'});
    assert.equal(f.engine.root,root);assert.equal(f.host.pending,0);assert.equal(signal.listenerCount,0);
    assert.equal((await f.call('search','snapshot')).total,1);
  }
  const deadline=f.engine.search(synonyms('backup'),{deadlineMs:1});f.host.advance(1);f.host.runReady();await assert.rejects(deadline,{code:'DEADLINE_EXCEEDED'});
  const pending=f.engine.search(synonyms('backup'));await f.call('dispose');await assert.rejects(pending,{code:'DISPOSED'});
  assert.equal(f.host.pending,0);assert.ok(closed>1);
  t.diagnostic(JSON.stringify({cancelledSuspensions:suspensions,providerCursorsClosed:closed}));
});

test('logical live scans and configured state costs are explicit at 100/1000/10000 terms', async t => {
  const rows=[];
  for(const size of [100,1000,10000]){
    const f=setup();const records=Array.from({length:size},(_,i)=>({id:String(i),text:{title:i===0?'snapshot':'z'+String(i).padStart(5,'0')+'z'}}));
    for(let offset=0;offset<size;offset+=256)await f.call('addMany',records.slice(offset,offset+256));
    const result=search(f.engine.root,synonyms('backup')),group=result.value.extensions.synonyms.groups[0];
    assert.equal(group.dictionaryEntriesVisited,size);assert.equal(group.alternatives.length,1);assert.equal(result.value.total,1);
    rows.push({dictionaryEntries:size,dictionaryEntriesVisited:group.dictionaryEntriesVisited,addonWorkUnits:group.workUnits,totalSearchWorkUnits:result.units,yieldedSteps:result.steps,acceptedAlternatives:1,configuredEdges:options.mappings.length,corpusSideIndexEntries:0});
    await f.call('dispose');
  }
  t.diagnostic(JSON.stringify({rows,scope:'Actual logical work/cardinalities, not heap/allocation/transport peaks. Owned table and worker identity are retained configuration; no per-corpus participant state.'}));
});
