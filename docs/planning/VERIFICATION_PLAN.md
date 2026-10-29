# Native verification plan

Status: adopted evaluation plan; RX-1001 has local input/analyzer/import observations in [its evidence record](../evidence/RX-1001.md). RX-1002 has internal frequency/index/exact-oracle observations in [its evidence record](../evidence/RX-1002.md). RX-1003 has internal complete query/BM25/trace observations in [its evidence record](../evidence/RX-1003.md). RX-1004 has internal incremental mutation/source-oracle, fault/abort rollback and logical copy diagnostics in [its evidence record](../evidence/RX-1004.md). RX-1005 has ordinary execution/FIFO/stop/disposal observations, four-quantum oracle parity and local timer/work diagnostics in [its evidence record](../evidence/RX-1005.md). RX-1006 records a locally packed public core, 34-section source corpus, independent retrieval/arithmetic checks, authored relevance judgments and bundle/import/startup observations in [its evidence](../evidence/RX-1006.md). RX-2001 adds independent strict source phrases/Boolean participation, coherent source lifecycle, every selected suspension cancellation and packed optional graph/work observations in [its evidence](../evidence/RX-2001.md). RX-2002 adds position/source/mixed strict-phrase parity, independently authored original spans, selected retention, atomic side-root stops and public package/graph costs in [its evidence](../evidence/RX-2002.md). RX-2003 adds typed filter/facet full-scan/numerical, mutation/stop, packed/minified and graph/work observations in [its evidence](../evidence/RX-2003.md), including the explained miss against the unchanged 15 KiB core planning target. RX-2004 adds selected factual/native-numerical Inspector, owned diagnostics/privacy/source bounds, lifecycle/ordinary allocation and packed/minified/graph/work observations in [its evidence](../evidence/RX-2004.md). RX-2005 records original ranges/bounded snippets in [its evidence](../evidence/RX-2005.md). RX-2006 records installed native UI, actual Inspector, real documentation navigation/representation/lifecycle and independent browser review in [its evidence](../evidence/RX-2006.md). RX-3001–3004 record host/recovery/migration verification; RX-4001 records fair evaluation and RX-4002 records the finite supported-host, exact-tool AT, physical and memory methods. RX-4003 prepares the private candidate and independent release recommendation without publication.

This document defines how Raveldex's native claims will be established. The previous companion's tests, timings, accessibility reports, and pilot judgments are useful inputs for later inspection. They are not evidence that this repository's native implementation works.

## Evidence and completion

Start from each task's stable acceptance IDs in [roadmap.json](roadmap.json), then choose the smallest reliable observation that can establish the criterion. Record implementation completion, verification completion, and documentation synchronization separately.

Use these criterion outcomes:

| Outcome | Meaning |
| --- | --- |
| Pass | The relevant implemented behavior was observed with the stated method and produced the expected result. |
| Fail | An observed result contradicts the accepted criterion. Record the defect and its scope. |
| Blocked | The required observation could not be made. Name the missing tool, environment, data, or decision and the action that would resolve it. |
| Not Applicable | The criterion is inapplicable to the explicitly selected configuration; explain why. It cannot erase an unconditional task requirement. |

`evidence` entries in the roadmap reference existing files only. A filename planned for a later run belongs in the task's verification instructions until actual observations exist. Mark a task `done` only after its applicable acceptance conditions and review requirements are satisfied and the resulting context/specifications are synchronized.

### Per-task record

Save `docs/evidence/RX-####.md` for implementation tasks. The bootstrap can use one shared record explicitly mapping both N0 tasks. A useful record contains:

1. Date, task ID, referenced specification, tested commit or bounded worktree diff, and evaluator role.
2. An acceptance matrix with the criterion ID, outcome, exact evidence link, and limits of the observation.
3. Commands/checks actually executed, environment and versions, exit outcomes, corpus/configuration identifiers, and links to raw data where needed.
4. Failures found, repairs applied, and the targeted rerun that checked each repair.
5. Independent review findings/verdict for cross-cutting changes.
6. Remaining limitations and the distinction between verified scope and claims still unsupported.

