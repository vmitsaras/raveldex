# Static-build and Astro integration

The separately installed private `@vmitsaras/raveldex-astro` package provides an explicit allowlist builder, an Astro static-directory build hook and an on-demand artifact loader. It has an exact core peer and optional Astro7.3.2 peer. No framework, crawler, parser or network code enters the root core import graph.

The separately installed integration README supplies executable builder, Astro configuration and loader examples. Root `replace`, codecs, analysis, ranking and UI contracts remain unchanged.

Public subpaths are `.` (default raveldexAstro), `/build` (buildStaticSearch) and `/client` (loadStaticSearch). The builder takes explicit record/title/path entries, a required application buildId, matching configuration and safe deployment base; it emits existing source snapshots, content-addressed display data and a versioned manifest. Optional native artifacts require the existing exact-Node qualification. The client explicitly loads a trusted manifest/selected snapshot, refuses stale/incompatible/missing/mixed artifacts, and loads display documents only on request. It creates/disposes an owned candidate; no application engine is replaced implicitly. The app may mount the existing UI after loading documents.

All source fields require explicit source providers. Directory-style ASCII paths/base, finite record/input/response limits, SHA-256 identities, signal/timeout/disposal behavior, complete generation replacement and the exact native portability boundary are defined in the guide. SHA-256 is corruption detection rather than sender authentication. `astro dev`/SSR/watchers, route crawling, schema migration and browser-native snapshot portability are excluded. Publication remains separate.
