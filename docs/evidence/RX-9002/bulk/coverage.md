# RX-9002 — Bulk restoration across worker and storage boundaries

**Scoped result: Pass. No reproducible new contract violation was observed.** Four new bounded diagnostic browser regressions pass. No production source, old test, limit, provider registration or frozen RX-9001 artifact was changed.

## Existing coverage versus the actual gap

| Existing reality | Evidence inspected | Delta selected for this audit |
| --- | --- | --- |
| Bulk source restoration already checks late invalid/duplicate records, prospective dictionary limits, exact versus spread/wrapped identity, cumulative final sealing, throwing generic cleanup and all precommit stop phases. | [bulk-source tests](../../../../test/adapters/snapshots/bulk-source.test.mjs), tests beginning at lines 142, 160, 186, 200, 217, 243, 266 and 286. | Do not duplicate these unit scenarios or invent a new defect from a configured refusal. Join actual optimized eligibility with real worker/storage outcomes instead. |
| Existing IndexedDB fixture already constructs exact first-party source and body-position registrations with body offsets. | [configuration](../../../../test/adapters/indexeddb/configuration.mjs), lines 11–18. | The old browser observations did not explicitly witness which branch entered bulk add/final sealing; names or manifest equality alone do not establish eligibility. |
| Existing real-worker lost-restore-result and committed-late-abort scenarios verify Unknown/receipt and late success. | [fixture](../../../../test/adapters/indexeddb/fixture-entry.mjs), `workerLostRestore` and `workerCommittedAbort` beginning at lines 364 and 375; [registered browser cases](../../../../test/adapters/indexeddb/packed-browser.test.mjs), lines 145–146. | The lost-result receiver starts empty. Add a nonempty prior source/position state, distinguish withheld-before-host from actual result loss after publication, and bind it to observed bulk dispatch. |
| Simultaneous/stale/erased-token CAS and durable completion loss already have genuine IndexedDB coverage. | Same fixture, `conflicts` at line 146 and `lostDurableCompletion` at line 199. | Join an actual source/position bulk load with a later stale durable-generation save, verifying independent memory and durable winner preservation. A failed save is not a failed restore. |

## Relevant source contract

- [Private eligibility](../../../../src/core/capabilities/bulk-participant.ts) uses a WeakMap keyed by actual first-party registrations; copied registrations receive no factory. Ordinary captured callbacks still execute.
- [Bulk reconstruction](../../../../src/adapters/snapshots/bulk.ts), lines 16–23, 47–61 and 72–86, selects the session, invokes actual `add` versus generic `prepare`, and performs metered `finish`. No mutation is published at those observer points.
- [Snapshot restoration](../../../../src/adapters/snapshots/snapshots.ts), `restoreCursor` beginning at line 120, prepares an unpublished root and then performs the guarded single publication. Existing unit tests retain internal pointer identity; this browser probe uses exact public revision/result/source/offset observations.
- [Worker host](../../../../src/adapters/worker/host.ts), lines 106–137, retains snapshot-domain receipts, records committed success before sending the result, and does not turn absent/expired receipts into rejected mutations.
- [Persistence](../../../../src/adapters/indexeddb/persistence.ts), lines 233–270, compares durable generations before writes and preserves Unknown restore delivery with its selected generation/operation ID.

## New bounded diagnostic test

[New test source](../../../../test/adapters/indexeddb/n10-bulk-recovery.test.mjs) prepares a genuine newly packed/installed consumer from the current compiler output. The original 380-member map is byte-for-byte equal to the retained RX-9001 closing archive. Only the isolated installed `dist/adapters/snapshots/bulk.js` receives three observation statements. They report the actual `bulkParticipant` result and actual add/finish dispatch; they do not wrap registration identities, change budgets/yields or publish state. The repository source, dist and original archive remain untouched.

The observer's main-thread events are captured directly. Actual worker events cross real `postMessage` into a wrapper and are filtered from the protocol client as diagnostic messages. Their filtered count is kept distinct from the deliberately lost native restore result. This is an intrusive correctness probe, not normal runtime or performance evidence. Existing ordinary packed-browser tests remain its separate uninstrumented coverage.

