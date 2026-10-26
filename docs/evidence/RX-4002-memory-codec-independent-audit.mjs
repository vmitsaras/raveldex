import assert from 'node:assert/strict';
import {readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';import{gunzipSync}from'node:zlib';import{join}from'node:path';
const reportPath=process.argv[2]??'docs/evidence/RX-4002-memory-codec.json',bytes=await readFile(reportPath),report=JSON.parse(bytes),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(report.outcome,'ObservedWithLimits');assert.equal(report.observations.length,4);
const audit={kind:'rx4002-native-codec-independent-audit-v1',report:{path:reportPath,bytes:bytes.length,sha256:sha(bytes)},method:'Independent parser/DFS, no production codec graph helper imports; actual same-dump stage roots, aliases, memberships, byte/type groups, string representations, public operation/WeakRef facts and source preservation. No workload, GC, build or browser rerun.',inputBindings:[],observations:[],outcome:'Running'};
for(const b of [...report.productionFiles,...report.sourceBindings,...report.preservedEvidence]){assert.equal(sha(await readFile(b.path)),b.sha256,b.path);if(b.staged)assert.equal(sha(await readFile(b.staged)),b.sha256);audit.inputBindings.push({path:b.path,sha256:b.sha256});}
for(const b of report.productionFiles)assert.equal(sha(await readFile(join(report.consumer,'node_modules/@vmitsaras/raveldex',b.path))),b.sha256);
assert.equal(sha(await readFile(join(report.consumer,'vmitsaras-raveldex-0.0.0.tgz'))),report.tarballSha256);assert.equal(sha(await readFile(join(report.consumer,'node_modules/@vmitsaras/raveldex/package.json'))),report.packageMetadataSha256);
const rolesFor={
'encode-prejoin':['oldDocuments','oldFields','oldParticipants','value','chunks'],
'encode-envelope':['oldDocuments','oldFields','oldParticipants','payload','bodyText','envelopeText'],
'decode-envelope':['oldDocuments','oldFields','oldParticipants','encodedText','bodyText','decodedValue'],
'restore-precommit':['oldDocuments','oldFields','oldParticipants','candidateDocuments','candidateFields','candidateParticipants','encodedText','bodyText','decodedValue']};
const stringTypes=new Set(['string','concatenated string','sliced string']);
for(const record of report.observations){
 assert.equal(record.outcome,'Observed');assert.equal(record.execution.childExitCode,0);assert.equal(record.execution.childSignal,null);assert.equal(record.execution.childTimedOut,false);
 const raw=await readFile(record.childReport.path);assert.equal(sha(raw),record.childReport.sha256);assert.deepEqual(JSON.parse(raw),record.child);
 const child=record.child;assert.equal(child.pid,record.execution.childPid);assert.equal(child.outcome,'Observed');assert.equal(child.cleanup.allListedObjectsCollected,true);assert.equal(child.cleanup.observerExited,true);assert.equal(child.cleanup.markersDeleted,true);
 const stages=record.role==='producer'?['encode-prejoin','encode-envelope']:['decode-envelope','restore-precommit'];
 const captures=child.protocol.filter(x=>x.type==='capture');assert.deepEqual(captures.map(x=>x.stage),stages);assert.equal(child.protocol.filter(x=>x.type==='failure').length,0);assert.deepEqual(child.protocol.find(x=>x.type==='closed'),{type:'closed',captures:2,failed:false});
 for(const c of captures){assert.equal(c.before.oldIsCommitted,true);assert.equal(c.after.oldStillCommitted,true);assert.equal(c.dump.bytes,record.graphs.find(g=>g.stage===c.stage).dump.bytes);}
 assert.equal(child.operation.outcome,'Pass');
 const revision=Math.ceil(record.size/256);
 if(record.role==='producer')assert.equal(child.operation.kind,'exportNative');else{assert.equal(child.operation.kind,'restore');assert.deepEqual([child.operation.result.format,child.operation.result.reindexed,child.operation.result.originRevision,child.operation.result.revision],['raveldex-native',false,revision,2]);}
 const expectedRows=record.role==='producer'?[[record.size,revision],[Math.floor((record.size-8)/37)+1,revision],[Math.ceil(record.size/3),revision],[0,revision]]:[[1,1],[1,1]];
 const completeRows=record.role==='producer'?[...expectedRows,...expectedRows]:[...expectedRows,[record.size,2],[Math.floor((record.size-8)/37)+1,2],[Math.ceil(record.size/3),2],[0,2]];
 assert.equal(child.verifications.length,completeRows.length);for(const [i,[total,rev]]of completeRows.entries()){assert.equal(child.verifications[i].total,total);assert.equal(child.verifications[i].returned,Math.min(20,total));assert.equal(child.verifications[i].revision,rev);assert.equal(child.verifications[i].literalEligibility,true);}
 const initial=child.witnessStages.find(x=>x.stage==='after-operation').readings,final=child.witnessStages.find(x=>x.stage==='disposed').readings;
 for(const w of initial){if(w.stage==='control')assert.equal(w.collected,w.key==='negative');else{const retained=record.role==='producer'?w.key.startsWith('data.old')||w.key==='wrapper.root':w.key.startsWith('data.candidate')||w.key==='wrapper.candidate';assert.equal(w.collected,!retained);}}
 for(const w of final)if(w.stage!=='control')assert.equal(w.collected,true);
 const encodingBytes=await readFile(record.encoding.path);assert.equal(sha(encodingBytes),record.encoding.sha256);assert.equal(encodingBytes.length,record.encoding.bytes);
 const producer=report.observations.find(x=>x.size===record.size&&x.role==='producer');assert.equal(record.encoding.sha256,producer.child.output.sha256);if(record.role==='receiver')assert.deepEqual(child.input,producer.child.output);
 const out={size:record.size,role:record.role,publicFactsVerified:true,weakRefsVerified:true,inputSha256:record.encoding.sha256,graphs:[]};
 for(const recorded of record.graphs){
  const raw=await readFile(recorded.dump.path);assert.equal(sha(raw),recorded.dump.sha256);assert.equal(raw.length,recorded.dump.bytes);
  const s=JSON.parse(raw),N=s.nodes,E=s.edges,S=s.strings,nfields=s.snapshot.meta.node_fields,efields=s.snapshot.meta.edge_fields,nwidth=nfields.length,ewidth=efields.length;
  const nf=Object.fromEntries(nfields.map((v,i)=>[v,i])),ef=Object.fromEntries(efields.map((v,i)=>[v,i])),NT=s.snapshot.meta.node_types[nf.type],ET=s.snapshot.meta.edge_types[ef.type],count=N.length/nwidth,offsets=new Float64Array(count+1);
  for(let i=0;i<count;i++)offsets[i+1]=offsets[i]+N[i*nwidth+nf.edge_count]*ewidth;assert.equal(offsets[count],E.length);
  const typ=i=>NT[N[i*nwidth+nf.type]],id=i=>N[i*nwidth+nf.id],size=i=>N[i*nwidth+nf.self_size],name=i=>S[N[i*nwidth+nf.name]],info=i=>({id:id(i),type:typ(i),selfSizeBytes:size(i)});
  const links=i=>{let result=[];for(let p=offsets[i];p<offsets[i+1];p+=ewidth){const t=ET[E[p+ef.type]],v=E[p+ef.name_or_index];result.push({t,n:t==='element'||t==='hidden'?v:S[v],to:E[p+ef.to_node]/nwidth});}return result;};
  const properties=i=>new Map(links(i).filter(x=>x.t==='property'&&x.n!=='__proto__').map(x=>[x.n,x.to]));
  let markers=[];for(let i=0;i<count;i++)for(const e of links(i))if(e.t==='property'&&e.n==='__raveldexCodecMarkers')markers.push(e.to);assert.equal(markers.length,1);
  const marker=properties(markers[0]),data=properties(marker.get('data')),wrappers=properties(marker.get('wrappers')),root=properties(wrappers.get('root')),roles=rolesFor[recorded.stage];assert.deepEqual([...data.keys()].sort(),[...roles].sort());
  for(const [label,key]of[['oldDocuments','documents'],['oldFields','fields'],['oldParticipants','participants']])assert.equal(data.get(label),root.get(key));
  let aliases;
  if(recorded.stage.startsWith('encode')){const p=properties(recorded.stage==='encode-prejoin'?properties(data.get('value')).get('payload'):data.get('payload'));for(const key of['documents','fields','counts','participants'])assert.equal(p.get(key),root.get(key));aliases={payloadReusesCommittedData:true};}
  else{
   const decoded=properties(data.get('decodedValue')),body=properties(decoded.get('body')),payload=properties(body.get('payload')),wrapper=properties(wrappers.get('decoded'));assert.equal(wrapper.get('value'),data.get('decodedValue'));assert.equal(wrapper.get('bodyText'),data.get('bodyText'));
   if(recorded.stage==='restore-precommit'){const prepared=properties(wrappers.get('prepared')),candidate=properties(wrappers.get('candidate'));for(const key of['documents','fields','counts','participants'])assert.equal(prepared.get(key),payload.get(key));for(const key of['documents','fields','counts'])assert.equal(prepared.get(key),candidate.get(key));assert.equal(prepared.get('configuration'),root.get('configuration'));assert.notEqual(prepared.get('participants'),candidate.get('participants'));
    const a=properties(prepared.get('participants')),b=properties(candidate.get('participants'));assert.deepEqual([...a.keys()].sort(),[...b.keys()].sort());for(const[k,v]of a)assert.equal(properties(v).get('records'),properties(b.get(k)).get('records'));
    for(const[label,key]of[['candidateDocuments','documents'],['candidateFields','fields'],['candidateParticipants','participants']])assert.equal(data.get(label),candidate.get(key));
    aliases={decodedMandatoryDataReused:true,participantRecordDirectoriesReused:true};}
  }
  assert.deepEqual(recorded.summary.nativeAliases,aliases);
  const permitted=(i,e)=>e.t==='property'?e.n!=='__proto__':e.t==='element'||e.t==='internal'&&(['elements','properties'].includes(e.n)||typ(i)==='array'&&/^(0|[1-9][0-9]*)$/.test(e.n)||stringTypes.has(typ(i))&&['first','second','parent'].includes(e.n));
  const masks=new Uint16Array(count);for(const[bit,label]of roles.entries()){const seen=new Set(),todo=[data.get(label)];while(todo.length){const i=todo.pop();if(seen.has(i))continue;seen.add(i);masks[i]|=1<<bit;for(const e of links(i))if(permitted(i,e))todo.push(e.to);}}
  const rows=[];for(let i=0;i<count;i++)if(masks[i])rows.push([id(i),typ(i),size(i),masks[i]]);rows.sort((a,b)=>a[0]-b[0]);
  const zipped=await readFile(recorded.cohort.path);assert.equal(zipped.length,recorded.cohort.bytes);assert.equal(sha(zipped),recorded.cohort.sha256);const expanded=gunzipSync(zipped);assert.equal(sha(expanded),recorded.cohort.decompressedSha256);assert.equal(expanded.length,recorded.cohort.decompressedBytes);const cohort=JSON.parse(expanded);assert.deepEqual(cohort.roles,roles);assert.deepEqual(cohort.rows,rows);
  const aggregate=p=>{let n=0,bytes=0,byType={};for(const r of rows)if(p(r)){n++;bytes+=r[2];const q=byType[r[1]]??={nodes:0,selfSizeBytes:0};q.nodes++;q.selfSizeBytes+=r[2];}return{nodes:n,selfSizeBytes:bytes,byType};};
  const stateBits=recorded.stage==='restore-precommit'?63:7,codecBits=((1<<roles.length)-1)^stateBits,groups={state:aggregate(r=>r[3]&stateBits),codec:aggregate(r=>r[3]&codecBits),stateOnly:aggregate(r=>(r[3]&stateBits)&&!(r[3]&codecBits)),codecOnly:aggregate(r=>(r[3]&codecBits)&&!(r[3]&stateBits)),shared:aggregate(r=>(r[3]&stateBits)&&(r[3]&codecBits)),union:aggregate(()=>true),stringNodes:aggregate(r=>stringTypes.has(r[1]))};
  for(const[k,v]of Object.entries(groups))assert.deepEqual(recorded.summary[k],v,k);
  for(const[bit,label]of roles.entries()){assert.deepEqual(recorded.summary.roles[label],aggregate(r=>r[3]&(1<<bit)));assert.deepEqual(recorded.summary.roleRoots[label],info(data.get(label)));}
  for(const[k,i]of wrappers)assert.deepEqual(recorded.summary.wrappers[k],info(i));
  const representations={};for(const label of roles.filter(x=>x.endsWith('Text'))){const i=data.get(label);representations[label]={root:info(i),directBacking:links(i).filter(e=>e.t==='internal'&&['first','second','parent'].includes(e.n)).map(e=>({edge:e.n,...info(e.to)}))};}
  assert.deepEqual(recorded.summary.stringRepresentations,representations);
  out.graphs.push({stage:recorded.stage,dumpSha256:sha(raw),snapshotNodes:count,cohortRows:rows.length,allCohortRowsMatch:true,allSummaryGroupsMatch:true,allLexicalAliasesMatch:true,stringRepresentations:representations,stateSelfSizeBytes:groups.state.selfSizeBytes,codecOnlySelfSizeBytes:groups.codecOnly.selfSizeBytes,sharedSelfSizeBytes:groups.shared.selfSizeBytes,unionSelfSizeBytes:groups.union.selfSizeBytes});
  console.log(JSON.stringify({size:record.size,stage:recorded.stage,rows:rows.length,audit:'Pass'}));
 }
 audit.observations.push(out);
}
audit.outcome='Pass';audit.finishedAt=new Date().toISOString();await writeFile('/tmp/raveldex-codec-independent-audit.json',JSON.stringify(audit,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({outcome:'Pass',graphs:audit.observations.flatMap(x=>x.graphs).length,cohortRows:audit.observations.flatMap(x=>x.graphs).reduce((sum,x)=>sum+x.cohortRows,0)}));
