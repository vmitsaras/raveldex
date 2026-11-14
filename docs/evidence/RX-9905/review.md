# RX-9905 independent review and disposition

One fresh read-only reviewer, GPT-6 Astra/high, checked the uncommitted RX-9905
working diff against base `85b72a0` on 14 November 2026. The reviewer inspected
actual generated HTML and all 34 new exact source payloads, family choices,
persistent iframe semantics and instructions. No Critical finding or blocking
product behavior defect. Initial verdict: with fixes. No second review.

| Finding | Executor disposition |
| --- | --- |
| Important: Modal test waits indefinitely if its expected content request never happens | Replaced the unbounded loop with a five-second `waitForRequest` registered before the trigger click; held route is released in `finally`. This changes the test harness only. Existing full-page cancellation/retry/ready/focus/native section test runs in the final site suite. |
| Minor: draft evidence says 35 source files | Corrected the draft factual inventory to **34** (11 Modal Browser + 11 Modal Astro + 12 Dropdown) during closeout. No new product code. |
| Minor: Modal disclosure says install core and Astro without qualifying platform | Regraded Important: a Browser adopter following this instruction would install an unnecessary adapter, contrary to the actual platform prerequisites. Clarified core for Browser, matching adapter only for Astro. Human prose does not get a source-grep test; full candidate generation and rendered walkthrough are checked. Cost if left wrong: unnecessary tooling/install burden. |
| Minor: site README says “both” projects/variants after expanding to Dropdown | Deferred. The immediately preceding family matrix explicitly states Dropdown Browser-only; all actual controls are correct. Optional wording correction remains, no false additional platform is generated. |

## Declined scope and executor rulings

- Human AT/speech, physical keyboard/IME/touch, actual zoom and additional
  browser/device combinations: remain unverified; emulated viewports/scripted
  keyboard and axe add no manual claim. Cost if mistaken: unsupported coverage claim.
- OS clipboard: controlled doubles establish exact payload/recovery only; real
  OS integration remains unverified. Cost if mistaken: application copy failure.
- Performance/memory and inherited duplicate-source HTML optimization: no new
  measurement/budget selected; existing Minor optimization remains deferred.
  Cost if mistaken: larger page payload, no measured performance claim.
- Directory/Cards conversion, reading layouts, corpus requalification and N19
  integrated acceptance: RX-9906–RX-9908 remain unstarted; unchanged corpus files
  are hash-checked, not broadened qualification. Cost if mistaken: incomplete N19.
- Engine/optional handoff ownership/standalone themes/installed package: inputs
  unchanged; fresh full project and installed candidate are executor-verified,
  including copied Modal Browser/Astro and default-off/shared-owner Dropdown
  fixtures. Cost if mistaken: false regression assurance; unchanged hashes and
  actual fixture outcomes bound this claim.
- New owner visual acceptance: existing RX-9904 approval enables conforming
  rollout; this is not a new owner acceptance or release gate. Cost if mistaken:
  visual changes may need later owner revisions.
- Final full-site/project/candidate/tracking: executor records final outputs,
  counts, identities and remote readback separately; no inferred pass from review.
  Cost if mistaken: stale completion/tracking.
- Hosted CI/merge/deployment/registry/publication: not selected or claimed; keep
  workflow deletion. The executor
  subsequently read PR140 as externally merged (`fa99d2d`); no source delivery or
  merge was performed during this task. Cost if mistaken: unauthorized delivery.

Other confirmed repairs before this review: low-contrast Shiki token RED→GREEN
using installed high-contrast theme; existing desktop demo visibility failure
RED→GREEN by retaining the visible frame note inside the preview toolbar;
selected-result test reads the child anchor; full-page input assertion waits for
actual enhancement. An intermittent native table-focus assertion is retained
with diagnostic context; final full-suite result must establish closeout.
