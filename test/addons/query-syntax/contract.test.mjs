import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuerySyntax,QuerySyntaxError,QUERY_SYNTAX_ERROR_CODES,QUERY_SYNTAX_POLICY} from '../../../dist/addons/query-syntax/index.js';
import {createSourceProvider,createSourcePhrases} from '../../../dist/addons/phrases/index.js';
import {createEnglishAnalyzer,ENGLISH_ANALYZER} from '../../../dist/integrations/languages/english/index.js';

const schema={text:{body:{},title:{}},metadata:{category:{type:'string'}}};
const parser=(options={})=>createQuerySyntax({configuration:{schema},...options});
const text=(value,field)=>({kind:'text',text:value,...(field?{fields:[field]}:{})});
const phrase=(value,field)=>({kind:'extension',capability:'phrases',version:1,payload:{text:value,...(field?{fields:[field]}:{})}});
function error(run,code,start,end,nativeCode){assert.throws(run,e=>{assert.ok(e instanceof QuerySyntaxError);assert.equal(e.code,code);assert.equal(e.message,`Raveldex query syntax: ${code}`);assert.deepEqual(e.details.span,{start,end});if(nativeCode)assert.equal(e.details.nativeCode,nativeCode);assert.ok(Object.isFrozen(e.details)&&Object.isFrozen(e.details.span));assert.equal(Object.hasOwn(e,'cause'),false);return true;});}
function frozen(value){if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const child of Object.values(value))frozen(child);}}

test('syntax API exposes a frozen explicit compiler and fixed codes without parser registration or owner initialization',()=>{
  const source=createSourceProvider({fields:['body','title']}),calls={initialize:0,prepare:0},configuration={schema,addons:[{...source,participant:{initialize(){calls.initialize++;throw Error('must not initialize');},*prepare(){calls.prepare++;throw Error('must not prepare');}}},createSourcePhrases({fields:['body','title']})]};
  const syntax=createQuerySyntax({configuration});assert.ok(Object.isFrozen(syntax));assert.equal(QUERY_SYNTAX_POLICY,'explicit-boolean-fields-v1');assert.equal(QUERY_SYNTAX_ERROR_CODES.length,13);assert.ok(Object.isFrozen(QUERY_SYNTAX_ERROR_CODES));
  assert.deepEqual(syntax.parse('"red blue"'),phrase('red blue'));assert.deepEqual(calls,{initialize:0,prepare:0});
  configuration.addons.length=0;configuration.schema={text:{changed:{}}};assert.deepEqual(syntax.parse('body:red'),text('red','body'));assert.deepEqual(syntax.parse('"red blue"'),phrase('red blue'));
});

test('explicit precedence, n-ary chains, nested groups and nearest field scopes preserve exact raw native trees',()=>{
  const syntax=parser();
  const actual=syntax.parse('title:(red OR body:(blue AND NOT green)) AND HTTP');
  assert.deepEqual(actual,{kind:'and',children:[{kind:'or',children:[text('red','title'),{kind:'and',children:[text('blue','body'),{kind:'not',child:text('green','body')}]}]},text('HTTP')]});frozen(actual);
  assert.deepEqual(syntax.parse('red OR blue AND NOT green'),{kind:'or',children:[text('red'),{kind:'and',children:[text('blue'),{kind:'not',child:text('green')}]}]});
  assert.deepEqual(syntax.parse('red AND blue AND green'),{kind:'and',children:[text('red'),text('blue'),text('green')]});
  assert.deepEqual(syntax.parse('red AND (blue AND green)'),{kind:'and',children:[text('red'),{kind:'and',children:[text('blue'),text('green')]}]});
});

