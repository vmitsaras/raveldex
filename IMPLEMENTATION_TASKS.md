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

**Milestone:** N2 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/18)

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

- [docs/evidence/RX-2004.md](docs/evidence/RX-2004.md)


## RX-2005

**Original match ranges and bounded snippets**

**Milestone:** N2 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/19)

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

- [docs/evidence/RX-2005.md](docs/evidence/RX-2005.md)


## RX-2006

**Native DOM UI, Inspector, and documentation pilot**

**Milestone:** N2 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/20)

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

- [docs/evidence/RX-2006.md](docs/evidence/RX-2006.md)
- [docs/evidence/RX-2006-review.md](docs/evidence/RX-2006-review.md)


## RX-3001

**One-owner module-worker adapter**

**Milestone:** N3 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/21)

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

- [docs/evidence/RX-3001.md](docs/evidence/RX-3001.md)
- [docs/evidence/RX-3001-review.md](docs/evidence/RX-3001-review.md)
- [docs/evidence/RX-3001-browser.json](docs/evidence/RX-3001-browser.json)
- [docs/evidence/RX-3001-package.json](docs/evidence/RX-3001-package.json)
- [docs/evidence/RX-3001-transport-work.json](docs/evidence/RX-3001-transport-work.json)
- [docs/evidence/RX-3001-review-probe.json](docs/evidence/RX-3001-review-probe.json)


## RX-3002

**Versioned source and native snapshots**

**Milestone:** N3 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/22)

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

- [docs/evidence/RX-3002.md](docs/evidence/RX-3002.md)
- [docs/evidence/RX-3002-review.md](docs/evidence/RX-3002-review.md)
- [docs/evidence/RX-3002-package.json](docs/evidence/RX-3002-package.json)
- [docs/evidence/RX-3002-costs.json](docs/evidence/RX-3002-costs.json)
- [docs/evidence/RX-3002-review-probe.json](docs/evidence/RX-3002-review-probe.json)


## RX-3003

**IndexedDB persistence, recovery, and namespace erasure**

**Milestone:** N3 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/23)

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

- [docs/evidence/RX-3003.md](docs/evidence/RX-3003.md)
- [docs/evidence/RX-3003-review.md](docs/evidence/RX-3003-review.md)
- [docs/evidence/RX-3003-browser-fifth.json](docs/evidence/RX-3003-browser-fifth.json)
- [docs/evidence/RX-3003-review-probe.json](docs/evidence/RX-3003-review-probe.json)
- [docs/evidence/RX-3003-browser-accepted.json](docs/evidence/RX-3003-browser-accepted.json)


## RX-3004

**Companion migration and comparator separation**

**Milestone:** N3 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/24)

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

- [docs/evidence/RX-3004.md](docs/evidence/RX-3004.md)
- [docs/evidence/RX-3004-review.md](docs/evidence/RX-3004-review.md)
- [docs/evidence/RX-3004-migration.json](docs/evidence/RX-3004-migration.json)
- [docs/evidence/RX-3004-browser.json](docs/evidence/RX-3004-browser.json)
- [docs/evidence/RX-3004-comparison.json](docs/evidence/RX-3004-comparison.json)
- [docs/evidence/RX-3004-review-probe.json](docs/evidence/RX-3004-review-probe.json)
- [docs/evidence/RX-3004-provenance.json](docs/evidence/RX-3004-provenance.json)
- [docs/evidence/RX-3004-browser-final.json](docs/evidence/RX-3004-browser-final.json)


## RX-4001

**Fair correctness, relevance, and cost comparison**

**Milestone:** N4 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/25)

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

- [docs/evidence/RX-4001.md](docs/evidence/RX-4001.md)
- [docs/evidence/RX-4001-review.md](docs/evidence/RX-4001-review.md)
- [docs/evidence/RX-4001-correctness.json](docs/evidence/RX-4001-correctness.json)
- [docs/evidence/RX-4001-relevance.json](docs/evidence/RX-4001-relevance.json)
- [docs/evidence/RX-4001-comparison.json](docs/evidence/RX-4001-comparison.json)
- [docs/evidence/RX-4001-costs.json](docs/evidence/RX-4001-costs.json)
- [docs/evidence/RX-4001-costs-first.json](docs/evidence/RX-4001-costs-first.json)
- [docs/evidence/RX-4001-costs-small-core-repeat.json](docs/evidence/RX-4001-costs-small-core-repeat.json)
- [docs/evidence/RX-4001-costs-first-unrepaired.json](docs/evidence/RX-4001-costs-first-unrepaired.json)
- [docs/evidence/RX-4001-browser-costs.json](docs/evidence/RX-4001-browser-costs.json)
- [docs/evidence/RX-4001-review-probe.json](docs/evidence/RX-4001-review-probe.json)
- [docs/evidence/RX-4001-package.json](docs/evidence/RX-4001-package.json)
- [docs/evidence/RX-4001-package-final.json](docs/evidence/RX-4001-package-final.json)
- [docs/evidence/RX-4001-package-audit.json](docs/evidence/RX-4001-package-audit.json)


## RX-4002

**Browser, assistive-technology, memory, and device qualification**

**Milestone:** N4 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/26)

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

