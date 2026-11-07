import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {exerciseHostRecovery as oldExercise, PRIOR_RECORD} from '../../docs/evidence/RX-9006/overhead-slice2/validation/reference/bench/n10/host-recovery-case.mjs';
import {exerciseHostRecovery as newExercise} from '../../bench/n10/host-recovery-case.mjs';
import {createRecoveryProfiler, validateRecoveryProfile, RECOVERY_PROFILE_REVISION} from '../../bench/n10/host-recovery-profile.mjs';
import {RECOVERY_VERIFICATION_REVISION} from '../../bench/n10/host-recovery-verification.mjs';
import {recoveryPlan,validateRecoveryRow,RECOVERY_METHOD} from '../../bench/n10/host-recovery.mjs';

// Reuse the established hand-derived fake-owner vocabulary, not a native engine.
// Pure fake owners. These fixtures never import or instantiate a native engine.
const clone = value => structuredClone(value);
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const sha = value => createHash('sha256').update(value).digest('hex');
function checksum(text) { let value = 2166136261; for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619); return (value >>> 0).toString(16).padStart(8, '0'); }
function fixtureRecords(size = 3) { return Array.from({length:size}, (_, i) => ({id:'fixture:' + String(i).padStart(4, '0'),text:{body:['red blue red','Å 𐐀']},metadata:{group:'fixture',revision:i}})); }
const literalTokens = new Map([
  ['red blue red', [['red',0,3],['blue',4,8],['red',9,12]]],
  ['Å 𐐀', [['å',0,1],['𐐨',2,4]]],
  ['n9oldstate', [['n9oldstate',0,10]]],
  ['n10afterwrite n9red n9blue', [['n10afterwrite',0,13],['n9red',14,19],['n9blue',20,26]]],
]);
function projected(records, variant) {
  const documents = {}, terms = {}, sources = {}, positions = {};
  const total = {documents:records.length,textCodeUnits:0,tokens:0,dictionaryEntries:0,postingEntries:0};
  let sourceEntries = 0, positionEntries = 0, occurrences = 0, termEntries = 0, termCodeUnits = 0, fieldDocuments = 0;
  for (const record of records) {
    const values = Array.isArray(record.text.body) ? record.text.body : [record.text.body];
    const frequency = {}, positionValues = []; let length = 0, units = 0, retained = 2, entries = 0, codeUnits = 0, count = 0;
    for (const value of values) {
      const tokens = literalTokens.get(value); assert.ok(tokens, 'hand-derived literal fixture'); units += value.length; retained++;
      const mapped = {};
      tokens.forEach(([term,start,end], index) => {
        frequency[term] = (frequency[term] ?? 0) + 1;
        if (!Object.hasOwn(mapped, term)) { mapped[term] = []; retained++; entries++; codeUnits += term.length; }
        mapped[term].push({position:index,positionLength:1,start,end}); retained += 3; count++;
      });
      length += tokens.length; positionValues.push({tokenCount:tokens.length,terms:mapped});
    }
    documents[record.id] = {id:record.id,textCodeUnits:units,metadata:clone(record.metadata ?? {}),fields:length ? {body:{length,terms:frequency}} : {}};
    sources[record.id] = {text:{body:clone(values)},retainedEntries:2 + values.length,textCodeUnits:units};
    positions[record.id] = {positions:{body:positionValues},retainedEntries:retained,occurrenceCount:count,offsetCount:count,termEntries:entries,termCodeUnits:codeUnits};
    total.textCodeUnits += units; total.tokens += length; total.postingEntries += Object.keys(frequency).length;
    sourceEntries += 2 + values.length; positionEntries += retained; occurrences += count; termEntries += entries; termCodeUnits += codeUnits; fieldDocuments += Number(length > 0);
    for (const [term, tf] of Object.entries(frequency)) { const item = terms[term] ??= {df:0,frequency:0,postings:{}}; item.df++; item.frequency += tf; item.postings[record.id] = tf; }
  }
  total.dictionaryEntries = Object.keys(terms).length;
  const participants = {source:{kind:'raveldex-source-v1',retainedEntries:sourceEntries,textCodeUnits:total.textCodeUnits,records:sources}};
  if (variant === 'positions-offsets') participants.positions = {kind:'raveldex-positions-v1',fields:['body'],offsetFields:['body'],retainedEntries:positionEntries,occurrenceCount:occurrences,offsetCount:occurrences,termEntries,termCodeUnits,records:positions};
  return {documents,counts:total,fields:{body:{documents:fieldDocuments,length:total.tokens,terms,order:Object.keys(terms).sort()}},participants};
}
function envelope(owner, corrupt) {
  const records = owner.records.map(record => ({id:record.id,text:{body:Array.isArray(record.text.body) ? clone(record.text.body) : [record.text.body]},metadata:clone(record.metadata ?? {})})).sort((a,b) => a.id < b.id ? -1 : 1);
  const value = {format:'raveldex-source',formatVersion:1,codec:{id:'raveldex-json-v1',version:1},body:{header:{originRevision:owner.revision,schema:{text:{body:{boost:1}}},fixture:'independent'},payload:{records}},integrity:{algorithm:'fnv1a32-utf16',value:''}};
  if (corrupt) corrupt(value);
  value.integrity.value = checksum(canonical(value.body));
  return value;
}
function fakeOptions(options) { return Object.fromEntries(Object.entries(options ?? {}).map(([key,value]) => [key,key === 'signal' ? {present:true,aborted:value.aborted} : clone(value)])); }
function fakeWorld(config = {}) {
  const records = fixtureRecords(config.size), trace = [], owners = []; let artifact = 0;
  const deadlineOptions = config.deadlineOptions ?? {}, variant = config.variant ?? 'source';
  const record = (owner, call, data = {}) => trace.push({owner:owner?.id ?? null,role:owner?.role ?? null,call,...data});
  const error = code => Object.assign(Error('fixture ' + code), {code,name:code === 'OUTCOME_UNKNOWN' ? 'WorkerAdapterError' : 'RaveldexError'});
  function create({role}) {
    const owner = {id:owners.length,role,revision:0,records:[],disposed:false}; owners.push(owner); record(owner,'create');
    owner.addMany = async (input, options) => {
      record(owner,'addMany',{records:clone(input),options:fakeOptions(options)});
      if (role === 'donor' && config.buildOutcome) throw error(config.buildOutcome);
      if (role === 'donor' && config.mutateInput) input[0].text.body[0] = 'poisoned native input';
      owner.records.push(...clone(input)); owner.revision++; return {revision:owner.revision,changed:true};
    };
    owner.search = async (query, options = {}) => {
      record(owner,'search',{query:clone(query),options:fakeOptions(options)});
      const all = typeof query === 'object' && query.kind === 'all';
      const selected = [...owner.records].filter(item => query === 'n9oldstate' ? item.id === PRIOR_RECORD.id : query === 'n10afterwrite' ? item.text.body === 'n10afterwrite n9red n9blue' : true).sort((a,b) => a.id < b.id ? -1 : 1);
      const offset = options.offset ?? 0, limit = options.limit ?? 20;
      const page = {revision:owner.revision,total:selected.length,completeness:'complete',model:'raveldex-bm25-v1',hits:selected.slice(offset,offset+limit).map(item => ({id:item.id,score:all ? 0 : 1}))};
      if (config.corruptPage && role === 'restoreSource' && owner.revision === 2 && all && offset >= 100) config.corruptPage(page);
      if (config.wrongModel && all) page.model = 'wrong-model';
      return page;
    };
    owner.replace = async (input, options) => { record(owner,'replace',{record:clone(input),options:fakeOptions(options)}); owner.records = owner.records.map(item => item.id === input.id ? clone(input) : item); owner.revision++; const receipt = {revision:owner.revision,changed:true}; config.corruptWriteReceipt?.(receipt); return receipt; };
    owner.dispose = async () => { record(owner,'dispose'); owner.disposed = true; if (config.cleanupRole === role) throw Error('fixture cleanup failure'); };
    return owner;
  }
  function createSnapshots(owner) {
    record(owner,'createSnapshots');
    const result = {
      exportSource: async options => {
        record(owner,'exportSource',{options:fakeOptions(options)});
        if (owner.role === 'donor' && config.exportOutcome) throw error(config.exportOutcome);
        const target = owner.role === 'restoreSource' && owner.revision === 2;
        const value = envelope(owner, target ? config.corruptSource : undefined);
        if (target && config.badChecksum) value.integrity.value = '00000000';
        return JSON.stringify(value);
      },
      restore: (encoded, options) => {
        record(owner,'restore',{encodedSha256:sha(encoded),options:fakeOptions(options)});
        const policy = config.restoreOutcomes?.[owner.role] ?? (owner.role === 'deadlineRestore' ? 'DEADLINE_EXCEEDED' : owner.role === 'abortedRestore' ? 'CANCELLED' : 'Pass');
        const promise = policy === 'CANCELLED' ? new Promise((resolve,reject) => options.signal.addEventListener('abort', () => { record(owner,'abort'); reject(error('CANCELLED')); }, {once:true}))
          : Promise.resolve().then(() => {
            if (policy !== 'Pass') {
              if (policy === 'OUTCOME_UNKNOWN' && config.unknownCommitted) { owner.records = clone(JSON.parse(encoded).body.payload.records); owner.revision++; }
              throw error(policy);
            }
            const value = JSON.parse(encoded); owner.records = clone(value.body.payload.records); owner.revision++;
            const receipt = {revision:owner.revision,originRevision:value.body.header.originRevision,reindexed:true,format:'raveldex-source'};
            if (owner.role === 'restoreSource') config.corruptReceipt?.(receipt);
            return receipt;
          });
        promise.operationId = 'fixture:' + owner.role; return promise;
      },
    };
    if (config.reconcile !== false) result.reconcile = async operationId => { record(owner,'reconcile',{operationId}); return {status:'unresolved'}; };
    return result;
  }
  const captureRoot = config.privateRoot === false ? undefined : owner => {
    record(owner,'captureRoot'); const value = projected(owner.records,variant);
    if (config.corruptRoot && owner.role === 'restoreSource' && owner.revision === 2) config.corruptRoot(value);
    return {canonical:canonical(value),encounterCanonical:canonical({ids:owner.records.map(item => item.id)}),revision:owner.revision};
  };
  const onState = async (value, meta) => { trace.push({call:'persistState',label:meta.label,sha256:sha(JSON.stringify(value))}); if (config.failStatePersistence === meta.label) throw Error('fixture state persistence failure'); return {artifact:String(artifact++) + '.state.json',bytes:JSON.stringify(value).length}; };
  const onSnapshot = async (encoded, meta) => { trace.push({call:'persistSnapshot',label:meta.label,sha256:sha(encoded)}); if (config.failSourcePersistence === meta.label) throw Error('fixture source persistence failure'); return {artifact:String(artifact++) + '.snapshot.json',bytes:encoded.length}; };
  const diagnostic = {start:async ({operation,engine,role}) => record(engine,'diagnosticStart',{operation,requestedRole:role}),stop:async ({engine,role}) => { record(engine,'diagnosticStop',{requestedRole:role}); return {emittedSteps:0,emittedWorkUnits:0}; }};
  const inputs = {create,createSnapshots,records,queries:['common','rare','narrow-prefix','source-phrase'].map(id => ({id,query:'fixture:' + id,expectedIds:records.map(item => item.id)})),variant,mode:config.mode ?? 'normal',deadlineOptions,diagnostic,captureRoot,onState,onSnapshot};
  return {inputs,trace,owners};
}
async function run(exercise, config) { const world = fakeWorld(config); let value,error; try { value = await exercise(world.inputs); } catch (caught) { error = caught; value = caught.recoveryReport; } return {...world,value,error}; }

