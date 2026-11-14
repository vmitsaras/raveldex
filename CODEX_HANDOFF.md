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

The owner-selected RX-9907 is **implemented and verified locally** on `codex/n19-rx9907`, source base `df9432d`. Guides/reference pages now have distinct reading layouts, task steps and representative Core contract grouping, named highlighted code and exact copy/manual recovery. All five original indexed Markdown sources, text/offsets and package docs remain unchanged. [Evidence](docs/evidence/RX-9907.md) records required 22/22, full site 77/77, project 1,744passed/eight optional skips/zero failures, fresh installed candidate and exact identities. One independent review's table readability/scroll and copy retry defects were repaired RED→GREEN. N19 is **7/8 accepted**; **RX-9908 remains planned/unstarted**, despite dependency readiness. Changes are uncommitted/unpushed; source delivery and publication remain separate. RX-9906 [PR142](https://github.com/vmitsaras/raveldex/pull/142) was externally merged as `633f653`; its tree matches this source base. No executor merge or hosted CI pass is claimed. Historical approval/delivery snapshots retain their original identities and scope.

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
