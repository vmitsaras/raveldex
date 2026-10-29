import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaveldex} from '../../../dist/index.js';
import {createLiteral,LITERAL_POLICY} from '../../../dist/addons/literal/index.js';
import {createSourceProvider} from '../../../dist/addons/phrases/source.js';
import {createEnglishAnalyzer,ENGLISH_ANALYZER} from '../../../dist/integrations/languages/english/index.js';
import {createIdentifierAnalyzer,IDENTIFIER_ANALYZER} from '../../../dist/addons/identifiers/index.js';

const schema={text:{title:{},body:{}}};
const query=(text,fields)=>({kind:'extension',capability:'literal',version:1,payload:{text,...(fields?{fields}:{})}});
const fields=['title','body'];
const configuration=(options={})=>({schema,addons:[createSourceProvider({fields}),createLiteral({fields,...options})]});
const plain=value=>JSON.parse(JSON.stringify(value));
const ids=result=>result.hits.map(hit=>hit.id);
const evidence=(ids,extra={})=>({extensions:{literal:{ids,...extra}}});
const records=[
  {id:'a',text:{title:'Alpha/Beta ababa 😀 café cafe\u0301',body:['left','right']}},
  {id:'b',text:{title:'alpha/beta ABA',body:'left right'}},
  {id:'c',text:{title:'',body:'💡'}},
  {id:'d',text:{body:'first\nsecond'}},
];

test('literal source scan matches punctuation and interior substrings without token candidates or normalization',async()=>{
  const engine=createRaveldex(configuration());
  try{
    await engine.addMany(records);
    for(const [text,expected]of [['ha/B',['a']],['Alpha',['a']],['alpha',['b']],['/B',['a']],['/b',['b']],['aba',['a']],['ABA',['b']],['😀',['a']],['💡',['c']],['café',['a']],['cafe\u0301',['a']],['\n',['d']],[' ',['a','b']],['unmatchedword',[]]]){
      const result=await engine.search(query(text),{limit:100});assert.deepEqual(ids(result),expected,text);assert.equal(result.total,expected.length);assert.equal(result.completeness,'complete');assert.ok(result.hits.every(hit=>hit.score===0));
      const zero=await engine.search(query(text),{limit:0});assert.equal(zero.total,expected.length);assert.deepEqual(zero.hits,[]);
    }
    assert.equal((await engine.search('ha')).total,0,'ordinary exact token query is not silently literal');
    assert.equal((await engine.search(query('CAFÉ'))).total,0,'no case folding');
    assert.equal((await engine.search(query('cafe'))).total,1,'literal unaccented prefix is present in the decomposed source, not folded café');
  }finally{await engine.dispose();}
});

test('literal qualification respects each original value and selected field with exact totals before pages',async()=>{
  const engine=createRaveldex(configuration());
  try{
    await engine.addMany([...records].reverse());
    assert.deepEqual(ids(await engine.search(query('left right'))),['b']);
    assert.deepEqual(ids(await engine.search(query('leftright'))),[]);
    assert.deepEqual(ids(await engine.search(query('Alpha',['body']))),[]);
    assert.deepEqual(ids(await engine.search(query('Alpha',['title']))),['a']);
    const all=await engine.search(query(' '),{limit:100}),page=await engine.search(query(' '),{limit:1,offset:1});assert.deepEqual(ids(all),['a','b']);assert.equal(page.total,2);assert.deepEqual(ids(page),['b']);
    await assert.rejects(engine.search(query('Alpha',['unknown'])),{code:'MISSING_CAPABILITY'});
    await assert.rejects(engine.search(query('Alpha',[])),{code:'INVALID_QUERY'});
  }finally{await engine.dispose();}
});

