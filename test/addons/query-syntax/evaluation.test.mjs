import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRaveldex} from '../../../dist/index.js';
import {createQuerySyntax,QuerySyntaxError} from '../../../dist/addons/query-syntax/index.js';
import {createSourceProvider,createSourcePhrases} from '../../../dist/addons/phrases/index.js';
import {createPositionProvider} from '../../../dist/addons/positions/index.js';
import {createPositionPhrases} from '../../../dist/addons/positions/phrases.js';
import {createInspector} from '../../../dist/addons/inspector/index.js';
import {createEnglishAnalyzer,ENGLISH_ANALYZER} from '../../../dist/integrations/languages/english/index.js';
import {createIdentifierAnalyzer,IDENTIFIER_ANALYZER} from '../../../dist/addons/identifiers/index.js';
import {loadFrozenFixture,publicQuery} from '../../../bench/relevance-lib.mjs';
import {scanSyntaxSourceCorpus,sourceSyntaxQueryResult,generatedSyntaxCases} from '../../oracle/query-syntax.mjs';
import {sourcePhraseQueryResult,scanPhraseSourceCorpus} from '../../oracle/phrases.mjs';
import {SYNTAX_SCHEMA,syntaxRecords,validSyntaxCases,invalidSyntaxCases,reservedFieldCases,text,phrase,and,or,not} from '../../fixtures/query-syntax/handwritten.mjs';

const DOC_SHA='730c12c9992f119c0ccf226b59795124d6b9afcaff4c40a1604be44e1c909527';
const plain=value=>JSON.parse(JSON.stringify(value));
const sorted=values=>[...values].sort();
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<=Math.max(1e-12,Math.abs(expected)*1e-12),`${label}: ${actual} != ${expected}`);
function compare(actual,expected,label){assert.equal(actual.completeness,'complete',label);assert.equal(actual.model,'raveldex-bm25-v1',label);assert.equal(actual.total,expected.total,label);assert.deepEqual(actual.hits.map(hit=>hit.id),expected.hits.map(hit=>hit.id),label);for(let i=0;i<actual.hits.length;i++)near(actual.hits[i].score,expected.hits[i].score,label+': independent BM25');}
function configuration(schema=SYNTAX_SCHEMA,extras={}){const fields=Object.keys(schema.text);return{schema,...extras,addons:[...(extras.addons??[]),createSourceProvider({fields}),createSourcePhrases({fields})]};}
function frozen(value){if(value===null||typeof value!=='object')return;assert.ok(Object.isFrozen(value));for(const child of Object.values(value))frozen(child);}

test('handwritten trees fix precedence, explicit operators, exact scopes, escapes and prefix/phrase envelopes',t=>{
  const parser=createQuerySyntax({configuration:configuration()});assert.ok(Object.isFrozen(parser));
  for(const row of validSyntaxCases){const actual=parser.parse(row.source);assert.deepEqual(plain(actual),row.query,row.id);frozen(actual);}
  const reserved=createQuerySyntax({configuration:{schema:{text:{AND:{},OR:{},NOT:{},XOR:{}}}}});
  for(const row of reservedFieldCases)assert.deepEqual(plain(reserved.parse(row.source)),row.query,'Reserved spelling followed by colon is a declared text field');
  assert.equal(validSyntaxCases.length,41);assert.equal(reservedFieldCases.length,8);t.diagnostic(`${validSyntaxCases.length} hand-authored exact trees and ${reservedFieldCases.length} reserved-field cases; expected trees precede parser execution.`);
});

