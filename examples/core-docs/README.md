# Packed core documentation pilot

This Node CLI searches 34 complete current sections from five explicitly allowlisted specification/architecture files. IDs use `doc:<repository path>#<heading anchor>`; hits link to the corresponding GitHub source. The application owns the display/source map. No document parser or source store is installed in core.

## Run

From the repository root:

```sh
npm ci
npm run pilot:core -- 'atomic mutation'
npm run pilot:core -- --output /tmp/raveldex-core-pilot 'term contribution'
```

The command builds ESM/declarations, packs the current private `0.1.0-rc.0` package, installs only that tarball into a fresh consumer directory with an isolated cache and offline npm, typechecks exported imports, runs valid judged queries and real updates, checks hand arithmetic and minified parity, and records startup/import/cost observations. It prints the temporary consumer path. The original RX-1006 measurements below used the earlier `0.0.0` artifact and Node 24.21.0/macOS arm64; they are historical results, not current bundle measurements. Current merged-candidate Node 22/24 CI is recorded in [publication status](../../docs/release/PUBLICATION_STATUS.md).

Inside the printed consumer directory, replay an ordinary text query:

```sh
node run.mjs corpus.json judgments.json 'original source'
```

The CLI returns exact totals, the searched revision and ranked IDs/scores. Its navigation page adds caller-owned titles/source URLs. It then demonstrates complete replacement, restoration, removal, addition, clear, repopulation and an empty removal; failed duplicate/unsupported/invalid calls preserve state. It disposes the owner on success or failure and formats typed errors. The example has no DOM UI; UI accessibility qualification belongs to the later UI slice.

## Inputs and results

[corpus.mjs](corpus.mjs) owns the explicit file/heading allowlist and extracts unchanged section bodies, including nested Markdown/code. Missing, duplicated, ambiguous, malformed or empty sections fail generation. No recursive discovery includes archived proposals, historical decisions, planning tasks, benchmarks or acceptance logs. The corpus has source-file, record-content and combined SHA-256 hashes. URLs point to current `main`; the saved bytes/hashes identify the exact evaluated local snapshot.

[judgments.mjs](../../test/fixtures/docs/judgments.mjs) was authored from source before production rankings. It contains 19 valid queries plus a separate unsupported phrase request. Valid queries cover exact terms, explicit prefix, fields, strict metadata equality, Boolean exclusions, identifiers, tokenless/out-of-corpus cases and natural-language lexical mismatch. Three intended-empty cases are excluded from rank metrics. Labels are incomplete; intended-source rank and acceptable-source metrics are both preserved. “atomic batch” misses its intended mutation wording, the natural question is empty, and “original source” places the intended ownership section fifth. No analyzer/ranking change hides these pilot limitations.

Artifacts include `corpus.json`, `judgments.json`, the actual tarball/install, `core-bundle.mjs`, gzip bytes, `metafile.json`, and `RX-1006-pilot.json`. With `--output`, the corpus/report/metafile are also copied to that directory. Reports contain all ranked outcomes, source-oracle correctness, raw timing samples and package/bundle identities. Three sequential query samples per judgment and a cold initial add are smoke observations, not a general performance benchmark.

## Cost method

The bundle entry re-exports every public runtime export from the installed package. esbuild 0.28.2 bundles for browser-platform ESM/ES2022 with all minification, tree shaking, ASCII output, no source map or legal comments, and no externals. Node zlib uses gzip level 9, windowBits 15, memLevel 8, default strategy and mtime 0. This keeps mandatory validation, analyzer, query/ranking, mutation and scheduler code. Its inspected 27-input graph excludes optional modules and foreign engines. Fresh package/bundle imports deny host timer/clock, DOM, network, worker and storage reads.

The original RX-1006 core was 39,702 minified bytes / 12,400 gzip bytes against the 15,360-byte target. Later implementation increased the core beyond that target; the current pilot prints its own measurement. Tarball size is recorded separately and includes declarations/unimported internal build files. Neither size proves retained/peak heap cost, physical response time, Unicode cross-host parity or browser support. See [historical acceptance evidence](../../docs/evidence/RX-1006.md).
