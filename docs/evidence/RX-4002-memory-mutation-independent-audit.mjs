import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
const reportPath = process.argv[2] ?? 'docs/evidence/RX-4002-memory-mutation.json';
const raw = await readFile(reportPath), report = JSON.parse(raw), sha = b => createHash('sha256').update(b).digest('hex');
assert.equal(report.outcome, 'ObservedWithLimits'); assert.equal(report.observations.length, 6);
const result = { kind: 'rx4002-mutation-independent-audit-v1', report: {path:reportPath, sha256:sha(raw)}, method:'Independent parser and DFS with no production graph-helper imports; all same-dump cohort rows and summaries reconstructed from raw heaps. No workloads, GC, browser or package build rerun.', observations:[], inputBindings:[], outcome:'Running' };
for (const b of [...report.sourceBindings,...report.productionFiles,...report.preservedEvidence]) { assert.equal(sha(await readFile(b.path)), b.sha256, b.path); if (b.staged) assert.equal(sha(await readFile(b.staged)), b.sha256); result.inputBindings.push({path:b.path,sha256:b.sha256}); }
for (const b of report.productionFiles) assert.equal(sha(await readFile(join(report.consumer, 'node_modules/@vmitsaras/raveldex', b.path))), b.sha256);
assert.equal(sha(await readFile(join(report.consumer,'vmitsaras-raveldex-0.0.0.tgz'))),report.tarballSha256);
assert.equal(sha(await readFile(join(report.consumer,'node_modules/@vmitsaras/raveldex/package.json'))),report.packageMetadataSha256);
for (const row of report.observations) {
  assert.equal(row.outcome,'Observed'); assert.equal(row.execution.childExitCode,0); assert.equal(row.execution.childSignal,null); assert.equal(row.execution.childTimedOut,false);
  const childBytes=await readFile(row.childReport.path); assert.equal(sha(childBytes),row.childReport.sha256); assert.deepEqual(JSON.parse(childBytes),row.child);
  const c=row.child; assert.equal(c.pid,row.execution.childPid); assert.equal(c.outcome,'Observed'); assert.equal(c.snapshots.length,2); assert.equal(c.operations.length,2); assert.equal(c.collections.length,2);
  assert.deepEqual(c.operations[0],{action:'commit',outcome:'Pass',result:{revision:Math.ceil(row.size/256)+1,changed:true,added:0,replaced:1,removed:0}});
  assert.deepEqual(c.operations[1],{action:'cancel',outcome:'Rejected',error:{name:'RaveldexError',code:'CANCELLED'}});
  for (const w of c.collections) { const commit=w.action==='commit'; assert.deepEqual(w.collected,{old:commit,candidate:!commit,core:true,context:true,changes:true,request:true,oldChanged:commit,candidateChanged:!commit,untouched:false}); assert.deepEqual(w.controlCollected,{held:false,released:true}); }
  assert.equal(c.cleanup.finalRootCollected,true); assert.equal(c.cleanup.observerWorkersExited,true); assert.equal(c.cleanup.markersDeleted,true);
  assert.equal(c.debugger.filter(x=>x.type==='ready').length,2); assert.equal(c.debugger.filter(x=>x.type==='closed').length,2); assert.equal(c.debugger.filter(x=>x.type==='failure').length,0);
  for(const x of c.debugger.filter(x=>x.type==='closed')) {assert.equal(x.captures,1);assert.equal(x.failed,false);}
  const queryCount=row.mode==='core-only'?2:3; assert.equal(c.verifications.length,queryCount*3);
  for(let stage=0;stage<3;stage++) {const changed=stage>0, selected=c.verifications.slice(stage*queryCount,(stage+1)*queryCount), totals=[row.size,Math.floor((row.size-8)/37)+1+Number(changed),...(queryCount===3?[Math.ceil(row.size/3)-Number(changed)]:[])]; for(let q=0;q<queryCount;q++){const v=selected[q];assert.equal(v.changed,changed);assert.equal(v.total,totals[q]);assert.equal(v.returned,Math.min(20,totals[q]));assert.equal(v.revision,Math.ceil(row.size/256)+Number(changed));assert.equal(v.literalEligibility,true);}}
  const independent={mode:row.mode,size:row.size,operationsVerified:true,weakRefStagesVerified:true,debuggerWorkersExited:true,graphs:[]};
  for(const recorded of row.graphs) {
    const bytes=await readFile(recorded.dump.path);assert.equal(sha(bytes),recorded.dump.sha256);assert.equal(bytes.length,recorded.dump.bytes);
    const snap=JSON.parse(bytes), nmeta=snap.snapshot.meta.node_fields, emeta=snap.snapshot.meta.edge_fields, N=snap.nodes,E=snap.edges,S=snap.strings,W=nmeta.length,Q=emeta.length;
    const nf=Object.fromEntries(nmeta.map((k,i)=>[k,i])),ef=Object.fromEntries(emeta.map((k,i)=>[k,i])),NT=snap.snapshot.meta.node_types[nf.type],ET=snap.snapshot.meta.edge_types[ef.type], count=N.length/W;
    const off=new Float64Array(count+1);for(let i=0;i<count;i++)off[i+1]=off[i]+N[i*W+nf.edge_count]*Q;assert.equal(off[count],E.length);
    const typ=i=>NT[N[i*W+nf.type]],id=i=>N[i*W+nf.id],siz=i=>N[i*W+nf.self_size],name=i=>S[N[i*W+nf.name]];
    function edges(i){let rows=[];for(let p=off[i];p<off[i+1];p+=Q){const k=ET[E[p+ef.type]],v=E[p+ef.name_or_index];rows.push({k,n:k==='element'||k==='hidden'?v:S[v],t:E[p+ef.to_node]/W});}return rows;}
    const props=i=>new Map(edges(i).filter(x=>x.k==='property'&&x.n!=='__proto__').map(x=>[x.n,x.t]));
    let markers=[];for(let i=0;i<count;i++)for(const e of edges(i))if(e.k==='property'&&e.n==='__raveldexMutationMarkers')markers.push(e.t);assert.equal(markers.length,1);
    const m=props(markers[0]), old=m.get('old'),candidate=m.get('candidate'),core=m.get('core'),context=m.get('context'), O=props(old),C=props(candidate),K=props(core),X=props(context);
    assert.notEqual(old,candidate); assert.equal(X.get('previous'),old);assert.equal(X.get('core'),core);assert.equal(X.get('changes'),m.get('changes'));assert.equal(X.get('records'),props(m.get('request')).get('records'));assert.equal(O.get('configuration'),C.get('configuration'));assert.equal(K.get('participants'),O.get('participants'));assert.notEqual(C.get('participants'),O.get('participants'));
    for(const key of ['documents','fields','counts'])assert.equal(K.get(key),C.get(key));
    const roles=['oldDocuments','oldFields','oldParticipants','candidateDocuments','candidateFields','candidateParticipants','request','changes'];
    const seeds=['documents','fields','participants'].map(k=>O.get(k)).concat(['documents','fields','participants'].map(k=>C.get(k)),m.get('request'),m.get('changes'));
    const mask=new Uint8Array(count),allowed=(i,e)=> e.k==='property'?e.n!=='__proto__':e.k==='element'||e.k==='internal'&&(['properties','elements'].includes(e.n)||typ(i)==='array'&&/^(0|[1-9][0-9]*)$/.test(e.n)||['string','concatenated string','sliced string'].includes(typ(i))&&['first','second','parent'].includes(e.n));
    for(let bit=0;bit<8;bit++){const seen=new Set(),todo=[seeds[bit]];while(todo.length){const i=todo.pop();if(seen.has(i))continue;seen.add(i);mask[i]|=1<<bit;for(const e of edges(i))if(allowed(i,e))todo.push(e.t);}}
    const rows=[];for(let i=0;i<count;i++)if(mask[i])rows.push([id(i),typ(i),siz(i),mask[i]]);rows.sort((a,b)=>a[0]-b[0]);
    const compressed=await readFile(recorded.cohort.path);assert.equal(sha(compressed),recorded.cohort.sha256);assert.equal(compressed.length,recorded.cohort.bytes);const decompressed=gunzipSync(compressed);assert.equal(sha(decompressed),recorded.cohort.decompressedSha256);assert.equal(decompressed.length,recorded.cohort.decompressedBytes);const cohort=JSON.parse(decompressed);assert.deepEqual(cohort.roles,roles);assert.deepEqual(cohort.rows,rows);
    function agg(pred){let nodes=0,selfSizeBytes=0,byType={};for(const x of rows)if(pred(x[3])){nodes++;selfSizeBytes+=x[2];const b=byType[x[1]]??={nodes:0,selfSizeBytes:0};b.nodes++;b.selfSizeBytes+=x[2];}return {nodes,selfSizeBytes,byType};}
    const expected={oldData:agg(m=>m&7),candidateData:agg(m=>m&56),oldOnly:agg(m=>(m&7)&&!(m&56)),candidateOnly:agg(m=>(m&56)&&!(m&7)),sharedData:agg(m=>(m&7)&&(m&56)),dataUnion:agg(m=>m&63),requestOutsideData:agg(m=>(m&64)&&!(m&63)),changesOutsideDataAndRequest:agg(m=>(m&128)&&!(m&127)),allSelectedUnion:agg(()=>true)};
    for(const [k,v]of Object.entries(expected))assert.deepEqual(recorded.summary[k],v,`${row.mode}/${row.size}/${recorded.action}/${k}`);
    for(let bit=0;bit<8;bit++){assert.deepEqual(recorded.summary.roles[roles[bit]],agg(m=>m&(1<<bit)));assert.equal(recorded.summary.roleRoots[roles[bit]],id(seeds[bit]));}
    for(const [k,i]of m)assert.deepEqual(recorded.summary.lexicalRoots[k],{id:id(i),type:typ(i),selfSizeBytes:siz(i)});
    function directoryEntries(i){const buckets=edges(props(i).get('buckets')).filter(e=>e.k==='element'||e.k==='property'&&e.n!=='__proto__'),entries=new Map();for(const {t:b} of buckets)for(const [key,value]of props(b)){assert.ok(!entries.has(key));entries.set(key,value);}return entries;}
    const oldDocs=directoryEntries(O.get('documents')),newDocs=directoryEntries(C.get('documents'));assert.equal(oldDocs.size,row.size);assert.equal(newDocs.size,row.size);
    let sharedRecords=0;for(let i=0;i<row.size;i++){const key=`item:${String(i).padStart(5,'0')}`;assert.ok(oldDocs.has(key)&&newDocs.has(key));if(i===0)assert.notEqual(oldDocs.get(key),newDocs.get(key));else {assert.equal(oldDocs.get(key),newDocs.get(key));sharedRecords++;}}
    let optionalRecords=0;const oldParticipants=props(O.get('participants')),newParticipants=props(C.get('participants'));assert.equal(oldParticipants.size,row.mode==='core-only'?0:1);assert.deepEqual([...oldParticipants.keys()],[...newParticipants.keys()]);
    if(row.mode!=='core-only')for(const [key,p]of oldParticipants){const next=newParticipants.get(key),prev=directoryEntries(props(p).get('records')),following=directoryEntries(props(next).get('records'));assert.equal(prev.size,row.size);assert.equal(following.size,row.size);for(let i=0;i<row.size;i++){const id=`item:${String(i).padStart(5,'0')}`;assert.ok(prev.has(id)&&following.has(id));if(i===0)assert.notEqual(prev.get(id),following.get(id));else assert.equal(prev.get(id),following.get(id));optionalRecords++;}}
    independent.graphs.push({action:recorded.action,dumpSha256:sha(bytes),snapshotNodes:count,cohortRows:rows.length,oldDataSelfSizeBytes:expected.oldData.selfSizeBytes,candidateDataSelfSizeBytes:expected.candidateData.selfSizeBytes,oldOnlySelfSizeBytes:expected.oldOnly.selfSizeBytes,candidateOnlySelfSizeBytes:expected.candidateOnly.selfSizeBytes,sharedDataSelfSizeBytes:expected.sharedData.selfSizeBytes,dataUnionSelfSizeBytes:expected.dataUnion.selfSizeBytes,sharedUntouchedCoreDocuments:sharedRecords,optionalRecordsChecked:optionalRecords,allCohortRowsMatch:true,allSummaryGroupsMatch:true});
    console.log(JSON.stringify({mode:row.mode,size:row.size,action:recorded.action,cohortRows:rows.length,independent:'Pass'}));
  }
  result.observations.push(independent);
}
result.outcome='Pass';result.finishedAt=new Date().toISOString();await writeFile('/tmp/raveldex-mutation-independent-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({outcome:result.outcome,graphs:result.observations.reduce((sum,x)=>sum+x.graphs.length,0),cohortRows:result.observations.flatMap(x=>x.graphs).reduce((sum,x)=>sum+x.cohortRows,0)}));
