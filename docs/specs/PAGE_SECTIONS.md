# Page and section display contract — RX-6004

Status: frozen 2026-10-30; implemented in RX-6005, 2026-11-01. The optional factory, inline section mode and separate Astro companion implement the contract below. RX-6004's specification/fixture evidence remains separate; RX-6005 verification is recorded in its own evidence. The existing [search-solutions contract](SEARCH_SOLUTIONS.md), [static integration](STATIC_ASTRO.md) and [native evidence API](../api/ADDONS.md#original-ranges-and-snippets) continue to apply.

## 1. Decisions and scope

1. Index one native record per page. Native `total`, scores, ID ties, order, filters/facet counts and pagination count **pages**. Section metadata cannot change membership, score, rank, or hit offsets. Never deduplicate a page of section records and call its total pages. Existing flat-section demos keep their record semantics.
2. Keep optional section metadata outside core and outside retained native index state. The UI owns captured maps; a new optional evidence presentation reads actual source providers for one requested page. No crawler, extraction, slug generation, alternate engine, core field, snapshot format or worker protocol is added.
3. Select at most three section previews per displayed page in deterministic source order. They show contributing positive occurrences, not a claim that the complete page query matches within each section. No global matching-section total is computed or displayed.
4. Publish a **separate version-1 Astro companion**. Existing v1 manifest/documents formats use strict key validation; adding keys there would break existing readers. Keep those envelopes and directory-route validation unchanged.
5. Section loading in this first wave supports **source-format static handles only**. Qualified native handles remain valid for ordinary loading/search, but explicit section loading refuses. This avoids claiming source identity from a native artifact joined only by configuration and IDs.

RX-6005 owns the APIs, projection, rendering, optional artifact writer/reader and regression tests below. RX-6007 owns real rendered anchor targets and installed modal starters; RX-6008 owns broader interface/AT/platform qualification. RX-6004's fixtures and native-evidence checks validate the contract's inputs and expectations, not the later implemented section projector.

## 2. Frozen data shapes and ownership

The inline option is `pageSections?: PageSections`; `maxSectionPreviews?: number` defaults to **3**, integers **1–3**, and is valid only with `pageSections`. Omitting maps keeps the existing inline/snippet path unchanged. Sections and existing `snippetFields` are mutually exclusive in one mount: do not request two evidence extensions or change existing snippet behavior. Legacy UI options remain unchanged; the later modal reuses the same optional presentation contract.

| Readonly type | Exact properties |
| --- | --- |
| `PageSections` | `kind: 'raveldex-page-sections'`, `version: 1`, `revision: number`, `pages: readonly PageSectionPage[]` |
| `PageSectionPage` | `pageId: string`, `sections: readonly PageSection[]` |
| `PageSection` | `anchor: string`, `heading: string`, `headingLevel: number`, `field: string`, `valueIndex: number`, `start: number`, `end: number` |

All fields above are required; extra keys, accessors, symbols, sparse arrays, nonplain objects, malformed Unicode and implicit coercion fail capture. Own and deeply freeze all metadata synchronously before replacing authored DOM. Capture against the exact borrowed engine reference and the already captured display documents; later mutation of the options cannot retarget that binding. Revision numbers from another owner have no meaning. The plain map carries no unforgeable owner token: detecting a caller lying about a foreign map with the same numeric revision is not promised. Do not infer a page ID from its URL/title. Page IDs use the existing nonempty opaque ID rule, at most 256 UTF-16 units, unique and present in display documents. Direct maps may be a subset; absent pages and explicitly empty maps are both valid page-only presentations. Duplicate page entries reject the set.

`revision` is a nonnegative safe integer observed from a successful mutation/search on that same engine. It binds the application-supplied maps **and their display generation**. The application must build headings/ranges from the same originals it indexes and render those anchors in the corresponding page. This is an application contract, not authentication of a publisher or proof that arbitrary HTML contains an ID. UI capture never reads/crawls destination DOM. A later mutation never automatically restamps a map: capture fresh metadata and destroy/remount to restore context after a stale-map warning.

