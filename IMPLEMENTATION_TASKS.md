<!-- Generated from docs/planning/roadmap.json by scripts/render-plan.mjs. Run npm run docs:generate; do not edit task data here. -->

# Raveldex implementation tasks

These bounded contracts describe the native release track. Proposed module paths are not a claim that implementation already exists. Task status and recorded evidence below are generated from [the canonical roadmap](docs/planning/roadmap.json).

## How to execute a task

1. Read `AGENTS.md`, `PROJECT_CONTEXT.md`, the task card, its specifications, and directly affected source.
2. Confirm dependencies are `done` and the current owner request covers the work. Readiness does not expand a bootstrap into the whole product.
3. Implement the smallest useful slice satisfying its acceptance criteria. Clarify actual load-bearing gaps; do not reopen the selected native direction or invent new feature scope.
4. Verify from the criteria using independent expected outcomes where applicable. Record Pass, Fail, Blocked, or Not Applicable for each criterion and explain any N/A.
5. Collect independent review where required, resolve blocking findings, and synchronize contracts, task state, real evidence, and GitHub tracking.

Every acceptance criterion has a stable task-specific ID. `evidence` contains existing observations only. A future report destination is not proof. A green build, generated API stub, or old companion result cannot close a native capability task.

## RX-0001

**Repository foundation and native design adoption**

**Milestone:** N0 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/7)

**Dependencies:** None

Create the maintainable native repository, explicitly record the adopted direction, and make milestone/task progress inspectable without implementing search.

**Expected affected areas**

`README.md`, `AGENTS.md`, `PROJECT_CONTEXT.md`, `CONTRIBUTING.md`, `package.json`, `ROADMAP.md`, `IMPLEMENTATION_TASKS.md`, `docs/planning/`, `docs/decisions/0001-native-direction.md`, `scripts/`, `.github/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[REPOSITORY_BOOTSTRAP.md](docs/specs/REPOSITORY_BOOTSTRAP.md)

**Acceptance criteria**

- RX-0001-AC01: README, AGENTS, project context, architecture decision, roadmap, task cards, contribution guidance, and bootstrap scope agree that search runtime does not yet exist.
- RX-0001-AC02: Package scaffolding is TypeScript-first, ESM-only, framework-independent, private, and free of a foreign search-engine runtime dependency; metadata does not advertise usable search APIs.
- RX-0001-AC03: The canonical roadmap contains 21 release tasks and 10 deferred optional tracks with valid IDs, milestones, dependencies, specifications, and truthful evidence states.
- RX-0001-AC04: Planning commands distinguish eligible work, unfinished blockers, owner decisions, and a completed active backlog; malformed graphs or false done records fail validation.
- RX-0001-AC05: GitHub milestone/task issues identify the same IDs, scope, dependencies, acceptance criteria, and repository contract links; synchronization is documented.
- RX-0001-AC06: Historical companion work is retained as provenance, without importing old approvals, resetting completed tasks, or claiming inherited implementation/evidence.

**Verification**

- Run repository planning validation and dependency-aware status/next reporting, including meaningful negative fixtures for cycles, missing evidence, and invalid states.
- Inspect scaffold package contents and execute available build/typecheck/pack checks; record explicitly which bootstrap checks were run and what they do not prove.
- Check repository links, task/issue counts, milestone mapping, issue body scope, and remote default-branch content after synchronization.
- Have an independent reviewer inspect the resulting bootstrap diff and its acceptance matrix.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/BOOTSTRAP_VERIFICATION.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/BOOTSTRAP_VERIFICATION.md](docs/evidence/BOOTSTRAP_VERIFICATION.md)
- [docs/evidence/BOOTSTRAP_REVIEW.md](docs/evidence/BOOTSTRAP_REVIEW.md)


## RX-0002

**Core contract reconciliation and evaluation plan**

**Milestone:** N0 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/8)

**Dependencies:** [RX-0001](IMPLEMENTATION_TASKS.md#rx-0001)

Turn the selected native design into a bounded implementation contract and acceptance plan so the next task builds the engine instead of reopening architecture selection.

**Expected affected areas**

`docs/architecture/NATIVE_ARCHITECTURE.md`, `docs/architecture/ADDONS_AND_ADAPTERS.md`, `docs/specs/CORE_CONTRACT.md`, `docs/specs/RANKING.md`, `docs/specs/MUTATIONS_AND_EXECUTION.md`, `docs/planning/VERIFICATION_PLAN.md`, `docs/planning/roadmap.json`, `IMPLEMENTATION_TASKS.md`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[REPOSITORY_BOOTSTRAP.md](docs/specs/REPOSITORY_BOOTSTRAP.md), [NATIVE_ARCHITECTURE.md](docs/architecture/NATIVE_ARCHITECTURE.md), [ADDONS_AND_ADAPTERS.md](docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [RANKING.md](docs/specs/RANKING.md), [MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md)

**Acceptance criteria**

- RX-0002-AC01: Contracts explicitly define IDs/schema/analysis, normalization and source mapping, query grouping, Boolean/filter semantics, scores/ties, source ownership, revisions, and errors.
- RX-0002-AC02: The ranking model specifies field statistics, exact numerical contributions, variant aggregation, empty/negative-only query behavior, and score reconstruction tolerance.
- RX-0002-AC03: Mutation/execution contracts define staged changes, commit visibility, cancellation outcomes, bounded admission, cleanup, and failure atomicity.
- RX-0002-AC04: The initial 10,000-record defensive ceiling, query/input/work/output limits, and 15 KiB gzip core planning target are recorded with measurement methods and non-guarantees.
- RX-0002-AC05: Add-on capabilities, required data, ordering, side-index transactions, compatibility identity, and cost isolation are explicit; source and positional phrase semantics have one meaning.
- RX-0002-AC06: The verification plan separates independent correctness, relevance judgments, fair cost comparisons, packaged use, environment qualification, and missing observations.
- RX-0002-AC07: No unresolved load-bearing question is silently delegated as an implementation detail; any actual blocker is named without requesting approval to choose native again.

**Verification**

- Review representative exact/prefix/Boolean/filter/phrase/mutation examples against all contracts for contradictions and ambiguous outcomes.
- Review hand-derived scoring fixtures and the full-scan oracle design before implementation shares any engine internals.
- Check that each implementation task has dependencies, bounded paths, observable acceptance conditions, and criterion-appropriate evidence.
- Perform independent architecture/specification review and resolve blocking findings in the contracts.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/BOOTSTRAP_VERIFICATION.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/BOOTSTRAP_VERIFICATION.md](docs/evidence/BOOTSTRAP_VERIFICATION.md)
- [docs/evidence/BOOTSTRAP_REVIEW.md](docs/evidence/BOOTSTRAP_REVIEW.md)


## RX-1001

**Data, schema, basic analyzer, limits, and errors**

**Milestone:** N1 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/9)

**Dependencies:** [RX-0002](IMPLEMENTATION_TASKS.md#rx-0002)

Implement validated native input contracts and a deterministic basic analyzer that later indexing, querying, workers, and snapshots can share.

**Expected affected areas**

`src/core/contracts/`, `src/core/analyzer/`, `src/core/errors/`, `src/core/limits/`, `test/core/`, `test/fixtures/analysis/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [NATIVE_ARCHITECTURE.md](docs/architecture/NATIVE_ARCHITECTURE.md)

