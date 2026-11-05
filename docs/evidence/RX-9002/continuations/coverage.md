# RX-9002 continuation/deadline coverage delta

Status: **Pass within this bounded review/probe scope. No new runtime contract violation observed.** Only a new test file and this evidence directory were written; production and earlier tests were unchanged.

## Existing coverage inspected first

| Surface | Existing source / tests | Already established; not claimed as new work |
| --- | --- | --- |
| Captured fast dispatch, timer fallback and owned callback cancellation | `src/core/execution/host.ts:27–110`; `test/core/continuation-host.test.mjs:88–210` | Actual Node continuations are tasks rather than microtasks; timer-only fallback; fake message cancellation/stale suppression; both-port cleanup including partial setup/cleanup failures. |
| Admission-relative deadlines and FIFO ownership | `src/core/execution/engine.ts:151–247`; `test/core/execution-lifecycle.test.mjs:220–264` | Queued abort/deadline releases a slot; deadlines begin at admission; delayed timers cannot permit an expired operation to succeed; silent abort is checked at start. These engine cases use an injected execution host, not captured real `directHost` dispatch. |
| First terminal outcome, reentry and disposal | `src/core/execution/engine.ts:255–299`; `test/core/continuation-host.test.mjs:228–283`; `test/core/execution-lifecycle.test.mjs:327–499,525–540` | Active/queued stop/disposal, stale continuation suppression, scheduling/cleanup failures, committed-success preservation and visible stop precedence. The custom `DualHost` dispatches its own continuation map. |
| Multi-quantum semantic and actual timer progress | `test/core/execution-parity.test.mjs:44–124` | Complete source/arithmetic parity across quanta; cancellation positions; finite actual direct factory/timer progress. This is not a queue-expiry/eighth-source composition test. |

## Demonstrated missing composition and added cases

The existing separate tests did not join the actual `directHost` fast-count/eighth-continuation timer branch (`host.ts:99–102`) with an occupied engine, a single bounded waiting slot, simultaneous ready task order and first queued terminal outcome. The new [test file](../../../../test/core/n10-continuation-hardening.test.mjs) exercises that composition without replacing the implementation's `continuation` function.

Four deterministic cases use captured platform primitives with an explicit monotonic clock. Actual `directHost` and `ExecutionOwner` run unchanged. Seven fast callbacks cause the next continuation to be scheduled on the timer source. At clock 5, the zero-delay continuation and queued deadline are ready. The deadline-first-terminal cases deliver the due deadline callback before or after the ready continuation, covering both legal timer orders. The abort-first-terminal cases deliver cancellation before or after the ready continuation; cancellation removes the due deadline task, whose captured callback is later replayed as stale work. Assertions prove:

- the queued error remains the first settled cancellation/deadline outcome;
- the active root remains unpublished while the queued stop frees its one waiting slot;
- a subsequent read is admitted and sees the one successful write/revision, never the refused queued record;
- stale deadline/resume callbacks cannot publish or revive work before or after disposal;
- captured immediate/timer ownership and signal listeners return to zero.

The fifth case captures wrappers around actual Node `setImmediate`/`setTimeout` handles at `directHost` creation, then immediately restores the globals. Genuine Node tasks run the engine. An external timer is not counted as an engine-owned handle. The case verifies task-versus-microtask behavior, actual periodic zero-delay timer continuation, suspended-mutation abort, exact old-root preservation, later recovery, and zero observed owned handles/listeners after settlement/disposal. Stale callbacks are replayed directly after cancellation; their manual replays are excluded from the native-delivery counters.

## Commands and observations

```sh
node --test test/core/n10-continuation-hardening.test.mjs
node --test test/core/continuation-host.test.mjs test/core/execution-lifecycle.test.mjs test/core/execution-parity.test.mjs test/core/n10-continuation-hardening.test.mjs
```

The [new-case log](new-cases.txt) passes **5/5**; the [focused combined log](focused.txt) passes **44/44**, with zero skips/failures/cancellations/todos. The actual Node observation records v24.21.0, 426 genuine continuation deliveries including 53 zero-delay timer callbacks, an external timer before the first immediate in this run, and zero owned handles/listeners at settlement. No assertion requires this particular real-host ordering or a wall-time threshold. Deterministic cases cover both legal ready-task orderings.

[Identity](identity.json) records source/test/package/lock hashes and runtime environment. All **345 compiled package members** under `dist/` matched the retained RX-9001 verified private archive before these probes. Starting HEAD is `6100770`; RX-9001 remains uncommitted and preserved. This is scoped worktree verification, not a new committed-head claim.

## Finding disposition and limits

[Machine results](results.json) classify the observed cases as passing with **no reproducible contract violation** and no proposed production fix. The parent-owned bulk/source/positions resource composition probe is separate from these host cases.

The deterministic platform retains callback history deliberately to replay stale work. That observer history is not an engine retention finding. Zero owned callback/handle/listener counts do not establish retained/peak heap, primitive-string collection, physical scheduling, all-browser message-source behavior or universal fairness. No actual browser/worker message-source workload ran in this subtask. Node test-runner duration output is harness metadata, not a performance benchmark or latency SLA.
