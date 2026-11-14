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

## RX-9902 implementation selection and local acceptance

The owner subsequently selected RX-9902 only, based on delivered RX-9901 merge
`f30486a`. The static five-choice overview is implemented and verified locally;
[task evidence](../evidence/RX-9902.md) records 16 focused and 45 site passes,
1,744 complete-project passes with eight optional comparator skips, the identical
installed package, three Important review repairs and one deferred Minor test
assertion. Canonical N19 acceptance is now **2/8**.

GitHub mirrors local acceptance, with #120 completed and overview #118 open.
Native children #119–#126 and milestone #16 membership stay intact; the parent
remains outside milestone membership. [Read-back](../evidence/RX-9902/github-tracking.json)
records actual states and any aggregate-counter mismatch. RX-9903 remains
planned/unstarted under the explicit owner instruction; later tasks remain
planned. New evidence is local/uncommitted; remote main links await separately
authorized source delivery. Human owner approval at RX-9904 and publication
remain separate. Historical registration/delivery sections above retain their scope.

The owner subsequently authorized [RX-9902 source delivery through a CI-checked PR](../evidence/RX_9902_DELIVERY_20261113.md). RX-9903 explicitly remains unstarted; publication stays separate.

## RX-9903 local acceptance

The owner selected RX-9903 only after RX-9902 delivery in PR #139 (merge `c7d59a0`). The Inline pilot is implemented and verified locally on `codex/n19-rx9903`, with one persistent Browser preview, exact Code/copy/manual-selection views and independent Browser/Astro installation. N19 is **3/8 accepted**. RX-9904 explicitly remains **planned/unstarted**; owner approval and other-family rollout are separate. Source is uncommitted. See [RX-9903 evidence](../evidence/RX-9903.md) for 17 focused and 53 site passes, 1,744 project passes/eight optional comparator skips, installed candidate, four review repairs and one deferred Minor payload optimization. Native hierarchy and original milestone membership remain preserved; new evidence links on remote main await separately authorized source delivery.

## RX-9903 source-delivery selection — 14 November 2026

The owner authorized [RX-9903 commit/push and PR delivery](../evidence/RX_9903_DELIVERY_20261114.md). Main commit `e3011b9` removed all GitHub workflows. The owner explicitly selected preserving the deletion and leaving the PR open after local verification. No hosted pass or merge may be inferred. N19 remains 3/8 accepted; RX-9904 remains planned/unstarted. Historical local-acceptance snapshots above retain their original identities.

## RX-9904 owner review — 14 November 2026

RX-9904 is selected for owner review on 14 November 2026. The [review packet](../evidence/RX-9904.md) identifies source `85b72a0` from open/unmerged PR #140, the unchanged verified Pages build, desktop/320 px captures and a working local walkthrough. The task is **needs_decision**, awaiting explicit approval or bounded revisions; N19 remains **3/8 accepted**. RX-9905–RX-9907 remain planned/unstarted, and no owner approval, rollout, source delivery or publication is inferred.

## RX-9904 explicit owner approval — 14 November 2026

The owner approved RX-9904 candidate **N19-PILOT-85b72a0-ca92821e-20261114** on 14 November 2026 with the exact response **“Approve this candidate”**. The [review and approval record](../evidence/RX-9904.md) ties the decision to source `85b72a0`, the unchanged verified Pages manifest and fourteen captures. RX-9904 is **done**; N19 is **4/8 accepted**. RX-9905–RX-9907 remain planned/unstarted despite technical eligibility. Approval records this gate only; no rollout, source delivery, merge or publication is selected.

## RX-9905 implementation closeout — 14 November 2026

The owner selected the next open rollout slice. RX-9905 applies the approved
pilot template to Modal and Dropdown, preserving both Modal projects, Browser-only
Dropdown, persistent preview, exact source/copy and native full-page behavior.
[Evidence](../evidence/RX-9905.md): final required25/25, complete site61/61,
project1744passes/eight optional skips/zero failures, installed candidate and
Pages/identity checks Pass. Review repair bounds a cancellation wait and qualifies
the Astro-only adapter prerequisite. One README wording Minor and inherited
source-HTML duplication optimization remain deferred.

Canonical RX-9905 is done; N19 is5/8. RX-9906/9907 remain planned/unstarted with
empty evidence; RX-9908 waits. Only #123 is selected for closure; preserve native
parent/order/milestone membership and unowned discussion/metadata. Local rollout
and RX-9904 approval records remain uncommitted. Fresh GitHub PR read-back shows
#140 externally merged as `fa99d2df4cb7ec3ce1898e837fb92d54c1e04e90`; the executor
did not merge it or run hosted CI. Historical pending/open snapshots remain
historical. Final targeted tracking read-back is recorded in RX-9905 evidence.

## RX-9905 source-delivery selection — 14 November 2026

The owner explicitly selected commit/push and a PR for RX-9905, checking CI and
merging only if everything passes. RX-9906 remains expressly unstarted. Delivery
includes the prerequisite RX-9904 approval packet without changing its approved
identity. [Delivery evidence](../evidence/RX_9905_DELIVERY_20261114.md) separates
fresh local verification from hosted availability. Preserve deleted workflows;
no-check status does not count as a hosted pass. Canonical N19 remains5/8.

## RX-9906 implementation and local acceptance — 14 November 2026

The owner explicitly selected only RX-9906. [Evidence](../evidence/RX-9906.md)
records the completed Directory/rich-results rollout: exact required 26/26,
complete site 68/68, complete project 1,744 passed/eight optional skips/zero failures,
fresh installed candidate and exact source/output/capture identities. One fresh
review's image-retention coverage and capture-inventory gaps are repaired and
verified. Canonical RX-9906 is done; N19 is **6/8 accepted**.

GitHub #124 is completed after canonical acceptance; overview #118 remains open.
All eight native child IDs/order/parents and milestone memberships are preserved,
with exact read-back in [tracking](../evidence/RX-9906/tracking.json).
RX-9907 remains planned/ready but explicitly unstarted, empty evidence; RX-9908
remains planned/waiting for RX-9907, empty evidence.

Live read-back confirms PR141 externally merged as `13637d8` at 12:52:38 UTC;
the prior delivery paragraphs retain their historical open/no-CI scope. Its tree
matches this slice's 877774b source base. This executor did not merge it.
No commit/push, new PR/merge, workflow restoration, deployment or publication was
performed for RX-9906. Evidence is local until separately authorized source delivery.
