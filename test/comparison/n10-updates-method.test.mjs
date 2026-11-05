import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UPDATE_CONTRACT_SHA256, updateHash, planUpdates, casesFor, notApplicableCasesFor, repetitionsFor, warmupsFor, scenarioFor, workloadForUpdate } from '../../bench/n10/updates-contract.mjs';
import { validateUpdateRows, configurationHash, resolveUpdateBudget, APPROVED_UPDATE_BUDGET_REVISION } from '../../bench/n10/updates-run.mjs';
import { createUpdateVerifier } from '../../bench/n10/updates-verify.mjs';
import { createRaveldex } from '../../dist/index.js';
import { createSourceProvider } from '../../dist/addons/phrases/index.js';
import { createPositionProvider } from '../../dist/addons/positions/index.js';
import { executeSearch } from '../../dist/core/query/search.js';
import { getExecutionOwner } from '../../dist/core/execution/engine.js';
import { schema } from '../../bench/n10/updates-contract.mjs';
const manifest=JSON.parse(readFileSync(new URL('../../docs/evidence/RX-9001/identity/artifacts.json',import.meta.url)));
const SHA='a'.repeat(64),manifestSha256='b'.repeat(64),harnessSha256='c'.repeat(64);
const traceCache=new WeakMap();
function traceFor(s){let t=traceCache.get(s);if(!t){t={caseKey:s.caseKey,batch:s.batch,beforeRecordsSha256:updateHash(s.beforeRecords),afterRecordsSha256:updateHash(s.afterRecords),calls:s.calls,preparationCalls:s.preparationCalls,vocabularyRule:s.vocabularyRule};traceCache.set(s,t);}return t;}
// Synthetic structural inputs isolate the aggregator's rejection policy. They
// are never engine observations, persisted measurements or semantic acceptance.
function structuralFixture(){return planUpdates('full').map((job,index)=>{
 const a=manifest.artifacts.find(a=>a.role===job.role),row={kind:'rx9005-update-child-v1',...job,pid:10000+index,outcome:'Collected',artifactSha256:a.sha256,artifactSource:a.source,packageInventorySha256:updateHash([...a.members].sort((a,b)=>a.path.localeCompare(b.path))),contractSha256:UPDATE_CONTRACT_SHA256,artifactManifestSha256:manifestSha256,harnessSha256,configurationSha256:configurationHash(job.configuration),identity:workloadForUpdate(job.size).identity,runtime:{node:process.version,execArgv:[]},packageMetadataSha256:a.members.find(x=>x.path==='package.json').sha256,notApplicable:notApplicableCasesFor(job.size),samples:[],observations:[],warmups:[],states:{[SHA]:{synthetic:true}},traces:{},preparation:[{purpose:'initialize-native-factory-and-providers',outcome:'Pass'}],checkpoints:[{scope:'synthetic structural fixture only'}]};
 for(const d of casesFor(job.size))for(const warm of [false,true])for(let repetition=0;repetition<(warm?warmupsFor(job,d):repetitionsFor(job,d));repetition++){
  const s=scenarioFor(d,job.size,{repetition}),trace=traceFor(s),traceSha256=updateHash(trace),beforeRevision=50;row.traces[traceSha256]=trace;
  const receipts=s.calls.map((c,i)=>({revision:beforeRevision+i+1,changed:true,added:['add','addMany'].includes(c.method)?c.method==='addMany'?c.input.length:1:0,replaced:c.method==='replace'?1:0,removed:c.method==='remove'?1:0}));
  const item={traceSha256,caseKey:d.caseKey,id:d.id,kind:d.kind,batch:d.batch,publicCall:d.publicCall,repetition,phase:warm?'untimed-warmup':job.mode==='diagnostic'?'diagnostic-first-call':job.size===1000&&d.id==='replace-existing-vocabulary'?'after-two-warmups':repetition?'repeat-same-owner':'first-call-for-case',outcome:'Pass',requestedCalls:s.calls.length,completedCalls:s.calls.length,attemptedCalls:s.calls.length,beforePopulation:s.beforeRecords.length,afterPopulation:s.afterRecords.length,beforeRevision,afterRevision:beforeRevision+s.calls.length,beforeState:SHA,afterState:SHA,receipts,prefixStates:receipts.map(x=>({revision:x.revision,state:SHA})),atomicCallsVerified:s.calls.length,callWindows:s.calls.map((c,i)=>({callIndex:i,method:c.method,returned:true,outcome:'Pass',invocationToReturnMs:.25,returnToSettlementMs:.75,invocationToSettlementMs:1}))};
  if(!warm)Object.assign(item,{wallMs:s.calls.length,cpuUserMs:.5,cpuSystemMs:.25,...job.mode==='diagnostic'?{counters:{emittedSteps:1,emittedWorkUnits:1,hostYields:0}}:{}});
  (warm?row.warmups:job.mode==='normal'?row.samples:row.observations).push(item);
 }
 return row;
});}
let base;
function fixture(){return base??=structuralFixture();}
function validate(rows){return validateUpdateRows(rows,{profile:'full',manifest,manifestSha256,harnessSha256});}
function corrupt(action,index=0){const rows=[...fixture()];rows[index]=structuredClone(rows[index]);action(rows[index],rows);assert.throws(()=>validate(rows));}

