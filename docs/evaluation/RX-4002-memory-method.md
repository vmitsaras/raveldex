# RX-4002 memory method

Status: bounded Node process observations, corrected selected-data graph analysis and a separate offline recorded-graph cut analysis are observed. The [browser isolate continuation](../evidence/RX-4002-memory-browser.md) adds separately scoped main/worker observations. The [observer-held continuation](../evidence/RX-4002-memory-collection.md) accepts direct WeakRef root release but blocks descendant-byte attribution after discovering incompatible identities under the same snapshot IDs. Node outcomes are in [the memory evidence](../evidence/RX-4002-memory.json), with distinct [corrected graph analysis](../evidence/RX-4002-memory-graphs.json) and [graph-cut analysis](../evidence/RX-4002-memory-retainers.json). This document does not change the native capacity, limits, optional representations, public exports, or proposed release requirements.

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

## Offline recorded-graph cuts

The continuation uses `node bench/memory/analyse-retainers.mjs` on the same 16 hashed dumps, with no new native workloads or heap collection. The separate analyzer reads the complete recorded graph, including context, hidden, code, prototype and backing-store paths. It validates schema descriptors and marker component targets, and neutralizes only the identified observation marker and any verified exclusively marker-owned property store. Outside descendant retainers remain in the graph. The original process/selected-data/probe artifacts stay byte-identical; input, dump and executed-source hashes bind the distinct report.

