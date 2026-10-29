/** Independent core/oracle/package review. The author owns the production
 * proximity verifier and deliberately does not review that runtime here. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {createRaveldex} from '../../dist/index.js';
import {createPositionProvider} from '../../dist/addons/positions/index.js';
import {createSourceProvider} from '../../dist/addons/phrases/source.js';
import {createInspector} from '../../dist/addons/inspector/index.js';
import {createEnglishAnalyzer} from '../../dist/integrations/languages/english/index.js';
import {orderedSourceMatch} from '../oracle/proximity.mjs';
import {setup as fakeSetup} from '../addons/typo/helpers.mjs';
import {FakeSignal} from '../fixtures/execution/host.mjs';

const root=resolve(new URL('../..',import.meta.url).pathname),rows=[];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const schema={text:{body:{boost:2},other:{}}},fields=['body'];
const q=(groups=[['foo'],['bar']],maxGap=0,capability='review-near')=>({kind:'extension',capability,version:1,payload:{groups,maxGap}});
function ordered({prepare,maxWorkUnits=10000000,provides=['review-near'],id='review-ordered'}={}){
  return {manifest:{id,version:'0.1.0',contractVersion:1,roles:['leaf-refinement'],provides:provides.map(id=>({id,contractVersion:1})),requires:[{id:'positions:body',contractVersion:1}],dataRequirements:{fields,source:false,positions:true,offsets:false,metadata:false},indexEffect:'none',rebuildPolicy:'new-index',execution:{direct:true,worker:false},limits:{maxPayloadCodeUnits:16384,maxWorkUnits,maxRetainedEntries:0,maxOutputEntries:0},costs:{importedCode:'Independent review stub for core protocol only',retainedRepresentation:'None',transientWork:'Finite exact assertions',externalResources:'none'}},refinement:{kind:'ordered-token-groups',maxTokens:64,prepare:prepare??function*(context){yield{workUnits:1};return{*test(){yield{workUnits:1};return true;}};}}};
}
const records=[{id:'a',text:{body:'foo foo'}},{id:'b',text:{body:'foo bar'}},{id:'c',text:{body:'bar'}},{id:'other',text:{other:'foo bar'}}];
async function run(name,callback){const started=Date.now();const result=await callback();rows.push({name,status:'Pass',elapsedMs:Date.now()-started,...result});}
const bindings=[];
for(const path of ['src/core/contracts/query.ts','src/core/query/compile.ts','src/core/capabilities/registration.ts','src/core/capabilities/refinement.ts','src/core/capabilities/types.ts','src/addons/evidence/builder.ts','test/oracle/proximity.mjs','test/oracle/query.mjs','test/oracle/phrases.mjs','test/fixtures/phrases/proximity.mjs','test/fixtures/phrases/proximity-docs.json','test/fixtures/relevance/corpus.json','test/addons/proximity/evaluation.test.mjs','test/addons/proximity/protocol.test.mjs','test/addons/proximity/lifecycle.test.mjs','test/addons/proximity/package.test.mjs','test/measurements/proximity-package.mjs','scripts/candidate-check.mjs','package.json','package-lock.json','tsconfig.json','dist/core/contracts/query.js','dist/core/query/compile.js','dist/core/capabilities/registration.js','dist/core/capabilities/refinement.js','dist/addons/evidence/builder.js']){const bytes=await readFile(resolve(root,path));bindings.push({path,bytes:bytes.length,sha256:sha(bytes)});}
let failure;
try{
await run('Owned canonical ordered contexts and unchanged legacy contexts use distinct declared protocols',async()=>{
  const seen=[],handle=ordered({prepare:function*(context){seen.push(context);assert.ok(Object.isFrozen(context)&&Object.isFrozen(context.groups)&&Object.isFrozen(context.groups[0]));assert.deepEqual(context.groups,[['foo'],['bar','foo']]);assert.deepEqual(context.terms,['foo','bar','foo']);assert.deepEqual(context.fields,['body']);assert.equal(context.maxGap,2);assert.equal(context.state('positions:body').revision,context.revision);assert.throws(()=>context.state('source:body'),{code:'MISSING_CAPABILITY'});yield{workUnits:2};return{*test(){yield{workUnits:3};return true;}};}}),engine=createRaveldex({schema,addons:[createPositionProvider({fields}),handle]});
  handle.refinement.prepare=function*(){throw Error('Changed callback must not run');};
  try{await engine.addMany(records);const payload={groups:[['FOO','foo'],['foo','BAR']],maxGap:2},pending=engine.search({kind:'extension',capability:'review-near',version:1,payload},{limit:100});payload.groups[0][0]='lost';payload.maxGap=0;const result=await pending;assert.equal(result.total,2);assert.deepEqual(result.hits.map(h=>h.id).sort(),['a','b']);assert.equal(seen.length,1);assert.equal(Object.hasOwn(seen[0],'payload'),false);}finally{await engine.dispose();}
  let legacy;
  const exact=ordered({id:'review-exact',provides:['review-exact'],prepare:function*(context){legacy=context;yield{workUnits:1};return{*test(){return true;}};}});exact.refinement.kind='exact-token-sequence';const old=createRaveldex({schema,addons:[createPositionProvider({fields}),exact]});try{await old.addMany(records);await old.search({kind:'extension',capability:'review-exact',version:1,payload:{text:'foo',fields}});assert.ok(legacy);assert.equal(Object.hasOwn(legacy,'groups'),false);assert.equal(Object.hasOwn(legacy,'maxGap'),false);}finally{await old.dispose();}
  return{contexts:2,scope:'Core-owned capture/analysis/lexical selection; independent test handler deliberately accepts its lexical candidates.'};
});
await run('Native canonical groups preserve unrounded hand BM25, duplicates and Boolean success participation',async()=>{
  const engine=createRaveldex({schema,addons:[createPositionProvider({fields}),ordered(),createInspector()]});
  try{await engine.addMany(records);const result=await engine.search(q([['foo'],['foo','bar']]),{limit:100,extensions:{inspector:{ids:['a','b','c','other']}}});assert.equal(result.total,2);
    const score=tf=>2*Math.log(1+(3-2+0.5)/(2+0.5))*tf*2.2/(tf+1.2*(0.25+0.75*2/(5/3)));
    for(const hit of result.hits)assert.ok(Math.abs(hit.score-2*score(hit.id==='a'?2:1))<1e-12);
    const repeated=await engine.search(q([['foo'],['foo']]),{limit:100}),single=await engine.search({kind:'text',text:'foo',fields},{limit:100});assert.deepEqual(repeated,single);
    const one=await engine.search({kind:'text',text:'bar',fields},{limit:100}),failed={kind:'or',children:[{kind:'and',children:[q(),{kind:'none'}]},{kind:'text',text:'bar',fields}]};assert.deepEqual(await engine.search(failed,{limit:100}),one);
    const negative=await engine.search({kind:'not',child:q()},{limit:100});assert.ok(negative.hits.every(h=>h.score===0));assert.deepEqual(negative.hits.map(h=>h.id).sort(),['a','c','other']);
    return{handDerivedHits:2,fieldFacts:result.extensions.inspector.trace.facts.filter(f=>f.kind==='field').length,booleanComparisons:3};
  }finally{await engine.dispose();}
});
await run('Declared ordered dependencies reject extra state, offset/source/metadata requirements and accessor handles',async()=>{
  let reads=0;const own=ordered(),bad={kind:'ordered-token-groups',maxTokens:64};Object.defineProperty(bad,'prepare',{enumerable:true,get(){reads++;return own.refinement.prepare;}});assert.throws(()=>createRaveldex({schema,addons:[createPositionProvider({fields}),{...own,refinement:bad}]}),{code:'INCOMPATIBLE_CAPABILITY'});
  let refusals=1;
  for(const change of [base=>({...base,manifest:{...base.manifest,requires:[]}}),base=>({...base,manifest:{...base.manifest,requires:[...base.manifest.requires,{id:'source:body',contractVersion:1}]}}),...['source','offsets','metadata'].map(key=>base=>({...base,manifest:{...base.manifest,dataRequirements:{...base.manifest.dataRequirements,[key]:true}}}))]){assert.throws(()=>createRaveldex({schema,addons:[createPositionProvider({fields}),createSourceProvider({fields}),change(ordered())]}),e=>['MISSING_CAPABILITY','INCOMPATIBLE_CAPABILITY'].includes(e.code));refusals++;}
  assert.equal(reads,0);return{refusals,getterReads:reads};
});
await run('Raw admission owns every alternative without getters and charges duplicates to reduced token/string caps',async()=>{
  const engine=createRaveldex({schema,limits:{maxQueryGroups:1,maxQueryTokens:3},addons:[createPositionProvider({fields}),ordered()]});
  try{await engine.addMany(records);assert.equal((await engine.search(q([['FOO','foo'],['foo']]))).total,2);let refusals=0,reads=0;
    const payload={maxGap:0};Object.defineProperty(payload,'groups',{enumerable:true,get(){reads++;return[['foo']];}});
    for(const query of [{kind:'extension',capability:'review-near',version:1,payload},q([['foo','foo'],['foo','foo']]),q([['foo'],['bar']]),q([['foo bar']]),q([['']]),q([['\ud800']]),q([['foo']],33)]){await assert.rejects(engine.search({kind:'or',children:[{kind:'all'},query]}),e=>['INVALID_QUERY','LIMIT_EXCEEDED'].includes(e.code));refusals++;}assert.equal(reads,0);return{refusals,getterReads:reads};
  }finally{await engine.dispose();}
});
await run('Selected raw alternatives are transformed once and canonical output never re-enters analysis',async()=>{
  const seen=[],contexts=[],english=createEnglishAnalyzer(),analyzer={...english,manifest:{...english.manifest,id:'review-analyzer',provides:[{id:'analyzer:review-once-v1',contractVersion:1}]},analyzer:{kind:'single-token-transform',id:'review-once-v1',*transform(term){seen.push(term);yield{workUnits:1};return term==='foo'?'bar':term==='bar'?'baz':term;}}},handler=ordered({prepare:function*(context){contexts.push(context);yield{workUnits:1};return{*test(){return true;}};}}),engine=createRaveldex({schema,analyzer:{id:'review-once-v1',environmentProfile:'unqualified'},addons:[analyzer,createPositionProvider({fields}),handler]});
  try{await engine.add({id:'a',text:{body:'foo bar'}});seen.length=0;assert.equal((await engine.search(q([['FOO','foo'],['bar']]))).total,1);assert.deepEqual(seen,['foo','foo','bar']);assert.deepEqual(contexts[0].groups,[['bar'],['baz']]);return{transformCalls:seen.length,actualInputs:seen,canonicalGroups:contexts[0].groups};}finally{await engine.dispose();}
});
await run('One registration work budget covers aliased ordered leaves and complete operations',async()=>{
  const handler=ordered({maxWorkUnits:17,provides:['review-near','review-alias'],prepare:function*(){yield{workUnits:5};return{*test(){yield{workUnits:6};return true;}};}}),engine=createRaveldex({schema,addons:[createPositionProvider({fields}),handler]});
  try{await engine.addMany(records);assert.equal((await engine.search(q([['foo']]))).total,2);await assert.rejects(engine.search({kind:'or',children:[q([['foo']]),q([['foo']],0,'review-alias')]}),{code:'WORK_LIMIT_EXCEEDED'});assert.equal((await engine.search(q([['foo']]))).total,2);return{exactSingleLeafWorkUnits:17,aliases:2,typedFailure:'WORK_LIMIT_EXCEEDED'};}finally{await engine.dispose();}
});
await run('Reentrant prepare/test completion observes cancellation before over-budget work or returned membership',async()=>{
  const outcomes=[];
  for(const phase of ['prepare','test-step','test-return']){const signal=new FakeSignal();let closed=0;const handler=ordered({maxWorkUnits:1,prepare:function*(){if(phase==='prepare'){try{signal.stop(false);yield{workUnits:2};}finally{closed++;}}return{*test(){try{signal.stop(false);if(phase==='test-step')yield{workUnits:2};return true;}finally{closed++;}}};}}),fixture=fakeSetup({schema,addons:[createPositionProvider({fields}),handler]});try{await fixture.call('add',{id:'a',text:{body:'foo bar'}});const stable=fixture.engine.root;await assert.rejects(fixture.call('search',q(),{signal}),{code:'CANCELLED'});assert.equal(closed,1);assert.equal(fixture.engine.root,stable);assert.equal(fixture.host.pending,0);assert.equal(signal.listenerCount,0);outcomes.push({phase,code:'CANCELLED',closed});}finally{await fixture.call('dispose');}}
  return{outcomes};
});
function subsetReference(words,groups,gap){if(!groups.length)return false;for(let mask=1;mask<(1<<words.length);mask++){const positions=[];for(let p=0;p<words.length;p++)if(mask&(1<<p))positions.push(p);if(positions.length!==groups.length)continue;if(positions.every((p,g)=>groups[g].includes(words[p])&&(!g||p-positions[g-1]<=gap+1)))return true;}return false;}
await run('Independent subset enumeration checks the other-authored positional oracle across seeded arbitrary overlaps/repeats',()=>{
  let seed=0x7029a61;const random=max=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%max;};let cases=0;
  for(let i=0;i<5000;i++){const words=Array.from({length:random(9)},()=>['a','b','c'][random(3)]),groups=Array.from({length:1+random(4)},()=>Array.from({length:1+random(3)},()=>['a','b','c'][random(3)])),gap=[0,1,2,32][random(4)];assert.equal(orderedSourceMatch(words.map(term=>({term})),groups,gap),subsetReference(words,groups,gap));cases++;}
  return{cases,method:'Enumerate position subsets, then check each selected term/group and adjacent gap; no production tokenizer/compiler/scorer/reachability helper.'};
});
function tokenize(value){const output=[];let raw='';for(const character of value){const accepts=raw?/^[\p{L}\p{N}\p{M}]$/u.test(character):/^[\p{L}\p{N}]$/u.test(character);if(accepts)raw+=character;else if(raw){output.push(raw.normalize('NFKC').toLowerCase());raw='';}}if(raw)output.push(raw.normalize('NFKC').toLowerCase());return output;}
function windowReference(words,groups,gap){let prior=words.map(word=>groups[0].includes(word));for(const group of groups.slice(1))prior=words.map((word,p)=>group.includes(word)&&prior.slice(Math.max(0,p-gap-1),p).some(Boolean));return prior.some(Boolean);}
await run('Frozen real-document judgments agree with a separate character scanner and Boolean-window positional matrix',async()=>{
  const fixture=JSON.parse(await readFile(resolve(root,'test/fixtures/phrases/proximity-docs.json'),'utf8')),bytes=await readFile(resolve(root,fixture.corpus.path));assert.equal(sha(bytes),fixture.corpus.sha256);const corpus=JSON.parse(bytes);let positives=0,negatives=0;
  for(const row of fixture.judgments){const groups=row.groups.map(group=>group.map(value=>{const terms=tokenize(value);assert.equal(terms.length,1);return terms[0];}));const matches=corpus.records.filter(record=>Object.keys(corpus.schema.text).some(field=>{const raw=record.text[field],values=raw===undefined?[]:typeof raw==='string'?[raw]:raw;return values.some(value=>windowReference(tokenize(value),groups,row.maxGap));})).map(record=>record.id).sort();assert.deepEqual(matches,row.expectedIds,row.id);if(matches.length)positives++;else negatives++;}
  return{judgments:fixture.judgments.length,positives,negatives,corpusSha256:sha(bytes),labelSha256:sha(await readFile(resolve(root,'test/fixtures/phrases/proximity-docs.json'))),limitations:fixture.context.limitations};
});
await run('Packed public metadata and executed package report preserve optional imports, typed recovery and declared measurement scope',async()=>{
  const metadata=JSON.parse(await readFile(resolve(root,'package.json'),'utf8')),bytes=await readFile('/tmp/raveldex-rx-a070-package-initial.json'),report=JSON.parse(bytes);assert.equal(metadata.private,true);assert.equal(metadata.version,'0.1.0-rc.0');assert.deepEqual(metadata.dependencies??{},{});assert.deepEqual(metadata.exports['./addons/proximity'],{types:'./dist/addons/proximity/index.d.ts',import:'./dist/addons/proximity/index.js'});assert.ok(report.core.inputs.every(row=>!row.path.includes('/addons/proximity/')));assert.ok(report.proximityOnly.inputs.some(row=>row.path.includes('/addons/proximity/')));assert.ok(report.proximityOnly.inputs.every(row=>!row.path.includes('/execution/engine.js')));assert.equal(report.snapshots.comparisons,90);assert.equal(report.worker.comparisons,33);assert.equal(report.worker.mismatchRefusals.length,3);assert.ok(report.startup.every(row=>row.reads.length===0));assert.match(report.logicalState.basis,/not heap\/allocation/);return{packageReportSha256:sha(bytes),snapshotComparisons:90,workerComparisons:33,mismatchRefusals:report.snapshots.mismatchRows.length+report.worker.mismatchRefusals.length,coreGzip:report.core.gzipBytes,proximityGzip:report.proximityOnly.gzipBytes,scope:'Independent source/report audit of actually parent-executed packed checks; not a fresh package execution or physical memory/transport measurement.'};
});
}catch(error){failure={name:error.name,message:error.message,stack:error.stack,code:error.code??null};}
const unchanged=[];for(const binding of bindings){const bytes=await readFile(resolve(root,binding.path));assert.equal(sha(bytes),binding.sha256,`Source changed during independent review: ${binding.path}`);unchanged.push(binding.path);}
const report={kind:'raveldex-rx-a070-protocol-review-v1',timestamp:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch},status:failure?'Fail':'Pass',verdict:failure?'Changes required':'Ready with follow-ups',mandatoryFindings:failure?[failure]:[],scope:'Independent review of other-authored core admission/compiler/refinement/registration, token-evidence refusal, frozen positional oracle/labels and packed consumers. Author-owned proximity runtime/validator extraction/matching tests are excluded.',findings:[{id:'R1',kind:'static-correctness-before-final-verification',description:'Raw ordered sequence length initially inherited the reducible distinct canonical-group ceiling, unlike strict phrases with repeated terms. Parent removed that coupling before these probes; matching test verifies reduced canonical-group parity. No prerepair runtime failure is claimed.',resolution:'Resolved in current core source.'}],probes:rows,sourceBindings:bindings,bindingAudit:{status:'Pass',unchanged:unchanged.length},limitations:['Trusted add-on implementations are not hostile-code sandboxes.','Own proximity verifier, options, matching tests and shared validator extraction were not independently reviewed by this author.','Packed consumer report audit verifies scoped actual results; installed artifact byte-current audit follows the final candidate separately.','No browser/AT/native physical timing or heap/allocation/copy-peak claim.'],failure:failure??null};
const output=process.argv[2]??resolve(root,'docs/evidence/RX-A070-protocol-review.json');await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,verdict:report.verdict,probes:rows.length,bindings:bindings.length,output,failure:failure?.message??null}));if(failure)process.exitCode=1;
