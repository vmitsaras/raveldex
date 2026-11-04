import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRaveldex } from '../../dist/index.js';
import { createSourceProvider, createSourcePhrases } from '../../dist/addons/phrases/index.js';
import { createPositionProvider } from '../../dist/addons/positions/index.js';
import { createPositionPhrases } from '../../dist/addons/positions/phrases.js';
import { checksum } from '../../dist/adapters/snapshots/json.js';
import { createSnapshots } from '../../dist/adapters/snapshots/index.js';
import { instrumentRestorePackage, createRestoreDiagnostic } from '../../bench/n9/restore-instrument.mjs';
async function copy(t) { const dir=await mkdtemp(join(tmpdir(),'raveldex-restore-observer-'));t.after(()=>rm(dir,{recursive:true,force:true}));await cp(new URL('../../dist/',import.meta.url),join(dir,'dist'),{recursive:true});await cp(new URL('../../package.json',import.meta.url),join(dir,'package.json'));return dir; }
const load=(root,path)=>import(pathToFileURL(join(root,path)).href);
const records=[{id:'a',text:{body:'red blue red'},metadata:{tag:'new'}},{id:'b',text:{body:['blue red','red blue']},metadata:{tag:'new'}}];
const schema={text:{body:{}},metadata:{tag:{type:'string'}}};
test('restore observer preserves actual source/position results and records private staging plus old-root identity',async t=>{
  const dir=await copy(t);const report=await instrumentRestorePackage(dir);assert.equal(report.version,'rx8008-paired-restore-diagnostic-v1');assert.equal(report.patches.length,10);
  const core=await load(dir,'dist/index.js'),source=await load(dir,'dist/addons/phrases/index.js'),position=await load(dir,'dist/addons/positions/index.js'),positionPhrases=await load(dir,'dist/addons/positions/phrases.js'),snap=await load(dir,'dist/adapters/snapshots/index.js');
  for(const positions of [false,true]){
    const normal=createRaveldex({schema,addons:[createSourceProvider({fields:['body']}),...(positions?[createPositionProvider({fields:['body'],offsets:['body']}),createPositionPhrases({fields:['body']})]:[createSourcePhrases({fields:['body']})])]});
    const diagnostic=core.createRaveldex({schema,addons:[source.createSourceProvider({fields:['body']}),...(positions?[position.createPositionProvider({fields:['body'],offsets:['body']}),positionPhrases.createPositionPhrases({fields:['body']})]:[source.createSourcePhrases({fields:['body']})])]});
    try{
      await normal.addMany(records);await diagnostic.add({id:'prior',text:{body:'old red'},metadata:{tag:'old'}});const encoded=await createSnapshots(normal).exportSource();let memoryCalls=0;const observe=createRestoreDiagnostic({memory:()=>({testSample:++memoryCalls})});observe.start({operation:'restoreSource'});const actual=await snap.createSnapshots(diagnostic).restore(encoded);const counters=observe.stop();assert.equal(actual.revision,2);assert.deepEqual(await diagnostic.search('red'),{...await normal.search('red'),revision:2});
      const r=counters.restore;assert.equal(r.recordsAttempted,2);assert.equal(r.recordsCompleted,2);assert.equal(r.oldRoot.documents,1);assert.equal(r.lastUnsealedStage.counts.documents,2);assert.equal(r.finalAuthoritativeSame,false);assert.equal(r.authoritativeUnchangedDuringStaging,true);assert.equal(r.decodedRecords,2);assert.equal(r.copy.directoryPointers,0);assert.equal(r.copy.bucketEntries,0);assert.ok(r.copy.buckets>0);assert.ok(r.copy.seals>0);assert.equal(r.finalAuthoritativeRoot.documents,2);assert.ok(r.phaseEvents.length<=128);assert.ok(r.memorySamples.length<=128);assert.ok(r.snapshots.every(stage=>stage.kind==='unsealed-bulk-stage'));assert.ok(r.analysisCalls.core>0);assert.ok(r.tokens.core>0);assert.ok(memoryCalls>0);assert.deepEqual(r.observerErrors,[]);assert.ok(r.phaseWork['snapshot.staging'].workUnits>0);assert.ok(r.detailWork['snapshot.source.analysis'].workUnits>0);assert.ok(r.phaseWork['snapshot.source.finalization'].workUnits>0);assert.ok(r.phaseWork['snapshot.source.participant-finalization'].workUnits>0);assert.equal(Object.values(r.phaseWork).reduce((n,x)=>n+x.workUnits,0),counters.emittedWorkUnits);
      if(positions){assert.ok(Object.keys(r.tokens).some(k=>k!=='core'));assert.ok(r.lastUnsealedStage.participants.some(p=>p.offsetCount>0 && p.sealed===false));}
      const plainExport=await snap.createSnapshots(diagnostic).exportSource();observe.start({operation:'exportSource'});assert.equal(await snap.createSnapshots(diagnostic).exportSource(),plainExport);const exported=observe.stop();assert.ok(Object.keys(exported.restore.tokens).some(k=>k.startsWith('native-validation:')));assert.ok(exported.restore.phaseWork['snapshot.export.validation'].workUnits>0);assert.ok(exported.restore.phaseWork['snapshot.export.encode'].workUnits>0);
      assert.equal(globalThis[Symbol.for('raveldex.n9.restore')],undefined);assert.equal(globalThis[Symbol.for('raveldex.n9.diagnostics')],undefined);
    }finally{await normal.dispose();await diagnostic.dispose();}
  }
});
test('restore observer retains genuine work refusal and exact old state instead of labelling success',async t=>{
  const dir=await copy(t);await instrumentRestorePackage(dir);const core=await load(dir,'dist/index.js'),source=await load(dir,'dist/addons/phrases/index.js'),snap=await load(dir,'dist/adapters/snapshots/index.js');
  const addons=()=>[source.createSourceProvider({fields:['body']}),source.createSourcePhrases({fields:['body']})];
  const donor=core.createRaveldex({schema,addons:addons()}),receiver=core.createRaveldex({schema,limits:{maxMutationWorkUnits:5000,checkpointWorkUnits:128},addons:addons()});
  try{for(let i=0;i<30;i++)await donor.add({id:'r'+i,text:{body:'red blue'}});await receiver.add({id:'prior',text:{body:'old state'}});
    // Lowered-limit codec fixture for a deterministic diagnostic refusal. This
    // is not an admitted default-limit benchmark or an export success claim.
    const envelope=JSON.parse(await snap.createSnapshots(donor).exportSource());envelope.body.header.limits.maxMutationWorkUnits=5000;envelope.body.header.limits.checkpointWorkUnits=128;const body=JSON.stringify(envelope.body);let cursor=checksum(body),hash;for(;;){const n=cursor.next();if(n.done){hash=n.value;break;}}const encoded=JSON.stringify(envelope).replace(JSON.stringify(envelope.integrity.value),JSON.stringify(hash));
    const before=await receiver.search({kind:'all'}),owner=(await load(dir,'dist/core/execution/engine.js')).getExecutionOwner(receiver),old=owner.root,ob=createRestoreDiagnostic();ob.start({operation:'restoreSource'});await assert.rejects(snap.createSnapshots(receiver).restore(encoded),{code:'WORK_LIMIT_EXCEEDED'});const c=ob.stop();assert.equal(c.restore.finalAuthoritativeSame,true);assert.equal(c.restore.authoritativeUnchangedDuringStaging,true);assert.ok(c.restore.budgetRefusals.some(r=>r.role==='snapshot.total' && r.maximum===5000 && r.attempted===r.emittedBefore+r.units));assert.deepEqual(await receiver.search({kind:'all'}),before);assert.equal(owner.root,old);
  }finally{await donor.dispose();await receiver.dispose();}
});
test('restore observer preflights anchor drift and serializes without Node dependencies or nested observation',async t=>{
  const dir=await copy(t),path=join(dir,'dist/adapters/snapshots/snapshots.js');await writeFile(path,'export {};\n');const before=await readFile(join(dir,'dist/core/execution/engine.js'));await assert.rejects(instrumentRestorePackage(dir),/Restore diagnostic anchor drift/);assert.deepEqual(await readFile(join(dir,'dist/core/execution/engine.js')),before);
  const make=(0,eval)('('+createRestoreDiagnostic.toString()+')'),a=make(),b=make();a.start();assert.throws(()=>b.start(),/serial/);assert.ok(a.stop().restore);assert.throws(()=>a.stop(),/not started/);
});
