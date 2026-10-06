# Repository bootstrap

Status: Approved. Implementation status is recorded separately in the verification record.

## Goal and outcome

Initialize the fresh private Raveldex repository with enough durable native design, task tracking, and development tooling for Codex to implement the next slice without reconstructing prior chat or re-choosing the engine direction.

## Current-system facts

The starting `main` commit was `2947dd613c4fe2204554502c86b922a9bc04ab55`, containing MIT LICENSE and .gitignore, with no issues. No search implementation exists. The owner's native direction and repository/issue-write request authorize this setup.

## Non-goals and explicitly out of scope

Implementing the engine, migrating another repository, publishing npm/releases, changing visibility, creating a website, inventing benchmark results, or importing old test passes. Source folders may document intended ownership but must not export a pretend engine.

## Decisions and constraints

Preserve existing files. Use npm, zero-dependency Node ESM bootstrap tools, strict future TypeScript core settings, an authoritative JSON task manifest, generated readable plans, repository specs/ADRs, and GitHub tracking derived from stable IDs. Native behavior and size/capacity bounds are specifications, not implementation evidence.

## Required behavior and failure cases

The planner must reject invalid IDs/dependencies/cycles, unsupported states, missing referenced specs/evidence, and done tasks without evidence or completed dependencies. It must distinguish runnable tasks, work in progress, explicit blockers, dependency waits, pending decisions, deferred optional work, and release-backlog completion.

The tracking synchronizer defaults to preview without network writes. Applying it explicitly is repository-scoped, paginated, idempotent, preserves notes outside managed markers and unrelated labels, and links actual task issues/milestones. Duplicate IDs or unmanaged title collisions fail clearly. No personal token is committed. Issue state cannot independently certify acceptance.

## Acceptance criteria

- AC-01: Existing LICENSE and .gitignore content are preserved and initial repository facts are recorded.
- AC-02: Native ownership, optional-module boundaries, core observable contracts, resource limits and verification strategy are documented with implementation status explicit.
- AC-03: Twenty-one N0–N4 task cards and ten deferred N5 tasks have stable IDs, dependencies, measurable acceptance, scoped paths, and verification instructions.
- AC-04: Human/agent docs and scaffold provide runnable local bootstrap commands without false search exports or readiness claims.
- AC-05: Behavioral tooling tests cover planner terminal states/invalid plans and synchronization preservation/idempotency. Generated plan views match the manifest.
- AC-06: Main receives the reviewed setup; six GitHub milestones, six milestone tracking issues, and thirty-one task issues are created and correctly linked; completed N0 items require actual evidence.
- AC-07: Independent review and local/remote verification describe exactly what passed, what was not evaluated, and the next eligible implementation task.

## Expected affected areas

Repository root docs/config, `docs/`, `scripts/`, `test/tooling/`, source/example/test ownership READMEs, and `.github/` templates/workflows. Only this repository's authorized tracking metadata changes remotely.

## Verification strategy

| Criteria | Evidence |
| --- | --- |
| AC-01 | Baseline content comparison and recorded starting commit. |
| AC-02–03 | Independent spec/task review and manifest/doc validators. |
| AC-04–05 | `npm ci`, `npm run check`, status/next commands, preview and behavior tests. |
| AC-06 | Remote tree/head inspection, successful workflow run and read-back of issues/milestones. |
| AC-07 | `docs/evidence/BOOTSTRAP_REVIEW.md` and `docs/evidence/BOOTSTRAP_VERIFICATION.md`. |

## Open questions

No load-bearing bootstrap decision remains open. Search implementation results, actual core size, named browser support, AT observations, and final publication are intentionally future evidence/decisions.
