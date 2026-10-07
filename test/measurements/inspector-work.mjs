import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { captureConfiguration } from '../../dist/core/contracts/schema.js';
import { emptyRoot } from '../../dist/core/execution/engine.js';
import { initializeParticipants } from '../../dist/core/capabilities/participants.js';
import { MutationOwner } from '../../dist/core/mutations/owner.js';
import { executeSearch } from '../../dist/core/query/search.js';
import { inspectIndex } from '../../dist/core/index/invariants.js';
import { createInspector } from '../../dist/addons/inspector/index.js';

const drain=cursor=>{let units=0,steps=0;for(;;){const step=cursor.next();if(step.done)return {value:step.value,units,steps};units+=step.value.workUnits;steps++;}};
const rows=[];
for(const size of [100,1000,10000])for(const mode of ['core','installed-off','requested']){
 const configuration=captureConfiguration({schema:{text:{title:{}}},...(mode==='core'?{}:{addons:[createInspector()]})});
 const installed=initializeParticipants(configuration),owner=new MutationOwner(emptyRoot(configuration,installed.states),installed.participants);
 let buildUnits=0;
 for(let start=0;start<size;start+=256){const records=Array.from({length:Math.min(256,size-start)},(_,i)=>({id:`d${String(start+i).padStart(5,'0')}`,text:{title:'red blue'}}));buildUnits+=drain(owner.execute(owner.capture('addMany',records))).units;}
 drain(inspectIndex(owner.root));assert.deepEqual(Object.keys(owner.root.participants),[]);
 const options={limit:0,...(mode==='requested'?{extensions:{inspector:{ids:['d00000',`d${String(Math.floor(size/2)).padStart(5,'0')}`,`d${String(size-1).padStart(5,'0')}`],expectedRevision:owner.root.revision}}}:{})};
 const measured=drain(executeSearch(owner.root,'red',options));assert.equal(measured.value.total,size);assert.deepEqual(measured.value.hits,[]);
 let facts=0,textScopeUnits=null;
 if(mode==='requested'){
  const data=measured.value.extensions.inspector;facts=data.trace.facts.length;textScopeUnits=data.resources.searchWorkUnits;
  for(const doc of data.documents){assert.equal(doc.eligibility,'matched');assert.equal(doc.page.placement,'outside-page');assert.ok(Math.abs(doc.score-Math.log(1+0.5/(size+0.5)))<=1e-12);}
  for(const fact of data.trace.facts.filter(f=>f.kind==='field')){assert.equal(fact.N,size);assert.equal(fact.df,size);assert.equal(fact.tf,1);assert.equal(fact.totalLength,size*2);assert.equal(fact.length,2);}
  assert.equal(data.resources.scope,'before-evidence-projection');assert.ok(textScopeUnits<measured.units);
 }
 rows.push({documents:size,mode,revision:owner.root.revision,buildWorkUnits:buildUnits,searchWorkUnits:measured.units,steps:measured.steps,selectedFacts:facts,workThroughEvidencePreparation:textScopeUnits,counts:owner.root.counts,retainedOptionalRootIds:Object.keys(owner.root.participants)});
}
for(const size of [100,1000,10000])assert.equal(rows.find(r=>r.documents===size&&r.mode==='core').searchWorkUnits,rows.find(r=>r.documents===size&&r.mode==='installed-off').searchWorkUnits);
const report={environment:{node:process.version,platform:process.platform,arch:process.arch},method:{unit:'work-v1',records:'Identical red blue, zero metadata, padded UTF-16 IDs.',query:'red',hitLimit:0,selectedIds:3,coreResultExpectation:'All records match; independently stated tf=1,df=N,length=2,L=2N and score=ln(1+0.5/(N+0.5)).',claim:'Logical work and retained participant-root observation only; no heap bytes, peak memory, physical latency, or capacity qualification.'},rows};
await writeFile(process.argv[2]??fileURLToPath(new URL('../../docs/evidence/RX-2004-work.json',import.meta.url)),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(rows));
