# RX-9111 lifecycle and copied-recipe review

8 November 2026. Parent owns edits. `rx9111_search_lifecycle` and `rx9111_directory_lifecycle` independently audited actual source and reviewed the guide, executable example and installed tests. Read-only: neither edited, ran tests/builds/benchmarks/network calls nor delegated further.

| Area | Owning source / actual boundary |
| --- | --- |
| Captured display/maps/options and explicit search | [Capture](../../../src/addons/ui/options.ts), [inline](../../../src/addons/ui/inline.ts), [sections](../../../src/addons/ui/inline-sections.ts), [modal](../../../src/addons/ui/modal.ts), [dropdown](../../../src/addons/ui/dropdown.ts). New handles cannot restore private inline facets/window state; ordinary query failure is displayed rather than a rejected success receipt. |
| Directory state, refresh and revision | [Controller](../../../src/addons/ui/directory-controller.ts), [public declarations](../../../src/addons/ui/directory-types.ts). Forced refresh preserves committed text/filters at page one; equivalent state restoration can be inert. Read the ready result/error after awaiting. |
| Map remount, shared ownership and presentation | [Directory capture](../../../src/addons/ui/directory-view-options.ts), [mount/teardown](../../../src/addons/ui/directory-view-mount.ts), [cards](../../../src/addons/ui/directory-cards.ts). View teardown unsubscribes but does not cancel/destroy its borrowed controller; rich presentation does not replace captured metadata. |
| URL and final disposal | [URL binding](../../../src/addons/ui/directory-url.ts). Keep the binding for a compatible view remount; refresh may replace the owned page parameter. Final order remains view, optional binding, controller, then created owner after borrowers finish. |

Findings corrected before acceptance:

1. Document focus reads are retargeted for shadow trees. The finite example now validates document-tree root/anchor inputs, and the guide states this boundary. The library's existing known-shadow behavior is untouched. Installed tests refuse unsupported example hosts before DOM changes.
2. The initial controller update could settle with a query error. The example now checks ready status immediately before paging, as well as after refresh. UI/controller query settlement is distinguished from owner mutation receipts.
3. Inline/dropdown explicit search does not finish active composition. CMS/localization text now says finish or deliberately discard the draft through the chosen lifecycle action; it promises no automatic caret/composition transfer.
4. A same-raw-query dropdown request can join a still-live pre-write flight. The final guide documents close/settle-before-mutation then explicit search. This prose-only correction does not change the tested runtime/example; final package inventory/identity was refreshed without repeating browser cases.

Corrected review outcome: clear. The four fresh installed cases meaningfully verify exact filtered page/revision behavior, fresh metadata, duplicate handle/map retention, presentation, app-owned conditional focus, two complete owned executions/fallback restoration and bounded host admission. Matched current regressions retain stale replies, shared-controller remount, composition, URL replay and borrowed-owner boundaries. Parent inspected copied-code types, package/runtime/input identity and final diff. No runtime API, engine, dependency, CSS or query-policy change is present; no human AT/physical-input/zoom or broad platform claim is made.
