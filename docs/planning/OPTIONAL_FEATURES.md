<!-- Generated from docs/planning/roadmap.json by scripts/render-plan.mjs. Run npm run docs:generate; do not edit task data here. -->

# Optional capabilities and later research

The first-party optional modules required for native 0.1 are already in N2/N3: source phrases, positions/offsets, filters/facets, Inspector data, evidence/snippets, DOM UI, workers, snapshots, and IndexedDB. “Optional” describes consumer code/data cost; those release tasks remain part of the proposed product candidate.

The N5 tracks below require explicit selection; each card records its current state. Select a track because users or the judged query corpus reveal a need. The entire idea list is not an implementation authorization.

## Selection contract

Before changing a deferred task to planned, record its concrete user problem, supported semantics, required data, expected costs, success metric, and native-contract interactions. A later owner request selecting an enhancement can supply that direction; do not add ceremonial approval gates for ordinary implementation choices.

Unused add-ons must remain absent from core-only import and retained-state graphs. Declare compatibility, required providers, indexing/rebuild implications, execution hosts, errors, cleanup, and limits. Avoid unrestricted `beforeSearch` / `afterSearch` hooks whose order changes query meaning. Adapters connect environments without silently changing semantics.

Live state is in [roadmap.json](roadmap.json); module boundaries are in [Add-ons and adapters](../architecture/ADDONS_AND_ADAPTERS.md).

## RX-A010

**Bounded typo tolerance**

**Milestone:** N5 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/28)

**Dependencies:** [RX-4003](../../IMPLEMENTATION_TASKS.md#rx-4003)

Expand eligible tokens under a named edit-distance policy when judged typo queries demonstrate useful gains.

**Expected affected areas**

`src/addons/typo/`, `test/addons/typo/`, `test/fixtures/relevance/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](../../docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](../../docs/specs/CORE_CONTRACT.md), [VERIFICATION_PLAN.md](../../docs/planning/VERIFICATION_PLAN.md), [TYPO_TOLERANCE.md](../../docs/specs/TYPO_TOLERANCE.md)

**Acceptance criteria**

- RX-A010-AC01: Specify algorithm, edit/transposition semantics, minimum token length, maximum distance, expansion limits, weighting, and strict exact/prefix/phrase interactions.
- RX-A010-AC02: Expansion preserves original required groups and records actual alternatives; exhausted bounds fail or use an explicitly selected incomplete mode without false exact totals.
- RX-A010-AC03: Judged typo queries improve under declared metrics without unacceptable false positives; optional dictionary/automaton data and import costs are measured.

**Verification**

- Evaluate hand-derived distance cases and independent candidate expansions, then run exact and typo relevance sets.
- Measure expansion work, peak candidate counts, bundle/state costs, and cancellation behavior.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-A010.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-A010.md](../../docs/evidence/RX-A010.md)
- [docs/evidence/RX-A010-package.json](../../docs/evidence/RX-A010-package.json)
- [docs/evidence/RX-A010-behavior.log](../../docs/evidence/RX-A010-behavior.log)
- [docs/evidence/RX-A010-baseline-environment.log](../../docs/evidence/RX-A010-baseline-environment.log)
- [docs/evidence/RX-A010-check.log](../../docs/evidence/RX-A010-check.log)
- [docs/evidence/RX-A010-candidate.json](../../docs/evidence/RX-A010-candidate.json)
- [docs/evidence/RX-A010-preparation.json](../../docs/evidence/RX-A010-preparation.json)
- [docs/evidence/RX-A010-candidate-0.1.0-rc.0.tgz](../../docs/evidence/RX-A010-candidate-0.1.0-rc.0.tgz)
- [docs/evidence/RX-A010-review.json](../../docs/evidence/RX-A010-review.json)
- [docs/evidence/RX-A010-sync.log](../../docs/evidence/RX-A010-sync.log)


## RX-A020

**Dictionary-backed suggestions**

**Milestone:** N5 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/29)

**Dependencies:** [RX-4003](../../IMPLEMENTATION_TASKS.md#rx-4003)

Offer explicit query completions without silently rewriting submitted search semantics.

**Expected affected areas**

`src/addons/suggestions/`, `test/addons/suggestions/`, `examples/docs-search/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](../../docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](../../docs/specs/CORE_CONTRACT.md), [VERIFICATION_PLAN.md](../../docs/planning/VERIFICATION_PLAN.md), [SUGGESTIONS.md](../../docs/specs/SUGGESTIONS.md)

**Acceptance criteria**

- RX-A020-AC01: Specify whether suggestions complete a token or a query, the source dictionary scope, ranking, filtering, minimum length, and output bounds.
- RX-A020-AC02: Suggestions are returned separately from search results and do not automatically replace user input; stale/IME/UI behavior is explicit if integrated.
- RX-A020-AC03: A standalone optional entry supports deterministic results, cancellation, mutation freshness, and measured dictionary/output costs.

**Verification**

