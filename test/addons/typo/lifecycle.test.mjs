import test from 'node:test';
import assert from 'node:assert/strict';
import { createTypoTolerance } from '../../../dist/addons/typo/index.js';
import { FakeSignal } from '../../fixtures/execution/host.mjs';
import { setup, typo, search } from './helpers.mjs';

test('add, replace, remove and clear select only the live dictionary with no optional state', async () => {
  const f=setup(); const initialParticipants=f.engine.root.participants;
  await f.call('add',{id:'a',text:{title:'source'}});
  const previous=f.engine.root; const old=search(previous,typo('sorce')).value;
  assert.equal(old.total,1); assert.equal(old.revision,1);
  await f.call('replace',{id:'a',text:{title:'atomic'}});
  assert.equal((await f.call('search',typo('sorce'))).total,0);
  assert.equal((await f.call('search',typo('atmoic'))).revision,2);
  await f.call('add',{id:'b',text:{title:'source'}});
  assert.deepEqual((await f.call('search',typo('sorce'))).hits.map(h=>h.id),['b']);
  await f.call('remove',['b']); assert.equal((await f.call('search',typo('sorce'))).total,0);
  await f.call('clear'); assert.equal((await f.call('search',typo('atmoic'))).total,0);
  assert.deepEqual(search(previous,typo('sorce')).value,old);
  assert.deepEqual(f.engine.root.participants,initialParticipants);
  assert.deepEqual(Object.keys(initialParticipants),[]);
});

test('module alternatives, core variants, field-pair expansion, query and work bounds fail whole operations', async () => {
  const inputs=[{id:'a',text:{title:'target targle targue',body:'target'}}];
  for(const overrides of [
    {addons:[createTypoTolerance({fields:['title','body'],maxAlternatives:1})]},
    {limits:{maxVariantsPerGroup:1}},
    {limits:{maxExpansionsPerGroup:1}},
    {limits:{maxQueryExpansions:1}},
  ]){
    const f=setup(overrides);await f.call('addMany',inputs);const root=f.engine.root;
    await assert.rejects(f.call('search',typo('targte',['title','body'])),{code:'LIMIT_EXCEEDED'});
    assert.equal(f.engine.root,root);assert.equal((await f.call('search',{kind:'text',text:'target',fields:['title']})).total,1);
  }
  const f=setup({addons:[createTypoTolerance({fields:['title','body'],maxWorkUnits:1})]});await f.call('addMany',inputs);
  await assert.rejects(f.call('search',typo('targte')),{code:'WORK_LIMIT_EXCEEDED'});
  const plain=setup();await plain.call('addMany',inputs);
  const first=search(plain.engine.root,typo('targte')).value.extensions.typo.groups[0].workUnits;
  const shared=setup({addons:[createTypoTolerance({fields:['title','body'],maxWorkUnits:first+1})]});await shared.call('addMany',inputs);
  await assert.rejects(shared.call('search',{kind:'or',children:[typo('targte'),typo('targxe')]}),{code:'WORK_LIMIT_EXCEEDED'});
  const measured=search(plain.engine.root,typo('targte'));
  const core=setup({limits:{maxSearchWorkUnits:measured.units-1}});await core.call('addMany',inputs);
  await assert.rejects(core.call('search',typo('targte')),{code:'WORK_LIMIT_EXCEEDED'});
  const words='alpha bravo charlie delta echo foxtrot golf hotel india juliet';
  const tiny=setup({limits:{maxAdmissionEntries:128}});await tiny.call('add',{id:'a',text:{title:words}});
  await assert.rejects(tiny.call('search',typo(words)),{code:'LIMIT_EXCEEDED'});
  assert.equal((await tiny.call('search',typo(words.split(' ').slice(0,9).join(' ')))).total,1);
  const groups=setup({limits:{maxQueryGroups:1}});await groups.call('add',{id:'a',text:{title:'source'}});
  await assert.rejects(groups.call('search',{kind:'or',children:[{kind:'text',text:'sorce',fields:['title']},typo('sorce')]}),{code:'LIMIT_EXCEEDED'});
  const cap=setup();
  await cap.call('addMany',Array.from({length:15},(_,i)=>({id:String(i),text:{title:'aaa'+String.fromCharCode(98+i)}})));
  assert.equal((await cap.call('search',typo('aaaa'))).total,15);
  await cap.call('add',{id:'overflow',text:{title:'aaaq'}});
  await assert.rejects(cap.call('search',typo('aaaa')),{code:'LIMIT_EXCEEDED'});
});

