import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {createRaveldex} from '../../../dist/index.js';
import {createLiteral} from '../../../dist/addons/literal/index.js';
import {createSourceProvider,createSourcePhrases} from '../../../dist/addons/phrases/index.js';
import {createInspector} from '../../../dist/addons/inspector/index.js';
import {createEnglishAnalyzer,ENGLISH_ANALYZER} from '../../../dist/integrations/languages/english/index.js';
import {createIdentifierAnalyzer,IDENTIFIER_ANALYZER} from '../../../dist/addons/identifiers/index.js';
import {loadFrozenFixture,publicQuery as ordinaryPublicQuery} from '../../../bench/relevance-lib.mjs';
import {scanPhraseSourceCorpus,sourcePhraseQueryResult} from '../../oracle/phrases.mjs';
import {literalSourceRanges,scanLiteralSourceCorpus,sourceLiteralQueryResult,sourceLiteralEvidence} from '../../oracle/literal.mjs';

const FIXTURE_SHA256='659e90a5bde2816c13a466c3c2d1402a20935b9a7d5ad4c139fe3a86cde665b1';
const fields=['title','body'],page={limit:100},plain=value=>JSON.parse(JSON.stringify(value));
const literal=(text,selected)=>({kind:'literal',text,...(selected?{fields:selected}:{})});
function publicQuery(query){if(typeof query==='string')return{kind:'text',text:query};if(query.kind==='literal')return{kind:'extension',capability:'literal',version:1,payload:{text:query.text,...(query.fields?{fields:query.fields}:{})}};if(query.kind==='and'||query.kind==='or')return{...query,children:query.children.map(publicQuery)};if(query.kind==='not')return{...query,child:publicQuery(query.child)};return ordinaryPublicQuery(query);}
const configured=(schema,extra={})=>createRaveldex({schema,...extra,addons:[...(extra.addons??[]),createSourceProvider({fields}),createLiteral({fields})]});
const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<=Math.max(1e-12,Math.abs(expected)*1e-12),`${message}: ${actual} != ${expected}`);
function compare(actual,expected,message){assert.equal(actual.completeness,'complete',message);assert.equal(actual.total,expected.total,message);assert.deepEqual(actual.hits.map(hit=>hit.id),expected.hits.map(hit=>hit.id),message);for(let i=0;i<expected.hits.length;i++)close(actual.hits[i].score,expected.hits[i].score,message+': independent native score');}
async function frozen(){const bytes=await readFile(new URL('../../fixtures/relevance/literal-v1.json',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),FIXTURE_SHA256,'Frozen pre-execution literal labels must not be retuned');return JSON.parse(bytes);}
const referenceSchema={text:{title:{boost:2},body:{}}};
const records=[
  {id:'a',text:{title:'ababa',body:'café cafe\u0301 ﬃ ffi'}},
  {id:'b',text:{title:'a😀a😀',body:'İ I i ı Straße STRASSE Ａpi Api'}},
  {id:'c',text:{title:'red—blue foo_bar/foo.bar __proto__',body:['red','blue']}},
  {id:'d',text:{title:['red','blue'],body:'red blue'}},
  {id:'e',text:{title:'red',body:'blue'}},
  {id:'f',text:{}},
  {id:'g',text:{title:'a\u0000b \n\t',body:['','raw \u0301 mark']}},
];

