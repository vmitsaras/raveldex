import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, version } from 'esbuild';
import { prepareConsumer, bundleConsumer, command, digest, checkStartup, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';
import { buildCorpus } from '../../examples/core-docs/corpus.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../oracle/phrases.mjs';

// Independent occurrence oracle: regex source matches retain explicit original
// coordinates. No production analyzer, compiler, evaluator or evidence import.
const terms = value => [...value.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)].map((m,position)=>({term:m[0].normalize('NFKC').toLowerCase(),start:m.index,end:m.index+m[0].length,position}));
function expectedRanges(record,schema,query){
 const fields=Object.keys(schema.text).sort();
 const tokens=new Map(fields.map(field=>[field,(typeof record.text[field]==='string'?[record.text[field]]:record.text[field]??[]).map((s,valueIndex)=>terms(s).map(t=>({...t,field,valueIndex})))]));
 const unique=values=>[...new Map(values.map(r=>[JSON.stringify([r.field,r.valueIndex,r.position]),r])).values()].sort((a,b)=>a.field<b.field?-1:a.field>b.field?1:a.valueIndex-b.valueIndex||a.position-b.position);
 function walk(q){
  const selected=q.fields??fields;
  if(q.kind==='all')return {matched:true,ranges:[]};
  if(q.kind==='none')return {matched:false,ranges:[]};
  if(q.kind==='eq'){const value=record.metadata?.[q.field];return {matched:(Array.isArray(value)?value:[value]).includes(q.value),ranges:[]};}
  if(q.kind==='not')return {matched:!walk(q.child).matched,ranges:[]};
  if(q.kind==='and'||q.kind==='or'){const children=q.children.map(walk),matched=q.kind==='and'?children.every(c=>c.matched):children.some(c=>c.matched);return {matched,ranges:matched?unique(children.filter(c=>c.matched).flatMap(c=>c.ranges)):[]};}
  if(q.kind==='text')return walk({kind:q.operator??'and',children:terms(q.text).map(t=>({kind:'group',fields:q.fields,variants:[{text:t.term,match:'exact'}]}))});
  if(q.kind==='group'){const variants=q.variants.map(v=>({term:terms(v.text)[0].term,match:v.match}));const ranges=unique(selected.flatMap(field=>(tokens.get(field)??[]).flat()).filter(t=>variants.some(v=>v.match==='prefix'?t.term.startsWith(v.term):t.term===v.term)));return {matched:ranges.length>0,ranges};}
  if(q.kind==='extension'&&q.capability==='phrases'){const wanted=terms(q.payload.text).map(t=>t.term),found=[];for(const field of q.payload.fields??fields)for(const list of tokens.get(field)??[])for(let i=0;i+wanted.length<=list.length;i++)if(wanted.every((term,j)=>list[i+j].term===term))found.push(...list.slice(i,i+wanted.length));return {matched:found.length>0,ranges:unique(found)};}
  throw Error('unsupported independent fixture');
 }
 const outcome=walk(query);return {eligibility:outcome.matched?'matched':'excluded',ranges:outcome.ranges};
}

