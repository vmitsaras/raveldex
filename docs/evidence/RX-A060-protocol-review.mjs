/** Independent review of parent/other-authored protocol, oracle and package work.
 * The author implemented src/addons/literal and excludes that implementation
 * from this independent verdict. This file uses a distinct source predicate. */
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRaveldex} from '../../dist/index.js';
import {createSourceProvider} from '../../dist/addons/phrases/source.js';
import {directoryGet} from '../../dist/core/index/directory.js';
import {setup as setupOwner,search as traceSearch} from '../../test/addons/typo/helpers.mjs';
import {FakeSignal} from '../../test/fixtures/execution/host.mjs';
import {literalSourceRanges,scanLiteralSourceCorpus,sourceLiteralQueryResult} from '../../test/oracle/literal.mjs';

const root=new URL('../../',import.meta.url),rows=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const schema={text:{body:{boost:2},other:{}}},fields=['body'];
const records=[{id:'a',text:{body:'red red'}},{id:'b',text:{body:'red'}},{id:'c',text:{body:'!!!'}},{id:'d',text:{body:'blue'}},{id:'e',text:{}}];
const cap='independent-source-probe';
const lexical=text=>({kind:'text',text,fields:['body']});
const request=text=>({kind:'extension',capability:cap,version:1,payload:{text}});
const ids=value=>value.hits.map(hit=>hit.id);
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=1e-12,`${actual} != ${expected}`);
async function probe(name,run){try{rows.push({name,status:'Pass',...await run()});}catch(error){rows.push({name,status:'Fail',error:error.message,stack:error.stack});}}
function bridge({work=100000,prepare,extraRequires=[],evidence}={}){
  return{manifest:{id:cap,version:'1.0.0',contractVersion:1,roles:['leaf-refinement',...(evidence?['evidence']:[])],provides:[{id:cap,contractVersion:1}],requires:[{id:'source:body',contractVersion:1},...extraRequires],dataRequirements:{fields,source:true,positions:false,offsets:false,metadata:false},indexEffect:'none',rebuildPolicy:'new-index',execution:{direct:true,worker:false},limits:{maxPayloadCodeUnits:2048,maxWorkUnits:work,maxRetainedEntries:0,maxOutputEntries:evidence?16384:0},costs:{importedCode:'Independent trusted bridge test',retainedRepresentation:'No optional state',transientWork:'Independent generator probes',externalResources:'none'}},
    sourcePredicate:{kind:'source-substring',capture(input){const text=input.text;return Object.freeze({value:Object.freeze({text}),codeUnits:text.length+4});},
      *prepare(context){if(prepare)return yield* prepare(context);const source=context.state('source:body');yield{workUnits:1};return{*test(id){yield{workUnits:1};const values=directoryGet(source.records,id)?.text.body??[];return values.some(value=>value.includes(context.payload.text));}};}},
    ...(evidence?{evidence}:{}),
  };
}
function owner(addon){return setupOwner({schema,addons:[createSourceProvider({fields}),addon]});}

await probe('R1 exact source-requirement set rejects surplus declared capability access',async()=>{
  const results=[];
  for(const extra of [{id:'source:other',contractVersion:1},{id:'positions:other',contractVersion:1},{id:'foreign:participant',contractVersion:1}]){
    assert.throws(()=>createRaveldex({schema,addons:[createSourceProvider({fields:['body','other']}),bridge({extraRequires:[extra]})]}),error=>{results.push({extra:extra.id,code:error.code,path:error.details?.path});return ['INCOMPATIBLE_CAPABILITY','MISSING_CAPABILITY'].includes(error.code);});
  }
  assert.equal(results[0].code,'INCOMPATIBLE_CAPABILITY');assert.equal(results[0].path,'addons.sourcePredicate.requires');
  return{refusals:results,qualification:'The actually installed surplus source provider hits the exact-set guard; absent foreign providers fail the earlier missing-capability check. Static pre-repair inspection found the gap; first executed probe occurred after parent rebuilt the repair. No pre-repair runtime reproduction is claimed.'};
});