- Test deterministic completion order, misses, limits, mutation revisions, and empty/short inputs.
- Evaluate realistic completion utility separately from search ranking, and test UI focus/announcement behavior if the pilot exposes suggestions.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-A020.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-A020.md](../../docs/evidence/RX-A020.md)
- [docs/evidence/RX-A020-behavior.log](../../docs/evidence/RX-A020-behavior.log)
- [docs/evidence/RX-A020-initial-focused.log](../../docs/evidence/RX-A020-initial-focused.log)
- [docs/evidence/RX-A020-package.json](../../docs/evidence/RX-A020-package.json)
- [docs/evidence/RX-A020-independent-probes.json](../../docs/evidence/RX-A020-independent-probes.json)
- [docs/evidence/RX-A020-independent-probes.mjs](../../docs/evidence/RX-A020-independent-probes.mjs)
- [docs/evidence/RX-A020-review.json](../../docs/evidence/RX-A020-review.json)
- [docs/evidence/RX-A020-check.log](../../docs/evidence/RX-A020-check.log)
- [docs/evidence/RX-A020-preparation.json](../../docs/evidence/RX-A020-preparation.json)
- [docs/evidence/RX-A020-candidate.json](../../docs/evidence/RX-A020-candidate.json)
- [docs/evidence/RX-A020-candidate-0.1.0-rc.0.tgz](../../docs/evidence/RX-A020-candidate-0.1.0-rc.0.tgz)


## RX-A030

**Directional one-step synonyms**

**Milestone:** N5 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/30)

