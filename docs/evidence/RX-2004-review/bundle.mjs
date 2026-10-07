import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
const rootpath=process.argv[2]??process.cwd(),url=p=>new URL(p,`file://${rootpath}/`).href;
const esbuild=await import(url('node_modules/esbuild/lib/main.js'));
const packageData=JSON.parse(fs.readFileSync(`${rootpath}/docs/evidence/RX-2004-package.json`,'utf8')),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
let moduleHashes=0,compiledHashes=0,sourceHashes=0;const sourcePaths=new Set();
for(const entry of packageData.core.moduleHashes){if(entry.path==='core-entry.mjs')continue;const path=entry.path.replace('node_modules/@vmitsaras/raveldex/','');assert.equal(sha(fs.readFileSync(`${rootpath}/${path}`)),entry.sha256);moduleHashes++;}
const mappings=packageData.compiledFiles.mapping;
for(const entry of mappings){
 // The installed report associates each compiled JS/declaration with its real TS owner.
 const keys=Object.keys(entry);
 const compiledPath=entry.path??entry.compiledPath,sourcePath=entry.source??entry.sourcePath;
 if(!compiledPath||!sourcePath)throw new Error(`Unknown compiled mapping schema: ${keys.join(',')}`);
 const c=fs.readFileSync(`${rootpath}/${compiledPath}`),s=fs.readFileSync(`${rootpath}/${sourcePath}`);
 assert.equal(sha(c),entry.sha256??entry.compiledSha256);assert.equal(sha(s),entry.sourceSha256);compiledHashes++;sourceHashes++;sourcePaths.add(sourcePath);
}
let corpusSourceHashes=0;for(const entry of packageData.corpus.sourceFiles){assert.equal(sha(fs.readFileSync(`${rootpath}/${entry.path}`)),entry.sha256);corpusSourceHashes++;}
const entries={core:`export * from ${JSON.stringify(`${rootpath}/dist/index.js`)};`,inspector:`export * from ${JSON.stringify(`${rootpath}/dist/addons/inspector/index.js`)};`},bundles={},temporary=fs.mkdtempSync(path.join(os.tmpdir(),'raveldex-rx2004-review-bundle-'));
for(const [name,contents] of Object.entries(entries)){
 const result=await esbuild.build({stdin:{contents,resolveDir:rootpath,sourcefile:`review-${name}.mjs`},bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,treeShaking:true,legalComments:'none',charset:'ascii',sourcemap:false,metafile:true,write:false});
 const bytes=result.outputFiles[0].contents,gzip=gzipSync(bytes,{level:9,windowBits:15,memLevel:8,strategy:0,mtime:0}),inputs=Object.keys(result.metafile.inputs);
 assert.equal(Object.values(result.metafile.inputs).some(v=>v.imports.some(i=>i.external)),false);
 assert.equal(inputs.some(p=>/node_modules|ui|worker|storage|compat|MiniSearch|Fuse|FlexSearch|Orama/i.test(p)),false);
 if(name==='core')assert.equal(inputs.some(p=>p.includes('/addons/')),false);
 if(name==='inspector')assert.equal(inputs.some(p=>p.includes('/phrases/index.js')||p.includes('/phrases/verifier')||p.includes('/ranking/')),false);
 const outpath=path.join(temporary,`${name}-bundle.mjs`);fs.writeFileSync(outpath,bytes);bundles[name]={method:'Independent explicit absolute dist export-star browser ESM/ES2022, esbuild pinned; synthetic entry differs from authoritative installed method',minifiedBytes:bytes.length,gzipBytes:gzip.length,sha256:sha(bytes),inputCount:inputs.length,inputs};
}
const startup=[];
for(const specifier of [url('dist/index.js'),url('dist/addons/inspector/index.js'),pathToFileURL(path.join(temporary,'core-bundle.mjs')).href,pathToFileURL(path.join(temporary,'inspector-bundle.mjs')).href]){
 const code=`const names=['document','window','navigator','fetch','XMLHttpRequest','WebSocket','Worker','indexedDB','localStorage','sessionStorage','BroadcastChannel','requestAnimationFrame','setTimeout','queueMicrotask','performance'];const reads=[];for(const key of names)Object.defineProperty(globalThis,key,{configurable:true,get(){reads.push(key);throw Error('startup accessed '+key);}});const ns=await import(${JSON.stringify(specifier)});process.stdout.write(JSON.stringify({reads,exports:Object.keys(ns).sort()}));`;
 const observed=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'}));assert.deepEqual(observed.reads,[]);assert.deepEqual(observed.exports,specifier.includes('inspector')?['createInspector','exportDiagnostics']:['ERROR_CODES','RaveldexError','createRaveldex']);startup.push({specifier:specifier.replace(rootpath,'<repository>').replace(temporary,'<temporary-review-bundle>'),...observed});
}
fs.rmSync(temporary,{recursive:true,force:true});
const raw={status:'Pass',savedFixedCore:{minifiedBytes:packageData.core.minifiedBytes,gzipBytes:packageData.core.gzipBytes,targetGzipBytes:packageData.core.targetGzipBytes,targetMet:packageData.core.targetMet,excess:packageData.core.gzipBytes-packageData.core.targetGzipBytes},moduleHashes,compiledHashes,sourceHashes,uniqueSourceFiles:sourcePaths.size,corpusSourceHashes,bundles,startup};assert.equal(raw.savedFixedCore.targetMet,false);assert.equal(raw.savedFixedCore.excess,1099);fs.writeFileSync(new URL('./bundle.json',import.meta.url),JSON.stringify(raw,null,2)+'\n');console.log(JSON.stringify({...raw,bundles:Object.fromEntries(Object.entries(bundles).map(([k,{inputs,...v}])=>[k,v]))}));
