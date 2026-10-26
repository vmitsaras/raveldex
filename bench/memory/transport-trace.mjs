import assert from 'node:assert/strict';
export const FACTORY={send:'SerializedScriptValueFactory::create',read:'SerializedScriptValueFactory::deserialize'};
const safe=v=>Number.isFinite(v)&&Math.abs(v)<=Number.MAX_SAFE_INTEGER;
const identity=e=>`${e.pid}:${e.tid}`;

export function analyzeTransportTrace(trace,observations,complete) {
  assert.equal(complete.dataLossOccurred,false,'Complete trace without reported loss required');
  const events=trace.traceEvents;assert.ok(Array.isArray(events));
  for(const o of observations)assert.equal(o.dropped,0,'Observation rows truncated');
  const target=observations.flatMap(o=>o.rows).filter(r=>['snapshotExportSource','snapshotRestore'].includes(r.operation));
  assert.equal(target.length,8,'Exactly eight send/read rows for two round trips');
  const used=new Set(),realms=new Map();
  const marker=name=>{const a=events.filter(e=>e.name===name&&e.cat?.split(',').includes('blink.user_timing'));assert.equal(a.length,1,`Unique mark ${name} required`);const e=a[0];assert.ok(safe(e.ts)&&Number.isSafeInteger(e.pid)&&Number.isSafeInteger(e.tid));return e;};
  const windows=Object.fromEntries(['exportSource','restoreSource'].map(op=>{const begin=marker(`rx:operation:${op}:begin`),end=marker(`rx:operation:${op}:end`);assert.equal(identity(begin),identity(end));assert.ok(end.ts>=begin.ts);return[op,{beginUs:begin.ts,endUs:end.ts,elapsedUs:end.ts-begin.ts,pid:begin.pid,tid:begin.tid}];}));
  const rows=target.map(row=>{
    assert.ok(['main','worker'].includes(row.realm)&&['send','read'].includes(row.direction)&&Number.isSafeInteger(row.sequence)&&Number.isSafeInteger(row.id));
    const prefix=`rx:transport:${row.realm}:${row.direction}:${row.sequence}`,begin=marker(prefix+':begin'),end=marker(prefix+':end');
    assert.equal(identity(begin),identity(end));assert.ok(end.ts>=begin.ts);
    const prior=realms.get(row.realm);if(prior)assert.equal(prior,identity(begin));else realms.set(row.realm,identity(begin));
    const op=row.operation==='snapshotExportSource'?'exportSource':'restoreSource',window=windows[op];assert.ok(begin.ts>=window.beginUs&&end.ts<=window.endUs,'Message must lie inside public operation window');
    const matches=events.map((e,i)=>({e,i})).filter(({e})=>e.name===FACTORY[row.direction]&&e.cat?.split(',').includes('blink')&&identity(e)===identity(begin)&&safe(e.ts)&&safe(e.dur)&&e.dur>=0&&e.ts>=begin.ts&&e.ts+e.dur<=end.ts);
    assert.equal(matches.length,1,`Exactly one native ${row.direction} interval inside bracket`);const {e,i}=matches[0];assert.equal(e.ph,'X');assert.ok(!used.has(i));used.add(i);
    return{...row,bracket:{pid:begin.pid,tid:begin.tid,beginUs:begin.ts,endUs:end.ts,elapsedUs:end.ts-begin.ts},native:{name:e.name,tsUs:e.ts,elapsedUs:e.dur,rawThreadDurationUs:e.tdur??null,eventIndex:i,args:e.args}};
  });
  assert.notEqual(realms.get('main'),realms.get('worker'),'Distinct main/worker threads required');
  for(const w of Object.values(windows))assert.equal(`${w.pid}:${w.tid}`,realms.get('main'));
  for(const row of rows){const mate=rows.filter(other=>other.realm!==row.realm&&other.direction!==row.direction&&other.operation===row.operation&&other.id===row.id&&other.kind===row.kind);assert.equal(mate.length,1);assert.equal(mate[0].inputStringCodeUnits,row.inputStringCodeUnits);assert.equal(mate[0].valueStringCodeUnits,row.valueStringCodeUnits);}
  for(const [op,w]of Object.entries(windows)){const factories=events.filter(e=>Object.values(FACTORY).includes(e.name)&&safe(e.ts)&&e.ts>=w.beginUs&&e.ts<=w.endUs);assert.equal(factories.length,4,`No uncorrelated factory intervals in ${op}`);}
  const serializationNamedAllocatorPaths=[];
  for(const [eventIndex,e]of events.entries())for(const [path,allocator]of Object.entries(e.args?.dumps?.allocators??{}))if(/seriali[sz]|clone/i.test(path))serializationNamedAllocatorPaths.push({eventIndex,eventName:e.name,pid:e.pid,tid:e.tid,ts:e.ts,id:e.id??null,path,allocator});
  return{meaning:'Native factory elapsed trace intervals inside actual postMessage/first event.data access brackets, correlated to adapter IDs. Not CPU time, total adapter cost, heap bytes or physical copy/peak counts.',windows,realms:Object.fromEntries(realms),rows,
    memory:{serializationNamedAllocatorPaths,meaning:'Raw hierarchical allocator/type aggregate paths and attrs, not per-message wire-buffer ownership. Paths/metrics may overlap; no byte/count sum or dumpGuid-to-exported-ID equivalence is inferred.'}};
}
