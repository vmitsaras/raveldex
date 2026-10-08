# RX-3004 independent review

Date: 2026-10-08, Europe/Berlin. Verdict: **Ready with follow-ups** for the bounded companion source conversion/comparator slice. No confirmed implementation blocker remains. This is not publication or N4 release qualification.

Review was independent of the implementation/test authors. The reviewer read the actual repository instructions, selected task and contracts, native source, migration guide, examples, comparator and primary tests. The companion was inspected read-only at clean MIT commit `5f334a8ca4f7d9d95b6b731ac539f4b1dda302cb`: codec, admission/counting, actual analyzer, MiniSearch binding/scoring policy, package/license/notices and historical verification records. No other repository was modified and no package, release, push or remote mutation occurred.

## Accepted candidate and method

The reviewed installed package is `@vmitsaras/raveldex@0.0.0`, private and with zero runtime dependencies. Its actual tarball SHA-256 is `08181a3b912062afbc6fa2a1fa510cd19daf819ac989f32c8fc1e8fb174df31f`, measured directly with `shasum -a 256` and matching the [primary packed record](RX-3004-browser.json). The isolated installation is `/private/var/folders/m4/7qvldjl917j4nwbkw7bxmn_m0000gn/T/raveldex-core-consumer-wZL773`; it is a tarball installation, not a checkout import.

[Fresh probe source](RX-3004-review-probe.mjs) and [raw observations](RX-3004-review-probe.json) contain 13 independent passing checks. Inputs and literal complete memberships were handwritten independently, with no primary migration fixture, native tokenizer/scorer or primary expected-result helper imported. An additional hand canonical envelope was accepted by the actual companion's public `restoreLocalSearch` as well as the packed converter. Public companion `createLocalSearch`/`addAll`/`exportSnapshot` produced a fresh representative source envelope for the remaining checks.

Observed environment: macOS 27.0.1 build 26A434, Darwin 27.0.0 arm64; Node v24.21.0, V8 13.6.233.17-node.53, ICU 78.3, Unicode 17.0; esbuild 0.28.2; actual headless Chrome 154.0.8037.98. Browser automation used the existing pinned Playwright Core tooling.

Command:

```sh
node docs/evidence/RX-3004-review-probe.mjs /private/var/folders/m4/7qvldjl917j4nwbkw7bxmn_m0000gn/T/raveldex-core-consumer-wZL773 /Users/vasilis/Documents/GitHub/LocalSearch --browser
```

The first sandboxed run passed the 12 nonbrowser checks but could not listen on localhost (`listen EPERM: operation not permitted 127.0.0.1`). That was an environment restriction. The same command in the authorized localhost/Chrome test context passed **13/13**, including actual same-origin IndexedDB save/load/erase. No production change was made to address the restriction. `node --check docs/evidence/RX-3004-review-probe.mjs` and `git diff --check` also passed.

## Acceptance results

