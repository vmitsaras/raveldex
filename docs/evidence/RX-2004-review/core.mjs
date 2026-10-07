import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { records,schema,queries,selectedIds,expected,compareFacts,compareHits,numericalAssertions } from './oracle.mjs';
const rootpath=process.argv[2]??process.cwd(), url=path=>new URL(path,`file://${rootpath}/`).href;
const [{createRaveldex},{createInspector,exportDiagnostics},{createFilters},{FactCollector}]=await Promise.all(['dist/index.js','dist/addons/inspector/index.js','dist/addons/filters/index.js','dist/core/trace/facts.js'].map(p=>import(url(p))));
const engine=createRaveldex({schema,addons:[createInspector(),createFilters({fields:['cost','tag','flag']})]});
await engine.addMany(records);
let comparisons=0,documentComparisons=0,factCount=0;
function frozen(value) {if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const item of Object.values(value))frozen(item);}}
const oldRecord=FactCollector.prototype.record,oldFinish=FactCollector.prototype.finish;
let calls=0,finishes=0;
FactCollector.prototype.record=function(...args){calls++;return oldRecord.apply(this,args);};
FactCollector.prototype.finish=function(...args){finishes++;return oldFinish.apply(this,args);};
for(const query of queries) {const r=await engine.search(query,{limit:3});assert.equal(Object.hasOwn(r,'extensions'),false);assert.equal(Object.hasOwn(r,'trace'),false);}
assert.equal(calls,0);assert.equal(finishes,0);
const ordinaryFactCalls=calls,ordinaryCollectorFinishes=finishes;
let sample;
for(const query of queries) for(const [offset,limit] of [[0,0],[0,3],[5,7],[0,41]]) {
 const wanted=expected(query,selectedIds),actual=await engine.search(query,{offset,limit,extensions:{inspector:{ids:selectedIds}}});
 assert.equal(actual.revision,1);assert.equal(actual.model,'raveldex-bm25-v1');assert.equal(actual.completeness,'complete');
 assert.equal(Object.hasOwn(actual,'trace'),false);const data=actual.extensions.inspector;
 assert.equal(data.kind,'raveldex-inspector-v1');assert.equal(data.revision,1);assert.equal(data.trace.revision,1);
 assert.equal(data.trace.model,'raveldex-bm25-v1');assert.equal(data.trace.tieBreaker,'utf16-id-ascending');
 compareHits(actual,wanted,offset,limit);compareFacts(data.trace.facts,wanted.facts);factCount+=data.trace.facts.length;
 assert.deepEqual(data.documents.map(d=>d.id),selectedIds);
 for(const d of data.documents) {
  const f=wanted.facts.find(f=>f.kind==='document'&&f.id===d.id),hit=actual.hits.findIndex(h=>h.id===d.id);
  assert.equal(d.exists,f.exists);assert.equal(d.eligibility,!f.exists?'absent':f.matched?'matched':'excluded');
  assert.equal(d.score,f.exists?f.score:null);assert.deepEqual(d.groups,f.groups);
  assert.equal(d.page.placement,!f.exists?'absent':!f.matched?'excluded':hit<0?'outside-page':'returned');assert.equal(d.page.index,hit<0?null:hit);
  assert.equal(d.absoluteRank.status,'unavailable');assert.equal(d.absoluteRank.reason,'not-collected');assert.equal(d.source.status,'not-requested');documentComparisons++;
 }
 assert.equal(data.resources.outcome,'complete');assert.equal(data.resources.scope,'before-evidence-projection');assert.equal(data.resources.unit,'work-v1');
 assert.ok(data.resources.searchWorkUnits>0&&data.resources.searchWorkUnits<=data.resources.maxSearchWorkUnits);assert.equal(data.resources.counts.documents,41);
 assert.equal(data.resources.heapBytes.status,'unavailable');assert.equal(data.query.fullAlternatives.status,'unavailable');
 assert.equal(data.result.total,wanted.total);assert.equal(data.result.returned,actual.hits.length);frozen(data);
 const exported=exportDiagnostics(data);const parsed=JSON.parse(exported.json);assert.equal(parsed.diagnostic.complete,true);assert.deepEqual(parsed.diagnostic.omitted,[]);
 for(const key of ['query','trace','documents','sources'])assert.equal(Object.hasOwn(parsed,key),false);assert.equal(exported.complete,true);
 if(!sample)sample={input:query,data,diagnostic:parsed};comparisons++;
}
assert.ok(calls>0);assert.equal(finishes,comparisons);
FactCollector.prototype.record=oldRecord;FactCollector.prototype.finish=oldFinish;
await engine.dispose();
const raw={status:'Pass',environment:{node:process.version,platform:process.platform,arch:process.arch},oracle:{tokenization:'ASCII literal space; no production tokenizer/compiler/retrieval/scorer imports',records:records.length,queries:queries.length,pages:4,comparisons,documentComparisons,factCount,numericalAssertions,ordinaryQueries:queries.length,ordinaryFactCalls,ordinaryCollectorFinishes},sample,sourceHashes:Object.fromEntries(['src/core/query/search.ts','src/core/query/evaluate.ts','src/core/ranking/bm25.ts','src/addons/inspector/inspector.ts','src/addons/inspector/diagnostics.ts'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(`${rootpath}/${p}`)).digest('hex')]))};
fs.writeFileSync(new URL('./core.json',import.meta.url),JSON.stringify(raw,null,2)+'\n');console.log(JSON.stringify(raw.oracle));
