// RX-9001: bounded actual installed-artifact orchestration. No build/install/network.
import assert from 'node:assert/strict';
import { cp, copyFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { cpus, release, totalmem } from 'node:os';
import { inventory } from '../n9/run.mjs';
import { instrumentPackage } from '../n9/instrument.mjs';
import { compareCaptures, summarizeRows } from '../n9/paired-node.mjs';
import { verifyFrozen, workloadFor } from '../n9/workloads.mjs';
import { CONTRACT, CONTRACT_SHA256, hash, jobKey, plan } from './contract.mjs';
export { CONTRACT, CONTRACT_SHA256, jobKey, plan } from './contract.mjs';

const SHA = /^[a-f0-9]{64}$/u, COMMIT = /^[a-f0-9]{40}$/u;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HARNESS = ['bench/n10/run.mjs', 'bench/n10/contract.mjs', 'bench/n10/child.mjs', 'bench/n9/run.mjs', 'bench/n9/paired-node.mjs', 'bench/n9/workloads.mjs', 'bench/n9/instrument.mjs', 'bench/n9/bulk-verify.mjs', 'test/fixtures/n9/freeze.json', 'test/fixtures/relevance/corpus.json', 'docs/evaluation/RX-9001-method.json', 'docs/evaluation/RX-9001-method.md'];
const SOURCE_PINS = {reviewedCurrent:'5b40646c5da11ba7c5bde32148632a3a6e7e3d3c',preN9:'919c9ed133b1dd004e3059cb15ddac18f474ef08',acceptedN9:'6d00200697074749f077706e3f7fa0ff3162d247'};
const PINNED = { reviewedCurrent:'45747067b227db1f2238381241997e9ea3dfb687dcb1daa91196927be6494f3b', preN9: '3f4f31eb03951f13366256dd019710f0bd5c58b29d7ae687d8a96f0ea5ecec11', acceptedN9: '1d7dab63dbbd9bee7dd67394dd6893c227711caad471d448a02e704c91225fbe' };
export function validateManifest(manifest) {
  assert.equal(manifest?.kind, 'rx9001-artifacts-v1'); assert.match(manifest.source?.head ?? '', COMMIT, 'source HEAD required');
  assert.notEqual(manifest.pendingFreshCandidate, true, 'fresh candidate still pending');
  assert.equal(manifest.provisional, false, 'final artifact freeze required'); assert.equal(manifest.freshCurrentCandidate, true, 'fresh candidate required');
  const env=manifest.environment?.node; assert.equal(typeof env?.node,'string'); assert.ok(env.versions && typeof env.versions==='object'); assert.equal(typeof env.platform,'string'); assert.equal(typeof env.arch,'string'); assert.equal(typeof env.execPath,'string'); assert.equal(env.executable?.status,'Observed'); assert.match(env.executable.sha256??'',SHA);
  assert.ok(Array.isArray(manifest.artifacts));
  assert.equal(new Set(manifest.artifacts.map(a => a.role)).size, manifest.artifacts.length, 'duplicate artifact roles');
  assert.ok(manifest.artifacts.every(a => [...CONTRACT.roles, 'reviewedCurrent'].includes(a.role)), 'unexpected artifact role');
  for (const role of CONTRACT.roles) assert.ok(manifest.artifacts.some(a=>a.role===role), 'missing artifact '+role);
  for (const a of manifest.artifacts) {
    const role=a.role;
    assert.notEqual(a.pendingFreshCandidate, true, 'fresh candidate still pending');
    assert.match(a.sha256 ?? '', SHA); if (PINNED[role]) assert.equal(a.sha256, PINNED[role], 'historical artifact pin');
    assert.ok(typeof a.archive === 'string' && a.archive.startsWith('/')); if (CONTRACT.roles.includes(role)) assert.ok(typeof a.consumer === 'string' && a.consumer.startsWith('/'));
    assert.ok(a.source && typeof a.source === 'object', 'artifact source attribution required');
    assert.match(a.source.commit ?? '', COMMIT, 'artifact source commit required');
    assert.equal(a.source.commit, SOURCE_PINS[role] ?? manifest.source.head, 'artifact source attribution mismatch');
    assert.ok(Array.isArray(a.members) && a.members.length > 0); const paths = new Set();
    for (const m of a.members) { assert.ok(typeof m.path === 'string' && m.path && !m.path.startsWith('/') && !m.path.includes('\\') && m.path.split('/').every(p => p && p !== '.' && p !== '..'), 'unsafe member path'); assert.ok(!paths.has(m.path), 'duplicate member'); paths.add(m.path); assert.ok(Number.isSafeInteger(m.bytes) && m.bytes >= 0); assert.match(m.sha256 ?? '', SHA); }
  }
  return manifest;
}
export async function verifyEnvironment(environment) {
  const n=environment?.node; assert.ok(n,'frozen Node environment required');
  assert.equal(n.node,process.version,'Node version changed'); assert.deepEqual(n.versions,process.versions,'Node runtime versions changed'); assert.equal(n.execPath,process.execPath,'Node executable path changed'); assert.equal(n.platform,process.platform); assert.equal(n.arch,process.arch);
  assert.equal(n.executable?.status,'Observed'); assert.equal(n.executable.realPath,await realpath(process.execPath),'Node executable identity changed'); assert.equal(n.executable.sha256,hash(await readFile(process.execPath)),'Node executable bytes changed');
  if(n.hardware) {assert.deepEqual(n.hardware.cpuModels,[...new Set(cpus().map(c=>c.model))]);assert.equal(n.hardware.logicalCpuCount,cpus().length);assert.equal(n.hardware.totalMemoryBytes,totalmem());}
  if(environment.uname?.release)assert.equal(environment.uname.release,release(),'OS release changed');
}
const normalizeMembers = rows => [...rows].sort((a,b)=>a.path.localeCompare(b.path));
const memberHash = rows => hash(normalizeMembers(rows));
const workloads = new Map();
function frozen(family, size) { const key = `${family}:${size}`; if (!workloads.has(key)) workloads.set(key, verifyFrozen(workloadFor(family, size))); return workloads.get(key); }
function dataFor(row) { return row.mode === 'normal' ? row.samples : row.observations; }
const timing = item => assert.ok([item.wallMs, item.cpuUserMs, item.cpuSystemMs].every(x => Number.isFinite(x) && x >= 0), 'invalid timing');
function refusal(item) { assert.equal(item.outcome, 'Refused'); assert.ok(['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED', 'LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(item.error?.code), 'unexpected recovery error'); }
function queryCapture(row, item, query, workload) {
  const capture = row.resultCaptures[item.resultSha256]; assert.ok(capture, 'missing result capture'); assert.equal(hash(capture), item.resultSha256, 'capture hash drift');
  assert.equal(Object.hasOwn(capture, 'result') !== Object.hasOwn(capture, 'error'), true, 'capture exactly one outcome');
  if (capture.error) {
    assert.equal(item.outcome, 'Refused'); assert.deepEqual(item.error, capture.error); assert.equal(item.result, undefined);
    if (query.expectedError) { assert.equal(capture.error.code, query.expectedError.code); assert.equal(capture.error.details?.path, query.expectedError.path); }
    else assert.ok(['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED'].includes(capture.error.code), 'unexpected query error');
  } else {
    assert.equal(query.expectedError, undefined); assert.equal(item.outcome, 'Pass'); assert.equal(item.error, undefined);
    const result = capture.result, ids = new Set(query.expectedIds); assert.equal(result.completeness, 'complete'); assert.equal(result.model, 'raveldex-bm25-v1'); assert.equal(result.revision, Math.ceil(workload.size / 256)); assert.equal(result.total, ids.size);
    assert.ok(Array.isArray(result.hits)); assert.equal(result.hits.length, Math.min(20, ids.size)); assert.equal(new Set(result.hits.map(h => h.id)).size, result.hits.length);
    assert.ok(result.hits.every(h => ids.has(h.id) && Number.isFinite(h.score)), 'independent membership/finite-score gate');
  }
  return capture;
}
/** Complete matrix validation never accepts a reduced environment-selected matrix. */
export function validateRows(rows, { profile, manifest, manifestSha256, harnessSha256 }) {
  validateManifest(manifest); assert.match(manifestSha256, SHA); assert.match(harnessSha256, SHA);
  const jobs = plan(profile), expected = new Map(jobs.map(j => [jobKey(j), j]));
  assert.equal(rows.length, jobs.length, 'missing/extra matrix rows'); assert.equal(new Set(rows.map(r => r.pid)).size, rows.length, 'fresh process per row');
  const seen = new Set(), captures = new Map(), comparisons = [];
  for (const row of rows) {
    const key = jobKey(row), job = expected.get(key); assert.ok(job && !seen.has(key), 'missing/duplicate/unexpected cell'); seen.add(key);
    assert.equal(row.kind, 'rx9001-node-child-v1'); assert.equal(row.outcome, 'Collected'); assert.ok(Number.isSafeInteger(row.pid) && row.pid > 0);
    for (const name of ['profile', 'family', 'size', 'deadline', 'role', 'mode', 'owner', 'deadlineOptions']) assert.deepEqual(row[name], job[name], 'job/configuration drift: ' + name);
    assert.equal(row.requestedSamples, job.samples); assert.equal(row.requestedWarmups, job.warmups);
    assert.equal(row.contractSha256, CONTRACT_SHA256); assert.equal(row.artifactManifestSha256, manifestSha256); assert.equal(row.harnessSha256, harnessSha256);
    const artifact = manifest.artifacts.find(a => a.role === job.role);
    assert.equal(row.artifactSha256, artifact.sha256); assert.deepEqual(row.artifactSource, artifact.source); assert.equal(row.packageInventorySha256, memberHash(artifact.members));
    assert.equal(row.packageMetadataSha256, artifact.members.find(m=>m.path==='package.json')?.sha256); assert.equal(row.runtime?.node,process.version);
    assert.equal(row.configurationSha256, hash(CONTRACT.configuration));
    assert.equal(row.variant, row.role); const workload = frozen(row.family, row.size); assert.deepEqual(row.identity, workload.identity, 'workload hash drift');
    const data = dataFor(row), hidden = row.mode === 'normal' ? row.observations : row.samples;
    assert.ok(Array.isArray(data) && Array.isArray(hidden)); assert.equal(hidden.length, 0, 'hidden measurement lane');
    assert.equal(data.length, 3 + workload.queries.length * job.samples, 'missing/extra operations');
    assert.ok(Array.isArray(row.warmups)); assert.equal(row.warmups.length, workload.queries.length * job.warmups);
    for (const w of row.warmups) { assert.ok(['Pass','Refused'].includes(w.outcome),'unexpected warmup outcome'); }
    for (const w of row.warmups) for (const k of ['wallMs', 'cpuUserMs', 'cpuSystemMs', 'counters']) assert.equal(w[k], undefined, 'measured warmup');
    for (const item of data) {
      if (item.outcome === 'Not run') { assert.equal(item.operation, 'restoreSource'); assert.ok(typeof item.reason === 'string' && item.reason); for (const k of ['wallMs', 'cpuUserMs', 'cpuSystemMs', 'counters', 'error', 'result']) assert.equal(item[k], undefined, 'Not run contains measured fields'); continue; }
      timing(item);
      if (row.mode === 'normal') assert.equal(item.counters, undefined, 'hidden normal instrumentation');
      else { assert.ok(item.counters); for (const k of ['emittedSteps', 'emittedWorkUnits', 'hostYields']) assert.ok(Number.isSafeInteger(item.counters[k]) && item.counters[k] >= 0, 'missing diagnostics'); }
    }
    for (const op of ['build', 'exportSource', 'restoreSource']) assert.equal(data.filter(x => x.operation === op).length, 1, 'missing/duplicate ' + op);
    const built = data.find(x => x.operation === 'build'); assert.equal(built.outcome, 'Pass'); assert.equal(built.error, undefined); assert.equal(built.result?.revision, Math.ceil(row.size / 256));
    for (const query of workload.queries) {
      const actual = data.filter(x => x.operation === 'query:' + query.id), warm = row.warmups.filter(x => x.operation === 'query:' + query.id);
      assert.equal(actual.length, job.samples); assert.deepEqual(actual.map(x => x.repetition).sort((a,b) => a-b), Array.from({length:job.samples}, (_,i)=>i));
      assert.deepEqual(warm.map(x => x.repetition).sort((a,b)=>a-b), Array.from({length:job.warmups},(_,i)=>i));
      for (const item of actual) {
        assert.equal(item.phase, row.mode === 'diagnostic' ? 'diagnostic-first-call' : job.warmups ? 'after-two-warmups' : item.repetition ? 'repeat-same-owner' : 'first-call-for-query');
        const capture = queryCapture(row, item, query, workload), scope = JSON.stringify([row.family, row.size, row.deadline, query.id]);
        const list = captures.get(scope) ?? []; list.push({row, capture}); captures.set(scope, list);
      }
    }
    const exported = data.find(x => x.operation === 'exportSource'), restored = data.find(x => x.operation === 'restoreSource');
    if (exported.outcome === 'Pass') {
      assert.equal(exported.error, undefined); assert.match(exported.result?.encodedSha256 ?? '', SHA); assert.ok(Number.isSafeInteger(exported.result.encodedBytes) && exported.result.encodedBytes > 0);
      if (restored.outcome === 'Pass') { assert.equal(restored.error, undefined); assert.equal(restored.result?.revision, 2); assert.equal(restored.result?.originRevision, Math.ceil(row.size / 256)); assert.equal(restored.completeSource?.records, row.size); }
      else { refusal(restored); assert.equal(restored.oldStatePreserved, true); }
    } else { refusal(exported); assert.equal(restored.outcome, 'Not run'); }
  }
  assert.equal(seen.size, expected.size);
  for (const [scope, list] of captures) {
    // A refusal cannot become the reference when any actual success exists.
    const reference = list.find(x => x.capture.result)?.capture ?? list[0].capture;
    for (const {row, capture} of list) comparisons.push({scope:JSON.parse(scope), role:row.role, owner:row.owner, mode:row.mode, relation:compareCaptures(reference, capture)});
  }
  return comparisons;
}
export function summarize(rows) {
  // Preserve the deadline dimension; historical summaries do not know it.
  return CONTRACT.deadlines.flatMap(d => summarizeRows(rows.filter(r => r.deadline === d.id)).map(s => ({deadline:d.id, ...s})));
}
async function filePins(paths) { return Promise.all(paths.map(async path => ({path, sha256:hash(await readFile(join(ROOT,path)))}))); }
function childRun(args, cwd, milliseconds) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, {cwd, stdio:['ignore','pipe','pipe']}); let text = '', timedOut = false, kill;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); kill = setTimeout(() => child.kill('SIGKILL'), 1000); }, milliseconds);
    child.stdout.on('data', b => text += b); child.stderr.on('data', b => text += b);
    child.on('error', error => { clearTimeout(timer); clearTimeout(kill); reject(error); });
    child.on('close', (code, signal) => { clearTimeout(timer); clearTimeout(kill); resolveRun({code, signal, timedOut, text}); });
  });
}
export async function run({artifacts:manifestPath, profile, output}) {
  const jobs = plan(profile); output = resolve(output); await mkdir(output); // Never overwrite failures.
  const began = performance.now(), deadline = began + CONTRACT[profile].totalMs;
  const report = {kind:'rx9001-node-run-v1', profile, contract:CONTRACT, contractSha256:CONTRACT_SHA256, startedAt:new Date().toISOString(), outcome:'Running', intendedPerformanceCollection:profile === 'full', acceptedPerformanceEvidence:false, semanticArithmetic:'Separate full-page/arithmetic lane required; timed captures do not establish it.', runs:[]};
  const packages = {}, configs = []; let pins, manifestBytes, manifest, harnessSha256;
  const rows = [];
  try {
    manifestBytes = await readFile(manifestPath); manifest = validateManifest(JSON.parse(manifestBytes));
    report.artifactManifestSha256 = hash(manifestBytes); report.artifacts = manifest;
    for (const a of manifest.artifacts) assert.equal(hash(await readFile(a.archive)),a.sha256,'archive bytes drift');
    await verifyEnvironment(manifest.environment);
    pins = await filePins(HARNESS); harnessSha256 = hash(pins); report.harness = pins; report.harnessSha256 = harnessSha256;
    report.environment = {node:process.version, versions:process.versions, platform:process.platform, arch:process.arch, release:release(), cpu:cpus()[0]?.model, logicalCPUs:cpus().length, systemBytes:totalmem()};
    for (const role of CONTRACT.roles) {
      const artifact = manifest.artifacts.find(a => a.role === role), input = await realpath(artifact.consumer), root = join(input,'node_modules/@vmitsaras/raveldex'); assert.equal(await realpath(root),root);
      assert.equal(hash(await readFile(artifact.archive)), artifact.sha256, 'archive bytes drift');
      const members = await inventory(root); assert.deepEqual(normalizeMembers(members),normalizeMembers(artifact.members),'installed artifact bytes drift');
      const metadata = JSON.parse(await readFile(join(root,'package.json'),'utf8')); assert.equal(metadata.name,'@vmitsaras/raveldex'); assert.equal(metadata.private,true); assert.equal(metadata.version,'0.1.0-rc.0'); assert.deepEqual(metadata.dependencies??{},{});
      const contexts = {}; packages[role] = {input,root,members,contexts};
      for (const mode of ['normal','diagnostic']) {
        const directory = join(output,role+'-'+mode), copy = join(directory,'node_modules/@vmitsaras/raveldex'); await mkdir(dirname(copy),{recursive:true}); await cp(root,copy,{recursive:true});
        await writeFile(join(directory,'package.json'),JSON.stringify({private:true,type:'module'}));
        const instrumentation = mode === 'diagnostic' ? await instrumentPackage(copy) : null;
        for (const [source, destination] of [['bench/n10/child.mjs','n10-child.mjs'],['bench/n9/bulk-verify.mjs','n9-bulk-verify.mjs']]) await copyFile(join(ROOT,source),join(directory,destination));
        contexts[mode] = {directory,root:copy,members:await inventory(copy),instrumentation};
      }
      packages[role] = {input,root,members,contexts};
    }
    report.packages = packages; await writeFile(join(output,'start.json'),JSON.stringify(report,null,2)+'\n');
    for (const job of jobs) {
      const name = jobKey(job), file = join(output,name+'.json'), configFile = join(output,name+'.config.json'), artifact = manifest.artifacts.find(a => a.role === job.role);
      const config = {...job, contractSha256:CONTRACT_SHA256, artifactManifestSha256:report.artifactManifestSha256, harnessSha256, artifactSha256:artifact.sha256, artifactSource:artifact.source, packageInventorySha256:memberHash(artifact.members), configurationSha256:hash(CONTRACT.configuration)};
      await writeFile(configFile,JSON.stringify(config,null,2)+'\n'); configs.push({path:configFile,sha256:hash(await readFile(configFile))});
      assert.ok(performance.now() < deadline,'global collection budget exhausted');
      const directory = packages[job.role].contexts[job.mode].directory, args = [join(directory,'n10-child.mjs'), pathToFileURL(join(ROOT,'bench/n9/workloads.mjs')).href, pathToFileURL(join(ROOT,'bench/n9/instrument.mjs')).href, configFile, file];
      const result = await childRun(args,directory,Math.max(1,Math.min(CONTRACT[profile].perChildMs,deadline-performance.now())));
      await writeFile(join(output,name+'.txt'),result.text);
      report.runs.push({name,...job,command:[process.execPath,...args],exitCode:result.code,signal:result.signal,timedOut:result.timedOut,output:name+'.json'});
      await writeFile(join(output,'progress.json'),JSON.stringify(report,null,2)+'\n');
      assert.equal(result.timedOut,false,'child/global time budget exhausted: '+name); assert.equal(result.code,0,name+' failed');
      rows.push(JSON.parse(await readFile(file,'utf8'))); console.log(JSON.stringify({name,exitCode:result.code}));
    }
    report.comparisons = validateRows(rows,{profile,manifest,manifestSha256:report.artifactManifestSha256,harnessSha256}); report.summaries = summarize(rows); assert.ok(performance.now()<=deadline,'global collection budget exhausted'); report.outcome = 'Collected';
  } catch (error) { report.outcome = 'Fail'; report.failure = {name:error.name,message:error.message}; throw error; }
  finally {
    try {
      if (manifestBytes) assert.equal(hash(await readFile(manifestPath)),hash(manifestBytes),'artifact manifest changed during run');
      for (const [role,p] of Object.entries(packages)) {
        assert.deepEqual(await inventory(p.root),p.members,'input installed package changed'); const artifact=manifest.artifacts.find(a=>a.role===role); assert.equal(hash(await readFile(artifact.archive)),artifact.sha256);
        for (const context of Object.values(p.contexts)) { assert.deepEqual(await inventory(context.root),context.members,'staged package changed'); for (const [source,destination]of [['bench/n10/child.mjs','n10-child.mjs'],['bench/n9/bulk-verify.mjs','n9-bulk-verify.mjs']]) assert.equal(hash(await readFile(join(context.directory,destination))),pins.find(p=>p.path===source).sha256,'staged harness changed'); }
      }
      if (pins) assert.deepEqual(await filePins(HARNESS),pins,'harness/workload bytes changed');
      for (const pin of configs) assert.equal(hash(await readFile(pin.path)),pin.sha256,'child configuration changed');
      if (manifest && pins) await verifyEnvironment(manifest.environment);
      if (manifest) for(const a of manifest.artifacts) assert.equal(hash(await readFile(a.archive)),a.sha256,'archive bytes changed');
      report.guards = pins ? 'Pass' : 'Not run: preflight failed before harness freeze';
    } catch (error) { report.outcome='Fail'; report.guardFailure=error.message; throw error; }
    finally { report.finishedAt=new Date().toISOString(); report.elapsedMs=performance.now()-began; await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n'); }
  }
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2); assert.equal(args.length,6,'usage: --artifacts MANIFEST --profile pilot|full --output FRESH_DIRECTORY');
  assert.deepEqual([args[0],args[2],args[4]],['--artifacts','--profile','--output']); await run({artifacts:resolve(args[1]),profile:args[3],output:args[5]});
}