await probe('Source predicate handle capture rejects accessors, mixed roles and malformed source declarations',async()=>{
  let reads=0,refusals=0;
  for(const key of ['kind','capture','prepare']){const addon=bridge(),handle={...addon.sourcePredicate};Object.defineProperty(handle,key,{enumerable:true,get(){reads++;return addon.sourcePredicate[key];}});assert.throws(()=>createRaveldex({schema,addons:[createSourceProvider({fields}),{...addon,sourcePredicate:handle}]}),{code:'INCOMPATIBLE_CAPABILITY'});refusals++;}
  const native=bridge();
  for(const addon of [{...native,predicate:{capture(){},prepare(){}}},{...native,refinement:{kind:'exact-token-sequence',maxTokens:1,prepare(){}}},{...native,sourcePredicate:{...native.sourcePredicate,kind:'foreign'}},...['metadata','positions','offsets'].map(key=>({...native,manifest:{...native.manifest,dataRequirements:{...native.manifest.dataRequirements,[key]:true}}})),{...native,manifest:{...native.manifest,dataRequirements:{...native.manifest.dataRequirements,source:false}}}]){assert.throws(()=>createRaveldex({schema,addons:[createSourceProvider({fields}),addon]}),{code:'INCOMPATIBLE_CAPABILITY'});refusals++;}
  assert.equal(reads,0);return{refusals,getterReads:reads};
});

await probe('Complete-document predicate iteration includes punctuation-only and missing-field records with zero lexical groups',async()=>{
  const called=[],addon=bridge({*prepare(context){assert.ok(Object.isFrozen(context)&&Object.isFrozen(context.schema)&&Object.isFrozen(context.limits)&&Object.isFrozen(context.payload));const source=context.state('source:body');yield{workUnits:1};return{*test(id){assert.equal(typeof id,'string');called.push(id);yield{workUnits:1};return(directoryGet(source.records,id)?.text.body??[]).some(value=>value.includes(context.payload.text));}};}}),f=owner(addon);
  try{await f.call('addMany',records);const result=await f.call('search',request('!'));assert.deepEqual(ids(result),['c']);assert.equal(result.hits[0].score,0);assert.deepEqual([...called].sort(),records.map(row=>row.id));
    const traced=traceSearch(f.engine.root,request('!'),{limit:100},{ids:records.map(row=>row.id)}).value;assert.equal(traced.trace.facts.filter(fact=>fact.kind==='field'||fact.kind==='group').length,0);const fact=traced.trace.facts.find(fact=>fact.kind==='document'&&fact.id==='c');assert.equal(fact.matched,true);assert.deepEqual(fact.groups,[]);assert.equal(fact.score,0);
    return{opaqueIds:[...new Set(called)].sort(),qualifyingCalls:called.length,documentsPerSearch:records.length,punctuationOnlyHit:'c',lexicalFacts:0,traceDocument:fact};
  }finally{await f.call('dispose');}
});

await probe('Native mixed scoring and Boolean participation agree with independent hand arithmetic',async()=>{
  const f=owner(bridge()),idf=Math.log(1+(3-2+0.5)/(2+0.5)),wanted={a:2*idf*(2*2.2)/(2+1.2*(0.25+0.75*2/(4/3))),b:2*idf*2.2/(1+1.2*(0.25+0.75/(4/3)))};let comparisons=0;
  try{await f.call('addMany',records);const expected=[{id:'a',score:wanted.a},{id:'b',score:wanted.b}];assert.deepEqual(ids(await f.call('search',lexical('red'))),['a','b']);
    const cases=[{query:{kind:'and',children:[lexical('red'),request('red')]},hits:expected},{query:{kind:'or',children:[lexical('red'),request('!')]},hits:[...expected,{id:'c',score:0}]},{query:{kind:'not',child:request('red')},hits:['c','d','e'].map(id=>({id,score:0}))},{query:{kind:'or',children:[{kind:'and',children:[lexical('red'),request('missing')]},request('!')]},hits:[{id:'c',score:0}]}];
    for(const entry of cases)for(const page of [{limit:100},{limit:0},{limit:1,offset:1}]){const result=await f.call('search',entry.query,page),slice=entry.hits.slice(page.offset??0,(page.offset??0)+page.limit);assert.equal(result.total,entry.hits.length);assert.deepEqual(ids(result),slice.map(hit=>hit.id));for(let i=0;i<slice.length;i++)close(result.hits[i].score,slice[i].score);comparisons++;}
    return{comparisons,fieldPopulation:3,fieldTotalLength:4,documentFrequency:2,expectedScores:wanted};
  }finally{await f.call('dispose');}
});

