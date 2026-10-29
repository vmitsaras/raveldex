import test from 'node:test';
import assert from 'node:assert/strict';
import { createSuggestions } from '../../../dist/addons/suggestions/index.js';
import { FakeSignal } from '../../fixtures/execution/host.mjs';
import { setup, request, search } from './helpers.mjs';

test('add, replace, remove, clear and queued requests read the execution revision without optional state', async () => {
  const f=setup();await f.call('add',{id:'a',text:{title:'source'}});
  const old=f.engine.root;const before=search(old,'',request('so')).value;
  const write=f.engine.replace({id:'a',text:{title:'sound'}});const queued=f.engine.search('',request('so'));
  f.host.runReady();await write;const after=await queued;
  assert.equal(after.revision,2);assert.deepEqual(JSON.parse(JSON.stringify(after.extensions.suggestions.items)),[{term:'sound',fieldDocumentFrequency:1}]);
  await f.call('add',{id:'b',text:{title:'sound'}});assert.equal((await f.call('search','',request('so'))).extensions.suggestions.items[0].fieldDocumentFrequency,2);
  await f.call('remove',['b']);assert.equal((await f.call('search','',request('so'))).extensions.suggestions.items[0].fieldDocumentFrequency,1);
  await f.call('clear');assert.equal((await f.call('search','',request('so'))).extensions.suggestions.total,0);
  assert.deepEqual(search(old,'',request('so')).value,before);assert.deepEqual(Object.keys(f.engine.root.participants),[]);
});

test('candidate/output/module/shared work bounds reject whole operations and later searches recover', async () => {
  const native=createSuggestions({fields:['title','body']});
  for(const addons of [[createSuggestions({fields:['title','body'],maxCandidates:1})],[createSuggestions({fields:['title','body'],maxWorkUnits:1})],[{...native,manifest:{...native.manifest,limits:{...native.manifest.limits,maxOutputEntries:12}}}]]){
    const f=setup({addons});await f.call('add',{id:'a',text:{title:'source sound'}});const root=f.engine.root;
    await assert.rejects(f.call('search','',request('so',{limit:1})),error=>['LIMIT_EXCEEDED','WORK_LIMIT_EXCEEDED'].includes(error.code));
    assert.equal(f.engine.root,root);assert.equal((await f.call('search','source')).total,1);
  }
  const f=setup();await f.call('add',{id:'a',text:{title:'source sound'}});
  const measured=search(f.engine.root,'',request('so'));
  const smaller=setup({limits:{maxSearchWorkUnits:measured.units-1,checkpointWorkUnits:1}});await smaller.call('add',{id:'a',text:{title:'source sound'}});
  await assert.rejects(smaller.call('search','',request('so')),{code:'WORK_LIMIT_EXCEEDED'});
  assert.equal((await smaller.call('search','',{limit:0})).total,0);
});

test('every host suspension cancels, closes dictionary cursors, preserves root and releases listeners/tasks', async t => {
  let closed=0;const native=createSuggestions({fields:['title','body']});
  const instrumented={...native,dictionary:{...native.dictionary,*prepare(context){
    return yield* native.dictionary.prepare({...context,*dictionary(fields){const cursor=context.dictionary(fields);try{yield* cursor;}finally{closed++;cursor.return();}}});
  }}};
  const f=setup({addons:[instrumented],limits:{checkpointWorkUnits:128}});
  await f.call('addMany',Array.from({length:24},(_,i)=>({id:String(i),text:{title:'source'+String(i).padStart(5,'0')}})));
  const root=f.engine.root,before=f.host.executed;await f.call('search','',request('so'));const suspensions=f.host.executed-before;assert.ok(suspensions>5);
  for(let stop=0;stop<suspensions;stop++){
    const signal=new FakeSignal(),pending=f.engine.search('',{...request('so'),signal});
    for(let i=0;i<stop;i++)assert.equal(f.host.runNext(),true);
    signal.stop(false);f.host.runReady();await assert.rejects(pending,{code:'CANCELLED'});
    assert.equal(f.engine.root,root);assert.equal(signal.listenerCount,0);assert.equal(f.host.pending,0);
    assert.equal((await f.call('search','source00000')).total,1);
  }
  assert.ok(closed>1);
  const expired=f.engine.search('',{...request('so'),deadlineMs:1});f.host.advance(1);f.host.runReady();await assert.rejects(expired,{code:'DEADLINE_EXCEEDED'});
  const disposed=f.engine.search('',request('so'));await f.call('dispose');await assert.rejects(disposed,{code:'DISPOSED'});assert.equal(f.host.pending,0);
  t.diagnostic(JSON.stringify({cancelledSuspensions:suspensions,closedDictionaryCursors:closed}));
});

test('100/1000/10000 dictionary matches measure complete visits, candidate and output cardinalities', async t => {
  const rows=[];
  for(const size of [100,1000,10000]){
    const f=setup();const records=Array.from({length:size},(_,i)=>({id:String(i),text:{title:'source'+String(i).padStart(5,'0')}}));
    for(let start=0;start<size;start+=256)await f.call('addMany',records.slice(start,start+256));
    const measured=search(f.engine.root,'',request('so',{limit:5})),output=measured.value.extensions.suggestions;
    assert.equal(output.total,size);assert.equal(output.dictionaryEntriesVisited,size);assert.equal(output.items.length,5);assert.equal(output.omitted,size-5);
    assert.deepEqual(output.items.map(i=>i.term),records.slice(0,5).map(r=>r.text.title));assert.deepEqual(Object.keys(f.engine.root.participants),[]);
    rows.push({liveDictionaryTerms:size,dictionaryEntriesVisited:output.dictionaryEntriesVisited,peakMatchingCandidateEntries:output.total,returnedItems:output.items.length,outputStructuralEntries:9+output.fields.length+3*output.items.length,totalSearchWorkUnits:measured.units,yieldedSteps:measured.steps,retainedOptionalIndexEntries:0});
    await f.call('dispose');
  }
  t.diagnostic(JSON.stringify({rows,scope:'Actual cursor work and monotonically accumulated logical map cardinalities; no heap/allocation-byte or physical-copy peak claim.'}));
});