test('independent raw scan pins overlapping, case/punctuation-sensitive and original UTF16 code-point spans',()=>{
  for(const [value,text,expected] of [
    ['ababa','aba',[{start:0,end:3},{start:2,end:5}]],['ababa','ba',[{start:1,end:3},{start:3,end:5}]],
    ['a😀a😀','😀',[{start:1,end:3},{start:4,end:6}]],['a😀a😀','a😀',[{start:0,end:3},{start:3,end:6}]],
    ['cafe\u0301','café',[]],['cafe\u0301','cafe',[{start:0,end:4}]],['cafe\u0301','\u0301',[{start:4,end:5}]],
    ['ﬃ ffi','ffi',[{start:2,end:5}]],['Ａpi Api','Api',[{start:4,end:7}]],['İ I i ı','i',[{start:4,end:5}]],
    ['Straße STRASSE','ss',[]],['Straße STRASSE','ß',[{start:4,end:5}]],['red—blue','red blue',[]],
    ['foo_bar/foo.bar','_bar/',[{start:3,end:8}]],['__proto__','proto',[{start:2,end:7}]],['a\u0000b','\u0000',[{start:1,end:2}]],
  ])assert.deepEqual(literalSourceRanges(value,text),expected,JSON.stringify([value,text]));
  for(const [value,text] of [['valid',''],['bad\ud800','a'],['valid','\udc00']])assert.throws(()=>literalSourceRanges(value,text),RangeError);
  const model=scanLiteralSourceCorpus(records,referenceSchema);assert.equal(sourceLiteralQueryResult(model,literal('redblue')).total,0);assert.deepEqual(sourceLiteralQueryResult(model,literal('red blue')).hits.map(hit=>hit.id),['d']);
  assert.deepEqual(sourceLiteralQueryResult(model,{kind:'and',children:[literal('red'),literal('blue')]}).hits.map(hit=>hit.id),['c','d','e'],'Independent leaves can qualify across values/fields; a single substring never joins them');
});

test('frozen real-document punctuation and infix intents have complete source membership with zero literal scores',async t=>{
  const fixture=await frozen(),{corpus}=await loadFrozenFixture(),model=scanLiteralSourceCorpus(corpus.records,corpus.schema),engine=configured(corpus.schema);let positives=0,negatives=0;const observations=[];
  assert.equal(createHash('sha256').update(await readFile(new URL('../../fixtures/relevance/corpus.json',import.meta.url))).digest('hex'),fixture.corpus.sha256);
  try{await engine.addMany(corpus.records);for(const row of fixture.judgments){const query=literal(row.text,row.fields),actual=await engine.search(publicQuery(query),page),expected=sourceLiteralQueryResult(model,query,page);compare(actual,expected,row.id);assert.deepEqual(actual.hits.map(hit=>hit.id),row.expectedIds,row.id+': exhaustive pre-execution labels');assert.ok(actual.hits.every(hit=>hit.score===0));if(row.category==='intended-empty'){negatives++;assert.equal(actual.total,0);}else positives++;observations.push({id:row.id,needle:row.text,total:actual.total,ids:actual.hits.map(hit=>hit.id)});}}
  finally{await engine.dispose();}
  assert.equal(positives,fixture.acceptance.sourceNavigationQueries);assert.equal(negatives,fixture.acceptance.negativeQueries);t.diagnostic(JSON.stringify({fixtureSha256:FIXTURE_SHA256,corpusSha256:fixture.corpus.sha256,positives,negatives,unexpectedMemberships:0,observations,limitations:fixture.context.limitations}));
});

test('independent complete literal/Boolean/native-score comparisons retain exact totals across pages and insertion orders',async t=>{
  const fixture=await frozen(),{corpus}=await loadFrozenFixture(),model=scanLiteralSourceCorpus(corpus.records,corpus.schema),queries=fixture.judgments.map(row=>literal(row.text,row.fields));
  queries.push(
    {kind:'and',children:[literal('WORK_LIMIT_EXCEEDED'),{kind:'text',text:'cancellation'}]},
    {kind:'or',children:[literal('WORK_LIMIT_EXCEEDED'),{kind:'text',text:'atomic'}]},
    {kind:'not',child:literal('NFKC')},
    {kind:'and',children:[literal('maxQueuedOperations'),{kind:'not',child:literal('WORK_LIMIT_EXCEEDED')}]},
    {kind:'or',children:[{kind:'and',children:[literal('NFKC'),'unmatchedword']},literal('__proto__')]},
    {kind:'not',child:{kind:'or',children:[literal('NFKC'),literal('__proto__')]}},
    {kind:'and',children:[literal('__proto__'),{kind:'eq',field:'category',value:'spec'}]},
    {kind:'or',children:[literal('0.75'),{kind:'group',variants:[{text:'atom',match:'prefix',weight:0.5}],fields:['body']}]},
    {kind:'and',children:[literal(' '),{kind:'text',text:'work queue',operator:'or'}]},
    {kind:'or',children:[literal('UTF-16'),literal('UTF-16'),'UTF-16']},
    {kind:'and',children:[literal('exact'),{kind:'not',child:{kind:'text',text:'unmatchedword'}}]},
    {kind:'or',children:[{kind:'none'},literal('Native',['title'])]},
  );
  let comparisons=0;for(const ordered of [corpus.records,[...corpus.records].reverse()]){const engine=configured(corpus.schema);try{await engine.addMany(ordered);for(const query of queries)for(const options of [{limit:0},{limit:1},{limit:3},{offset:1,limit:2},page]){compare(await engine.search(publicQuery(query),options),sourceLiteralQueryResult(model,query,options),'Complete raw source Boolean/page truth');comparisons++;}}finally{await engine.dispose();}}
  assert.equal(comparisons,340);t.diagnostic(`${comparisons} complete independent source membership/score comparisons across two insertion orders and five pages.`);
});

