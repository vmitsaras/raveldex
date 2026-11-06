import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {exerciseHostRecovery as oldExercise, verifyRecoveryState as oldState, PRIOR_RECORD} from '../../docs/evidence/RX-9006/overhead-slice1/v1/bench/n10/host-recovery-case.mjs';
import {exerciseHostRecovery as newExercise, verifyRecoveryState as newState} from '../../bench/n10/host-recovery-case.mjs';

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
async function parity(config, fail = false) {
  const before = await run(oldExercise,config), after = await run(newExercise,config);
  assert.deepEqual(after.trace,before.trace,'all native calls, options, fresh captures, persistence and disposal remain identical');
  assert.equal(Boolean(after.error),Boolean(before.error),'same terminal acceptance');
  assert.equal(Boolean(after.error),fail);
  assert.equal(after.value.outcome,before.value.outcome);
  const rows = value => [...value.samples,...value.observations].map(({operation,outcome,attempts,deadlineOptions,priorRevision,oldSourceBytesPreserved,oldRootPreserved,laterWrite}) => ({operation,outcome,attempts,deadlineOptions,priorRevision,oldSourceBytesPreserved,oldRootPreserved,laterWrite}));
  assert.deepEqual(rows(after.value),rows(before.value),'same operation outcomes, receipts and subsequent writes');
  assert.ok(after.owners.every(owner => owner.disposed),'all created fake owners disposed');
  return after;
}

test('v1 and revised success preserve all pages, batching, omitted/explicit options, captures and disposal',async () => {
  for (const deadlineOptions of [{},{deadlineMs:60000}]) for (const variant of ['source','positions-offsets']) await parity({size:201,deadlineOptions,variant});
  const result = await parity({size:257,privateRoot:false});
  assert.deepEqual(result.trace.filter(x => x.role === 'donor' && x.call === 'addMany').map(x => x.records.length),[256,1]);
  assert.deepEqual(result.trace.filter(x => x.role === 'restoreSource' && x.call === 'search' && x.query?.kind === 'all' && x.options.offset > 0).map(x => [x.options.offset,x.options.limit]),[[100,100],[200,57],[100,100],[200,57]]);
});
test('differential reference and historical helper retain exact executed v1 bytes',async () => {
  for (const [path, expected] of [
    ['../../docs/evidence/RX-9006/overhead-slice1/v1/bench/n10/host-recovery-case.mjs','1f02d60210c5fee17bda471d784760d8d54b1dfb33d3ca436db4d5268f64faea'],
    ['../../docs/evidence/RX-9006/overhead-slice1/v1/bench/n9/bulk-verify.mjs','1df3ddfa1a374607128565e3f8c38696b8eca23ae2843b8017939e11dd39f1fd'],
    ['../../bench/n9/bulk-verify.mjs','1df3ddfa1a374607128565e3f8c38696b8eca23ae2843b8017939e11dd39f1fd'],
  ]) assert.equal(sha(await readFile(new URL(path,import.meta.url))),expected);
});
test('diagnostic wrappers remain separate and preserve the same native transcript',async () => { await parity({mode:'diagnostic',variant:'positions-offsets'}); });
test('forced and aborted success still enumerate every page after commit and after the real later write',async () => {
  const result = await parity({size:201,restoreOutcomes:{deadlineRestore:'Pass',abortedRestore:'Pass'}});
  assert.equal(result.trace.filter(x => x.call === 'search' && x.query?.kind === 'all').length,21);
  for (const role of ['restoreSource','deadlineRestore','abortedRestore']) assert.deepEqual(result.trace.filter(x => x.role === role && x.call === 'search' && x.query?.kind === 'all').map(x => [x.options.offset,x.options.limit]),[[0,1],[0,100],[100,100],[200,1],[0,100],[100,100],[200,1]]);
});
for (const [operation,code] of [['restoreSource','DEADLINE_EXCEEDED'],['restoreSource','WORK_LIMIT_EXCEEDED'],['deadlineRestore','WORK_LIMIT_EXCEEDED'],['abortedRestore','DEADLINE_EXCEEDED']]) {
  test('authoritative restore refusal preserves the old state and a fresh later write: ' + operation + '/' + code,async () => {
    const result = await parity({restoreOutcomes:{[operation]:code}});
    const row = result.value.samples.find(x => x.operation === operation);
    assert.equal(row.oldRootPreserved,true); assert.equal(row.oldSourceBytesPreserved,true); assert.equal(row.laterWrite.outcome,'Pass');
  });
}
for (const operation of ['restoreSource','deadlineRestore','abortedRestore']) {
  test('forced success keeps complete fresh success-state and write observations: ' + operation,async () => { await parity({restoreOutcomes:{[operation]:'Pass'}}); });
  for (const reconcile of [true,false]) test('Unknown preserves delivery uncertainty without rollback or retry: ' + operation + '/' + reconcile,async () => {
    const result = await parity({restoreOutcomes:{[operation]:'OUTCOME_UNKNOWN'},reconcile});
    assert.equal(result.trace.some(x => x.role === operation && x.call === 'replace'),false);
    assert.equal(result.value.samples.find(x => x.operation === operation).authority.status,'unresolved');
  });
}
for (const reconcile of [true,false]) test('Unknown after actual fake commit still makes no rollback or retry claim: ' + reconcile,async () => {
  const result = await parity({restoreOutcomes:{restoreSource:'OUTCOME_UNKNOWN'},unknownCommitted:true,reconcile});
  assert.equal(result.owners.find(x => x.role === 'restoreSource').records.length,3);
  assert.equal(result.trace.some(x => x.role === 'restoreSource' && ['captureRoot','replace'].includes(x.call) && result.trace.indexOf(x) > result.trace.findIndex(y => y.role === 'restoreSource' && y.call === 'restore')),false);
});
for (const code of ['WORK_LIMIT_EXCEEDED','DEADLINE_EXCEEDED','OUTCOME_UNKNOWN']) {
  test('build refusal/Unknown retains zero-attempt dependent operations: ' + code,async () => {
    const result = await parity({buildOutcome:code}); assert.ok(result.value.samples.slice(1).every(x => x.outcome === 'Not run' && x.attempts === 0));
  });
  test('export refusal/Unknown keeps donor-query preservation and dependent Not-run: ' + code,async () => {
    const result = await parity({exportOutcome:code}); assert.ok(result.value.samples.slice(2).every(x => x.outcome === 'Not run' && x.attempts === 0));
  });
}
test('first unexpected failure and throwing cleanup retain the same failure branch',async () => { await parity({buildOutcome:'INVALID_OPTIONS',cleanupRole:'donor'},true); });
test('receiver cleanup rejection retains complete created-owner cleanup coverage',async () => { await parity({cleanupRole:'restoreSource'},true); });
for (const [name,corruptReceipt] of Object.entries({revision:r => r.revision++,origin:r => r.originRevision++,format:r => r.format = 'wrong',reindexed:r => r.reindexed = false})) test('both exercises reject forged restore publication receipts: ' + name,async () => { await parity({corruptReceipt},true); });
for (const [name,corruptWriteReceipt] of Object.entries({revision:r => r.revision--,changed:r => r.changed = false})) test('both exercises reject forged subsequent-write receipts: ' + name,async () => { await parity({corruptWriteReceipt},true); });
test('acknowledged source persistence failure stops at the same capture point',async () => { await parity({failSourcePersistence:'restoreSource-restored'},true); });
test('acknowledged private-state persistence failure stops at the same capture point',async () => { await parity({failStatePersistence:'donor'},true); });