- [docs/evidence/RX-4002.md](docs/evidence/RX-4002.md)
- [docs/evidence/RX-4002-browsers-accepted.json](docs/evidence/RX-4002-browsers-accepted.json)
- [docs/evidence/RX-4002-memory.json](docs/evidence/RX-4002-memory.json)
- [docs/evidence/RX-4002-memory-graphs.json](docs/evidence/RX-4002-memory-graphs.json)
- [docs/evidence/RX-4002-memory-summary.json](docs/evidence/RX-4002-memory-summary.json)
- [docs/evidence/RX-4002-memory-integrity.json](docs/evidence/RX-4002-memory-integrity.json)
- [docs/support/RX-4002.md](docs/support/RX-4002.md)
- [docs/evaluation/RX-4002-memory-method.md](docs/evaluation/RX-4002-memory-method.md)
- [docs/accessibility/RX-4002-manual-observations.md](docs/accessibility/RX-4002-manual-observations.md)
- [docs/evidence/RX-4002-review.md](docs/evidence/RX-4002-review.md)
- [docs/evidence/RX-4002-review-probe.json](docs/evidence/RX-4002-review-probe.json)
- [docs/evidence/RX-4002-package-final.json](docs/evidence/RX-4002-package-final.json)
- [docs/evidence/RX-4002-package-audit.json](docs/evidence/RX-4002-package-audit.json)
- [docs/evidence/RX-4002-retainers.md](docs/evidence/RX-4002-retainers.md)
- [docs/evidence/RX-4002-memory-retainers.json](docs/evidence/RX-4002-memory-retainers.json)
- [docs/evidence/RX-4002-retainers-review.md](docs/evidence/RX-4002-retainers-review.md)
- [docs/evidence/RX-4002-retainers-review-probe.json](docs/evidence/RX-4002-retainers-review-probe.json)
- [docs/evidence/RX-4002-retainers-package.json](docs/evidence/RX-4002-retainers-package.json)
- [docs/evidence/RX-4002-retainers-package-audit.json](docs/evidence/RX-4002-retainers-package-audit.json)
- [docs/evidence/RX-4002-facets.md](docs/evidence/RX-4002-facets.md)
- [docs/evidence/RX-4002-facet-keyboard-arrowup.json](docs/evidence/RX-4002-facet-keyboard-arrowup.json)
- [docs/evidence/RX-4002-facet-keyboard-arrowup-source.mjs](docs/evidence/RX-4002-facet-keyboard-arrowup-source.mjs)
- [docs/evidence/RX-4002-facet-keyboard-idle-typeahead.json](docs/evidence/RX-4002-facet-keyboard-idle-typeahead.json)
- [docs/evidence/RX-4002-facets-review-probe.mjs](docs/evidence/RX-4002-facets-review-probe.mjs)
- [docs/evidence/RX-4002-facets-review-probe.json](docs/evidence/RX-4002-facets-review-probe.json)
- [docs/evidence/RX-4002-facets-package.json](docs/evidence/RX-4002-facets-package.json)
- [docs/evidence/RX-4002-facets-package-audit.json](docs/evidence/RX-4002-facets-package-audit.json)
- [docs/evidence/RX-4002-facets-review.md](docs/evidence/RX-4002-facets-review.md)
- [docs/evidence/RX-4002-installed.md](docs/evidence/RX-4002-installed.md)
- [docs/evidence/RX-4002-installed-package.json](docs/evidence/RX-4002-installed-package.json)
- [docs/evidence/RX-4002-installed-observations.json](docs/evidence/RX-4002-installed-observations.json)
- [docs/evidence/RX-4002-installed-preservation.json](docs/evidence/RX-4002-installed-preservation.json)
- [docs/evidence/RX-4002-installed-audit.json](docs/evidence/RX-4002-installed-audit.json)
- [docs/evidence/RX-4002-installed-review.md](docs/evidence/RX-4002-installed-review.md)
- [docs/evidence/RX-4002-installed-review-observations.json](docs/evidence/RX-4002-installed-review-observations.json)
- [docs/evidence/RX-4002-installed-matrix.md](docs/evidence/RX-4002-installed-matrix.md)
- [docs/evidence/RX-4002-installed-matrix-package.json](docs/evidence/RX-4002-installed-matrix-package.json)
- [docs/evidence/RX-4002-installed-matrix-observations.json](docs/evidence/RX-4002-installed-matrix-observations.json)
- [docs/evidence/RX-4002-installed-matrix-audit.json](docs/evidence/RX-4002-installed-matrix-audit.json)
- [docs/evidence/RX-4002-installed-matrix.jsonl](docs/evidence/RX-4002-installed-matrix.jsonl)
- [docs/evidence/RX-4002-installed-matrix-review-observations.json](docs/evidence/RX-4002-installed-matrix-review-observations.json)
- [docs/evidence/RX-4002-memory-restore.md](docs/evidence/RX-4002-memory-restore.md)
- [docs/evidence/RX-4002-memory-restore.json](docs/evidence/RX-4002-memory-restore.json)
- [docs/evidence/RX-4002-memory-restore-reconciliation.json](docs/evidence/RX-4002-memory-restore-reconciliation.json)
- [docs/evidence/RX-4002-memory-restore-executed-run.mjs](docs/evidence/RX-4002-memory-restore-executed-run.mjs)
- [docs/evidence/RX-4002-installed-matrix-review.md](docs/evidence/RX-4002-installed-matrix-review.md)
- [docs/evidence/RX-4002-announcements.md](docs/evidence/RX-4002-announcements.md)
- [docs/evidence/RX-4002-announcement-observations.json](docs/evidence/RX-4002-announcement-observations.json)
- [docs/evidence/RX-4002-announcements-package.json](docs/evidence/RX-4002-announcements-package.json)
- [docs/evidence/RX-4002-announcements-review.md](docs/evidence/RX-4002-announcements-review.md)
- [docs/evidence/RX-4002-announcements-validation.json](docs/evidence/RX-4002-announcements-validation.json)
- [docs/evidence/RX-4002-announcements-check.log](docs/evidence/RX-4002-announcements-check.log)
- [docs/evidence/RX-4002-announcements-busy.md](docs/evidence/RX-4002-announcements-busy.md)
- [docs/evidence/RX-4002-announcements-busy-validation.json](docs/evidence/RX-4002-announcements-busy-validation.json)
- [docs/evidence/RX-4002-announcements-busy-review.md](docs/evidence/RX-4002-announcements-busy-review.md)
- [docs/evidence/RX-4002-announcements-busy-check.log](docs/evidence/RX-4002-announcements-busy-check.log)
- [docs/accessibility/RX-4002-announcement-investigation.md](docs/accessibility/RX-4002-announcement-investigation.md)
- [docs/evidence/RX-4002-input.md](docs/evidence/RX-4002-input.md)
- [docs/evidence/RX-4002-input-focused.log](docs/evidence/RX-4002-input-focused.log)
- [docs/evidence/RX-4002-input-check.log](docs/evidence/RX-4002-input-check.log)
- [docs/evidence/RX-4002-input-package.json](docs/evidence/RX-4002-input-package.json)
- [docs/evidence/RX-4002-input-serve-validation.json](docs/evidence/RX-4002-input-serve-validation.json)
- [docs/evidence/RX-4002-input-inspection.json](docs/evidence/RX-4002-input-inspection.json)
- [docs/evidence/RX-4002-dead-key.md](docs/evidence/RX-4002-dead-key.md)
- [docs/evidence/RX-4002-dead-key.json](docs/evidence/RX-4002-dead-key.json)
- [docs/evidence/RX-4002-memory-browser-first-smoke.json.gz](docs/evidence/RX-4002-memory-browser-first-smoke.json.gz)
- [docs/evidence/RX-4002-memory-browser-focused.log](docs/evidence/RX-4002-memory-browser-focused.log)
- [docs/evidence/RX-4002-memory-browser-profiles-1000-0.json.gz](docs/evidence/RX-4002-memory-browser-profiles-1000-0.json.gz)
- [docs/evidence/RX-4002-memory-browser-profiles-1000-1.json.gz](docs/evidence/RX-4002-memory-browser-profiles-1000-1.json.gz)
- [docs/evidence/RX-4002-memory-browser-profiles-1000-2.json.gz](docs/evidence/RX-4002-memory-browser-profiles-1000-2.json.gz)
- [docs/evidence/RX-4002-memory-browser-profiles-10000-0.json.gz](docs/evidence/RX-4002-memory-browser-profiles-10000-0.json.gz)
- [docs/evidence/RX-4002-memory-browser-profiles-10000-1.json.gz](docs/evidence/RX-4002-memory-browser-profiles-10000-1.json.gz)
- [docs/evidence/RX-4002-memory-browser-profiles-10000-2.json.gz](docs/evidence/RX-4002-memory-browser-profiles-10000-2.json.gz)
- [docs/evidence/RX-4002-memory-browser-second-smoke.json.gz](docs/evidence/RX-4002-memory-browser-second-smoke.json.gz)
- [docs/evidence/RX-4002-memory-browser.json.gz](docs/evidence/RX-4002-memory-browser.json.gz)
- [docs/evidence/RX-4002-memory-browser.md](docs/evidence/RX-4002-memory-browser.md)
- [docs/evidence/RX-4002-memory-browser-check.log](docs/evidence/RX-4002-memory-browser-check.log)
- [docs/evidence/RX-4002-memory-browser-review.md](docs/evidence/RX-4002-memory-browser-review.md)
- [docs/evidence/RX-4002-memory-browser-run.log](docs/evidence/RX-4002-memory-browser-run.log)
- [docs/evidence/RX-4002-memory-collection-cohort-1000-fields.json.gz](docs/evidence/RX-4002-memory-collection-cohort-1000-fields.json.gz)
- [docs/evidence/RX-4002-memory-collection-cohort-1000-joint.json.gz](docs/evidence/RX-4002-memory-collection-cohort-1000-joint.json.gz)
- [docs/evidence/RX-4002-memory-collection-cohort-1000-noop.json.gz](docs/evidence/RX-4002-memory-collection-cohort-1000-noop.json.gz)
- [docs/evidence/RX-4002-memory-collection-cohort-1000-reverse.json.gz](docs/evidence/RX-4002-memory-collection-cohort-1000-reverse.json.gz)
- [docs/evidence/RX-4002-memory-collection-cohort-1000-side.json.gz](docs/evidence/RX-4002-memory-collection-cohort-1000-side.json.gz)
- [docs/evidence/RX-4002-memory-collection-cohort-10000-fields.json.gz](docs/evidence/RX-4002-memory-collection-cohort-10000-fields.json.gz)
- [docs/evidence/RX-4002-memory-collection-cohort-10000-joint.json.gz](docs/evidence/RX-4002-memory-collection-cohort-10000-joint.json.gz)
- [docs/evidence/RX-4002-memory-collection-cohort-10000-noop.json.gz](docs/evidence/RX-4002-memory-collection-cohort-10000-noop.json.gz)
- [docs/evidence/RX-4002-memory-collection-cohort-10000-reverse.json.gz](docs/evidence/RX-4002-memory-collection-cohort-10000-reverse.json.gz)
- [docs/evidence/RX-4002-memory-collection-cohort-10000-side.json.gz](docs/evidence/RX-4002-memory-collection-cohort-10000-side.json.gz)
- [docs/evidence/RX-4002-memory-collection-environment.json](docs/evidence/RX-4002-memory-collection-environment.json)
- [docs/evidence/RX-4002-memory-collection-focused.log](docs/evidence/RX-4002-memory-collection-focused.log)
- [docs/evidence/RX-4002-memory-collection-guard-tests.log](docs/evidence/RX-4002-memory-collection-guard-tests.log)
- [docs/evidence/RX-4002-memory-collection-identity-audit.json](docs/evidence/RX-4002-memory-collection-identity-audit.json)
- [docs/evidence/RX-4002-memory-collection-independent-audit.json](docs/evidence/RX-4002-memory-collection-independent-audit.json)
- [docs/evidence/RX-4002-memory-collection-reconciliation.json](docs/evidence/RX-4002-memory-collection-reconciliation.json)
- [docs/evidence/RX-4002-memory-collection-run.log](docs/evidence/RX-4002-memory-collection-run.log)
- [docs/evidence/RX-4002-memory-collection-smoke.json.gz](docs/evidence/RX-4002-memory-collection-smoke.json.gz)
- [docs/evidence/RX-4002-memory-collection-v1-sources.json.gz](docs/evidence/RX-4002-memory-collection-v1-sources.json.gz)
- [docs/evidence/RX-4002-memory-collection.json](docs/evidence/RX-4002-memory-collection.json)
- [docs/evidence/RX-4002-memory-collection.md](docs/evidence/RX-4002-memory-collection.md)
- [docs/evidence/RX-4002-memory-collection-check.log](docs/evidence/RX-4002-memory-collection-check.log)
- [docs/evidence/RX-4002-memory-collection-review.md](docs/evidence/RX-4002-memory-collection-review.md)
- [docs/evidence/RX-4002-memory-mutation-baseline-check.log](docs/evidence/RX-4002-memory-mutation-baseline-check.log)
- [docs/evidence/RX-4002-memory-mutation-cohort-core-only-1000-cancel.json.gz](docs/evidence/RX-4002-memory-mutation-cohort-core-only-1000-cancel.json.gz)
- [docs/evidence/RX-4002-memory-mutation-cohort-core-only-1000-commit.json.gz](docs/evidence/RX-4002-memory-mutation-cohort-core-only-1000-commit.json.gz)
- [docs/evidence/RX-4002-memory-mutation-cohort-core-only-10000-cancel.json.gz](docs/evidence/RX-4002-memory-mutation-cohort-core-only-10000-cancel.json.gz)
- [docs/evidence/RX-4002-memory-mutation-cohort-core-only-10000-commit.json.gz](docs/evidence/RX-4002-memory-mutation-cohort-core-only-10000-commit.json.gz)
- [docs/evidence/RX-4002-memory-mutation-cohort-positions-offsets-1000-cancel.json.gz](docs/evidence/RX-4002-memory-mutation-cohort-positions-offsets-1000-cancel.json.gz)
- [docs/evidence/RX-4002-memory-mutation-cohort-positions-offsets-1000-commit.json.gz](docs/evidence/RX-4002-memory-mutation-cohort-positions-offsets-1000-commit.json.gz)
- [docs/evidence/RX-4002-memory-mutation-cohort-positions-offsets-10000-cancel.json.gz](docs/evidence/RX-4002-memory-mutation-cohort-positions-offsets-10000-cancel.json.gz)
- [docs/evidence/RX-4002-memory-mutation-cohort-positions-offsets-10000-commit.json.gz](docs/evidence/RX-4002-memory-mutation-cohort-positions-offsets-10000-commit.json.gz)
- [docs/evidence/RX-4002-memory-mutation-cohort-source-phrase-1000-cancel.json.gz](docs/evidence/RX-4002-memory-mutation-cohort-source-phrase-1000-cancel.json.gz)
- [docs/evidence/RX-4002-memory-mutation-cohort-source-phrase-1000-commit.json.gz](docs/evidence/RX-4002-memory-mutation-cohort-source-phrase-1000-commit.json.gz)
- [docs/evidence/RX-4002-memory-mutation-cohort-source-phrase-10000-cancel.json.gz](docs/evidence/RX-4002-memory-mutation-cohort-source-phrase-10000-cancel.json.gz)
- [docs/evidence/RX-4002-memory-mutation-cohort-source-phrase-10000-commit.json.gz](docs/evidence/RX-4002-memory-mutation-cohort-source-phrase-10000-commit.json.gz)
- [docs/evidence/RX-4002-memory-mutation-development.json.gz](docs/evidence/RX-4002-memory-mutation-development.json.gz)
- [docs/evidence/RX-4002-memory-mutation-focused.log](docs/evidence/RX-4002-memory-mutation-focused.log)
- [docs/evidence/RX-4002-memory-mutation-independent-audit.json](docs/evidence/RX-4002-memory-mutation-independent-audit.json)
- [docs/evidence/RX-4002-memory-mutation-independent-audit.mjs](docs/evidence/RX-4002-memory-mutation-independent-audit.mjs)
- [docs/evidence/RX-4002-memory-mutation-review.md](docs/evidence/RX-4002-memory-mutation-review.md)
- [docs/evidence/RX-4002-memory-mutation-run.log](docs/evidence/RX-4002-memory-mutation-run.log)
- [docs/evidence/RX-4002-memory-mutation.json](docs/evidence/RX-4002-memory-mutation.json)
- [docs/evidence/RX-4002-memory-mutation.md](docs/evidence/RX-4002-memory-mutation.md)
- [docs/evidence/RX-4002-memory-mutation-check.log](docs/evidence/RX-4002-memory-mutation-check.log)
- [docs/evidence/RX-4002-memory-mutation-ci.log](docs/evidence/RX-4002-memory-mutation-ci.log)
- [docs/evidence/RX-4002-memory-codec-baseline-check.log](docs/evidence/RX-4002-memory-codec-baseline-check.log)
- [docs/evidence/RX-4002-memory-codec-calibration.json.gz](docs/evidence/RX-4002-memory-codec-calibration.json.gz)
- [docs/evidence/RX-4002-memory-codec-ci.log](docs/evidence/RX-4002-memory-codec-ci.log)
- [docs/evidence/RX-4002-memory-codec-cohort-1000-decode-envelope.json.gz](docs/evidence/RX-4002-memory-codec-cohort-1000-decode-envelope.json.gz)
- [docs/evidence/RX-4002-memory-codec-cohort-1000-encode-envelope.json.gz](docs/evidence/RX-4002-memory-codec-cohort-1000-encode-envelope.json.gz)
- [docs/evidence/RX-4002-memory-codec-cohort-1000-encode-prejoin.json.gz](docs/evidence/RX-4002-memory-codec-cohort-1000-encode-prejoin.json.gz)
- [docs/evidence/RX-4002-memory-codec-cohort-1000-restore-precommit.json.gz](docs/evidence/RX-4002-memory-codec-cohort-1000-restore-precommit.json.gz)
- [docs/evidence/RX-4002-memory-codec-cohort-10000-decode-envelope.json.gz](docs/evidence/RX-4002-memory-codec-cohort-10000-decode-envelope.json.gz)
- [docs/evidence/RX-4002-memory-codec-cohort-10000-encode-envelope.json.gz](docs/evidence/RX-4002-memory-codec-cohort-10000-encode-envelope.json.gz)
- [docs/evidence/RX-4002-memory-codec-cohort-10000-encode-prejoin.json.gz](docs/evidence/RX-4002-memory-codec-cohort-10000-encode-prejoin.json.gz)
- [docs/evidence/RX-4002-memory-codec-cohort-10000-restore-precommit.json.gz](docs/evidence/RX-4002-memory-codec-cohort-10000-restore-precommit.json.gz)
- [docs/evidence/RX-4002-memory-codec-focused.log](docs/evidence/RX-4002-memory-codec-focused.log)
- [docs/evidence/RX-4002-memory-codec-independent-audit.json](docs/evidence/RX-4002-memory-codec-independent-audit.json)
- [docs/evidence/RX-4002-memory-codec-independent-audit.mjs](docs/evidence/RX-4002-memory-codec-independent-audit.mjs)
- [docs/evidence/RX-4002-memory-codec-review.md](docs/evidence/RX-4002-memory-codec-review.md)
- [docs/evidence/RX-4002-memory-codec-run.log](docs/evidence/RX-4002-memory-codec-run.log)
- [docs/evidence/RX-4002-memory-codec.json](docs/evidence/RX-4002-memory-codec.json)
- [docs/evidence/RX-4002-memory-codec.md](docs/evidence/RX-4002-memory-codec.md)
- [docs/evidence/RX-4002-memory-codec-check.log](docs/evidence/RX-4002-memory-codec-check.log)
- [docs/evidence/RX-4002-memory-transport-baseline-check.log](docs/evidence/RX-4002-memory-transport-baseline-check.log)
- [docs/evidence/RX-4002-memory-transport-calibration-trace.json.gz](docs/evidence/RX-4002-memory-transport-calibration-trace.json.gz)
- [docs/evidence/RX-4002-memory-transport-calibration.json.gz](docs/evidence/RX-4002-memory-transport-calibration.json.gz)
- [docs/evidence/RX-4002-memory-transport-ci.log](docs/evidence/RX-4002-memory-transport-ci.log)
- [docs/evidence/RX-4002-memory-transport-feasibility-audit.json](docs/evidence/RX-4002-memory-transport-feasibility-audit.json)
- [docs/evidence/RX-4002-memory-transport-feasibility-audit.mjs](docs/evidence/RX-4002-memory-transport-feasibility-audit.mjs)
- [docs/evidence/RX-4002-memory-transport-feasibility.json.gz](docs/evidence/RX-4002-memory-transport-feasibility.json.gz)
- [docs/evidence/RX-4002-memory-transport-focused.log](docs/evidence/RX-4002-memory-transport-focused.log)
- [docs/evidence/RX-4002-memory-transport-independent-audit.json](docs/evidence/RX-4002-memory-transport-independent-audit.json)
- [docs/evidence/RX-4002-memory-transport-independent-audit.mjs](docs/evidence/RX-4002-memory-transport-independent-audit.mjs)
- [docs/evidence/RX-4002-memory-transport-review.md](docs/evidence/RX-4002-memory-transport-review.md)
- [docs/evidence/RX-4002-memory-transport-run.log](docs/evidence/RX-4002-memory-transport-run.log)
- [docs/evidence/RX-4002-memory-transport-trace-1000-0.json.gz](docs/evidence/RX-4002-memory-transport-trace-1000-0.json.gz)
- [docs/evidence/RX-4002-memory-transport-trace-1000-1.json.gz](docs/evidence/RX-4002-memory-transport-trace-1000-1.json.gz)
- [docs/evidence/RX-4002-memory-transport-trace-1000-2.json.gz](docs/evidence/RX-4002-memory-transport-trace-1000-2.json.gz)
- [docs/evidence/RX-4002-memory-transport-trace-10000-0.json.gz](docs/evidence/RX-4002-memory-transport-trace-10000-0.json.gz)
- [docs/evidence/RX-4002-memory-transport-trace-10000-1.json.gz](docs/evidence/RX-4002-memory-transport-trace-10000-1.json.gz)
- [docs/evidence/RX-4002-memory-transport-trace-10000-2.json.gz](docs/evidence/RX-4002-memory-transport-trace-10000-2.json.gz)
- [docs/evidence/RX-4002-memory-transport.json](docs/evidence/RX-4002-memory-transport.json)
- [docs/evidence/RX-4002-memory-transport.md](docs/evidence/RX-4002-memory-transport.md)
- [docs/evidence/RX-4002-memory-transport-calibration-audit.json](docs/evidence/RX-4002-memory-transport-calibration-audit.json)
- [docs/evidence/RX-4002-memory-transport-check.log](docs/evidence/RX-4002-memory-transport-check.log)
- [docs/evidence/RX-4002-memory-peak-capability.md](docs/evidence/RX-4002-memory-peak-capability.md)
- [docs/evidence/RX-4002-memory-peak-capability.json](docs/evidence/RX-4002-memory-peak-capability.json)
- [docs/evidence/RX-4002-memory-peak-capability.json.gz](docs/evidence/RX-4002-memory-peak-capability.json.gz)
- [docs/evidence/RX-4002-memory-peak-capability-independent-audit.json](docs/evidence/RX-4002-memory-peak-capability-independent-audit.json)
- [docs/evidence/RX-4002-peaks-at.md](docs/evidence/RX-4002-peaks-at.md)
- [docs/evidence/RX-4002-focus-package.json](docs/evidence/RX-4002-focus-package.json)
- [docs/evidence/RX-4002-peaks-at-review.md](docs/evidence/RX-4002-peaks-at-review.md)
- [docs/evidence/RX-4002-peaks-at-identity.json](docs/evidence/RX-4002-peaks-at-identity.json)
- [docs/evidence/RX-4002-peaks-at-identity.mjs](docs/evidence/RX-4002-peaks-at-identity.mjs)
- [docs/evidence/RX-4002-peaks-at-check.log](docs/evidence/RX-4002-peaks-at-check.log)
- [docs/evidence/RX-4002-inspector-focus-20261027.md](docs/evidence/RX-4002-inspector-focus-20261027.md)
- [docs/evidence/RX-4002-inspector-focus-20261027.json](docs/evidence/RX-4002-inspector-focus-20261027.json)
- [docs/evidence/RX-4002-inspector-focus-package-20261027.json.gz](docs/evidence/RX-4002-inspector-focus-package-20261027.json.gz)
- [docs/evidence/RX-4002-normal-typing-20261027.md](docs/evidence/RX-4002-normal-typing-20261027.md)
- [docs/evidence/RX-4002-native-events-20261027.md](docs/evidence/RX-4002-native-events-20261027.md)
- [docs/evidence/RX-4002-native-events-20261027.json.gz](docs/evidence/RX-4002-native-events-20261027.json.gz)
- [docs/evidence/RX-4002-native-events-audit-20261027.json](docs/evidence/RX-4002-native-events-audit-20261027.json)
- [docs/evidence/RX-4002-native-events-audit.mjs](docs/evidence/RX-4002-native-events-audit.mjs)
- [docs/evidence/RX-4002-runtime-instrumentation-20261028.md](docs/evidence/RX-4002-runtime-instrumentation-20261028.md)
- [docs/evidence/RX-4002-runtime-instrumentation-identity-20261028.json](docs/evidence/RX-4002-runtime-instrumentation-identity-20261028.json)
- [docs/evidence/RX-4002-runtime-public-controls-20261028.json.gz](docs/evidence/RX-4002-runtime-public-controls-20261028.json.gz)
- [docs/evidence/RX-4002-managed-runtime-20261028.json.gz](docs/evidence/RX-4002-managed-runtime-20261028.json.gz)
- [docs/evidence/RX-4002-runtime-archive-audit-20261028.mjs](docs/evidence/RX-4002-runtime-archive-audit-20261028.mjs)
- [docs/evidence/RX-4002-managed-runtime-audit-20261028.py](docs/evidence/RX-4002-managed-runtime-audit-20261028.py)
- [docs/evidence/RX-4002-runtime-check-20261028.log](docs/evidence/RX-4002-runtime-check-20261028.log)
- [docs/evidence/RX-4002-runtime-final-review-20261028.json](docs/evidence/RX-4002-runtime-final-review-20261028.json)
- [docs/evidence/RX-4002-runtime-workloads-20261028.md](docs/evidence/RX-4002-runtime-workloads-20261028.md)
- [docs/evidence/RX-4002-runtime-workloads-identity-20261028.json](docs/evidence/RX-4002-runtime-workloads-identity-20261028.json)
- [docs/evidence/RX-4002-runtime-workloads-20261028.tar.gz](docs/evidence/RX-4002-runtime-workloads-20261028.tar.gz)
- [bench/memory/runtime-audit.py](bench/memory/runtime-audit.py)
- [bench/memory/runtime-archive.py](bench/memory/runtime-archive.py)
- [docs/evidence/RX-4002-runtime-workloads-check-20261028.log](docs/evidence/RX-4002-runtime-workloads-check-20261028.log)
- [docs/evidence/RX-4002-runtime-workloads-review-20261028.json](docs/evidence/RX-4002-runtime-workloads-review-20261028.json)
- [docs/evidence/RX-4002-gc-message-20261028.md](docs/evidence/RX-4002-gc-message-20261028.md)
- [docs/evidence/RX-4002-gc-message-identity-20261028.json](docs/evidence/RX-4002-gc-message-identity-20261028.json)
- [docs/evidence/RX-4002-gc-message-20261028.tar.gz](docs/evidence/RX-4002-gc-message-20261028.tar.gz)
- [docs/evidence/RX-4002-gc-message-receiver-20261028.tar.gz](docs/evidence/RX-4002-gc-message-receiver-20261028.tar.gz)
- [bench/memory/gc-runtime-audit.py](bench/memory/gc-runtime-audit.py)
- [bench/memory/gc-runtime-audit.test.py](bench/memory/gc-runtime-audit.test.py)
- [docs/evidence/RX-4002-gc-message-check-20261028.log](docs/evidence/RX-4002-gc-message-check-20261028.log)
- [docs/evidence/RX-4002-gc-message-review-20261028.json](docs/evidence/RX-4002-gc-message-review-20261028.json)
- [docs/evidence/RX-4002-codecs-copy-20261028.md](docs/evidence/RX-4002-codecs-copy-20261028.md)
- [docs/evidence/RX-4002-codecs-copy-identity-20261028.json](docs/evidence/RX-4002-codecs-copy-identity-20261028.json)
- [docs/evidence/RX-4002-codecs-copy-reconstruction-20261028.json](docs/evidence/RX-4002-codecs-copy-reconstruction-20261028.json)
- [docs/evidence/RX-4002-codecs-copy-check-20261028.log](docs/evidence/RX-4002-codecs-copy-check-20261028.log)
- [docs/evidence/RX-4002-codecs-copy-raw-01-20261028.tar.xz](docs/evidence/RX-4002-codecs-copy-raw-01-20261028.tar.xz)
- [docs/evidence/RX-4002-codecs-copy-raw-02-20261028.tar.xz](docs/evidence/RX-4002-codecs-copy-raw-02-20261028.tar.xz)
- [docs/evidence/RX-4002-codecs-copy-raw-03-20261028.tar.xz](docs/evidence/RX-4002-codecs-copy-raw-03-20261028.tar.xz)
- [docs/evidence/RX-4002-codecs-copy-raw-04-20261028.tar.xz](docs/evidence/RX-4002-codecs-copy-raw-04-20261028.tar.xz)
- [docs/evidence/RX-4002-codecs-copy-20261028.tar.xz](docs/evidence/RX-4002-codecs-copy-20261028.tar.xz)
- [docs/evidence/RX-4002-codecs-copy-review-20261028.json](docs/evidence/RX-4002-codecs-copy-review-20261028.json)
- [docs/evidence/RX-4002-gc-shrink-20261028.md](docs/evidence/RX-4002-gc-shrink-20261028.md)
- [docs/evidence/RX-4002-gc-shrink-20261028.tar.xz](docs/evidence/RX-4002-gc-shrink-20261028.tar.xz)
- [docs/evidence/RX-4002-gc-shrink-raw-index-20261028.json](docs/evidence/RX-4002-gc-shrink-raw-index-20261028.json)
- [docs/evidence/RX-4002-gc-shrink-summary-20261028.json](docs/evidence/RX-4002-gc-shrink-summary-20261028.json)
- [docs/evidence/RX-4002-gc-shrink-reconstruction-20261028.json](docs/evidence/RX-4002-gc-shrink-reconstruction-20261028.json)
- [docs/evidence/RX-4002-wire-frontiers-20261028.json](docs/evidence/RX-4002-wire-frontiers-20261028.json)
- [docs/evidence/RX-4002-gc-shrink-identity-20261028.json](docs/evidence/RX-4002-gc-shrink-identity-20261028.json)
- [docs/evidence/RX-4002-gc-shrink-review-20261028.json](docs/evidence/RX-4002-gc-shrink-review-20261028.json)
- [docs/evidence/RX-4002-gc-shrink-check-20261028.log](docs/evidence/RX-4002-gc-shrink-check-20261028.log)


