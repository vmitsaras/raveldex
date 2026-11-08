# RX-9104 independent paging review

7 November 2026. Parent owned all changes. `rx9104_paging_audit` and `rx9104_verification_audit` independently inspected source, contracts, fixtures and the actual implementation/test diff. They were read-only and ran no builds, browser tests or benchmarks.

## Selected bounded policy

Stable native paging-button nodes show available actions and any currently focused unavailable action. The latter remains guarded with `aria-disabled` until actual focus transfer; only then may it hide. The owning document/shadow root determines focus. Clear/error/replacement invalidate the summary and private appended target; deferred visibility work reads current state and stops after suspension/teardown.

The range paragraph is separate from action navigation. A native Go to new results button follows Load more after an append; settlement retains focus, while explicit Tab/Enter or Space activation focuses the first appended title anchor. This avoids fragment navigation and leaves result links/engine offsets unchanged. Optional captured `newResults`/`resultsAdded` strings were specified in the current consumer contract before implementation. Existing complete original message bundles remain valid.

## Findings and resolution

| Finding | Resolution |
| --- | --- |
| Draft discovery guard returned when enabled (`!== 'true'`). | Corrected to reject `=== 'true'` before the installed-browser run. Enter/Space discovery assertions now pass. |
| Added shadow discovery filled its two-result cap before the existing failed-append scenario. | Restore a first batch with a fresh alpha search before injecting append failure, preserving the original focused-result recovery purpose. |
| Deferred visibility callback still ran during modal suspension despite the selected contract. | Callback now checks `activePresentation()`; synchronous suspension owns hiding its navigation. |
| Focused discovery replacement/stale-target coverage was missing. | Added a held replacement with the discovery control focused, guarded activation, a newer query and late-reply release; current IDs/range survive and the retired target cannot activate. |
| New style hook was absent from the consolidated hook list. | HOSTS includes `__new-results`. |

Both reviewers reread the corrections and reported no remaining actionable findings. They confirmed independent range expectations, old-bundle compatibility, private target lifetime, shadow focus checks, shared modal layout and the family traversal helper's adjustment for hidden unavailable actions.

Two draft compile/typecheck stages preceded the final correction set; they were not runtime acceptance. Final build/typecheck and all browser checks use the corrected candidate. Human screen-reader speech, physical input, actual zoom and additional browser/device combinations remain unobserved; source/DOM associations cannot establish those outcomes.