A passing build proves build integrity. It cannot establish query correctness, accurate memory use, keyboard interaction, or a physical paint observation. An independent review examines the resulting diff and evidence, not only the author's narrative.

## 1. Independent search correctness

The semantic oracle must stay independent of the production implementation. It may share public type declarations and fixture loading, but must not import the production dictionary, postings operations, analyzer implementation, query evaluator, or scorer for the behavior under examination.

Use a deliberately simple full scan of declared fixture records for eligibility. Expected analyzer terms, positions, and original source ranges must be hand-authored for critical Unicode/boundary cases or produced by an independently specified reference. Compare complete result membership before pagination, not only a convenient top result.

| Area | Minimum independent cases |
| --- | --- |
| Schema and ownership | Empty/invalid schema, duplicate fields/IDs, wrong types, empty and absent values, malformed inputs, input mutation after admission, and limit boundaries. |
| Analysis | Case/normalization behavior, combining marks, surrogate pairs, punctuation, repeated tokens, original UTF-16 coordinates, field/value boundaries, and analyzer identity. |
| Exact/prefix | Present/absent terms, repeated terms, selected fields, one or many alternatives, bounded prefix expansion, and invalid or exceeded limits. |
| Boolean/grouping | AND between original groups, OR within alternatives, nested AND/OR/NOT, repeated clauses, unknown fields, explicit match-all, and declared empty/negative-only behavior. |
| Equality/filters | Strict types, missing versus null, any-value array equality, numeric comparisons, set membership, and nested combinations. |
| Totals/order | Complete qualifying set, deterministic ties, zero/small/large result limits, and equivalent insertion histories where the contract requires the same order. |
| Mutations | Add/batch-add/replace/remove/clear, conflicting or missing IDs, invalid members, common-term edits, last-term removal, failed stages, and clear/repopulate cycles. |
| Phrase strategies | Adjacency, order, repeats, alternatives, normalization, multi-value/field boundaries, source/positions/mixed providers, and unchanged lexical scores. |
| Facets | Counts before result limits, selected own-facet filter included, distinct values per document, missing values, empty results, ordering, and output limits. |

Use fixed-seed generated corpora and operation sequences to extend coverage, preserving a reproducible seed for failures. Generated tests supplement readable counterexamples; they do not replace them. Keep oracle behavior simple enough for an independent reviewer to inspect.

### Ranking arithmetic

[RANKING.md](../specs/RANKING.md) defines the sole initial native model. Create small, hand-computable corpora that isolate document frequency, term frequency, indexed-field document count, field length/average length, boosts, and alternative selection. State expected intermediate and final values outside the production scorer.

Require trace contributions to reconstruct the score with the contract's absolute/relative tolerance. Compare the same operation with tracing disabled/enabled and confirm identical ranking. Check deterministic ties using the declared record-ID rule. MiniSearch score agreement is not the oracle: its formula, statistics, and aggregation may legitimately differ.

### Atomicity and work performed

After every committed mutation, compare the complete state-visible behavior with independently rebuilt expected records. Inject failures at validation, staging, side-index preparation, and pre-commit boundaries. Verify old-or-new state, revision identity, and coherent optional providers together.

Instrument analyzer calls and touched/copied structures. Replacing one record must not reanalyze unchanged documents. Large common postings or copied buckets can still make an incremental update expensive; record that cost rather than labeling all updates constant-time.

## 2. Execution, capabilities, and host parity

Use a deterministic scheduler to vary yields and cancellation points. Include abort-before-start, abort-during-work, abort-before-commit, late abort-after-commit, queue saturation, disposal, and failure cleanup. Assert both the returned outcome and actual state. Promise rejection alone does not prove mutation rollback or resource cleanup.

Measure cancellation inside owned loops and disclose indivisible normalization/allocation/transport segments. A synchronous primitive cannot become interruptible merely because its caller returns a Promise. A cancelled request, stale-response suppression, transport loss, and unknown commit outcome are separate observations.