test('raw evidence enumerates overlapping original UTF16 spans without token positions or invented term facts',async()=>{
  const engine=createRaveldex(configuration());
  try{
    await engine.addMany(records);const result=await engine.search(query('aba',['title']),evidence(['a','b','ghost'])),data=plain(result.extensions.literal);
    assert.deepEqual(data,{kind:'raveldex-literal-evidence-v1',policy:LITERAL_POLICY,revision:1,scope:'successful-positive-literal-occurrences',complete:true,
      leaves:[{path:'query',text:'aba',fields:['title']}],documents:[
        {id:'a',eligibility:'matched',ranges:[{leaf:'query',field:'title',valueIndex:0,start:11,end:14},{leaf:'query',field:'title',valueIndex:0,start:13,end:16}]},
        {id:'b',eligibility:'excluded',ranges:[]},{id:'ghost',eligibility:'absent',ranges:[]} ]});
    for(const [text,start,end]of [['😀',17,19],['café',20,24],['cafe\u0301',25,30],['\u0301',29,30]]){
      const actual=plain((await engine.search(query(text,['title']),evidence(['a']))).extensions.literal).documents[0].ranges;
      assert.deepEqual(actual,[{leaf:'query',field:'title',valueIndex:0,start,end}]);assert.equal(records[0].text.title.slice(start,end),text);
    }
    assert.ok(Object.isFrozen(result.extensions.literal)&&Object.isFrozen(result.extensions.literal.documents[0].ranges));
    await engine.add({id:'emoji',text:{title:'😀😀😀'}});
    const overlap=plain((await engine.search(query('😀😀',['title']),evidence(['emoji']))).extensions.literal.documents[0].ranges);
    assert.deepEqual(overlap,[{leaf:'query',field:'title',valueIndex:0,start:0,end:4},{leaf:'query',field:'title',valueIndex:0,start:2,end:6}]);
  }finally{await engine.dispose();}
});

test('literal evidence uses actual successful positive Boolean paths and never highlights failed AND or NOT children',async()=>{
  const engine=createRaveldex(configuration());
  const q={kind:'or',children:[{kind:'and',children:[query('ababa'),query('missing')]},query('Alpha'),{kind:'not',child:query('Beta')}]};
  try{
    await engine.addMany(records);const result=await engine.search(q,evidence(['a','b','ghost'])),data=plain(result.extensions.literal);
    assert.deepEqual(data.leaves.map(leaf=>leaf.path),['query.children[0].children[0]','query.children[0].children[1]','query.children[1]','query.children[2].child']);
    assert.deepEqual(data.documents,[{id:'a',eligibility:'matched',ranges:[{leaf:'query.children[1]',field:'title',valueIndex:0,start:0,end:5}]},{id:'b',eligibility:'matched',ranges:[]},{id:'ghost',eligibility:'absent',ranges:[]}]);
    const mixed={kind:'and',children:[{kind:'text',text:'alpha'},query('/')]};
    const lexical=await engine.search('alpha',{limit:100}),filtered=await engine.search(mixed,{limit:100});assert.deepEqual(filtered.hits,lexical.hits,'literal filter adds zero lexical groups and no bonus');
    await assert.rejects(engine.search(query('aba'),evidence(['a'],{expectedRevision:0})),{code:'REVISION_MISMATCH'});
  }finally{await engine.dispose();}
});

test('literal matching ignores selected tokenizer policy while registration leaves ordinary basic English and code search unchanged',async()=>{
  for(const selected of [null,'english','code']){
    const pack=selected==='english'?createEnglishAnalyzer():selected==='code'?createIdentifierAnalyzer():null;
    const analyzer=selected==='english'?ENGLISH_ANALYZER:selected==='code'?IDENTIFIER_ANALYZER:undefined;
    const make=withLiteral=>createRaveldex({schema,...(analyzer?{analyzer}:{}),addons:[...(pack?[pack]:[]),createSourceProvider({fields}),...(withLiteral?[createLiteral({fields})]:[])]});
    const baseline=make(false),engine=make(true);
    try{
      const values=[...records,{id:'e',text:{title:'Running fooBar WORK_LIMIT'}}];await baseline.addMany(values);await engine.addMany(values);
      for(const text of ['Alpha','run','running','foo bar','fooBar','work limit','ha',''])assert.deepEqual(await engine.search(text,{limit:100}),await baseline.search(text,{limit:100}),selected+': '+text);
      assert.deepEqual(ids(await engine.search(query('nning fooB'))),['e']);assert.equal((await engine.search(query('RUNNING'))).total,0);
      assert.equal((await engine.search(query('WORK_LIMIT'))).hits[0].score,0);
    }finally{await engine.dispose();await baseline.dispose();}
  }
});

