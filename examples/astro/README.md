# Packed Astro static documentation consumer

This fixture uses three explicitly selected verbatim Raveldex documentation paragraphs, rendered as real Astro pages. `content-provenance.json` binds each original paragraph. The rendered draft page is deliberately absent from the search allowlist. Titles/record IDs/routes are application choices; no crawler or Markdown/HTML parser discovers content.

Prepare the private core and Astro integration tarballs from a stable built tree. Install both tarballs and pinned Astro 7.3.2 in an isolated copy of this directory. The integration is configured in `astro.config.mjs`; `configuration.mjs` explicitly selects complete source retention and the optional Inspector. Run the Astro build, then serve its `dist/` with directory-index routing. `RAVELDEX_ASTRO_BASE=/docs/` rebuilds all source/display asset and navigation URLs for a subdirectory deployment.

“Load search data” requests the manifest and source snapshot only. “Open search” separately requests display records and mounts the existing native UI. “Close search” restores the authored fallback and documentation links; “Unload search data” disposes the owned runtime. “Inject next search error” is an explicit development fixture action for error/retry verification.

The build also emits a native snapshot under an exact local Node qualification used by the test. Browser-native loading is deliberately refused. Source rebuilds use the browser's receiving environment; matching analyzer IDs do not promise equal Unicode behavior across all hosts. This example records automated semantic/keyboard observations, not human screen-reader speech, physical input, or allocation/copy peaks.
