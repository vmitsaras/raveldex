import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRaveldex } from '../../../dist/index.js';
import { createSourceProvider } from '../../../dist/addons/phrases/index.js';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { createSectionEvidence } from '../../../dist/addons/sections/index.js';
import { capturePageSections, captureSectionPages } from '../../../dist/addons/sections/validation.js';
const fixture=async name=>JSON.parse(await readFile(new URL(`../../fixtures/page-sections/${name}.json`,import.meta.url),'utf8'));
const corpus=await fixture('corpus'),projection=await fixture('projection'),failures=await fixture('failures');
const map=()=>({kind:'raveldex-page-sections',version:1,revision:1,pages:structuredClone(projection.pages)});
const code=expected=>error=>error.code===expected;
const section=(index=0)=>({anchor:`s${index}`,heading:'Section',headingLevel:2,field:'body',valueIndex:0,start:index*2,end:index*2+1});
const request=(sections,extra={})=>({extensions:{'section-evidence':{ids:['page:a'],expectedRevision:1,sections:sections.map(({field,valueIndex,start,end},sectionIndex)=>({field,valueIndex,start,end,sectionIndex})),...extra}}});
const owner=(strategy='source',factory={},configuration={})=>createRaveldex({schema:corpus.schema,addons:[createSourceProvider({fields:['body','title']}),...(strategy==='offsets'?[createPositionProvider({fields:['body','title'],offsets:['body','title']})]:[]),createSectionEvidence({fields:{body:strategy,title:strategy},...factory})],...configuration});

test('handwritten structural failures reject and captured canonical metadata is deeply owned',()=>{
 const allowed=new Set(corpus.documents.map(document=>document.id));
 for(const item of failures.failureCases.filter(item=>item.stage==='capture'&&!('maxSectionPreviews'in item.change)&&!('pageSections'in item.change)&&!('pageSectionsOmitted'in item.change))){
  const value=map(),change=item.change;
  if(change.appendPageId)value.pages.push(structuredClone(value.pages.find(page=>page.pageId===change.appendPageId)));
  else if(change.sectionIndex===undefined)value.pages[0].pageId=change.pageId;
  else{const target=value.pages.find(page=>page.pageId===change.pageId).sections[change.sectionIndex];for(const[key,item]of Object.entries(change))if(!['pageId','sectionIndex','delete'].includes(key))target[key]=item;if(change.delete)delete target[change.delete];}
  assert.throws(()=>capturePageSections(value,allowed),code('INVALID_OPTIONS'),item.id);
 }
 const input=map(),output=capturePageSections(input,allowed);
 assert.deepEqual(output.pages.find(page=>page.pageId==='page:d').sections.map(section=>section.anchor),['early-value','later-value','title']);
 input.pages[0].sections[0].heading='Mutated';assert.equal(output.pages[0].sections[0].heading,'Details');
 const frozen=value=>{if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const child of Object.values(value))frozen(child);}};frozen(output);
 for(const change of [value=>Object.defineProperty(value.pages[0].sections[0],'heading',{get(){throw Error('called');}}),value=>value.pages[0].sections.push(undefined),value=>delete value.pages[0].sections[0],value=>value.pages[0].sections[0][Symbol('extra')]=1,value=>value.pages[0].sections[0].heading='bad\ud800',value=>value.pages[0].sections[0]=new Date()]){
  const input=map();change(input);assert.throws(()=>capturePageSections(input),code('INVALID_OPTIONS'));
 }
});

test('inclusive collection, per-page and exact UTF-8 map ceilings reject only overflow',()=>{
 const pages=count=>Array.from({length:count},(_,index)=>({pageId:`p${index}`,sections:[]}));
 assert.equal(captureSectionPages(pages(10_000)).length,10_000);assert.throws(()=>captureSectionPages(pages(10_001)),code('LIMIT_EXCEEDED'));
 assert.equal(captureSectionPages([{pageId:'p',sections:Array.from({length:64},(_,i)=>section(i))}])[0].sections.length,64);
 assert.throws(()=>captureSectionPages([{pageId:'p',sections:Array.from({length:65},(_,i)=>section(i))}]),code('LIMIT_EXCEEDED'));
 const many=count=>Array.from({length:Math.ceil(count/64)},(_,page)=>({pageId:`p${page}`,sections:Array.from({length:Math.min(64,count-page*64)},(_,i)=>section(i))}));
 assert.equal(captureSectionPages(many(16_384)).reduce((n,page)=>n+page.sections.length,0),16_384);assert.throws(()=>captureSectionPages(many(16_385)),code('LIMIT_EXCEEDED'));
 const input={kind:'raveldex-page-sections',version:1,revision:1,pages:many(7000)};
 // All ASCII: exact serialized UTF-8 count equals JS length, independently of capture.
 for(const page of input.pages)for(const value of page.sections)value.heading='x';
 let remaining=4*1024*1024-JSON.stringify(input).length;let adjustable;
 for(const page of input.pages)for(const value of page.sections){const extra=Math.min(511,remaining);value.heading+='x'.repeat(extra);remaining-=extra;if(value.heading.length<512)adjustable=value;}
 assert.equal(remaining,0);assert.equal(Buffer.byteLength(JSON.stringify(input)),4*1024*1024);assert.ok(capturePageSections(input));
 adjustable.heading+='x';assert.equal(Buffer.byteLength(JSON.stringify(input)),4*1024*1024+1);assert.throws(()=>capturePageSections(input),code('LIMIT_EXCEEDED'));
});

