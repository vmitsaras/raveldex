import test from 'node:test';
import assert from 'node:assert/strict';
import {compareMembership,summarizeAlternatives} from '../../bench/n9/alternatives-method.mjs';
test('complete membership accepts different rank but refuses missing/duplicate counts',()=>{
 assert.equal(compareMembership({ids:['b','a'],total:2},['a','b']).status,'Equivalent membership');
 assert.equal(compareMembership({ids:['a'],total:1},['a','b']).status,'Not comparable');
 assert.throws(()=>compareMembership({ids:['a','a'],total:2},['a']),/duplicate/);
 assert.throws(()=>compareMembership({ids:['a'],total:2},['a']),/complete count/);
});
test('tails require100 actual same-cell observations and failures never pool with successful costs',()=>{
 const row={engine:'x',family:'y',size:100,samples:Array.from({length:99},(_,i)=>({operation:'query:a',phase:'warm',outcome:'Pass',wallMs:i,cpuUserMs:i/2,cpuSystemMs:0}))};
 assert.equal(summarizeAlternatives([row])[0].wallP95Ms,null);
 row.samples.push({operation:'query:a',phase:'warm',outcome:'Pass',wallMs:99,cpuUserMs:1,cpuSystemMs:0});
 row.samples.push({operation:'query:a',phase:'warm',outcome:'Refused',wallMs:500,cpuUserMs:1,cpuSystemMs:0});
 const out=summarizeAlternatives([row]);assert.equal(out.length,2);assert.equal(out[0].wallP95Ms,94);assert.equal(out[1].wallP95Ms,null);assert.equal(out[0].count,100);
});
