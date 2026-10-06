import assert from 'node:assert/strict';
import { ExecutionOwner } from '../../dist/core/execution/engine.js';
import { IndexConstruction } from '../../dist/core/index/construction.js';
function drain(cursor) { for(;;) { const r=cursor.next(); if(r.done) return r.value; } }
const schema={text:{body:{}}};
function root(){return drain(new IndexConstruction({schema}).finish());}
class Host { now(){return 0;} pending=new Set(); schedule(fn,delay){this.pending.add(fn);return ()=>this.pending.delete(fn);} }
let reads=0;
const baseline=new ExecutionOwner(root(),new Host());
const signal={get aborted(){reads++;return false;},addEventListener(){},removeEventListener(){}};
await baseline.add({id:'a',text:{body:'word'}},{signal});
const baselineReads=reads;
await baseline.dispose();
const anomalies=[];
for(let trigger=1;trigger<=baselineReads;trigger++) {
 const host=new Host(), engine=new ExecutionOwner(root(),host); let count=0, disposal;
 const signal={get aborted(){if(++count===trigger) disposal=engine.dispose();return false;},addEventListener(){},removeEventListener(){}};
 const result=await engine.add({id:'a',text:{body:'word'}},{signal}).then(value=>({ok:true,value}),e=>({ok:false,code:e.code}));
 assert.ok(disposal, 'every signal read position requests disposal');
 if(disposal) await disposal;
 assert.equal(host.pending.size,0, 'disposal removes owned tasks');
 assert.equal(engine.root,undefined, 'disposal releases the owned root');
 assert.equal(result.ok,false, 'disposal inside a precommit signal read must prevent commit');
 assert.equal(result.code,'DISPOSED');
 if(result.ok) anomalies.push({trigger,count,result,pending:host.pending.size,rootReleased:engine.root===undefined});
 if(!disposal) await engine.dispose();
}
assert.ok(baselineReads > 0);
assert.equal(anomalies.length,0);
console.log(JSON.stringify({baselineReads,anomalies},null,2));