function tickingClock() { let value = 0; return () => ++value; }
function profiler(extra = {}) { return createRecoveryProfiler({mode:'diagnostic',realm:'node-main',clock:tickingClock(),...extra}); }

test('normal lane never reads the supplied profiler clock', () => {
  let calls = 0;
  assert.equal(createRecoveryProfiler({mode:'normal',realm:'node-main',clock:() => { calls++; throw Error('observer'); }}),undefined);
  assert.equal(calls,0);
});

test('profile records parented inclusive spans without exclusive CPU or merged clocks', () => {
  const p = profiler(), parent = p.start('outer','fixture'), child = p.start('inner','fixture');
  p.end(child); p.end(parent);
  const value = p.snapshot();
  assert.deepEqual(value.revision,RECOVERY_PROFILE_REVISION);
  assert.equal(value.realm,'node-main');
  assert.equal(value.spans.length,2);
  const byPhase = Object.fromEntries(value.spans.map(span => [span.phase,span]));
  assert.equal(byPhase.outer.parentId,null);
  assert.equal(byPhase.inner.parentId,byPhase.outer.id);
  assert.ok(byPhase.outer.startMs <= byPhase.inner.startMs);
  assert.ok(byPhase.inner.endMs <= byPhase.outer.endMs);
  assert.equal(byPhase.outer.wallMs,byPhase.outer.endMs-byPhase.outer.startMs);
  assert.ok(byPhase.outer.wallMs > byPhase.inner.wallMs);
  validateRecoveryProfile(value);
  assert.equal(JSON.stringify(value).includes('exclusiveCpu'),false);
  p.release();
});

