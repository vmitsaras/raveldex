// RX-9005: staged beside a complete installed private package. Package bytes are
// untouched in normal mode. Every correctness observer runs outside timing;
// multi-call windows alone include declared immutable-root pointer retention.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, basename } from 'node:path';
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { getExecutionOwner } from './node_modules/@vmitsaras/raveldex/dist/core/execution/engine.js';
import { executeSearch } from './node_modules/@vmitsaras/raveldex/dist/core/query/search.js';

const [contractURL, verifierURL, instrumentURL, configPath, output] = process.argv.slice(2);
assert.equal(process.argv.length, 7, 'usage: updates-child CONTRACT_URL VERIFIER_URL INSTRUMENT_URL CONFIG_JSON OUTPUT_JSON');
const contract = await import(contractURL), { createUpdateVerifier } = await import(verifierURL), { collectDiagnostics } = await import(instrumentURL);
const { UPDATE_CONTRACT_SHA256, casesFor, workloadForUpdate, scenarioFor, schema, planUpdates, repetitionsFor, warmupsFor, notApplicableCasesFor } = contract;
const config = JSON.parse(await readFile(configPath, 'utf8'));
const SHA = /^[a-f0-9]{64}$/u;
const required = ['profile','size','configuration','deadline','deadlineOptions','role','owner','mode','contractSha256','artifactManifestSha256','harnessSha256','artifactSha256','artifactSource','packageInventorySha256','configurationSha256'];
assert.deepEqual(Object.keys(config).sort(), [...required].sort(), 'exact child configuration');
assert.ok(['full','pilot'].includes(config.profile)); assert.ok(['preN9','acceptedN9','current'].includes(config.role));
assert.ok(['core-only','source-positions'].includes(config.configuration)); assert.ok(['normal','diagnostic'].includes(config.mode));
assert.ok(Number.isSafeInteger(config.owner) && config.owner >= 0 && config.owner <= 3);
assert.ok(planUpdates(config.profile).some(job=>['profile','size','configuration','deadline','role','owner','mode'].every(key=>job[key]===config[key])),'job outside declared profile');
assert.ok(['default30s','explicit60s'].includes(config.deadline));
assert.deepEqual(config.deadlineOptions, config.deadline === 'default30s' ? {} : { deadlineMs: 60000 });
for (const name of ['contractSha256','artifactManifestSha256','harnessSha256','artifactSha256','packageInventorySha256','configurationSha256']) assert.match(config[name], SHA, name);
assert.equal(config.contractSha256, UPDATE_CONTRACT_SHA256);
const workload = workloadForUpdate(config.size), cases = casesFor(config.size);
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const data = value => JSON.parse(JSON.stringify(value));
const errorData = error => ({ name: error?.name ?? 'Error', code: error?.code ?? null, reason: error?.reason ?? null, details: error?.details ?? null, message: String(error?.message ?? error) });
const resource = error => ['WORK_LIMIT_EXCEEDED','DEADLINE_EXCEEDED','LIMIT_EXCEEDED','RESOURCE_EXHAUSTED'].includes(error?.code);
const classification = error => !error ? 'Pass' : resource(error) ? 'Refused' : /UNKNOWN/.test(error.code ?? '') ? 'Unknown' : error.code === 'CANCELLED' ? 'Cancelled' : 'Rejected';
const childBegan=performance.now();
const rows = [], observations = [], warmups = [], preparation = [], checkpoints = [], stateFiles = new Map(), traceFiles = new Map(), traceCache = new WeakMap();
const stateDirectory = output.replace(/\.json$/u, '.states'); await mkdir(stateDirectory);
const progressPath=output.replace(/\.json$/u,'.progress.json');let verifiedWindows=0,verifiedWarmups=0,progressWrites=0;
const row = { kind: 'rx9005-update-child-v1', ...config, pid: process.pid, identity: workload.identity,
  runtime: { node: process.version, versions: process.versions, execArgv: process.execArgv },
  samples: rows, observations, warmups, preparation, checkpoints, states: {}, traces: {}, progressOutput:basename(progressPath),
  startedAt:new Date().toISOString(), outcome: 'Running', notApplicable: notApplicableCasesFor(config.size),
  timingScope: { publicWindow:'One outstanding public call at a time. Invocation-to-settlement includes admission, synchronous first pump, native execution/tasks, Promise/result delivery and receipt retention. No inferred numeric queue/admission split.',
    sequences:'B sequential replace/remove calls are whole-sequence throughput, not one atomic mutation. Windows include per-call monotonic boundary clock reads, receipt/boundary collection and (multi-call only) one private immutable-root pointer capture after each native receipt. No full inspection/callback/instrumented package branch occurs inside normal timing.',
    boundaries:'Per-call invocation→synchronous return includes ownership/admission and synchronous first pump; return→settlement includes asynchronous native execution/tasks and Promise/result delivery. Neither is pure admission, inferred queue wait or isolated engine execution. Synchronous throw has no return/settlement remainder and is labeled explicitly.',
    verification:'Outside timing: full source-derived state and directly drained native query generators on actual immutable roots. This does not qualify public FIFO/clock fairness or independent engine CPU.',
    preparation:'Factory initialization, original build, public differential resets and verification costs are separate; none enters mutation sample distributions.',
    source:'Original adversarial corpus plus exact frozen A/B/novel templates; no side grows alone or silently changes B-call granularity.' } };
