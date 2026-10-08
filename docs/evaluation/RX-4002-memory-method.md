# RX-4002 memory method

Status: bounded Node process observations and corrected selected-data graph analysis are complete. Browser/component qualification remains separate. Raw outcomes are in [the memory evidence](../evidence/RX-4002-memory.json), with distinct [corrected graph analysis](../evidence/RX-4002-memory-graphs.json). This document does not change the native capacity, limits, optional representations, public exports, or proposed release requirements.

## Reproduction and boundaries

Prepare a local packed consumer with the existing package workflow, then run:

```sh
node bench/memory/run.mjs /absolute/installed/consumer docs/evidence/RX-4002-memory.json
node --test bench/memory/heap-graph.test.mjs
node bench/memory/reanalyse.mjs docs/evidence/RX-4002-memory.json docs/evidence/RX-4002-memory-graphs.json
node bench/memory/summarize.mjs docs/evidence/RX-4002-memory.json docs/evidence/RX-4002-memory-summary.json
node bench/memory/verify.mjs
```

The runner performs no build, install, network request, publication, or source mutation. It stages the observation kernel and the unchanged RX-4001 fixture inside the supplied isolated consumer. The primary pass runs three fresh processes for each of core-only, source phrases, and positions with original offsets, at 1,000 and 10,000 admitted records: 18 processes. Six additional fresh processes perform intrusive heap-dump observations. These run serially in the exclusive resource slot. Each child receives only `PATH`, `TMPDIR`, `LANG`, and `LC_ALL`, preventing unrelated application credentials from entering its process or dumps. Full heaps remain in the task-created temporary directory; the durable report preserves numeric samples, selected-data graph summaries, dump hashes/schema and executed-source hashes.

All indexing, replacement, query verification and native export use installed public exports. The kernel reads the installed private `getExecutionOwner` solely to label current data roots and wrap the already selected execution generator/check callback for observation. The wrapper forwards actual work, stops, results and cleanup, retaining the original yield quantum and limits. It does not build an internal substitute index, change the production source, or create a new package API. This instrumentation is part of the measured process and is not an uninstrumented latency benchmark.

The ASCII cost corpus uses the unchanged `recordsFor` fixture, batch size 256 and 60,000ms operation deadline. No admission ceiling is bypassed. Core-only imports no source/position/snapshot module. Source phrases retain selected original `body` values; positional mode retains selected occurrences and original offsets without a source provider. Native exports use an exact-local Node descriptor already verified by the snapshot tests. Their observation does not qualify portable native snapshots.

## Whole-process and V8 readings

Each steady stage performs three `setImmediate` → explicit `global.gc()` → 25ms settling cycles, retaining every raw reading. Stages include imported-module/harness baseline, application input corpus held, empty owner with input corpus, built state after input release, replacement cleanup, native string held, native string released, and disposed handles/input release. Module imports, harness objects and registrations precede the matched per-process baseline. The input array is released before built-state readings. Every query is verified outside the sampled operation against literal arithmetic, with exact totals, finite score/page membership, consistent revision and strict phrase totals where installed.

`process.memoryUsage()` records RSS, V8 heap total/used, external and ArrayBuffer bytes. These quantities overlap: ArrayBuffer memory is included in external, while RSS includes code/native allocations as well as JavaScript. They must not be added as disjoint costs. Node's documented scope for heap readings is the current thread; RSS covers the process. These experiments contain only the main isolate. [Node process documentation](https://nodejs.org/docs/latest-v24.x/api/process.html#processmemoryusage).

The macOS `/usr/bin/time -l` wrapper separately records the kernel lifetime maximum resident set size in bytes for every child, preserving its complete raw output. This true process high-water includes imports, fixture creation, every operation, GC and the measurement harness. It cannot identify an individual staging/encoder allocation, and graph-pass high-water additionally includes dump machinery. It is different from the largest periodically observed RSS/heap sample. The kernel command was initially blocked by sandbox `sysctl kern.clockrate` access; that attempted child's observations/log remain separate, and the accepted run uses approved access to the same local bounded command.

During public build, replace and export, the kernel samples before/after the call, the first occurrence of each native phase in that operation, and every 8,192 emitted generator steps. These are actual in-operation memory readings. The observed maximum is only a lower bound on the transient high-water: GC, indivisible native allocations and intervals between samples can hide a larger peak. Phase readings identify where work was occurring; differences do not assign exclusively retained or staged component bytes. Raw sample objects themselves stay in the harness, causing a disclosed growing measurement baseline. Negative cleanup deltas, allocator-retained RSS and repetition noise are preserved without an invented success threshold.

Cleanup checks prove disposal releases the owner root, the revision-zero root and old replacement root become collectible via `WeakRef` after settling/GC, and all explicit heap markers are deleted. They do not imply that RSS returns to its initial value or prove leak freedom under every workload.

## Selected-data heap graphs

