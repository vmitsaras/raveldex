// Explicit isolated consumer only; never installs, builds or mutates runtime packages.
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir,readdir } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn,execFileSync } from 'node:child_process';
import { cpus,release,totalmem } from 'node:os';
import { inventory } from './run.mjs';
import { FAMILIES,SIZES } from './workloads.mjs';
import { hash,summarizeAlternatives } from './alternatives-method.mjs';
const [rawConsumer,rawOutput]=process.argv.slice(2);assert.ok(rawConsumer&&rawOutput,'Pass isolated consumer and NEW output');
const consumer=resolve(rawConsumer),output=resolve(rawOutput);await mkdir(output);
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const families=process.env.RAVELDEX_N9_FAMILIES?.split(',')??FAMILIES,sizes=process.env.RAVELDEX_N9_SIZES?.split(',').map(Number)??SIZES,owners=Number(process.env.RAVELDEX_RX8010_OWNERS??3),engines=process.env.RAVELDEX_RX8010_ENGINES?.split(',')??['raveldex','minisearch','flexsearch','orama','lunr','fuse'];
assert.ok(families.every(x=>FAMILIES.includes(x))&&sizes.every(x=>SIZES.includes(x))&&[1,3].includes(owners));
const installedInventory=async()=>{const rows=[];for(const name of (await readdir(join(consumer,'node_modules'))).sort()){if(name==='.bin')continue;if(name==='.package-lock.json'){rows.push({path:name,sha256:hash(await readFile(join(consumer,'node_modules',name)))});continue;}for(const row of await inventory(join(consumer,'node_modules',name)))rows.push({...row,path:join(name,row.path)});}return rows;};
const modulesBefore=await installedInventory();
const harnessPaths=['alternatives.mjs','alternatives-child.mjs','alternatives-method.mjs','alternatives-lexical.mjs','alternatives-other.mjs','workloads.mjs'].map(x=>'bench/n9/'+x);
const harness=await Promise.all(harnessPaths.map(async path=>({path,sha256:hash(await readFile(join(root,path)))})));
const report={kind:'rx8010-alternatives-v1',startedAt:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),environment:{node:process.version,versions:process.versions,cpu:cpus()[0].model,logicalCPUs:cpus().length,release:release(),platform:process.platform,arch:process.arch,totalSystemBytes:totalmem()},consumer,modulesBefore,harness,
 method:{families,sizes,owners,engines,timing:'Sequential fresh child processes; build includes adapter construction/module load and indexing. Per-query two explicit warmups then40calls at100 or2atlarger sizes per owner. Wall and process CPU user/system separately. First query probe and complete membership verification excluded from timing. p95 only >=100 same-cell actual successful observations.',comparability:'Complete foreign ranked IDs/count vs native exact-total/top20. Membership equivalence only; no numerical ranking or equal-output latency ratio. Source retention/phrases absent in native core control. Fuse fuzzy separate, Pagefind static separate.',diagnostics:'No foreign private instrumentation; raw complete outputs and independent membership are semantic diagnostics, no guessed visited-document/work counters. Native intrusive diagnostic data remains separately in RX-8009; no overhead subtraction.',memory:'Not measured; serialized/package bytes are not heap/peak memory'},runs:[]};
await writeFile(join(output,'start.json'),JSON.stringify(report,null,2)+'\n');
const cells=families.flatMap(family=>sizes.map(size=>({family,size})));
for(let owner=0;owner<owners;owner++)for(const cell of owner%2?[...cells].reverse():cells){
 const rotated=engines.slice(owner%engines.length).concat(engines.slice(0,owner%engines.length));
 for(const engine of rotated){const name=`${cell.family}-${cell.size}-${engine}-${owner}`,file=join(output,name+'.json'),args=[join(root,'bench/n9/alternatives-child.mjs'),consumer,engine,cell.family,String(cell.size),String(owner),file];
  let log='';const startedAt=new Date().toISOString();const exitCode=await new Promise((yes,no)=>{const child=spawn(process.execPath,args,{cwd:root,stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);child.on('error',no);child.on('close',yes);});
  await writeFile(join(output,name+'.txt'),log);report.runs.push({name,engine,...cell,owner,startedAt,exitCode,command:[process.execPath,...args],file:name+'.json'});await writeFile(join(output,'progress.json'),JSON.stringify(report,null,2)+'\n');assert.equal(exitCode,0,name+' failed '+log);console.log(name);
 }
}
const rows=await Promise.all(report.runs.map(async r=>JSON.parse(await readFile(join(output,r.file)))));
report.summaries=summarizeAlternatives(rows);report.coverage=rows.flatMap(row=>row.queries.map(q=>({engine:row.engine,family:row.family,size:row.size,owner:row.owner,id:q.id,status:q.status,reason:q.reason??null,completeMembership:q.completeMembership??null})));
report.modulesAfter=await installedInventory();assert.deepEqual(report.modulesBefore,report.modulesAfter,'installed bytes changed');
for(const pin of harness)assert.equal(hash(await readFile(join(root,pin.path))),pin.sha256,'harness changed while collecting');report.inputsUnchanged=true;report.completedAt=new Date().toISOString();
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
