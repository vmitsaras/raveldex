import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaveldex} from '../../../dist/index.js';
import {createIdentifierAnalyzer,IDENTIFIER_ANALYZER} from '../../../dist/addons/identifiers/index.js';
import {createAnalysis} from '../../../dist/core/analyzer/selected.js';
import {captureConfiguration} from '../../../dist/core/contracts/schema.js';
import {createSourceProvider,createSourcePhrases} from '../../../dist/addons/phrases/index.js';
import {createPositionProvider} from '../../../dist/addons/positions/index.js';
import {createTypoTolerance} from '../../../dist/addons/typo/index.js';
import {createSynonyms} from '../../../dist/addons/synonyms/index.js';
import {createSuggestions} from '../../../dist/addons/suggestions/index.js';
import {setup as base,search,drain} from '../typo/helpers.mjs';
import {FakeSignal} from '../../fixtures/execution/host.mjs';

const schema={text:{title:{},body:{}},metadata:{category:{type:'string'}}};
const setup=(overrides={})=>base({schema,analyzer:IDENTIFIER_ANALYZER,addons:[createIdentifierAnalyzer()],...overrides});
const cap=(addon,maxWorkUnits)=>({...addon,manifest:{...addon.manifest,limits:{...addon.manifest.limits,maxWorkUnits}}});

test('identifier selection and captured raw callbacks cannot change the basic default or accept mixed analysis protocols',async()=>{
  const native=createIdentifierAnalyzer();
  assert.ok(Object.isFrozen(native)&&Object.isFrozen(native.analyzer)&&Object.isFrozen(IDENTIFIER_ANALYZER));
  assert.throws(()=>createRaveldex({schema,analyzer:IDENTIFIER_ANALYZER}),{code:'MISSING_CAPABILITY'});
  for(const analyzer of [{...native.analyzer,kind:'graph'},{...native.analyzer,transform(){return 'x'}},{...native.analyzer,id:'basic-v1'},
    {...native.analyzer,id:'custom-identifiers-v2'}, {kind:'single-token-transform',id:IDENTIFIER_ANALYZER.id,*transform(term){return term}}])
    assert.throws(()=>createRaveldex({schema,addons:[{...native,analyzer}]}),{code:'INCOMPATIBLE_CAPABILITY'});
  let reads=0;const getter={kind:'identifier-tokenizer',id:IDENTIFIER_ANALYZER.id};Object.defineProperty(getter,'analyze',{enumerable:true,get(){reads++;return native.analyzer.analyze;}});
  assert.throws(()=>createRaveldex({schema,addons:[{...native,analyzer:getter}]}),{code:'INCOMPATIBLE_CAPABILITY'});assert.equal(reads,0);
  const handle={...native.analyzer},descriptor={...IDENTIFIER_ANALYZER},f=setup({analyzer:descriptor,addons:[{...native,analyzer:handle}]});
  handle.analyze=function*(){throw Error('mutated')};descriptor.id='wrong';
  await f.call('add',{id:'a',text:{title:'fooBar WORK_LIMIT'},metadata:{category:'fooBar'}});
  assert.equal((await f.call('search','foo bar')).total,1);assert.equal((await f.call('search','fooBar')).total,1);
  assert.equal((await f.call('search','WORK_LIMIT')).total,1);assert.equal((await f.call('search',{kind:'eq',field:'category',value:'foobar'})).total,0);
  const unselected=base({schema,addons:[native]});await unselected.call('add',{id:'a',text:{title:'fooBar WORK_LIMIT'}});
  assert.equal((await unselected.call('search','foo')).total,0);assert.equal((await unselected.call('search','work limit')).total,1);
});

test('invalid raw-tokenizer output, malformed UTF16 and bounds reject without publishing a root',async()=>{
  const native=createIdentifierAnalyzer(),good={term:'foobar',valueIndex:0,position:0,start:0,end:6,kind:'original'};
  const bad=[{...good,term:'wrong'},{...good,start:1},{...good,position:1},{...good,kind:'component'},
    {...good,kind:'original',original:{term:'foobar',start:0,end:6}},{...good,extra:true}];
  for(const token of bad){const f=setup({addons:[{...native,analyzer:{...native.analyzer,*analyze(){yield {workUnits:1,token:Object.freeze(token)}}}}]});
    const root=f.engine.root;await assert.rejects(f.call('add',{id:'a',text:{title:'fooBar'}}),{code:'INCOMPATIBLE_CAPABILITY'});assert.equal(f.engine.root,root);}
  const component=Object.freeze({term:'foo',valueIndex:0,position:0,start:0,end:3,kind:'component',original:Object.freeze({term:'foobar',start:0,end:6})});
  const duplicate=setup({addons:[{...native,analyzer:{...native.analyzer,*analyze(){yield {workUnits:1,token:Object.freeze(good)};yield {workUnits:1,token:component};yield {workUnits:1,token:component};}}}]});
  await assert.rejects(duplicate.call('add',{id:'a',text:{title:'fooBar'}}),{code:'INCOMPATIBLE_CAPABILITY'});assert.equal(duplicate.engine.root.revision,0);
  const f=setup();await assert.rejects(f.call('add',{id:'a',text:{title:'fooBar\ud800'}}),{code:'INVALID_RECORD'});
  await assert.rejects(f.call('search','fooBar\ud800'),{code:'INVALID_QUERY'});assert.equal(f.engine.root.revision,0);
  const narrow=setup({limits:{maxRawTokenCodeUnits:5}});await assert.rejects(narrow.call('add',{id:'a',text:{title:'fooBar'}}),{code:'LIMIT_EXCEEDED'});
  const tokens=setup({limits:{maxTokensPerRecord:2}});await assert.rejects(tokens.call('add',{id:'a',text:{title:'aB'}}),{code:'LIMIT_EXCEEDED'});assert.equal(tokens.engine.root.revision,0);
});

