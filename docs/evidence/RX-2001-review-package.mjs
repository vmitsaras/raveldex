// Replay after npm run build. argv[2] may override the repository root.
// When saved under docs/evidence/, the repository root is inferred.
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repository = resolve(process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
const outputPath = fileURLToPath(new URL(import.meta.url.replace(/\.mjs$/, '.json')));
const moduleFromRepo = path => import(pathToFileURL(resolve(repository, path)).href);
const { build } = await moduleFromRepo('node_modules/esbuild/lib/main.js');
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
const directory=await mkdtemp(join(tmpdir(),'raveldex-phrase-review-'));
try {
 const packed=JSON.parse(execFileSync('npm',['--cache',join(directory,'cache'),'pack','--json','--ignore-scripts','--pack-destination',directory],{cwd:repository,encoding:'utf8'}))[0];
 await writeFile(join(directory,'package.json'),JSON.stringify({type:'module',private:true}));
 execFileSync('npm',['--cache',join(directory,'cache'),'install','--offline','--ignore-scripts','--no-audit','--no-fund',join(directory,packed.filename)],{cwd:directory});
 const probe=`import assert from 'node:assert/strict';
const root=await import('@vmitsaras/raveldex');
assert.deepEqual(Object.keys(root).sort(),['ERROR_CODES','RaveldexError','createRaveldex']);
const {createSourceProvider}=await import('@vmitsaras/raveldex/addons/phrases/source');
const {createSourcePhrases}=await import('@vmitsaras/raveldex/addons/phrases');
const engine=root.createRaveldex({schema:{text:{body:{}}},addons:[createSourcePhrases({fields:['body']}),createSourceProvider({fields:['body']})]});
await engine.addMany([{id:'good',text:{body:'red blue'}},{id:'bad',text:{body:['red','blue']}}]);
const result=await engine.search({kind:'extension',capability:'phrases',version:1,payload:{text:'red blue'}});
assert.equal(result.revision,1);assert.equal(result.total,1);assert.deepEqual(result.hits.map(x=>x.id),['good']);
await engine.dispose();console.log(JSON.stringify({exports:Object.keys(root).sort(),result}));`;
 await writeFile(join(directory,'run.mjs'),probe);
 const runtime=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:directory,encoding:'utf8'}));
 const graphs={};
 for(const name of ['@vmitsaras/raveldex','@vmitsaras/raveldex/addons/phrases/source','@vmitsaras/raveldex/addons/phrases']) {
 const bundled=await build({stdin:{contents:`export * from '${name}';`,resolveDir:directory,sourcefile:'review.mjs'},bundle:true,write:false,minify:true,format:'esm',platform:'neutral',target:'es2022',metafile:true});
 const files=Object.keys(bundled.metafile.inputs), bytes=bundled.outputFiles[0].contents;
 assert.ok(!files.some(x=>/minisearch|flexsearch|fuse|orama/.test(x)));
 if(name==='@vmitsaras/raveldex')assert.ok(!files.some(x=>x.includes('/addons/')));
 if(name.endsWith('/source'))assert.ok(!files.some(x=>/verifier\.js|phrases\/index\.js/.test(x)));
 graphs[name]={files,inputs:files.length,minifiedBytes:bytes.length,gzipBytes:gzipSync(bytes,{level:9}).length};
 }
 const result={tarballFiles:packed.files.map(f=>f.path),runtime,graphs};
 await writeFile(outputPath,JSON.stringify(result,null,2));
 console.log(JSON.stringify({runtime,graphs:Object.fromEntries(Object.entries(graphs).map(([name,g])=>[name,{inputs:g.inputs,minifiedBytes:g.minifiedBytes,gzipBytes:g.gzipBytes}])),artifact:outputPath},null,2));
}finally{await rm(directory,{recursive:true,force:true});}
