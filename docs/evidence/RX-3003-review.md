# RX-3003 independent review

Outcome: **Ready with follow-ups**. Date: 2026-10-08. The final independently inspected candidate has no confirmed blocking defect. This review owns only this record and its independent probe artifacts; production, primary tests, configuration, planning and the main task evidence have separate owners.

## Method and accepted candidate

Inspected the six task acceptance criteria, approved snapshot/storage/worker/core contracts, actual direct-owner snapshot publication and stop boundaries, namespace CAS transactions, lifecycle cleanup, optional import graphs, worker restore receipts and public export boundaries. Expectations in the independent browser fixture use literal memberships, original strings and UTF-16 coordinates; they do not import the runtime tokenizer, scorer, codec or primary test oracle.

The accepted behavioral run of [RX-3003-review-probe.mjs](RX-3003-review-probe.mjs) records **11 Pass, 0 Fail** in [RX-3003-review-probe.json](RX-3003-review-probe.json). It bundles its own fixtures from an actually installed tarball through public package imports and launches an actual module Worker. Browser faults are injected into real browser requests, transactions or reply delivery; they are identified separately from physical host failures. A subsequent final artifact audit passes after documentation status synchronization, with exactly the same production distribution and tarball as those 11 probes; browser behavior was not rerun for that metadata-only change.

Exact environment: Chrome **154.0.8037.98**, headless; Playwright Core **1.61.1**; esbuild **0.28.2**; Node **24.21.0**, V8 **13.6.233.17-node.53**, ICU **78.3**, Unicode **17.0**; macOS **27.0.1**, build **26A434**, Darwin **27.0.0**, arm64. No assistive-technology claim is made.

Accepted behavioral command:

```sh
node docs/evidence/RX-3003-review-probe.mjs \
  --directory /private/var/folders/m4/7qvldjl917j4nwbkw7bxmn_m0000gn/T/raveldex-core-consumer-k7zw5D \
  --package /tmp/raveldex-rx3003-indexeddb-fifth.json \
  --require-current
```

Final artifact-only command:

```sh
node docs/evidence/RX-3003-review-probe.mjs \
  --directory /private/var/folders/m4/7qvldjl917j4nwbkw7bxmn_m0000gn/T/raveldex-core-consumer-Rb98iq \
  --package /tmp/raveldex-rx3003-indexeddb-accepted.json \
  --require-current --audit-only
```

The reviewer never built or packed the package. Localhost `listen EPERM` required the authorized browser run outside the filesystem/process sandbox. That environment failure is retained and does not count as a runtime failure or pass.

The actual tarball SHA-256 is `dad126c25900e22f1d5f1d599961c7b2201cda0df8cc47d92e98b9d3f1ca3057`, with **139,407 compressed bytes**, **601,134 unpacked bytes** and **198 package files**. All **195 distribution-file identities** and `package.json` match the current built workspace. All **99 source identities** agree before and after both accepted independent executions. The final documentation corpus SHA-256 is `a7a2b49e6e7a5f93a4a52c03b89f76649f4036603a89b9946de636cd617d4eb1`; its content hash was independently recomputed, and every current corpus source file agrees with the final captured source SHA. The earlier behavioral capture's corpus `f1dd951db09b096a9415fd60fe9e65b683363ff50a44de49c7bfa1e4774a7501` remains explicitly historical after correcting the architecture document's stale status. The independent literal corpus is separately identified in the raw record.

The accepted final primary report records **26 Pass, 0 Fail** and **301 complete comparisons**. The final full `npm run check` log records **471 Pass, 0 Fail**: 406 core/tooling/package/add-on/snapshot tests, 15 UI scenarios, 24 ordinary worker scenarios and 26 persistence scenarios, with zero cancelled/skipped. These project commands were run by the parent; the reviewer inspected their reported suite totals in the accepted full log. The reviewer independently audited the final actual tarball, corpus and all four captured client/worker graph input sets, and reproduced each minified/unminified output and gzip hash. This identity audit is separate from running the primary behavioral scenarios. The reviewer also generated its own 74-input browser and 72-input worker graphs; these contain only explicit independent entry files and installed Raveldex distribution modules, with no external runtime dependency. Graphs overlap and are not additive adapter costs.

## Acceptance assessment