**Dependencies:** [RX-4003](../../IMPLEMENTATION_TASKS.md#rx-4003)

Support transparent, bounded alternatives within original query groups for a judged domain vocabulary.

**Expected affected areas**

`src/addons/synonyms/`, `test/addons/synonyms/`, `test/fixtures/relevance/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](../../docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](../../docs/specs/CORE_CONTRACT.md), [VERIFICATION_PLAN.md](../../docs/planning/VERIFICATION_PLAN.md), [SYNONYMS.md](../../docs/specs/SYNONYMS.md)

**Acceptance criteria**

- RX-A030-AC01: Synonyms are directional, one-step, versioned alternatives with explicit expansion/scoring limits and no recursive graph traversal.
- RX-A030-AC02: AND stays between original groups and OR within alternatives; eligibility/score explanations identify applied mappings.
- RX-A030-AC03: Multiword synonyms and phrase-position graphs remain outside this first version; phrase behavior, analyzer compatibility, and optional costs are documented.

**Verification**

- Compare independent one-step expansions and original-group Boolean outcomes, including cycles and repeated alternatives.
- Evaluate judged recall gains and false positives, trace arithmetic, configuration compatibility, and expansion bounds.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-A030.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-A030.md](../../docs/evidence/RX-A030.md)
- [docs/evidence/RX-A030-behavior.log](../../docs/evidence/RX-A030-behavior.log)
- [docs/evidence/RX-A030-baseline-sandbox.log](../../docs/evidence/RX-A030-baseline-sandbox.log)
- [docs/evidence/RX-A030-baseline-loopback.log](../../docs/evidence/RX-A030-baseline-loopback.log)
- [docs/evidence/RX-A030-package.json](../../docs/evidence/RX-A030-package.json)
- [docs/evidence/RX-A030-independent-probes.json](../../docs/evidence/RX-A030-independent-probes.json)
- [docs/evidence/RX-A030-independent-probes.mjs](../../docs/evidence/RX-A030-independent-probes.mjs)
- [docs/evidence/RX-A030-check.log](../../docs/evidence/RX-A030-check.log)
- [docs/evidence/RX-A030-preparation.json](../../docs/evidence/RX-A030-preparation.json)
- [docs/evidence/RX-A030-candidate.json](../../docs/evidence/RX-A030-candidate.json)
- [docs/evidence/RX-A030-candidate-0.1.0-rc.0.tgz](../../docs/evidence/RX-A030-candidate-0.1.0-rc.0.tgz)
- [docs/evidence/RX-A030-review.json](../../docs/evidence/RX-A030-review.json)


## RX-A040

**Evaluated language analyzer pack**

**Milestone:** N5 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/31)

**Dependencies:** [RX-4003](../../IMPLEMENTATION_TASKS.md#rx-4003)

Select one language with real corpus demand and provide compatible indexing/querying/source evidence.

**Expected affected areas**

`src/integrations/languages/`, `src/core/analyzer/`, `src/core/capabilities/`, `src/core/contracts/`, `src/core/mutations/`, `src/core/query/`, `src/addons/phrases/`, `src/addons/positions/`, `src/addons/evidence/`, `src/addons/snippets/`, `src/adapters/worker/`, `src/adapters/snapshots/`, `test/integrations/languages/`, `test/fixtures/relevance/`, `integrations/languages/english/`, `scripts/pack-english.mjs`, `test/measurements/english-package.mjs`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](../../docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](../../docs/specs/CORE_CONTRACT.md), [VERIFICATION_PLAN.md](../../docs/planning/VERIFICATION_PLAN.md), [ENGLISH_ANALYZER.md](../../docs/specs/ENGLISH_ANALYZER.md)

**Acceptance criteria**

- RX-A040-AC01: Name the initial language and corpus need before implementation; specify segmentation, normalization, morphology, version identity, and source mapping.
- RX-A040-AC02: Index/query/direct/worker/snapshot analysis stays compatible with phrase boundaries and original evidence; missing/incompatible packs fail explicitly.
- RX-A040-AC03: Language data/code is separately installable and adds no core import or retained cost; per-language relevance and resource results support the claim.

**Verification**

- Use native-language fixtures reviewed for segmentation and phrase/source evidence correctness.
- Evaluate language-specific judgments and direct/worker/restore parity, including incompatible analyzer versions.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-A040.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-A040-baseline.log](../../docs/evidence/RX-A040-baseline.log)
- [docs/evidence/RX-A040-candidate-0.1.0-rc.0.tgz](../../docs/evidence/RX-A040-candidate-0.1.0-rc.0.tgz)
- [docs/evidence/RX-A040-candidate.json](../../docs/evidence/RX-A040-candidate.json)
- [docs/evidence/RX-A040-check.log](../../docs/evidence/RX-A040-check.log)
- [docs/evidence/RX-A040-english-0.1.0-rc.0.tgz](../../docs/evidence/RX-A040-english-0.1.0-rc.0.tgz)
- [docs/evidence/RX-A040-english-pack.log](../../docs/evidence/RX-A040-english-pack.log)
- [docs/evidence/RX-A040-english-package.json](../../docs/evidence/RX-A040-english-package.json)
- [docs/evidence/RX-A040-focused.log](../../docs/evidence/RX-A040-focused.log)
- [docs/evidence/RX-A040-independent-probes.json](../../docs/evidence/RX-A040-independent-probes.json)
- [docs/evidence/RX-A040-independent-probes.mjs](../../docs/evidence/RX-A040-independent-probes.mjs)
- [docs/evidence/RX-A040-initial-lifecycle.log](../../docs/evidence/RX-A040-initial-lifecycle.log)
- [docs/evidence/RX-A040-initial-standalone-tests.log](../../docs/evidence/RX-A040-initial-standalone-tests.log)
- [docs/evidence/RX-A040-initial-typecheck.log](../../docs/evidence/RX-A040-initial-typecheck.log)
- [docs/evidence/RX-A040-language-probes.json](../../docs/evidence/RX-A040-language-probes.json)
- [docs/evidence/RX-A040-language-probes.mjs](../../docs/evidence/RX-A040-language-probes.mjs)
- [docs/evidence/RX-A040-language-review.json](../../docs/evidence/RX-A040-language-review.json)
- [docs/evidence/RX-A040-lifecycle.log](../../docs/evidence/RX-A040-lifecycle.log)
- [docs/evidence/RX-A040-package.json](../../docs/evidence/RX-A040-package.json)
- [docs/evidence/RX-A040-pre-standalone-candidate-0.1.0-rc.0.tgz](../../docs/evidence/RX-A040-pre-standalone-candidate-0.1.0-rc.0.tgz)
- [docs/evidence/RX-A040-pre-standalone-candidate.json](../../docs/evidence/RX-A040-pre-standalone-candidate.json)
- [docs/evidence/RX-A040-pre-standalone-check.log](../../docs/evidence/RX-A040-pre-standalone-check.log)
- [docs/evidence/RX-A040-pre-standalone-package.json](../../docs/evidence/RX-A040-pre-standalone-package.json)
- [docs/evidence/RX-A040-pre-standalone-preparation.json](../../docs/evidence/RX-A040-pre-standalone-preparation.json)
- [docs/evidence/RX-A040-pre-standalone-sync.log](../../docs/evidence/RX-A040-pre-standalone-sync.log)
- [docs/evidence/RX-A040-preparation.json](../../docs/evidence/RX-A040-preparation.json)
- [docs/evidence/RX-A040-review.json](../../docs/evidence/RX-A040-review.json)
- [docs/evidence/RX-A040-separate-installation-gap-review.json](../../docs/evidence/RX-A040-separate-installation-gap-review.json)
- [docs/evidence/RX-A040-snapshot-stop-probe.mjs](../../docs/evidence/RX-A040-snapshot-stop-probe.mjs)
- [docs/evidence/RX-A040-standalone-tests.log](../../docs/evidence/RX-A040-standalone-tests.log)
- [docs/evidence/RX-A040-stem-typecheck.log](../../docs/evidence/RX-A040-stem-typecheck.log)
- [docs/evidence/RX-A040-stop-probe.mjs](../../docs/evidence/RX-A040-stop-probe.mjs)
- [docs/evidence/RX-A040-sync.log](../../docs/evidence/RX-A040-sync.log)
- [docs/evidence/RX-A040.md](../../docs/evidence/RX-A040.md)


## RX-A050

**Code and identifier analysis**

**Milestone:** N5 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/32)

**Dependencies:** [RX-4003](../../IMPLEMENTATION_TASKS.md#rx-4003)

Search developer identifiers without losing exact original names or inventing phrase/source evidence.

**Expected affected areas**

`src/addons/identifiers/`, `test/addons/identifiers/`, `test/fixtures/relevance/`, `src/core/analyzer/`, `src/core/capabilities/`, `src/addons/phrases/`, `src/addons/positions/`, `src/addons/evidence/`, `src/addons/snippets/`, `src/adapters/snapshots/`, `test/measurements/identifier-package.mjs`, `docs/api/IDENTIFIERS.md`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](../../docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](../../docs/specs/CORE_CONTRACT.md), [VERIFICATION_PLAN.md](../../docs/planning/VERIFICATION_PLAN.md), [IDENTIFIER_ANALYSIS.md](../../docs/specs/IDENTIFIER_ANALYSIS.md)

**Acceptance criteria**

- RX-A050-AC01: Specify original identifiers and selected camelCase, snake_case, path, or punctuation components with their weighting and grouping behavior.
- RX-A050-AC02: Exact names remain searchable; derived fragments carry explicit source evidence and do not silently create unsupported phrase adjacency.
- RX-A050-AC03: The analyzer is independently selected/versioned and evaluated against real developer queries and non-code regressions.

**Verification**

- Run identifier/source-range fixtures for acronyms, digits, Unicode, separators, paths, and collisions.
- Evaluate judged code queries, native trace contributions, phrase semantics, and compatibility across worker/restore.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-A050.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-A050-analysis-review.json](../../docs/evidence/RX-A050-analysis-review.json)
- [docs/evidence/RX-A050-analysis-review.mjs](../../docs/evidence/RX-A050-analysis-review.mjs)
- [docs/evidence/RX-A050-baseline-sandbox-failure.log](../../docs/evidence/RX-A050-baseline-sandbox-failure.log)
- [docs/evidence/RX-A050-baseline.log](../../docs/evidence/RX-A050-baseline.log)
- [docs/evidence/RX-A050-candidate-0.1.0-rc.0.tgz](../../docs/evidence/RX-A050-candidate-0.1.0-rc.0.tgz)
- [docs/evidence/RX-A050-candidate-check.log](../../docs/evidence/RX-A050-candidate-check.log)
- [docs/evidence/RX-A050-candidate.json](../../docs/evidence/RX-A050-candidate.json)
- [docs/evidence/RX-A050-check.log](../../docs/evidence/RX-A050-check.log)
- [docs/evidence/RX-A050-evaluation-focused.log](../../docs/evidence/RX-A050-evaluation-focused.log)
- [docs/evidence/RX-A050-final-check.log](../../docs/evidence/RX-A050-final-check.log)
- [docs/evidence/RX-A050-initial-focused.log](../../docs/evidence/RX-A050-initial-focused.log)
- [docs/evidence/RX-A050-initial-package.log](../../docs/evidence/RX-A050-initial-package.log)
- [docs/evidence/RX-A050-npm-ci.log](../../docs/evidence/RX-A050-npm-ci.log)
- [docs/evidence/RX-A050-package-check.log](../../docs/evidence/RX-A050-package-check.log)
- [docs/evidence/RX-A050-package.json](../../docs/evidence/RX-A050-package.json)
- [docs/evidence/RX-A050-providers.log](../../docs/evidence/RX-A050-providers.log)
- [docs/evidence/RX-A050-qualification.json](../../docs/evidence/RX-A050-qualification.json)
- [docs/evidence/RX-A050-repaired-focused.log](../../docs/evidence/RX-A050-repaired-focused.log)
- [docs/evidence/RX-A050-runtime-review-artifact.json](../../docs/evidence/RX-A050-runtime-review-artifact.json)
- [docs/evidence/RX-A050-runtime-review-initial.json](../../docs/evidence/RX-A050-runtime-review-initial.json)
- [docs/evidence/RX-A050-runtime-review-initial.mjs](../../docs/evidence/RX-A050-runtime-review-initial.mjs)
- [docs/evidence/RX-A050-runtime-review-probes-attempt1.json](../../docs/evidence/RX-A050-runtime-review-probes-attempt1.json)
- [docs/evidence/RX-A050-runtime-review-probes.json](../../docs/evidence/RX-A050-runtime-review-probes.json)
- [docs/evidence/RX-A050-runtime-review-probes.mjs](../../docs/evidence/RX-A050-runtime-review-probes.mjs)
- [docs/evidence/RX-A050-runtime-review.json](../../docs/evidence/RX-A050-runtime-review.json)
- [docs/evidence/RX-A050-sync.log](../../docs/evidence/RX-A050-sync.log)
- [docs/evidence/RX-A050.md](../../docs/evidence/RX-A050.md)


## RX-A060

**Explicit literal and infix matching**

**Milestone:** N5 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/33)

**Dependencies:** [RX-4003](../../IMPLEMENTATION_TASKS.md#rx-4003)

Expose bounded substring semantics as a distinct capability rather than disguising it as token prefix search.

**Expected affected areas**

`src/addons/literal/`, `test/addons/literal/`, `bench/`, `src/core/capabilities/`, `src/core/contracts/query.ts`, `src/index.ts`, `test/oracle/literal.mjs`, `test/fixtures/relevance/literal-v1.json`, `test/measurements/literal-package.mjs`, `docs/api/LITERAL.md`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](../../docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](../../docs/specs/CORE_CONTRACT.md), [VERIFICATION_PLAN.md](../../docs/planning/VERIFICATION_PLAN.md), [LITERAL_MATCHING.md](../../docs/specs/LITERAL_MATCHING.md)

**Acceptance criteria**

- RX-A060-AC01: Define literal/infix case/normalization/Unicode behavior, field/value boundaries, qualification, and original-source evidence independently from token retrieval.
- RX-A060-AC02: An initial source scan has explicit work bounds; any n-gram or other accelerator is optional and justified by equivalent-result measurements.
- RX-A060-AC03: Result totals and ranking integration remain explicit; source-free configurations fail capability checks rather than pretending to support literal matching.

**Verification**

- Compare results/ranges with an independent literal scan across Unicode, punctuation, overlaps, empty inputs, and multi-value boundaries.
- Measure query work and optional acceleration costs on admitted corpora, including cancellation and exact-total failures.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-A060.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-A060-baseline.log](../../docs/evidence/RX-A060-baseline.log)
- [docs/evidence/RX-A060-candidate-0.1.0-rc.0.tgz](../../docs/evidence/RX-A060-candidate-0.1.0-rc.0.tgz)
- [docs/evidence/RX-A060-candidate-check.log](../../docs/evidence/RX-A060-candidate-check.log)
- [docs/evidence/RX-A060-candidate.json](../../docs/evidence/RX-A060-candidate.json)
- [docs/evidence/RX-A060-check.log](../../docs/evidence/RX-A060-check.log)
- [docs/evidence/RX-A060-evaluation.log](../../docs/evidence/RX-A060-evaluation.log)
- [docs/evidence/RX-A060-final-check.log](../../docs/evidence/RX-A060-final-check.log)
- [docs/evidence/RX-A060-focused.log](../../docs/evidence/RX-A060-focused.log)
- [docs/evidence/RX-A060-initial-focused.log](../../docs/evidence/RX-A060-initial-focused.log)
- [docs/evidence/RX-A060-initial-lifecycle-syntax.log](../../docs/evidence/RX-A060-initial-lifecycle-syntax.log)
- [docs/evidence/RX-A060-initial-package-clone.log](../../docs/evidence/RX-A060-initial-package-clone.log)
- [docs/evidence/RX-A060-initial-package-headers.log](../../docs/evidence/RX-A060-initial-package-headers.log)
- [docs/evidence/RX-A060-lifecycle.log](../../docs/evidence/RX-A060-lifecycle.log)
- [docs/evidence/RX-A060-npm-ci.log](../../docs/evidence/RX-A060-npm-ci.log)
- [docs/evidence/RX-A060-package-check.log](../../docs/evidence/RX-A060-package-check.log)
- [docs/evidence/RX-A060-package.json](../../docs/evidence/RX-A060-package.json)
- [docs/evidence/RX-A060-protocol-review-artifact.json](../../docs/evidence/RX-A060-protocol-review-artifact.json)
- [docs/evidence/RX-A060-protocol-review-attempt1.json](../../docs/evidence/RX-A060-protocol-review-attempt1.json)
- [docs/evidence/RX-A060-protocol-review.json](../../docs/evidence/RX-A060-protocol-review.json)
- [docs/evidence/RX-A060-protocol-review.mjs](../../docs/evidence/RX-A060-protocol-review.mjs)
- [docs/evidence/RX-A060-qualification.json](../../docs/evidence/RX-A060-qualification.json)
- [docs/evidence/RX-A060-repaired-package.log](../../docs/evidence/RX-A060-repaired-package.log)
- [docs/evidence/RX-A060-runtime-review-artifact.json](../../docs/evidence/RX-A060-runtime-review-artifact.json)
- [docs/evidence/RX-A060-runtime-review-probes-attempt1.json](../../docs/evidence/RX-A060-runtime-review-probes-attempt1.json)
- [docs/evidence/RX-A060-runtime-review-probes.json](../../docs/evidence/RX-A060-runtime-review-probes.json)
- [docs/evidence/RX-A060-runtime-review-probes.mjs](../../docs/evidence/RX-A060-runtime-review-probes.mjs)
- [docs/evidence/RX-A060-runtime-review-setup-failure.log](../../docs/evidence/RX-A060-runtime-review-setup-failure.log)
- [docs/evidence/RX-A060-runtime-review.json](../../docs/evidence/RX-A060-runtime-review.json)
- [docs/evidence/RX-A060-sync.log](../../docs/evidence/RX-A060-sync.log)
- [docs/evidence/RX-A060.md](../../docs/evidence/RX-A060.md)


## RX-A070

**Ordered proximity matching**

**Milestone:** N5 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/34)

**Dependencies:** [RX-4003](../../IMPLEMENTATION_TASKS.md#rx-4003)

Add selected ordered-gap semantics over positional data without redefining strict phrase search.

**Expected affected areas**

`src/addons/proximity/`, `test/addons/proximity/`, `test/fixtures/phrases/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](../../docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](../../docs/specs/CORE_CONTRACT.md), [VERIFICATION_PLAN.md](../../docs/planning/VERIFICATION_PLAN.md), [ORDERED_PROXIMITY.md](../../docs/specs/ORDERED_PROXIMITY.md)