## RX-4003

**Package, public documentation, and independent candidate review**

**Milestone:** N4 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/27)

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

- [docs/evidence/RX-4003.md](docs/evidence/RX-4003.md)
- [docs/evidence/RX-4003-review.json](docs/evidence/RX-4003-review.json)
- [docs/evidence/RX-4003-identity.json](docs/evidence/RX-4003-identity.json)
- [docs/evidence/RX-4003-package.json](docs/evidence/RX-4003-package.json)
- [docs/evidence/RX-4003-preparation.json](docs/evidence/RX-4003-preparation.json)
- [docs/evidence/RX-4003-check.log](docs/evidence/RX-4003-check.log)
- [docs/evidence/RX-4003-candidate-0.1.0-rc.0.tgz](docs/evidence/RX-4003-candidate-0.1.0-rc.0.tgz)
- [docs/evidence/RX-4003-bundle.json](docs/evidence/RX-4003-bundle.json)
- [docs/evidence/RX-4003-workflow-audit.json](docs/evidence/RX-4003-workflow-audit.json)
- [docs/evidence/RX-4003-baseline-check.log](docs/evidence/RX-4003-baseline-check.log)
- [docs/evidence/RX-4003-focused.log](docs/evidence/RX-4003-focused.log)
- [docs/evidence/RX-4003-preparation-guards.log](docs/evidence/RX-4003-preparation-guards.log)
- [docs/evidence/RX-4003-sandbox-failure.json](docs/evidence/RX-4003-sandbox-failure.json)
- [docs/evidence/RX-4003-sync.log](docs/evidence/RX-4003-sync.log)
- [docs/evidence/RX-4003-remote-ci-20261028.md](docs/evidence/RX-4003-remote-ci-20261028.md)
- [docs/evidence/RX-4003-remote-ci-20261028.json](docs/evidence/RX-4003-remote-ci-20261028.json)
- [docs/evidence/RX-4003-remote-ci-20261028.tar.gz](docs/evidence/RX-4003-remote-ci-20261028.tar.gz)
- [docs/evidence/RX-4003-ci-node22-20261028.zip](docs/evidence/RX-4003-ci-node22-20261028.zip)
- [docs/evidence/RX-4003-ci-node24-20261028.zip](docs/evidence/RX-4003-ci-node24-20261028.zip)
- [docs/evidence/RX-4003-remote-ci-identity-20261028.json](docs/evidence/RX-4003-remote-ci-identity-20261028.json)
- [docs/evidence/RX-4003-remote-ci-review-20261028.json](docs/evidence/RX-4003-remote-ci-review-20261028.json)
- [docs/evidence/RX-4003-remote-ci-sync-20261028.log](docs/evidence/RX-4003-remote-ci-sync-20261028.log)


## RX-5001

**Shared site shell and responsive reading styles**

**Milestone:** N6 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-5001%22)

**Dependencies:** [RX-4003](IMPLEMENTATION_TASKS.md#rx-4003)

Apply the reference typography, white reading surface, chartreuse actions and shared navigation without changing search or package behavior.

**Expected affected areas**

`site/Layout.astro`, `site/styles.css`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[SITE_WORKBENCH.md](docs/specs/SITE_WORKBENCH.md)

**Acceptance criteria**

- RX-5001-AC01: Shared header, current-location navigation, footer and skip link are semantic and keyboard reachable.
- RX-5001-AC02: Documentation remains legible with bounded prose and internally scrollable code/tables across narrow and wide layouts.

**Verification**

- Run focused source/site or browser checks appropriate to this slice, then record exact outcomes and limitations.
- Write docs/evidence/RX-5001.md before marking done; run docs:generate after state changes.

**Recorded evidence**

- [docs/evidence/RX-5001.md](docs/evidence/RX-5001.md)


## RX-5002

**Homepage with real Search Workbench**

**Milestone:** N6 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-5002%22)

**Dependencies:** [RX-5001](IMPLEMENTATION_TASKS.md#rx-5001)

Implement the reference homepage using the existing installed-package usage demo, real query buttons and explicit initialization recovery.

**Expected affected areas**

`site/`, `scripts/build-pages.mjs`, `examples/docs-search/main.mjs`, `test/pages/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[SITE_WORKBENCH.md](docs/specs/SITE_WORKBENCH.md)

**Acceptance criteria**

- RX-5002-AC01: Home shows the selected headline, action, dark workbench and integration follow-through while retaining existing deep links.
- RX-5002-AC02: Initial and sample queries use real retrieval; filters, totals, pagination, highlights and Inspector are retained.
- RX-5002-AC03: Bundle-relative assets work at home; unavailable, loading, initialization failure and no-JavaScript paths are understandable.

**Verification**

- Run focused source/site or browser checks appropriate to this slice, then record exact outcomes and limitations.
- Write docs/evidence/RX-5002.md before marking done; run docs:generate after state changes.

**Recorded evidence**

- [docs/evidence/RX-5002.md](docs/evidence/RX-5002.md)


## RX-5003

**Dedicated demo and shared behavior**

**Milestone:** N6 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-5003%22)

**Dependencies:** [RX-5002](IMPLEMENTATION_TASKS.md#rx-5002)

Apply the same workbench and navigation to the dedicated demo while preserving direct/worker, representation, phrase and teardown behavior.

**Expected affected areas**

`site/Demo.astro`, `site/SearchWorkbench.astro`, `scripts/build-pages.mjs`, `test/pages/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[SITE_WORKBENCH.md](docs/specs/SITE_WORKBENCH.md)

**Acceptance criteria**

- RX-5003-AC01: Demo and home share their visual component and assets without duplicating search engines.
- RX-5003-AC02: Advanced mode/representation/worker switches preserve queries and remain consistent with direct results.
- RX-5003-AC03: Destroy/reinitialize, errors, empty recovery and Inspector focus restoration remain functional.

**Verification**

- Run focused source/site or browser checks appropriate to this slice, then record exact outcomes and limitations.
- Write docs/evidence/RX-5003.md before marking done; run docs:generate after state changes.

**Recorded evidence**

- [docs/evidence/RX-5003.md](docs/evidence/RX-5003.md)


## RX-5004

**Workbench verification and project synchronization**

**Milestone:** N6 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-5004%22)