test('one identifier module budget spans values, batch records and provider reanalysis',async()=>{
  const native=createIdentifierAnalyzer(),c=captureConfiguration({schema,analyzer:IDENTIFIER_ANALYZER,addons:[native]}),one=drain(createAnalysis(c)('fooBar',0,c.limits)).units;
  const limited=cap(native,one),f=setup({addons:[limited]});await f.call('add',{id:'a',text:{title:'fooBar'}});const root=f.engine.root;
  for(const record of [{id:'b',text:{title:['fooBar','fooBar']}},{id:'b',text:{title:'fooBar fooBar'}}])await assert.rejects(f.call('add',record),{code:'WORK_LIMIT_EXCEEDED'});
  await assert.rejects(f.call('addMany',[{id:'b',text:{title:'fooBar'}},{id:'c',text:{title:'fooBar'}}]),{code:'WORK_LIMIT_EXCEEDED'});assert.equal(f.engine.root,root);
  const p=setup({addons:[limited,createPositionProvider({fields:['title'],offsets:['title']})]});await assert.rejects(p.call('add',{id:'a',text:{title:'fooBar'}}),{code:'WORK_LIMIT_EXCEEDED'});assert.equal(p.engine.root.revision,0);
  assert.equal((await f.call('search','foo')).total,1);
});

test('raw tokenizer steps and frozen occurrence accessors are rejected before reading or committing them',async()=>{
  const native=createIdentifierAnalyzer(),good={term:'foobar',valueIndex:0,position:0,start:0,end:6,kind:'original'};
  for(const field of ['term','position','start','end','original']){
    let reads=0;const token={...good};Object.defineProperty(token,field,{enumerable:true,get(){reads++;return field==='term'?'foobar':0;}});Object.freeze(token);
    const f=setup({addons:[{...native,analyzer:{...native.analyzer,*analyze(){yield {workUnits:1,token};}}}]});
    await assert.rejects(f.call('add',{id:'a',text:{title:'fooBar'}}),{code:'INCOMPATIBLE_CAPABILITY'});assert.equal(reads,0);assert.equal(f.engine.root.revision,0);
  }
  for(const kind of ['step-getter','origin-getter','symbol','zero-work']){
    let reads=0;const token={...good},origin={term:'foobar',start:0,end:6},step={workUnits:1,token};
    if(kind==='step-getter')Object.defineProperty(step,'token',{enumerable:true,get(){reads++;return token;}});
    if(kind==='origin-getter'){token.kind='component';token.term='foo';token.end=3;Object.defineProperty(origin,'term',{enumerable:true,get(){reads++;return 'foobar'}});token.original=Object.freeze(origin);}
    if(kind==='symbol')token[Symbol('unexpected')]=true;
    if(kind==='zero-work')step.workUnits=0;
    const f=setup({addons:[{...native,analyzer:{...native.analyzer,*analyze(){yield step;}}}]});await assert.rejects(f.call('add',{id:'a',text:{title:'fooBar'}}),{code:'INCOMPATIBLE_CAPABILITY'});assert.equal(reads,0);assert.equal(f.engine.root.revision,0);
  }
});

test('basic-only expansion and dictionary requests refuse selected identifiers even for empty leaves',async()=>{
  const f=setup({addons:[createIdentifierAnalyzer(),createTypoTolerance({fields:['title']}),createSynonyms({fields:['title'],vocabularyVersion:'v1',mappings:[]}),createSuggestions({fields:['title']})]});
  await f.call('add',{id:'a',text:{title:'fooBar'}});
  for(const capability of ['typo','synonyms'])for(const text of ['foo',''])await assert.rejects(f.call('search',{kind:'extension',capability,version:1,payload:{text,fields:['title']}}),{code:'INCOMPATIBLE_CAPABILITY'});
  for(const text of ['foo',''])await assert.rejects(f.call('search','foo',{extensions:{suggestions:{text,fields:['title']}}}),{code:'INCOMPATIBLE_CAPABILITY'});
  assert.equal((await f.call('search','foo bar')).total,1);
});

