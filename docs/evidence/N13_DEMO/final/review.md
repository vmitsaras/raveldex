# N13 final independent review and fixes

One fresh-context gpt-6-astra reviewer inspected the N13-only source diff against
saved pre-task sources, current source/tests, requirements and evidence. It did
not mutate the checkout or run the broad suites. Verdict was **With fixes**.

## Findings and disposition

1. Important: original highlighted excerpts followed the complete Inspector JSON.
   Fixed by placing the original-result section before the raw report, preserving
   heading/close/status/error order. A test that waits for the **finished** report
   reproduced the off-viewport heading, then passed in the full 23-test site suite.
   Earlier isVisible/early-loading checks did not establish viewport visibility.
2. Important: generic exported UI used category-specific filtered-empty wording.
   Fixed to “selected filters”; a real arbitrary-label fixture first reproduced
   the wrong status, then passed, retaining selected values and exact native IDs.
3. Important: current project map/handoff still described N13 as wholly open.
   Updated to selected/verified work during execution, and synchronized to final
   completion during issue closeout. N14 remains four unselected planned tasks.
4. Minor in review, selected count acceptance defect: Inspector said “1 selected
   documents”. A one-hit Inspector regression reproduced it before the singular
   correction and now passes. Plural statuses remain correct.
5. Minor in review, qualification/lifecycle acceptance defect: frozen corpus had
   no overviews but received an empty projection/observer. A frozen-pilot test
   reproduced it; projection now returns without DOM/observer work for that case.
6. Minor in review, mode-guidance acceptance defect: prefix hint read as universal.
   Both entry points now explicitly limit it to the default last-word completion
   setting. Technical modes and stored option values are unchanged.
7. Minor in review, navigation-verification gap: a destination-selected assertion
   repeated its selector. Restored selection by the current accessible link names,
   with independent expected gallery paths. Full gallery checks pass.

These were repaired in one bounded pass as the user's existing N13 acceptance
requires accurate counts/instructions and preserved independent qualification.
No new feature/dependency/public API or N14 implementation. The author verified
fixes through regressions; no second independent review was requested. No deferred
minor from this review remains.

## Review scope and decisions

The checkout already contained uncommitted 1.0.0 preparation. Reused that non-main
branch and saved its source baseline rather than losing those inputs in another
worktree. Delivery remains uncommitted; no push, publication or deployment.

Readable summaries are explicitly section overviews, not remapped native snippets.
This preserves raw token statistics/ranking and original UTF-16 offsets at the
cost of an overview sometimes describing the section rather than the exact
matched passage. Original highlighted matches remain deliberately reachable.

The reviewer set aside full candidate/site execution for the parent (recorded
separately), new human AT/physical input/actual zoom/hosted/public-registry claims
(requires separate evidence), preexisting release preparation and unselected N14
features (outside this change). These scope limits remain explicit; no actual
product safety or required available check was weakened.