| Criterion | Result and evidence |
| --- | --- |
| AC01: explicit optional namespaced actions | **Pass.** Guarded imports of storage, snapshots, ordinary worker host and selected worker snapshot entries observe no storage, network, DOM, timer, worker, clock or crypto access. Save/load/erase require explicit calls. The ordinary worker host exports only its documented function; the private owner bridge is hidden. |
| AC02: honest generation and commit outcomes | **Pass.** Save leaves the engine revision unchanged and persists the exact serialized source envelope. Two actual tabs reject stale CAS tokens, including after erase/recreate. Successful snapshot requests followed by a real transaction abort preserve all old durable rows. Same-event postcommit abort preserves direct and actual-worker restore success. Lost worker restore delivery produces `OUTCOME_UNKNOWN`, its selected durable generation and its operation ID; a dedicated receipt confirms exactly one commit, ordinary mutation reconciliation rejects the wrong domain, and no automatic restore retry occurs. |
| AC03: explicit failure/recovery | **Pass.** Injected genuine `QuotaExceededError`, real transaction abort, unavailable storage, future database version, corruption, orphan metadata, blocked open, late successful open, actual external versionchange and bounded admission/deadline failures have explicit outcomes. A forced native version-2 upgrade against a held actual version-1 connection produces real blocked/late-upgrade events; the abandoned upgrade aborts with `AbortError`, and a subsequent real upgrade succeeds without being blocked. Primary schema mismatch and completion-loss scenarios were inspected separately. |
| AC04: validated complete atomic restore | **Pass.** Recovery replaces a sentinel receiver in exactly its next local revision while preserving origin revision as metadata. Literal complete memberships, strict per-value phrase matching, original retained source and the astral-string UTF-16 range `[3,8)` agree across selected source/position/evidence roots. Corrupt integrity and contradictory metadata format preserve the exact old complete receiver result. A paused borrowed restore selects generation A; concurrent save advances durable head B; resumed restore publishes precisely A and returns A, while a subsequent save with A correctly conflicts with B. |
| AC05: complete scoped erasure | **Pass.** Both `snapshots` and `metadata` contain only the other namespace after erase. No selected namespace row or tombstone remains. Missing erasure is idempotent; corrupt payload and orphan metadata can be erased explicitly. Borrowed in-memory records remain usable until their separately owned engine cleanup. |
| AC06: direct/worker lifecycle semantics | **Pass.** Direct stop after actual publication and actual worker stop within the committed-result wrapper preserve known success. An unobserved borrowed restore settles unknown and disposal prevents further admission. Sixty-four bounded queued requests settle their deadlines, overflow is explicit, and expired queued exports never touch storage. A real 48,621-byte source envelope arms cancellation only after successful serialization; the adapter's byte-scan host-task opportunity observes it before any database open. Actual worker cleanup removes every tracked endpoint listener and terminates its owned worker exactly once. Primary cancellation/disposal/termination and full add-on scenarios provide additional distinct evidence. |

## Findings and resolution

Source review found an initial synchronous UTF-8 scan of a potentially 64 MiB envelope inside storage validation. The final adapter scans bounded chunks with host-task opportunities outside active IndexedDB transactions; CAS callbacks perform fixed-shape checks. The independent larger-envelope probe observes a real stop opportunity after serialization and before storage. This was repaired before the reviewer captured an executable production failure.

The initial borrowed-restore stop logic could classify an already resolved worker commit as unknown before its mapped Promise microtask ran. The final fallback waits a host task, allowing authoritative Promise reactions to win. Independent direct and actual-worker same-result-event probes now preserve committed success. A nonempty operation ID alone is not treated as rollback evidence. Export cancellation settles promptly because export does not publish an engine root.

Final source also checks canonical stored format/byte metadata before restore, requires a prepared transaction result before returning success, protects the private worker-owner bridge through the public host wrapper, and retains abandoned-open guards that abort late upgrades or close late successful connections. No success-returning stub, alternate engine, background persistence or dependency was introduced.

Raw history preserves reviewer setup and fixture failures: an incorrect optional host import path, cleanup masking the sandbox listen failure, a forbidden combined evidence request, an overly broad substring assertion against serialized manifests, and an external message-listener assertion that ran after Promise delivery. Those were reviewer fixture defects; correcting them required no production changes. A historical 9-pass candidate was refused coherent-candidate acceptance when `src/README.md` changed during its source identity window. The final frozen run passes every identity check. No historical failure or older package is substituted for accepted evidence.

## Limits and follow-ups

This qualification observes one local Chrome/browser-worker environment and source rebuilding. Browser native snapshot qualification remains unsupported; an attempted native save rejects `UNQUALIFIED_PROFILE` before database creation. Existing exact-Node native qualification is neither widened nor presented as browser compatibility.

The adapter requests strict IndexedDB durability and returns durable success only after actual transaction completion. These observations do not establish persistence after a physical OS crash, browser eviction or device failure. Quota failure is an injected genuine browser exception, not physical quota exhaustion. Encoded bytes, graph sizes and namespace row counts are not retained or peak heap measurements. The byte-scan observation proves a host-task/cancellation opportunity, not a maximum physical latency.

The blocked-upgrade fixture transparently changes the factory's requested version from 1 to 2 to reach a real blocked event against a held version-1 connection; ordinary version-1 opening cannot naturally upgrade an existing held version-0 database. Late successful-open closure is covered independently by delayed delivery of a real successful open. Remaining cross-browser, physical memory/latency, crash durability and existing N4 package-size qualification work remain outside this bounded slice. Remote CI/publication and GitHub tracking writes were not performed by the reviewer.