test('span tokens reject forged, cross-context, duplicate and out-of-order completion', () => {
  const p = profiler(), q = profiler(), parent = p.start('outer'), child = p.start('inner');
  assert.throws(() => p.end({}));
  assert.throws(() => q.end(child));
  assert.throws(() => p.end(parent));
  p.end(child); assert.throws(() => p.end(child)); p.end(parent);
  p.release(); q.release();
});

test('snapshots refuse open spans and release closes authority', () => {
  const p = profiler(), token = p.start('incomplete');
  assert.throws(() => p.assertIdle()); assert.throws(() => p.snapshot());
  p.end(token); p.assertIdle(); p.release(); p.release();
  assert.throws(() => p.start('late')); assert.throws(() => p.snapshot());
});

test('sync and async wrappers preserve exact values and first callback errors', async () => {
  const p = profiler(), value = {};
  assert.equal(p.sync('sync','result',() => value),value);
  assert.equal(await p.async('async','result',async () => value),value);
  const error = Error('original');
  assert.throws(() => p.sync('sync','failure',() => { throw error; }),caught => caught === error);
  await assert.rejects(p.async('async','failure',async () => { throw error; }),caught => caught === error);
  const result = p.snapshot();
  assert.deepEqual(result.spans.map(s => s.outcome),['Pass','Pass','Fail','Fail']);
  p.release();
});

