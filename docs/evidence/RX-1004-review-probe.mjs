// Independent reviewer probe; run after npm run build from repository root.
import assert from 'node:assert/strict';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { MutationOwner } from '../../dist/core/mutations/owner.js';
import { executeSearch } from '../../dist/core/query/search.js';
import { directoryEntries } from '../../dist/core/index/directory.js';
import { inspectIndex } from '../../dist/core/index/invariants.js';
import { scanSourceCorpus, sourceQueryResult } from '../../test/oracle/query.mjs';
const schema={text:{title:{boost:2},body:{}},metadata:{flag:{type:'boolean'},labels:{type:'string',multi:true,nullable:true}}};
function drain(cursor, observe) { let count=0; for(;;) {const step=cursor.next();observe?.(step); if(step.done)return step.value; assert.ok(Number.isSafeInteger(step.value.workUnits)); count++; if(count>1e7)throw Error('runaway');} }
function initial(records=[],limits) {const c=new IndexConstruction({schema,...(limits?{limits}:{})});for(let i=0;i<records.length;i+=256)drain(c.append(records.slice(i,i+256)));return drain(c.finish());}
function verify(root, sources, revision) {
 assert.equal(root.revision,revision); drain(inspectIndex(root));
 const corpus=scanSourceCorpus([...sources.values()],schema);
 let texts=0,tokens=0,dictionary=0,postings=0;
 for(const r of sources.values())for(const field of Object.values(r.text))for(const s of typeof field==='string'?[field]:field)texts+=s.length;
 for(const [name,s] of corpus.statistics){tokens+=s.totalLength;dictionary+=s.documentFrequencies.size;for(const df of s.documentFrequencies.values())postings+=df;assert.equal(root.fields[name].length,s.totalLength);assert.equal(root.fields[name].documents,s.population);}
 assert.deepEqual(root.counts,{documents:sources.size,textCodeUnits:texts,tokens,dictionaryEntries:dictionary,postingEntries:postings});
 assert.deepEqual([...directoryEntries(root.documents)].map(([id])=>id).sort(),[...sources.keys()].sort());
 for(const q of ['common','red blue',{kind:'group',variants:[{text:'ca',match:'prefix',weight:.6}]},{kind:'not',child:{kind:'text',text:'red'}},{kind:'or',children:[{kind:'text',text:'red'},{kind:'eq',field:'flag',value:true}]},{kind:'eq',field:'labels',value:null}]){
  const want=sourceQueryResult(corpus,q,{limit:100});const got=drain(executeSearch(root,q,{limit:100}));assert.equal(got.revision,revision);assert.equal(got.total,want.total);assert.deepEqual(got.hits.map(h=>h.id),want.hits.map(h=>h.id));for(let i=0;i<got.hits.length;i++)assert.ok(Math.abs(got.hits[i].score-want.hits[i].score)<1e-12);
 }
}
let operations=0,comparisons=0;
for(const seed of [0x122331,0x554321,0xdeaddead]){
 let x=seed;const next=n=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x%n;};
 const pool=['','! 😀','red','blue blue','car carbon carpet','common red common','½ ﬁle','İ Σ Straße','a\u0301 東京都'];
 const rec=id=>({id,text:{title:pool[next(pool.length)],body:next(2)?[pool[next(pool.length)],'',pool[next(pool.length)]]:[]},metadata:{flag:!!next(2),labels:[null,'x','x']}});
 let records=new Map(Array.from({length:25},(_,i)=>{const r=rec(`d${i}`);return [r.id,r];}));let revision=0;const owner=new MutationOwner(initial([...records.values()]));
 for(let op=0;op<250;op++){
  const prior=owner.root, snapshot=JSON.stringify(prior);const type=next(6);let cursor,changed=false;
  if(type<2){const id=`d${next(65)}`,r=rec(id);if(records.has(id)){cursor=owner.mutate('replace',r);changed=true;}else{cursor=owner.mutate('add',r);changed=true;} records.set(id,r);}
  else if(type===2){const ids=[...new Set(Array.from({length:next(7)},()=>`d${next(65)}`))];for(const id of ids)changed=records.delete(id)||changed;cursor=owner.mutate('remove',ids);}
  else if(type===3){changed=!!records.size;cursor=owner.mutate('clear');records.clear();}
  else if(type===4){const added=Array.from({length:next(7)},(_,i)=>rec(`n${op}:${i}`));changed=!!added.length;cursor=owner.mutate('addMany',added);for(const r of added)records.set(r.id,r);}
  else{cursor=owner.mutate('remove',`absent${op}`);}
  const result=drain(cursor,step=>{assert.equal(JSON.stringify(prior),snapshot);if(!step.done)assert.equal(owner.root,prior);});if(changed)revision++;assert.equal(result.changed,changed);assert.equal(result.revision,revision);verify(owner.root,records,revision);operations++;comparisons+=6;
 }
}
const fixture=[{id:'old',text:{title:'common red'},metadata:{flag:false}}];
for(const phase of ['start','validation','analysis','staging','core','prepared','precommit']){
 const owner=new MutationOwner(initial(fixture)),prior=owner.root,snapshot=JSON.stringify(prior),marker=Error(phase);let hits=0;
 assert.throws(()=>drain(owner.execute(owner.capture('replace',{id:'old',text:{title:'changed changed'}}),{checkpoint(at){if(at===phase){hits++;throw marker;}}})),e=>e===marker);assert.ok(hits);assert.equal(owner.root,prior);assert.equal(JSON.stringify(prior),snapshot);drain(owner.mutate('add',{id:'recover',text:{}}));
}
for(const start of [false,true]){
 const owner=new MutationOwner(initial(fixture)),prior=owner.root;const cursor=owner.mutate('replace',{id:'old',text:{title:'blue'}});if(start)cursor.next();cursor.return();assert.equal(owner.root,prior);drain(owner.mutate('add',{id:'recover',text:{}}));
}
for(const method of ['add','addMany','replace','remove','clear']){
 const owner=new MutationOwner(initial(fixture)),prior=owner.root;const signal=new AbortController();signal.abort();
 const input={add:{id:'new',text:{}},addMany:[],replace:{id:'old',text:{}},remove:[],clear:undefined}[method];
 assert.throws(()=>drain(owner.mutate(method,input,{signal:signal.signal})),e=>e.code==='CANCELLED');assert.equal(owner.root,prior);
}
for(const phase of ['participant','prepared','precommit']){
 let participantVisits=0,cleanup=0;const side=Object.freeze({id:'old',source:'common red'}),base=initial(fixture);
 const root=Object.freeze({...base,participants:Object.freeze({source:side})});const marker=Error(phase);
 const participant={id:'source',*prepare(previous,context){participantVisits++;assert.equal(previous,side);assert.equal(context.previous,root);assert.equal(context.core.revision,1);try {yield {workUnits:3};yield {workUnits:2};return Object.freeze({id:'old',source:context.records[0].text.title[0]});}finally{cleanup++;}}};
 const owner=new MutationOwner(root,[participant]);assert.throws(()=>drain(owner.execute(owner.capture('replace',{id:'old',text:{title:'blue'}}),{checkpoint(at){if(at===phase)throw marker;}})),e=>e===marker);assert.equal(owner.root,root);assert.equal(root.participants.source,side);assert.equal(cleanup,participantVisits);
}
for(const empty of [false,true]){
 const base=initial(empty?[]:fixture),root=Object.freeze({...base,revision:Number.MAX_SAFE_INTEGER}),owner=new MutationOwner(root);
 const no=drain(owner.mutate('remove','absent'));assert.equal(no.revision,Number.MAX_SAFE_INTEGER);assert.equal(no.changed,false);
 if(empty){assert.equal(drain(owner.mutate('clear')).changed,false);assert.throws(()=>drain(owner.mutate('add',{id:'new',text:{}})),e=>e.code==='REVISION_EXHAUSTED');}
 else for(const [method,input] of [['replace',{id:'old',text:{}}],['remove','old'],['clear',undefined]])assert.throws(()=>drain(owner.mutate(method,input)),e=>e.code==='REVISION_EXHAUSTED');
 assert.equal(owner.root,root);
}
console.log(JSON.stringify({status:'Pass',node:process.version,operations,queryComparisons:comparisons,failurePhases:7,participantFailurePhases:3,abandonmentStates:2,abortedMethods:5,revisionExhaustionStates:2}));
