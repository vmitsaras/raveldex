import test from 'node:test';
import assert from 'node:assert/strict';
import { createSuggestions, SUGGESTIONS_POLICY } from '../../../dist/addons/suggestions/index.js';
import { createFacets } from '../../../dist/addons/facets/index.js';
import { createInspector } from '../../../dist/addons/inspector/index.js';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { setup, request, schema } from './helpers.mjs';
const data = value => JSON.parse(JSON.stringify(value));

test('completion ranks complete cross-field DF sums with ordinal ties, exact candidates and independent search pages', async () => {
  const f=setup();
  await f.call('addMany',[
    {id:'1',text:{title:'source source sound soup',body:'sound'}},
    {id:'2',text:{title:'source soup solar',body:'solar'}},
    {id:'3',text:{title:'source',body:'sound'}}
  ]);
  const actual=await f.call('search','zzzz',{...request('SO',{fields:['body','title'],limit:3}),limit:0});
  assert.equal(actual.total,0);assert.deepEqual(actual.hits,[]);
  assert.deepEqual(data(actual.extensions.suggestions),{policy:SUGGESTIONS_POLICY,prefix:'so',fields:['body','title'],total:4,omitted:1,
    items:[{term:'sound',fieldDocumentFrequency:3},{term:'source',fieldDocumentFrequency:3},{term:'solar',fieldDocumentFrequency:2}],dictionaryEntriesVisited:6});
  const noOutput=await f.call('search','source',request('so',{limit:0}));
  assert.equal(noOutput.extensions.suggestions.total,4);assert.equal(noOutput.extensions.suggestions.omitted,4);assert.deepEqual(noOutput.extensions.suggestions.items,[]);
  assert.deepEqual(data((await f.call('search','source',request('source'))).extensions.suggestions.items),[{term:'source',fieldDocumentFrequency:3}]);
  const normal=await f.call('search','source',{offset:1,limit:1});
  const requested=await f.call('search','source',{...request('so'),offset:1,limit:1});
  const {extensions,...same}=requested;assert.deepEqual(same,normal);assert.equal(extensions.suggestions.total,4);
  const filtered=await f.call('search',{kind:'eq',field:'category',value:'absent'},request('so'));
  assert.equal(filtered.total,0);assert.equal(filtered.extensions.suggestions.total,4);
  assert.ok(Object.isFrozen(actual.extensions.suggestions));assert.ok(Object.isFrozen(actual.extensions.suggestions.items[0]));
});

test('empty/short requests validate fields and Unicode; one original token is normalized exactly once', async () => {
  const f=setup();await f.call('add',{id:'1',text:{title:'café cafe a½bc 𐐀test δοκιμή δοκιμη'}});
  for(const text of ['', ' ! ', 'a', '𐐀']){
    const output=(await f.call('search','',request(text))).extensions.suggestions;
    assert.deepEqual(output.items,[]);assert.equal(output.total,0);assert.equal(output.dictionaryEntriesVisited,0);
  }
  for(const [text,terms] of [[' CAFÉ, ',['café']],['ca',['cafe','café']],['a½',['a1⁄2bc']],['𐐀t',['𐐨test']],['δοκιμ',['δοκιμή','δοκιμη']]]){
    assert.deepEqual((await f.call('search','',request(text))).extensions.suggestions.items.map(i=>i.term),terms);
  }
  for(const payload of [{text:'two words'},{text:'\ud800'},{text:'so',fields:[]},{text:'',fields:['unknown']},{text:'',fields:['title','title']},{text:'so',extra:true},{text:'so',limit:-1},{text:'so',limit:1.5},{text:'so',limit:21}])
    await assert.rejects(f.call('search','',{extensions:{suggestions:payload}}),error=>['INVALID_OPTIONS','LIMIT_EXCEEDED'].includes(error.code));
  const limited=setup({addons:[createSuggestions({fields:['title']})]});
  await assert.rejects(limited.call('search','',{extensions:{suggestions:{text:''}}}),{code:'MISSING_CAPABILITY'});
  const missing=setup({addons:[]});await assert.rejects(missing.call('search','',request('so')),{code:'MISSING_CAPABILITY'});
  const tinyRecords=setup({limits:{maxTextCodeUnitsPerValue:1}});await tinyRecords.call('add',{id:'t',text:{title:'ﬃ'}});
  assert.equal((await tinyRecords.call('search','',request('ff'))).extensions.suggestions.items[0].term,'ffi');
  for(const options of [{fields:[]},{fields:['title','title']},{fields:['constructor']},{fields:['title'],maxCandidates:10001},{fields:['title'],maxSuggestions:21},{fields:['title'],maxWorkUnits:0}])
    assert.throws(()=>createSuggestions(options),error=>['INVALID_OPTIONS','LIMIT_EXCEEDED'].includes(error.code));
});

test('admission owns request/factory inputs without reading accessors, and mixed roles are refused', async () => {
  const fields=['title','body'],options={fields,maxSuggestions:2};const addon=createSuggestions(options);
  fields.length=0;options.maxSuggestions=1;
  const f=setup({addons:[addon]});await f.call('add',{id:'a',text:{title:'source sound'}});
  const payload={text:'so',fields:['title'],limit:2};const pending=f.engine.search('',{extensions:{suggestions:payload}});
  payload.text='zz';payload.fields[0]='body';payload.limit=1;f.host.runReady();
  assert.equal((await pending).extensions.suggestions.items.length,2);
  let reads=0;const accessor={get text(){reads++;return 'so'}};
  await assert.rejects(f.call('search','',{extensions:{suggestions:accessor}}),{code:'INVALID_OPTIONS'});assert.equal(reads,0);
  const invalid={...addon,manifest:{...addon.manifest,roles:['dictionary-output','aggregation']}};
  assert.throws(()=>captureConfiguration({schema,addons:[invalid]}),{code:'INCOMPATIBLE_CAPABILITY'});
});

test('dictionary output merges with facets and Inspector without becoming trace-selected search terms', async () => {
  const f=setup({addons:[createSuggestions({fields:['title','body']}),createFacets({fields:['category']}),createInspector()]});
  await f.call('add',{id:'a',text:{title:'source sound'},metadata:{category:'guide'}});
  const result=await f.call('search','source',{extensions:{...request('so').extensions,facets:{fields:[{field:'category'}]},inspector:{ids:['a']}}});
  assert.deepEqual(Object.keys(result.extensions).sort(),['facets','inspector','suggestions']);
  assert.equal(result.total,1);assert.equal(result.extensions.suggestions.total,2);assert.ok(JSON.stringify(result.extensions.inspector).includes('source'));
});