await probe('Context state access refuses undeclared capability names before testing an empty corpus',async()=>{
  const addon=bridge({*prepare(context){context.state('source:other');return{*test(){return true;}};}}),engine=createRaveldex({schema,addons:[createSourceProvider({fields:['body','other']}),addon]});
  try{await assert.rejects(engine.search(request('x')),{code:'MISSING_CAPABILITY'});return{refusals:1,emptyCorpus:true,qualification:'Capability-name isolation over trusted participant handles, not projection/sandbox isolation within a shared immutable source-provider root.'};}
  finally{await engine.dispose();}
});

await probe('Captured trusted callbacks remain owned after caller changes source predicate methods',async()=>{
  const addon=bridge(),f=owner(addon);addon.sourcePredicate.capture=()=>{throw Error('mutated capture')};addon.sourcePredicate.prepare=function*(){throw Error('mutated prepare')};
  try{await f.call('addMany',records);assert.deepEqual(ids(await f.call('search',request('!'))),['c']);return{sourceCapture:'Original bound callback',prepare:'Original bound callback'};}
  finally{await f.call('dispose');}
});

await probe('Shared source lexical capture ceiling rejects aggregate payloads before provider preparation',async()=>{
  let prepares=0;const addon=bridge({*prepare(){prepares++;return{*test(){return false;}};}}),f=owner(addon);
  try{await f.call('addMany',records);const q={kind:'and',children:[request('x'.repeat(1020)),request('x'.repeat(1020))]};assert.equal((await f.call('search',q)).total,0);assert.equal(prepares,2);q.children.push(request('x'));await assert.rejects(f.call('search',q),{code:'LIMIT_EXCEEDED'});assert.equal(prepares,2);return{exactAggregateUnits:2048,rejectedAggregateUnits:2053,prepareCallsAfterRefusal:prepares};}
  finally{await f.call('dispose');}
});

await probe('A single registration budget spans every source leaf and optional evidence cursor',async()=>{
  const prepared=function*(){yield{workUnits:1};return{*test(){yield{workUnits:4};return true;}};},evidence={capture(input){return{value:Object.freeze({ids:Object.freeze([...input.ids])}),codeUnits:input.ids.join('').length};},select(value){return{ids:value.ids,maxFacts:4096};},*prepare(){yield{workUnits:1};return{*finish(){yield{workUnits:1};return{value:Object.freeze({}),entries:0};}};}},addon=bridge({work:21,prepare:prepared,evidence}),f=owner(addon);
  try{await f.call('addMany',records);assert.equal((await f.call('search',request('x'))).total,5);await assert.rejects(f.call('search',{kind:'and',children:[request('x'),request('x')]}),{code:'WORK_LIMIT_EXCEEDED'});await assert.rejects(f.call('search',request('x'),{extensions:{[cap]:{ids:['a']}}}),{code:'WORK_LIMIT_EXCEEDED'});assert.equal(f.engine.root.revision,1);return{singleLeafBudget:21,documentTests:5,multiLeafRefusal:'WORK_LIMIT_EXCEEDED',queryPlusEvidenceRefusal:'WORK_LIMIT_EXCEEDED'};}
  finally{await f.call('dispose');}
});

await probe('Evidence finalization shares the exact remaining registration budget and closes on overflow',async()=>{
  let finishCalls=0,closed=0;
  const evidence={capture(input){return{value:Object.freeze({ids:Object.freeze([...input.ids])}),codeUnits:input.ids.join('').length};},select(value){return{ids:value.ids,maxFacts:4096};},*prepare(){yield{workUnits:1};return{*finish(){try{finishCalls++;yield{workUnits:1};return{value:Object.freeze({}),entries:0};}finally{closed++;}}};}},addon=bridge({work:22,*prepare(){yield{workUnits:1};return{*test(){yield{workUnits:4};return true;}};},evidence}),f=owner(addon);
  try{await f.call('addMany',records);await assert.rejects(f.call('search',request('x'),{extensions:{[cap]:{ids:['a']}}}),{code:'WORK_LIMIT_EXCEEDED'});assert.equal(finishCalls,1);assert.equal(closed,1);return{budget:22,prepareAndTestUnits:22,finishUnits:1,error:'WORK_LIMIT_EXCEEDED',finishCalls,closed};}
  finally{await f.call('dispose');}
});

