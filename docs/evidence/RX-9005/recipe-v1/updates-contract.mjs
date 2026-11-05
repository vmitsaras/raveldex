// RX-9005: pure traces from the unchanged RX-9001 update recipe. No engine work.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { workloadFor, verifyFrozen, schema } from '../n9/workloads.mjs';
export { schema };
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const updateHash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const methodBytes=readFileSync(new URL('../../docs/evaluation/RX-9001-method.json',import.meta.url));
const method=JSON.parse(methodBytes);
export const UPDATE_METHOD=freeze(method.updates);
export const UPDATE_CONTRACT=freeze({kind:'rx9005-update-contract-v1',methodSha256:updateHash(methodBytes),roles:['preN9','acceptedN9','current'],deadlines:method.deadlines,updates:UPDATE_METHOD,
 full:{sizes:UPDATE_METHOD.sizes,configurations:UPDATE_METHOD.configurations.map(c=>c.id),deadlines:UPDATE_METHOD.deadlineCohorts,normalOwners:3,diagnosticOwners:1,children:144},
 pilot:{sizes:[100],configurations:UPDATE_METHOD.configurations.map(c=>c.id),deadlines:['default30s'],normalOwners:1,diagnosticOwners:1,children:12,acceptedPerformanceEvidence:false},
 queryPolicy:{freshTargeted:['n10novel','n10replacement','n10batchnovel','n9rare'],fullAtWindows:['all','n9common'],pageSize:100,scope:'Actual read-only query generator drained outside measured public mutation windows. Full pages may reuse an explicitly identified previously verified equal lexical-core/configuration state; fresh targeted queries check the current revision.'},
 statePolicy:'Every observed actual root is independently checked against authored source/core/source-provider/positions. Initial complete checkpoint and all subsequent actual changed/deleted record and posting deltas reconstruct complete states; revision headers remain separate. Immutable caches bind actual object identity to verified expected content, never assume an unobserved intermediate root.'});
