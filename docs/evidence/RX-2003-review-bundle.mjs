import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const repo=resolve(process.argv[2]??process.cwd());
const {build}=await import(pathToFileURL(resolve(repo,'node_modules/esbuild/lib/main.js')));
const settings={bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,treeShaking:true,legalComments:'none',charset:'ascii',sourcemap:false,write:false,metafile:true};
const result=await build({stdin:{contents:"export * from './src/index.ts';",resolveDir:repo,sourcefile:'rx2003-review-root.js'},...settings});
const output=result.outputFiles[0].contents,metafile=result.metafile;
assert.ok(!Object.keys(metafile.inputs).some(path=>path.includes('/addons/')||path.includes('minisearch')||path.includes('node_modules')));
assert.ok(Object.values(metafile.inputs).every(input=>input.imports.every(entry=>!entry.external)));
const guarded=['window','document','navigator','Worker','fetch','setTimeout','setInterval','requestAnimationFrame','indexedDB','localStorage','sessionStorage'];
const saved=guarded.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
let hostAccesses=0;
for(const key of guarded)Object.defineProperty(globalThis,key,{configurable:true,get(){hostAccesses++;throw new Error(`startup touched ${key}`);}});
let exports;
try{exports=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));}
finally{for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
assert.equal(hostAccesses,0);assert.deepEqual(Object.keys(exports).sort(),['ERROR_CODES','RaveldexError','createRaveldex']);
const realInputs=Object.keys(metafile.inputs).filter(key=>key!== 'rx2003-review-root.js');
const data={repo,minified:output.length,gzip:gzipSync(output,{level:9,windowBits:15,memLevel:8,strategy:0,mtime:0}).length,gzipPlanningTarget:15360,realInputCount:realInputs.length,hostAccesses,guarded,settings,gzipSettings:{level:9,windowBits:15,memLevel:8,strategy:0,mtime:0},metafile};
data.targetMissBytes=data.gzip-data.gzipPlanningTarget;
writeFileSync(resolve(process.argv[1]).replace(/\.mjs$/,'.json'),JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({minified:data.minified,gzip:data.gzip,realInputs:data.realInputCount,hostAccesses,targetMissBytes:data.targetMissBytes}));
