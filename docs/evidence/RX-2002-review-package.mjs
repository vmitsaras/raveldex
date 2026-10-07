import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const repo=resolve(process.argv[2]??process.cwd());const {build,version}=await import(pathToFileURL(join(repo,'node_modules/esbuild/lib/main.js')));
const directory=await mkdtemp(join(tmpdir(),'raveldex-rx2002-review-package-'));
const report={status:'running',environment:{node:process.version,platform:process.platform,arch:process.arch,esbuild:version},graphs:{},package:{},exports:{},privateDenial:[],execution:{},limitations:['Logical serialized tarball/bundle bytes only; no retained or peak heap measurement.','Same-host Node/macOS and browser-target bundle resolution; no actual browser/worker or cross-host qualification.']};
function command(binary,args,cwd=directory){const result=spawnSync(binary,args,{cwd,encoding:'utf8',env:{...process.env,npm_config_cache:join(directory,'cache'),npm_config_update_notifier:'false'}});assert.equal(result.status,0,`${binary} ${args.join(' ')}: ${result.stderr}\n${result.stdout}`);return result.stdout;}
const hash=value=>createHash('sha256').update(value).digest('hex');
try{
 const packed=JSON.parse(command('npm',['pack','--ignore-scripts','--json','--pack-destination',directory],repo))[0];const tarball=join(directory,packed.filename),bytes=await readFile(tarball);
 report.package={tarballBytes:bytes.length,unpackedBytes:packed.unpackedSize,sha256:hash(bytes),files:packed.files.map(({path,size})=>({path,size}))};
 assert.ok(packed.files.every(({path})=>!path.startsWith('src/')&&!path.startsWith('test/')&&(!path.endsWith('.ts')||path.endsWith('.d.ts'))));
 await writeFile(join(directory,'package.json'),JSON.stringify({name:'rx2002-independent-consumer',version:'0.0.0',private:true,type:'module'}));
 command('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--package-lock=false',tarball]);
 const pkg=JSON.parse(await readFile(join(directory,'node_modules/@vmitsaras/raveldex/package.json'),'utf8'));assert.equal(Object.keys(pkg.dependencies??{}).length,0);report.exports=pkg.exports;
 const expected=['.','./addons/phrases','./addons/phrases/source','./addons/positions','./addons/phrases/positions','./addons/phrases/mixed'];assert.deepEqual(Object.keys(pkg.exports).sort(),expected.sort());

 const typeSource=`
 import {createRaveldex, type AddonRegistration} from '@vmitsaras/raveldex';
 import {createPositionProvider,type PositionProviderOptions} from '@vmitsaras/raveldex/addons/positions';
 import {createPositionPhrases,type PositionPhraseOptions} from '@vmitsaras/raveldex/addons/phrases/positions';
 import {createPhrases,type MixedPhraseOptions} from '@vmitsaras/raveldex/addons/phrases/mixed';
 import {createSourceProvider} from '@vmitsaras/raveldex/addons/phrases/source';
 const options:PositionProviderOptions={fields:['title','body'] as const,offsets:['body'] as const};
 const phr:PositionPhraseOptions={fields:['title','body'] as const};
 const mixed:MixedPhraseOptions={fields:{title:'source',body:'positions'} as const};
 const registration:AddonRegistration=createPositionProvider(options);
 createRaveldex({schema:{text:{title:{},body:{}}},addons:[registration,createPositionPhrases(phr)]});
 createRaveldex({schema:{text:{title:{},body:{}}},addons:[createPositionProvider({fields:['body'],offsets:['body']}),createSourceProvider({fields:['title']}),createPhrases(mixed)]});
 // @ts-expect-error Fields are readonly.
 options.fields[0]='body';
 // @ts-expect-error Offsets are independently selected readonly fields.
 options.offsets![0]='title';
 // @ts-expect-error Selected strategy object is readonly.
 mixed.fields.title='positions';
 // @ts-expect-error Boolean offsets are not a supported contract.
 createPositionProvider({fields:['title'],offsets:true});
 // @ts-expect-error Unsupported strategies are not silently inferred.
 createPhrases({fields:{title:'offsets'}});
 // @ts-expect-error Provider roots are package private.
 import type {PositionRoot} from '@vmitsaras/raveldex/addons/positions/store';
 `;
 await writeFile(join(directory,'installed-types.ts'),typeSource);
 await writeFile(join(directory,'tsconfig.json'),JSON.stringify({compilerOptions:{noEmit:true,strict:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],skipLibCheck:false},include:['installed-types.ts']}));
 command(join(repo,'node_modules/.bin/tsc'),['-p','tsconfig.json']);report.installedTypes='Pass';
 const probe=`import assert from 'node:assert/strict';
 const denied=['window','document','navigator','fetch','Worker','indexedDB','localStorage','performance','setTimeout','clearTimeout','queueMicrotask'];
 for(const name of denied)Object.defineProperty(globalThis,name,{configurable:true,get(){throw Error(name)}});
 const modules={
 '@vmitsaras/raveldex':['createRaveldex','RaveldexError','ERROR_CODES'],
 '@vmitsaras/raveldex/addons/phrases':['createSourceProvider','createSourcePhrases'],
 '@vmitsaras/raveldex/addons/phrases/source':['createSourceProvider'],
 '@vmitsaras/raveldex/addons/positions':['createPositionProvider'],
 '@vmitsaras/raveldex/addons/phrases/positions':['createPositionPhrases'],
 '@vmitsaras/raveldex/addons/phrases/mixed':['createPhrases']};
 for(const[name,exports]of Object.entries(modules))assert.deepEqual(Object.keys(await import(name)).sort(),exports.sort());
 const privatePaths=['/core/execution/engine','/dist/core/execution/engine.js','/addons/positions/store','/addons/positions/verifier','/dist/addons/positions/store.js','/addons/phrases/mixed.js','/addons/phrases/verifier'];
 for(const name of privatePaths)await assert.rejects(import('@vmitsaras/raveldex'+name),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
 console.log(JSON.stringify({startup:'Pass',modules:Object.keys(modules),privatePaths}));`;
 report.imports=JSON.parse(command(process.execPath,['--input-type=module','--eval',probe]));report.privateDenial=report.imports.privatePaths;
 const runtime='export {createRaveldex,RaveldexError,ERROR_CODES} from "@vmitsaras/raveldex";';
 const entries={
 core:runtime,
 sourceUtility:'export {createSourceProvider} from "@vmitsaras/raveldex/addons/phrases/source";',
 positionUtility:'export {createPositionProvider} from "@vmitsaras/raveldex/addons/positions";',
 sourcePhrases:runtime+'export {createSourceProvider,createSourcePhrases} from "@vmitsaras/raveldex/addons/phrases";',
 positionPhrases:runtime+'export {createPositionProvider} from "@vmitsaras/raveldex/addons/positions"; export {createPositionPhrases} from "@vmitsaras/raveldex/addons/phrases/positions";',
 mixedPhrases:runtime+'export {createSourceProvider} from "@vmitsaras/raveldex/addons/phrases/source"; export {createPositionProvider} from "@vmitsaras/raveldex/addons/positions"; export {createPhrases} from "@vmitsaras/raveldex/addons/phrases/mixed";',
 };
 const settings={bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,treeShaking:true,legalComments:'none',charset:'ascii',sourcemap:false,metafile:true,write:false};
 for(const[name,entry]of Object.entries(entries)){await writeFile(join(directory,`${name}.mjs`),entry);const output=await build({...settings,absWorkingDir:directory,entryPoints:[`${name}.mjs`],outfile:`${name}-bundle.mjs`,logLevel:'silent'}),content=output.outputFiles[0].contents,gzip=gzipSync(content,{level:9,windowBits:15,memLevel:8,strategy:0});await writeFile(join(directory,`${name}-bundle.mjs`),content);const inputs=Object.entries(output.metafile.inputs).map(([path,data])=>({path,bytes:data.bytes,imports:data.imports}));assert.ok(inputs.every(i=>i.path===`${name}.mjs`||i.path.startsWith('node_modules/@vmitsaras/raveldex/dist/')));assert.ok(inputs.every(i=>i.imports.every(j=>!j.external)));assert.deepEqual(Object.values(output.metafile.outputs)[0].imports,[]);
  if(name==='core')assert.ok(inputs.every(i=>!i.path.includes('/addons/')));
  if(name==='sourceUtility')assert.ok(inputs.every(i=>!i.path.includes('/positions/')&&!i.path.includes('/verifier')&&!i.path.endsWith('/phrases/index.js')));
  if(name==='positionUtility')assert.ok(inputs.every(i=>!i.path.includes('/phrases/')&&!i.path.includes('/verifier')));
  if(name==='sourcePhrases')assert.ok(inputs.every(i=>!i.path.includes('/positions/')));
  if(name==='positionPhrases')assert.ok(inputs.every(i=>!i.path.includes('/phrases/')));
  if(name==='mixedPhrases'){assert.ok(inputs.some(i=>i.path.endsWith('/positions/verifier.js')));assert.ok(inputs.some(i=>i.path.endsWith('/phrases/verifier.js')));}
  report.graphs[name]={settings,gzipSettings:{level:9,windowBits:15,memLevel:8,strategy:0,mtime:0},minifiedBytes:content.length,gzipBytes:gzip.length,sha256:hash(content),gzipSha256:hash(gzip),inputs,metafile:output.metafile};
 }
 assert.ok(report.graphs.core.gzipBytes<=15360);
 // Identical explicitly expected literal membership and hand arithmetic in the
 // installed package and browser-target minified bundles, including mutations.
 const records=[{id:'a',text:{title:'red red blue',body:'ﬁle a\u0301'}},{id:'b',text:{title:['red','blue'],body:'red—blue'}},{id:'c',text:{title:'½ blue',body:'1/2 blue'}},{id:'d',text:{}}];
 const literalTerms={a:{title:['red','red','blue'],body:['file','á']},b:{title:['red','blue'],body:['red','blue']},c:{title:['1⁄2','blue'],body:['1','2','blue']},d:{title:[],body:[]}};
 const cases=[['red red',['red'],'title',['a']],['red blue',['red','blue'],undefined,['a','b']],['ﬁle a\u0301',['file','á'],'body',['a']],['½ blue',['1⁄2','blue'],'title',['c']],['1/2 blue',['1','2','blue'],'body',['c']],['red',['red'],undefined,['a','b']],['',[],undefined,[]]];
 function expectedScore(id,terms,field){let score=0;for(const term of [...terms].sort())for(const f of(field?[field]:['body','title'])){const ts=literalTerms[id][f],tf=ts.filter(t=>t===term).length;if(!tf)continue;const arrays=Object.values(literalTerms).map(x=>x[f]),live=arrays.filter(x=>x.length),N=live.length,L=live.reduce((a,b)=>a+b.length,0),df=arrays.filter(x=>x.includes(term)).length,idf=Math.log(1+(N-df+0.5)/(df+0.5)),normalizer=1.2*(1-0.75+0.75*ts.length/(L/N)),tfPart=tf*(1.2+1)/(tf+normalizer);score+=idf*tfPart;}return score;}
 const testBody=`
 const records=${JSON.stringify(records)},cases=${JSON.stringify(cases)};
 const rows=[];for(const kind of ['source','positions','offsets','mixed']){
 const addons=kind==='source'?[createSourceProvider({fields:['title','body']}),createSourcePhrases({fields:['title','body']})]:kind==='mixed'?[createSourceProvider({fields:['title']}),createPositionProvider({fields:['body'],offsets:['body']}),createPhrases({fields:{title:'source',body:'positions'}})]:[createPositionProvider({fields:['title','body'],...(kind==='offsets'?{offsets:['title']}: {})}),createPositionPhrases({fields:['title','body']})];
 const engine=createRaveldex({schema:{text:{title:{},body:{}}},addons});await engine.addMany(records);
 for(const[raw,,field]of cases)for(const page of [{limit:100},{limit:0},{offset:1,limit:1}])rows.push({kind,raw,field,page,result:await engine.search({kind:'extension',capability:'phrases',version:1,payload:{text:raw,...(field?{fields:[field]}:{})}},page)});
 const replaced=await engine.replace({id:'b',text:{title:'blue red',body:'blue red'}}),after=await engine.search({kind:'extension',capability:'phrases',version:1,payload:{text:'red blue'}},{limit:100});
 const removed=await engine.remove('a'),empty=await engine.search({kind:'extension',capability:'phrases',version:1,payload:{text:'red blue'}},{limit:0}),cleared=await engine.clear();rows.push({kind,mutations:{replaced,after,removed,empty,cleared}});await engine.dispose();
 }console.log(JSON.stringify(rows));`;
 const imports=`import {createRaveldex} from '@vmitsaras/raveldex';import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases';import {createPositionProvider} from '@vmitsaras/raveldex/addons/positions';import {createPositionPhrases} from '@vmitsaras/raveldex/addons/phrases/positions';import {createPhrases} from '@vmitsaras/raveldex/addons/phrases/mixed';`;
 await writeFile(join(directory,'consumer-run.mjs'),imports+testBody);const packedRows=JSON.parse(command(process.execPath,['consumer-run.mjs']));
 // Bundle exactly the executable consumer, not a stand-in package export stub.
 const full=await build({...settings,platform:'node',absWorkingDir:directory,entryPoints:['consumer-run.mjs'],outfile:'consumer-minified.mjs',logLevel:'silent'});await writeFile(join(directory,'consumer-minified.mjs'),full.outputFiles[0].contents);const minifiedRows=JSON.parse(command(process.execPath,['consumer-minified.mjs']));assert.deepEqual(minifiedRows,packedRows);
 let comparisons=0;for(const row of packedRows){if(row.mutations){assert.equal(row.mutations.replaced.revision,2);assert.deepEqual(row.mutations.after.hits.map(x=>x.id),['a']);assert.equal(row.mutations.after.total,1);assert.equal(row.mutations.removed.revision,3);assert.equal(row.mutations.empty.total,0);assert.equal(row.mutations.cleared.revision,4);comparisons++;continue;}const[,terms,field,ids]=cases.find(([raw])=>raw===row.raw),ranked=ids.map(id=>({id,score:expectedScore(id,terms,field)})).sort((a,b)=>b.score-a.score||(a.id<b.id?-1:1)),hits=ranked.slice(row.page.offset??0,(row.page.offset??0)+row.page.limit);assert.equal(row.result.revision,1);assert.equal(row.result.total,ids.length);assert.equal(row.result.completeness,'complete');assert.deepEqual(row.result.hits.map(x=>x.id),hits.map(x=>x.id));for(let i=0;i<hits.length;i++)assert.ok(Math.abs(row.result.hits[i].score-hits[i].score)<=Math.max(1e-12,Math.abs(hits[i].score)*1e-12));comparisons++;}
 report.execution={status:'Pass',packedMinifiedParity:'Pass',independentComparisonsPerRun:comparisons,rows:packedRows};report.status='Pass';
}finally{await rm(directory,{recursive:true,force:true});}
await writeFile(resolve(process.argv[1]).replace(/\.mjs$/,'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,graphs:Object.fromEntries(Object.entries(report.graphs).map(([n,g])=>[n,{gzipBytes:g.gzipBytes,inputs:g.inputs.length}])),execution:{status:report.execution.status,independentComparisonsPerRun:report.execution.independentComparisonsPerRun},packageBytes:report.package.tarballBytes}));
