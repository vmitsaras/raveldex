import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRaveldex } from '../../../dist/index.js';
import { createSourceProvider } from '../../../dist/addons/phrases/index.js';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { createSectionEvidence } from '../../../dist/addons/sections/index.js';
import { captureSectionPages } from '../../../dist/addons/sections/validation.js';

const fixture=async name=>JSON.parse(await readFile(new URL(`../../fixtures/page-sections/${name}.json`,import.meta.url),'utf8'));
const corpus=await fixture('corpus'), projection=await fixture('projection'), windows=await fixture('windows');
const plain=value=>JSON.parse(JSON.stringify(value));
const descriptor=sections=>sections.map(({field,valueIndex,start,end},sectionIndex)=>({sectionIndex,field,valueIndex,start,end}));
const schema=corpus.schema;
function engine(strategy, factory={}, config={}) {
 const fields={body:strategy,title:strategy};
 return createRaveldex({schema,addons:[createSourceProvider({fields:['body','title']}),...(strategy==='offsets'?[createPositionProvider({fields:['body','title'],offsets:['body','title']})]:[]),createSectionEvidence({fields,...factory})],...config});
}
const evidence=(id,sections,revision,extra={})=>({extensions:{'section-evidence':{ids:[id],expectedRevision:revision,sections:descriptor(sections),...extra}}});
const native=result=>{const{extensions,...rest}=plain(result);return rest;};
const snippetShape=value=>value===null?null:({start:value.start,end:value.end,text:value.text,highlights:value.highlights.map(mark=>[mark.start,mark.end]),omittedBefore:value.omittedBefore,omittedAfter:value.omittedAfter});

for(const strategy of ['source','offsets']){
 test(`literal page/range/section fixtures preserve every native page with ${strategy}`,async()=>{
  const owner=engine(strategy);try{
   await owner.addMany(corpus.records);
   for(const item of projection.cases){
    const query=corpus.queries.find(query=>query.id===item.queryId), maps=captureSectionPages(item.mapOverride?[item.mapOverride]:projection.pages);
    for(const expected of item.expected){
     const page=maps.find(page=>page.pageId===expected.pageId);if(!page?.sections.length)continue;
     for(const paging of corpus.expectedPages.pages){
      const options={offset:paging.offset,limit:paging.limit};
      const main=await owner.search(query.query,options), result=await owner.search(query.query,{...options,...evidence(page.pageId,page.sections,main.revision)});
      assert.deepEqual(native(result),native(main));assert.equal(main.total,4);assert.deepEqual(main.hits.map(hit=>hit.id),paging.ids);
      for(const hit of main.hits)assert.ok(Math.abs(hit.score-query.expectedScore)<1e-12,query.id);
      const data=result.extensions['section-evidence'], document=data.documents[0];
      assert.equal(data.complete,true);assert.equal(data.revision,main.revision);assert.equal(document.eligibility,'matched');
      assert.deepEqual(plain(document.ranges),query.expectedTokenIndices.map(index=>{const {text,...range}=corpus.allOriginalTokens[index];return range;}));
      assert.deepEqual(document.sectionPreviews.map(preview=>page.sections[preview.sectionIndex].anchor),expected.selectedAnchors,`${item.id}/${page.pageId}`);
      assert.deepEqual(plain(document.sectionOmissions),{omittedSections:expected.omittedMatchingAnchors.length,unmappedRanges:expected.outsideMapTokenIndices.length,boundaryRanges:expected.crossingTokenIndices.length});
      for(let index=0;index<expected.excerpts.length;index++){
       const actual=document.sectionPreviews[index], entry=expected.excerpts[index], slice=corpus.sourceSlices[entry.sourceSliceIndex];
       assert.deepEqual(snippetShape(actual.snippet),{start:slice.start,end:slice.end,text:slice.text,highlights:entry.highlights,omittedBefore:false,omittedAfter:false});
       assert.deepEqual(plain(actual.snippetOmissions),{unshownMatches:0,windowLimit:false,highlightLimit:false,matchTooLong:0,graphemeTooLong:0});
      }
     }
    }
   }
  }finally{await owner.dispose();}
 });
 test(`literal section windows and inclusive 240/32 caps with ${strategy}`,async()=>{
  for(const item of windows.cases){
   const owner=engine(strategy,{maxCodeUnits:item.maxCodeUnits,...(item.maxHighlights?{maxHighlights:item.maxHighlights}:{})});try{
    await owner.add(item.record);const main=await owner.search(item.query), sections=captureSectionPages([{pageId:item.record.id,sections:item.sections}])[0].sections;
    const result=await owner.search(item.query,evidence(item.record.id,sections,main.revision,{...(item.maxPreviews?{maxPreviews:item.maxPreviews}:{})}));
    assert.deepEqual(native(result),native(main));const document=result.extensions['section-evidence'].documents[0];
    assert.deepEqual(document.ranges.map(range=>[range.start,range.end]),item.positiveRanges,item.id);
    assert.deepEqual(document.sectionPreviews.map(preview=>sections[preview.sectionIndex].anchor),item.expected.selectedAnchors,item.id);
    if(item.expected.sectionOmissions)assert.deepEqual(plain(document.sectionOmissions),item.expected.sectionOmissions);
    if(item.expected.previews){for(let index=0;index<item.expected.previews.length;index++){
     const expected=item.expected.previews[index],actual=document.sectionPreviews[index];
     assert.deepEqual(snippetShape(actual.snippet),expected.snippet,item.id);
     if(expected.snippetOmissions)assert.deepEqual(plain(actual.snippetOmissions),expected.snippetOmissions,item.id);
    }}else{
     assert.deepEqual(snippetShape(document.sectionPreviews[0].snippet),item.expected.snippet,item.id);
     assert.deepEqual(plain(document.sectionPreviews[0].snippetOmissions),item.expected.snippetOmissions,item.id);
    }
   }finally{await owner.dispose();}
  }
 });
}

test('absent/excluded selections skip invalid source descriptors after global structural/provider validation',async()=>{
 const owner=engine('source');try{
  await owner.addMany(corpus.records);const revision=(await owner.search({kind:'none'})).revision;
  const sections=[{field:'body',valueIndex:63,start:1000,end:1001}];
  for(const [id,query,eligibility] of [['missing',{kind:'all'},'absent'],['page:a',{kind:'none'},'excluded']]){
   const result=await owner.search(query,evidence(id,sections,revision)),document=result.extensions['section-evidence'].documents[0];
   assert.deepEqual(plain(document),{id,eligibility,ranges:[],sectionPreviews:[],sectionOmissions:{omittedSections:0,unmappedRanges:0,boundaryRanges:0}});
  }
 }finally{await owner.dispose();}
});

test('selected positive paths exclude failed OR and negative contributions',async()=>{
 const owner=engine('source');try{
  await owner.addMany(corpus.records);const revision=(await owner.search({kind:'none'})).revision;
  const query={kind:'or',children:[{kind:'text',text:'alpha',fields:['title']},{kind:'and',children:[{kind:'text',text:'delta',fields:['body']},{kind:'text',text:'missing',fields:['body']}]}]};
  const page=captureSectionPages(projection.pages).find(page=>page.pageId==='page:d');
  const result=await owner.search(query,evidence(page.pageId,page.sections,revision)),document=result.extensions['section-evidence'].documents[0];
  assert.deepEqual(document.ranges.map(range=>[range.field,range.start,range.end]),[['title',0,5]]);assert.deepEqual(document.sectionPreviews.map(preview=>page.sections[preview.sectionIndex].anchor),['title']);
 }finally{await owner.dispose();}
});