**Acceptance criteria**

- RX-A070-AC01: Specify maximum gap, ordered matching, repeated-token consumption, alternative groups, and field/value boundaries.
- RX-A070-AC02: Strict phrase remains the zero-gap contract with unchanged eligibility/scores; any proximity weighting is a separately versioned declared ranking choice.
- RX-A070-AC03: Required positions, bounded evaluation work, missing-capability errors, and transactional side-state behavior are explicit.

**Verification**

- Compare proximity eligibility with an independent token-position scan, including repeats, overlapping alternatives, and zero-gap phrase parity.
- Measure bounded work, limits, cancellation, and mutation/restore parity.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-A070.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-A070-artifact-review.json](../../docs/evidence/RX-A070-artifact-review.json)
- [docs/evidence/RX-A070-baseline-permitted.log](../../docs/evidence/RX-A070-baseline-permitted.log)
- [docs/evidence/RX-A070-baseline.log](../../docs/evidence/RX-A070-baseline.log)
- [docs/evidence/RX-A070-build.log](../../docs/evidence/RX-A070-build.log)
- [docs/evidence/RX-A070-candidate-0.1.0-rc.0.tgz](../../docs/evidence/RX-A070-candidate-0.1.0-rc.0.tgz)
- [docs/evidence/RX-A070-candidate.json](../../docs/evidence/RX-A070-candidate.json)
- [docs/evidence/RX-A070-candidate.log](../../docs/evidence/RX-A070-candidate.log)
- [docs/evidence/RX-A070-check.log](../../docs/evidence/RX-A070-check.log)
- [docs/evidence/RX-A070-ci.log](../../docs/evidence/RX-A070-ci.log)
- [docs/evidence/RX-A070-final-check.log](../../docs/evidence/RX-A070-final-check.log)
- [docs/evidence/RX-A070-focused-initial.log](../../docs/evidence/RX-A070-focused-initial.log)
- [docs/evidence/RX-A070-matching.log](../../docs/evidence/RX-A070-matching.log)
- [docs/evidence/RX-A070-package-initial.json](../../docs/evidence/RX-A070-package-initial.json)
- [docs/evidence/RX-A070-package-initial.log](../../docs/evidence/RX-A070-package-initial.log)
- [docs/evidence/RX-A070-package.json](../../docs/evidence/RX-A070-package.json)
- [docs/evidence/RX-A070-package.log](../../docs/evidence/RX-A070-package.log)
- [docs/evidence/RX-A070-parent-artifact-audit.json](../../docs/evidence/RX-A070-parent-artifact-audit.json)
- [docs/evidence/RX-A070-protocol-review-attempt1.json](../../docs/evidence/RX-A070-protocol-review-attempt1.json)
- [docs/evidence/RX-A070-protocol-review-attempt1.log](../../docs/evidence/RX-A070-protocol-review-attempt1.log)
- [docs/evidence/RX-A070-protocol-review.json](../../docs/evidence/RX-A070-protocol-review.json)
- [docs/evidence/RX-A070-protocol-review.log](../../docs/evidence/RX-A070-protocol-review.log)
- [docs/evidence/RX-A070-qualification.json](../../docs/evidence/RX-A070-qualification.json)
- [docs/evidence/RX-A070-runtime-review-attempt1.json](../../docs/evidence/RX-A070-runtime-review-attempt1.json)
- [docs/evidence/RX-A070-runtime-review-attempt1.log](../../docs/evidence/RX-A070-runtime-review-attempt1.log)
- [docs/evidence/RX-A070-runtime-review.json](../../docs/evidence/RX-A070-runtime-review.json)
- [docs/evidence/RX-A070-runtime-review.log](../../docs/evidence/RX-A070-runtime-review.log)
- [docs/evidence/RX-A070-sync.log](../../docs/evidence/RX-A070-sync.log)
- [docs/evidence/RX-A070-typecheck.log](../../docs/evidence/RX-A070-typecheck.log)
- [docs/evidence/RX-A070.md](../../docs/evidence/RX-A070.md)


