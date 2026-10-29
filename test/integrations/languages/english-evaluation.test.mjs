import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {createRaveldex} from '../../../dist/index.js';
import {createEnglishAnalyzer,ENGLISH_ANALYZER} from '../../../dist/integrations/languages/english/index.js';
import {createSourceProvider,createSourcePhrases} from '../../../dist/addons/phrases/index.js';
import {loadFrozenFixture,publicQuery,calculateMetrics} from '../../../bench/relevance-lib.mjs';
import {scanPhraseSourceCorpus,sourcePhraseQueryResult} from '../../oracle/phrases.mjs';
import {englishSourceTokens,sourceEnglishStem,scanEnglishSourceCorpus,sourceEnglishResult} from '../../oracle/english.mjs';

const FIXTURE_SHA256='c4aacb5ac0f08ce37eb30eeb4b42999a7fead15abfb9d09177b8af2b7beaa77a';
async function frozen(){const bytes=await readFile(new URL('../../fixtures/relevance/english-v1.json',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),FIXTURE_SHA256,'Do not retune frozen English judgments');return JSON.parse(bytes);}
const page={limit:100};
function compare(actual,expected,label){
  assert.equal(actual.completeness,'complete',label);assert.equal(actual.total,expected.total,label);
  assert.deepEqual(actual.hits.map(hit=>hit.id),expected.hits.map(hit=>hit.id),label);
  for(let i=0;i<expected.hits.length;i++)assert.ok(Math.abs(actual.hits[i].score-expected.hits[i].score)<=Math.max(1e-12,Math.abs(expected.hits[i].score)*1e-12),label+': independent BM25 for '+actual.hits[i].id);
}
const english=schema=>createRaveldex({schema,analyzer:ENGLISH_ANALYZER,addons:[createEnglishAnalyzer()]});

test('independent English source model preserves original coordinates, dense positions and stated Porter1980 morphology',()=>{
  for(const [word,stem] of [['caresses','caress'],['ponies','poni'],['ties','ti'],['relational','relat'],['conditional','condit'],['agreed','agre'],['filing','file'],['happy','happi'],['sky','sky'],['news','new'],['cancell','cancel'],['cancellation','cancel'],['possibly','possibli'],['analogies','analogi'],['café','café'],['source2','source2']])assert.equal(sourceEnglishStem(word),stem,word);
  assert.deepEqual(englishSourceTokens('😀 running cafe\u0301 ﬁles',3),[
    {term:'run',start:3,end:10,valueIndex:3,position:0},
    {term:'café',start:11,end:16,valueIndex:3,position:1},
    {term:'file',start:17,end:21,valueIndex:3,position:2},
  ]);
});

test('frozen real English word-form intents improve recall while the predeclared overstemming intent remains an explicit limitation',async t=>{
  const fixture=await frozen(),{corpus}=await loadFrozenFixture();
  const source=scanEnglishSourceCorpus(corpus.records,corpus.schema),selected=english(corpus.schema),baseline=createRaveldex({schema:corpus.schema});
  let positives=0,negatives=0,recall=0,basicRecall=0,improved=0,negativeMatches=0;
  const observations=[];
  try{
    await selected.addMany(corpus.records);await baseline.addMany(corpus.records);
    for(const judgment of fixture.judgments){
      const actual=await selected.search(judgment.query,page),exact=await baseline.search(judgment.query,page),expected=sourceEnglishResult(source,judgment.query,page);
      compare(actual,expected,judgment.id);
      const ids=actual.hits.map(hit=>hit.id),known=new Set(judgment.acceptableIds);
      if(judgment.expectation==='known-relevant'){
        positives++;assert.deepEqual([...ids].sort(),[...known].sort(),judgment.id+': complete title-source labels');
        const r=ids.slice(0,10).filter(id=>known.has(id)).length/known.size,b=exact.hits.slice(0,10).filter(hit=>known.has(hit.id)).length/known.size;
        recall+=r;basicRecall+=b;if(r>b)improved++;
      }else{
        negatives++;negativeMatches+=actual.total;
        if(judgment.id==='near-prefix')assert.deepEqual(ids,['doc:docs/specs/MUTATIONS_AND_EXECUTION.md#state-transitions-and-cancellation'],'Frozen negative intent is a documented Porter collision, not an implicit prefix feature');
        else assert.equal(actual.total,0,judgment.id+': no other unjudged negative broadening');
      }
      observations.push({id:judgment.id,expectedIntent:judgment.expectation,basicIds:exact.hits.map(hit=>hit.id),englishIds:ids});
    }
  }finally{await selected.dispose();await baseline.dispose();}
  assert.equal(positives,fixture.acceptance.positiveQueries);assert.equal(negatives,fixture.acceptance.negativeQueries);
  assert.equal(recall/positives,fixture.acceptance.minimumMeanRecall10);assert.equal(improved,positives);
  assert.equal(negativeMatches,1,'Keep the independently predicted cancellation/cancell overstemming witness visible');
  t.diagnostic(JSON.stringify({fixtureSha256:FIXTURE_SHA256,corpusSha256:fixture.corpus.sha256,positives,negatives,englishRecall10:recall/positives,basicRecall10:basicRecall/positives,improvedIntents:improved,negativeMatches,negativeGoal:fixture.acceptance.maximumNegativeMatches,negativeGoalMet:false,knownFalsePositive:'cancell and cancellation both stem to cancel; the original intended-empty label stays frozen',observations,limitations:fixture.context.limitations}));
});

