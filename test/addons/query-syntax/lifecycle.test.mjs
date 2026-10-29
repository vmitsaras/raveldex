import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaveldex} from '../../../dist/index.js';
import {createQuerySyntax,QuerySyntaxError} from '../../../dist/addons/query-syntax/index.js';
import {createSourceProvider,createSourcePhrases} from '../../../dist/addons/phrases/index.js';
import {createEnglishAnalyzer,ENGLISH_ANALYZER} from '../../../dist/integrations/languages/english/index.js';
import {setup as base,search} from '../typo/helpers.mjs';
import {FakeSignal} from '../../fixtures/execution/host.mjs';

const fields=['title','body'],schema={text:{title:{},body:{}}};
const configuration=()=>({schema,addons:[createSourceProvider({fields}),createSourcePhrases({fields})]});
const setup=(overrides={})=>base({...configuration(),...overrides});
const syntax=(overrides={})=>createQuerySyntax({configuration:configuration(),...overrides});
const released=(fixture,signal)=>{assert.equal(fixture.host.pending,0);if(signal)assert.equal(signal.listenerCount,0);};
const frozen=value=>{if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const item of Object.values(value))frozen(item);}};
const syntaxFailure=(callback,code,nativeCode)=>assert.throws(callback,error=>{assert.ok(error instanceof QuerySyntaxError);assert.equal(error.code,code);if(nativeCode)assert.equal(error.details.nativeCode,nativeCode);return true;});

test('parser captures configuration without initializing participants and keeps immutable independent raw query trees',()=>{
  let initialized=0;const source=createSourceProvider({fields}),addon={...source,participant:{...source.participant,initialize(){initialized++;throw Error('Parser must not initialize a corpus');}}};
  const original={schema:{text:{title:{},body:{}}},addons:[addon,createSourcePhrases({fields})]},parser=createQuerySyntax({configuration:original});
  const first=parser.parse('title:(RED OR "red blue") AND NOT body:green');frozen(parser);frozen(first);assert.equal(initialized,0);
  delete original.schema.text.title;original.schema.text.injected={};original.addons.length=0;
  assert.deepEqual(parser.parse('title:(RED OR "red blue") AND NOT body:green'),first);syntaxFailure(()=>parser.parse('injected:red'),'UNKNOWN_FIELD');
  assert.throws(()=>{first.children.push({kind:'all'});},TypeError);
  const second=parser.parse('title:(RED OR "red blue") AND NOT body:green');assert.notEqual(first,second);assert.notEqual(first.children,second.children);assert.equal(initialized,0);
});

test('raw syntax and native AST bounds are independent complete refusals and parser remains usable after errors',()=>{
  assert.deepEqual(syntax({maxInputCodeUnits:3}).parse('red'),{kind:'text',text:'red'});syntaxFailure(()=>syntax({maxInputCodeUnits:3}).parse('blue'),'LIMIT_EXCEEDED');
  assert.equal(syntax({maxTokens:3}).parse('red AND blue').kind,'and');syntaxFailure(()=>syntax({maxTokens:2}).parse('red AND blue'),'LIMIT_EXCEEDED');
  syntaxFailure(()=>syntax({maxDepth:1}).parse('((red))'),'LIMIT_EXCEEDED');syntaxFailure(()=>syntax({maxDepth:1}).parse('NOT NOT red'),'LIMIT_EXCEEDED');
  for(const limits of [{maxQueryNodes:2},{maxQueryTokens:1},{maxQueryGroups:1}])syntaxFailure(()=>syntax({configuration:{...configuration(),limits}}).parse('red AND blue'),'NATIVE_QUERY_ERROR','LIMIT_EXCEEDED');
  const parser=syntax();for(const text of ['red blue','red AND','(red','"red','red XOR blue','unknown:red','red**','\ud800'])assert.throws(()=>parser.parse(text),QuerySyntaxError);
  assert.deepEqual(parser.parse('red'),{kind:'text',text:'red'});assert.deepEqual(parser.parse('   '),{kind:'none'});
  const plain=createQuerySyntax({configuration:{schema}});syntaxFailure(()=>plain.parse('"red blue"'),'NATIVE_QUERY_ERROR','MISSING_CAPABILITY');
  assert.equal(plain.parse('red').kind,'text');
});

test('work ceilings are measured by exact whole-parse admission and selected analyzer cursors close on budget refusal',t=>{
  const rows=[];
  for(const text of ['red','red AND blue','title:(red OR blue) AND NOT "red blue"']){
    let low=1,high=100000;assert.ok(syntax({maxWorkUnits:high}).parse(text));
    while(low<high){const middle=Math.floor((low+high)/2);try{syntax({maxWorkUnits:middle}).parse(text);high=middle;}catch(error){assert.ok(error instanceof QuerySyntaxError);assert.equal(error.code,'WORK_LIMIT_EXCEEDED');low=middle+1;}}
    assert.ok(low>1);assert.ok(syntax({maxWorkUnits:low}).parse(text));syntaxFailure(()=>syntax({maxWorkUnits:low-1}).parse(text),'WORK_LIMIT_EXCEEDED');rows.push({inputCodeUnits:text.length,minimumAdmittedWorkUnits:low});
  }
  let closed=0;const english=createEnglishAnalyzer(),slow={...english,analyzer:{...english.analyzer,*transform(term){try{for(let i=0;i<1000;i++)yield{workUnits:1};return term;}finally{closed++;}}}};
  const parser=createQuerySyntax({configuration:{schema,analyzer:ENGLISH_ANALYZER,addons:[slow]},maxWorkUnits:100});syntaxFailure(()=>parser.parse('red'),'WORK_LIMIT_EXCEEDED');assert.equal(closed,1);
  t.diagnostic(JSON.stringify({rows,scope:'Deterministic charged admission thresholds, including native analysis. Not heap/allocation bytes, physical latency or asynchronous cancellation.'}));
});

