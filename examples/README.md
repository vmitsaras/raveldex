# Runnable examples

| Example | Purpose / entry point |
| --- | --- |
| [core-docs/](core-docs/README.md) | Real-document CLI over the packed core: `npm run pilot:core -- 'atomic mutation'`. |
| [docs-search/](docs-search/README.md) | Local browser pilot with selected phrases, ranges/snippets, facets, Inspector and direct/worker execution: `npm run pilot:ui`, then open the printed URL. |
| [astro/](astro/README.md) | Actual static Astro pages, explicit content allowlist, root/subdirectory builds and on-demand search loading using separately installed core/integration tarballs. |
| [migration/](migration/README.md) | Explicit companion source conversion and rebuild through public native APIs. |
| [API modules](../docs/api/examples/README.md) | Small installed-package recipes for core, add-ons, snapshots, browser UI/storage and workers. |

These are repository examples and local pilots. The repository provides no public documentation/demo URL or site deployment workflow. The Astro directory is an installed-consumer fixture, not a standalone one-command starter. See [publication preparation](../docs/release/PUBLICATION_STATUS.md) for remaining public presentation work. Feature-specific N5 examples live in the [API reference](../docs/api/README.md); the ordinary browser pilot does not automatically enable those capabilities.

Examples use public package imports. Synthetic arithmetic fixtures stay separate from judged source relevance. Archived proposals and verification logs are excluded from the current-section allowlist.
