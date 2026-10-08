# RX-3001 independent review

Date: 2026-10-08. Review is in progress. Reentrant signal admission and duplicate client/host ownership remain confirmed blocking findings awaiting repair and replay; final packaged snapshot/check results must then be matched before the verdict is finalized.

The reviewer read the selected task, core/adapter/execution/ranking contracts, actual worker client/host/protocol, first-party semantic identities, the narrow internal execution-control change, public declarations, package exports/compiler projects, real documentation setup, focused browser fixtures and raw artifacts. Runtime, tests, configuration and product documentation were read-only to this reviewer. Independent writes are confined to this review and its executable/raw probe.

## Findings repaired

| Finding | Observed impact | Final independent evidence |
| --- | --- | --- |
| P1: replay could falsify a mutation outcome | Delivering the same live add envelope twice returned `INVALID_TRANSPORT` to the original caller while the receipt and authoritative state established commit at revision 1. | The host ignores an old/replayed request ID. The original operation returns its single committed result; receipt and complete state agree. |
| P1: live signal registration could reverse admission order | A valid structural signal submitted a nested add while its listener was registered. The nested request reached the worker before the outer request, so the outer ID was ignored as a replay. Direct execution committed outer/nested at revisions 1/2; worker execution committed only nested and reported outer `OUTCOME_UNKNOWN`. | Awaiting repair and independent replay. |
| P1: duplicate endpoint/scope ownership was unguarded | Two hosts on one scope installed four listeners; a second owned client on an already borrowed endpoint timed out and terminated the first client's endpoint. | Awaiting repair, original-owner usability and explicit same-endpoint external recovery checks. |
| P2: post-commit send failure obscured commit | Throwing only during delivery of the actual committed add result returned `TERMINATED`; the receipt and root were already committed. | The fallback reports `OUTCOME_UNKNOWN` with the operation ID. Reconciliation returns the exact committed result, and the mutation is never retried. |
| P2: equal manifests hid unequal add-on options | Facet factories with `maxBucketsPerField:1` and `:100` had equal old manifests but returned one versus two buckets for the same two records. Other evidence/display caps also lacked identity. | Exact canonical normalized factory options now form versioned worker identities. Five independently varied private caps differ; equivalent Inspector defaults match. A facet-cap mismatch rejects startup and releases the owned endpoint once. |
| P2: response invariants were incomplete | Initial protocol probes accepted ascending scores, reversed exact-score ties, malformed UTF-16 IDs and impossible aggregate mutation counts. | Invalid ranking/IDs/counts and a false no-op replace are rejected. Encoded UTF-8 byte boundaries, code-bearing/accessor/cyclic/foreign/sparse data and zero getter execution are independently checked. |
| P2: admission/lifecycle/public boundary gaps | Source inspection found wall-clock deadlines, possible double startup termination, exposed TypeScript-private prototype methods, option parsing after closing and transport errors replacing native malformed-input errors. | The final probe observes monotonic transport-inclusive deadline rejection without commit, one startup termination, frozen bound public methods, disposal precedence without getter reads and exact native malformed-record/query errors. |

The [independent raw record](RX-3001-review-probe.json) preserves the **before-fix 8 Pass / 2 Fail** execution under `failedExecutions`, including exact source hashes and raw caller/receipt/state observations. Its final execution reports **10 Pass / 0 Fail**; observations are separate from test statuses. Earlier standalone protocol and facet-manifest findings are recorded above and are not presented as passing runtime checks.

## Independent verification

```sh
node docs/evidence/RX-3001-review-probe.mjs
```

The [portable probe](RX-3001-review-probe.mjs) bundles actual TypeScript sources into an isolated temporary ESM module. Its endpoint pair performs real platform `structuredClone` and asynchronous microtask delivery. This independently exercises the actual adapter and owner; it is explicitly distinct from a browser module-worker execution and a packed public consumer.

The ten probes cover five invalid result shapes, six rejected data forms without getter execution, two exact encoded-byte boundaries, one independent hand-derived whole-corpus BM25 fixture, six mutation and six complete result comparisons, stable deeply frozen results after writes, malformed-input error parity, bound-method/frozen-facade ownership, hidden-cap startup mismatch, known lost-reply reconciliation, precommit transport deadline, live request replay, post-commit send failure, 257 unique mutation IDs/256 receipt expiry and owned/external resource release. The last probe also observes idempotent disposal promise identity and zero remaining endpoint listeners.

The reviewer inspected the successful focused installed/minified browser record and terminal summary: 22 tests, 419 complete direct/worker semantic comparisons, no failures/cancellations/skips/todos. It includes actual same-host module workers for source, stored offsets and mixed phrases; independent membership, UTF-16 and BM25 fixtures; exact caller-admission cliffs; failed startup and semantic-option mismatches; out-of-order/duplicate replies; real replay and post-commit send-failure repairs; pre/post-commit cancellation, lost reply, timeout/death and explicit recovery; encoded message bounds; 64 pending requests; client timer/signal/listener release; and external ownership. Final integrated artifact identity and durable paths remain to be appended after the owner's check completes.

## Acceptance assessment

| Criterion | Current result | Evidence |
| --- | --- | --- |
| AC01 one complete corpus/statistics owner | Fail pending duplicate guard | Ordinary host has one `ExecutionOwner`/root and whole-corpus BM25; duplicate scope installation currently permits a second owner. |
| AC02 complete direct/worker semantic parity | Fail pending reentry repair | Ordinary whole-result parity passes; structural-signal registration/capture reentry currently diverges from direct admission order. |
| AC03 validated bounded transport and compatibility | Fail pending ownership/admission guards | Exact byte/structure caps, compatibility and result invariants pass; duplicate owners and reentrant admission remain open. Physical peak transport copies remain unmeasured. |
| AC04 truthful stop/unknown/commit outcomes | Pass | Independent and actual-browser replay/send-failure regressions; cancellation/deadline rejected receipts and revision-0 state; known commit success; unknown lost mutation reply; conclusive receipt reconciliation and expiry. |
| AC05 explicit public module-worker path | Pass for focused packed consumer | Public client/host imports, separate consumer ESM worker entry, declarations and guarded imports; core creates no worker on import. Final integrated snapshot match pending. |
| AC06 cleanup and explicit recovery | Fail pending duplicate-client guard | Ordinary disposal passes; a second owned client can terminate a first externally owned endpoint. Explicit guarded external recovery remains to be replayed. |

## Qualification boundaries

- **Not run:** supported cross-browser/host matrix, qualified analyzer profile portability, snapshot/storage recovery, remote CI, assistive technology, retained/peak worker heap and physical interaction latency. Source/paired-endpoint probes do not qualify these.
- Transport diagnostics count actual capture visits, encoded-byte charges, string scans and a deliberately held four-root clone/capture fixture. That logical overlap does not measure browser-internal peak buffers, immutable string duplication or garbage-collector reclamation. Physical peak transport copies remain an explicit RX-4001 qualification follow-up.
- Synchronous bounded property capture, string byte accounting, canonical identity creation and structured clone remain indivisible platform/JavaScript work. Passing deadlines establish cooperative observed outcomes, not hard real-time guarantees.
- Core's unchanged 15 KiB gzip target remains a documented miss; optional adapter graphs and wire bytes are separate costs, not heap measurements.
- A silently terminated external worker may require the reply watchdog. `TIMEOUT` during disposal still releases adapter resources; missing/expired receipts never establish rollback and never authorize automatic mutation retry.

No publication, commit, push, remote mutation or unrelated repository change was performed by this reviewer.
