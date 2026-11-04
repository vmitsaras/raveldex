import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {inventory} from '/Users/vasilis/Documents/GitHub/raveldex/bench/n9/run.mjs';
import {hash,summarizeAlternatives} from '/Users/vasilis/Documents/GitHub/raveldex/bench/n9/alternatives-method.mjs';
const root='/Users/vasilis/Documents/GitHub/raveldex',consumer='/tmp/raveldex-rx8010-20261104/consumer',output='/tmp/raveldex-rx8010-20261104/node';
const original=await readFile(join(output,'progress.json')),report=JSON.parse(original);
report.resumedAt=new Date().toISOString();report.resumedFromProgressSha256=hash(original);report.resumeSourceSha256=hash(await readFile(import.meta.filename));report.failedAttempts=report.runs.filter(r=>r.exitCode!==0);report.runs=report.runs.filter(r=>r.exitCode===0);
async function installedInventory(){const rows=[];for(const name of(await readdir(join(consumer,'node_modules'))).sort()){if(name==='.bin')continue;if(name==='.package-lock.json'){rows.push({path:name,sha256:hash(await readFile(join(consumer,'node_modules',name)))});continue;}for(const row of await inventory(join(consumer,'node_modules',name)))rows.push({...row,path:join(name,row.path)});}return rows;}
assert.deepEqual(await installedInventory(),report.modulesBefore);for(const pin of report.harness)assert.equal(hash(await readFile(join(root,pin.path))),pin.sha256);
const{families,sizes,owners,engines}=report.method,cells=families.flatMap(family=>sizes.map(size=>({family,size})));
for(let owner=0;owner<owners;owner++)for(const cell of owner%2?[...cells].reverse():cells){const rotated=engines.slice(owner%engines.length).concat(engines.slice(0,owner%engines.length));for(const engine of rotated){
 if(report.runs.some(r=>r.engine===engine&&r.family===cell.family&&r.size===cell.size&&r.owner===owner))continue;
 const name=`${cell.family}-${cell.size}-${engine}-${owner}`,retried=report.failedAttempts.some(r=>r.name===name),fileName=name+(retried?'-retry1':'')+'.json',file=join(output,fileName),args=[join(root,'bench/n9/alternatives-child.mjs'),consumer,engine,cell.family,String(cell.size),String(owner),file];
 let log='';const startedAt=new Date().toISOString();const exitCode=await new Promise((yes,no)=>{const child=spawn(process.execPath,args,{cwd:root,stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);child.on('error',no);child.on('close',yes);});
 await writeFile(join(output,fileName.replace('.json','.txt')),log);const run={name,engine,...cell,owner,startedAt,exitCode,command:[process.execPath,...args],file:fileName,...(retried?{retryOf:report.failedAttempts.find(r=>r.name===name).file}:{})};
 if(exitCode!==0){report.failedAttempts.push(run);await writeFile(join(output,'resume-progress.json'),JSON.stringify(report,null,2)+'\n');throw Error('Second required attempt failed; retained '+fileName);}
 report.runs.push(run);await writeFile(join(output,'resume-progress.json'),JSON.stringify(report,null,2)+'\n');console.log(fileName);
}}
const rows=await Promise.all(report.runs.map(async r=>JSON.parse(await readFile(join(output,r.file))))),failed=await Promise.all(report.failedAttempts.map(async r=>JSON.parse(await readFile(join(output,r.file)))));
report.summaries=summarizeAlternatives(rows);report.attemptSummaries=summarizeAlternatives(failed);report.coverage=rows.flatMap(row=>row.queries.map(q=>({engine:row.engine,family:row.family,size:row.size,owner:row.owner,id:q.id,status:q.status,reason:q.reason??null,completeMembership:q.completeMembership??null})));
report.modulesAfter=await installedInventory();assert.deepEqual(report.modulesBefore,report.modulesAfter);for(const pin of report.harness)assert.equal(hash(await readFile(join(root,pin.path))),pin.sha256);
report.inputsUnchanged=true;report.completedAt=new Date().toISOString();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
