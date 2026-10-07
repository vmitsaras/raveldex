import assert from 'node:assert/strict';
import fs from 'node:fs';
const rootpath=process.argv[2]??process.cwd(),url=path=>new URL(path,`file://${rootpath}/`).href;
const [{createRaveldex},{createInspector},{captureConfiguration},{initializeParticipants},{emptyRoot,ExecutionOwner},{FakeHost}]=await Promise.all(['dist/index.js','dist/addons/inspector/index.js','dist/core/contracts/schema.js','dist/core/capabilities/participants.js','dist/core/execution/engine.js','test/fixtures/execution/host.mjs'].map(p=>import(url(p))));
const schema={text:{title:{}}}, base=createInspector();
const outcome=[],errorCheck=(error,code)=>{assert.equal(error.code,code);assert.equal(error.message,`Raveldex: ${code}`);assert.ok(Object.isFrozen(error.details));return true;};
let getterCalls=0;
const factoryCases=[
 ['absent evidence',{manifest:base.manifest},'INCOMPATIBLE_CAPABILITY'],
 ['extra evidence method',{...base,evidence:{...base.evidence,extra(){}}},'INCOMPATIBLE_CAPABILITY'],
 ['missing capture',{...base,evidence:{select:base.evidence.select,prepare:base.evidence.prepare}},'INCOMPATIBLE_CAPABILITY'],
 ['capture nonfunction',{...base,evidence:{...base.evidence,capture:3}},'INCOMPATIBLE_CAPABILITY'],
 ['select nonfunction',{...base,evidence:{...base.evidence,select:null}},'INCOMPATIBLE_CAPABILITY'],
 ['prepare nonfunction',{...base,evidence:{...base.evidence,prepare:'x'}},'INCOMPATIBLE_CAPABILITY'],
 ['metadata incompatible',{...base,manifest:{...base.manifest,dataRequirements:{...base.manifest.dataRequirements,metadata:true}}},'INCOMPATIBLE_CAPABILITY'],
 ['positions incompatible',{...base,manifest:{...base.manifest,dataRequirements:{...base.manifest.dataRequirements,positions:true}}},'INCOMPATIBLE_CAPABILITY'],
 ['offsets incompatible',{...base,manifest:{...base.manifest,dataRequirements:{...base.manifest.dataRequirements,offsets:true}}},'INCOMPATIBLE_CAPABILITY'],
 ['source undeclared provider',{...base,manifest:{...base.manifest,dataRequirements:{...base.manifest.dataRequirements,fields:['title'],source:true}}},'MISSING_CAPABILITY'],
 ['require absent provider',{...base,manifest:{...base.manifest,requires:[{id:'unknown',contractVersion:1}]}},'MISSING_CAPABILITY'],
 ['duplicate evidence role',{...base,manifest:{...base.manifest,roles:['evidence','evidence']}},'INCOMPATIBLE_CAPABILITY'],
];
const getterHandle={...base.evidence};Object.defineProperty(getterHandle,'prepare',{enumerable:true,get(){getterCalls++;throw Error('unsafe getter');}});factoryCases.push(['handle getter',{...base,evidence:getterHandle},'INCOMPATIBLE_CAPABILITY']);
for(const [name,registration,code] of factoryCases){assert.throws(()=>createRaveldex({schema,addons:[registration]}),e=>errorCheck(e,code));outcome.push({phase:'factory',name,code});}
const malformed=[
 ['capture negative',{capture:()=>({value:Object.freeze({ids:[]}),codeUnits:-1})},'INCOMPATIBLE_CAPABILITY'],
 ['capture fractional',{capture:()=>({value:Object.freeze({ids:[]}),codeUnits:0.5})},'INCOMPATIBLE_CAPABILITY'],
 ['capture infinite',{capture:()=>({value:Object.freeze({ids:[]}),codeUnits:Infinity})},'INCOMPATIBLE_CAPABILITY'],
 ['capture mutable',{capture:()=>({value:{ids:[]},codeUnits:0})},'INCOMPATIBLE_CAPABILITY'],
 ['capture declared overcap',{capture:()=>({value:Object.freeze({ids:[]}),codeUnits:16385})},'LIMIT_EXCEEDED'],
 ['select absent ids',{select:()=>({})},'INVALID_OPTIONS'],
 ['select duplicate ids',{select:()=>({ids:['x','x']})},'INVALID_OPTIONS'],
 ['select mutable malformed',{select:()=>Object.assign(Object.create(Date.prototype),{ids:[]})},'INVALID_OPTIONS'],
 ['select facts overcap',{select:()=>({ids:[],maxFacts:4097})},'LIMIT_EXCEEDED'],
 ['prepare absent finish',{prepare:function*(){return {};}},'INCOMPATIBLE_CAPABILITY'],
 ['prepare nonfunction finish',{prepare:function*(){return {finish:3};}},'INCOMPATIBLE_CAPABILITY'],
 ['negative yielded work',{prepare:function*(){yield {workUnits:-1};return {finish:function*(){return {value:Object.freeze({}),entries:0};}};}},'INTERNAL_ERROR'],
 ['finish missing output',{prepare:function*(){return {finish:function*(){return undefined;}};}},'INCOMPATIBLE_CAPABILITY'],
 ['finish negative entries',{prepare:function*(){return {finish:function*(){return {value:Object.freeze({}),entries:-1};}};}},'INCOMPATIBLE_CAPABILITY'],
 ['finish fractional entries',{prepare:function*(){return {finish:function*(){return {value:Object.freeze({}),entries:0.5};}};}},'INCOMPATIBLE_CAPABILITY'],
 ['finish mutable output',{prepare:function*(){return {finish:function*(){return {value:{},entries:0};}};}},'INCOMPATIBLE_CAPABILITY'],
 ['finish entries overcap',{prepare:function*(){return {finish:function*(){return {value:Object.freeze({}),entries:16385};}};}},'LIMIT_EXCEEDED'],
];
for(const [name,override,code] of malformed){
 const engine=createRaveldex({schema,addons:[{...base,evidence:{...base.evidence,...override}}]});
 await engine.add({id:'x',text:{title:'alpha'}});await assert.rejects(engine.search('alpha',{extensions:{inspector:{ids:['x']}}}),e=>errorCheck(e,code));
 assert.equal((await engine.search('alpha')).total,1);await engine.dispose();outcome.push({phase:'runtime',name,code});
}
const aliases={...base,manifest:{...base.manifest,provides:[{id:'inspector',contractVersion:1},{id:'inspectoralias',contractVersion:1}]}};
const aliasEngine=createRaveldex({schema,addons:[aliases]});await assert.rejects(aliasEngine.search({kind:'all'},{extensions:{inspector:{ids:[]},inspectoralias:{ids:[]}}}),e=>errorCheck(e,'INVALID_OPTIONS'));await aliasEngine.dispose();outcome.push({phase:'runtime',name:'two evidence aliases cannot reset cap',code:'INVALID_OPTIONS'});
async function shared(maxWorkUnits,repeated){
 const observed={prepareRefinement:0,test:0,prepareEvidence:0,finish:0,closed:0};
 const registration={...base,manifest:{...base.manifest,roles:['leaf-refinement','evidence'],dataRequirements:{...base.manifest.dataRequirements,fields:['title']},limits:{...base.manifest.limits,maxWorkUnits}},
 refinement:{kind:'exact-token-sequence',maxTokens:32,prepare:function*(){observed.prepareRefinement+=7;yield {workUnits:7};return {test:function*(){observed.test+=11;yield {workUnits:11};return true;}};}},
 evidence:{...base.evidence,prepare:function*(){observed.prepareEvidence+=13;yield {workUnits:13};return {finish:function*(){try{observed.finish+=17;yield {workUnits:17};return {value:Object.freeze({kind:'independent-review'}),entries:1};}finally{observed.closed++;}}};}}};
 const configuration=captureConfiguration({schema,addons:[registration]}),installed=initializeParticipants(configuration),host=new FakeHost(),engine=new ExecutionOwner(emptyRoot(configuration,installed.states),host,installed.participants);
 const added=engine.add({id:'x',text:{title:'alpha'}});host.runReady();await added;
 const leaf={kind:'extension',capability:'inspector',version:1,payload:{text:'alpha',fields:['title']}},query=repeated?{kind:'and',children:[leaf,leaf]}:leaf;
 const promise=engine.search(query,{extensions:{inspector:{ids:['x']}}}).then(value=>({value}),error=>({error}));host.runReady();const result=await promise;
 const expected=repeated?66:48;if(maxWorkUnits<expected)errorCheck(result.error,'WORK_LIMIT_EXCEEDED');else{assert.equal(result.value.total,1);assert.equal(result.value.extensions.inspector.kind,'independent-review');}
 assert.deepEqual(observed,{prepareRefinement:repeated?14:7,test:repeated?22:11,prepareEvidence:13,finish:17,closed:1});
 const recovery=engine.search('alpha');host.runReady();assert.equal((await recovery).total,1);assert.equal(host.pending,0);await engine.dispose();return {maxWorkUnits,repeated,expectedTotal:expected,status:result.error?.code??'Pass',observed};
}
const sharedBudgets=[];for(const [maximum,repeated] of [[48,false],[47,false],[66,true],[65,true]])sharedBudgets.push(await shared(maximum,repeated));
assert.equal(getterCalls,0);const raw={status:'Pass',factoryFailures:factoryCases.length,runtimeFailures:malformed.length+1,getterCalls,outcome,sharedBudgets};fs.writeFileSync(new URL('./handles.json',import.meta.url),JSON.stringify(raw,null,2)+'\n');console.log(JSON.stringify({...raw,outcome:undefined}));
