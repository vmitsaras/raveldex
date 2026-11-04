import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBrowserRestoreRows, summarizeBrowserRestoreOutcomes } from '../../bench/n9/restore-browser.mjs';
const result = (revision = 4, id = 'a') => ({ revision, model:'raveldex-bm25-v1',completeness:'complete',total:1000,hits:[{id,score:.5}] });
const donor = () => ['all','common','rare','narrow-prefix','source-phrase'].map(id=>({id,outcome:'Pass',result:result()}));
const prior = () => ({all:result(4,'prior:a'),lexical:result(4,'prior:a'),phrase:result(4,'prior:a')});
function successful(input) {
  for(const row of input){const operations=row.mode==='normal'?row.case.samples:row.case.observations;operations[2]={operation:'restoreSource',outcome:'Pass',wallMs:1,...(row.mode==='diagnostic'?{counters:{emittedSteps:1}}:{}),priorRevision:4,priorDocuments:1000,oldRemoved:true,result:{format:'raveldex-source',reindexed:true,originRevision:4,revision:5,receivingAnalyzer:{id:'basic-v1',environmentProfile:'unqualified'}},postcondition:donor().map(item=>({...item,result:{...item.result,revision:5}}))};}
  return input;
}
function rows() {
  const rows=[];
  for(const variant of ['source','positions-offsets'])for(const mode of ['normal','diagnostic'])for(const execution of ['direct','worker']){
    const operations=['build','exportSource','restoreSource','deadlineRestore','abortedRestore'].map(operation=>({operation,outcome:'Pass',wallMs:1,...(mode==='diagnostic'?{counters:{emittedSteps:1}}:{})}));
    operations[0].result={revision:4,added:232};
    operations[1].result={encodedBytes:100,encodedCodeUnits:100,encodedSha256:'a'.repeat(64),header:{originRevision:4,analyzer:{id:'basic-v1',environmentProfile:'unqualified'}}};
    operations[2]={...operations[2],outcome:'Refused',error:{code:'WORK_LIMIT_EXCEEDED'},oldQueriesPreserved:true,oldSourceBytesPreserved:true,priorRevision:4,priorDocuments:1000,postcondition:prior()};
    operations[3]={...operations[3],outcome:'Refused',error:{code:'DEADLINE_EXCEEDED'},oldQueriesPreserved:true,oldSourceBytesPreserved:true,priorRevision:4,priorDocuments:1000,postcondition:prior()};
    operations[4]={...operations[4],outcome:'Cancelled',error:{code:'CANCELLED'},oldQueriesPreserved:true,oldSourceBytesPreserved:true,priorRevision:4,priorDocuments:1000,postcondition:prior()};
    rows.push({size:1000,variant,mode,execution,pageErrors:[],externalRequests:[],case:{outcome:'Collected',donorResults:donor(),samples:mode==='normal'?operations:[],observations:mode==='diagnostic'?operations:[]}});
  }
  return rows;
}
test('browser restore coverage keeps refused/cancelled operations separate from collected configurations',()=>{
  const input=rows();assert.equal(validateBrowserRestoreRows(input,[1000]).configurations,8);const summaries=summarizeBrowserRestoreOutcomes(input);
  assert.equal(summaries.filter(row=>row.operation==='restoreSource'&&row.outcome==='Refused').length,8);
  assert.equal(summaries.filter(row=>row.operation==='abortedRestore'&&row.outcome==='Cancelled').length,8);
  assert.ok(summaries.every(row=>row.operation!=='restoreSource'||row.outcome!=='Pass'));
  input[0].case.samples[1]={operation:'exportSource',outcome:'Refused',wallMs:1,error:{code:'WORK_LIMIT_EXCEEDED'}};
  for(let i=2;i<5;i++)input[0].case.samples[i]={operation:input[0].case.samples[i].operation,outcome:'Not run',reason:'Export refused'};
  assert.equal(validateBrowserRestoreRows(input,[1000]).configurations,8);assert.equal(summarizeBrowserRestoreOutcomes(input).filter(row=>row.outcome==='Not run').length,3);
});
test('browser restore method rejects coverage/state-proof drift, mixed diagnostics and fabricated CPU',()=>{
  let input=rows();input.pop();assert.throws(()=>validateBrowserRestoreRows(input,[1000]));
  input=rows();input[0].case.samples[2].oldSourceBytesPreserved=false;assert.throws(()=>validateBrowserRestoreRows(input,[1000]));
  input=rows();input[0].case.samples[0].cpuUserMs=1;assert.throws(()=>validateBrowserRestoreRows(input,[1000]));
  input=rows();input[0].case.observations.push(input[0].case.samples[0]);assert.throws(()=>validateBrowserRestoreRows(input,[1000]));
  input=rows();input[0].externalRequests.push('https://example.com');assert.throws(()=>validateBrowserRestoreRows(input,[1000]));
  input=rows();input[0].case.outcome='Running';assert.throws(()=>validateBrowserRestoreRows(input,[1000]));
  input=rows();input[0].case.samples[2]={operation:'restoreSource',outcome:'Unknown',wallMs:1,error:{code:'OUTCOME_UNKNOWN'},stateClaim:'Unknown; no authoritative-state claim'};assert.equal(validateBrowserRestoreRows(input,[1000]).configurations,8);
});

test('browser restore parity rejects snapshot/header/hash and successful numerical/receipt drift while retaining refusal transitions',()=>{
  let input=successful(rows());const checked=validateBrowserRestoreRows(input,[1000]);assert.ok(checked.parity.some(row=>row.relation==='equal-snapshot-identity'));assert.equal(checked.transitions.length,0);
  const change=fn=>{const input=successful(rows());fn(input[1].mode==='normal'?input[1].case.samples:input[1].case.observations,input[1]);assert.throws(()=>validateBrowserRestoreRows(input,[1000]));};
  change(operations=>operations[1].result.encodedSha256='b'.repeat(64));
  change(operations=>operations[1].result.encodedBytes++);
  change(operations=>operations[1].result.header.analyzer.id='changed');
  change((operations,row)=>row.case.donorResults[0].result.hits[0].score++);
  change(operations=>operations[2].postcondition[0].result.hits[0].score++);
  change(operations=>operations[2].result.originRevision++);
  change(operations=>operations[2].result.receivingAnalyzer.id='changed');
  change(operations=>operations[2].result.revision++);
  input=rows();input[1].case.samples[2].error={code:'DEADLINE_EXCEEDED',details:{path:'deadline'}};const transitions=validateBrowserRestoreRows(input,[1000]).transitions;assert.ok(transitions.some(row=>row.operation==='restoreSource'&&row.observed.error.code==='DEADLINE_EXCEEDED'));
});
