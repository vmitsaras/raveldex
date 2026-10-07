import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const recorded=JSON.parse(readFileSync('docs/evidence/RX-2005-package.json','utf8'));
const fileHash=path=>digest(readFileSync(path));
let compiledChecks=0,sourceChecks=0,graphChecks=0;
for(const item of recorded.compiledFiles.mapping){assert.equal(fileHash(item.path),item.sha256,item.path);compiledChecks++;assert.equal(fileHash(item.source),item.sourceSha256,item.source);sourceChecks++;}
const corpusChecks=recorded.corpus.sourceFiles.map(item=>({path:item.path,current:fileHash(item.path)===item.sha256}));
for(const [name,graph] of Object.entries(recorded.graphs)) {
  for(const input of graph.inputs){const pos=input.path.indexOf('/dist/');if(pos<0)continue;const file=input.path.slice(pos+1);assert.equal(fileHash(file),input.sha256,file);graphChecks++;}
  assert.ok(graph.inputs.every(i=>i.imports.every(j=>!j.external)));
  if(name==='evidence')assert.ok(graph.inputs.every(i=>!/snippets\//.test(i.path)));
}
for(const module of recorded.core.moduleHashes){const pos=module.path.indexOf('/dist/');if(pos>=0){const file=module.path.slice(pos+1);assert.equal(fileHash(file),module.sha256,file);graphChecks++;}}
assert.ok(recorded.core.inputs.every(i=>!/addons|adapters/.test(i.path)));
const entries={core:"export {createRaveldex,ERROR_CODES,RaveldexError} from './dist/index.js';",evidence:"export {createMatchEvidence} from './dist/addons/evidence/index.js';",snippets:"export {createSnippetEvidence} from './dist/addons/snippets/index.js';"};
const graphs={};
for(const [name,entry] of Object.entries(entries)) {
  const built=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'independent-'+name+'.mjs'},bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,treeShaking:true,legalComments:'none',charset:'ascii',sourcemap:false,metafile:true,write:false,logLevel:'silent'});
  const bytes=built.outputFiles[0].contents,inputs=Object.keys(built.metafile.inputs);
  if(name==='core')assert.ok(inputs.every(path=>!/addons|adapters/.test(path)));
  if(name==='evidence')assert.ok(inputs.every(path=>!/snippets\//.test(path)));
  const guard=`const reads=[];for(const name of ['Intl','window','document','navigator','fetch','Worker','indexedDB','localStorage','performance','setTimeout','queueMicrotask'])Object.defineProperty(globalThis,name,{get(){reads.push(name);throw Error(name);}});const m=await import(process.argv[1]);console.log(JSON.stringify({reads,exports:Object.keys(m).sort()}));`;
  const moduleURL='data:text/javascript;base64,'+Buffer.from(bytes).toString('base64');
  const result=spawnSync(process.execPath,['--input-type=module','--eval',guard,moduleURL],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);const startup=JSON.parse(result.stdout);assert.deepEqual(startup.reads,[]);
  graphs[name]={minifiedBytes:bytes.length,gzipBytes:gzipSync(bytes,{level:9,windowBits:15,memLevel:8,strategy:0}).length,inputCount:inputs.length,inputs,startup};
}
const packageJSON=JSON.parse(readFileSync('package.json','utf8'));assert.equal(Object.keys(packageJSON.dependencies??{}).length,0);assert.equal(packageJSON.private,true);assert.ok(!Object.hasOwn(packageJSON.exports,'.\/addons/evidence/builder'));
const report={status:'Pass',node:process.version,recordedPackageSha256:recorded.package.sha256,compiledChecks,sourceChecks,recordedGraphModuleHashChecks:graphChecks,corpusChecks,allCorpusCurrent:corpusChecks.every(item=>item.current),runtimeDependencies:0,private:true,independentGraphs:graphs,coreTargetGzipBytes:15360,coreTargetMet:graphs.core.gzipBytes<=15360,claim:'This probe audits local compiled/source bytes and recorded graphs, and independently rebuilds current bundles with guarded startup. Packed/minified semantic tests were also run separately via node --test test/addons/evidence/*.test.mjs.'};
writeFileSync(new URL('./package-audit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,independentGraphs:Object.fromEntries(Object.entries(graphs).map(([name,g])=>[name,{minifiedBytes:g.minifiedBytes,gzipBytes:g.gzipBytes,inputCount:g.inputCount,startup:g.startup}]))}));
