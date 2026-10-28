// Public installed-package work; version-pinned native runtime instrumentation.
// All parsing/hash/file work follows Stop. No private engine/root mutation.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { recordsFor, updatedRecord, schema, QUERY_ROWS, checkPage } from './cost-fixture.mjs';
const require = createRequire(import.meta.url);
const trace = require('internal/test/binding').internalBinding('v8');
const [mode, rawSize, role, directory, output, input = '', format = '', rawCapacity = '262144', rawChanged = 'true', phase = 'all'] = process.argv.slice(2);
const size = Number(rawSize), capacity = Number(rawCapacity), inputChanged = rawChanged === 'true';
assert.ok(['core-only','source-phrase','positions-offsets'].includes(mode));
assert.ok([1000,10000].includes(size)); assert.ok(['producer','receiver'].includes(role)); assert.ok(['all','mutation'].includes(phase));
assert.ok(Number.isInteger(capacity) && capacity > 0 && capacity <= 1000000);
const report = { schema:'raveldex-managed-workload-child-v2', mode,size,role,phase,capacity,pid:process.pid,
  runtime:{execPath:process.execPath,execArgv:process.execArgv,versions:process.versions,platform:process.platform,arch:process.arch},
  scopes:{managed:'New monitored main-thread non-filler allocation extents in declared no-GC runtime variant, including host/admission/promises/harness; no exclusive-stage, retained, process or physical peak claim.',endpoints:'process.memoryUsage before/after only; not peaks or exclusive ownership.'},
  operations:[],verification:[],exports:[],errors:[],outcome:'Running' };
