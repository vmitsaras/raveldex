import { fileURLToPath } from 'node:url';
import { realpath } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { loadManifest, verifyFiles, verifyInputs, auditSurface, auditLinks } from './lib/pages.mjs';
const root = await realpath(fileURLToPath(new URL('../docs/', import.meta.url)));
const manifest = await loadManifest(root);
assert.ok(manifest, 'Run npm run pages:build first');
await verifyFiles(root, manifest);
await verifyInputs(await realpath(fileURLToPath(new URL('../', import.meta.url))), manifest);
const exposed = await auditSurface(root, manifest);
const links = await auditLinks(root, manifest);
const bytes = manifest.files.filter(x => exposed.includes(x.path)).reduce((sum, x) => sum + x.bytes, 0);
assert.ok(bytes < 1_000_000_000, 'published output exceeds GitHub Pages limit');
console.log(JSON.stringify({ status: 'Pass', ...links, exposedFiles: exposed.length, bytes,
  boundary: 'Local inventory/links only; actual Jekyll and live Pages require separate verification.' }));
