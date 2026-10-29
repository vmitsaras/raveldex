import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaveldex } from '../../../dist/index.js';
import { createSynonyms, SYNONYMS_POLICY } from '../../../dist/addons/synonyms/index.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createFacets } from '../../../dist/addons/facets/index.js';
import { createInspector } from '../../../dist/addons/inspector/index.js';
import { createMatchEvidence } from '../../../dist/addons/evidence/index.js';
import { setup, synonyms, options, search } from './helpers.mjs';
const ids = value => value.hits.map(h=>h.id);
const data = value => JSON.parse(JSON.stringify(value));

test('synonym configuration owns canonical bounded plain data and versioned worker identity', async () => {
  const raw={fields:['body','title'],vocabularyVersion:'docs-v1',mappings:[{from:'BACKUP',to:'snapshot'},{from:'backup',to:'SNAPSHOT'},{from:'backup',to:'backup'}]};
  const addon=createSynonyms(raw);
  const same=createSynonyms({...raw,fields:['title','body'],mappings:[{from:'backup',to:'snapshot'}]});
  assert.equal(addon.manifest.execution.workerRegistration,same.manifest.execution.workerRegistration);
  raw.fields.pop();raw.mappings[0].to='other';raw.vocabularyVersion='changed';
  const f=setup({addons:[addon]});await f.call('add',{id:'a',text:{title:'snapshot'}});
  const result=await f.call('search',synonyms('backup'));
  assert.deepEqual(ids(result),['a']);assert.equal(result.extensions.synonyms.policy,SYNONYMS_POLICY+':docs-v1');
  assert.ok(Object.isFrozen(addon)&&Object.isFrozen(result.extensions.synonyms.groups[0].alternatives[0]));
  assert.deepEqual(Object.keys(f.engine.root.participants),[]);
  for(const change of [{vocabularyVersion:'docs-v2'},{mappings:[{from:'backup',to:'archive'}]},{maxWorkUnits:9999}])
    assert.notEqual(createSynonyms({...options,...change}).manifest.execution.workerRegistration,createSynonyms(options).manifest.execution.workerRegistration);
  assert.throws(()=>createRaveldex({schema:{text:{title:{}}},addons:[addon]}),{code:'INCOMPATIBLE_CAPABILITY'});
});

test('malformed endpoints, multiword graphs, factory fanout and byte-independent configuration limits reject', () => {
  let accessorRead=false;const edge={from:'backup'};Object.defineProperty(edge,'to',{enumerable:true,get(){accessorRead=true;return 'snapshot'}});
  for(const overrides of [{fields:[]},{fields:['title','title']},{fields:['__proto__']},{vocabularyVersion:''},{vocabularyVersion:'x y'},{vocabularyVersion:'\ud800'},
    {mappings:[edge]},{mappings:[{from:'',to:'snapshot'}]},{mappings:[{from:'backup',to:'two words'}]},{mappings:[{from:'!!!',to:'snapshot'}]},
    {mappings:[{from:'backup',to:'\ud800'}]},{mappings:[{from:'backup',to:'snapshot',extra:1}]},{mappings:new Array(1)},
    {mappings:Array.from({length:129},()=>({from:'a',to:'b'}))},{maxAlternatives:0},{maxAlternatives:16},{maxWorkUnits:Infinity},
    {mappings:[{from:'backup',to:'snapshot'},{from:'backup',to:'archive'}],maxAlternatives:1},{extra:1}])
    assert.throws(()=>createSynonyms({...options,...overrides}),e=>['INVALID_OPTIONS','LIMIT_EXCEEDED'].includes(e.code));
  assert.equal(accessorRead,false);
  const padded=Array.from({length:8},()=>({from:'a'.repeat(256),to:'b'.repeat(256)}));
  createSynonyms({...options,mappings:padded});
  assert.throws(()=>createSynonyms({...options,mappings:[...padded,{from:'a',to:'b'}]}),{code:'LIMIT_EXCEEDED'});
  createSynonyms({...options,mappings:Array.from({length:128},()=>({from:'a',to:'b'}))});
  createSynonyms({...options,mappings:[],vocabularyVersion:'a'.repeat(32)});
  assert.throws(()=>createSynonyms({...options,vocabularyVersion:'a'.repeat(33)}),{code:'LIMIT_EXCEEDED'});
  const manyFields=Array.from({length:32},(_,i)=>'f'+String(i).padStart(2,'0'));
  const wide=Array.from({length:128},(_,i)=>({from:'s'+String(i).padStart(3,'0')+'a'.repeat(12),to:'t'+String(i).padStart(3,'0')+'b'.repeat(12)}));
  const base=createSynonyms({...options,fields:manyFields,mappings:wide}).manifest.execution.workerRegistration.length;
  let remaining=8192-base;
  for(let i=0;i<manyFields.length;i++){const extra=Math.min(remaining,61);manyFields[i]+='x'.repeat(extra);remaining-=extra;}
  assert.equal(remaining,0);
  assert.equal(createSynonyms({...options,fields:manyFields,mappings:wide}).manifest.execution.workerRegistration.length,8192);
  const available=manyFields.findIndex(field=>field.length<64);manyFields[available]+='x';
  assert.throws(()=>createSynonyms({...options,fields:manyFields,mappings:wide}),e=>e.code==='LIMIT_EXCEEDED'&&e.details.limit===8192&&e.details.actual===8193);
});

