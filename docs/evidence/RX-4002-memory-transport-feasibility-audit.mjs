import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const path=process.argv[2]??'/tmp/raveldex-transport-feasibility-v2-20261026.json',bytes=await readFile(path),j=JSON.parse(bytes);
assert.equal(j.outcome,'Observed');assert.equal(j.complete.dataLossOccurred,false);
const names=new Set(),events=[],providers=new Set();
for(const [index,e]of j.events.entries()){
  const provider=e.args?.memory_dump_provider?.name;if(provider)providers.add(provider);
  const alloc=e.args?.dumps?.allocators;if(!alloc)continue;
  const serializationNamedAllocatorRecords=Object.entries(alloc).filter(([n])=>/SerializedScriptValue|serialized_script_value|structured.?clone|transport.?buffer/i.test(n)).map(([name,value])=>({name,...value}));
  for(const n of Object.keys(alloc))names.add(n);
  events.push({index,name:e.name,id:e.id,pid:e.pid,timestamp:e.ts,level:e.args.dumps.level_of_detail,allocatorCount:Object.keys(alloc).length,serializationNamedAllocatorRecords});
}
const serializers=j.events.filter(e=>e.cat==='blink'&&/^SerializedScriptValueFactory::(create|deserialize)$/.test(e.name));
for(const e of serializers){assert.equal(e.ph,'X');assert.ok(Number.isSafeInteger(e.ts)&&Number.isSafeInteger(e.dur)&&e.dur>=0);assert.deepEqual(e.args,{});}
const result={kind:'rx4002-feasibility-memory-visibility-independent-v2',input:{path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},browser:j.browser,complete:j.complete,
traceEvents:j.events.length,serializerCompleteEvents:serializers.length,serializerNames:Object.fromEntries(['create','deserialize'].map(n=>[n,serializers.filter(e=>e.name.endsWith('::'+n)).length])),
memoryDumpRequests:{before:j.memoryBefore,after:j.memoryAfter},allocatorEvents:events,totalDistinctAllocatorPaths:names.size,invokedProviderNames:[...providers].sort(),
serializationNamedAllocatorPaths:[...names].filter(n=>/SerializedScriptValue|serialized_script_value|structured.?clone|transport.?buffer/i.test(n)),
boundaries:[
'This is the tiny feasibility trace, not the final repeated transport matrix; source/operation marks do not yet isolate individual posts.',
'All observed native serialization factory events have empty args and complete elapsed durations; there are no buffer-byte/copy arguments on those events.',
'Named UnpackedSerializedScriptValue paths represent aggregate wrapper/type accounting at recorded points, with duplicate page/type and aggregate paths; they are not per-message native serialized buffer sizes.',
'Command response dumpGuid0x3/0x4 and JSON trace dump IDs0x0/0x1 are retained separately; no undocumented literal equivalence is assumed.',
'Allocator snapshots and browser/process/JS heap sizes are different and overlapping scopes. No parent/child/metric sum or transient peak/copy attribution follows.',
'No claim of universal provider absence, no product failure, and no criterion waiver follows from this visibility inventory.']};
await writeFile('/tmp/raveldex-transport-feasibility-memory-audit.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({events:result.traceEvents,serializerEvents:result.serializerCompleteEvents,allocatorEvents:events.length,uniqueAllocatorPaths:names.size,serializationNamedPaths:result.serializationNamedAllocatorPaths.length,providerNames:result.invokedProviderNames}));
