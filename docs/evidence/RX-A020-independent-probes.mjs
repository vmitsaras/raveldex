import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const root='/Users/vasilis/Documents/GitHub/raveldex';
const {createRaveldex}=await import(pathToFileURL(root+'/dist/index.js'));
const {createSuggestions}=await import(pathToFileURL(root+'/dist/addons/suggestions/index.js'));
const rows=[];
const schema={text:{title:{},body:{}},metadata:{category:{type:'string'}}};
const plain=value=>JSON.parse(JSON.stringify(value));
const request=(text,extra={})=>({extensions:{suggestions:{text,...extra}}});
async function probe(name,fn){try{await fn();rows.push({name,status:'Pass'});}catch(error){rows.push({name,status:'Fail',error:{name:error.name,message:error.message,code:error.code,details:error.details}});}}
async function withEngine(config,fn){const e=createRaveldex(config);try{return await fn(e);}finally{await e.dispose();}}
await probe('Complete cross-field aggregate winner precedes stronger per-field-only candidates',()=>withEngine({schema,addons:[createSuggestions({fields:['title','body']})]},async e=>{
  await e.addMany([{id:'1',text:{title:'abshared',body:'abshared'}},{id:'2',text:{title:'abshared',body:'abshared'}},...['3','4','5'].map(id=>({id,text:{title:'abright abright',body:'abroad'}}))]);
  const before=await e.search('abright');const actual=await e.search('abright',request('ab',{limit:1}));
  const {extensions,...same}=actual;assert.deepEqual(same,before);
  assert.deepEqual(plain(extensions.suggestions.items),[{term:'abshared',fieldDocumentFrequency:4}]);
  assert.equal(extensions.suggestions.total,3);assert.equal(extensions.suggestions.dictionaryEntriesVisited,4);
}));
await probe('Only selected fields qualify candidates; short invalid/disabled fields reject',()=>withEngine({schema,addons:[createSuggestions({fields:['title']})]},async e=>{
  await e.add({id:'1',text:{title:'source',body:'sound'}});
  assert.deepEqual(plain((await e.search('',request('so',{fields:['title']}))).extensions.suggestions.items),[{term:'source',fieldDocumentFrequency:1}]);
  await assert.rejects(e.search('',request('',{fields:['body']})),{code:'MISSING_CAPABILITY'});
  await assert.rejects(e.search('',request('',{fields:['unknown']})),{code:'INVALID_OPTIONS'});
}));
await probe('Empty, short and punctuation-only requests return no dictionary visits',()=>withEngine({schema,addons:[createSuggestions({fields:['title','body']})]},async e=>{
  await e.add({id:'1',text:{title:'𐐀test atomic'}});
  for(const text of ['', '?!', 'a', '𐐀']){const result=(await e.search('',request(text))).extensions.suggestions;assert.equal(result.total,0);assert.equal(result.dictionaryEntriesVisited,0);}
}));
await probe('NFKC original token is normalized once and astral minimum uses code points',()=>withEngine({schema,addons:[createSuggestions({fields:['title','body']})]},async e=>{
  await e.add({id:'1',text:{title:'a½bc 𐐀test cafe café δοκιμη δοκιμή'}});
  assert.equal((await e.search('',request('a½'))).extensions.suggestions.items[0].term,'a1⁄2bc');
  assert.equal((await e.search('',request('𐐀t'))).extensions.suggestions.items[0].term,'𐐨test');
  assert.deepEqual((await e.search('',request('ca'))).extensions.suggestions.items.map(i=>i.term),['cafe','café']);
  assert.deepEqual((await e.search('',request('δοκιμ'))).extensions.suggestions.items.map(i=>i.term),['δοκιμή','δοκιμη']);
}));
await probe('Zero output capacity retains full total; candidate overflow rejects even with limit zero',()=>withEngine({schema,addons:[createSuggestions({fields:['title','body'],maxCandidates:1})]},async e=>{
  await e.add({id:'1',text:{title:'source sound'}});
  await assert.rejects(e.search('',request('so',{limit:0})),{code:'LIMIT_EXCEEDED'});
  assert.equal((await e.search('source')).total,1);
  const result=(await e.search('',request('source',{limit:0}))).extensions.suggestions;assert.equal(result.total,1);assert.equal(result.omitted,1);assert.deepEqual(result.items,[]);
}));
await probe('Output cap includes object keys, array length, slots and item keys',async()=>{
  const native=createSuggestions({fields:['title','body']});
  // 9 + two fields + 3 keys/slot for one result = 14; cap13 must fail.
  for(const [cap,expectFailure]of [[13,true],[14,false]])await withEngine({schema,addons:[{...native,manifest:{...native.manifest,limits:{...native.manifest.limits,maxOutputEntries:cap}}}]},async e=>{
    await e.add({id:'1',text:{title:'source'}});
    if(expectFailure)await assert.rejects(e.search('',request('so',{limit:1})),{code:'LIMIT_EXCEEDED'});
    else {const value=(await e.search('',request('so',{limit:1}))).extensions.suggestions;const count=value=>value&&typeof value==='object'?Reflect.ownKeys(value).length+Object.keys(value).reduce((sum,key)=>sum+count(value[key]),0):0;assert.equal(count(value),14);}
  });
});
await probe('Query lexical capacity does not inherit record-value length ceiling',()=>withEngine({schema:{text:{title:{}}},limits:{maxTextCodeUnitsPerValue:1},addons:[createSuggestions({fields:['title']})]},async e=>{
  await e.add({id:'a',text:{title:'ﬃ'}});assert.equal((await e.search('ffi')).total,1);
  assert.deepEqual(plain((await e.search('',request('ff'))).extensions.suggestions.items),[{term:'ffi',fieldDocumentFrequency:1}]);
}));
await probe('Generic dictionary reader refuses a field outside manifest requirements',async()=>{
  const native=createSuggestions({fields:['title']});
  const registration={...native,dictionary:{...native.dictionary,*prepare(context){for(const step of context.dictionary(['body']))yield step;throw Error('Unauthorized read succeeded');}}};
  await withEngine({schema,addons:[registration]},async e=>{
    await e.add({id:'a',text:{title:'source',body:'sound'}});
    await assert.rejects(e.search('',request('so',{fields:['title']})),{code:'MISSING_CAPABILITY'});
  });
});
await probe('Aliases of one trusted dictionary registration share one work cap',async()=>{
  const native=createSuggestions({fields:['title','body']});
  async function succeeds(cap,aliases){
    const registration={...native,manifest:{...native.manifest,provides:[{id:'suggestions',contractVersion:1},{id:'completion-alias',contractVersion:1}],limits:{...native.manifest.limits,maxWorkUnits:cap}}};
    return await withEngine({schema,addons:[registration]},async e=>{
      await e.add({id:'a',text:{title:'source sound'}});
      const extensions={suggestions:{text:'so'}};if(aliases)extensions['completion-alias']={text:'so'};
      try{await e.search('',{extensions});return true;}catch(error){assert.equal(error.code,'WORK_LIMIT_EXCEEDED');return false;}
    });
  }
  let low=1,high=10000;while(low<high){const mid=Math.floor((low+high)/2);if(await succeeds(mid,false))high=mid;else low=mid+1;}
  assert.equal(await succeeds(low,false),true);assert.equal(await succeeds(low+1,true),false);assert.equal(await succeeds(low*2,true),true);
});
const sources=['src/core/capabilities/types.ts','src/core/capabilities/registration.ts','src/core/capabilities/refinement.ts','src/core/contracts/options.ts','src/core/query/search.ts','src/addons/suggestions/index.ts','src/addons/suggestions/options.ts'];
const hashes={};for(const path of sources)hashes[path]=createHash('sha256').update(await readFile(root+'/'+path)).digest('hex');
const report={kind:'raveldex-rx-a020-independent-review-v1',at:new Date().toISOString(),reviewer:'/root/suggestions_contract',scope:'Read-only source, protocol and direct runtime probes; no build or network actions.',runtime:process.version,sourceSha256:hashes,probes:rows};
await writeFile('/tmp/raveldex-rx-a020-independent-probes.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
