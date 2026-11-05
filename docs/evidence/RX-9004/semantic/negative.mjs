// Raw-data validation probes only: never invokes a search engine or collector.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inspectRow } from './run.mjs';
import { sourceExpectations } from './oracle.mjs';
const [rowPath,corePath,output]=process.argv.slice(2);assert.equal(process.argv.length,5,'usage: negative.mjs PILOT_ROW PILOT_CORE OUTPUT');
const rowBytes=await readFile(rowPath),coreBytes=await readFile(corePath),row=JSON.parse(rowBytes),core=JSON.parse(coreBytes);
assert.equal(row.family,'adversarial');assert.equal(row.size,100);
const reference=sourceExpectations(row.family,row.size),passed=await inspectRow(row,core,reference),probes=[];
const firstSuccess=r=>r.queries.find(q=>q.capture.complete&&q.capture.hits.length>1);
const firstField=r=>r.selected.find(q=>q.outcome==='Pass'&&q.result.extensions.inspector.trace.facts.some(f=>f.kind==='field')).result.extensions.inspector.trace.facts.find(f=>f.kind==='field');
for(const [id,mutate]of[
 ['wrong score',(r,c)=>{firstSuccess(r).capture.pages[0].hits[0].score+=.1;}],
 ['wrong ordered first page',(r,c)=>{firstSuccess(r).capture.pages[0].hits.reverse();}],
 ['wrong exact total',(r,c)=>{firstSuccess(r).capture.pages[0].total++;}],
 ['missing query',(r,c)=>{r.queries.pop();}],
 ['wrong revision',(r,c)=>{r.receipt.revision++;}],
 ['unexpected typed error',(r,c)=>{r.queries.find(q=>!q.capture.complete).capture.error.code='INTERNAL_ERROR';}],
 ['source-independent Inspector population',(r,c)=>{firstField(r).N++;}],
 ['source-independent Inspector frequency',(r,c)=>{firstField(r).tf++;}],
 ['core reverse frequency',(r,c)=>{const d=Object.values(c.documents)[0];d.fields.body.terms.n9common++;}],
 ['core posting frequency',(r,c)=>{const p=c.fields.body.terms.n9common.postings;p[Object.keys(p)[0]]++;}],
 ['original source preservation',(r,c)=>{Object.values(c.participants.source.records)[0].text.body[0]+=' forged';}],
 ['frozen workload identity',(r,c)=>{r.identity.corpusSha256='0'.repeat(64);}],
]) {
 const r=structuredClone(row),c=structuredClone(core);mutate(r,c);let error;
 try{await inspectRow(r,c,reference);}catch(caught){error=caught;}
 assert.ok(error,'poisoned fixture unexpectedly accepted: '+id);probes.push({id,outcome:'Rejected',message:error.message});
}
const sha=x=>createHash('sha256').update(x).digest('hex');
await writeFile(output,JSON.stringify({kind:'rx9004-semantic-negative-probes-v1',status:'Pass',method:'Read-only historical successful pilot fixture plus destructively modified in-memory copies; no engine execution, build or timing collector.',row:{path:rowPath,sha256:sha(rowBytes)},core:{path:corePath,sha256:sha(coreBytes)},positive:passed,probes},null,2)+'\n');
console.log(JSON.stringify({status:'Pass',negativeCases:probes.length}));
