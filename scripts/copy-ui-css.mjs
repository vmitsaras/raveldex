import { copyFile, mkdir } from 'node:fs/promises';

// Explicit CSS export; it is never imported or injected by the runtime.
const directory = new URL('../dist/addons/ui/', import.meta.url);
await mkdir(directory, { recursive: true });
await copyFile(new URL('../src/addons/ui/styles.css', import.meta.url), new URL('styles.css', directory));
