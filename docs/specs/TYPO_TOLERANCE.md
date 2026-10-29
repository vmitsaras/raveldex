# Bounded typo tolerance — RX-A010

Status: adopted for the owner's explicit October 29, 2026 RX-A010 selection. Other N5 work and publication remain separate.

## Public contract and policy

`@vmitsaras/raveldex/addons/typo` exports `createTypoTolerance`, `TYPO_POLICY`, and the `TypoOptions`, `TypoResult`, `TypoGroup`, `TypoAlternative` types. The factory accepts `{ fields, id?, maxAlternatives?, maxWorkUnits? }`, owns/freezes its options, and installs through `Configuration.addons`. Default registration ID/provided capability: `typo`, protocol version 1.

Request `{ kind: 'extension', capability: 'typo', version: 1, payload: { text, fields? } }`. Core owns the exact payload and analyzes it once with `basic-v1`. Fields default to all schema text fields, as with existing lexical/phrase leaves; every selected field must be enabled, including empty or failing branches. Unknown keys, fields, versions and missing registrations fail through the existing typed channel.

The fixed policy is **`unicode-osa1-exact-first-v1`**:

- Count normalized Unicode code points, not UTF-16 units, bytes or graphemes. Permit at most one insertion, deletion, substitution or adjacent transposition (optimal string alignment at distance one). Two edits and overlapping multi-edit sequences are unavailable.
- If a query term exists exactly in any selected field at the execution revision, select only that term at weight 1. Exact-first is per token across selected fields, not a scoring tie-break or a retry after a failed whole query.
- Otherwise the query token needs at least four code points. Enumerate all live selected dictionary terms and select every distance-one alternative at weight 0.5. Candidates may contain three code points. No accent stripping or language exception is added: `cafe` may repair to `café` only if exact `cafe` is absent.
- Keep the original exact weight-1 variant even if absent. Original words stay required AND groups with OR alternatives inside. Repeats deduplicate; distinct misspellings sharing repairs remain distinct required groups. Existing enclosing AND/OR/NOT and successful-branch scoring remain intact.
- Ordinary native BM25 uses actual alternative frequencies/statistics, selecting the best weighted alternative per field/group and summing participating groups. No phrase bonus or universal ranking guarantee follows.

Ordinary strings, exact/prefix groups and strict phrases never request typo expansion. Installation/import cannot enable it implicitly. Typo leaves compile to normal weighted groups before retrieval/evidence, exposing actual matching terms to Inspector and original-range/snippet providers; they are not strict phrase leaves.

## Bounds, state and output

The add-on scans the selected immutable live dictionary at the same revision as retrieval/scoring. It retains no side dictionary, automaton, source, positions, codec or cross-search cache. Add/replace/remove/clear cannot leave stale alternatives. Two temporary code-point arrays are bounded by `maxTermCodeUnits`. The accepted-alternatives map grows monotonically to its returned size. A specialized linear one-edit matcher is checked against an independent full OSA matrix.

`maxAlternatives` defaults to 15, maximum 15, reserving one of the default 16 core variant slots for the original term. Exceeding it rejects `LIMIT_EXCEEDED`; no alphabetical/frequency subset is selected. Core variant/group/token/depth/input and per-group/whole-query distinct `(field, term)` expansion limits also apply. Canonical groups are checked again after materialization. `maxWorkUnits` defaults to 10,000,000 and can only narrow that cap. One registration budget covers all its cursors across all leaves. Shared search work, checkpoints, deadline and cancellation remain stricter. Identical requests reuse only operation-local results.

The explicit leaf adds `result.extensions.typo = { policy, groups }`, including an empty groups array for empty input. A group contains `{ term, fields, alternatives, dictionaryEntriesVisited, workUnits }`. An alternative is `{ term, match: 'exact', weight }`. Terms are normalized; alternatives describe actual live selected terms, excluding the absent original variant. Output is canonical, immutable and merges with facets or one requested evidence provider. Dictionary visits count field entries, including repeated terms in fields. Work counts add-on yielded work only, excluding core capture/retrieval/output.

Count all output own-object and own-array keys, including array `length`, toward the registration output cap and the shared `maxAdmissionEntries` ceiling. A capability value costs `3 + Σ(8 + fieldCount + 4 × alternativeCount)` entries. The default manifest cap is `3 + maxQueryGroups × (8 + maxTextFields + 4 × maxAlternatives)`. Bound exhaustion rejects the whole search: **no incomplete mode or successful partial total exists**. Stops close cursors and preserve the index revision.

The trusted `term-expansion` role has a `weighted-token-alternatives` handle, named policy and finite token cap. Its context exposes normalized terms, selected fields, analyzer, limits, revision and exact-presence flag, without a mutable owner/core root. Returned alternatives must be live selected dictionary terms with valid weights and bounded counts. This is not a hostile-code sandbox. Core imports no typo matcher. Workers require matching canonical factory options on an explicitly installed host; only outputs requested through the admitted query are allowed.

## Verification and limits

Verify independent distance/candidate/numerical cases, original-group identity, strict interactions, original evidence, all bounds, mutation freshness, every selected suspension stop, isolated installed/minified consumers, import/state costs and worker identity. Preserve the original frozen 34-section/76-query relevance set. The separately frozen typo set declares ten positive title-navigation tasks and six negatives: require all ten recovered at Recall@10 = 1 and zero judged false positives. Preserve actual Top1/MRR and original-query regression outcomes; do not tune frozen labels after execution.

Logical dictionary visits, work and accepted-candidate high-waters are not heap/allocation-byte or physical-copy peaks. The English technical judgments are synthetic and finite, not a representative user study. Distance two, suggestions, synonyms, language packs, accent folding, fuzzy phrase/prefix combinations, text syntax and automatic UI behavior remain out of scope.
