# Search-family manual qualification handoff

Status: **Not run** for human AT speech, physical IME/touch/on-screen keyboards, actual browser zoom and physical-device/native-Safari combinations in this slice. Automated native-browser, synthetic-event, emulated-media and output measurements are separate in [family evidence](RX-7006.md). Record exact browser/version, OS/build, device/input, AT/version, zoom/display settings, outcome and notes for each actual observation.

| Surface | Human scenario still required |
| --- | --- |
| Inline | Read exact total/range and highlighted original text; reach every bounded result window, choose/remove filters, recover no-results/Retry, compose physical text and verify focus after Clear and replaced results. |
| Documentation modal | Open by trigger and permitted shortcut, traverse/close/reopen, confirm logical opener restoration and deliberate announcements. Test native search-field first-Escape behavior, loading cancellation/Retry, actual encoded heading links and preserved/reset query policy. |
| Compact dropdown | Edit/composition with real keyboard, virtual arrow selection, Enter/current native link, modified activation, Escape and Tab exit. Follow the full-results route with raw query and reach all results; test native Popover placement and keyboard settings. |
| Directory | Browse without text, OR within/AND across groups, conjunctive counts, unknown/projected/zero selections, chip focus, Clear all, complete pages and native Back/Forward. Open/close filter disclosure using keyboard/touch and verify summary restoration. |
| Rich results | Repeat directory tasks through list/cards/grid/density changes with stable order/focus. Enable images deliberately; verify meaningful alternatives, silent decorative images, failed/long localized alternatives and useful text-only recovery. |

For every surface, test actual 200%/400% zoom, enlarged text, physical narrow/touch device and on-screen keyboard, long/RTL translations, real light/dark/high-contrast settings and reduced motion. Keep focused controls/links visible, content readable and ordinary navigation available. Native link traversal depends on browser/OS preferences; recorded automated macOS WebKit probes use Option+Tab, without changing preferences.

Test the application's actual page lifecycle and navigation/cache behavior, including interrupted loads, Retry, returning to the page and disposal of only owned resources. Scripted pagehide/persisted-pageshow events do not prove physical mobile/BFCache behavior. Replace public sample content/CSS/image alternatives before application-specific qualification; verify every real destination and matching Astro generation/base/source field.

No human review, native Safari/Firefox/device support, remote CI, hosted Pages behavior, npm/release/publication or universal accessibility/performance claim follows from local automation. The eight copied projects are qualified in Chrome/Chromium; six have additional existing WebKit suite coverage. The two inline copied-project suites were not run in WebKit; cross-surface inline state/preview observations in WebKit are a different scope.