const runner=`
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createRaveldex} from '@vmitsaras/raveldex';
import {createSourceProvider} from '@vmitsaras/raveldex/addons/phrases/source';
import {createPositionProvider} from '@vmitsaras/raveldex/addons/positions';
import {createPhrases} from '@vmitsaras/raveldex/addons/phrases/mixed';
import {createMatchEvidence} from '@vmitsaras/raveldex/addons/evidence';
import {createSnippetEvidence} from '@vmitsaras/raveldex/addons/snippets';
const scenarios=JSON.parse(await readFile('evidence-fixtures.json','utf8')),observations=[];
const tolerance=(a,b)=>assert.ok(Math.abs(a-b)<=Math.max(1e-12,Math.abs(b)*1e-12));
for(const s of scenarios)for(const strategy of ['source','offsets','mixed']){
 const names=Object.keys(s.schema.text),fields=Object.fromEntries(names.map((field,i)=>[field,strategy==='mixed'?(i%2?'offsets':'source'):strategy]));
 const phraseFields=Object.fromEntries(names.map(field=>[field,fields[field]==='offsets'?'positions':'source']));
 const engine=createRaveldex({schema:s.schema,addons:[createSourceProvider({fields:names}),createPositionProvider({fields:names,offsets:names}),createPhrases({fields:phraseFields}),createMatchEvidence({fields}),createSnippetEvidence({fields})]});
 await engine.addMany(s.records);
 for(const item of s.cases){
  const ordinary=await engine.search(item.query,item.page);
  assert.equal(ordinary.total,item.expected.total);assert.deepEqual(ordinary.hits.map(h=>h.id),item.expected.hits.map(h=>h.id));ordinary.hits.forEach((h,i)=>tolerance(h.score,item.expected.hits[i].score));
  for(const capability of ['match-evidence','snippets']){
   const result=await engine.search(item.query,{...item.page,extensions:{[capability]:{ids:s.ids,expectedRevision:1}}});
   const {extensions,...core}=result;assert.deepEqual(core,ordinary);
   const data=extensions[capability];assert.equal(data.revision,1);assert.equal(data.complete,true);assert.deepEqual(data.fields,[...names].sort());
   for(let i=0;i<data.documents.length;i++){
    const doc=data.documents[i],wanted=item.documents[i];assert.equal(doc.id,wanted.id);assert.equal(doc.eligibility,wanted.eligibility);assert.deepEqual(JSON.parse(JSON.stringify(doc.ranges)),wanted.ranges);
    if(capability==='snippets'){
     assert.ok(doc.snippets.length<=3);const record=s.records.find(r=>r.id===doc.id);
     let shown=0;
     for(const snippet of doc.snippets){
      const raw=record.text[snippet.field],source=(typeof raw==='string'?[raw]:raw)[snippet.valueIndex];
      const boundaries=new Set([0,source.length,...[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(source)].map(p=>p.index)]);
      assert.ok(boundaries.has(snippet.start)&&boundaries.has(snippet.end));assert.equal(snippet.text,source.slice(snippet.start,snippet.end));assert.ok(snippet.text.length<=240);assert.ok(snippet.highlights.length<=32);
      assert.equal(snippet.omittedBefore,snippet.start>0);assert.equal(snippet.omittedAfter,snippet.end<source.length);
      for(const mark of snippet.highlights){assert.ok(mark.start>=0&&mark.start<mark.end&&mark.end<=snippet.text.length);assert.ok(boundaries.has(snippet.start+mark.start)&&boundaries.has(snippet.start+mark.end));}
     }
     for(const range of doc.ranges)if(doc.snippets.some(w=>w.field===range.field&&w.valueIndex===range.valueIndex&&w.highlights.some(m=>w.start+m.start<=range.start&&w.start+m.end>=range.end)))shown++;
     assert.equal(doc.snippetOmissions.unshownMatches,doc.ranges.length-shown);
    }
   }
   observations.push({scenario:s.name,strategy,capability,total:result.total,hits:result.hits,data});
  }
 }
 await engine.dispose();
}
console.log(JSON.stringify(observations));
`;

async function graph(directory,name,entry){
 await writeFile(join(directory,name+'.mjs'),entry);
 const settings={bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,treeShaking:true,legalComments:'none',charset:'ascii',sourcemap:false,metafile:true,write:false};
 const result=await build({...settings,absWorkingDir:directory,entryPoints:[name+'.mjs'],outfile:name+'-bundle.mjs',logLevel:'silent'}),bytes=result.outputFiles[0].contents,gzipSettings={level:9,windowBits:15,memLevel:8,strategy:0},compressed=gzipSync(bytes,gzipSettings);
 const inputs=await Promise.all(Object.entries(result.metafile.inputs).map(async([path,input])=>({path,bytes:input.bytes,imports:input.imports,sha256:digest(await readFile(join(directory,path)))})));
 assert.ok(inputs.every(i=>i.imports.every(j=>!j.external)));assert.deepEqual(Object.values(result.metafile.outputs)[0].imports,[]);
 await writeFile(join(directory,name+'-bundle.mjs'),bytes);
 return {entry,esbuild:version,settings,gzip:{...gzipSettings,mtime:0},minifiedBytes:bytes.length,gzipBytes:compressed.length,sha256:digest(bytes),gzipSha256:digest(compressed),inputs,metafile:result.metafile};
}