test('native requests enforce exact descriptor/index/order/field and required single ID/revision bounds',async()=>{
 const engine=owner();try{
  await engine.addMany(corpus.records);const sections=captureSectionPages(projection.pages)[0].sections;
  const wrong=[r=>r.ids=[],r=>r.ids=['page:a','page:c'],r=>delete r.expectedRevision,r=>r.expectedRevision=0,r=>r.maxPreviews=0,r=>r.maxPreviews=4,r=>r.sections[0].sectionIndex=1,r=>r.sections[0].field='unknown',r=>r.sections.reverse(),r=>r.sections[0].extra=true,r=>r.sections[0].end=r.sections[0].start,r=>r.sections[1].start=19];
  for(const mutate of wrong){const options=request(sections),raw=options.extensions['section-evidence'];mutate(raw);await assert.rejects(engine.search('alpha',options),error=>['INVALID_OPTIONS','LIMIT_EXCEEDED','REVISION_MISMATCH'].includes(error.code));}
  const result=await engine.search('alpha',request(sections,{maxPreviews:1}));assert.equal(result.extensions['section-evidence'].documents[0].sectionPreviews.length,1);
 }finally{await engine.dispose();}
});

test('every declared source range validates even when query has no positive ranges',async()=>{
 for(const strategy of ['source','offsets']){
  const engine=owner(strategy);try{
   await engine.addMany(corpus.records);
   for(const change of [{valueIndex:2},{end:34},{start:1},{start:7}]){
    const sections=[{...projection.pages[0].sections[0],...change}];
    await assert.rejects(engine.search({kind:'all'},request(sections)),code('INVALID_OPTIONS'));
   }
   assert.equal((await engine.search('alpha')).total,4);
   assert.equal((await engine.search({kind:'all'},request([]))).extensions['section-evidence'].documents[0].sectionPreviews.length,0);
  }finally{await engine.dispose();}
 }
});

test('factory creation and import do not access host APIs; unsupported segmentation refuses actual projection',async()=>{
 const program=`const reads=[];for(const key of ['document','window','fetch','Worker','localStorage','indexedDB'])Object.defineProperty(globalThis,key,{configurable:true,get(){reads.push(key);throw Error(key);}});Object.defineProperty(Intl,'Segmenter',{configurable:true,get(){reads.push('Segmenter');throw Error('Segmenter');}});const {createSectionEvidence}=await import('./dist/addons/sections/index.js');createSectionEvidence({fields:{body:'source'}});if(reads.length)throw Error(JSON.stringify(reads));`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',program],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const engine=owner();await engine.addMany(corpus.records);
 const descriptor=Object.getOwnPropertyDescriptor(Intl,'Segmenter');try{
  Object.defineProperty(Intl,'Segmenter',{configurable:true,value:undefined});assert.doesNotThrow(()=>createSectionEvidence({fields:{body:'source'}}));
  await assert.rejects(engine.search('alpha',request(captureSectionPages(projection.pages)[0].sections)),code('UNSUPPORTED_ENVIRONMENT'));
  assert.equal((await engine.search('alpha')).total,4);
 }finally{Object.defineProperty(Intl,'Segmenter',descriptor);await engine.dispose();}
 for(const options of [{maxCodeUnits:0},{maxCodeUnits:241},{maxHighlights:33},{maxHighlights:0},{maxPreviews:3},{fields:{}}])assert.throws(()=>createSectionEvidence({fields:{body:'source'},...options}));
});

test('original source is required for offsets and selected lower work/output/range budgets refuse safely',async()=>{
 assert.throws(()=>createRaveldex({schema:corpus.schema,addons:[createPositionProvider({fields:['body'],offsets:['body']}),createSectionEvidence({fields:{body:'offsets'}})]}),code('MISSING_CAPABILITY'));
 assert.throws(()=>createRaveldex({schema:corpus.schema,addons:[createSourceProvider({fields:['body']}),createPositionProvider({fields:['body']}),createSectionEvidence({fields:{body:'offsets'}})]}),code('MISSING_CAPABILITY'));
 for(const factory of [{maxRanges:1},{maxFacts:1},{maxWorkUnits:1},{maxOutputEntries:1}]){
  const engine=owner('source',factory);try{await engine.addMany(corpus.records);await assert.rejects(engine.search('alpha',request(captureSectionPages(projection.pages)[0].sections)),error=>['LIMIT_EXCEEDED','WORK_LIMIT_EXCEEDED'].includes(error.code));assert.equal((await engine.search('alpha')).total,4);}finally{await engine.dispose();}
 }
});
