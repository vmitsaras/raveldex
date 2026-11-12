# Agent instructions — Raveldex

## Start here

Read [project context](PROJECT_CONTEXT.md), run `npm run handoff:next`, then
read the selected task in `IMPLEMENTATION_TASKS.md` and its referenced specs.
Read surrounding source and tests before editing. The [contributor guide](CONTRIBUTING.md)
lists setup and verification commands. Current code/runtime evidence outranks
historical handoffs; [CODEX_HANDOFF.md](CODEX_HANDOFF.md) is only a current-work pointer.

## Architecture and contracts

- Native TypeScript, pure ESM, framework-agnostic core with no runtime dependencies.
  Do not put MiniSearch, Fuse, FlexSearch, Orama or another engine beneath it.
- Core is independently useful. Source/positions, optional query features, DOM,
  workers and persistence remain explicitly selected. Importing core must not
  access DOM/network, initialize hosts or retain optional side indexes.
- Preserve exact totals, coherent revisions, deterministic scoring/order, original
  UTF-16 offsets, atomic writes, explicit capability failures and resource bounds.
- Keep runtime dependencies out unless their maintenance/API cost is justified
  and approved. Use npm and preserve dependency versions and the lockfile.

## Bounded implementation

1. Select a dependency-ready task, mark it `in_progress` in
   `docs/planning/roadmap.json`, and run `npm run docs:generate`.
2. Implement the smallest complete slice using established source/test patterns.
   No success-returning stubs, hard-coded results or duplicate fallback engine.
3. Test behavior at the affected layer. Retrieval uses the independent source
   oracle; BM25 cases use hand-derived expectations, not the implementation scorer.
4. Review the resulting diff for scope, public-contract regressions, lifecycle,
   failure behavior, accessibility and stale documentation.
5. Record actual commands, results, environments, limitations and review in
   `docs/evidence/RX-####.md`. Add only existing evidence paths to the manifest;
   mark done only after applicable acceptance is verified, then regenerate views.

## Verification proportional to change

Use the smallest reliable evidence for the affected criterion. Nonpackaged
planning/evidence edits need graph/generated/reference/diff checks; they do not
require rebuilding an unchanged runtime. Packaged docs need inventory/link/example
checks. Executable changes need relevant semantic/installed behavior checks and
one complete candidate verification. Build once for a stable input set and reuse
that output for subsequent checks.

Reused evidence keeps its actual runtime, test/fixture, build and dependency
identities. Executable files in evidence directories are real inputs. Never call
unavailable required behavior Pass or enlarge benchmark/browser/AT claims from
source inspection, screenshots or an unrelated check. The historical
[qualification amendment](docs/planning/SCOPED_QUALIFICATION_AND_IDENTITY_20261107.md)
records the scoped N10/N11 decision; optional comparative research is not a
prerequisite for ordinary product work.

## Tracking and delivery

The canonical roadmap owns task IDs, dependencies, status and acceptance.
`ROADMAP.md`, `IMPLEMENTATION_TASKS.md` and optional task cards are generated.
Run `npm run docs:generate` after manifest edits. Use `npm run docs:check`,
`npm run handoff:check` and the relevant behavior checks before the full check.

GitHub mirrors managed task sections and milestone checklists. Update the manifest
before closing tasks; preserve human notes, labels, discussion and existing native
parents. Optional milestones never enter automatic task selection. Do not reopen
completed tasks to manufacture work.

## UI and ownership

Use semantic HTML/native controls, safe text insertion, visible focus, keyboard
operation, reduced motion and deliberate status announcements. Preserve composition,
stale-response suppression, focus, teardown and borrowed-engine ownership. Keep
UI/CSS imports outside core. Retain Raveldex's existing identity unless redesign
is explicitly requested. Record exact browser/OS/AT versions for manual claims.

## Authorization boundaries

A request to continue permits the next bounded dependency-ready slice. Escalate a
new incompatible public contract, major architecture/dependency change, destructive
migration, security/privacy boundary or publication decision. Preserve unrelated
user work. Commits/pushes, npm publication, releases/tags, visibility changes and
paid services require an explicit instruction covering those actions.

Report implementation, actual verification and documentation/tracking separately.
Give the next eligible task or precise blocker; distinguish optional follow-up work
from required release work.
