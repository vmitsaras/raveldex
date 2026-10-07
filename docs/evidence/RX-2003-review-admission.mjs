import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const repo=resolve(process.argv[2]??process.cwd()),imp=path=>import(pathToFileURL(resolve(repo,path)));
const [{captureConfiguration},{initializeParticipants},{emptyRoot,ExecutionOwner},{createFilters},{createFacets},{FakeHost}]=await Promise.all([imp('dist/core/contracts/schema.js'),imp('dist/core/capabilities/participants.js'),imp('dist/core/execution/engine.js'),imp('dist/addons/filters/index.js'),imp('dist/addons/facets/index.js'),imp('test/fixtures/execution/host.mjs')]);
const schema={text:{body:{}},metadata:{n:{type:'number',multi:true,nullable:true},tags:{type:'string',multi:true,nullable:true},flag:{type:'boolean'}}};
function setup({addons=[createFilters({fields:['n','tags','flag']}),createFacets({fields:['tags']})],limits={}}={}){const configuration=captureConfiguration({schema,addons,limits}),installed=initializeParticipants(configuration),host=new FakeHost(),engine=new ExecutionOwner(emptyRoot(configuration,installed.states),host,installed.participants);return{engine,host,async call(...args){const p=engine.search(...args);host.runReady();return p;}};}
const range=payload=>({kind:'extension',capability:'numeric-range',version:1,payload});
const set=payload=>({kind:'extension',capability:'set-membership',version:1,payload});
let invalidCases=0,getterCalls=0;
async function rejected(call,codes){await assert.rejects(call,error=>{assert.ok(codes.includes(error.code),`${error.code} outside ${codes}`);assert.ok(error.name==='RaveldexError');assert.ok(!JSON.stringify(error).includes('sensitive-query-value'));return true;});invalidCases++;}
const engine=setup();
const ranges=[{},null,[],{field:'n'},{field:'n',gte:NaN},{field:'n',gte:Infinity},{field:'n',gte:'10'},{field:'n',gte:null},{field:'n',gte:undefined},{field:'n',gt:0,gte:0},{field:'n',lt:0,lte:0},{field:'n',gte:10,lte:9},{field:'tags',gte:0},{field:'flag',gte:0},{field:'missing',gte:0},{field:'n',gte:0,extra:true}];
for(const payload of ranges)for(const context of ['empty','or-all','and-none']){const q=range(payload),query=context==='empty'?q:context==='or-all'?{kind:'or',children:[{kind:'all'},q]}:{kind:'and',children:[{kind:'none'},q]};await rejected(engine.call(query,{limit:0}),['INVALID_QUERY']);}
const sets=[{field:'n',values:[]},{field:'n',values:[false]},{field:'n',values:['1']},{field:'n',values:[Infinity]},{field:'tags',values:[true]},{field:'flag',values:[null]},{field:'tags',values:['\ud800']},{field:'tags',values:['sensitive-query-value'],extra:0},{field:'n',values:Array.from({length:129},()=>0)},{field:'tags',values:['x'.repeat(1025)]}];
for(const payload of sets)await rejected(engine.call(set(payload),{limit:0}),['INVALID_QUERY','LIMIT_EXCEEDED']);
const getterPayload={field:'n'};Object.defineProperty(getterPayload,'gte',{enumerable:true,get(){getterCalls++;return 0;}});await rejected(engine.call(range(getterPayload)),['INVALID_QUERY']);
const arrayGetter=[0];Object.defineProperty(arrayGetter,'0',{get(){getterCalls++;return 0;}});await rejected(engine.call(set({field:'n',values:arrayGetter})),['INVALID_QUERY']);
const malformedFacetRequests=[{},null,[],{fields:[]},{fields:[{field:'n'}]},{fields:[{field:'tags',limit:-1}]},{fields:[{field:'tags',limit:1.5}]},{fields:[{field:'tags',limit:101}]},{fields:[{field:'tags',missing:1}]},{fields:[{field:'tags'},{field:'tags'}]},{fields:[{field:'tags',unknown:0}]},{fields:Array.from({length:9},()=>({field:'tags'}))}];
for(const facets of malformedFacetRequests)await rejected(engine.call({kind:'none'},{limit:0,extensions:{facets}}),['INVALID_OPTIONS','LIMIT_EXCEEDED']);
const badRequest={fields:[{field:'tags'}]};Object.defineProperty(badRequest.fields[0],'missing',{get(){getterCalls++;return true;}});await rejected(engine.call({kind:'all'},{extensions:{facets:badRequest}}),['INVALID_OPTIONS']);
assert.equal(getterCalls,0);await engine.engine.dispose();
const filters=createFilters({fields:['n','tags','flag']}),facets=createFacets({fields:['tags']});
const lowPayload=setup({addons:[{...filters,manifest:{...filters.manifest,limits:{...filters.manifest.limits,maxPayloadCodeUnits:8}}}]});await rejected(lowPayload.call(range({field:'n',gte:0})),['LIMIT_EXCEEDED']);await lowPayload.engine.dispose();
const lowOutput=setup({addons:[{...facets,manifest:{...facets.manifest,limits:{...facets.manifest.limits,maxOutputEntries:1}}}]});await rejected(lowOutput.call({kind:'none'},{extensions:{facets:{fields:[{field:'tags'}]}}}),['LIMIT_EXCEEDED']);await lowOutput.engine.dispose();
const output={repo,invalidCases,getterCalls,emptyAndIrrelevantBranchValidation:true,narrowedPayloadAndOutputCaps:true};writeFileSync(resolve(process.argv[1]).replace(/\.mjs$/,'.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
