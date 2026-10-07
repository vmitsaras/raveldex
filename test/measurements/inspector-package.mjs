import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, version } from 'esbuild';
import { prepareConsumer, bundleConsumer, command, digest, checkStartup, REPO_ROOT } from '../../scripts/lib/packed-consumer.mjs';
import { buildCorpus } from '../../examples/core-docs/corpus.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../oracle/phrases.mjs';

const runner = `
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRaveldex} from '@vmitsaras/raveldex';
import {createInspector,exportDiagnostics} from '@vmitsaras/raveldex/addons/inspector';
import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';
const scenarios=JSON.parse(await readFile('inspector-fixtures.json','utf8'));
const tolerance=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=Math.max(1e-12,Math.abs(expected)*1e-12));
const observations=[];
for(const scenario of scenarios){
 const fields=Object.keys(scenario.schema.text);
 const engine=createRaveldex({schema:scenario.schema,addons:[createSourceProvider({fields}),createSourcePhrases({fields}),createInspector({sourceFields:fields})]});
 await engine.addMany(scenario.records);
 for(const item of scenario.cases){
  const ordinary=await engine.search(item.query,item.page);
  const result=await engine.search(item.query,{...item.page,extensions:{inspector:{ids:scenario.ids,expectedRevision:1,sourceFields:fields}}});
  assert.deepEqual({...result,extensions:undefined},{...ordinary,extensions:undefined});
  assert.equal(result.total,item.expected.total);assert.deepEqual(result.hits.map(h=>h.id),item.expected.hits.map(h=>h.id));
  result.hits.forEach((h,i)=>tolerance(h.score,item.expected.hits[i].score));
  const data=result.extensions.inspector;
  for(const document of data.documents){
   const expected=item.all.hits.find(h=>h.id===document.id);
   const exists=scenario.records.some(r=>r.id===document.id);
   assert.equal(document.exists,exists);assert.equal(document.eligibility,expected?'matched':exists?'excluded':'absent');
   assert.equal(document.page.placement,expected?(result.hits.some(h=>h.id===document.id)?'returned':'outside-page'):exists?'excluded':'absent');
   assert.equal(document.score===null,!exists);if(exists)tolerance(document.score,expected?.score??0);
   if(exists){for(const field of fields){const raw=scenario.records.find(r=>r.id===document.id).text[field];const observed=document.source.fields[field];
    if(raw===undefined)assert.equal(observed.status,'absent');else assert.deepEqual(observed.values,typeof raw==='string'?[raw]:raw);}}
  }
  for(const field of data.trace.facts.filter(f=>f.kind==='field')){
   tolerance(field.avgLength,field.totalLength/field.N);tolerance(field.idf,Math.log(1+(field.N-field.df+0.5)/(field.df+0.5)));
   tolerance(field.normalizer,1.2*(1-0.75+0.75*field.length/field.avgLength));tolerance(field.tfPart,field.tf*2.2/(field.tf+field.normalizer));
   tolerance(field.base,field.boost*field.idf*field.tfPart);tolerance(field.selected,field.weight*field.base);
  }
  const diagnostic=exportDiagnostics(data);const metadata=JSON.parse(diagnostic.json);
  for(const key of ['trace','documents','sources','query'])assert.equal(Object.hasOwn(metadata,key),false);
  assert.equal(diagnostic.complete,true);
  const selected=exportDiagnostics(data,{includeFacts:true,includeSource:true});assert.equal(selected.complete,true);JSON.parse(selected.json);
  observations.push({scenario:scenario.name,total:result.total,hits:result.hits,documents:data.documents,facts:data.trace.facts,metadata});
 }
 await engine.dispose();
}
console.log(JSON.stringify(observations));
`;

