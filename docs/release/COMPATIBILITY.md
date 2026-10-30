# Compatibility policy

The prepared package is `@vmitsaras/raveldex@0.1.0-rc.0`, pure ESM with no runtime dependencies. It remains private and unpublished. Install the locally prepared tarball; a registry installation is not offered by this candidate.

## Public contract

The explicit package `exports` map and its declarations define the supported import surface. The [API reference](../api/README.md) describes those entries. Files under `dist/core/` and other implementation paths are not public imports. Internal layouts, scheduler seams and test instrumentation carry no compatibility promise. CSS is an explicit independent import.

For the `0.x` line, compatible fixes use a patch increment. Incompatible public API or semantic changes require a minor increment and migration notes. Candidate iterations increment the prerelease identifier when issued for review. Published bytes must never be replaced under an existing version. Local unissued drafts are identified by the tarball digest in their separate verification report; any edit invalidates that report and requires preparation again. This is the project's pre-1.0 policy, consistent with [SemVer 2.0](https://semver.org/), not a promise of 1.0 stability.

Exact totals, atomic revision publication, sanitized error categories, native ranking identity, original UTF-16 coordinates, explicit capability failures and resource bounds are part of the documented behavior. Limits are defensive admission ceilings, not promises that every admitted operation completes within its time/work budget. Score values depend on corpus statistics; compare results only at the intended revision/configuration.

## Runtime and environment

`engines.node >=22` is the declared package floor. Local candidate verification records its actual Node/V8/ICU/Unicode/OS versions. [Main CI](https://github.com/vmitsaras/raveldex/actions/runs/41008634728) verifies merged source `3407c2a` on Node 22.23.4 and 24.22.1 / Ubuntu 26.04 x64, with 860 passing tests per runner. Later documentation/metadata changes need their own artifact report. Browser and assistive-technology support is bounded to the environments and flows in the [support notes](../support/RX-4003.md). Applications must evaluate their own corpus, host, CSP, bundling and resource budgets.

Core is DOM-free. Browser UI needs a DOM; optional snippets need usable `Intl.Segmenter`; module workers and IndexedDB need their respective host capabilities. Importing a module does not create those hosts or initialize the product. The separate optional Astro integration supports explicit static builds and artifact loading; it requires exact core and optional Astro 7.3.2 peers, with Node `>=22.12.0`. No automatic application startup is provided.

`basic-v1` uses NFKC normalization, lowercasing and the specified token rules. It is not accent-insensitive, locale-aware word segmentation, full case folding, fuzzy matching or natural-language retrieval. `cafe` and `café`, and Greek words with different accents, can differ. Changing that behavior requires an explicit future analyzer design, not a candidate-docs patch.

## Snapshot and migration compatibility

Source snapshots are the portable rebuild route: retain complete originals, decode and rebuild under the receiving analyzer, and publish a new local revision. Origin revision metadata does not replace the receiver's revision. The same source data can legitimately produce different tokens on another Unicode runtime.

Native snapshots preserve versioned native state. Ordinary owners are unqualified for native export/restore. The optional factory requires the application's own exact Node runtime qualification declaration and matching format/schema/analyzer/model/limits/capabilities; a profile name or evidence filename alone runs no tests. Native browser/worker and cross-host portability are not promised. The private allocation-instrumented runtimes used for memory evidence do not qualify every normal Node runtime.

IndexedDB persistence is explicitly namespaced. Retain and compare generation tokens for save/erase; a restored snapshot and durable storage are separate commits. Transaction completion is not a power-loss or eviction guarantee. Applications retain authoritative source and choose recovery after worker death or an unknown mutation outcome; do not blindly retry a potentially committed mutation.

The optional LocalSearch integration converts the documented complete source format and rebuilds using ordinary native APIs. It does not import opaque MiniSearch state, preserve foreign scores, or make the old companion's tests native evidence. Existing `0.0.0` artifacts were private development snapshots; no published stable-version migration is assumed.

## Completed optional work and historical compatibility boundaries

The original 625-test candidate and its remote CI predate the ten explicitly selected optional changes, which are now complete and included in main CI above. Their individual acceptance records retain exact configuration/semantic and host boundaries; current CI does not imply universal runtime/AT/native snapshot qualification. [Publication status](PUBLICATION_STATUS.md) separates release preparation from the completed feature roadmap.

Identifier analysis uses reserved `code-identifiers-v1` with `identifier-tokenizer`, separate from the general one-to-one transform role. Other raw-tokenizer IDs and one-to-one handles impersonating that reserved ID reject at configuration capture. Selected code positions use an explicit `raveldex-positions-v2` payload within the existing codec family, bound jointly to that selected analyzer and exact module/worker policy. Dense v1 parsing remains strict; prior runtimes without this role/pack cannot accept the new configuration. Basic and English position data retain their v1 shape. Reindexing/source recovery and exact native qualification requirements remain explicit.

Literal/infix matching is an explicit raw-source predicate and does not depend on analyzer normalization. Its policy/fields/work/range/output identity participates in normal worker/snapshot compatibility; source/native codecs are unchanged. Source providers are required separately. Original ranges are code-point-aligned UTF-16 spans and can divide a grapheme; no normalized-to-source mapping, token positions, case-insensitive equivalence or native browser qualification is introduced.

RX-A070 adds protocol-v1 `ordered-token-groups` as an explicit leaf-refinement kind. Core owns raw alternative capture, one-time selected analysis and native canonical groups; immutable groups/maxGap are supplied only to ordered handlers. Existing exact-token-sequence contexts and strict phrase semantics stay unchanged. Position requirements and `ordered-adjacent-gap-v1` policy/options bind worker identity; existing position/source/native codecs are reused. Proximity requires exact compatible providers; no migration or prior remote qualification is implied. Token evidence/snippets explicitly refuse queries containing ordered leaves.

RX-A080 provides caller-side `explicit-boolean-fields-v1` syntax compilation through a separate public entry. It returns existing raw native ASTs, which destinations validate normally; it adds no worker registration, protocol role, codec or snapshot identity. Parser configuration is explicitly supplied and captured separately; parsing does not prepare live providers. Grammar/diagnostic policy is versioned independently of native eligibility/scoring. Ordinary string/UI behavior and core implementation remain unchanged.
