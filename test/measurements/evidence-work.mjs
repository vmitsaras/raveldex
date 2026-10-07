import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { captureConfiguration } from '../../dist/core/contracts/schema.js';
import { emptyRoot } from '../../dist/core/execution/engine.js';
import { initializeParticipants } from '../../dist/core/capabilities/participants.js';
import { MutationOwner } from '../../dist/core/mutations/owner.js';
import { executeSearch } from '../../dist/core/query/search.js';
import { inspectIndex } from '../../dist/core/index/invariants.js';
import { createSourceProvider } from '../../dist/addons/phrases/source.js';
import { createPositionProvider } from '../../dist/addons/positions/index.js';
import { createMatchEvidence } from '../../dist/addons/evidence/index.js';
import { createSnippetEvidence } from '../../dist/addons/snippets/index.js';
const drain=cursor=>{let units=0,steps=0;for(;;){const s=cursor.next();if(s.done)return {value:s.value,units,steps};units+=s.value.workUnits;steps++;}};
const rows=[];
for(const size of [100,1000,10000])for(const mode of ['core','source-base','source-installed','offsets-base','offsets-installed','both-base','both-installed']){
 const addons=[];
 if(mode.startsWith('source')||mode.startsWith('both'))addons.push(createSourceProvider({fields:['title']}));
 if(mode.startsWith('offsets')||mode.startsWith('both'))addons.push(createPositionProvider({fields:['title'],offsets:['title']}));
 if(mode.endsWith('installed')){
  addons.push(createMatchEvidence({fields:{title:mode.startsWith('source')?'source':'offsets'}}));
  if(!mode.startsWith('offsets'))addons.push(createSnippetEvidence({fields:{title:mode.startsWith('source')?'source':'offsets'}}));
 }
 const config=captureConfiguration({schema:{text:{title:{}}},...(addons.length?{addons}:{})}),installed=initializeParticipants(config),owner=new MutationOwner(emptyRoot(config,installed.states),installed.participants);
 let buildUnits=0;for(let start=0;start<size;start+=256)buildUnits+=drain(owner.execute(owner.capture('addMany',Array.from({length:Math.min(256,size-start)},(_,i)=>({id:`d${String(start+i).padStart(5,'0')}`,text:{title:'red blue'}}))))).units;
 drain(inspectIndex(owner.root));
 const roots=Object.entries(owner.root.participants).map(([id,r])=>({id,kind:r.kind,retainedEntries:r.retainedEntries,...(r.kind==='raveldex-source-v1'?{textCodeUnits:r.textCodeUnits}:{occurrenceCount:r.occurrenceCount,offsetCount:r.offsetCount,termCodeUnits:r.termCodeUnits})}));
 const requests=['ordinary',...(mode.endsWith('installed')?['match-evidence',...(!mode.startsWith('offsets')?['snippets']:[])]:[])];
 for(const capability of requests){
  const ids=['d00000',`d${String(Math.floor(size/2)).padStart(5,'0')}`,`d${String(size-1).padStart(5,'0')}`],options={limit:0,...(capability==='ordinary'?{}:{extensions:{[capability]:{ids,expectedRevision:owner.root.revision}}})};
  const observed=drain(executeSearch(owner.root,'red',options));assert.equal(observed.value.total,size);assert.deepEqual(observed.value.hits,[]);
  let ranges=0,snippets=0;if(capability!=='ordinary')for(const doc of observed.value.extensions[capability].documents){assert.equal(doc.eligibility,'matched');assert.deepEqual(JSON.parse(JSON.stringify(doc.ranges)),[{field:'title',valueIndex:0,position:0,start:0,end:3,term:'red'}]);ranges+=doc.ranges.length;snippets+=doc.snippets?.length??0;}
  rows.push({documents:size,mode,request:capability,revision:owner.root.revision,buildWorkUnits:buildUnits,searchWorkUnits:observed.units,steps:observed.steps,selectedIds:capability==='ordinary'?0:3,ranges,snippets,counts:owner.root.counts,retainedOptionalRoots:roots});
 }
}
for(const size of [100,1000,10000])for(const representation of ['source','offsets','both']){
 const base=rows.find(r=>r.documents===size&&r.mode===representation+'-base'),off=rows.find(r=>r.documents===size&&r.mode===representation+'-installed'&&r.request==='ordinary');
 assert.equal(base.searchWorkUnits,off.searchWorkUnits);assert.equal(base.buildWorkUnits,off.buildWorkUnits);assert.deepEqual(base.retainedOptionalRoots,off.retainedOptionalRoots);
}
const report={environment:{node:process.version,platform:process.platform,arch:process.arch},method:{unit:'work-v1',records:'Identical original red blue; zero metadata; padded IDs; batches <=256.',query:'red',hitLimit:0,selectedIds:3,expectedRanges:'Exactly original title/value0/position0/[0,3) red per selected ID, hand stated.',claim:'Logical work, source-code-unit and occurrence/entry counters only; no heap/peak bytes, physical latency or capacity qualification.'},rows};
await writeFile(process.argv[2]??fileURLToPath(new URL('../../docs/evidence/RX-2005-work.json',import.meta.url)),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(rows.map(({documents,mode,request,searchWorkUnits,ranges,snippets})=>({documents,mode,request,searchWorkUnits,ranges,snippets}))));
