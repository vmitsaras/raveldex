import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = fileURLToPath(new URL('./', import.meta.url));
const output = join(root, 'dist');
const base = process.env.RAVELDEX_INLINE_BASE ?? '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('Base must be / or a slash-terminated local path such as /help/');
const entries = JSON.parse(await readFile(join(root, 'content.json'), 'utf8'));
if (!Array.isArray(entries) || entries.length > 1000) throw new Error('Expected up to 1000 guide records');
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const seen = new Set(), paths = new Set();
for (const entry of entries) {
  if (!entry || !['id', 'title', 'body', 'category', 'path'].every(key => typeof entry[key] === 'string')
    || !entry.id || seen.has(entry.id) || paths.has(entry.path) || !/^\/guides\/[a-z0-9-]+\/$/.test(entry.path)) throw new Error('Invalid or duplicate guide');
  seen.add(entry.id); paths.add(entry.path);
}
await rm(output, { recursive: true, force: true }); // Only this starter's generated output.
await mkdir(output, { recursive: true });
const bundle = await build({ absWorkingDir: root, entryPoints: ['main.mjs'], outfile: join(output, 'assets/main.js'),
  bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true,
  treeShaking: true, legalComments: 'none', metafile: true, logLevel: 'silent' });
await writeFile(join(root, 'build-meta.json'), JSON.stringify(bundle.metafile, null, 2) + '\n');
const links = entries.map(entry => `<li><a href="${escape(base + entry.path.slice(1))}">${escape(entry.title)}</a></li>`).join('\n');
const index = await readFile(join(root, 'index.html'), 'utf8');
await writeFile(join(output, 'index.html'), index.replaceAll('{{BASE}}', base).replace('{{BROWSE_LINKS}}', links));
await copyFile(join(root, 'content.json'), join(output, 'content.json'));
for (const entry of entries) {
  const file = join(output, entry.path.slice(1), 'index.html');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(entry.title)}</title><link rel="stylesheet" href="${escape(base)}assets/main.css"></head><body><main><p><a href="${escape(base)}">Search and browse all guides</a></p><p class="eyebrow">${escape(entry.category)}</p><h1>${escape(entry.title)}</h1><p>${escape(entry.body)}</p></main></body></html>`);
}
console.log(`Built ${entries.length} explicit guides at ${base}. Serve dist under that same base.`);