For each declared edge policy, the analyzer measures which baseline-root-reachable nodes become unreachable when a component seed or group of seeds is deleted. `graphCutSelfSizeBytes` sums those nodes' recorded `self_size` once. **Node deletion removes every alias to that node.** It differs from releasing one owner property, disposing an engine, and actual collection by V8. The primary policy follows all nonweak edges except non-root shortcuts; separate policies include those shortcuts and omit labelled WeakMap table-to-value pair edges while keeping key-to-value edges. These are sensitivity models rather than collector-retained bounds. [V8's ephemeron explanation](https://v8.dev/features/weak-references) distinguishes conditional key/table liveness from ordinary independent graph edges. The analyzer does not implement V8 conditional GC or DevTools page-object/dominator rules.

Built/input-released graph-cut observations, in bytes:

| Mode / records | Reverse-document node cut | Dictionary/postings/statistics node cut | Participant node cut | Joint cut of all three components |
| --- | ---: | ---: | ---: | ---: |
| Core / 1,000 | 1,085,768 | 717,592 | 256 | 1,803,976 |
| Core / 10,000 | 10,394,960 | 3,986,536 | 256 | 14,382,112 |
| Source phrases / 1,000 | 1,085,840 | 717,688 | 543,296 | 2,347,184 |
| Source phrases / 10,000 | 10,395,000 | 3,986,624 | 4,637,032 | 19,019,136 |
| Positions + offsets / 1,000 | 1,085,880 | 717,688 | 2,367,016 | 4,171,064 |
| Positions + offsets / 10,000 | 10,395,000 | 3,986,624 | 23,172,552 | 37,554,656 |

The joint cut is recomputed against the root, rather than obtained by adding individual effects. Shared children can survive every individual cut and disappear only after a joint cut. Core's participant entry remains an empty container with runtime backing metadata; it is not an optional side index. These full-policy effects differ from the earlier selected-edge reachable sizes and do not replace that historical quantity.

All three policies give the same component and root-candidate cut effects for these actual dumps; literal tests deliberately produce different shortcut/ephemeron outcomes. Every actual marker is in-object, requiring one scaffold-node exclusion. PropertyArray neutralization is covered by literal tests, not claimed as observed in these marker shapes. At precommit, the joint cut of the still-committed marked components loses 13,544 bytes at 1,000 records and 14,888 at 10,000 in each mode: outside references from other candidate roots preserve shared data. Those values are neither staged allocation nor a peak. The unmarked root shapes retain structural IDs without guessed old/new/staging roles. Held encoding-string cuts reproduce their recorded string-node sizes and establish no intermediate encoder/decoder allocation.

Reproduction requires the original temporary dumps. Missing/changed inputs fail explicitly. The output guard protects immutable reports, sources and dumps against canonical-path, symlink and existing hardlink aliases before analysis; it never rewrites a preserved input to create a report. Full RX-4002-AC03 remains Blocked: this snapshot graph model adds retention evidence but cannot fill collector-accurate, allocation-peak, decode/restore or browser-worker/transport observations.

## Outstanding qualification

| Observation / method target | Status/boundary |
| --- | --- |
| Fresh-process whole-process/V8 stages, repetitions and cleanup | Actual raw readings, separate from component claims. |
| True lifetime process RSS high-water | Kernel quantity, covering complete instrumented child lifetime. |
| Reachable core/source/positions/held encoding data | V8 selected-edge node-size attribution; shared subgraphs retained explicitly. |
| Complete recorded-graph component/group cuts | Same-dump root-reachability differences under explicit policies; every-node-alias deletion, separate from owner-edge release or V8 GC. |
| Actual observer-held component-root release | **Observed**, source-phrase configuration at 1,000/10,000 across independent hold/release branches. Direct WeakRefs distinguish disposed facade/owner/full root, held/released component roots and literal outside aliases. No descendant or byte claim follows. |
| Identity for proposed descendant-byte comparisons | **Blocked method target**: recorded-graph cuts do not implement conditional GC. The observer-held attempt exposes nine incompatible identities under the same snapshot ID; all cross-snapshot ID-derived byte claims are quarantined, even conflict-free rows. A calibrated identity method is needed before making those claims. This experiment is not an added release gate. |
| Mutation staging and codec allocation/peak attribution | **Partially observed / still Blocked**: the [actual precommit continuation](../evidence/RX-4002-memory-mutation.md) identifies old/candidate/shared data and direct cleanup at 1,000/10,000 in all three native configurations. Final precommit coexistence is not allocation high-water. Periodic/cooperative samples and lifetime process maximum do not isolate transient mutation allocations or codec buffer high-water. Requires observations with stated instrumentation bounds; mathematically exact accounting of every VM/native byte is not an added release criterion. |
| Decode/restore buffers | **Partially observed / still Blocked**: native receiving adds statistical allocation profiles, held-input/prior-receiver baselines, sampled process maxima and listed-object collection checks. The separate browser continuation observes source-reindex receiving and deadline refusals. Exact buffer ownership/copies/peaks remain unqualified; export observations do not fill them. |
| Browser renderer/main-thread/worker/transport memory | **Partially observed / still Blocked**: separate Chrome main/worker isolate usage, statistical profiles and string-transport shapes are now observed. Combined renderer/process memory, exact exclusive retention and hidden structured-clone buffers/copies/peaks remain unqualified. |
| General capacity or physical device latency | Unqualified; the 10,000 defensive ceiling is not converted to a capacity promise. |

Missing staging/codec/transport attribution remains missing evidence under RX-4002-AC03/AC06. Method-specific targets do not add acceptance criteria. This method supplies bounded observations and concrete required follow-up work; it does not silently narrow or waive the release contract.

## Native receiving restore continuation

The [detailed receiving method](../evidence/RX-4002-memory-restore.md), [raw report](../evidence/RX-4002-memory-restore.json) and [offline provenance reconciliation](../evidence/RX-4002-memory-restore-reconciliation.json) supplement the [installed matrix continuation](../evidence/RX-4002-installed-matrix.md) with a separate exact-local trusted Node native-restore experiment, with one producer per size and three serial fresh receiving processes each at 1,000/10,000 source-phrase records. It records actual inspector statistical profiles only during the public receiving operation, five-millisecond event-loop process samples, separate held-input/prior-state baselines, independent semantic/revision checks and listed root/component WeakRefs with held/released controls. All eight child-process outcomes pass; the raw wrapper aggregate remains Fail because it incorrectly inventoried its own growing redirected capture log as an immutable prior artifact. The continuation distinguishes that evaluation defect and offline provenance reconciliation from actual native behavior and does not repeat the workloads.

Statistical frame groups describe allocating-frame URLs rather than exclusive component ownership. Process maxima are observed lower bounds; input length is not heap cost; clearing an input binding is not proof of string collection; listed WeakRef collection does not prove every descendant or future workload is collectible. At that native continuation boundary, exact exclusive source/index/side retention, mutation/encoder/decoder peaks, source-reindex receiving and browser/main/worker/transport scopes required separate instrumentation and observations. The browser continuation below supplies additional bounded observations; it does not complete the exact attribution requirements. No new environment failure is inferred from instrumentation that has not yet been implemented.

## Browser isolate and source-transport continuation

The [browser method and outcomes](../evidence/RX-4002-memory-browser.md) supplement the Node-only experiments with installed public worker/source-snapshot operations in fresh headless Chrome processes at 1,000/10,000 admitted records. The runner binds the actual worker URL/target/session and distinct main/worker isolate identities before reading raw `Runtime.getHeapUsage` fields and operation-specific statistical profiles. Explicit-GC stages separate caller input/encoding held and released states, receiving prior state, and disposal while the externally owned worker remains alive. Native browser snapshots stay unqualified; source restore performs real receiving reindexing under unchanged limits.

Sequential per-isolate request/response timestamps and all readings remain visible. Polling has one serial pair in flight; ten milliseconds is a requested gap after completion, not a guaranteed sampling period. Raw profile structures are preserved as hashed compressed JSON. Samples whose node IDs are absent from a returned tree remain explicit unresolved samples, rather than being dropped or assigned invented frames. Full-isolate samples and statistical allocation outputs include instrumentation/runtime effects; they are neither collector-accurate component retention nor simultaneous peaks or process RSS.

The real bridge is observed without replacing its representation: caller posts and received responses carry plain envelopes and source strings. Primitive shape logs retain no payload. Argument counts and string lengths are distinct from actual clone-buffer allocation, number of physical copies or their overlap. Exact source/index/side retention, mutation/encoding/decoding peaks, hidden transport buffers and combined browser-process attribution remain required. Typed receiving refusals and exact prior-state preservation are operation outcomes, not environment failures or successful restores.

## Observer-held root release and identity disposition

The [new continuation](../evidence/RX-4002-memory-collection.md) uses ten fresh serial source-phrase processes at 1,000/10,000 records: no-op, three individual component releases and joint release. Public build/verification/disposal precedes every baseline; only explicit observer component holders remain. Actual WeakRefs confirm owner/facade/full-root collection, all 12 selected component-root releases and all 18 intentionally held final roots. This is post-disposal observer-held data, not public live-engine component removal.

The planned descendant analysis fails its identity premise: all nine original reported “surviving size changes” are incompatible type/name pairs under the same snapshot ID. A real document object later shares its ID with a V8 FeedbackVector. Full raw measurements, numeric cohorts and executed v1 sources stay frozen; a separate same-dump reconciliation blocks descendant-byte attribution for all rows. Matching descriptors also cannot exclude reuse. Direct root WeakRefs and literal controls remain accepted; no retained/freed-byte totals are printed as accepted evidence.

The contract audit distinguishes the approved scope from an overstrict method target. AC03 and the verification plan require meaningful representation/staging/buffer/process distinctions and honest isolation limits, not mathematical ownership of every runtime byte. This does not waive the worker contract’s explicit transport-work/peak-copy requirement or the still-missing staging/codec observations. No release criterion or support claim changes. Previous same-snapshot graph arithmetic, statistical allocation profiles and direct WeakRef observations are separate quantities and are not invalidated by this cross-snapshot identity defect.


## Actual precommit mutation continuation

The [mutation continuation](../evidence/RX-4002-memory-mutation.md) uses six fresh installed-consumer processes and a separate worker debugger to bind the actual lexical committed and final candidate roots at native precommit. Exact compiled-source/alias checks precede twelve single-isolate dumps. A same-snapshot eight-role graph separates six old/candidate components from admitted request/changes, preserving sharing without cross-snapshot ID comparisons. An independent parser verifies every cohort row and every untouched document/optional participant record. Commit and precommit cancellation produce the expected public state and direct root/document cleanup witnesses after observer/caller-handle release. These are observed coexistence and listed-object liveness, not allocation peaks, pure payload, dominant retention or freed bytes. Earlier repeated samples stay frozen. Codec/transport and broader peak/AT qualifications remain incomplete.
