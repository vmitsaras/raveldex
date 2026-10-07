import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const repo=resolve(process.argv[2]??process.cwd()),imp=path=>import(pathToFileURL(resolve(repo,path)));
const [{captureConfiguration},{initializeParticipants},{emptyRoot,ExecutionOwner},{createFilters},{createFacets},{FakeHost}]=await Promise.all([imp('dist/core/contracts/schema.js'),imp('dist/core/capabilities/participants.js'),imp('dist/core/execution/engine.js'),imp('dist/addons/filters/index.js'),imp('dist/addons/facets/index.js'),imp('test/fixtures/execution/host.mjs')]);
const schema={text:{body:{}},metadata:{tags:{type:'string',multi:true,nullable:true}}};
const filter=createFilters({fields:['tags']}),facet=createFacets({fields:['tags']});
function setup(addon){const configuration=captureConfiguration({schema,addons:[addon]}),installed=initializeParticipants(configuration),host=new FakeHost(),engine=new ExecutionOwner(emptyRoot(configuration,installed.states),host,installed.participants);return{engine,host,async call(method,...args){const p=engine[method](...args);host.runReady();return p;}};}
const set={kind:'extension',capability:'set-membership',version:1,payload:{field:'tags',values:['x',null]}};
let malformedCaptures=0,malformedOutputs=0,malformedRoleValues=0;
for(const captured of [undefined,null,{}, {value:null,codeUnits:NaN},{value:null,codeUnits:-1},{value:null,codeUnits:1.5},{value:{},codeUnits:0}]){
  const item=setup({...filter,predicate:{...filter.predicate,capture(){return captured;}}});
  await assert.rejects(item.call('search',set),e=>e.code==='INCOMPATIBLE_CAPABILITY');malformedCaptures++;await item.engine.dispose();
}
for(const result of [undefined,null,{}, {value:null,entries:NaN},{value:null,entries:-1},{value:null,entries:1.5},{value:{},entries:0},{value:null,entries:9000}]){
  const item=setup({...facet,aggregation:{...facet.aggregation,*prepare(){return{*add(){},*finish(){return result;}};}}});
  await assert.rejects(item.call('search',{kind:'none'},{extensions:{facets:{fields:[{field:'tags'}]}}}),e=>['INCOMPATIBLE_CAPABILITY','LIMIT_EXCEEDED'].includes(e.code));malformedOutputs++;await item.engine.dispose();
}
for(const role of ['predicate','aggregation']){
  const addon=role==='predicate'?{...filter,predicate:{...filter.predicate,*prepare(){return{*test(){return 2;}};}}}:{...facet,aggregation:{...facet.aggregation,*prepare(){return{*add(){return 2;},*finish(){return{value:null,entries:0};}};}}};
  const item=setup(addon);await item.call('add',{id:'a',text:{body:'alpha'},metadata:{tags:['x']}});
  await assert.rejects(item.call('search',role==='predicate'?set:{kind:'all'},role==='predicate'?undefined:{extensions:{facets:{fields:[{field:'tags'}]}}}),e=>e.code==='INCOMPATIBLE_CAPABILITY');malformedRoleValues++;await item.engine.dispose();
}
// One trusted registration may implement both metadata roles. Measure its real
// yielded units and prove one shared cap spans repeated leaves and aggregation.
function composite(maxWorkUnits){const work={units:0,phases:{preparePredicate:0,test:0,prepareAggregation:0,add:0,finish:0}};
  function* measured(cursor,phase){try{for(;;){const step=cursor.next();if(step.done)return step.value;work.units+=step.value.workUnits;work.phases[phase]+=step.value.workUnits;yield step.value;}}finally{cursor.return(undefined);}}
  const registration={manifest:{...facet.manifest,id:'combined',roles:['leaf-refinement','aggregation'],provides:[...filter.manifest.provides,...facet.manifest.provides],limits:{...facet.manifest.limits,maxWorkUnits}},
    predicate:{capture:filter.predicate.capture,*prepare(context){assert.ok(Object.isFrozen(context)&&Object.isFrozen(context.schema)&&Object.isFrozen(context.limits));const prepared=yield* measured(filter.predicate.prepare(context),'preparePredicate');return{*test(metadata){assert.ok(Object.isFrozen(metadata));return yield* measured(prepared.test(metadata),'test');}};}},
    aggregation:{fieldType:'string',capture:facet.aggregation.capture,*prepare(context){const prepared=yield* measured(facet.aggregation.prepare(context),'prepareAggregation');return{*add(metadata){return yield* measured(prepared.add(metadata),'add');},*finish(){return yield* measured(prepared.finish(),'finish');}};}}};
  return{registration,work};
}
const records=[{id:'a',text:{body:'alpha'},metadata:{tags:['x','x',null]}},{id:'b',text:{body:'beta'},metadata:{tags:['x','z']}},{id:'c',text:{body:'gamma'},metadata:{tags:['z']}}];
const query={kind:'and',children:[set,set]},options={limit:0,extensions:{facets:{fields:[{field:'tags',missing:true}]}}};
const baseline=composite(100000),observed=setup(baseline.registration);await observed.call('addMany',records);const expected=await observed.call('search',query,options);assert.equal(expected.total,2);await observed.engine.dispose();
const exact=composite(baseline.work.units),exactEngine=setup(exact.registration);await exactEngine.call('addMany',records);assert.deepEqual(JSON.parse(JSON.stringify(await exactEngine.call('search',query,options))),JSON.parse(JSON.stringify(expected)));await exactEngine.engine.dispose();
const tight=composite(baseline.work.units-1),tightEngine=setup(tight.registration);await tightEngine.call('addMany',records);await assert.rejects(tightEngine.call('search',query,options),e=>e.code==='WORK_LIMIT_EXCEEDED');await tightEngine.engine.dispose();
assert.ok(Object.values(baseline.work.phases).every(n=>n>0));
const output={repo,malformedCaptures,malformedOutputs,malformedRoleValues,crossRoleSharedBudget:baseline.work,exactCapPassed:baseline.work.units,oneLessCapFailed:baseline.work.units-1};writeFileSync(resolve(process.argv[1]).replace(/\.mjs$/,'.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
