# ADR 0001 — Adopt Raveldex as a separate native library

Date: 2026-10-06. Status: Accepted for repository initialization and the native roadmap.

## Context and authority

The owner explicitly requested a new owned search engine after the MiniSearch-based companion, optional add-ons/adapters to avoid core bloat, and a fresh `vmitsaras/raveldex` repository initialized with a roadmap and GitHub milestones/tasks. This is the prospective native decision for this repository. It does not rewrite historical LocalSearch approvals, benchmarks, rejected decisions, or completed tasks.

## Decision

Own native indexing, retrieval, numerical ranking, incremental coherent mutation, and bounded execution in TypeScript. Keep advanced matching, position/offset storage, source presentation, host execution, persistence, and integrations optional. Source phrases are reusable semantics; audit actual source, coupling, and licensing before the first intended reuse, including phrase work in RX-2001. RX-3004 owns the broader companion migration/comparator audit. Native search must not delegate to MiniSearch or another retrieval engine.

Use one initially private ESM package identity, `@vmitsaras/raveldex`, with first-party optional subpaths introduced only when implemented and verified. Keep third-party integrations with their own dependencies independently installable when required. Do not install a rendering framework in the package.

## Why this direction

The intended product differences are owned score arithmetic, incremental work without reanalyzing unchanged documents, selectable positional/source costs, and cancellation checkpoints inside owned loops. These are acceptance goals. Initialization does not prove a speed, memory, relevance, accessibility, or ecosystem advantage over existing libraries.

## Scope and consequences

The bootstrap adopts relevant specification, verification, review, and package principles. The generic web-project preference for Astro/CMS scaffolding does not apply to this framework-agnostic library. The generic standalone accessibility-plugin factory/CSS/docs aggregation template is not copied as mandatory engine architecture. Preserve ESM, TypeScript, import safety, explicit lifecycle, package verification, and accessible optional UI principles.

No runtime is exported during bootstrap. RX-1001 selects and pins only necessary development tooling; runtime dependencies remain zero by default. N0 is documentation/foundation completion, N1 core alpha, N2/N3 modular product, and N4 candidate qualification. N5 remains deferred; publication and name/trademark clearance remain separate decisions.

Owner authorization already covers committing this initialization and creating tracking items, despite generic reusable source guidance forbidding remote writes by default. No repository permission, release status, or current search feature is inferred beyond that instruction.