test('complete dictionary/edit work cancels at every actual host suspension and recovers', async t => {
  let closed=0, steps=0;
  const native=createTypoTolerance({fields:['title']});
  const instrumented={...native,expansion:{...native.expansion,*expand(context){
    const cursor=native.expansion.expand(context);
    try {for(;;){const next=cursor.next();if(next.done)return next.value;steps++;yield next.value;}}
    finally {closed++;cursor.return([]);}
  }}};
  const f=setup({addons:[instrumented],limits:{checkpointWorkUnits:128}});
  await f.call('addMany',Array.from({length:24},(_,i)=>({id:String(i),text:{title:i===0?'source':'z'+String(i).padStart(5,'0')+'z'}})));
  const root=f.engine.root;
  const before=f.host.executed;await f.call('search',typo('sorce'));const suspensions=f.host.executed-before;
  assert.ok(suspensions>5 && steps>24);
  for(let stop=0;stop<suspensions;stop++){
    const signal=new FakeSignal();const request=f.engine.search(typo('sorce'),{signal});
    for(let i=0;i<stop;i++)assert.equal(f.host.runNext(),true);
    signal.stop(false);f.host.runReady();await assert.rejects(request,{code:'CANCELLED'});
    assert.equal(f.engine.root,root);assert.equal(f.host.pending,0);assert.equal(signal.listenerCount,0);
    assert.equal((await f.call('search','source')).total,1);
  }
  assert.ok(closed>1);
  const pending=f.engine.search(typo('sorce'),{deadlineMs:1});f.host.advance(1);f.host.runReady();await assert.rejects(pending,{code:'DEADLINE_EXCEEDED'});
  const disposing=f.engine.search(typo('sorce'));await f.call('dispose');await assert.rejects(disposing,{code:'DISPOSED'});assert.equal(f.host.pending,0);
  t.diagnostic(JSON.stringify({cancelledSuspensions:suspensions,providerCursorsClosed:closed}));
});

test('actual complete scans expose work and bounded candidate counts at 100/1000/10000 live terms', async t => {
  const rows=[];
  for(const size of [100,1000,10000]){
    const f=setup();const records=Array.from({length:size},(_,i)=>({id:String(i),text:{title:i===0?'target':i===1?'targle':i===2?'targue':'z'+String(i).padStart(5,'0')+'z'}}));
    for(let start=0;start<records.length;start+=256)await f.call('addMany',records.slice(start,start+256));
    const root=f.engine.root;const result=search(root,typo('targte'));const group=result.value.extensions.typo.groups[0];
    assert.equal(group.dictionaryEntriesVisited,size);assert.equal(group.alternatives.length,3);assert.equal(result.value.total,3);
    assert.equal(f.engine.root,root);assert.deepEqual(Object.keys(root.participants),[]);
    rows.push({liveDictionaryTerms:size,dictionaryEntriesVisited:group.dictionaryEntriesVisited,addonWorkUnits:group.workUnits,totalSearchWorkUnits:result.units,yieldedSteps:result.steps,peakAcceptedCandidates:group.alternatives.length,retainedOptionalIndexEntries:0});
    await f.call('dispose');
  }
  t.diagnostic(JSON.stringify({rows,scope:'Actual cursor work and logical candidate cardinalities. Accepted map grows monotonically to the returned count; no heap, allocation-byte, or physical-copy peak is measured.'}));
});
