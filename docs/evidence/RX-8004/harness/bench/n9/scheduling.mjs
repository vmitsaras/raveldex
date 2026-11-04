// RX-8004: actual installed-package Node observations. Never builds or installs.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp, copyFile, realpath } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { cpus, release } from 'node:os';
import { inventory, digest } from './run.mjs';
import { workloadFor, verifyFrozen } from './workloads.mjs';
export const method = Object.freeze({ owners: 3, samplesPerOwner: 40, warmups: 2, sizes: [1000], browserSize: 100, queries: ['common', 'rare'], deadlineMs: 60000, batch: 256 });
export function nearestRank(values, fraction) {
  assert.ok(values.length && fraction > 0 && fraction <= 1);
  assert.ok(values.every(value => Number.isFinite(value) && value >= 0));
  return [...values].sort((a,b) => a-b)[Math.ceil(values.length * fraction)-1];
}
export function summarizeScheduling(rows) {
  const groups = new Map();
  for (const row of rows.filter(row => row.mode === 'normal')) for (const sample of row.samples) {
    assert.ok(!sample.counters, 'normal timings must not contain instrumentation');
    const key = JSON.stringify([row.variant,row.execution,row.browser ?? 'Node',row.size,sample.query]);
    if (!groups.has(key)) groups.set(key,{variant:row.variant,execution:row.execution,browser:row.browser ?? 'Node',size:row.size,query:sample.query,samples:[]});
    groups.get(key).samples.push(sample);
  }
  return [...groups.values()].map(({samples,...identity}) => {
    const pass=samples.filter(row=>row.outcome==='Pass'), values=pass.map(row=>row.wallMs);
    assert.ok(pass.every(row=>row.cpuUserMs===undefined || [row.cpuUserMs,row.cpuSystemMs].every(value=>Number.isFinite(value)&&value>=0)), 'invalid CPU sample');
    return {...identity,attempts:samples.length,successes:pass.length,outcomes:Object.fromEntries([...new Set(samples.map(row=>row.outcome))].map(outcome=>[outcome,samples.filter(row=>row.outcome===outcome).length])),
      p50WallMs:values.length?nearestRank(values,.5):null,p95WallMs:values.length>=100?nearestRank(values,.95):null,observedMaximumWallMs:values.length?Math.max(...values):null,
      cpuSamples:pass.filter(row=>row.cpuUserMs!==undefined).map(({cpuUserMs,cpuSystemMs})=>({cpuUserMs,cpuSystemMs})),
      quantiles:'Empirical nearest-rank order statistics; p95 requires >=100 successes. Correlated calls across three fresh owners are not a population/device guarantee.'};
  });
}
export function validateScheduling(rows, samples = method.samplesPerOwner) {
  for (const row of rows) {
    assert.equal(row.outcome,'Pass',JSON.stringify(row.failure)); assert.equal(row.build?.outcome,'Pass');
    assert.equal(row.mode==='normal'?row.observations.length:row.samples.length,0,'mixed timing scope');
    const data=row.mode==='normal'?row.samples:row.observations;
    assert.equal(data.length,method.queries.length*(row.mode==='normal'?samples:1));
    for (const query of method.queries) {const actual=data.filter(s=>s.query===query);assert.equal(actual.length,row.mode==='normal'?samples:1);assert.ok(actual.every(s=>s.outcome==='Pass'));assert.ok(row.queryResults[query]);}
  }
  const keys = [...new Set(rows.map(row=>JSON.stringify([row.execution,row.browser ?? 'Node',row.size])))];
  const parity=[];
  for(const key of keys) {
    const [execution,browser,size]=JSON.parse(key), selected=rows.filter(row=>row.execution===execution&&(row.browser??'Node')===browser&&row.size===size);
    const reference=selected.find(row=>row.variant==='baseline'&&row.mode==='normal');assert.ok(reference,'missing baseline');
    for(const variant of ['baseline','candidate']) {
      assert.equal(selected.filter(row=>row.variant===variant&&row.mode==='normal').length,method.owners);
      assert.equal(selected.filter(row=>row.variant===variant&&row.mode==='diagnostic').length,1);
    }
    for(const row of selected) assert.deepEqual(row.queryResults,reference.queryResults,'exact native result parity');
    const diagnostics=selected.filter(row=>row.mode==='diagnostic');
    for(const query of method.queries) {
      const a=diagnostics.find(r=>r.variant==='baseline').observations.find(s=>s.query===query).counters;
      const b=diagnostics.find(r=>r.variant==='candidate').observations.find(s=>s.query===query).counters;
      assert.equal(b.workUnits,a.workUnits,'work-unit policy changed');assert.equal(b.steps,a.steps,'emitted step policy changed');assert.equal(b.hostYields,a.hostYields,'yield quantum changed');
      assert.ok(a.tasks.length>0&&b.tasks.length>0); assert.ok(a.tasks.every(task=>Number.isFinite(task.durationMs)&&task.durationMs>=0));assert.ok(b.tasks.every(task=>Number.isFinite(task.durationMs)&&task.durationMs>=0));
    }
    parity.push({execution,browser,size,owners:selected.length,exactResults:true,sameWorkStepsAndYields:true});
  }
  return parity;
}
export async function instrumentScheduling(packageRoot) {
  const path=join(packageRoot,'dist/core/execution/engine.js'), original=await readFile(path,'utf8');let changed=original;
  const patches=[
    ['pump-start','this.#pumping = true;',"this.#pumping = true;\n        const n9 = globalThis[Symbol.for('raveldex.n9.scheduling')]; const n9Start = n9 ? performance.now() : 0; const n9Kind = n9?.resuming ? 'continuation' : 'initial'; if(n9){n9.resuming=false;if(n9.firstWorkAt === null){n9.firstWorkAt=n9Start;n9.lastHeartbeat=n9Start;}}"],
    ['emitted-work','consumed += step.value.workUnits;',"consumed += step.value.workUnits; if(n9){n9.workUnits += step.value.workUnits; n9.steps++;}"],
    ['fired-resume','() => { op.resume = undefined; this.pump(); }',"() => { const d=globalThis[Symbol.for('raveldex.n9.scheduling')];if(d){d.hostYields++;d.resuming=true;}op.resume = undefined; this.pump(); }"],
    ['pump-end','this.#pumping = false;\n            this.release();',"this.#pumping = false;\n            this.release(); if(n9)n9.tasks.push({kind:n9Kind,durationMs:performance.now()-n9Start,workUnits:consumed});"],
  ];
  for(const [name,from,to] of patches){assert.equal(changed.split(from).length-1,1,'scheduling observer anchor drift '+name);changed=changed.replace(from,to);}
  await writeFile(path,changed);return {path:'dist/core/execution/engine.js',originalSha256:digest(original),instrumentedSha256:digest(changed),anchors:patches.map(([name])=>name),scope:'Intrusive scheduled engine pump spans; not whole OS tasks, physical input, paint or exclusive CPU.'};
}
export async function prepareScheduling(consumers, output) {
  const packages={};
  for(const variant of ['baseline','candidate']) {
    const directory=await realpath(resolve(consumers[variant])),root=join(directory,'node_modules/@vmitsaras/raveldex');
    assert.equal(await realpath(root),root);const metadata=JSON.parse(await readFile(join(root,'package.json'),'utf8'));assert.equal(metadata.name,'@vmitsaras/raveldex');assert.equal(metadata.private,true);assert.deepEqual(metadata.dependencies??{},{});
    const members=await inventory(root),diagnostic=join(output,variant+'-diagnostic');await mkdir(join(diagnostic,'node_modules/@vmitsaras'),{recursive:true});await cp(root,join(diagnostic,'node_modules/@vmitsaras/raveldex'),{recursive:true});await writeFile(join(diagnostic,'package.json'),JSON.stringify({private:true,type:'module'}));
    const instrumentation=await instrumentScheduling(join(diagnostic,'node_modules/@vmitsaras/raveldex'));
    packages[variant]={directory,root,metadata,members,inventorySha256:digest(JSON.stringify(members)),diagnostic,instrumentation};
  }
  return packages;
}
export async function finishScheduling(packages, harness) {
  for(const pack of Object.values(packages)){assert.deepEqual(await inventory(pack.root),pack.members);pack.normalPackageUnchanged=true;}
  for(const pin of harness)assert.equal(digest(await readFile(pin.absolute)),pin.sha256,'harness drift');
}
export async function schedulingPins() {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
  return Promise.all(['bench/n9/scheduling.mjs','bench/n9/scheduling-child.mjs','bench/n9/scheduling-browser.mjs','bench/n9/workloads.mjs','bench/n9/run.mjs','bench/n9/instrument.mjs','test/fixtures/n9/freeze.json','test/fixtures/relevance/corpus.json'].map(async path=>({path,absolute:join(root,path),sha256:digest(await readFile(join(root,path)))})));
}
async function main() {
  assert.equal(process.argv.length,5,'Pass baseline consumer, candidate consumer, fresh output');const output=resolve(process.argv[4]);await mkdir(output);
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),harness=await schedulingPins(),packages=await prepareScheduling({baseline:process.argv[2],candidate:process.argv[3]},output),sizes=(process.env.RAVELDEX_SCHEDULING_SIZES??'1000').split(',').map(Number),samples=Number(process.env.RAVELDEX_SCHEDULING_SAMPLES??40);
  assert.ok(sizes.length&&new Set(sizes).size===sizes.length&&sizes.every(s=>[100,1000,10000].includes(s)));assert.ok(Number.isInteger(samples)&&samples>0);
  for(const pack of Object.values(packages))for(const directory of [pack.directory,pack.diagnostic])await copyFile(join(root,'bench/n9/scheduling-child.mjs'),join(directory,'n9-scheduling-child.mjs'));
  const report={kind:'rx8004-node-scheduling-v1',startedAt:new Date().toISOString(),sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),harness,packages,method:{...method,sizes,samplesPerOwner:samples,forcedFallback:process.env.RAVELDEX_SCHEDULING_FALLBACK==='1',timing:'Sequential fresh process/owner each row; three normal owners per variant/size, two warmups then forty calls per common/rare query. Intrusive task spans and 4ms timer heartbeat recorded in separate diagnostic owners only. CPU user/system separate from wall. No cross-host subtraction.'},environment:{node:process.version,versions:process.versions,platform:process.platform,arch:process.arch,release:release(),cpu:cpus()[0]?.model},workloads:sizes.map(size=>verifyFrozen(workloadFor('adversarial',size)).identity),runs:[],outcome:'Running'};
  try {
    for(let owner=0;owner<4;owner++)for(const size of owner%2?[...sizes].reverse():sizes)for(const variant of owner%2?['candidate','baseline']:['baseline','candidate']){
      const mode=owner===3?'diagnostic':'normal',directory=mode==='normal'?packages[variant].directory:packages[variant].diagnostic,name=`${variant}-${size}-${owner}-${mode}`,file=join(output,name+'.json'),args=[join(directory,'n9-scheduling-child.mjs'),pathToFileURL(join(root,'bench/n9/workloads.mjs')).href,String(size),mode,file];let log='';
      const code=await new Promise((yes,no)=>{const child=spawn(process.execPath,args,{cwd:directory,env:{...process.env,RAVELDEX_SCHEDULING_SAMPLES:String(samples)},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);child.on('error',no);child.on('close',yes);});await writeFile(join(output,name+'.txt'),log);report.runs.push({variant,size,owner,mode,output:name+'.json',exitCode:code,command:[process.execPath,...args]});await writeFile(join(output,'progress.json'),JSON.stringify(report,null,2)+'\n');assert.equal(code,0,name+' failed');console.log(JSON.stringify({name,exitCode:code}));
    }
    const rows=[];for(const run of report.runs)rows.push({...JSON.parse(await readFile(join(output,run.output),'utf8')),variant:run.variant,size:run.size,owner:run.owner,execution:process.env.RAVELDEX_SCHEDULING_FALLBACK==='1'?'node-direct-timer-fallback':'node-direct'});
    assert.equal(new Set(rows.map(row=>row.pid)).size,rows.length,'fresh child per owner');report.parity=validateScheduling(rows,samples);report.summaries=summarizeScheduling(rows);report.outcome='Pass';
  }catch(error){report.outcome='Fail';report.failure={name:error.name,message:error.message};throw error;}
  finally{try{await finishScheduling(packages,harness);}catch(error){report.outcome='Fail';report.guardFailure=error.message;throw error;}finally{report.finishedAt=new Date().toISOString();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