Separate graph processes use `v8.writeHeapSnapshot` after built/input-release state, during replacement precommit, and while the completed native export string is held. Node documents that snapshots are isolate-specific, synchronous, potentially require about twice the current heap, and use a V8-specific undocumented schema. The dumps therefore cannot supply ordinary workload timing or substitute for a browser worker snapshot. [Node V8 documentation](https://nodejs.org/api/v8.html#v8writeheapsnapshotfilenameoptions).

Temporary markers identify committed reverse-document records, field dictionary/postings/statistics, source/position participant state, and the optional held export string. A literal fixture checks the parser's schema reading, backing-store traversal, frozen-array numeric content references, prototype/map/weak exclusion and shared-string arithmetic. The parser follows own properties, elements, internal `properties`/`elements` stores, numeric internal edges from array backing nodes and string `first`/`second`/`parent` backing relationships. It excludes prototypes, object maps, code, weak and hidden edges. It sums V8 node `self_size` once in each selected reachability set, once in their union, and separately reports intersections. `disjointAmongSelectedDataGraphsSelfSizeBytes` only means not reachable through another selected seed; it does not mean exclusive retention against the rest of the isolate.

Direct inspection found that this actual V8 version expresses frozen-array contents as internal numeric references from `(object elements)` backing arrays. The first parser omitted those contents, including most retained source strings and position occurrences. That is an evaluation defect, separate from the native engine and the unchanged process samples. The original measured report remains byte-frozen with its restricted analysis and historical parser hash. `bench/memory/reanalyse.mjs` reprocesses the same hashed dumps into a distinct corrected graph artifact, preserving the original restricted summaries separately and recording the accepted offline parser hash. Derived summaries bind both the frozen primary report and corrected graph artifact. The repaired literal fixture prevents silently repeating that omission.

Independent review directly traversed the original 1,000-record dumps without calling this graph parser: 1,000 frozen source arrays reconstructed the literal original body text; 1,000 positional value arrays, 4,666 term arrays and 5,666 occurrence objects matched the fixture arithmetic. This validates the corrected content-edge policy and actual representation, while making no dominant retained-size claim. [Independent probe](../evidence/RX-4002-review-probe.json).

These are real heap snapshot node sizes associated with known owned data. They distinguish reachable index/source/side/encoding representations more strongly than JSON length or logical object counts, while exposing shared backing data instead of double-counting it. They are deliberately named **selected-data reachable self-size**, not V8 dominant retained size, full allocation cost, browser heap or isolated component memory. V8 runtime metadata, interned strings retained elsewhere, contexts and map/code overhead remain outside that attribution. An `IndexRoot` shape scan additionally lists committed and staged root-shaped objects during precommit without assigning guessed revision numbers to omitted SMI fields. Precommit markers still point to the old committed component roots; their component sums do not include all newly staged state and cannot quantify its allocation peak.

## Completed process observations

All 18 primary and six separate intrusive graph processes completed the admitted workload. No public operation in these rows rejected. Every process verified complete match-all/selective totals and applicable strict-phrase totals against literal fixture arithmetic before and after replacement, owner-root release after disposal, and collection of revision-zero/old mutation roots after settling. The primary summaries below use the last of three settling/GC cycles in each of three fresh processes; all cycles remain in [raw evidence](../evidence/RX-4002-memory.json). All values are bytes, not encoded lengths or per-component heap estimates.

| Mode / records | Median baseline V8 heap used | Median built/input-released V8 heap used | Median disposed/input/handles-released V8 heap used | Lifetime maximum RSS median / observed maximum |
| --- | ---: | ---: | ---: | ---: |
| Core / 1,000 | 5,457,328 | 8,083,344 | 6,230,048 | 78,905,344 / 79,233,024 |
| Core / 10,000 | 5,457,216 | 20,113,208 | 5,350,208 | 203,882,496 / 209,698,816 |
| Source phrases / 1,000 | 5,747,256 | 9,120,096 | 7,039,112 | 90,423,296 / 101,990,400 |
| Source phrases / 10,000 | 5,747,296 | 25,145,536 | 6,344,208 | 272,515,072 / 282,017,792 |
| Positions + offsets / 1,000 | 5,782,752 | 11,078,544 | 7,163,592 | 111,591,424 / 111,837,184 |
| Positions + offsets / 10,000 | 5,782,928 | 43,850,640 | 6,655,920 | 322,650,112 / 354,992,128 |

The different baseline imports, JIT/runtime state, residual harness measurements and allocator behavior remain visible. For example, the core 10,000 cleanup reading is below its initial baseline; no negative value is clamped or interpreted as a component saving. Native string-held/released stages, replacement stages and all repetition ranges are retained in [derived summaries](../evidence/RX-4002-memory-summary.json).

| Mode / records | Observed build heap maximum median / maximum | Observed replacement heap maximum median / maximum | Observed native-export heap maximum median / maximum |
| --- | ---: | ---: | ---: |
| Core / 1,000 | 14,355,696 / 14,614,184 | 8,927,856 / 8,928,888 | Not applicable |
| Core / 10,000 | 79,612,200 / 80,319,112 | 21,235,128 / 21,240,304 | Not applicable |
| Source phrases / 1,000 | 16,057,064 / 16,343,744 | 10,283,056 / 10,303,440 | 22,273,344 / 27,090,864 |
| Source phrases / 10,000 | 82,926,416 / 82,948,384 | 26,407,496 / 26,537,648 | 139,470,752 / 143,249,456 |
| Positions + offsets / 1,000 | 17,494,544 / 17,812,056 | 12,312,120 / 12,327,016 | 32,120,752 / 35,838,008 |
| Positions + offsets / 10,000 | 100,080,160 / 102,506,776 | 45,115,696 / 45,120,936 | 176,243,192 / 197,553,896 |

These operation values are **sample maxima in the full instrumented V8 isolate**. They include garbage not yet collected, current committed state, captured inputs/results, harness records and runtime effects. They are neither exclusive staged allocation nor a guaranteed high-water. The separate kernel maximum covers the entire process lifetime; neither table supplies an isolated browser or worker measurement.

## Corrected selected-data observations

These values come from the separate graph process for each configuration/size, at the built/input-released phase. They are single observations rather than repeated component retained-size qualification. The corrected offline parser identifies the same 16 original dump hashes and preserves the original frozen report. Its version/hash and the historical excluded subset are recorded in [corrected graphs](../evidence/RX-4002-memory-graphs.json) and [first restricted analysis](../evidence/RX-4002-memory-graph-first.json); [derived summaries](../evidence/RX-4002-memory-summary.json) bind both sources.

| Mode / records | Reverse-document reachable self-size | Dictionary/postings/statistics reachable self-size | Participant reachable self-size | Shared selected-data self-size | Deduplicated selected-data union |
| --- | ---: | ---: | ---: | ---: | ---: |
| Core / 1,000 | 883,736 | 601,888 | 184 (empty container) | 33,008 | 1,452,800 |
| Core / 10,000 | 8,536,856 | 3,778,960 | 184 (empty container) | 321,008 | 11,994,992 |
| Source phrases / 1,000 | 883,736 | 601,888 | 483,224 | 33,008 | 1,903,816 |
| Source phrases / 10,000 | 8,536,856 | 3,778,960 | 4,216,344 | 321,008 | 15,891,128 |
| Positions + offsets / 1,000 | 883,736 | 601,888 | 2,233,808 | 33,008 | 3,653,416 |
| Positions + offsets / 10,000 | 8,536,856 | 3,778,960 | 22,030,928 | 321,008 | 33,704,728 |

All values are V8 node bytes in the permitted-edge graph. Component columns overlap: shared identifiers/terms can be reached through two or three component seeds, so subtracting the shared column once from the sum is not a valid general union calculation. The union is an actual deduplicated node set; a literal three-way-overlap fixture checks this distinction. Core's 184-byte row is the existing empty participant container, with no source/position provider. No omitted optional side index is inferred from that container.

At the held-native-string phase, the graph associates 368,680 / 3,487,856 bytes with the source 1,000 / 10,000 export string and 768,472 / 7,472,656 bytes with positional exports. These are actual string/parent node self-sizes, separate from UTF-8 encoded lengths and from intermediate encoder allocations. Every built/held-string dump has one root-shaped object; every precommit dump has three, with the old committed one identified by the marker. Staged roots are therefore directly observable, but their exact exclusive/peak bytes remain unqualified.

## Outstanding qualification

| Required observation | Status/boundary |
| --- | --- |
| Fresh-process whole-process/V8 stages, repetitions and cleanup | Actual raw readings, separate from component claims. |
| True lifetime process RSS high-water | Kernel quantity, covering complete instrumented child lifetime. |
| Reachable core/source/positions/held encoding data | V8 selected-edge node-size attribution; shared subgraphs retained explicitly. |
| Exact exclusive component retained bytes | **Blocked**: requires a reviewed dominator/retainer method covering omitted runtime edges and outside retainers. No process delta is substituted. |
| Exact mutation/serialization allocation peak | **Blocked**: periodic/cooperative samples and lifetime process maximum do not isolate stage allocation high-water. Requires allocation chronology/peak attribution with known instrumentation bounds. |
| Decode/restore buffers | **Blocked** in this harness: restore phases need independently instrumented receiving-state allocation records; export observations do not qualify them. |
| Browser renderer/main-thread/worker/transport memory | **Blocked** in this Node method: requires separately scoped actual browser/worker heap/allocation and buffer-copy observations. |
| General capacity or physical device latency | Unqualified; the 10,000 defensive ceiling is not converted to a capacity promise. |

Missing attribution remains missing evidence under RX-4002-AC03/AC06. This method supplies bounded observations and concrete required follow-up work; it does not silently narrow or waive the release contract.