async function graph(directory, name, entry) {
  await writeFile(join(directory, `${name}.mjs`), entry);
  const settings = { bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,treeShaking:true,legalComments:'none',charset:'ascii',sourcemap:false,metafile:true,write:false };
  const result = await build({...settings,absWorkingDir:directory,entryPoints:[`${name}.mjs`],outfile:`${name}-bundle.mjs`,logLevel:'silent'});
  const bytes=result.outputFiles[0].contents,gzipSettings={level:9,windowBits:15,memLevel:8,strategy:0};
  const compressed=gzipSync(bytes,gzipSettings);
  const inputs=await Promise.all(Object.entries(result.metafile.inputs).map(async([path,input])=>({path,bytes:input.bytes,imports:input.imports,sha256:digest(await readFile(join(directory,path)))})));
  assert.ok(inputs.every(i=>i.imports.every(j=>!j.external)));assert.deepEqual(Object.values(result.metafile.outputs)[0].imports,[]);
  await writeFile(join(directory,`${name}-bundle.mjs`),bytes);
  return {entry,esbuild:version,settings,gzip:{...gzipSettings,mtime:0},minifiedBytes:bytes.length,gzipBytes:compressed.length,sha256:digest(bytes),gzipSha256:digest(compressed),inputs,metafile:result.metafile};
}

