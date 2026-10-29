# Codex handoff

## Current boundary

Raveldex follows the adopted native TypeScript direction. N0–N3 implementation and RX-4001/RX-4002 evaluation/qualification have evidence; RX-4003 verifies the private `0.1.0-rc.0` candidate with 625 passing checks and independent review Ready with follow-ups. All 21 active N0–N4 tasks are complete. The owner explicitly selected and verified RX-A010 bounded typo tolerance, RX-A020 dictionary-backed suggestions and RX-A030 directional one-step synonyms; RX-A040 is verified with the owner-selected English analyzer; RX-A050 is now explicitly selected and verified locally; RX-A060 is now explicitly selected and verified locally; RX-A070 is now explicitly selected and verified locally; RX-A080 is now explicitly selected and verified locally; RX-A090 is now explicitly selected and verified locally; RX-A100 is now explicitly selected and verified locally; all ten optional tasks are complete. See [candidate acceptance](docs/evidence/RX-4003.md). Read `AGENTS.md`, `PROJECT_CONTEXT.md`, the canonical task card and its evidence before changing state. The planner determines live task availability.

```sh
npm ci
npm run check
npm run handoff:status
npm run handoff:next
```

The canonical state is `docs/planning/roadmap.json`. Run `npm run docs:generate` after manifest changes. A task is done only with actual acceptance evidence and required independent review. Never reset a completed task to manufacture work. The completed active N0–N4 backlog is a legitimate terminal state; N5 enhancements remain deferred unless explicitly selected.

## Historical optional typo, suggestion, synonym and language slices

RX-A010 is verified on `codex/rx-a010-typo`; [acceptance evidence](docs/evidence/RX-A010.md) records 642 passing checks and private tarball verification. The [adopted typo contract](docs/specs/TYPO_TOLERANCE.md) adds `/addons/typo`, normalized Unicode OSA distance one with exact-first selection, at most 15 non-exact alternatives and explicit weighted required groups. Core/default exact/prefix/phrase queries remain strict. The optional slice changes code after the qualified private candidate; previous remote runs do not verify this changed tree. RX-A020 now adds independently requested token completions under [its adopted contract](docs/specs/SUGGESTIONS.md), without query/input/UI changes. [Its acceptance evidence](docs/evidence/RX-A020.md) records 657 passing checks, packed/minified/Node-worker consumers, complete logical cost measurements and independent review Ready with follow-ups; it is verified locally on `codex/rx-a020-suggestions`. These later optional slices do not inherit remote verification from the original candidate. RX-A030 now explicitly adds [directional one-step synonyms](docs/specs/SYNONYMS.md) on `codex/rx-a030-synonyms`; [its acceptance evidence](docs/evidence/RX-A030.md) records 673 passing full checks, frozen recall/negative judgments, independent source/numerical/probe results, installed/minified/Node-worker consumers, byte-current private package and independent review Ready with follow-ups. RX-A030 is verified locally; remote CI is not run for this changed tree. RX-A040 now adds the owner-selected [English analyzer](docs/specs/ENGLISH_ANALYZER.md) on `codex/rx-a040-english-analyzer`. [Its acceptance evidence](docs/evidence/RX-A040.md) records 698 passing full checks, independently frozen real-document morphology results with one retained failed negative-intent goal, original-span/phrase and worker/snapshot parity, a verified private tarball and two Ready-with-follow-ups independent reviews. An actual independently installable private `@vmitsaras/raveldex-english` tarball, public peer declarations and offline paired consumers close the separate-installation requirement; use `npm run language:pack -- --output NEW_DIRECTORY` to prepare it without publishing. It is verified locally; earlier remote CI does not verify this optional tree. At that historical boundary four remaining N5 tasks were deferred. The current boundary above supersedes that count; publication remains excluded.

## Historical original-candidate remote CI