| Criterion | Result and independent evidence |
| --- | --- |
| RX-3004-AC01 | **Pass.** [Guide](../migration/LOCALSEARCH.md) and source agree on flat-to-native schema/records, legacy projection as separate information, missing/empty fields, positive-zero native metadata, separate origin/source lineage, intersection limits, explicit new-owner rebuild and required optional providers. Actual NFC/leading-mark analyzer and MiniSearch distinct-length/BM25 policy were checked against source. Native NFKC/occurrence lengths are explicit differences. |
| RX-3004-AC02 | **Pass.** Actual companion export maps exactly to independently authored native records, preserving original scalar/array values and empty value positions. Returned configuration/records/lineage are deeply frozen. Caller byte mutation while SHA-256 is pending cannot affect conversion; own byte/length/serialization/iterator getters were never invoked. Eleven corrupt/incompatible/opaque/noncanonical cases and seven native-intersection cases reject with sanitized typed diagnostics. Existing native results/revision remain unchanged. A converted 257-record plan is explicitly refused as one native batch, preserves the prior revision, and succeeds in bounded chunks. |
| RX-3004-AC03 | **Pass.** Independent installed browser bundle graphs contain 31 core-only inputs and 13 migration inputs, counting their separate entry fixture. Core excludes migration, optional add-ons/adapters and every foreign engine. Migration contains native validation plus the isolated legacy source codec, with no comparator, foreign engine or external runtime import. No MiniSearch dependency/export is present. The copied MIT notice is byte-identical to the audited companion `LICENSE`. |
| RX-3004-AC04 | **Pass.** Repository-level comparator declares pinned foreign engine/model, historical analyzer, capacity, source phrase semantics, upstream noninterruptible search and unavailable numerical decomposition; it is outside native source/build/package. Actual companion `explain` reports `upstream-not-exposed`. Neither converter nor comparator produces native numerical facts for foreign scores. |
| RX-3004-AC05 | **Pass.** Nine literal complete native memberships/results and three update/restore comparisons agree with separately constructed expected native input. Leading-mark and fullwidth differences are checked explicitly. Hand arithmetic gives native scores `a=0.6780380225184384`, `b=0.45450900410576633` and foreign scores `a=0.7546038168040831`, `b=0.8062769440928227`; native order `[a,b]` and foreign `[b,a]` are expected different-model outcomes, not conversion defects. Actual browser conversion, update, persistence, fresh-owner reload and erase also passed. The [primary comparison](RX-3004-comparison.json) separately asserts literal memberships for each ranking row and records its expected normalization/ranking differences. |
| RX-3004-AC06 | **Pass.** All 344 tracked companion files were byte-identical before/after independent probes, including 80 tracked `docs/verification/` records; its clean commit remained unchanged. [Full provenance audit](RX-3004-provenance.json) also records the original license/source identities and broader historical file set. Historical companion reports remain in their own repository with their original model, environment and limitations. New native claims cite current native observations. No old browser/AT/benchmark result was inherited as a native pass. |

The installed example and migration declarations were also reviewed against public exports and the primary [packed record](RX-3004-browser.json): actual executable public example, DOM/Node-free declaration check with readonly negative expectations, guarded import-time host reads and excluded private/foreign paths passed there. The independent run separately repeats guarded bare public imports/private exclusions and native persistence behavior, while source inspection verifies the guide's public method names and ownership flow.

## Findings resolved before acceptance

1. Fixture provenance originally searched the companion's nonexistent `docs/evidence/` directory, producing an empty preservation list. It now records tracked `docs/verification/` files; actual preservation was rechecked against 80 records and the full companion tree.
2. The native expected record used legacy `-0` although native scalar admission canonicalizes it to `0`. The authored native expectation now states positive zero, while the legacy snapshot still preserves canonical `-0` bytes.
3. The foreign comparison previously classified any membership mismatch as expected normalization. It now checks literal per-fixture/per-query memberships first and recognizes only its explicitly declared `car`/`unicode` normalization branch. This prevents an unexpected conversion defect from being labeled an expected rank/model change.

These were evidence/fixture defects. The independent review found no required runtime patch.

## Identity stability and limits

The accepted probes verified unchanged before/after SHA-256 records for 113 candidate source/guide/comparator/example files and 209 installed runtime/declaration/license/manifest files. Aggregate identities over the recorded absolute-path/SHA arrays are respectively `cb6fb6f8d7f452ef91c3d2916de2f7a07db0077b7aa668a736c330131fb68f2e` and `26d23246c98e2516234c2d642e1d248b8d22ae5bcadb1b387a6952e0e0307193`. The raw report contains every individual identity. Planner/context/handoff/evidence synchronization is outside this runtime identity set. Final whole-project checks and final tarball identity reconciliation are the parent's separate completion step; a changed production/package/guide candidate requires reconciliation before reusing this verdict.

Follow-ups remain the already separate N4 qualification: broad host/Unicode/relevance/cost support, physical latency and retained/peak heap. In particular, the bounded 32 MiB converter includes synchronous decode/preflight/parse/canonicalization/native validation and has no cancellation/deadline guarantee. No interactive-latency or process-memory claim is established here. Checksums are accidental-corruption detection, not sender authentication. A sequence of native batches is not a whole-migration transaction; applications publish a fresh owner only after a complete successful rebuild. Stricter/optional-provider runtime work or admission bounds may still refuse convertible data, as documented.

UI/AT, cross-browser/host portability, quota/power-loss/eviction durability and remote CI were not run by this reviewer and are not required new observations for the bounded RX-3004 source conversion slice. The unchanged core gzip planning-target miss remains visible in the existing native evidence and is not waived by migration checks.
