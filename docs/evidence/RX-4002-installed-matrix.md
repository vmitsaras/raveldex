# RX-4002 — Installed-browser matrix and native restore observations

Date: 2026-10-09. Baseline: `65a21f5`. RX-4002 remains **Blocked / partially observed**; RX-4003 waits. This continuation exercises previously unobserved installed Firefox/Safari engine, storage and resource configurations and adds a separate receiving-process memory method. All seven acceptance criteria, dependencies, public contracts, limits and snapshot qualification policy are unchanged.

## Installed-app method and identities

Native About dialogs confirm **Firefox 157.0.1 (aarch64)** and **Safari 27.0.1 (22625.1.29.11.28)** on **macOS 27.0.1 / 26A434**. Firefox Info.plist separately identifies installed build `15726.10.5`; its exact running build is not exposed by About. Firefox differs from the historical 156.0 UI observation. No update/restart control or browser/OS preference was activated. Original Firefox New Tab and Safari Start Page are preserved through separate task tabs.

The [serve-only package preparation](RX-4002-installed-matrix-package.json) binds the actual installed consumer, fixtures, graph inputs, CSS and tarball SHA-256 `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`. Its empty automated `records`/`browsers` arrays are not scenario outcomes. The [static audit](RX-4002-installed-matrix-audit.json) checks all 208 installed production files against the workspace and all served assets/sources, with 181 previous tracked JSON/evidence-probe files preserved separately from the active manifest.

Codex used `mcp__cua_repl` native app controls to open `/matrix`, explicitly choose the browser label, and activate each of six individual buttons. A button reports success only after the real in-page assertion, individual cleanup, bounded database deletion, one subsequent host task for cumulative page errors, and acknowledged append/fsync to a new local journal. Its immutable manifest binds package/harness identities, a session UUID and manifest digest; each result matches its recorded start. Browser labels are operator assignments. Actual request User-Agent is captured independently, including its frozen OS token; About and OS inventory establish the actual version facts. These are software-driven installed-browser observations, distinct from physical keyboard/pointer, heard speech or OS IME observations.

The test-only reporting route rejects wrong origins/hosts/methods/content types, malformed or inconsistent results, stale/unknown identities, concurrent starts and conflicting duplicates. A one MiB capture ceiling bounds report bodies. Exact duplicate result delivery is acknowledged without rerunning work. Server closure preserves any unfinished attempt as unknown. Eleven focused reporting tests cover these behaviors. Review repaired result/error validation and synchronous cleanup handling before source freeze and the actual matrix; no native runtime defect was identified.

## Actual installed matrix results

| Scenario | Firefox 157.0.1 | Safari 27.0.1 |
| --- | --- | --- |
| Finite semantics / numerical / offsets / direct-worker parity | Pass | Pass |
| IndexedDB source recovery / namespace erasure / database deletion | Pass | Pass |
| 1,000 direct-core records | Pass; admitted 1,000 | Pass; admitted 1,000 |
| 1,000 source-worker records | Pass; admitted 1,000 | Pass; admitted 1,000 |
| 10,000 direct-core records | Pass; admitted 10,000 | Pass; admitted 10,000 |
| 10,000 source-worker records | Pass; admitted 10,000 | Pass; admitted 10,000 |

Every primary result has zero page errors, zero cleanup errors and a matching acknowledged start/result identity. The [closed append-only journal](RX-4002-installed-matrix.jsonl) has 25 lines (one manifest, 12 starts, 12 results), SHA-256 `1c12a48a6364a6653c77591ec1ed3b6fa219136db063ee811d251067a3aa8241`; session `928b69a8-06ab-4c45-a7a5-6526c3984a84` and manifest digest `65a2a16d979f2cfb21767d069607d8782c4c1f1f1a534440d49bd752f696cd54` match the preparation. There is no unfinished attempt. The [curated native action record](RX-4002-installed-matrix-observations.json) captures actual returned terminal AX text and attempt UUIDs. These 12 observations use the exact same tarball as the earlier native UI continuation, with the new test-only reporting fixtures identified separately.