## RX-A080

**Bounded text query syntax**

**Milestone:** N5 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/35)

**Dependencies:** [RX-4003](../../IMPLEMENTATION_TASKS.md#rx-4003)

Compile an explicit user-facing syntax to the existing validated query tree without introducing a second evaluator.

**Expected affected areas**

`src/addons/query-syntax/`, `test/addons/query-syntax/`, `examples/docs-search/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](../../docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](../../docs/specs/CORE_CONTRACT.md), [VERIFICATION_PLAN.md](../../docs/planning/VERIFICATION_PLAN.md), [QUERY_SYNTAX.md](../../docs/specs/QUERY_SYNTAX.md)

**Acceptance criteria**

- RX-A080-AC01: Specify supported operators, quoting/escaping, precedence, field names, error spans, empty input, and depth/token limits.
- RX-A080-AC02: Parsed queries use the existing validated native query contract and installed capabilities; unknown fields/operators are explicit errors.
- RX-A080-AC03: The parser is optional, produces safe diagnostic text, and does not silently fall back from malformed expressions to different semantics.

**Verification**

- Use hand-written parse trees and syntax/error-span fixtures, plus generated bounded expressions.
- Compare parsed queries with equivalent typed queries for results, scores, limits, and installed-capability failures.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-A080.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-A080-admission-initial.log](../../docs/evidence/RX-A080-admission-initial.log)
- [docs/evidence/RX-A080-artifact-audit.log](../../docs/evidence/RX-A080-artifact-audit.log)
- [docs/evidence/RX-A080-artifact-review.json](../../docs/evidence/RX-A080-artifact-review.json)
- [docs/evidence/RX-A080-baseline.log](../../docs/evidence/RX-A080-baseline.log)
- [docs/evidence/RX-A080-build-initial.log](../../docs/evidence/RX-A080-build-initial.log)
- [docs/evidence/RX-A080-candidate-0.1.0-rc.0.tgz](../../docs/evidence/RX-A080-candidate-0.1.0-rc.0.tgz)
- [docs/evidence/RX-A080-candidate.json](../../docs/evidence/RX-A080-candidate.json)
- [docs/evidence/RX-A080-candidate.log](../../docs/evidence/RX-A080-candidate.log)
- [docs/evidence/RX-A080-check.log](../../docs/evidence/RX-A080-check.log)
- [docs/evidence/RX-A080-ci.log](../../docs/evidence/RX-A080-ci.log)
- [docs/evidence/RX-A080-contract.log](../../docs/evidence/RX-A080-contract.log)
- [docs/evidence/RX-A080-final-check.log](../../docs/evidence/RX-A080-final-check.log)
- [docs/evidence/RX-A080-focused-initial.log](../../docs/evidence/RX-A080-focused-initial.log)
- [docs/evidence/RX-A080-oracle-review.json](../../docs/evidence/RX-A080-oracle-review.json)
- [docs/evidence/RX-A080-oracle-review.log](../../docs/evidence/RX-A080-oracle-review.log)
- [docs/evidence/RX-A080-package-initial.json](../../docs/evidence/RX-A080-package-initial.json)
- [docs/evidence/RX-A080-package-initial.log](../../docs/evidence/RX-A080-package-initial.log)
- [docs/evidence/RX-A080-package.json](../../docs/evidence/RX-A080-package.json)
- [docs/evidence/RX-A080-package.log](../../docs/evidence/RX-A080-package.log)
- [docs/evidence/RX-A080-parent-artifact-audit.json](../../docs/evidence/RX-A080-parent-artifact-audit.json)
- [docs/evidence/RX-A080-qualification.json](../../docs/evidence/RX-A080-qualification.json)
- [docs/evidence/RX-A080-runtime-review-attempt1.json](../../docs/evidence/RX-A080-runtime-review-attempt1.json)
- [docs/evidence/RX-A080-runtime-review-attempt1.log](../../docs/evidence/RX-A080-runtime-review-attempt1.log)
- [docs/evidence/RX-A080-runtime-review.json](../../docs/evidence/RX-A080-runtime-review.json)
- [docs/evidence/RX-A080-runtime-review.log](../../docs/evidence/RX-A080-runtime-review.log)
- [docs/evidence/RX-A080-sync.log](../../docs/evidence/RX-A080-sync.log)
- [docs/evidence/RX-A080-typecheck.log](../../docs/evidence/RX-A080-typecheck.log)
- [docs/evidence/RX-A080.md](../../docs/evidence/RX-A080.md)


## RX-A090

**Explicit record patch convenience**

**Milestone:** N5 · **Status:** `done` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/36)

**Dependencies:** [RX-4003](../../IMPLEMENTATION_TASKS.md#rx-4003)

Offer partial record updates by composing authoritative source with the existing atomic replacement contract.

**Expected affected areas**

`src/addons/patch/`, `test/addons/patch/`, `test/fixtures/mutations/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](../../docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](../../docs/specs/CORE_CONTRACT.md), [VERIFICATION_PLAN.md](../../docs/planning/VERIFICATION_PLAN.md), [RECORD_PATCH.md](../../docs/specs/RECORD_PATCH.md)