**Acceptance criteria**

- RX-1001-AC01: Schema, field types, opaque record IDs, required/optional values, invalid inputs, and owned copies follow the core contract.
- RX-1001-AC02: Index-time and query-time analysis use the same versioned basic analyzer; normalization never confuses original UTF-16 source offsets with normalized-string offsets.
- RX-1001-AC03: Multi-value fields retain value boundaries and source coordinates; punctuation, combining marks, surrogate pairs, empty values, and repeated terms have deterministic fixtures.
- RX-1001-AC04: Documented record, field, token, query, and operation limits reject invalid or oversized work with typed errors before publishing state.
- RX-1001-AC05: Core modules can be imported without DOM access, timers, workers, storage, network activity, or optional-module initialization.
- RX-1001-AC06: Input mutation by the caller cannot silently mutate admitted records, configuration, or completed query contracts.

**Verification**

- Run targeted schema/error/ownership boundary tests with exact expected error codes and no successful state publication on rejected input.
- Run table-driven analyzer fixtures using independently stated expected terms, original ranges, and value boundaries.
- Check TypeScript public contracts and inspect the core import graph for prohibited runtime/platform dependencies.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-1001.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-1001.md](docs/evidence/RX-1001.md)


## RX-1002

**Dictionary, postings, exact retrieval, and independent oracle**

**Milestone:** N1 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/10)

**Dependencies:** [RX-1001](IMPLEMENTATION_TASKS.md#rx-1001)

Build the first Raveldex-owned field-aware index and prove exact token eligibility against a separately implemented full-scan evaluator.

**Expected affected areas**

`src/core/index/`, `src/core/retrieval/`, `test/core/`, `test/oracle/`, `test/fixtures/corpora/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [NATIVE_ARCHITECTURE.md](docs/architecture/NATIVE_ARCHITECTURE.md)

**Acceptance criteria**

- RX-1002-AC01: Dictionary/postings own field-aware term frequencies, document/field statistics, and reverse document-term records needed by later mutations.
- RX-1002-AC02: Exact lookup returns the complete eligible record set with explicit field/value behavior; no foreign engine performs indexing or retrieval.
- RX-1002-AC03: Initial construction handles duplicate IDs and invalid records according to the atomic admission contract; partial construction is not exposed as a valid index.
- RX-1002-AC04: The independent oracle computes expected eligibility by scanning declared source fixtures and does not import production dictionary, postings, query evaluation, or scoring code.
- RX-1002-AC05: Source retention remains an explicit provider choice; core frequency-only configurations allocate no phrase/position/offset side indexes.
- RX-1002-AC06: Invariant checks detect inconsistent frequencies, dangling postings, missing reverse entries, and corpus-statistic drift.

**Verification**

- Compare exact retrieval with independent expected sets for empty corpora, absent terms, repeated terms, multi-field/multi-value data, and adversarial Unicode fixtures.
- Run generated corpora with fixed seeds and compare full result sets, not only the first page.
- Inspect index invariants and capture construction work/retained-structure counts on 100, 1,000, and 10,000-record admitted fixtures.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-1002.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-1002.md](docs/evidence/RX-1002.md)


## RX-1003

**Query evaluation, native BM25, and numerical trace facts**

**Milestone:** N1 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/11)

**Dependencies:** [RX-1002](IMPLEMENTATION_TASKS.md#rx-1002)

Implement complete typed query evaluation and the versioned native ranker with explanations derived from the actual arithmetic.

**Expected affected areas**

`src/core/query/`, `src/core/retrieval/`, `src/core/ranking/`, `src/core/trace/`, `test/core/`, `test/oracle/`, `test/fixtures/ranking/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [RANKING.md](docs/specs/RANKING.md), [NATIVE_ARCHITECTURE.md](docs/architecture/NATIVE_ARCHITECTURE.md)

**Acceptance criteria**

- RX-1003-AC01: Exact/prefix groups, field selection, AND/OR/NOT, explicit match-all, and strict scalar equality follow the contract; AND is between original groups and OR within alternatives.
- RX-1003-AC02: Prefix expansion respects explicit limits and returns a typed limit failure when completeness cannot be established; truncation is never represented as an exact success.
- RX-1003-AC03: Per-field BM25 uses the declared field statistics, boosts, and best weighted variant contribution per field; alternative multiplicity creates no accidental score bonus.
- RX-1003-AC04: Stable result ordering, ties, exact totals, and result limits are deterministic; limit does not restrict candidate qualification needed for exact results.
- RX-1003-AC05: Opt-in trace contributions reconstruct the score within the specified numeric tolerance and report the actual model/analyzer revision.
- RX-1003-AC06: Normal queries do not allocate complete explanation trees; filters and absent positive scoring clauses have the declared contribution behavior.

**Verification**

- Compare Boolean/field/filter/prefix result sets with the full-scan oracle across nested, repeated, missing-term, negative-only, and empty-query cases.
- Check hand-derived scores, field-length statistics, ties, alternate terms, and trace sums without calling the production scorer for expected values.
- Run the same query repeatedly and across input insertion orders where the public deterministic-order contract requires parity.
- Exercise query/expansion/result bounds and verify complete success or the specified typed failure.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-1003.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-1003.md](docs/evidence/RX-1003.md)