test('handwritten diagnostic spans reject malformed syntax/Unicode without fallback or raw diagnostic text',t=>{
  const parser=createQuerySyntax({configuration:configuration()});
  for(const row of invalidSyntaxCases)assert.throws(()=>parser.parse(row.source),error=>{assert.ok(error instanceof QuerySyntaxError,row.id);assert.equal(error.code,row.code,row.id);assert.deepEqual(error.details.span,row.span,row.id);if(row.nativeCode)assert.equal(error.details.nativeCode,row.nativeCode,row.id);assert.ok(Object.isFrozen(error.details)&&Object.isFrozen(error.details.span));assert.equal(Object.hasOwn(error,'source'),false);assert.equal(Object.hasOwn(error,'query'),false);assert.equal(Object.hasOwn(error,'cause'),false);return true;});
  const hostile='body:<img_onerror=alert(1)>';assert.throws(()=>parser.parse(hostile),error=>{assert.ok(error instanceof QuerySyntaxError);assert.equal(error.code,'UNSUPPORTED_OPERATOR');assert.ok(!error.message.includes('img'));assert.ok(!JSON.stringify(error).includes('img'));return true;});
  assert.equal(invalidSyntaxCases.length,31);t.diagnostic(`${invalidSyntaxCases.length} fixed code/span fixtures, including UTF-16 supplementary offsets, trailing escape, unsupported operators and native prefix refusals.`);
});

test('handwritten parsed and explicit native trees preserve complete source membership, scores, pages and Boolean participation',async t=>{
  const model=scanSyntaxSourceCorpus(syntaxRecords,SYNTAX_SCHEMA);let comparisons=0;
  for(const records of [syntaxRecords,[...syntaxRecords].reverse()]){const config=configuration(),engine=createRaveldex(config),parser=createQuerySyntax({configuration:config});
    try{await engine.addMany(records);for(const row of validSyntaxCases)for(const options of [{limit:100},{limit:0},{limit:1},{offset:1,limit:3}]){const actual=await engine.search(parser.parse(row.source),options),typed=await engine.search(row.query,options);assert.deepEqual(actual,typed,row.id+': exact native AST parity');compare(actual,sourceSyntaxQueryResult(model,row.query,options),row.id);comparisons++;}}
    finally{await engine.dispose();}
  }
  assert.equal(comparisons,328);t.diagnostic(`${comparisons} complete parsed/typed/independent-source comparisons across 41 handwritten trees, two insertion orders and four pages.`);
});

test('generated expressions start from independent typed trees and retain nested Boolean structure and exact native results',async t=>{
  const cases=generatedSyntaxCases(0x51a080,48).concat(generatedSyntaxCases(0xa080b00,48)),model=scanSyntaxSourceCorpus(syntaxRecords,SYNTAX_SCHEMA);let comparisons=0;
  for(const records of [syntaxRecords,[...syntaxRecords].reverse()]){const config=configuration(),engine=createRaveldex(config),parser=createQuerySyntax({configuration:config});
    try{await engine.addMany(records);for(const row of cases){const actualTree=parser.parse(row.source);assert.deepEqual(plain(actualTree),row.query,row.id+': independently constructed tree');for(const options of [{limit:100},{limit:0},{offset:2,limit:2}]){const actual=await engine.search(actualTree,options);assert.deepEqual(actual,await engine.search(row.query,options),row.id+': typed parity');compare(actual,sourceSyntaxQueryResult(model,row.query,options),row.id);comparisons++;}}}
    finally{await engine.dispose();}
  }
  assert.equal(comparisons,576);t.diagnostic(`${cases.length} bounded generated expressions and ${comparisons} complete native/source comparisons; renderer does not read production parse output.`);
});

test('frozen real-document syntax judgments retain exhaustive source membership and native arithmetic',async t=>{
  const bytes=await readFile(new URL('../../fixtures/query-syntax/documentation.json',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),DOC_SHA);const fixture=JSON.parse(bytes),corpusBytes=await readFile(new URL('../../fixtures/relevance/corpus.json',import.meta.url));assert.equal(createHash('sha256').update(corpusBytes).digest('hex'),fixture.corpus.sha256);
  const corpus=JSON.parse(corpusBytes),model=scanSyntaxSourceCorpus(corpus.records,corpus.schema),config=configuration(corpus.schema),engine=createRaveldex(config),parser=createQuerySyntax({configuration:config});let positives=0,negatives=0;
  try{await engine.addMany(corpus.records);for(const row of fixture.judgments){const tree=parser.parse(row.source);assert.deepEqual(plain(tree),row.query,row.id);const expected=sourceSyntaxQueryResult(model,row.query,{limit:100}),actual=await engine.search(tree,{limit:100});assert.deepEqual(sorted(expected.hits.map(hit=>hit.id)),row.expectedIds,row.id+': frozen independent labels');assert.deepEqual(sorted(actual.hits.map(hit=>hit.id)),row.expectedIds,row.id+': all returned memberships');compare(actual,expected,row.id);if(actual.total)positives++;else negatives++;}}
  finally{await engine.dispose();}
  assert.equal(positives,10);assert.equal(negatives,4);t.diagnostic(JSON.stringify({fixtureSha256:DOC_SHA,corpusSha256:fixture.corpus.sha256,completeJudgments:14,nonempty:positives,empty:negatives,limitations:fixture.context.limitations}));
});