test('independent complete English source Boolean/BM25 outcomes are insertion-order/page stable and retain native arithmetic',async t=>{
  const fixture=await frozen(),{corpus}=await loadFrozenFixture(),source=scanEnglishSourceCorpus(corpus.records,corpus.schema);let comparisons=0;
  for(const records of [corpus.records,[...corpus.records].reverse()]){
    const engine=english(corpus.schema);
    try{await engine.addMany(records);for(const judgment of fixture.judgments)for(const options of [{limit:0},{limit:1},{limit:3},{offset:1,limit:2},page]){compare(await engine.search(judgment.query,options),sourceEnglishResult(source,judgment.query,options),judgment.id);comparisons++;}}
    finally{await engine.dispose();}
  }
  const engine=english({text:{title:{boost:2}}});
  try{
    await engine.addMany([{id:'a',text:{title:'indexed indexes'}},{id:'b',text:{title:'index'}},{id:'c',text:{title:'tree'}}]);
    const once=await engine.search('indexes',page),repeated=await engine.search('indexes indexing index',page);
    assert.deepEqual(repeated.hits,once.hits,'One canonical stem group, not one score for each spelling');assert.deepEqual(once.hits.map(hit=>hit.id),['a','b']);
    for(const [index,tf,length]of [[0,2,2],[1,1,1]]){
      const expected=2*Math.log(1+(3-2+0.5)/(2+0.5))*(tf*2.2)/(tf+1.2*(0.25+0.75*length/(4/3)));
      assert.ok(Math.abs(once.hits[index].score-expected)<1e-12,'Source-derived stemming frequencies retain native field arithmetic');
    }
  }finally{await engine.dispose();}
  assert.equal(comparisons,250);t.diagnostic(`${comparisons} complete source comparisons across two insertion orders and five pages, plus independent hand-derived coalesced-stem BM25.`);
});

test('installed but unselected English pack preserves all 76 original basic judgments and complete source scores',async t=>{
  const fixture=await frozen(),{corpus,judgments}=await loadFrozenFixture(),source=scanPhraseSourceCorpus(corpus.records,corpus.schema);
  const providers=()=>[createSourceProvider({fields:['title','body']}),createSourcePhrases({fields:['title','body']})];
  const baseline=createRaveldex({schema:corpus.schema,addons:providers()}),unselected=createRaveldex({schema:corpus.schema,addons:[createEnglishAnalyzer(),...providers()]});
  try{await baseline.addMany(corpus.records);await unselected.addMany(corpus.records);for(const judgment of judgments){const query=publicQuery(judgment.query),before=await baseline.search(query,page),after=await unselected.search(query,page);compare(before,sourcePhraseQueryResult(source,judgment.query,page),judgment.id);assert.deepEqual(after,before,judgment.id+': registration alone cannot select English');}}
  finally{await baseline.dispose();await unselected.dispose();}
  assert.equal(judgments.length,fixture.acceptance.originalBasicRegressionCount);t.diagnostic(`${judgments.length} unchanged original basic-v1 complete results against independent source membership/scoring, with the English registration unselected.`);
});

test('selected English analysis reports all original 76 relevance outcomes separately without relabeling the corpus',async t=>{
  const {corpus,judgments}=await loadFrozenFixture(),source=scanEnglishSourceCorpus(corpus.records,corpus.schema);
  const providers=()=>[createSourceProvider({fields:['title','body']}),createSourcePhrases({fields:['title','body']})];
  const engine=createRaveldex({schema:corpus.schema,analyzer:ENGLISH_ANALYZER,addons:[createEnglishAnalyzer(),...providers()]});
  const results=[];
  try{await engine.addMany(corpus.records);for(const judgment of judgments){const actual=await engine.search(publicQuery(judgment.query),page);compare(actual,sourceEnglishResult(source,judgment.query,page),judgment.id+' selected English');results.push({id:judgment.id,...actual});}}
  finally{await engine.dispose();}
  const metrics=calculateMetrics(judgments,results,100);t.diagnostic(JSON.stringify({scope:'Same 76 frozen judgments under explicit English, not an assertion of unchanged ranking or general relevance improvement',metrics}));
});
