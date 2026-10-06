# Agent instructions — Raveldex

## Read only the relevant context

Start with this file, `PROJECT_CONTEXT.md`, `CODEX_HANDOFF.md`, `npm run handoff:next`, the selected task in `IMPLEMENTATION_TASKS.md`, and its referenced specifications. Read surrounding source/tests before editing. Actual repository/runtime evidence outranks old narrative claims.

## Established direction

- Native TypeScript, pure ESM, framework-agnostic library. Own indexing, retrieval, ranking, incremental atomic writes, and execution.
- No MiniSearch, Fuse, FlexSearch, Orama, or another engine beneath the native runtime. Comparators and compatibility packages stay isolated.
- Core must be useful alone. DOM, workers, persistence, phrases, positions, evidence, UI, and advanced filters/facets remain optional as specified.
- No network, DOM access, automatic initialization, or retained optional side indexes merely by importing core.
- Never reopen the historical companion/native selection debate as a prerequisite to routine work. This fresh repository adopts the native direction.
- Avoid new runtime dependencies. Tooling dependencies require a documented purpose; use npm and preserve the lockfile. RX-1001 owns initial compiler/build/test selection.

## Scope and authorization

The October 6, 2026 owner request authorizes repository initialization, committing the setup, and creating GitHub milestones/issues. It does not ask to build the entire search engine in the bootstrap turn. The native direction and roadmap are adopted; task availability describes engineering dependencies.

A later instruction to continue implementation is sufficient to execute the next dependency-ready slice. Do not invent a separate approval gate for each ordinary task or request the native direction again. Escalate only a genuinely new, unresolved load-bearing choice: materially changed behavior/architecture, incompatible public contract, costly runtime dependency, destructive migration, security/privacy boundary, or publication.

Do not publish npm packages, create releases/tags, change repository visibility, or enable paid services without an explicit instruction covering that action. Do not modify unrelated repositories. User instructions take precedence over generic source standards.

## Implementation

1. Select one bounded task, mark it `in_progress` in `docs/planning/roadmap.json`, and regenerate the readable roadmap.
2. Confirm dependencies and the task's acceptance/verification requirements. A task marked `done` requires actual evidence; an issue closure alone is not proof.
3. Implement the smallest complete slice. No success-returning stubs, pretend search APIs, duplicate fallback engine, or hard-coded query results.
4. Preserve exact totals, revision consistency, deterministic scoring/order, source-offset semantics, explicit capability failures, and documented resource bounds.
5. Write behavioral tests at the layer where the change matters. Use the independent oracle for retrieval correctness and hand-derived numerical cases for BM25. Do not make the oracle call the implementation's scorer/tokenizer for the behavior it is checking.
6. Measure claimed costs. Serialized bytes are not retained/peak memory; animation-frame timing is not physical paint; automated accessibility checks are not screen-reader observations.
7. Run focused checks, fix concrete failures, then relevant project checks. Review the resulting diff independently when work is cross-cutting.
8. Save `docs/evidence/RX-####.md` with acceptance results, real commands/environments, limitations, and review outcome. Add its actual path to `evidence`, update context/specs/docs, then mark done and regenerate. Do not add intended future paths to `evidence`.

## Planner and GitHub tracking

`docs/planning/roadmap.json` owns IDs, dependencies, task state, and acceptance criteria. `ROADMAP.md` and `IMPLEMENTATION_TASKS.md` are generated. Run `npm run docs:generate` after changing the manifest, then `npm run check`.

The GitHub workflow mirrors managed task sections and milestone checklists from that committed manifest. Preserve human notes outside managed markers and discussions/comments. Update the manifest before closing a tracked task; the sync refuses to silently reopen an issue closed inconsistently with the manifest. N5 is deferred and never automatically selected by the planner.

At the end of a slice report implementation, verification, and documentation synchronization separately; give the next eligible task or the precise remaining blocker. Never reset completed tasks to manufacture work. No-ready-work can mean blocked work, a pending decision, or a completed release backlog; say which.

## UI requirements when UI is in scope

Use semantic HTML, native form controls, visible focus, full keyboard operation, safe text insertion, reduced-motion support, and deliberate status announcements. Avoid redundant ARIA. Preserve input composition, focus, stale-response suppression, and teardown behavior. Keep CSS/UI imports outside core. Record exact assistive technology/browser/OS versions before making corresponding claims.

## Completion

Implementation complete means the behavior exists. Verification complete means applicable acceptance criteria have evidence. Project synchronized means code, tests, specs, context, roadmap, and issue tracking describe the same reality. Bootstrap checks establish only bootstrap readiness.
