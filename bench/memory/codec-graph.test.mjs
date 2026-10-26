import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeCodecGraph, CODEC_ROLES } from './codec-graph.mjs';

function literal(stage='encode-prejoin') {
  const d=[],add=(name,size,links=[],type='object')=>{const i=d.length;d.push({name,size,links,type});return i;};
  const global=add('global',10),marker=add('marker',10),data=add('data',10),wrappers=add('wrappers',10),root=add('root',10);
  const term=add('term',100,[],'string'),original=add('original',140,[],'string');
  const documents=add('documents',40,[['term',term]]),fields=add('fields',50,[['term',term]]),participants=add('participants',60,[['original',original]]),counts=add('counts',10),configuration=add('configuration',10);
  d[root].links=[['documents',documents],['fields',fields],['participants',participants],['counts',counts],['configuration',configuration]];
  const payload=add('payload',20,[['documents',documents],['fields',fields],['participants',participants],['counts',counts]]),header=add('header',30,[['configuration',configuration]]),value=add('value',25,[['payload',payload],['header',header]]);
  const quoted=add('quoted',120,[['first',original,'internal'],['second',term,'internal']],'concatenated string');
  const backing=add('backing',80,[['0',quoted,'internal']],'array'),chunks=add('chunks',35,[['elements',backing,'internal']]);
  const encoded=add('encoded',1000,[],'string'),bodyText=add('body slice',40,[['parent',encoded,'internal']],'sliced string');
  const decodedPayload=add('decoded payload',20),body=add('decoded body',30,[['payload',decodedPayload]]),envelope=add('envelope',35,[['body',body]]),decoded=add('decoded wrapper',20,[['value',envelope],['bodyText',bodyText]]);
  const nd=add('nextDocs',70,[['term',term]]),nf=add('nextFields',80,[['term',term]]),records=add('records',90,[['original',original]]),side=add('side',20,[['records',records]]),np=add('preparedParticipants',30,[['source',side]]),nc=add('nextCounts',10);
  const prepared=add('prepared',20,[['documents',nd],['fields',nf],['counts',nc],['participants',np],['configuration',configuration]]),nextSide=add('rebased side',20,[['records',records]]),nextParts=add('rebased participants',30,[['source',nextSide]]),next=add('next',20,[['documents',nd],['fields',nf],['counts',nc],['participants',nextParts],['configuration',configuration]]);
  d[decodedPayload].links=[['documents',nd],['fields',nf],['counts',nc],['participants',np]];
  const excluded=add('excluded',9999,[],'string');d[documents].links.push(['__proto__',excluded],['map',excluded,'internal'],['weak',excluded,'weak'],[0,excluded,'hidden']);
  const seeds={oldDocuments:documents,oldFields:fields,oldParticipants:participants,value,chunks,payload,bodyText,envelopeText:encoded,encodedText:encoded,decodedValue:envelope,candidateDocuments:nd,candidateFields:nf,candidateParticipants:nextParts};
  d[global].links=[['__raveldexCodecMarkers',marker]];d[marker].links=[['data',data],['wrappers',wrappers]];d[data].links=CODEC_ROLES[stage].map(k=>[k,seeds[k]]);
  d[wrappers].links=[['root',root],...stage.startsWith('decode')||stage==='restore-precommit'?[['decoded',decoded]]:[],...stage==='restore-precommit'?[['prepared',prepared],['candidate',next]]:[]];
  const strings=[],intern=v=>{if(!strings.includes(v))strings.push(v);return strings.indexOf(v);},types=['object','string','array','concatenated string','sliced string'],edgeTypes=['property','internal','weak','hidden'];
  const nodes=[],edges=[];
  for(const [i,n]of d.entries()){nodes.push(types.indexOf(n.type),intern(n.name),100+i,n.size,n.links.length);for(const [name,target,kind='property']of n.links)edges.push(edgeTypes.indexOf(kind),kind==='hidden'?name:intern(name),target*5);}
  return{snapshot:{snapshot:{meta:{node_fields:['type','name','id','self_size','edge_count'],node_types:[types,'string','number','number','number'],edge_fields:['type','name_or_index','to_node'],edge_types:[edgeTypes,'string_or_number','node']}},nodes,edges,strings},ids:{term:100+term,excluded:100+excluded,nextDocs:100+nd},d};
}
test('prejoin hand sums deduplicate payload/state, frozen backing and string parents without counting excluded edges',()=>{
  const {snapshot,ids}=literal(),{summary:s,rows}=analyzeCodecGraph(snapshot,'encode-prejoin');
  // State:40+50+60+100+140=390. Value-only:25+20+30+10+10=95.
  // Chunks-only:35+80+120=235; string parents140+100 already in state.
  assert.equal(s.state.selfSizeBytes,390);assert.equal(s.codecOnly.selfSizeBytes,330);assert.equal(s.shared.selfSizeBytes,390);assert.equal(s.union.selfSizeBytes,720);
  assert.equal(s.roles.chunks.selfSizeBytes,475);assert.ok(!rows.some(r=>r[0]===ids.excluded));assert.equal(s.nativeAliases.payloadReusesCommittedData,true);
});
test('primitive sliced and complete strings share backing within a snapshot; lengths are not heap or copy counts',()=>{
  const {snapshot}=literal('encode-envelope'),{summary:s}=analyzeCodecGraph(snapshot,'encode-envelope');
  assert.equal(s.roles.bodyText.selfSizeBytes,1040);assert.equal(s.roles.envelopeText.selfSizeBytes,1000);
  assert.equal(s.stringRepresentations.bodyText.root.type,'sliced string');assert.equal(s.stringRepresentations.bodyText.directBacking[0].id,s.stringRepresentations.envelopeText.root.id);
  assert.equal(s.stringNodes.selfSizeBytes,1280); //140+100 original nodes +40 slice +1000 whole.
});
test('nine-role receiving masks preserve bit256 and actual decoded/candidate reuse',()=>{
  const {snapshot,ids}=literal('restore-precommit'),g=analyzeCodecGraph(snapshot,'restore-precommit');
  const r=g.rows.find(r=>r[0]===ids.nextDocs);assert.ok(r[3]&256);assert.ok(r[3]&8);assert.equal(g.summary.nativeAliases.decodedMandatoryDataReused,true);
  assert.equal(g.summary.nativeAliases.participantRecordDirectoriesReused,true);assert.equal(g.summary.roleRoots.decodedValue.type,'object');
});
test('wrong stage/aliases, duplicate or absent marker and malformed/unsafe graphs refuse attribution',()=>{
  const a=literal();assert.throws(()=>analyzeCodecGraph(a.snapshot,'unknown'));assert.throws(()=>analyzeCodecGraph(a.snapshot,'decode-envelope'));
  for(const mutate of [s=>s.nodes.pop(),s=>s.nodes[7]=s.nodes[2],s=>s.edges[2]=999999,s=>s.nodes[4]+=2**32,
    s=>s.strings[s.strings.indexOf('__raveldexCodecMarkers')]='absent',s=>s.snapshot.meta.node_types[3]='string',
    s=>{for(let i=3;i<s.nodes.length;i+=5)s.nodes[i]=Number.MAX_SAFE_INTEGER;},
    s=>{s.nodes[4]++;s.edges.splice(3,0,...s.edges.slice(0,3));}]){const {snapshot}=literal();mutate(snapshot);assert.throws(()=>analyzeCodecGraph(snapshot,'encode-prejoin'));}
  const wrong=literal('restore-precommit');const key=wrong.snapshot.strings.indexOf('configuration');const at=wrong.snapshot.edges.findIndex((v,i)=>i%3===1&&v===key);wrong.snapshot.edges[at+1]=0;assert.throws(()=>analyzeCodecGraph(wrong.snapshot,'restore-precommit'));
});