**Dependencies:** [RX-5003](IMPLEMENTATION_TASKS.md#rx-5003)

Verify the implemented design, record actual evidence and synchronize project guidance and generated plans.

**Expected affected areas**

`test/pages/`, `docs/evidence/`, `PROJECT_CONTEXT.md`, `CODEX_HANDOFF.md`, `site/README.md`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[SITE_WORKBENCH.md](docs/specs/SITE_WORKBENCH.md)

**Acceptance criteria**

- RX-5004-AC01: Browser checks cover real results, keyboard, no-JavaScript, delayed/failed loading, retry and mobile/desktop reflow.
- RX-5004-AC02: Actual desktop/mobile screenshots and local commands/environments are recorded with precise manual-test limitations.
- RX-5004-AC03: Project checks, generated site inventory and documentation agree with completed implementation; no publication is implied.

**Verification**

- Run focused source/site or browser checks appropriate to this slice, then record exact outcomes and limitations.
- Write docs/evidence/RX-5004.md before marking done; run docs:generate after state changes.

**Recorded evidence**

- [docs/evidence/RX-5004.md](docs/evidence/RX-5004.md)
- [docs/evidence/RX-5004-pages-browser.json](docs/evidence/RX-5004-pages-browser.json)
- [docs/evidence/RX-5004-images/home-desktop.png](docs/evidence/RX-5004-images/home-desktop.png)
- [docs/evidence/RX-5004-images/home-mobile.png](docs/evidence/RX-5004-images/home-mobile.png)
- [docs/evidence/RX-5004-AVAILABILITY-20261103.md](docs/evidence/RX-5004-AVAILABILITY-20261103.md)


## RX-5005

**Final-word prefix search in the demo**

**Milestone:** N6 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-5005%22)

**Dependencies:** [RX-5004](IMPLEMENTATION_TASKS.md#rx-5004)

Make final-word prefix matching the ordinary demo default, retaining exact-word and strict-phrase advanced modes and existing UI lifecycle.

**Expected affected areas**

`src/addons/ui/`, `examples/docs-search/`, `site/`, `scripts/lib/ui-consumer.mjs`, `test/ui/`, `test/pages/`, `docs/api/HOSTS.md`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[SITE_WORKBENCH.md](docs/specs/SITE_WORKBENCH.md)

**Acceptance criteria**

- RX-5005-AC01: Home and ordinary demo require exact earlier words and expand the final word from two normalized Unicode code points, with exact fallback for shorter words; core and UI integration defaults remain exact.
- RX-5005-AC02: Advanced settings retain exact-word and strict adjacent phrase modes, and mode/host/representation changes preserve the query.
- RX-5005-AC03: Independent-oracle browser checks verify results, full-word highlights, category filters and complete pagination in direct and worker execution with source and offset snippets.
- RX-5005-AC04: Focus, composition, cancellation, Inspector and teardown regressions pass; package, site, API docs and generated plans agree with recorded evidence.

**Verification**

- Run focused UI and site browser checks plus npm run check, pages generation and inventory validation.
- Record exact commands/environments, acceptance outcomes, limitations and review in docs/evidence/RX-5005.md before marking done.

**Recorded evidence**

- [docs/evidence/RX-5005.md](docs/evidence/RX-5005.md)
- [docs/evidence/RX-5005-raw.tar.gz](docs/evidence/RX-5005-raw.tar.gz)


## RX-6001

**Consumer inline foundation and compatible preset contract**

**Milestone:** N7 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-6001%22)

**Dependencies:** [RX-5005](IMPLEMENTATION_TASKS.md#rx-5005)

Prove a minimal installed Pagefind-style inline search path and freeze the smallest additive consumer UI, ownership and styling contract before expanding shared internals.

**Expected affected areas**

`src/addons/ui/`, `package.json`, `tsconfig.ui.json`, `tsconfig.ui.build.json`, `test/ui/`, `test/consumer/`, `docs/api/HOSTS.md`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[SEARCH_SOLUTIONS.md](docs/specs/SEARCH_SOLUTIONS.md), [SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md](docs/planning/SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md)

**Acceptance criteria**

- RX-6001-AC01: An explicit optional inline entry point mounts a labeled form, clear/submit actions, deliberate idle state and real native title/link results with exact totals and order.
- RX-6001-AC02: The title/link-only consumer works with core alone; snippets, facets, Inspector and rich metadata are not hidden mandatory registrations or retained side state.
- RX-6001-AC03: Consumer prefix selection preserves exact earlier words, the existing final-word threshold and native refusals; legacy mountRaveldexUI strict options, omitted-mode exact default, Workbench and frozen corpus remain unchanged.
- RX-6001-AC04: Additive public options/handles, display capture/validation, message overrides and initial scoped CSS properties are documented; IDs, safe URLs, duplicate mounts and independent instances have explicit behavior.
- RX-6001-AC05: Composition, debouncing, cancellation, stale-response suppression, focus preservation and idempotent destroy/remount work through the real engine; destroying a preset never disposes its borrowed engine.
- RX-6001-AC06: New preset imports and core-only imports perform no DOM/network/storage/worker/global-shortcut initialization; CSS is a separate optional import and no runtime dependency is added.
- RX-6001-AC07: Installed public exports/types and legacy/new consumer fixtures verify the exact supported entry points; any shared refactor is limited to helpers required by this vertical slice.

**Verification**

- Run focused installed public-type/export/import-isolation and browser checks for real results, Enter, clear, idle policy, composition, cancellation, duplicate mount and teardown.
- Compare exact IDs/order/totals with independent fixtures and rerun legacy UI/Workbench-relevant regressions; measure actual optional import graphs rather than asserting size or memory.
- Finalize the SS-01–07 public boundary in the contract; run applicable consumer/UI checks followed by npm run check.
- Record actual acceptance outcomes, commands, source/environment identity, review and limitations in docs/evidence/RX-6001.md before marking done; add only existing evidence and regenerate the readable roadmap.

**Recorded evidence**

- [docs/evidence/RX-6001.md](docs/evidence/RX-6001.md)
- [docs/evidence/RX-6001-browser.json](docs/evidence/RX-6001-browser.json)
- [docs/evidence/RX-6001-verification.json](docs/evidence/RX-6001-verification.json)
- [docs/evidence/RX-6001-check.log.gz](docs/evidence/RX-6001-check.log.gz)
- [docs/evidence/RX-6001-site.log.gz](docs/evidence/RX-6001-site.log.gz)
- [docs/evidence/RX-6001-desktop.png](docs/evidence/RX-6001-desktop.png)
- [docs/evidence/RX-6001-mobile.png](docs/evidence/RX-6001-mobile.png)
- [docs/evidence/RX-6001-initial-site.log.gz](docs/evidence/RX-6001-initial-site.log.gz)
- [docs/evidence/RX-6001-concurrent-site.log.gz](docs/evidence/RX-6001-concurrent-site.log.gz)


## RX-6002

**Pagefind-style inline controls, paging and theming**

**Milestone:** N7 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-6002%22)

**Dependencies:** [RX-6001](IMPLEMENTATION_TASKS.md#rx-6001)

Complete the inline consumer experience with explicitly selected snippets and simple filters, bounded Load more, recovery states and a small useful CSS customization contract.

**Expected affected areas**

`src/addons/ui/`, `test/ui/`, `test/consumer/`, `test/fixtures/`, `docs/api/HOSTS.md`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[SEARCH_SOLUTIONS.md](docs/specs/SEARCH_SOLUTIONS.md), [SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md](docs/planning/SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md), [ADDONS.md](docs/api/ADDONS.md)

**Acceptance criteria**

- RX-6002-AC01: Five-hit default batches and user-triggered Load more preserve native IDs/order/exact total, with no duplicate or omitted hits and a documented bounded display/paging continuation.
- RX-6002-AC02: Query/filter/owner/revision changes invalidate accumulated results and stale snippets/counts; late or failed requests cannot present mixed successful state.
- RX-6002-AC03: Optional snippets preserve original UTF-16 highlights, source field/value boundaries and omission facts; requested missing providers/capabilities produce useful explicit errors.
- RX-6002-AC04: Simple string filters show exact native conjunctive counts and preserve selected values outside projected buckets; directory multi-selection is not silently introduced.
- RX-6002-AC05: Idle, loading/composition, results, no-results, refused/error/retry and destroyed states retain useful input, accessible names, predictable focus and settled announcements; English defaults and message overrides are complete.
- RX-6002-AC06: Stable component-scoped classes/properties cover typography, colors, focus/highlight, spacing/density, borders/radius and dimensions; small overrides work in light/dark, forced colors, reduced motion, long/RTL labels and narrow/zoomed layouts.
- RX-6002-AC07: Consumer diagnostics stay off by default through an explicit presentation contract; legacy scores/Inspector and Workbench functional controls remain intact.

**Verification**

- Independently enumerate all hit pages/batches with filters and original snippets in direct and worker execution where installed; exercise mutation/revision races, refusal/retry and stale completion.
- Run browser keyboard/focus/composition/cleanup checks and source/offset snippet cases; inspect responsive/theme states and record human/physical checks separately.
- Measure actual rendered-output growth and optional graph bytes, run focused UI/consumer checks and npm run check.
- Record actual acceptance outcomes, commands, source/environment identity, review and limitations in docs/evidence/RX-6002.md before marking done; add only existing evidence and regenerate the readable roadmap.

**Recorded evidence**

- [docs/evidence/RX-6002.md](docs/evidence/RX-6002.md)
- [docs/evidence/RX-6002-browser.json](docs/evidence/RX-6002-browser.json)
- [docs/evidence/RX-6002-foundation.json](docs/evidence/RX-6002-foundation.json)
- [docs/evidence/RX-6002-verification.json](docs/evidence/RX-6002-verification.json)
- [docs/evidence/RX-6002-check.log.gz](docs/evidence/RX-6002-check.log.gz)
- [docs/evidence/RX-6002-targeted.log.gz](docs/evidence/RX-6002-targeted.log.gz)
- [docs/evidence/RX-6002-site.log.gz](docs/evidence/RX-6002-site.log.gz)
- [docs/evidence/RX-6002-initial-check.log.gz](docs/evidence/RX-6002-initial-check.log.gz)
- [docs/evidence/RX-6002-desktop.png](docs/evidence/RX-6002-desktop.png)
- [docs/evidence/RX-6002-mobile-rtl-dark.png](docs/evidence/RX-6002-mobile-rtl-dark.png)


## RX-6003

**Installed inline search starters for browser and Astro**

**Milestone:** N7 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-6003%22)