test('selected basic, English and identifier analyzers receive raw syntax operands and preserve native source/position phrase semantics',async t=>{
  const schema={text:{body:{}}},fields=['body'],records=[{id:'a',text:{body:'running engines'}},{id:'b',text:{body:'runs engine'}},{id:'c',text:{body:'fooBar baz'}},{id:'d',text:{body:'foo bar baz'}},{id:'e',text:{body:'foo baz'}}];let comparisons=0;
  for(const [name,extras,cases] of [
    ['basic',{},[['body:"running engines"',phrase('running engines',fields),['a']],['body:foo',text('foo',fields),['d','e']]]],
    ['english',{analyzer:ENGLISH_ANALYZER,addons:[createEnglishAnalyzer()]},[['body:"run engine"',phrase('run engine',fields),['a','b']],['body:running',text('running',fields),['a','b']]]],
    ['identifiers',{analyzer:IDENTIFIER_ANALYZER,addons:[createIdentifierAnalyzer()]},[['body:foo',text('foo',fields),['c','d','e']],['body:"foo bar"',phrase('foo bar',fields),['d']],['body:"fooBar baz"',phrase('fooBar baz',fields),['c']]]],
  ])for(const strategy of ['source','positions']){
    const config={schema,...extras,addons:[...(extras.addons??[]),...(strategy==='source'?[createSourceProvider({fields}),createSourcePhrases({fields})]:[createPositionProvider({fields}),createPositionPhrases({fields})])]},engine=createRaveldex(config),parser=createQuerySyntax({configuration:config});
    try{await engine.addMany(records);for(const [source,query,ids]of cases){const tree=parser.parse(source);assert.deepEqual(plain(tree),query);const actual=await engine.search(tree,{limit:100});assert.deepEqual(sorted(actual.hits.map(hit=>hit.id)),ids,name+': hand original semantics');assert.deepEqual(actual,await engine.search(query,{limit:100}),name+': exact raw AST score parity');comparisons++;}}
    finally{await engine.dispose();}
  }
  assert.equal(comparisons,14);t.diagnostic(`${comparisons} parsed/typed/source-position comparisons under separately selected basic, English and identifier analysis.`);
});

test('native limits and capabilities remain authoritative and provider-root failures stay at actual native execution',async()=>{
  const core={schema:SYNTAX_SCHEMA},parser=createQuerySyntax({configuration:core}),engine=createRaveldex(core);
  try{assert.throws(()=>parser.parse('"red blue"'),error=>error instanceof QuerySyntaxError&&error.code==='NATIVE_QUERY_ERROR'&&error.details.nativeCode==='MISSING_CAPABILITY'&&error.details.span.end===10);await assert.rejects(engine.search(phrase('red blue')),{code:'MISSING_CAPABILITY'});assert.deepEqual(plain(parser.parse('red OR blue')),or(text('red'),text('blue')));}
  finally{await engine.dispose();}
  for(const [limits,source,query]of [[{maxQueryTokens:1},'red AND red',and(text('red'),text('red'))],[{maxQueryGroups:1},'red OR blue',or(text('red'),text('blue'))],[{maxQueryLexicalCodeUnits:6},'red OR blue',or(text('red'),text('blue'))]]){
    const config={schema:SYNTAX_SCHEMA,limits},limited=createQuerySyntax({configuration:config}),native=createRaveldex(config);try{assert.throws(()=>limited.parse(source),error=>error instanceof QuerySyntaxError&&error.code==='NATIVE_QUERY_ERROR'&&error.details.nativeCode==='LIMIT_EXCEEDED'&&error.details.span.start===0&&error.details.span.end===source.length);await assert.rejects(native.search(query),{code:'LIMIT_EXCEEDED'});}finally{await native.dispose();}
  }
  const subset={schema:SYNTAX_SCHEMA,addons:[createSourceProvider({fields:['body']}),createSourcePhrases({fields:['body']})]},subsetParser=createQuerySyntax({configuration:subset}),subsetEngine=createRaveldex(subset);
  try{const query=subsetParser.parse('title:"red blue"');assert.deepEqual(plain(query),phrase('red blue',['title']));await assert.rejects(subsetEngine.search(query),{code:'MISSING_CAPABILITY'});}
  finally{await subsetEngine.dispose();}
});

