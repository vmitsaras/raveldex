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

The owner approved RX-9904 candidate **N19-PILOT-85b72a0-ca92821e-20261114** on 14 November 2026 with the exact response **“Approve this candidate”**. The [review and approval record](docs/evidence/RX-9904.md) ties the decision to source `85b72a0`, the unchanged verified Pages manifest and fourteen captures. RX-9904 is **done**; N19 is **5/8 accepted**. The owner subsequently selected the next open rollout slice: RX-9905 is implemented and verified, applying that template to Modal and Dropdown; see [RX-9905 evidence](docs/evidence/RX-9905.md). RX-9906/9907 remain planned/unstarted. The owner selected RX-9905 commit/push and PR delivery, with merge conditional on passing checks. RX-9906 must remain unstarted; package publication remains separate.

Run commands appropriate to the changed risk and record actual outcomes in the
task's evidence. The [release runbook](docs/release/PREPARATION.md) packs/verifies
all three libraries and the [site guide](site/README.md) owns generated Pages.
Preserve historical raw evidence, adverse outcomes and executable fixtures.

The owner authorized committing and pushing the 1.0.0 preparation and N13/N14
changes, followed by CI verification on the pushed commit. Preserve unrelated
`.vscode/` work. Package publication, tags/releases, visibility changes, deployment
and optional benchmarks remain separate actions. Report the next required task separately from
optional follow-ups and identify unrun/blocked checks precisely.

Live GitHub read-back on 14 November confirms RX-9903 [PR #140](https://github.com/vmitsaras/raveldex/pull/140) was merged externally as `fa99d2d`; no merge action was taken during RX-9905 and no hosted CI pass is inferred. Preserve the workflow-deletion decision. RX-9904 approval and RX-9905 rollout records are selected for source delivery on `codex/n19-rx9905`; the explicit owner approval is recorded in the [review packet](docs/evidence/RX-9904.md). RX-9905 is implemented/verified; RX-9906/9907 remain unstarted.
