import { copyFile, mkdir } from 'node:fs/promises';

// Explicit CSS export; it is never imported or injected by the runtime.
const directory = new URL('../dist/addons/ui/', import.meta.url);
await mkdir(directory, { recursive: true });
await copyFile(new URL('../src/addons/ui/styles.css', import.meta.url), new URL('styles.css', directory));
await copyFile(new URL('../src/addons/ui/inline.css', import.meta.url), new URL('inline.css', directory));
await copyFile(new URL('../src/addons/ui/modal.css', import.meta.url), new URL('modal.css', directory));
await copyFile(new URL('../src/addons/ui/dropdown.css', import.meta.url), new URL('dropdown.css', directory));