test('quoted text, whole-codepoint escapes and prefix groups preserve originals without literal or implicit-AND fallback',()=>{
  const syntax=createQuerySyntax({configuration:{schema,addons:[createSourceProvider({fields:['body','title']}),createSourcePhrases({fields:['body','title']})]}});
  assert.deepEqual(syntax.parse('title : "red \\"blue\\""'),phrase('red "blue"','title'));
  assert.deepEqual(syntax.parse('body:re *'),{kind:'group',variants:[{text:'re',match:'prefix',weight:1}],fields:['body']});
  assert.deepEqual(syntax.parse('\\AND'),text('AND'));assert.deepEqual(syntax.parse('foo\\ bar'),text('foo bar'));assert.deepEqual(syntax.parse('foo\\:bar'),text('foo:bar'));assert.deepEqual(syntax.parse('a\\n'),text('an'));assert.deepEqual(syntax.parse('x\\😀'),text('x😀'));
  assert.deepEqual(syntax.parse('foo-bar/path.js'),text('foo-bar/path.js'));
  error(()=>syntax.parse('red blue'),'EXPECTED_OPERATOR',4,8);error(()=>syntax.parse('red*blue'),'UNSUPPORTED_OPERATOR',3,4);error(()=>syntax.parse('red**'),'UNSUPPORTED_OPERATOR',4,5);error(()=>syntax.parse('"red"*'),'UNSUPPORTED_OPERATOR',5,6);
});

test('reserved operator spellings remain legal text fields before colons while metadata and escaped field names reject',()=>{
  const syntax=createQuerySyntax({configuration:{schema:{text:{AND:{},OR:{},NOT:{},XOR:{},body:{}}}}});
  for(const field of ['AND','OR','NOT','XOR'])assert.deepEqual(syntax.parse(`${field} : red`),text('red',field));
  assert.deepEqual(syntax.parse('NOT NOT:red'),{kind:'not',child:text('red','NOT')});
  error(()=>parser().parse('category:red'),'UNKNOWN_FIELD',0,8);error(()=>syntax.parse('\\AND:red'),'UNKNOWN_FIELD',0,4);error(()=>syntax.parse('XOR red'),'UNSUPPORTED_OPERATOR',0,3);
});

test('empty input is none and malformed syntax returns bounded original UTF16 diagnostics without raw input',()=>{
  const syntax=parser();assert.deepEqual(syntax.parse(''),{kind:'none'});assert.deepEqual(syntax.parse(' \t\n\u2003'),{kind:'none'});
  for(const [input,code,start,end] of [['red AND','EXPECTED_OPERAND',7,7],['()','EXPECTED_OPERAND',1,2],['(red','UNTERMINATED_GROUP',0,4],['red)','UNEXPECTED_TOKEN',3,4],['"red','UNTERMINATED_QUOTE',0,4],['red\\','INVALID_ESCAPE',3,4],['😀 AND |','UNSUPPORTED_OPERATOR',7,8],['red\ud800','INVALID_UNICODE',3,4],['\udc00','INVALID_UNICODE',0,1],['red ~ 1','UNSUPPORTED_OPERATOR',4,5],['red OR OR blue','EXPECTED_OPERAND',7,9]])error(()=>syntax.parse(input),code,start,end);
  let reads=0;const input={toString(){reads++;return 'secret';}};error(()=>syntax.parse(input),'INVALID_INPUT',0,0);assert.equal(reads,0);
  const dangerous='<script>alert(secret)</script>';assert.throws(()=>syntax.parse(dangerous),e=>{assert.ok(e instanceof QuerySyntaxError);assert.equal(e.message.includes('secret'),false);assert.equal(JSON.stringify(e.details).includes('secret'),false);return true;});
});

test('factory options and configuration are captured without getters and finite ceilings only narrow',()=>{
  let reads=0;const options={};Object.defineProperty(options,'configuration',{enumerable:true,get(){reads++;return {schema};}});assert.throws(()=>createQuerySyntax(options),{code:'INVALID_OPTIONS'});assert.equal(reads,0);
  for(const options of [{maxInputCodeUnits:2049},{maxTokens:129},{maxDepth:17},{maxWorkUnits:100001}])assert.throws(()=>parser(options),{code:'LIMIT_EXCEEDED'});
  for(const value of [0,-1,1.5,Infinity,NaN,undefined])assert.throws(()=>parser({maxTokens:value}),{code:'INVALID_OPTIONS'});
  assert.throws(()=>createQuerySyntax({configuration:{schema:{text:{}}}}),{code:'INVALID_SCHEMA'});
  const raw=parser({configuration:{schema,limits:{maxQueryCodeUnits:64}}});error(()=>raw.parse(' '.repeat(65)),'LIMIT_EXCEEDED',0,65);
});