test('safe diagnostics do not retain or echo hostile input or trusted analyzer exception text',()=>{
  const parser=syntax(),secret='<script>private diagnostic needle</script>';
  for(const text of [secret,`missing:${secret}`,'red AND <unsafe>','"unfinished <unsafe>']){
    let caught;try{parser.parse(text);}catch(error){caught=error;}assert.ok(caught instanceof QuerySyntaxError);frozen(caught.details);frozen(caught.details.span);
    assert.ok(!JSON.stringify(caught).includes('script'));assert.ok(!caught.message.includes(text));for(const key of ['input','query','source','cause'])assert.equal(Object.hasOwn(caught,key),false);
  }
  const english=createEnglishAnalyzer(),bad={...english,analyzer:{...english.analyzer,*transform(){throw Error(secret);}}},throwing=createQuerySyntax({configuration:{schema,analyzer:ENGLISH_ANALYZER,addons:[bad]}});
  let caught;try{throwing.parse('red');}catch(error){caught=error;}assert.ok(caught instanceof QuerySyntaxError);assert.equal(caught.code,'NATIVE_QUERY_ERROR');assert.ok(!caught.message.includes(secret));assert.ok(!JSON.stringify(caught).includes(secret));assert.equal(Object.hasOwn(caught,'cause'),false);
  let reads=0;const input={toString(){reads++;return'red';}};syntaxFailure(()=>parser.parse(input),'INVALID_INPUT');assert.equal(reads,0);
});

test('parsed trees execute against FIFO revisions and mutations without parser corpus retention or hidden string activation',async()=>{
  const config=configuration(),parser=createQuerySyntax({configuration:config}),f=setup();await f.call('add',{id:'a',text:{body:'red blue'}});const old=f.engine.root,query=parser.parse('"red blue" OR green'),oldResult=search(old,query).value;
  const replace=f.engine.replace({id:'a',text:{body:'green'}}),pending=f.engine.search(query);f.host.runReady();await replace;const result=await pending;assert.equal(result.revision,2);assert.equal(result.total,1);assert.deepEqual(search(old,query).value,oldResult);
  assert.equal((await f.call('search','red OR green')).total,0,'Ordinary string query still requires red/or/green native terms');
  await f.call('remove','a');assert.equal((await f.call('search',parser.parse('red OR green'))).total,0);await f.call('add',{id:'b',text:{body:'red blue'}});assert.equal((await f.call('search',query)).total,1);await f.call('clear');assert.equal((await f.call('search',query)).total,0);
  assert.deepEqual(Object.keys(f.engine.root.participants),['source']);await f.call('dispose');released(f);
});

test('parsed native searches retain all observed cancellation stops, deadlines, cleanup and disposal',async t=>{
  const parser=syntax(),query=parser.parse('body:red AND NOT title:missing'),f=setup({limits:{checkpointWorkUnits:128}});await f.call('addMany',Array.from({length:6},(_,i)=>({id:String(i),text:{body:'red blue '.repeat(12)}})));
  const root=f.engine.root,before=f.host.executed;await f.call('search',query);const count=f.host.executed-before;assert.ok(count>1);
  for(let stop=0;stop<count;stop++){const signal=new FakeSignal(),pending=f.engine.search(query,{signal});for(let i=0;i<stop;i++)assert.equal(f.host.runNext(),true);signal.stop(false);f.host.runReady();await assert.rejects(pending,{code:'CANCELLED'});assert.equal(f.engine.root,root);released(f,signal);}
  const expired=f.engine.search(query,{deadlineMs:1});f.host.advance(1);f.host.runReady();await assert.rejects(expired,{code:'DEADLINE_EXCEEDED'});released(f);
  const pending=f.engine.search(query);await f.call('dispose');await assert.rejects(pending,{code:'DISPOSED'});assert.equal(f.engine.root,undefined);released(f);assert.equal(parser.parse('red').kind,'text');
  t.diagnostic(JSON.stringify({observedSearchSuspensions:count,scope:'Native queued execution after synchronous parsing; no asynchronous parse cancellation claim.'}));
});

test('destination engine still validates compiled queries against actual installed capabilities',async()=>{
  const parser=syntax(),engine=createRaveldex({schema});try{await engine.add({id:'a',text:{body:'red blue'}});await assert.rejects(engine.search(parser.parse('"red blue"')),{code:'MISSING_CAPABILITY'});assert.equal((await engine.search(parser.parse('red AND blue'))).total,1);}finally{await engine.dispose();}
});
