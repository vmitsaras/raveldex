# RX-9103 independent review

7 November 2026. Baseline HEAD `51c38ab` plus preserved local RX-9102 work. Parent owned all edits; the two subagents were read-only and did not run builds, tests, installs or benchmarks.

- `rx9103_state_audit` traced shared inline/modal capture, bucket invalidation, query/reset semantics, composition, focus and modal suspension. It independently reviewed the actual source/test/documentation diff.
- `rx9103_test_audit` traced real installed fixtures, exact default-label consumers, test coverage and keyboard/accessibility risks. It independently reviewed the actual added/updated assertions.

## Decisions and findings

The implementation stays in shared `inline.ts`: facet-aware defaults use existing `idle`/`clear` message slots; custom overrides remain authoritative; each native select describes its existing summary plus the existing polite status. No additional live region, disabled/hidden control, public field, engine call or lifecycle transition was introduced.

Both reviewers confirmed that leaving selects mounted/enabled preserves selected/unlisted-value recovery and focused-control stability. Setting idle text inside every facet invalidation or disabling All-only selects would have affected composing/loading/error/focus behavior, so those changes were not made. Moving message value validation after option capture changes only precedence when multiple inputs are invalid; validation still occurs before DOM construction/mount/search.

| Finding or coverage gap | Resolution |
| --- | --- |
| Two Astro starter tests still selected the old authored Clear search label. | Exact assertions now select Clear search and filters; both selected installed Astro acceptance cases pass. |
| Inline Astro README still quoted the old action. | Quoted action now matches the explicit authored label. |
| Custom message capture was covered only without facets. | Facet-enabled idle/reset test now mutates caller message values after mount and verifies the original captured translations and zero requests. |
| Description test could discard missing target IDs before asserting. | It now verifies every referenced ID resolves, then verifies the current guidance text. |

Both reviewers performed bounded rereads and reported no outstanding findings. Their review is source/contract evidence; parent-run test logs supply execution evidence. The status association can be verbose or repeated in some assistive-technology combinations. No spoken-output claim follows from DOM associations, automated keyboard checks, screenshots or selected axe checks; the planned human walkthrough remains separate.
