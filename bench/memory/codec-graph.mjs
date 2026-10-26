import assert from 'node:assert/strict';

const OLD = ['oldDocuments','oldFields','oldParticipants'];
export const CODEC_ROLES = Object.freeze({
  'encode-prejoin': [...OLD,'value','chunks'],
  'encode-envelope': [...OLD,'payload','bodyText','envelopeText'],
  'decode-envelope': [...OLD,'encodedText','bodyText','decodedValue'],
  'restore-precommit': [...OLD,'candidateDocuments','candidateFields','candidateParticipants','encodedText','bodyText','decodedValue'],
});
const STRING_TYPES = ['string','concatenated string','sliced string'];

// Same-snapshot selected data only. String lengths and IDs are never interpreted
// as physical copy counts, cross-snapshot identity or allocation peak bytes.
export function analyzeCodecGraph(snapshot, stage) {
  const roles=CODEC_ROLES[stage];assert.ok(roles,'Unknown codec stage');
  const meta=snapshot?.snapshot?.meta,{nodes,edges,strings}=snapshot??{};
  assert.ok(meta&&Array.isArray(nodes)&&Array.isArray(edges)&&Array.isArray(strings));
  const nf=meta.node_fields,ef=meta.edge_fields;assert.ok(Array.isArray(nf)&&Array.isArray(ef));assert.equal(new Set(nf).size,nf.length);assert.equal(new Set(ef).size,ef.length);
  const field=(fields,name)=>{const at=fields.indexOf(name);assert.ok(at>=0,`Missing ${name}`);return at;};
  const nt=field(nf,'type'),nn=field(nf,'name'),ni=field(nf,'id'),ns=field(nf,'self_size'),nc=field(nf,'edge_count'),et=field(ef,'type'),en=field(ef,'name_or_index'),to=field(ef,'to_node'),nw=nf.length,ew=ef.length;
  const types=meta.node_types?.[nt],edgeTypes=meta.edge_types?.[et];assert.ok(Array.isArray(types)&&Array.isArray(edgeTypes));
  for(const at of [ni,ns,nc])assert.equal(meta.node_types[at],'number');assert.equal(meta.node_types[nn],'string');assert.equal(meta.edge_types[en],'string_or_number');assert.equal(meta.edge_types[to],'node');
  assert.equal(nodes.length%nw,0);assert.equal(edges.length%ew,0);
  const count=nodes.length/nw,offsets=new Float64Array(count+1),ids=new Set(),integer=v=>Number.isSafeInteger(v)&&v>=0;
  for(let i=0;i<count;i++){
    const b=i*nw,id=nodes[b+ni],n=nodes[b+nc];assert.ok(integer(id)&&!ids.has(id)&&integer(nodes[b+ns])&&integer(n)&&typeof types[nodes[b+nt]]==='string'&&typeof strings[nodes[b+nn]]==='string','Malformed node');ids.add(id);
    offsets[i+1]=offsets[i]+n*ew;assert.ok(Number.isSafeInteger(offsets[i+1])&&offsets[i+1]<=edges.length,'Edge-count overflow');
  }
  assert.equal(offsets[count],edges.length);
  const type=i=>types[nodes[i*nw+nt]],size=i=>nodes[i*nw+ns],id=i=>nodes[i*nw+ni];
  function entries(i){const rows=[];for(let at=offsets[i];at<offsets[i+1];at+=ew){const kind=edgeTypes[edges[at+et]],target=edges[at+to]/nw,raw=edges[at+en],name=['element','hidden'].includes(kind)?raw:strings[raw];
    assert.ok(typeof kind==='string'&&Number.isInteger(target)&&target>=0&&target<count&&(typeof name==='string'||integer(name)),'Malformed edge');rows.push({kind,name,target});}return rows;}
  let marker;
  for(let i=0;i<count;i++)for(const e of entries(i))if(e.kind==='property'&&e.name==='__raveldexCodecMarkers'){assert.equal(marker,undefined,'Ambiguous marker');marker=e.target;}
  assert.ok(marker!==undefined,'Missing codec marker');
  const props=i=>{const p=new Map();for(const e of entries(i))if(e.kind==='property'&&e.name!=='__proto__'){assert.ok(!p.has(e.name),'Duplicate property');p.set(e.name,e.target);}return p;};
  const get=(p,key)=>{assert.ok(p.has(key),`Missing ${key}`);return p.get(key);};
  const m=props(marker),data=props(get(m,'data')),wrappers=props(get(m,'wrappers')),root=get(wrappers,'root'),rp=props(root);
  assert.deepEqual([...data.keys()].sort(),[...roles].sort(),'Exact stage roles required');
  const oldFields=['documents','fields','participants'];for(let i=0;i<3;i++)assert.equal(get(data,OLD[i]),get(rp,oldFields[i]));
  const info=i=>({id:id(i),type:type(i),selfSizeBytes:size(i)});
  let nativeAliases;
  if(stage==='encode-prejoin'||stage==='encode-envelope'){
    const payload=stage==='encode-prejoin'?get(props(get(data,'value')),'payload'):get(data,'payload'),p=props(payload);
    for(const key of ['documents','fields','participants','counts'])assert.equal(get(p,key),get(rp,key));nativeAliases={payloadReusesCommittedData:true};
    if(stage==='encode-prejoin')assert.equal(type(get(data,'chunks')),'object','Actual chunk array is a JS Array object with internal backing');
  } else {
    const decoded=get(data,'decodedValue'),body=get(props(decoded),'body'),payload=get(props(body),'payload'),pp=props(payload);
    assert.equal(get(props(get(wrappers,'decoded')),'value'),decoded);
    assert.equal(get(props(get(wrappers,'decoded')),'bodyText'),get(data,'bodyText'));
    if(stage==='restore-precommit'){
      const prepared=props(get(wrappers,'prepared')),candidate=props(get(wrappers,'candidate'));
      for(const key of ['documents','fields','counts','participants'])assert.equal(get(prepared,key),get(pp,key));
      for(const key of ['documents','fields','counts'])assert.equal(get(candidate,key),get(prepared,key));
      assert.equal(get(prepared,'configuration'),get(rp,'configuration'));assert.notEqual(get(candidate,'participants'),get(prepared,'participants'));
      for(let i=0;i<3;i++)assert.equal(get(data,['candidateDocuments','candidateFields','candidateParticipants'][i]),get(candidate,oldFields[i]));
      const a=props(get(prepared,'participants')),b=props(get(candidate,'participants'));assert.deepEqual([...a.keys()].sort(),[...b.keys()].sort());
      for(const [key,v]of a)assert.equal(get(props(v),'records'),get(props(get(b,key)),'records'));
      nativeAliases={decodedMandatoryDataReused:true,participantRecordDirectoriesReused:true};
    }
  }
  const permitted=(i,e)=>e.kind==='property'?e.name!=='__proto__':e.kind==='element'||e.kind==='internal'&&(['properties','elements'].includes(e.name)||type(i)==='array'&&/^(0|[1-9][0-9]*)$/.test(e.name)||STRING_TYPES.includes(type(i))&&['first','second','parent'].includes(e.name));
  const membership=new Uint16Array(count),seeds=roles.map(k=>get(data,k));
  for(const [bit,seed]of seeds.entries()){const seen=new Set(),todo=[seed];while(todo.length){const i=todo.pop();if(seen.has(i))continue;seen.add(i);membership[i]|=1<<bit;for(const e of entries(i))if(permitted(i,e))todo.push(e.target);}}
  const rows=[];for(let i=0;i<count;i++)if(membership[i])rows.push([id(i),type(i),size(i),membership[i]]);rows.sort((a,b)=>a[0]-b[0]);
  const aggregate=predicate=>{const byType={};let n=0,bytes=0;for(const r of rows)if(predicate(r)){n++;bytes+=r[2];assert.ok(integer(bytes),'Unsafe sum');const t=byType[r[1]]??={nodes:0,selfSizeBytes:0};t.nodes++;t.selfSizeBytes+=r[2];}return{nodes:n,selfSizeBytes:bytes,byType};};
  const stateMask=stage==='restore-precommit'?63:7,codecMask=(1<<roles.length)-1^stateMask;
  const stringRepresentations={};
  for(const [i,label]of roles.entries())if(label.endsWith('Text')){const seed=seeds[i];assert.ok(STRING_TYPES.includes(type(seed)),'Primitive string role expected');stringRepresentations[label]={root:info(seed),directBacking:entries(seed).filter(e=>e.kind==='internal'&&['first','second','parent'].includes(e.name)).map(e=>({edge:e.name,...info(e.target)}))};}
  const summary={stage,meaning:'One-snapshot selected-edge node self-sizes, including VM representation overhead. Codec-only means absent from selected state graph, never allocation, physical copies, exact retention, freed bytes or peak.',snapshotNodes:count,snapshotEdges:edges.length/ew,
    roleRoots:Object.fromEntries(roles.map((k,i)=>[k,info(seeds[i])])),wrappers:Object.fromEntries([...wrappers].map(([k,i])=>[k,info(i)])),nativeAliases,stringRepresentations,
    roles:Object.fromEntries(roles.map((k,i)=>[k,aggregate(r=>r[3]&1<<i)])),
    state:aggregate(r=>r[3]&stateMask),codec:aggregate(r=>r[3]&codecMask),stateOnly:aggregate(r=>(r[3]&stateMask)&&!(r[3]&codecMask)),codecOnly:aggregate(r=>(r[3]&codecMask)&&!(r[3]&stateMask)),shared:aggregate(r=>(r[3]&stateMask)&&(r[3]&codecMask)),union:aggregate(()=>true),stringNodes:aggregate(r=>STRING_TYPES.includes(r[1]))};
  assert.equal(summary.stateOnly.selfSizeBytes+summary.codecOnly.selfSizeBytes+summary.shared.selfSizeBytes,summary.union.selfSizeBytes);
  return{summary,roles,columns:['singleSnapshotNodeId','type','selfSizeBytes','roleMask'],rows};
}
