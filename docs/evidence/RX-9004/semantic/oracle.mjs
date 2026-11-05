// RX-9004 full-source acceptance only. No production/runtime imports.
import assert from 'node:assert/strict';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../../../../test/oracle/phrases.mjs';
import { sourceQueryResult } from '../../../../test/oracle/query.mjs';
import { schema, verifyFrozen, workloadFor } from '../../../../bench/n9/workloads.mjs';

const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const close = (actual, expected) => assert.ok(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= Math.max(1e-12, Math.abs(expected) * 1e-12), `source BM25 ${actual} != ${expected}`);
export function sourceExpectations(family,size) {
  const workload=verifyFrozen(workloadFor(family,size));
  const corpus=scanPhraseSourceCorpus(workload.records,schema), queries=new Map();
  for(const query of workload.queries) {
    if(query.expectedError) { queries.set(query.id,{query,expected:null}); continue; }
    const raw=query.query;
    const expected=raw.kind==='extension' && raw.capability==='phrases'
      ? sourcePhraseQueryResult(corpus,{kind:'phrase',...raw.payload},{limit:size})
      : sourceQueryResult(corpus,raw,{limit:size});
    assert.deepEqual(expected.hits.map(h=>h.id).sort(compare),[...query.expectedIds].sort(compare),'independent source membership vs frozen judgments');
    queries.set(query.id,{query,expected});
  }
  return {workload,corpus,queries};
}
export function verifyPublicResult(actual,reference,{offset=0,limit=20,revision}={}) {
  assert.ok(reference.expected,'declared expansion refusal cannot produce success');
  const expected=reference.expected;
  assert.equal(actual.total,expected.total);assert.equal(actual.completeness,'complete');assert.equal(actual.model,'raveldex-bm25-v1');assert.equal(actual.revision,revision);
  const hits=expected.hits.slice(offset,offset+limit);assert.equal(actual.hits.length,hits.length);
  assert.deepEqual(actual.hits.map(h=>h.id),hits.map(h=>h.id),'independent complete score/order reference');
  for(let i=0;i<hits.length;i++)close(actual.hits[i].score,hits[i].score);
  return {pages:1,scores:hits.length};
}
export function verifyCoreSource(core,reference) {
  const {workload,corpus}=reference;
  assert.equal(core.revision,Math.ceil(workload.size/256));
  assert.deepEqual(Object.keys(core.documents).sort(compare),workload.records.map(r=>r.id).sort(compare));
  assert.deepEqual(Object.keys(core.fields),['body']);assert.deepEqual(Object.keys(core.participants),['source']);
  const stats=corpus.statistics.get('body'), field=core.fields.body;
  assert.equal(field.documents,stats.population);assert.equal(field.length,stats.totalLength);
  assert.deepEqual(Object.keys(field.terms).sort(compare),[...stats.documentFrequencies.keys()].sort(compare));
  const byId=new Map(corpus.documents.map(d=>[d.id,d]));let postings=0,sourceValues=0,codeUnits=0;
  for(const record of workload.records) {
    const document=core.documents[record.id], independent=byId.get(record.id).fields.get('body');
    const values=Array.isArray(record.text.body)?record.text.body:[record.text.body], units=values.reduce((s,x)=>s+x.length,0);sourceValues+=values.length;codeUnits+=units;
    assert.equal(document.id,record.id);assert.deepEqual(document.metadata,record.metadata);assert.equal(document.textCodeUnits,units);
    assert.deepEqual(document.fields.body,{length:independent.length,terms:Object.fromEntries([...independent.frequencies].sort(([a],[b])=>compare(a,b)))});
    const source=core.participants.source.records[record.id];assert.deepEqual(source.text,{body:values});assert.equal(source.textCodeUnits,units);
    for(const [term,tf] of independent.frequencies) {assert.equal(field.terms[term].postings[record.id],tf);postings++;}
  }
  for(const [term,df] of stats.documentFrequencies){const entry=field.terms[term];assert.equal(entry.df,df);assert.equal(Object.keys(entry.postings).length,df);assert.equal(entry.frequency,Object.values(entry.postings).reduce((a,b)=>a+b,0));}
  assert.equal(core.counts.documents,workload.size);assert.equal(core.counts.tokens,stats.totalLength);assert.equal(core.counts.dictionaryEntries,stats.documentFrequencies.size);assert.equal(core.counts.postingEntries,postings);assert.equal(core.counts.textCodeUnits,codeUnits);
  return {documents:workload.size,terms:stats.documentFrequencies.size,postingRelations:postings,sourceValues,textCodeUnits:codeUnits};
}
export function verifySelectedSource(result,reference,queryId) {
  const {corpus}=reference;const inspector=result.extensions.inspector;let fieldFacts=0;
  for(const fact of inspector.trace.facts) if(fact.kind==='field') {
    const doc=corpus.documents.find(d=>d.id===fact.id);assert.ok(doc,'Inspector fact source document');
    const reverse=doc.fields.get(fact.field),stat=corpus.statistics.get(fact.field);assert.ok(reverse&&stat);
    // Fact's term is chosen by the actual trace; validate every statistic directly
    // from authored strings, never from its claimed N/TF/DF values.
    assert.equal(fact.N,stat.population);assert.equal(fact.totalLength,stat.totalLength);assert.equal(fact.length,reverse.length);assert.equal(fact.boost,stat.boost);
    assert.equal(fact.tf,reverse.frequencies.get(fact.term));assert.equal(fact.df,stat.documentFrequencies.get(fact.term));fieldFacts++;
  }
  const ref=reference.queries.get(queryId);verifyPublicResult(result,ref,{limit:20,revision:Math.ceil(reference.workload.size/256)});
  return {fieldFacts};
}