test('queued query ownership, atomic replacement and retained prior roots preserve identifier revisions',async()=>{
  const f=setup({limits:{checkpointWorkUnits:1}});await f.call('add',{id:'a',text:{title:'fooBar'}});const old=f.engine.root,oldResult=search(old,'foo').value;
  const replace=f.engine.replace({id:'a',text:{title:'nextValue'}}),query={kind:'text',text:'next value',fields:['title']},pending=f.engine.search(query);
  query.text='foo';query.fields[0]='body';f.host.runReady();await replace;const result=await pending;assert.equal(result.revision,2);assert.equal(result.total,1);
  assert.deepEqual(search(old,'foo').value,oldResult);assert.equal((await f.call('search','foo')).total,0);
  await f.call('remove','a');assert.equal((await f.call('search','next')).total,0);await f.call('add',{id:'b',text:{title:'nextValue'}});await f.call('clear');assert.equal((await f.call('search','next')).total,0);
});

test('identifier operations close every observed cancellation suspension and prioritize reentrant stops',async t=>{
  const f=setup({limits:{checkpointWorkUnits:128}});await f.call('addMany',Array.from({length:10},(_,i)=>({id:String(i),text:{title:'fooBar WORK_LIMIT'}})));
  const root=f.engine.root,before=f.host.executed;await f.call('search','foo bar');const suspensions=f.host.executed-before;assert.ok(suspensions>2);
  for(let stop=0;stop<suspensions;stop++){const signal=new FakeSignal(),pending=f.engine.search('foo bar',{signal});for(let i=0;i<stop;i++)assert.equal(f.host.runNext(),true);signal.stop(false);f.host.runReady();await assert.rejects(pending,{code:'CANCELLED'});assert.equal(f.engine.root,root);assert.equal(signal.listenerCount,0);assert.equal(f.host.pending,0);}
  const beforeAdd=f.host.executed;await f.call('add',{id:'added',text:{title:'nextValue'}});const mutationSuspensions=f.host.executed-beforeAdd;await f.call('remove','added');
  for(let stop=0;stop<mutationSuspensions;stop++){const signal=new FakeSignal(),previous=f.engine.root,pending=f.engine.add({id:'added',text:{title:'nextValue'}},{signal});for(let i=0;i<stop;i++)assert.equal(f.host.runNext(),true);signal.stop(false);f.host.runReady();await assert.rejects(pending,{code:'CANCELLED'});assert.equal(f.engine.root,previous);assert.equal(signal.listenerCount,0);assert.equal(f.host.pending,0);}
  const native=createIdentifierAnalyzer(),signal=new FakeSignal();let closed=0;
  const reentrant=setup({addons:[cap({...native,analyzer:{...native.analyzer,*analyze(){try{signal.stop(false);yield {workUnits:2};}finally{closed++}}}},1)]});
  await assert.rejects(reentrant.call('add',{id:'a',text:{title:'x'}},{signal}),{code:'CANCELLED'});assert.equal(closed,1);assert.equal(reentrant.engine.root.revision,0);
  const deadline=f.engine.search('foo',{deadlineMs:1});f.host.advance(1);f.host.runReady();await assert.rejects(deadline,{code:'DEADLINE_EXCEEDED'});
  const pending=f.engine.search('foo');await f.call('dispose');await assert.rejects(pending,{code:'DISPOSED'});assert.equal(f.host.pending,0);
  t.diagnostic(JSON.stringify({searchSuspensions:suspensions,mutationSuspensions,scope:'Observed fake-host suspension cancellation, no latency/memory claim'}));
});

test('identifier costs at 100/1000/10000 records count derived index entries without a hidden optional corpus cache',async t=>{
  const rows=[];
  for(const size of [100,1000,10000]){const f=setup(),before=f.host.executed;for(let at=0;at<size;at+=256)await f.call('addMany',Array.from({length:Math.min(256,size-at)},(_,i)=>({id:String(at+i),text:{title:'fooBar'}})));
    const actual=search(f.engine.root,'foo bar');assert.equal(actual.value.total,size);assert.equal(f.engine.root.counts.tokens,size*3);assert.deepEqual(Object.keys(f.engine.root.participants),[]);
    rows.push({records:size,tokens:f.engine.root.counts.tokens,dictionaryEntries:f.engine.root.counts.dictionaryEntries,searchWorkUnits:actual.units,searchSteps:actual.steps,mutationHostTasks:f.host.executed-before});await f.call('dispose');}
  t.diagnostic(JSON.stringify({rows,scope:'Logical derived-term index cardinalities and actual cursor work, not retained/peak heap bytes or physical latency'}));
});