test('literal full update cohort has 144 fresh slots, exact native call granularity and explicit inapplicable coverage',()=>{
 const jobs=planUpdates('full');assert.equal(jobs.length,144);assert.equal(jobs.filter(j=>j.mode==='normal').length,108);assert.equal(jobs.filter(j=>j.mode==='diagnostic').length,36);
 assert.equal(new Set(jobs.map(j=>[j.size,j.configuration,j.deadline,j.role,j.owner,j.mode].join(':'))).size,144);
 assert.equal(casesFor(100).length,16);assert.equal(casesFor(1000).length,21);assert.equal(casesFor(10000).length,21);assert.equal(notApplicableCasesFor(100).length,5);assert.ok(notApplicableCasesFor(100).every(x=>x.attempts===0&&x.batch===256));
 const tail=jobs.filter(j=>j.size===1000&&j.mode==='normal');assert.equal(tail.length,36);
 const r=validate(fixture());assert.deepEqual(r,{children:144,normalWindows:5544,diagnosticWindows:696,warmups:72,publicCalls:107544,normalPublicCalls:92376,diagnosticPublicCalls:15168,notApplicableCaseRows:240});
});
test('A/B trace changes exact original source/order while retaining literal vocabulary and population',()=>{
 const a=scenarioFor('replace-existing-vocabulary',100,{repetition:0}),b=scenarioFor('replace-existing-vocabulary',100,{repetition:1});
 assert.equal(a.beforeRecords.at(-1).text.body,'n9common n9red n9blue');assert.equal(a.calls[0].input.text.body,'n9blue n9common n9red');assert.deepEqual(b.beforeRecords,a.afterRecords);assert.deepEqual(b.afterRecords,a.beforeRecords);
 assert.equal(a.beforeRecords.length,100);assert.equal(a.afterRecords.length,100);assert.notEqual(updateHash(a.beforeRecords),updateHash(a.afterRecords));
});
test('literal batch32/256 traces distinguish one addMany from ordered individual replacements and removals',()=>{
 for(const batch of [32,256]){
  const d=casesFor(1000).find(c=>c.id==='replace-existing-records'&&c.batch===batch),s=scenarioFor(d,1000);assert.equal(s.calls.length,batch);assert.ok(s.calls.every(x=>x.method==='replace'&&x.input.text.body==='n9blue n9common n9red'));assert.equal(s.beforeRecords.length,1000);
  const add=scenarioFor(casesFor(1000).find(c=>c.id==='addMany-new-vocabulary'&&c.batch===batch),1000);assert.equal(add.calls.length,1);assert.equal(add.calls[0].method,'addMany');assert.equal(add.beforeRecords.length,1000-batch);assert.equal(add.calls[0].input[0].text.body,'n9common n10batchnovel n10batch000000');assert.equal(add.calls[0].input.at(-1).text.body,`n9common n10batchnovel n10batch${String(batch-1).padStart(6,'0')}`);
 }
});
test('reinsertion traces require actual untimed additions/removals and preserve the exact authored source',()=>{
 const single=scenarioFor('reinsert',100);assert.deepEqual(single.preparationCalls.map(x=>x.method),['add','remove']);assert.equal(single.beforeRecords.length,99);assert.equal(single.afterRecords.length,100);
 const batch=scenarioFor(casesFor(1000).find(c=>c.id==='reinsert-removed-records'&&c.batch===32),1000);assert.equal(batch.preparationCalls.length,33);assert.equal(batch.preparationCalls[0].method,'addMany');assert.ok(batch.preparationCalls.slice(1).every(x=>x.method==='remove'));assert.equal(batch.calls.length,1);
 const removed=scenarioFor('remove-unique-vocabulary',100);assert.equal(removed.beforeRecords.at(-1).text.body,'n10novel n10replacement n9common');assert.equal(removed.afterRecords.length,99);
});
test('incomplete or duplicate child matrix is rejected',()=>{assert.throws(()=>validate(fixture().slice(1)));const rows=[...fixture()];rows[1]=rows[0];assert.throws(()=>validate(rows));});
test('forged A-to-A source input cannot hide behind equal core frequencies',()=>corrupt(row=>{const item=row.samples.find(x=>x.id==='replace-existing-vocabulary'),trace=structuredClone(row.traces[item.traceSha256]);trace.calls[0].input.text.body='n9common n9red n9blue';const key=updateHash(trace);row.traces[key]=trace;item.traceSha256=key;}));
test('forged trace labels and source state fingerprints are rejected',()=>corrupt(row=>{const item=row.samples[0],trace=structuredClone(row.traces[item.traceSha256]);trace.beforeRecordsSha256=SHA;const key=updateHash(trace);row.traces[key]=trace;item.traceSha256=key;}));
test('missing or duplicated selected windows are rejected',()=>corrupt(row=>row.samples.pop()));
test('normal diagnostic leakage is rejected',()=>corrupt(row=>row.samples[0].counters={emittedSteps:1}));
test('batch sequence cannot be relabeled as one atomic call',()=>corrupt(row=>{const s=row.samples.find(x=>x.id==='replace-existing-records'&&x.batch===32);s.requestedCalls=1;}));
test('every atomic sequence revision and state reference is bound',()=>corrupt(row=>{row.samples.find(x=>x.id==='replace-existing-records'&&x.batch===32).receipts[1].revision++;}));
test('observable call boundary method/index/outcome and time decomposition cannot be forged',()=>corrupt(row=>{row.samples[0].callWindows[0].invocationToSettlementMs=4;}));
test('wrong call method is rejected despite valid whole-window receipt',()=>corrupt(row=>{row.samples[0].callWindows[0].method='remove';}));
test('inapplicable B256 at100 cannot carry attempts',()=>corrupt(row=>{row.notApplicable[0].attempts=1;}));
test('tail40 and ordered excluded warmups are exact',()=>{
 const index=fixture().findIndex(r=>r.size===1000&&r.mode==='normal');corrupt(row=>{row.samples.splice(row.samples.findIndex(x=>x.id==='replace-existing-vocabulary'),1);},index);corrupt(row=>{row.warmups.reverse();},index);
});
test('stale/missing before-state evidence is rejected',()=>corrupt(row=>{row.samples[0].beforeState='d'.repeat(64);}));
test('wrong archive/deadline identity is rejected',()=>{corrupt(row=>{row.artifactSha256=SHA;});corrupt(row=>{row.deadlineOptions={deadlineMs:60000};});});

