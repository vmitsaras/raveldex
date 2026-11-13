# N19 GitHub registration — 13 November 2026

The owner explicitly requested a new milestone and native sub-issues based on the supplied documentation/demo proposal, with detailed instructions and no code. The proposal's earlier read-only/no-task statements remain historical review context; they do not override this request.

- Milestone: [N19 — Documentation and demo experience](https://github.com/vmitsaras/raveldex/milestone/16).
- Overview/native parent: [#118](https://github.com/vmitsaras/raveldex/issues/118), deliberately **outside** milestone membership.
- Canonical contract: [implementation plan](DOCS_DEMO_EXPERIENCE.md), [preserved source review](N19_RECOMMENDED_DESIGN_SOURCE.md), and [roadmap](roadmap.json).
- Registration state: **0/8 accepted**, all eight canonical tasks `planned`, no implementation evidence. The existing selected-work `release` track queues RX-9901 without authorizing execution or reopening stable 1.0.0 preparation.

| Task | Native sub-issue | Deliverable | Prerequisites |
| --- | --- | --- | --- |
| RX-9901 | [#119](https://github.com/vmitsaras/raveldex/issues/119) | Site-only styling and contextual shell | Delivered RX-9801; explicit N19 implementation instruction still required |
| RX-9902 | [#120](https://github.com/vmitsaras/raveldex/issues/120) | Five-choice visual gallery | RX-9901 |
| RX-9903 | [#121](https://github.com/vmitsaras/raveldex/issues/121) | Inline preview/code and installation pilot | RX-9901 |
| RX-9904 | [#122](https://github.com/vmitsaras/raveldex/issues/122) | Explicit rendered-pilot owner approval | RX-9902, RX-9903 |
| RX-9905 | [#123](https://github.com/vmitsaras/raveldex/issues/123) | Modal/dropdown rollout | RX-9904 |
| RX-9906 | [#124](https://github.com/vmitsaras/raveldex/issues/124) | Directory/rich-results rollout | RX-9904 |
| RX-9907 | [#125](https://github.com/vmitsaras/raveldex/issues/125) | Guide/API reading templates | RX-9904 |
| RX-9908 | [#126](https://github.com/vmitsaras/raveldex/issues/126) | Integrated site qualification and handoff | RX-9905, RX-9906, RX-9907 |

Every task includes objective, prerequisite links, measurable acceptance criteria, proposed affected files, behavioral test names, commands, detailed execution steps, shared constraints and evidence/closure rules. The overview includes the full plan. Operative instructions are included in the issues because the new local planning documents are not yet on remote `main`; their file links require separately authorized source delivery.

## Native hierarchy and membership verification

The GitHub connector created/updated the issues. Milestone operations and native linking used the authenticated GitHub REST API through `gh`, because those capabilities were not exposed by the connector. `POST /repos/vmitsaras/raveldex/issues/118/sub_issues` received each actual numeric `sub_issue_id`; no replacement-parent option was used. Final native API read-back returned exactly #119–#126, each open and assigned to milestone #16. The overview's API `milestone` is actual `null`.

The registration verified exact final issue bodies, unique managed markers, labels, milestone membership and description against prepared payloads. RX-9901 and the overview have `status:ready`; dependent tasks have `status:waiting`. These labels describe technical eligibility; all canonical task statuses remain `planned`.

All 117 pre-existing issue/pull-request snapshots retained title, body, state/reason, milestone, labels and assignees. All 15 pre-existing milestones retained title, description, state and due date. Historical native relationships were not mutated. No dates or assignees were assigned to N19.

The existing native-linker source only permits N9/N13/N14; it was not expanded during this no-code request. N19 was linked directly and verified, so a later metadata synchronization must preserve these actual relationships. A global synchronization would also discover local N15–N18, which is outside this targeted registration; it was not applied.

## Baseline and delivery boundary

Inspected local baseline: `0fed44773d493088af5d54cb8646b2395ca442c7`, branch `codex/prepare-1-0-0`, initially clean. It contains accepted local header modal, showcase/starters and continuous Load more work through N18. Inspected remote `main`: `73caf4170962463dcc98c1a8a98a577a48ba6aac`, with tracking through N14. N19 deliberately builds on the newer local reality and does not recreate missing remote history.

No product source, tests, scripts, dependencies, lockfile or public generated site files changed. Local edits are planning/tracking documents, generated roadmap/task views and current-work pointers. Nothing was committed, pushed, published or deployed. The first eligible implementation task is RX-9901 only after a new explicit implementation instruction.

[Planning verification](../evidence/N19_PLANNING_20261113.md) and [machine-readable read-back](../evidence/N19_PLANNING_20261113.json) retain the scope. They are registration evidence, not completion evidence for RX-9901–RX-9908.

## Planning-only PR delivery

The owner subsequently authorized a PR and merge after passing CI, with no N19 implementation. The source branch also contains N15–N18 implementation, so delivery is isolated on `codex/n19-planning` from `main` instead of merging that branch. The main-compatible N19 graph depends on accepted RX-9404; the separate accepted N16–N18 source remains an explicit implementation-entry gate. No earlier milestone/task definitions or completion evidence are imported. The original registration records retain their actual local baseline identities and counts. [Delivery verification](../evidence/N19_DELIVERY_20261113.md) records this reconciliation.

## Subsequent N15–N18 implementation delivery

The owner separately authorized delivery of the earlier implementation with CI-gated merge. That combined source restores RX-9801 as the canonical RX-9901 prerequisite and satisfies the previously separate baseline-availability gate. All eight N19 tasks remain planned; no N19 code, dependency installation or pilot approval is included. The original planning-only PR and registration evidence retain their dated scope. See the [N15–N18 delivery record](../evidence/N15_N18_DELIVERY_20261113.md).

## RX-9901 implementation selection and local acceptance

The owner explicitly selected RX-9901 on 13 November 2026. It is now implemented
and verified locally on `codex/n19-rx9901`, based on merged `35ea42e`.
[Task evidence](../evidence/RX-9901.md) records the actual baseline/final renders,
19 focused checks, 38 site tests, full package selection (1,743 passes, eight
optional comparator skips), installed candidate and all three repaired independent
review findings. The canonical N19 state is now **1/8 accepted**.

Tracking mirrors this local completion: #119 completed; #120/#121 ready but still
planned; overview #118 remains open. Native children #119–#126 and milestone #16
membership are preserved. Historical registration/delivery paragraphs above retain
their original scope. Source commit/push, CI on a new pushed revision, broader
implementation, rendered-pilot owner approval and publication remain separate.

## RX-9901 source-delivery selection

The owner subsequently authorized committing/pushing RX-9901 and creating a PR,
with merge conditional on passing CI. RX-9902 is explicitly unstarted. The
[delivery record](../evidence/RX_9901_DELIVERY_20261113.md) and PR result distinguish
source delivery from the original local verification snapshots. Task acceptance
remains 1/8; no later task is selected by this instruction.