## RX-1004

**Incremental atomic mutations**

**Milestone:** N1 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/12)

**Dependencies:** [RX-1003](IMPLEMENTATION_TASKS.md#rx-1003)

Add and change records through atomic native transactions that update affected index state without reanalyzing every unchanged record.

**Expected affected areas**

`src/core/mutations/`, `src/core/index/`, `src/core/revision/`, `test/core/`, `test/oracle/`, `test/fixtures/mutations/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md), [CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [NATIVE_ARCHITECTURE.md](docs/architecture/NATIVE_ARCHITECTURE.md)

**Acceptance criteria**

- RX-1004-AC01: Add, batch-add, replace, remove, and clear follow the documented ID/existence and batch failure policies.
- RX-1004-AC02: Each successful commit publishes one revision covering dictionary, postings, corpus/field statistics, reverse entries, retained source, and installed side indexes.
- RX-1004-AC03: Validation failure, preparation failure, limit rejection, and pre-commit cancellation leave the previous revision searchable and unchanged.
- RX-1004-AC04: Single-record replacement does not reanalyze unchanged documents; affected shared posting/page work is measured rather than described as constant-time.
- RX-1004-AC05: Readers see the declared old-or-new coherent revision and cannot observe partially published add-on state.
- RX-1004-AC06: Schema/analyzer changes are explicit rebuilds; incremental document writes do not pretend to support live schema migration.

**Verification**

- Compare deterministic and seeded mutation sequences with a separately reconstructed oracle after every committed operation.
- Inject failures at validation, preparation, side-index staging, and pre-commit boundaries and assert state/revision equality with the preceding committed state.
- Instrument analyzer invocation counts and touched/copied structures for replacement at 100, 1,000, and 10,000 records.
- Verify delete/replace of frequent terms, last-term removal, empty fields, duplicate batch IDs, and clear/repopulate cycles.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-1004.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-1004.md](docs/evidence/RX-1004.md)


## RX-1005

**Revision execution, work limits, and cancellation**

**Milestone:** N1 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/13)

**Dependencies:** [RX-1004](IMPLEMENTATION_TASKS.md#rx-1004)

Make owned retrieval and mutation work resumable and bounded while preserving exact outcomes, revision consistency, and cleanup.

**Expected affected areas**

`src/core/execution/`, `src/core/revision/`, `src/core/mutations/`, `test/core/`, `test/fixtures/execution/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md), [CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [NATIVE_ARCHITECTURE.md](docs/architecture/NATIVE_ARCHITECTURE.md)

**Acceptance criteria**

- RX-1005-AC01: Each operation uses one documented revision and bounded admission; queue saturation and disposed instances fail with typed outcomes.
- RX-1005-AC02: Cancellation checkpoints exist inside owned dictionary, postings, scoring/selection, and staging loops rather than only around a synchronous foreign call.
- RX-1005-AC03: Cancellation before commit leaves state unchanged; a committed mutation is reported as committed even if cancellation arrives later; uncertainty is not mislabeled as rollback.
- RX-1005-AC04: Indivisible normalization/allocation/transport segments and work budgets are explicit; deadline/cancellation claims distinguish cooperative checkpoints from immediate interruption.
- RX-1005-AC05: Dispose and error paths remove scheduled work, pending references, and owned resources according to the lifecycle contract.
- RX-1005-AC06: The same operation under different yield schedules preserves complete result membership, deterministic ranking, and committed state.

**Verification**

- Use a deterministic scheduler to test abort-before-start, abort-during-query, abort-during-staging, commit-boundary races, queue overflow, and dispose.
- Compare outcomes with the non-yielded oracle on identical admitted inputs and revisions.
- Measure checkpoint response and maximum observed uninterrupted work on documented workloads; report indivisible sections and environment.
- Verify cleanup by observing pending tasks/handlers and later operations, not only promise rejection.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-1005.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-1005.md](docs/evidence/RX-1005.md)


## RX-1006

