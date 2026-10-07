import test from 'node:test';
import assert from 'node:assert/strict';
import { bucketOf, directoryGet } from '../../../dist/core/index/directory.js';
import { executeSearch } from '../../../dist/core/query/search.js';
import { setup, request, drain } from './helpers.mjs';

// Private corruption probes preserve frozen revision headers. They verify that
// malformed provider data cannot turn a requested display slice into a success.
function changeSource(root, record) {
 const old=root.participants.source,slot=bucketOf('a');
 const bucket=Object.freeze(Object.assign(Object.create(null),old.records.buckets[slot],{a:record}));
 const buckets=Object.freeze(Object.assign(Object.create(null),old.records.buckets,{[slot]:bucket}));
 const source=Object.freeze({...old,records:Object.freeze({...old.records,buckets})});
 return Object.freeze({...root,participants:Object.freeze({...root.participants,source})});
}
test('offset snippets reject source spelling divergence and spans that would split original surrogate pairs',async()=>{
 const state=setup('offsets',{}, {fields:{title:'offsets'},snippets:true});
 await state.call('add',{id:'a',text:{title:'red blue red'}});
 const original=state.engine.root,record=directoryGet(original.participants.source.records,'a');
 for(const text of ['bad blue bad','xy𐐀 blue red']){
  const poisoned=changeSource(original,Object.freeze({...record,text:Object.freeze({title:Object.freeze([text])})}));
  assert.throws(()=>drain(executeSearch(poisoned,'red',request(['a'],{},'snippets'))),{code:'INCOMPATIBLE_CAPABILITY'});
 }
 assert.equal(state.engine.root,original);
 const recovered=await state.call('search','red',request(['a'],{},'snippets'));
 assert.equal(recovered.extensions.snippets.documents[0].snippets[0].text,'red blue red');
 await state.call('dispose');
});
test('offset snippet source descriptors reject frozen record, field and value accessors without executing them',async()=>{
 const state=setup('offsets',{}, {fields:{title:'offsets'},snippets:true});
 await state.call('add',{id:'a',text:{title:'red blue red'}});
 const original=state.engine.root,record=directoryGet(original.participants.source.records,'a');let getters=0;
 const accessor=(object,key,value)=>{Object.defineProperty(object,key,{enumerable:true,get(){getters++;return value;}});return Object.freeze(object);};
 const recordGetter=accessor({retainedEntries:record.retainedEntries,textCodeUnits:record.textCodeUnits},'text',record.text);
 const fieldGetter=Object.freeze({...record,text:accessor({},'title',record.text.title)});
 const valueGetter=Object.freeze({...record,text:Object.freeze({title:accessor(new Array(1),'0','red blue red')})});
 for(const malformed of [recordGetter,fieldGetter,valueGetter])assert.throws(()=>drain(executeSearch(changeSource(original,malformed),'red',request(['a'],{},'snippets'))),{code:'INCOMPATIBLE_CAPABILITY'});
 assert.equal(getters,0);assert.equal((await state.call('search','red')).total,1);
 await state.call('dispose');
});
