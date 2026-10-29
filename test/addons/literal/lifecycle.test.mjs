import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaveldex} from '../../../dist/index.js';
import {createLiteral} from '../../../dist/addons/literal/index.js';
import {createSourceProvider} from '../../../dist/addons/phrases/source.js';
import {createPositionProvider} from '../../../dist/addons/positions/index.js';
import {setup as base,search} from '../typo/helpers.mjs';
import {FakeSignal} from '../../fixtures/execution/host.mjs';

const fields=['title','body'],schema={text:{title:{},body:{}}};
const literal=(text,selected=fields)=>({kind:'extension',capability:'literal',version:1,payload:{text,fields:selected}});
const setup=(overrides={})=>base({schema,addons:[createSourceProvider({fields}),createLiteral({fields})],...overrides});
const source=()=>createSourceProvider({fields});
const cap=(addon,maxWorkUnits)=>({...addon,manifest:{...addon.manifest,limits:{...addon.manifest.limits,maxWorkUnits}}});

test('source predicates capture disjoint handles and explicit source requirements before owner initialization',async()=>{
  const native=createLiteral({fields});
  for(const addon of [
    {...native,sourcePredicate:{...native.sourcePredicate,kind:'token-sequence'}},
    {...native,predicate:{capture(){},prepare(){}}},
    {...native,refinement:{kind:'exact-token-sequence',maxTokens:1,prepare(){}}},
    {...native,manifest:{...native.manifest,dataRequirements:{...native.manifest.dataRequirements,source:false}}},
    {...native,manifest:{...native.manifest,dataRequirements:{...native.manifest.dataRequirements,metadata:true}}},
    {...native,manifest:{...native.manifest,requires:[]}},
  ])assert.throws(()=>createRaveldex({schema,addons:[source(),addon]}),e=>['INCOMPATIBLE_CAPABILITY','MISSING_CAPABILITY'].includes(e.code));
  const surplus={...native,manifest:{...native.manifest,requires:[...native.manifest.requires,{id:'positions:title',contractVersion:1}]}};
  assert.throws(()=>createRaveldex({schema,addons:[source(),createPositionProvider({fields:['title']}),surplus]}),{code:'INCOMPATIBLE_CAPABILITY'});
  let reads=0;const handle={kind:'source-substring',capture:native.sourcePredicate.capture};Object.defineProperty(handle,'prepare',{enumerable:true,get(){reads++;return native.sourcePredicate.prepare;}});
  assert.throws(()=>createRaveldex({schema,addons:[source(),{...native,sourcePredicate:handle}]}),{code:'INCOMPATIBLE_CAPABILITY'});assert.equal(reads,0);
  const owned={...native.sourcePredicate},f=setup({addons:[source(),{...native,sourcePredicate:owned}]});owned.prepare=function*(){throw Error('must not use mutated callback')};
  await f.call('add',{id:'a',text:{body:'raw punctuation :: and fooBar'}});assert.equal((await f.call('search',literal('::'))).total,1);
});

test('literal shared lexical capture limits include every leaf and validate all branches before membership',async()=>{
  const f=setup();await f.call('add',{id:'a',text:{title:'foo',body:'bar'}});
  for(const query of [literal(''),literal('\ud800'),{kind:'or',children:[{kind:'all'},literal('\ud800')]},{kind:'and',children:[{kind:'none'},literal('')]}])
    await assert.rejects(f.call('search',query),{code:'INVALID_QUERY'});
  const text='x'.repeat(1020),query={kind:'and',children:[literal(text,['body']),literal(text,['body'])]};
  assert.equal((await f.call('search',query)).total,0,'Two text+field payloads fit exactly within 2048 lexical units');
  query.children.push(literal('x',['body']));await assert.rejects(f.call('search',query),{code:'LIMIT_EXCEEDED'});
  const punctuation='!'.repeat(300);await f.call('add',{id:'p',text:{body:punctuation}});
  assert.equal((await f.call('search',literal(punctuation,['body']))).total,1,'Raw literal is not constrained to a single basic token length');
});

test('one module budget spans every source leaf and optional evidence cursor with whole-operation refusal',async()=>{
  const native=createLiteral({fields}),observed={units:0};
  function* measure(cursor){try{for(;;){const step=cursor.next();if(step.done)return step.value;observed.units+=step.value.workUnits;yield step.value;}}finally{cursor.return(undefined);}}
  const addon={...native,sourcePredicate:{...native.sourcePredicate,
    *prepare(context){
      const prepared=yield* measure(native.sourcePredicate.prepare(context));
      return {*test(id){return yield* measure(prepared.test(id));}};
    },
  }};
  const f=setup({addons:[source(),addon]});await f.call('add',{id:'a',text:{body:'ababa'}});observed.units=0;await f.call('search',literal('aba',['body']));const one=observed.units;assert.ok(one>10);
  const narrow=setup({addons:[source(),cap(native,one)]});await narrow.call('add',{id:'a',text:{body:'ababa'}});const root=narrow.engine.root;
  assert.equal((await narrow.call('search',literal('aba',['body']))).total,1);
  await assert.rejects(narrow.call('search',{kind:'and',children:[literal('aba',['body']),literal('aba',['body'])]}),{code:'WORK_LIMIT_EXCEEDED'});
  await assert.rejects(narrow.call('search',literal('aba',['body']),{extensions:{literal:{ids:['a']}}}),{code:'WORK_LIMIT_EXCEEDED'});
  assert.equal(narrow.engine.root,root);assert.equal((await narrow.call('search',literal('aba',['body']))).total,1);
});