For source phrases, positions/offsets, filters/facets, evidence, and Inspector, test installed, omitted, incompatible, stale, and partially staged providers. Missing capabilities must produce the specified errors. Optional side indexes publish at the same revision as core state.

For RX-3001, run the same admitted dataset/configuration/query/mutation cases in direct execution and one real module worker. Compare result sets, scores/order, totals, facets, evidence, revisions, and error categories. Independently sharded statistics are outside the initial design. Exercise malformed messages, delayed replies, worker death, bundling paths, and recovery.

## 3. Relevance judgments

A semantically correct engine can still rank the intended material poorly. Evaluate this separately from correctness.

The N1 pilot uses an explicit allowlist of current documentation, stable record IDs, source paths/anchors, and a frozen corpus hash. Archived proposals, old decisions, verification reports, and benchmark logs are excluded by default. Capture actual source text rather than replacing it with synthetic keyword repetition.

By `RX-4001`, establish at least 50 useful queries, preferably 50–100. Include natural task questions, short keyword queries, identifiers relevant to the collection, exact/phrase requests, ambiguous queries, and legitimate no-result cases. Do not pad the set with trivial variants merely to reach a count.

Each judgment records:

- Query text and typed query/configuration actually evaluated.
- User intent and applicable semantics.
- Must-find and acceptable record IDs or source sections.
- Known irrelevant results and any incomplete labels.
- Expected zero-result status where justified.
- Judgment author/date and corpus/configuration version.

| Metric | Method and interpretation |
| --- | --- |
| Top-1 / Top-3 success | Fraction of queries whose top one/three results contain a judged acceptable result. Report denominators and exclude intended-zero-result queries from this ranking metric. |
| MRR | Average reciprocal rank of the first judged acceptable result, with zero for no acceptable result; state the retrieval cutoff. |
| Recall@10 | Relevant records found in the top ten divided by the known relevant set, then the stated averaging method. If labels are incomplete, call this recall over judged relevant records. |
| Zero-result outcomes | Correct empty responses for intended-empty queries and unintended empty responses for queries with known matches. Report both counts. |

Preserve raw ranked outputs and calculation code. Examine failed queries before tuning. Separate tokenizer/contract failures, lexical mismatch, missing indexed content, rank ordering, UI/navigation problems, and genuine unsupported capabilities. An expected ranking difference from the companion is neither automatically a defect nor an improvement.

## 4. Fair comparison and performance

Competitor and companion behavior must be inspected and version-pinned when the comparison actually runs. This bootstrap does not refresh external research or reproduce previously reported issues.

Every measured row records the library/version/build, corpus hash, analyzer/configuration, query semantics, complete requested behavior, retained data, execution environment, and measurement method. Mark unsupported semantics **not comparable**. Do not score them as failures merely to create a winner.

Measure distinct configurations:

| Configuration | Include in the cost |
| --- | --- |
| Core only | Mandatory validation, analyzer, dictionary/postings/statistics/reverse map, ranker, execution, and required dependencies. |
| Documentation/source phrases | Core plus retained source/provider, source phrase verification, and any requested evidence work. |
| Positional | Core plus selected-field positions and separately selected original offsets; snippets additionally need source. |
| Product UI | Requested search modules, presentation/Inspector runtime and CSS, and actual result rendering. |
| Worker/storage | Complete requested state plus transport, worker hosting, serialization, and persistence operations. |

Use admitted 100, 1,000, and 10,000-record corpora initially. The 10,000-record limit is a defensive contract, not a demonstrated capacity promise. Larger experiments require a revised capacity/limit design before bypassing admission.

Report build, query, update, export/restore, and relevant presentation measures separately. For timings, record hardware/OS/runtime versions, corpus/query sizes, warm versus cold state, repetitions, raw samples, median and suitable tail summaries, error counts, and work performed. Do not report sub-millisecond precision unsupported by the timer or sample count.

A top-20 call must still pay the work needed for its promised exact total, filters, phrases, and facet counts. Compare it with equivalent complete behavior, not another library's token-only top-20 lookup.

