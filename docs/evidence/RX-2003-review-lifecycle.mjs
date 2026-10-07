import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const repo = resolve(process.argv[2] ?? process.cwd()), imp = path => import(pathToFileURL(resolve(repo, path)));
const [{ captureConfiguration }, { initializeParticipants }, { emptyRoot, ExecutionOwner }, { createFilters }, { createFacets }, { FakeHost, FakeSignal }] = await Promise.all([
  imp('dist/core/contracts/schema.js'), imp('dist/core/capabilities/participants.js'), imp('dist/core/execution/engine.js'), imp('dist/addons/filters/index.js'), imp('dist/addons/facets/index.js'), imp('test/fixtures/execution/host.mjs')
]);
const schema = { text: { body: {} }, metadata: { n: { type: 'number', multi: true, nullable: true }, label: { type: 'string', multi: true, nullable: true } } };
const records = Array.from({length:13},(_,i)=>({id:`r${i}`,text:{body:i%3?'alpha beta':'beta'},metadata:{n:[i,i+10,null],label:[String(i).padStart(2,'0')+'x'.repeat(25), i%2?'a':'b', null]}}));
const range = payload => ({kind:'extension',capability:'numeric-range',version:1,payload});
const set = payload => ({kind:'extension',capability:'set-membership',version:1,payload});
const queries = [{kind:'all'},{kind:'and',children:[{kind:'text',text:'alpha'},range({field:'n',gte:3,lte:7})]},{kind:'not',child:set({field:'label',values:['a',null]})}];
const options = {extensions:{facets:{fields:[{field:'label',limit:100,missing:true}]}},limit:0};
function setup(extra = {}) {
  const config = captureConfiguration({schema,addons:[createFilters({fields:['n','label']}),createFacets({fields:['label']})],limits:{checkpointWorkUnits:43},...extra});
  const installed=initializeParticipants(config),host=new FakeHost(),metrics={workUnits:0,steps:0,hostYields:0,maxTaskWorkUnits:0,maxStepWorkUnits:0,checks:0,phaseChecks:{}};
  const engine=new ExecutionOwner(emptyRoot(config,installed.states),host,installed.participants,metrics);
  return {engine,host,metrics,async call(method,...args){const p=engine[method](...args);host.runReady();return p;}};
}
let abortCases=0, checks=0, suspensions=[];
for(const query of queries){
  const baseline=setup();await baseline.call('addMany',records); const p=baseline.engine.search(query,options), expected=await (baseline.host.runReady(),p); const yields=baseline.host.history.filter(x=>x.delayMs===0).length;
  // Count only this search by replaying it with a fresh history.
  baseline.host.history.length=0;await baseline.call('search',query,options);const count=baseline.host.history.filter(x=>x.delayMs===0).length;suspensions.push(count);await baseline.engine.dispose();
  for(let position=0;position<count;position++){
    const {engine,host,call}=setup();await call('addMany',records);const before=engine.root,signal=new FakeSignal();const running=engine.search(query,{...options,signal});
    const rejection=assert.rejects(running,error=>error.code==='CANCELLED');
    for(let i=0;i<position;i++)assert.equal(host.runNext(),true);
    assert.ok(host.pendingResumes>0);const stale=host.callbacks();signal.stop();host.runReady();await rejection;
    assert.equal(engine.root,before);assert.equal(signal.listenerCount,0);assert.equal(host.pending,0);
    for(const callback of stale)callback();host.runReady();assert.equal(engine.root,before);
    const recovered=await call('search',query,options);assert.deepEqual(JSON.parse(JSON.stringify(recovered)),JSON.parse(JSON.stringify(expected)));abortCases++;checks+=5;
    await engine.dispose();assert.equal(engine.root,undefined);assert.equal(host.pending,0);
  }
}
// Search admission owns nested caller data while a previous operation is active;
// execution-start root selection follows the FIFO replacement.
const owned=setup();await owned.call('addMany',records);const blocker=owned.engine.search({kind:'all'},options);
const replacement=owned.engine.replace({id:'r0',text:{body:'alpha beta'},metadata:{n:[500],label:['owned']}});
const query=range({field:'n',gte:400,lte:600}), request={limit:10,extensions:{facets:{fields:[{field:'label',limit:100,missing:true}]}}};
const queued=owned.engine.search(query,request);query.payload.field='label';query.payload.gte=-100;request.extensions.facets.fields[0].field='n';request.extensions.facets.fields[0].limit=0;
owned.host.runReady();await blocker;await replacement;const result=await queued;assert.equal(result.revision,2);assert.deepEqual(result.hits.map(h=>h.id),['r0']);assert.deepEqual(JSON.parse(JSON.stringify(result.extensions.facets)),{fields:[{field:'label',buckets:[{kind:'value',value:'owned',count:1}],distinctValueTotal:1,omittedBucketCount:0}]});checks+=4;await owned.engine.dispose();
// Deadline and disposal close active requested aggregation and pending work.
for(const mode of ['deadline','dispose']){
  const item=setup();await item.call('addMany',records);const running=item.engine.search({kind:'all'},{...options,deadlineMs:1});const failure=assert.rejects(running,e=>e.code===(mode==='dispose'?'DISPOSED':'DEADLINE_EXCEEDED'));
  if(mode==='dispose')await item.engine.dispose();else {item.host.advance(1);item.host.runReady();}
  await failure;assert.equal(item.host.pending,0);if(mode==='deadline'){assert.equal((await item.call('search',{kind:'all'},options)).total,records.length);await item.engine.dispose();}checks++;
}
const output={repo,abortCases,suspensions,ownershipFIFORevisionChecks:4,deadlineAndDisposalScenarios:2,checks};writeFileSync(resolve(process.argv[1]).replace(/\.mjs$/,'.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
