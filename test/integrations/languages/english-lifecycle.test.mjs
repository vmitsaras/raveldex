import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaveldex } from '../../../dist/index.js';
import { createEnglishAnalyzer, ENGLISH_ANALYZER } from '../../../dist/integrations/languages/english/index.js';
import { analyzeValue } from '../../../dist/core/analyzer/basic.js';
import { createAnalysis } from '../../../dist/core/analyzer/selected.js';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { createTypoTolerance } from '../../../dist/addons/typo/index.js';
import { createSynonyms } from '../../../dist/addons/synonyms/index.js';
import { createSuggestions } from '../../../dist/addons/suggestions/index.js';
import { setup as base, search, drain } from '../../addons/typo/helpers.mjs';
import { FakeSignal } from '../../fixtures/execution/host.mjs';

const setup = (overrides={})=>base({analyzer:ENGLISH_ANALYZER,addons:[createEnglishAnalyzer()],...overrides});
const cap = (addon,maximum)=>({...addon,manifest:{...addon.manifest,limits:{...addon.manifest.limits,maxWorkUnits:maximum}}});
const schema={text:{title:{},body:{}}};

test('analyzer selection is explicit, captured, bounded and rejects incompatible protocols without executing accessors', async () => {
  const registration=createEnglishAnalyzer(),f=setup({analyzer:{...ENGLISH_ANALYZER},addons:[registration]});
  assert.ok(Object.isFrozen(ENGLISH_ANALYZER)&&Object.isFrozen(registration)&&Object.isFrozen(registration.analyzer));
  assert.equal(f.engine.root.configuration.analyzer.id,'english-porter1980-v1');
  assert.deepEqual(Object.keys(f.engine.root.participants),[]);
  for(const configuration of [{schema,analyzer:ENGLISH_ANALYZER},{schema,analyzer:{...ENGLISH_ANALYZER,id:'english-missing-v2'},addons:[registration]},
    {schema,analyzer:{...ENGLISH_ANALYZER,environmentProfile:'invented'},addons:[registration]}])
    assert.throws(()=>createRaveldex(configuration),e=>['MISSING_CAPABILITY','INCOMPATIBLE_CAPABILITY'].includes(e.code));
  for(const addon of [{...registration,analyzer:{...registration.analyzer,kind:'graph'}},
    {...registration,manifest:{...registration.manifest,indexEffect:'none'}},
    {...registration,manifest:{...registration.manifest,roles:['analyzer','evidence']}},
    {...registration,analyzer:{...registration.analyzer,id:'basic-v1'}},
    {...registration,manifest:{...registration.manifest,provides:[{id:'analyzer:other',contractVersion:1}]}}])
    assert.throws(()=>createRaveldex({schema,addons:[addon]}),{code:'INCOMPATIBLE_CAPABILITY'});
  let reads=0;const implementation={kind:'single-token-transform',id:ENGLISH_ANALYZER.id};Object.defineProperty(implementation,'transform',{enumerable:true,get(){reads++;return registration.analyzer.transform}});
  assert.throws(()=>createRaveldex({schema,addons:[{...registration,analyzer:implementation}]}),{code:'INCOMPATIBLE_CAPABILITY'});assert.equal(reads,0);
  const handle={...registration.analyzer},selected={...ENGLISH_ANALYZER};const owned=setup({analyzer:selected,addons:[{...registration,analyzer:handle}]});
  handle.transform=function*(){return 'wrong'};selected.id='wrong';await owned.call('add',{id:'a',text:{title:'Running'}});
  assert.equal((await owned.call('search','run')).total,1);
});