function patch(value,path,transform){if(!path.length)return transform(value);const [key,...rest]=path;const next=Array.isArray(value)?[...value]:Object.assign(Object.create(Object.getPrototypeOf(value)),value);next[key]=patch(value[key],rest,transform);return Object.freeze(next);}
async function actualFixture(t){const records=workloadForUpdate(100).records,engine=createRaveldex({schema,addons:[createSourceProvider({fields:['body']}),createPositionProvider({fields:['body'],offsets:['body']})]});t.after(()=>engine.dispose());await engine.addMany(records);const root=getExecutionOwner(engine).root;return {engine,root,records};}
function verifier(){return createUpdateVerifier({executeSearch,configuration:'source-positions',size:100,pageSize:100});}
function docPath(root){const bucket=Object.keys(root.documents.buckets).find(k=>Object.keys(root.documents.buckets[k]).length);return ['documents','buckets',bucket,Object.keys(root.documents.buckets[bucket])[0]];}
test('actual independent state verifier rejects duplicate hash-directory IDs before map collapse',async t=>{
 const {root,records}=await actualFixture(t),path=docPath(root),id=path.at(-1),slot=path.at(-2),other=Object.keys(root.documents.buckets).find(k=>k!==slot);const bad=patch(root,['documents','buckets',other],bucket=>Object.freeze({...bucket,[id]:root.documents.buckets[slot][id]}));assert.throws(()=>verifier().inspect(bad,records,root.revision));
});
test('actual independent source verifier rejects reverse-frequency and source corruption',async t=>{
 const {root,records}=await actualFixture(t),v=verifier();v.inspect(root,records,root.revision);const path=docPath(root);const frequency=patch(root,[...path,'fields','body','length'],x=>x+1);assert.throws(()=>v.inspect(frequency,records,root.revision));
 const source=root.participants.source.records,slot=Object.keys(source.buckets).find(k=>Object.keys(source.buckets[k]).length),id=Object.keys(source.buckets[slot])[0];const forged=patch(root,['participants','source','records','buckets',slot,id,'text','body',0],x=>x+' forged');assert.throws(()=>verifier().inspect(forged,records,root.revision));
});
test('actual positions oracle rejects original UTF16 offset corruption',async t=>{
 const {root,records}=await actualFixture(t),d=root.participants.positions.records,slot=Object.keys(d.buckets).find(k=>Object.keys(d.buckets[k]).length),id=Object.keys(d.buckets[slot])[0],term=Object.keys(d.buckets[slot][id].positions.body[0].terms)[0];const forged=patch(root,['participants','positions','records','buckets',slot,id,'positions','body',0,'terms',term,0,'start'],x=>x+1);assert.throws(()=>verifier().inspect(forged,records,root.revision));
});
test('deep immutable-cache assumptions reject a mutable nested term map',async t=>{
 const {root,records}=await actualFixture(t),path=docPath(root);const bad=patch(root,[...path,'fields','body','terms'],value=>({...value}));assert.throws(()=>verifier().inspect(bad,records,root.revision));
});
test('equal-frequency A/B replacement freshly checks positions and explicitly binds reused full pages',async t=>{
 const s=scenarioFor('replace-existing-vocabulary',100),engine=createRaveldex({schema,addons:[createSourceProvider({fields:['body']}),createPositionProvider({fields:['body'],offsets:['body']})]});t.after(()=>engine.dispose());await engine.addMany(s.beforeRecords);const v=verifier(),a=v.inspect(getExecutionOwner(engine).root,s.beforeRecords,1);const receipt=await engine.replace(s.calls[0].input);assert.equal(receipt.changed,true);const b=v.inspect(getExecutionOwner(engine).root,s.afterRecords,receipt.revision);assert.equal(a.coreSemanticSha256,b.coreSemanticSha256);assert.notEqual(a.expectedSourceSha256,b.expectedSourceSha256);assert.equal(b.actualRevision,2);assert.ok(b.queryProvenance.full.every(x=>x.kind==='reused-verified-core-query'&&x.originalRevision===1));assert.equal(b.capture.previous,a.normalizedSha256);assert.ok(b.capture.delta.records[s.calls[0].input.id]);
});
test('targeted OR sums both novel groups using literal hand-derived BM25',async t=>{
 const records=[{id:'a',text:{body:'n10novel n10replacement n9common'},metadata:{group:'g1'}},{id:'b',text:{body:'n9rare n9common n9common'},metadata:{group:'g0'}}];
 const engine=createRaveldex({schema,addons:[createSourceProvider({fields:['body']}),createPositionProvider({fields:['body'],offsets:['body']})]});t.after(()=>engine.dispose());await engine.addMany(records);const result=verifier().inspect(getExecutionOwner(engine).root,records,1);const query=result.queryCaptures.targeted[0];assert.equal(query.query.kind,'or');assert.equal(query.fullyEnumerated,true);assert.deepEqual(query.hits.map(h=>h.id),['a','b']);assert.ok(Math.abs(query.hits[0].score-2*Math.log(2))<1e-12);assert.ok(Math.abs(query.hits[1].score-Math.log(2))<1e-12);
});
test('selected broad-page policy labels actual offsets and rejects forged middle/last pages',async t=>{
 // Deliberately small unit fixture exercising the 10k-policy branch, never a
 // resized performance cell or an observation about actual 10k capacity.
 const records=Array.from({length:500},(_,i)=>({id:`unit:${String(i).padStart(4,'0')}`,text:{body:i?'n9common':'n9common n9rare'},metadata:{group:'g0'}}));
 const engine=createRaveldex({schema,addons:[createSourceProvider({fields:['body']}),createPositionProvider({fields:['body'],offsets:['body']})]});t.after(()=>engine.dispose());await engine.addMany(records.slice(0,256));await engine.addMany(records.slice(256));const root=getExecutionOwner(engine).root;
 const v=createUpdateVerifier({executeSearch,configuration:'source-positions',size:10000,pageSize:100}),result=v.inspect(root,records,2);
 for(const query of result.queryCaptures.full){assert.equal(query.coverage.mode,'selected-first-lower-middle-last-pages');assert.equal(query.coverage.fullyEnumerated,false);assert.equal(query.fullyEnumerated,false);assert.equal(query.complete,false);assert.equal(query.verificationComplete,true);assert.deepEqual(query.pageRequests,[{offset:0,limit:100},{offset:200,limit:100},{offset:400,limit:100}]);assert.equal(query.total,500);assert.equal(query.hits.length,300);assert.ok(query.pages.every(p=>p.completeness==='complete'&&p.total===500));}
 const wrongPage=function*(r,q,o){return yield*executeSearch(r,q,{...o,offset:0});};assert.throws(()=>createUpdateVerifier({executeSearch:wrongPage,configuration:'source-positions',size:10000,pageSize:100}).inspect(root,records,2));
});
test('a refused sequence retains its completed atomic prefix and cannot assert rollback',()=>{
 const rows=[...fixture()];rows[0]=structuredClone(rows[0]);const item=rows[0].samples.find(x=>x.id==='replace-existing-records'&&x.batch===32);item.receipts=item.receipts.slice(0,2);item.prefixStates=item.prefixStates.slice(0,2);item.completedCalls=2;item.attemptedCalls=3;item.afterRevision=item.beforeRevision+2;item.atomicCallsVerified=2;item.outcome='Refused';item.error={name:'RaveldexError',code:'WORK_LIMIT_EXCEEDED',details:{path:'work'},message:'synthetic structural refusal fixture'};item.failedCallPreservedAuthoritativePrefix=true;item.callWindows=item.callWindows.slice(0,3);item.callWindows[2].outcome='Refused';assert.equal(validate(rows).normalPublicCalls,92347);item.failedCallPreservedAuthoritativePrefix=false;assert.throws(()=>validate(rows));
});
test('same-count live-vocabulary swap cannot reuse a stale ordered-tree cache entry',async t=>{
 const {engine,root,records}=await actualFixture(t),v=verifier();v.inspect(root,records,root.revision);const old=records.at(-1);assert.equal(typeof old.text.body,'string');const replacement={...old,text:{body:old.text.body.replace('n9key000099a','n10swapone').replace('n9key000099b','n10swaptwo').replace('n9key000099c','n10swapthree')}};assert.notEqual(replacement.text.body,old.text.body);await engine.replace(replacement);const fresh=getExecutionOwner(engine).root;assert.equal(fresh.counts.dictionaryEntries,root.counts.dictionaryEntries);const stale=patch(fresh,['fields','body','order'],()=>root.fields.body.order);const expected=[...records.slice(0,-1),replacement];assert.throws(()=>v.inspect(stale,expected,fresh.revision));
});
test('immutable directory entry cache rejects header getters without invoking them',async t=>{
 const {root,records}=await actualFixture(t);let reads=0;const header=Object.create(Object.getPrototypeOf(root.documents));Object.defineProperties(header,{size:{enumerable:true,get(){reads++;return root.documents.size;}},buckets:{enumerable:true,value:root.documents.buckets}});Object.freeze(header);const forged=patch(root,['documents'],()=>header);assert.throws(()=>verifier().inspect(forged,records,root.revision));assert.equal(reads,0);
});
test('immutable bucket entry cache rejects value getters and wrong-slot reuse',async t=>{
 const {root,records}=await actualFixture(t),path=docPath(root),slot=path.at(-2),id=path.at(-1),original=root.documents.buckets[slot];let reads=0;const bucket=Object.assign(Object.create(Object.getPrototypeOf(original)),original);Object.defineProperty(bucket,id,{enumerable:true,configurable:true,get(){reads++;return original[id];}});Object.freeze(bucket);const forged=patch(root,['documents','buckets',slot],()=>bucket);assert.throws(()=>verifier().inspect(forged,records,root.revision));assert.equal(reads,0);
 const v=verifier();v.inspect(root,records,root.revision);const wrong=Object.keys(root.documents.buckets).find(x=>x!==slot);assert.throws(()=>v.inspect(patch(root,['documents','buckets',wrong],()=>original),records,root.revision));
});

// Operational budget revision is explicit, owner-authorized and never changes native limits.
test('approved collection revision preserves original default and rejects arbitrary/probe overrides',()=>{
 assert.deepEqual(resolveUpdateBudget('full'),{budgetMs:5400000,budgetRevision:null});
 assert.deepEqual(resolveUpdateBudget('full',{probeJob:{}}),{budgetMs:600000,budgetRevision:null});
 assert.deepEqual(resolveUpdateBudget('full',{budgetRevision:'owner-approved-150m-20261105'}),{budgetMs:9000000,budgetRevision:APPROVED_UPDATE_BUDGET_REVISION});
 assert.throws(()=>resolveUpdateBudget('full',{budgetRevision:'other'}));
 assert.throws(()=>resolveUpdateBudget('pilot',{budgetRevision:'owner-approved-150m-20261105'}));
 assert.throws(()=>resolveUpdateBudget('full',{probeJob:{},budgetRevision:'owner-approved-150m-20261105'}));
});
