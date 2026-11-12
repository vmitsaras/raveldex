# Test map

Use `npm run check` for planner/docs validation, strict type checks, a build and
the complete test selection. Node 24/npm are the development toolchain. Browser
phases use installed Chrome by default; documented `RAVELDEX_*_BROWSER=chromium`
selectors use an already available Chromium. Tests do not silently install engines.

| Area | Evidence | Focused command |
| --- | --- | --- |
| `core/`, `oracle/` | Native retrieval, hand-derived BM25, atomicity, bounds, lifecycle and independent source results | `npm run test:core` |
| `addons/` | Explicit query/provider/evidence behavior and refusal paths | Relevant `npm run test:*` script |
| `consumer/`, `types/` | Actual packed imports, declarations, graph isolation, docs and copied starters | After build: `node --test test/consumer/candidate.test.mjs` |
| `ui/` | Real DOM behavior, focus/composition/stale work/retry/cleanup | `npm run test:ui` |
| `adapters/worker/` | Actual worker transport, receipts and termination | `npm run test:worker` |
| `adapters/snapshots/` | Source/native codecs, compatibility, atomic restore and exact qualified Node identity | `npm run test:snapshots` |
| `adapters/indexeddb/` | Real transactions, conflicts, quota/fault simulation and worker recovery | `npm run test:indexeddb` |
| `integrations/` | English parity and real installed Astro source/native/route behavior | Included in `npm test` |
| `migration/`, `comparison/` | Provenance-preserving native rebuilds; foreign scores stay separate | `npm run test:migration` |
| `tooling/` | Roadmap/reference/generated checks, package and managed/native GitHub tooling | `node --test test/tooling/*.test.mjs` |
| `pages/` | Generated output, native demo behavior, starter inventories and local navigation | After generation: `node --test --test-concurrency=1 test/pages/*.test.mjs` |

The `test:*` npm scripts build first. Reuse a successful unchanged build with direct
`node --test` commands for related follow-up checks. Npm artifact preparation uses
that same compiler output. Use the [release runbook](../docs/release/PREPARATION.md)
and [site workflow](../site/README.md) for the complete packaging/site sequence.

The independent oracle must not call the implementation scorer/tokenizer for the
behavior it verifies. Fixtures and executable files under evidence directories
can be real inputs; preserve their actual identities. Measurement/review scripts
and raw reports retain their original source/environment scope. Do not rerun
benchmarks or change their historical expectations for documentation-only work.

Automated keyboard events, axe, emulated layouts and screenshots do not establish
human AT speech, physical input, actual zoom, Safari/device support, retained/peak
memory or physical paint. Record unavailable checks explicitly and keep unrelated
historical limitations separate from the changed acceptance criteria.