await probe('Stop checks after trusted advancement precede returned-handle/Boolean and module-work failures',async()=>{
  const observations=[];
  for(const when of ['prepare-return-invalid','prepare-step-overflow','test-return-invalid','test-step-overflow']){const signal=new FakeSignal();let closed=0;const addon=bridge({work:1,*prepare(){try{if(when.startsWith('prepare')){signal.stop(false);if(when.endsWith('overflow'))yield{workUnits:2};return null;}return{*test(){try{signal.stop(false);if(when.endsWith('overflow'))yield{workUnits:2};return 'invalid';}finally{closed++;}}};}finally{if(when.startsWith('prepare'))closed++;}}}),f=owner(addon);
    try{await f.call('addMany',records);await assert.rejects(f.call('search',request('x'),{signal}),{code:'CANCELLED'});assert.equal(closed,1);assert.equal(signal.listenerCount,0);assert.equal(f.host.pending,0);assert.equal(f.engine.root.revision,1);observations.push({when,error:'CANCELLED',closed});}finally{await f.call('dispose');}}
  return{observations};
});

await probe('Independent source oracle matches native raw overlap truth over deterministic Unicode and full-corpus numerical controls',async()=>{
  const alphabet=['a','A','b','_','/',' ','\n','😀','💡','é','e\u0301','ﬃ','Ａ','\u0000','\u0301'];let seed=0x4a060,comparisons=0;
  const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let i=0;i<1000;i++){const parts=Array.from({length:1+next()%18},()=>alphabet[next()%alphabet.length]),value=parts.join(''),points=[...value];const start=next()%points.length,needle=points.slice(start,start+1+next()%3).join('');for(const text of [needle,'MISSING',value,value.toUpperCase()]){const expected=[];for(let at=value.indexOf(text);at>=0;at=value.indexOf(text,at+1))expected.push({start:at,end:at+text.length});assert.deepEqual(literalSourceRanges(value,text),expected);comparisons++;}}
  const model=scanLiteralSourceCorpus(records,schema),query={kind:'and',children:[lexical('red'),{kind:'literal',text:'red',fields:['body']}]},result=sourceLiteralQueryResult(model,query,{limit:100}),idf=Math.log(1+(3-2+0.5)/(2+0.5));assert.deepEqual(result.hits.map(hit=>hit.id),['a','b']);close(result.hits[0].score,2*idf*4.4/(2+1.2*(0.25+0.75*2/(4/3))));close(result.hits[1].score,2*idf*2.2/(1+1.2*(0.25+0.75/(4/3))));
  return{rawOracleComparisons:comparisons,handNumericalFacts:2,independence:'Native indexOf overlap scan and fresh hand field statistics; no production literal matcher, tokenizer or scorer supplies oracle truth.'};
});

await probe('All frozen real-document labels have exhaustive independent source membership and exact corpus identity',async()=>{
  const bytes=await readFile(new URL('test/fixtures/relevance/literal-v1.json',root)),fixture=JSON.parse(bytes),corpusBytes=await readFile(new URL(fixture.corpus.path,root)),corpus=JSON.parse(corpusBytes);assert.equal(hash(bytes),'659e90a5bde2816c13a466c3c2d1402a20935b9a7d5ad4c139fe3a86cde665b1');assert.equal(hash(corpusBytes),fixture.corpus.sha256);let positive=0,negative=0;
  for(const judgment of fixture.judgments){const actual=corpus.records.filter(record=>(judgment.fields??Object.keys(corpus.schema.text)).some(field=>{const raw=record.text[field],values=raw===undefined?[]:typeof raw==='string'?[raw]:raw;return values.some(value=>value.includes(judgment.text));})).map(record=>record.id).sort();assert.deepEqual(actual,[...judgment.expectedIds].sort(),judgment.id);if(judgment.category==='intended-empty'){negative++;assert.equal(actual.length,0);}else{positive++;assert.ok(actual.length>0);}}
  return{fixtureSha256:hash(bytes),corpusSha256:hash(corpusBytes),records:corpus.records.length,judgments:fixture.judgments.length,positive,negative,qualification:'Exhaustive exact-source memberships, not human relevance/usefulness or a user study.'};
});