const sortedRanges=ranges=>ranges.map(range=>plain(range)).sort((a,b)=>a.leaf.localeCompare(b.leaf)||a.field.localeCompare(b.field)||a.valueIndex-b.valueIndex||a.start-b.start||a.end-b.end);
test('literal evidence reports every overlapping positive source occurrence but no negative or failed-branch ranges',async t=>{
  const model=scanLiteralSourceCorpus(records,referenceSchema),engine=configured(referenceSchema),selected=['a','b','c','d','e','f','g','absent'],queries=[
    literal('aba',['title']),literal('😀'),literal('cafe'),literal('\u0301'),literal('\u0000'),
    {kind:'or',children:[literal('aba'),literal('😀')]},
    {kind:'or',children:[{kind:'and',children:[literal('aba'),'unmatchedword']},literal('red')]},
    {kind:'and',children:[literal('red'),{kind:'not',child:literal('—')}]},
    {kind:'not',child:literal('red')},
    {kind:'or',children:[literal('aba'),literal('aba')]},
    {kind:'and',children:[literal('red'),literal('blue')]},
  ];let comparisons=0;
  try{await engine.addMany(records);for(const query of queries){const actual=await engine.search(publicQuery(query),{limit:1,extensions:{literal:{ids:selected}}});compare(actual,sourceLiteralQueryResult(model,query,{limit:1}),'Evidence is independent of paginated hits');const expected=sourceLiteralEvidence(model,query,selected,actual.revision),data=plain(actual.extensions.literal);assert.equal(data.kind,expected.kind);assert.equal(data.policy,expected.policy);assert.equal(data.scope,expected.scope);assert.equal(data.complete,true);assert.equal(data.revision,actual.revision);assert.deepEqual(data.leaves.map(leaf=>({...leaf,fields:[...leaf.fields].sort()})),expected.leaves);
    assert.equal(data.documents.length,selected.length);for(let i=0;i<selected.length;i++){const document=data.documents[i],reference=expected.documents[i];assert.equal(document.id,reference.id);assert.equal(document.eligibility,reference.eligibility);assert.deepEqual(sortedRanges(document.ranges),sortedRanges(reference.ranges));for(const range of document.ranges){const value=model.rawValues.get(document.id).get(range.field)[range.valueIndex],leaf=data.leaves.find(leaf=>leaf.path===range.leaf);assert.equal(value.slice(range.start,range.end),leaf.text);assert.equal('position'in range,false);assert.equal('term'in range,false);}}comparisons++;}}
  finally{await engine.dispose();}t.diagnostic(`${comparisons} complete literal evidence requests, including outside-page/absent IDs, overlaps, raw combining marks and successful Boolean path participation.`);
});