test('bounded retention fails closed instead of silently dropping spans', () => {
  const p = profiler({maxSpans:2});
  for (let i=0;i<2;i++) { const token=p.start('bounded');p.end(token); }
  assert.throws(() => p.start('overflow'));
  assert.equal(p.snapshot().spans.length,2);
  p.release();
});

for (const clock of [() => NaN,() => Infinity,() => -1]) test('invalid local clock is rejected: '+String(clock), () => {
  const p = profiler({clock}); assert.throws(() => p.start('clock')); p.release();
});

test('a backward local clock cannot manufacture a nonnegative phase', () => {
  const values=[10,9],p=profiler({clock:() => values.shift()}),token=p.start('clock');
  assert.throws(() => p.end(token)); p.release();
});

async function differential(config={}) {
  const before=await run(oldExercise,config),world=fakeWorld(config);
  let clockCalls=0,value,error;
  world.inputs.profileRealm='node-main'; world.inputs.profileClock=() => ++clockCalls;
  try { value=await newExercise(world.inputs); } catch(caught) { error=caught;value=caught.recoveryReport; }
  assert.deepEqual(world.trace,before.trace,'native call/options/order/capture/persistence/abort/disposal transcript');
  assert.equal(Boolean(error),Boolean(before.error));
  assert.equal(value.outcome,before.value.outcome);
  const selected = result => [...result.samples,...result.observations].map(({operation,outcome,attempts,deadlineOptions,priorRevision,oldSourceBytesPreserved,oldRootPreserved,laterWrite})=>({operation,outcome,attempts,deadlineOptions,priorRevision,oldSourceBytesPreserved,oldRootPreserved,laterWrite}));
  assert.deepEqual(selected(value),selected(before.value),'selected outcomes, receipts, later writes');
  assert.ok(world.owners.every(owner=>owner.disposed));
  if(config.mode==='diagnostic') { assert.ok(clockCalls>0);validateRecoveryProfile(value.phaseProfile); }
  else { assert.equal(clockCalls,0);assert.equal(Object.hasOwn(value,'phaseProfile'),false); }
  return {value,error,clockCalls,...world};
}