### Bundle cost

The core-only target is **at most 15 KiB gzip** using a fixed, recorded bundler/minifier/compression configuration and including mandatory dependencies. Measure the installed packed consumer, not a hand-pruned internal file. Keep minified bytes, gzip bytes, tarball size, and parsed/runtime costs distinct.

Check import graphs and startup effects to show that omitted modules add no imported runtime code, side indexes, startup work, or network requests. A single package tarball can expose optional subpaths; tarball membership does not imply browser import cost.

RX-4001 records the completed local evaluation in [acceptance evidence](../evidence/RX-4001.md) and [reproducible tables/method](../evaluation/RX-4001.md). Independent correctness and hand arithmetic remain separate from 76 frozen source-authored relevance judgments and the pinned foreign equal-membership subset. Labels are incomplete and biased toward one evaluator's English technical self-documentation; failed/empty judgments remain unchanged. Costs use 27 Node owners plus nine untimed native work rows and nine actual Chrome worker/IndexedDB owners across admitted 100/1,000/10,000 workloads. Raw repetitions, fresh-owner versus warm-process states, whole-ms median/observed maximum, selected graphs and encoded bytes are retained separately. Native 10,000-record source work refusals, browser restore deadlines and the uncertain storage-load return remain operation outcomes, not successful round trips or environment blocks. The core gzip target miss is unchanged. Independent review recalculates raw metrics/tables and inspects kernels, source identities and claims; none of these observations fills RX-4002's physical memory/device/AT/browser qualification.

### Retained and peak memory

Define process/realm scope before measuring. Distinguish at minimum:

- Retained source, dictionary/postings/statistics/reverse records, and optional side indexes.
- Old and staged new mutation state before commit, plus released state after cleanup.
- Snapshot encode/decode buffers, transport copies, and worker allocations.
- Harness/application baseline, garbage-collection effects, and instrumentation overhead.

Use matched baselines, documented collection/settling strategy where supported, repetitions, and before/during/after observations. Record inability to isolate a component instead of assigning guessed bytes to it. Serialized index length, JSON size, object counts, and noisy Node heap deltas are useful diagnostics with different meanings; none alone proves isolated browser retained or peak memory.

## 5. Packaged integration and storage

Each public capability must be exercised by an isolated consumer installing a local package tarball and using only exported imports. Verify declarations, subpath resolution, module-worker entrypoints, safe non-DOM core import, and CSS selection. Do not let a workspace alias or direct `src/` import conceal a broken package.

RX-2005 independently checks original UTF-16 token/value coordinates and complete contributing Boolean/phrase occurrences from source and stored-offset providers. Snippet verification asserts exact source slices, original grapheme boundary membership, relative marks, hard display bounds and truthful omissions, including oversized clusters and unsafe text. Missing source/segmentation, output/work overflow and selected suspension stops reject whole operations and recover. Offline packed/minified consumers and full graphs verify source/offset/mixed parity, readonly public exports, range-only segmentation exclusion and no startup host access. Work/source/occurrence counters remain separate from physical heap/latency and later browser/AT qualification.

RX-3002 verifies 32 focused codec tests, nine source/native representation round trips with 789 complete semantic comparisons, 36 compatibility cases, 42 native core/side corruption cases, selected source/native suspension and phase stops, final-precommit rollback/postcommit truth, whole-restore participant caps, exact UTF-8 envelopes and a genuine private maximum-revision owner. Isolated packed/minified public consumers compare nine literal and 40 real-document results per run, including later mutations and DOM/Node-free declarations. Independent review uses separate literal/provenance/corruption/atomicity probes. Local native qualification is an explicit exact-host application declaration; default owners remain unqualified. See [the evidence](../evidence/RX-3002.md). Raw 100/1,000/10,000-record work/process-memory observations retain two source rebuild work-limit refusals and exact old-root preservation, separate from encoded bytes and true physical peaks.

