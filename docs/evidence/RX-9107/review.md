# RX-9107 independent visual/token review

7 November 2026. Parent owned every write. Read-only `rx9107_token_audit` mapped the selected Reading index foundations to actual CSS/public properties and reviewed the resulting implementation. `rx9107_a11y_audit` independently reviewed contrast, painted backgrounds, focus/target measurements, host isolation, recipes and regression coverage. Neither ran builds, browser suites, benchmarks or nested agents.

Resolved findings:

- An initial filled inline/dropdown Search proposal used surface as its text fallback, which could make text transparent on an existing transparent host. Before the accepted build, it was replaced with accent text/border and weight 650. Directory keeps its existing filled action. No new inline/dropdown foreground token was retained. Transparent-host samples now pass.
- Effective contrast-background lookup now skips display:contents, including the modal inline wrapper, and walks to actual painted card/host surfaces. Dropdown waits for settlement after viewport changes/ArrowDown. A valid collapsed popup would be reported as full-results recovery with no contrast/target measurements for that variant; no final measured variant collapsed.
- Focus clipping measurement initially traversed the native top-layer modal into page scroll-lock ancestors. The parent corrected it to stop at the modal boundary, retained the initial failed result and reran the modal case. The final five-surface run includes this correction.
- Directory identical-state search is a no-op. Error-palette tests now deliberately submit a different query, require the actual error state, measure it, then explicitly recover. Default and dark error colors are measured in all five surfaces.
- The package inventory gate initially refused the new optional recipe asset. The parent added only its exact path and a regression rejecting another undeclared CSS filename. Public exports, dependency and publication guards were not widened.

Both subagents cleared the corrected CSS/test design. Parent review additionally inspected the final tooling delta, raw failures/reruns, measured five-surface states and representative light/dark/narrow/RTL/enlarged screenshots. Existing public overrides, directory automatic dark behavior, compact cards, native semantics/handlers, modal bounds/inset footer focus, forced colors, reduced motion and optional CSS remain intact.

All runtime changes are five CSS files; JS and declarations match the preceding accepted candidate. Contrast evidence is sampled rendered opaque RGB arithmetic and measured geometry, not a universal accessibility/host-palette qualification. Actual 200%/400% browser zoom, physical mobile keyboards and human speech remain unobserved.
