import { rmSync } from 'node:fs';

// dist is ignored compiler output. Remove obsolete modules before rebuilding.
rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true });

// Separate optional integration output; never included in the core tarball.
rmSync(new URL('../integrations/astro/dist/', import.meta.url), { recursive: true, force: true });