**Dependencies:** [RX-6002](IMPLEMENTATION_TASKS.md#rx-6002), [RX-A100](docs/planning/OPTIONAL_FEATURES.md#rx-a100)

Ship complete inline integrations that an external developer can install, supply with their own explicit content and adjust through a few CSS changes.

**Expected affected areas**

`examples/`, `integrations/astro/README.md`, `docs/api/`, `site/`, `scripts/lib/pages.mjs`, `test/consumer/`, `test/pages/`, `test/integrations/astro/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[SEARCH_SOLUTIONS.md](docs/specs/SEARCH_SOLUTIONS.md), [SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md](docs/planning/SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md), [STATIC_ASTRO.md](docs/specs/STATIC_ASTRO.md), [SITE_WORKBENCH.md](docs/specs/SITE_WORKBENCH.md)

**Acceptance criteria**

- RX-6003-AC01: Plain browser and Astro starters include complete realistic records/display mapping, required registrations, initialization/disposal, CSS, installation/build instructions and replacement-data guidance.
- RX-6003-AC02: The exact copied starters run from fresh installed private tarballs without repository-only runtime imports or technical Workbench selectors.
- RX-6003-AC03: Root and changed subdirectory bases resolve all static assets, workers if selected and result destinations correctly through the existing explicit Astro loader.
- RX-6003-AC04: Loading, delayed/failed assets, useful retry, no-JavaScript browse guidance and destruction during initialization work without leaking or disposing borrowed owners.
- RX-6003-AC05: A first inline solution entry links only to existing working starter/source files and accurate CSS recipes; current local-tarball availability and runtime requirements are stated without implying publication.
- RX-6003-AC06: Existing Workbench, real-document qualification data and strict public inventory/Jekyll exclusions remain preserved.

**Verification**

- Pack/install into fresh temporary consumer directories and execute the exact documented steps with changed sample data and CSS values.
- Run real static root/subdirectory build/preview, browser navigation, asset failure/delay/retry and ownership/teardown checks.
- For changed site inventory run pages:build, pages:check and both existing site browser suites; run relevant installed Astro/consumer checks and npm run check.
- Record actual acceptance outcomes, commands, source/environment identity, review and limitations in docs/evidence/RX-6003.md before marking done; add only existing evidence and regenerate the readable roadmap.

**Recorded evidence**

- [docs/evidence/RX-6003-astro-targeted.log.gz](docs/evidence/RX-6003-astro-targeted.log.gz)
- [docs/evidence/RX-6003-astro.json](docs/evidence/RX-6003-astro.json)
- [docs/evidence/RX-6003-browser-targeted.log.gz](docs/evidence/RX-6003-browser-targeted.log.gz)
- [docs/evidence/RX-6003-browser.json](docs/evidence/RX-6003-browser.json)
- [docs/evidence/RX-6003-desktop.png](docs/evidence/RX-6003-desktop.png)
- [docs/evidence/RX-6003-gallery.log.gz](docs/evidence/RX-6003-gallery.log.gz)
- [docs/evidence/RX-6003-initial.log.gz](docs/evidence/RX-6003-initial.log.gz)
- [docs/evidence/RX-6003-integration-check.log.gz](docs/evidence/RX-6003-integration-check.log.gz)
- [docs/evidence/RX-6003-jekyll.json](docs/evidence/RX-6003-jekyll.json)
- [docs/evidence/RX-6003-jekyll.log.gz](docs/evidence/RX-6003-jekyll.log.gz)
- [docs/evidence/RX-6003-mobile.png](docs/evidence/RX-6003-mobile.png)
- [docs/evidence/RX-6003-site.json](docs/evidence/RX-6003-site.json)
- [docs/evidence/RX-6003-site.log.gz](docs/evidence/RX-6003-site.log.gz)
- [docs/evidence/RX-6003-verification.json](docs/evidence/RX-6003-verification.json)
- [docs/evidence/RX-6003.md](docs/evidence/RX-6003.md)


## RX-6004

**Page and section display contract with static compatibility**

**Milestone:** N7 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-6004%22)

**Dependencies:** [RX-6003](IMPLEMENTATION_TASKS.md#rx-6003)

Freeze the optional page/section mapping, anchored-link, source-evidence and static-artifact rules before implementing grouped documentation presentation.

**Expected affected areas**

`docs/specs/SEARCH_SOLUTIONS.md`, `docs/specs/STATIC_ASTRO.md`, `docs/planning/SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md`, `docs/api/STATIC_ASTRO.md`, `test/fixtures/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[PAGE_SECTIONS.md](docs/specs/PAGE_SECTIONS.md), [SEARCH_SOLUTIONS.md](docs/specs/SEARCH_SOLUTIONS.md), [SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md](docs/planning/SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md), [STATIC_ASTRO.md](docs/specs/STATIC_ASTRO.md), [ADDONS.md](docs/api/ADDONS.md)

**Acceptance criteria**

- RX-6004-AC01: One native indexed record per page remains the baseline; exact totals mean pages and native page scores/order/ties/pagination remain unchanged; flat section-record demos are not reinterpreted.
- RX-6004-AC02: The contract defines owned optional page IDs, heading/anchor identity, original field/value source ranges, revision identity and URL resolution, including repeated/missing/invalid sections.
- RX-6004-AC03: At most three section previews per displayed page are the default; deterministic selection/ties, cross-section page matches, field/value boundaries, incomplete evidence and omission behavior are explicit.
- RX-6004-AC04: Finite section-map/scan/output limits and provider requirements are concrete before dependent runtime work; bounded previews are never advertised as an exact global matching-section total.
- RX-6004-AC05: The selected additive or separately versioned optional Astro display artifact defines old/new reader behavior and safe fragment handling without silently changing existing directory-route validation or snapshot semantics.
- RX-6004-AC06: Independent handwritten fixtures state expected pages/order/anchors/original ranges and failures across Unicode, repeated headings, source/offset providers, stale maps and direct/worker execution.
- RX-6004-AC07: No unresolved load-bearing mapping or compatibility choice is hidden in the implementation task; any incompatible choice is recorded before dependent work starts.

**Verification**

- Review source/evidence/UI/Astro constraints against the proposed mapping and old/new artifact compatibility cases; inspect deterministic page/section fixture expectations independently of production projection.
- Verify every contract branch and limit has an observable expected outcome and a named implementation/verification owner; run planning/docs checks and npm run check.
- Record actual acceptance outcomes, commands, source/environment identity, review and limitations in docs/evidence/RX-6004.md before marking done; add only existing evidence and regenerate the readable roadmap.

**Recorded evidence**

- [docs/evidence/RX-6004-contract.log.gz](docs/evidence/RX-6004-contract.log.gz)
- [docs/evidence/RX-6004-initial-contract.log.gz](docs/evidence/RX-6004-initial-contract.log.gz)
- [docs/evidence/RX-6004-integration-check.log.gz](docs/evidence/RX-6004-integration-check.log.gz)
- [docs/evidence/RX-6004-jekyll.json](docs/evidence/RX-6004-jekyll.json)
- [docs/evidence/RX-6004-pages.log.gz](docs/evidence/RX-6004-pages.log.gz)
- [docs/evidence/RX-6004-verification.json](docs/evidence/RX-6004-verification.json)
- [docs/evidence/RX-6004.md](docs/evidence/RX-6004.md)


## RX-6005

**Evidence-backed anchored section previews**

**Milestone:** N7 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-6005%22)

**Dependencies:** [RX-6004](IMPLEMENTATION_TASKS.md#rx-6004)

Implement optional Pagefind-style page/heading context using explicit section maps and original match evidence without changing native page retrieval.

**Expected affected areas**

`src/addons/ui/`, `integrations/astro/src/`, `test/ui/`, `test/consumer/`, `test/integrations/astro/`, `test/fixtures/`, `docs/api/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[PAGE_SECTIONS.md](docs/specs/PAGE_SECTIONS.md), [SEARCH_SOLUTIONS.md](docs/specs/SEARCH_SOLUTIONS.md), [SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md](docs/planning/SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md), [STATIC_ASTRO.md](docs/specs/STATIC_ASTRO.md)

**Acceptance criteria**

- RX-6005-AC01: Captured validated section maps project only qualifying original match evidence into safe page/heading links and bounded previews under the frozen contract.
- RX-6005-AC02: Native page IDs/scores/order/exact totals and every result page are identical with section presentation enabled or disabled; previews do not invent exact section totals.
- RX-6005-AC03: Original Unicode/prefix highlight ranges and source field/value boundaries agree with independent fixtures in source and offset modes and direct/module-worker execution.
- RX-6005-AC04: Malformed/stale/mixed maps, unavailable explicitly required evidence, invalid anchors and exhausted bounds follow the documented error/omission rules without false complete context.
- RX-6005-AC05: The approved optional static display extension and public types work for installed consumers and actual anchored destinations at root/subdirectory bases; legacy artifacts/routes and flat-section demos remain valid.
- RX-6005-AC06: Section metadata and projection costs remain optional outside core, with finite capture/output/scan limits, cancellation/freshness and cleanup evidence.

**Verification**

- Compare complete native membership/scores/order/totals/pages with projection selected and unselected, using independent original-source and anchor expectations.
- Run actual source/offset/direct/worker cases, rejected-map and artifact compatibility probes, installed public types and real anchored navigation.
- Measure optional graph/output/work costs separately from memory or capacity claims; run relevant UI/consumer/Astro regressions and npm run check.
- Record actual acceptance outcomes, commands, source/environment identity, review and limitations in docs/evidence/RX-6005.md before marking done; add only existing evidence and regenerate the readable roadmap.

**Recorded evidence**

- [docs/evidence/RX-6005-astro-targeted.log.gz](docs/evidence/RX-6005-astro-targeted.log.gz)
- [docs/evidence/RX-6005-browser.json](docs/evidence/RX-6005-browser.json)
- [docs/evidence/RX-6005-candidate.json.gz](docs/evidence/RX-6005-candidate.json.gz)
- [docs/evidence/RX-6005-check.log.gz](docs/evidence/RX-6005-check.log.gz)
- [docs/evidence/RX-6005-compatibility-raw.tar.gz](docs/evidence/RX-6005-compatibility-raw.tar.gz)
- [docs/evidence/RX-6005-compatibility.json](docs/evidence/RX-6005-compatibility.json)
- [docs/evidence/RX-6005-gallery.json](docs/evidence/RX-6005-gallery.json)
- [docs/evidence/RX-6005-initial-checks.log.gz](docs/evidence/RX-6005-initial-checks.log.gz)
- [docs/evidence/RX-6005-installed.json](docs/evidence/RX-6005-installed.json)
- [docs/evidence/RX-6005-integration-check.log.gz](docs/evidence/RX-6005-integration-check.log.gz)
- [docs/evidence/RX-6005-jekyll.json](docs/evidence/RX-6005-jekyll.json)
- [docs/evidence/RX-6005-jekyll.log.gz](docs/evidence/RX-6005-jekyll.log.gz)
- [docs/evidence/RX-6005-native-bytes.json](docs/evidence/RX-6005-native-bytes.json)
- [docs/evidence/RX-6005-pages.log.gz](docs/evidence/RX-6005-pages.log.gz)
- [docs/evidence/RX-6005-review-fix.log.gz](docs/evidence/RX-6005-review-fix.log.gz)
- [docs/evidence/RX-6005-site.json](docs/evidence/RX-6005-site.json)
- [docs/evidence/RX-6005-site.log.gz](docs/evidence/RX-6005-site.log.gz)
- [docs/evidence/RX-6005-verification.json](docs/evidence/RX-6005-verification.json)
- [docs/evidence/RX-6005.md](docs/evidence/RX-6005.md)


## RX-6006

**Documentation search modal and lifecycle**

**Milestone:** N7 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-6006%22)

**Dependencies:** [RX-6005](IMPLEMENTATION_TASKS.md#rx-6005)

Provide a complete documentation search modal around the verified consumer results, optional section previews and shared style/feedback primitives.

**Expected affected areas**

`src/addons/ui/`, `test/ui/`, `test/consumer/`, `docs/api/HOSTS.md`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[DOCS_MODAL.md](docs/specs/DOCS_MODAL.md), [SEARCH_SOLUTIONS.md](docs/specs/SEARCH_SOLUTIONS.md), [SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md](docs/planning/SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md)

**Acceptance criteria**

- RX-6006-AC01: An explicit accessible trigger opens a native dialog with pinned input/header, scrollable actual results, visible close at every size and optional contextual keyboard hints.
- RX-6006-AC02: Open focuses input, native modal behavior contains focus, Escape and deliberate backdrop activation close, and focus returns to the actual connected opener; drag-through backdrop gestures do not dismiss accidentally.
- RX-6006-AC03: Close preserves the documented query by default and cancels pending presentation; reset-on-close is explicit, reopen revalidates stale state and late work never reopens a closed/destroyed surface.
- RX-6006-AC04: Opt-in Cmd/Ctrl+K registration respects composition, editable contexts, already-handled events and independent instances; destroy removes owned bindings and restores owned scroll state.
- RX-6006-AC05: The modal borrows its engine and uses the same native query/results/section/state contracts without embedding the technical Workbench or requiring Inspector.
- RX-6006-AC06: Narrow/zoomed layouts keep search/close usable with available dynamic viewport space and contained scrolling; keyboard/links/feedback/themes and failure recovery remain usable.
- RX-6006-AC07: Repeated trigger/open/close, opener removal, search/worker failure and destroy while open or pending do not leak resources or steal unrelated focus.

**Verification**

- Run installed real-browser keyboard/pointer/open-close-reopen/composition/shortcut/focus/scroll/teardown races, including multiple instances and failed/late work.
- Check actual links and section destinations, 320-pixel reflow, theme/forced-colors/reduced-motion states; record on-screen-keyboard, physical input and exact human AT observations separately.
- Run relevant UI/consumer/worker regressions and npm run check; review native-dialog/focus ownership and shared-runtime diff.
- Record actual acceptance outcomes, commands, source/environment identity, review and limitations in docs/evidence/RX-6006.md before marking done; add only existing evidence and regenerate the readable roadmap.

**Recorded evidence**

- [docs/evidence/RX-6006-browser-summary.json](docs/evidence/RX-6006-browser-summary.json)
- [docs/evidence/RX-6006-browser.json](docs/evidence/RX-6006-browser.json)
- [docs/evidence/RX-6006-browser.log.gz](docs/evidence/RX-6006-browser.log.gz)
- [docs/evidence/RX-6006-gallery.json](docs/evidence/RX-6006-gallery.json)
- [docs/evidence/RX-6006-integration-check.log.gz](docs/evidence/RX-6006-integration-check.log.gz)
- [docs/evidence/RX-6006-jekyll.json](docs/evidence/RX-6006-jekyll.json)
- [docs/evidence/RX-6006-jekyll.log.gz](docs/evidence/RX-6006-jekyll.log.gz)
- [docs/evidence/RX-6006-modal-320x240-forced-colors.png](docs/evidence/RX-6006-modal-320x240-forced-colors.png)
- [docs/evidence/RX-6006-modal-320x240.png](docs/evidence/RX-6006-modal-320x240.png)
- [docs/evidence/RX-6006-modal-320x568-forced-colors.png](docs/evidence/RX-6006-modal-320x568-forced-colors.png)
- [docs/evidence/RX-6006-modal-320x568.png](docs/evidence/RX-6006-modal-320x568.png)
- [docs/evidence/RX-6006-modal-640x320-forced-colors.png](docs/evidence/RX-6006-modal-640x320-forced-colors.png)
- [docs/evidence/RX-6006-modal-640x320.png](docs/evidence/RX-6006-modal-640x320.png)
- [docs/evidence/RX-6006-modal-desktop.png](docs/evidence/RX-6006-modal-desktop.png)
- [docs/evidence/RX-6006-pages-audit.log.gz](docs/evidence/RX-6006-pages-audit.log.gz)
- [docs/evidence/RX-6006-pages.log.gz](docs/evidence/RX-6006-pages.log.gz)
- [docs/evidence/RX-6006-review-and-initial-raw.tar.gz](docs/evidence/RX-6006-review-and-initial-raw.tar.gz)
- [docs/evidence/RX-6006-site.json](docs/evidence/RX-6006-site.json)
- [docs/evidence/RX-6006-site.log.gz](docs/evidence/RX-6006-site.log.gz)
- [docs/evidence/RX-6006-verification.json](docs/evidence/RX-6006-verification.json)
- [docs/evidence/RX-6006.md](docs/evidence/RX-6006.md)


## RX-6007

**Installed documentation modal starters**

**Milestone:** N7 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-6007%22)

**Dependencies:** [RX-6006](IMPLEMENTATION_TASKS.md#rx-6006), [RX-A100](docs/planning/OPTIONAL_FEATURES.md#rx-a100)

Ship complete browser and Astro documentation-modal integrations with on-demand initialization, real section links and explicit owner lifecycle.

**Expected affected areas**

`examples/`, `integrations/astro/README.md`, `docs/api/`, `site/`, `scripts/lib/pages.mjs`, `test/consumer/`, `test/pages/`, `test/integrations/astro/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[SEARCH_SOLUTIONS.md](docs/specs/SEARCH_SOLUTIONS.md), [SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md](docs/planning/SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md), [STATIC_ASTRO.md](docs/specs/STATIC_ASTRO.md), [SITE_WORKBENCH.md](docs/specs/SITE_WORKBENCH.md), [DOCS_MODAL.md](docs/specs/DOCS_MODAL.md)

**Acceptance criteria**

- RX-6007-AC01: Plain browser and Astro starters include trigger/dialog setup, realistic explicit page records/section maps, capability/CSS configuration, complete installation/replacement instructions and disposal.
- RX-6007-AC02: First-open loading is explicit and deduplicated; close/destroy/rapid reopen, late owner creation and retry after asset failure cannot reopen abandoned UI or leak starter-owned engines.
- RX-6007-AC03: Fresh paired installed packages build/preview and navigate to actual heading IDs at root and changed subdirectory bases without repository-only imports or Workbench selectors.
- RX-6007-AC04: Preserved/reset query policy, no-JavaScript browse guidance, delayed/stale/mixed artifact handling and borrowed versus starter-owned cleanup are documented and exercised.
- RX-6007-AC05: Gallery/source links and CSS recipes reference real starter files and current private-tarball availability; automatic HTML extraction or lazy/sharded-index behavior is not implied.

**Verification**

- Execute exact copied installation/build/preview/customization steps in fresh consumers, with independently checked page/section navigation and deployment bases.
- Delay/fail assets, close before completion, reopen repeatedly and dispose during initialization; verify owner/listener/request cleanup and useful retry.
- Run relevant installed Astro/UI/site suites, pages checks for inventory changes and npm run check.
- Record actual acceptance outcomes, commands, source/environment identity, review and limitations in docs/evidence/RX-6007.md before marking done; add only existing evidence and regenerate the readable roadmap.

**Recorded evidence**

- [docs/evidence/RX-6007-astro.json](docs/evidence/RX-6007-astro.json)
- [docs/evidence/RX-6007-astro.log.gz](docs/evidence/RX-6007-astro.log.gz)
- [docs/evidence/RX-6007-browser.json](docs/evidence/RX-6007-browser.json)
- [docs/evidence/RX-6007-browser.log.gz](docs/evidence/RX-6007-browser.log.gz)
- [docs/evidence/RX-6007-gallery-modal-320.png](docs/evidence/RX-6007-gallery-modal-320.png)
- [docs/evidence/RX-6007-gallery-modal-desktop.png](docs/evidence/RX-6007-gallery-modal-desktop.png)
- [docs/evidence/RX-6007-gallery.json](docs/evidence/RX-6007-gallery.json)
- [docs/evidence/RX-6007-gallery.log.gz](docs/evidence/RX-6007-gallery.log.gz)
- [docs/evidence/RX-6007-inline-gallery.json](docs/evidence/RX-6007-inline-gallery.json)
- [docs/evidence/RX-6007-integration-check.log.gz](docs/evidence/RX-6007-integration-check.log.gz)
- [docs/evidence/RX-6007-jekyll.json](docs/evidence/RX-6007-jekyll.json)
- [docs/evidence/RX-6007-jekyll.log.gz](docs/evidence/RX-6007-jekyll.log.gz)
- [docs/evidence/RX-6007-pages.log.gz](docs/evidence/RX-6007-pages.log.gz)
- [docs/evidence/RX-6007-review-and-initial-raw.tar.gz](docs/evidence/RX-6007-review-and-initial-raw.tar.gz)
- [docs/evidence/RX-6007-review.json](docs/evidence/RX-6007-review.json)
- [docs/evidence/RX-6007-site.json](docs/evidence/RX-6007-site.json)
- [docs/evidence/RX-6007-site.log.gz](docs/evidence/RX-6007-site.log.gz)
- [docs/evidence/RX-6007-verification.json](docs/evidence/RX-6007-verification.json)
- [docs/evidence/RX-6007.md](docs/evidence/RX-6007.md)


## RX-6008

**Inline and modal gallery, qualification and synchronization**

**Milestone:** N7 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-6008%22)