**Core-only packaged real-document pilot**

**Milestone:** N1 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/14)

**Dependencies:** [RX-1005](IMPLEMENTATION_TASKS.md#rx-1005)

Deliver a usable real-content search consumer that proves the independent native core through the actual packaged public API.

**Expected affected areas**

`src/index.ts`, `src/docs.ts`, `package.json`, `examples/core-docs/`, `test/consumer/`, `test/fixtures/docs/`, `scripts/`, `README.md`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [RANKING.md](docs/specs/RANKING.md), [MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md), [NATIVE_ARCHITECTURE.md](docs/architecture/NATIVE_ARCHITECTURE.md), [VERIFICATION_PLAN.md](docs/planning/VERIFICATION_PLAN.md)

**Acceptance criteria**

- RX-1006-AC01: A runnable consumer installs a packed local tarball and uses public imports to index, query, inspect totals/revisions, and mutate a real-document collection.
- RX-1006-AC02: The corpus is generated from an explicit allowlist of current documentation with stable record IDs and source links; archived proposals and verification logs are excluded by default.
- RX-1006-AC03: Judged queries identify intended/acceptable sources, expected lexical semantics, and appropriate no-result cases; results and ranking failures are recorded.
- RX-1006-AC04: The consumer imports no MiniSearch, companion runtime, DOM/search add-on, or internal source path as an undeclared dependency.
- RX-1006-AC05: A fixed bundling/minification method reports core-only gzip bytes including mandatory dependencies against the 15 KiB target; misses are explained without deleting correctness behavior.
- RX-1006-AC06: The deliverable performs real retrieval and updates; an exported factory stub, specification-only example, or green planning command does not satisfy this task.

**Verification**

- Build, pack, install into an isolated consumer, typecheck public imports, and execute the real-document pilot end to end.
- Compare the pilot result sets and selected arithmetic cases against independent expectations; record relevance judgments separately from correctness.
- Inspect the resulting consumer bundle/import graph and captured startup effects to establish optional-module exclusion.
- Record reproducible corpus hashes, package identity, query outcomes, bundle method, timings, and known limitations.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-1006.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-1006.md](docs/evidence/RX-1006.md)


## RX-2001

**Source-verified phrase add-on**

**Milestone:** N2 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/15)

**Dependencies:** [RX-1006](IMPLEMENTATION_TASKS.md#rx-1006)

Adapt the useful companion phrase approach into an optional native capability with one precise strict-phrase contract.

**Expected affected areas**

`src/addons/phrases/`, `test/addons/phrases/`, `test/fixtures/phrases/`, `package.json`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md), [VERIFICATION_PLAN.md](docs/planning/VERIFICATION_PLAN.md)

**Acceptance criteria**

- RX-2001-AC01: Phrase eligibility verifies ordered adjacency in one field value against authoritative source at the searched revision, including repeated words.
- RX-2001-AC02: Lexical candidate retrieval is complete before verification; phrases refine eligibility without adding candidates, rewriting scores, or imposing hidden result-limit truncation.
- RX-2001-AC03: Original group/alternative behavior and normalization are shared with the native contract; phrases cannot cross field or array-value boundaries.
- RX-2001-AC04: Missing source capability and incompatible analyzer/revision state produce explicit errors rather than silently excluding records or fields.
- RX-2001-AC05: The source provider participates in mutations and clear/dispose lifecycle; its required data and query-scan cost are documented.
- RX-2001-AC06: Core-only consumers import no phrase verifier or source store solely because the add-on exists.
- RX-2001-AC07: Phrase refinement applies to its query-tree leaf; an unmatched phrase branch cannot discard a record that qualifies through another OR branch, and NOT evaluates the phrase complement.

**Verification**

- Compare phrase membership with independent source fixtures covering repeats, punctuation, normalization, empty values, multi-value fields, and phrase-boundary counterexamples.
- Check AND/OR/NOT combinations with phrase leaves against independently computed membership, including records qualifying only through a non-phrase OR branch.
- Check phrase membership before limits and assert unchanged lexical scores among surviving records.
- Run revision/mutation/cancellation cases with source present, absent, and incompatible; inspect core-only import and retained-state exclusion.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-2001.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-2001.md](docs/evidence/RX-2001.md)


## RX-2002

**Optional positions, original offsets, and phrase parity**

**Milestone:** N2 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/16)

**Dependencies:** [RX-2001](IMPLEMENTATION_TASKS.md#rx-2001)

Offer selected-field positional phrase verification and optional original offsets without changing phrase meaning or making extra index data mandatory.

**Expected affected areas**

`src/addons/positions/`, `src/addons/phrases/`, `test/addons/positions/`, `test/fixtures/phrases/`, `package.json`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md)

**Acceptance criteria**

- RX-2002-AC01: Positions are value-aware and preserve original token order; original UTF-16 offsets are independently selectable and never inferred from normalized text coordinates.
- RX-2002-AC02: Positional and source phrase strategies return identical eligibility for all shared supported inputs, including repeated terms and normalization cases.
- RX-2002-AC03: Mixed selected-field strategies require declared providers; adding positions changes cost, not scores or matching semantics.
- RX-2002-AC04: Position/offset side indexes stage, commit, roll back, clear, and dispose with the same revision as core state.
- RX-2002-AC05: Frequencies-only, source-only, positions-only, and positions-plus-offsets configurations retain only their declared structures.
- RX-2002-AC06: Position-length metadata does not imply support for multiword synonym graphs or proximity search.

**Verification**