**Acceptance criteria**

- RX-A090-AC01: Define set/unset behavior, nested-path scope, missing records/fields, validation, and revision conflict policy.
- RX-A090-AC02: Patches require authoritative source at the declared revision and compile to the same incremental atomic mutation path.
- RX-A090-AC03: Source-free or stale/conflicting patches fail explicitly; no dynamic schema migration or hidden source retention is added.

**Verification**

- Compare patch results and index state with independently constructed full replacements, including unset/null/array/invalid input cases.
- Test conflict, pre-commit failure, cancellation, and source-provider absence without partial changes.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-A090.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

- [docs/evidence/RX-A090.md](../../docs/evidence/RX-A090.md)
- [docs/evidence/RX-A090-artifact-review.json](../../docs/evidence/RX-A090-artifact-review.json)
- [docs/evidence/RX-A090-artifact-review.log](../../docs/evidence/RX-A090-artifact-review.log)
- [docs/evidence/RX-A090-baseline-retry-invalidated.log](../../docs/evidence/RX-A090-baseline-retry-invalidated.log)
- [docs/evidence/RX-A090-baseline-sandbox.log](../../docs/evidence/RX-A090-baseline-sandbox.log)
- [docs/evidence/RX-A090-build.log](../../docs/evidence/RX-A090-build.log)
- [docs/evidence/RX-A090-candidate-0.1.0-rc.0.tgz](../../docs/evidence/RX-A090-candidate-0.1.0-rc.0.tgz)
- [docs/evidence/RX-A090-candidate.json](../../docs/evidence/RX-A090-candidate.json)
- [docs/evidence/RX-A090-candidate.log](../../docs/evidence/RX-A090-candidate.log)
- [docs/evidence/RX-A090-check.log](../../docs/evidence/RX-A090-check.log)
- [docs/evidence/RX-A090-ci.log](../../docs/evidence/RX-A090-ci.log)
- [docs/evidence/RX-A090-final-check.log](../../docs/evidence/RX-A090-final-check.log)
- [docs/evidence/RX-A090-focused.log](../../docs/evidence/RX-A090-focused.log)
- [docs/evidence/RX-A090-lifecycle.log](../../docs/evidence/RX-A090-lifecycle.log)
- [docs/evidence/RX-A090-package-initial.json](../../docs/evidence/RX-A090-package-initial.json)
- [docs/evidence/RX-A090-package-initial.log](../../docs/evidence/RX-A090-package-initial.log)
- [docs/evidence/RX-A090-package.json](../../docs/evidence/RX-A090-package.json)
- [docs/evidence/RX-A090-package.log](../../docs/evidence/RX-A090-package.log)
- [docs/evidence/RX-A090-post-build-audit.json](../../docs/evidence/RX-A090-post-build-audit.json)
- [docs/evidence/RX-A090-qualification.json](../../docs/evidence/RX-A090-qualification.json)
- [docs/evidence/RX-A090-runtime-review.json](../../docs/evidence/RX-A090-runtime-review.json)
- [docs/evidence/RX-A090-runtime-review.log](../../docs/evidence/RX-A090-runtime-review.log)
- [docs/evidence/RX-A090-syntax-isolation.log](../../docs/evidence/RX-A090-syntax-isolation.log)
- [docs/evidence/RX-A090-verification-review.json](../../docs/evidence/RX-A090-verification-review.json)
- [docs/evidence/RX-A090-verification-review.log](../../docs/evidence/RX-A090-verification-review.log)


