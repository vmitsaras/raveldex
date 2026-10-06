# Ranking and numerical explanations

Status: Approved. Primary task: RX-1003. Inspector integration: RX-2004. RX-1003 internal scorer/evaluator/facts verified locally; see [evidence](../evidence/RX-1003.md). Public Inspector integration and mutation/host qualification remain planned.

## Goal and outcome

Define one native ranking model whose returned score can be reconstructed from the actual query groups, index statistics, and arithmetic. A developer must be able to distinguish why a document qualifies from why it receives its score.

## Non-goals and current facts

RX-1003 implements the native scorer and internal complete query cursor. This document selects `raveldex-bm25-v1`; it does not describe MiniSearch scoring or claim that native relevance has been measured. Query semantics and hard bounds are in [CORE_CONTRACT.md](CORE_CONTRACT.md).

The first model has no learned weights, arbitrary ranking hooks, proximity/phrase bonus, recency/popularity boost, document-length approximation, score rounding, or score merging across independent indexes. Language models and foreign engine scores cannot silently enter this model.

## Decisions

- R-D01: Use field-local positive-length document counts and token lengths.
- R-D02: Fix `k1 = 1.2` and `b = 0.75` for v1; field boosts are explicit schema data.
- R-D03: Use the best weighted term alternative per original query group per field, then sum fields/groups.
- R-D04: Only positive groups in successful Boolean branches contribute; a canonical group contributes at most once.
- R-D05: An installed representation/refinement cannot change base term statistics or introduce an undocumented bonus.

## Statistics from one revision

For field `f`, document `d`, and normalized term `t`:

| Symbol | Exact definition |
| --- | --- |
| `tf(t,d,f)` | Count of emitted occurrences of `t` across the text values of `f` in `d`. |
| `length(d,f)` | Total emitted tokens across those values, including repeated terms. |
| `N(f)` | Number of live documents with `length(d,f) > 0`. |
| `L(f)` | Sum of `length(d,f)` across live documents. |
| `avgLength(f)` | `L(f) / N(f)` when `N(f) > 0`. |
| `df(t,f)` | Number of live documents with `tf(t,d,f) > 0`. |
| `boost(f)` | Positive finite schema boost, default 1, at most 16. |

Missing, empty, and tokenless fields do not increment `N(f)`. An empty index has no term contribution and never divides by zero. An indexed term must satisfy `1 <= df(t,f) <= N(f)`, `tf > 0` for its posting, and `avgLength(f) > 0`. A violated invariant fails safely; it is not repaired by clamping arbitrary values into the formula.

Statistics are for the complete live field corpus, not the filtered result set, selected page, independent worker shard, or original uncommitted input. Metadata/phrase restrictions do not recompute IDF. A mutation changes all affected statistics at its one commit point.

## Term contribution

For a present term in a field, compute:

```text
idf(t,f) = ln(1 + (N(f) - df(t,f) + 0.5) / (df(t,f) + 0.5))

normalizer(d,f) = 1.2 * (1 - 0.75 + 0.75 * length(d,f) / avgLength(f))

tfPart(t,d,f) = (tf(t,d,f) * (1.2 + 1)) / (tf(t,d,f) + normalizer(d,f))

base(t,d,f) = boost(f) * idf(t,f) * tfPart(t,d,f)
```

`ln` is the natural logarithm. A missing term contributes zero. Use JavaScript `number` arithmetic, without Float32 quantization or stored rounded field norms. Returned scores and facts remain unrounded; display formatting belongs to the application.

The operation order above is normative for same-runtime arithmetic reconstruction. Algebraic reassociation, approximate logarithms, rounded lengths, or a different TF numerator require a new model version and comparative evaluation.

