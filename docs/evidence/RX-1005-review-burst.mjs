import assert from 'node:assert/strict';
import { ExecutionOwner } from '../../dist/core/execution/engine.js';
import { IndexConstruction } from '../../dist/core/index/construction.js';
function drain(cursor) { for(;;) { const r=cursor.next(); if(r.done) return r.value; } }
const schema={text:{body:{}}}, c=new IndexConstruction({schema});
drain(c.append(Array.from({length:100},(_,i)=>({id:`doc${i}`,text:{body:'common'}}))));
const root=drain(c.finish());
const metrics={workUnits:0,steps:0,hostYields:0,maxTaskWorkUnits:0,maxStepWorkUnits:0,checks:0,phaseChecks:{}};
class Host { time=0; seq=0; jobs=new Map(); bursts=[]; now(){return this.time;} schedule(fn,delay){const id=++this.seq;this.jobs.set(id,{fn,due:this.time+delay});return()=>this.jobs.delete(id);} run(){const next=[...this.jobs].find(([,v])=>v.due<=this.time);if(!next)return false;this.jobs.delete(next[0]);const start=metrics.workUnits;next[1].fn();this.bursts.push(metrics.workUnits-start);return true;} flush(){let count=0;while(this.run())assert.ok(++count<100000,'review burst must terminate');} }
const host=new Host(), engine=new ExecutionOwner(root,host,[],metrics);
const initial=engine.add({id:'blocker',text:{body:'word '.repeat(1000)}});
const initialBurst=metrics.workUnits;
const queued=Array.from({length:32},()=>engine.search({kind:'none'}));
assert.equal(metrics.workUnits,initialBurst);
host.flush();
assert.equal((await initial).revision,1);
for(const p of queued) {const r=await p;assert.equal(r.total,0);assert.equal(r.revision,1);}
const observed=Math.max(initialBurst,...host.bursts);
assert.equal(metrics.maxTaskWorkUnits,observed);
assert.ok(observed < 2048 + metrics.maxStepWorkUnits);
console.log(JSON.stringify({operations:33,initialBurst,observedMaxBurst:observed,reportedMaxBurst:metrics.maxTaskWorkUnits,maxStep:metrics.maxStepWorkUnits,hostYields:metrics.hostYields,remainingJobs:host.jobs.size},null,2));
await engine.dispose();
assert.equal(engine.root,undefined);
assert.equal(host.jobs.size,0);