**Dependencies:** [RX-6003](IMPLEMENTATION_TASKS.md#rx-6003), [RX-6007](IMPLEMENTATION_TASKS.md#rx-6007)

Complete the first adoption wave and document the actual verified scope before dropdown, directory and rich-result implementation begins.

**Expected affected areas**

`site/`, `examples/README.md`, `docs/api/`, `scripts/lib/pages.mjs`, `test/ui/`, `test/consumer/`, `test/pages/`, `docs/evidence/`, `PROJECT_CONTEXT.md`, `CODEX_HANDOFF.md`, `docs/planning/roadmap.json`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[SEARCH_SOLUTIONS.md](docs/specs/SEARCH_SOLUTIONS.md), [SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md](docs/planning/SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md), [SITE_WORKBENCH.md](docs/specs/SITE_WORKBENCH.md), [DOCS_MODAL.md](docs/specs/DOCS_MODAL.md)

**Acceptance criteria**

- RX-6008-AC01: Two working gallery entries provide complete installed starter/source access, required data/capability instructions and a small reproducible CSS customization walkthrough.
- RX-6008-AC02: Inline and modal have individual acceptance evidence for real native results, exact totals/pages, snippets/sections, states, keyboard/focus/composition and lifecycle/failure behavior.
- RX-6008-AC03: Responsive/theme screenshots, exact source/browser/OS identities, actual human/physical observations and remaining Not run/Blocked manual scope are recorded without turning automated checks into speech/device claims.
- RX-6008-AC04: Measured optional graphs, rendered-output growth and relevant work are distinguished from retained/peak memory and universal capacity/latency promises.
- RX-6008-AC05: Legacy Workbench, frozen corpus, public inventory/Jekyll exclusions, installed APIs and existing site/consumer regression checks remain valid.
- RX-6008-AC06: API/example/site guides, context/handoff, canonical state and generated plans agree with existing task evidence; implementation, verification and synchronization are reported separately without publication.

**Verification**

- Review the installed inline/modal state and adoption matrix independently of the implementation narrative; fix confirmed defects before accepting the wave.
- Run fresh installed examples and applicable UI/Astro suites, pages:build, pages:check, both existing site browser suites and npm run check.
- Collect scoped manual keyboard, exact-tool AT, physical IME/touch/on-screen-keyboard/zoom and theme observations where available; name every remaining qualification boundary.
- Record actual acceptance outcomes, commands, source/environment identity, review and limitations in docs/evidence/RX-6008.md before marking done; add only existing evidence and regenerate the readable roadmap.

**Recorded evidence**

- [docs/evidence/RX-6008-candidate.json.gz](docs/evidence/RX-6008-candidate.json.gz)
- [docs/evidence/RX-6008-costs.json](docs/evidence/RX-6008-costs.json)
- [docs/evidence/RX-6008-inline-320-rtl-dark.png](docs/evidence/RX-6008-inline-320-rtl-dark.png)
- [docs/evidence/RX-6008-inline-desktop.png](docs/evidence/RX-6008-inline-desktop.png)
- [docs/evidence/RX-6008-integration-check.log.gz](docs/evidence/RX-6008-integration-check.log.gz)
- [docs/evidence/RX-6008-jekyll.json](docs/evidence/RX-6008-jekyll.json)
- [docs/evidence/RX-6008-jekyll.log.gz](docs/evidence/RX-6008-jekyll.log.gz)
- [docs/evidence/RX-6008-manual.json](docs/evidence/RX-6008-manual.json)
- [docs/evidence/RX-6008-matrix.json](docs/evidence/RX-6008-matrix.json)
- [docs/evidence/RX-6008-modal-320x240-forced-colors.png](docs/evidence/RX-6008-modal-320x240-forced-colors.png)
- [docs/evidence/RX-6008-modal-desktop.png](docs/evidence/RX-6008-modal-desktop.png)
- [docs/evidence/RX-6008-pages.log.gz](docs/evidence/RX-6008-pages.log.gz)
- [docs/evidence/RX-6008-raw.tar.gz](docs/evidence/RX-6008-raw.tar.gz)
- [docs/evidence/RX-6008-review.json](docs/evidence/RX-6008-review.json)
- [docs/evidence/RX-6008-site.log.gz](docs/evidence/RX-6008-site.log.gz)
- [docs/evidence/RX-6008-verification.json](docs/evidence/RX-6008-verification.json)
- [docs/evidence/RX-6008-webkit-inline-320.png](docs/evidence/RX-6008-webkit-inline-320.png)
- [docs/evidence/RX-6008-webkit-modal-320.png](docs/evidence/RX-6008-webkit-modal-320.png)
- [docs/evidence/RX-6008.md](docs/evidence/RX-6008.md)


## RX-7001

**Accessible compact dropdown search**

**Milestone:** N8 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-7001%22)

**Dependencies:** [RX-6008](IMPLEMENTATION_TASKS.md#rx-6008)

Implement a bounded search-result combobox with native editing/link behavior, keyboard selection and a full-results handoff after the first-wave foundation is verified.

**Expected affected areas**

`src/addons/ui/`, `test/ui/`, `test/consumer/`, `docs/api/HOSTS.md`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[SEARCH_SOLUTIONS.md](docs/specs/SEARCH_SOLUTIONS.md), [SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md](docs/planning/SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md), [DROPDOWN.md](docs/specs/DROPDOWN.md)

**Acceptance criteria**

- RX-7001-AC01: The optional dropdown has APG-aligned combobox/popup/result state, stable active IDs and input focus during text editing; inline and modal semantics remain unchanged.
- RX-7001-AC02: Arrow keys navigate, Enter follows the active actual result, Escape dismisses and Tab leaves normally; composition, selection/editing keys and modified link activation remain predictable.
- RX-7001-AC03: A finite result window exposes the exact native total and an explicitly configured full-results destination carrying unchanged query meaning; vocabulary suggestions are not conflated with hits.
- RX-7001-AC04: Query/result/revision changes clear invalid active IDs atomically, suppress stale completions and provide complete idle/loading/no-results/error/clear/destroy states.
- RX-7001-AC05: Popup positioning and scrolling remain usable with narrow/zoomed/long-content layouts; optional shortcut/handoff and multiple-instance ownership are explicit without a second engine.
- RX-7001-AC06: Public exports/types, CSS and teardown remain optional, safe and dependency-free with scoped accessible styling and message overrides.

**Verification**

- Run real installed browser combobox-state, keyboard/pointer/native-editing/composition/modified-link and stale-active-result cases plus teardown/multiple-instance races.
- Compare bounded hits/exact totals/full-results query handoff with independent native fixtures and check narrow/zoomed popup states; record exact human AT observations separately.
- Run relevant UI/public-consumer/legacy regressions and npm run check.
- Record actual acceptance outcomes, commands, source/environment identity, review and limitations in docs/evidence/RX-7001.md before marking done; add only existing evidence and regenerate the readable roadmap.

**Recorded evidence**

- [docs/evidence/RX-7001.md](docs/evidence/RX-7001.md)
- [docs/evidence/RX-7001-verification.json](docs/evidence/RX-7001-verification.json)
- [docs/evidence/RX-7001-review.json](docs/evidence/RX-7001-review.json)
- [docs/evidence/RX-7001-browser-summary.json](docs/evidence/RX-7001-browser-summary.json)
- [docs/evidence/RX-7001-costs.json](docs/evidence/RX-7001-costs.json)
- [docs/evidence/RX-7001-candidate.json.gz](docs/evidence/RX-7001-candidate.json.gz)
- [docs/evidence/RX-7001-raw.tar.gz](docs/evidence/RX-7001-raw.tar.gz)


## RX-7002

**Installed dropdown header starter and gallery**

**Milestone:** N8 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-7002%22)

**Dependencies:** [RX-7001](IMPLEMENTATION_TASKS.md#rx-7001)

Deliver a working installed header search integration with a real inline full-results destination and complete customization/ownership guidance.

**Expected affected areas**

`examples/`, `site/`, `scripts/lib/pages.mjs`, `docs/api/`, `test/consumer/`, `test/pages/`, `src/addons/ui/dropdown.ts`, `test/ui/dropdown-browser.test.mjs`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[SEARCH_SOLUTIONS.md](docs/specs/SEARCH_SOLUTIONS.md), [SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md](docs/planning/SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md), [SITE_WORKBENCH.md](docs/specs/SITE_WORKBENCH.md), [DROPDOWN.md](docs/specs/DROPDOWN.md)

**Acceptance criteria**

- RX-7002-AC01: A complete installed header starter includes actual content/display setup, dropdown mount/CSS, full-results inline route, labels, theme overrides and disposal instructions.
- RX-7002-AC02: Root/subdirectory result/full-results URLs preserve the query and resolve actual destinations without repository-only runtime dependencies.
- RX-7002-AC03: Narrow-screen behavior is documented; any modal handoff is explicitly enabled and preserves query/owner state without duplicate engines or competing shortcuts.
- RX-7002-AC04: Copied setup and small CSS/data replacement steps work in a fresh consumer across loading/failure/clear/outside-dismissal/teardown states.
- RX-7002-AC05: The working gallery entry, source links and approved public inventory reflect existing starter files and actual package availability.

**Verification**

- Pack/install and execute exact header/full-results walkthroughs with changed content and CSS; verify real navigation and explicit optional modal handoff.
- Check keyboard/pointer/outside dismissal, long/narrow layouts and light/dark/forced-colors states; run relevant consumer/UI/site suites.
- For changed site inventory run pages checks and both existing site browser suites, then npm run check.
- Record actual acceptance outcomes, commands, source/environment identity, review and limitations in docs/evidence/RX-7002.md before marking done; add only existing evidence and regenerate the readable roadmap.

**Recorded evidence**

- [docs/evidence/RX-7002.md](docs/evidence/RX-7002.md)
- [docs/evidence/RX-7002-verification.json](docs/evidence/RX-7002-verification.json)
- [docs/evidence/RX-7002-browser-summary.json](docs/evidence/RX-7002-browser-summary.json)
- [docs/evidence/RX-7002-review.json](docs/evidence/RX-7002-review.json)
- [docs/evidence/RX-7002-costs.json](docs/evidence/RX-7002-costs.json)
- [docs/evidence/RX-7002-raw.tar.gz](docs/evidence/RX-7002-raw.tar.gz)


## RX-7003

**Directory multi-filter queries and explicit URL state**

**Milestone:** N8 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-7003%22)

