/** Independent runtime review. This author owns the fixture/oracle/evaluation
 * files and deliberately imports none of them in this review. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {createRaveldex} from '../../dist/index.js';
import {createQuerySyntax,QuerySyntaxError,QUERY_SYNTAX_POLICY} from '../../dist/addons/query-syntax/index.js';
import {createSourceProvider,createSourcePhrases} from '../../dist/addons/phrases/index.js';
import {createInspector} from '../../dist/addons/inspector/index.js';

const root=resolve(new URL('../..',import.meta.url).pathname),rows=[];
const sha=data=>createHash('sha256').update(data).digest('hex');
const plain=value=>JSON.parse(JSON.stringify(value));
const body={schema:{text:{body:{}}}},text=value=>({kind:'text',text:value}),group=value=>({kind:'group',variants:[{text:value,match:'prefix',weight:1}]});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=Math.max(1e-12,Math.abs(expected)*1e-12));
const bindings=[];
for(const path of [
 'src/addons/query-syntax/index.ts','src/addons/query-syntax/lexer.ts','src/addons/query-syntax/parser.ts','src/addons/query-syntax/options.ts','src/addons/query-syntax/errors.ts','src/addons/query-syntax/types.ts',
 'src/core/contracts/query.ts','src/core/contracts/schema.ts','src/core/contracts/data.ts','src/core/analyzer/selected.ts','src/core/capabilities/registration.ts',
 'dist/addons/query-syntax/index.js','dist/addons/query-syntax/lexer.js','dist/addons/query-syntax/parser.js','dist/addons/query-syntax/options.js','dist/addons/query-syntax/errors.js','dist/addons/query-syntax/types.d.ts',
 'dist/core/contracts/query.js','dist/core/contracts/schema.js','dist/core/contracts/data.js','dist/core/analyzer/selected.js','dist/core/capabilities/registration.js',
]){const data=await readFile(resolve(root,path));bindings.push({path,bytes:data.length,sha256:sha(data)});}
function analyzer(transform){return{manifest:{id:'review-syntax-analyzer',version:'0.1.0',contractVersion:1,roles:['analyzer'],provides:[{id:'analyzer:review-syntax-v1',contractVersion:1}],requires:[],dataRequirements:{fields:[],source:false,positions:false,offsets:false,metadata:false},indexEffect:'analysis',rebuildPolicy:'new-index',execution:{direct:true,worker:false},limits:{maxPayloadCodeUnits:16384,maxWorkUnits:10000000,maxRetainedEntries:0,maxOutputEntries:0},costs:{importedCode:'Independent review callback',retainedRepresentation:'None',transientWork:'Bounded probe',externalResources:'none'}},analyzer:{kind:'single-token-transform',id:'review-syntax-v1',transform}};}
function selected(handle){return{schema:{text:{body:{}}},analyzer:{id:'review-syntax-v1',environmentProfile:'unqualified'},addons:[handle]};}
async function probe(name,callback){const started=Date.now(),result=await callback();rows.push({name,status:'Pass',elapsedMs:Date.now()-started,...result});}
let failure;
try{
await probe('Parser factory owns configuration and handles without initializing participants or replacing raw operands',()=>{
 let initialized=0,transforms=0;const source=createSourceProvider({fields:['body']}),participant={...source.participant,initialize(){initialized++;throw Error('Must not initialize parser participant');}},handle=analyzer(function*(term){transforms++;yield{workUnits:1};return term==='walking'?'walk':term;});
 const config=selected(handle);config.addons.push({...source,participant},createSourcePhrases({fields:['body']}));const parser=createQuerySyntax({configuration:config});assert.equal(initialized,0);handle.analyzer.transform=function*(){throw Error('Mutated callback must not run');};config.schema.text.extra={};config.schema.text.body.boost=3;
 assert.deepEqual(plain(parser.parse('walking AND body:walking')),{kind:'and',children:[text('walking'),{kind:'text',text:'walking',fields:['body']}]});assert.equal(transforms,2);assert.equal(initialized,0);assert.throws(()=>parser.parse('extra:walking'),error=>error.code==='UNKNOWN_FIELD');
 assert.deepEqual(plain(parser.parse('"walking engine"')),{kind:'extension',capability:'phrases',version:1,payload:{text:'walking engine'}});assert.equal(initialized,0);return{participantInitializations:initialized,rawOperandsPreserved:true,transformCalls:transforms};
});
await probe('Explicit precedence, nearest scope, reserved field names and native public envelopes are exact',()=>{
 const parser=createQuerySyntax({configuration:{schema:{text:{body:{},title:{},AND:{},OR:{},NOT:{},XOR:{}}}}});
 const rows=[
  ['alpha OR beta AND gamma',{kind:'or',children:[text('alpha'),{kind:'and',children:[text('beta'),text('gamma')]}]}],
  ['NOT NOT alpha',{kind:'not',child:{kind:'not',child:text('alpha')}}],
  ['body:(alpha OR title:(beta AND gamma))',{kind:'or',children:[{kind:'text',text:'alpha',fields:['body']},{kind:'and',children:[{kind:'text',text:'beta',fields:['title']},{kind:'text',text:'gamma',fields:['title']}]}]}],
  ['alpha AND (beta AND gamma)',{kind:'and',children:[text('alpha'),{kind:'and',children:[text('beta'),text('gamma')]}]}],
  ['al *',group('al')],['\\OR',text('OR')],['alpha\\ beta',text('alpha beta')],['foo\\:bar',text('foo:bar')],['""',{kind:'extension',capability:'phrases',version:1,payload:{text:''}}],
 ];
 // Quotes must use an actual installed capability; keep this fixture explicit.
 const withPhrases=createQuerySyntax({configuration:{schema:{text:{body:{}}},addons:[createSourceProvider({fields:['body']}),createSourcePhrases({fields:['body']})]}});
 for(const [source,expected]of rows)assert.deepEqual(plain((source==='""'?withPhrases:parser).parse(source)),expected,source);
 for(const field of ['AND','OR','NOT','XOR'])assert.deepEqual(plain(parser.parse(field+' : alpha')),{kind:'text',text:'alpha',fields:[field]});
 let escaped;assert.throws(()=>parser.parse('bo\\dy:alpha'),error=>{escaped=error.code;return error instanceof QuerySyntaxError&&error.code==='UNKNOWN_FIELD';});return{directTrees:rows.length,reservedFieldCases:4,escapedFieldRefusal:escaped};
});
await probe('Syntax and Unicode errors carry original half-open UTF16 spans and never fall back',()=>{
 const parser=createQuerySyntax({configuration:body}),cases=[
  ['alpha beta','EXPECTED_OPERATOR',6,10],['😀 AND','EXPECTED_OPERAND',6,6],['😀 | alpha','UNSUPPORTED_OPERATOR',3,4],['β OR "gamma','UNTERMINATED_QUOTE',5,11],['(alpha','UNTERMINATED_GROUP',0,6],['alpha)','UNEXPECTED_TOKEN',5,6],['()','EXPECTED_OPERAND',1,2],['(','EXPECTED_OPERAND',1,1],[')','EXPECTED_OPERAND',0,1],['alpha\\','INVALID_ESCAPE',5,6],['😀 \ud800','INVALID_UNICODE',3,4],['\udc00 OR alpha','INVALID_UNICODE',0,1],['alpha XOR beta','UNSUPPORTED_OPERATOR',6,9],['alpha**','UNSUPPORTED_OPERATOR',6,7],['alpha*beta','UNSUPPORTED_OPERATOR',5,6],
 ];
 for(const [source,code,start,end]of cases)assert.throws(()=>parser.parse(source),error=>{assert.ok(error instanceof QuerySyntaxError);assert.equal(error.code,code,source);assert.deepEqual(error.details.span,{start,end},source);assert.ok(Object.isFrozen(error.details)&&Object.isFrozen(error.details.span));assert.equal(Object.hasOwn(error,'source'),false);assert.equal(Object.hasOwn(error,'query'),false);assert.equal(Object.hasOwn(error,'cause'),false);return true;});
 return{codeSpanCases:cases.length,policy:QUERY_SYNTAX_POLICY};
});
await probe('Diagnostics elide hostile source and arbitrary analyzer exceptions without invoking code getters',()=>{
 let getterReads=0;const secret='<img src=x onerror=secret()>',hostile={get code(){getterReads++;return'INVALID_QUERY';},message:secret},configs=[selected(analyzer(function*(){throw hostile;})),selected(analyzer(function*(){throw new Proxy({}, {getOwnPropertyDescriptor(){throw Error(secret);}});})),selected(analyzer(function*(){throw new QuerySyntaxError('UNKNOWN_FIELD',{span:{start:123,end:456}});})),body];
 for(let index=0;index<configs.length;index++){const parser=createQuerySyntax({configuration:configs[index]}),source=index===3?'unknown<secret>:alpha':'alpha';assert.throws(()=>parser.parse(source),error=>{assert.ok(error instanceof QuerySyntaxError);if(index<3){assert.equal(error.code,'NATIVE_QUERY_ERROR');assert.deepEqual(error.details.span,{start:0,end:5});}assert.ok(!error.message.includes('secret'));assert.ok(!JSON.stringify(error).includes('secret'));assert.equal(Object.hasOwn(error,'cause'),false);return true;});}
 assert.equal(getterReads,0);return{safeFailures:configs.length,diagnosticGetterReads:getterReads};
});
await probe('Raw input, syntax token and syntactic nesting limits are separate finite whole-parse refusals',()=>{
 const input=createQuerySyntax({configuration:body,maxInputCodeUnits:6});assert.deepEqual(plain(input.parse('alpha')),text('alpha'));assert.throws(()=>input.parse('😀😀😀😀'),error=>error.code==='LIMIT_EXCEEDED'&&error.details.actual===8&&error.details.limit===6);
 const tokens=createQuerySyntax({configuration:body,maxTokens:3});assert.equal(tokens.parse('alpha OR beta').kind,'or');assert.throws(()=>tokens.parse('alpha OR beta OR gamma'),error=>error.code==='LIMIT_EXCEEDED'&&error.details.actual===4&&error.details.limit===3);
 const depth=createQuerySyntax({configuration:body,maxDepth:2});assert.deepEqual(plain(depth.parse('((alpha))')),text('alpha'));assert.throws(()=>depth.parse('(((alpha)))'),error=>error.code==='LIMIT_EXCEEDED'&&error.details.actual===3&&error.details.limit===2);
 assert.throws(()=>createQuerySyntax({configuration:body,maxWorkUnits:100001}),error=>error.code==='LIMIT_EXCEEDED');assert.throws(()=>createQuerySyntax({configuration:body,maxDepth:17}),error=>error.code==='LIMIT_EXCEEDED');
 return{exactBoundaryPasses:3,wholeLimitRefusals:5};
});
await probe('Native shared token/group/lexical and phrase capability errors preserve typed native authority',async()=>{
 const cases=[[{maxQueryTokens:1},'alpha AND alpha',{kind:'and',children:[text('alpha'),text('alpha')]}],[{maxQueryGroups:1},'alpha OR beta',{kind:'or',children:[text('alpha'),text('beta')]}],[{maxQueryLexicalCodeUnits:8},'alpha OR beta',{kind:'or',children:[text('alpha'),text('beta')]}]];
 for(const [limits,source,query]of cases){const config={...body,limits},parser=createQuerySyntax({configuration:config}),engine=createRaveldex(config);try{assert.throws(()=>parser.parse(source),error=>error.code==='NATIVE_QUERY_ERROR'&&error.details.nativeCode==='LIMIT_EXCEEDED'&&error.details.span.start===0&&error.details.span.end===source.length);await assert.rejects(engine.search(query),{code:'LIMIT_EXCEEDED'});}finally{await engine.dispose();}}
 const parser=createQuerySyntax({configuration:body});assert.throws(()=>parser.parse('"alpha beta"'),error=>error.code==='NATIVE_QUERY_ERROR'&&error.details.nativeCode==='MISSING_CAPABILITY'&&error.details.span.end===12);
 const subset={schema:{text:{body:{},title:{}}},addons:[createSourceProvider({fields:['body']}),createSourcePhrases({fields:['body']})]},subsetParser=createQuerySyntax({configuration:subset}),engine=createRaveldex(subset);try{const query=subsetParser.parse('title:"alpha beta"');assert.equal(query.capability,'phrases');await assert.rejects(engine.search(query),{code:'MISSING_CAPABILITY'});}finally{await engine.dispose();}
 return{nativeLimitComparisons:3,missingCapabilityAtParse:1,selectedProviderFailureAtExecution:1};
});
await probe('Parse work is calibrated by exact admission and zero-unit analyzer cursors close on bounded failure',()=>{
 const source='alpha OR beta',upper=100000;let low=1,high=upper;
 while(low<high){const mid=Math.floor((low+high)/2),parser=createQuerySyntax({configuration:body,maxWorkUnits:mid});try{parser.parse(source);high=mid;}catch(error){assert.equal(error.code,'WORK_LIMIT_EXCEEDED');low=mid+1;}}
 assert.equal(createQuerySyntax({configuration:body,maxWorkUnits:low}).parse(source).kind,'or');assert.throws(()=>createQuerySyntax({configuration:body,maxWorkUnits:low-1}).parse(source),error=>error.code==='WORK_LIMIT_EXCEEDED'&&error.details.actual>error.details.limit);
 let closed=0,advances=0;const addon=analyzer(function*(term){try{for(let i=0;i<10000;i++){advances++;yield{workUnits:0};}return term;}finally{closed++;}}),parser=createQuerySyntax({configuration:selected(addon),maxWorkUnits:128});assert.throws(()=>parser.parse('alpha'),error=>error.code==='WORK_LIMIT_EXCEEDED');assert.equal(closed,1);assert.ok(advances>0&&advances<128);
 return{minimumWorkForExpression:low,declaredZeroUnitAdvances:advances,closedCursors:closed,scope:'Logical charged work; not physical CPU/heap/latency measurement'};
});
await probe('Every returned native tree/container is frozen and repeated parse calls have no mutable query cache',()=>{
 const parser=createQuerySyntax({configuration:body}),source='body:(alpha OR beta) AND NOT gamma',first=parser.parse(source),second=parser.parse(source);assert.deepEqual(first,second);assert.notEqual(first,second);
 let objects=0;function visit(value){if(!value||typeof value!=='object')return;objects++;assert.ok(Object.isFrozen(value));for(const child of Object.values(value))visit(child);}visit(first);
 assert.throws(()=>first.children.push(text('lost')),TypeError);assert.throws(()=>first.children[0].children[0].fields.push('lost'),TypeError);assert.deepEqual(parser.parse(source),second);assert.deepEqual(Object.keys(parser),['parse']);return{frozenContainers:objects,freshTrees:true};
});
await probe('Actual native eligibility and hand-derived BM25 retain original value boundaries and failed Boolean participation',async()=>{
 const fields=['body'],config={schema:{text:{body:{boost:3}}},addons:[createSourceProvider({fields}),createSourcePhrases({fields}),createInspector()]},engine=createRaveldex(config),parser=createQuerySyntax({configuration:config}),records=[{id:'x',text:{body:'alpha alpha'}},{id:'y',text:{body:'alpha beta'}},{id:'z',text:{body:'beta'}}];
 try{await engine.addMany(records);const source='body:alpha OR (body:alpha AND body:missing)',query={kind:'or',children:[{kind:'text',text:'alpha',fields},{kind:'and',children:[{kind:'text',text:'alpha',fields},{kind:'text',text:'missing',fields}]}]},actual=await engine.search(parser.parse(source),{limit:100,extensions:{inspector:{ids:['x','y','z']}}});assert.deepEqual(actual,await engine.search(query,{limit:100,extensions:{inspector:{ids:['x','y','z']}}}));
  const facts=actual.extensions.inspector.trace.facts.filter(fact=>fact.kind==='field');assert.equal(facts.length,2);for(const hit of actual.hits){const tf=hit.id==='x'?2:1,expected=3*Math.log(1+(3-2+0.5)/(2+0.5))*(tf*2.2)/(tf+1.2*(.25+.75*2/(5/3)));near(hit.score,expected);}assert.ok((await engine.search(parser.parse('NOT NOT body:alpha'))).hits.every(hit=>hit.score===0));assert.deepEqual(await engine.search(parser.parse('al*')),await engine.search(group('al')));
  await engine.add({id:'values',text:{body:['alpha','beta']}});assert.equal((await engine.search(parser.parse('"alpha beta"'))).hits.some(hit=>hit.id==='values'),false);assert.equal((await engine.search(parser.parse('alpha AND beta'))).hits.some(hit=>hit.id==='values'),true);return{handDerivedFieldFacts:facts.length,prefixParity:true,originalValueBoundary:true,doubleNotNativeZeroScore:true};
 }finally{await engine.dispose();}
});
}catch(error){failure={name:error.name,message:error.message,stack:error.stack};}
const current=[];for(const row of bindings)if(sha(await readFile(resolve(root,row.path)))!==row.sha256)current.push(row.path);
const report={kind:'raveldex-rx-a080-runtime-review-v1',recordedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch},authorshipBoundary:'Independent review of other-authored query syntax runtime/options/errors/native bridge. Excludes reviewer-owned oracle/fixtures/evaluation and does not import them.',sourceBindings:bindings,bindingAudit:{status:current.length?'Fail':'Pass',unchanged:bindings.length-current.length,changed:current},observations:rows,passCount:rows.length,failCount:failure?1:0,verdict:failure||current.length?'Changes required':'Ready with follow-ups',mandatoryFindings:failure?[failure]:[],failure,limitations:['Trusted callbacks/configuration reflection are not hostile-code sandboxes.','Pure current local Node probes; package/minified/worker/snapshot consumers are a separate workstream.','Logical parser work is not heap/CPU/transport-copy peak measurement.','No UI/manual AT, remote CI or publication claims.']};
const output=resolve(root,process.argv[2]??'docs/evidence/RX-A080-runtime-review.json');await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({report:output,sha256:sha(await readFile(output)),passCount:rows.length,failure,bindingAudit:report.bindingAudit}));if(failure||current.length)process.exitCode=1;