let engine, owner, verifier, current = new Map(), revision = 0;
const options = () => ({ ...config.deadlineOptions });
const sameRecord = (a,b) => JSON.stringify(a) === JSON.stringify(b);
async function recordProgress(phase,selected=null) {
  const settled=[...rows,...observations,...warmups];
  const progress={kind:'rx9005-update-progress-v1',profile:config.profile,size:config.size,configuration:config.configuration,role:config.role,mode:config.mode,owner:config.owner,pid:process.pid,
    recordedAt:new Date().toISOString(),phase,outcome:row.outcome,elapsedMs:performance.now()-childBegan,
    settledMeasuredWindows:rows.length+observations.length,settledWarmups:warmups.length,verifiedMeasuredWindows:verifiedWindows,verifiedWarmups,
    selectedAttemptedCalls:settled.reduce((n,x)=>n+x.attemptedCalls,0),selectedCompletedCalls:settled.reduce((n,x)=>n+x.completedCalls,0),
    preparationPublicCalls:preparation.filter(x=>x.method).length,cumulativePreparationWallMs:preparation.reduce((n,x)=>n+x.wallMs,0),
    cumulativeVerificationWallMs:checkpoints.reduce((n,x)=>n+x.verificationWallMs,0),verificationCheckpoints:checkpoints.length,stateCapturesWritten:stateFiles.size,
    expectedRevision:revision,observedRootRevision:owner?.root?.revision??null,observedPopulation:owner?.root?.counts.documents??null,
    selected,progressWrite:++progressWrites,scope:'Bounded phase metadata written only outside all measured native mutation windows; actual root headers are observations, not completion of a pending verification phase.'};
  const temporary=progressPath+'.next';
  await writeFile(temporary,JSON.stringify(progress,null,2)+'\n');await rename(temporary,progressPath);
}

