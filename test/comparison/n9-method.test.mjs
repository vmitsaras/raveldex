import test from 'node:test';
import assert from 'node:assert/strict';
import { summaries, requireCoverage } from '../../bench/n9/run.mjs';
test('N9 normal summaries retain refused/unknown outcomes and separate CPU from wall', () => {
  const [row] = summaries([{family:'f',size:100,samples:[
    {operation:'q',outcome:'Pass',wallMs:5,cpuUserMs:2,cpuSystemMs:1},
    {operation:'q',outcome:'Pass',wallMs:9,cpuUserMs:3,cpuSystemMs:1},
    {operation:'q',outcome:'Refused',wallMs:1},
    {operation:'q',outcome:'Unknown',wallMs:2}]}]);
  assert.equal(row.attempts,4); assert.deepEqual(row.outcomes,{Pass:2,Refused:1,Unknown:1});
  assert.equal(row.medianWallMs,7); assert.equal(row.observedMaximumWallMs,9);
  assert.deepEqual(row.cpuSamples,[{cpuUserMs:2,cpuSystemMs:1},{cpuUserMs:3,cpuSystemMs:1}]);
  assert.equal(summaries([{family:'f',size:100,samples:[{operation:'q',outcome:'Refused',wallMs:1}]}])[0].medianWallMs,null);
});

test('N9 matrix completion refuses missing query work, duplicate queries and blocked builds', () => {
  const samples = [{operation:'build',outcome:'Pass'}, ...Array.from({length:8},(_,i)=>({operation:'query:'+i,outcome:'Pass'}))];
  requireCoverage({mode:'diagnostic',samples:[],observations:samples});
  assert.throws(()=>requireCoverage({mode:'diagnostic',samples:[],observations:[]}));
  assert.throws(()=>requireCoverage({mode:'diagnostic',samples:[],observations:samples.map(row=>({...row,operation:row.operation==='build'?'build':'query:same'}))}));
  assert.throws(()=>requireCoverage({mode:'diagnostic',samples:[],observations:samples.map(row=>({...row,outcome:'Refused'}))}));
});
