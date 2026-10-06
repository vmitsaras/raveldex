# Verification layers

`tooling/` checks roadmap validation/status and tracking synchronization. `core/` checks input/analysis, import isolation, frequency construction, exact membership and invariant corruption. Hand-authored `fixtures/analysis/` contains independently stated terms and original UTF-16 spans; `fixtures/corpora/` adds readable exact-membership expectations and fixed-seed admitted records. `oracle/exact.mjs` scans fixture source with the normative original-token regex and has no production imports. `types/` checks readonly declarations and forbidden/coerced inputs. `npm test` builds ESM then runs all behavior tests; `npm run typecheck` also checks the type fixtures. These passes establish internal primitives, not a working public search engine.

After `npm run build`, run `node test/measurements/index-construction.mjs` for reproducible 100/1,000/10,000-record work/structure diagnostics. It verifies invariants and complete common-term membership and prints JSON. Those counts exclude caller source/staging/harness costs and do not measure retained/peak heap bytes or latency. The recorded RX-1002 output lives in `docs/evidence/RX-1002-counts.json`.

Future task slices add independent analyzer/query fixtures, native retrieval oracle comparisons, hand-derived ranking arithmetic, mutation/revision sequences, owned cancellation workloads, source/positional parity, public package consumers, host integration, and qualified UI/browser/AT/resource observations. Consult [the verification plan](../docs/planning/VERIFICATION_PLAN.md).

Record unsupported or unavailable observations as Blocked/Not Applicable with reasons, never as passed. Never make the oracle share the implementation under test for the behavior being checked.