for(const mode of ['normal','diagnostic']) for(const variant of ['source','positions-offsets']) test('d95fca1 transcript parity: '+mode+'/'+variant,async()=>{
  await differential({mode,variant,size:201,deadlineOptions:{deadlineMs:60000}});
});
for(const [name,config] of Object.entries({
  buildRefusal:{buildOutcome:'WORK_LIMIT_EXCEEDED'},exportRefusal:{exportOutcome:'DEADLINE_EXCEEDED'},
  unknownBefore:{restoreOutcomes:{restoreSource:'OUTCOME_UNKNOWN'}},unknownAfter:{restoreOutcomes:{restoreSource:'OUTCOME_UNKNOWN'},unknownCommitted:true},
  allSuccess:{restoreOutcomes:{deadlineRestore:'Pass',abortedRestore:'Pass'}},
  persistenceSource:{failSourcePersistence:'restoreSource-restored'},persistenceState:{failStatePersistence:'donor'},
  firstFailureCleanup:{buildOutcome:'INVALID_OPTIONS',cleanupRole:'donor'},receiverCleanup:{cleanupRole:'restoreSource'},
  noPrivate:{privateRoot:false},
})) test('diagnostic profiling preserves branch transcript: '+name,async()=>{await differential({mode:'diagnostic',...config});});

test('committed reference has exact reviewed first-slice source bytes',async()=>{
  const base=new URL('../../docs/evidence/RX-9006/overhead-slice2/validation/reference/',import.meta.url);
  const pins=JSON.parse(await readFile(new URL('pins.json',base)));
  assert.equal(pins.head,'d95fca1');
  for(const pin of pins.files)assert.equal(sha(await readFile(new URL(pin.path,base))),pin.sha256);
});

test('closing clock faults preserve the original synchronous and asynchronous callback errors',async()=>{
  for(const asynchronous of [false,true]){
    let reads=0;const original=Error('original operation failure');
    const p=profiler({clock:()=>++reads===1?1:NaN});
    if(asynchronous)await assert.rejects(p.async('fault','',async()=>{throw original;}),error=>error===original);
    else assert.throws(()=>p.sync('fault','',()=>{throw original;}),error=>error===original);
    assert.throws(()=>p.snapshot());p.release();
  }
});

function smallProfile(realm='browser-worker'){
  const p=profiler({realm}),token=p.start('root.projection-canonicalization','capture');p.end(token);const value=p.snapshot();p.release();return value;
}
test('remote worker snapshots retain their own clock domain and independent immutable scalar copies',()=>{
  const p=profiler({realm:'browser-main'}),remote=structuredClone(smallProfile());
  p.addRemote(remote);remote.spans[0].label='mutated after transfer';
  const value=p.snapshot();validateRecoveryProfile(value,{realm:'browser-main'});
  assert.equal(value.remote[0].realm,'browser-worker');
  assert.equal(value.remote[0].spans[0].label,'capture');
  assert.ok(Object.isFrozen(value.remote[0])&&Object.isFrozen(value.remote[0].spans));
  assert.notEqual(value.remote[0].spans,remote.spans);
  p.release();
});

test('remote snapshots reject main-realm clocks, nested remotes, extra payloads and aggregate overflow',()=>{
  const p=profiler({realm:'browser-main',maxSpans:2});
  assert.throws(()=>p.addRemote(smallProfile('node-main')));
  for(const mutate of [v=>v.payload={retained:'input'},v=>v.remote=[smallProfile()],v=>v.spans[0].source={retained:'input'}]){
    const value=structuredClone(smallProfile());mutate(value);assert.throws(()=>p.addRemote(value));
  }
  p.addRemote(smallProfile());p.addRemote(smallProfile());
  assert.throws(()=>p.addRemote(smallProfile()));p.release();
});
for(const level of ['profile','span'])test('profile validator rejects symbol payload retention at '+level,()=>{
  const p=profiler({realm:'browser-main'}),value=structuredClone(smallProfile());
  (level==='profile'?value:value.spans[0])[Symbol('retained input')]={payload:'input'};
  assert.throws(()=>p.addRemote(value));p.release();
});
for(const [name,mutate]of Object.entries({
  revision:v=>v.revision.id='stale',clock:v=>v.clock='mixed worker/main timestamps',realm:v=>v.realm='other',
  negative:v=>v.spans[0].wallMs=-1,nonfinite:v=>v.spans[0].endMs=Infinity,wrongDuration:v=>v.spans[0].wallMs++,
  absentParent:v=>v.spans[0].parentId=99,duplicate:v=>v.spans.push({...v.spans[0]}),hiddenData:v=>v.spans[0].payload='input',
}))test('profile validation rejects malformed '+name,()=>{
  const value=structuredClone(smallProfile());mutate(value);assert.throws(()=>validateRecoveryProfile(value));
});