### Heading and range rules

- `heading` is nonblank plain text, at most **512 UTF-16 units**. Preserve its exact spelling; never interpret HTML or use normalized tokens as a heading. `headingLevel` is an integer **1–6** copied from the authored heading. It is metadata, not permission to insert arbitrary result heading levels.
- `anchor` is the exact raw decoded HTML ID, **1–256 UTF-16 units**, well-formed Unicode, with no Unicode control characters (`Cc`), ASCII whitespace or literal `:~:` fragment-directive marker. Percent signs, `#`, non-ASCII letters and combining marks are otherwise literal. Do not Unicode-normalize, slugify, decode, suffix or repair it. Repeated heading labels are valid; repeated anchors within one page are invalid, even across fields. The same anchor on different pages is valid. Missing/empty anchors or headings reject the map; omit an unavailable section explicitly instead.
- `field` obeys the existing field-name syntax and must be a declared text field supported by the selected evidence factory. `valueIndex` is a nonnegative safe integer: scalar strings are value **0**, string arrays use their original indexes. No concatenating fields/values or reusing offsets from rendered HTML/normalized tokens.
- `start` and `end` are safe integers with **0 ≤ start < end ≤ originalValue.length**, half-open **original UTF-16** offsets. Both endpoints must be actual grapheme boundaries under the receiving environment's usable `Intl.Segmenter`. Empty ranges, split surrogate pairs, split combining/emoji clusters, missing values and out-of-source spans are invalid. In-source/grapheme validation uses original text; syntactic capture alone cannot establish it.
- Within a `(pageId, field, valueIndex)`, section ranges must not overlap or nest; equal/duplicate spans also reject. Adjacency and gaps are valid. For nested authored headings, the application supplies disjoint portions (for example, each heading's text until the next heading), retaining heading level as metadata. No ancestor/descendant tree or implicit containment is inferred.
- Canonical source order is ascending **field name by UTF-16 lexical comparison, valueIndex, start, end, anchor by UTF-16 lexical comparison**. Input array order, heading label/level, occurrence density and page score do not choose previews. Capture normalizes to this order; canonical section indexes are zero-based positions in that captured per-page list.

Structural/duplicate/overlap errors detectable without originals reject UI capture before DOM replacement. Declared-field/value/source/grapheme errors discoverable only inside the requested provider refuse that context operation as specified in section 6. Builders/loaders with originals validate the complete map before publishing it.

## 3. Parent and section URLs

Section-enabled parent display URLs must pass existing HTTP(S), no-credentials capture and also have **no preexisting fragment delimiter**, including a trailing empty `#` (whose URL.hash is empty); do not silently replace a caller's fragment. Queries already allowed by direct display capture remain unchanged. Astro parent URLs still come exclusively from its existing ASCII directory paths/base; this does not widen `safePath` or permit fragment-bearing `StaticEntry.path`.

Resolve against the captured absolute parent URL, append `#` plus `encodeURIComponent(rawAnchor)` exactly once, and verify the resulting URL has the identical origin, pathname and search, no credentials, decoded fragment exactly equal to the raw ID, and at most **2,048 UTF-16 units**. Reject a longer result rather than truncating the anchor. For example, raw `%#café` becomes `#%25%23caf%C3%A9`, not a decoded `%` escape or a second encoded fragment. Relative page links resolve once through the existing UI capture; static base concatenation remains unchanged. Fragment targets are an application obligation verified in real rendered starter pages by RX-6007; an ID spelling mismatch is never repaired by searching the DOM.

## 4. Optional evidence, qualification and excerpts

Optional entry **`/addons/sections`**, factory **`createSectionEvidence(SectionEvidenceOptions)`**, capability/request key **`section-evidence`**, contract version **1**. These are additive exports implemented only in RX-6005. Options reuse native `fields: Record<string, 'source' | 'offsets'>`, ID/fact/range/work/output bounds and add `maxCodeUnits?` (default/max 240), `maxHighlights?` (default/max 32); each positive integer may lower its ceiling. Preview count is a request option with a fixed maximum of three, not a second factory setting. No factory retains section maps or creates a transaction participant/index.

Every selected field requires original source. Strategy `source` reanalyzes its source provider; strategy `offsets` additionally requires original-offset positions and **still** a source provider for display. All provider/analyzer/root revisions must match the native operation. `Intl.Segmenter` is needed for original-text boundary validation/excerpts. Installing or requesting the optional section factory never changes retrieval/scoring. Existing match-evidence/snippet/Inspector requests stay unchanged and mutually exclusive as today.

The new optional import graph has no DOM/network/storage access, worker creation or automatic initialization. Factory creation only captures options; segmentation is requested during actual projection (or explicit map validation in the static builder/loader), not on import. New caption, omission, unavailable-context and stale-map text must have optional message overrides so existing complete message bundles remain compatible. Do not announce each child preview separately or move focus during context completion.

The new `SectionEvidenceRequest` has `ids` (exactly one page ID), `expectedRevision` (required), `sections` (at most 64 compact descriptors), and optional `maxPreviews` (default 3, integer 1–3) plus the existing optional `fields`, `maxFacts`, `maxRanges`. The UI passes its `maxSectionPreviews` as request `maxPreviews`; there is no separate factory count ceiling to reconcile. Each descriptor contains only **`sectionIndex, field, valueIndex, start, end`**: its canonical index is unique in **0–63**; heading/anchor/URL strings stay in the UI. The selected fields default to the factory's canonical fields; all descriptor fields must belong to them. Require indexes to cover the provided descriptor array exactly in canonical order. The UI sends the whole declared map for that page, not just likely matches. Lower core payload limits can refuse an otherwise valid request.

For direct add-on callers selecting an absent or query-excluded page, preserve native `eligibility` and return empty ranges/previews and zero section omissions, without reading that page's source values. Structural payload validation, declared fields, revision and required providers still validate before this outcome. The UI selects only known matched main hits and rejects an absent/excluded reply for those hits as incompatible. Type exports from `/addons/sections` are `PageSections`, `PageSectionPage`, `PageSection`, `SectionEvidenceOptions`, `SectionEvidenceRequest`, `SectionEvidenceData`, `SectionDocument`, `SectionPreview` and `SectionOmissions`; inline and static declarations reference these types without importing runtime initialization.

RX-6005 explicitly extends the **private optional evidence capture/presentation seam**: `parseMatchRequest` continues to reject descriptor keys; the section presentation supplies its own private capture/parser. Keep that refactor outside core, preserving old request validation/output. Worker registration identity includes all factory/provider/projection options; per-request descriptors travel as ordinary bounded owned payloads. Register the same new optional factory in the worker's explicit configuration. No new worker command or implicit worker creation is authorized.

### Complete evidence and section selection

1. Retrieve the ordinary native page batch first. For each newly displayed mapped page, request one detailed search with the **same captured query and search offset/limit**, its one selected ID and `expectedRevision` equal to the main reply. Native retrieval is rerun only for coherent evidence, never to rank sections. Compare the detailed result revision/model/completeness, exact total, all batch IDs/order/scores and extension revision against the main reply.
2. Native evidence contributes only occurrences from **actual successful positive** query paths in selected fields. Failed or negative branches contribute none. Prefix ranges cover the whole matched original token; derived identifier provenance stays as returned. Match evidence is complete or refuses; never accept a truncated array or `complete:false` as partial success. Existing snippets' three globally selected windows cannot discover or clip sections reliably, and are not this projector's input.
3. Validate all declared ranges against current provider originals, then qualify a section iff at least one canonical positive range is **wholly contained** in that section in the same field/value. Merely intersecting or crossing a section boundary does not qualify it and is never clipped into a fake token. A page can satisfy AND clauses across sections/fields; a child preview indicates contributing text, not full-query satisfaction.
4. Select the first `min(requestedPreviewCap, qualifyingSections)` in canonical source order. Do not skip an earlier qualifying section merely because its token/cluster cannot fit an excerpt. At most one excerpt is produced for each selected section, or null with truthful omission flags. Repeated matches do not duplicate sections; repeated headings with distinct anchors remain distinct.

### Deterministic section-clipped window

For a selected section, use the existing original-token/grapheme-safe highlight principles, constrained to its range. If its whole source span fits `maxCodeUnits`, return that **entire exact span**. Otherwise find its earliest contained canonical range (source start/end/position order) whose grapheme-expanded span fits the cap, and call its expanded endpoints **a, b**. Prefer up to **40 UTF-16 units** of preceding context: choose the first section-local grapheme boundary at or after `max(section.start, a - 40)`, then the last boundary at or before `min(section.end, windowStart + cap)`. If that end would exclude the chosen expanded range, move start to the first boundary at or after `b - cap` and recompute end. The resulting window must enclose **[a,b)**. Never cross the section or the original field/value, split a cluster, or substitute normalized text.

If no contained range's expanded span fits, return `snippet:null`. Otherwise mark all canonical contained matches fully represented in the window, expand to grapheme boundaries, union overlapping/touching marks and retain the first `maxHighlights` merged marks in source order. Long/outside-window/unrepresented matches remain explicit omissions. A window's `omittedBefore/After` refers to undisplayed text **within its section**, not other sections or field values.

`SectionEvidenceData` extends the current `MatchEvidenceData` header (`kind:'raveldex-match-evidence-v1'`, actual revision/fields/scope, `complete:true`). Its one `SectionDocument` keeps `id, eligibility, ranges` and adds:

- `sectionPreviews`: entries `{ sectionIndex, snippet, snippetOmissions }`; `snippet` is existing original-coordinate `Snippet` or null. `snippetOmissions` uses the existing five counters/flags, scoped to canonical wholly-contained ranges in that section. `windowLimit` means another window within that section would be needed; null windows account for every unshown qualifying range. Oversized token/grapheme counters retain current meanings.
- `sectionOmissions`: `{ omittedSections, unmappedRanges, boundaryRanges }`. `omittedSections` counts known qualifying descriptors beyond the preview cap **for this selected page only**; it does not count oversized excerpts as omitted sections. `boundaryRanges` counts canonical ranges intersecting declared spans but wholly contained in none. `unmappedRanges` counts ranges neither contained nor intersecting any span. Each canonical range belongs to at most one category, and missing/empty maps do not invent native counts.

No response reports a global matching-section total or a section BM25 score. UI text is “Matching text in this page” and, when applicable, “More matching context is not shown.” It may expose per-page omitted context as scoped information, but never replace the exact page summary with a section count.

Complete native evidence is a provider guarantee, not a cryptographic UI proof. Validate its reported completeness, shape, revisions and source/ordinal bounds; a shape-valid malicious provider silently dropping a range while falsely claiming completeness cannot be generically detected by a consumer. Do not advertise that stronger authenticity guarantee.

## 5. Finite costs and request lifecycle

| Boundary | Fixed ceiling / refusal rule |
| --- | --- |
| Captured map collection | 10,000 pages, 16,384 total sections, 64 sections/page; 4 MiB serialized UTF-8 owned map, 1,000,000 ownership entries, depth 16 |
| Section metadata | ID 256, field 64, heading 512, anchor 256 UTF-16 units; resolved section URL 2,048 |
| Detailed request | One selected ID, 64 compact descriptors; native maximum 16,384 aggregate key/string UTF-16 payload units, 16,384 structural entries, depth 16; lower owner limits still apply |
| Native evidence | Complete ranges/facts each at most 4,096; **exceeding**, not merely reaching, a cap refuses; output/work limits may refuse earlier |
| Source inspected | Each referenced distinct original value once; existing per-value 65,536 and record 262,144 UTF-16 ceilings remain; native source analysis also obeys its current limits |
| Membership scan | At most 64 × 4,096 = 262,144 charged descriptor/range pair visits per page; no successful partial scan |
| Work/output | Shared native/optional work at most 10,000,000 work units; existing lower configured bounds, 16,384 output structure entries and 262,144 aggregate output key/string UTF-16 units apply |
| Additional section response cap | 262,144 **serialized UTF-8 bytes** for the section extension alone, enforced in optional code; this is distinct from UTF-16/structure accounting |
| Excerpts | At most 3 × 240 = 720 UTF-16 text units and 96 marks per displayed page, plus heading/link metadata and complete native ranges |
| UI accumulation | Existing at-most-1,000 parent hits implies at most 3,000 child previews, 720,000 preview text UTF-16 units and 96,000 marks; default parent cap remains 100 |

Ceilings are inclusive. Over-limit capture refuses the set; over-limit projection refuses that context operation. No silent map truncation, partial evidence, partial scan or “exact” total from an incomplete scan. Existing lower native limits win; a 4,096-range input is not a guarantee its complete response fits structural/byte limits. Ownership, validation, source scans, segmentation, coordinate/field comparisons, range visits, mark union and output copies are charged/cooperatively resumable where the host primitive permits. JSON, hashing and segmentation contain bounded nonpreemptible host work. No retained/peak-memory, physical-copy, latency or universal corpus-completion guarantee follows from these counts.

Per UI instance, allow **one section request in flight**, processing only the new native batch (at most existing pageSize 100). Load more never reprojects prior accumulated hits. Cancel the remaining sequence on new query, clear, destroy or revision mismatch; ignore late replies by the existing generation ticket. Keep focus and controls stable and commit a coherent new page batch atomically after all its section outcomes are classified. Never enqueue 100 requests simultaneously against the native pending-operation ceiling. Destroy cancels presentation work, releases its owned section-map/preview buffers even if the destroyed handle remains referenced, and restores original nodes without disposing the borrowed engine or retaining maps in module-global state. Caller-supplied maps remain the caller's data.

## 6. Failures, missing context and recovery

These are explicit **new section-mode policies**. Existing snippet mode's whole-presentation refusal behavior does not change.

| Observation | Observable outcome / owner |
| --- | --- |
| Maps omitted | Existing inline behavior, no section requests or section retention. RX-6005 regression. |
| Page missing from direct map / explicit empty map | Valid parent link, no children, no invented omission count. Distinguish `no-map` / `empty-map` internally; no error required. |
| No positive ranges / no wholly-contained section | Valid parent page, `no-positive-evidence` / `no-matching-section`; no fabricated headings. Known scoped unmapped/boundary information may be shown. |
| Main revision differs from captured map revision before projection | Keep validated native parent pages; show visible `stale-map` context-unavailable state, make no section calls, and require fresh metadata/remount for context. Never restamp old ranges. |
| Missing/incompatible section provider, unsupported evidence path/environment, source-bound/grapheme invalidity, work/output/deadline refusal in the **section** request | Keep validated parent batch and show a fixed safe context-unavailable reason; no children/excerpts/count of unknown omissions. Retry repeats native search/context safely. Missing fields/values/bounds use typed `INVALID_OPTIONS` inside the new projector; missing provider uses `MISSING_CAPABILITY`. Native fixed resource/environment codes remain intact. |
| Main native search fails | Existing full error/retry; never present a successful empty result. |
| Main/detailed/evidence revision mismatch | Clear attempted/accumulated hits and counts; retain query/filters and retry from the first window. A subsequent current main reply may legitimately recover pages with a stale-map warning until remount. |
| Malformed or incomplete reply, mismatched main facts, absent/excluded evidence for a known main hit, duplicate/unknown/misordered section index, invalid returned text/highlight bounds | Reject the whole attempted window as incompatible evidence; no corrupted-context fallback. RX-6005 reply-validation tests. |
| Query replacement, clear, destroy or native cancellation caused by these actions | Quietly suppress stale replies; do not show cancellation as no-results or revive the old DOM. |
| Explicit companion load fails | Typed loader failure; ordinary loaded owner remains usable. A starter may explicitly choose page-only UI with a visible unavailable-context message; no silent fallback or implicit retry. RX-6007. |

Factory/mount option errors throw before replacing authored content. The UI catches only known safe **context-only native refusals** for page-only presentation (`MISSING_CAPABILITY`, `INCOMPATIBLE_CAPABILITY` from provider validation, `INVALID_OPTIONS` for source-bound descriptors, `LIMIT_EXCEEDED`, `WORK_LIMIT_EXCEEDED`, `RESOURCE_EXHAUSTED`, `DEADLINE_EXCEEDED`, `UNSUPPORTED_ENVIRONMENT`). A revision mismatch or malformed externally returned evidence is never classified by that fallback list merely because its text contains a code. Unknown exceptions/transport failures follow whole-request error/retry, not page-only success.

## 7. Separate optional static artifact

RX-6005 adds optional `pageSections` to the explicit builder and Astro hook **option allowlists**, not to `StaticEntry`, `StaticDocument`, the base manifest or snapshot. It is an array of `PageSectionPage` without runtime revision. Omitted means no companion files are emitted. An explicit empty array emits empty section lists for all allowlisted pages. Own input synchronously under the existing build budget, validate every map against the captured original entries and configured fields/graphemes, and reject the complete optional input on any malformed page/section. The builder may serialize valid metadata without a section-evidence factory; projection then remains unavailable. For actual section presentation, explicitly select that factory in both build and restore configuration. Adding it only at restore is a configuration mismatch, not a reason to silently rebuild. Complete source providers for all schema text fields remain required by existing static snapshots; no automatic registration/retention.

Keep existing `manifest.json`, `source-*`, `native-*` and `documents-*` bytes unchanged **for the same configuration/entries/buildId**. Adding a section factory to configuration naturally changes its existing fingerprint/snapshot, and is not compatibility with a differently configured owner. The optional files are:

| File | Exact version-1 JSON shape |
| --- | --- |
| `sections-manifest.json` | `{ kind:'raveldex-static-page-sections', version:1, buildId, base, recordCount, configurationSha256, documentIdsSha256, sourceSha256, documentsSha256, asset:{file,bytes,sha256} }` |
| `sections-<sha256>.json` | `{ kind:'raveldex-page-sections', version:1, buildId, pages:[{pageId,sections:[PageSection]}] }` |

`asset.file` must equal `sections-` + its lower-case 64-hex SHA-256 + `.json`; bytes is its exact positive UTF-8 byte count, at most **4 MiB**. Companion metadata is at most **256 KiB**. Reject unknown keys/versions/kinds, invalid digests/counts/paths/structure/Unicode, duplicate IDs/anchors or over-limit data. Pages are sorted by native ID lexical order and cover **every allowlisted ID exactly once**, inserting `sections:[]` for absent maps. Count and sorted ID digest must match the base manifest; map input with an unknown ID rejects rather than being dropped. Canonicalize sections by section source order. The schema never serializes an owner reference or builder/local native revision.

Bind the companion to the loaded base manifest's **buildId, base, recordCount, configurationSha256, documentIdsSha256, exact source asset hash and exact documents asset hash**. Build IDs/IDs alone cannot prove unchanged text, URLs or headings. The descriptors provide accidental corruption/mixed-generation detection, not publisher authentication. A changed content/display/map/configuration generation uses a fresh application buildId and complete deployment.

Extend only the hook's explicit file allowlist in its newly/exclusively owned `raveldex/` namespace to include these two file forms. Build all contents before writing, write content-addressed assets before companion metadata, and leave `manifest.json` as the final write as in the current hook. Never overwrite an existing namespace/symlink or weaken collision checks. A partial new directory after a failure is not deployable. Old readers ignore additional unreferenced files, not unknown fields in old envelopes.

### Explicit load and runtime binding

New loader handles supply `loadSections(options?: LoadDocumentsOptions): Promise<PageSections>`; the property is **optional in the public `LoadedStaticSearch` type** to preserve caller-authored legacy handle objects. The new implementation always supplies it. It performs no work until called, does not cache or initialize UI, and shares that loaded owner's disposal lifetime. Existing initial requests, `loadDocuments`, exports and absent-feature import graphs retain their behavior.

The method closes over that handle's manifest URL, manifest identity and actual `restored.revision`. It rejects native-format handles with `INCOMPATIBLE_ARTIFACT` before fetching a companion. On a source handle it:

1. Checks disposal/caller abort and observes the current revision through public `engine.search({kind:'none'}, {limit:0})`; an observed difference from the saved receiver revision rejects `INCOMPATIBLE_ARTIFACT`.
2. Explicitly requests `sections-manifest.json` in the exact same `raveldex/` directory and its one content-addressed asset. Use existing streamed byte/hash/fatal-UTF8 checks, no redirects/query/credentials/fragments, timeout 30,000ms (selectable 1–120,000ms), reader-advance ceiling and lifetime/caller cancellation. No discovery, extra page fetch, implicit retries or display-data request. The builder checks the encoded base+path+fragment portion against 2,048 units from its entries, without inventing a deployment origin. The UI checks the actual absolute joined URL, including its real origin, against 2,048 units during capture after the application explicitly loads documents. This data-only method has no display URL cache; build acceptance does not override the UI's absolute-URL ceiling.
3. Validates every companion binding, full page ID count/digest and owned metadata. Calls existing public `createSnapshots(engine).exportSource()` **transiently**, checks its actual `header.originRevision` equals the saved receiver revision, and validates every field/value/source/grapheme range against the decoded original records. This is an additional bounded full-source codec pass (existing 64 MiB snapshot ceiling), can refuse work/encoding/segmentation, and is not a hidden retained ID/source cache. Release temporary encoded/decoded originals after validation.
4. Probes the revision again, checks cancellation/disposal, then synchronously publishes a frozen runtime map stamped with the saved **receiver revision**, with no await after its final checks. Do not compare the builder snapshot's serialized origin revision to the receiver's revision or copy it into runtime maps.

Probes are observations, **not a mutation lock or a Promise-delivery freshness guarantee**. An already queued mutation may complete between the final probe and the caller continuation; the returned map retains its original stamp and every subsequent UI main/map/evidence join must still check revision. Never reserve a new core lock/readRevision API or prevent ordinary mutations. A late/mutated/disposed load refuses or produces a map whose stale stamp is explicitly detected at use; it cannot justify wrong excerpts.

Reuse the adapter's fixed errors: missing file `MISSING_ARTIFACT`; unsupported version/kind/malformed envelope `INVALID_ARTIFACT`; build ID mismatch `STALE_BUILD`; other generation/config/source/display/native-format/mutation mismatch `INCOMPATIBLE_ARTIFACT`; byte/hash failure `INTEGRITY_MISMATCH`; over-bound artifact `ASSET_LIMIT`; network/timeout `FETCH_FAILED`; caller stop `CANCELLED`; disposed owner `DISPOSED`. Existing native/snapshot errors remain typed separately. Bad optional builder map/field/value/source/grapheme data uses `INVALID_INPUT`; equivalent invalid data discovered while loading the companion uses `INVALID_ARTIFACT`. Missing/broken `Intl.Segmenter` propagates existing `RaveldexError('UNSUPPORTED_ENVIRONMENT')` in build/load/projection, not malformed-data or empty-success fallback. Do not echo URLs, anchors or source text in diagnostics. A failed optional load leaves the ordinary owner usable; dispose still closes it and aborts all optional reads.

### Compatibility cases

| Producer/reader/call | Required outcome |
| --- | --- |
| Old producer → old/new reader, no sections requested | Unchanged native search/display/route behavior; no companion request. |
| New producer with sections → old reader | Old v1 files remain valid; old reader requests no companion. |
| New producer without sections → explicit new `loadSections` | `MISSING_ARTIFACT`; existing owner remains usable. |
| Old producer/builder receives new `pageSections` option | Existing strict unknown-option rejection; no pretend old support. |
| New source reader → matching supported companion | Validated frozen runtime map with receiver revision; no index/score change. |
| New source reader → unsupported/mixed/tampered companion | Typed refusal above, ordinary owner unchanged. |
| New native reader → section method | `INCOMPATIBLE_ARTIFACT` without companion I/O; ordinary qualified-native search remains unchanged. |
| Mutation before/during load or just after last probe | Observed mismatch refuses; an unavoidable later race leaves the old stamp, detected by UI before context. |
| Source analyzer/ICU environment changes | No cross-environment Unicode/evidence equivalence claim; validate actual receiving grapheme/source behavior and refuse invalid mapping rather than rewrite it. |

## 8. Independent fixtures and implementation ownership

[Handwritten fixtures](../../test/fixtures/page-sections/README.md) define native page IDs/ties/scores/paging, original Unicode/token coordinates, positive/cross-boundary ranges, canonical preview anchors/excerpts/omissions and failure/compatibility cases. Four identical indexed pages force exact native ID ties without using implementation-generated expectations. Display maps differ and do not affect those page facts. Run them with source and offsets-plus-source, direct and module worker. RX-6004 checks the native input/evidence facts. RX-6005 verifies the section projection, companion and finite installed anchor fixtures; complete rendered modal starters remain RX-6007 work.

| Contract branch / observable result | Implementation and verification owner |
| --- | --- |
| Plain-data capture, limits, canonical order, duplicate/missing/overlap/source/value/grapheme/URL rules | RX-6005 optional UI/add-on + installed unit/browser cases against literal fixtures |
| Page membership/count/order/scores/paging unchanged, complete positive evidence, prefix/Unicode/field-value isolation, source/offset × direct/worker | RX-6005 independent native oracle/arithmetic and packed browser matrix |
| First-three selection, null/long excerpts, 240/32 caps, boundary/unmapped/local omission counts, no global total | RX-6005 projector tests; exact boundary/+1 cases and literal expected slices |
| Context-only unavailable versus whole-attempt failure, stale maps, query/clear/destroy, late/hostile replies, request serialization/DOM caps | RX-6005 installed browser lifecycle/failure tests |
| Separate companion shape, writer order/collision, exact v1 preservation, old/new readers, all binding and stream/count/byte/structure ceilings | RX-6005 packed static builder/client/hook tests |
| Source-only load, transient public export, receiver revision, mutation/abort/disposal before/during/after probes | RX-6005 real owner interleaving and installed worker/static cases |
| Application extraction, actual heading targets/encoded fragments and root/subdirectory base after rebuild | RX-6007 installed starters; no automatic extraction claim |
| Semantic links/headings, focus, messaging, responsive/dark/RTL/forced colors and human observations | RX-6005 automated checks; RX-6008 scoped human/platform qualification |

No unresolved mapping, compatibility, evidence-source, fallback or limit choice is delegated silently to implementation. RX-6005 may choose internal helper/file structure, but a change to these observable rules requires amending this contract before dependent work. No runtime implementation, starter rewrite, publication or unrelated roadmap advancement is authorized by RX-6004.