[Run 40771652630](https://github.com/vmitsaras/raveldex/actions/runs/40771652630) passes all 625 tests plus candidate preparation on each of Node 22.23.4 and 24.22.1 / Ubuntu 26.04 x64, on exact source `9f22e37`. [Remote evidence](docs/evidence/RX-4003-remote-ci-20261028.md) preserves both downloaded artifacts and their closed identities. All 228 unpacked package members match the original private candidate. The tested source is distinguished from the later documentation-only evidence commit. Keep the package private; publication still needs a separate owner instruction and revalidation after any release-artifact change.

## Candidate preparation

```sh
npm run candidate:prepare -- --output /tmp/raveldex-candidate-review
```

Use a new directory with an existing parent. Preparation runs the full project check, then packs/installs and verifies the exact built candidate, declarations/import isolation and executable public documentation. It preserves the tarball, closed check log and identity report. `candidate:check` is the focused build/package check; it does not substitute for full preparation. See [preparation](docs/release/PREPARATION.md), [candidate scope](docs/release/CANDIDATE.md), [compatibility](docs/release/COMPATIBILITY.md) and [public API](docs/api/README.md).

The package remains private. Candidate preparation and its manual read-only workflow do not publish, tag, create a release, use release credentials, alter visibility or activate N5. A separate owner publication instruction must cover that action, including a newly reviewed artifact after removing the private guard or changing metadata.

## Preserve the verified boundaries

- Core owns indexing, retrieval, native BM25, atomic writes and execution. No MiniSearch or another search engine belongs beneath it. Compatibility/conversion and comparison remain isolated.
- Core alone retains no original source, positions, offsets, DOM, worker or storage side state. Optional public subpaths and CSS remain independent choices.
- Exact totals, deterministic ranking/order, immutable ownership, explicit capability failures, coherent revisions and typed resource failures remain contractual.
- Native snapshots require the application's exact declared Node qualification. Browser/worker recovery uses complete source. Unknown mutation outcomes do not prove rollback or authorize blind retry.
- RX-4001 relevance failures and the unchanged 15 KiB gzip target miss remain disclosed. Admission through 10,000 records is not a universal capacity or completion guarantee.
- RX-4002 records finite browser/AT/physical sessions, retained-state/process distinctions, managed occupied-operation windows and repeated native wire requested-capacity peaks. It does not claim every VM byte, complete receiver-copy lifetime, physical/global peaks or default-runtime latency. Invalid recordings, typed deadlines, prior failures and source preservation exceptions remain visible. Accepted human observations need no repeat merely because work continues.

The independent candidate verdict and actual commands/artifact identities belong in `docs/evidence/RX-4003.md` and its review/report records. Publication remains an owner decision after release-track completion.

## Tracking and future work

`npm run tracking:preview` is local and makes no network requests. The committed main-branch workflow mirrors accepted task status to GitHub. `tracking:sync` is a remote issue/milestone write requiring an authorized token/environment; local task completion does not itself synchronize GitHub.

For an explicitly selected later change, inspect existing reality, implement one bounded slice, verify actual behavior, record evidence and independent review where required, synchronize affected docs/manifest and commit the work. Distinguish a specification decision, product defect, instrumentation refusal and environment failure. Do not reopen the companion decision or silently broaden support/resource claims.

## Historical selected identifier continuation

The owner selected RX-A050 and explicitly approved ordinary component matching with original-only strict phrases. Follow the [identifier contract](docs/specs/IDENTIFIER_ANALYSIS.md) on `codex/rx-a050-identifiers`. [Acceptance](docs/evidence/RX-A050.md) records 729 passing full checks, the actual 265-file private package and two independent Ready-with-follow-ups reviews with no mandatory findings. It is verified locally; earlier remote CI does not verify this tree. Preserve original names/spans, query grouping, v1 basic/English semantics, tagged v2 positions and exact worker/snapshot identities. Four remaining N5 tasks stay deferred. No remote write or publication is authorized.

## Historical selected literal continuation

The owner selected RX-A060 while excluding publication. Follow [literal matching](docs/specs/LITERAL_MATCHING.md) on `codex/rx-a060-literal`: raw case-sensitive source substrings, zero lexical score, separate bounded original ranges and exact declared source requirements. [Acceptance](docs/evidence/RX-A060.md) records 755 passing full checks, a byte-current 278-file private tarball and two independent Ready-with-follow-ups reviews with no mandatory findings. It is verified locally; prior remote CI does not verify this tree. Preserve ordinary queries/analyzers/source codecs and the retained historical failures. Four other N5 tasks stay deferred; no remote write or publication is authorized.

## Historical selected ordered proximity continuation

The owner selected RX-A070 while excluding publication. Follow [ordered proximity](docs/specs/ORDERED_PROXIMITY.md) on `codex/rx-a070-proximity`: ordered original-token alternative groups, gap bounded per adjacent pair, exact field/value boundaries and native BM25 without a distance bonus. Require separately selected positions; zero-gap singleton groups preserve strict-phrase eligibility/scores. No ranges/snippets projection is included for ordered leaves; requests fail explicitly. [Acceptance](docs/evidence/RX-A070.md) records 786 passing full checks, a byte-current 287-member private tarball, two independent Ready-with-follow-ups reviews and an artifact audit with no mandatory findings. RX-A070 is verified locally; historical remote CI does not verify this tree. Three other optional tasks remain deferred; no push, merge, remote CI or publication is authorized.

## Historical selected query syntax continuation

The owner selected RX-A080 while excluding publication. Follow [bounded query syntax](docs/specs/QUERY_SYNTAX.md) on `codex/rx-a080-query-syntax`: explicit Boolean operators, text-field scopes, strict-phrase quotes, prefix leaves and escapes compiled to existing raw native trees. No evaluator/core/automatic UI mode is added. Keep parsing admission/analysis separate from destination live provider/revision checks; malformed syntax has fixed safe UTF-16 diagnostics with no fallback. [Acceptance](docs/evidence/RX-A080.md) records 819 passing full checks, a byte-current 300-member private tarball, unchanged core bytes and two independent Ready-with-follow-ups reviews plus a final artifact audit with no mandatory findings. RX-A080 is verified locally; historical remote CI does not verify this optional tree. Two other optional tasks remain deferred; no push, merge, remote CI or publication is authorized.

## Historical selected record patch continuation

RX-A090 is verified locally on `codex/rx-a090-patch`. Follow the [whole-field revision-guarded patch contract](docs/specs/RECORD_PATCH.md) and [acceptance](docs/evidence/RX-A090.md): `createPatch(engine).patch` borrows a direct native owner, requires complete explicitly selected text source at the required collection revision, and compiles into the actual incremental atomic replacement path in one FIFO operation. Null/empty/arrays/unset semantics, malformed data, shared work, conflicts, precommit failures and all observed cancellation suspensions have behavioral evidence. Full checks pass 844; two independent reviews have no mandatory findings. Core exports/retention, codecs and worker protocols remain unchanged; the private owner seam has a measured +146 gzip byte cost. The local candidate remains private and unpublished; historical remote CI does not verify this optional tree. RX-A100 is the sole remaining optional task and stays deferred unless explicitly selected. Do not reset completed tasks or create work to avoid reporting a complete release backlog.

## Current selected static-build and Astro continuation

RX-A100 is verified locally on `codex/rx-a100-astro`. Follow [the explicit static contract](docs/specs/STATIC_ASTRO.md) and [acceptance](docs/evidence/RX-A100.md). The separate private integration uses existing public native APIs with complete explicit source retention, generation/configuration/integrity checks, safe base URLs, lazy display data and owned candidate cleanup. Source rebuilds remain the browser default; native snapshot qualification stays exact-Node. Genuine packed Astro 7.3.2 builds at root and `/docs/`, actual navigation, native UI keyboard/semantic/error/teardown, compressed HTTP and lifecycle regressions pass. All 860 project tests pass; independent runtime/verification reviews have no mandatory findings. All 280 prior production files and core bundle bytes remain unchanged. Root runtime dependencies stay empty; framework/Node declarations are development tooling and the framework is an optional peer of the separate artifact. All 31 tasks are complete, with no deferred or ready implementation item. The release backlog being complete is a valid terminal state. Historical remote CI does not verify this tree; publication remains an owner decision and no remote write is authorized.
