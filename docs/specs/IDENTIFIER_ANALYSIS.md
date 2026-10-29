# Code and identifier analysis — RX-A050

Status: adopted on October 29, 2026 for the owner-selected RX-A050 task. The owner explicitly chose ordinary component matching and original-only strict phrases before runtime implementation. Other optional tasks and publication remain separate.

## Repository constraint

The preceding `single-token-transform` role receives a canonical basic token after segmentation, NFKC and lowercasing. It cannot recover original camel case or underscores, emit alternatives, or change positions. Core query compilation makes each analyzed token a required group. Position storage, offset evidence and native snapshot validation require dense unique token positions and nonoverlapping spans. Simply emitting original names followed by fragments through that role would alter AND semantics and manufacture phrase adjacency.

This is a specification/representation decision, not an environment failure. The [core contract](CORE_CONTRACT.md) and [one-to-one analyzer contract](ENGLISH_ANALYZER.md) keep their existing basic/English semantics; this selected feature adds a distinct reserved protocol.

## Proposed first integrated policy

Select a versioned global `code-identifiers-v1` analyzer explicitly through a separate `/addons/identifiers` registration. Import or registration alone leaves basic-v1 selected. A different selected analyzer requires a new index. Do not combine English stemming or basic-only typo/synonym/suggestion requests with this analyzer implicitly.

Preserve original contiguous identifiers beginning with a Unicode letter or number and continuing with letters, numbers, combining marks or underscores. Underscores separate derived components but remain part of the original identifier. Slashes, backslashes, dots, dollar signs, hyphens and other punctuation delimit originals. Full path identity, literal punctuation matching and arbitrary substring/infix behavior are outside this first policy; ordinary path queries analyze independently delimited names.

Split derived components from original spelling before normalization: lower-to-upper camel transitions; acronym-to-capitalized-word transitions (HTTPServer becomes HTTP / Server); letter-to-number and number-to-letter transitions; underscores. Combining marks stay attached to their original base. Apply NFKC followed by default lowercase independently to each original or component span. Uppercase includes Lu/Lt, lowercase Ll and numeric transitions use all N categories (Nd/Nl/No). Orphan combining marks after underscores stay in the whole but do not start components. Pin these categories and normalization behavior in critical fixtures; do not promise locale-specific word segmentation. Preserve original half-open UTF-16 spans, value boundaries and full original identifier provenance. Reject oversized or malformed originals instead of truncating them.

Adopted grouping:

- Ordinary raw query analysis emits original identifier groups only. A query `fooBar` requires its canonical whole name; its components are not added as extra required groups or query alternatives.
- Index analysis retains the canonical original and distinct derived components. A query `foo` can match the component of `fooBar`. A plain query `foo bar` requires both groups and may match both components of one original identifier. Existing Boolean grouping and deduplication rules remain explicit.
- Use native BM25 with equal weight 1 for original and component terms. Count retained distinct term occurrences in TF, DF and field-length statistics; avoid counting an identical whole/component term twice at one original. No exact-name rank guarantee or hidden bonus is claimed. Actual trace arithmetic must account for the retained occurrences and lengths.
- Fragments retain their source original's ordinal and a derived-component tag. They never become successive original positions. Source/evidence output distinguishes original and derived matches and exposes actual component coordinates plus the full original identifier coordinates.

Adopted phrase behavior: strict phrases use original identifiers only. `foo bar` does not become a phrase inside `fooBar`; `fooBar next` can be a phrase across two original identifiers. Explicit component phrase matching and arbitrary token graphs remain unsupported. Source, positions and mixed phrase providers must agree, and component occurrences must never leak into ordinary phrase adjacency.

The owner selected ordinary component matching over the alternative explicit component-query capability. For repeated/normalization-colliding components, retain the earliest original component span for a canonical term at an original ordinal; suppress a component identical to the whole canonical name. This deliberate deduplication does not claim every repeated component is separately highlighted.

## Verification required before completion

1. Freeze literal original/component/group/span fixtures for camel names, acronyms, digits, Unicode, combining marks, normalization collisions, underscores, punctuation, paths, repeated components and independent values/fields. Use an independent reference and hand-authored critical spans.
2. Freeze developer-navigation judgments from actual Raveldex API and implementation identifiers and their documentation/source provenance before production execution. Keep incomplete full-document relevance labels distinct from exhaustive literal-symbol membership. Preserve all 76 original non-code regressions with the pack installed but unselected; report selected-mode changes separately. An AI-authored evaluation is not a user study.
3. Verify complete Boolean membership, exact totals, deterministic pages, native numerical trace contributions, original-only source/position/mixed phrase parity, component evidence and snippets without fabricated ranges or adjacency.
4. Meter raw scanning, component generation, retained/transient cardinalities and every provider reanalysis under shared operation/module budgets. Exercise ownership, malformed configuration/input/output, cancellation, deadlines, queue freshness, rollback, remove/replace/clear and disposal. No silent truncated success.
5. Run installed/minified public consumers, actual Node workers and source/native restore with exact selected descriptor, version, manifest and environment mismatch refusal. Upgrade position/evidence/snapshot representation deliberately; do not accept new overlapping/co-position data as old v1 dense-token state.
6. Measure imported core versus optional code and logical work separately. Do not infer heap/allocation/transport peaks or manual AT/browser portability from these checks.

RX-A050 is verified locally with [acceptance and independent review](../evidence/RX-A050.md). A proposed contract, scanner helper or green baseline alone does not establish completed engine integration.

## Reserved protocol and representation

`identifier-tokenizer` is implemented only for the reserved `code-identifiers-v1` ID. Reject other raw IDs and a one-to-one handle using that ID at capture; arbitrary third-party segmentation/graphs are outside this contract. Capture positive integer work steps and all token/provenance properties through own data descriptors before use, reject accessors/symbols and emit owned frozen data. Validate canonical terms against actual original spans, dense original ordinals, distinct source-ordered nonoverlapping components and exact originating identifier. One module budget spans the entire operation, including provider reanalysis and restored records.

The existing positions codec family recognizes a separate tagged `raveldex-positions-v2` root only under this exact selected analyzer. Each value distinguishes `originalCount` from retained-occurrence `tokenCount`; each occurrence has an original/component tag. Offset-free state retains no coordinates; selected offsets permit full-origin provenance reconstruction. V1 payload shape and validation remain strict. Analyzer/module policy/header identity and the v2 root tag jointly guard this additive representation, including worker/source/native restore.
