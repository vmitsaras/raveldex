# RX-9906 independent review and disposition

One fresh-context read-only review used the Superpowers code-reviewer template,
model gpt-6-astra/high, against base `877774b` and the uncommitted working tree.
The reviewer read actual source, generated pages and browser/evidence results.
No second reviewer or re-review was requested. No Critical or Minor findings.

## Important findings and one bounded fix pass

1. **Existing image opt-in across gallery source switches lacked evidence.**
   Accepted as Important. The existing Cards shared-view test now selects Grid /
   Compact, enables images in the actual gallery iframe, decodes both current-page
   illustrations, snapshots URL, source URLs, image/link Nodes and request list,
   selects Code/project/installation and returns to Preview. The same checked
   choice, query, layout, density, URL and image/link Nodes remain with no extra
   request. The original images-off/no-request assertion is retained.
   A temporary test-only negative control inserted `await optIn.uncheck()` before
   the retained-choice assertion: it failed `false !== true`. The unchanged actual
   implementation passes after removing that control. This is a coverage repair,
   not a claim that a production defect was reproduced or repaired. The temporary
   copy was removed; the mutation and raw outcomes are preserved in
   [negative-control log](logs/review-negative-control.log) and
   [actual gallery pass](logs/review-fixed.log).
2. **Capture inventory was written before the screenshot writers ended.**
   Accepted as an Important closeout evidence mismatch. Refresh the inventory only
   after the final full-site writer exits, then independently rehash every listed
   capture and all source/output files. All nine final captures were inventoried and independently rehashed after the
   final writer exited. Final [boundaries](boundaries.json) is the
   authority; no site rebuild is necessary for this evidence-only repair.

The complete issue selection passed 26/26 and the full site passed 68/68 after
this test-only fix pass. Full project and installed-candidate results remain applicable because
no package, starter, site-generation or candidate input changed during review.

## Rulings on every behavior set aside by the reviewer

- **Tracking:** finalize canonical acceptance first, then managed GitHub sections;
  exact read-back must preserve native parents, order, membership and human notes.
  Cost if wrong: tracking could misstate delivery or damage maintainer context.
- **Project/candidate:** accept only completed exit-zero logs and exact candidate
  identity, now obtained; no result is inferred from a partial process. Cost if
  wrong: a local candidate could be falsely qualified.
- **Manual qualification:** retain human AT/speech, physical input, actual zoom,
  Safari/devices and OS clipboard as unqualified. Browser doubles prove exact
  copy payload/recovery only. Cost if wrong: unsupported adoption claims.
- **Hosting:** hosted CI, deployment, registry publication and releases remain
  outside this local slice; preserve deleted workflows and do not merge/publish.
  PR141 was externally merged; this executor did not merge it or infer CI success.
  Cost if wrong: unauthorized delivery or a false release-readiness claim.
- **Later tasks:** RX-9907 and RX-9908 remain planned/unstarted; the owner's current
  instruction explicitly excludes RX-9907. Cost if wrong: adjacent work would be
  performed without authorization or prematurely marked accepted.

Inherited duplicate-source HTML payload optimization remains deferred from RX-9905;
this review raised no new Minor. The prior plural README description is replaced
as part of the necessary all-five-gallery documentation synchronization.
