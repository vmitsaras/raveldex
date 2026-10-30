# Completed N5 — remote CI verification

Date: 2026-10-30. Outcome: **Pass**. The owner requested remote verification of `codex/rx-a100-astro` and all ten completed N5 features, fixes for actual failures, and no publication. This is an evidence follow-up; all 31 canonical tasks remain done.

[Successful run 41007010791](https://github.com/vmitsaras/raveldex/actions/runs/41007010791) tests exact source **`18e610ef15be2c4fa68aeb0f90ebd1dfb2fe5698`**, descended from completed implementation `a2728da`. The later evidence/documentation/auditor commit is separate from that tested revision. The registered `Repository checks` workflow was dispatched on the feature branch; no main merge or roadmap-sync workflow was requested or performed.

| Runner | Tests | Candidate and separate packages |
| --- | --- | --- |
| Node 22.23.4 / npm 10.9.9 / Ubuntu 26.04 x64 | 860 Pass; zero failures, cancellations, skips or TODOs | Pass |
| Node 24.22.1 / npm 11.19.1 / Ubuntu 26.04 x64 | 860 Pass; zero failures, cancellations, skips or TODOs | Pass |

Each actual log has six batches: **776 + 30 + 24 + 26 + 1 + 3**. The first batch includes every N5 runtime/consumer suite; subsequent batches cover DOM UI, workers, IndexedDB, packed migration, and the genuine paired-package Astro consumer. CI also passes type checking, generated documentation/local links, planner checks, candidate import/declaration/documentation checks, and local-only tracking preview.

## Actual artifacts and browser behavior

The original [Node 22 ZIP](RX-N5-remote-ci-20261030-node22.zip) and [Node 24 ZIP](RX-N5-remote-ci-20261030-node24.zip) match their GitHub artifact digests, have valid CRCs, and contain eleven safe, unique members each. Preparation log/report hashes, package digests, SHA-512 integrity, installed-file identities and package guards were verified. [Machine-readable evidence](RX-N5-remote-ci-20261030.json) records provider identities, environments, counts, package hashes and closed comparisons.

Both runners reproduce the accepted contents exactly: **310 core-package members, including 280 production files; 15 separate Astro members; and 5 separate English members**. These are compared against the accepted RX-A100 core/Astro archives and RX-A040 English archive. Compressed tarball bytes differ from the local archives; every unpacked member agrees. All packages remain private `0.1.0-rc.0` with no runtime dependencies; explicit core/framework peer contracts remain unchanged.

Each runner uses Playwright Chromium **149.0.7827.55** and Astro **7.3.2**, builds actual `.astro` sites at `/` and `/docs/`, and verifies **42 browser plus 84 Node source/native complete-result comparisons**. Actual navigation, deployment-base URLs, excluded rendered content, lazy result-data loading, error recovery, Open/Unload cleanup, native UI semantics/keyboard behavior and two axe scans with zero violations are recorded. These are finite automated observations, without a new speech or physical-input claim.

## Failures preserved and corrected

1. Preflight review found that the Astro harness always launched installed Chrome although CI installs Chromium. It now honors the existing validated `RAVELDEX_CANDIDATE_BROWSER` selector, retains Chrome as the local default, and records the actual channel. The focused Chromium replay passes 3/3.
2. The first workflow edit incorrectly used `runner.temp` in job-level `env`. GitHub refused manual dispatch with HTTP 422 and created [zero-job workflow-validation failure 41005925739](https://github.com/vmitsaras/raveldex/actions/runs/41005925739) at `441e0ae`. Moving the path to step-level `env` corrected the issue. No tests ran in that validation failure.
3. [First actual matrix 41005972182](https://github.com/vmitsaras/raveldex/actions/runs/41005972182), at `991c556`, failed. Node 24 passed 775/776 in the first batch: a watchdog fixture could receive SIGTERM before Node installed its handler within the test's 100ms allowance. The test now permits 2000ms, asserts the child's `ready` marker, and retains required SIGKILL/forced-kill assertions within a 5000ms observation bound. A deterministic 250ms startup-delay probe reproduces the original early-termination path and corrected forced-kill path; focused checks pass 7/7. The actual watchdog implementation, production limits and engine deadlines are unchanged. Later Node 24 batches were not run in that attempt.
4. Node 22 passed the first five batches (857 tests), then all three Astro tests failed in shared setup because the harness compared archived macOS/Node 24 gzip bytes against Linux output: 20,351 versus 20,304 bytes. The corrected check installs the hash-bound accepted RX-A090 tarball offline and bundles/compresses it on the same runtime. It verifies the historical raw bundle identity and all four same-runtime raw/gzip identities. The original measurement remains unchanged; focused Astro checks pass 3/3.

The [original failed Node 22 ZIP](RX-N5-remote-ci-20261030-failed-node22.zip) and [failed Node 24 ZIP](RX-N5-remote-ci-20261030-failed-node24.zip) preserve those exact outcomes. No failed candidate was packed. The successful second matrix reruns both jobs on the corrected source, without skipping tests or changing product behavior.

The named core bundle remains **69,483 minified bytes**, SHA-256 `b2985d83d309f0d138af626b21037181c6db750bbb9df9f2029681383dc5ac74`. Both Linux runtimes record 20,351 gzip bytes, equal to their reconstructed accepted baseline. The unchanged 15 KiB target miss remains disclosed; this is neither a source-size regression nor a size improvement claim.

## Independent review and reproduction

[Independent audit](RX-N5-remote-ci-20261030-review.json): **Ready, zero mandatory findings**. It reads original provider metadata, logs and ZIPs; reconstructs expected package contents directly from accepted tarballs; verifies both 860-test outcomes and all artifact/report bindings; and independently inspects the exact Git diff. Only four workflow/test files changed from completed implementation `a2728da` to tested source `18e610e`. Production sources, package metadata and lockfile are unchanged. Earlier independent workflow/fix reviews and local calibration logs remain in the [raw archive](RX-N5-remote-ci-20261030-raw.tar.gz).

The raw archive has 72 data members plus `raw-manifest.json`, which lists each member's length and SHA-256. It includes original ZIPs, extracted reports/logs, provider run/job/artifact metadata, source patches, local replays and audit tools. Archive and standalone-review hashes are closed by the machine-readable evidence. Provider artifacts expire; these committed original bytes preserve the record.

To reproduce the audit, safely extract the raw archive to a new directory, verify `raw-manifest.json`, then run from this repository:

```sh
python3 test/reviews/rx-n5-remote-ci.py /absolute/path/to/extracted-raw /absolute/path/to/raveldex
```

The auditor reads local raw files and Git history, performs no network/build/install, and writes only a fresh `artifact-review.json` in the extraction directory. Its timestamp and source-path bindings can differ; reproduced claims and artifact checks must agree. The parent actually replayed this audit from a fresh archive extraction: Ready, both nodes, zero findings or pending checks. [Synchronization log](RX-N5-remote-ci-20261030-sync.log) records that replay and six successful documentation/planner/local-preview checks.

## Boundaries and next work

The recorded repository remains private. Remote `main` stays at `1d52c71ba464958d155463d8a22ed62af2b4ea9a`; feature source is uploaded without history rewriting. The existing sparse checkout still omits only archival RX-4002 raw GC streams, without removing test inputs or required evidence targets. Those original memory measurements were not replayed.

No fresh Safari/Firefox, physical AT/input, cross-host native-snapshot, heap/allocation, transport-copy, paint or latency qualification follows from this matrix. Existing relevance, resource-refusal, size and exact-tool AT limitations remain. There are no blocked CI checks and no remaining implementation task. **No publication, tag, release, main merge, tracking sync or visibility change was performed.** Publication and any main merge remain separate owner decisions.
