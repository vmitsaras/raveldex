# Incremental mutations, revisions, and execution

Status: Approved. Primary tasks: RX-1004 and RX-1005. Transport application: RX-3001. RX-1004 internal incremental mutation/participant publication verified locally; public scheduling/lifecycle integration remains RX-1005. See [evidence](../evidence/RX-1004.md).

## Goal and system outcome

Changes must be atomic and incrementally maintain native index state. A caller must know what a completed operation observed or committed, whether cancellation rolled a change back, and when an external transport failure leaves the outcome unknown.

## Current facts, constraints, and non-goals

The repository now has a private serial mutation owner and complete query cursor, without a public FIFO scheduler/engine yet. This contract implements the adopted [native architecture](../architecture/NATIVE_ARCHITECTURE.md) and [public core API](CORE_CONTRACT.md). It does not reuse the companion's whole-state rebuild implementation or transfer its test results.

RX-1004 captures bounded mutation data/options under one admission counter, selects its root on cursor start and stages core/participant changes under one work-v1 budget. Its private control seam observes phase/work/final stop checks; structural signals can abort mutation cursors. Public promise conversion, queue time, monotonic deadline enforcement, disposal and host task yielding remain RX-1005. Participant roots are trusted immutable supplied state; first-party source/position registrations remain N2. No public arbitrary hook or live schema migration is added.

One owner runs one operation at a time. No concurrent read/write execution, MVCC/history retention, automatic retry, distributed transaction, background rebuild, or schema change in place is required. Worker execution uses one complete native index and cannot change these semantics.

## Decisions

- E-D01: Accepted calls enter one bounded FIFO queue; conflict checks and read revision selection occur when a call executes.
- E-D02: Inputs are owned at admission; state is owned by the engine.
- E-D03: Prepare every changed core/add-on root, then publish them together without yielding.
- E-D04: Unchanged records are not reanalyzed for single-record changes.
- E-D05: Cancellation before commit produces no committed change. Cancellation after commit cannot truthfully report rollback.
- E-D06: Limits cause typed failures, never successful approximate search or partial batch commits.

## Admission and concurrent calls

`createRaveldex` returns an empty engine with revision 0. Each public operational call synchronously captures bounded input structures/primitive values and performs cheap shape/type/length checks before returning its promise; validation exceptions are converted into promise rejections. String-content scans, well-formed UTF-16 validation, and tokenization run inside queued charged resumable work, not as a full synchronous batch scan. It then either starts immediately or enters the queue.

Ownership capture permits at most 16,384 own data properties/array elements per call by default. Count captured/inspected structure entries independently from text length; immutable string values require no character scan to capture. This bounded synchronous section and platform property operations are not preemptible and must be disclosed/measured in latency qualification. It is not a promise to sandbox malicious proxies or make every JavaScript primitive interruptible.

The first accepted operation starts as the single running operation. At most 32 further operations wait by default. `maxQueuedOperations: 0` permits an idle engine to start a call and rejects concurrent waiting calls. Reject overflow with `QUEUE_FULL`; do not drop an older request or replace it with a newer query silently.

An already-aborted signal rejects with `CANCELLED` before queue admission. A disposed/closing engine rejects new work with `DISPOSED` without inspecting caller text unnecessarily. The effective deadline begins at admission, so queue time counts. Every accepted operation settles exactly once.

Queue order is call admission order within this owner. Ordinary search calls are not automatically debounced or superseded. A UI adapter may explicitly cancel a previous request and suppress obsolete presentation, but must keep those two behaviors distinguishable.

A call chooses its read root **when it starts**, after previously accepted operations settle. Thus `add(a); search('a')` without awaiting the first promise still respects FIFO ordering. If the add fails, search sees the last good root. It does not observe a half-prepared add. Callers requiring a different order must await or order their submissions explicitly.

Yielding active work does not start the next queued operation. A signal handler can request cancellation during a yield; it cannot access or commit the staged root.

## Mutation behavior

Every mutation returns `{ revision, changed, added, replaced, removed }` as defined by the core API.

| Method / situation | Required result |
| --- | --- |
| `add(record)` with absent ID | Commit one added record; `added: 1`, `changed: true`. |
| `add(record)` with existing ID | `ID_EXISTS`; no state change. |
| `addMany(records)` | Entire batch commits once or fails without any member committed. |
| Duplicate IDs inside an add batch | `INVALID_RECORD` with the offending bounded path; no last-write-wins behavior. |
| `addMany([])` | No-op; unchanged revision and zero counts. |
| `replace(record)` with existing ID | Complete replacement and one commit, including replacing with apparently identical data; `replaced: 1`. No equality heuristic is required. |
| `replace(record)` with missing ID | `ID_NOT_FOUND`; no implicit upsert. |
| `remove(id)` / `remove(ids)` | Remove existing selected IDs atomically; missing IDs have no effect. Duplicate requested IDs are `INVALID_OPTIONS`. |
| Remove empty/all-missing IDs | No-op; unchanged revision and zero counts. |
| `clear()` on nonempty state | Commit an empty core plus empty installed side-index/source roots; removed count is the previous document count. |
| `clear()` on empty state | No-op. |