const inputs=[];
for(const path of ['src/core/capabilities/types.ts','src/core/capabilities/registration.ts','src/core/capabilities/refinement.ts','src/core/contracts/query.ts','src/core/query/compile.ts','src/core/query/evaluate.ts','src/core/query/search.ts','src/index.ts','test/oracle/literal.mjs','test/fixtures/relevance/literal-v1.json','test/addons/literal/evaluation.test.mjs','test/addons/literal/lifecycle.test.mjs','test/measurements/literal-package.mjs','test/addons/literal/package.test.mjs','docs/specs/LITERAL_MATCHING.md','docs/api/LITERAL.md']){
  const bytes=await readFile(new URL(path,root));inputs.push({path,sha256:hash(bytes)});if(path.startsWith('src/')){const built=path.replace(/^src\//,'dist/').replace(/\.ts$/,'.js'),bytes=await readFile(new URL(built,root)),info=await stat(new URL(built,root));inputs.push({path:built,sha256:hash(bytes),modifiedAt:info.mtime.toISOString()});}
}
const failures=rows.filter(row=>row.status==='Fail');
const report={kind:'raveldex-rx-a060-independent-protocol-review-v1',reviewer:'/root/literal_seam',recordedAt:new Date().toISOString(),status:failures.length?'Fail':'Pass',recommendation:failures.length?'Changes required':'Ready with follow-ups',scope:'Independent other-authored core source-predicate protocol, oracle/frozen labels and package proof source review. The reviewer authored src/addons/literal and matching tests; those are excluded from the independent verdict. No build, Git mutation, remote action, publication or nested delegation.',environment:{node:process.version,platform:process.platform,arch:process.arch},commands:['node docs/evidence/RX-A060-protocol-review.mjs'],rows,passCount:rows.length-failures.length,failCount:failures.length,mandatoryFindings:failures.map(row=>({name:row.name,error:row.error})),resolvedFindings:[{id:'R1',kind:'Specification/protocol boundary',finding:'Registration allowed additional declared participant requirements beyond configured source fields, conflicting with its source-only reader contract.',resolution:'Exact declared source requirement set is checked at registration; an installed surplus source provider hits INCOMPATIBLE_CAPABILITY, while absent foreign requirements fail earlier with MISSING_CAPABILITY.',beforeEvidence:'Static source inspection before the repair; no executed pre-repair reproduction claimed.'}],retainedAttempts:[{path:'docs/evidence/RX-A060-protocol-review-attempt1.json',classification:'Review harness expectation defect',description:'The first independent R1 probe demanded INCOMPATIBLE_CAPABILITY even for absent foreign requirements. The correct earlier MISSING_CAPABILITY was retained; expectations now distinguish installed extra source from missing dependency. No product or frozen-label change.'}],followUps:['Finite exact-Node and source-corpus qualification; no manual AT/browser-Unicode or peak-memory claim.','Reader capability-name checks govern trusted immutable participant handles, not hostile-plugin sandbox or field-projection isolation within a shared source root.','Existing core gzip target miss remains a separate disclosed cost limitation; final artifact binding pending.'],inputs};
if(process.argv[2]){
  const directory=process.argv[2],candidatePath=join(directory,'candidate-report.json'),candidateBytes=await readFile(candidatePath),candidate=JSON.parse(candidateBytes);
  const python=String.raw`
import json,tarfile,hashlib,sys
from pathlib import Path,PurePosixPath
report=Path(sys.argv[1]);root=Path(sys.argv[2]);r=json.loads(report.read_text());tar=Path(r['package']['tarball']);raw=tar.read_bytes();sha=hashlib.sha256(raw).hexdigest();assert sha==r['package']['sha256'];files={f['path']:f for f in r['package']['files']};installed=Path(r['package']['installedDirectory']);seen={}
with tarfile.open(tar,'r:gz') as archive:
 for member in archive.getmembers():
  assert member.isfile() and not member.issym() and not member.islnk(),member.name
  p=PurePosixPath(member.name);assert not p.is_absolute() and '..' not in p.parts and p.parts[0]=='package'
  path='/'.join(p.parts[1:]);assert path and path not in seen and path in files,path
  data=archive.extractfile(member).read();digest=hashlib.sha256(data).hexdigest();assert digest==files[path]['sha256'],path
  assert data==(root/path).read_bytes(),path+' checkout mismatch'
  assert data==(installed/path).read_bytes(),path+' installed mismatch'
  seen[path]={'bytes':len(data),'sha256':digest}
assert set(seen)==set(files)
m=json.loads((installed/'package.json').read_text());assert m['private'] is True and m['version']=='0.1.0-rc.0' and not m.get('dependencies')
print(json.dumps({'kind':'raveldex-rx-a060-independent-protocol-artifact-audit-v1','status':'Pass','tarball':str(tar),'tarballSha256':sha,'tarballBytes':len(raw),'members':len(seen),'allMembersSafe':True,'allMembersMatchReport':True,'allMembersMatchCheckout':True,'allMembersMatchInstalled':True,'packagePrivate':m['private'],'packageVersion':m['version'],'runtimeDependencies':m.get('dependencies',{}),'candidateReportSha256':hashlib.sha256(report.read_bytes()).hexdigest(),'files':seen,'scope':'Independent archive/manifest/doc-consumer audit. Author-owned literal matching implementation excluded from independent algorithm verdict.'}))
`;
  const artifact=JSON.parse(execFileSync('python3',['-c',python,candidatePath,fileURLToPath(root)],{encoding:'utf8',maxBuffer:2*1024*1024}));assert.equal(candidate.status,'Pass');assert.equal(artifact.members,278);assert.equal(artifact.tarballBytes,206359);assert.equal(artifact.tarballSha256,'e82029dfbd7fbed0fe2587104d9414f4ab8c31ae7dad323806792653f1afa2e7');
  const measurementBytes=await readFile('/tmp/raveldex-rx-a060-final-package.json'),measurement=JSON.parse(measurementBytes);assert.equal(measurement.package.sha256,artifact.tarballSha256);
  artifact.measurementReportSha256=hash(measurementBytes);artifact.measurementTarballSame=true;
  const installed=candidate.package.installedDirectory,document=await readFile(join(installed,'docs/api/LITERAL.md'),'utf8'),example=/```js\n([\s\S]*?)\n```/.exec(document)?.[1];assert.ok(example);
  const consumer=join(directory,'consumer'),examplePath=join(consumer,'independent-protocol-documented-literal.mjs');await writeFile(examplePath,example);const stdout=execFileSync(process.execPath,[examplePath],{cwd:consumer,encoding:'utf8'});assert.equal(stdout,'1 0\n');artifact.documentation={status:'Pass',source:'docs/api/LITERAL.md',exampleSha256:hash(example),stdout,scope:'Actual installed other-authored public example executed; not an independent algorithm verdict over reviewer-authored matcher.'};
  const logBytes=await readFile('/tmp/raveldex-rx-a060-check-before-candidate.log'),log=logBytes.toString(),counts=pattern=>[...log.matchAll(pattern)].map(match=>Number(match[1]));assert.deepEqual(counts(/^ℹ tests (\d+)$/gm),[674,30,24,26,1]);for(const pattern of [/^ℹ fail (\d+)$/gm,/^ℹ cancelled (\d+)$/gm,/^ℹ skipped (\d+)$/gm,/^ℹ todo (\d+)$/gm])assert.ok(counts(pattern).every(count=>count===0));
  artifact.projectCheck={command:'npm run check',runBy:'Parent',logSha256:hash(logBytes),batches:counts(/^ℹ tests (\d+)$/gm),passed:755,failed:0,cancelled:0,skipped:0};
  artifact.graphs={coreGzipBytes:measurement.core.gzipBytes,literalOnlyGzipBytes:measurement.literalOnly.gzipBytes,combinedGzipBytes:measurement.combined.gzipBytes,coreTargetGzipBytes:15360,targetMet:measurement.core.targetMet};
  await writeFile(new URL('RX-A060-protocol-review-artifact.json',import.meta.url),JSON.stringify(artifact,null,2)+'\n');
  report.commands.push(`node docs/evidence/RX-A060-protocol-review.mjs ${directory}`);report.finalArtifact={status:'Pass',tarballSha256:artifact.tarballSha256,tarballBytes:artifact.tarballBytes,members:artifact.members,candidateReportSha256:artifact.candidateReportSha256,measurementReportSha256:artifact.measurementReportSha256,details:'docs/evidence/RX-A060-protocol-review-artifact.json',documentation:artifact.documentation,projectCheck:artifact.projectCheck,graphs:artifact.graphs};
  report.followUps[2]='Existing 19,531-byte core gzip observation misses the unchanged 15,360-byte target; package measurement is code size, not memory/latency.';
}
await writeFile(new URL('RX-A060-protocol-review.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,passCount:report.passCount,failCount:report.failCount,rows}));if(failures.length)process.exitCode=1;