for(const level of ['profile','span','revision'])test('validation rejects hidden and accessor data without invoking getters: '+level,()=>{
  for(const accessor of [false,true]){
    const value=structuredClone(smallProfile()),target=level==='profile'?value:level==='span'?value.spans[0]:value.revision;
    let reads=0;
    Object.defineProperty(target,'hidden',{enumerable:false,...(accessor?{get(){reads++;return {retained:'input'};}}:{value:{retained:'input'}})});
    assert.throws(()=>validateRecoveryProfile(value));assert.equal(reads,0);
  }
});
test('validation rejects a getter on an expected scalar field without invoking it',()=>{
  const value=structuredClone(smallProfile());let reads=0;
  Object.defineProperty(value.spans[0],'label',{enumerable:true,get(){reads++;return 'getter';}});
  assert.throws(()=>validateRecoveryProfile(value));assert.equal(reads,0);
});
function customSpans(spans){const value=structuredClone(smallProfile());value.spans=spans.map((s,i)=>({id:i+1,parentId:null,phase:'fixture',label:'',outcome:'Pass',...s,wallMs:s.endMs-s.startMs}));return value;}
for(const [name,spans]of Object.entries({
  rootsOverlap:[{startMs:1,endMs:10},{startMs:5,endMs:12}],
  siblingsOverlap:[{startMs:1,endMs:20},{parentId:1,startMs:2,endMs:10},{parentId:1,startMs:8,endMs:15}],
  startsGoBackward:[{startMs:10,endMs:11},{startMs:1,endMs:2}],
  missingActiveParent:[{startMs:1,endMs:20},{parentId:1,startMs:2,endMs:10},{parentId:1,startMs:3,endMs:5}],
}))test('validation rejects impossible inclusive serial interval tree: '+name,()=>{
  assert.throws(()=>validateRecoveryProfile(customSpans(spans)));
});
test('validation accepts sequential root spans and nested adjacent siblings',()=>{
  validateRecoveryProfile(customSpans([{startMs:1,endMs:10},{parentId:1,startMs:2,endMs:3},{parentId:1,startMs:3,endMs:4},{startMs:10,endMs:20}]));
});

test('selected-operation observer keeps original measured boundaries; only outside-window controls and idle guard differ',async()=>{
  const current=await readFile(new URL('../../bench/n10/host-recovery-case.mjs',import.meta.url),'utf8');
  const baseline=await readFile(new URL('../../docs/evidence/RX-9006/overhead-slice2/validation/reference/bench/n10/host-recovery-case.mjs',import.meta.url),'utf8');
  const observe=text=>text.slice(text.indexOf(' async function observe('),text.indexOf(' async function build('));
  assert.equal(observe(current).replace('profile?.assertIdle();','').replace("phaseAsync('diagnostic.control-start',operation,()=>diagnostic.start({operation,engine,role}))",'diagnostic.start({operation,engine,role})').replace("phaseAsync('diagnostic.control-stop',operation,()=>diagnostic.stop({engine,role}))",'diagnostic.stop({engine,role})'),observe(baseline));
});
async function refusedRow(mode='diagnostic'){
  const result=await differential({mode,buildOutcome:'WORK_LIMIT_EXCEEDED'});
  if(mode==='diagnostic')Object.assign(result.value.observations[0].counters,{hostYields:0,continuationsScheduled:0});
  return {job:recoveryPlan().find(j=>j.mode===mode&&j.host==='Node-direct'),outcome:'Collected',verificationRevision:RECOVERY_VERIFICATION_REVISION,profilingRevision:RECOVERY_PROFILE_REVISION,exercise:result.value};
}
test('current diagnostic row requires its exact profile identity and complete local profile',async()=>{
  const value=await refusedRow();assert.equal(validateRecoveryRow(value,value.job).length,5);
  for(const mutate of [r=>delete r.profilingRevision,r=>r.profilingRevision=null,r=>r.profilingRevision=false,
    r=>delete r.exercise.phaseProfile,r=>r.exercise.phaseProfile=null,r=>r.exercise.phaseProfile.realm='browser-main',
    r=>r.exercise.phaseProfile.revision.id='stale',r=>r.exercise.profilingRevision=RECOVERY_PROFILE_REVISION,r=>r.phaseProfile=smallProfile('node-main'),r=>r.phaseProfileError={message:'wrong level'},r=>r.exercise.phaseProfileError={message:'incomplete'},r=>r.exercise.observations[0].phaseProfile=smallProfile('node-main'),r=>{delete r.exercise.phaseProfile;delete r.profilingRevision;},
  ]){const bad=structuredClone(value);mutate(bad);assert.throws(()=>validateRecoveryRow(bad,bad.job));}
});
test('advertised profile cannot bypass validation by dropping top-level identity on a historical fixture',async()=>{
  const value=structuredClone(await refusedRow());delete value.verificationRevision;delete value.exercise.verificationRevision;delete value.profilingRevision;
  value.exercise.phaseProfile.spans[0].wallMs=-1;
  assert.throws(()=>validateRecoveryRow(value,value.job));
  delete value.exercise.phaseProfile;assert.equal(validateRecoveryRow(value,value.job).length,5,'genuinely identity-free historical fixture');
});
test('normal row rejects even an undefined profile property and keeps frozen native/collector limits',async()=>{
  const value=await refusedRow('normal');assert.equal(validateRecoveryRow(value,value.job).length,5);
  for(const phaseProfile of [undefined,null,smallProfile('node-main')]){
    const bad=structuredClone(value);bad.exercise.phaseProfile=phaseProfile;assert.throws(()=>validateRecoveryRow(bad,bad.job));
  }
  assert.equal(RECOVERY_METHOD.budgetMs,10800000);assert.equal(RECOVERY_METHOD.perContextWatchdogMs,300000);
});