test('single-step directional mappings preserve cycles, repeats, selected fields and one-time normalization', async () => {
  const f=setup();await f.call('addMany',[{id:'a',text:{title:'snapshot'}},{id:'b',text:{title:'archive'}},{id:'c',text:{title:'backup'}},{id:'d',text:{body:'snapshot'}}]);
  const result=await f.call('search',synonyms('backup'));assert.deepEqual(new Set(ids(result)),new Set(['a','c']));
  assert.deepEqual(data(result.extensions.synonyms.groups[0].alternatives),[{term:'backup',match:'exact',weight:1},{term:'snapshot',match:'exact',weight:0.5}]);
  assert.equal(result.extensions.synonyms.groups[0].dictionaryEntriesVisited,3);
  assert.deepEqual(new Set(ids(await f.call('search',synonyms('snapshot')))),new Set(['a','b']));
  assert.deepEqual(new Set(ids(await f.call('search',synonyms('archive')))),new Set(['a','b']));
  assert.deepEqual(ids(await f.call('search',synonyms('backup',['body']))),['d']);
  const repeat=await f.call('search',synonyms('backup backup'));assert.deepEqual(repeat.hits,result.hits);
  const distinct=await f.call('search',synonyms('backup checkpoint'));assert.deepEqual(ids(distinct),['a']);assert.equal(distinct.hits[0].score,2*result.hits.find(h=>h.id==='a').score);
  const unmapped=await f.call('search',synonyms('unmapped'));assert.equal(unmapped.extensions.synonyms.groups[0].dictionaryEntriesVisited,0);
  assert.deepEqual((await f.call('search',synonyms('!!!'))).extensions.synonyms.groups,[]);
  const normalized=setup({addons:[createSynonyms({...options,mappings:[{from:' CAFÉ, ',to:'½'},{from:'𐐀',to:'δοκιμή'}]})]});
  await normalized.call('addMany',[{id:'a',text:{title:'½'}},{id:'b',text:{title:'δοκιμή'}}]);
  assert.deepEqual(ids(await normalized.call('search',synonyms('cafe\u0301'))),['a']);
  assert.deepEqual(ids(await normalized.call('search',synonyms('𐐨'))),['b']);
  assert.equal((await normalized.call('search',synonyms('cafe'))).total,0);
});