export async function measureInspectorPackage(){
 const corpus=buildCorpus(REPO_ROOT);
 const hand={name:'hand',schema:{text:{title:{}}},records:[{id:'a',text:{title:'red red car'}},{id:'b',text:{title:'red car'}},{id:'c',text:{title:'blue'}}]};
 const docs={name:'real-docs',schema:corpus.schema,records:corpus.records};
 hand.queries=[{kind:'text',text:'red car'},{kind:'group',variants:[{text:'red',match:'exact'},{text:'car',match:'exact'}]},{kind:'not',child:{kind:'text',text:'red'}},{kind:'or',children:[{kind:'and',children:[{kind:'text',text:'red'},{kind:'text',text:'blue'}]},{kind:'text',text:'car'}]}];
 docs.queries=[{kind:'text',text:'native'},{kind:'and',children:[{kind:'text',text:'native'},{kind:'eq',field:'category',value:'spec'}]},{kind:'extension',capability:'phrases',version:1,payload:{text:'commit point',fields:['body']}},{kind:'not',child:{kind:'text',text:'revision'}},{kind:'text',text:'unfindablefixtureword'}];
 const pages=[{limit:0},{limit:1},{offset:1,limit:2}];
 const scenarios=[hand,docs].map(s=>{
  const reference=scanPhraseSourceCorpus(s.records,s.schema);
  const cases=s.queries.flatMap(query=>{
   const oracle=query.kind==='extension'?{kind:'phrase',...query.payload}:query;
   return pages.map(page=>({query,page,expected:sourcePhraseQueryResult(reference,oracle,page),all:sourcePhraseQueryResult(reference,oracle,{limit:100})}));
  });
  return {name:s.name,schema:s.schema,records:s.records,ids:[s.records[0].id,s.records[1].id,s.records.at(-1).id,'absent-inspector-record'],cases};
 });
 const consumer=await prepareConsumer(corpus,[]),{directory}=consumer;
 try{
  await writeFile(join(directory,'inspector-fixtures.json'),JSON.stringify(scenarios));
  await writeFile(join(directory,'inspector-run.mjs'),runner);
  const packed=JSON.parse((await command(process.execPath,['inspector-run.mjs'],directory)).stdout);
  const core=await bundleConsumer(directory);
  const inspector=await graph(directory,'inspector',"export {createInspector,exportDiagnostics} from '@vmitsaras/raveldex/addons/inspector';\n");
  const combined=await graph(directory,'combined',"export {createRaveldex} from '@vmitsaras/raveldex';export {createInspector,exportDiagnostics} from '@vmitsaras/raveldex/addons/inspector';export {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';\n");
  await writeFile(join(directory,'inspector-bundled-run.mjs'),runner.replace("from '@vmitsaras/raveldex'","from './combined-bundle.mjs'").replace("from '@vmitsaras/raveldex/addons/inspector'","from './combined-bundle.mjs'").replace("from '@vmitsaras/raveldex/addons/phrases'","from './combined-bundle.mjs'"));
  const bundled=JSON.parse((await command(process.execPath,['inspector-bundled-run.mjs'],directory)).stdout);assert.deepEqual(bundled,packed);
  const startup=[await checkStartup(directory,'@vmitsaras/raveldex'),await checkStartup(directory,'./core-bundle.mjs')];
  const guard=`const reads=[];for(const name of ['window','document','navigator','fetch','Worker','indexedDB','localStorage','performance','setTimeout','queueMicrotask'])Object.defineProperty(globalThis,name,{get(){reads.push(name);throw Error(name)}});const m=await import(process.argv[1]);console.log(JSON.stringify({reads,exports:Object.keys(m).sort()}));`;
  for(const specifier of ['@vmitsaras/raveldex/addons/inspector','./inspector-bundle.mjs']){const row=JSON.parse((await command(process.execPath,['--input-type=module','--eval',guard,specifier],directory)).stdout);assert.deepEqual(row.reads,[]);assert.deepEqual(row.exports,['createInspector','exportDiagnostics']);startup.push({specifier,...row});}
  const privateDenial=[];
  for(const specifier of ['@vmitsaras/raveldex/dist/core/trace/facts.js','@vmitsaras/raveldex/dist/addons/inspector/index.js','@vmitsaras/raveldex/addons/inspector/output','@vmitsaras/raveldex/addons/inspector/diagnostics']){
   const result=JSON.parse((await command(process.execPath,['--input-type=module','--eval',`try{await import(process.argv[1]);console.log('{}')}catch(e){console.log(JSON.stringify({code:e.code}))}`,specifier],directory)).stdout);assert.equal(result.code,'ERR_PACKAGE_PATH_NOT_EXPORTED');privateDenial.push({specifier,...result});
  }
  const mapping=[];
  for(const file of consumer.package.files.filter(f=>f.path.endsWith('.js')||f.path.endsWith('.d.ts'))){const source=file.path.replace(/^dist\//,'src/').replace(/(?:\.d)?\.ts$|\.js$/,'.ts');const original=await readFile(join(REPO_ROOT,source));mapping.push({path:file.path,sha256:digest(await readFile(join(consumer.installed,file.path))),source,sourceSha256:digest(original)});}
  const moduleHashes=await Promise.all(core.inputs.map(async input=>({path:input.path,sha256:digest(await readFile(join(directory,input.path)))})));
  assert.ok(inspector.inputs.every(i=>!/core\/(execution|query|mutations|ranking)\/|phrases\/verify|positions\//.test(i.path)));
  return {environment:{node:process.version,platform:process.platform,arch:process.arch},package:consumer.package,declarations:{status:'Pass',fixtureSha256:digest(await readFile(join(REPO_ROOT,'test/consumer/public-types.ts')))},corpus:{records:corpus.records.length,hash:corpus.hash,sourceFiles:corpus.sources},correctness:{status:'Pass',completeComparisonsPerRun:packed.length,selectedDocumentComparisonsPerRun:packed.reduce((n,p)=>n+p.documents.length,0),factsPerRun:packed.reduce((n,p)=>n+p.facts.length,0),bundledParity:'Pass'},core:{...core,moduleHashes},graphs:{inspector,combined},compiledFiles:{status:'Pass',mapping},startup,privateDenial};
 }finally{await rm(directory,{recursive:true,force:true});}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const report=await measureInspectorPackage();await writeFile(new URL('../../docs/evidence/RX-2004-package.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({correctness:report.correctness,core:{minified:report.core.minifiedBytes,gzip:report.core.gzipBytes,targetMet:report.core.targetMet},inspector:{minified:report.graphs.inspector.minifiedBytes,gzip:report.graphs.inspector.gzipBytes},combined:{minified:report.graphs.combined.minifiedBytes,gzip:report.graphs.combined.gzipBytes}}));}
