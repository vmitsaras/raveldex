import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestRank, summarizeScheduling, validateScheduling } from '../../bench/n9/scheduling.mjs';

const sample=(query,value=1,outcome='Pass')=>({query,wallMs:value,outcome,cpuUserMs:value/2,cpuSystemMs:.1});
function rows(samples=40) {
  const result=[];
  for(const variant of ['baseline','candidate'])for(let owner=0;owner<4;owner++){
    const mode=owner===3?'diagnostic':'normal';
    const observations=['common','rare'].map(query=>({...sample(query),counters:{steps:2,workUnits:8,hostYields:1,tasks:[{durationMs:.5,workUnits:8}]}}));
    result.push({variant,execution:'node-direct',size:1000,mode,build:{outcome:'Pass'},outcome:'Pass',queryResults:{common:'same',rare:'same'},samples:mode==='normal'?['common','rare'].flatMap(query=>Array.from({length:samples},()=>sample(query))):[],observations:mode==='diagnostic'?observations:[]});
  }
  return result;
}
test('scheduling quantiles use declared nearest rank, require100 successes for p95 and retain failed attempts',()=>{
  assert.equal(nearestRank(Array.from({length:120},(_,i)=>i+1),.5),60);assert.equal(nearestRank(Array.from({length:120},(_,i)=>i+1),.95),114);
  assert.throws(()=>nearestRank([], .95));assert.throws(()=>nearestRank([NaN],.95));
  const input=rows();input[0].samples[0]=sample('common',999,'Unknown');const summaries=summarizeScheduling(input);const s=summaries.find(row=>row.variant==='baseline'&&row.query==='common');
  assert.equal(s.attempts,120);assert.equal(s.successes,119);assert.deepEqual(s.outcomes,{Unknown:1,Pass:119});assert.equal(s.p95WallMs,1);assert.equal(s.cpuSamples.length,119);
  const small=summarizeScheduling(rows(2))[0];assert.equal(small.p95WallMs,null);assert.equal(small.successes,6);
});
test('scheduling coverage refuses missing owners, failures, semantic drift, changed work and mixed diagnostics',()=>{
  assert.equal(validateScheduling(rows()).length,1);
  let input=rows();input.pop();assert.throws(()=>validateScheduling(input));
  input=rows();input[0].samples.pop();assert.throws(()=>validateScheduling(input));
  input=rows();input[0].outcome='Fail';assert.throws(()=>validateScheduling(input));
  input=rows();input[4].queryResults.rare='changed';assert.throws(()=>validateScheduling(input));
  input=rows();input[7].observations[0].counters.workUnits++;assert.throws(()=>validateScheduling(input));
  input=rows();input[0].observations.push(sample('rare'));assert.throws(()=>validateScheduling(input));
});
test('scheduling summaries never mix intrusive spans into ordinary latency and reject invalid samples',()=>{
  const input=rows();input[3].observations.forEach(row=>row.wallMs=90000);const summaries=summarizeScheduling(input);assert.ok(summaries.every(row=>row.p50WallMs===1&&row.p95WallMs===1));
  input[0].samples[0].counters={};assert.throws(()=>summarizeScheduling(input));
  const invalid=rows();invalid[0].samples[0].wallMs=-1;assert.throws(()=>summarizeScheduling(invalid));
});