export const UPDATE_CONTRACT_SHA256=updateHash(UPDATE_CONTRACT);
export function planUpdates(profile='full'){
 assert.ok(['full','pilot'].includes(profile),'unknown update profile');const p=UPDATE_CONTRACT[profile],jobs=[];
 for(let index=0;index<p.normalOwners+p.diagnosticOwners;index++){
  const mode=index<p.normalOwners?'normal':'diagnostic',owner=mode==='diagnostic'?3:index,reverse=owner%2===1;
  const order=a=>reverse?[...a].reverse():a;
  for(const size of order(p.sizes))for(const configuration of order(p.configurations))for(const deadline of order(p.deadlines))for(const role of order(UPDATE_CONTRACT.roles)){
   const timedOptions=method.deadlines.find(x=>x.id===deadline).timedOptions;
   jobs.push({profile,size,configuration,deadline,deadlineOptions:timedOptions,role,owner,mode});
  }
 }
 assert.equal(jobs.length,p.children);return jobs;
}
export const updateJobKey=job=>[job.size,job.configuration,job.deadline,job.role,job.owner,job.mode].join('-');
export const jobKey=updateJobKey;
const workloads=new Map();
export function workloadForUpdate(size){if(!workloads.has(size))workloads.set(size,verifyFrozen(workloadFor(UPDATE_METHOD.family,size)));return workloads.get(size);}
export function templateRecord(id,kind,j=0){
 assert.equal(typeof id,'string');const trace=UPDATE_METHOD.singleRecordTrace;
 const source=kind==='A'?trace.existingVocabularyA:kind==='B'?trace.existingVocabularyB:kind==='novel'?trace.newVocabularyRecord:null;
 if(source)return freeze({id,text:{...source.text},metadata:{...source.metadata}});
 assert.equal(kind,'batchNovel');assert.ok(Number.isSafeInteger(j)&&j>=0&&j<256);
 return freeze({id,text:{body:`n9common n10batchnovel n10batch${String(j).padStart(6,'0')}`},metadata:{group:'g1'}});
}
export function casesFor(size){
 assert.ok(UPDATE_METHOD.sizes.includes(size));
 return freeze([...UPDATE_METHOD.singleRecordCases.map(c=>({id:c.id,kind:'single',batch:1,publicCall:c.publicCall,caseKey:c.id})),...UPDATE_METHOD.batchSizes.filter(batch=>batch<=size).flatMap(batch=>UPDATE_METHOD.batchCases.map(c=>({id:c.id,kind:'batch',batch,publicCall:c.publicCall,caseKey:`${c.id}:B${batch}`})))]);
}
export function notApplicableCasesFor(size){return freeze(UPDATE_METHOD.batchSizes.filter(batch=>batch>size).flatMap(batch=>UPDATE_METHOD.batchCases.map(c=>({id:c.id,kind:'batch',batch,caseKey:`${c.id}:B${batch}`,outcome:'Not applicable',attempts:0,reason:'batch exceeds declared collection size; no resizing or fabricated timing'}))));}
export function repetitionsFor(job,c){return job.mode==='diagnostic'?1:job.size===UPDATE_METHOD.tail.size&&c.id===UPDATE_METHOD.tail.operation?40:2;}
export function warmupsFor(job,c){return job.mode==='normal'&&job.size===UPDATE_METHOD.tail.size&&c.id===UPDATE_METHOD.tail.operation?2:0;}
const scenarios=new Map();
export function scenarioFor(descriptor,size,{repetition=0,alternate}={}){
 const c=typeof descriptor==='string'?casesFor(size).find(x=>x.caseKey===descriptor||x.id===descriptor):descriptor;assert.ok(c&&casesFor(size).some(x=>x.caseKey===c.caseKey),'unknown update case');
 const side=alternate??(repetition%2?'B':'A');assert.ok(['A','B'].includes(side));
 const cacheKey=[size,c.caseKey,c.id==='replace-existing-vocabulary'?side:'fixed'].join(':');if(scenarios.has(cacheKey))return scenarios.get(cacheKey);
 const records=workloadForUpdate(size).records,batch=c.kind==='single'?1:c.batch,prefix=records.slice(0,size-batch),tail=records.slice(size-batch),ids=tail.map(r=>r.id),a=ids.map(id=>templateRecord(id,'A')),b=ids.map(id=>templateRecord(id,'B')),novel=ids.map((id,j)=>templateRecord(id,c.kind==='single'?'novel':'batchNovel',j));
 let beforeRecords,afterRecords,calls,preparationCalls=[],vocabularyRule;
 switch(c.id){
 case 'add-new-vocabulary':beforeRecords=prefix;afterRecords=[...prefix,...novel];calls=[{method:'add',input:novel[0]}];vocabularyRule='create-unique';break;
 case 'replace-existing-vocabulary':beforeRecords=[...prefix,...(side==='A'?a:b)];afterRecords=[...prefix,...(side==='A'?b:a)];calls=[{method:'replace',input:afterRecords.at(-1)}];vocabularyRule='same-live-terms';break;
 case 'replace-new-vocabulary':beforeRecords=[...prefix,...a];afterRecords=[...prefix,...novel];calls=[{method:'replace',input:novel[0]}];vocabularyRule='replace-create-unique';break;
 case 'remove':beforeRecords=[...prefix,...a];afterRecords=prefix;calls=[{method:'remove',input:ids[0]}];vocabularyRule='remove-existing';break;
 case 'reinsert':beforeRecords=prefix;afterRecords=[...prefix,...a];calls=[{method:'add',input:a[0]}];preparationCalls=[{method:'add',input:a[0]},{method:'remove',input:ids[0]}];vocabularyRule='restore-source-after-real-removal';break;
 case 'remove-unique-vocabulary':beforeRecords=[...prefix,...novel];afterRecords=prefix;calls=[{method:'remove',input:ids[0]}];vocabularyRule='remove-unique';break;
 case 'addMany-new-vocabulary':beforeRecords=prefix;afterRecords=[...prefix,...novel];calls=[{method:'addMany',input:novel}];vocabularyRule='create-batch-unique';break;
 case 'addMany-existing-vocabulary':beforeRecords=prefix;afterRecords=[...prefix,...a];calls=[{method:'addMany',input:a}];vocabularyRule='same-live-terms';break;
 case 'replace-existing-records':beforeRecords=[...prefix,...a];afterRecords=[...prefix,...b];calls=b.map(input=>({method:'replace',input}));vocabularyRule='same-live-terms';break;
 case 'remove-existing-records':beforeRecords=[...prefix,...a];afterRecords=prefix;calls=ids.map(input=>({method:'remove',input}));vocabularyRule='remove-existing';break;
 case 'reinsert-removed-records':beforeRecords=prefix;afterRecords=[...prefix,...a];calls=[{method:'addMany',input:a}];preparationCalls=[{method:'addMany',input:a},...ids.map(input=>({method:'remove',input}))];vocabularyRule='restore-source-after-real-removal';break;
 default:assert.fail('missing update case');
 }
 const value=freeze({...c,beforeRecords,afterRecords,calls,preparationCalls,changedIds:ids,vocabularyRule,initialSide:side,scope:calls.length>1?'Ordered sequence; each successful call is a separate atomic revision.':'One public atomic call.'});scenarios.set(cacheKey,value);return value;
}