test('Inspector facts preserve hand BM25, repeated group deduplication and zero score from double NOT',async t=>{
  const schema={text:{title:{boost:2}}},records=[{id:'a',text:{title:'foo foo'}},{id:'b',text:{title:'foo bar'}},{id:'c',text:{title:'bar'}}],config={schema,addons:[createInspector()]},engine=createRaveldex(config),parser=createQuerySyntax({configuration:config});
  try{await engine.addMany(records);const actual=await engine.search(parser.parse('title:foo OR (title:foo AND title:absentword)'),{limit:100,extensions:{inspector:{ids:['a','b','c']}}}),facts=actual.extensions.inspector.trace.facts.filter(fact=>fact.kind==='field');assert.equal(facts.length,2);
    for(const fact of facts){const tf=fact.id==='a'?2:1,expected=2*Math.log(1+(3-2+0.5)/(2+0.5))*(tf*2.2)/(tf+1.2*(0.25+0.75*2/(5/3)));assert.equal(fact.tf,tf);assert.equal(fact.df,2);assert.equal(fact.N,3);near(fact.selected,expected,'Hand-derived parsed native field contribution');near(actual.hits.find(hit=>hit.id===fact.id).score,expected,'Failed AND contributes no score');}
    assert.deepEqual(await engine.search(parser.parse('title:foo AND title:foo')),await engine.search(text('foo',['title'])),'Canonical repeated groups contribute once');assert.ok((await engine.search(parser.parse('NOT NOT title:foo'))).hits.every(hit=>hit.score===0),'Native NOT supplies no positive groups, including nested NOT');t.diagnostic('Two hand-derived native field facts, exact repeat deduplication and native double-NOT participation.');
  }finally{await engine.dispose();}
});

test('creating a parser leaves ordinary string syntax and all 76 existing basic judgments untouched',async t=>{
  const {corpus,judgments}=await loadFrozenFixture(),config=configuration(corpus.schema),engine=createRaveldex(config),model=scanPhraseSourceCorpus(corpus.records,corpus.schema);
  try{await engine.addMany(corpus.records);const before=[];for(const row of judgments){const query=publicQuery(row.query),result=await engine.search(query,{limit:100});compare(result,sourcePhraseQueryResult(model,row.query,{limit:100}),row.id);before.push(result);}createQuerySyntax({configuration:config});for(let i=0;i<judgments.length;i++)assert.deepEqual(await engine.search(publicQuery(judgments[i].query),{limit:100}),before[i]);}
  finally{await engine.dispose();}
  const localConfig=configuration(),local=createRaveldex(localConfig),parser=createQuerySyntax({configuration:localConfig});try{await local.addMany(syntaxRecords);const ordinary=await local.search('red OR blue',{limit:100});assert.equal(ordinary.total,0,'Ordinary string includes the literal word OR as a required token');assert.ok((await local.search(parser.parse('red OR blue'),{limit:100})).total>0,'Only explicit parser selection introduces OR syntax');}
  finally{await local.dispose();}
  assert.equal(judgments.length,76);t.diagnostic('76 unchanged ordinary results/totals/scores; optional parser creation does not install syntax in engine.search(string).');
});