## Finite behavior covered

The engine scenario asserts 50 independent complete membership cases across core/source/positions and same-host module-worker parity, original combining/ligature UTF-16 spans, malformed UTF-16 refusal without partial mutation, strict phrases/ranges, and two hand-derived BM25 scores. Its 53 recorded rows include three malformed-input rows. The bounded Unicode corpus keeps ordinary analyzer profiles `unqualified`; it gives no universal Unicode or native browser snapshot portability claim.

The IndexedDB scenario asserts source save, worker/direct source recovery with complete comparable results, namespace erasure, a missing subsequent load, and database deletion. Local restore revisions differ intentionally. Transaction completion is separate from power-loss/eviction durability and native snapshot portability.

The four resource cases per app request exactly 1,000 or 10,000 records in batches of at most 256 under unchanged operation/transport bounds. They assert full admission, common/selective totals, source phrase totals where registered, one-record replacement/revision and public disposal. Primary resource checks record large-workload facet results without individual bucket arithmetic assertions; independent review separately recomputes the four source-worker facet rows. These untimed scenarios measure neither memory nor responsiveness or physical paint. No accepted Chrome/WebKit resource run is repeated.

## Native receiving-memory observations

The [frozen receiving report](RX-4002-memory-restore.json) records two separate preparation processes and six fresh receiving processes: three each at 1,000 and 10,000 source-phrase records. All preparations and receiving operations pass their own checks. Native restore reports `reindexed: false`, origin revisions 4/40 and receiving revision 2; independently calculated total/selective/phrase counts and removal of the preexisting receiver record pass. Each receiver returns an actual Node inspector allocation profile, whole-process readings and observed collection of every listed initial/prior/restored root/component witness. Known strong controls survive and released controls collect under the documented forced-GC policy.

The **frozen wrapper aggregate is Fail / exit1**. Its final preservation inventory mistakenly included the same newly opened, redirected capture log, which legitimately grew from the empty-file digest during execution. This is an evidence-runner defect, separate from the eight successful child-process outcomes. The raw report/log are preserved. The [offline reconciliation](RX-4002-memory-restore-reconciliation.json) checks all 16 true prior artifacts, eight executed source bindings, 208 production files and the actual producer/receiver input/PID/report identities; a future-run inventory repair is separately tested. No workload is rerun and no failed aggregate is rewritten as Pass.

The measured path is exact-local trusted Node native restore under unchanged qualification and limits, with a held encoding string and a one-record prior receiver. Imports/harness and positive controls precede baselines; profile sampling starts around the public restore and stops before semantic checks. Statistical profiler frame groups are allocating-frame observations, not exclusive source/index/side ownership. Five-millisecond event-loop polling can miss blocking/transient highs; sampled process maxima are lower bounds, not isolated decode/staging peaks. Releasing an input binding does not prove that every string is collected, and listed WeakRefs do not establish general leak freedom. Source-reindex receiving, exact mutation/encoder/decoder peaks and browser/main/worker/transport measurements remain unobserved. The [detailed method and raw-derived tables](RX-4002-memory-restore.md) preserve every repetition, baseline, profiler meaning and cleanup limitation. The [executed wrapper archive](RX-4002-memory-restore-executed-run.mjs) retains the actual pre-repair source; seven original focused tests and two scratch repair tests pass separately.

## Acceptance boundary

AC01 gains the finite installed engine/storage/resource configurations alongside the prior versioned UI observations. AC05 gains actual admitted 1,000/10,000 configurations in the two installed apps. These observations stay separate from historical Chrome 154, WebKit 26.5 and patched Firefox launch failures; no historical row is overwritten or merged into a fictional single run.

AC02 exact-tool speech/AT, AC04 physical presentation/input and real OS IME remain **Blocked / not observed**. An optional human-observation request received no response during this run. The [human checklist](../accessibility/RX-4002-manual-observations.md) retains the exact required settings, announcements, focus, display and input fields. AX text and automated key events do not fill them. AC03 still needs collector-accurate/exclusive component retention, mutation/encoder peaks and browser/main/worker/transport observations. Those are missing scoped instrumentation/observations, not a newly diagnosed browser or environment defect. No narrower claim or acceptance waiver is proposed under AC06/AC07.