Membership conflicts are evaluated against the execution-start root, not an earlier admission-time root. For example, two queued adds of the same absent ID do not both succeed: the first commits and the second rejects.

No-op calls still respect disposal, an already-observed abort, and deadline rules. They do not increment revisions or manufacture transaction callbacks with a false change. Calling replace with identical content deliberately commits because core-only mode does not retain authoritative original source for a universal deep-content equivalence test.

## Incremental staging

For one changed document:

1. Read its old canonical metadata, reverse term frequencies, field lengths, and any installed participant records.
2. Validate and analyze only the supplied new document values when adding/replacing. Removing a record needs no text analysis.
3. Derive term-frequency, field-population, token-length, logical-input-size, and metadata deltas.
4. Stage touched document, dictionary, posting, and participant buckets. Reuse unchanged roots/buckets; copy a touched bucket once per batch and account for every copied entry.
5. Validate the proposed live-state totals against all caps and every affected invariant.
6. Assemble a complete new root; run the final cancellation/deadline check.
7. Publish that root and its new revision in one non-yielding step.

The implementation must not read/re-tokenize unrelated original records, regenerate every posting list, or rebuild the entire dictionary as its routine replace/remove strategy. It may copy affected shared buckets and traverse affected common-term data. Quantify that work rather than claiming constant-time mutation.

Reverse data is sufficient to subtract old postings/statistics even without retained source. A tokenless document still occupies one live ID and may have metadata. Empty field transitions adjust field-positive-document count correctly. Removing the last occurrence of a term removes that term's dictionary entry. Metadata-only changes do not retokenize other records.

Batch staging coalesces touched buckets and publishes one revision. Do not transiently commit individual members, rely on a sequence of public add calls, or allow one add-on to publish before the core.

## Revisions and the commit boundary

Revision is a nonnegative safe integer. Each state-changing operation increments it exactly once. No-op, rejected, cancelled-before-commit, and failed operations leave it unchanged. Before exceeding `Number.MAX_SAFE_INTEGER`, reject with `REVISION_EXHAUSTED`; never wrap or reuse revisions within a live instance.

The commit point is the assignment of a fully assembled root containing every installed participant root. No async callback, user code, throwing participant action, or yield may occur inside that publication step. Participants prepare data before publication; their committed state is selected by the root, not by post-commit notification callbacks.

Prepare/finalize failures discard staging and retain the old root. Best-effort cleanup may release private temporary data, but cannot change the published state or replace the operation's original error with a cleanup error. A recoverable allocation failure before publication reports `RESOURCE_EXHAUSTED`; process-wide out-of-memory termination is not something a JavaScript library can promise to catch or roll back across restarts.

The operation's response contains the revision it actually read or committed. It must not obtain a newer revision later from mutable global state while constructing the response.

## State transitions and cancellation

Conceptually an accepted call is `queued → running → completed/failed/cancelled`; a mutation additionally reaches `prepared → committed → completed`. These states are lifecycle facts, not mandatory public events.

| Moment of cancellation/disposal | Search | Mutation |
| --- | --- | --- |
| Before admission / while queued | Reject and remove from queue. | Reject; nothing committed. |
| During active resumable work | Reject at the next checkpoint. | Discard staging and reject at the next checkpoint. |
| Final check before result/commit | Reject if cancellation is observed. | Reject if cancellation is observed; old root remains. |
| After result has settled / after commit | A settled result is not revoked. | Committed result remains success; do not report rollback. |

For active operations, caller abort uses `CANCELLED`; disposal uses `DISPOSED`; deadline/work-budget failures use their dedicated codes. If multiple stop conditions are already visible at a checkpoint, choose `DISPOSED`, then caller `CANCELLED`, then `DEADLINE_EXCEEDED`, then `WORK_LIMIT_EXCEEDED`. Preserve the specific first error already recorded by the operation.

An operation performs a final check even when it consumed fewer than one full checkpoint quantum. Signals are cooperative requests, not interrupts that preempt JavaScript in the middle of a primitive or the root assignment.

## Work, deadline, and yield accounting

The initial maximums are 10,000,000 search work units, 50,000,000 mutation work units, and 2,048 units between owned-loop checkpoints. They are defensive budgets, not latency claims. Publish the accounting policy as `work-v1` so changes in implementation instrumentation cannot silently redefine a benchmark.

At minimum, charge:

| Work | Unit accounting |
| --- | --- |
| Input/analyzer scan | One per original code point visited; separately charge normalized output code units. |
| Dictionary enumeration/comparison | One per entry visited plus compared code units in owned string-comparison loops. |
| Posting traversal / set membership | One per posting or candidate membership operation. |
| Score/Boolean evaluation | One per evaluated node, selected field-term contribution, or union insertion. |
| Staging/copying | One per copied directory/bucket entry or updated posting/statistical entry. |
| Result selection | One per heap/selection comparison and copied returned hit. |
| Add-on work | Charge its traversal/analysis/aggregation using the same operation budget; no hidden unmetered outer loop. |

