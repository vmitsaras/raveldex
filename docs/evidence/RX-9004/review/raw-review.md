# RX-9004 independent raw timing and interpretation review

**Pass for raw reconstruction and the additional independent original-source semantic replay recorded below.** The reviewer executes no engine, build, test, collector, package installation or network request. [Independent reconstruction](reconstruction.json) and [parent-analysis comparison](parent-analysis.json) come from actual per-child rows using independent Python loops, counters, nearest-rank quantiles and owner medians. The scripts [reconstruct.py](reconstruct.py) and [compare-parent.py](compare-parent.py) import no collector summarizer or production implementation.

## Complete denominators and summaries

All **216 actual distinct child PIDs** occur in exact frozen order/configuration:162 ordinary and54 diagnostic children,13,536 ordinary query calls,432 diagnostic query calls and576 excluded warmups. Every one of the collector's **930 labeled outcome summary cells**, the parent's930 ordinary cells and620 pair/phase comparisons reconstructs exactly, including all returned sample records, failure/outcome denominators, nearest-rank medians, owner medians/ranges, absolute/relative wall and user/system/total process CPU values.

Ordinary queries yield **11,880 Pass and1,656 Refused**; diagnostics yield384 Pass and48 Refused. Ordinary exports have126 Pass/36 Refused; their36 dependent restores remain Not run with no fabricated durations. Ordinary restores have120 Pass/six Refused/36 Not run. Diagnostics have42 successful exports/12 refused exports and40 successful/two refused/12 Not-run restores. All162 ordinary and54 diagnostic builds pass. Diagnostic observer costs stay outside ordinary statistics.

There are **96 adequately sampled outcome cells** in the collector summary, of which **84 are successful-latency p95 cells and12 are separately refused-cost cells**. These are not96 successful tails. All other ordinary cells retain their small actual sample counts and no p95. First and repeated calls remain separate outside the explicitly warmed tail cohorts;120 correlated calls are not120 independent machines.

## Net pair and adverse costs

For pre-N9→current, the frozen strict owner-median range rule classifies272 matched-success wall cells as observed faster in these repeats, with two separate capacity improvements and36 cells having no successful latency comparison. These are counts of unweighted operation/phase cells, not an overall speedup. The two capacity improvements are adversarial10,000 source restore, separately under each deadline; baseline refusal→current success has no equal-work speed ratio.

Process CPU does **not** improve uniformly. Total CPU has194 observed-faster,72 overlapping/inconclusive and **six observed-slower matched-success cells**. The same six user-CPU adverse cells are retained:

| Cell | Deadline | Pre total CPU p50 ms | Current ms | Relative change |
| --- | --- | ---: | ---: | ---: |
| Adversarial100 build | default30s |25.662|40.909|+59.41%|
| Adversarial100 build | explicit60s |25.584|40.647|+58.88%|
| High-cardinality100 filtered repeated call | default30s |1.437|4.721|+228.53%|
| High-cardinality100 filtered repeated call | explicit60s |1.420|4.994|+251.69%|
| Real-document100 filtered repeated call | default30s |1.704|4.338|+154.58%|
| Real-document100 filtered repeated call | explicit60s |1.510|4.278|+183.31%|

Each sparse cell has three fresh owners, with only one relevant call per owner/phase and no p95. The percentages do not establish production traffic impact or isolated engine CPU; process CPU includes harness/Promise activity. This review does not invent a cause or erase these adverse observations because wall time improved.

Accepted/current compiled bytes are equal. Their wall range rule nevertheless separates **eight faster and eight slower control cells**, while258 overlap. Total CPU control has six faster/five slower/263 overlapping cells; user CPU has five faster/five slower/264 overlapping. These remain method/environment variation, **never another implementation improvement or regression**. System CPU has actual zero-floor/inconclusive cells, preserved separately.

## Scope and remaining gate

Omitted30s versus explicit60s options, deadline dimensions and per-operation outcomes are retained. Build timing spans a sequence of admitted≤256-record batches, each with its own operation deadline; total build wall exceeding30s would not itself imply an omitted-deadline violation. Source-export refusal makes recovery Not run, and refused/Not-run costs do not enter successful latency distributions. No retries, omitted adverse cells, observer subtraction, across-query/size/phase/deadline pooling or conditional-stage addition was used in reconstruction.

Raw timing acceptance depends on the separate full original-source/numerical/core/selected-Inspector lane, completed and independently replayed below. That Python semantic replay is distinct from these timing computations. No browser/AT, physical responsiveness, universal fairness, representative traffic, retained/peak heap or weighted overall winner follows from this Node-only cohort.

## Independent semantic replay completed

The separate actual27-child semantic lane now passes, and an additional **independent Python replay** passes against its actual outputs and every timed capture. [Replay result](semantic-replay.json), [script](semantic-replay.py) and [complete output](semantic-replay-output.txt) retain exact source/report/row/core pins and counts. Python independently recreates the nine original-source fixtures from the retained34-section corpus, scans Unicode category boundaries and NFKC/lower itself, evaluates literal Boolean membership and value-local phrase adjacency, computes TF/DF/length/BM25, and checks exact ordered IDs. It calls neither production nor the JS source oracle.

The replay validates **99,900 core documents,215,136 term rows,4,133,511 posting relations and122,094 original source values** across the27 actual cases. All2,766 returned pages and267,042 full-page scores match, with192 complete query captures,18 declared expansion refusals and six resource-refused page captures retained. It checks3,228 selected public scores plus384 original-source field facts,2,304 field formula equalities,384 group sums and768 document sums. Every one of13,968 timed captures is accounted for;197,040 successful top20 score values and exact ordered IDs agree, while1,704 typed refusals stay separate.

Numerical tolerance is max(1e-12,abs(expected)×1e-12); returned ID order is exact. The separate small source/position/offset/mixed fixture observations remain covered by their authored literal assertions and parity; this Python replay does not rederive every optional position/facet element. No new engine execution or timing occurs in this replay. The original static-reviewed semantic code pins match the actual frozen/executed code.

Semantic acceptance and independent raw-distribution reconstruction therefore pass for these selected Node cohorts. Final project/installed-candidate verification and closing documentation/diff checks remain parent-owned gates. The scoped engineering result remains lower observed wall time alongside the six CPU costs, logical-work increases and identical-runtime variation; it does not become a universal or weighted overall winner.