test('input, syntax token, nesting and native semantic limits reject complete parses at exact boundaries',()=>{
  const syntax=parser();assert.deepEqual(syntax.parse(' '.repeat(2048)),{kind:'none'});error(()=>syntax.parse(' '.repeat(2049)),'LIMIT_EXCEEDED',0,2049);
  const tokens=parser({maxTokens:3});assert.deepEqual(tokens.parse('red AND blue'),{kind:'and',children:[text('red'),text('blue')]});error(()=>tokens.parse('red AND blue AND green'),'LIMIT_EXCEEDED',13,16);
  const depth=parser({maxDepth:1});assert.deepEqual(depth.parse('(red)'),text('red'));error(()=>depth.parse('((red))'),'LIMIT_EXCEEDED',1,2);error(()=>depth.parse('body:(red)'),'LIMIT_EXCEEDED',5,6);
  error(()=>syntax.parse('r*'),'NATIVE_QUERY_ERROR',0,2,'INVALID_QUERY');error(()=>syntax.parse('red AND '+ 'blue '.repeat(65).trim().replaceAll(' ',' AND ')),'LIMIT_EXCEEDED',575,579);
  const reduced=parser({configuration:{schema,limits:{maxQueryTokens:1}}});error(()=>reduced.parse('red AND blue'),'NATIVE_QUERY_ERROR',0,12,'LIMIT_EXCEEDED');
});

test('work accounting is per parse, includes whole codepoints, closes zero-work analyzer streams and exposes no partial tree',()=>{
  const low=parser({maxWorkUnits:1});error(()=>low.parse('😀'),'WORK_LIMIT_EXCEEDED',0,2);error(()=>low.parse('red'),'WORK_LIMIT_EXCEEDED',1,2);
  const native=createEnglishAnalyzer();let closed=0;const addon={...native,analyzer:{...native.analyzer,*transform(){try{for(;;)yield{workUnits:0};}finally{closed++;}}}};
  const looping=createQuerySyntax({configuration:{schema,addons:[addon],analyzer:ENGLISH_ANALYZER},maxWorkUnits:80});
  error(()=>looping.parse('red'),'WORK_LIMIT_EXCEEDED',0,3);assert.equal(closed,1);error(()=>looping.parse('red'),'WORK_LIMIT_EXCEEDED',0,3);assert.equal(closed,2);
  const regular=parser({maxWorkUnits:1000});for(let i=0;i<10;i++)assert.deepEqual(regular.parse('red AND blue'),{kind:'and',children:[text('red'),text('blue')]});
});

test('native validation uses installed capabilities and wraps analyzer failures with fixed safe diagnostics only',()=>{
  error(()=>parser().parse('"red blue"'),'NATIVE_QUERY_ERROR',0,10,'MISSING_CAPABILITY');
  let reads=0;const secret=Error('DO NOT ECHO secret <img>');Object.defineProperty(secret,'code',{get(){reads++;throw Error('secret getter');}});
  const native=createEnglishAnalyzer(),addon={...native,analyzer:{...native.analyzer,*transform(){throw secret;}}};
  const syntax=createQuerySyntax({configuration:{schema,addons:[addon],analyzer:ENGLISH_ANALYZER}});
  assert.throws(()=>syntax.parse('private'),e=>{assert.ok(e instanceof QuerySyntaxError);assert.equal(e.code,'NATIVE_QUERY_ERROR');assert.deepEqual(e.details,{span:{start:0,end:7}});assert.equal(e.message.includes('secret'),false);assert.equal(Object.hasOwn(e,'cause'),false);return true;});assert.equal(reads,0);
  const proxy=new Proxy({}, {getOwnPropertyDescriptor(){throw Error('private proxy text');}}),hostile={...native,analyzer:{...native.analyzer,*transform(){throw proxy;}}};
  error(()=>createQuerySyntax({configuration:{schema,addons:[hostile],analyzer:ENGLISH_ANALYZER}}).parse('red'),'NATIVE_QUERY_ERROR',0,3);
});