Where a bounded platform primitive performs internal work (token normalization, Map lookup, structured clone, allocation), count its declared input size and record it separately during qualification. Unit counters do not make that primitive preemptible. Raw token and message bounds limit its input; actual scheduling/latency must be measured.

Large loops must resume from cursors. Use a bounded top-page selection strategy rather than relying on one uninterruptible full-candidate sort. Sorting a small explicitly bounded array may remain a bounded primitive and must be disclosed in execution evidence.

Check cancellation/deadline/work limits at phase boundaries, no later than the configured owned-work quantum, and immediately before success/commit. A deadline is observed using a monotonic host clock. `deadlineMs` defaults to `min(30,000, maxDeadlineMs)`, is an integer at least one, and cannot exceed the configured maximum, whose hard cap is 60,000. A timeout includes queue time.

Direct mode must yield to a host task opportunity, not only an indefinitely chained resolved-Promise microtask. Use a host scheduling primitive appropriate to the environment with a fallback such as `setTimeout`; no DOM is required. Tests may inject a private deterministic clock/scheduler seam. Runtime users do not receive an arbitrary scheduler capable of changing query semantics.

The host may delay task execution, garbage collection, or timer delivery. Therefore the API promises cooperative checks and typed observed outcomes, not hard real-time cancellation or a guaranteed maximum physical latency.

## Disposal

`dispose()` immediately marks the instance closing, rejects queued operations with `DISPOSED`, requests cancellation of an active precommit operation, and prevents further admission. It returns a promise that resolves when active work has reached a safe terminal state and owned roots/temporary data/listeners have been released.

Calling dispose repeatedly is safe and returns the same eventual outcome; disposal of an already disposed instance resolves. An operation that committed before disposal began retains its successful mutation outcome. No new commit can occur after closing is observed by the final precommit check.

Disposal unregisters signal listeners and queue timers and leaves no scheduled work that can publish a root or resolve a previously rejected call. It does not erase an external database; erasure is an explicit storage-adapter operation. A worker adapter terminates only workers it owns, according to its documented ownership option.

## Transport outcomes

Native direct mode can determine whether its root publication occurred. A worker caller that loses the response may not know whether the mutation committed. Such a failure is `OUTCOME_UNKNOWN`, not `CANCELLED`, and must never trigger automatic retry of a non-idempotent mutation.

The worker adapter uses operation IDs and a bounded receipt/reconciliation protocol. When available receipts cannot establish the outcome, the caller must reconcile authoritative state or recover it explicitly. Killing a worker or ignoring an old reply does not establish cooperative rollback.

## Acceptance criteria and verification

| ID | Criterion | Required evidence |
| --- | --- | --- |
| E-AC01 | Add/replace/remove/clear and batch conflicts follow the table. | Runtime sequence tests including empty/no-op paths, duplicate IDs, and conflicts queued behind prior writes. |
| E-AC02 | Each operation sees one revision; failures cannot publish partial core/participant state. | Fault injection before each prepare/finalize/publication boundary; compare full independent state afterward. |
| E-AC03 | Replacing one document does not reanalyze unchanged documents. | Analyzer-call/input instrumentation on 100/1,000/10,000-record corpora plus touched/copy/allocated entry counts. |
| E-AC04 | Corpus/dictionary/posting/field statistics remain coherent. | Independent rebuild/oracle comparison after deterministic generated mutation sequences. |
| E-AC05 | FIFO, queue overflow, deadlines, and caller input ownership are correct. | Deterministic private scheduler/clock tests and a real host task-observability scenario. |
| E-AC06 | Cancellation before/after commit and disposal report honest outcomes. | Checkpoint injection at every phase, postcommit reply loss later in worker tests, and repeated disposal/listener cleanup checks. |
| E-AC07 | Expensive owned loops yield and respect work budgets. | Counted traversal tests, common-term/collision cases, long-token bounds, and direct-mode timer/input observation. |
| E-AC08 | Limits never return partial successful search or partial mutation. | Deliberate expansion/work/capacity/resource failures with exact before/after root comparisons. |

Expected areas: `src/core/` state/index/scheduler, `test/core/`, private fault-injection/clock seams, and later transaction participants and `src/adapters/worker/`.

Verification must distinguish implementation correctness, environmental scheduling limitations, and unmeasured resource behavior. A clean tree, Promise-returning function, or passing build does not prove cancellation, atomicity, or incrementality.

## Open questions

None blocks N1. Specific bucket layout, cursor representations, and test-only injection seams are local implementation decisions within this contract. A design that cannot satisfy it must produce a narrow architecture finding before substituting full-state rebuilds or weaker outcomes.