## RX-A100

**Static-build and Astro adapter**

**Milestone:** N5 · **Status:** `deferred` · [GitHub tracking](https://github.com/vmitsaras/raveldex/issues/37)

**Dependencies:** [RX-4003](../../IMPLEMENTATION_TASKS.md#rx-4003)

Integrate native search artifacts with static content pipelines while keeping extraction and framework behavior outside the engine.

**Expected affected areas**

`integrations/astro/`, `examples/astro/`, `test/integrations/astro/`. These are planning boundaries; create files only when this task needs them.

**Contracts**

[ADDONS_AND_ADAPTERS.md](../../docs/architecture/ADDONS_AND_ADAPTERS.md), [CORE_CONTRACT.md](../../docs/specs/CORE_CONTRACT.md), [VERIFICATION_PLAN.md](../../docs/planning/VERIFICATION_PLAN.md)

**Acceptance criteria**

- RX-A100-AC01: Define an explicit content allowlist, record IDs, source URLs, build/runtime analyzer compatibility, update strategy, and artifact loading behavior.
- RX-A100-AC02: The adapter builds/loads native public artifacts and does not introduce framework, crawler, parser, or network code into the core.
- RX-A100-AC03: A real static/Astro consumer verifies navigation, asset paths, optional result-data loading, accessible UI, and native snapshot compatibility.

**Verification**

- Build and serve a packed integration fixture with real content and verify native query/navigation results after deployment-path changes.
- Inspect core consumer imports and adapter package dependencies; test stale/incompatible/missing artifacts and optional loading behavior.
- Record acceptance outcomes, commands, environment, failures, and limitations in docs/evidence/RX-A100.md; add the existing record to this task's evidence only after it has been produced.

**Recorded evidence**

None recorded. A future report destination in the verification steps is not evidence.


## Research ideas outside the task backlog

These are unscheduled questions, not promised features or release dependencies.

| Idea | Question before proposing implementation |
| --- | --- |
| Adaptive index detail | Can measured phrase cost justify an explicit atomic upgrade of selected fields to positions while preserving semantics? |
| Search Difference Lab | Can actual score/analyzer traces explain useful configuration regressions without duplicating the scorer in the UI? |
| Temporal/version search | Which revisions are retained/searchable, what are the costs, and how does complete erasure work? |
| Federation | Can grouped collection-local results help before a cross-collection ranker requires compatible statistics? |
| Optional semantic retrieval | Which real failures justify separate vectors/models, and how are related results kept distinct from strict lexical eligibility? |
| Rust or WebAssembly kernels | Does profiling isolate work that warrants cross-language build, memory, transport, and deployment complexity? |

Research proposals need a user problem and a bounded experiment. No idea permits importing a foreign default search engine or weakening exact totals, evidence, revisions, or optional-cost contracts.
