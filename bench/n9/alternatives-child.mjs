import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { workloadFor,verifyFrozen,schema } from './workloads.mjs';
import { compareMembership,hash } from './alternatives-method.mjs';
import { createLexicalAdapter } from './alternatives-lexical.mjs';
import { createOtherAdapter } from './alternatives-other.mjs';
const [consumer,engine,family,size,owner,output] = process.argv.slice(2);
const require = createRequire(join(consumer,'package.json'));
const load = async name=>import(pathToFileURL(name.startsWith('@vmitsaras/raveldex') ? join(consumer,'node_modules/@vmitsaras/raveldex',JSON.parse(await readFile(join(consumer,'node_modules/@vmitsaras/raveldex/package.json'))).exports[name==='@vmitsaras/raveldex'?'.':'.'+name.slice('@vmitsaras/raveldex'.length)].import) : require.resolve(name)));
const workload = verifyFrozen(workloadFor(family,Number(size)));
const row={kind:'rx8010-child-v1',engine,family,size:Number(size),owner:Number(owner),pid:process.pid,identity:workload.identity,startedAt:new Date().toISOString(),samples:[],warmups:[],queries:[],captures:{},metadata:null};
const errorData=e=>({name:e.name,code:e.code??null,message:e.message,details:e.details??null});
async function timed(operation,phase,call){const cpu=process.cpuUsage(),start=performance.now();let result,error;try{result=await call();}catch(e){error=e;}const wallMs=performance.now()-start,used=process.cpuUsage(cpu);row.samples.push({operation,phase,outcome:error?'Refused':'Pass',wallMs,cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,...(error?{error:errorData(error)}:{})});return {result,error};}
let adapter,native;
try {
 const built=await timed('build','fresh-owner',async()=>{
  if(engine==='raveldex') {const {createRaveldex}=await load('@vmitsaras/raveldex');native=createRaveldex({schema});for(let i=0;i<workload.size;i+=256)await native.addMany(workload.records.slice(i,i+256),{deadlineMs:60000});
   adapter={metadata:{fields:['body'],matching:'basic-v1 NFKC/lowercase, no source retention or phrases',output:'exact total/top20 IDs/scores/revision; complete pages checked separately',ranking:'raveldex-bm25-v1',sourceRetention:false},search:definition=>native.search(definition.query,{limit:20,deadlineMs:60000}),destroy:()=>native.dispose()};
  } else {const module=await load(engine==='orama'?'@orama/orama':engine==='fuse'?'fuse.js':engine);adapter=await (['minisearch','flexsearch','lunr'].includes(engine)?createLexicalAdapter:createOtherAdapter)(engine,module,workload.records);}
 });
 if(built.error) throw Error('admitted build failed: '+built.error.message);
 row.metadata=adapter.metadata??adapter.configuration;row.projectedInputSha256=hash(workload.records.map(r=>({id:r.id,body:Array.isArray(r.text.body)?r.text.body.join('\n'):r.text.body})));
 for(const definition of workload.queries){
  const item={id:definition.id,query:definition.query,expectedTotal:definition.expectedIds.length,expectedIdsSha256:hash([...definition.expectedIds].sort()),expectedError:definition.expectedError??null};row.queries.push(item);
  if(engine==='raveldex'&&['phrase'].includes(definition.kind)){Object.assign(item,{status:'Not comparable',reason:'Core-only native configuration does not enable optional phrase/source retention'});continue;}
  // Over-cap foreign calls remain excluded; no synthetic refusal is substituted.
  if(engine!=='raveldex'&&definition.expectedError){Object.assign(item,{status:'Not comparable',reason:'Native prefix expansion-cap/error contract has no matched foreign limit'});continue;}
  let probe;try {probe=await adapter.search(definition);}catch(e){Object.assign(item,{status:'Refused',error:errorData(e)});continue;}
  if(probe.status==='Not comparable'){Object.assign(item,probe);continue;}
  if(engine==='raveldex'){
   assert.equal(probe.total,definition.expectedIds.length);assert.equal(probe.completeness,'complete');assert.equal(probe.hits.length,Math.min(20,probe.total));for(const hit of probe.hits) assert.ok(definition.expectedIds.includes(hit.id));
   item.status='Native exact-total/top20 control';item.capture=probe;
   if(Number(owner)===0){const ids=[];let failure;try{for(let offset=0;offset<probe.total;offset+=100){const page=await native.search(definition.query,{limit:100,offset,deadlineMs:60000});assert.equal(page.total,probe.total);ids.push(...page.hits.map(h=>h.id));}}catch(e){failure=e;}
    item.completeMembership=failure?{status:'Refused',error:errorData(failure)}:compareMembership({ids,total:ids.length},definition.expectedIds);item.completeIds=ids;}
  }else{Object.assign(item,compareMembership(probe,definition.expectedIds));item.capture=probe;if(engine==='fuse'){item.status='Not comparable';item.reason='Separate Fuse fuzzy metric/substring track, not an exact lexical race';}}
  const key=hash(probe);row.captures[key]=probe;
  // Unsupported or divergent matching stays observational, outside normal matched timing.
  if(item.status==='Not comparable'&&engine!=='fuse')continue;
  const repeats=Number(size)===100?40:2;
  for(let warmup=0;warmup<2;warmup++){await adapter.search(definition);row.warmups.push({query:definition.id,index:warmup});}
  for(let i=0;i<repeats;i++){const observed=await timed('query:'+definition.id,'after-two-warmups',()=>adapter.search(definition));if(!observed.error){assert.equal(hash(observed.result),key,'same-owner ranked result changed');row.samples.at(-1).resultSha256=key;}}
 }
 row.status='Collected';
}catch(e){row.status='Fail';row.failure=errorData(e);process.exitCode=1;}
finally{if(adapter)await adapter.destroy();row.completedAt=new Date().toISOString();await writeFile(output,JSON.stringify(row,null,2)+'\n');}
