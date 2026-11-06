// No builds, installs, network, or runtime source edits. Pass an isolated installed consumer.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile, readdir, realpath, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus, release, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';
import { instrumentPackage } from './instrument.mjs';
import { FAMILIES, SIZES, workloadFor, verifyFrozen } from './workloads.mjs';
export const digest = value => createHash('sha256').update(value).digest('hex');
export async function inventory(directory) {
  const rows = [];
  async function walk(path = '') { for (const entry of (await readdir(join(directory, path), { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    const name = join(path, entry.name); assert.ok(!entry.isSymbolicLink(), 'No workspace symlink');
    if (entry.isDirectory()) await walk(name); else { const bytes = await readFile(join(directory, name)); rows.push({ path: name, bytes: bytes.length, sha256: digest(bytes) }); }
  } }
  await walk(); return rows;
}
export function summaries(rows) {
  const groups = new Map();
  for (const row of rows) for (const sample of row.samples) {
    const key = JSON.stringify([row.family,row.size,sample.operation,sample.phase ?? null]);
    if (!groups.has(key)) groups.set(key,{ family: row.family, size: row.size, operation: sample.operation, phase: sample.phase ?? null, samples: [] });
    groups.get(key).samples.push(sample);
  }
  return [...groups.values()].map(({samples,...key}) => {
    const pass = samples.filter(row => row.outcome === 'Pass');
    assert.ok(pass.every(row => [row.wallMs,row.cpuUserMs,row.cpuSystemMs].every(value => Number.isFinite(value) && value >= 0)), 'invalid timing');
    const sorted = pass.map(row => row.wallMs).sort((a,b) => a-b);
    const m = Math.floor(sorted.length/2);
    return { ...key, attempts: samples.length, outcomes: Object.fromEntries([...new Set(samples.map(row=>row.outcome))].map(outcome=>[outcome,samples.filter(row=>row.outcome===outcome).length])),
      medianWallMs: sorted.length ? sorted.length%2 ? sorted[m] : (sorted[m-1]+sorted[m])/2 : null,
      observedMaximumWallMs: sorted.at(-1) ?? null, cpuSamples: pass.map(({cpuUserMs,cpuSystemMs})=>({cpuUserMs,cpuSystemMs})),
      tail: 'Observed maximum only; insufficient samples for p95 claims. Failed samples retained separately, never treated as zero.' };
  });
}
export function requireCoverage(row) {
  const operations=[...row.samples,...row.observations];
  assert.equal(operations.filter(s=>s.operation.startsWith('query:')).length,8*(row.mode==='normal'?2:1),'missing expected query rows');
  assert.equal(operations.find(s=>s.operation==='build')?.outcome,'Pass','admitted build required');
  assert.equal(new Set(operations.filter(s=>s.operation.startsWith('query:')).map(s=>s.operation)).size,8,'missing unique query rows');
}
async function main() {
  assert.ok(process.argv[2] && process.argv[3], 'Pass installed consumer and fresh output directory');
  const consumer = await realpath(resolve(process.argv[2])), output = resolve(process.argv[3]);
  await mkdir(output); // Fail rather than overwrite an earlier run.
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), pkg = join(consumer,'node_modules/@vmitsaras/raveldex');
  const metadata = JSON.parse(await readFile(join(pkg,'package.json'),'utf8'));
  assert.equal(metadata.name,'@vmitsaras/raveldex'); assert.deepEqual(metadata.dependencies ?? {},{});
  const before = await inventory(pkg), diagnostic = join(output,'diagnostic-consumer');
  await mkdir(join(diagnostic,'node_modules/@vmitsaras'), {recursive:true});
  await cp(pkg, join(diagnostic,'node_modules/@vmitsaras/raveldex'), {recursive:true});
  await writeFile(join(diagnostic,'package.json'), JSON.stringify({private:true,type:'module'}));
  const instrumentation = await instrumentPackage(join(diagnostic,'node_modules/@vmitsaras/raveldex'));
  await copyFile(join(repo,'bench/n9/child.mjs'), join(consumer,'n9-child.mjs'));
  await copyFile(join(repo,'bench/n9/child.mjs'), join(diagnostic,'n9-child.mjs'));
  const sizes = process.env.RAVELDEX_N9_SIZES?.split(',').map(Number) ?? SIZES;
  const families = process.env.RAVELDEX_N9_FAMILIES?.split(',') ?? FAMILIES;
  assert.ok(sizes.every(size=>SIZES.includes(size)) && families.every(family=>FAMILIES.includes(family)));
  const harness = [];
  for (const path of ['bench/n9/run.mjs','bench/n9/child.mjs','bench/n9/instrument.mjs','bench/n9/workloads.mjs','test/fixtures/n9/freeze.json','test/fixtures/relevance/corpus.json']) harness.push({path,sha256:digest(await readFile(join(repo,path)))});
  const report = { kind:'rx8002-matched-v1', startedAt:new Date().toISOString(), sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),
    sourceDiffSha256:digest(execFileSync('git',['diff','--binary'],{cwd:repo,maxBuffer:20*1024*1024})),
    harness, package:metadata, packageInventory:before, packageInventorySha256:digest(JSON.stringify(before)), instrumentation,
    environment:{node:process.version,versions:process.versions,platform:process.platform,arch:process.arch,release:release(),cpu:cpus()[0]?.model,logicalCPUs:cpus().length,systemBytes:totalmem()},
    method:{sizes,families,ownersPerWorkload:3,normalOwners:2,diagnosticOwners:1,batchSize:256,deadlineMs:60000,requestedPage:{limit:20,offset:0},
      timing:'Separate fresh child processes, each one fresh source+phrase owner. Two uninstrumented owners with first/repeated call per query; no discarded warmups. Module imports and fixture generation precede timing. CPU user/system and monotonic wall are distinct. Restore receiver fresh with one prior record.',
      rotation:'Normal/diagnostic order cyclically rotated across workload cells; cells reversed in second and third rounds. Sequential processes, no concurrent benchmark work.',
      diagnostics:'Only throwaway package copy patched. Diagnostic wall/CPU retained exclusively as intrusive observations, excluded from timing summaries. No guessed overhead subtraction.',
      matching:'Independent complete expected membership pinned; measured pages checked for exact total, complete flag, unique eligible finite-score hits. Exact native page scores/order/revisions compared across normal and diagnostic variants. Full corpus ranked membership is not paged exhaustively.',
      scope:'Node direct source+source phrases only. Browser/worker/UI configurations Not run; unknown outcome classification is supported but no transport exists in this track. No memory or capacity/performance improvement claim.'},
    workloadIdentities:families.flatMap(family=>sizes.map(size=>({family,size,identity:verifyFrozen(workloadFor(family,size)).identity}))), runs:[] };
  const cells = families.flatMap(family=>sizes.map(size=>({family,size})));
  await writeFile(join(output,'start.json'),JSON.stringify(report,null,2)+'\n');
  for(let round=0;round<3;round++) {
    const ordered = round ? [...cells].reverse() : cells;
    for(const cell of ordered) {
      const index=cells.findIndex(row=>row.family===cell.family && row.size===cell.size);
      const mode=(round+index)%3===1?'diagnostic':'normal', directory=mode==='normal'?consumer:diagnostic;
      const name=`${cell.family}-${cell.size}-${round}-${mode}`, file=join(output,name+'.json');
      const args=[join(directory,'n9-child.mjs'),pathToFileURL(join(repo,'bench/n9/workloads.mjs')).href,pathToFileURL(join(repo,'bench/n9/instrument.mjs')).href,cell.family,String(cell.size),mode,file,String(round)];
      let stdout='',stderr=''; const startedAt=new Date().toISOString();
      const code = await new Promise((yes,no)=>{const child=spawn(process.execPath,args,{cwd:directory,stdio:['ignore','pipe','pipe']}); child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.on('error',no);child.on('close',yes);});
      await writeFile(join(output,name+'.txt'),stdout+stderr);
      report.runs.push({ ...cell, round, mode, command:[process.execPath,...args], startedAt, exitCode:code, output:name+'.json', log:name+'.txt' });
      await writeFile(join(output,'progress.json'),JSON.stringify(report,null,2)+'\n');
      assert.equal(code,0,name+' failed: '+stderr);
      console.log(JSON.stringify({name,exitCode:code}));
    }
  }
  const rows=await Promise.all(report.runs.map(row=>readFile(join(output,row.output),'utf8').then(JSON.parse)));
  report.parity=[];
  for(const cell of cells) {
    const selected=rows.filter(row=>row.family===cell.family&&row.size===cell.size);
    assert.equal(selected.length,3);
    const canonical=selected.find(row=>row.mode==='normal');
    for(const row of selected) requireCoverage(row);
    for(const row of selected) for(const sample of [...row.samples,...row.observations].filter(s=>s.operation.startsWith('query:'))) {
      const reference=canonical.samples.find(s=>s.operation===sample.operation);
      if(sample.result && reference.result) assert.deepEqual(sample.result,reference.result);
      else assert.deepEqual(sample.error,reference.error);
    }
    report.parity.push({...cell,owners:selected.length,exactPageResults:true});
  }
  report.summaries=summaries(rows.filter(row=>row.mode==='normal'));
  const after=await inventory(pkg); assert.deepEqual(after,before); report.normalPackageUnchanged=true;
  for(const file of harness) assert.equal(digest(await readFile(join(repo,file.path))),file.sha256,'harness drift');
  report.finishedAt=new Date().toISOString(); report.outcome='Pass';
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