test('literal bounded payload ownership and malformed/empty inputs reject without executing getters',async()=>{
  let reads=0;const input={};Object.defineProperty(input,'fields',{enumerable:true,get(){reads++;return fields;}});assert.throws(()=>createLiteral(input),{code:'INVALID_OPTIONS'});assert.equal(reads,0);
  assert.throws(()=>createRaveldex({schema,addons:[createLiteral({fields})]}),{code:'MISSING_CAPABILITY'});
  const engine=createRaveldex(configuration());
  try{
    await engine.addMany(records);
    for(const text of ['','\ud800','\udc00'])await assert.rejects(engine.search(query(text)),{code:'INVALID_QUERY'});
    const payload={};Object.defineProperty(payload,'text',{enumerable:true,get(){reads++;return 'Alpha';}});
    await assert.rejects(engine.search({kind:'extension',capability:'literal',version:1,payload}),{code:'INVALID_QUERY'});assert.equal(reads,0);
    assert.equal((await engine.search(query('x'.repeat(2043),['title']))).total,0);
    await assert.rejects(engine.search(query('x'.repeat(2044),['title'])),{code:'LIMIT_EXCEEDED'});
    await assert.rejects(engine.search(query('a'),evidence(['a','a'])),{code:'INVALID_OPTIONS'});
    await assert.rejects(engine.search(query('a'),evidence(['a'],{maxRanges:257})),{code:'LIMIT_EXCEEDED'});
    await assert.rejects(engine.search(query('a'),evidence(['a'],{maxRanges:0})),{code:'INVALID_OPTIONS'});
  }finally{await engine.dispose();}
});

test('literal range and output ceilings fail whole operations instead of returning partial evidence',async()=>{
  for(const options of [{maxRanges:1},{maxOutputEntries:1}]){
    const engine=createRaveldex(configuration(options));
    try{await engine.addMany(records);await assert.rejects(engine.search(query('aba'),evidence(['a'])),{code:'LIMIT_EXCEEDED'});assert.equal((await engine.search(query('aba'))).total,1);}
    finally{await engine.dispose();}
  }
  const engine=createRaveldex(configuration({maxRanges:2}));
  try{await engine.addMany(records);const result=await engine.search(query('aba'),evidence(['a']));assert.equal(result.extensions.literal.documents[0].ranges.length,2);}
  finally{await engine.dispose();}
});

test('literal selected-source results and original evidence follow atomic replace remove clear and opaque IDs',async()=>{
  const engine=createRaveldex(configuration());
  try{
    await engine.add({id:'__proto__',text:{title:'x.y/x.y'}});assert.equal((await engine.search(query('.y'))).total,1);
    await engine.replace({id:'__proto__',text:{title:'x-y'}});assert.equal((await engine.search(query('.y'))).total,0);
    const after=await engine.search(query('-y'),evidence(['__proto__']));assert.equal(after.revision,2);assert.deepEqual(plain(after.extensions.literal.documents[0].ranges),[{leaf:'query',field:'title',valueIndex:0,start:1,end:3}]);
    await engine.remove('__proto__');assert.equal((await engine.search(query('-y'))).total,0);
    await engine.add({id:'again',text:{title:'x-y'}});await engine.clear();assert.equal((await engine.search(query('-y'))).total,0);
  }finally{await engine.dispose();}
});
