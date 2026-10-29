# Dictionary-backed suggestions — RX-A020

Status: adopted for the owner's explicit October 29, 2026 selection. Other optional tracks and publication remain separate.

## Contract

The optional `/addons/suggestions` entry exports `createSuggestions`, `SUGGESTIONS_POLICY` and readonly `SuggestionsOptions`, `SuggestionRequest`, `Suggestion`, `SuggestionsResult` types. Install `createSuggestions({ fields, id?, maxSuggestions?, maxCandidates?, maxWorkUnits? })` through `Configuration.addons`. Registration ID and provided capability default to `suggestions`, protocol version 1. Options are owned and frozen.

Request `engine.search(query, { extensions: { suggestions: { text, fields?, limit? } } })`. This completes **one token**, not a whole query or an automatically selected last word. The independent output is `result.extensions.suggestions`. Installation, import and explicit requests never rewrite query text, membership, scores, pagination or submitted input. No suggestion UI, automatic application, DOM access or initialization is included.

The fixed policy is **`dictionary-prefix-df-v1`**:

- Analyze the owned original text once with the configured `basic-v1` analyzer. Zero tokens, punctuation-only input and tokens shorter than two normalized Unicode code points return an empty list with zero dictionary visits. More than one token rejects `INVALID_OPTIONS`; surrounding delimiters are allowed. Query lexical/raw-token/term limits apply independently of record value-length limits.
- Normalize with existing NFKC and lowercase only. No accent folding, stemming, spelling repair or language exception. Never reanalyze normalized dictionary terms: normalization may introduce separators inside a term. Exact-prefix candidates include the exact term when present; it has no special ranking bonus.
- Fields default to **all schema text fields**, not only enabled fields. Every selected field must be declared by the registration. Duplicate, empty or unknown selections reject, and all fields/limits/payload content are validated even for short or empty requests. Explicit selections are canonicalized by ordinal field name.
- Scan every entry in the selected live dictionaries at the search's execution revision. Select normalized terms that start with the normalized prefix. Aggregate each distinct term's **fieldDocumentFrequency** as the sum of native document frequencies in selected fields. Repeated tokens within one document/field count once; the same document can contribute once per selected field. This is not unique-document frequency across fields or a BM25 score.
- Sort by descending fieldDocumentFrequency, then ascending original UTF-16 code-unit term order. Count all matches before selecting the requested top list. Results are independent of insertion order, enclosing search query, metadata filters, qualifying hits, offset, hit limit and field boost. Suggestions intentionally describe the selected whole-corpus text dictionaries; they are not facet-filtered completions.

The result contains `{ policy, prefix, fields, total, omitted, items, dictionaryEntriesVisited }`. Each item is `{ term, fieldDocumentFrequency }`; `total` is the complete number of matching distinct terms and `omitted = total - items.length`. The enclosing search result's revision also identifies the dictionary observation. Returned structures are deeply frozen owned data. An empty corpus/request still returns this explicit shape when requested. Other requested facet, typo and evidence outputs merge normally.

## Bounds and execution

`maxSuggestions` defaults to 10 and may be set from 1 through 20. Request `limit` defaults to `min(10, maxSuggestions)` and may be zero through the module cap. A zero limit still scans/counts all candidates. Omitting known lower-ranked candidates is deliberate bounded output selection, not an incomplete total.

`maxCandidates` defaults to 10,000 and may only narrow that cap. A per-operation map accumulates matching distinct terms from all selected fields before selection; exceeding this cap rejects `LIMIT_EXCEEDED`, without a successful partial list/total. No per-field top-k shortcut is permitted. The logical candidate high-water is the completed matching total. Selection keeps at most the requested list plus one temporary insertion slot; temporary growth is bounded by 21 entries. Dictionary visits count field entries, including repeated terms across fields.

`maxWorkUnits` defaults to 10,000,000 and can only narrow the cap. All payload validation, analysis, scans, comparisons, selection and output ownership join the registration budget and shared search work/deadline/cancellation. Output own keys/array entries, including array `length`, cost `9 + fields.length + 3 * items.length` structural entries. The registration's output cap and core `maxAdmissionEntries` ceiling apply. Stops/failures close cursors and preserve the published index; no partial result is returned.

The stateless registration retains no optional index, source, positions or cross-operation cache. Add, addMany, replace, remove and clear affect the next executed request's dictionary immediately. Queued requests use their actual execution revision and owned admission data, rather than the admission-time root.

The trusted generic `dictionary-output` role is exclusive of other roles. It has bounded `capture` and generator `prepare`/`finish` handles. The immutable context exposes revision, analyzer, schema, limits and payload; `dictionary(fields)` yields only declared field names, normalized terms and native field-local document frequencies with work charges. It exposes no root, postings, record source or mutable owner. This is a trusted add-on protocol, not a hostile-code sandbox. Explicit worker installation must have identical semantic factory options; ordinary requested-option output validation applies.

## Integration and verification

This slice provides the API and executable packaged example. The existing documentation-search UI is unchanged. Applications adding a UI must define composition/IME suppression, discard stale request revisions/identities, preserve input focus and text, announce deliberate suggestion changes, and require explicit application. No combobox/keyboard/AT behavior is claimed by this API slice.

Verify deterministic complete ordering, misses, exact and empty/short/multiword requests, malformed ownership, Unicode, all resource failures, every selected suspension cancellation, deadlines/disposal, old-root/queued mutation freshness, mixed outputs and unchanged ordinary query behavior. Use an independent source dictionary/frequency/sort oracle and freeze completion utility judgments before execution. Evaluate intended completion inclusion separately from search ranking; the existing 76-query relevance judgments remain unchanged. Verify installed/minified consumers, no-host imports, ES2022 declarations and actual Node worker identity/parity.

Measure dictionary visits, logical transient candidate/output cardinalities, emitted work and import/bundle costs. These are not heap/allocation-byte peaks, physical copies, input-to-paint latency, representative user utility or broad browser qualification. Whole-query completion, context/metadata filtering, typo suggestions, automatic UI and a retained prefix index remain outside this slice.