The selected parameters and IDF form have established BM25 precedent; see the [Lucene BM25 API reference](https://lucene.apache.org/core/9_12_3/core/org/apache/lucene/search/similarities/BM25Similarity.html). Raveldex's full formula, group aggregation, field treatment, and Boolean contribution rules are specified here; they do not promise numerical compatibility with Lucene, MiniSearch, or another library.

## Original groups and alternatives

Each normalized original query token creates one group. The core query can also explicitly declare a group of exact/prefix variants. Each qualifying dictionary expansion has a declared variant weight `w` in `(0,1]`.

For group `g`, let `E(g,f)` be every qualifying normalized term/weight alternative in selected field `f`. Then:

```text
groupField(g,d,f) = max( w * base(t,d,f) for (t,w) in E(g,f) )
groupScore(g,d) = sum( groupField(g,d,f) over selected fields f )
```

The maximum over no matching term is zero. A document containing three alternatives to one requested word receives the best alternative contribution in that field, not their sum. Different fields may choose different winning alternatives; their field contributions are then summed.

For an exact/prefix alternative that resolves to the same `(field, term)` more than once, retain the highest weight. Equivalent weights do not cause repeated contributions. No fixed penalty is added merely because the matching mode is prefix; only the explicit variant weight applies.

If two alternatives have equal weighted contributions, choose the UTF-16 lexicographically smaller normalized term for trace identity, then the canonical variant key. This changes trace selection only, not the score.

Canonical group identity includes the sorted selected fields and sorted normalized variant/mode/weight entries. Identical groups share one contribution even when repeated in the query. Groups with different field selections or weights are deliberately different explicit clauses; the engine must not guess that the author wanted them merged.

## Boolean qualification and score participation

Evaluate each AST node as membership plus a set of successful positive canonical groups:

- A qualifying lexical group contributes its one group identity.
- `eq`, `all`, and `none` do not contribute lexical groups.
- For a successful AND, union the positive groups from every child. If any child fails, that branch supplies no groups to its parent.
- For OR, union groups from every successful child; failed children supply none.
- NOT complements membership and supplies an empty group set, regardless of its child's internal matches.

The final document score is the sum of the unique participating `groupScore` values. Do not use a failed OR branch to inflate a document's score.

Examples:

| Expression | Participation |
| --- | --- |
| `AND(red, red)` | One `red` group; no repeated-query boost. |
| `AND(red, OR(red, car))` | `red` once and `car` when that OR child also qualifies. |
| `OR(AND(red, car), blue)` for a red+blue document without car | Only `blue`; the red+car branch failed. |
| `NOT(red)` | Qualifying documents receive score zero. |
| `NOT(NOT(red))` | Same membership as red, but zero score because negative clauses do not become scoring clauses. |
| `OR(all, red)` | Every document qualifies; red documents receive their ordinary red contribution. |

Canonicalization must not eliminate/transform negative branches in ways that change this participation rule. Strict phrase leaves contribute the canonical lexical groups used by their phrase candidate expression only when the phrase itself qualifies. A phrase adds no separate bonus. Repeated phrase tokens remain necessary for phrase eligibility but do not introduce an undocumented query-frequency boost.

## Deterministic accumulation and ordering

Sort selected field names and canonical group keys by UTF-16 lexicographic order. Sum selected field contributions in that order, then group contributions in that order. Do not accumulate in hash-map iteration order, posting traversal order, insertion order, or parallel completion order.

Return descending finite score, then ascending opaque ID by UTF-16 comparison. Exact numerical ties use the ID; a user-interface rounding tie is not a score tie. Internal document slot numbers and dictionary insertion order must not affect results.

Direct and worker modes with the same qualified runtime/model/state must produce the same arithmetic and ordering. Different JavaScript engines may have tiny transcendental-function differences; cross-engine bit-for-bit floating-point equivalence is not asserted. Qualification uses declared tolerances for numerical fixtures and inspects any changed result order rather than hiding it behind a tolerance.

## Hand-checkable fixture

Use one field `title`, boost 1, and these three documents:

| ID | Title | Token length |
| --- | --- | ---: |
| `a` | `red red car` | 3 |
| `b` | `red car` | 2 |
| `c` | `blue` | 1 |

For red and car, `N = 3`, `df = 2`, `avgLength = 2`, and `idf = ln(1.6)`, approximately `0.470003629245736`.

| Term/document | tf | Normalizer | tfPart | Contribution, approximately |
| --- | ---: | ---: | ---: | ---: |
| red / a | 2 | 1.65 | 1.205479452054795 | 0.566579717446914 |
| car / a | 1 | 1.65 | 0.830188679245283 | 0.390191692204007 |
| red / b | 1 | 1.2 | 1 | 0.470003629245736 |
| car / b | 1 | 1.2 | 1 | 0.470003629245736 |

`AND(red, car)` yields a at approximately `0.956771409650921`, then b at `0.940007258491471`. A single alternatives group `red OR car` selects only red's contribution for a and one equal contribution for b. Its b trace selects car by the defined term tie-breaker.

These numbers are independently calculated fixture expectations, verified by RX-1003 local tests. Tests must derive expected values independently of the scorer and cover multiple fields, empty fields, mutations, and alternative weights as well.

## Explanation facts

Core exposes opt-in typed score facts to the Inspector capability. Normal searches must not allocate full explanation trees. Selected-contribution facts include:

- revision, model, analyzer identity/profile, document ID, canonical query/group identity;
- membership outcomes and which positive groups participated;
- field name, boost, winning normalized term/variant, and variant weight;
- `tf`, `df`, `N`, document field length, total field length, and average length;
- `k1`, `b`, IDF, normalizer, TF part, base term contribution, weighted selected contribution;
- field/group subtotals, final score, and the ID tie-breaker.

These facts are collected from the actual scorer/evaluator inputs and intermediate results. Do not reverse-engineer a plausible explanation after ranking, invent percentages, or present a foreign engine's score under the native model identity.

Inspector requests are separately bounded (selected facts initially at most 4,096 entries). If a requested complete trace exceeds its declared budget, that explain request fails explicitly. Ordinary search still works with tracing off; a trace limit must not silently alter membership or scoring. An expanded all-alternatives debug trace needs a separately declared larger budget or a narrowly scoped request.

Explain requests that specify an expected revision fail on mismatch; the initial core does not retain historical roots merely for later inspection. Explaining why a document did not qualify must evaluate actual predicates/Boolean paths at the selected revision, not equate absent top-k membership with lexical failure.

## Acceptance criteria and verification

| ID | Criterion | Evidence |
| --- | --- | --- |
| R-AC01 | Formula, field populations, and TF/IDF statistics match the specification. | Hand-derived one/multiple-field fixtures; tokenless fields; replacement/deletion stat changes. |
| R-AC02 | Original-group maximum aggregation does not reward duplicate alternatives. | Exact/prefix overlap, variant weights, multiple winning fields, and explicit duplicate groups. |
| R-AC03 | Boolean participation is correct. | The examples above plus independent membership/group-set evaluation on generated small ASTs. |
| R-AC04 | Facts reconstruct the returned score. | Independent replay of exported numeric inputs/contributions with stated same-runtime operation order and `max(1e-12, abs(score) * 1e-12)` fixture tolerance. |
| R-AC05 | Ordering does not depend on insertion/hash/worker traversal. | Reordered corpus builds, repeated runs, and later direct/worker parity on identical state. |
| R-AC06 | Metadata/source/positions/facet configuration does not accidentally alter base ranking. | Compare identical ordinary lexical queries with each representation installed/uninstalled. |
| R-AC07 | Opt-out tracing avoids explanation allocations. | Inspected import/allocation path and focused instrumentation; do not infer from an empty returned trace. |

Expected areas: `src/core/` scorer/evaluator/statistics, independent numerical fixtures, and later `src/addons/inspector/`. RX-1003 records internal single/multiple-field, Boolean, alternative, trace, ordering and opt-out allocation observations. Replacement/deletion-driven statistics, optional representation parity, direct/worker parity and public Inspector requests remain later task evidence.

## Open questions

None blocks implementation of this model. Future relevance evaluation may justify a separately versioned change; an imperfect pilot rank is not permission to change this contract silently.
