// Independent reviewer probe; run after npm run build from repository root.
import assert from 'node:assert/strict';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { MutationOwner } from '../../dist/core/mutations/owner.js';
import { DirectoryBuilder,bucketOf,directoryGet } from '../../dist/core/index/directory.js';
import { DirectoryStage } from '../../dist/core/index/staging.js';
import { inspectIndex } from '../../dist/core/index/invariants.js';
const schema={text:{title:{},body:{}}};
function drain(cursor){let work=0,steps=0;for(;;){const step=cursor.next();if(step.done)return {value:step.value,work,steps};assert.ok(step.value.workUnits>=0);work+=step.value.workUnits;steps++;}}
function initial(records=[],limits){const c=new IndexConstruction({schema,...(limits?{limits}:{})});for(let i=0;i<records.length;i+=256)drain(c.append(records.slice(i,i+256)));return drain(c.finish()).value;}
const collisions=[];for(let i=0;collisions.length<70;i++){const id=`sameBucket${i}`;if(bucketOf(id)==='7')collisions.push(id);}
const other='other';assert.notEqual(bucketOf(other),'7');const db=new DirectoryBuilder();for(const id of collisions)db.set(id,10);db.set(other,20);const directory=drain(db.seal()).value;
const counts={directories:0,directoryPointers:0,buckets:0,bucketEntries:0,writes:0,deletes:0,insertions:0};const stage=new DirectoryStage(directory,workUnits=>({workUnits}),counts);
for(const id of collisions)drain(stage.delete(id));for(const id of collisions.slice(0,50))drain(stage.set(id,30));const updated=drain(stage.finish()).value;
assert.equal(counts.insertions,50);assert.throws(()=>drain(stage.delete('neverPresent')),e=>e.code==='INTERNAL_ERROR');assert.equal(counts.directories,1);assert.equal(counts.buckets,1);assert.equal(counts.bucketEntries,70);assert.equal(counts.directoryPointers,2);assert.equal(updated.size,51);assert.equal(updated.buckets[bucketOf(other)],directory.buckets[bucketOf(other)]);assert.notEqual(updated.buckets['7'],directory.buckets['7']);assert.ok(Object.isFrozen(updated.buckets['7']));for(const id of collisions){assert.equal(directoryGet(directory,id),10);assert.equal(directoryGet(updated,id),collisions.indexOf(id)<50?30:undefined);}
const records=[...collisions.map(id=>({id,text:{title:'common red',body:'blue'}})),{id:other,text:{title:'other',body:'unchanged'}}],owner=new MutationOwner(initial(records)),old=owner.root;
const copy=()=>({directories:0,directoryPointers:0,buckets:0,bucketEntries:0,writes:0,deletes:0,insertions:0});const diagnostics={workUnits:0,analysis:{records:0,values:0,textCodeUnits:0},copies:{documents:copy(),dictionary:copy(),postings:copy(),fieldUpdates:0,termUpdates:0}};
const selected=collisions.slice(0,60);drain(owner.execute(owner.capture('remove',selected),{diagnostics}));drain(inspectIndex(owner.root));assert.equal(diagnostics.analysis.records,0);assert.equal(diagnostics.copies.documents.buckets,1);assert.equal(diagnostics.copies.documents.bucketEntries,70);assert.equal(owner.root.documents.buckets[bucketOf(other)],old.documents.buckets[bucketOf(other)]);assert.equal(owner.root.fields.body.terms.buckets[bucketOf('unchanged')],old.fields.body.terms.buckets[bucketOf('unchanged')]);
const limit=300,empty=initial([],{maxMutationWorkUnits:limit,checkpointWorkUnits:1}),budgetRoot=Object.freeze({...empty,participants:Object.freeze({p:Object.freeze({})})});let prepared=0,cleanups=0;
const p={id:'p',*prepare(){prepared++;try{yield {workUnits:limit};return Object.freeze({done:true});}finally{cleanups++;}}};const budgetOwner=new MutationOwner(budgetRoot,[p]);assert.throws(()=>drain(budgetOwner.mutate('add',{id:'x',text:{}})),e=>e.code==='WORK_LIMIT_EXCEEDED');assert.equal(budgetOwner.root,budgetRoot);assert.equal(prepared,1);assert.equal(cleanups,1);
const original=initial([{id:'a',text:{title:'common red'}}]),replacement={id:'a',text:{title:'new new blue'}};
const length=drain(new MutationOwner(original).mutate('replace',replacement)).steps;
for(let at=0;at<=length;at++) {const own=new MutationOwner(original),ctrl=new AbortController(),cursor=own.mutate('replace',replacement,{signal:ctrl.signal});for(let i=0;i<at;i++)assert.equal(cursor.next().done,false);ctrl.abort();assert.throws(()=>drain(cursor),e=>e.code==='CANCELLED');assert.equal(own.root,original);drain(own.mutate('clear'));}
const ctrl=new AbortController(),finalOwner=new MutationOwner(original),result=drain(finalOwner.mutate('replace',replacement,{signal:ctrl.signal})).value;ctrl.abort();assert.equal(result.changed,true);assert.equal(finalOwner.root.revision,1);
console.log(JSON.stringify({status:'Pass',node:process.version,collisionBucketEntries:70,directoryCopiedBuckets:counts.buckets,directoryCopiedEntries:counts.bucketEntries,atomicBatchDeletes:selected.length,sharedParticipantBudget:limit,cancellationPositions:length+1,postCommitAbort:'success remains'}));