test('explicit query admission validates missing/version/fields even for empty or noncontributing leaves', async () => {
  const f=setup({addons:[createSynonyms({...options,fields:['title']})]});
  for(const query of [synonyms('', ['body']),{...synonyms('backup'),version:2},{...synonyms('backup'),payload:{text:'backup',weight:2}},
    {kind:'or',children:[{kind:'all'},synonyms('', ['body'])]}])
    await assert.rejects(f.call('search',query),e=>['MISSING_CAPABILITY','INCOMPATIBLE_CAPABILITY','INVALID_QUERY'].includes(e.code));
  const plain=setup({addons:[]});await assert.rejects(plain.call('search',synonyms('backup')),{code:'MISSING_CAPABILITY'});
  await assert.rejects(f.call('search',{kind:'extension',capability:'synonyms',version:1,payload:{text:''}}),{code:'MISSING_CAPABILITY'});
  const custom=setup({addons:[createSynonyms({...options,id:'my.synonyms'})]});await custom.call('add',{id:'a',text:{title:'snapshot'}});
  assert.deepEqual(ids(await custom.call('search',synonyms('backup'))),['a']);
});

test('strict phrases and ordinary queries stay strict while Inspector and original evidence explain applied targets', async () => {
  const addons=[createSynonyms(options),createSourceProvider({fields:['title','body']}),createSourcePhrases({fields:['title','body']}),createFacets({fields:['category']}),createInspector()];
  const f=setup({addons});await f.call('addMany',[{id:'a',text:{title:'SNAPSHOT atomic'},metadata:{category:'guide'}},{id:'b',text:{title:'atomic snapshot'},metadata:{category:'api'}}]);
  assert.equal((await f.call('search','backup')).total,0);
  const phrase=text=>({kind:'extension',capability:'phrases',version:1,payload:{text,fields:['title']}});
  assert.equal((await f.call('search',phrase('backup atomic'))).total,0);assert.equal((await f.call('search',phrase('snapshot atomic'))).total,1);
  assert.equal((await f.call('search',{kind:'group',fields:['title'],variants:[{text:'back',match:'prefix'}]})).total,0);
  const facets=await f.call('search',synonyms('backup'),{extensions:{facets:{fields:[{field:'category'}]}}});assert.ok(facets.extensions.facets&&facets.extensions.synonyms);
  const inspected=await f.call('search',synonyms('backup'),{extensions:{inspector:{ids:['a']}}});
  assert.ok(inspected.extensions.inspector.trace.facts.some(row=>row.kind==='field'&&row.term==='snapshot'&&row.weight===0.5));
  const field=inspected.extensions.inspector.trace.facts.find(row=>row.kind==='field'&&row.term==='snapshot');
  const expected=0.5*field.boost*Math.log(1+(field.N-field.df+0.5)/(field.df+0.5))*(field.tf*2.2)/(field.tf+1.2*(0.25+0.75*field.length/(field.totalLength/field.N)));
  assert.ok(Math.abs(field.selected-expected)<1e-12);
  const or={kind:'or',children:[{kind:'and',children:[synonyms('backup'),{kind:'text',text:'missing'}]},{kind:'text',text:'atomic'}]};
  assert.deepEqual((await f.call('search',or)).hits,(await f.call('search','atomic')).hits);
  assert.equal((await f.call('search',{kind:'not',child:synonyms('backup')})).total,0);
  const match=setup({addons:[createSynonyms(options),createSourceProvider({fields:['title']}),createMatchEvidence({fields:{title:'source'}})]});
  await match.call('add',{id:'a',text:{title:'SNAPSHOT atomic snapshot'}});
  const ranges=await match.call('search',synonyms('backup'),{extensions:{'match-evidence':{ids:['a'],fields:['title']}}});
  assert.deepEqual(ranges.extensions['match-evidence'].documents[0].ranges.map(({start,end,term})=>({start,end,term})),[{start:0,end:8,term:'snapshot'},{start:16,end:24,term:'snapshot'}]);
});
