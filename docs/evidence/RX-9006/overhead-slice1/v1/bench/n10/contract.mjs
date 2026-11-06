// RX-9001 finite matrix contract. No collection occurs on import.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { FAMILIES, SIZES } from '../n9/workloads.mjs';
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
export const CONTRACT = freeze({
  version: 'rx9001-node-contract-v1',
  roles: ['preN9', 'acceptedN9', 'current'],
  deadlines: [{ id: 'default30s', options: {} }, { id: 'explicit60s', options: { deadlineMs: 60000 } }],
  configuration: { host: 'Node direct', addons: ['source:body', 'source-phrases:body'], batch: 256, queryLimit: 20, limits: 'Unchanged native defaults' },
  pilot: { families: ['adversarial'], sizes: [100], normalOwners: 2, diagnosticOwners: 1, samples: 2, warmups: 0, perChildMs: 90000, totalMs: 600000, acceptedPerformanceEvidence: false },
  full: { families: FAMILIES, sizes: SIZES, normalOwners: 3, diagnosticOwners: 1, samples: 2, tail: { family: 'adversarial', sizes: [100, 1000], samples: 40, warmups: 2 }, perChildMs: 600000, totalMs: 10800000, intendedPerformanceCollection: true },
  p95MinimumSameCell: 100,
  scope: 'Normal and intrusive diagnostic owners remain separate. Pilot validates orchestration, never net performance. Correlated calls are not independent devices; identical runtime variation is not an optimization.'
});
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const CONTRACT_SHA256 = hash(CONTRACT);
export function plan(profile) {
  assert.ok(['pilot', 'full'].includes(profile), 'unknown profile');
  const p = CONTRACT[profile], jobs = [];
  for (let owner = 0; owner <= p.normalOwners; owner++) {
    const mode = owner === p.normalOwners ? 'diagnostic' : 'normal';
    const families = owner % 2 ? [...p.families].reverse() : p.families;
    const sizes = owner % 2 ? [...p.sizes].reverse() : p.sizes;
    for (const family of families) for (const size of sizes) for (const deadline of owner % 2 ? [...CONTRACT.deadlines].reverse() : CONTRACT.deadlines) {
      const tail = profile === 'full' && family === p.tail.family && p.tail.sizes.includes(size);
      for (const role of owner % 2 ? [...CONTRACT.roles].reverse() : CONTRACT.roles) jobs.push({
        profile, family, size, deadline: deadline.id, deadlineOptions: deadline.options, role, owner, mode,
        samples: mode === 'diagnostic' ? 1 : tail ? p.tail.samples : p.samples,
        warmups: mode === 'normal' && tail ? p.tail.warmups : 0,
      });
    }
  }
  return jobs;
}
export function jobKey(job) { return [job.family, job.size, job.deadline, job.role, job.owner, job.mode].join('-'); }
