import assert from 'node:assert/strict';

// Entire fixture is deliberately ASCII and literal-space tokenized. No native
// tokenizer/compiler/retrieval/scorer is imported by this independent oracle.
export const schema = { text: { title: { boost: 2 }, body: { boost: 0.75 } }, metadata: { flag: { type: 'boolean' }, cost: { type: 'number', multi: true, nullable: true }, tag: { type: 'string', multi: true, nullable: true } } };
const terms = ['alpha', 'alpine', 'beta', 'bravo', 'gamma', 'delta'];
let state = 0x5f61c093;
const next = n => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) % n; };
export const records = [
  { id: 'manual-a', text: { title: 'alpha alpha beta', body: ['gamma', 'alpha beta'] }, metadata: { flag: true, cost: [2, 12], tag: ['red', null] } },
  { id: 'manual-b', text: { title: 'beta', body: 'alpha alpha gamma' }, metadata: { flag: false, cost: [7], tag: ['blue'] } },
  { id: 'manual-c', text: { title: '', body: ['alpine', 'alpha', 'bravo'] }, metadata: { flag: true, cost: [], tag: [] } },
];
for (let i = 0; i < 38; i++) {
  const text = {};
  for (const field of ['title', 'body']) if (next(5)) {
    const values = Array.from({length: 1 + next(3)}, () => Array.from({length: next(6)}, () => terms[next(terms.length)]).join(' '));
    text[field] = next(2) ? values : values.join(' ');
  }
  const metadata = {};
  if (next(3)) metadata.flag = next(2) === 1;
  if (next(3)) metadata.cost = Array.from({length: next(4)}, () => next(4) ? next(17) - 3 : null);
  if (next(3)) metadata.tag = Array.from({length: next(4)}, () => ['red','blue',null,'', '__missing__'][next(5)]);
  records.push({ id: `row-${String(i).padStart(2,'0')}`, text, metadata });
}
const scalars = value => Array.isArray(value) ? value : [value];
const tokens = value => value.flatMap(s => s ? s.split(' ').filter(Boolean) : []);
const docs = records.map(record => ({...record, analyzed: Object.fromEntries(Object.entries(record.text).map(([field,value]) => {
  const tok = tokens(scalars(value)); const tf = Object.create(null); for (const term of tok) tf[term] = (tf[term]??0)+1;
  return [field,{length:tok.length,tf}];
}))}));
const statistics = Object.fromEntries(['title','body'].map(field => {
  const populated = docs.filter(doc => doc.analyzed[field]?.length); const df = Object.create(null);
  for (const doc of populated) for (const term of Object.keys(doc.analyzed[field].tf)) df[term] = (df[term]??0)+1;
  return [field,{N:populated.length,totalLength:populated.reduce((n,doc)=>n+doc.analyzed[field].length,0),df}];
}));
function group(query) {
  const fields = [...(query.fields ?? ['title','body'])].sort();
  const variants = new Map(query.variants.map(v => { const item = {term:v.text,match:v.match,weight:v.weight??1}; return [JSON.stringify([item.term,item.match,item.weight]),item]; }));
  return { fields, variants: [...variants].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>({...v,key})), key: JSON.stringify([fields,[...variants.keys()].sort()]) };
}
function compile(query) {
  if (query.kind==='group') return {kind:'group',group:group(query)};
  if (query.kind==='and'||query.kind==='or') return {...query,children:query.children.map(compile)};
  if (query.kind==='not') return {...query,child:compile(query.child)};
  if (query.kind==='extension') return {kind:'predicate',capability:query.capability,payload:query.payload};
  return query;
}
function prepareGroups(node,map=new Map()) {
  if(node.kind==='group') map.set(node.group.key,node.group);
  if(node.kind==='and'||node.kind==='or') for(const child of node.children) prepareGroups(child,map);
  if(node.kind==='not') prepareGroups(node.child,map);
  return map;
}
function matchedGroup(g,doc) { return g.fields.some(field=>Object.keys(doc.analyzed[field]?.tf??{}).some(term=>g.variants.some(v=>v.match==='exact'?term===v.term:term.startsWith(v.term)))); }
function qualify(node,doc,path='query',nodes=[]) {
  let matched=false; const groups=new Set();
  if(node.kind==='group') { matched=matchedGroup(node.group,doc); if(matched) groups.add(node.group.key); }
  else if(node.kind==='all') matched=true;
  else if(node.kind==='eq') matched=Object.hasOwn(doc.metadata??{},node.field)&&scalars(doc.metadata[node.field]).some(v=>v===node.value);
  else if(node.kind==='predicate') {
    const p=node.payload; const present=Object.hasOwn(doc.metadata??{},p.field); const values=present?scalars(doc.metadata[p.field]):[];
    matched=node.capability==='set-membership'?values.some(v=>p.values.includes(v)):values.some(v=>typeof v==='number'&&(!Object.hasOwn(p,'gte')||v>=p.gte)&&(!Object.hasOwn(p,'gt')||v>p.gt)&&(!Object.hasOwn(p,'lte')||v<=p.lte)&&(!Object.hasOwn(p,'lt')||v<p.lt));
  } else if(node.kind==='not') matched=!qualify(node.child,doc,`${path}.child`,nodes).matched;
  else if(node.kind==='and'||node.kind==='or') {
    const children=node.children.map((child,i)=>qualify(child,doc,`${path}.children[${i}]`,nodes));
    matched=node.kind==='and'?children.every(c=>c.matched):children.some(c=>c.matched);
    if(matched) for(const child of children) if(child.matched) for(const key of child.groups) groups.add(key);
  }
  const result={matched,groups:[...groups].sort()}; nodes.push({kind:'node',id:doc.id,path,node:node.kind,...result,...(node.kind==='eq'?{field:node.field}: {}),...(node.kind==='predicate'?{capability:node.capability}: {})}); return result;
}
function score(g,doc) {
  const fields=[]; let subtotal=0;
  for(const field of g.fields) {
    const candidates=new Map();
    for(const v of g.variants) for(const term of Object.keys(statistics[field].df)) if(v.match==='exact'?term===v.term:term.startsWith(v.term)) {
      const old=candidates.get(term); if(!old||v.weight>old.weight||v.weight===old.weight&&v.key<old.key) candidates.set(term,v);
    }
    let selected;
    for(const [term,v] of [...candidates].sort(([a],[b])=>a<b?-1:a>b?1:0)) {
      const tf=doc.analyzed[field]?.tf[term]; if(!tf) continue;
      const {N,totalLength,df}=statistics[field], length=doc.analyzed[field].length, boost=schema.text[field].boost;
      const avgLength=totalLength/N, idf=Math.log(1+(N-df[term]+0.5)/(df[term]+0.5)), normalizer=1.2*(0.25+0.75*length/avgLength), tfPart=(tf*2.2)/(tf+normalizer), base=boost*idf*tfPart, value=v.weight*base;
      if(!selected||value>selected.selected) selected={kind:'field',id:doc.id,group:g.key,field,term,variant:v.key,weight:v.weight,boost,tf,df:df[term],N,length,totalLength,avgLength,k1:1.2,b:0.75,idf,normalizer,tfPart,base,selected:value};
    }
    if(selected) { fields.push(selected); subtotal+=selected.selected; }
  }
  return {fields,subtotal};
}
export function expected(query,selectedIds) {
  const compiled=compile(query), groups=prepareGroups(compiled), selected=new Set(selectedIds), facts=[], hits=[];
  for(const doc of docs) {
    const nodes=[];const qualified=qualify(compiled,doc,'query',nodes); let final=0;
    if(selected.has(doc.id)) facts.push(...nodes);
    if(qualified.matched) {
      for(const key of qualified.groups) { const g=score(groups.get(key),doc); final+=g.subtotal; if(selected.has(doc.id)) facts.push(...g.fields,{kind:'group',id:doc.id,group:key,score:g.subtotal}); }
      hits.push({id:doc.id,score:final});
    }
    if(selected.has(doc.id)) facts.push({kind:'document',id:doc.id,exists:true,matched:qualified.matched,groups:qualified.groups,score:final});
  }
  for(const id of selectedIds) if(!docs.some(doc=>doc.id===id)) facts.push({kind:'document',id,exists:false,matched:false,groups:[],score:0});
  hits.sort((a,b)=>b.score-a.score||(a.id<b.id?-1:a.id>b.id?1:0));return {facts,hits,total:hits.length};
}
const g = (text,match='exact',fields) => ({kind:'group',variants:[{text,match}],...(fields?{fields}: {})});
const leafs=[g('alpha'),g('al','prefix',['title']),g('beta','exact',['body']),g('gamma'),g('absent'),{kind:'all'},{kind:'none'},{kind:'eq',field:'flag',value:true},{kind:'eq',field:'tag',value:null},{kind:'extension',capability:'numeric-range',version:1,payload:{field:'cost',gt:3,lt:10}},{kind:'extension',capability:'set-membership',version:1,payload:{field:'tag',values:['red',null]}}];
export const queries=[...leafs,{kind:'group',fields:['title','body'],variants:[{text:'al',match:'prefix',weight:0.5},{text:'alpha',match:'exact',weight:1},{text:'al',match:'prefix',weight:0.8},{text:'al',match:'prefix',weight:0.5}]}, {kind:'and',children:[g('alpha'),g('alpha'),{kind:'not',child:g('beta')}]}, {kind:'or',children:[{kind:'and',children:[g('alpha'),g('absent')]},g('beta','exact',['title'])]}];
for(let i=0;i<46;i++) queries.push({kind:next(2)?'and':'or',children:[leafs[next(leafs.length)],{kind:next(2)?'and':'or',children:[leafs[next(leafs.length)],{kind:'not',child:leafs[next(leafs.length)]}]}]});
export let numericalAssertions=0;
const close=(a,b)=>{assert.ok(Math.abs(a-b)<=Math.max(1e-12,Math.abs(b)*1e-12),`${a} != ${b}`);numericalAssertions++;};
export function compareFacts(actual,wanted) {
  const key=f=>JSON.stringify([f.id,f.kind,f.path??'',f.group??'',f.field??'']);
  assert.equal(actual.length,wanted.length); const map=new Map(wanted.map(f=>[key(f),f])); assert.equal(map.size,wanted.length);
  for(const got of actual) {const want=map.get(key(got)); assert.ok(want,key(got));map.delete(key(got));assert.deepEqual(Object.keys(got).sort(),Object.keys(want).sort());
    for(const name of Object.keys(want)) if(typeof want[name]==='number') close(got[name],want[name]); else assert.deepEqual(got[name],want[name]);
  }
  assert.equal(map.size,0);
}
export function compareHits(actual,wanted,offset,limit) {
  assert.equal(actual.total,wanted.total); const page=wanted.hits.slice(offset,offset+limit);assert.deepEqual(actual.hits.map(h=>h.id),page.map(h=>h.id));for(let i=0;i<page.length;i++) close(actual.hits[i].score,page[i].score);
}
export const selectedIds = [...records.map(record=>record.id), 'missing-selected'];
