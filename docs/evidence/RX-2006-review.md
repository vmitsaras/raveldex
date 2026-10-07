# RX-2006 independent review

Date: 2026-10-07. Outcome: **Ready with follow-ups** for the bounded local UI slice. No unresolved correctness or lifecycle defect remains in the reviewed runtime. This is not release, assistive-technology, cross-browser or performance qualification.

The reviewer inspected the actual UI options/runtime/renderer/CSS, public declarations and split compiler projects, package exports/side-effects, CI, packed-consumer preparation, real documentation application, browser tests and final acceptance artifacts. Production/configuration/tests were read-only to this reviewer; the implementation owner repaired findings. Independent files are restricted to this review, its portable probe and raw records.

## Confirmed findings and resolution

| Finding | Impact and reproduction | Final verification |
| --- | --- | --- |
| P2: final page exceeded a valid engine document limit | Before repair, `ui.ts` requested the configured page size for every operation. A real engine with `maxDocuments:5`, five records and UI `pageSize:3` showed hits 1–3, then Next failed instead of showing hits 4–5. Core admission correctly rejected `offset:3, limit:3`. This also affects a full default-limit corpus with a non-dividing page size. | `src/addons/ui/ui.ts:110–136` now captures a narrowed page limit before invalidation; snippets use it and Inspector reuses `snapshot.limit` at line 170. Independent replay returns two last-page hits and two Inspector documents at revision 1. Owner regression also verifies all three admitted limits are 2 and backward paging works. |
| P3: whitespace-only custom names were accepted | `label:'   '` and a whitespace-only document title created an input label and result link containing only whitespace. Default names were valid. | `src/addons/ui/options.ts:52–55` validates human-facing names without rewriting accepted text. The final independent probe rejects blank search/facet labels and titles before altering original nodes. |

The preserved [before-fix record](RX-2006-review-before-fixes.json) contains the final-page failure. The [final probe record](RX-2006-review-probe.json) contains nine passing probes and exact package, shipped-module and source hashes. The final source hashes were checked again against the working tree, and shipped UI bytes were compared to current compiled bytes.

Two probe timeouts were evaluation defects: deliberate ignored-cancellation fixtures initially supplied `signal:undefined`, which the public engine correctly rejects. Removing that property allowed actual completed results to be delayed. A separate reviewer pack collided with an integrated clean build and lacked the UI export; a complete rebuilt package was replayed. These were not relabeled production defects or passing checks.

## Acceptance assessment

| Criterion | Result | Reviewed evidence |
| --- | --- | --- |
| AC01 semantic controls, states, facets and Inspector | Pass | Real installed/minified native form, selects, buttons, exact pages/totals, conjunctive facet counts, empty/loading/typed-error/retry states and actual factual Inspector output. |
| AC02 composition, debounce, stale work, focus and recovery | Pass for recorded browser behavior | Synthetic composition admits no interim search and one final search; rapid input debounces once. Independent probes suppress a held reply immediately during the debounce window, reject real intervening writes with `REVISION_MISMATCH`, recover, and discard late closed-Inspector facts while restoring focus. Status text and busy state are observed; audible AT announcements are unrun. |
| AC03 keyboard, focus and reduced motion | Pass for recorded host | Native Enter/Space/select/link/dialog interactions, stable control focus, Escape/opener restoration, 3px computed visible-focus outline, 320px reflow and zero animation under reduced motion. |
| AC04 text safety and source allowlist | Pass | Text nodes plus explicit marks; hostile HTML remains literal; credentialed/javascript/data links are rejected. Protocol-relative HTTP(S) links are allowed consistently with the declared allowlist contract. Real source links/section bytes come from five explicitly allowlisted current documents, excluding evidence/archives. Native navigation was observed using a locally intercepted destination response. |
| AC05 lifecycle and ownership | Pass | Duplicate root returns the same handle; captured options stay authoritative; destroy cancels a pending timer, removes detached control listeners, suppresses late replies and restores identical original Node objects. Borrowed engine disposal count stays zero and it still searches. Real application rebuilds serialize owner disposal and suppress stale mounts. No worker is created. |
| AC06 optional imports and honest accessibility evidence | Pass | Core graph has 31 inputs and no UI/Inspector/CSS/optional modules; standalone UI has six inputs including only UI and the shared error module. Import guards record no host reads. DOM-free core and separate DOM UI declaration checks pass. Eight axe states have zero violations and zero incomplete results; neither those results nor browser role/name lookups are presented as screen-reader observations. |
| AC07 usable real pilot and findings | Pass | Actual 34-section packaged application, independent source/numerical checks, exact-term and strict-phrase source/position parity, requested Inspector, navigation and teardown/reinitialization. Frozen incomplete relevance judgments retain the atomic-batch miss, source-ownership rank 5 and natural-language lexical empty. |

