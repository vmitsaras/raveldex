# Public documentation implementation review — 2026-10-30

**Documentation preparation: Pass. Publication: not performed or authorized.** Base checkout: `87fb5c3` (clean main, one local commit ahead of origin before this work). All 31 task states, runtime source, specifications, package manifests/lockfile, private guards, exports, dependencies, workflows, frozen corpora/provenance and previous evidence remain unchanged. No remote CI was run for these documentation bytes; existing main CI remains bound to `3407c2a`.

## Documentation map and changes

| Reader intent | Primary owner | Result |
| --- | --- | --- |
| Evaluate and run a minimal query | [README](../../README.md) | Private tarball installation, executable core example, optional-cost routing and limitations. |
| Prepare/install matching packages | [Preparation](../release/PREPARATION.md) | Exact commands, Node floors, browser prerequisites, fresh directories, stable compiler output and peers. |
| Find imports/features | [API index](../api/README.md) | Complete export map and dedicated guides; no invented docs export or root CSS entry. |
| Integrate native UI and hosts | [Host guide](../api/HOSTS.md) | Ownership/API, keyboard/dialog/status/composition and five public CSS properties. |
| Understand support | [Support](../support/RX-4003.md) | Recorded host/AT/input/memory scopes and retained limitations. |
| Run repository examples | [Example index](../../examples/README.md) | Current CLI/browser/Astro/migration routes; complete isolated Astro build/preview steps. |
| Read release notes | [Changelog](../../CHANGELOG.md) | One Unreleased draft; no issued candidate release heading. |
| Maintain chronology | [History archive](../history/CANDIDATE_HISTORY.md) | Original snapshots with Git/blob identities, relocated links and historical scope; excluded from packages. |
| Decide publication | [Publication status](../release/PUBLICATION_STATUS.md) | Remaining version/package/access choices and release-verification work. |

Current guides no longer call implemented infix/proximity/query syntax deferred or present selection-time CI warnings as current state. Links to unshipped specifications now use explicit repository URLs with access requirements. Context/handoff link the archive instead of repeating candidate histories. No site, deployment, runtime behavior or new public API was added. Sitemap/canonical/indexing/traffic review is not applicable to this repository-only slice.

## Verification actually run

| Check | Result |
| --- | --- |
| `npm ci --cache /tmp/raveldex-docs-npm-cache --no-audit --no-fund` | Pass; 193 locked packages. npm reported blocked esbuild/fsevents install scripts; subsequent checks passed without changing script approvals. |
| `npm run docs:check` | Pass; generated roadmap synchronized and local Markdown file targets resolve. |
| `npm run candidate:prepare -- --output NEW_DIRECTORY` | Pass: full check/typecheck/build, installed documentation consumers, then closed private core pack verification. |
| Test summaries | **860/860**, batches 776 + 30 + 24 + 26 + 1 + 3; zero failures/cancellations/skips/TODOs. |
| Direct English/Astro pack scripts | Pass, using the same verified compiler output without rebuilding. |
| Genuine packed Astro fixture | Pass: Astro 7.3.2 root and `/docs/` builds, 42 browser and 84 Node source/native independent comparisons. |
| Fresh consumers following documented commands | Pass: exact README core code returns revision 1 and one `guide:updates` hit; exact separate English README code prints `guide`. |
| Fresh isolated Astro build/preview following final instructions | Pass at `/` and `/docs/`: three records, atomic total 1, excluded draft total 0, actual page navigation, Inspector Close focus/Escape restoration, error/retry, authored fallback, unload and native-browser `UNQUALIFIED_PROFILE` refusal. No page errors; both previews stopped through root-scoped CLI commands. |
| Separate archive/report/source audit | Pass: closed digests/inventories agree, final packaged Markdown matches checkout, protected paths unchanged and accepted production members byte-identical. |
| `git diff --check` / planner | Pass; active backlog complete and no task state changed. |

Local runtime: Node **24.21.0**, npm **12.2.0**, Darwin arm64, V8 **13.6.233.17-node.53**, ICU **78.3**, Unicode **17.0**, zlib **1.2.12**. Actual Astro observations record installed **Chrome 156.0.8078.74**, channel `chrome`. These automated finite checks establish no new human AT, physical input, all-browser, allocation/copy or latency qualification.