test('raw literal eligibility and original ranges stay independent of selected basic, English and identifier analysis',async t=>{
  const model=scanLiteralSourceCorpus(records,referenceSchema),needles=['aba','😀','café','cafe\u0301','cafe','\u0301','ffi','ﬃ','Api','Ａpi','i','İ','ss','ß','red—blue','foo.bar','_bar/','proto','redblue','\u0000'];let comparisons=0;
  for(const [name,extra] of [['basic',{}],['english',{analyzer:ENGLISH_ANALYZER,addons:[createEnglishAnalyzer()]}],['identifiers',{analyzer:IDENTIFIER_ANALYZER,addons:[createIdentifierAnalyzer()]}]]){const engine=configured(referenceSchema,extra);try{await engine.addMany(records);for(const text of needles){const query=literal(text),selected=records.map(row=>row.id),actual=await engine.search(publicQuery(query),{...page,extensions:{literal:{ids:selected}}});compare(actual,sourceLiteralQueryResult(model,query,page),name+': raw literal is not token analysis');assert.ok(actual.hits.every(hit=>hit.score===0));const expected=sourceLiteralEvidence(model,query,selected,actual.revision);assert.deepEqual(plain(actual.extensions.literal.documents).map(row=>({...row,ranges:sortedRanges(row.ranges)})),expected.documents.map(row=>({...row,ranges:sortedRanges(row.ranges)})),name+': raw evidence is not analyzer output');comparisons++;}}finally{await engine.dispose();}}
  assert.equal(comparisons,60);t.diagnostic(`${comparisons} literal comparisons across three independently selected analyzers; pure predicate scores remain zero.`);
});

test('native Inspector arithmetic preserves lexical BM25 and adds no literal-match bonus',async t=>{
  const schema={text:{title:{boost:2},body:{}}},items=[{id:'a',text:{title:'foo foo'}},{id:'b',text:{title:'foo bar'}},{id:'c',text:{title:'bar'}}],model=scanLiteralSourceCorpus(items,schema),engine=configured(schema,{addons:[createInspector()]});
  const query={kind:'or',children:[literal('bar',['title']),{kind:'text',text:'foo foo',fields:['title']}]};
  try{await engine.addMany(items);const actual=await engine.search(publicQuery(query),{limit:100,extensions:{inspector:{ids:['a','b','c']}}});compare(actual,sourceLiteralQueryResult(model,query,page),'Native lexical arithmetic is unchanged by a zero-score literal branch');const facts=actual.extensions.inspector.trace.facts,fields=facts.filter(fact=>fact.kind==='field');assert.equal(fields.length,2);for(const fact of fields){const tf=fact.id==='a'?2:1,expected=2*Math.log(1+(3-2+0.5)/(2+0.5))*(tf*2.2)/(tf+1.2*(0.25+0.75*2/(5/3)));assert.equal(fact.tf,tf);assert.equal(fact.df,2);assert.equal(fact.N,3);assert.equal(fact.length,2);assert.equal(fact.totalLength,5);assert.equal(fact.weight,1);close(fact.selected,expected,'Hand-derived native BM25 contribution');}for(const hit of actual.hits)close(fields.filter(fact=>fact.id===hit.id).reduce((sum,fact)=>sum+fact.selected,0),hit.score,'No hidden literal score');assert.equal(actual.hits.find(hit=>hit.id==='c').score,0);for(const fact of facts.filter(fact=>fact.kind==='node'&&fact.capability==='literal')){assert.equal(fact.node,'predicate');assert.deepEqual([...fact.groups],[]);}t.diagnostic('Two hand-derived native BM25 field facts; the literal-only document has score zero.');}
  finally{await engine.dispose();}
});

test('installing the unrequested literal capability preserves all 76 ordinary basic relevance results and source scores',async t=>{
  const fixture=await frozen(),{corpus,judgments}=await loadFrozenFixture(),model=scanPhraseSourceCorpus(corpus.records,corpus.schema),providers=()=>[createSourceProvider({fields}),createSourcePhrases({fields})],baseline=createRaveldex({schema:corpus.schema,addons:providers()}),installed=createRaveldex({schema:corpus.schema,addons:[...providers(),createLiteral({fields})]});
  try{await baseline.addMany(corpus.records);await installed.addMany(corpus.records);for(const row of judgments){const query=ordinaryPublicQuery(row.query),before=await baseline.search(query,page),after=await installed.search(query,page);compare(before,sourcePhraseQueryResult(model,row.query,page),row.id+': independent original basic source truth');assert.deepEqual(after,before,row.id+': unrequested literal cannot change ordinary results');}}
  finally{await baseline.dispose();await installed.dispose();}assert.equal(judgments.length,fixture.acceptance.originalBasicRegressionCount);t.diagnostic(`${judgments.length} unchanged ordinary basic results with the literal add-on installed but unrequested.`);
});