test('literal queued query and evidence admission owns text fields IDs and executes against the correct revision',async()=>{
  const f=setup({limits:{checkpointWorkUnits:1}});await f.call('add',{id:'a',text:{body:'fooBar'}});const old=f.engine.root,oldResult=search(old,literal('Bar')).value;
  const replace=f.engine.replace({id:'a',text:{body:'nextValue'}}),query=literal('Value',['body']),options={extensions:{literal:{ids:['a']}}},pending=f.engine.search(query,options);
  query.payload.text='Bar';query.payload.fields[0]='title';options.extensions.literal.ids[0]='absent';f.host.runReady();await replace;
  const result=await pending;assert.equal(result.revision,2);assert.equal(result.total,1);assert.equal(result.extensions.literal.documents[0].id,'a');assert.equal(result.extensions.literal.leaves[0].text,'Value');
  assert.deepEqual(search(old,literal('Bar')).value,oldResult);
  await f.call('remove','a');assert.equal((await f.call('search',literal('Value'))).total,0);await f.call('add',{id:'b',text:{body:'nextValue'}});await f.call('clear');assert.equal((await f.call('search',literal('Value'))).total,0);
});

test('literal cancellation closes every observed membership/evidence suspension, preserves roots and releases tasks',async t=>{
  const f=setup({limits:{checkpointWorkUnits:128}});await f.call('addMany',Array.from({length:8},(_,i)=>({id:String(i),text:{body:'red '.repeat(12)+'ababa 😀'}})));
  const query=literal('aba',['body']),options={extensions:{literal:{ids:['0','1']}}},root=f.engine.root,rows=[];
  for(const selected of [undefined,options]){const before=f.host.executed;await f.call('search',query,selected);const count=f.host.executed-before;assert.ok(count>2);
    for(let stop=0;stop<count;stop++){const signal=new FakeSignal(),pending=f.engine.search(query,{...selected,signal});for(let step=0;step<stop;step++)assert.equal(f.host.runNext(),true);signal.stop(false);f.host.runReady();await assert.rejects(pending,{code:'CANCELLED'});assert.equal(f.engine.root,root);assert.equal(signal.listenerCount,0);assert.equal(f.host.pending,0);}
    rows.push({evidence:!!selected,suspensions:count});}
  assert.equal((await f.call('search',query)).total,8);
  const deadline=f.engine.search(query,{deadlineMs:1});f.host.advance(1);f.host.runReady();await assert.rejects(deadline,{code:'DEADLINE_EXCEEDED'});
  const pending=f.engine.search(query);await f.call('dispose');await assert.rejects(pending,{code:'DISPOSED'});assert.equal(f.host.pending,0);
  t.diagnostic(JSON.stringify({rows,scope:'Actual deterministic host suspension cancellation/cleanup, not physical latency or peak memory'}));
});

test('reentrant source predicate stops precede work and later validation failures and close provider cursors',async()=>{
  const native=createLiteral({fields});
  for(const when of ['prepare','test-step','test-return']){const signal=new FakeSignal();let closed=0;
    const addon={...native,sourcePredicate:{...native.sourcePredicate,*prepare(context){try{
      if(when==='prepare'){signal.stop(false);yield{workUnits:2};}
      return{*test(){try{signal.stop(false);if(when==='test-step')yield{workUnits:2};return true;}finally{closed++;}}};
    }finally{if(when==='prepare')closed++;}}}};
    const f=setup({addons:[source(),cap(addon,1)]});await f.call('add',{id:'a',text:{body:'x'}});
    const query=when==='test-return'?{kind:'and',children:[literal('x'),literal('x')]}:literal('x');
    await assert.rejects(f.call('search',query,{signal}),{code:'CANCELLED'});assert.equal(closed,1);assert.equal(signal.listenerCount,0);assert.equal(f.host.pending,0);assert.equal(f.engine.root.revision,1);
  }
});

test('literal work measurements at 100/1000/10000 records count scans and explicit source retention separately',async t=>{
  const rows=[];for(const size of [100,1000,10000]){const f=setup();for(let start=0;start<size;start+=256)await f.call('addMany',Array.from({length:Math.min(256,size-start)},(_,i)=>({id:String(start+i),text:{body:i%2?'fooBar ababa':'red blue'}})));
    const request=literal('aba',['body']),result=search(f.engine.root,request);assert.equal(result.value.total,size/2);assert.deepEqual(Object.keys(f.engine.root.participants),['source']);
    rows.push({records:size,total:result.value.total,queryWorkUnits:result.units,yieldedSteps:result.steps,coreTokens:f.engine.root.counts.tokens,sourceCodeUnits:f.engine.root.participants.source.textCodeUnits,sourceLogicalEntries:f.engine.root.participants.source.retainedEntries,literalCorpusEntries:0});await f.call('dispose');}
  t.diagnostic(JSON.stringify({rows,scope:'Charged source scan work, native/source cardinalities and no literal side index. Not exclusive retained/peak bytes, copy peaks or default-host latency.'}));
});