Snapshot tests cover format/schema/analyzer/ranking/capability version mismatches, structural corruption, oversized input, partial restore, cancellation, and source-free configurations. Round trips must preserve promised semantics and later mutations, not merely reproduce a JSON object.

RX-3003 verifies 26 installed public-package browser scenarios and 301 complete semantic comparisons on one actual local Chrome/macOS host. Tests observe store rows and coherent generations independently of engine queries, request success versus transaction completion, CAS/erase/recreate races, full store erasure/isolation, corrupt/orphan recovery, unavailable/future/blocked databases, queue/open/deadline/stop cleanup, late connection closure and real one-owner module-worker recovery/reconciliation. Eleven independent probes additionally cover interleaved read selection/new durable heads and post-serialization byte-scan cancellation. Installed/current declarations, tarball identity, documentation corpus hashes, all four minified/unminified browser consumer graphs and guarded import/private export boundaries are audited. See [the acceptance record](../evidence/RX-3003.md). Injected quota/abort/lost-response outcomes are separated from unrun physical quota exhaustion, crash/power-loss/eviction durability, heap/latency and cross-browser/native qualification.

IndexedDB tests use a real browser and distinguish in-memory engine commit, durable storage completion, conflicts, and uncertain transport outcomes. Include quota/transaction failure, unavailable storage, corrupt snapshots, simultaneous clients, reload/recovery, and complete namespace erasure. Keep erasure of durable namespace data distinct from disposal of in-memory state.

RX-3004 verifies genuine canonical companion source conversion and native rebuild with 49 focused Node tests, installed Chrome source/IndexedDB update/reload/erase with 48 complete comparisons, twelve independent shared foreign/native memberships and thirteen independent review probes. The optional converter imports no foreign runtime, and development comparison identifies MiniSearch scores/cancellation/phrase limits separately. Expected rank changes and NFC/NFKC membership branches remain distinct. Licensed adaptation/provenance and unchanged historical bytes are audited; these are current native/foreign observations, not inherited companion passes. See [migration evidence](../evidence/RX-3004.md). Conversion has bounded synchronous host work and no physical latency/heap/cancellation guarantee.

## 6. Browser, accessibility, and device qualification

At `RX-4002`, state the proposed supported matrix using actual browser/OS/runtime versions. Exercise Chromium, WebKit/Safari, and Firefox configurations; distinguish an automated WebKit build from a qualified Safari/OS combination. Lack of a browser runner is an environment blocker, not proof that the browser is unsupported or that the tests passed.

For DOM UI, test semantic structure, labels, native control behavior, keyboard navigation, visible focus, focus preservation/restoration, status messages, composition input, stale updates, long/unsafe text, empty/error states, filters/facets, Inspector, recovery, and destroy/reinitialize.

RX-2006 observes one local Chrome 154.0.8037.98/macOS 27.0.1 host: 15 installed/minified browser scenarios, eight axe states with zero violations/incomplete checks, and nine independent probes. Its synthetic composition protocol is distinct from unrun OS IME; AT, cross-browser, forced-colors device, heap and physical latency qualification remain open. See [the acceptance record](../evidence/RX-2006.md) and its raw artifacts.

Automated accessibility checks are supporting evidence. Record actual assistive-technology observations with exact OS, browser, screen reader, versions, settings relevant to the result, tested steps, announced text/focus behavior, and observed failures. Possible combinations include VoiceOver with Safari and NVDA with Firefox or Chrome; the supported scope must name the combinations actually observed. Do not substitute a prior owner-reported companion test for a native exact-tool record.

Physical presentation observations must identify the actual device, display/input conditions, workload, and observed behavior. RequestAnimationFrame intervals, long-task measures, screenshots, or video proxies can support diagnosis, but none automatically proves physical paint timing. State the actual measured quantity.

## 7. Review and release decision

Review the implementation against its adopted contracts and evidence. Check requirement mismatches, architecture drift, errors/races, optional costs, packaging, unsafe source handling, accessibility claims, and documentation sync. Prioritize material findings rather than stylistic preferences.

