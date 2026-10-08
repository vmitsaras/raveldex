import { copyFile, mkdir } from 'node:fs/promises';

const source = new URL('../src/integrations/localsearch/LICENSE.LocalSearch', import.meta.url);
const directory = new URL('../dist/integrations/localsearch/', import.meta.url);
await mkdir(directory, { recursive: true });
await copyFile(source, new URL('LICENSE.LocalSearch', directory));
