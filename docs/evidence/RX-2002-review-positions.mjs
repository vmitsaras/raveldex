import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const repo=resolve(process.argv[2]??process.cwd());const get=p=>import(pathToFileURL(join(repo,'dist',p)));
const {createPositionProvider}=await get('addons/positions/index.js');
const {createSourceProvider}=await get('addons/phrases/source.js');
const {captureConfiguration}=await get('core/contracts/schema.js');
const {initializeParticipants}=await get('core/capabilities/participants.js');
const {ExecutionOwner,emptyRoot}=await get('core/execution/engine.js');
const {directHost}=await get('core/execution/host.js');
const report={status:'running',environment:{node:process.version,platform:process.platform,arch:process.arch},expectationBasis:'Explicit original input token spans and manually selected normalized terms; logical container/entry counts calculated independently of provider state, no production analyzer.',configurations:[],snapshots:0,offsetAssertions:0,work:[],atomicLimits:[]};
const schema={text:{title:{},body:{},ignored:{}},metadata:{kind:{type:'string'}}};
const t=(term,position,start,end)=>({term,position,start,end});
const original={id:'a',text:{title:['red red'],body:['😀 ﬁle a\u0301 ½ X','','𐐀—blue red','Ⅳ−red','\u0301ＡＢ red'],ignored:'DO NOT RETAIN THIS FIELD'},metadata:{kind:'PRIVATE METADATA'}};
const expectedOriginal={title:[[t('red',0,0,3),t('red',1,4,7)]],body:[[t('file',0,3,6),t('á',1,7,9),t('1⁄2',2,10,11),t('x',3,12,13)],[],[t('𐐨',0,0,2),t('blue',1,3,7),t('red',2,8,11)],[t('iv',0,0,1),t('red',1,2,5)],[t('ab',0,1,3),t('red',1,4,7)]]};
const second={id:'b',text:{title:'blue red',body:['','red blue']},metadata:{kind:'PUBLIC'}};
const expectedSecond={title:[[t('blue',0,0,4),t('red',1,5,8)]],body:[[],[t('red',0,0,3),t('blue',1,4,8)]]};
const replacement={id:'a',text:{title:[],body:['a\u0301 ﬁle red','blue'],ignored:''},metadata:{kind:'REPLACED'}};
const expectedReplacement={title:[],body:[[t('á',0,0,2),t('file',1,3,6),t('red',2,7,10)],[t('blue',0,0,4)]]};
function values(directory){return Object.values(directory.buckets).flatMap(bucket=>Object.entries(bucket));}
function record(directory,id){return values(directory).find(([key])=>key===id)?.[1];}
function frozen(value){if(!value||typeof value!=='object')return;assert.ok(Object.isFrozen(value));for(const child of Object.values(value))frozen(child);}
function check(root,expected,selected,offsetFields){
 assert.equal(root.kind,'raveldex-positions-v1');assert.deepEqual([...root.fields].sort(),[...selected].sort());assert.deepEqual([...root.offsetFields].sort(),[...offsetFields].sort());assert.equal(root.records.size,expected.size);frozen(root);
 let entries=0,occurrences=0,offsets=0,termEntries=0,termCodeUnits=0;
 for(const[id,fields]of expected){const actual=record(root.records,id);assert.ok(actual,`missing ${id}`);assert.deepEqual(Object.keys(actual).sort(),['occurrenceCount','offsetCount','positions','retainedEntries','termCodeUnits','termEntries']);assert.deepEqual(Object.keys(actual.positions).sort(),selected.filter(f=>Object.hasOwn(fields,f)).sort());let perEntries=1,perOccurrences=0,perOffsets=0,perTerms=0,perCodeUnits=0;
  for(const f of selected){if(!Object.hasOwn(fields,f))continue;perEntries++;assert.equal(actual.positions[f].length,fields[f].length);for(let v=0;v<fields[f].length;v++){perEntries++;const xs=fields[f][v],val=actual.positions[f][v];assert.deepEqual(Object.keys(val).sort(),['terms','tokenCount']);assert.equal(val.tokenCount,xs.length);const byTerm={};for(const token of xs)(byTerm[token.term]??=[]).push(token);assert.deepEqual(Object.keys(val.terms).sort(),Object.keys(byTerm).sort());
   for(const[term,tokens]of Object.entries(byTerm)){perTerms++;perCodeUnits+=term.length;perEntries++;assert.equal(val.terms[term].length,tokens.length);for(let i=0;i<tokens.length;i++){const actualToken=val.terms[term][i],want=tokens[i];assert.deepEqual(actualToken,{position:want.position,positionLength:1,...(offsetFields.includes(f)?{start:want.start,end:want.end}:{})});perOccurrences++;perEntries++;if(offsetFields.includes(f)){perOffsets++;perEntries+=2;report.offsetAssertions++;}}}
  }}assert.equal(actual.retainedEntries,perEntries);assert.equal(actual.occurrenceCount,perOccurrences);assert.equal(actual.offsetCount,perOffsets);assert.equal(actual.termEntries,perTerms);assert.equal(actual.termCodeUnits,perCodeUnits);entries+=perEntries;occurrences+=perOccurrences;offsets+=perOffsets;termEntries+=perTerms;termCodeUnits+=perCodeUnits;
 }
 assert.equal(root.retainedEntries,entries);assert.equal(root.occurrenceCount,occurrences);assert.equal(root.offsetCount,offsets);assert.equal(root.termEntries,termEntries);assert.equal(root.termCodeUnits,termCodeUnits);report.snapshots++;
 return {retainedEntries:entries,occurrenceCount:occurrences,offsetCount:offsets,termEntries,termCodeUnits};
}
function setup(addons,limits={}){const conf=captureConfiguration({schema,addons,limits}),ins=initializeParticipants(conf),metrics={workUnits:0,steps:0,hostYields:0,maxTaskWorkUnits:0,maxStepWorkUnits:0,checks:0,phaseChecks:{}};return {engine:new ExecutionOwner(emptyRoot(conf,ins.states),directHost(),ins.participants,metrics),metrics};}
for(const mode of ['frequency','source','positions','bodyOffsets','allOffsets','titleOnly']){
 const offsetFields=mode==='bodyOffsets'?['body']:mode==='allOffsets'?['title','body']:[],selected=mode==='titleOnly'?['title']:['title','body'];
 const addons=mode==='frequency'?[]:mode==='source'?[createSourceProvider({fields:selected})]:[createPositionProvider({fields:selected,offsets:offsetFields})];
 const {engine,metrics}=setup(addons);const positionsMode=!['frequency','source'].includes(mode);let expected=new Map();
 try{
  assert.equal(engine.root.revision,0);if(positionsMode)check(engine.root.participants.positions,expected,selected,offsetFields);else assert.deepEqual(Object.keys(engine.root.participants),mode==='source'?['source']:[]);
  await engine.addMany([original,second]);expected=new Map([['a',expectedOriginal],['b',expectedSecond]]);const initial=engine.root;let counts;
  if(positionsMode)counts=check(initial.participants.positions,expected,selected,offsetFields);
  if(mode==='source'){const sr=initial.participants.source;assert.equal(sr.offsetCount,undefined);assert.equal(sr.occurrenceCount,undefined);for(const[,r]of values(sr.records)){assert.deepEqual(Object.keys(r).sort(),['retainedEntries','text','textCodeUnits']);assert.deepEqual(Object.keys(r.text).sort(),[...selected].sort());assert.equal(r.positions,undefined);assert.equal(r.metadata,undefined);}}
  const unchanged=positionsMode?record(initial.participants.positions.records,'b'):undefined;
  await engine.replace(replacement);expected.set('a',expectedReplacement);assert.equal(engine.root.revision,2);if(positionsMode){check(engine.root.participants.positions,expected,selected,offsetFields);assert.equal(record(engine.root.participants.positions.records,'b'),unchanged);check(initial.participants.positions,new Map([['a',expectedOriginal],['b',expectedSecond]]),selected,offsetFields);}
  const beforeNoop=engine.root;const noop=await engine.remove('absent');assert.equal(noop.changed,false);assert.equal(engine.root,beforeNoop);
  await engine.remove('a');expected.delete('a');assert.equal(engine.root.revision,3);if(positionsMode)check(engine.root.participants.positions,expected,selected,offsetFields);
  await engine.clear();expected.clear();assert.equal(engine.root.revision,4);if(positionsMode)check(engine.root.participants.positions,expected,selected,offsetFields);else if(mode==='source'){assert.equal(engine.root.participants.source.records.size,0);assert.equal(engine.root.participants.source.textCodeUnits,0);}
  const beforeEmpty=engine.root;assert.equal((await engine.clear()).changed,false);assert.equal(engine.root,beforeEmpty);report.configurations.push({mode,...counts,logicalCountsOnly:true});
 }finally{await engine.dispose();assert.equal(engine.root,undefined);}report.work.push({mode,...metrics});
}
// True capacity/work failures must preserve every root; this invokes ordinary
// mutations through the real owner and the production first-party participant.
for(const[reason,options]of[['retention',{maxRetainedEntries:6}],['participantWork',{maxWorkUnits:1}]]){
 const {engine}=setup([createPositionProvider({fields:['title'],...options})]);const before=engine.root;
 try{await assert.rejects(engine.add({id:'a',text:{title:'red blue'}}),{code:reason==='retention'?'LIMIT_EXCEEDED':'WORK_LIMIT_EXCEEDED'});assert.equal(engine.root,before);assert.equal(engine.root.revision,0);assert.equal(engine.root.participants.positions.records.size,0);report.atomicLimits.push({reason,status:'Pass'});}finally{await engine.dispose();}
}
const {engine}=setup([createPositionProvider({fields:['title'],offsets:['title']})]);try{await engine.add({id:'a',text:{title:'red'}});const before=engine.root;await assert.rejects(engine.replace({id:'a',text:{title:'bad\ud800'}}),{code:'INVALID_RECORD'});assert.equal(engine.root,before);assert.equal(record(engine.root.participants.positions.records,'a').positions.title[0].terms.red[0].start,0);report.atomicLimits.push({reason:'invalid UTF16 replacement',status:'Pass'});}finally{await engine.dispose();}
report.status='Pass';await writeFile(resolve(process.argv[1]).replace(/\.mjs$/,'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