for(const key of ['realm','spans','remote'])test('remote profile descriptors are checked before reading '+key,()=>{
  const value=structuredClone(smallProfile('browser-main')),child=structuredClone(smallProfile());let reads=0;
  Object.defineProperty(child,key,{enumerable:true,get(){reads++;return key==='realm'?'browser-worker':[];}});
  value.remote=[child];assert.throws(()=>validateRecoveryProfile(value));assert.equal(reads,0);
});
test('profile revision data is primitive checked without invoking toJSON',()=>{
  const value=structuredClone(smallProfile());let reads=0;
  value.revision.id={toJSON(){reads++;return RECOVERY_PROFILE_REVISION.id;}};
  assert.throws(()=>validateRecoveryProfile(value));assert.equal(reads,0);
});

test('diagnostic phase ledger covers every fresh verification query and acknowledged artifact',async()=>{
  const result=await differential({mode:'diagnostic',variant:'positions-offsets',size:201});
  const spans=result.value.phaseProfile.spans;
  assert.equal(spans.filter(s=>s.phase.startsWith('native.verification-')&&s.phase!=='native.verification-export').length,result.trace.filter(x=>x.call==='search').length);
  assert.equal(spans.filter(s=>s.phase==='persistence.acknowledged-source').length,result.trace.filter(x=>x.call==='persistSnapshot').length);
  assert.equal(spans.filter(s=>s.phase==='persistence.acknowledged-root').length,result.trace.filter(x=>x.call==='persistState').length);
  for(const phase of ['source.parse-checksum-canonicalization','source.actual-literal-comparison','source.validated-parity','state.actual-decode','state.expected-construction','state.actual-comparison-canonicalization','expected.literal-ownership','expected.source-and-ids'])assert.ok(spans.some(s=>s.phase===phase),phase);
  const serialized=JSON.stringify(result.value.phaseProfile);
  for(const input of ['red blue red','fixture:0001','n10afterwrite n9red n9blue'])assert.equal(serialized.includes(input),false,'profiling records retain scalar labels/timings, not native/literal data');
});

test('persistence failure remains first even when span-close clock and donor cleanup also fail',async()=>{
  const world=fakeWorld({mode:'diagnostic',cleanupRole:'donor'}),original=Error('first artifact acknowledgement failure');
  let fault=false,ticks=0;
  const persist=world.inputs.onSnapshot;
  world.inputs.onSnapshot=async(value,meta)=>{await persist(value,meta);fault=true;throw original;};
  world.inputs.profileClock=()=>fault?NaN:++ticks;
  await assert.rejects(newExercise(world.inputs),error=>{
    assert.equal(error,original);assert.equal(error.recoveryReport.failure.message,original.message);
    assert.equal(error.recoveryReport.cleanupErrors[0].message,'fixture cleanup failure');
    assert.equal(error.recoveryReport.outcome,'Fail');return true;
  });
  assert.ok(world.owners.every(owner=>owner.disposed));
});