for (const [name,corruptPage] of Object.entries({missingLast:p => p.hits = [],duplicateId:p => p.hits[0].id = 'fixture:0000',wrongRevision:p => p.revision++,wrongTotal:p => p.total--,nonzeroScore:p => p.hits[0].score = 1,incomplete:p => p.completeness = 'partial'})) {
  test('both verifiers reject late public membership corruption: ' + name,async () => { await parity({size:201,corruptPage},true); });
}
for (const [name,corruptSource] of Object.entries({value:e => e.body.payload.records.at(-1).text.body[0] = 'forged',metadata:e => e.body.payload.records.at(-1).metadata.revision++,valueOrder:e => e.body.payload.records[0].text.body.reverse(),duplicateId:e => e.body.payload.records.at(-1).id = e.body.payload.records[0].id,revision:e => e.body.header.originRevision++,header:e => e.body.header.fixture = 'changed',codec:e => e.codec.id = 'wrong',format:e => e.format = 'wrong'})) {
  test('both verifiers reject fresh source corruption after restore: ' + name,async () => { await parity({corruptSource},true); });
}
test('both verifiers freshly check every source checksum',async () => { await parity({badChecksum:true},true); });
test('online membership model scope remains unchanged; independent replay owns its model check',async () => { await parity({wrongModel:true}); });
for (const [name,mutate] of Object.entries({tf:s => s.documents['fixture:0000'].fields.body.terms.red++,df:s => s.fields.body.terms.red.df++,postings:s => s.fields.body.terms.red.postings['fixture:0000']++,counts:s => s.counts.tokens++,source:s => s.participants.source.records['fixture:0000'].text.body[0] = 'forged',metadata:s => s.documents['fixture:0000'].metadata.revision++,offset:s => s.participants.positions.records['fixture:0000'].positions.body[1].terms['𐐨'][0].start++,position:s => s.participants.positions.records['fixture:0000'].positions.body[0].terms.red[1].position--})) {
  for (const variant of ['offset','position'].includes(name) ? ['positions-offsets'] : ['source','positions-offsets']) test('both verifiers reject complete private state corruption: ' + name + '/' + variant,async () => { await parity({variant,corruptRoot:mutate},true); });
}
test('exercise expectations retain the original literal values when a fake native call mutates its input',async () => {
  const result = await run(newExercise,{mutateInput:true,privateRoot:false});
  assert.ok(result.error); assert.equal(result.value.outcome,'Fail');
  assert.match(result.error.message,/literal source/);
  assert.equal(result.trace.some(x => x.call === 'create' && x.role !== 'donor'),false);
  assert.ok(result.owners.every(owner => owner.disposed));
});
test('source-only exact provider membership rejects an unexpected positions sidecar',() => {
  const records = fixtureRecords(), state = projected(records,'positions-offsets');
  for (const verify of [oldState,newState]) assert.throws(() => verify(state,records,'source'));
});
test('hand-derived Unicode fixture retains every value-local position and original UTF-16 boundary',() => {
  const records = fixtureRecords(1), state = projected(records,'positions-offsets');
  assert.deepEqual(oldState(state,records,'positions-offsets'),newState(state,records,'positions-offsets'));
  const wrong = clone(state); wrong.participants.positions.records['fixture:0000'].positions.body[1].terms['𐐨'][0].end = 3;
  for (const verify of [oldState,newState]) assert.throws(() => verify(wrong,records,'positions-offsets'));
});