test('selected analysis emits full original spans once and malformed transform output cannot publish', async () => {
  const c=captureConfiguration({schema,analyzer:ENGLISH_ANALYZER,addons:[createEnglishAnalyzer()]});
  const tokens=[];for(const step of createAnalysis(c)('😀 Ｒｕｎｎｉｎｇ café ½',2,c.limits))if(step.token)tokens.push(step.token);
  assert.deepEqual(tokens,[{term:'run',valueIndex:2,position:0,start:3,end:10},{term:'café',valueIndex:2,position:1,start:11,end:15},{term:'1⁄2',valueIndex:2,position:2,start:16,end:17}]);
  for(const output of ['', 'UPPER', '\ud800', 'x'.repeat(257)]){
    const native=createEnglishAnalyzer(),addon={...native,analyzer:{...native.analyzer,*transform(){yield {workUnits:1};return output}}};
    const f=setup({addons:[addon]}),root=f.engine.root;
    await assert.rejects(f.call('add',{id:'bad',text:{title:'running'}}),e=>['INCOMPATIBLE_CAPABILITY','LIMIT_EXCEEDED'].includes(e.code));assert.equal(f.engine.root,root);
  }
  const invalid=setup();await assert.rejects(invalid.call('add',{id:'a',text:{title:'bad\ud800'}}),{code:'INVALID_RECORD'});
  await invalid.call('add',{id:'a',text:{title:'running'}});await assert.rejects(invalid.call('search','bad\ud800'),{code:'INVALID_QUERY'});
  const narrow=setup({limits:{maxRawTokenCodeUnits:3}});await assert.rejects(narrow.call('add',{id:'a',text:{title:'runs'}}),{code:'LIMIT_EXCEEDED'});
});

test('one module budget spans tokens, values, records and provider analysis with complete rollback', async () => {
  const registration=createEnglishAnalyzer(),configuration=captureConfiguration({schema,analyzer:ENGLISH_ANALYZER,addons:[registration]});
  const units=drain(createAnalysis(configuration)('running',0,configuration.limits)).units-drain(analyzeValue('running',0,configuration.limits)).units-1;
  const narrow=cap(registration,units);
  const f=setup({addons:[narrow]});await f.call('add',{id:'a',text:{title:'running'}});const root=f.engine.root;
  for(const record of [{id:'b',text:{title:'running running'}},{id:'b',text:{title:['running','running']}}])await assert.rejects(f.call('add',record),{code:'WORK_LIMIT_EXCEEDED'});
  await assert.rejects(f.call('addMany',[{id:'b',text:{title:'running'}},{id:'c',text:{title:'running'}}]),{code:'WORK_LIMIT_EXCEEDED'});
  assert.equal(f.engine.root,root);assert.equal((await f.call('search','running')).total,1);
  const positions=setup({addons:[narrow,createPositionProvider({fields:['title'],offsets:['title']})]});
  await assert.rejects(positions.call('add',{id:'a',text:{title:'running'}}),{code:'WORK_LIMIT_EXCEEDED'});assert.equal(positions.engine.root.revision,0);
  const source=setup({addons:[cap(registration,units*2),createSourceProvider({fields:['title']}),createSourcePhrases({fields:['title']})]});
  await source.call('add',{id:'a',text:{title:'running running'}});
  await assert.rejects(source.call('search',{kind:'extension',capability:'phrases',version:1,payload:{text:'running running',fields:['title']}}),{code:'WORK_LIMIT_EXCEEDED'});
});

test('basic-only optional requests reject under English even when empty, without altering unrequested searches', async () => {
  const f=setup({addons:[createEnglishAnalyzer(),createTypoTolerance({fields:['title','body']}),createSynonyms({fields:['title','body'],vocabularyVersion:'v1',mappings:[]}),createSuggestions({fields:['title','body']})]});
  await f.call('add',{id:'a',text:{title:'running'}});
  for(const capability of ['typo','synonyms'])for(const text of ['', 'running'])
    await assert.rejects(f.call('search',{kind:'extension',capability,version:1,payload:{text}}),{code:'INCOMPATIBLE_CAPABILITY'});
  for(const text of ['', 'ru'])await assert.rejects(f.call('search','',{extensions:{suggestions:{text}}}),{code:'INCOMPATIBLE_CAPABILITY'});
  assert.equal((await f.call('search','run')).total,1);
});

