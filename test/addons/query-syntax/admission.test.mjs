import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuerySyntax,QuerySyntaxError,QUERY_SYNTAX_ERROR_CODES} from '../../../dist/addons/query-syntax/index.js';
import {createSourceProvider,createSourcePhrases} from '../../../dist/addons/phrases/index.js';

const schema={text:{body:{}}};
function analyzer(transform,maxWorkUnits=1000){return{manifest:{id:'syntax-review',version:'0.1.0',contractVersion:1,roles:['analyzer'],provides:[{id:'analyzer:syntax-review-v1',contractVersion:1}],requires:[],dataRequirements:{fields:[],source:false,positions:false,offsets:false,metadata:false},indexEffect:'analysis',rebuildPolicy:'new-index',execution:{direct:true,worker:false},limits:{maxPayloadCodeUnits:16384,maxWorkUnits,maxRetainedEntries:0,maxOutputEntries:0},costs:{importedCode:'Independent parser admission probe',retainedRepresentation:'none',transientWork:'Bounded generator probes',externalResources:'none'}},analyzer:{kind:'single-token-transform',id:'syntax-review-v1',transform}};}
const config=addon=>({schema,analyzer:{id:'syntax-review-v1',environmentProfile:'unqualified'},addons:[addon]});

test('syntax configuration capture owns bound callbacks and never initializes or prepares selected source providers',()=>{
  let initialized=0,prepared=0,transformed=0;
  const source=createSourceProvider({fields:['body']}),phrases=createSourcePhrases({fields:['body']});
  const configuration={schema,addons:[{...source,participant:{initialize(){initialized++;throw Error('must not initialize');},*prepare(){prepared++;throw Error('must not prepare');}}},{...phrases,refinement:{...phrases.refinement,*prepare(){prepared++;throw Error('must not refine');}}}]};
  const parser=createQuerySyntax({configuration});configuration.schema={text:{lost:{}}};configuration.addons.length=0;
  assert.deepEqual(parser.parse('body:"red blue"'),{kind:'extension',capability:'phrases',version:1,payload:{text:'red blue',fields:['body']}});assert.equal(initialized,0);assert.equal(prepared,0);
  const implementation=analyzer(function*(term){transformed++;yield{workUnits:1};return term;});
  const selected=createQuerySyntax({configuration:config(implementation)});implementation.analyzer.transform=function*(){throw Error('mutated callback');};
  assert.deepEqual(selected.parse('red'),{kind:'text',text:'red'});assert.equal(transformed,1);
});

test('every cooperative zero-work native advance consumes parser budget and overrun closes nested analyzer cursors',()=>{
  let yielded=0,closed=0;
  const addon=analyzer(function*(term){try{for(let index=0;index<1000;index++){yielded++;yield{workUnits:0};}return term;}finally{closed++;}});
  const parser=createQuerySyntax({configuration:config(addon),maxWorkUnits:128});
  assert.throws(()=>parser.parse('red'),error=>{assert.ok(error instanceof QuerySyntaxError);assert.equal(error.code,'WORK_LIMIT_EXCEEDED');assert.equal(error.details.limit,128);assert.ok(error.details.actual>128);return true;});
  assert.ok(yielded>0&&yielded<1000);assert.equal(closed,1);
  const invalid=createQuerySyntax({configuration:config(analyzer(function*(){yield{workUnits:-1};return 'red';}))});
  assert.throws(()=>invalid.parse('red'),error=>{assert.equal(error.code,'NATIVE_QUERY_ERROR');assert.equal(error.details.nativeCode,'INTERNAL_ERROR');return true;});
});

test('native exception diagnostics are fixed and never invoke thrown code getters or retain exception text and causes',()=>{
  const secret='privateToken<img src=x onerror=alert(1)>';let reads=0;
  const getter=Object.defineProperty(new Error(secret),'code',{get(){reads++;throw Error(secret);}});
  for(const thrown of [new Error(secret),getter,{code:secret,message:secret,cause:secret},new Proxy({},{getOwnPropertyDescriptor(){throw Error(secret);}})]){
    const parser=createQuerySyntax({configuration:config(analyzer(function*(){throw thrown;}))});
    assert.throws(()=>parser.parse('privateToken'),error=>{assert.ok(error instanceof QuerySyntaxError);assert.equal(error.code,'NATIVE_QUERY_ERROR');assert.equal(error.message,'Raveldex query syntax: NATIVE_QUERY_ERROR');assert.deepEqual(error.details,{span:{start:0,end:12}});assert.equal(Object.hasOwn(error,'cause'),false);assert.equal(Object.hasOwn(error,'query'),false);assert.equal(JSON.stringify(error).includes(secret),false);assert.equal(error.stack.includes(secret),false);assert.ok(Object.isFrozen(error.details)&&Object.isFrozen(error.details.span));return true;});
  }
  assert.equal(reads,0);assert.ok(Object.isFrozen(QUERY_SYNTAX_ERROR_CODES));
});

test('selected analyzer and native token limits are independent on every parse and never rewrite returned raw text',()=>{
  let calls=0;const addon=analyzer(function*(term){calls++;yield{workUnits:1};return term;},32),configuration=config(addon);
  const parser=createQuerySyntax({configuration});for(let index=0;index<20;index++)assert.deepEqual(parser.parse('RED'),{kind:'text',text:'RED'});assert.equal(calls,20);
  const reduced=createQuerySyntax({configuration:{...configuration,limits:{maxQueryTokens:1}}});
  assert.throws(()=>reduced.parse('red AND blue'),error=>{assert.equal(error.code,'NATIVE_QUERY_ERROR');assert.equal(error.details.nativeCode,'LIMIT_EXCEEDED');assert.deepEqual(error.details.span,{start:0,end:12});return true;});
  assert.deepEqual(reduced.parse('red'),{kind:'text',text:'red'});
});