The reviewer returns **Ready**, **Ready with follow-ups**, **Changes required**, or **Unable to verify**, with linked findings and their impact. Classify failures before repeatedly patching: specification, architecture, implementation, test/evaluation, environment, or documentation mismatch.

Missing required qualification keeps the corresponding criterion Blocked. It need not trigger rewriting a completed engine feature. A proposal to narrow a release claim must explicitly amend the release contract and retain the unperformed observation; silently removing an inconvenient criterion is not a pass.

N4 ends with a concrete native candidate recommendation. Publication, release tags, npm credentials, and repository visibility changes are separate owner actions. Completing the active backlog is a legitimate terminal state; deferred N5 ideas do not require endless new work.

## Explicitly selected optional typo tolerance

RX-A010 follows the [named policy and verification contract](../specs/TYPO_TOLERANCE.md). Freeze its separate authored typo judgments before evaluation, preserve the original 76-query baseline, compare with a full-matrix independent OSA/source oracle, and measure complete dictionary work/candidate cardinalities and isolated import graphs. Verify complete bound refusal, cancellation, mutation freshness and worker identity. Logical candidate high-waters do not establish heap or physical allocation peaks.

## RX-A020 selected optional token completion

Use the [suggestions contract](../specs/SUGGESTIONS.md) and independent source dictionary/DF/full-sort oracle. Freeze authored completion intents before production execution, report intended top-five inclusion and empty-prefix misses separately from search relevance, and retain the unchanged original 76-query regression corpus. Verify whole-corpus/selected-field scope, deterministic ties, normalized-once Unicode, complete totals with zero/bounded output, captured ownership, field validation on short input, candidate/work/output refusal, live/queued/old-root revisions, every actual selected cancellation suspension and recovery.

Measure complete dictionary visits, monotonic candidate-map high-water, bounded list cardinality/output entries and actual emitted work at 100/1,000/10,000 matches. Logical cardinalities are not allocation-byte peaks. Verify isolated installed/minified consumers, exact public example, no-host imports, ES2022 declarations/private path denial, and actual Node worker semantic identity/parity. UI/IME/AT qualification is not claimed because no UI integration is added.

## RX-A030 selected optional directional synonyms

Use the [single-step synonym contract](../specs/SYNONYMS.md). Freeze the domain vocabulary, positive/negative intents and source oracle before production execution. Compare full Boolean membership, pagination and native weighted arithmetic, including directed chains/cycles, normalized duplicate/self edges, repeated originals and distinct originals sharing a target. Preserve all 76 original judgments with the module unrequested. Verify mapping/actual scoring transparency, strict phrases and original target evidence, owned malformed input, factory/live/shared/output refusal boundaries, mutation/queued/old-root freshness and all observed cancellation suspensions. Isolated public/minified/Node-worker consumers must validate canonical table/version compatibility and exact installed documentation. Measure retained configuration, absence of corpus side index, logical work/cardinalities and separate imported graph sizes without claiming heap/allocation/transport peaks or additional manual AT/browser/native snapshot qualification.

## RX-A040 selected English analyzer

The owner selected English and the existing frozen 34-section documentation corpus before implementation. Apply [the fixed analyzer contract](../specs/ENGLISH_ANALYZER.md). Freeze original-language word-form judgments and independently check original-paper Porter variants, tokenizer/spans, dense positions, phrase boundaries and coalesced native BM25. Preserve unmet false-positive goals (notably cancell/cancellation) and report selected-English metrics separately from all 76 unselected basic regressions. Verify explicit selection, captured handles, invalid transformed output, module/shared budgets spanning tokens/values/providers/restored records, full stop/rollback/queue freshness and no hidden stemming of metadata. Packed/minified direct and real Node worker queries, exact selected source-restore/reconciliation descriptors, source/native exact-Node round trips and analyzer/profile/manifest mismatch refusal are required. Measure actual isolated graphs/logical work separately from heap/allocation/physical-copy claims; state AI versus human review and finite runtime/browser/AT qualification boundaries.