## Verification actually observed

From a built checkout, replay the independent consumer without relying on an old temporary-directory path:

```sh
npm run build
node docs/evidence/RX-2006-review-probe.mjs
```

The independent final execution exited 0 with **9/9 Pass**. It installs the real private tarball offline, imports public package entry points and bundles only installed runtime modules. It uses a localhost server and installed Chrome; this host required an approved execution outside the sandbox for browser/socket access.

The reviewer inspected the successful final owner `npm run check` terminal result: **374/374 package/core tests and 15/15 browser tests, zero failures/cancellations/skips/todos**, in the persisted [check log](RX-2006-check.log). Package/core and browser phases are now serialized; every required test remains present and whole-file timeouts remain bounded. Earlier whole-file timeout attempts remain failures, despite individually passing assertions.

[Artifact validation](RX-2006-review-validation.json) records the actually inspected terminal summaries, browser versions/axe results, public consumer typecheck, import/startup graphs, observed corpus identity, 42 correctness comparisons and eight mutations. It also records source, compiled and final installed-package byte matches against the independent probe. The complete [browser](RX-2006-browser.json), [package/pilot](RX-2006-package.json) and [harness](RX-2006-harness.json) records are persisted and were checked byte-for-byte against the successful frozen execution artifacts. The final browser finished at `2026-10-07T21:27:03.975Z`; current corpus hash is `93c21d1028d7e907ae6b7f607b8efa15948094b62de6af1557c0cbbd1e176f68`, verified by rebuilding the corpus in memory. Package hash is `bf59fad0e7c2c5263a4602b7c4447bd20ac14b24aaa0a2b28ba1c0dca2bfd350`. The earlier independent tarball has different documentation/metadata but identical reviewed UI runtime bytes. No rebuild or additional runtime test was needed for this artifact refresh.

Environment: Node 24.21.0, macOS 27.0.1 arm64, installed Chrome 154.0.8037.98 headless, Playwright Core 1.61.1, axe-core 4.13.0 and esbuild 0.28.2. No public lifecycle CustomEvents are added; native event listeners are explicitly owned and removed. Lifecycle review used the installed review skill's async/cleanup criteria. Modern Web Guidance was not installed or run in this environment; no retrieved-guidance or Baseline qualification is claimed.

## Remaining boundaries

- **Not run:** real OS IME, exact-tool screen readers, the supported cross-browser matrix, device/forced-colors qualification, remote CI, retained/peak heap and physical paint/interaction latency. These remain later qualification, not local failures or inferred passes.
- Caller-selected initial page size must fit any stricter borrowed-engine ceiling unavailable through the ordinary public interface. This limitation is explicit in the final UI contract; later known remaining hits and the navigation allowlist narrow pages consistently.
- Core gzip remains 16,491 bytes versus the unchanged 15,360-byte target, a 1,131-byte miss already retained for N4. Optional UI does not enter the core graph. Byte counts are not heap measurements.
- Source navigation does not qualify remote GitHub rendering or access. The real destination response was intercepted locally.
- Concurrent Chrome graceful shutdown is unqualified: diagnostic stages localized the failed concurrent harness at browser close after contexts had closed. Serial execution successfully closes browser and server; no UI leak is established by that harness-only failure.

The README, UI/execution contracts and handoff/context descriptions were inspected after their implementation updates. The final manifest marks RX-2006 done with existing acceptance/review evidence; generated roadmap and handoff select RX-3001 next, with RX-3002 also eligible. Remote tracking remains the acceptance owner's responsibility; this reviewer performs no Git, publication or remote write.
