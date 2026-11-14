# RX-9907 independent review and disposition

One fresh-context, read-only gpt-6-astra/high review used the Superpowers
code-reviewer template against base `df9432d` and the uncommitted RX-9907 tree.
The reviewer inspected actual generated pages, all original fenced snippets,
narrow table metrics and deferred clipboard behavior. No second review.

## Important findings and one bounded repair pass

1. **Dense tables became unreadable at narrow widths.** Confirmed Important.
   At 320CSSpx, the Hosts matrix first row was 765px tall, and 5859px at 200%text.
   Core's first table could not scroll, matching the existing full-site keyboard
   assertion failure (first full suite74/75). A new real-table test was observed
   RED: no scroll,765.53px row, narrow content measures. Reading table cells now
   use ordinary word wrapping, so intrinsic word widths create local overflow.
   There is no blanket fixed cell minimum. The new test requires local keyboard
   scrolling, usable word measures and bounded line count at320/200%; the original
   docs-shell assertion is retained. [RED](logs/review-red.log),
   [GREEN](logs/review-green.log).
2. **Old clipboard feedback overwrote newer retry results.** Confirmed Important.
   New browser regression reproduces older success after newer failure (RED:
   stale “Copied source.”), tests the inverse ordering, and independent panels.
   `example-controls.mjs` now tracks the latest attempt per panel using a WeakMap;
   both success and failure check identity as well as the existing page-lifetime
   guard. No clipboard permissions or native search lifecycle changes. The same
   browser regression passes after the repair. See the same RED/GREEN logs.

The required selection passed 22/22 and the complete site suite passed 77/77 after
these repairs. Package
project/candidate results keep their exact unchanged package/compiler/doc inputs;
only site CSS/controller/build output and tests changed during the repair pass.
Final captures are re-inventoried after the last writer, not before it.

No Critical or Minor findings. Inherited duplicate-source HTML payload
optimization remains deferred from prior tasks, without a performance claim.

## Rulings on every behavior the reviewer set aside

- Human screen-reader output remains unqualified; axe/semantics are supporting
  automation. Cost if wrong: unsupported speech/AT claims.
- Physical keyboard/touch remains unqualified; the recorded input is scripted.
  Cost if wrong: a browser automation pass could be misrepresented as device proof.
- Actual browser zoom remains unqualified;320CSSpx and 200%root-font scaling are
  scoped emulated reflow. Cost if wrong: unverified browser zoom support claims.
- OS clipboard integration remains unqualified; controlled promises prove exact
  payload/retry/recovery only. Cost if wrong: false platform clipboard assurance.
- Other browsers/devices remain unqualified; this review/check uses Chrome157.
  Cost if wrong: unsupported cross-browser adoption claims.
- Hosted CI/deployment/registry/release and Git delivery remain separate; no source
  commit/push/merge/publication is performed. Prior PR142 was merged externally.
  Cost if wrong: unauthorized delivery or false hosted/release qualification.
- Canonical/GitHub closeout follows actual acceptance and exact read-back, with
  native hierarchy, unowned notes and unrelated metadata preserved. Cost if wrong:
  tracking drift or damage to maintainer context.
- RX-9908 remains planned/unstarted despite becoming dependency-ready. Cost if
  wrong: adjacent integrated qualification would be performed without instruction.

## Original implementation ruling

Preserve all five indexed/packaged Markdown sources exactly and perform the
representative editorial restructuring only in site generation. This satisfies
the reading goal without changing indexed source bodies/offsets. Cost: package
Markdown does not receive the site's extra grouping and copy affordances. It
remains complete, unchanged and self-contained, as the installed candidate proves.