- Run differential source-versus-position phrase tests against an independent phrase oracle across generated and hand-selected corpora.
- Exercise mutations, aborted staging, field/value changes, and missing/incompatible provider errors.
- Measure retained structure sizes and mutation/query work for each configuration; distinguish payload counts from isolated process memory.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-2002.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-2002.md](docs/evidence/RX-2002.md)


## RX-2003

**Structured filters and exact conjunctive facets**

**Milestone:** N2 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/17)

**Dependencies:** [RX-1006](IMPLEMENTATION_TASKS.md#rx-1006)

Add optional numeric/set filters and selected keyword facet counts while preserving exact totals and explicit Boolean semantics.

**Expected affected areas**

`src/addons/filters/`, `src/addons/facets/`, `test/addons/filters/`, `test/addons/facets/`, `package.json`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md)

**Acceptance criteria**

- RX-2003-AC01: Numeric comparisons, set membership, missing/null values, field types, and nested filter composition have a typed bounded contract with no JavaScript coercion surprises.
- RX-2003-AC02: Filter evaluation participates in complete qualification before limits and cannot create lexical relevance contributions.
- RX-2003-AC03: Conjunctive keyword facets count the fully qualified result set under the current selected filters, including the facet's own filter, before top-k slicing.
- RX-2003-AC04: Multi-value facet values count each document once per distinct value; missing values, ordering, and output bounds have explicit behavior.
- RX-2003-AC05: Facet and filter data remain revision-coherent during mutations, cancellation, and empty-result operations.
- RX-2003-AC06: Specialized filter indexes are added only if measured need justifies them; the module is absent from core-only import/state graphs.

**Verification**

- Compare nested filter membership and facet tables with an independent full-scan reference for typed/missing/multi-value records.
- Check limit=0, small limits, repeated values, selected own-facet filters, no results, and simultaneous filter/phrase combinations.
- Exercise configured facet/output bounds and ensure incomplete aggregation is reported as a typed failure rather than an exact count.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-2003.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-2003.md](docs/evidence/RX-2003.md)


## RX-2004

**Factual explain and Inspector data**

**Milestone:** N2 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/18)

**Dependencies:** [RX-1006](IMPLEMENTATION_TASKS.md#rx-1006)

Expose bounded query/record explanations and diagnostic exports derived from actual native decisions and arithmetic.

**Expected affected areas**

`src/addons/inspector/`, `src/core/trace/`, `test/addons/inspector/`, `test/fixtures/ranking/`, `package.json`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](docs/architecture/ADDONS_AND_ADAPTERS.md), [RANKING.md](docs/specs/RANKING.md), [CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md)

**Acceptance criteria**

- RX-2004-AC01: Explanation data distinguishes eligibility, exclusion, ranking, selected alternatives, filters, revision identity, and resource outcomes.
- RX-2004-AC02: Displayed numerical contributions come from the executed native scorer and reconstruct the result score within the declared tolerance.
- RX-2004-AC03: Explanations identify unknown/unavailable facts explicitly; foreign engine scores are never labeled as native numerical decomposition.
- RX-2004-AC04: Normal search remains free of full trace allocations; requested traces and exports have bounded work/size and deterministic field meaning.
- RX-2004-AC05: Diagnostic exports default to metadata with explicitly selected source inclusion; no collection text or personal content is silently exported.
- RX-2004-AC06: Explanation objects support later DOM presentation and regression comparison without requiring DOM or persistence in the data module.

**Verification**

- Reconstruct hand-derived scores from exported contributions and verify exclusions against independent query outcomes.
- Check absent record IDs, stale revision requests, truncated diagnostic output, failed/cancelled operations, and unsupported capability reporting.
- Inspect normal-query allocation counters and explicit source-inclusion behavior; validate export schema and round-trip parsing.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-2004.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-2005

**Original match ranges and bounded snippets**

**Milestone:** N2 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/19)

**Dependencies:** [RX-2001](IMPLEMENTATION_TASKS.md#rx-2001), [RX-2002](IMPLEMENTATION_TASKS.md#rx-2002)

Produce trustworthy presentation data from original source, using reanalysis or stored offsets as explicit interchangeable providers.

**Expected affected areas**

`src/addons/evidence/`, `src/addons/snippets/`, `test/addons/evidence/`, `test/fixtures/evidence/`, `package.json`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md)

**Acceptance criteria**

- RX-2005-AC01: Match ranges use original UTF-16 coordinates, identify field and value, and prove actual source occurrences at the same revision.
- RX-2005-AC02: Source reanalysis and stored-offset providers agree on supported occurrence evidence; normalized offsets are never substituted.
- RX-2005-AC03: Snippet boundaries avoid splitting grapheme clusters, respect bounded output, and indicate omitted context without fabricating source text.
- RX-2005-AC04: Ranges and snippets remain data; source text is never returned as pretrusted HTML and unsafe rendering is not encouraged.
- RX-2005-AC05: Missing source prevents snippets with a clear capability error; positions alone may establish phrase eligibility without claiming display text.
- RX-2005-AC06: Evidence/snippet work, retained source, and module imports remain optional and honor cancellation/output limits.

**Verification**

- Run original-range fixtures with combining marks, surrogate pairs, emoji sequences, scripts, punctuation, repeated matches, and multiple field values.
- Compare offset and reanalysis provider output to independent source slices and check all returned ranges are valid.
- Verify bounded snippet windows, overlapping matches, no text injection, mutation revision coherence, and absent-source failures.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-2005.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-2006

**Native DOM UI, Inspector, and documentation pilot**

