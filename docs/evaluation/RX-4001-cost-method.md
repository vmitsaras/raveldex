# RX-4001 cost measurement method

The cost fixtures establish observations for one deterministic admitted ASCII workload. They do not establish relevance, a universal capacity promise, a competitor winner, or physical latency and memory qualification. Retrieval/numerical correctness is evaluated independently by the native oracle and hand-derived cases; this harness checks each measured call's exact full total, requested page size, distinct eligible IDs and finite scores before accepting its sample.

## Reproduction and authority

Prepare one isolated consumer by installing the locally packed Raveldex tarball, then pass its absolute directory. The harnesses do not build, pack, install, publish, modify another checkout or make external network requests:

```sh
node bench/costs.mjs /absolute/installed/consumer /tmp/raveldex-rx4001-costs.json
node bench/browser-costs.mjs /absolute/installed/consumer /tmp/raveldex-rx4001-browser-costs.json
node --test test/comparison/cost-method.test.mjs
```

Chrome runs use localhost and an installed actual browser through the existing pinned `playwright-core`. `RAVELDEX_COST_BROWSER=chromium` explicitly selects an installed Playwright Chromium instead. Keep the Node and browser timing runs sequential and avoid broad builds/tests or another benchmark while they execute. The scripts stage their owned measurement entrypoints into the existing consumer and resolve ordinary execution solely through public package specifiers. The installed-private observer import is restricted to separately untimed diagnostics.

For an explicitly scoped repeat, `RAVELDEX_COST_CONFIGURATIONS=core-only` and `RAVELDEX_COST_SIZES=100,1000` select existing configurations and adopted sizes. The output records those selections. Do not mix a partial rerun into a complete report without preserving the original and replacement raw artifacts and documenting the selection.

The accepted local Node report excludes the six initial small-core rows that potentially overlapped a brief parent comparison command. It substitutes three fresh-owner repeats at each of those two sizes. Original, scoped-repeat and accepted raw reports retain their SHA-256 identities. The original `cost-common.mjs` and `cost-node-entry.mjs` source copies are the actual contemporaneously staged files executed in the consumer. The initial `costs.mjs` wrapper is separately and explicitly labeled as reconstructed from the known single identity-metadata edit under an exact replacement guard; it was not a contemporaneous startup source capture. The original completion-metadata artifact is preserved, and the metadata correction changes no timing or work samples. The first default entry predates scoped-selection controls; an exact guarded normalization proves that those controls/report properties are the sole difference from the current entry. The measurement kernel, fixture, queries, snapshots and observer remain byte-identical. The final graph observations use the current fixed core target entry. Reproduce the explicit replacement with:

```sh
RAVELDEX_COST_CONFIGURATIONS=core-only RAVELDEX_COST_SIZES=100,1000 \
  node bench/costs.mjs /absolute/installed/consumer /tmp/raveldex-rx4001-costs-small-core-repeat.json
node bench/cost-merge-repeats.mjs /tmp/raveldex-rx4001-costs-first.json \
  /tmp/raveldex-rx4001-costs-small-core-repeat.json /tmp/raveldex-rx4001-costs.json
```

This explicit replacement is particular to the local observation and is unnecessary for a fresh uninterrupted full run. Accepted observations span two warm-module Node processes; no process-cold claim follows from either.

## Frozen workload and requested behavior

`bench/cost-common.mjs` owns seed `rx4001-ascii-cycle-37-3-v1`, sizes 100/1,000/10,000, one text field `body`, one string metadata field `group`, zero-padded opaque IDs, cyclic vocabulary and source-token adjacency. Every owner receives the exact same generated JSON records at a size, with a SHA-256 of that JSON in each row. The shared corpus is synthetic cost data; real-content relevance judgments are a separate dataset.

| Query | Complete requested behavior | Independent fixture eligibility |
| --- | --- | --- |
| `red` | Exact total and native BM25 top 20 | All records |
| `value7` | Exact total and native BM25 top 20 | Every index congruent to 7 modulo 37 |
| Strict `red blue` phrase | Exact total and native BM25 top 20 over strict adjacency within one original field value | Every index divisible by 3 |

Two discarded warmups and five measured calls follow each fresh owner's first query call. First-call samples are recorded separately. Replacement changes only `item:00000`: `red blue` becomes `red green blue` and its value token becomes `value7`, so the selective total increases by one and the strict phrase total decreases by one. Native eligibility uses an independent ASCII split in this fixture, never the production tokenizer or scorer. These checks are measurement safeguards rather than a complete scoring oracle.

Build accepts batches of at most 256 records, preserving the actual per-batch admission and atomicity boundary. Each query, batch, replacement, snapshot and storage action uses a 60,000 ms deadline while retaining unchanged corpus, search/mutation work and participant limits. No higher resource limits or bypass is used to manufacture a successful 10,000-record round trip.

## Configurations and equivalence

| Configuration | Retained source / optional state | Serialization and host |
| --- | --- | --- |
| Core only | Core metadata/reverse records, frequencies, dictionary/postings/statistics; no source, positions, offsets, UI, worker or storage | Snapshot export/restore Not Applicable because adapter omitted |
| Source phrase | Core plus selected original `body` source and strict source verifier; no positions/offsets or UI | Optional snapshots selected; source and exact-local-qualified native export/restore measured |
| Positions and offsets | Core plus selected `body` positions and original UTF-16 occurrence spans; no retained original source or UI | Optional exact-local-qualified native export/restore measured; source export Not Applicable |
| Chrome worker and storage | Complete native owner in one real same-host module worker, selected original `body` source and strict phrases; no positions, offsets or UI | Public source-only worker snapshot bridge, actual explicit IndexedDB save/load/erase |