function applyCall(records, call, oldRevision) {
  let added=0,replaced=0,removed=0;
  if (call.method === 'remove') {
    for (const id of typeof call.input === 'string' ? [call.input] : call.input) if (records.delete(id)) removed++;
  } else {
    for (const record of call.method === 'addMany' ? call.input : [call.input]) {
      if (records.has(record.id)) { assert.equal(call.method,'replace','fixture may not add an existing ID'); replaced++; }
      else { assert.notEqual(call.method,'replace','selected replacement must target existing record'); added++; }
      records.set(record.id,record);
    }
  }
  const changed=added+replaced+removed>0;
  return { revision:oldRevision+(changed?1:0), changed, added, replaced, removed };
}
async function saveInspection(root, expected, label, prefix=false) {
  const cpu=process.cpuUsage(), began=performance.now();
  const inspected=prefix?verifier.inspectPrefix(root,expected,root.revision):verifier.inspect(root,expected,root.revision);
  assert.match(inspected.normalizedSha256,SHA); assert.equal(inspected.actualRevision,root.revision);
  const normalized=inspected.normalizedSha256;
  if (!stateFiles.has(normalized)) {
    const path=join(stateDirectory,normalized+'.json'), bytes=JSON.stringify(inspected.capture)+'\n';
    await writeFile(path,bytes,{flag:'wx'}); stateFiles.set(normalized,{ file:basename(stateDirectory)+'/'+basename(path), sha256:hash(bytes), normalizedSha256:normalized, bytes:Buffer.byteLength(bytes) });
  }
  const usage=process.cpuUsage(cpu);
  const result={ label, revision:root.revision, state:normalized, coreSemanticSha256:inspected.coreSemanticSha256, expectedSourceSha256:inspected.expectedSourceSha256, queryProvenance:inspected.queryProvenance, stats:inspected.stats,
    verificationWallMs:performance.now()-began, verificationCpuUserMs:usage.user/1000, verificationCpuSystemMs:usage.system/1000 };
  checkpoints.push(result); return result;
}
async function prepareCall(call, purpose) {
  const began=performance.now(),cpu=process.cpuUsage(),beforeRoot=owner.root; let receipt,error;
  try { receipt=await engine[call.method](call.input,options()); } catch(caught) {error=caught;}
  const usage=process.cpuUsage(cpu), item={purpose,method:call.method,inputRecords:call.method==='addMany'?call.input.length:call.method==='remove'&&Array.isArray(call.input)?call.input.length:1,
    beforeRevision:revision, wallMs:performance.now()-began,cpuUserMs:usage.user/1000,cpuSystemMs:usage.system/1000,outcome:classification(error),...(error?{error:errorData(error)}:{receipt:data(receipt)})};
  preparation.push(item);
  if(error){assert.equal(owner.root,beforeRoot,'authoritative preparation refusal must preserve root');throw error;}
  const expected=applyCall(current,call,revision);assert.deepEqual(data(receipt),expected);revision=expected.revision;
  assert.equal(owner.root.revision,revision);assert.equal(owner.root.counts.documents,current.size);
}
async function resetTo(records,purpose) {
  const desired=new Map(records.map(record=>[record.id,record]));assert.equal(desired.size,records.length);
  const absent=[...current.keys()].filter(id=>!desired.has(id));
  for(let i=0;i<absent.length;i+=256) await prepareCall({method:'remove',input:absent.slice(i,i+256)},purpose+':remove');
  for(const [id,record]of desired)if(current.has(id)&&!sameRecord(current.get(id),record))await prepareCall({method:'replace',input:record},purpose+':replace');
  const missing=[...desired.values()].filter(record=>!current.has(record.id));
  for(let i=0;i<missing.length;i+=256)await prepareCall({method:'addMany',input:missing.slice(i,i+256)},purpose+':add');
  assert.deepEqual([...current.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),[...records].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),'reset exact authored prestate');
}
async function selectedWindow(descriptor,repetition,isWarmup=false) {
  const scenario=scenarioFor(descriptor,config.size,{repetition});
  let traceSha256=traceCache.get(scenario);
  if(!traceSha256){const trace={caseKey:descriptor.caseKey,batch:descriptor.batch,beforeRecordsSha256:hash(scenario.beforeRecords),afterRecordsSha256:hash(scenario.afterRecords),calls:scenario.calls,preparationCalls:scenario.preparationCalls??[],vocabularyRule:scenario.vocabularyRule};traceSha256=hash(trace);traceCache.set(scenario,traceSha256);traceFiles.set(traceSha256,trace);}
  await resetTo(scenario.beforeRecords,descriptor.caseKey+':'+(isWarmup?'warmup':'sample')+':'+repetition);
  for(const call of scenario.preparationCalls??[])await prepareCall(call,descriptor.caseKey+':authored-reinsertion-preparation');
  assert.equal(current.size,scenario.beforeRecords.length,'prepared population');
  const beforeRoot=owner.root, beforeRevision=revision;
  const selectedProgress={caseKey:descriptor.caseKey,repetition,isWarmup,requestedCalls:scenario.calls.length};
  await recordProgress('prestate-verification-start',selectedProgress);
  const before=await saveInspection(beforeRoot,[...current.values()],descriptor.caseKey+':before:'+repetition+(isWarmup?':warmup':''));
  const receipts=[], roots=[],callWindows=[];let error,counters;
  await recordProgress('native-mutation-window-ready',selectedProgress);
  const cpu=process.cpuUsage(),began=performance.now();
  const run=async()=>{for(let callIndex=0;callIndex<scenario.calls.length;callIndex++){
    const call=scenario.calls[callIndex],callOptions=options(),invokedAt=performance.now();let returnedAt;
    try {
      const pending=engine[call.method](call.input,callOptions);returnedAt=performance.now();
      const receipt=await pending,settledAt=performance.now();
      receipts.push(receipt);if(scenario.calls.length>1)roots.push(owner.root);
      callWindows.push({callIndex,method:call.method,returned:true,outcome:'Pass',invocationToReturnMs:returnedAt-invokedAt,returnToSettlementMs:settledAt-returnedAt,invocationToSettlementMs:settledAt-invokedAt});
    } catch(caught) {
      const stoppedAt=performance.now();
      callWindows.push({callIndex,method:call.method,returned:returnedAt!==undefined,outcome:classification(caught),...(returnedAt===undefined?{synchronousThrow:true,invocationToThrowMs:stoppedAt-invokedAt}:{invocationToReturnMs:returnedAt-invokedAt,returnToSettlementMs:stoppedAt-returnedAt,invocationToSettlementMs:stoppedAt-invokedAt})});throw caught;
    }
  }};
  if(config.mode==='diagnostic')({error,counters}=await collectDiagnostics(run));else try{await run();}catch(caught){error=caught;}
  const wallMs=performance.now()-began,usage=process.cpuUsage(cpu), terminalRoot=owner.root;
  if(scenario.calls.length===1&&receipts.length===1)roots.push(terminalRoot);
  const item={traceSha256,caseKey:descriptor.caseKey,id:descriptor.id,kind:descriptor.kind,batch:descriptor.batch,publicCall:descriptor.publicCall,repetition,
    phase:isWarmup?'untimed-warmup':config.mode==='diagnostic'?'diagnostic-first-call':config.size===1000&&descriptor.id==='replace-existing-vocabulary'?'after-two-warmups':repetition?'repeat-same-owner':'first-call-for-case',
    outcome:classification(error),requestedCalls:scenario.calls.length,completedCalls:receipts.length,attemptedCalls:receipts.length+(error?1:0),
    beforePopulation:current.size,beforeRevision,beforeState:before.state,receipts:receipts.map(data),callWindows,
    ...(error?{error:errorData(error)}:{}),...(counters?{counters}:{}),
    windowScope:scenario.calls.length>1?'Whole sequential public-call window including declared root-pointer/receipt retention; not atomic batch':'Single public call invocation-to-settlement'};
  if(!isWarmup)Object.assign(item,{wallMs,cpuUserMs:usage.user/1000,cpuSystemMs:usage.system/1000});
  else preparation.push({purpose:'excluded-warmup-native-window',caseKey:descriptor.caseKey,repetition,wallMs,cpuUserMs:usage.user/1000,cpuSystemMs:usage.system/1000,outcome:classification(error),excludedFromMutationSamples:true});
  (isWarmup?warmups:config.mode==='diagnostic'?observations:rows).push(item);
  await recordProgress('post-window-verification-start',{...selectedProgress,completedCalls:receipts.length,attemptedCalls:item.attemptedCalls,outcome:item.outcome});
  assert.equal(roots.length,receipts.length);
  const prefixStates=[];
  for(let index=0;index<receipts.length;index++) {
    const expected=applyCall(current,scenario.calls[index],revision);assert.equal(expected.changed,true,'every selected mutation must be changed');assert.deepEqual(data(receipts[index]),expected);revision=expected.revision;
    const captured=roots[index];assert.equal(captured.revision,revision);assert.equal(captured.counts.documents,current.size);
    prefixStates.push(await saveInspection(captured,[...current.values()],descriptor.caseKey+':prefix:'+index+':'+repetition+(isWarmup?':warmup':''),index<receipts.length-1));
  }
  if(error){assert.equal(terminalRoot,roots.at(-1)??beforeRoot,'refused atomic call cannot change last authoritative root');assert.ok(resource(error),'unexpected selected operation error');}
  assert.equal(terminalRoot.revision,revision);assert.equal(terminalRoot.counts.documents,current.size);
  const after=prefixStates.at(-1)??await saveInspection(terminalRoot,[...current.values()],descriptor.caseKey+':refused:'+repetition);
  Object.assign(item,{afterPopulation:current.size,afterRevision:revision,afterState:after.state,prefixStates:prefixStates.map(x=>({revision:x.revision,state:x.state})),atomicCallsVerified:receipts.length,failedCallPreservedAuthoritativePrefix:error?true:undefined,vocabularyRule:scenario.vocabularyRule});
  if(!error){assert.equal(receipts.length,scenario.calls.length);assert.deepEqual([...current.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),[...scenario.afterRecords].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0));}
  roots.length=0;
  if(isWarmup)verifiedWarmups++;else verifiedWindows++;
  await recordProgress('selected-window-verified',{...selectedProgress,completedCalls:receipts.length,attemptedCalls:item.attemptedCalls,outcome:item.outcome});
}
try {
  const cpu=process.cpuUsage(),began=performance.now();
  const addons=config.configuration==='core-only'?[]:[createSourceProvider({fields:['body']}),createPositionProvider({fields:['body'],offsets:['body']})];
  engine=createRaveldex({schema,addons});owner=getExecutionOwner(engine);assert.ok(owner?.root);
  const usage=process.cpuUsage(cpu);preparation.push({purpose:'initialize-native-factory-and-providers',outcome:'Pass',wallMs:performance.now()-began,cpuUserMs:usage.user/1000,cpuSystemMs:usage.system/1000});
  verifier=createUpdateVerifier({executeSearch,configuration:config.configuration,size:config.size,records:workload.records,outputRoot:stateDirectory,pageSize:100});
  await recordProgress('original-build-start');
  for(let offset=0;offset<workload.records.length;offset+=256)await prepareCall({method:'addMany',input:workload.records.slice(offset,offset+256)},'build-original-frozen-corpus');
  await recordProgress('original-build-completed');
  await saveInspection(owner.root,[...current.values()],'initial-complete-build');
  await recordProgress('initial-verification-completed');
  for(const descriptor of cases) {
    const warmupCount=warmupsFor(config,descriptor);
    for(let repetition=0;repetition<warmupCount;repetition++)await selectedWindow(descriptor,repetition,true);
    const repetitions=repetitionsFor(config,descriptor);
    for(let repetition=0;repetition<repetitions;repetition++)await selectedWindow(descriptor,repetition);
  }
  row.finalRevision=revision;row.finalPopulation=current.size;row.outcome='Collected';
  await recordProgress('child-completed');
} catch(error) {row.outcome='Fail';row.failure=errorData(error);throw error;}
finally {
  if(engine)await engine.dispose();
  row.states=Object.fromEntries(stateFiles);row.traces=Object.fromEntries(traceFiles);row.uniqueStateFiles=stateFiles.size;row.progressWrites=progressWrites;row.completedAt=new Date().toISOString();row.elapsedMs=performance.now()-childBegan;
  row.packageMetadataSha256=hash(await readFile(new URL('./node_modules/@vmitsaras/raveldex/package.json',import.meta.url)));
  await writeFile(output,JSON.stringify(row,null,2)+'\n');
}