Full preparation preceded the final repository-only Astro README path/preview refinements. Those refinements were then followed successfully in fresh consumers and are absent from all three package payloads. Final CLI/contribution wording cleanups also stay outside the payload; their text/hashes are preserved as a supplement in the machine review. The artifact audit confirms every final packaged Markdown byte still matches the verified tarballs; no changed shipped byte inherits a stale report.

## Links and failures

- Current documentation: **160 local links/fragments across 29 files**, Pass. Extracted core: **142 across 22 files**, Pass; each separate package's single README also passes.
- The final maintainer/history audit passes **338 links across 33 files**, including this review and archive navigation.
- Four calibrated controls refuse absent roots, missing files and missing fragments, and resolve duplicate heading suffixes. The one-off auditor uses installed `github-slugger`; no dependency was added. Scope is inline Markdown outside fenced code, GitHub heading slugs and explicit IDs, not an exhaustive renderer/crawler.
- **29 external destinations** received anonymous read-only GETs: **4 public Pass, 25 private GitHub access-required, zero confirmed missing or unrelated network failures**. Fresh connected metadata confirms privacy; linked blob paths exist locally. The physical-session fragment was checked against its local heading. Anonymous HTTP is not authenticated file-content verification.

Initial failures remain preserved:

1. A macOS temporary path through `/var` disagreed with Astro's `/private/var` compiler identity. The documented `pwd -P` step repairs the setup; no runtime change.
2. Astro's agent detection started a background preview while the harness expected foreground lifetime. Instructions now explicitly start background previews and stop the selected fixture root, using the reported port. The earlier owned preview was stopped separately; no unrelated server was replaced.
3. Available Python lacked the extraction filter keyword. Initial empty-root link reports are **invalid**, not acceptance evidence. Explicit path/type-safe extraction, a required README guard and calibrated audits now pass. Invalid reports retain explicit names in raw evidence.

## Exact private artifacts and evidence

| Package | Bytes / members | SHA-256 |
| --- | --- | --- |
| Core | 227,286 / 311 | `72ef3beea8e6f42c19a92a216a55b647677c348f0e97c4237037179fa3b0672f` |
| English | 5,162 / 5 | `8e466e73ff3b4ac68585c6c612c03e4b8b13ed227ee3dbaa9c83f7840a9df419` |
| Astro | 14,718 / 15 | `ea3d78cc4082d20f26c54260dd3ecd0eddd6f0344fc4c6325ae752198ed94207` |

The **280 core, two standalone English and 12 standalone Astro production members**, package metadata and licenses match accepted baselines byte-for-byte. Changes are documentation only. History, review records, source example directories and raw evidence remain outside npm payloads.

[Machine review](DOCUMENTATION_REVIEW.json) records artifact/member/source identities. [Raw evidence](../evidence/PUBLIC-DOCS-20261030-raw.tar.gz) is 489,047 bytes, SHA-256 `e356e1b63cd77cb48c436bc8885893d823ec0341cba7758bc493c87c1872b77f`. All 67 data-member hashes and its manifest were verified. It contains the three packages/reports, full check log, actual Astro observations, final public documentation snapshots, audit helpers/results and failed attempts; no dependencies/caches or large prior evidence directory.

Extract to a fresh directory using path/type-safe extraction and verify `manifest.json`. With this checkout and locked tooling, `python3 EXTRACTED/artifact-audit.py REPOSITORY EXTRACTED` rechecks retained artifacts/reports without building, installing or using the network. Instruction helpers are separate; inspect them before rerunning because they install fresh temporary consumers and start local previews.

## Remaining boundary

Documentation preparation is complete for private evaluation, not publication. Final version/package selection, public access, registry rights/provenance, release-verification tooling and changed-metadata artifact/remote CI checks remain separate. Relevance/size/work/deadline/native/AT limits stay disclosed. No task is reopened and nothing is published, pushed, tagged, merged or deployed by this slice.