1. **Eligibility and fallback control.** Exact source/positions registrations each execute five actual bulk adds and one finish. The copied-registration control has zero eligible bulk sessions and uses generic callbacks. Both restore over one prior record to revision 2 and preserve the complete source/position/offset semantics. Existing literal queries, source ranges and hand-derived scores pass for each.
2. **Withheld before host.** One restore is dispatched from the client's perspective but withheld by the transport wrapper. The API correctly reports `OUTCOME_UNKNOWN`; reconcile returns `expired`. No bulk event occurs, and exact old public query/revision/offset results and encoded source remain. Expired does not mean rollback. The test disposes that owner and explicitly creates a new real worker, which loads the known durable generation through the actual bulk path. There is no blind resend to the ambiguous owner.
3. **Actual post-commit result loss.** One actual native restore result is received by the wrapper and deliberately omitted from client delivery. The client reports Unknown; snapshot reconciliation proves `committed`, revision 2. The actual bulk add/finish trace, full source and position/offset semantics, complete result checks and a later replacement pass. The original receiver issues exactly one restore; reconciliation and later writes do not replay it.
4. **Durable generation conflict after bulk load.** A nonempty receiver bulk-loads the first generation. A different writer publishes a new durable generation. The receiver's stale save reports `GENERATION_CONFLICT`, preserves every durable row/encoded winner, and leaves its own exact source/revision/result/sidecar observations unchanged. A fresh receiver selects the winning generation and verifies all six records, exact source and three newly hand-derived BM25 scores.

The five uses of the existing complete comparison helper perform **435 scoped fixture comparisons**, plus the three fresh-winner hand-score assertions. This is a five-record authored cohort, not a broad corpus, capacity or general ranking-quality claim.

## Actual commands and retained observations

```sh
node --check test/adapters/indexeddb/n10-bulk-recovery.test.mjs
RAVELDEX_INDEXEDDB_BROWSER=chromium \
RAVELDEX_RX9002_BULK_REPORT=/tmp/raveldex-rx9002-bulk-retained.json \
node --test --test-concurrency=1 test/adapters/indexeddb/n10-bulk-recovery.test.mjs
```

Browser/loopback execution used the required permitted local execution. **4/4 passed; zero failures, cancellations or skips.** Actual environment: Node 24.21.0, macOS 27.0.1/Darwin 27.0.0 arm64, Playwright 1.61.1/esbuild 0.28.2, headless Chromium 149.0.7827.55. See [complete output](focused-output.txt), [raw browser report](browser-report.json) and [summary/member comparison](result.json).

All four scenario cleanups pass; final installed-package, original source-fixture and served HTML/bundle/worker hashes remain unchanged. The [executed fixture archive](executed-fixture.tar.gz) retains the actual HTML, fixture/config/records, bundles, worker source, installed observer package and original npm tarball, excluding writable npm cache. Bundle metafiles and all input hashes are retained in the raw browser report. Original and observer member maps are retained in the raw report; the only instrumentation delta is `bulk.js`. The original package's full map matches RX-9001, not merely that one file's hash.

Two earlier focused runs also passed 4/4. Their [first report](attempt1-report.json)/[output](attempt1-output.txt) and [counter/cleanup report](guarded-report.json)/[output](guarded-output.txt) remain separate. They were superseded by the final explicit lost-result counter, cleanup/source/served-artifact and package guards. Earlier full fixture directories were not retained because their locations were not recorded; the final accepted diagnostic artifacts are retained above. No failed engine observation was silently relabeled.

## Findings and boundaries

The selected combinations match their contracts. There is no confirmed runtime repair to hand to RX-9003 from this subtask. The distinction between public Unknown and the observer's knowledge of a withheld request remains deliberate. The tests do not inspect worker heap/root pointer identity, measure retained/peak memory, latency, 10k capacity, physical storage durability, real quota exhaustion, native Safari/Firefox or user input/assistive technology. Generic throwing cleanup and precommit cancellation remain existing unit coverage, not fabricated new browser findings.