export async function measureEvidencePackage(){
 const corpus=buildCorpus(REPO_ROOT);
 const hand={name:'hand',schema:{text:{title:{},body:{boost:2}}},records:[{id:'a',text:{title:'red red red car',body:['', 'ＦＯＯ foo', 'e\u0301lan 𐐀x'] }},{id:'b',text:{title:'red car blue',body:'<script>alert(1)</script> red'}},{id:'c',text:{title:'blue',body:'red blue'}},{id:'empty',text:{title:'!!!'}},{id:'separate',text:{title:['red','red'],body:'car'}}]};
 hand.queries=[{kind:'text',text:'red car'},{kind:'group',variants:[{text:'re',match:'prefix'},{text:'car',match:'exact',weight:0.5}]},{kind:'extension',capability:'phrases',version:1,payload:{text:'red red',fields:['title']}},{kind:'or',children:[{kind:'and',children:[{kind:'text',text:'red'},{kind:'text',text:'missing'}]},{kind:'text',text:'car'}]},{kind:'not',child:{kind:'text',text:'red'}},{kind:'text',text:'foo',fields:['body']},{kind:'text',text:'élan',fields:['body']}];
 const docs={name:'real-docs',schema:corpus.schema,records:corpus.records,queries:[{kind:'text',text:'native'},{kind:'extension',capability:'phrases',version:1,payload:{text:'commit point',fields:['body']}},{kind:'and',children:[{kind:'text',text:'revision'},{kind:'eq',field:'category',value:'spec'}]},{kind:'text',text:'unfindablefixtureword'}]};
 const pages=[{limit:0},{limit:2},{offset:1,limit:3}];
 const scenarios=[hand,docs].map(s=>{
  const reference=scanPhraseSourceCorpus(s.records,s.schema),ids=[s.records[0].id,s.records[1].id,s.records.at(-1).id,'absent-range-record'];
  return {...s,ids,cases:s.queries.flatMap(query=>pages.map(page=>({query,page,expected:sourcePhraseQueryResult(reference,query.kind==='extension'?{kind:'phrase',...query.payload}:query,page),documents:ids.map(id=>{const record=s.records.find(r=>r.id===id);return {id,...(record?expectedRanges(record,s.schema,query):{eligibility:'absent',ranges:[]})};})}))) };
 });
 const consumer=await prepareConsumer(corpus,[]),{directory}=consumer;
 try{
  await writeFile(join(directory,'evidence-fixtures.json'),JSON.stringify(scenarios));await writeFile(join(directory,'evidence-run.mjs'),runner);
  const packed=JSON.parse((await command(process.execPath,['evidence-run.mjs'],directory)).stdout);
  const core=await bundleConsumer(directory),evidence=await graph(directory,'evidence',"export {createMatchEvidence} from '@vmitsaras/raveldex/addons/evidence';\n"),snippets=await graph(directory,'snippets',"export {createSnippetEvidence} from '@vmitsaras/raveldex/addons/snippets';\n");
  const entry="export {createRaveldex} from '@vmitsaras/raveldex';export {createMatchEvidence} from '@vmitsaras/raveldex/addons/evidence';export {createSnippetEvidence} from '@vmitsaras/raveldex/addons/snippets';export {createSourceProvider} from '@vmitsaras/raveldex/addons/phrases/source';export {createPositionProvider} from '@vmitsaras/raveldex/addons/positions';export {createPhrases} from '@vmitsaras/raveldex/addons/phrases/mixed';\n";
  const combined=await graph(directory,'combined',entry);let bundledRunner=runner;
  for(const specifier of ['@vmitsaras/raveldex','@vmitsaras/raveldex/addons/phrases/source','@vmitsaras/raveldex/addons/positions','@vmitsaras/raveldex/addons/phrases/mixed','@vmitsaras/raveldex/addons/evidence','@vmitsaras/raveldex/addons/snippets'])bundledRunner=bundledRunner.replace("from '"+specifier+"'","from './combined-bundle.mjs'");
  await writeFile(join(directory,'evidence-bundled-run.mjs'),bundledRunner);const bundled=JSON.parse((await command(process.execPath,['evidence-bundled-run.mjs'],directory)).stdout);assert.deepEqual(bundled,packed);
  const startup=[await checkStartup(directory,'@vmitsaras/raveldex'),await checkStartup(directory,'./core-bundle.mjs')];
  const guard=`const reads=[];for(const name of ['Intl','window','document','navigator','fetch','Worker','indexedDB','localStorage','performance','setTimeout','queueMicrotask'])Object.defineProperty(globalThis,name,{get(){reads.push(name);throw Error(name)}});const m=await import(process.argv[1]);console.log(JSON.stringify({reads,exports:Object.keys(m).sort()}));`;
  for(const [specifier,exports] of [['@vmitsaras/raveldex/addons/evidence',['createMatchEvidence']],['./evidence-bundle.mjs',['createMatchEvidence']],['@vmitsaras/raveldex/addons/snippets',['createSnippetEvidence']],['./snippets-bundle.mjs',['createSnippetEvidence']]]){const row=JSON.parse((await command(process.execPath,['--input-type=module','--eval',guard,specifier],directory)).stdout);assert.deepEqual(row.reads,[]);assert.deepEqual(row.exports,exports);startup.push({specifier,...row});}
  const privateDenial=[];for(const specifier of ['@vmitsaras/raveldex/addons/evidence/builder','@vmitsaras/raveldex/addons/snippets/project','@vmitsaras/raveldex/dist/addons/evidence/index.js','@vmitsaras/raveldex/dist/addons/snippets/index.js']){const r=JSON.parse((await command(process.execPath,['--input-type=module','--eval',`try{await import(process.argv[1]);console.log('{}')}catch(e){console.log(JSON.stringify({code:e.code}))}`,specifier],directory)).stdout);assert.equal(r.code,'ERR_PACKAGE_PATH_NOT_EXPORTED');privateDenial.push({specifier,...r});}
  const mapping=[];for(const file of consumer.package.files.filter(f=>f.path.endsWith('.js')||f.path.endsWith('.d.ts'))){const source=file.path.replace(/^dist\//,'src/').replace(/(?:\.d)?\.ts$|\.js$/,'.ts');mapping.push({path:file.path,sha256:digest(await readFile(join(consumer.installed,file.path))),source,sourceSha256:digest(await readFile(join(REPO_ROOT,source)))});}
  const moduleHashes=await Promise.all(core.inputs.map(async i=>({path:i.path,sha256:digest(await readFile(join(directory,i.path)))})));
  for(const g of [evidence,snippets])assert.ok(g.inputs.every(i=>!/core\/(execution|query|ranking|mutations)\/|phrases\/verifier|positions\/verifier|inspector\/(inspector|diagnostics)\.js/.test(i.path)));
  assert.ok(evidence.inputs.every(i=>!/snippets\//.test(i.path)));
  return {environment:{node:process.version,platform:process.platform,arch:process.arch},package:consumer.package,declarations:{status:'Pass',fixtureSha256:digest(await readFile(join(REPO_ROOT,'test/consumer/public-types.ts')))},corpus:{records:corpus.records.length,hash:corpus.hash,sourceFiles:corpus.sources},correctness:{status:'Pass',completeComparisonsPerRun:packed.length,selectedDocumentComparisonsPerRun:packed.reduce((n,p)=>n+p.data.documents.length,0),originalRangeComparisonsPerRun:packed.reduce((n,p)=>n+p.data.documents.reduce((m,d)=>m+d.ranges.length,0),0),snippetWindowsPerRun:packed.reduce((n,p)=>n+p.data.documents.reduce((m,d)=>m+(d.snippets?.length??0),0),0),bundledParity:'Pass'},core:{...core,moduleHashes},graphs:{evidence,snippets,combined},compiledFiles:{status:'Pass',mapping},startup,privateDenial};
 }finally{await rm(directory,{recursive:true,force:true});}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const report=await measureEvidencePackage();await writeFile(new URL('../../docs/evidence/RX-2005-package.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({correctness:report.correctness,core:{minified:report.core.minifiedBytes,gzip:report.core.gzipBytes,targetMet:report.core.targetMet},graphs:Object.fromEntries(Object.entries(report.graphs).map(([k,g])=>[k,{minified:g.minifiedBytes,gzip:g.gzipBytes}]))}));}
