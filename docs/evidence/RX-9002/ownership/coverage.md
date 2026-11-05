# Owned-resource lifetime coverage

## Existing evidence and the added composition

`test/core/execution-lifecycle.test.mjs:267–298,392–501` already checks individual search/mutation cancellation, disposal, participant failure and host/signal cleanup. `test/adapters/snapshots/bulk-source.test.mjs:142–159,200–312` already covers malformed late input, cumulative budgets, iterator cleanup, precommit stops and recovery. `test/core/continuation-host.test.mjs` covers captured handles, stale messages and first-outcome preservation. These are existing safety results, not new RX-9002 work.

The added `test/core/n10-resource-ownership.test.mjs` joins those paths on one reused source+positions owner. Eight cycles perform successful bulk restore, late duplicate refusal, query abandonment after scored selection, bulk abandonment at participant sealing, and subsequent successful search/source recovery. A final suspended restore is disposed. This repeated composition checks whether terminal paths strand deterministic owned resources or poison reuse. The one-work-unit checkpoint is an explicitly shortened deterministic test configuration; it is not a default-host latency/capacity measurement.

[Actual test output](probe.txt) and [structured observations](result.json) pass. At every terminal boundary the injected host has zero owned timer/continuation tasks; caller-signal listeners are removed; failures preserve the exact authoritative root and sidecars; successful roots pass invariants and source roundtrips; disposal releases the authoritative root and calls host disposal once. The test intentionally holds comparison roots itself and does not treat those caller-owned references as an engine leak.

## Source ownership map

| Resource | Owner and release evidence | What is established |
| --- | --- | --- |
| Admission/request/root closures, cursor and stop handles | `src/core/execution/engine.ts:257–273` clears request/cursor/resolver fields before cleanup, calls `return` on abandonment, retires resume/timer/listener closures, and removes active/queued operation ownership | Direct source fact plus observable terminal cleanup and reuse; not a GC observation |
| Engine root after disposal | `engine.ts:276–293` waits for no active/queued work, clears the mutation owner, releases the host once and resolves shared disposal | Source fact and observed `owner.root === undefined`, zero tasks/listeners and one disposal |
| Candidate, page and ranking state | `src/core/query/search.ts:61–147` creates per-generator structures; `src/core/ranking/bm25.ts:12–18` creates root-local field/term maps with no module cache | Generator-scoped ownership; query abandonment/reuse is exercised, but individual maps' physical reclamation is not measured |
| Decoded snapshot, staged core and bulk sidecar builders | `src/adapters/snapshots/snapshots.ts:120–164` owns the decode/staging/publication cursor; `bulk.ts:16–86` owns private reconstruction state and closes participant cursors; source/position stores create one local mutable builder and seal once | Source inspection finds no persistent decoded-payload/builder registry; repeated refusal/sealing cancellation preserves old state and clears operation handles |
| First-party bulk eligibility registry | `src/core/capabilities/bulk-participant.ts:11–23` uses WeakMap registration keys; factories in `src/addons/phrases/store.ts:173` and `src/addons/positions/store.ts:254` capture selected configuration and construct a new invocation-local builder | Registration/configuration lifetime is distinct from collection/build state. Weak keys do not by themselves prove collection or peak memory |
| Native task/message resources | `src/core/execution/host.ts:42–113` owns pending stops and per-channel callbacks, invalidates channel ownership before closing and clears pending callbacks on disposal | Separate continuation probes cover actual captured task delivery; this resource-cycle test uses an injected host and opens no native port |

## Finding classification

**Not observed:** deterministic accumulation of owned handles/listeners, stale authoritative roots after disposal, corrupted reuse after abandoned work, or a newly introduced persistent root/cache/builder registry within this reviewed source and bounded probe.

**Not measured:** retained/peak heap, allocator behavior, when unreachable strings/decoded payloads are collected, or whether process RSS returns to its previous value. Source reachability inspection and zero handle counts do not establish those physical outcomes. No speculative runtime refactor or memory claim follows from this audit.
