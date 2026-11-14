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

The owner-selected RX-9908 integrated qualification is **implemented and verified locally** on `codex/n19-rx9908`, source base `62407bdce95700df1cca2998e8e5e305608db94e` (locally committed RX-9907). Fresh project verification passed **1,744 tests**, with eight optional skips and zero failures; the final site suite passed **80/80**, and fresh installed candidate, packaged docs, Pages and identity checks passed. All 92 original HTML routes, 433 anchors, eight exact starter projects and original five-guide bodies/UTF-16 offsets remain preserved. [Evidence](docs/evidence/RX-9908.md) records 40 route/viewport cases, 1,780 measured contrast pairs, native frame traversal, independent review and the owner's explicit acceptance of unavailable manual checks remaining unverified. No essential defect was found; the one deferred Minor is pinning the historical identity audit before a future rerun. N19 is **8/8 accepted**; no selected release task remains. Targeted GitHub closeout preserves native parents and human notes. RX-9908 changes remain uncommitted/unpushed; source delivery, hosted CI, deployment and publication remain separate, and workflow deletion is preserved. Historical pilot approval/delivery snapshots retain their exact original identities and scope.

Run commands appropriate to the changed risk and record actual outcomes in the
task's evidence. The [release runbook](docs/release/PREPARATION.md) packs/verifies
all three libraries and the [site guide](site/README.md) owns generated Pages.
Preserve historical raw evidence, adverse outcomes and executable fixtures.

The owner authorized committing and pushing the 1.0.0 preparation and N13/N14
changes, followed by CI verification on the pushed commit. Preserve unrelated
`.vscode/` work. Package publication, tags/releases, visibility changes, deployment
and optional benchmarks remain separate actions. Report the next required task separately from
optional follow-ups and identify unrun/blocked checks precisely.

The approved RX-9904 pilot, RX-9905 rollout and their exact identities remain recorded in their task evidence. RX-9903 PR140 and RX-9905 PR141 were merged externally. Preserve the workflow-deletion decision; source delivery, hosted checks and publication remain distinct.
