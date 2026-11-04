import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export function compareMembership(result, expectedIds) {
  assert.ok(Array.isArray(result.ids));
  assert.ok(result.ids.every(id => typeof id === 'string'));
  assert.equal(new Set(result.ids).size, result.ids.length, 'duplicate foreign IDs');
  assert.equal(result.total, result.ids.length, 'complete count required');
  const equal = JSON.stringify([...result.ids].sort()) === JSON.stringify([...expectedIds].sort());
  return { status: equal ? 'Equivalent membership' : 'Not comparable', total: result.total, expectedTotal: expectedIds.length,
    expectedIdsSha256: hash([...expectedIds].sort()), actualIdsSha256: hash([...result.ids].sort()),
    ...(equal ? {} : { reason: 'Observed matching differs from independent frozen membership; no semantic speedup claim' }),
    ranking: 'Different engine models and tie ordering; no score/order equivalence claimed', output: 'Complete foreign ranked IDs and exact count; native timing requests exact total/top20. Output work differs.' };
}
export function summarizeAlternatives(rows) {
  const groups = new Map();
  for (const row of rows) for (const sample of row.samples) {
    const key = JSON.stringify([row.engine,row.family,row.size,sample.operation,sample.phase,sample.outcome]);
    if (!groups.has(key)) groups.set(key, { engine:row.engine,family:row.family,size:row.size,operation:sample.operation,phase:sample.phase,outcome:sample.outcome,values:[] });
    groups.get(key).values.push(sample);
  }
  const q = (values,p) => values.slice().sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
  return [...groups.values()].map(({values,...group})=>({...group,count:values.length,wallP50Ms:q(values.map(x=>x.wallMs),.5),wallP95Ms:values.length>=100?q(values.map(x=>x.wallMs),.95):null,
    p95Status:values.length>=100?'Estimated from actual observations':'Not estimated',cpuUserP50Ms:q(values.map(x=>x.cpuUserMs),.5),cpuSystemP50Ms:q(values.map(x=>x.cpuSystemMs),.5)}));
}