**Dependencies:** [RX-6008](IMPLEMENTATION_TASKS.md#rx-6008), [RX-2003](IMPLEMENTATION_TASKS.md#rx-2003)

Prove complete native directory membership/counts/paging and opt-in browser URL synchronization before implementing the full directory controls.

**Expected affected areas**

`src/addons/ui/`, `test/ui/`, `test/consumer/`, `test/fixtures/`, `docs/api/`, `package.json`, `scripts/candidate-check.mjs`, `test/oracle/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[SEARCH_SOLUTIONS.md](docs/specs/SEARCH_SOLUTIONS.md), [SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md](docs/planning/SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md), [ADDONS.md](docs/api/ADDONS.md), [DIRECTORY.md](docs/specs/DIRECTORY.md)

**Acceptance criteria**

- RX-7003-AC01: Empty input browses all admitted records; text combines with OR within each selected string-filter group and AND across groups through native query semantics.
- RX-7003-AC02: Facet counts cover the complete qualifying set before paging and include all active filters including their own group; selected projected-out/zero values remain recoverable.
- RX-7003-AC03: Exact totals, deterministic native order and all hit pages agree with an independent scan; filter/query changes reset the page and revision changes invalidate stale presentation.
- RX-7003-AC04: URL integration is explicitly selected, bounds query/filter/page input, owns named parameters only and preserves unrelated parameters/hash; invalid or stale values recover deterministically.
- RX-7003-AC05: Back/Forward replay restores coherent query/filters/page without history loops; push/replace policy and multi-instance parameter ownership are specified and tested.
- RX-7003-AC06: No storage/history/telemetry, disjunctive self-excluding counts, displayed-page sorting or new core ranking semantics are introduced.

**Verification**

- Compare full generated and hand-derived text/multi-filter combinations, conjunctive bucket counts and complete pages against independent expected sets/order.
- Replay valid/invalid/stale URLs and browser Back/Forward with query edits, active work and revised collections; check unrelated URL state and explicitly disabled synchronization.
- Run applicable filters/facets/UI/consumer regressions and npm run check.
- Record actual acceptance outcomes, commands, source/environment identity, review and limitations in docs/evidence/RX-7003.md before marking done; add only existing evidence and regenerate the readable roadmap.

**Recorded evidence**

- [docs/evidence/RX-7003.md](docs/evidence/RX-7003.md)
- [docs/evidence/RX-7003-verification.json](docs/evidence/RX-7003-verification.json)


## RX-7004

**Faceted directory controls and installed starter**

**Milestone:** N8 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-7004%22)

**Dependencies:** [RX-7003](IMPLEMENTATION_TASKS.md#rx-7003)

Build a complete filterable resource-directory solution using the verified native query and opt-in URL state model.

**Expected affected areas**

`src/addons/ui/`, `examples/`, `site/`, `scripts/lib/pages.mjs`, `docs/api/`, `test/ui/`, `test/consumer/`, `test/pages/`, `test/integrations/astro/`, `package.json`, `scripts/candidate-check.mjs`, `scripts/copy-ui-css.mjs`, `scripts/build-pages.mjs`, `scripts/lib/inline-starters.mjs`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[SEARCH_SOLUTIONS.md](docs/specs/SEARCH_SOLUTIONS.md), [SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md](docs/planning/SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md), [STATIC_ASTRO.md](docs/specs/STATIC_ASTRO.md), [SITE_WORKBENCH.md](docs/specs/SITE_WORKBENCH.md), [DIRECTORY.md](docs/specs/DIRECTORY.md), [DIRECTORY_VIEW.md](docs/specs/DIRECTORY_VIEW.md)

**Acceptance criteria**

- RX-7004-AC01: Native labeled checkbox groups, exact count summaries, selected-filter chips, named chip removal, clear-all and complete page navigation reflect one coherent directory state.
- RX-7004-AC02: Browse-all, search/filter/page reset, selected zero/projected-out values and no-results recovery behave according to the native conjunctive count contract.
- RX-7004-AC03: Mobile filters use a documented disclosure/dialog pattern with logical keyboard order, visible focus and opener restoration; chip/control updates retain or deliberately recover focus.
- RX-7004-AC04: Realistic installed browser/Astro integration instructions include records, required registrations, optional URL ownership, CSS and lifecycle; copied setup works at root/subdirectory bases.
- RX-7004-AC05: Loading/refusal/error/retry, Back/Forward, revised collection, long/RTL labels, narrow/zoomed layouts and forced-colors/reduced-motion states remain usable.
- RX-7004-AC06: The gallery and public starter inventory link complete existing files; full-set sorting, numeric range controls and unrelated directory features remain outside scope.

**Verification**

- Run installed end-to-end query/filter/chip/clear/page/Back-Forward and zero-result recovery cases against independent native membership/counts.
- Verify mobile disclosure/dialog, focus after removal, labels/status and dark/forced-colors/reduced-motion/zoom/reflow with separately scoped human checks.
- Execute exact copied setup/data/CSS replacement walkthroughs, relevant consumer/UI/Astro/site suites and npm run check.
- Record actual acceptance outcomes, commands, source/environment identity, review and limitations in docs/evidence/RX-7004.md before marking done; add only existing evidence and regenerate the readable roadmap.

**Recorded evidence**

- [docs/evidence/RX-7004.md](docs/evidence/RX-7004.md)
- [docs/evidence/RX-7004-verification.json](docs/evidence/RX-7004-verification.json)


## RX-7005

**Rich directory result cards and grid presentation**

**Milestone:** N8 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-7005%22)

**Dependencies:** [RX-7004](IMPLEMENTATION_TASKS.md#rx-7004)

Add optional safe metadata/image presentation for editorial and catalogue results while preserving the directory engine, query state and semantic reading order.

**Expected affected areas**

`src/addons/ui/`, `examples/`, `site/`, `scripts/lib/pages.mjs`, `docs/api/`, `test/ui/`, `test/consumer/`, `test/pages/`, `package.json`, `scripts/candidate-check.mjs`, `scripts/copy-ui-css.mjs`, `scripts/preview-pages.mjs`, `scripts/build-pages.mjs`, `scripts/lib/inline-starters.mjs`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[SEARCH_SOLUTIONS.md](docs/specs/SEARCH_SOLUTIONS.md), [SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md](docs/planning/SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md), [DIRECTORY_CARDS.md](docs/specs/DIRECTORY_CARDS.md), [DIRECTORY_VIEW.md](docs/specs/DIRECTORY_VIEW.md)

**Acceptance criteria**

- RX-7005-AC01: A declared optional display projection supplies title/excerpt, category/breadcrumb/date or named text fields and validated image/alternative data without arbitrary HTML templates.
- RX-7005-AC02: List/card/grid presentation preserves native IDs/order/exact totals, query/filters/page and selection; DOM reading order matches the visible sequence.
- RX-7005-AC03: Missing/long/localized/hostile metadata and broken images have safe readable recovery; image requests are explicit and reserve dimensions with appropriate alternatives.
- RX-7005-AC04: Responsive semantic lists and scoped density/image/layout CSS support narrow/zoomed/light/dark/forced-colors/reduced-motion views without an interactive ARIA grid.
- RX-7005-AC05: A complete installed rich-results starter and gallery example demonstrate actual metadata mapping/customization/disposal; any necessary static artifact extension preserves existing compatibility rules.
- RX-7005-AC06: Optional import/DOM/image costs are measured separately from baseline and memory/capacity claims; commerce actions and full-set sort changes are not added.

**Verification**

- Compare IDs/order/totals/pages across list/grid/theme changes and independently check safe metadata/URL/image alternatives and native link behavior.
- Run actual copied installed examples plus missing/broken-image, hostile/long/RTL metadata, keyboard reading-order and responsive/theme probes.
- Measure optional graph/render/image behavior, run relevant UI/consumer/static/site regressions and npm run check.
- Record actual acceptance outcomes, commands, source/environment identity, review and limitations in docs/evidence/RX-7005.md before marking done; add only existing evidence and regenerate the readable roadmap.

**Recorded evidence**

- [docs/evidence/RX-7005.md](docs/evidence/RX-7005.md)
- [docs/evidence/RX-7005-verification.json](docs/evidence/RX-7005-verification.json)


## RX-7006

**Complete solution gallery and family qualification**

**Milestone:** N8 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-7006%22)

**Dependencies:** [RX-7002](IMPLEMENTATION_TASKS.md#rx-7002), [RX-7004](IMPLEMENTATION_TASKS.md#rx-7004), [RX-7005](IMPLEMENTATION_TASKS.md#rx-7005)

Finish the complete adoption path and verify shared correctness, interaction, optionality and documented support scope across inline, modal, dropdown, directory and rich-result solutions.

**Expected affected areas**

`site/`, `examples/`, `docs/api/`, `integrations/astro/README.md`, `scripts/lib/pages.mjs`, `test/ui/`, `test/consumer/`, `test/pages/`, `docs/evidence/`, `PROJECT_CONTEXT.md`, `CODEX_HANDOFF.md`, `docs/planning/roadmap.json`, `scripts/build-pages.mjs`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[SEARCH_SOLUTIONS.md](docs/specs/SEARCH_SOLUTIONS.md), [SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md](docs/planning/SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md), [STATIC_ASTRO.md](docs/specs/STATIC_ASTRO.md), [SITE_WORKBENCH.md](docs/specs/SITE_WORKBENCH.md), [PAGE_SECTIONS.md](docs/specs/PAGE_SECTIONS.md), [DROPDOWN.md](docs/specs/DROPDOWN.md), [DIRECTORY.md](docs/specs/DIRECTORY.md), [DIRECTORY_VIEW.md](docs/specs/DIRECTORY_VIEW.md), [DIRECTORY_CARDS.md](docs/specs/DIRECTORY_CARDS.md)

**Acceptance criteria**

- RX-7006-AC01: A usable solution chooser links five working presentations, complete installed starter/source files, exact data/capability requirements and short CSS customization recipes.
- RX-7006-AC02: Every solution has current independent result/state/interaction evidence, including complete totals/pages, query meaning, snippets/sections where configured, failure/recovery and lifecycle.
- RX-7006-AC03: Fresh copied browser/Astro consumers and root/subdirectory builds verify exact documented steps without repository-only runtime imports or changes to private/publication guards.
- RX-7006-AC04: Per-surface responsive/theme screenshots and exact-tool human/physical observations are distinguished from automated checks; every remaining manual/platform limitation and unsupported claim is explicit.
- RX-7006-AC05: Optional import graphs, work/rendered-output and image costs are measured honestly without serialized-byte-to-memory or admission-to-capacity inference; old UI/Workbench/corpus regressions remain valid.
- RX-7006-AC06: Public API/example/integration/site guidance, context/handoff, canonical statuses and generated task views match actual existing acceptance evidence and independent review; no deployment or publication is implied.

**Verification**

- Review the complete installed adoption and interaction/capability matrix independently and repair confirmed defects before accepting completion.
- Run each fresh starter, relevant UI/filter/facet/worker/consumer/Astro suites, pages:build, pages:check, both site browser suites and npm run check.
- Collect exact browser/OS/AT and physical-input/zoom/mobile/theme observations for claimed support, preserving unavailable outcomes and actual optional graph/output measurements.
- Record actual acceptance outcomes, commands, source/environment identity, review and limitations in docs/evidence/RX-7006.md before marking done; add only existing evidence and regenerate the readable roadmap.

**Recorded evidence**

- [docs/evidence/RX-7006.md](docs/evidence/RX-7006.md)
- [docs/evidence/RX-7006-verification.json](docs/evidence/RX-7006-verification.json)


## RX-8001

**Reconcile missing historical evidence and establish a green exact-head baseline**

**Milestone:** N9 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8001%22)

**Dependencies:** [RX-7006](IMPLEMENTATION_TASKS.md#rx-7006)

Document untracked RX-5004 log references without inventing historical test results; verify a clean pinned current-head candidate before optimization.

**Expected affected areas**

`docs/evidence/`, `docs/planning/roadmap.json`, `docs/release/`, `scripts/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[N9_PERFORMANCE_RECOVERY.md](docs/specs/N9_PERFORMANCE_RECOVERY.md)

**Acceptance criteria**

- RX-8001-AC01: Keep original RX-5004 evidence and unavailable-log disclosure distinct from newly measured passes.
- RX-8001-AC02: Pass the actual planner/docs/types/tests/installed-consumer and required browser checks on an immutable current head.
- RX-8001-AC03: Freeze source, lockfile, package, model, configuration, known costs and refusals for subsequent paired measurement.

**Verification**

- Investigate log provenance; do not create placeholder pass logs or weaken evidence validation.
- Run focused independent correctness and failure/lifecycle tests plus the pinned full verification on the exact changed checkout.
- Record actual commands, environment, source/artifact identity, before/after diagnostic and normal timings and any unrun checks.
- Preserve native results, complete counts, numeric facts, original phrase/offset semantics, atomic revisions and installed package boundaries.

**Recorded evidence**

- [docs/evidence/RX-8001.md](docs/evidence/RX-8001.md)
- [docs/evidence/RX-8001/verified-source-freeze.json](docs/evidence/RX-8001/verified-source-freeze.json)
- [docs/evidence/RX-8001/environment.json](docs/evidence/RX-8001/environment.json)
- [docs/evidence/RX-8001/head-919c9ed/acceptance.json](docs/evidence/RX-8001/head-919c9ed/acceptance.json)
- [docs/evidence/RX-8001/head-919c9ed/source.json](docs/evidence/RX-8001/head-919c9ed/source.json)
- [docs/evidence/RX-8001/head-919c9ed/preparation.json](docs/evidence/RX-8001/head-919c9ed/preparation.json)
- [docs/evidence/RX-8001/head-919c9ed/pages-browser.json](docs/evidence/RX-8001/head-919c9ed/pages-browser.json)


## RX-8002

**Freeze matched corpora and instrument query/recovery costs**

**Milestone:** N9 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8002%22)