**Milestone:** N2 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/20)

**Dependencies:** [RX-2003](IMPLEMENTATION_TASKS.md#rx-2003), [RX-2004](IMPLEMENTATION_TASKS.md#rx-2004), [RX-2005](IMPLEMENTATION_TASKS.md#rx-2005)

Deliver a usable optional native search interface and Inspector over real documentation through public package capabilities.

**Expected affected areas**

`src/addons/ui/`, `src/addons/ui/styles.css`, `examples/docs-search/`, `test/ui/`, `test/consumer/`, `package.json`, `README.md`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md), [VERIFICATION_PLAN.md](docs/planning/VERIFICATION_PLAN.md)

**Acceptance criteria**

- RX-2006-AC01: A semantic labeled search form, result navigation, filters/facets, empty/error/loading states, and actual Inspector data work against the packaged native engine.
- RX-2006-AC02: IME composition, debouncing, stale requests, focus preservation, result/status announcements, and recovery states have explicit tested behavior.
- RX-2006-AC03: Keyboard controls use native elements or justified patterns, focus stays visible, and reduced-motion preferences are respected.
- RX-2006-AC04: Source snippets are rendered safely as text plus explicit marks; source URLs and content come from the allowlisted documentation corpus.
- RX-2006-AC05: Duplicate initialization and destroy/reinitialize do not leak listeners, pending queries, workers, or UI-owned resources.
- RX-2006-AC06: UI/Inspector CSS and runtime are optional imports; automated accessibility success is distinguished from unperformed exact-tool assistive-technology observations.
- RX-2006-AC07: The native pilot supports real tasks and reports relevance/interaction findings; a static mock-up does not complete this task.

**Verification**

- Run a packed-consumer browser scenario covering submit, rapid typing, IME, facets, no results, errors, navigation, Inspector open/close, and teardown.
- Perform keyboard/focus tests and automated accessibility checks with recorded tool versions; record manual observations separately.
- Check unsafe fixture text, long content, narrow viewports, visible focus, reduced motion, and status changes.
- Re-evaluate real-document judgments and inspect the core-only consumer for absence of DOM/Inspector/CSS imports.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-2006.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-3001

**One-owner module-worker adapter**

**Milestone:** N3 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/21)

**Dependencies:** [RX-2006](IMPLEMENTATION_TASKS.md#rx-2006)

Host the complete native engine in one module worker through validated transport while preserving direct execution semantics.

**Expected affected areas**

`src/adapters/worker/`, `test/adapters/worker/`, `test/consumer/`, `examples/docs-search/`, `package.json`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [RANKING.md](docs/specs/RANKING.md), [MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md)

**Acceptance criteria**

- RX-3001-AC01: The worker owns one complete corpus and its statistics; no independently scored shards change ranking semantics.
- RX-3001-AC02: Direct and worker operations agree on membership, scores/ties, totals, facets, evidence, revision identity, and typed errors for the same configuration.
- RX-3001-AC03: Transport validates requests/responses, operation identity, bounded payloads, analyzer/add-on compatibility, and worker lifecycle.
- RX-3001-AC04: Cancel, timeout, termination, failed initialization, and unknown mutation outcome are distinguished; transport loss never proves rollback.
- RX-3001-AC05: Worker construction is explicit and bundler-compatible through a documented public entry; importing core never creates a worker.
- RX-3001-AC06: Destroy/recover releases listeners and worker resources, and pending promises settle according to the contract.

**Verification**

- Run the same corpus/query/mutation/phrase/facet suite directly and through a real browser module worker and compare semantic outputs.
- Inject malformed messages, delayed replies, out-of-order IDs, worker death, pre/post-commit cancellation, and failed startup.
- Install a packed consumer and verify the documented worker import/bundling path in supported test environments.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-3001.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-3002

**Versioned source and native snapshots**

**Milestone:** N3 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/22)

**Dependencies:** [RX-2006](IMPLEMENTATION_TASKS.md#rx-2006)

Export and restore explicit source/native snapshot formats with bounded decoding and verified compatibility.

**Expected affected areas**

`src/adapters/snapshots/`, `test/adapters/snapshots/`, `test/fixtures/snapshots/`, `package.json`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [RANKING.md](docs/specs/RANKING.md), [MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md)

**Acceptance criteria**

- RX-3002-AC01: Formats identify codec, schema, analyzer, ranking, capability, index-detail, and format versions; incompatible data is rejected with a specific reason.
- RX-3002-AC02: Source snapshots rebuild native state from authoritative records; native snapshots validate index structures rather than trusting opaque bytes.
- RX-3002-AC03: Restore prepares and validates all participating state before atomically replacing the visible revision.
- RX-3002-AC04: Round trips preserve declared search semantics and data ownership, including chosen optional state; source-free configurations do not invent omitted text.
- RX-3002-AC05: Malformed, oversized, truncated, inconsistent, or unsupported snapshots fail without corrupting the current searchable state.
- RX-3002-AC06: Serialization/restoration work and memory costs are measured separately from index bytes; codecs remain optional imports.

**Verification**

- Round-trip each supported index-detail configuration and compare result sets, scores, phrases, evidence, facets, and subsequent mutations.
- Use corruption and compatibility fixtures for every header/version and critical structural invariant; assert old-state preservation.
- Exercise cancellation and limits during encode/decode/staging, and capture raw size and memory-method limitations.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-3002.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-3003

**IndexedDB persistence, recovery, and namespace erasure**

**Milestone:** N3 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/23)

