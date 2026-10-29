import assert from 'node:assert/strict';
import { mkdir, lstat, realpath, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Development/test resolution only. Actual consumers install both private
// tarballs, and qualification rejects workspace links for either package.
const root = await realpath(new URL('../', import.meta.url));
const parent = new URL('../integrations/astro/node_modules/@vmitsaras/', import.meta.url);
const peer = new URL('raveldex', parent);
await mkdir(parent, { recursive: true });
try { const entry = await lstat(peer); assert.ok(entry.isSymbolicLink()); assert.equal(await realpath(peer), root); }
catch (error) { if (error.code !== 'ENOENT') throw error; await symlink(root, fileURLToPath(peer), 'dir'); }
