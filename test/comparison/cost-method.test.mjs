import test from 'node:test';
import assert from 'node:assert/strict';
import { METHOD, recordsFor, QUERY_ROWS, updatedRecord, checkPage, summary, summarizeRows } from '../../bench/cost-common.mjs';

test('cost summary retains rejections and unsupported operations without treating them as successful zero-time work', () => {
  assert.deepEqual(summary([{ outcome: 'Pass', elapsedMs: 13 }, { outcome: 'Rejected', elapsedMs: 2 }, { outcome: 'Pass', elapsedMs: 3 },
    { outcome: 'Pass', elapsedMs: 7 }, { outcome: 'Not Applicable' }, { outcome: 'Not run' }]),
  { attempts: 6, successes: 3, rejections: 1, notApplicable: 1, notRun: 1, medianMs: 7, observedMaximumMs: 13,
    tail: 'Observed sample maximum; no population percentile or device-latency guarantee.' });
  assert.equal(summary([{ outcome: 'Pass', elapsedMs: 4 }, { outcome: 'Pass', elapsedMs: 5 }]).medianMs, 5);
  assert.equal(summary([{ outcome: 'Rejected', elapsedMs: 4 }]).medianMs, null);
  assert.throws(() => summary([{ outcome: 'Pass', elapsedMs: NaN }]));
  assert.throws(() => summary([{ outcome: 'Pass', elapsedMs: -1 }]));
});
test('cost groups preserve configuration, size, operation and cold/warm semantics', () => {
  const rows = summarizeRows([{ configuration: 'core', size: 100, samples: [{ operation: 'q', phase: 'cold', outcome: 'Pass', elapsedMs: 2 }, { operation: 'q', phase: 'warm', outcome: 'Pass', elapsedMs: 1 }] },
    { configuration: 'core', size: 100, samples: [{ operation: 'q', phase: 'warm', outcome: 'Pass', elapsedMs: 3 }] },
    { configuration: 'source', size: 100, samples: [{ operation: 'q', phase: 'warm', outcome: 'Pass', elapsedMs: 8 }] },
    { configuration: 'core', size: 1000, samples: [{ operation: 'q', phase: 'warm', outcome: 'Pass', elapsedMs: 9 }] }]);
  assert.equal(rows.length, 4); assert.equal(rows[0].attempts, 1); assert.equal(rows[1].attempts, 2); assert.equal(rows[1].medianMs, 2);
  assert.equal(rows[2].configuration, 'source'); assert.equal(rows[3].size, 1000);
});
test('deterministic ASCII cost corpus declares independent full totals and update changes', () => {
  assert.deepEqual(recordsFor(100), recordsFor(100)); assert.throws(() => recordsFor(10001));
  for (const size of METHOD.sizes) {
    const records = recordsFor(size);
    assert.equal(new Set(records.map(record => record.id)).size, size);
    assert.equal(records.filter(QUERY_ROWS[0].match).length, size);
    assert.equal(records.filter(QUERY_ROWS[1].match).length, Math.floor((size - 1 - 7) / 37) + 1);
    assert.equal(records.filter(QUERY_ROWS[2].match).length, Math.ceil(size / 3));
    const changed = [updatedRecord, ...records.slice(1)];
    assert.equal(changed.filter(QUERY_ROWS[1].match).length, records.filter(QUERY_ROWS[1].match).length + 1);
    assert.equal(changed.filter(QUERY_ROWS[2].match).length, records.filter(QUERY_ROWS[2].match).length - 1);
  }
});
test('measured page checks exact complete total, requested size and all returned IDs rather than a convenient first hit', () => {
  const records = recordsFor(100), query = QUERY_ROWS[0], result = { completeness: 'complete', total: 100, revision: 1,
    hits: records.slice(0, 20).map(record => ({ id: record.id, score: 1 })) };
  assert.equal(checkPage(result, records, query).returned, 20);
  assert.throws(() => checkPage({ ...result, total: 99 }, records, query));
  assert.throws(() => checkPage({ ...result, completeness: 'partial' }, records, query));
  assert.throws(() => checkPage({ ...result, hits: result.hits.slice(0, 1) }, records, query));
  assert.throws(() => checkPage({ ...result, hits: result.hits.map(() => result.hits[0]) }, records, query));
  assert.throws(() => checkPage({ ...result, hits: [...result.hits.slice(0, 19), { id: 'absent', score: 1 }] }, records, query));
});
