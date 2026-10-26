import assert from 'node:assert/strict';
import{test}from'node:test';
import{analyzeTransportTrace,FACTORY}from'./transport-trace.mjs';
import{observeTransport}from'./transport-observer.mjs';

function literal(){const traceEvents=[],observations=[{realm:'main',rows:[],dropped:0},{realm:'worker',rows:[],dropped:0}];
  const mark=(name,ts,realm)=>traceEvents.push({name,cat:'blink.user_timing',ph:'I',ts,pid:10,tid:realm==='main'?20:21});
  for(const [index,operation]of ['snapshotExportSource','snapshotRestore'].entries()){
    const base=index*1000,op=index?'restoreSource':'exportSource';mark(`rx:operation:${op}:begin`,base,'main');mark(`rx:operation:${op}:end`,base+100,'main');
    for(const [i,[realm,direction]]of [['main','send'],['worker','read'],['worker','send'],['main','read']].entries()){
      const sequence=index+1,ts=base+10+i*20,kind=i<2?null:'result';const row={realm,direction,sequence,id:index+1,operation,kind,inputStringCodeUnits:index&&i<2?100:null,valueStringCodeUnits:!index&&i>=2?100:null,argumentCount:direction==='send'?1:null};
      observations[realm==='main'?0:1].rows.push(row);const prefix=`rx:transport:${realm}:${direction}:${sequence}`;mark(prefix+':begin',ts,realm);mark(prefix+':end',ts+10,realm);
      traceEvents.push({name:FACTORY[direction],cat:'blink',ph:'X',ts:ts+2,dur:i+1,pid:10,tid:realm==='main'?20:21,args:{}});
    }
  }
  traceEvents.push({name:'periodic_interval',ph:'v',pid:10,tid:99,ts:300,id:'0x0',args:{dumps:{allocators:{'blink_objects/UnpackedSerializedScriptValue':{attrs:{allocated_objects_size:{type:'scalar',units:'bytes',value:'200'}}},'blink_gc/UnpackedSerializedScriptValue':{attrs:{allocated_objects_size:{type:'scalar',units:'bytes',value:'200'}}}}}}});
  return{trace:{traceEvents},observations,complete:{dataLossOccurred:false}};
}
test('literal send/read brackets correlate native elapsed intervals, distinct realms and exact adapter peers',()=>{const f=literal(),r=analyzeTransportTrace(f.trace,f.observations,f.complete);
  assert.equal(r.rows.length,8);assert.deepEqual(r.rows.map(r=>r.native.elapsedUs),[1,4,1,4,2,3,2,3]);assert.equal(r.windows.exportSource.elapsedUs,100);assert.equal(r.realms.main,'10:20');assert.equal(r.realms.worker,'10:21');
  assert.equal(r.memory.serializationNamedAllocatorPaths.length,2);assert.equal(r.memory.serializationNamedAllocatorPaths[0].allocator.attrs.allocated_objects_size.value,'200');assert.ok(!('sumBytes'in r.memory));
});
test('dropped/absent/duplicate marks, truncated observations and same-thread realms reject rather than inventing timing',()=>{
  for(const mutate of [f=>f.complete.dataLossOccurred=true,f=>delete f.complete.dataLossOccurred,f=>f.trace.traceEvents.shift(),f=>f.trace.traceEvents.push(f.trace.traceEvents[0]),f=>f.observations[0].dropped=1,
    f=>{for(const e of f.trace.traceEvents)if(e.tid===21)e.tid=20;}]){const f=literal();mutate(f);assert.throws(()=>analyzeTransportTrace(f.trace,f.observations,f.complete));}
});
test('missing/extra/outside or non-complete native spans, unsafe timings and mismatched peers reject attribution',()=>{
  for(const mutate of [f=>f.trace.traceEvents.find(e=>e.ph==='X').dur=100,f=>f.trace.traceEvents.find(e=>e.ph==='X').ph='B',f=>f.trace.traceEvents.find(e=>e.ph==='X').dur=Number.MAX_SAFE_INTEGER+1,
    f=>f.trace.traceEvents.push({...f.trace.traceEvents.find(e=>e.ph==='X')}),f=>f.observations[0].rows[0].id=99,f=>f.observations[0].rows[0].inputStringCodeUnits=999]){const f=literal();mutate(f);assert.throws(()=>analyzeTransportTrace(f.trace,f.observations,f.complete));}
});
test('endpoint wrapper preserves actual posts, first data access, duplicate listener identity and removal without retaining envelopes',()=>{
  const native=new EventTarget(),sent=[];native.postMessage=(...args)=>sent.push(args);const observer=observeTransport(native,'main');let reads=0,handled=0;const listener=()=>handled++;
  observer.endpoint.addEventListener('message',listener);observer.endpoint.addEventListener('message',listener);const envelope={id:1,operation:'snapshotRestore',payload:{input:'red'}};
  observer.endpoint.postMessage(envelope);const e=new Event('message');Object.defineProperty(e,'data',{get(){reads++;return envelope;}});native.dispatchEvent(e);
  assert.equal(handled,1);assert.equal(reads,1);assert.equal(sent[0][0],envelope);const s=observer.snapshot();assert.equal(s.rows.length,2);assert.equal(s.rows[1].inputStringCodeUnits,3);assert.ok(!JSON.stringify(s).includes('red'));observer.endpoint.removeEventListener('message',listener);assert.equal(observer.snapshot().messageListeners,0);native.dispatchEvent(e);assert.equal(handled,1);
  for(const entry of performance.getEntriesByType('mark'))if(entry.name.startsWith('rx:transport:'))performance.clearMarks(entry.name);
});