## Commands and review

`npm ci` passed ([actual log](RX-4002-installed-matrix-ci.log)) with the existing esbuild script-allowlist warning; the approved baseline `npm run check` passed 557/557 (491+15+24+26+1), zero failures/cancellations/skips ([baseline log](RX-4002-installed-matrix-baseline.log)). The [11 focused reporting tests](RX-4002-installed-matrix-protocol-tests.log) passed. The fixture started after the baseline and source freeze:

```sh
RAVELDEX_QUALIFICATION_BROWSER_REPORT=docs/evidence/RX-4002-installed-matrix-package.json node scripts/qualify-browsers.mjs --serve
```

Resource cases execute serially, with no browser/memory workload overlap. Native controls require no developer console. After all task tabs were closed and original pages verified, the task-owned serve process stopped by SIGINT with exit0. The journal was then copied byte-for-byte from the closed local capture into this repository. No remote write, push, publication, tag/release or N5 activation occurred. Preparation, observations, checks and review remain independently identified.

## Independent native UI and review

The reviewer separately refreshed the nine-record `/ui` and three-record `/worker` routes in the current Firefox 157 app: red7 across three pages; Guide5 across two pages; native All clearing and page reset with reported Category focus; blue/Beta1; Inspector revision1/Escape/opener focus; injected `WORK_LIMIT_EXCEEDED` and keyboard Retry recovery; empty results; authored fallback/remount9; and terminated-worker generic `INTERNAL_ERROR` followed by explicit source recovery and blue/Beta1. The [curated actual reviewer action/AX record](RX-4002-installed-matrix-review-observations.json) preserves those observations and original New Tab restoration. Reported Retry focus remains on its intentionally mounted `aria-disabled` control after success. Exact transport/disposal details, physical input, heard speech and actual OS IME were not observed in that native probe.

The [independent review](RX-4002-installed-matrix-review.md) is **Ready with follow-ups** for these bounded artifacts and **Unable to verify / Blocked** for full RX-4002. It independently recomputes browser memberships/numerical/spans/storage/resource outcomes, source/package identities, prior evidence and unchanged contracts. It separately reconciles all receiving-process profiles, samples, actual input documents, semantic results and object/control witnesses while retaining the frozen wrapper Fail. Full RX-4002 remains Blocked on AC02/03/04; no native runtime defect or incompatible public contract is introduced.

## Final verification and next work

The final approved `npm run check` passed **577/577** (511 package/core/evaluation/memory-method/reporting tests, 15 UI, 24 worker, 26 IndexedDB and one migration-browser scenario), with zero failed/cancelled/skipped ([actual final log](RX-4002-installed-matrix-final-check.log)). It includes all 11 new reporting tests and all nine restore/capture tests through the existing globs; package scripts and metadata are unchanged. The check ran after source freeze and offline reconciliation. Only actual result references and documentation/planner synchronization changed afterward; final lightweight checks cover those documents.

`npm run docs:generate`, [handoff status](RX-4002-installed-matrix-handoff-status.log), [next](RX-4002-installed-matrix-handoff-next.log) and local-only [tracking preview](RX-4002-installed-matrix-tracking-preview.log) passed. Preview makes no network request. The planner has 19/21 release tasks done, zero ready, RX-4002 Blocked and RX-4003 waiting; all ten N5 tasks remain deferred. Final documentation/planner/whitespace command output is retained separately in the [synchronization log](RX-4002-installed-matrix-sync.log).

Next work remains the exact human AT/settings/announcements/focus and physical display/input/OS IME session, plus the unobserved scoped memory measurements listed above. No new dependency-ready implementation task exists while those gates remain. Production code/public contracts, dependencies, package metadata, analyzer/scorer, resource ceilings and snapshot qualification policy are unchanged. The unchanged 15 KiB core target miss is still disclosed in the main task evidence.
