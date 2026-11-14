# Current task handoff

Start with [AGENTS.md](AGENTS.md) and the [project map](PROJECT_CONTEXT.md), then
run `npm run handoff:next`. Read only the selected task and referenced spec/source/tests.

Stable [1.0.0 preparation](docs/planning/RELEASE_1_0_0.md) is complete. N12 has
five accepted tasks and closed tracking; [verification](docs/evidence/RX-9204.md)
and [issue delivery](docs/evidence/RX-9205.md) record actual results. N13 was explicitly selected; all four tasks are implemented/verified and tracking
is complete. See [the final demo verification](docs/evidence/RX-9304.md). N14 was explicitly selected and all four tasks are implemented/verified. See [the final UI evidence](docs/evidence/RX-9404.md). See [the UI polish plan](docs/planning/UI_POLISH.md). No required release-preparation task remains.
Historical completed tasks stay accepted; reconcile with the planner before new work.

The subsequent owner-selected port-collision fix is complete locally:
[RX-9501 verification](docs/evidence/RX-9501.md). N15 also includes the requested
[README demo-preview instructions](docs/evidence/RX-9502.md). Both tasks are
complete locally; their GitHub tracking and commit/push were not performed.

The next owner-selected change, [N16 header modal search](docs/planning/SITE_SEARCH_MODAL.md),
is implemented and verified locally. [RX-9601](docs/evidence/RX-9601.md) records
the final site/project/package checks and rendered previews. Source delivery,
GitHub synchronization and visual owner acceptance remain separate.

The subsequent owner-selected modernization of all five consumer galleries and
eight starter projects is complete locally: [N17 plan](docs/planning/DEMO_PRESENTATION.md),
[RX-9701 verification and independent review](docs/evidence/RX-9701.md). Existing
header-modal work is preserved. Visual owner review and source delivery remain
separate from the passing project/site/package checks.

The owner-selected [N18 continuous Load more correction](docs/planning/LOAD_MORE_APPEND.md)
is implemented and verified locally in [RX-9801](docs/evidence/RX-9801.md).
Shared inline/modal search appends through every match without switching to
replacement pages; regressions cross the legacy 20/100/1,000 limits. Complete
project, final installed candidate and generated-site checks passed with the
recorded optional comparator skips and manual limits. No required selected task
remains; reconcile with `npm run handoff:next`. Source delivery/publication remain
separate and the earlier header/demo work is preserved.

The owner selected RX-9903 only after RX-9902 delivery in PR #139 (merge `c7d59a0`). The Inline pilot is implemented and verified locally on `codex/n19-rx9903`, with one persistent Browser preview, exact Code/copy/manual-selection views and independent Browser/Astro installation. N19 is **3/8 accepted**. RX-9904 explicitly remains **planned/unstarted**; owner approval and other-family rollout are separate. Source delivery is selected in the [RX-9903 delivery record](docs/evidence/RX_9903_DELIVERY_20261114.md); the owner explicitly chose to preserve the removal of GitHub workflows and leave the PR open. See [RX-9903 evidence](docs/evidence/RX-9903.md) for 17 focused and 53 site passes, 1,744 project passes/eight optional comparator skips, installed candidate, four review repairs and one deferred Minor payload optimization.

Run commands appropriate to the changed risk and record actual outcomes in the
task's evidence. The [release runbook](docs/release/PREPARATION.md) packs/verifies
all three libraries and the [site guide](site/README.md) owns generated Pages.
Preserve historical raw evidence, adverse outcomes and executable fixtures.

The owner authorized committing and pushing the 1.0.0 preparation and N13/N14
changes, followed by CI verification on the pushed commit. Preserve unrelated
`.vscode/` work. Package publication, tags/releases, visibility changes, deployment
and optional benchmarks remain separate actions. Report the next required task separately from
optional follow-ups and identify unrun/blocked checks precisely.

The owner subsequently authorized [RX-9903 commit/push and PR delivery](docs/evidence/RX_9903_DELIVERY_20261114.md). Preserve main's workflow deletion and leave the PR open without hosted CI. RX-9904 remains planned/unstarted; publication stays separate.