test('queued owned English queries, mutations and retained roots stay at the correct analysis revision', async () => {
  const f=setup({limits:{checkpointWorkUnits:1}});await f.call('add',{id:'a',text:{title:'running'}});const root=f.engine.root,old=search(root,'run').value;
  const replacing=f.engine.replace({id:'a',text:{title:'searching'}}),query={kind:'text',text:'searches',fields:['title']};const request=f.engine.search(query);query.text='run';query.fields[0]='body';
  f.host.runReady();await replacing;const result=await request;assert.equal(result.revision,2);assert.equal(result.total,1);
  await f.call('remove',['a']);assert.equal((await f.call('search','search')).total,0);await f.call('add',{id:'b',text:{title:'search'}});await f.call('clear');assert.equal((await f.call('search','search')).total,0);
  assert.deepEqual(search(root,'run').value,old);
});

test('English cancellation closes every observed suspension and precedes a reentrant module-work failure', async t => {
  let closed=0;const native=createEnglishAnalyzer(),observed={...native,analyzer:{...native.analyzer,*transform(term){try{return yield* native.analyzer.transform(term)}finally{closed++}}}};
  const f=setup({addons:[observed],limits:{checkpointWorkUnits:128}});await f.call('addMany',Array.from({length:12},(_,i)=>({id:String(i),text:{title:'Running searches'}})));
  const root=f.engine.root,before=f.host.executed;await f.call('search','search');const suspensions=f.host.executed-before;assert.ok(suspensions>3);
  for(let stop=0;stop<suspensions;stop++){
    const signal=new FakeSignal(),request=f.engine.search('search',{signal});for(let i=0;i<stop;i++)assert.equal(f.host.runNext(),true);
    signal.stop(false);f.host.runReady();await assert.rejects(request,{code:'CANCELLED'});assert.equal(f.engine.root,root);assert.equal(signal.listenerCount,0);assert.equal(f.host.pending,0);
    assert.equal((await f.call('search','run')).total,12);
  }
  const signal=new FakeSignal(),reentrant={...native,analyzer:{...native.analyzer,*transform(){signal.stop(false);yield {workUnits:2};return 'run'}}};
  const failed=setup({addons:[cap(reentrant,1)]});await assert.rejects(failed.call('add',{id:'a',text:{title:'running'}},{signal}),{code:'CANCELLED'});assert.equal(failed.engine.root.revision,0);assert.equal(signal.listenerCount,0);
  const deadline=f.engine.search('search',{deadlineMs:1});f.host.advance(1);f.host.runReady();await assert.rejects(deadline,{code:'DEADLINE_EXCEEDED'});
  const pending=f.engine.search('search');await f.call('dispose');await assert.rejects(pending,{code:'DISPOSED'});assert.equal(f.host.pending,0);assert.ok(closed>1);
  t.diagnostic(JSON.stringify({cancelledSuspensions:suspensions,providerCursorsClosed:closed}));
});

test('English operation costs at admitted 100/1000/10000 records are charged logical work, not memory peaks', async t => {
  const rows=[];
  for(const size of [100,1000,10000]){
    const f=setup();const before=f.host.executed;
    for(let offset=0;offset<size;offset+=256)await f.call('addMany',Array.from({length:Math.min(256,size-offset)},(_,i)=>({id:String(offset+i),text:{title:i%2?'running searches':'run search'}})));
    const result=search(f.engine.root,'runs searches');assert.equal(result.value.total,size);assert.deepEqual(Object.keys(f.engine.root.participants),[]);
    rows.push({records:size,tokens:f.engine.root.counts.tokens,dictionaryEntries:f.engine.root.counts.dictionaryEntries,searchWorkUnits:result.units,searchYieldedSteps:result.steps,mutationHostTasks:f.host.executed-before,corpusSideIndexEntries:0});
    await f.call('dispose');
  }
  t.diagnostic(JSON.stringify({rows,scope:'Actual cursor work/cardinalities and host task count. Constant optional algorithm tables remain retained module code/data; no heap/allocation/transport peak or physical latency claim.'}));
});
