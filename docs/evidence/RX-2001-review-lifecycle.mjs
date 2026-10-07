// Replay after npm run build. argv[2] may override the repository root.
// When saved under docs/evidence/, the repository root is inferred.
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repository = resolve(process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
const outputPath = fileURLToPath(new URL(import.meta.url.replace(/\.mjs$/, '.json')));
const moduleFromRepo = path => import(pathToFileURL(resolve(repository, path)).href);
const { captureConfiguration } = await moduleFromRepo('dist/core/contracts/schema.js');
const { initializeParticipants } = await moduleFromRepo('dist/core/capabilities/participants.js');
const { ExecutionOwner, emptyRoot } = await moduleFromRepo('dist/core/execution/engine.js');
const { createSourceProvider,createSourcePhrases } = await moduleFromRepo('dist/addons/phrases/index.js');
const { directoryGet } = await moduleFromRepo('dist/core/index/directory.js');
const { FakeHost, FakeSignal } = await moduleFromRepo('test/fixtures/execution/host.mjs');
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const phrase={kind:'extension',capability:'phrases',version:1,payload:{text:'red blue'}};
function fixture(){const configuration=captureConfiguration({schema:{text:{body:{}}},limits:{checkpointWorkUnits:1},addons:[createSourceProvider({fields:['body']}),createSourcePhrases({fields:['body']})]});const side=initializeParticipants(configuration);const host=new FakeHost(),metrics={workUnits:0,steps:0,hostYields:0,maxTaskWorkUnits:0,maxStepWorkUnits:0,checks:0,phaseChecks:{}};const owner=new ExecutionOwner(emptyRoot(configuration,side.states),host,side.participants,metrics);return{owner,host,metrics};}
function observe(p){return p.then(value=>({success:true,value}),error=>({success:false,code:error.code}));}
async function complete(f,p){f.host.runReady();return await p;}
const out=[];
for(const stop of ['abort','deadline','dispose']){
 const f=fixture();assert.equal((await complete(f,f.owner.add({id:'a',text:{body:'red blue'}}))).revision,1);const old=f.owner.root,source=old.participants.source;const signal=new FakeSignal(),before=f.metrics.phaseChecks.participant??0;
 const mutation=observe(f.owner.replace({id:'a',text:{body:['red blue','red blue','red blue']}},{signal,deadlineMs:10}));
 while((f.metrics.phaseChecks.participant??0)<before+8)assert.ok(f.host.runNext(),'source participant cursor not reached');
 assert.equal(f.owner.root,old);assert.equal(directoryGet(source.records,'a').text.body[0],'red blue');
 let disposal;
 if(stop==='abort')signal.stop();if(stop==='deadline')f.host.advance(10);if(stop==='dispose')disposal=f.owner.dispose();
 f.host.runReady();const result=await mutation;assert.equal(result.success,false);assert.equal(result.code,{abort:'CANCELLED',deadline:'DEADLINE_EXCEEDED',dispose:'DISPOSED'}[stop]);assert.equal(signal.listenerCount,0);assert.equal(f.host.pending,0);
 if(stop==='dispose'){await disposal;assert.equal(f.owner.root,undefined);}else{assert.equal(f.owner.root,old);assert.equal(f.owner.root.participants.source,source);const check=await complete(f,f.owner.search(phrase));assert.equal(check.revision,1);assert.equal(check.total,1);assert.equal(check.hits[0].id,'a');await f.owner.dispose();}
 out.push({operation:'replace source prepare',stop,result,participantChecks:f.metrics.phaseChecks.participant});
}
for(const stop of ['abort','deadline','dispose']){
 const f=fixture();await complete(f,f.owner.add({id:'a',text:{body:'red '+Array(300).fill('x').join(' ')+' blue'}}));const old=f.owner.root,signal=new FakeSignal(),before=f.metrics.phaseChecks.evaluation??0;
 const search=observe(f.owner.search(phrase,{signal,deadlineMs:10}));
 while((f.metrics.phaseChecks.evaluation??0)<before+400)assert.ok(f.host.runNext(),'source evaluator cursor not reached');
 let disposal;if(stop==='abort')signal.stop();if(stop==='deadline')f.host.advance(10);if(stop==='dispose')disposal=f.owner.dispose();f.host.runReady();const result=await search;assert.equal(result.code,{abort:'CANCELLED',deadline:'DEADLINE_EXCEEDED',dispose:'DISPOSED'}[stop]);assert.equal(signal.listenerCount,0);assert.equal(f.host.pending,0);if(disposal)await disposal;else{assert.equal(f.owner.root,old);await f.owner.dispose();}out.push({operation:'source scan',stop,result,evaluationChecks:f.metrics.phaseChecks.evaluation});
}
writeFileSync(outputPath,JSON.stringify(out,null,2));console.log(JSON.stringify({result:'PASS',checks:out,artifact:outputPath},null,2));