let engine, snapshotModule, addons = [], active = false;
const {createRaveldex} = await import('@vmitsaras/raveldex');
if (mode === 'source-phrase') {
  const p = await import('@vmitsaras/raveldex/addons/phrases');
  addons = [p.createSourceProvider({fields:['body']}),p.createSourcePhrases({fields:['body']})];
} else if (mode === 'positions-offsets') {
  const p = await import('@vmitsaras/raveldex/addons/positions');
  const q = await import('@vmitsaras/raveldex/addons/phrases/positions');
  addons = [p.createPositionProvider({fields:['body'],offsets:['body']}),q.createPositionPhrases({fields:['body']})];
}
if (mode !== 'core-only') snapshotModule = await import('@vmitsaras/raveldex/adapters/snapshots');
function owner() {
  if (!snapshotModule) return createRaveldex({schema,addons});
  const qualification = {profileId:'rx4002-calibrated-28d5845f1e59-ascii-v1',scope:'exact-node-runtime',environment:snapshotModule.currentNodeSnapshotEnvironment(),
    evidence:['docs/evidence/RX-4002-runtime-instrumentation-20261028.md','docs/evaluation/RX-4002-memory-method.md']};
  report.qualification = qualification;
  return snapshotModule.createSnapshotRaveldex({schema,addons},{nativeQualification:qualification});
}
function footer(file) {
  const length = statSync(file).size, fd = openSync(file,'r');
  const bytes = Buffer.alloc(Math.min(8192,length));
  try { assert.equal(readSync(fd,bytes,0,bytes.length,length-bytes.length),bytes.length); }
  finally { closeSync(fd); }
  const last = JSON.parse(bytes.toString('utf8').trim().split('\n').at(-1));
  assert.equal(last.record,'summary'); return last;
}
function sanitized(error) { return {name:error?.name??null,code:error?.code??null,reason:error?.reason??null,message:error?.message??String(error)}; }
function resource(error) { return ['RaveldexError','SnapshotAdapterError'].includes(error?.name) && ['DEADLINE_EXCEEDED','WORK_LIMIT_EXCEEDED','LIMIT_EXCEEDED','RESOURCE_EXHAUSTED'].includes(error?.code); }
async function observe(name, call) {
  // The row, path and baseline reading are prepared before native registration.
  const file = join(directory,name+'.jsonl');
  const row = {name,file,publicOutcome:'Running',measurement:'Running',memoryBefore:null}; report.operations.push(row);
  global.gc(); row.memoryBefore = process.memoryUsage();
  let value,error;
  try {
    trace.managedAllocationTraceStart(file,capacity); active = true;
    trace.managedAllocationTraceMark(100);
    try { value = await call(); } catch (caught) { error = caught; }
    trace.managedAllocationTraceMark(101);
  } finally {
    if (active) { row.status = trace.managedAllocationTraceStop(); active = false; }
  }
  row.memoryAfter = process.memoryUsage(); row.summary = footer(file);
  assert.equal(row.status === 0,row.summary.valid_no_gc_window);
  row.measurement = row.status === 0 ? 'Valid guarded window' : 'Invalid measurement window';
  row.publicOutcome = !error ? 'Pass' : resource(error) ? 'RejectedOutcome' : 'Fail';
  if (error) row.error = sanitized(error);
  if (error && !resource(error)) throw error;
  return {value,error,row};
}
async function verify(changed,revision) {
  // Independent literal ASCII fixture predicates; no production tokenizer/scorer.
  const records = recordsFor(size); if (changed) records[0] = updatedRecord;
  const all = await engine.search({kind:'all'},{limit:20,deadlineMs:60000});
  assert.equal(all.total,size); assert.equal(all.completeness,'complete'); assert.equal(all.revision,revision);
  assert.deepEqual(all.hits.map(hit=>hit.id),records.slice(0,20).map(record=>record.id));
  const checks = [{name:'all',total:all.total,revision,first20LiteralIds:true}];
  for (const query of QUERY_ROWS.filter(row => row.requires !== 'phrases' || mode !== 'core-only')) {
    const result = await engine.search(query.query,{limit:20,deadlineMs:60000});
    const checked = checkPage(result,records,query); assert.equal(checked.revision,revision); checks.push({name:query.name,...checked});
  }
  report.verification.push({changed,revision,checks,scope:'Exact fixture totals/revisions and literal eligible unique finite-score first pages; not a full-ID ranking oracle.'});
}
async function verifyPrior(before) {
  const after = await engine.search({kind:'all'},{limit:20,deadlineMs:60000});
  assert.deepEqual(after,before); report.verification.push({priorStatePreserved:true,revision:after.revision,total:after.total,ids:after.hits.map(hit=>hit.id)});
}
try {
  engine = owner();
  if (role === 'producer') {
    let corpus = recordsFor(size);
    for (let i=0;i<size;i+=256) await engine.addMany(corpus.slice(i,i+256),{deadlineMs:60000});
    corpus = undefined;
    const built = Math.ceil(size/256); await verify(false,built);
    const empty = await observe('empty-batch',()=>engine.addMany([],{deadlineMs:60000}));
    assert.equal(empty.error,undefined); assert.equal(empty.value.changed,false); assert.equal(empty.value.revision,built);
    const mutation = await observe('replace-one',()=>engine.replace(updatedRecord,{deadlineMs:60000}));
    const changed = !mutation.error; report.changed = changed;
    const revision = built + Number(changed);
    if (changed) { assert.equal(mutation.value.changed,true); assert.equal(mutation.value.revision,revision); }
    await verify(changed,revision);
    if (snapshotModule && phase === 'all') {
      const snapshots = snapshotModule.createSnapshots(engine);
      for (const format of (mode === 'source-phrase' ? ['native','source'] : ['native'])) {
        const encoded = await observe('export-'+format,()=>format==='native'?snapshots.exportNative({deadlineMs:60000}):snapshots.exportSource({deadlineMs:60000}));
        if (!encoded.error) {
          const path = join(directory,'encoded-'+format+'.json');
          writeFileSync(path,encoded.value,{flag:'wx'});
          report.exports.push({format,path,originRevision:revision,changed,codeUnits:encoded.value.length,utf8Bytes:Buffer.byteLength(encoded.value),lengthsAreNotMemory:true});
        } else report.exports.push({format,outcome:'RejectedOutcome',error:sanitized(encoded.error)});
      }
      await verify(changed,revision);
    } else report.exports.push({outcome:'Not Applicable',reason:!snapshotModule?'Core-only imports no snapshot adapter or optional provider.':'Mutation-only repetition; codec discovery already retained separately.'});
  } else {
    assert.notEqual(mode,'core-only'); assert.ok(['source','native'].includes(format));
    const encoded = readFileSync(input,'utf8');
    await engine.add({id:'prior',text:{body:'prior receiver state'},metadata:{group:'prior'}},{deadlineMs:60000});
    const prior = await engine.search({kind:'all'},{limit:20,deadlineMs:60000});
    assert.equal(prior.total,1); assert.equal(prior.revision,1);
    const restored = await observe('restore-'+format,()=>snapshotModule.createSnapshots(engine).restore(encoded,{deadlineMs:60000}));
    if (!restored.error) {
      assert.equal(restored.value.format,'raveldex-'+format); assert.equal(restored.value.reindexed,format==='source');
      assert.equal(restored.value.originRevision,Math.ceil(size/256)+Number(inputChanged)); assert.equal(restored.value.revision,2);
      report.restore = restored.value; await verify(inputChanged,2);
    } else await verifyPrior(prior);
  }
  report.outcome = report.operations.some(row=>row.publicOutcome==='RejectedOutcome') ? 'ObservedWithRejectedOperation' :
    report.operations.every(row=>row.status===0) ? 'ObservedValidWindows' : 'PublicPass_InstrumentationInvalid';
} catch (error) {
  report.outcome = 'Fail'; report.errors.push(sanitized(error)); process.exitCode = 1;
} finally {
  if (active) { try { report.finalStopStatus = trace.managedAllocationTraceStop(); } catch (error) { report.errors.push(sanitized(error)); } active=false; }
  try { await engine?.dispose(); report.disposed = true; } catch (error) { report.errors.push({stage:'dispose',...sanitized(error)});report.disposed=false;process.exitCode=1; }
  writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
console.log(JSON.stringify({mode,size,role,outcome:report.outcome,operations:report.operations.map(row=>({name:row.name,publicOutcome:row.publicOutcome,measurement:row.measurement,events:row.summary?.events,dropped:row.summary?.dropped_events,gc:row.summary?.gc_prologues})),output}));
