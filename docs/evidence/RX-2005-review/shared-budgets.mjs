import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { initializeParticipants } from '../../../dist/core/capabilities/participants.js';
import { emptyRoot } from '../../../dist/core/execution/engine.js';
import { MutationOwner } from '../../../dist/core/mutations/owner.js';
import { executeSearch } from '../../../dist/core/query/search.js';
import { createSourceProvider,createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createSnippetEvidence } from '../../../dist/addons/snippets/index.js';
const drain=cursor=>{let units=0;for(;;){const s=cursor.next();if(s.done)return {value:s.value,units};units+=s.value.workUnits;}};
const query={kind:'extension',capability:'phrases',version:1,payload:{text:'red red',fields:['title']}};
const request={limit:0,extensions:{snippets:{ids:['a']}}},schema={text:{title:{}}};
function combination(cap,counts){
  const phrase=createSourcePhrases({fields:['title']}),evidence=createSnippetEvidence({fields:{title:'source'}});
  function* meter(cursor,kind){try{for(;;){const step=cursor.next();if(step.done)return step.value;counts[kind]+=step.value.workUnits;yield step.value;}}finally{cursor.return();}}
  return {manifest:{...evidence.manifest,id:'shared-budget',roles:['leaf-refinement','evidence'],provides:[...phrase.manifest.provides,...evidence.manifest.provides],limits:{...evidence.manifest.limits,maxWorkUnits:cap}},
    refinement:{kind:'exact-token-sequence',maxTokens:phrase.refinement.maxTokens,*prepare(context){const prepared=yield* meter(phrase.refinement.prepare(context),'refinement');return {*test(...args){return yield* meter(prepared.test(...args),'refinement');}};}},
    evidence:{...evidence.evidence,*prepare(context){const prepared=yield* meter(evidence.evidence.prepare(context),'evidence');return {*finish(context){return yield* meter(prepared.finish(context),'evidence');}};}}};
}
function setup(cap=10000000,limits={}){const counts={refinement:0,evidence:0},configuration=captureConfiguration({schema,limits,addons:[createSourceProvider({fields:['title']}),combination(cap,counts)]}),installed=initializeParticipants(configuration),owner=new MutationOwner(emptyRoot(configuration,installed.states),installed.participants);drain(owner.execute(owner.capture('add',{id:'a',text:{title:'red red red blue'}})));return {owner,counts};}
const high=setup(),combined=drain(executeSearch(high.owner.root,query,request)),ordinary=drain(executeSearch(high.owner.root,query));
const evidenceOnly={...high.counts};
// Measurement above includes the second ordinary query; remove its independently
// measured refinement amount to recover one combined request's exact role work.
const refineState=setup();drain(executeSearch(refineState.owner.root,query));
const refinementUnits=refineState.counts.refinement,evidenceUnits=evidenceOnly.evidence;
assert.equal(evidenceOnly.refinement,2*refinementUnits);
const cap=Math.max(refinementUnits,evidenceUnits)+1;
const capped=setup(cap);assert.equal(drain(executeSearch(capped.owner.root,query)).value.total,1);
assert.equal(drain(executeSearch(capped.owner.root,{kind:'group',fields:['title'],variants:[{text:'red',match:'exact'}]},request)).value.total,1);
assert.throws(()=>drain(executeSearch(capped.owner.root,query,request)),{code:'WORK_LIMIT_EXCEEDED'});
assert.equal(drain(executeSearch(capped.owner.root,query)).value.total,1);
const operationCap=combined.units-1,global=setup(10000000,{maxSearchWorkUnits:operationCap,checkpointWorkUnits:32});
assert.equal(drain(executeSearch(global.owner.root,query)).value.total,1);
assert.throws(()=>drain(executeSearch(global.owner.root,query,request)),{code:'WORK_LIMIT_EXCEEDED'});
assert.equal(drain(executeSearch(global.owner.root,query)).value.total,1);
const report={status:'Pass',node:process.version,refinementUnits,evidenceUnits,combinedRegistrationUnits:refinementUnits+evidenceUnits,registrationCap:cap,eachRoleAlonePasses:true,combinedRolesFail:'WORK_LIMIT_EXCEEDED',combinedOperationWorkUnits:combined.units,ordinaryOperationWorkUnits:ordinary.units,globalOperationCap:operationCap,sharedGlobalFailure:'WORK_LIMIT_EXCEEDED',recovery:'Pass',claim:'Real first-party phrase and snippet cursors composed in one trusted protocol registration; counters sum actual yielded work; no copied expected implementation logic.'};
writeFileSync(new URL('./shared-budgets.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