**Dependencies:** [RX-3001](IMPLEMENTATION_TASKS.md#rx-3001), [RX-3002](IMPLEMENTATION_TASKS.md#rx-3002)

Provide explicitly selected local persistence and recovery with truthful commit/conflict outcomes and complete namespace erasure.

**Expected affected areas**

`src/adapters/indexeddb/`, `test/adapters/indexeddb/`, `test/consumer/`, `examples/docs-search/`, `package.json`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](docs/architecture/ADDONS_AND_ADAPTERS.md), [MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md), [CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md)

**Acceptance criteria**

- RX-3003-AC01: Save/load/erase are explicit API actions in a namespaced optional adapter with no import-time storage or background persistence.
- RX-3003-AC02: Persisted generation/conflict rules distinguish engine commit, serialization, durable storage completion, and uncertain transport outcomes.
- RX-3003-AC03: Quota failures, unavailable storage, corrupted snapshots, schema upgrades, blocked tabs, and simultaneous clients have explicit recovery behavior.
- RX-3003-AC04: Loading uses validated snapshot restore and does not expose partially recovered core or add-on state.
- RX-3003-AC05: Namespace erasure removes all adapter-owned records and metadata in scope; memory cleanup is a separate documented operation.
- RX-3003-AC06: Direct and worker recovery flows preserve the public semantic contract and settle pending operations without leaks.

**Verification**

- Run real-browser IndexedDB save/reload/query, mutation/save, conflicting clients, and erase/reopen scenarios using packed public imports.
- Inject quota/transaction/corruption/transport failures and assert durable-state and in-memory-state outcomes separately.
- Inspect all namespace-owned stores after erasure and test idempotent cleanup and unavailable-storage fallback.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-3003.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-3004

**Companion migration and comparator separation**

**Milestone:** N3 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/24)

**Dependencies:** [RX-3003](IMPLEMENTATION_TASKS.md#rx-3003)

Provide a bounded route from the prior companion while keeping native implementation, third-party compatibility, and comparison evidence distinct.

**Expected affected areas**

`integrations/minisearch/`, `test/migration/`, `test/comparison/`, `docs/migration/`, `examples/migration/`, `package.json`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](docs/architecture/ADDONS_AND_ADAPTERS.md), [NATIVE_ARCHITECTURE.md](docs/architecture/NATIVE_ARCHITECTURE.md), [CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [RANKING.md](docs/specs/RANKING.md), [MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md)

**Acceptance criteria**

- RX-3004-AC01: A documented mapping identifies reusable source records/configuration, native rebuild requirements, intentional semantic differences, and unsupported legacy state.
- RX-3004-AC02: Supported companion source snapshots migrate by validated conversion/reindexing; opaque MiniSearch indexes are not relabeled or silently loaded as native indexes.
- RX-3004-AC03: Legacy MiniSearch compatibility/comparison code resides outside native core and cannot enter a core-only consumer transitively.
- RX-3004-AC04: Any foreign adapter identifies its engine/scoring/cancellation/phrase limitations and does not report native numerical explanations.
- RX-3004-AC05: Migration tests compare documented shared semantics and report expected rank changes separately from migration defects.
- RX-3004-AC06: Historical companion evidence remains unchanged and attributed to its original implementation; native claims link native observations.

**Verification**

- Migrate representative supported source snapshots, query the result, update it, persist/reload, and compare with independently reindexed expected data.
- Reject opaque/incompatible legacy inputs with explicit diagnostics and verify no mutation on failure.
- Inspect packaged dependency/import graphs and verify native consumers have zero foreign search-engine runtime dependencies.
- Review the migration guide against actual public exports and preserved provenance.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-3004.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-4001

**Fair correctness, relevance, and cost comparison**

**Milestone:** N4 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/25)

