# RX-9109 source and compatibility review

7 November 2026. Parent owns all writes; `rx9109_inline_audit` and `rx9109_cards_audit` independently inspected actual declarations, capture/render/lifecycle code, existing installed cases and the resulting guide/spec changes. They were read-only and ran no builds, suites, benchmarks or nested delegation.

| Decision fact | Owning source / existing case boundary |
| --- | --- |
| Basic documents have exactly id/title/url; richer structural TS assignment does not strip properties | [UIDocument](../../../src/addons/ui/types.ts), [captureOptions](../../../src/addons/ui/options.ts), [base directory capture](../../../src/addons/ui/directory-view-options.ts). Fresh copied-guide projection/type checks cover seven authored card records and preserve only these keys. |
| Inline/modal generated context and mutually exclusive options | [Inline options/search](../../../src/addons/ui/inline.ts), [rendering](../../../src/addons/ui/inline-render.ts), [map/anchor/refusal handling](../../../src/addons/ui/inline-sections.ts). Current RX-9107 controls/modal reports cover source/offset strategies, native links, revision/capability failures and actual snippets/sections. |
| Dropdown/base directory remain title-only | [Dropdown](../../../src/addons/ui/dropdown.ts), [directory mount](../../../src/addons/ui/directory-view-mount.ts). Current installed family observations retain bounded handoff, native pages, exact totals/order and ownership. |
| Cards are authored display data, not generated match evidence | [Card declarations](../../../src/addons/ui/directory-cards-types.ts), [capture/bounds](../../../src/addons/ui/directory-cards-options.ts), [rendering/images/setter](../../../src/addons/ui/directory-cards.ts). Current cards report covers optional safe metadata, actual opt-in image requests/failure, anchor identity and teardown. |

Both reviews support keep-current. The guide resolves the per-field matrix and native documentation/application/catalogue scenarios without a renderer, new field, mandatory provider or retained side index. It records source/display separation, strict projection, actual card DOM order, metadata retention while images are off, explicit requests over ready snapshots, no stronger credential/origin guarantee, and borrowed lifecycle costs.

Two draft overgeneralizations were corrected before acceptance:

1. An absent map or a current-revision empty map yields parent-only output without a section notice. Stale maps and recognized context refusals get explicit unavailable-context text. The source checks stale revision before the empty-map branch.
2. Section evidence runs only for actual mapped hits with a nonempty current-revision map. No zero-hit/absent/empty/stale-map capability probe is promised. Snippet/facet missing-capability behavior remains distinct. Rich-only `setPresentation()` is explicitly scoped.

The reviewers reread those corrections and reported no remaining actionable inaccuracies. The parent inspected the resulting guide, cross-links, source/reuse identities and exact installed projection/type/inventory checks. No runtime, CSS, API, query, privacy policy or lifecycle implementation was changed. Existing sampled browser results are reused; no new human speech, image transport anonymity, browser matrix or performance claim follows this decision.
