// New isolated native codec observation. Never pack/install/network or overwrite
// earlier evidence. The parent alone parses finished main-isolate heaps.
import assert from 'node:assert/strict';
import { copyFile,mkdtemp,open,readFile,readdir,realpath,stat,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { analyzeCodecGraph } from './codec-graph.mjs';
import { runBoundedChild } from './restore-child.mjs';

assert.ok(process.argv[2]&&process.argv[3],'Supply existing installed consumer and NEW report path');
const consumer=await realpath(process.argv[2]),output=resolve(process.argv[3]),smoke=process.argv.includes('--smoke'),file=await open(output,'wx'),hash=b=>createHash('sha256').update(b).digest('hex');
const report={kind:'rx4002-native-codec-memory-v1',startedAt:new Date().toISOString(),consumer,output,
  method:{sizes:smoke?[1000]:[1000,10000],configuration:'source-phrase only',format:'native exact-local Node',repetitions:1,batchSize:256,deadlineMs:60000,
    process:'One fresh public producer then one separate fresh public receiver per size, serial. Imports, empty owner, input/prior/built baselines are separate; no foreign engine or changed limits.',
    observer:'Separate worker connectToMainThread debugger with exact compiled source SHA/line/function/order checks. HeapProfiler.takeHeapSnapshot streams the paused main-isolate dump into the observer-owned file; no reportProgress option. Marker deleted before resume. Worker heap excluded from dump, included in process RSS.',
    stages:['encode-prejoin','encode-envelope','decode-envelope','restore-precommit'],
    graph:'Same-snapshot selected property/element/backing/frozen-array numeric/string-parent edges, excluding prototypes/maps/other internal/weak/hidden edges. Per-stage roles distinguish current state, actual chunks/encoding input, primitive body/envelope/input strings, decoded value and candidate state. Masks deduplicate shared graphs; no cross-snapshot ID comparisons.',
    strings:'String-node self-size/backing relationships are observed representation. Lengths/UTF8/checksum/file bytes are separate diagnostics, never physical copies, isolated allocated bytes or proof of string collection.',
    cleanup:'Observer exits; three setImmediate/explicit GC/25ms cycles before listed object-only WeakRefs, held/released controls and public disposal. Primitive strings have no WeakRef targets.',
    instrumentation:'Breakpoints/lexical inspection/GC/dumping can deopt/materialize/change use. Heap snapshot streaming allocates in observer/runtime; no guessed subtraction. One intrusive run per size/role and selected points do not locate allocation high-water, synchronous join peak or internal transport copies.',
    preserved:'Earlier repeated sampled producer/receiver/browser/mutation work remains frozen; no promotion to allocation peaks. No browser engine worker, source-format/positions codec, physical input, AT, native portability or publication claim.',
    environment:'Only PATH/TMPDIR/LANG/LC_ALL inherited by180-second bounded owned children. Full synthetic-corpus heaps and encoding files stay in task-owned temp.'},
  productionFiles:[],sourceBindings:[],preservedEvidence:[],observations:[],outcome:'Running'};
async function save(){const text=JSON.stringify(report,null,2)+'\n';await file.write(text,0,'utf8');await file.truncate(Buffer.byteLength(text));}
try{
  const installed=await realpath(join(consumer,'node_modules/@vmitsaras/raveldex'));assert.equal(installed,join(consumer,'node_modules/@vmitsaras/raveldex'));
  report.packageMetadataSha256=hash(await readFile(join(installed,'package.json')));report.tarballSha256=hash(await readFile(join(consumer,'vmitsaras-raveldex-0.0.0.tgz')));
  async function walk(path='dist'){for(const e of await readdir(join(installed,path),{withFileTypes:true})){const p=join(path,e.name);if(e.isDirectory())await walk(p);else{assert.ok(e.isFile());const sha256=hash(await readFile(join(installed,p)));assert.equal(sha256,hash(await readFile(p)));report.productionFiles.push({path:p,sha256});}}}
  await walk();report.productionFiles.sort((a,b)=>a.path.localeCompare(b.path));
  for(const name of ['RX-4002-memory.json','RX-4002-memory-graphs.json','RX-4002-memory-retainers.json','RX-4002-memory-restore.json','RX-4002-memory-browser.json.gz','RX-4002-memory-collection.json','RX-4002-memory-collection-reconciliation.json','RX-4002-memory-mutation.json']){const path=`docs/evidence/${name}`;report.preservedEvidence.push({path,sha256:hash(await readFile(path))});}
  const directory=await mkdtemp(join(consumer,'memory-codec-'));report.temporaryDirectory=directory;
  for(const [path,name]of [['bench/memory/codec-child.mjs','codec-child.mjs'],['bench/memory/codec-debugger.mjs','codec-debugger.mjs'],['bench/memory/restore-common.mjs','codec-common.mjs'],['bench/cost-common.mjs','codec-fixture.mjs']]){const staged=join(directory,name);await copyFile(path,staged);report.sourceBindings.push({path,staged,sha256:hash(await readFile(staged))});}
  for(const path of ['bench/memory/codec-run.mjs','bench/memory/codec-graph.mjs','bench/memory/codec-graph.test.mjs','bench/memory/restore-child.mjs'])report.sourceBindings.push({path,sha256:hash(await readFile(path))});
  for(const size of report.method.sizes){
    const encodedPath=join(directory,`${size}-native.json`);let producer;
    for(const role of ['producer','receiver']){
      const path=join(directory,`${size}-${role}.json`),env=Object.fromEntries(['PATH','TMPDIR','LANG','LC_ALL'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
      if(role==='receiver')assert.ok(producer?.output,'Producer encoding required before receiver');
      const execution=await runBoundedChild(process.execPath,['--expose-gc',join(directory,'codec-child.mjs'),role,String(size),directory,encodedPath,path],{cwd:consumer,env});
      const row={size,role,execution,outcome:'Running'};report.observations.push(row);
      try{
        const bytes=await readFile(path);row.childReport={path,sha256:hash(bytes)};row.child=JSON.parse(bytes);
        assert.equal(execution.childExitCode,0);assert.equal(execution.childSignal,null);assert.equal(execution.childTimedOut,false);assert.equal(row.child.pid,execution.childPid);assert.equal(row.child.outcome,'Observed');
        const encodingBytes=await readFile(encodedPath);row.encoding={path:encodedPath,bytes:encodingBytes.length,sha256:hash(encodingBytes)};
        if(role==='producer'){assert.equal(row.child.output.sha256,row.encoding.sha256);producer=row.child;}
        else{assert.equal(row.child.input.sha256,producer.output.sha256);assert.equal(row.child.input.sha256,row.encoding.sha256);assert.equal(row.child.input.utf8Bytes,producer.output.utf8Bytes);}
        const captures=row.child.protocol.filter(m=>m.type==='capture');assert.equal(captures.length,2);row.graphs=[];
        for(const capture of captures){
          const info=await stat(capture.dump.path);assert.ok(info.isFile()&&info.size<=512*1024*1024);const bytes=await readFile(capture.dump.path);assert.equal(bytes.length,capture.dump.bytes);
          const graph=analyzeCodecGraph(JSON.parse(bytes),capture.stage),cohortPath=output.replace(/\.json$/,'')+`-cohort-${size}-${capture.stage}.json.gz`;
          const raw=Buffer.from(JSON.stringify({roles:graph.roles,columns:graph.columns,rows:graph.rows})),compressed=gzipSync(raw,{level:9});await writeFile(cohortPath,compressed,{flag:'wx'});
          row.graphs.push({stage:capture.stage,dump:{path:capture.dump.path,bytes:bytes.length,sha256:hash(bytes)},summary:graph.summary,
            cohort:{path:cohortPath,bytes:compressed.length,sha256:hash(compressed),decompressedBytes:raw.length,decompressedSha256:hash(raw)}});
        }
        row.outcome='Observed';
      }catch(error){row.outcome='Fail';row.failure={name:error.name,message:error.message,stack:error.stack};}
      await save();console.log(JSON.stringify({size,role,outcome:row.outcome}));
      if(role==='producer'&&row.outcome!=='Observed')break;
    }
  }
  for(const b of [...report.productionFiles,...report.sourceBindings,...report.preservedEvidence]){assert.equal(hash(await readFile(b.path)),b.sha256,`Changed input ${b.path}`);if(b.staged)assert.equal(hash(await readFile(b.staged)),b.sha256);}
  for(const b of report.productionFiles)assert.equal(hash(await readFile(join(installed,b.path))),b.sha256);
  report.preservation='Pass';report.outcome=report.observations.length===report.method.sizes.length*2&&report.observations.every(r=>r.outcome==='Observed')?'ObservedWithLimits':'Fail';
}catch(error){report.outcome='Fail';report.failure={name:error.name,message:error.message,stack:error.stack};}
finally{report.finishedAt=new Date().toISOString();await save();await file.close();}
console.log(JSON.stringify({output,outcome:report.outcome,processes:report.observations.length}));if(report.outcome==='Fail')process.exitCode=1;