Core scalar equality is available. No filters or facets are requested; extended predicates and facets are uninstalled. Inspector, match ranges, snippets and UI rendering are not requested. The source and positional phrase rows have equal matching and lexical scoring semantics despite different retained state and execution work. Core phrase rows are explicitly Not Applicable. Foreign comparator rows identify their own source/evidence/scoring/query policy and unsupported semantics; timing values alone cannot establish equivalence or a winner.

Node source/position native snapshots use an explicit exact-host declaration checked against the running Node/V8/ICU/Unicode/platform identity from creation. The evidence is the prior exact-host snapshot qualification plus current public round-trip observations, not a browser or cross-host qualification. Ordinary browser owners remain unqualified and the worker bridge supports source snapshots only. Legacy revisions or qualification never enter these fixture owners.

Every browser engine has one complete native worker owner. The export producer and fresh receiving engine coexist during restore/storage measurements, so those phases have two workers, each owning one engine. Node round trips likewise keep the producer and receiver together. Caller fixture records and encoded strings remain held by the harness. None of these realm/graph lifetimes is presented as isolated retained or peak heap.

## Timing and raw repetitions

Each selected configuration and size has three fresh engine owners. Modules and the process are warm; fresh-owner/first-index-call is not process/module cold. Creation and worker handshake are separate from build. The raw phase `fresh-index-first-call` means the first call of that query type on this newly built owner; earlier query types may already have run. Only `red` is the owner's first search. Query first-call samples number three per configuration/size; warm samples number fifteen per query (five per owner). Build, one-record update, each export and each fresh receiver restore have three samples. The receiver contains a literal prior record before restore; a rejected restore must preserve its complete prior result and revision.

Elapsed durations use the current realm's `performance.now()` and are rounded up to whole milliseconds. A reported 1 ms sample can be below 1 ms; there is no sub-millisecond precision claim. The report retains individual samples, status, typed error, exact total/page observations, UTF-8 encoded bytes and code-unit counts. Summary medians round up to whole milliseconds; observed sample maxima are disclosed tails, not population percentiles or device guarantees. Failed and unsupported operations do not become successful zero-duration samples.

Node queries include cooperative task yields/promises and complete exact-total/page work. Browser queries additionally include main/worker bounded capture, actual transport and response delivery. Browser and Node are different runtimes/realms; subtracting their timings cannot isolate worker overhead. IndexedDB save includes export and transaction completion; load includes selection/decode/restore and worker bridge where selected. Separately recorded export/restore does not authorize subtracting correlated samples to invent pure I/O costs.

The default source rebuild may refuse a 10,000-record restore at its unchanged work cap or deadline. Such rows remain Rejected with actual reason and old-state preservation. A rejected source restore/load is not a successful round trip. Successful storage save is separately meaningful even when later load refuses.

On the observed Chrome 10,000-record worker configuration, direct source restore reaches the selected deadline, and the combined IndexedDB load can return `OUTCOME_UNKNOWN` during restore. Preserve that returned uncertainty, selected durable generation and operation ID. A subsequent complete FIFO query that observes the prior receiver state/revision is a separate observation at that checkpoint, not a relabeling of the original load result as an authoritative successful or failed receipt. The cost harness does not claim a conclusive restore receipt from that query. Actual save completion and both-store erasure remain separate observations.

## Logical work and bundle graphs

After uninstrumented Node timing, one separately untimed owner per configuration/size wraps the installed-private `ExecutionOwner.admit` iterator. It counts actual emitted `work-v1` steps, summed work units and maximum emitted step work for build, queries, replacement and selected export/restore. No production source is rewritten and no observer participates in accepted timings. A refused attempted charge may not emit its step, so counters stop at the last emitted work. Core state counts and declared numeric participant counts are logical retention diagnostics, not physical bytes.

The browser public worker/storage facade does not expose execution work counters. Its report states Not exposed; Node native generator diagnostics do not stand in for observed transport/storage work. Store-row counts after save and erase come from real independent IndexedDB readonly transactions. They establish exact namespace rows and erasure on this host, without a heap, crash or power-loss claim.

Complete selected public-module exports remain observable during bundle measurement. The fixed core entry directly exports all three runtime values (`createRaveldex`, `RaveldexError`, `ERROR_CODES`), preserving the previously adopted target method. Other graphs preserve whole namespaces. Core, source phrase, positions/offsets, source/native snapshots, UI, ordinary worker client/host, storage and worker/storage client/host are separate graphs. Actual shipped UI CSS is measured separately without CSS minification. All graph inputs/hashes and esbuild metafiles are retained. Every selected code graph uses pinned esbuild, browser ESM/ES2022, minification and tree-shaking, ASCII charset, no legal comments/source maps; gzip level 9, windowBits 15, memLevel 8, default strategy 0 and deterministic mtime 0.

Graphs overlap and cannot be added as disjoint costs. A standalone adapter graph excludes the caller's engine unless core is explicitly selected. Actual browser harness graphs also include application/fixture code and are labeled accordingly. Minified/gzip/UTF-8 serialized bytes are not parsed cost, retained heap or peak process memory. Hardware/OS/CPU/runtime/browser/tool identities and the tested installed package are recorded in each raw report. Product UI rendering, exact browser/AT/device/memory and physical latency qualification remain RX-4002.