**Dependencies:** [RX-3004](IMPLEMENTATION_TASKS.md#rx-3004)

Establish the native product's observed strengths and limitations through equivalent workloads and independently judged outcomes.

**Expected affected areas**

`bench/`, `test/comparison/`, `test/oracle/`, `test/fixtures/relevance/`, `docs/evaluation/`, `scripts/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[VERIFICATION_PLAN.md](docs/planning/VERIFICATION_PLAN.md), [CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [RANKING.md](docs/specs/RANKING.md), [MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md), [ADDONS_AND_ADAPTERS.md](docs/architecture/ADDONS_AND_ADAPTERS.md)

**Acceptance criteria**

- RX-4001-AC01: Correctness evaluation uses the independent oracle, hand-derived score cases, mutation sequences, and phrase-strategy parity rather than ranking agreement with another library.
- RX-4001-AC02: A frozen real-content query set grows to at least 50 useful judgments, preferably 50–100, with must-find/acceptable/irrelevant sources and explicit no-result cases.
- RX-4001-AC03: Report Top-1, Top-3, MRR, Recall@10, and zero-result outcomes where judgments support them; disclose incomplete relevance labels and corpus bias.
- RX-4001-AC04: Comparison rows declare equivalent queries, filters, phrase/count semantics, retained source, UI/worker/storage configuration, version pins, and unsupported features.
- RX-4001-AC05: Measure admitted 100/1,000/10,000-record workloads for build/query/update/serialization with raw repetitions, environment, warm/cold method, and work counters.
- RX-4001-AC06: Core-only, source-document, positional, and worker/storage costs are reported separately; bundle/serialized bytes are not presented as retained or peak process memory.
- RX-4001-AC07: No overall winner is declared from incomparable workloads; repeated native regressions produce scoped follow-up findings rather than automatic feature expansion.

**Verification**

- Run the complete native correctness suite and inspect oracle independence before using benchmark results.
- Freeze/query the judged corpus, calculate metrics from raw ranked outputs, and manually review failed and zero-result cases.
- Run version-pinned comparison harnesses with feature-equivalence metadata and record unsupported semantics as not comparable.
- Review measurement scripts, seeds, raw samples, summary calculations, and claim wording independently.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-4001.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-4002

**Browser, assistive-technology, memory, and device qualification**

**Milestone:** N4 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/26)

**Dependencies:** [RX-3004](IMPLEMENTATION_TASKS.md#rx-3004)

Collect the specific environment and resource observations required by the proposed native support claims.

**Expected affected areas**

`test/qualification/`, `bench/memory/`, `docs/evaluation/`, `docs/accessibility/`, `docs/support/`, `examples/docs-search/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[VERIFICATION_PLAN.md](docs/planning/VERIFICATION_PLAN.md), [CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md), [ADDONS_AND_ADAPTERS.md](docs/architecture/ADDONS_AND_ADAPTERS.md)

**Acceptance criteria**

- RX-4002-AC01: Define and exercise the package in explicit Chromium, WebKit/Safari, and Firefox test environments, recording actual browser/OS/runtime versions and supported configurations.
- RX-4002-AC02: Record exact-tool assistive-technology observations for the declared UI flows, including query/results/status, errors, filters/facets, Inspector, and worker recovery.
- RX-4002-AC03: Use an explicit memory method to distinguish retained source/index/side state, mutation staging peak, serialization/transport buffers, and worker/process scope.
- RX-4002-AC04: Physical presentation/input observations identify the actual device, display/input method, workload, and observable outcome; animation-frame timing alone is not relabeled as paint evidence.
- RX-4002-AC05: Test 1,000 and 10,000 admitted records at minimum for relevant resource configurations; experiments beyond the defensive ceiling require a revised capacity design.
- RX-4002-AC06: Unavailable exact tools or isolated measurements remain Blocked with a concrete required observation; old companion runs or proxy metrics cannot fill the gap.
- RX-4002-AC07: Any proposed narrower release claim is documented and reviewed against the release contract before acceptance criteria change; no silent waiver converts missing proof to Pass.

**Verification**

- Execute the recorded browser package matrix and keyboard/UI scenarios, keeping engine and host capability differences visible.
- Run named screen-reader/browser/OS combinations available to the evaluator and preserve observed announcements/focus outcomes and failures.
- Capture retained/peak-memory methodology and raw samples with cleanup baselines and process boundaries; report noise and instrumentation limits.
- Perform and document physical device interaction/presentation observations; separate these from automated rAF proxies.
- Independently reconcile the observed support matrix with candidate documentation and unresolved evidence.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-4002.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-4003

**Package, public documentation, and independent candidate review**

**Milestone:** N4 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/27)

**Dependencies:** [RX-4001](IMPLEMENTATION_TASKS.md#rx-4001), [RX-4002](IMPLEMENTATION_TASKS.md#rx-4002)

Prepare a coherent native 0.1 candidate and a concrete release recommendation while keeping publication a separate action.

**Expected affected areas**

`package.json`, `README.md`, `CHANGELOG.md`, `.changeset/`, `.github/workflows/`, `test/consumer/`, `docs/api/`, `docs/support/`, `docs/release/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[VERIFICATION_PLAN.md](docs/planning/VERIFICATION_PLAN.md), [NATIVE_ARCHITECTURE.md](docs/architecture/NATIVE_ARCHITECTURE.md), [ADDONS_AND_ADAPTERS.md](docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](docs/specs/CORE_CONTRACT.md), [RANKING.md](docs/specs/RANKING.md), [MUTATIONS_AND_EXECUTION.md](docs/specs/MUTATIONS_AND_EXECUTION.md)

**Acceptance criteria**

- RX-4003-AC01: Candidate scope, public exports/types, supported environments, exclusions, SemVer/compatibility policy, migration guidance, and support expectations match verified behavior.
- RX-4003-AC02: Packed consumers verify core and selected add-on/adapter entrypoints, clean package contents, no unexpected runtime dependencies, and independent CSS imports.
- RX-4003-AC03: Quick start, API reference, native Inspector explanation, worker/storage examples, limitations, accessibility evidence, and release notes use actual public APIs.
- RX-4003-AC04: Release automation is reviewable and gated; secrets, npm publishing, public release creation, and release tags are not executed as part of candidate preparation.
- RX-4003-AC05: An independent review checks acceptance evidence, unresolved defects, API/package coherence, fair claims, and documentation synchronization.
- RX-4003-AC06: The final recommendation names ready scope and remaining blockers; unfinished criteria are not hidden by a passing broad command.
- RX-4003-AC07: The planner reports the completed active native backlog distinctly from deferred N5 ideas and the separate owner publication decision.

**Verification**

- Run the full required native verification, type/build/export validation, pack/install consumer checks, and optional-import isolation checks.
- Run documentation examples against the candidate tarball and compare support/limitation claims with qualification records.
- Inspect release workflow permissions and dry-run preparation without publishing, tagging, or using release credentials.
- Have an independent reviewer produce a readiness verdict with evidence-linked findings and a clear owner release recommendation.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-4003.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## Deferred enhancement tasks

The `RX-A*` tasks are in [Optional features](docs/planning/OPTIONAL_FEATURES.md). Their dependency on `RX-4003` is only a prerequisite. They remain deferred until selected and do not block the N0–N4 candidate.