**Dependencies:** [RX-8001](IMPLEMENTATION_TASKS.md#rx-8001)

Build reproducible real-doc, realistic high-cardinality and adversarial 100/1,000/10,000-record workloads with diagnostic execution accounting.

**Expected affected areas**

`bench/`, `scripts/`, `test/fixtures/`, `docs/evaluation/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[N9_PERFORMANCE_RECOVERY.md](docs/specs/N9_PERFORMANCE_RECOVERY.md)

**Acceptance criteria**

- RX-8002-AC01: Pin corpus/query/judgment hashes, packages and analyzer/model identities, including independent expected matches.
- RX-8002-AC02: Instrument candidates, documents evaluated and scored, dictionary visits, host yields, emitted work and restore phases without mixing instrumentation into normal timings.
- RX-8002-AC03: Record CPU/wall, sample counts, rotated fresh owners, deadline/refusal/unknown outcomes and correct comparison scopes.

**Verification**

- Run focused independent correctness and failure/lifecycle tests plus the pinned full verification on the exact changed checkout.
- Record actual commands, environment, source/artifact identity, before/after diagnostic and normal timings and any unrun checks.
- Preserve native results, complete counts, numeric facts, original phrase/offset semantics, atomic revisions and installed package boundaries.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-8003

**Introduce conservative postings-based query candidate bounds**

**Milestone:** N9 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8003%22)

**Dependencies:** [RX-8002](IMPLEMENTATION_TASKS.md#rx-8002)

Use complete posting-derived candidate sets for positive Boolean queries while falling back to the universe where NOT, opaque predicates or browse require it.

**Expected affected areas**

`src/core/query/`, `src/core/retrieval/`, `test/core/`, `test/addons/`, `bench/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[N9_PERFORMANCE_RECOVERY.md](docs/specs/N9_PERFORMANCE_RECOVERY.md)

**Acceptance criteria**

- RX-8003-AC01: Selective lexical queries skip irrelevant document evaluation and show measured work/latency improvement.
- RX-8003-AC02: AND/OR/NOT, filters, facets, extensions, negative-only, browse and requested nonmatch Inspector explanations retain exact semantics.
- RX-8003-AC03: Native scores/order, exact totals, phrase-source/position/mixed parity, typed errors and cancellation pass independent regressions.

**Verification**

- Run focused independent correctness and failure/lifecycle tests plus the pinned full verification on the exact changed checkout.
- Record actual commands, environment, source/artifact identity, before/after diagnostic and normal timings and any unrun checks.
- Preserve native results, complete counts, numeric facts, original phrase/offset semantics, atomic revisions and installed package boundaries.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-8004

**Optimize resumable continuation scheduling without starving hosts**

**Milestone:** N9 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8004%22)

**Dependencies:** [RX-8002](IMPLEMENTATION_TASKS.md#rx-8002)

Profile and separate execution continuation from deadline timers using host-appropriate genuinely yielding scheduling, retaining stop and commit precedence.

**Expected affected areas**

`src/core/execution/`, `src/adapters/worker/`, `test/core/`, `test/adapters/worker/`, `bench/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[N9_PERFORMANCE_RECOVERY.md](docs/specs/N9_PERFORMANCE_RECOVERY.md)

**Acceptance criteria**

- RX-8004-AC01: Compare real host yields/task durations and query p50/p95 before/after on actual Node and supported browsers/workers.
- RX-8004-AC02: Abort, deadline, FIFO, teardown and committed receipts remain correct under deterministic stop/reentry tests.
- RX-8004-AC03: No endless microtask loops, unsafe cross-host assumptions or changed work-unit charging; retain measured safe fallback.

**Verification**

- Run focused independent correctness and failure/lifecycle tests plus the pinned full verification on the exact changed checkout.
- Record actual commands, environment, source/artifact identity, before/after diagnostic and normal timings and any unrun checks.
- Preserve native results, complete counts, numeric facts, original phrase/offset semantics, atomic revisions and installed package boundaries.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-8005

**Replace exhaustive prefix dictionary scans with bounded seek**

**Milestone:** N9 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8005%22)

**Dependencies:** [RX-8002](IMPLEMENTATION_TASKS.md#rx-8002)

Evaluate sorted-range seeking or another compact prefix lookup against existing full-dictionary iteration on high-cardinality vocabularies.

**Expected affected areas**

`src/core/retrieval/`, `src/core/index/`, `test/core/`, `bench/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[N9_PERFORMANCE_RECOVERY.md](docs/specs/N9_PERFORMANCE_RECOVERY.md)

**Acceptance criteria**

- RX-8005-AC01: Selected-field prefix sets equal the independent oracle, including duplicate terms and the exact spelling.
- RX-8005-AC02: Boundary 256/257 expansion errors, metadata, field restriction, deterministic scores/ties and all mutation/restore cases remain unchanged.
- RX-8005-AC03: Measured visits/time improve on declared high-cardinality workloads without unbounded retained side caches.

**Verification**

- Run focused independent correctness and failure/lifecycle tests plus the pinned full verification on the exact changed checkout.
- Record actual commands, environment, source/artifact identity, before/after diagnostic and normal timings and any unrun checks.
- Preserve native results, complete counts, numeric facts, original phrase/offset semantics, atomic revisions and installed package boundaries.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-8006

**Hoist revision-invariant BM25 calculations**

**Milestone:** N9 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8006%22)

**Dependencies:** [RX-8002](IMPLEMENTATION_TASKS.md#rx-8002)

Cache per-query/per-field length averages and IDF inputs where applicable without modifying the native scoring model or public trace meaning.

**Expected affected areas**

`src/core/ranking/`, `src/core/query/`, `src/core/trace/`, `test/core/`, `bench/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[N9_PERFORMANCE_RECOVERY.md](docs/specs/N9_PERFORMANCE_RECOVERY.md)

**Acceptance criteria**

- RX-8006-AC01: Actual scores, alternative contributions and ties match independent arithmetic under the existing numeric tolerance.
- RX-8006-AC02: Changes to document frequencies and field lengths invalidate stale values; filters never change corpus statistics.
- RX-8006-AC03: Fewer redundant computations and actual cost impact are measured independently from candidate and scheduler changes.

**Verification**

- Run focused independent correctness and failure/lifecycle tests plus the pinned full verification on the exact changed checkout.
- Record actual commands, environment, source/artifact identity, before/after diagnostic and normal timings and any unrun checks.
- Preserve native results, complete counts, numeric facts, original phrase/offset semantics, atomic revisions and installed package boundaries.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-8007

**Diagnose admitted 10k source restore work/deadline failures**

**Milestone:** N9 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8007%22)

**Dependencies:** [RX-8002](IMPLEMENTATION_TASKS.md#rx-8002)

Reproduce and isolate source codec, validation, token and staging costs before proposing bounded bulk reconstruction.

**Expected affected areas**

`src/adapters/snapshots/`, `src/core/mutations/`, `bench/`, `docs/evaluation/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[N9_PERFORMANCE_RECOVERY.md](docs/specs/N9_PERFORMANCE_RECOVERY.md)

**Acceptance criteria**

- RX-8007-AC01: Replicate source-rebuild errors on pinned actual Node and worker configurations without reclassifying refusals as passes.
- RX-8007-AC02: Record phase/work and old/new state coexistence with source/position variants; distinguish encoded bytes from retained/peak heap.
- RX-8007-AC03: Review an atomic bounded bulk-builder contract with exact source/index/sidecar verification and no silent cap increase.

**Verification**

- Run focused independent correctness and failure/lifecycle tests plus the pinned full verification on the exact changed checkout.
- Record actual commands, environment, source/artifact identity, before/after diagnostic and normal timings and any unrun checks.
- Preserve native results, complete counts, numeric facts, original phrase/offset semantics, atomic revisions and installed package boundaries.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-8008

**Implement atomic bulk-source restore under existing limits**

**Milestone:** N9 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8008%22)

**Dependencies:** [RX-8007](IMPLEMENTATION_TASKS.md#rx-8007)

Reduce redundant restore preparation while preserving source/position/native-state participants, revision and single-publication semantics.

**Expected affected areas**

`src/adapters/snapshots/`, `src/adapters/indexeddb/`, `src/adapters/worker/`, `src/core/mutations/`, `test/adapters/`, `bench/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[N9_PERFORMANCE_RECOVERY.md](docs/specs/N9_PERFORMANCE_RECOVERY.md)

**Acceptance criteria**

- RX-8008-AC01: The previously refused representative admitted 10k source restore succeeds under existing limits, or remains blocked pending a genuine reviewed capacity decision.
- RX-8008-AC02: Failure, abort, deadline and uncertain worker/storage outcomes preserve authoritative state/receipts and never pretend success.
- RX-8008-AC03: Before/after phase work, wall/CPU and bounded memory observations are captured with exact restored source/query parity.

**Verification**

- Run focused independent correctness and failure/lifecycle tests plus the pinned full verification on the exact changed checkout.
- Record actual commands, environment, source/artifact identity, before/after diagnostic and normal timings and any unrun checks.
- Preserve native results, complete counts, numeric facts, original phrase/offset semantics, atomic revisions and installed package boundaries.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-8009

**Run paired baseline-versus-optimized native benchmark**

**Milestone:** N9 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8009%22)

**Dependencies:** [RX-8003](IMPLEMENTATION_TASKS.md#rx-8003), [RX-8004](IMPLEMENTATION_TASKS.md#rx-8004), [RX-8005](IMPLEMENTATION_TASKS.md#rx-8005), [RX-8006](IMPLEMENTATION_TASKS.md#rx-8006), [RX-8008](IMPLEMENTATION_TASKS.md#rx-8008)

Repeat frozen matched workloads against separate installed baseline and candidate artifacts, reporting independent and combined improvements and regressions.

**Expected affected areas**

`bench/`, `docs/evaluation/`, `docs/evidence/`, `scripts/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[N9_PERFORMANCE_RECOVERY.md](docs/specs/N9_PERFORMANCE_RECOVERY.md)

**Acceptance criteria**

- RX-8009-AC01: Complete membership, score/trace/order, totals, facets, revisions, budgets and source/position/mixed outcomes agree.
- RX-8009-AC02: Report p50/p95 sample counts, CPU/wall/work/yields, selected browser/worker cases, sizes and failure rates for every intervention.
- RX-8009-AC03: Any unproven speedup, correctness regression or changed capacity meaning remains a finding rather than a release claim.

**Verification**

- Run focused independent correctness and failure/lifecycle tests plus the pinned full verification on the exact changed checkout.
- Record actual commands, environment, source/artifact identity, before/after diagnostic and normal timings and any unrun checks.
- Preserve native results, complete counts, numeric facts, original phrase/offset semantics, atomic revisions and installed package boundaries.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-8010

**Benchmark equivalently configured search-library alternatives**

**Milestone:** N9 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8010%22)

**Dependencies:** [RX-8002](IMPLEMENTATION_TASKS.md#rx-8002)

Build pinned isolated comparisons for MiniSearch, FlexSearch, Orama and Lunr where query semantics align; keep Fuse fuzzy and Pagefind static-site cases separate.

**Expected affected areas**

`bench/`, `test/comparison/`, `integrations/`, `docs/evaluation/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[N9_PERFORMANCE_RECOVERY.md](docs/specs/N9_PERFORMANCE_RECOVERY.md)

**Acceptance criteria**

- RX-8010-AC01: Record version/hash/content/field/matching/total/output equivalence for every comparable row.
- RX-8010-AC02: Unsupported operators, different fuzzy metrics, application phrase work and nontransactional updates are Not comparable instead of silent drop or apparent wins.
- RX-8010-AC03: Use independent relevance labels and reproducible workloads; do not present unrelated published benchmarks as local measurements.

**Verification**

- Run focused independent correctness and failure/lifecycle tests plus the pinned full verification on the exact changed checkout.
- Record actual commands, environment, source/artifact identity, before/after diagnostic and normal timings and any unrun checks.
- Preserve native results, complete counts, numeric facts, original phrase/offset semantics, atomic revisions and installed package boundaries.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## RX-8011

**Independently review optimization evidence and practical limits**

**Milestone:** N9 · **Status:** `planned` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8011%22)

**Dependencies:** [RX-8009](IMPLEMENTATION_TASKS.md#rx-8009), [RX-8010](IMPLEMENTATION_TASKS.md#rx-8010)

Consolidate measured differences, reproducibility, safe capacity/latency guidance and remaining browser/AT/physical limitations without authorizing publication.

**Expected affected areas**

`docs/evaluation/`, `docs/release/`, `docs/support/`, `README.md`, `CODEX_HANDOFF.md`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[N9_PERFORMANCE_RECOVERY.md](docs/specs/N9_PERFORMANCE_RECOVERY.md)

**Acceptance criteria**

- RX-8011-AC01: Independent review checks consequential math, source/corpus identities, comparator fairness, selected raw runs and failed/unknown outcomes.
- RX-8011-AC02: Practical workload guidance distinguishes fast updates from broad exact-count retrieval and supported restore capacities.
- RX-8011-AC03: Core and add-on boundaries remain intact; publication, version bump and new capabilities require a separate owner decision.

**Verification**

- Run focused independent correctness and failure/lifecycle tests plus the pinned full verification on the exact changed checkout.
- Record actual commands, environment, source/artifact identity, before/after diagnostic and normal timings and any unrun checks.
- Preserve native results, complete counts, numeric facts, original phrase/offset semantics, atomic revisions and installed package boundaries.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## Deferred enhancement tasks

The `RX-A*` tasks are in [Optional features](docs/planning/OPTIONAL_FEATURES.md). Their dependency on `RX-4003` is only a prerequisite. They remain deferred until selected and do not block the N0–N4 candidate.
