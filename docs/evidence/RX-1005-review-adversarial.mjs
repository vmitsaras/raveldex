import assert from 'node:assert/strict';
import { ExecutionOwner } from '../../dist/core/execution/engine.js';
import { IndexConstruction } from '../../dist/core/index/construction.js';
const schema = { text: { body: {} } };
function drain(cursor) { for (;;) { const x = cursor.next(); if(x.done) return x.value; } }
function root(limits = {}, records = []) { const c = new IndexConstruction({schema, limits}); if(records.length) drain(c.append(records)); return drain(c.finish()); }
class Host {
  time = 0; sequence = 0; pending = new Map();
  now() { return this.time; }
  schedule(callback, delay) { const id = ++this.sequence; this.pending.set(id, {callback, at:this.time + delay}); return () => this.pending.delete(id); }
  run() { const next = [...this.pending.entries()].filter(([,v]) => v.at <= this.time).sort((a,b)=>a[1].at-b[1].at || a[0]-b[0])[0]; if(!next) return false; this.pending.delete(next[0]); next[1].callback(); return true; }
  flush() { let n=0; while(this.run()) { if(++n>100000) throw Error('too much'); } return n; }
}
class Signal {
  aborted=false; listeners=new Set(); adds=0; removes=0;
  addEventListener(type, fn) { this.adds++; this.listeners.add(fn); }
  removeEventListener(type, fn) { this.removes++; this.listeners.delete(fn); }
  abort() { this.aborted=true; for(const fn of [...this.listeners]) fn(); }
}
const rec = (id, body='common') => ({ id, text: {body} });
const settle = p => p.then(value=>({ok:true,value}),error=>({ok:false,code:error.code,error}));
const report=[];
async function test(name, fn) { try { await fn(); report.push({name, pass:true}); } catch(e) { report.push({name,pass:false,message:e.message,actual:e.actual,expected:e.expected}); } }
await test('zero waiting slots: idle starts, concurrent rejects, disposer removes tasks', async()=>{
 const host=new Host(), engine=new ExecutionOwner(root({maxQueuedOperations:0, checkpointWorkUnits:1}),host);
 const p=settle(engine.add(rec('a'))), q=settle(engine.search('common')); assert.equal((await q).code,'QUEUE_FULL'); assert.equal(host.pending.size,2);
 host.flush(); assert.equal((await p).value.revision,1); assert.equal(host.pending.size,0); assert.equal(engine.root.revision,1);
 const disposal=engine.dispose(); assert.equal(engine.dispose(),disposal); await disposal; assert.equal(engine.root,undefined);
 let accessed=false; const poison=new Proxy({}, {getPrototypeOf(){accessed=true;throw Error('accessed');}});
 const rejection=await settle(engine.add(poison)); assert.equal(rejection.code,'DISPOSED'); assert.equal(accessed,false);
});
await test('queued abort frees slot, live silent abort checked on start, failed mutation root retained',async()=>{
 const host=new Host(), engine=new ExecutionOwner(root({maxQueuedOperations:1,checkpointWorkUnits:1}),host), signal=new Signal();
 const a=settle(engine.add(rec('a'))), b=settle(engine.search('common',{signal})); signal.abort(); assert.equal((await b).code,'CANCELLED'); assert.equal(signal.listeners.size,0);
 const silent=new Signal(), c=settle(engine.add(rec('b'),{signal:silent})); silent.aborted=true; host.flush(); assert.equal((await a).value.revision,1); assert.equal((await c).code,'CANCELLED'); assert.equal(engine.root.revision,1); assert.equal(host.pending.size,0);
 const d=settle(engine.search('common')); host.flush(); assert.equal((await d).value.total,1); await engine.dispose();
});
await test('queued deadline expires without running, later accepted call retains FIFO root',async()=>{
 const host=new Host(), engine=new ExecutionOwner(root({maxQueuedOperations:2,checkpointWorkUnits:1}),host);
 const a=settle(engine.add(rec('a'),{deadlineMs:100})), b=settle(engine.add(rec('b'),{deadlineMs:2})); host.time=2;
 // Run queued deadline directly, without active resume; the slot must free.
 const timer=[...host.pending.entries()].find(([,v])=>v.at===2); host.pending.delete(timer[0]); timer[1].callback(); assert.equal((await b).code,'DEADLINE_EXCEEDED');
 const c=settle(engine.search('common')); host.flush(); assert.equal((await a).value.revision,1); assert.equal((await c).value.revision,1); assert.equal((await c).value.total,1); assert.equal(host.pending.size,0); await engine.dispose();
});
await test('reentrant removeEventListener must not execute replacement while failed cursor holds mutation owner',async()=>{
 const host=new Host(), engine=new ExecutionOwner(root({checkpointWorkUnits:1}),host), signal=new Signal(); let newResult;
 const oldRemove=signal.removeEventListener.bind(signal); signal.removeEventListener=(type,fn)=>{ oldRemove(type,fn); newResult=settle(engine.add(rec('b'))); };
 const a=settle(engine.add(rec('a'),{signal})); signal.abort(); host.flush(); assert.equal((await a).code,'CANCELLED'); const later=await newResult; assert.equal(later.ok,true); assert.equal(later.value.revision,1); await engine.dispose();
});
await test('reentrant removeEventListener must preserve older queued calls',async()=>{
 const host=new Host(), engine=new ExecutionOwner(root({checkpointWorkUnits:1}),host), signal=new Signal(); let newResult;
 const oldRemove=signal.removeEventListener.bind(signal); signal.removeEventListener=(type,fn)=>{ oldRemove(type,fn); newResult=settle(engine.add(rec('b'))); };
 const a=settle(engine.add(rec('a'),{signal})), earlier=settle(engine.search({kind:'all'})); signal.abort(); host.flush(); assert.equal((await a).code,'CANCELLED');
 const result=await earlier; assert.equal(result.value.revision,0); assert.equal(result.value.total,0); assert.equal((await newResult).ok,true); await engine.dispose();
});
await test('reentrant listener registration completing after operation must not leak listener',async()=>{
 const host=new Host(), engine=new ExecutionOwner(root(),host), signal=new Signal(); let reentrant;
 signal.addEventListener=(type,fn)=>{ signal.adds++; reentrant=settle(engine.search({kind:'all'})); signal.listeners.add(fn); };
 const a=settle(engine.add(rec('a'),{signal})); host.flush(); assert.equal((await a).ok,true); assert.equal((await reentrant).ok,true); assert.equal(signal.listeners.size,0); await engine.dispose();
});
console.log(JSON.stringify(report,null,2));
assert.ok(report.every(result => result.pass), 'all adversarial review probe groups must pass');
